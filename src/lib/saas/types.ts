export type ThemeSettings = {
  primaryColor: string
  accentColor: string
  backgroundColor: string
  darkMode: boolean
}

export type MetricCard = {
  label: string
  value: number
  change: number
  format: 'currency' | 'number' | 'percent' | 'ratio'
}

export type ObjectivePerformance = {
  objective: string
  volume: number
  cost_per_result: number
}

export type TimeSeriesPoint = {
  date: string
  spend: number
  conversions: number
  roas: number
}

export type FunnelStage = {
  stage_name: string
  volume: number
  conversion_rate: number | null
}

export type CampaignRow = {
  campaign_name: string
  status: string
  spend: number
  conversions: number
  cpa: number
  roas: number
  source: string
}

export type ClientSummary = {
  id: string
  tenant_id: string
  name: string
  company: string
  niche: string
  average_ticket: number
  main_goal: string
  ltv: number
  start_date: string
  status: string
  target_roas: number
  business_data: Record<string, unknown>
  last_sync_at: string | null
}

export type KnowledgeSourceType =
  | 'google_drive_folder'
  | 'google_sheets'
  | 'google_docs'
  | 'link'

export type KnowledgeSource = {
  id: string
  type: KnowledgeSourceType
  title: string
  url: string
  notes?: string
}

export type ClientDashboard = {
  overview_metrics: MetricCard[]
  results_by_objective: ObjectivePerformance[]
  time_series: TimeSeriesPoint[]
  top_cities: Array<{ city: string; value: number }>
  top_creatives: Array<{ creative: string; roas: number }>
  age_performance: Array<{ range: string; roas: number }>
  funnel: FunnelStage[]
  campaigns: CampaignRow[]
}

export type PlatformSnapshot = {
  theme: ThemeSettings
  clients: ClientSummary[]
  selectedClient: ClientSummary
  clientDashboard: ClientDashboard
  integrations: Array<{
    id: string
    client_id: string
    provider: string
    status: string
    account_name: string
    external_account_id: string
    last_sync_at: string | null
  }>
}

export type ClientContextBundle = {
  client: ClientSummary
  clientDashboard: ClientDashboard
  integrations: PlatformSnapshot['integrations']
}
