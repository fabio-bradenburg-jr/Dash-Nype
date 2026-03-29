import { USER_ROLES } from '@/lib/server/access-control'
import { DEFAULT_AI_SETTINGS, normalizeAiSettings } from '@/lib/ai-config'
import type {
  AccessContextLike,
  ClientCustomColumnRecord,
  ClientCustomTabRecord,
  ClientGroupRecord,
  ClientRecord,
  DashboardIntegrations,
  DashboardMetricLayout,
  DashboardPreferences,
  DashboardTemplate,
  ProductRecord,
} from '@/lib/types/dashboard'

const DEFAULT_FUNNEL_STEPS = ['impressions', 'clicks', 'leads', 'purchases']
const DEFAULT_DASHBOARD_TEMPLATE_NAME = 'Principal'
const DEFAULT_META_DASHBOARD_METRIC_KEYS: string[] = []
const DEFAULT_META_DASHBOARD_METRIC_LAYOUTS: DashboardMetricLayout[] = []
const DEFAULT_META_CAMPAIGN_TABLE_COLUMN_KEYS = ['spend', 'totalConversions', 'cpa', 'roas']
const DEFAULT_RD_DASHBOARD_METRIC_KEYS: string[] = []
const DEFAULT_RD_DASHBOARD_METRIC_LAYOUTS: DashboardMetricLayout[] = []
const DEFAULT_SHEETS_DASHBOARD_METRIC_KEYS: string[] = []
const DEFAULT_SHEETS_DASHBOARD_METRIC_LAYOUTS: DashboardMetricLayout[] = []
const DEFAULT_GLOBAL_INTEGRATIONS: DashboardIntegrations = {
  metaAccessToken: '',
  metaConnectionMode: 'manual',
  googleAdsToken: '',
  tiktokAdsToken: '',
  linkedinAdsToken: '',
  clickUpToken: '',
  clickUpListIds: '',
  mondayToken: '',
  mondayBoardIds: '',
  rdStationToken: '',
  salesforceToken: '',
  agendorToken: '',
  ...DEFAULT_AI_SETTINGS,
}

type LooseRecord = Record<string, any>
type DashboardStateInput = Partial<DashboardPreferences> & { [key: string]: unknown }

function isMissingRelationError(error: LooseRecord | null | undefined): boolean {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === 'PGRST205' || message.includes('schema cache') || message.includes('could not find the table')
}

function createRecordId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function normalizeTemplateMetricKeys(metricKeys: unknown): string[] {
  if (!Array.isArray(metricKeys)) return []
  return Array.from(new Set(metricKeys.filter((metricKey) => typeof metricKey === 'string' && metricKey.trim())))
}

function normalizeMetaCampaignTableColumnKeys(columnKeys: unknown): string[] {
  const normalized = normalizeTemplateMetricKeys(columnKeys)
  return normalized.length ? normalized : [...DEFAULT_META_CAMPAIGN_TABLE_COLUMN_KEYS]
}

function createDashboardMetricLayout(
  metricKey: string,
  overrides: Partial<DashboardMetricLayout> = {}
): DashboardMetricLayout {
  return {
    id: overrides.id || createRecordId('dashboard-card'),
    metricKey,
    size: overrides.size === 'lg' ? 'lg' : 'sm',
  }
}

