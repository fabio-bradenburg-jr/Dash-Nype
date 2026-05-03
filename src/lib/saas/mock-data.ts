import { PlatformSnapshot } from '@/lib/saas/types'
import { LEGACY_THEME_PRESETS } from '@/lib/saas/theme-presets'

const defaultLegacyTheme = LEGACY_THEME_PRESETS[0]

export const demoPlatformSnapshot: PlatformSnapshot = {
  theme: {
    primaryColor: defaultLegacyTheme.primaryColor,
    accentColor: defaultLegacyTheme.accentColor,
    backgroundColor: defaultLegacyTheme.backgroundColor,
    buttonTextColor: defaultLegacyTheme.buttonTextColor,
    darkMode: defaultLegacyTheme.darkMode,
    logoUrl: '',
    appName: 'Assessoria LP',
    appSubtitle: 'Performance Hub',
  },
  clients: [],
  selectedClient: {
    id: '',
    tenant_id: 'tenant-demo',
    name: 'Nenhum cliente cadastrado',
    company: 'Cadastre um cliente para iniciar',
    niche: 'Dashboard',
    average_ticket: 0,
    main_goal: 'leads',
    ltv: 0,
    start_date: '',
    status: 'empty',
    target_roas: 0,
    business_data: {},
    last_sync_at: null,
  },
  clientDashboard: {
    overview_metrics: [],
    results_by_objective: [],
    time_series: [],
    top_cities: [],
    top_creatives: [],
    age_performance: [],
    funnel: [],
    campaigns: [],
  },
  integrations: [],
}
