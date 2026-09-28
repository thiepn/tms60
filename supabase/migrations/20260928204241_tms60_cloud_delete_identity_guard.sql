-- Applied to the canonical THIEPN Account Supabase project as migration
-- 20260928204241_tms60_cloud_delete_identity_guard.
-- Requires the caller to name the user identity the destructive operation
-- started under, preventing a shared-session switch from deleting another
-- account's TMS60 data mid-request.

drop function if exists public.delete_tms60_cloud_data();

create function public.delete_tms60_cloud_data(p_expected_user_id uuid)
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

  if p_expected_user_id is null or p_expected_user_id <> v_user_id then
    raise exception 'account changed before deletion' using errcode = '42501';
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

revoke all on function public.delete_tms60_cloud_data(uuid) from public, anon;
grant execute on function public.delete_tms60_cloud_data(uuid) to authenticated;
