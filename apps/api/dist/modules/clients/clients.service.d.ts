import { PrismaService } from '@/prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
export declare class ClientsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(input: CreateClientDto): any;
    findAll(tenantId: string): any;
    getClientSnapshot(clientId: string): Promise<{
        client: any;
        insight: import("@nype/db").ClientInsightPayload;
    }>;
}
