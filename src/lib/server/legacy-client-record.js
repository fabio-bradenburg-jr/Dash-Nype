export function buildLegacyClientRecordFromDetail(detail) {
  if (!detail) return null

  return {
    id: detail.client.id,
    name: detail.client.name,
    cnpj: detail.client.cnpj || '',
    status: normalizeLegacyStatus(detail.client.status),
    contractSignedAt: toDateInput(detail.client.createdAt),
    startDate: toDateInput(detail.client.createdAt),
    fee: stringifyMoney(detail.metrics.fee),
    monthlyRevenue: stringifyMoney(detail.metrics.revenue),
    mediaInvestment: stringifyMoney(detail.metrics.investment),
    ltv: stringifyMoney(detail.metrics.ltv),
    contributionMarginPercent: stringifyPercent(detail.metrics.marginPercent),
    profitMarginPercent: stringifyPercent(detail.metrics.marginPercent),
    mmf: stringifyNumber(detail.metrics.mmf),
    roiMarketing: stringifyNumber(detail.metrics.roi),
    projectManager: detail.client.ownerName || '',
    csOwner: detail.client.ownerName || '',
    step: detail.metrics.healthBand || detail.metrics.churnBand || '',
    implementationObservation: buildImplementationObservation(detail),
    stakeholderAware: toBinaryAnswer(
      detail.metrics.stakeholderAlignmentScore,
      70
    ),
    roiAboveOne: detail.metrics.roi >= 1 ? 'Sim' : 'Não',
    csatAboveFour: toBinaryAnswer(detail.metrics.csat, 4),
    npsAboveSeven: toBinaryAnswer(detail.metrics.nps, 7),
    adAccountsHealthy: hasConnectedMediaSource(detail.integrations) ? 'Sim' : '',
    crmUsageProperly: toBinaryAnswer(detail.metrics.crmUsageRate, 0.6),
    clientParticipationAbove90: toBinaryAnswer(
      detail.metrics.meetingAttendanceRate,
      0.9
    ),
    organicDemands: String(Math.max(detail.metrics.tasksOpen - detail.metrics.tasksLate, 0)),
    trafficDemands: String(detail.metrics.tasksLate),
    totalDemands: String(detail.metrics.tasksOpen),
    dashboardUrl: `/clientes/${detail.client.id}`,
    driveUrl: detail.client.ownerEmail ? `mailto:${detail.client.ownerEmail}` : '',
    metaAdAccountId: resolveIntegrationAccountId(detail.integrations, 'META_ADS'),
    googleAdsAccountId: resolveIntegrationAccountId(detail.integrations, 'GOOGLE_ADS'),
    linkedInAdsAccountId: resolveIntegrationAccountId(detail.integrations, 'LINKEDIN_ADS'),
    rdStationAccountId: resolveIntegrationAccountId(detail.integrations, 'AGENDOR'),
    notes: buildClientNotes(detail),
    dashboardEnabled: true,
    operationEnabled: true,
  }
}

function normalizeLegacyStatus(status) {
  if (status === 'ACTIVE') return 'Ativo'
  if (status === 'ONBOARDING') return 'Onboarding'
  if (status === 'PAUSED') return 'Pausado'
  if (status === 'AT_RISK') return 'Risco'
  if (status === 'CHURNED') return 'Churn'
  return 'Ativo'
}

function stringifyMoney(value) {
  return Number(value || 0).toFixed(0)
}

function stringifyPercent(value) {
  return Number(value || 0).toFixed(1)
}

function stringifyNumber(value) {
  return Number(value || 0).toFixed(2)
}

function toDateInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function toBinaryAnswer(value, threshold) {
  if (value >= threshold) return 'Sim'
  if (value > 0) return 'Não'
  return ''
}

function buildImplementationObservation(detail) {
  const chunks = [
    detail.metrics.healthBand ? `Health ${detail.metrics.healthBand}` : '',
    detail.metrics.churnBand ? `Churn ${detail.metrics.churnBand}` : '',
    detail.metrics.tasksLate > 0 ? `${detail.metrics.tasksLate} task(s) late` : '',
    detail.alerts.length ? `${detail.alerts.length} active alert(s)` : '',
  ].filter(Boolean)

  return chunks.join(' | ')
}

function buildClientNotes(detail) {
  const now = new Date().toISOString()
  const alertNotes = detail.alerts.slice(0, 4).map((alert, index) => ({
    id: `alert-${alert.id || index}`,
    body: `[${alert.severity}] ${alert.title || alert.type}: ${alert.description}`,
    authorName: 'Assessoria LP AI',
    authorId: 'platform-ai',
    createdAt: now,
  }))

  const taskNotes = detail.tasks.slice(0, 3).map((task, index) => ({
    id: `task-${task.id || index}`,
    body: `Task ${normalizeTaskStatus(task.status)}: ${task.title}${task.dueDate ? ` | due ${toDateInput(task.dueDate)}` : ''}`,
    authorName: 'Assessoria LP Ops',
    authorId: 'platform-ops',
    createdAt: now,
  }))

  return [...alertNotes, ...taskNotes]
}

function normalizeTaskStatus(status) {
  if (status === 'OPEN') return 'open'
  if (status === 'IN_PROGRESS') return 'in progress'
  if (status === 'BLOCKED') return 'blocked'
  if (status === 'DONE') return 'done'
  return String(status || '').toLowerCase()
}

function hasConnectedMediaSource(integrations) {
  return integrations.some(
    (integration) =>
      ['META_ADS', 'GOOGLE_ADS', 'LINKEDIN_ADS'].includes(integration.provider) &&
      integration.status === 'CONNECTED'
  )
}

function resolveIntegrationAccountId(integrations, provider) {
  const integration = integrations.find(
    (item) => item.provider === provider && item.status === 'CONNECTED'
  )
  return integration?.externalAccountId || (integration ? `${provider.toLowerCase()}-connected` : '')
}