function normalizeDashboardMetricLayouts(
  layouts: unknown,
  fallbackMetricKeys: string[] = []
): DashboardMetricLayout[] {
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

function normalizeDashboardTemplate(
  template: Partial<DashboardTemplate> | null | undefined,
  fallbackName = DEFAULT_DASHBOARD_TEMPLATE_NAME
): DashboardTemplate {
  const metaMetricLayouts = normalizeDashboardMetricLayouts(
    template?.metaMetricLayouts,
    template?.metaMetricKeys || DEFAULT_META_DASHBOARD_METRIC_KEYS
  )
  const rdMetricLayouts = normalizeDashboardMetricLayouts(
    template?.rdMetricLayouts,
    template?.rdMetricKeys || DEFAULT_RD_DASHBOARD_METRIC_KEYS
  )
  const sheetsMetricLayouts = normalizeDashboardMetricLayouts(
    template?.sheetsMetricLayouts,
    template?.sheetsMetricKeys || DEFAULT_SHEETS_DASHBOARD_METRIC_KEYS
  )

  return {
    id: template?.id || createRecordId('dashboard-template'),
    name: String(template?.name || fallbackName).trim() || fallbackName,
    metaMetricKeys: metaMetricLayouts.map((item) => item.metricKey),
    metaCampaignTableColumnKeys: normalizeMetaCampaignTableColumnKeys(template?.metaCampaignTableColumnKeys),
    rdMetricKeys: rdMetricLayouts.map((item) => item.metricKey),
    sheetsMetricKeys: sheetsMetricLayouts.map((item) => item.metricKey),
    metaMetricLayouts,
    rdMetricLayouts,
    sheetsMetricLayouts,
  }
}

function normalizeClientDashboardTemplates(payload: LooseRecord) {
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

function normalizeClientRecord(client: LooseRecord): ClientRecord {
  const payload = client?.payload && typeof client.payload === 'object' ? client.payload : client || {}
  const { dashboardTemplates, activeDashboardTemplateId } = normalizeClientDashboardTemplates(payload)
  const normalizedAiSettings = normalizeAiSettings(payload.integrations || {})

  return {
    id: client?.id || payload.id || '',
    name: client?.name || payload.name || 'Novo cliente',
    status: payload.status || 'Ativo',
    productId: payload.productId || '',
    product: payload.product || '',
    customFieldValues: payload.customFieldValues && typeof payload.customFieldValues === 'object' ? payload.customFieldValues : {},
    contractSignedAt: payload.contractSignedAt || '',
    churnDate: payload.churnDate || '',
    contractUrl: payload.contractUrl || '',
    startDate: payload.startDate || '',
    fee: payload.fee || '',
    mediaInvestment: payload.mediaInvestment || '',
    monthlyRevenue: payload.monthlyRevenue || '',
    step: payload.step || '',
    ltv: payload.ltv || '',
    contributionMarginAmount: payload.contributionMarginAmount || '',
    contributionMarginPercent: payload.contributionMarginPercent || '',
    profitMarginAmount: payload.profitMarginAmount || '',
    profitMarginPercent: payload.profitMarginPercent || '',
    mmf: payload.mmf || '',
    roiMarketing: payload.roiMarketing || '',
    dashboardUrl: payload.dashboardUrl || '',
    driveUrl: payload.driveUrl || '',
    eapUrl: payload.eapUrl || '',
    brandManualUrl: payload.brandManualUrl || '',
    moodboardUrl: payload.moodboardUrl || '',
    salesNarrativeUrl: payload.salesNarrativeUrl || '',
    drawflowUrl: payload.drawflowUrl || '',
    projectManager: payload.projectManager || '',
    trafficManager: payload.trafficManager || '',
    designer: payload.designer || '',
    csOwner: payload.csOwner || '',
    copyOwner: payload.copyOwner || '',
    organicDemands: payload.organicDemands || '',
    trafficDemands: payload.trafficDemands || '',
    totalDemands: payload.totalDemands || '',
    financialFlag: payload.financialFlag || 'na',
    roiFlag: payload.roiFlag || 'na',
    healthScoreFlag: payload.healthScoreFlag || 'na',
    deliverablesFlag: payload.deliverablesFlag || 'na',
    crmUsageFlag: payload.crmUsageFlag || 'na',
    csAttendanceFlag: payload.csAttendanceFlag || 'na',
    csatFlag: payload.csatFlag || 'na',
    clientParticipationFlag: payload.clientParticipationFlag || 'na',
    adAccountsFlag: payload.adAccountsFlag || 'na',
    npsFlag: payload.npsFlag || 'na',
    stakeholderFlag: payload.stakeholderFlag || 'na',
    dashboardColor: payload.dashboardColor || 'blue',
    logoUrl: payload.logoUrl || '',
    metaAdAccountId: payload.metaAdAccountId || '',
    googleAdsAccountId: payload.googleAdsAccountId || '',
    tiktokAdsAccountId: payload.tiktokAdsAccountId || '',
    linkedInAdsAccountId: payload.linkedInAdsAccountId || '',
    googleSheetsUrl: payload.googleSheetsUrl || '',
    googleSheetsHeaderRow: Number.isFinite(Number(payload.googleSheetsHeaderRow)) && Number(payload.googleSheetsHeaderRow) > 0
      ? Number(payload.googleSheetsHeaderRow)
      : 1,
    googleSheetsStatusColumn: String(payload.googleSheetsStatusColumn || '').trim(),
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
      metaConnectionMode: payload.integrations?.metaConnectionMode === 'oauth' ? 'oauth' : 'manual',
      metaAdAccountId: payload.integrations?.metaAdAccountId || '',
      googleAdsToken: payload.integrations?.googleAdsToken || '',
      tiktokAdsToken: payload.integrations?.tiktokAdsToken || '',
      linkedinAdsToken: payload.integrations?.linkedinAdsToken || '',
      clickUpToken: payload.integrations?.clickUpToken || '',
      clickUpListIds: payload.integrations?.clickUpListIds || '',
      mondayToken: payload.integrations?.mondayToken || '',
      mondayBoardIds: payload.integrations?.mondayBoardIds || '',
      rdStationToken: payload.integrations?.rdStationToken || '',
      salesforceToken: payload.integrations?.salesforceToken || '',
      agendorToken: payload.integrations?.agendorToken || '',
      ...normalizedAiSettings,
    },
  }
}

function normalizeGlobalIntegrations(
  globalIntegrations: Partial<DashboardIntegrations> | LooseRecord | null | undefined
): DashboardIntegrations {
  const normalizedAiSettings = normalizeAiSettings(globalIntegrations)
  return {
    ...DEFAULT_GLOBAL_INTEGRATIONS,
    ...(globalIntegrations && typeof globalIntegrations === 'object' ? globalIntegrations : {}),
    ...normalizedAiSettings,
  }
}

function extractGlobalIntegrations(clients: ClientRecord[]): DashboardIntegrations {
  const hasIntegrationValue = (value: unknown) => {
    if (typeof value === 'boolean') return true
    if (typeof value === 'number') return Number.isFinite(value)
    if (typeof value === 'string') return value.trim().length > 0
    return value != null
  }

  return clients.reduce((current, client) => {
    const next = { ...current }
    const integrations = (client?.integrations || {}) as LooseRecord

    Object.keys(DEFAULT_GLOBAL_INTEGRATIONS).forEach((fieldName) => {
      if (fieldName === 'aiProviders') {
        if (integrations.aiProviders && typeof integrations.aiProviders === 'object') {
          next.aiProviders = {
            ...(next.aiProviders || {}),
            ...integrations.aiProviders,
          }
        }
        return
      }

      if (fieldName === 'aiAgents') {
        if (Array.isArray(integrations.aiAgents) && integrations.aiAgents.length) {
          next.aiAgents = integrations.aiAgents
        }
        return
      }

      if (hasIntegrationValue(integrations[fieldName])) {
        next[fieldName] = integrations[fieldName]
      }
    })

    return {
      ...next,
      ...normalizeAiSettings(next),
    }
  }, { ...DEFAULT_GLOBAL_INTEGRATIONS })
}

function normalizeClientGroupClientIds(clientIds: unknown): string[] {
  if (!Array.isArray(clientIds)) return []
  return Array.from(new Set(clientIds.filter((clientId) => typeof clientId === 'string' && clientId.trim())))
}

function normalizeClientGroupRecord(group: Partial<ClientGroupRecord> | null | undefined): ClientGroupRecord {
  return {
    id: group?.id || createRecordId('client-group'),
    name: String(group?.name || 'Novo grupo').trim() || 'Novo grupo',
    clientIds: normalizeClientGroupClientIds(group?.clientIds),
  }
}

function normalizeProductRecord(product: Partial<ProductRecord> | null | undefined): ProductRecord {
  return {
    id: product?.id || createRecordId('product'),
    name: String(product?.name || 'Novo produto').trim() || 'Novo produto',
    description: String(product?.description || '').trim(),
    status: String(product?.status || 'Ativo').trim() || 'Ativo',
  }
}

function normalizeClientCustomColumnOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return []
  return Array.from(new Set(options.map((option) => String(option || '').trim()).filter(Boolean)))
}

