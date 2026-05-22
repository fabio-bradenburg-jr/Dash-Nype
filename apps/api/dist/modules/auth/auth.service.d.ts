import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
export declare class AuthService {
    private readonly prisma;
    private readonly jwtService;
    constructor(prisma: PrismaService, jwtService: JwtService);
    login(input: LoginDto): Promise<{
        accessToken: string;
        user: {
            id: any;
            tenantId: any;
            email: any;
            fullName: any;
            role: any;
        };
    }>;
}
