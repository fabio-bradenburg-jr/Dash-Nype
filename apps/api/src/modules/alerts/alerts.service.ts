import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.alert.findMany({
      where: {
        client: {
          tenantId,
        },
      },
      include: {
        client: true,
      },
      orderBy: [{ isResolved: 'asc' }, { createdAt: 'desc' }],
    })
  }

  resolve(alertId: string) {
    return this.prisma.alert.update({
      where: { id: alertId },
      data: { isResolved: true },
    })
  }
}
