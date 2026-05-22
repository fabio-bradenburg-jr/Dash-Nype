import { PrismaClient, UserRole, ClientStatus, AlertSeverity, AlertType, DashboardKey, IntegrationProvider, IntegrationStatus, TaskPriority, TaskStatus } from '@prisma/client'
import { buildClientInsight } from '../src/score-engine'

const prisma = new PrismaClient()

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'agency-hub' },
    update: {},
    create: {
      name: 'Agency Hub',
      slug: 'agency-hub',
      themePreference: 'light',
    },
  })

  const masterUser = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: 'master@agencyhub.ai',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'master@agencyhub.ai',
      fullName: 'Master User',
      passwordHash: '$2b$10$placeholder.hash.for.local.development',
      role: UserRole.MASTER,
    },
  })

  await prisma.dashboardAccess.createMany({
    data: Object.values(DashboardKey).map((dashboard) => ({
      tenantId: tenant.id,
      userId: masterUser.id,
      dashboard,
      canRead: true,
      canEdit: true,
    })),
    skipDuplicates: true,
  })

  const client = await prisma.client.create({
    data: {
      tenantId: tenant.id,
      name: 'Nebula Systems',
      companyName: 'Nebula Systems LTDA',
      ownerName: 'Elena Rossi',
      ownerEmail: 'elena@nebula.com',
      cnpj: '12.345.678/0001-10',
      status: ClientStatus.AT_RISK,
      goals: {
        roi: 3,
        margin: 25,
      },
      history: {
        segment: 'Enterprise SaaS',
      },
      manuallyFlaggedAtRisk: true,
    },
  })

  const referenceDate = new Date('2026-04-01T00:00:00.000Z')

  await prisma.financialMetric.create({
    data: {
      clientId: client.id,
      referenceDate,
      fee: 12000,
      ltv: 428500,
      investment: 84200,
      revenue: 97600,
      marginPercent: 18.4,
    },
  })

  await prisma.performanceMetric.create({
    data: {
      clientId: client.id,
      referenceDate,
      roi: 0.8,
      roiWithoutFee: 0.65,
      mmf: 1.4,
      spend: 84200,
      conversions: 124,
    },
  })

  await prisma.engagementMetric.create({
    data: {
      clientId: client.id,
      referenceDate,
      meetingAttendanceRate: 52,
      crmUsageRate: 40,
      stakeholderAlignmentScore: 45,
    },
  })

  await prisma.operationalMetric.create({
    data: {
      clientId: client.id,
      referenceDate,
      tasksOpen: 17,
      tasksLate: 8,
      averageResolutionHours: 33,
      productivityIndex: 58,
    },
  })

  await prisma.qualityMetric.create({
    data: {
      clientId: client.id,
      referenceDate,
      csat: 3.7,
      nps: 6.4,
    },
  })

  const insight = buildClientInsight(client.id, client.name, {
    roi: 0.8,
    roiPrevious: 1.4,
    roiWithoutFee: 0.65,
    marginPercent: 18.4,
    meetingAttendanceRate: 52,
    crmUsageRate: 40,
    stakeholderAlignmentScore: 45,
    delayedTasks: 8,
    totalTasks: 17,
    csat: 3.7,
    nps: 6.4,
    performanceIndex: 38,
    financialIndex: 54,
    engagementIndex: 44,
    operationalIndex: 58,
    qualityIndex: 51,
    manuallyFlaggedAtRisk: true,
  })

  await prisma.healthMetric.create({
    data: {
      clientId: client.id,
      referenceDate,
      score: insight.health.score,
      band: insight.health.band,
      performanceWeight: insight.health.breakdown.performance,
      financialWeight: insight.health.breakdown.financial,
      engagementWeight: insight.health.breakdown.engagement,
      operationalWeight: insight.health.breakdown.operational,
      qualityWeight: insight.health.breakdown.quality,
    },
  })

  await prisma.churnMetric.create({
    data: {
      clientId: client.id,
      referenceDate,
      score: insight.churn.score,
      band: insight.churn.band,
      reasons: insight.churn.reasons,
    },
  })

  await prisma.alert.createMany({
    data: insight.alerts.map((alert) => ({
      clientId: client.id,
      type: alert.type as AlertType,
      severity: alert.severity as AlertSeverity,
      title: alert.type,
      description: alert.message,
    })),
  })

  await prisma.integration.createMany({
    data: [
      {
        tenantId: tenant.id,
        clientId: client.id,
        provider: IntegrationProvider.META_ADS,
        status: IntegrationStatus.CONNECTED,
        externalAccountId: 'act_123456',
      },
      {
        tenantId: tenant.id,
        clientId: client.id,
        provider: IntegrationProvider.MONDAY,
        status: IntegrationStatus.SYNCING,
        externalAccountId: 'board_9988',
      },
    ],
  })

  await prisma.task.createMany({
    data: [
      {
        tenantId: tenant.id,
        clientId: client.id,
        assignedUserId: masterUser.id,
        title: 'Recovery plan for ROI decline',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.URGENT,
        dueDate: new Date('2026-04-07T00:00:00.000Z'),
        estimatedHours: 12,
        spentHours: 4,
      },
      {
        tenantId: tenant.id,
        clientId: client.id,
        assignedUserId: masterUser.id,
        title: 'Stakeholder alignment review',
        status: TaskStatus.OPEN,
        priority: TaskPriority.HIGH,
        dueDate: new Date('2026-04-09T00:00:00.000Z'),
        estimatedHours: 6,
      },
    ],
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
