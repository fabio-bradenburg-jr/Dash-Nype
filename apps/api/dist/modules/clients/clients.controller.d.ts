import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
export declare class ClientsController {
    private readonly clientsService;
    constructor(clientsService: ClientsService);
    create(input: CreateClientDto): any;
    findAll(tenantId: string): any;
    getSnapshot(clientId: string): Promise<{
        client: any;
        insight: import("@nype/db").ClientInsightPayload;
    }>;
}
