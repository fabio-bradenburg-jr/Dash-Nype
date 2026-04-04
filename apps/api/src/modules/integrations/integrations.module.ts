import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { IntegrationsController } from './integrations.controller'
import { IntegrationsProcessor } from './integrations.processor'
import { IntegrationsService } from './integrations.service'

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'integration-sync',
    }),
  ],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, IntegrationsProcessor],
})
export class IntegrationsModule {}
