create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.current_profile_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id
  from public.profiles
  where id = auth.uid()
  limit 1
$$;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
  limit 1
$$;

create or replace function public.is_master_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'master', false)
$$;

create or replace function public.is_client_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() in ('master', 'operador'), false)
$$;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_workspace_id() = target_workspace_id, false)
$$;

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
  ai_access_level text not null default 'team' check (ai_access_level in ('master', 'team')),
  workspace_id uuid references public.workspaces(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles
  add column if not exists ai_access_level text not null default 'team';

create table if not exists public.workspace_preferences (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  theme_color text not null default 'blue',
  metric_1 text not null default 'spend',
  metric_2 text not null default 'roas',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.workspace_preferences
  add column if not exists payload jsonb not null default '{}'::jsonb;

create table if not exists public.workspace_clients (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  name text not null,
  cnpj text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, id)
);

alter table public.workspace_clients
  add column if not exists cnpj text not null default '';

create table if not exists public.workspace_products (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  name text not null,
  description text not null default '',
  status text not null default 'Ativo',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, id)
);

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

create table if not exists public.workspace_google_calendar_connections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  google_email text,
  access_token text not null,
  refresh_token text,
  token_type text not null default 'Bearer',
  scope text,
  expiry_date timestamptz,
  selected_calendar_id text not null default 'primary',
  selected_calendar_summary text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workspace_meta_connections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  meta_user_id text,
  meta_user_name text,
  access_token text not null,
  token_type text not null default 'Bearer',
  scope text,
  expiry_date timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nova conversa',
  ai_access_level text not null default 'team' check (ai_access_level in ('master', 'team')),
  last_message_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists workspace_clients_name_idx
  on public.workspace_clients (workspace_id, name);

create unique index if not exists workspace_clients_cnpj_unique_idx
  on public.workspace_clients (workspace_id, cnpj)
  where cnpj <> '';

create index if not exists workspace_products_name_idx
  on public.workspace_products (workspace_id, name);

create index if not exists workspace_client_groups_name_idx
  on public.workspace_client_groups (workspace_id, name);

create index if not exists assistant_conversations_workspace_user_updated_idx
  on public.assistant_conversations (workspace_id, user_id, updated_at desc);

create index if not exists assistant_messages_conversation_created_idx
  on public.assistant_messages (conversation_id, created_at asc);

create index if not exists assistant_messages_workspace_user_created_idx
  on public.assistant_messages (workspace_id, user_id, created_at desc);

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_preferences enable row level security;
alter table public.workspace_clients enable row level security;
alter table public.workspace_products enable row level security;
alter table public.user_client_access enable row level security;
alter table public.workspace_client_groups enable row level security;
alter table public.workspace_client_group_members enable row level security;
alter table public.user_client_group_access enable row level security;
alter table public.workspace_google_calendar_connections enable row level security;
alter table public.workspace_meta_connections enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id or public.is_master_user());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id or public.is_master_user())
  with check (auth.uid() = id or public.is_master_user());

drop policy if exists "profiles_insert_master" on public.profiles;
create policy "profiles_insert_master"
  on public.profiles
  for insert
  with check (auth.uid() = id or public.is_master_user());

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member"
  on public.workspaces
  for select
  using (public.is_workspace_member(id));

drop policy if exists "workspaces_update_master" on public.workspaces;
create policy "workspaces_update_master"
  on public.workspaces
  for update
  using (public.is_master_user())
  with check (public.is_master_user());

drop policy if exists "workspace_preferences_select_member" on public.workspace_preferences;
create policy "workspace_preferences_select_member"
  on public.workspace_preferences
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_preferences_mutate_manager" on public.workspace_preferences;
create policy "workspace_preferences_mutate_manager"
  on public.workspace_preferences
  for all
  using (public.is_workspace_member(workspace_id) and public.is_client_manager())
  with check (public.is_workspace_member(workspace_id) and public.is_client_manager());

drop policy if exists "workspace_clients_select_member" on public.workspace_clients;
create policy "workspace_clients_select_member"
  on public.workspace_clients
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_clients_mutate_manager" on public.workspace_clients;
create policy "workspace_clients_mutate_manager"
  on public.workspace_clients
  for all
  using (public.is_workspace_member(workspace_id) and public.is_client_manager())
  with check (public.is_workspace_member(workspace_id) and public.is_client_manager());

drop policy if exists "workspace_products_select_member" on public.workspace_products;
create policy "workspace_products_select_member"
  on public.workspace_products
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_products_mutate_manager" on public.workspace_products;
create policy "workspace_products_mutate_manager"
  on public.workspace_products
  for all
  using (public.is_workspace_member(workspace_id) and public.is_client_manager())
  with check (public.is_workspace_member(workspace_id) and public.is_client_manager());

drop policy if exists "user_client_access_select_self_or_master" on public.user_client_access;
create policy "user_client_access_select_self_or_master"
  on public.user_client_access
  for select
  using (
    public.is_workspace_member(workspace_id)
    and (auth.uid() = user_id or public.is_master_user())
  );

