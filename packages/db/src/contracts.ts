export enum UserRole {
  MASTER = 'MASTER',
  USER = 'USER',
  VIEWER = 'VIEWER',
  CLIENT = 'CLIENT',
}

export enum ClientStatus {
  ACTIVE = 'ACTIVE',
  ONBOARDING = 'ONBOARDING',
  PAUSED = 'PAUSED',
  AT_RISK = 'AT_RISK',
  CHURNED = 'CHURNED',
}

export enum AlertSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum AlertType {
  LOW_ROI = 'LOW_ROI',
  PERFORMANCE_DROP = 'PERFORMANCE_DROP',
  CLIENT_DISENGAGED = 'CLIENT_DISENGAGED',
  OPERATIONAL_BOTTLENECK = 'OPERATIONAL_BOTTLENECK',
  LOW_MARGIN = 'LOW_MARGIN',
  MANUAL_RISK = 'MANUAL_RISK',
}

export enum DashboardKey {
  HOME = 'HOME',
  GENERAL = 'GENERAL',
  CLIENT = 'CLIENT',
  EXECUTIVE = 'EXECUTIVE',
  OPERATIONS = 'OPERATIONS',
}

export enum IntegrationProvider {
  META_ADS = 'META_ADS',
  GOOGLE_ADS = 'GOOGLE_ADS',
  LINKEDIN_ADS = 'LINKEDIN_ADS',
  AGENDOR = 'AGENDOR',
  MONDAY = 'MONDAY',
}

export type ScoreBand = 'HEALTHY' | 'ATTENTION' | 'RISK'
export type ChurnBand = 'LOW' | 'MEDIUM' | 'HIGH'

export type ClientSignalInput = {
  roi: number
  roiPrevious?: number | null
  roiWithoutFee?: number | null
  marginPercent: number
  meetingAttendanceRate: number
  crmUsageRate: number
  stakeholderAlignmentScore: number
  delayedTasks: number
  totalTasks: number
  csat: number
  nps: number
  performanceIndex: number
  financialIndex: number
  engagementIndex: number
  operationalIndex: number
  qualityIndex: number
  manuallyFlaggedAtRisk?: boolean
}

export type HealthScoreResult = {
  score: number
  band: ScoreBand
  breakdown: {
    performance: number
    financial: number
    engagement: number
    operational: number
    quality: number
  }
}

export type ChurnScoreResult = {
  score: number
  band: ChurnBand
  reasons: string[]
}

export type ClientInsightPayload = {
  clientId: string
  clientName: string
  health: HealthScoreResult
  churn: ChurnScoreResult
  alerts: Array<{
    type: AlertType
    severity: AlertSeverity
    message: string
  }>
}
