import { Module } from '@nestjs/common'
import { ClientsModule } from '../clients/clients.module'
import { HealthController } from './health.controller'
import { HealthService } from './health.service'
import { AiInsightService } from './ai-insight.service'

@Module({
  imports: [ClientsModule],
  controllers: [HealthController],
  providers: [HealthService, AiInsightService],
})
export class HealthModule {}
