import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { AlertsService } from './alerts.service'

@UseGuards(JwtAuthGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.alertsService.findAll(tenantId)
  }

  @Patch(':alertId/resolve')
  resolve(@Param('alertId') alertId: string) {
    return this.alertsService.resolve(alertId)
  }
}
