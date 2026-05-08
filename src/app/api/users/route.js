import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { AI_ACCESS_LEVELS, getAccessContext, isPrimaryAdminEmail, USER_ROLES } from '@/lib/server/access-control'

function isMissingRelationError(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === 'PGRST205' || message.includes('schema cache') || message.includes('could not find the table')
}

async function validateClientGroups(adminSupabase, workspaceId, clientGroupIds) {
  if (!clientGroupIds.length) return

  const [
    { data: groups, error: groupsError },
    { data: members, error: membersError },
  ] = await Promise.all([
    adminSupabase
      .from('workspace_client_groups')
      .select('id')
      .eq('workspace_id', workspaceId)
      .in('id', clientGroupIds),
    adminSupabase
      .from('workspace_client_group_members')
      .select('group_id, client_id')
      .eq('workspace_id', workspaceId)
      .in('group_id', clientGroupIds),
  ])

  if (groupsError && isMissingRelationError(groupsError)) {
    throw new Error('As tabelas de grupos de clientes ainda nao foram criadas no Supabase. Rode a migration antes de liberar acesso por grupo.')
  }

  if (membersError && isMissingRelationError(membersError)) {
    throw new Error('As tabelas de grupos de clientes ainda nao foram criadas no Supabase. Rode a migration antes de liberar acesso por grupo.')
  }

  if (groupsError) throw groupsError
  if (membersError) throw membersError

  const existingGroupIds = new Set((groups || []).map((group) => group.id))
  const membersByGroupId = new Map()

  ;(members || []).forEach((member) => {
    const current = membersByGroupId.get(member.group_id) || 0
    membersByGroupId.set(member.group_id, current + 1)
  })

  const missingGroupId = clientGroupIds.find((groupId) => !existingGroupIds.has(groupId))
  if (missingGroupId) {
    throw new Error('O grupo selecionado ainda nao foi salvo no Supabase. Abra a aba de clientes, ajuste o grupo e aguarde o salvamento antes de liberar acesso.')
  }

  const emptyGroupId = clientGroupIds.find((groupId) => !membersByGroupId.get(groupId))
  if (emptyGroupId) {
    throw new Error('O grupo selecionado ainda nao possui dashboards salvos no Supabase. Abra a aba de clientes e salve novamente os dashboards dentro do grupo antes de liberar acesso.')
  }
}


function getAuthUserFullName(authUser) {
  return String(
    authUser?.user_metadata?.full_name ||
    authUser?.user_metadata?.name ||
    authUser?.user_metadata?.company_name ||
    authUser?.email ||
    ''
  ).trim()
}

async function syncRegisteredAuthProfiles(adminSupabase, workspaceId) {
  if (!workspaceId) return

  const { data: authUsersPayload, error: authUsersError } = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (authUsersError) throw authUsersError

  const authUsers = (authUsersPayload?.users || []).filter((authUser) => authUser?.id && authUser?.email)
  if (!authUsers.length) return

  const authUserIds = authUsers.map((authUser) => authUser.id)
  const { data: existingProfiles, error: existingProfilesError } = await adminSupabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, role, ai_access_level, workspace_id')
    .in('id', authUserIds)

  if (existingProfilesError) throw existingProfilesError

  const profilesById = new Map((existingProfiles || []).map((profile) => [profile.id, profile]))
  const profilesToUpsert = authUsers
    .map((authUser) => {
      const existingProfile = profilesById.get(authUser.id) || null
      const email = String(authUser.email || existingProfile?.email || '').trim().toLowerCase()
      if (!email) return null

      const isPrimaryAdmin = isPrimaryAdminEmail(email)
      const role = isPrimaryAdmin
        ? USER_ROLES.MASTER
        : existingProfile?.role === USER_ROLES.MASTER
          ? USER_ROLES.VIEWER
          : existingProfile?.role || USER_ROLES.VIEWER
      const aiAccessLevel = isPrimaryAdmin
        ? AI_ACCESS_LEVELS.MASTER
        : existingProfile?.ai_access_level || AI_ACCESS_LEVELS.NONE
      const shouldSync =
        !existingProfile ||
        existingProfile.workspace_id !== workspaceId ||
        existingProfile.email !== email ||
        existingProfile.role !== role ||
        !existingProfile.ai_access_level

      if (!shouldSync) return null

      return {
        id: authUser.id,
        email,
        full_name: existingProfile?.full_name || getAuthUserFullName(authUser),
        avatar_url: existingProfile?.avatar_url || authUser?.user_metadata?.avatar_url || '',
        role,
        ai_access_level: aiAccessLevel,
        workspace_id: workspaceId,
      }
    })
    .filter(Boolean)

  if (!profilesToUpsert.length) return

  const { error: upsertError } = await adminSupabase
    .from('profiles')
    .upsert(profilesToUpsert, { onConflict: 'id' })

  if (upsertError) throw upsertError
}

async function getAuthorizedContext(options = {}) {
  const requireManageUsers = options.requireManageUsers !== false
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) throw error
  if (!user) {
    return { errorResponse: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }
  }

  const adminSupabase = createAdminClient()
  const accessContext = await getAccessContext(supabase, user, { adminSupabase })

  const hasPermission = requireManageUsers ? accessContext.canManageUsers : (accessContext.canManageUsers || accessContext.canManageClients)

  if (!hasPermission || !accessContext.workspaceId) {
    return {
      errorResponse: NextResponse.json(
        { error: requireManageUsers ? 'Sem permissão para gerenciar usuários.' : 'Sem permissão para listar usuários.' },
        { status: 403 }
      ),
    }
  }

  return { supabase, adminSupabase, accessContext, user }
}