drop policy if exists "user_client_access_mutate_master" on public.user_client_access;
create policy "user_client_access_mutate_master"
  on public.user_client_access
  for all
  using (public.is_workspace_member(workspace_id) and public.is_master_user())
  with check (public.is_workspace_member(workspace_id) and public.is_master_user());

drop policy if exists "workspace_client_groups_select_member" on public.workspace_client_groups;
create policy "workspace_client_groups_select_member"
  on public.workspace_client_groups
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_client_groups_mutate_manager" on public.workspace_client_groups;
create policy "workspace_client_groups_mutate_manager"
  on public.workspace_client_groups
  for all
  using (public.is_workspace_member(workspace_id) and public.is_client_manager())
  with check (public.is_workspace_member(workspace_id) and public.is_client_manager());

drop policy if exists "workspace_client_group_members_select_member" on public.workspace_client_group_members;
create policy "workspace_client_group_members_select_member"
  on public.workspace_client_group_members
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_client_group_members_mutate_manager" on public.workspace_client_group_members;
create policy "workspace_client_group_members_mutate_manager"
  on public.workspace_client_group_members
  for all
  using (public.is_workspace_member(workspace_id) and public.is_client_manager())
  with check (public.is_workspace_member(workspace_id) and public.is_client_manager());

drop policy if exists "user_client_group_access_select_self_or_master" on public.user_client_group_access;
create policy "user_client_group_access_select_self_or_master"
  on public.user_client_group_access
  for select
  using (
    public.is_workspace_member(workspace_id)
    and (auth.uid() = user_id or public.is_master_user())
  );

drop policy if exists "user_client_group_access_mutate_master" on public.user_client_group_access;
create policy "user_client_group_access_mutate_master"
  on public.user_client_group_access
  for all
  using (public.is_workspace_member(workspace_id) and public.is_master_user())
  with check (public.is_workspace_member(workspace_id) and public.is_master_user());

drop policy if exists "workspace_google_calendar_connections_select_member" on public.workspace_google_calendar_connections;
create policy "workspace_google_calendar_connections_select_member"
  on public.workspace_google_calendar_connections
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_google_calendar_connections_mutate_manager" on public.workspace_google_calendar_connections;
create policy "workspace_google_calendar_connections_mutate_manager"
  on public.workspace_google_calendar_connections
  for all
  using (public.is_workspace_member(workspace_id) and public.is_client_manager())
  with check (public.is_workspace_member(workspace_id) and public.is_client_manager());

drop policy if exists "workspace_meta_connections_select_member" on public.workspace_meta_connections;
create policy "workspace_meta_connections_select_member"
  on public.workspace_meta_connections
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_meta_connections_mutate_manager" on public.workspace_meta_connections;
create policy "workspace_meta_connections_mutate_manager"
  on public.workspace_meta_connections
  for all
  using (public.is_workspace_member(workspace_id) and public.is_client_manager())
  with check (public.is_workspace_member(workspace_id) and public.is_client_manager());

drop policy if exists "assistant_conversations_select_own" on public.assistant_conversations;
create policy "assistant_conversations_select_own"
  on public.assistant_conversations
  for select
  using (
    auth.uid() = user_id
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "assistant_conversations_insert_own" on public.assistant_conversations;
create policy "assistant_conversations_insert_own"
  on public.assistant_conversations
  for insert
  with check (
    auth.uid() = user_id
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "assistant_conversations_update_own" on public.assistant_conversations;
create policy "assistant_conversations_update_own"
  on public.assistant_conversations
  for update
  using (
    auth.uid() = user_id
    and public.is_workspace_member(workspace_id)
  )
  with check (
    auth.uid() = user_id
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "assistant_conversations_delete_own" on public.assistant_conversations;
create policy "assistant_conversations_delete_own"
  on public.assistant_conversations
  for delete
  using (
    auth.uid() = user_id
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "assistant_messages_select_own" on public.assistant_messages;
create policy "assistant_messages_select_own"
  on public.assistant_messages
  for select
  using (
    auth.uid() = user_id
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "assistant_messages_insert_own" on public.assistant_messages;
create policy "assistant_messages_insert_own"
  on public.assistant_messages
  for insert
  with check (
    auth.uid() = user_id
    and public.is_workspace_member(workspace_id)
  );

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

drop trigger if exists workspace_products_set_updated_at on public.workspace_products;
create trigger workspace_products_set_updated_at
before update on public.workspace_products
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

drop trigger if exists workspace_google_calendar_connections_set_updated_at on public.workspace_google_calendar_connections;
create trigger workspace_google_calendar_connections_set_updated_at
before update on public.workspace_google_calendar_connections
for each row execute procedure public.set_updated_at();

drop trigger if exists workspace_meta_connections_set_updated_at on public.workspace_meta_connections;
create trigger workspace_meta_connections_set_updated_at
before update on public.workspace_meta_connections
for each row execute procedure public.set_updated_at();

drop trigger if exists assistant_conversations_set_updated_at on public.assistant_conversations;
create trigger assistant_conversations_set_updated_at
before update on public.assistant_conversations
for each row execute procedure public.set_updated_at();
