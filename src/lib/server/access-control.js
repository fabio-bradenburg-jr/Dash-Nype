export const USER_ROLES = {
  MASTER: 'master',
  OPERATOR: 'operador',
  VIEWER: 'visualizador',
  CLIENT: 'cliente',
}

function isMissingRelationError(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === 'PGRST205' || message.includes('schema cache') || message.includes('could not find the table')
}

function buildProfilePayload(user, role, workspaceId) {
  return {
    id: user.id,
    email: user.email || '',
    full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
    avatar_url: user.user_metadata?.avatar_url || '',
    role,
    workspace_id: workspaceId,
  }
}

export async function ensureUserProfile(adminSupabase, user) {
  const { data: existingProfile, error: profileError } = await adminSupabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) throw profileError
  if (existingProfile) return existingProfile

  const [
    { count: workspaceCount, error: workspaceCountError },
    { count: masterCount, error: masterCountError },
    { data: firstWorkspace, error: firstWorkspaceError },
  ] = await Promise.all([
    adminSupabase
      .from('workspaces')
      .select('*', { count: 'exact', head: true }),
    adminSupabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', USER_ROLES.MASTER),
    adminSupabase
      .from('workspaces')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  if (workspaceCountError) throw workspaceCountError
  if (masterCountError) throw masterCountError
  if (firstWorkspaceError) throw firstWorkspaceError

  let workspaceId = null
  let role = USER_ROLES.VIEWER

  if (!workspaceCount) {
    const { data: createdWorkspace, error: workspaceError } = await adminSupabase
      .from('workspaces')
      .insert({
        name: 'Workspace principal',
        owner_user_id: user.id,
      })
      .select('*')
      .single()

    if (workspaceError) throw workspaceError

    workspaceId = createdWorkspace.id
    role = USER_ROLES.MASTER
  } else if (!masterCount) {
    workspaceId = firstWorkspace?.id || null
    role = USER_ROLES.MASTER

    if (workspaceId && !firstWorkspace?.owner_user_id) {
      const { error: workspaceOwnerError } = await adminSupabase
        .from('workspaces')
        .update({ owner_user_id: user.id })
        .eq('id', workspaceId)

      if (workspaceOwnerError) throw workspaceOwnerError
    }
  } else if (firstWorkspace?.id) {
    workspaceId = firstWorkspace.id
  }

  const payload = buildProfilePayload(user, role, workspaceId)
  const { data: createdProfile, error: createProfileError } = await adminSupabase
    .from('profiles')
    .insert(payload)
    .select('*')
    .single()

  if (createProfileError) throw createProfileError

  return createdProfile
}

export async function getAccessContext(adminSupabase, user) {
  const profile = await ensureUserProfile(adminSupabase, user)
  const role = profile.role || USER_ROLES.VIEWER
  const workspaceId = profile.workspace_id || null

  let accessRows = []
  let groupAccessRows = []
  let groupMemberRows = []

  if (workspaceId && role !== USER_ROLES.MASTER) {
    const [
      { data: directAccessData, error: directAccessError },
      { data: groupAccessData, error: groupAccessError },
      { data: groupMemberData, error: groupMemberError },
    ] = await Promise.all([
      adminSupabase
        .from('user_client_access')
        .select('client_id, can_view, can_edit')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id),
      adminSupabase
        .from('user_client_group_access')
        .select('group_id, can_view, can_edit')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id),
      adminSupabase
        .from('workspace_client_group_members')
        .select('group_id, client_id')
        .eq('workspace_id', workspaceId),
    ])

    if (directAccessError) throw directAccessError
    if (groupAccessError && !isMissingRelationError(groupAccessError)) throw groupAccessError
    if (groupMemberError && !isMissingRelationError(groupMemberError)) throw groupMemberError

    accessRows = directAccessData || []
    groupAccessRows = isMissingRelationError(groupAccessError) ? [] : groupAccessData || []
    groupMemberRows = isMissingRelationError(groupMemberError) ? [] : groupMemberData || []
  }

  const viewableClientIds = new Set(accessRows.filter((row) => row.can_view).map((row) => row.client_id))
  const editableClientIds = new Set(accessRows.filter((row) => row.can_edit).map((row) => row.client_id))
  const membersByGroupId = new Map()

  groupMemberRows.forEach((row) => {
    const current = membersByGroupId.get(row.group_id) || []
    current.push(row.client_id)
    membersByGroupId.set(row.group_id, current)
  })

  groupAccessRows.forEach((row) => {
    const memberClientIds = membersByGroupId.get(row.group_id) || []

    if (row.can_view) {
      memberClientIds.forEach((clientId) => viewableClientIds.add(clientId))
    }

    if (row.can_edit) {
      memberClientIds.forEach((clientId) => editableClientIds.add(clientId))
    }
  })

  return {
    profile,
    role,
    workspaceId,
    canManageUsers: role === USER_ROLES.MASTER,
    canManageClients: role === USER_ROLES.MASTER || role === USER_ROLES.OPERATOR,
    canEditIntegrations: role === USER_ROLES.MASTER || role === USER_ROLES.OPERATOR,
    canViewDashboard: Boolean(workspaceId),
    isClientRole: role === USER_ROLES.CLIENT,
    viewableClientIds: Array.from(viewableClientIds),
    editableClientIds: Array.from(editableClientIds),
  }
}
