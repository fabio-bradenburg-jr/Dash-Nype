import { HttpService } from '@nestjs/axios';
export declare class AiInsightService {
    private readonly httpService;
    constructor(httpService: HttpService);
    analyzeClient(payload: Record<string, unknown>): Promise<any>;
}
