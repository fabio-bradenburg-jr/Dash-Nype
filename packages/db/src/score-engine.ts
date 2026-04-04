import {
  AlertSeverity,
  AlertType,
  type ChurnScoreResult,
  type ClientInsightPayload,
  type ClientSignalInput,
  type HealthScoreResult,
} from './contracts'

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

function normalizeIndex(value: number) {
  return clamp(Math.round(value))
}

export function calculateHealthScore(input: ClientSignalInput): HealthScoreResult {
  const breakdown = {
    performance: normalizeIndex(input.performanceIndex) * 0.3,
    financial: normalizeIndex(input.financialIndex) * 0.25,
    engagement: normalizeIndex(input.engagementIndex) * 0.2,
    operational: normalizeIndex(input.operationalIndex) * 0.15,
    quality: normalizeIndex(input.qualityIndex) * 0.1,
  }

  const score = clamp(
    Math.round(
      breakdown.performance +
        breakdown.financial +
        breakdown.engagement +
        breakdown.operational +
        breakdown.quality
    )
  )

  const band = score >= 80 ? 'HEALTHY' : score >= 60 ? 'ATTENTION' : 'RISK'

  return { score, band, breakdown }
}

export function calculateChurnScore(input: ClientSignalInput): ChurnScoreResult {
  let score = 0
  const reasons: string[] = []

  if (input.roi < 1) {
    score += 30
    reasons.push('ROI abaixo de 1')
  }

  if (input.roiPrevious != null && input.roi < input.roiPrevious) {
    score += 20
    reasons.push('ROI em queda')
  }

  if (input.meetingAttendanceRate < 70) {
    score += 20
    reasons.push('Baixa participação em reuniões')
  }

  if (input.crmUsageRate < 60) {
    score += 15
    reasons.push('Uso insuficiente do CRM')
  }

  if (input.stakeholderAlignmentScore < 60) {
    score += 15
    reasons.push('Stakeholder desalinhado')
  }

  if (input.totalTasks > 0 && input.delayedTasks / input.totalTasks > 0.25) {
    score += 15
    reasons.push('Tarefas atrasadas acima do aceitável')
  }

  if (input.csat < 4) {
    score += 20
    reasons.push('CSAT abaixo de 4')
  }

  if (input.nps < 7) {
    score += 20
    reasons.push('NPS abaixo de 7')
  }

  if (input.marginPercent < 20) {
    score += 10
    reasons.push('Margem abaixo de 20%')
  }

  if (input.manuallyFlaggedAtRisk) {
    score += 15
    reasons.push('Risco marcado manualmente')
  }

  const band = score <= 30 ? 'LOW' : score <= 60 ? 'MEDIUM' : 'HIGH'

  return {
    score: clamp(score),
    band,
    reasons,
  }
}

export function generateAlerts(input: ClientSignalInput) {
  const alerts: ClientInsightPayload['alerts'] = []

  if (input.roi < 1) {
    alerts.push({
      type: AlertType.LOW_ROI,
      severity: AlertSeverity.HIGH,
      message: 'ROI abaixo do ponto de equilíbrio.',
    })
  }

  if (input.roiPrevious != null && input.roi < input.roiPrevious) {
    alerts.push({
      type: AlertType.PERFORMANCE_DROP,
      severity: AlertSeverity.MEDIUM,
      message: 'Queda recente de performance identificada.',
    })
  }

  if (input.meetingAttendanceRate < 70 || input.crmUsageRate < 60) {
    alerts.push({
      type: AlertType.CLIENT_DISENGAGED,
      severity: AlertSeverity.MEDIUM,
      message: 'Sinais de desengajamento do cliente.',
    })
  }

  if (input.totalTasks > 0 && input.delayedTasks / input.totalTasks > 0.25) {
    alerts.push({
      type: AlertType.OPERATIONAL_BOTTLENECK,
      severity: AlertSeverity.HIGH,
      message: 'Backlog operacional acima do limite.',
    })
  }

  if (input.marginPercent < 20) {
    alerts.push({
      type: AlertType.LOW_MARGIN,
      severity: AlertSeverity.HIGH,
      message: 'Margem operacional ruim para o contrato atual.',
    })
  }

  if (input.manuallyFlaggedAtRisk) {
    alerts.push({
      type: AlertType.MANUAL_RISK,
      severity: AlertSeverity.CRITICAL,
      message: 'Time marcou risco manualmente.',
    })
  }

  return alerts
}

export function buildClientInsight(clientId: string, clientName: string, input: ClientSignalInput): ClientInsightPayload {
  const health = calculateHealthScore(input)
  const churn = calculateChurnScore(input)
  const alerts = generateAlerts(input)

  return {
    clientId,
    clientName,
    health,
    churn,
    alerts,
  }
}
