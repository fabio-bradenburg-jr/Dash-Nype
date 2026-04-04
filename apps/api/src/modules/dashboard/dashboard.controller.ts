import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { DashboardService } from './dashboard.service'

@UseGuards(JwtAuthGuard)
@Controller('dashboards')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('home')
  getHome(@Query('tenantId') tenantId: string) {
    return this.dashboardService.getHomeOverview(tenantId)
  }

  @Get('executive')
  getExecutive(@Query('tenantId') tenantId: string) {
    return this.dashboardService.getExecutiveOverview(tenantId)
  }
}
