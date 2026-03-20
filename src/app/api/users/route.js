import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext, USER_ROLES } from '@/lib/server/access-control'

function isMissingRelationError(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === 'PGRST205' || message.includes('schema cache') || message.includes('could not find the table')
}

async function getAuthorizedContext() {
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
  const accessContext = await getAccessContext(adminSupabase, user)

  if (!accessContext.canManageUsers || !accessContext.workspaceId) {
    return { errorResponse: NextResponse.json({ error: 'Sem permissão para gerenciar usuários.' }, { status: 403 }) }
  }

  return { adminSupabase, accessContext, user }
}

export async function GET() {
  try {
    const authorized = await getAuthorizedContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, accessContext } = authorized

    const [
      { data: profiles, error: profilesError },
      { data: accessRows, error: accessError },
      { data: groupAccessRows, error: groupAccessError },
    ] = await Promise.all([
      adminSupabase
        .from('profiles')
        .select('id, email, full_name, avatar_url, role, workspace_id, created_at')
        .eq('workspace_id', accessContext.workspaceId)
        .order('created_at', { ascending: true }),
      adminSupabase
        .from('user_client_access')
        .select('user_id, client_id, can_view, can_edit')
        .eq('workspace_id', accessContext.workspaceId),
      adminSupabase
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
    const role = Object.values(USER_ROLES).includes(body.role) ? body.role : USER_ROLES.VIEWER
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
