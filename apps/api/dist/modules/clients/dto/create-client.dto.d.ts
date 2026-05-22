import { ClientStatus } from '@nype/db';
export declare class CreateClientDto {
    tenantId: string;
    name: string;
    companyName: string;
    cnpj?: string;
    ownerName: string;
    ownerEmail?: string;
    goals?: Record<string, unknown>;
    history?: Record<string, unknown>;
    status?: ClientStatus;
}
