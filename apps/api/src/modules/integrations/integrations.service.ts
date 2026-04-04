import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { Queue } from 'bullmq'
import { PrismaService } from '@/prisma/prisma.service'

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('integration-sync') private readonly integrationQueue: Queue
  ) {}

  list(tenantId: string) {
    return this.prisma.integration.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async enqueueSync(integrationId: string) {
    const integration = await this.prisma.integration.findUniqueOrThrow({
      where: { id: integrationId },
    })

    await this.integrationQueue.add('sync-provider', {
      integrationId: integration.id,
      provider: integration.provider,
      tenantId: integration.tenantId,
      clientId: integration.clientId,
    })

    return {
      enqueued: true,
      integrationId,
    }
  }
}
