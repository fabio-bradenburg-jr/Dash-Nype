import { DEFAULT_AI_SETTINGS, normalizeAiSettings } from '@/lib/ai-config'
import type {
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

export const DASHBOARD_STORAGE_KEY = 'nype-dashboard-preferences'

type DashboardTemplateOverrides = Partial<DashboardTemplate>
type ClientRecordOverrides = Partial<ClientRecord> & { integrations?: Partial<DashboardIntegrations> }
type ProductRecordOverrides = Partial<ProductRecord>
type ClientCustomColumnOverrides = Partial<ClientCustomColumnRecord>
type ClientCustomTabOverrides = Partial<ClientCustomTabRecord>

function normalizeClientCustomColumnOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return []
  return Array.from(new Set(options.map((option) => String(option || '').trim()).filter(Boolean)))
}

export const DEFAULT_INTEGRATIONS: DashboardIntegrations = {
  metaAccessToken: '',
  metaConnectionMode: 'manual',
  metaAdAccountId: '',
  googleAdsToken: '',
  tiktokAdsToken: '',
  linkedinAdsToken: '',
  clickUpToken: '',
  mondayToken: '',
  rdStationToken: '',
  salesforceToken: '',
  agendorToken: '',
  ...DEFAULT_AI_SETTINGS,
}

export const DEFAULT_PREFERENCES: DashboardPreferences = {
  themeColor: 'blue',
  metric1: 'spend',
  metric2: 'roas',
  activeClientId: '',
  globalIntegrations: {
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
  },
  clients: [],
  clientGroups: [],
  products: [],
  clientSystemFields: [],
  clientCustomColumns: [],
  clientCustomTabs: [],
}

export const DEFAULT_DASHBOARD_TEMPLATE_NAME = 'Principal'
const DEFAULT_META_DASHBOARD_METRIC_KEYS: string[] = []
const DEFAULT_META_DASHBOARD_METRIC_LAYOUTS: DashboardMetricLayout[] = []
export const DEFAULT_META_CAMPAIGN_TABLE_COLUMN_KEYS = ['spend', 'totalConversions', 'cpa', 'roas']
const DEFAULT_RD_DASHBOARD_METRIC_KEYS: string[] = []
const DEFAULT_RD_DASHBOARD_METRIC_LAYOUTS: DashboardMetricLayout[] = []
const DEFAULT_SHEETS_DASHBOARD_METRIC_KEYS: string[] = []
const DEFAULT_SHEETS_DASHBOARD_METRIC_LAYOUTS: DashboardMetricLayout[] = []

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

export function createDashboardTemplate(overrides: DashboardTemplateOverrides = {}): DashboardTemplate {
  const metaMetricLayouts = normalizeDashboardMetricLayouts(
    overrides.metaMetricLayouts,
    overrides.metaMetricKeys || DEFAULT_META_DASHBOARD_METRIC_KEYS
  )
  const rdMetricLayouts = normalizeDashboardMetricLayouts(
    overrides.rdMetricLayouts,
    overrides.rdMetricKeys || DEFAULT_RD_DASHBOARD_METRIC_KEYS
  )
  const sheetsMetricLayouts = normalizeDashboardMetricLayouts(
    overrides.sheetsMetricLayouts,
    overrides.sheetsMetricKeys || DEFAULT_SHEETS_DASHBOARD_METRIC_KEYS
  )

  return {
    id: createRecordId('dashboard-template'),
    name: DEFAULT_DASHBOARD_TEMPLATE_NAME,
    ...overrides,
    metaMetricKeys: metaMetricLayouts.map((item) => item.metricKey),
    metaCampaignTableColumnKeys: normalizeMetaCampaignTableColumnKeys(overrides.metaCampaignTableColumnKeys),
    rdMetricKeys: rdMetricLayouts.map((item) => item.metricKey),
    sheetsMetricKeys: sheetsMetricLayouts.map((item) => item.metricKey),
    metaMetricLayouts,
    rdMetricLayouts,
    sheetsMetricLayouts,
  }
}

