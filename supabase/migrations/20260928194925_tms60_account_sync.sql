-- Applied to the canonical THIEPN Account Supabase project as migration
-- 20260928194925_tms60_account_sync.
-- TMS60 uses the existing shared auth.users identity and owns only its
-- isolated application sync/backup rows.

create table public.tms60_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision >= 1),
  state_schema integer not null check (state_schema >= 1 and state_schema <= 1000),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  state_hash text,
  client_updated_at bigint not null check (client_updated_at >= 0),
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tms60_sync_state_hash_len check (state_hash is null or char_length(state_hash) <= 128),
  constraint tms60_sync_state_device_len check (device_id is null or char_length(device_id) between 1 and 120),
  constraint tms60_sync_state_size check (octet_length(state::text) <= 8388608)
);

alter table public.tms60_sync_state enable row level security;
revoke all on table public.tms60_sync_state from anon, authenticated;
grant select, insert, update, delete on table public.tms60_sync_state to authenticated;

create policy tms60_sync_state_select_own
on public.tms60_sync_state for select
to authenticated
using ((select auth.uid()) = user_id);

create policy tms60_sync_state_insert_own
on public.tms60_sync_state for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy tms60_sync_state_update_own
on public.tms60_sync_state for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy tms60_sync_state_delete_own
on public.tms60_sync_state for delete
to authenticated
using ((select auth.uid()) = user_id);

create index tms60_sync_state_updated_at_idx
  on public.tms60_sync_state (updated_at desc);

create table public.tms60_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_schema integer not null check (state_schema >= 1 and state_schema <= 1000),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  source_revision bigint not null default 0 check (source_revision >= 0),
  device_id text,
  created_at timestamptz not null default now(),
  constraint tms60_backups_device_len check (device_id is null or char_length(device_id) between 1 and 120),
  constraint tms60_backups_state_size check (octet_length(state::text) <= 8388608)
);

alter table public.tms60_backups enable row level security;
revoke all on table public.tms60_backups from anon, authenticated;
grant select, insert, delete on table public.tms60_backups to authenticated;

create policy tms60_backups_select_own
on public.tms60_backups for select
to authenticated
using ((select auth.uid()) = user_id);

create policy tms60_backups_insert_own
on public.tms60_backups for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy tms60_backups_delete_own
on public.tms60_backups for delete
to authenticated
using ((select auth.uid()) = user_id);

create index tms60_backups_user_created_idx
  on public.tms60_backups (user_id, created_at desc);

insert into public.account_apps (slug, name, description, path, sort_order, active)
values (
  'tms60',
  'TMS60',
  'Local-first Bible verse memorization with optional private account sync and backups.',
  '/tms60/',
  110,
  true
)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    path = excluded.path,
    sort_order = excluded.sort_order,
    active = excluded.active,
    updated_at = now();

insert into public.account_app_manifests (
  app_slug,
  manifest_version,
  identity_scope,
  data_scope,
  export_scope,
  capabilities
)
values (
  'tms60',
  1,
  'shared',
  'isolated',
  'app-owned',
  '{"account":true,"sharedIdentity":true,"isolatedData":true,"cloud_saves":true,"sync":true,"backups":true,"export_data":true,"delete_app_data":true,"activityTracking":true}'::jsonb
)
on conflict (app_slug) do update
set manifest_version = excluded.manifest_version,
    identity_scope = excluded.identity_scope,
    data_scope = excluded.data_scope,
    export_scope = excluded.export_scope,
    capabilities = excluded.capabilities,
    updated_at = now();
