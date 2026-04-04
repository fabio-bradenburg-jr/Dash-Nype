import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'

@Injectable()
export class AiInsightService {
  constructor(private readonly httpService: HttpService) {}

  async analyzeClient(payload: Record<string, unknown>) {
    const response = await firstValueFrom(
      this.httpService.post(`${process.env.AI_SERVICE_URL ?? 'http://localhost:8000'}/analyze-client`, payload)
    )

    return response.data
  }
}
