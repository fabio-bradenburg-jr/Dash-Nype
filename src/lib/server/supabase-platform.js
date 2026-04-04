import 'server-only'

import { createAdminClient } from '@/lib/server/supabase-admin'

const DEFAULT_TENANT_SLUG = process.env.PLATFORM_TENANT_ID ?? 'agency-hub'

function sumNumeric(rows, key) {
  return rows.reduce((total, row) => total + Number(row?.[key] ?? 0), 0)
}

function normalizeRiskClient(client, alertsByClientId, healthByClientId, churnByClientId) {
  const alerts = alertsByClientId.get(client.id) ?? []
  const health = healthByClientId.get(client.id)
  const churn = churnByClientId.get(client.id)

  return {
    id: client.id,
    name: client.name,
    companyName: client.companyName,
    status: client.status,
    healthScore: health?.score ?? undefined,
    churnScore: churn?.score ?? undefined,
    alerts: alerts.map((alert) => ({
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
    })),
  }
}

async function getTenantId(adminSupabase) {
  const { data, error } = await adminSupabase
    .from('Tenant')
    .select('id, slug')
    .eq('slug', DEFAULT_TENANT_SLUG)
    .limit(1)
    .maybeSingle()

  if (error) throw error

  return data?.id ?? null
}

async function fetchLatestMetricMap(adminSupabase, table, tenantClientIds, columns) {
  if (!tenantClientIds.length) return new Map()

  const { data, error } = await adminSupabase
    .from(table)
    .select(columns)
    .in('clientId', tenantClientIds)
    .order('referenceDate', { ascending: false })

  if (error) throw error

  const map = new Map()
  for (const row of data ?? []) {
    if (!map.has(row.clientId)) {
      map.set(row.clientId, row)
    }
  }
  return map
}

