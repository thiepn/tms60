-- Applied to the canonical THIEPN Account Supabase project as migration
-- 20260928203953_tms60_atomic_cloud_delete.
-- Deletes all TMS60 cloud state/backups for the authenticated account in one
-- transaction while preserving the shared THIEPN identity.

create or replace function public.delete_tms60_cloud_data()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_backups integer := 0;
  v_states integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  delete from public.tms60_backups
  where user_id = v_user_id;
  get diagnostics v_backups = row_count;

  delete from public.tms60_sync_state
  where user_id = v_user_id;
  get diagnostics v_states = row_count;

  return jsonb_build_object(
    'deleted_backups', v_backups,
    'deleted_sync_states', v_states
  );
end;
$$;

revoke all on function public.delete_tms60_cloud_data() from public, anon;
grant execute on function public.delete_tms60_cloud_data() to authenticated;
