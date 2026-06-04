create table if not exists public.workspace_google_ads_connections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  google_sub text,
  google_email text,
  google_name text,
  access_token text not null,
  refresh_token text,
  token_type text not null default 'Bearer',
  scope text,
  expiry_date timestamptz,
  manager_customer_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.workspace_google_ads_connections enable row level security;

drop policy if exists "workspace_google_ads_connections_select_member" on public.workspace_google_ads_connections;
create policy "workspace_google_ads_connections_select_member"
  on public.workspace_google_ads_connections
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_google_ads_connections_mutate_manager" on public.workspace_google_ads_connections;
create policy "workspace_google_ads_connections_mutate_manager"
  on public.workspace_google_ads_connections
  for all
  using (public.is_workspace_member(workspace_id) and public.is_client_manager())
  with check (public.is_workspace_member(workspace_id) and public.is_client_manager());

drop trigger if exists workspace_google_ads_connections_set_updated_at on public.workspace_google_ads_connections;
create trigger workspace_google_ads_connections_set_updated_at
before update on public.workspace_google_ads_connections
for each row execute procedure public.set_updated_at();
