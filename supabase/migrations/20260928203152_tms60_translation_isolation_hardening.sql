-- Applied to the canonical THIEPN Account Supabase project as migration
-- 20260928203152_tms60_translation_isolation_hardening.
-- Separates cloud state/backups by Bible translation and aligns cloud payload
-- limits with TMS60's sanitized/importable state ceiling.

alter table public.tms60_sync_state
  add column if not exists translation_id text not null default 'esv';

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid='public.tms60_sync_state'::regclass
      and conname='tms60_sync_state_pkey'
  ) then
    alter table public.tms60_sync_state drop constraint tms60_sync_state_pkey;
  end if;
end $$;

alter table public.tms60_sync_state
  add constraint tms60_sync_state_pkey primary key (user_id, translation_id);

alter table public.tms60_sync_state
  add constraint tms60_sync_state_translation_id_check
  check (translation_id ~ '^[a-z0-9][a-z0-9_-]{1,39}$');

alter table public.tms60_backups
  add column if not exists translation_id text not null default 'esv';

alter table public.tms60_backups
  add constraint tms60_backups_translation_id_check
  check (translation_id ~ '^[a-z0-9][a-z0-9_-]{1,39}$');

alter table public.tms60_sync_state
  drop constraint if exists tms60_sync_state_size;
alter table public.tms60_sync_state
  add constraint tms60_sync_state_size
  check (octet_length(state::text) <= 33554432);

alter table public.tms60_backups
  drop constraint if exists tms60_backups_state_size;
alter table public.tms60_backups
  add constraint tms60_backups_state_size
  check (octet_length(state::text) <= 33554432);

drop index if exists public.tms60_backups_user_created_idx;
create index if not exists tms60_backups_user_translation_created_idx
  on public.tms60_backups (user_id, translation_id, created_at desc);

create index if not exists tms60_sync_state_user_translation_updated_idx
  on public.tms60_sync_state (user_id, translation_id, updated_at desc);