export async function getSupabaseHomeOverview() {
  const adminSupabase = createAdminClient()
  const tenantId = await getTenantId(adminSupabase)

  if (!tenantId) return null

  const [{ count: clientsCount, error: clientsCountError }, { count: unresolvedAlerts, error: unresolvedAlertsError }, { count: activeTasks, error: activeTasksError }, clientsResponse] =
    await Promise.all([
      adminSupabase.from('Client').select('*', { count: 'exact', head: true }).eq('tenantId', tenantId),
      adminSupabase
        .from('Alert')
        .select('id, clientId', { count: 'exact', head: true })
        .eq('isResolved', false),
      adminSupabase
        .from('Task')
        .select('id', { count: 'exact', head: true })
        .eq('tenantId', tenantId)
        .in('status', ['OPEN', 'IN_PROGRESS', 'BLOCKED']),
      adminSupabase
        .from('Client')
        .select('id, name, companyName, status, manuallyFlaggedAtRisk')
        .eq('tenantId', tenantId)
        .order('updatedAt', { ascending: false }),
    ])

  if (clientsCountError) throw clientsCountError
  if (unresolvedAlertsError) throw unresolvedAlertsError
  if (activeTasksError) throw activeTasksError
  if (clientsResponse.error) throw clientsResponse.error

  const clients = clientsResponse.data ?? []
  const clientIds = clients.map((client) => client.id)
  const [alertsResponse, healthByClientId, churnByClientId] = await Promise.all([
    clientIds.length
      ? adminSupabase
          .from('Alert')
          .select('id, clientId, type, severity, title, description, isResolved')
          .in('clientId', clientIds)
          .eq('isResolved', false)
          .order('createdAt', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    fetchLatestMetricMap(adminSupabase, 'HealthMetric', clientIds, 'clientId, score, band, referenceDate'),
    fetchLatestMetricMap(adminSupabase, 'ChurnMetric', clientIds, 'clientId, score, band, referenceDate'),
  ])

  if (alertsResponse.error) throw alertsResponse.error

  const alertsByClientId = new Map()
  for (const alert of alertsResponse.data ?? []) {
    const bucket = alertsByClientId.get(alert.clientId) ?? []
    bucket.push(alert)
    alertsByClientId.set(alert.clientId, bucket)
  }

  const riskClients = clients
    .filter((client) => {
      const churn = churnByClientId.get(client.id)
      const health = healthByClientId.get(client.id)
      return (
        client.status === 'AT_RISK' ||
        client.manuallyFlaggedAtRisk ||
        (churn?.score ?? 0) >= 31 ||
        (health?.score ?? 100) < 60
      )
    })
    .slice(0, 5)
    .map((client) => normalizeRiskClient(client, alertsByClientId, healthByClientId, churnByClientId))

  return {
    clientsCount: clientsCount ?? 0,
    unresolvedAlerts: unresolvedAlerts ?? 0,
    activeTasks: activeTasks ?? 0,
    riskClients,
  }
}

export async function getSupabaseExecutiveOverview() {
  const adminSupabase = createAdminClient()
  const tenantId = await getTenantId(adminSupabase)

  if (!tenantId) return null

  const { data: clients, error: clientsError } = await adminSupabase
    .from('Client')
    .select('id, name, companyName, ownerName, ownerEmail, cnpj, status')
    .eq('tenantId', tenantId)
    .order('updatedAt', { ascending: false })

  if (clientsError) throw clientsError

  const clientIds = (clients ?? []).map((client) => client.id)
  const [financialRowsResponse, performanceByClientId, healthByClientId, churnByClientId] = await Promise.all([
    clientIds.length
      ? adminSupabase.from('FinancialMetric').select('clientId, revenue, investment, fee').in('clientId', clientIds)
      : Promise.resolve({ data: [], error: null }),
    fetchLatestMetricMap(adminSupabase, 'PerformanceMetric', clientIds, 'clientId, roi, referenceDate'),
    fetchLatestMetricMap(adminSupabase, 'HealthMetric', clientIds, 'clientId, score, band, referenceDate'),
    fetchLatestMetricMap(adminSupabase, 'ChurnMetric', clientIds, 'clientId, score, band, referenceDate'),
  ])

  if (financialRowsResponse.error) throw financialRowsResponse.error

  const financialRows = financialRowsResponse.data ?? []
  const totalRevenue = sumNumeric(financialRows, 'revenue')
  const totalInvestment = sumNumeric(financialRows, 'investment')
  const totalFee = sumNumeric(financialRows, 'fee')

  let averageRoi = 0
  if (clientIds.length) {
    averageRoi =
      clientIds.reduce((total, clientId) => total + Number(performanceByClientId.get(clientId)?.roi ?? 0), 0) / clientIds.length
  }

  const highRisk = clientIds.reduce((total, clientId) => total + (Number(churnByClientId.get(clientId)?.score ?? 0) > 60 ? 1 : 0), 0)

  const normalizedClients = (clients ?? []).map((client) => {
    const performance = performanceByClientId.get(client.id)
    const health = healthByClientId.get(client.id)
    const churn = churnByClientId.get(client.id)

    return {
      id: client.id,
      name: client.name,
      companyName: client.companyName,
      ownerName: client.ownerName ?? null,
      ownerEmail: client.ownerEmail ?? null,
      cnpj: client.cnpj ?? null,
      status: client.status,
      latestRoi: performance?.roi ?? null,
      latestHealthScore: health?.score ?? null,
      latestHealthBand: health?.band ?? null,
      latestChurnScore: churn?.score ?? null,
      latestChurnBand: churn?.band ?? null,
    }
  })

  return {
    totals: {
      revenue: totalRevenue,
      investment: totalInvestment,
      fee: totalFee,
      averageRoi: Number(averageRoi.toFixed(2)),
      highRisk,
    },
    clients: normalizedClients,
  }
}

export async function getSupabaseClientDetail(clientId) {
  const adminSupabase = createAdminClient()
  const tenantId = await getTenantId(adminSupabase)

  if (!tenantId || !clientId) return null

  const { data: client, error: clientError } = await adminSupabase
    .from('Client')
    .select('id, name, companyName, ownerName, ownerEmail, cnpj, status, goals, history, createdAt')
    .eq('tenantId', tenantId)
    .eq('id', clientId)
    .maybeSingle()

  if (clientError) throw clientError
  if (!client) return null

  const [
    financialResponse,
    performanceResponse,
    engagementResponse,
    operationalResponse,
    qualityResponse,
    healthResponse,
    churnResponse,
    integrationsResponse,
    alertsResponse,
    tasksResponse,
  ] = await Promise.all([
    adminSupabase.from('FinancialMetric').select('fee, ltv, investment, revenue, marginPercent, referenceDate').eq('clientId', clientId).order('referenceDate', { ascending: false }).limit(1).maybeSingle(),
    adminSupabase.from('PerformanceMetric').select('roi, roiWithoutFee, mmf, referenceDate').eq('clientId', clientId).order('referenceDate', { ascending: false }).limit(1).maybeSingle(),
    adminSupabase.from('EngagementMetric').select('meetingAttendanceRate, crmUsageRate, stakeholderAlignmentScore, referenceDate').eq('clientId', clientId).order('referenceDate', { ascending: false }).limit(1).maybeSingle(),
    adminSupabase.from('OperationalMetric').select('tasksOpen, tasksLate, averageResolutionHours, productivityIndex, referenceDate').eq('clientId', clientId).order('referenceDate', { ascending: false }).limit(1).maybeSingle(),
    adminSupabase.from('QualityMetric').select('csat, nps, referenceDate').eq('clientId', clientId).order('referenceDate', { ascending: false }).limit(1).maybeSingle(),
    adminSupabase.from('HealthMetric').select('score, band, referenceDate').eq('clientId', clientId).order('referenceDate', { ascending: false }).limit(1).maybeSingle(),
    adminSupabase.from('ChurnMetric').select('score, band, referenceDate').eq('clientId', clientId).order('referenceDate', { ascending: false }).limit(1).maybeSingle(),
    adminSupabase.from('Integration').select('provider, status, externalAccountId').eq('tenantId', tenantId).eq('clientId', clientId).order('updatedAt', { ascending: false }),
    adminSupabase.from('Alert').select('id, type, severity, title, description').eq('clientId', clientId).eq('isResolved', false).order('createdAt', { ascending: false }).limit(6),
    adminSupabase.from('Task').select('id, title, description, priority, status, dueDate').eq('tenantId', tenantId).eq('clientId', clientId).order('updatedAt', { ascending: false }).limit(8),
  ])

  if (financialResponse.error) throw financialResponse.error
  if (performanceResponse.error) throw performanceResponse.error
  if (engagementResponse.error) throw engagementResponse.error
  if (operationalResponse.error) throw operationalResponse.error
  if (qualityResponse.error) throw qualityResponse.error
  if (healthResponse.error) throw healthResponse.error
  if (churnResponse.error) throw churnResponse.error
  if (integrationsResponse.error) throw integrationsResponse.error
  if (alertsResponse.error) throw alertsResponse.error
  if (tasksResponse.error) throw tasksResponse.error

  const financial = financialResponse.data
  const performance = performanceResponse.data
  const engagement = engagementResponse.data
  const operational = operationalResponse.data
  const quality = qualityResponse.data
  const health = healthResponse.data
  const churn = churnResponse.data

  return {
    client: {
      id: client.id,
      name: client.name,
      companyName: client.companyName,
      ownerName: client.ownerName ?? null,
      ownerEmail: client.ownerEmail ?? null,
      cnpj: client.cnpj ?? null,
      status: client.status,
      createdAt: client.createdAt ?? null,
    },
    metrics: {
      fee: Number(financial?.fee ?? 0),
      ltv: Number(financial?.ltv ?? 0),
      investment: Number(financial?.investment ?? 0),
      revenue: Number(financial?.revenue ?? 0),
      marginPercent: Number(financial?.marginPercent ?? 0),
      roi: Number(performance?.roi ?? 0),
      roiWithoutFee: Number(performance?.roiWithoutFee ?? 0),
      mmf: Number(performance?.mmf ?? 0),
      healthScore: Number(health?.score ?? 0),
      healthBand: health?.band ?? 'UNKNOWN',
      churnScore: Number(churn?.score ?? 0),
      churnBand: churn?.band ?? 'UNKNOWN',
      meetingAttendanceRate: Number(engagement?.meetingAttendanceRate ?? 0),
      crmUsageRate: Number(engagement?.crmUsageRate ?? 0),
      stakeholderAlignmentScore: Number(engagement?.stakeholderAlignmentScore ?? 0),
      tasksOpen: Number(operational?.tasksOpen ?? 0),
      tasksLate: Number(operational?.tasksLate ?? 0),
      averageResolutionHours: Number(operational?.averageResolutionHours ?? 0),
      productivityIndex: Number(operational?.productivityIndex ?? 0),
      csat: Number(quality?.csat ?? 0),
      nps: Number(quality?.nps ?? 0),
    },
    integrations: (integrationsResponse.data ?? []).map((integration) => ({
      provider: integration.provider,
      status: integration.status,
      externalAccountId: integration.externalAccountId ?? null,
    })),
    alerts: (alertsResponse.data ?? []).map((alert) => ({
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
    })),
    tasks: (tasksResponse.data ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate,
      clientName: client.name,
    })),
  }
}

