# Assessoria LP Dashboard

Next.js dashboard for Meta Ads analysis, client management, AI assistance, weekly operations tracking, and workspace settings.

Production domain: `https://app.assessorialp.com.br`

## Stack

- Next.js App Router
- React
- TypeScript and JavaScript
- TailwindCSS
- Supabase Auth and Postgres

## Active App Shape

```text
Nype/
├── src/
│   ├── app/                    # Next routes and API handlers
│   ├── components/dashboard/   # Current online dashboard shell
│   ├── components/saas/        # Legacy-compatible SaaS panels still imported by /saas
│   └── lib/                    # Supabase, dashboard, Meta, AI, and integration helpers
├── public/                     # Static assets
├── supabase_schema.sql         # Current Supabase schema used by the app
└── supabase_client_weekly_snapshots.sql
```

## Local Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Supabase

The current app uses the workspace-based Supabase tables such as `workspaces`, `profiles`, `workspace_clients`, `workspace_preferences`, `workspace_meta_connections`, `assistant_conversations`, `assistant_messages`, and related access-control tables.

The old Prisma/Nest/FastAPI local services and Prisma-style Supabase schema were removed because the online app no longer depends on them.
