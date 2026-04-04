import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator'
import { ClientStatus } from '@nype/db'

export class CreateClientDto {
  @IsString()
  tenantId!: string

  @IsString()
  name!: string

  @IsString()
  companyName!: string

  @IsOptional()
  @IsString()
  cnpj?: string

  @IsString()
  ownerName!: string

  @IsOptional()
  @IsEmail()
  ownerEmail?: string

  @IsOptional()
  goals?: Record<string, unknown>

  @IsOptional()
  history?: Record<string, unknown>

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus
}