function normalizeClientGroupClientIds(clientIds: unknown): string[] {
  if (!Array.isArray(clientIds)) return []
  return Array.from(new Set(clientIds.filter((clientId) => typeof clientId === 'string' && clientId.trim())))
}

export function createClientGroupRecord(overrides: Partial<ClientGroupRecord> = {}): ClientGroupRecord {
  return {
    id: overrides.id || createRecordId('client-group'),
    name: String(overrides.name || 'Novo grupo').trim() || 'Novo grupo',
    clientIds: normalizeClientGroupClientIds(overrides.clientIds),
  }
}

export function createProductRecord(overrides: ProductRecordOverrides = {}): ProductRecord {
  return {
    id: overrides.id || createRecordId('product'),
    name: String(overrides.name || 'Novo produto').trim() || 'Novo produto',
    description: String(overrides.description || '').trim(),
    status: String(overrides.status || 'Ativo').trim() || 'Ativo',
  }
}

export function createClientCustomColumnRecord(
  overrides: ClientCustomColumnOverrides = {}
): ClientCustomColumnRecord {
  const label = String(overrides.label || 'Nova coluna').trim() || 'Nova coluna'
  const keySource = String(overrides.key || label || 'nova_coluna')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return {
    id: overrides.id || createRecordId('client-column'),
    key: keySource || createRecordId('client_column'),
    label,
    type: ['text', 'long_text', 'number', 'currency', 'percent', 'date', 'link', 'email', 'phone', 'person', 'progress', 'checkbox', 'flag', 'select', 'formula'].includes(String(overrides.type || 'text'))
      ? overrides.type
      : 'text',
    options: normalizeClientCustomColumnOptions(overrides.options),
    tabKey: String(overrides.tabKey || 'geral').trim() || 'geral',
    formulaExpression: String(overrides.formulaExpression || '').trim(),
    settings:
      overrides.settings && typeof overrides.settings === 'object'
        ? Object.fromEntries(Object.entries(overrides.settings).map(([key, value]) => [key, String(value ?? '')]))
        : {},
  }
}

export function createClientCustomTabRecord(overrides: ClientCustomTabOverrides = {}): ClientCustomTabRecord {
  const label = String(overrides.label || 'Nova aba').trim() || 'Nova aba'
  const keySource = String(overrides.key || label || 'nova_aba')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return {
    id: overrides.id || createRecordId('client-tab'),
    key: keySource || createRecordId('client_tab'),
    label,
    columnKeys: Array.isArray(overrides.columnKeys) ? overrides.columnKeys.filter(Boolean) : [],
  }
}

export function normalizeClientGroupRecord(group: Partial<ClientGroupRecord> | null | undefined): ClientGroupRecord {
  return {
    id: group?.id || createRecordId('client-group'),
    name: String(group?.name || 'Novo grupo').trim() || 'Novo grupo',
    clientIds: normalizeClientGroupClientIds(group?.clientIds),
  }
}

