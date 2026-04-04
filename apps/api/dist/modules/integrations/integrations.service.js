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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationsService = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const bullmq_2 = require("bullmq");
const prisma_service_1 = require("../../prisma/prisma.service");
let IntegrationsService = class IntegrationsService {
    constructor(prisma, integrationQueue) {
        this.prisma = prisma;
        this.integrationQueue = integrationQueue;
    }
    list(tenantId) {
        return this.prisma.integration.findMany({
            where: { tenantId },
            orderBy: { updatedAt: 'desc' },
        });
    }
    async enqueueSync(integrationId) {
        const integration = await this.prisma.integration.findUniqueOrThrow({
            where: { id: integrationId },
        });
        await this.integrationQueue.add('sync-provider', {
            integrationId: integration.id,
            provider: integration.provider,
            tenantId: integration.tenantId,
            clientId: integration.clientId,
        });
        return {
            enqueued: true,
            integrationId,
        };
    }
};
exports.IntegrationsService = IntegrationsService;
exports.IntegrationsService = IntegrationsService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bullmq_1.InjectQueue)('integration-sync')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        bullmq_2.Queue])
], IntegrationsService);
//# sourceMappingURL=integrations.service.js.map