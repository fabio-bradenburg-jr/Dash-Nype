import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { buildClientInsight } from '@nype/db'
import { CreateClientDto } from './dto/create-client.dto'

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateClientDto) {
    return this.prisma.client.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        companyName: input.companyName,
        cnpj: input.cnpj,
        ownerName: input.ownerName,
        ownerEmail: input.ownerEmail,
        goals: input.goals,
        history: input.history,
        status: input.status,
      },
    })
  }

  findAll(tenantId: string) {
    return this.prisma.client.findMany({
      where: { tenantId },
      include: {
        healthMetrics: {
          orderBy: { referenceDate: 'desc' },
          take: 1,
        },
        churnMetrics: {
          orderBy: { referenceDate: 'desc' },
          take: 1,
        },
        alerts: {
          where: { isResolved: false },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async getClientSnapshot(clientId: string) {
    const client = await this.prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      include: {
        financialMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
        performanceMetrics: { orderBy: { referenceDate: 'desc' }, take: 2 },
        engagementMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
        operationalMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
        qualityMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
        alerts: { where: { isResolved: false }, orderBy: { createdAt: 'desc' } },
        tasks: { orderBy: { dueDate: 'asc' }, take: 10 },
      },
    })

    const performance = client.performanceMetrics[0]
    const previousPerformance = client.performanceMetrics[1]
    const financial = client.financialMetrics[0]
    const engagement = client.engagementMetrics[0]
    const operational = client.operationalMetrics[0]
    const quality = client.qualityMetrics[0]

    const insight = buildClientInsight(client.id, client.name, {
      roi: performance?.roi ?? 0,
      roiPrevious: previousPerformance?.roi ?? null,
      roiWithoutFee: performance?.roiWithoutFee ?? null,
      marginPercent: financial?.marginPercent ?? 0,
      meetingAttendanceRate: engagement?.meetingAttendanceRate ?? 0,
      crmUsageRate: engagement?.crmUsageRate ?? 0,
      stakeholderAlignmentScore: engagement?.stakeholderAlignmentScore ?? 0,
      delayedTasks: operational?.tasksLate ?? 0,
      totalTasks: operational?.tasksOpen ?? 0,
      csat: quality?.csat ?? 0,
      nps: quality?.nps ?? 0,
      performanceIndex: Math.max(0, Math.min(100, (performance?.roi ?? 0) * 25)),
      financialIndex: Math.max(0, Math.min(100, financial?.marginPercent ?? 0)),
      engagementIndex:
        ((engagement?.meetingAttendanceRate ?? 0) + (engagement?.crmUsageRate ?? 0) + (engagement?.stakeholderAlignmentScore ?? 0)) / 3,
      operationalIndex: operational?.productivityIndex ?? 0,
      qualityIndex: (((quality?.csat ?? 0) / 5) * 100 + ((quality?.nps ?? 0) / 10) * 100) / 2,
      manuallyFlaggedAtRisk: client.manuallyFlaggedAtRisk,
    })

    return {
      client,
      insight,
    }
  }
}
