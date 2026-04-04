import { Queue } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
export declare class IntegrationsService {
    private readonly prisma;
    private readonly integrationQueue;
    constructor(prisma: PrismaService, integrationQueue: Queue);
    list(tenantId: string): any;
    enqueueSync(integrationId: string): Promise<{
        enqueued: boolean;
        integrationId: string;
    }>;
}
