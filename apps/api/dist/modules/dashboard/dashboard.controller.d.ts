import { DashboardService } from './dashboard.service';
export declare class DashboardController {
    private readonly dashboardService;
    constructor(dashboardService: DashboardService);
    getHome(tenantId: string): Promise<{
        clientsCount: any;
        unresolvedAlerts: any;
        activeTasks: any;
        riskClients: any;
    }>;
    getExecutive(tenantId: string): Promise<{
        totals: any;
        clients: any;
    }>;
}
