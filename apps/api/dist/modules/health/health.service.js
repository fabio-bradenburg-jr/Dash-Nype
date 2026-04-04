"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthService = void 0;
const common_1 = require("@nestjs/common");
const clients_service_1 = require("../clients/clients.service");
const ai_insight_service_1 = require("./ai-insight.service");
let HealthService = class HealthService {
    constructor(clientsService, aiInsightService) {
        this.clientsService = clientsService;
        this.aiInsightService = aiInsightService;
    }
    async getClientAnalysis(clientId) {
        const snapshot = await this.clientsService.getClientSnapshot(clientId);
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
        });
        return {
            snapshot,
            ai,
        };
    }
};
exports.HealthService = HealthService;
exports.HealthService = HealthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [clients_service_1.ClientsService,
        ai_insight_service_1.AiInsightService])
], HealthService);
//# sourceMappingURL=health.service.js.map