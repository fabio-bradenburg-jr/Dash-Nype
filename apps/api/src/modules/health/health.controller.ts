import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { HealthService } from './health.service'

@UseGuards(JwtAuthGuard)
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('clients/:clientId/analysis')
  getAnalysis(@Param('clientId') clientId: string) {
    return this.healthService.getClientAnalysis(clientId)
  }
}
