# Nype Orbit SaaS

Multi-tenant SaaS platform for marketing metrics, client management, integrations, health scoring, and operational tracking.

## Stack

- Frontend: Next.js, React, TypeScript, TailwindCSS, shadcn/ui-style components, Recharts
- Backend: FastAPI, SQLAlchemy ORM, PostgreSQL, JWT authentication
- Architecture: REST API, multi-tenant data isolation, modular services, mock background sync jobs

## Project structure

```text
Nype/
├── apps/
│   ├── backend/                 # FastAPI API, SQLAlchemy models, seed data, cron sync
│   ├── ai-service/              # Existing lightweight AI service
│   └── api/                     # Existing NestJS API kept intact
├── src/
│   ├── app/saas/                # New SaaS dashboard route
│   ├── components/saas/         # Dashboard modules
│   ├── components/ui/           # shadcn/ui-style primitives
│   └── lib/saas/                # Types, mock data, API adapter
└── packages/db/                 # Existing shared package
```

## Backend modules

- `auth`: email/password login and JWT issue
- `clients`: full CRUD with tenant scoping
- `integrations`: Meta Ads, Google Ads, LinkedIn Ads, and Agendor connection records
- `dashboards`: client and operations aggregations
- `tasks`: project management per client
- `settings`: tenant theme customization
- `services/seed.py`: production-style demo seed
- `services/integrations.py`: mock sync + metric normalization
- `services/health.py`: green/yellow/red health score engine

## Frontend modules

- Sidebar navigation
- Topbar with client selector
- Metric cards
- Time-series and distribution charts
- Dynamic funnel builder
- Client health and integration panels
- Project checklist and task management
- Theme customization panel

## Local run

### 1. Start PostgreSQL

```bash
docker run --name nype-marketing-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=nype_marketing -p 5432:5432 -d postgres:16
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Configure and run the FastAPI backend

```bash
cd apps/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Demo users:

- `admin@nype.demo` / `admin123`
- `operator@nype.demo` / `operator123`

### 4. Run the Next.js frontend

```bash
cd ../..
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The new SaaS is now the primary application at the root domain, and the legacy interface routes redirect back to `/`.

## API overview

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/clients`
- `POST /api/v1/clients`
- `PUT /api/v1/clients/{client_id}`
- `DELETE /api/v1/clients/{client_id}`
- `GET /api/v1/clients/{client_id}/checklist`
- `GET /api/v1/clients/{client_id}/tasks`
- `GET /api/v1/dashboards/clients/{client_id}`
- `GET /api/v1/dashboards/operations`
- `GET /api/v1/integrations`
- `POST /api/v1/integrations`
- `POST /api/v1/integrations/{integration_id}/sync`
- `GET /api/v1/settings/theme`
- `PUT /api/v1/settings/theme`
- `GET /api/v1/tasks`
- `POST /api/v1/tasks/clients/{client_id}`
- `PATCH /api/v1/tasks/{task_id}`

## Notes

- The frontend uses live API data when available and falls back to typed mock data so the dashboard still renders during setup.
- Integration sync currently uses deterministic mock payloads with normalization logic; the provider module boundaries are ready for real API clients.
