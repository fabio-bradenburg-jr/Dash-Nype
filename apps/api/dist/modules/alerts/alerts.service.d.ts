import { PrismaService } from '@/prisma/prisma.service';
export declare class AlertsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string): any;
    resolve(alertId: string): any;
}
