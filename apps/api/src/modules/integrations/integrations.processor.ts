import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { PrismaService } from '@/prisma/prisma.service'

@Processor('integration-sync')
export class IntegrationsProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super()
  }

  async process(job: Job<{ integrationId: string }>) {
    await this.prisma.integration.update({
      where: { id: job.data.integrationId },
      data: {
        status: 'SYNCING',
        lastSyncAt: new Date(),
      },
    })

    return {
      ok: true,
      integrationId: job.data.integrationId,
    }
  }
}