export function normalizeDashboardTemplate(
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

function normalizeClientDashboardTemplates(client: ClientRecordOverrides) {
  const rawTemplates = Array.isArray(client?.dashboardTemplates) ? client.dashboardTemplates : []
  const dashboardTemplates = rawTemplates.length
    ? rawTemplates.map((template, index) =>
        normalizeDashboardTemplate(template, index === 0 ? DEFAULT_DASHBOARD_TEMPLATE_NAME : `Modelo ${index + 1}`)
      )
    : [createDashboardTemplate({ name: DEFAULT_DASHBOARD_TEMPLATE_NAME })]

  const activeDashboardTemplateId = dashboardTemplates.some((template) => template.id === client?.activeDashboardTemplateId)
    ? client.activeDashboardTemplateId
    : dashboardTemplates[0].id

  return {
    dashboardTemplates,
    activeDashboardTemplateId,
  }
}

export function createClientRecord(overrides: ClientRecordOverrides = {}): ClientRecord {
  const { dashboardTemplates, activeDashboardTemplateId } = normalizeClientDashboardTemplates(overrides)
  const normalizedAiSettings = normalizeAiSettings(overrides.integrations || {})

  return {
    id: overrides.id || createRecordId('client'),
    name: 'Novo cliente',
    status: 'Ativo',
    productId: '',
    product: '',
    customFieldValues: {},
    contractSignedAt: '',
    churnDate: '',
    contractUrl: '',
    startDate: '',
    fee: '',
    mediaInvestment: '',
    monthlyRevenue: '',
    step: '',
    ltv: '',
    contributionMarginAmount: '',
    contributionMarginPercent: '',
    profitMarginAmount: '',
    profitMarginPercent: '',
    mmf: '',
    roiMarketing: '',
    dashboardUrl: '',
    driveUrl: '',
    eapUrl: '',
    brandManualUrl: '',
    moodboardUrl: '',
    salesNarrativeUrl: '',
    drawflowUrl: '',
    projectManager: '',
    trafficManager: '',
    designer: '',
    csOwner: '',
    copyOwner: '',
    organicDemands: '',
    trafficDemands: '',
    totalDemands: '',
    financialFlag: 'na',
    roiFlag: 'na',
    healthScoreFlag: 'na',
    deliverablesFlag: 'na',
    crmUsageFlag: 'na',
    csAttendanceFlag: 'na',
    csatFlag: 'na',
    clientParticipationFlag: 'na',
    adAccountsFlag: 'na',
    npsFlag: 'na',
    stakeholderFlag: 'na',
    dashboardColor: 'blue',
    logoUrl: '',
    metaAdAccountId: '',
    googleAdsAccountId: '',
    tiktokAdsAccountId: '',
    linkedInAdsAccountId: '',
    googleSheetsUrl: '',
    rdStationAccountId: '',
    rdPipelineId: '',
    salesforceAccountId: '',
    agendorAccountId: '',
    rdQualifiedStages: [],
    funnelSteps: ['impressions', 'clicks', 'leads', 'purchases'],
    ...overrides,
    googleSheetsHeaderRow: Number.isFinite(Number(overrides.googleSheetsHeaderRow)) && Number(overrides.googleSheetsHeaderRow) > 0
      ? Number(overrides.googleSheetsHeaderRow)
      : 1,
    googleSheetsStatusColumn: String(overrides.googleSheetsStatusColumn || '').trim(),
    integrations: {
      ...DEFAULT_INTEGRATIONS,
      ...overrides.integrations,
      ...normalizedAiSettings,
    },
    dashboardTemplates,
    activeDashboardTemplateId,
  }
}

export function loadDashboardPreferences(): DashboardPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_PREFERENCES
  }

  try {
    const raw = window.localStorage.getItem(DASHBOARD_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_PREFERENCES
    }

    const parsed = JSON.parse(raw) as Partial<DashboardPreferences>
    const normalizedAiSettings = normalizeAiSettings(parsed.globalIntegrations || {})

    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      globalIntegrations: {
        ...DEFAULT_PREFERENCES.globalIntegrations,
        ...parsed.globalIntegrations,
        ...normalizedAiSettings,
      },
      clients: Array.isArray(parsed.clients)
        ? parsed.clients.map((client) => createClientRecord(client))
        : [],
      clientGroups: Array.isArray(parsed.clientGroups)
        ? parsed.clientGroups.map((group) => normalizeClientGroupRecord(group))
        : [],
      products: Array.isArray(parsed.products)
        ? parsed.products.map((product) => createProductRecord(product))
        : [],
      clientSystemFields: Array.isArray(parsed.clientSystemFields)
        ? parsed.clientSystemFields.map((column) => createClientCustomColumnRecord(column))
        : [],
      clientCustomColumns: Array.isArray(parsed.clientCustomColumns)
        ? parsed.clientCustomColumns.map((column) => createClientCustomColumnRecord(column))
        : [],
      clientCustomTabs: Array.isArray(parsed.clientCustomTabs)
        ? parsed.clientCustomTabs.map((tab) => createClientCustomTabRecord(tab))
        : [],
    }
  } catch (error) {
    console.error('Erro ao carregar preferências do dashboard:', error)
    return DEFAULT_PREFERENCES
  }
}

export function saveDashboardPreferences(preferences: DashboardPreferences): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(preferences))
  } catch (error) {
    console.error('Erro ao salvar preferências do dashboard:', error)
  }
}
