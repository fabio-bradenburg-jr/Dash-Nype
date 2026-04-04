# Nype SaaS Platform

Plataforma SaaS multi-tenant para gestão de clientes de agência com foco em performance, operação, risco de churn e leitura assistida por IA.

## Arquitetura

- `src/`: frontend Next.js atual, já conectado à camada de plataforma por rotas internas em `/api/platform/*`
- `apps/api`: backend NestJS com JWT, RBAC, Prisma, BullMQ e módulos de negócio
- `apps/ai-service`: microserviço FastAPI para análise de risco e recomendações
- `packages/db`: schema Prisma, seeds e regra central de cálculo de health score, churn score e alertas

## Domínio coberto

- Multi-tenant por `Tenant`
- RBAC com `MASTER`, `USER`, `VIEWER`, `CLIENT`
- Permissão por cliente e dashboard
- Métricas financeiras, performance, engajamento, operacional e qualidade
- Health score ponderado
- Churn score por regras de negócio
- Alertas automáticos e risco manual
- Integrações com fila assíncrona
- Ponte frontend -> API -> IA

## Endpoints principais

- `POST /api/auth/login`
- `GET /api/clients?tenantId=...`
- `POST /api/clients`
- `GET /api/clients/:clientId`
- `GET /api/dashboards/home?tenantId=...`
- `GET /api/dashboards/executive?tenantId=...`
- `GET /api/alerts?tenantId=...`
- `PATCH /api/alerts/:alertId/resolve`
- `GET /api/integrations?tenantId=...`
- `POST /api/integrations/:integrationId/sync`
- `GET /api/health/clients/:clientId/analysis`

## Setup local

### 1. Banco e Redis

```bash
docker run --name nype-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=nype -p 5432:5432 -d postgres:16
docker run --name nype-redis -p 6379:6379 -d redis:7
```

### 2. Variáveis de ambiente

Copie `.env.example` para `.env.local`.

### 3. Prisma

```bash
npm --workspace @nype/db run prisma:generate
npm --workspace @nype/db run prisma:migrate
npm --workspace @nype/db run prisma:seed
```

### 4. API NestJS

```bash
npm --workspace @nype/api run start:dev
```

### 5. Microserviço de IA

```bash
cd apps/ai-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 6. Frontend

```bash
npm run dev
```

## Seeds

O seed cria tenant, usuário master, cliente em risco, métricas, scores, alertas, integrações e tarefas.

## Observações

- A UI nova já pode consumir a camada de plataforma com fallback seguro.
- O domínio compartilhado está centralizado em `packages/db`.
- As integrações entram por fila BullMQ para sync assíncrono.
