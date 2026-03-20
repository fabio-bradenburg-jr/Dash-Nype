import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getAccessContext, USER_ROLES } from '@/lib/server/access-control'

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

export async function PATCH(request, context) {
  try {
    const authorized = await getAuthorizedContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, accessContext, user } = authorized
    const params = await context.params
    const { userId } = params
    const body = await request.json()

    if (user.id === userId && body.role && body.role !== USER_ROLES.MASTER) {
      return NextResponse.json({ error: 'A conta master não pode remover o próprio nível master.' }, { status: 400 })
    }

    const role = Object.values(USER_ROLES).includes(body.role) ? body.role : USER_ROLES.VIEWER
    const clientIds = Array.isArray(body.clientIds) ? body.clientIds.filter(Boolean) : []
    const clientGroupIds = Array.isArray(body.clientGroupIds) ? body.clientGroupIds.filter(Boolean) : []

    const { error: profileError } = await adminSupabase
      .from('profiles')
      .update({
        full_name: String(body.fullName || '').trim(),
        role,
        workspace_id: accessContext.workspaceId,
      })
      .eq('id', userId)

    if (profileError) throw profileError

    const { error: deleteAccessError } = await adminSupabase
      .from('user_client_access')
      .delete()
      .eq('user_id', userId)

    if (deleteAccessError) throw deleteAccessError

    const { error: deleteGroupAccessError } = await adminSupabase
      .from('user_client_group_access')
      .delete()
      .eq('user_id', userId)

    if (deleteGroupAccessError && !isMissingRelationError(deleteGroupAccessError)) throw deleteGroupAccessError
    if (deleteGroupAccessError && isMissingRelationError(deleteGroupAccessError) && clientGroupIds.length > 0) {
      throw new Error('As tabelas de grupos de clientes ainda nao foram criadas no Supabase. Rode a migration antes de liberar acesso por grupo.')
    }

    if (clientIds.length > 0 && role !== USER_ROLES.MASTER) {
      const { error: insertAccessError } = await adminSupabase
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

      if (insertAccessError) throw insertAccessError
    }

    if (clientGroupIds.length > 0 && role !== USER_ROLES.MASTER) {
      await validateClientGroups(adminSupabase, accessContext.workspaceId, clientGroupIds)

      const { error: insertGroupAccessError } = await adminSupabase
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

      if (insertGroupAccessError) {
        if (isMissingRelationError(insertGroupAccessError)) {
          throw new Error('As tabelas de grupos de clientes ainda nao foram criadas no Supabase. Rode a migration antes de liberar acesso por grupo.')
        }
        throw insertGroupAccessError
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Users PATCH error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível atualizar o usuário.' }, { status: 500 })
  }
}

export async function DELETE(_request, { params }) {
  try {
    const authorized = await getAuthorizedContext()
    if (authorized.errorResponse) return authorized.errorResponse

    const { adminSupabase, user } = authorized
    const resolvedParams = await params
    const { userId } = resolvedParams

    if (user.id === userId) {
      return NextResponse.json({ error: 'A conta master não pode excluir a si mesma.' }, { status: 400 })
    }

    const { error } = await adminSupabase.auth.admin.deleteUser(userId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Users DELETE error:', error)
    return NextResponse.json({ error: error.message || 'Não foi possível excluir o usuário.' }, { status: 500 })
  }
}
