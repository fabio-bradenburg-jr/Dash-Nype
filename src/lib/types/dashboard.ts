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

export interface TeamMemberOkrRecord {
  id: string
  title: string
  metric: string
  targetValue: string
  currentValue: string
  unit: string
  dueDate: string
  status: 'nao_iniciado' | 'em_andamento' | 'concluido' | 'atrasado'
}

export interface TeamMemberPdiItemRecord {
  id: string
  title: string
  competency: string
  actionPlan: string
  dueDate: string
  status: 'planejado' | 'em_andamento' | 'concluido'
  notes: string
}

export interface TeamMemberAllocationRecord {
  id: string
  clientId: string
  roleLabel: string
  weeklyHours: number
  focusLabel: string
}

export interface TeamMemberProfileRecord {
  userId: string
  positionTitle: string
  department: string
  seniority: 'junior' | 'pleno' | 'senior' | 'expert'
  employmentType: string
  directManagerName: string
  employmentStartDate: string
  monthlyCompensation: string
  weeklyCapacityHours: number
  careerTrack: string
  performanceSummary: string
  nextCareerStep: string
  okrs: TeamMemberOkrRecord[]
  pdiItems: TeamMemberPdiItemRecord[]
  allocations: TeamMemberAllocationRecord[]
}

export interface ClientOkrRecord {
  id: string
  title: string
  cadence: 'semanal' | 'quinzenal' | 'mensal' | 'trimestral' | 'quadrimestral' | 'anual' | 'ciclo'
  cycleDays: string
  completed: boolean
}

export interface ClientNoteRecord {
  id: string
  body: string
  authorName: string
  authorId: string
  createdAt: string
}

export interface ClientChecklistItemRecord {
  id: string
  label: string
  completed: boolean
}

export interface OperationCommentRecord {
  id: string
  body: string
  authorName: string
  authorId: string
  kind: 'comment' | 'activity'
  activityType: string
  mentionUserIds: string[]
  createdAt: string
}

export interface OperationSubtaskRecord {
  id: string
  title: string
  description: string
  status: string
  completed: boolean
  assigneeIds: string[]
  createdAt: string
  updatedAt: string
}

export interface OperationLaneRecord {
  id: string
  key: string
  label: string
  color: string
  defaultSubtasks: string[]
}

export interface OperationStatusRecord {
  id: string
  key: string
  label: string
  color: string
}

export interface OperationCustomFieldRecord {
  id: string
  key: string
  label: string
  type: 'text' | 'select' | 'date' | 'number'
  options: string[]
}

export interface OperationSettingsRecord {
  lanes: OperationLaneRecord[]
  statuses: OperationStatusRecord[]
  tags: string[]
  taskTypes: string[]
  customFields: OperationCustomFieldRecord[]
  autoCreateCardForNewClient: boolean
  healthRiskTargetPercent: number
}

export interface OperationCardRecord {
  id: string
  taskCode: string
  taskType: string
  clientId: string
  title: string
  content: string
  lane: string
  status: string
  priority: 'sem_prioridade' | 'baixa' | 'media' | 'alta' | 'urgente'
  startDate: string
  dueDate: string
  timeEstimateMinutes: number
  timeTrackedMinutes: number
  timeTrackerStartedAt: string
  responsible: string
  assigneeIds: string[]
  segment: string
  tier: string
  squad: string
  tags: string[]
  customFieldValues: Record<string, string>
  comments: OperationCommentRecord[]
  subtasks: OperationSubtaskRecord[]
  createdAt: string
  updatedAt: string
}

export interface ClientCustomColumnRecord {
  id: string
  key: string
  label: string
  type:
    | 'text'
    | 'long_text'
    | 'number'
    | 'currency'
    | 'percent'
    | 'date'
    | 'link'
    | 'email'
    | 'phone'
    | 'person'
    | 'progress'
    | 'checkbox'
    | 'flag'
    | 'select'
    | 'formula'
  options: string[]
  tabKey: string
  formulaExpression: string
  settings: Record<string, string>
}

export interface ClientCustomTabRecord {
  id: string
  key: string
  label: string
  columnKeys: string[]
}

export interface ClientTabOverrideRecord {
  key: string
  label: string
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
  cnpj: string
  operationEnabled: boolean
  dashboardEnabled: boolean
  dashboardVisibleIntegrationKeys: string[]
  crmProvider: string
  manualCrmSummary: Record<string, number | null>
  segment: string
  subsegment: string
  tier: string
  squad: string
  salesModel: string
  implementationPhase: string
  implementationObservation: string
  implementationChecklist: ClientChecklistItemRecord[]
  status: string
  productId: string
  product: string
  okrs: ClientOkrRecord[]
  notes: ClientNoteRecord[]
  customFieldValues: Record<string, string>
  contractSignedAt: string
  churnDate: string
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
  trafficQuality: string
  designQuality: string
  copyQuality: string
  csQuality: string
  roiAboveOne: string
  csatAboveFour: string
  npsAboveSeven: string
  stakeholderAware: string
  adAccountsHealthy: string
  crmUsageProperly: string
  clientParticipationAbove90: string
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

export interface ClientImplementationPhaseRecord {
  id: string
  label: string
  description: string
  objective: string
  checklist: string[]
  slaDays: number
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
  operationCards: OperationCardRecord[]
  operationSettings: OperationSettingsRecord
  clientImplementationPhases: ClientImplementationPhaseRecord[]
  clientSystemFields: ClientCustomColumnRecord[]
  clientCustomColumns: ClientCustomColumnRecord[]
  clientCustomTabs: ClientCustomTabRecord[]
  clientTabOverrides: ClientTabOverrideRecord[]
  teamProfiles: TeamMemberProfileRecord[]
}

export interface AccessContextLike {
  workspaceId?: string | null
  role?: string | null
  profile?: { id?: string | null } | null
  canManageClients?: boolean
  canManageUsers?: boolean
  canEditIntegrations?: boolean
  viewableClientIds?: string[]
  editableClientIds?: string[]
}
