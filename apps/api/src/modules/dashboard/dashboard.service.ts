import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getHomeOverview(tenantId: string) {
    const [clientsCount, riskClients, unresolvedAlerts, activeTasks] = await Promise.all([
      this.prisma.client.count({ where: { tenantId } }),
      this.prisma.client.findMany({
        where: {
          tenantId,
          OR: [{ status: 'AT_RISK' }, { manuallyFlaggedAtRisk: true }],
        },
        include: {
          churnMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
          healthMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
          alerts: { where: { isResolved: false }, orderBy: { createdAt: 'desc' }, take: 3 },
        },
        take: 5,
      }),
      this.prisma.alert.count({
        where: {
          client: {
            tenantId,
          },
          isResolved: false,
        },
      }),
      this.prisma.task.count({
        where: {
          tenantId,
          status: {
            in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'],
          },
        },
      }),
    ])

    return {
      clientsCount,
      unresolvedAlerts,
      activeTasks,
      riskClients,
    }
  }

  async getExecutiveOverview(tenantId: string) {
    const clients = await this.prisma.client.findMany({
      where: { tenantId },
      include: {
        financialMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
        performanceMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
        healthMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
        churnMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
      },
    })

    const totals = clients.reduce(
      (accumulator, client) => {
        const financial = client.financialMetrics[0]
        const performance = client.performanceMetrics[0]
        const churn = client.churnMetrics[0]
        accumulator.revenue += Number(financial?.revenue ?? 0)
        accumulator.investment += Number(financial?.investment ?? 0)
        accumulator.fee += Number(financial?.fee ?? 0)
        accumulator.averageRoi += performance?.roi ?? 0
        if ((churn?.score ?? 0) > 60) accumulator.highRisk += 1
        return accumulator
      },
      {
        revenue: 0,
        investment: 0,
        fee: 0,
        averageRoi: 0,
        highRisk: 0,
      }
    )

    return {
      totals: {
        ...totals,
        averageRoi: clients.length ? Number((totals.averageRoi / clients.length).toFixed(2)) : 0,
      },
      clients,
    }
  }
}
