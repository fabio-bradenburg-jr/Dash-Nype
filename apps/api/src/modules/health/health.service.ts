import { Injectable } from '@nestjs/common'
import { ClientsService } from '../clients/clients.service'
import { AiInsightService } from './ai-insight.service'

@Injectable()
export class HealthService {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly aiInsightService: AiInsightService
  ) {}

  async getClientAnalysis(clientId: string) {
    const snapshot = await this.clientsService.getClientSnapshot(clientId)

    const ai = await this.aiInsightService.analyzeClient({
      clientId: snapshot.client.id,
      clientName: snapshot.client.name,
      industry: snapshot.client.history,
      healthScore: snapshot.insight.health.score,
      healthBand: snapshot.insight.health.band,
      churnScore: snapshot.insight.churn.score,
      churnBand: snapshot.insight.churn.band,
      reasons: snapshot.insight.churn.reasons,
      alerts: snapshot.insight.alerts,
    })

    return {
      snapshot,
      ai,
    }
  }
}
