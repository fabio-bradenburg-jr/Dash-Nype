import { PrismaService } from '@/prisma/prisma.service';
export declare class DashboardService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getHomeOverview(tenantId: string): Promise<{
        clientsCount: any;
        unresolvedAlerts: any;
        activeTasks: any;
        riskClients: any;
    }>;
    getExecutiveOverview(tenantId: string): Promise<{
        totals: any;
        clients: any;
    }>;
}
