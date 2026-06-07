import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { AI_ACCESS_LEVELS, isPrimaryAdminEmail, USER_ROLES } from '@/lib/server/access-control'
import { PLATFORM_AUTH_COOKIE } from '@/lib/saas/auth'
import { verifyLocalAccessToken } from '@/lib/server/platform-auth-fallback'

function isMissingRelationError(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === 'PGRST205' || message.includes('schema cache') || message.includes('could not find the table')
}

async function getAdminContext() {
  const adminSupabase = createAdminClient()
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) throw error

  let userId = user?.id || ''
  let email = String(user?.email || '').trim().toLowerCase()

  if (!userId) {
    const token = (await cookies()).get(PLATFORM_AUTH_COOKIE)?.value
    if (!token) return { errorResponse: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }

    const payload = await verifyLocalAccessToken(token)
    userId = String(payload.sub || '').replace(/^supabase:/, '')
    email = String(payload.email || '').trim().toLowerCase()
  }

  if (!userId) return { errorResponse: NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 }) }

  const { data: profile, error: profileError } = await adminSupabase
    .from('profiles')
    .select('id, email, role, workspace_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) throw profileError

  const resolvedEmail = String(profile?.email || email || '').trim().toLowerCase()
  if (!isPrimaryAdminEmail(resolvedEmail)) {
    return { errorResponse: NextResponse.json({ error: 'Acesso restrito à conta demo administrativa.' }, { status: 403 }) }
  }

  return {
    adminSupabase,
    profile: profile || { id: userId, email: resolvedEmail, workspace_id: null },
  }
}

async function countByWorkspace(adminSupabase, tableName) {
  const { data, error } = await adminSupabase
    .from(tableName)
    .select('workspace_id')
    .limit(10000)

  if (error) {
    if (isMissingRelationError(error)) return {}
    throw error
  }

  return (data || []).reduce((acc, row) => {
    if (!row.workspace_id) return acc
    acc[row.workspace_id] = (acc[row.workspace_id] || 0) + 1
    return acc
  }, {})
}

async function deleteRowsByWorkspace(adminSupabase, tableName, workspaceId) {
  const { error } = await adminSupabase
    .from(tableName)
    .delete()
    .eq('workspace_id', workspaceId)

  if (error && !isMissingRelationError(error)) throw error
}

function serializeWorkspace(workspace, profilesByWorkspace, counts) {
  const users = profilesByWorkspace.get(workspace.id) || []
  const owner = users.find((profile) => profile.id === workspace.owner_user_id) || null

  return {
    ...workspace,
    owner,
    users,
    counts: {
      users: users.length,
      clients: counts.clients[workspace.id] || 0,
      metaConnections: counts.metaConnections[workspace.id] || 0,
      googleAdsConnections: counts.googleAdsConnections[workspace.id] || 0,
      weeklySnapshots: counts.weeklySnapshots[workspace.id] || 0,
    },
  }
}