export async function GET() {
  try {
    const authorized = await getAuthorizedContext({ requireManageUsers: false })
    if (authorized.errorResponse) return authorized.errorResponse

    const { supabase, adminSupabase, accessContext } = authorized

    if (accessContext.canManageUsers) {
      await syncRegisteredAuthProfiles(adminSupabase, accessContext.workspaceId)
    }

    const profilesClient = accessContext.canManageUsers ? adminSupabase : supabase
    const accessRowsClient = accessContext.canManageUsers ? adminSupabase : supabase

    const [
      { data: profiles, error: profilesError },
      { data: accessRows, error: accessError },
      { data: groupAccessRows, error: groupAccessError },
    ] = await Promise.all([
      profilesClient
        .from('profiles')
        .select('id, email, full_name, avatar_url, role, ai_access_level, workspace_id, created_at')
        .eq('workspace_id', accessContext.workspaceId)
        .order('created_at', { ascending: true }),
      accessRowsClient
        .from('user_client_access')
        .select('user_id, client_id, can_view, can_edit')
        .eq('workspace_id', accessContext.workspaceId),
      accessRowsClient
        .from('user_client_group_access')
        .select('user_id, group_id, can_view, can_edit')
        .eq('workspace_id', accessContext.workspaceId),
    ])

    if (profilesError) throw profilesError
    if (accessError) throw accessError
    if (groupAccessError && !isMissingRelationError(groupAccessError)) throw groupAccessError

    const accessByUser = new Map()
    ;(accessRows || []).forEach((row) => {
      const current = accessByUser.get(row.user_id) || []
      current.push(row)
      accessByUser.set(row.user_id, current)
    })
    const groupAccessByUser = new Map()
    ;((isMissingRelationError(groupAccessError) ? [] : groupAccessRows) || []).forEach((row) => {
      const current = groupAccessByUser.get(row.user_id) || []
      current.push(row)
      groupAccessByUser.set(row.user_id, current)
    })

    return NextResponse.json(
      (profiles || []).map((profile) => ({
        ...profile,
        clientAccess: accessByUser.get(profile.id) || [],
        clientGroupAccess: groupAccessByUser.get(profile.id) || [],
      }))
    )
  } catch (error) {
    console.error('Users GET error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível listar os usuários.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const authorized = await getAuthorizedContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, accessContext } = authorized
    const body = await request.json()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '').trim()
    const fullName = String(body.fullName || '').trim()
    let role = Object.values(USER_ROLES).includes(body.role) ? body.role : USER_ROLES.VIEWER

    if (role === USER_ROLES.MASTER && !isPrimaryAdminEmail(email)) {
      return NextResponse.json({ error: 'Apenas a conta administradora principal pode ter perfil master.' }, { status: 403 })
    }

    if (isPrimaryAdminEmail(email)) {
      role = USER_ROLES.MASTER
    }

    const aiAccessLevel = Object.values(AI_ACCESS_LEVELS).includes(body.aiAccessLevel)
      ? body.aiAccessLevel
      : role === USER_ROLES.MASTER
        ? AI_ACCESS_LEVELS.MASTER
        : AI_ACCESS_LEVELS.TEAM
    const clientIds = Array.isArray(body.clientIds) ? body.clientIds.filter(Boolean) : []
    const clientGroupIds = Array.isArray(body.clientGroupIds) ? body.clientGroupIds.filter(Boolean) : []

    if (!email || !password) {
      return NextResponse.json({ error: 'Informe email e senha para criar o usuário.' }, { status: 400 })
    }

    const { data: createdUser, error: createUserError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    })

    if (createUserError) throw createUserError

    const userId = createdUser.user.id

    const { error: profileError } = await adminSupabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          email,
          full_name: fullName,
          role,
          ai_access_level: aiAccessLevel,
          workspace_id: accessContext.workspaceId,
        },
        { onConflict: 'id' }
      )

    if (profileError) throw profileError

    if (clientIds.length > 0 && role !== USER_ROLES.MASTER) {
      const { error: accessInsertError } = await adminSupabase
        .from('user_client_access')
        .insert(
          clientIds.map((clientId) => ({
            workspace_id: accessContext.workspaceId,
            user_id: userId,
            client_id: clientId,
            can_view: true,
            can_edit: role === USER_ROLES.OPERATOR,
          }))
        )

      if (accessInsertError) throw accessInsertError
    }

    if (clientGroupIds.length > 0 && role !== USER_ROLES.MASTER) {
      await validateClientGroups(adminSupabase, accessContext.workspaceId, clientGroupIds)

      const { error: groupAccessInsertError } = await adminSupabase
        .from('user_client_group_access')
        .insert(
          clientGroupIds.map((groupId) => ({
            workspace_id: accessContext.workspaceId,
            user_id: userId,
            group_id: groupId,
            can_view: true,
            can_edit: role === USER_ROLES.OPERATOR,
          }))
        )

      if (groupAccessInsertError) {
        if (isMissingRelationError(groupAccessInsertError)) {
          throw new Error('As tabelas de grupos de clientes ainda nao foram criadas no Supabase. Rode a migration antes de liberar acesso por grupo.')
        }
        throw groupAccessInsertError
      }
    }

    return NextResponse.json({ ok: true, userId })
  } catch (error) {
    console.error('Users POST error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível criar o usuário.' }, { status: 500 })
  }
}