function normalizeClientCustomColumnRecord(
  column: Partial<ClientCustomColumnRecord> | null | undefined
): ClientCustomColumnRecord {
  const label = String(column?.label || 'Nova coluna').trim() || 'Nova coluna'
  const key = String(column?.key || label || 'nova_coluna')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return {
    id: column?.id || createRecordId('client-column'),
    key: key || createRecordId('client_column'),
    label,
    type: ['text', 'number', 'currency', 'percent', 'date', 'link', 'flag', 'select'].includes(String(column?.type || 'text'))
      ? column?.type || 'text'
      : 'text',
    options: normalizeClientCustomColumnOptions(column?.options),
  }
}

function normalizeClientCustomTabRecord(
  tab: Partial<ClientCustomTabRecord> | null | undefined
): ClientCustomTabRecord {
  const label = String(tab?.label || 'Nova aba').trim() || 'Nova aba'
  const key = String(tab?.key || label || 'nova_aba')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return {
    id: tab?.id || createRecordId('client-tab'),
    key: key || createRecordId('client_tab'),
    label,
    columnKeys: Array.isArray(tab?.columnKeys) ? tab.columnKeys.filter(Boolean) : [],
  }
}

function filterClientsByAccess(
  clients: ClientRecord[],
  accessContext: AccessContextLike
): ClientRecord[] {
  if (accessContext.role === USER_ROLES.MASTER) return clients

  const allowedIds = new Set(accessContext.viewableClientIds)
  return clients.filter((client) => allowedIds.has(client.id))
}