export async function GET() {
  try {
    const authorized = await getAdminContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, profile } = authorized
    const [
      { data: workspaces, error: workspacesError },
      { data: profiles, error: profilesError },
      clients,
      metaConnections,
      googleAdsConnections,
      weeklySnapshots,
    ] = await Promise.all([
      adminSupabase
        .from('workspaces')
        .select('id, name, owner_user_id, created_at')
        .order('created_at', { ascending: true }),
      adminSupabase
        .from('profiles')
        .select('id, email, full_name, avatar_url, role, ai_access_level, can_edit_integrations, workspace_id')
        .order('email', { ascending: true }),
      countByWorkspace(adminSupabase, 'workspace_clients'),
      countByWorkspace(adminSupabase, 'workspace_meta_connections'),
      countByWorkspace(adminSupabase, 'workspace_google_ads_connections'),
      countByWorkspace(adminSupabase, 'client_weekly_snapshots'),
    ])

    if (workspacesError) throw workspacesError
    if (profilesError) throw profilesError

    const profilesByWorkspace = new Map()
    ;(profiles || []).forEach((item) => {
      if (!item.workspace_id) return
      const current = profilesByWorkspace.get(item.workspace_id) || []
      current.push(item)
      profilesByWorkspace.set(item.workspace_id, current)
    })

    return NextResponse.json({
      currentWorkspaceId: profile.workspace_id || null,
      workspaces: (workspaces || []).map((workspace) =>
        serializeWorkspace(workspace, profilesByWorkspace, {
          clients,
          metaConnections,
          googleAdsConnections,
          weeklySnapshots,
        })
      ),
    })
  } catch (error) {
    console.error('Admin workspaces GET error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível listar os workspaces.' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const authorized = await getAdminContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase } = authorized
    const body = await request.json()
    const workspaceId = String(body.workspaceId || '').trim()
    const name = String(body.name || '').trim()
    const ownerUserId = String(body.ownerUserId || '').trim()

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace não informado.' }, { status: 400 })
    }

    const updates = {}
    if (name) updates.name = name
    if (ownerUserId) updates.owner_user_id = ownerUserId

    if (ownerUserId) {
      const { data: ownerProfile, error: ownerProfileError } = await adminSupabase
        .from('profiles')
        .select('id, workspace_id')
        .eq('id', ownerUserId)
        .maybeSingle()

      if (ownerProfileError) throw ownerProfileError
      if (!ownerProfile) return NextResponse.json({ error: 'Usuário dono não encontrado.' }, { status: 404 })
      if (ownerProfile.workspace_id !== workspaceId) {
        return NextResponse.json({ error: 'O dono selecionado precisa pertencer ao workspace.' }, { status: 400 })
      }
    }

    if (Object.keys(updates).length) {
      const { error: workspaceError } = await adminSupabase
        .from('workspaces')
        .update(updates)
        .eq('id', workspaceId)

      if (workspaceError) throw workspaceError
    }

    if (ownerUserId) {
      const { error: profileError } = await adminSupabase
        .from('profiles')
        .update({
          role: USER_ROLES.MASTER,
          ai_access_level: AI_ACCESS_LEVELS.MASTER,
          can_edit_integrations: true,
        })
        .eq('id', ownerUserId)

      if (profileError) throw profileError
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Admin workspaces PATCH error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível atualizar o workspace.' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const authorized = await getAdminContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, profile } = authorized
    const { searchParams } = new URL(request.url)
    const workspaceId = String(searchParams.get('workspaceId') || '').trim()
    const userId = String(searchParams.get('userId') || '').trim()

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace não informado.' }, { status: 400 })
    }

    if (userId) {
      const { data: workspace, error: workspaceError } = await adminSupabase
        .from('workspaces')
        .select('owner_user_id')
        .eq('id', workspaceId)
        .maybeSingle()

      if (workspaceError) throw workspaceError
      if (workspace?.owner_user_id === userId) {
        return NextResponse.json({ error: 'Troque o dono do workspace antes de remover este acesso.' }, { status: 400 })
      }

      await Promise.all([
        adminSupabase.from('user_client_access').delete().eq('workspace_id', workspaceId).eq('user_id', userId),
        adminSupabase.from('user_client_group_access').delete().eq('workspace_id', workspaceId).eq('user_id', userId),
      ])

      const { error: profileError } = await adminSupabase
        .from('profiles')
        .update({
          workspace_id: null,
          role: USER_ROLES.VIEWER,
          ai_access_level: AI_ACCESS_LEVELS.NONE,
          can_edit_integrations: false,
        })
        .eq('id', userId)

      if (profileError) throw profileError
      return NextResponse.json({ ok: true })
    }

    if (workspaceId === profile.workspace_id) {
      return NextResponse.json({ error: 'Não é possível excluir o workspace usado pela conta demo/admin.' }, { status: 400 })
    }

    const { data: conversations, error: conversationsError } = await adminSupabase
      .from('assistant_conversations')
      .select('id')
      .eq('workspace_id', workspaceId)

    if (conversationsError && !isMissingRelationError(conversationsError)) throw conversationsError
    const conversationIds = isMissingRelationError(conversationsError) ? [] : (conversations || []).map((item) => item.id)

    if (conversationIds.length) {
      const { error: messagesError } = await adminSupabase
        .from('assistant_messages')
        .delete()
        .in('conversation_id', conversationIds)

      if (messagesError && !isMissingRelationError(messagesError)) throw messagesError
    }

    await Promise.all([
      deleteRowsByWorkspace(adminSupabase, 'user_client_access', workspaceId),
      deleteRowsByWorkspace(adminSupabase, 'user_client_group_access', workspaceId),
      deleteRowsByWorkspace(adminSupabase, 'workspace_client_group_members', workspaceId),
      deleteRowsByWorkspace(adminSupabase, 'workspace_client_groups', workspaceId),
      deleteRowsByWorkspace(adminSupabase, 'workspace_products', workspaceId),
      deleteRowsByWorkspace(adminSupabase, 'workspace_clients', workspaceId),
      deleteRowsByWorkspace(adminSupabase, 'workspace_preferences', workspaceId),
      deleteRowsByWorkspace(adminSupabase, 'workspace_meta_connections', workspaceId),
      deleteRowsByWorkspace(adminSupabase, 'workspace_google_ads_connections', workspaceId),
      deleteRowsByWorkspace(adminSupabase, 'workspace_google_calendar_connections', workspaceId),
      deleteRowsByWorkspace(adminSupabase, 'client_weekly_snapshots', workspaceId),
      deleteRowsByWorkspace(adminSupabase, 'assistant_conversations', workspaceId),
    ])

    const { error: profilesError } = await adminSupabase
      .from('profiles')
      .update({
        workspace_id: null,
        role: USER_ROLES.VIEWER,
        ai_access_level: AI_ACCESS_LEVELS.NONE,
        can_edit_integrations: false,
      })
      .eq('workspace_id', workspaceId)

    if (profilesError) throw profilesError

    const { error: workspaceError } = await adminSupabase
      .from('workspaces')
      .delete()
      .eq('id', workspaceId)

    if (workspaceError) throw workspaceError

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Admin workspaces DELETE error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível remover o acesso ou workspace.' }, { status: 500 })
  }
}
