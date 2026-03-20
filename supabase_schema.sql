create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  avatar_url text,
  role text not null default 'visualizador' check (role in ('master', 'operador', 'visualizador', 'cliente')),
  workspace_id uuid references public.workspaces(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workspace_preferences (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  theme_color text not null default 'blue',
  metric_1 text not null default 'spend',
  metric_2 text not null default 'roas',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workspace_clients (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, id)
);

create index if not exists workspace_clients_name_idx
  on public.workspace_clients (workspace_id, name);

create table if not exists public.user_client_access (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  can_view boolean not null default true,
  can_edit boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, client_id)
);

create table if not exists public.workspace_client_groups (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, id)
);

create table if not exists public.workspace_client_group_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  group_id text not null,
  client_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, group_id, client_id),
  constraint workspace_client_group_members_group_fk
    foreign key (workspace_id, group_id)
    references public.workspace_client_groups(workspace_id, id)
    on delete cascade,
  constraint workspace_client_group_members_client_fk
    foreign key (workspace_id, client_id)
    references public.workspace_clients(workspace_id, id)
    on delete cascade
);

create table if not exists public.user_client_group_access (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id text not null,
  can_view boolean not null default true,
  can_edit boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, group_id),
  constraint user_client_group_access_group_fk
    foreign key (workspace_id, group_id)
    references public.workspace_client_groups(workspace_id, id)
    on delete cascade
);

create index if not exists workspace_client_groups_name_idx
  on public.workspace_client_groups (workspace_id, name);

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_preferences enable row level security;
alter table public.workspace_clients enable row level security;
alter table public.user_client_access enable row level security;
alter table public.workspace_client_groups enable row level security;
alter table public.workspace_client_group_members enable row level security;
alter table public.user_client_group_access enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute procedure public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists workspace_preferences_set_updated_at on public.workspace_preferences;
create trigger workspace_preferences_set_updated_at
before update on public.workspace_preferences
for each row execute procedure public.set_updated_at();

drop trigger if exists workspace_clients_set_updated_at on public.workspace_clients;
create trigger workspace_clients_set_updated_at
before update on public.workspace_clients
for each row execute procedure public.set_updated_at();

drop trigger if exists user_client_access_set_updated_at on public.user_client_access;
create trigger user_client_access_set_updated_at
before update on public.user_client_access
for each row execute procedure public.set_updated_at();

drop trigger if exists workspace_client_groups_set_updated_at on public.workspace_client_groups;
create trigger workspace_client_groups_set_updated_at
before update on public.workspace_client_groups
for each row execute procedure public.set_updated_at();

drop trigger if exists workspace_client_group_members_set_updated_at on public.workspace_client_group_members;
create trigger workspace_client_group_members_set_updated_at
before update on public.workspace_client_group_members
for each row execute procedure public.set_updated_at();

drop trigger if exists user_client_group_access_set_updated_at on public.user_client_group_access;
create trigger user_client_group_access_set_updated_at
before update on public.user_client_group_access
for each row execute procedure public.set_updated_at();
