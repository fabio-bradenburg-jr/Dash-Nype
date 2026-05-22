import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
export declare class IntegrationsProcessor extends WorkerHost {
    private readonly prisma;
    constructor(prisma: PrismaService);
    process(job: Job<{
        integrationId: string;
    }>): Promise<{
        ok: boolean;
        integrationId: string;
    }>;
}
