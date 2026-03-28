import { DEFAULT_AI_SETTINGS, normalizeAiSettings } from '@/lib/ai-config'
import type {
  ClientGroupRecord,
  ClientRecord,
  DashboardIntegrations,
  DashboardMetricLayout,
  DashboardPreferences,
  DashboardTemplate,
} from '@/lib/types/dashboard'

export const DASHBOARD_STORAGE_KEY = 'nype-dashboard-preferences'

type DashboardTemplateOverrides = Partial<DashboardTemplate>
type ClientRecordOverrides = Partial<ClientRecord> & { integrations?: Partial<DashboardIntegrations> }

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