function mapPriorityTone(priority) {
  if (priority === 'URGENT' || priority === 'HIGH') return '#ba1a1a'
  if (priority === 'MEDIUM') return '#d97706'
  return '#00864d'
}

function relativeTimeLabel(input) {
  if (!input) return 'No date'
  const date = new Date(input)
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000))
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} h ago`
  const diffDays = Math.round(diffHours / 24)
  return `${diffDays} d ago`
}

export async function getSupabaseOperationsOverview() {
  const adminSupabase = createAdminClient()
  const tenantId = await getTenantId(adminSupabase)

  if (!tenantId) return null

  const [tasksResponse, teamMembersResponse] = await Promise.all([
    adminSupabase
      .from('Task')
      .select('id, title, description, priority, status, dueDate, createdAt, updatedAt, clientId, Client(name)')
      .eq('tenantId', tenantId)
      .order('updatedAt', { ascending: false }),
    adminSupabase
      .from('TeamMember')
      .select('id, fullName, role, performanceScore')
      .eq('tenantId', tenantId)
      .order('performanceScore', { ascending: false }),
  ])

  if (tasksResponse.error) throw tasksResponse.error
  if (teamMembersResponse.error) throw teamMembersResponse.error

  const tasks = tasksResponse.data ?? []
  const teamMembers = teamMembersResponse.data ?? []

  const activeDemands = tasks.filter((task) => ['OPEN', 'IN_PROGRESS', 'BLOCKED'].includes(task.status)).length
  const criticalDemands = tasks.filter((task) => task.priority === 'URGENT').length
  const warningDemands = tasks.filter((task) => task.priority === 'HIGH' || task.priority === 'MEDIUM').length
  const healthyDemands = tasks.filter((task) => task.priority === 'LOW').length
  const completedTasks = tasks.filter((task) => task.status === 'DONE').length
  const averagePerformance =
    teamMembers.length > 0 ? teamMembers.reduce((total, member) => total + Number(member.performanceScore ?? 0), 0) / teamMembers.length : 84.2

  return {
    totals: {
      activeDemands,
      criticalDemands,
      warningDemands,
      healthyDemands,
      teamMembers: teamMembers.length,
      completedTasks,
      productivityVelocity: Number(averagePerformance.toFixed(1)),
    },
    teamMembers: teamMembers.map((member) => ({
      id: member.id,
      fullName: member.fullName,
      role: member.role,
      performanceScore: Number(member.performanceScore ?? 0),
    })),
    tasks: tasks
      .filter((task) => ['OPEN', 'IN_PROGRESS', 'BLOCKED'].includes(task.status))
      .slice(0, 6)
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate,
        clientName: task.Client?.name ?? null,
      })),
    recentActivity: tasks.slice(0, 4).map((task) => ({
      tone: mapPriorityTone(task.priority),
      text: `${task.title}${task.Client?.name ? ` · ${task.Client.name}` : ''}`,
      time: relativeTimeLabel(task.updatedAt || task.createdAt),
    })),
  }
}
