import { USER_ROLES } from '@/lib/server/access-control'

const DEFAULT_FUNNEL_STEPS = ['impressions', 'clicks', 'leads', 'purchases']
const DEFAULT_DASHBOARD_TEMPLATE_NAME = 'Principal'
const DEFAULT_META_DASHBOARD_METRIC_KEYS = [
  'spend',
  'impressions',
  'clicks',
  'cpc',
  'ctr',
  'totalConversions',
  'purchases',
  'costPerPurchase',
  'roas',
  'leads',
  'costPerLead',
  'messages',
  'costPerMessage',
]
const DEFAULT_META_DASHBOARD_METRIC_LAYOUTS = [
  { metricKey: 'spend', size: 'sm' },
  { metricKey: 'impressions', size: 'sm' },
  { metricKey: 'clicks', size: 'sm' },
  { metricKey: 'cpc', size: 'sm' },
  { metricKey: 'ctr', size: 'sm' },
  { metricKey: 'totalConversions', size: 'sm' },
  { metricKey: 'purchases', size: 'sm' },
  { metricKey: 'costPerPurchase', size: 'sm' },
  { metricKey: 'roas', size: 'sm' },
  { metricKey: 'leads', size: 'sm' },
  { metricKey: 'costPerLead', size: 'sm' },
  { metricKey: 'messages', size: 'sm' },
  { metricKey: 'costPerMessage', size: 'sm' },
]
const DEFAULT_RD_DASHBOARD_METRIC_KEYS = [
  'opportunityCount',
  'qualifiedOpportunityCount',
  'wonOpportunityCount',
  'wonOpportunityRevenue',
  'avgTicketWonByCreation',
  'leadToQualifiedRate',
  'qualifiedToWonRate',
  'leadToWonRate',
  'lostOpportunityCount',
  'wonDeals',
  'wonDealsFromPreviousCohorts',
  'wonRevenue',
  'avgTicketWon',
  'wonRevenueFromPreviousCohorts',
  'avgTicketWonPreviousCohorts',
  'rdFinalSalesCount',
  'rdFinalRevenue',
  'rdFinalAvgTicket',
]
const DEFAULT_RD_DASHBOARD_METRIC_LAYOUTS = [
  { metricKey: 'opportunityCount', size: 'sm' },
  { metricKey: 'qualifiedOpportunityCount', size: 'sm' },
  { metricKey: 'wonOpportunityCount', size: 'sm' },
  { metricKey: 'wonOpportunityRevenue', size: 'sm' },
  { metricKey: 'avgTicketWonByCreation', size: 'sm' },
  { metricKey: 'leadToQualifiedRate', size: 'sm' },
  { metricKey: 'qualifiedToWonRate', size: 'sm' },
  { metricKey: 'leadToWonRate', size: 'sm' },
  { metricKey: 'lostOpportunityCount', size: 'sm' },
  { metricKey: 'wonDeals', size: 'sm' },
  { metricKey: 'wonDealsFromPreviousCohorts', size: 'sm' },
  { metricKey: 'wonRevenue', size: 'sm' },
  { metricKey: 'avgTicketWon', size: 'sm' },
  { metricKey: 'wonRevenueFromPreviousCohorts', size: 'sm' },
  { metricKey: 'avgTicketWonPreviousCohorts', size: 'sm' },
  { metricKey: 'rdFinalSalesCount', size: 'sm' },
  { metricKey: 'rdFinalRevenue', size: 'sm' },
  { metricKey: 'rdFinalAvgTicket', size: 'sm' },
]

function isMissingRelationError(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === 'PGRST205' || message.includes('schema cache') || message.includes('could not find the table')
}

