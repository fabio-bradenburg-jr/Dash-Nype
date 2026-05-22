import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
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
