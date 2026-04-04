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
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let DashboardService = class DashboardService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getHomeOverview(tenantId) {
        const [clientsCount, riskClients, unresolvedAlerts, activeTasks] = await Promise.all([
            this.prisma.client.count({ where: { tenantId } }),
            this.prisma.client.findMany({
                where: {
                    tenantId,
                    OR: [{ status: 'AT_RISK' }, { manuallyFlaggedAtRisk: true }],
                },
                include: {
                    churnMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
                    healthMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
                    alerts: { where: { isResolved: false }, orderBy: { createdAt: 'desc' }, take: 3 },
                },
                take: 5,
            }),
            this.prisma.alert.count({
                where: {
                    client: {
                        tenantId,
                    },
                    isResolved: false,
                },
            }),
            this.prisma.task.count({
                where: {
                    tenantId,
                    status: {
                        in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'],
                    },
                },
            }),
        ]);
        return {
            clientsCount,
            unresolvedAlerts,
            activeTasks,
            riskClients,
        };
    }
    async getExecutiveOverview(tenantId) {
        const clients = await this.prisma.client.findMany({
            where: { tenantId },
            include: {
                financialMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
                performanceMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
                healthMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
                churnMetrics: { orderBy: { referenceDate: 'desc' }, take: 1 },
            },
        });
        const totals = clients.reduce((accumulator, client) => {
            const financial = client.financialMetrics[0];
            const performance = client.performanceMetrics[0];
            const churn = client.churnMetrics[0];
            accumulator.revenue += Number(financial?.revenue ?? 0);
            accumulator.investment += Number(financial?.investment ?? 0);
            accumulator.fee += Number(financial?.fee ?? 0);
            accumulator.averageRoi += performance?.roi ?? 0;
            if ((churn?.score ?? 0) > 60)
                accumulator.highRisk += 1;
            return accumulator;
        }, {
            revenue: 0,
            investment: 0,
            fee: 0,
            averageRoi: 0,
            highRisk: 0,
        });
        return {
            totals: {
                ...totals,
                averageRoi: clients.length ? Number((totals.averageRoi / clients.length).toFixed(2)) : 0,
            },
            clients,
        };
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map