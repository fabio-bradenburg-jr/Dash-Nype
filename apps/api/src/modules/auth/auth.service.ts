import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { compare } from 'bcrypt'
import { PrismaService } from '@/prisma/prisma.service'
import { LoginDto } from './dto/login.dto'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  async login(input: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: input.email,
        isActive: true,
      },
    })

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas.')
    }

    const passwordIsValid = await compare(input.password, user.passwordHash).catch(() => false)

    if (!passwordIsValid) {
      throw new UnauthorizedException('Credenciais inválidas.')
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    })

    return {
      accessToken,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    }
  }
}
