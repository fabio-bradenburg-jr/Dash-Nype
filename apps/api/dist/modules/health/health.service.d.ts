import { ClientsService } from '../clients/clients.service';
import { AiInsightService } from './ai-insight.service';
export declare class HealthService {
    private readonly clientsService;
    private readonly aiInsightService;
    constructor(clientsService: ClientsService, aiInsightService: AiInsightService);
    getClientAnalysis(clientId: string): Promise<{
        snapshot: {
            client: any;
            insight: import("@nype/db").ClientInsightPayload;
        };
        ai: any;
    }>;
}
