-- Applied to the canonical THIEPN Account Supabase project as migration
-- 20260928205024_tms60_remove_redundant_sync_indexes.
-- Sync-state reads address the (user_id, translation_id) primary key directly,
-- so standalone updated_at indexes add write cost without serving a query.

drop index if exists public.tms60_sync_state_updated_at_idx;
drop index if exists public.tms60_sync_state_user_translation_updated_idx;
