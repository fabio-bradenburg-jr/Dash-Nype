export const USER_ROLES = {
  MASTER: 'master',
  OPERATOR: 'operador',
  VIEWER: 'visualizador',
  CLIENT: 'cliente',
}

export const AI_ACCESS_LEVELS = {
  MASTER: 'master',
  TEAM: 'team',
  NONE: 'none',
}

export const PRIMARY_ADMIN_EMAIL = 'fbrandenburgjunior@gmail.com'
export const PREVIOUS_PRIMARY_ADMIN_EMAILS = ['fabiobrandenburgjr@gmail.com']
export const ASSESSORIA_LP_MEMBER_EMAILS = ['fabiobrandenburgjr@gmail.com']

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function isPrimaryAdminEmail(email) {
  return normalizeEmail(email) === PRIMARY_ADMIN_EMAIL
}

export function isPreviousPrimaryAdminEmail(email) {
  return PREVIOUS_PRIMARY_ADMIN_EMAILS.includes(normalizeEmail(email))
}

export function isAssessoriaLpMemberEmail(email) {
  return ASSESSORIA_LP_MEMBER_EMAILS.includes(normalizeEmail(email))
}

function isMissingRelationError(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === 'PGRST205' || message.includes('schema cache') || message.includes('could not find the table')
}

export async function resolveAssessoriaLpWorkspaceId(adminSupabase) {
  const { data: connectedWorkspace, error: connectionError } = await adminSupabase
    .from('workspace_meta_connections')
    .select('workspace_id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (connectionError && !isMissingRelationError(connectionError)) throw connectionError
  if (connectedWorkspace?.workspace_id) return connectedWorkspace.workspace_id

  const { data: namedWorkspace, error: namedWorkspaceError } = await adminSupabase
    .from('workspaces')
    .select('id')
    .eq('name', 'Assessoria LP')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (namedWorkspaceError) throw namedWorkspaceError
  return namedWorkspace?.id || null
}

function resolveAiAccessLevel(profileLike, fallbackRole) {
  const explicitValue = String(profileLike?.ai_access_level || '').trim().toLowerCase()
  if (explicitValue === AI_ACCESS_LEVELS.MASTER || explicitValue === AI_ACCESS_LEVELS.TEAM || explicitValue === AI_ACCESS_LEVELS.NONE) {
    return explicitValue
  }

  return fallbackRole === USER_ROLES.MASTER ? AI_ACCESS_LEVELS.MASTER : AI_ACCESS_LEVELS.TEAM
}

function buildProfilePayload(user, role, workspaceId) {
  const resolvedRole = isPrimaryAdminEmail(user.email) ? USER_ROLES.MASTER : role

  return {
    id: user.id,
    email: user.email || '',
    full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
    avatar_url: user.user_metadata?.avatar_url || '',
    role: resolvedRole,
    ai_access_level: resolvedRole === USER_ROLES.MASTER ? AI_ACCESS_LEVELS.MASTER : AI_ACCESS_LEVELS.TEAM,
    can_edit_integrations: resolvedRole === USER_ROLES.MASTER,
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

  if (isAssessoriaLpMemberEmail(user.email)) {
    workspaceId = await resolveAssessoriaLpWorkspaceId(adminSupabase)
    if (!workspaceId) {
      throw new Error('Workspace da Assessoria LP não encontrado para vincular este usuário.')
    }
    role = USER_ROLES.OPERATOR
  } else if (!workspaceCount) {
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
    role = isPrimaryAdminEmail(user.email) ? USER_ROLES.MASTER : USER_ROLES.VIEWER
  } else if (!masterCount && isPrimaryAdminEmail(user.email)) {
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

export async function getAccessContext(supabase, user, options = {}) {
  const adminSupabase = options.adminSupabase || null
  let profile = null

  const { data: existingProfile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) throw profileError

  if (existingProfile) {
    profile = existingProfile
  } else if (adminSupabase) {
    profile = await ensureUserProfile(adminSupabase, user)
  } else {
    throw new Error('Perfil do usuário não encontrado.')
  }

  const isPrimaryAdmin = isPrimaryAdminEmail(profile.email || user.email)
  const role = isPrimaryAdmin ? USER_ROLES.MASTER : profile.role || USER_ROLES.VIEWER
  const aiAccessLevel = isPrimaryAdmin ? AI_ACCESS_LEVELS.MASTER : resolveAiAccessLevel(profile, role)
  let workspaceId = profile.workspace_id || null
  let workspace = null

  if (isPrimaryAdmin && !workspaceId && adminSupabase) {
    const { data: firstWorkspace, error: firstWorkspaceError } = await adminSupabase
      .from('workspaces')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (firstWorkspaceError) throw firstWorkspaceError
    workspaceId = firstWorkspace?.id || null

    if (workspaceId) {
      await adminSupabase
        .from('profiles')
        .update({ role: USER_ROLES.MASTER, workspace_id: workspaceId, ai_access_level: AI_ACCESS_LEVELS.MASTER, can_edit_integrations: true })
        .eq('id', profile.id)
    }
  }

  if (workspaceId && adminSupabase) {
    const { data: workspaceData, error: workspaceError } = await adminSupabase
      .from('workspaces')
      .select('id, name, owner_user_id')
      .eq('id', workspaceId)
      .maybeSingle()

    if (workspaceError) throw workspaceError
    workspace = workspaceData || null
  }

  const isWorkspaceOwner = Boolean(workspace?.owner_user_id && workspace.owner_user_id === user.id)

  let accessRows = []
  let groupAccessRows = []
  let groupMemberRows = []

  if (workspaceId && !isPrimaryAdmin) {
    const [
      { data: directAccessData, error: directAccessError },
      { data: groupAccessData, error: groupAccessError },
      { data: groupMemberData, error: groupMemberError },
    ] = await Promise.all([
      supabase
        .from('user_client_access')
        .select('client_id, can_view, can_edit')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id),
      supabase
        .from('user_client_group_access')
        .select('group_id, can_view, can_edit')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id),
      supabase
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
    aiAccessLevel,
    workspaceId,
    workspace,
    isWorkspaceOwner,
    canManageUsers: isPrimaryAdmin || isWorkspaceOwner || role === USER_ROLES.MASTER,
    canManageClients: isPrimaryAdmin || isWorkspaceOwner || role === USER_ROLES.MASTER || role === USER_ROLES.OPERATOR,
    canEditIntegrations: isPrimaryAdmin || isWorkspaceOwner || role === USER_ROLES.MASTER || Boolean(profile.can_edit_integrations),
    canViewDashboard: isPrimaryAdmin || isWorkspaceOwner || role === USER_ROLES.MASTER || role === USER_ROLES.OPERATOR || viewableClientIds.size > 0,
    canUseAi: aiAccessLevel !== AI_ACCESS_LEVELS.NONE && (isPrimaryAdmin || isWorkspaceOwner || role === USER_ROLES.MASTER || role === USER_ROLES.OPERATOR || viewableClientIds.size > 0),
    isClientRole: role === USER_ROLES.CLIENT,
    viewableClientIds: Array.from(viewableClientIds),
    editableClientIds: Array.from(editableClientIds),
  }
}