function filterClientGroupsByAccess(
  clientGroups: ClientGroupRecord[],
  accessContext: AccessContextLike
): ClientGroupRecord[] {
  if (accessContext.role === USER_ROLES.MASTER) return clientGroups

  const allowedIds = new Set(accessContext.viewableClientIds)

  return clientGroups
    .map((group) => ({
      ...group,
      clientIds: group.clientIds.filter((clientId) => allowedIds.has(clientId)),
    }))
    .filter((group) => group.clientIds.length > 0)
}

export async function getDashboardState(
  adminSupabase: any,
  accessContext: AccessContextLike
): Promise<DashboardPreferences> {
  if (!accessContext.workspaceId) {
    return {
      themeColor: 'blue',
      metric1: 'spend',
      metric2: 'roas',
      activeClientId: '',
      globalIntegrations: { ...DEFAULT_GLOBAL_INTEGRATIONS },
      clients: [],
      clientGroups: [],
      products: [],
      clientCustomColumns: [],
      clientCustomTabs: [],
    }
  }

  const [
    { data: preferenceRow, error: preferenceError },
    { data: clientRows, error: clientsError },
    { data: groupRows, error: groupsError },
    { data: groupMemberRows, error: groupMembersError },
    { data: productRows, error: productsError },
  ] = await Promise.all([
    adminSupabase
      .from('workspace_preferences')
      .select('theme_color, metric_1, metric_2, payload')
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
    adminSupabase
      .from('workspace_products')
      .select('id, name, description, status')
      .eq('workspace_id', accessContext.workspaceId)
      .order('name', { ascending: true }),
  ])

  if (preferenceError) throw preferenceError
  if (clientsError) throw clientsError
  if (groupsError && !isMissingRelationError(groupsError)) throw groupsError
  if (groupMembersError && !isMissingRelationError(groupMembersError)) throw groupMembersError
  if (productsError && !isMissingRelationError(productsError)) throw productsError

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
  const preferencePayload = preferenceRow?.payload && typeof preferenceRow.payload === 'object' ? preferenceRow.payload : {}

  return {
    themeColor: preferenceRow?.theme_color || 'blue',
    metric1: preferenceRow?.metric_1 || 'spend',
    metric2: preferenceRow?.metric_2 || 'roas',
    activeClientId: filteredClients[0]?.id || '',
    globalIntegrations: extractGlobalIntegrations(filteredClients),
    clients: filteredClients,
    clientGroups,
    products: (isMissingRelationError(productsError) ? [] : productRows || []).map(normalizeProductRecord),
    clientCustomColumns: Array.isArray(preferencePayload.clientCustomColumns)
      ? preferencePayload.clientCustomColumns.map(normalizeClientCustomColumnRecord)
      : [],
    clientCustomTabs: Array.isArray(preferencePayload.clientCustomTabs)
      ? preferencePayload.clientCustomTabs.map(normalizeClientCustomTabRecord)
      : [],
  }
}

