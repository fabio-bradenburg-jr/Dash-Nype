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

export interface ProductRecord {
  id: string
  name: string
  description: string
  status: string
}

export interface ClientCustomColumnRecord {
  id: string
  key: string
  label: string
  type: 'text' | 'number' | 'currency' | 'percent' | 'date' | 'link' | 'flag'
}

export interface ClientCustomTabRecord {
  id: string
  key: string
  label: string
  columnKeys: string[]
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
  status: string
  productId: string
  product: string
  customFieldValues: Record<string, string>
  contractSignedAt: string
  contractUrl: string
  startDate: string
  fee: string
  mediaInvestment: string
  monthlyRevenue: string
  step: string
  ltv: string
  contributionMarginAmount: string
  contributionMarginPercent: string
  profitMarginAmount: string
  profitMarginPercent: string
  mmf: string
  roiMarketing: string
  dashboardUrl: string
  driveUrl: string
  eapUrl: string
  brandManualUrl: string
  moodboardUrl: string
  salesNarrativeUrl: string
  drawflowUrl: string
  projectManager: string
  trafficManager: string
  designer: string
  csOwner: string
  copyOwner: string
  organicDemands: string
  trafficDemands: string
  totalDemands: string
  financialFlag: string
  roiFlag: string
  healthScoreFlag: string
  deliverablesFlag: string
  crmUsageFlag: string
  csAttendanceFlag: string
  csatFlag: string
  clientParticipationFlag: string
  adAccountsFlag: string
  npsFlag: string
  stakeholderFlag: string
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
  products: ProductRecord[]
  clientCustomColumns: ClientCustomColumnRecord[]
  clientCustomTabs: ClientCustomTabRecord[]
}

export interface AccessContextLike {
  workspaceId?: string | null
  role?: string | null
  canManageClients?: boolean
  viewableClientIds?: string[]
  editableClientIds?: string[]
}
