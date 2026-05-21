-- Weekly client operation records for Controle da Operacao.
-- Safe to run multiple times in Supabase SQL Editor.

create table if not exists public.client_weekly_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id text not null,
  week_start date not null,
  week_end date not null,
  investment numeric(14,2) not null default 0,
  leads integer not null default 0,
  sql_count integer not null default 0,
  health_status text not null default 'attention',
  action_items jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint client_weekly_snapshots_client_fk
    foreign key (workspace_id, client_id)
    references public.workspace_clients(workspace_id, id)
    on delete cascade,
  constraint client_weekly_snapshots_week_bounds_check
    check (week_end >= week_start),
  constraint client_weekly_snapshots_numbers_check
    check (investment >= 0 and leads >= 0 and sql_count >= 0),
  constraint client_weekly_snapshots_health_status_check
    check (health_status in ('critical', 'attention', 'healthy', 'with_result'))
);

create unique index if not exists client_weekly_snapshots_workspace_client_week_idx
  on public.client_weekly_snapshots (workspace_id, client_id, week_start);

create index if not exists client_weekly_snapshots_workspace_week_idx
  on public.client_weekly_snapshots (workspace_id, week_start desc);

create index if not exists client_weekly_snapshots_workspace_client_idx
  on public.client_weekly_snapshots (workspace_id, client_id);

alter table public.client_weekly_snapshots enable row level security;

drop policy if exists "client_weekly_snapshots_select_member" on public.client_weekly_snapshots;
create policy "client_weekly_snapshots_select_member"
  on public.client_weekly_snapshots
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "client_weekly_snapshots_mutate_manager" on public.client_weekly_snapshots;
create policy "client_weekly_snapshots_mutate_manager"
  on public.client_weekly_snapshots
  for all
  using (public.is_workspace_member(workspace_id) and public.is_client_manager())
  with check (public.is_workspace_member(workspace_id) and public.is_client_manager());

drop trigger if exists client_weekly_snapshots_set_updated_at on public.client_weekly_snapshots;
create trigger client_weekly_snapshots_set_updated_at
before update on public.client_weekly_snapshots
for each row execute procedure public.set_updated_at();

grant select, insert, update, delete on public.client_weekly_snapshots to authenticated;
grant all on public.client_weekly_snapshots to service_role;

notify pgrst, 'reload schema';
