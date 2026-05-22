import { IntegrationsService } from './integrations.service';
export declare class IntegrationsController {
    private readonly integrationsService;
    constructor(integrationsService: IntegrationsService);
    list(tenantId: string): any;
    sync(integrationId: string): Promise<{
        enqueued: boolean;
        integrationId: string;
    }>;
}
