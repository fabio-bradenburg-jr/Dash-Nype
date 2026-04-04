import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { IntegrationsService } from './integrations.service'

@UseGuards(JwtAuthGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  list(@Query('tenantId') tenantId: string) {
    return this.integrationsService.list(tenantId)
  }

  @Post(':integrationId/sync')
  sync(@Param('integrationId') integrationId: string) {
    return this.integrationsService.enqueueSync(integrationId)
  }
}
