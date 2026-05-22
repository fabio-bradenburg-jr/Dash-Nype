export type PlatformAlert = {
  id?: string
  type: string
  severity: string
  title?: string
  description: string
}

export type PlatformRiskClient = {
  id: string
  name: string
  companyName: string
  status: string
  healthScore?: number
  churnScore?: number
  alerts: PlatformAlert[]
}

export type HomeOverviewResponse = {
  clientsCount: number
  unresolvedAlerts: number
  activeTasks: number
  riskClients: PlatformRiskClient[]
}

export type ExecutiveOverviewResponse = {
  totals: {
    revenue: number
    investment: number
    fee: number
    averageRoi: number
    highRisk: number
  }
  clients?: PlatformClientTableRow[]
}

export type PlatformClientTableRow = {
  id: string
  name: string
  companyName: string
  ownerName: string | null
  ownerEmail: string | null
  cnpj: string | null
  status: string
  latestRoi: number | null
  latestHealthScore: number | null
  latestHealthBand: string | null
  latestChurnScore: number | null
  latestChurnBand: string | null
}

export type PlatformTeamMember = {
  id: string
  fullName: string
  role: string
  performanceScore: number
}

export type PlatformTaskRow = {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  dueDate: string | null
  clientName: string | null
}

export type OperationsOverviewResponse = {
  totals: {
    activeDemands: number
    criticalDemands: number
    warningDemands: number
    healthyDemands: number
    teamMembers: number
    completedTasks: number
    productivityVelocity: number
  }
  teamMembers: PlatformTeamMember[]
  tasks: PlatformTaskRow[]
  recentActivity: Array<{
    tone: string
    text: string
    time: string
  }>
}

export type ClientDetailResponse = {
  client: {
    id: string
    name: string
    companyName: string
    ownerName: string | null
    ownerEmail: string | null
    cnpj: string | null
    status: string
    createdAt?: string | null
  }
  metrics: {
    fee: number
    ltv: number
    investment: number
    revenue: number
    marginPercent: number
    roi: number
    roiWithoutFee: number
    mmf: number
    healthScore: number
    healthBand: string
    churnScore: number
    churnBand: string
    meetingAttendanceRate: number
    crmUsageRate: number
    stakeholderAlignmentScore: number
    tasksOpen: number
    tasksLate: number
    averageResolutionHours: number
    productivityIndex: number
    csat: number
    nps: number
  }
  integrations: Array<{
    provider: string
    status: string
    externalAccountId: string | null
  }>
  alerts: PlatformAlert[]
  tasks: PlatformTaskRow[]
}
