-- Nype Dash: estrutura Supabase para persistencia do dashboard
-- Rode este arquivo no SQL Editor do Supabase

create extension if not exists pgcrypto;

create table if not exists public.dashboard_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme_color text not null default 'blue',
  metric_1 text not null default 'spend',
  metric_2 text not null default 'roas',
  active_client_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.dashboard_clients (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create index if not exists dashboard_clients_user_name_idx
  on public.dashboard_clients (user_id, name);

alter table public.dashboard_preferences enable row level security;
alter table public.dashboard_clients enable row level security;

drop policy if exists "dashboard_preferences_select_own" on public.dashboard_preferences;
create policy "dashboard_preferences_select_own"
  on public.dashboard_preferences
  for select
  using (auth.uid() = user_id);

drop policy if exists "dashboard_preferences_insert_own" on public.dashboard_preferences;
create policy "dashboard_preferences_insert_own"
  on public.dashboard_preferences
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "dashboard_preferences_update_own" on public.dashboard_preferences;
create policy "dashboard_preferences_update_own"
  on public.dashboard_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "dashboard_preferences_delete_own" on public.dashboard_preferences;
create policy "dashboard_preferences_delete_own"
  on public.dashboard_preferences
  for delete
  using (auth.uid() = user_id);

drop policy if exists "dashboard_clients_select_own" on public.dashboard_clients;
create policy "dashboard_clients_select_own"
  on public.dashboard_clients
  for select
  using (auth.uid() = user_id);

drop policy if exists "dashboard_clients_insert_own" on public.dashboard_clients;
create policy "dashboard_clients_insert_own"
  on public.dashboard_clients
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "dashboard_clients_update_own" on public.dashboard_clients;
create policy "dashboard_clients_update_own"
  on public.dashboard_clients
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "dashboard_clients_delete_own" on public.dashboard_clients;
create policy "dashboard_clients_delete_own"
  on public.dashboard_clients
  for delete
  using (auth.uid() = user_id);

create or replace function public.set_dashboard_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists dashboard_preferences_set_updated_at on public.dashboard_preferences;
create trigger dashboard_preferences_set_updated_at
before update on public.dashboard_preferences
for each row execute procedure public.set_dashboard_updated_at();

drop trigger if exists dashboard_clients_set_updated_at on public.dashboard_clients;
create trigger dashboard_clients_set_updated_at
before update on public.dashboard_clients
for each row execute procedure public.set_dashboard_updated_at();
