import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { ClientsService } from './clients.service'
import { CreateClientDto } from './dto/create-client.dto'

@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  create(@Body() input: CreateClientDto) {
    return this.clientsService.create(input)
  }

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.clientsService.findAll(tenantId)
  }

  @Get(':clientId')
  getSnapshot(@Param('clientId') clientId: string) {
    return this.clientsService.getClientSnapshot(clientId)
  }
}
