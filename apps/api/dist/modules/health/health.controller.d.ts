import { HealthService } from './health.service';
export declare class HealthController {
    private readonly healthService;
    constructor(healthService: HealthService);
    getAnalysis(clientId: string): Promise<{
        snapshot: {
            client: any;
            insight: import("@nype/db").ClientInsightPayload;
        };
        ai: any;
    }>;
}