function createRecordId(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function normalizeTemplateMetricKeys(metricKeys) {
  if (!Array.isArray(metricKeys)) return []
  return Array.from(new Set(metricKeys.filter((metricKey) => typeof metricKey === 'string' && metricKey.trim())))
}

function createDashboardMetricLayout(metricKey, overrides = {}) {
  return {
    id: overrides.id || createRecordId('dashboard-card'),
    metricKey,
    size: overrides.size === 'lg' ? 'lg' : 'sm',
  }
}

function normalizeDashboardMetricLayouts(layouts, fallbackMetricKeys = []) {
  const normalizedLayouts = Array.isArray(layouts)
    ? layouts
        .filter((item) => typeof item?.metricKey === 'string' && item.metricKey.trim())
        .map((item) => createDashboardMetricLayout(item.metricKey, item))
    : []

  if (normalizedLayouts.length > 0) return normalizedLayouts

  if (fallbackMetricKeys === DEFAULT_META_DASHBOARD_METRIC_KEYS) {
    return DEFAULT_META_DASHBOARD_METRIC_LAYOUTS.map((item) =>
      createDashboardMetricLayout(item.metricKey, item)
    )
  }

  if (fallbackMetricKeys === DEFAULT_RD_DASHBOARD_METRIC_KEYS) {
    return DEFAULT_RD_DASHBOARD_METRIC_LAYOUTS.map((item) =>
      createDashboardMetricLayout(item.metricKey, item)
    )
  }

  return normalizeTemplateMetricKeys(fallbackMetricKeys).map((metricKey) => createDashboardMetricLayout(metricKey))
}

function normalizeDashboardTemplate(template, fallbackName = DEFAULT_DASHBOARD_TEMPLATE_NAME) {
  const metaMetricLayouts = normalizeDashboardMetricLayouts(
    template?.metaMetricLayouts,
    template?.metaMetricKeys || DEFAULT_META_DASHBOARD_METRIC_KEYS
  )
  const rdMetricLayouts = normalizeDashboardMetricLayouts(
    template?.rdMetricLayouts,
    template?.rdMetricKeys || DEFAULT_RD_DASHBOARD_METRIC_KEYS
  )

  return {
    id: template?.id || createRecordId('dashboard-template'),
    name: String(template?.name || fallbackName).trim() || fallbackName,
    metaMetricKeys: metaMetricLayouts.map((item) => item.metricKey),
    rdMetricKeys: rdMetricLayouts.map((item) => item.metricKey),
    metaMetricLayouts,
    rdMetricLayouts,
  }
}

function normalizeClientDashboardTemplates(payload) {
  const rawTemplates = Array.isArray(payload?.dashboardTemplates) ? payload.dashboardTemplates : []
  const dashboardTemplates = rawTemplates.length
    ? rawTemplates.map((template, index) =>
        normalizeDashboardTemplate(template, index === 0 ? DEFAULT_DASHBOARD_TEMPLATE_NAME : `Modelo ${index + 1}`)
      )
    : [normalizeDashboardTemplate(null, DEFAULT_DASHBOARD_TEMPLATE_NAME)]

  const activeDashboardTemplateId = dashboardTemplates.some((template) => template.id === payload?.activeDashboardTemplateId)
    ? payload.activeDashboardTemplateId
    : dashboardTemplates[0].id

  return {
    dashboardTemplates,
    activeDashboardTemplateId,
  }
}

function normalizeClientRecord(client) {
  const payload = client?.payload && typeof client.payload === 'object' ? client.payload : client || {}
  const { dashboardTemplates, activeDashboardTemplateId } = normalizeClientDashboardTemplates(payload)

  return {
    id: client?.id || payload.id || '',
    name: client?.name || payload.name || 'Novo cliente',
    dashboardColor: payload.dashboardColor || 'blue',
    logoUrl: payload.logoUrl || '',
    metaAdAccountId: payload.metaAdAccountId || '',
    googleAdsAccountId: payload.googleAdsAccountId || '',
    tiktokAdsAccountId: payload.tiktokAdsAccountId || '',
    linkedInAdsAccountId: payload.linkedInAdsAccountId || '',
    rdStationAccountId: payload.rdStationAccountId || '',
    rdPipelineId: payload.rdPipelineId || '',
    salesforceAccountId: payload.salesforceAccountId || '',
    agendorAccountId: payload.agendorAccountId || '',
    rdQualifiedStages: Array.isArray(payload.rdQualifiedStages) ? payload.rdQualifiedStages : [],
    funnelSteps: Array.isArray(payload.funnelSteps) ? payload.funnelSteps : DEFAULT_FUNNEL_STEPS,
    dashboardTemplates,
    activeDashboardTemplateId,
    integrations: {
      metaAccessToken: payload.integrations?.metaAccessToken || '',
      metaAdAccountId: payload.integrations?.metaAdAccountId || '',
      googleAdsToken: payload.integrations?.googleAdsToken || '',
      tiktokAdsToken: payload.integrations?.tiktokAdsToken || '',
      linkedinAdsToken: payload.integrations?.linkedinAdsToken || '',
      clickUpToken: payload.integrations?.clickUpToken || '',
      rdStationToken: payload.integrations?.rdStationToken || '',
      salesforceToken: payload.integrations?.salesforceToken || '',
      agendorToken: payload.integrations?.agendorToken || '',
    },
  }
}

function normalizeClientGroupClientIds(clientIds) {
  if (!Array.isArray(clientIds)) return []
  return Array.from(new Set(clientIds.filter((clientId) => typeof clientId === 'string' && clientId.trim())))
}

function normalizeClientGroupRecord(group) {
  return {
    id: group?.id || createRecordId('client-group'),
    name: String(group?.name || 'Novo grupo').trim() || 'Novo grupo',
    clientIds: normalizeClientGroupClientIds(group?.clientIds),
  }
}

function filterClientsByAccess(clients, accessContext) {
  if (accessContext.role === USER_ROLES.MASTER) return clients

  const allowedIds = new Set(accessContext.viewableClientIds)
  return clients.filter((client) => allowedIds.has(client.id))
}

function filterClientGroupsByAccess(clientGroups, accessContext) {
  if (accessContext.role === USER_ROLES.MASTER) return clientGroups

  const allowedIds = new Set(accessContext.viewableClientIds)

  return clientGroups
    .map((group) => ({
      ...group,
      clientIds: group.clientIds.filter((clientId) => allowedIds.has(clientId)),
    }))
    .filter((group) => group.clientIds.length > 0)
}

export async function getDashboardState(adminSupabase, accessContext) {
  if (!accessContext.workspaceId) {
    return {
      themeColor: 'blue',
      metric1: 'spend',
      metric2: 'roas',
      activeClientId: '',
      clients: [],
      clientGroups: [],
    }
  }

  const [
    { data: preferenceRow, error: preferenceError },
    { data: clientRows, error: clientsError },
    { data: groupRows, error: groupsError },
    { data: groupMemberRows, error: groupMembersError },
  ] = await Promise.all([
    adminSupabase
      .from('workspace_preferences')
      .select('theme_color, metric_1, metric_2')
      .eq('workspace_id', accessContext.workspaceId)
      .maybeSingle(),
    adminSupabase
      .from('workspace_clients')
      .select('id, name, payload')
      .eq('workspace_id', accessContext.workspaceId)
      .order('name', { ascending: true }),
    adminSupabase
      .from('workspace_client_groups')
      .select('id, name')
      .eq('workspace_id', accessContext.workspaceId)
      .order('name', { ascending: true }),
    adminSupabase
      .from('workspace_client_group_members')
      .select('group_id, client_id')
      .eq('workspace_id', accessContext.workspaceId),
  ])

  if (preferenceError) throw preferenceError
  if (clientsError) throw clientsError
  if (groupsError && !isMissingRelationError(groupsError)) throw groupsError
  if (groupMembersError && !isMissingRelationError(groupMembersError)) throw groupMembersError

  const filteredClients = filterClientsByAccess((clientRows || []).map(normalizeClientRecord), accessContext)
  const groupMembersByGroupId = new Map()

  ;(groupMemberRows || []).forEach((row) => {
    const current = groupMembersByGroupId.get(row.group_id) || []
    current.push(row.client_id)
    groupMembersByGroupId.set(row.group_id, current)
  })

  const clientGroups = filterClientGroupsByAccess(
    (isMissingRelationError(groupsError) ? [] : groupRows || []).map((group) =>
      normalizeClientGroupRecord({
        ...group,
        clientIds: isMissingRelationError(groupMembersError) ? [] : groupMembersByGroupId.get(group.id) || [],
      })
    ),
    accessContext
  )

  return {
    themeColor: preferenceRow?.theme_color || 'blue',
    metric1: preferenceRow?.metric_1 || 'spend',
    metric2: preferenceRow?.metric_2 || 'roas',
    activeClientId: filteredClients[0]?.id || '',
    clients: filteredClients,
    clientGroups,
  }
}

export async function saveDashboardState(adminSupabase, accessContext, state) {
  if (!accessContext.workspaceId) {
    throw new Error('Usuario sem workspace vinculado.')
  }

  if (!accessContext.canManageClients) {
    throw new Error('Seu usuario nao tem permissao para editar os clientes.')
  }

  const submittedClients = Array.isArray(state.clients) ? state.clients.map(normalizeClientRecord) : []
  const submittedClientGroups = Array.isArray(state.clientGroups)
    ? state.clientGroups.map(normalizeClientGroupRecord)
    : []

  if (accessContext.role === USER_ROLES.MASTER) {
    const { error: preferenceError } = await adminSupabase
      .from('workspace_preferences')
      .upsert(
        {
          workspace_id: accessContext.workspaceId,
          theme_color: state.themeColor || 'blue',
          metric_1: state.metric1 || 'spend',
          metric_2: state.metric2 || 'roas',
        },
        { onConflict: 'workspace_id' }
      )

    if (preferenceError) throw preferenceError

    const { error: deleteError } = await adminSupabase
      .from('workspace_clients')
      .delete()
      .eq('workspace_id', accessContext.workspaceId)

    if (deleteError) throw deleteError

    const { error: deleteGroupError } = await adminSupabase
      .from('workspace_client_groups')
      .delete()
      .eq('workspace_id', accessContext.workspaceId)

    if (deleteGroupError && !isMissingRelationError(deleteGroupError)) throw deleteGroupError
    if (deleteGroupError && isMissingRelationError(deleteGroupError) && submittedClientGroups.length > 0) {
      throw new Error('As tabelas de grupos de clientes ainda nao foram criadas no Supabase. Rode a migration antes de salvar grupos.')
    }

    if (submittedClients.length > 0) {
      const { error: upsertError } = await adminSupabase
        .from('workspace_clients')
        .upsert(
          submittedClients.map((client) => ({
            workspace_id: accessContext.workspaceId,
            id: client.id,
            name: client.name,
            payload: client,
          })),
          { onConflict: 'workspace_id,id' }
        )

      if (upsertError) throw upsertError
    }

    if (submittedClientGroups.length > 0) {
      const { error: upsertGroupError } = await adminSupabase
        .from('workspace_client_groups')
        .upsert(
          submittedClientGroups.map((group) => ({
            workspace_id: accessContext.workspaceId,
            id: group.id,
            name: group.name,
          })),
          { onConflict: 'workspace_id,id' }
        )

      if (upsertGroupError) {
        if (isMissingRelationError(upsertGroupError)) {
          throw new Error('As tabelas de grupos de clientes ainda nao foram criadas no Supabase. Rode a migration antes de salvar grupos.')
        }
        throw upsertGroupError
      }

      const groupMembershipRows = submittedClientGroups.flatMap((group) =>
        group.clientIds.map((clientId) => ({
          workspace_id: accessContext.workspaceId,
          group_id: group.id,
          client_id: clientId,
        }))
      )

      if (groupMembershipRows.length > 0) {
        const { error: upsertGroupMemberError } = await adminSupabase
          .from('workspace_client_group_members')
          .upsert(groupMembershipRows, { onConflict: 'workspace_id,group_id,client_id' })

        if (upsertGroupMemberError) {
          if (isMissingRelationError(upsertGroupMemberError)) {
            throw new Error('As tabelas de grupos de clientes ainda nao foram criadas no Supabase. Rode a migration antes de salvar grupos.')
          }
          throw upsertGroupMemberError
        }
      }
    }

    return getDashboardState(adminSupabase, accessContext)
  }

  const editableIds = new Set(accessContext.editableClientIds)
  const editableClients = submittedClients.filter((client) => editableIds.has(client.id))

  if (editableClients.length > 0) {
    const { error: upsertError } = await adminSupabase
      .from('workspace_clients')
      .upsert(
        editableClients.map((client) => ({
          workspace_id: accessContext.workspaceId,
          id: client.id,
          name: client.name,
          payload: client,
        })),
        { onConflict: 'workspace_id,id' }
      )

    if (upsertError) throw upsertError
  }

  return getDashboardState(adminSupabase, accessContext)
}