export async function saveDashboardState(
  adminSupabase: any,
  accessContext: AccessContextLike,
  state: DashboardStateInput
): Promise<DashboardPreferences> {
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
  const submittedProducts = Array.isArray(state.products)
    ? state.products.map(normalizeProductRecord)
    : []
  const submittedClientCustomColumns = Array.isArray(state.clientCustomColumns)
    ? state.clientCustomColumns.map(normalizeClientCustomColumnRecord)
    : []
  const submittedClientCustomTabs = Array.isArray(state.clientCustomTabs)
    ? state.clientCustomTabs.map(normalizeClientCustomTabRecord)
    : []
  const submittedGlobalIntegrations = normalizeGlobalIntegrations(state.globalIntegrations)

  if (accessContext.role === USER_ROLES.MASTER) {
    const [
      { data: existingClientRows, error: existingClientsError },
      { data: existingGroupRows, error: existingGroupsError },
      { data: existingProductRows, error: existingProductsError },
    ] = await Promise.all([
      adminSupabase
        .from('workspace_clients')
        .select('id')
        .eq('workspace_id', accessContext.workspaceId),
      adminSupabase
        .from('workspace_client_groups')
        .select('id')
        .eq('workspace_id', accessContext.workspaceId),
      adminSupabase
        .from('workspace_products')
        .select('id')
        .eq('workspace_id', accessContext.workspaceId),
    ])

    if (existingClientsError) throw existingClientsError
    if (existingGroupsError && !isMissingRelationError(existingGroupsError)) throw existingGroupsError
    if (existingProductsError && !isMissingRelationError(existingProductsError)) throw existingProductsError
    if (existingGroupsError && isMissingRelationError(existingGroupsError) && submittedClientGroups.length > 0) {
      throw new Error('As tabelas de grupos de clientes ainda nao foram criadas no Supabase. Rode a migration antes de salvar grupos.')
    }
    if (existingProductsError && isMissingRelationError(existingProductsError) && submittedProducts.length > 0) {
      throw new Error('A tabela de produtos ainda nao foi criada no Supabase. Rode a migration antes de salvar produtos.')
    }

    const { error: preferenceError } = await adminSupabase
      .from('workspace_preferences')
      .upsert(
        {
          workspace_id: accessContext.workspaceId,
          theme_color: state.themeColor || 'blue',
          metric_1: state.metric1 || 'spend',
          metric_2: state.metric2 || 'roas',
          payload: {
            clientCustomColumns: submittedClientCustomColumns,
            clientCustomTabs: submittedClientCustomTabs,
          },
        },
        { onConflict: 'workspace_id' }
      )

    if (preferenceError) throw preferenceError

    const submittedClientIds = new Set(submittedClients.map((client) => client.id))
    const existingClientIds = (existingClientRows || []).map((row) => row.id)

    if (submittedClients.length > 0) {
      const { error: upsertError } = await adminSupabase
        .from('workspace_clients')
        .upsert(
          submittedClients.map((client) => ({
            workspace_id: accessContext.workspaceId,
            id: client.id,
            name: client.name,
            payload: {
              ...client,
              integrations: {
                ...client.integrations,
                ...submittedGlobalIntegrations,
              },
            },
          })),
          { onConflict: 'workspace_id,id' }
        )

      if (upsertError) throw upsertError
    }

    const removedClientIds = existingClientIds.filter((clientId) => !submittedClientIds.has(clientId))

    if (removedClientIds.length > 0) {
      const { error: deleteRemovedClientsError } = await adminSupabase
        .from('workspace_clients')
        .delete()
        .eq('workspace_id', accessContext.workspaceId)
        .in('id', removedClientIds)

      if (deleteRemovedClientsError) throw deleteRemovedClientsError
    }

    const submittedGroupIds = new Set(submittedClientGroups.map((group) => group.id))
    const existingGroupIds = (isMissingRelationError(existingGroupsError) ? [] : existingGroupRows || []).map((row) => row.id)
    const submittedProductIds = new Set(submittedProducts.map((product) => product.id))
    const existingProductIds = (isMissingRelationError(existingProductsError) ? [] : existingProductRows || []).map((row) => row.id)

    if (submittedProducts.length > 0) {
      const { error: upsertProductsError } = await adminSupabase
        .from('workspace_products')
        .upsert(
          submittedProducts.map((product) => ({
            workspace_id: accessContext.workspaceId,
            id: product.id,
            name: product.name,
            description: product.description,
            status: product.status,
          })),
          { onConflict: 'workspace_id,id' }
        )

      if (upsertProductsError) {
        if (isMissingRelationError(upsertProductsError)) {
          throw new Error('A tabela de produtos ainda nao foi criada no Supabase. Rode a migration antes de salvar produtos.')
        }
        throw upsertProductsError
      }
    }

    const removedProductIds = existingProductIds.filter((productId) => !submittedProductIds.has(productId))

    if (removedProductIds.length > 0) {
      const { error: deleteRemovedProductsError } = await adminSupabase
        .from('workspace_products')
        .delete()
        .eq('workspace_id', accessContext.workspaceId)
        .in('id', removedProductIds)

      if (deleteRemovedProductsError) {
        if (isMissingRelationError(deleteRemovedProductsError)) {
          throw new Error('A tabela de produtos ainda nao foi criada no Supabase. Rode a migration antes de salvar produtos.')
        }
        throw deleteRemovedProductsError
      }
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

      const { error: deleteExistingGroupMembersError } = await adminSupabase
        .from('workspace_client_group_members')
        .delete()
        .eq('workspace_id', accessContext.workspaceId)
        .in('group_id', Array.from(submittedGroupIds))

      if (deleteExistingGroupMembersError) {
        if (isMissingRelationError(deleteExistingGroupMembersError)) {
          throw new Error('As tabelas de grupos de clientes ainda nao foram criadas no Supabase. Rode a migration antes de salvar grupos.')
        }
        throw deleteExistingGroupMembersError
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

    const removedGroupIds = existingGroupIds.filter((groupId) => !submittedGroupIds.has(groupId))

    if (removedGroupIds.length > 0) {
      const { error: deleteRemovedGroupsError } = await adminSupabase
        .from('workspace_client_groups')
        .delete()
        .eq('workspace_id', accessContext.workspaceId)
        .in('id', removedGroupIds)

      if (deleteRemovedGroupsError) {
        if (isMissingRelationError(deleteRemovedGroupsError)) {
          throw new Error('As tabelas de grupos de clientes ainda nao foram criadas no Supabase. Rode a migration antes de salvar grupos.')
        }
        throw deleteRemovedGroupsError
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
          payload: {
            ...client,
            integrations: {
              ...client.integrations,
              ...submittedGlobalIntegrations,
            },
          },
        })),
        { onConflict: 'workspace_id,id' }
      )

    if (upsertError) throw upsertError
  }

  return getDashboardState(adminSupabase, accessContext)
}
