export const DASHBOARD_STORAGE_KEY = 'nype-dashboard-preferences'

export const DEFAULT_INTEGRATIONS = {
  metaAccessToken: '',
  metaAdAccountId: '',
  googleAdsToken: '',
  tiktokAdsToken: '',
  linkedinAdsToken: '',
  clickUpToken: '',
  rdStationToken: '',
  salesforceToken: '',
  agendorToken: '',
}

export const DEFAULT_PREFERENCES = {
  themeColor: 'blue',
  metric1: 'spend',
  metric2: 'roas',
  activeClientId: '',
  globalIntegrations: {
    metaAccessToken: '',
    googleAdsToken: '',
    tiktokAdsToken: '',
    linkedinAdsToken: '',
  },
  clients: [],
}

export function createClientRecord(overrides = {}) {
  return {
    id: globalThis.crypto?.randomUUID?.() || `client-${Date.now()}`,
    name: 'Novo cliente',
    dashboardColor: 'blue',
    logoUrl: '',
    metaAdAccountId: '',
    googleAdsAccountId: '',
    tiktokAdsAccountId: '',
    linkedInAdsAccountId: '',
    rdStationAccountId: '',
    salesforceAccountId: '',
    agendorAccountId: '',
    rdQualifiedStages: [],
    funnelSteps: ['impressions', 'clicks', 'leads', 'purchases'],
    integrations: { ...DEFAULT_INTEGRATIONS },
    ...overrides,
  }
}

export function loadDashboardPreferences() {
  if (typeof window === 'undefined') {
    return DEFAULT_PREFERENCES
  }

  try {
    const raw = window.localStorage.getItem(DASHBOARD_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_PREFERENCES
    }

    const parsed = JSON.parse(raw)

    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      globalIntegrations: {
        ...DEFAULT_PREFERENCES.globalIntegrations,
        ...parsed.globalIntegrations,
      },
      clients: Array.isArray(parsed.clients)
        ? parsed.clients.map((client) => ({
            ...createClientRecord(),
            ...client,
            integrations: {
              ...DEFAULT_INTEGRATIONS,
              ...client.integrations,
            },
          }))
        : [],
    }
  } catch (error) {
    console.error('Erro ao carregar preferências do dashboard:', error)
    return DEFAULT_PREFERENCES
  }
}

export function saveDashboardPreferences(preferences) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(preferences))
  } catch (error) {
    console.error('Erro ao salvar preferências do dashboard:', error)
  }
}
