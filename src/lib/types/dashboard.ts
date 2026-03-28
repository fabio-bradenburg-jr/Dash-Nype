import type { AiSettings } from '@/lib/types/ai'

export interface DashboardMetricLayout {
  id: string
  metricKey: string
  size: 'sm' | 'lg'
}

export interface DashboardTemplate {
  id: string
  name: string
  metaMetricKeys: string[]
  metaCampaignTableColumnKeys: string[]
  rdMetricKeys: string[]
  sheetsMetricKeys: string[]
  metaMetricLayouts: DashboardMetricLayout[]
  rdMetricLayouts: DashboardMetricLayout[]
  sheetsMetricLayouts: DashboardMetricLayout[]
}

export interface ClientGroupRecord {
  id: string
  name: string
  clientIds: string[]
}

export type DashboardIntegrations = AiSettings & {
  metaAccessToken: string
  metaConnectionMode: string
  metaAdAccountId?: string
  googleAdsToken: string
  tiktokAdsToken: string
  linkedinAdsToken: string
  clickUpToken: string
  clickUpListIds?: string
  mondayToken: string
  mondayBoardIds?: string
  rdStationToken: string
  salesforceToken: string
  agendorToken: string
}

export interface ClientRecord {
  id: string
  name: string
  dashboardColor: string
  logoUrl: string
  metaAdAccountId: string
  googleAdsAccountId: string
  tiktokAdsAccountId: string
  linkedInAdsAccountId: string
  googleSheetsUrl: string
  googleSheetsHeaderRow: number
  googleSheetsStatusColumn: string
  rdStationAccountId: string
  rdPipelineId: string
  salesforceAccountId: string
  agendorAccountId: string
  rdQualifiedStages: string[]
  funnelSteps: string[]
  integrations: DashboardIntegrations
  dashboardTemplates: DashboardTemplate[]
  activeDashboardTemplateId: string
}

export interface DashboardPreferences {
  themeColor: string
  metric1: string
  metric2: string
  activeClientId: string
  globalIntegrations: DashboardIntegrations
  clients: ClientRecord[]
  clientGroups: ClientGroupRecord[]
}

export interface AccessContextLike {
  workspaceId?: string | null
  role?: string | null
  canManageClients?: boolean
  viewableClientIds?: string[]
  editableClientIds?: string[]
}
