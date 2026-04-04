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
exports.ClientsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const db_1 = require("@nype/db");
let ClientsService = class ClientsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    create(input) {
        return this.prisma.client.create({
            data: {
                tenantId: input.tenantId,
                name: input.name,
                companyName: input.companyName,
                cnpj: input.cnpj,
                ownerName: input.ownerName,
                ownerEmail: input.ownerEmail,
                goals: input.goals,
                history: input.history,
                status: input.status,
            },
        });
    }
    findAll(tenantId) {
        return this.prisma.client.findMany({
            where: { tenantId },
            include: {
                healthMetrics: {
                    orderBy: { referenceDate: 'desc' },
                    take: 1,
                },
                churnMetrics: {
                    orderBy: { referenceDate: 'desc' },
                    take: 1,
                },
                alerts: {
                    where: { isResolved: false },
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                },
            },
            orderBy: { updatedAt: 'desc' },
        });
    }
    async getClientSnapshot(clientId) {
        const client = await this.prisma.client.findUniqueOrThrow({
            where: { id: clientId },
            include: {
                financialMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
                performanceMetrics: { orderBy: { referenceDate: 'desc' }, take: 2 },
                engagementMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
                operationalMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
                qualityMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
                alerts: { where: { isResolved: false }, orderBy: { createdAt: 'desc' } },
                tasks: { orderBy: { dueDate: 'asc' }, take: 10 },
            },
        });
        const performance = client.performanceMetrics[0];
        const previousPerformance = client.performanceMetrics[1];
        const financial = client.financialMetrics[0];
        const engagement = client.engagementMetrics[0];
        const operational = client.operationalMetrics[0];
        const quality = client.qualityMetrics[0];
        const insight = (0, db_1.buildClientInsight)(client.id, client.name, {
            roi: performance?.roi ?? 0,
            roiPrevious: previousPerformance?.roi ?? null,
            roiWithoutFee: performance?.roiWithoutFee ?? null,
            marginPercent: financial?.marginPercent ?? 0,
            meetingAttendanceRate: engagement?.meetingAttendanceRate ?? 0,
            crmUsageRate: engagement?.crmUsageRate ?? 0,
            stakeholderAlignmentScore: engagement?.stakeholderAlignmentScore ?? 0,
            delayedTasks: operational?.tasksLate ?? 0,
            totalTasks: operational?.tasksOpen ?? 0,
            csat: quality?.csat ?? 0,
            nps: quality?.nps ?? 0,
            performanceIndex: Math.max(0, Math.min(100, (performance?.roi ?? 0) * 25)),
            financialIndex: Math.max(0, Math.min(100, financial?.marginPercent ?? 0)),
            engagementIndex: ((engagement?.meetingAttendanceRate ?? 0) + (engagement?.crmUsageRate ?? 0) + (engagement?.stakeholderAlignmentScore ?? 0)) / 3,
            operationalIndex: operational?.productivityIndex ?? 0,
            qualityIndex: (((quality?.csat ?? 0) / 5) * 100 + ((quality?.nps ?? 0) / 10) * 100) / 2,
            manuallyFlaggedAtRisk: client.manuallyFlaggedAtRisk,
        });
        return {
            client,
            insight,
        };
    }
};
exports.ClientsService = ClientsService;
exports.ClientsService = ClientsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ClientsService);
//# sourceMappingURL=clients.service.js.map