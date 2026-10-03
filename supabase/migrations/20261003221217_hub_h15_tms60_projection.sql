-- H15 staged TMS60 projection. Requires H12/H13 canonical Account migration.
-- No OAuth client registration or enablement.

create table private.account_hub_tms60_consent (
  user_id uuid not null references auth.users(id) on delete cascade,
  translation_id text not null check (translation_id in ('esv','niv','nlt','hfa','schlachter1951','klb1985','krv1961')),
  primary key(user_id,translation_id),
  permissions text[] not null default '{}',
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  check (permissions <@ array['tms60.hub.summary.read','tms60.hub.continue.read','tms60.hub.search.read']::text[])
);
alter table private.account_hub_tms60_consent enable row level security;
revoke all on private.account_hub_tms60_consent from public, anon, authenticated;

create function public.get_thiepn_hub_tms60_consent(p_translation text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null or auth.jwt()->>'client_id' is not null or p_translation is null or p_translation not in ('esv','niv','nlt','hfa','schlachter1951','klb1985','krv1961') then
    raise exception 'hub_consent_denied' using errcode='42501';
  end if;
  select jsonb_build_object('permissions', c.permissions, 'revision', c.revision)
    into v_result from private.account_hub_tms60_consent c where c.user_id=v_uid and c.translation_id=p_translation;
  return coalesce(v_result, jsonb_build_object('permissions','[]'::jsonb,'revision',null));
end $$;

create function public.set_thiepn_hub_tms60_consent(p_translation text, p_permissions text[], p_expected_revision uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_revision uuid; v_permissions text[];
begin
  if v_uid is null or auth.jwt()->>'client_id' is not null or p_translation is null or p_translation not in ('esv','niv','nlt','hfa','schlachter1951','klb1985','krv1961') then
    raise exception 'hub_consent_denied' using errcode='42501';
  end if;
  if p_permissions is null or cardinality(p_permissions)>3 or
     array_position(p_permissions,null) is not null or
     not (p_permissions <@ array['tms60.hub.summary.read','tms60.hub.continue.read','tms60.hub.search.read']::text[]) then
    raise exception 'hub_consent_invalid' using errcode='22023';
  end if;
  select coalesce(array_agg(distinct p order by p),'{}') into v_permissions from unnest(p_permissions) p;
  -- Revocation remains available during account deletion.
  if cardinality(v_permissions)>0 then
    perform private.account_assert_not_deletion_pending();
    if not exists(select 1 from auth.users u where u.id=v_uid and u.deleted_at is null and not u.is_anonymous and (u.banned_until is null or u.banned_until<=now())) then
      raise exception 'hub_account_restricted' using errcode='42501';
    end if;
    if not exists(select 1 from public.account_app_connections c where c.user_id=v_uid and c.app_slug='tms60' and c.status='connected') or
       not exists(select 1 from public.account_app_grants g where g.user_id=v_uid and g.app_slug='tms60' and g.permission_id='app_data.read' and g.status='granted') then
      raise exception 'hub_tms60_unavailable' using errcode='42501';
    end if;
  end if;
  -- Serializes both first-time saves and updates for this owner only.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 15015));
  select c.revision into v_revision from private.account_hub_tms60_consent c where c.user_id=v_uid and c.translation_id=p_translation for update;
  if v_revision is distinct from p_expected_revision then
    raise exception 'hub_consent_changed' using errcode='40001';
  end if;
  insert into private.account_hub_tms60_consent(user_id,translation_id,permissions) values(v_uid,p_translation,v_permissions)
  on conflict(user_id,translation_id) do update set permissions=excluded.permissions, revision=gen_random_uuid(),updated_at=now();
  return public.get_thiepn_hub_tms60_consent(p_translation);
end $$;

create function public.authorize_thiepn_hub_tms60(p_operation text, p_revision uuid, p_translation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_claims jsonb := auth.jwt(); v_permissions text[]; v_exp numeric;
begin
  if v_uid is null or v_claims->>'aud' is distinct from 'authenticated' or
     v_claims->>'role' is distinct from 'authenticated' or
     v_claims->>'is_anonymous'='true' or
     p_operation not in ('summary','continue','search') or p_operation is null then
    return null;
  end if;
  if not exists(select 1 from private.account_hub_clients c where c.client_id::text=v_claims->>'client_id' and c.enabled) then return null; end if;
  if not exists(select 1 from auth.users u where u.id=v_uid and u.deleted_at is null and not u.is_anonymous and (u.banned_until is null or u.banned_until<=now())) then return null; end if;
  -- JWT authenticity is provided by PostgREST; current state is checked here.
  if not exists(select 1 from auth.sessions s where s.user_id=v_uid and s.id::text=v_claims->>'session_id' and (s.not_after is null or s.not_after>now())) then return null; end if;
  if exists(select 1 from public.account_deletion_requests r where r.user_id=v_uid and r.status in ('pending','deleting')) then return null; end if;
  if not exists(select 1 from public.account_app_connections c where c.user_id=v_uid and c.app_slug='tms60' and c.status='connected') or
     not exists(select 1 from public.account_app_grants g where g.user_id=v_uid and g.app_slug='tms60' and g.permission_id='app_data.read' and g.status='granted') then return null; end if;
  select c.permissions into v_permissions from private.account_hub_tms60_consent c where c.user_id=v_uid and c.translation_id=p_translation and c.revision=p_revision;
  if v_permissions is null or not ('tms60.hub.'||p_operation||'.read'=any(v_permissions)) then return null; end if;
  if coalesce(v_claims->>'exp','') !~ '^[0-9]{1,12}$' then return null; end if;
  v_exp := (v_claims->>'exp')::numeric;
  if v_exp <= extract(epoch from now()) then return null; end if;
  return jsonb_build_object('accountId',v_uid,'consumer','thiepn-hub','audience','tms60-hub',
    'permissions',v_permissions,'grantRevision',p_revision,'expiresAt',v_exp*1000,
    'accountState','active','translationId',p_translation);
end $$;
revoke all on function public.get_thiepn_hub_tms60_consent(text), public.set_thiepn_hub_tms60_consent(text,text[],uuid), public.authorize_thiepn_hub_tms60(text,uuid,text) from public,anon,authenticated;
grant execute on function public.get_thiepn_hub_tms60_consent(text), public.set_thiepn_hub_tms60_consent(text,text[],uuid), public.authorize_thiepn_hub_tms60(text,uuid,text) to authenticated;

-- Disconnect or loss of the underlying Notes entitlement permanently revokes
-- Hub consent. Reconnecting Notes does not resurrect an earlier grant/revision.
create function private.revoke_hub_tms60_on_entitlement_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb; v_revoke boolean := false;
begin
  v_row := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if v_row->>'app_slug'='tms60' then
    if tg_table_name='account_app_connections' then
      v_revoke := tg_op='DELETE' or v_row->>'status' is distinct from 'connected';
    elsif tg_table_name='account_app_grants' and v_row->>'permission_id'='app_data.read' then
      v_revoke := tg_op='DELETE' or v_row->>'status' is distinct from 'granted';
    end if;
  end if;
  if v_revoke then
    update private.account_hub_tms60_consent set permissions='{}', revision=gen_random_uuid(),updated_at=now()
      where user_id=(v_row->>'user_id')::uuid;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.revoke_hub_tms60_on_entitlement_change() from public,anon,authenticated;
create trigger hub_tms60_connection_revocation after update of status or delete on public.account_app_connections
for each row execute function private.revoke_hub_tms60_on_entitlement_change();
create trigger hub_tms60_entitlement_revocation after update of status or delete on public.account_app_grants
for each row execute function private.revoke_hub_tms60_on_entitlement_change();



create table private.account_hub_tms60_budget (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_started_at timestamptz not null,
 requests integer not null check(requests between 1 and 60)
);
alter table private.account_hub_tms60_budget enable row level security;
revoke all on private.account_hub_tms60_budget from public,anon,authenticated;
create policy tms60_sync_no_oauth_raw on public.tms60_sync_state as restrictive for all to authenticated
 using(auth.jwt()->>'client_id' is null) with check(auth.jwt()->>'client_id' is null);
create policy tms60_backups_no_oauth_raw on public.tms60_backups as restrictive for all to authenticated
 using(auth.jwt()->>'client_id' is null) with check(auth.jwt()->>'client_id' is null);

-- Existing restore is a definer and would otherwise bypass restrictive RLS.
-- Keep its implementation and public signature, but confine execution to a
-- first-party-only wrapper. No changes to restoration semantics.
alter function public.restore_thiepn_tms60_backup(uuid) set schema private;
revoke all on function private.restore_thiepn_tms60_backup(uuid) from public,anon,authenticated;
create function public.restore_thiepn_tms60_backup(p_backup_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.jwt()->>'client_id' is not null then
  raise exception 'not_authenticated' using errcode='42501';
 end if;
 return private.restore_thiepn_tms60_backup(p_backup_id);
end $$;
revoke all on function public.restore_thiepn_tms60_backup(uuid) from public,anon,authenticated;
grant execute on function public.restore_thiepn_tms60_backup(uuid) to authenticated;

-- Pure owner projection, shared by hosted read API and SQL fixture tests.
-- Input is never returned. Only the 60 canonical progress entries are visited.
create function private.project_hub_tms60(p_state jsonb,p_translation text,p_operation text,p_query text,p_now_ms bigint,p_source_at timestamptz)
returns jsonb language plpgsql immutable set search_path='' as $$
declare
 v_id integer; v_p jsonb; v_s jsonb; v_stage integer; v_dim text;
 v_due_w boolean; v_due_r boolean; v_due_tasks integer:=0; v_due_verses integer:=0; v_new integer:=0;
 v_rows jsonb:='[]'; v_items jsonb; v_last bigint; v_title text;
 v_refs jsonb:='["2 Corinthians 5:17", "Galatians 2:20", "Romans 12:1", "John 14:21", "2 Timothy 3:16-17", "Joshua 1:8", "John 15:7", "Philippians 4:6-7", "Matthew 18:20", "Hebrews 10:24-25", "Matthew 4:19", "Romans 1:16", "Romans 3:23", "Isaiah 53:6", "Romans 6:23", "Hebrews 9:27", "Romans 5:8", "1 Peter 3:18", "Ephesians 2:8-9", "Titus 3:5", "John 1:12", "Revelation 3:20", "1 John 5:13", "John 5:24", "1 Corinthians 3:16", "1 Corinthians 2:12", "Isaiah 41:10", "Philippians 4:13", "Lamentations 3:22-23", "Numbers 23:19", "Isaiah 26:3", "1 Peter 5:7", "Romans 8:32", "Philippians 4:19", "Hebrews 2:18", "Psalm 119:9-11", "Matthew 6:33", "Luke 9:23", "1 John 2:15-16", "Romans 12:2", "1 Corinthians 15:58", "Hebrews 12:3", "Mark 10:45", "2 Corinthians 4:5", "Proverbs 3:9-10", "2 Corinthians 9:6-7", "Acts 1:8", "Matthew 28:19-20", "John 13:34-35", "1 John 3:18", "Philippians 2:3-4", "1 Peter 5:5-6", "Ephesians 5:3", "1 Peter 2:11", "Leviticus 19:11", "Acts 24:16", "Hebrews 11:6", "Romans 4:20-21", "Galatians 6:9-10", "Matthew 5:16"]'::jsonb;
begin
 if jsonb_typeof(p_state->'progress') is distinct from 'object' then return null; end if;
 for v_id in 1..60 loop
  v_p:=p_state->'progress'->v_id::text;
  if v_p is null or jsonb_typeof(v_p) is distinct from 'object' or jsonb_typeof(v_p->'stage') is distinct from 'number' or (v_p->>'stage') !~ '^[0-6]$' then return null; end if;
  v_stage:=(v_p->>'stage')::integer;
  v_due_w:=false;v_due_r:=false;
  foreach v_dim in array array['wording','reference'] loop
   v_s:=v_p->v_dim;
   if jsonb_typeof(v_s) is distinct from 'object' or v_s->>'phase' is null or v_s->>'phase' not in ('new','learning','relearning','review') or jsonb_typeof(v_s->'due') is distinct from 'number' or (v_s->>'due') !~ '^[0-9]{1,16}$' or (v_s->>'due')::numeric>9007199254740991 then return null; end if;
   if v_stage=6 and v_s->>'phase'<>'new' and (v_s->>'due')::bigint<=p_now_ms then
    if v_dim='wording' then v_due_w:=true;else v_due_r:=true;end if;
   end if;
  end loop;
  if v_stage=0 then v_new:=v_new+1;end if;
  if v_due_w or v_due_r then v_due_verses:=v_due_verses+1;end if;
  v_due_tasks:=v_due_tasks+v_due_w::integer+v_due_r::integer;
  if jsonb_typeof(v_p->'lastReviewed') is distinct from 'number' or (v_p->>'lastReviewed') !~ '^[0-9]{1,16}$' or (v_p->>'lastReviewed')::numeric>p_now_ms then return null;end if;
  v_last:=(v_p->>'lastReviewed')::bigint;v_title:=v_refs->>(v_id-1);
  foreach v_dim in array array['wording','reference','learning'] loop
   if (p_operation='summary' and ((v_dim='wording' and v_due_w) or (v_dim='reference' and v_due_r))) or
      (p_operation in ('continue','search') and
        (v_dim=case when v_stage<6 then 'learning' else case when coalesce((v_p->'reference'->>'lastReviewed')::numeric,0)>coalesce((v_p->'wording'->>'lastReviewed')::numeric,0) then 'reference' else 'wording' end end) and
        (p_operation='search' and position(lower(btrim(p_query)) in lower(v_title))>0 or p_operation='continue' and v_last>0)) then
     v_rows:=v_rows||jsonb_build_array(jsonb_build_object('resourceId',p_translation||':'||v_id||':'||v_dim,'title',v_title,'dimension',v_dim,
       'updatedAt',to_char(case when v_last>0 then to_timestamp(v_last/1000.0) else p_source_at end at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
   end if;
  end loop;
 end loop;
 select coalesce(jsonb_agg(r.item),'[]') into v_items from (
  select item from jsonb_array_elements(v_rows) item order by case when p_operation='continue' then item->>'updatedAt' else null end desc,item->>'resourceId'
  limit case when p_operation='search' then 20 else 10 end
 ) r;
 if p_operation='summary' then return jsonb_build_object('items',v_items,'dueTaskCount',v_due_tasks,'dueVerseCount',v_due_verses,'newVerseCount',v_new);end if;
 return jsonb_build_object('items',v_items);
end $$;
revoke all on function private.project_hub_tms60(jsonb,text,text,text,bigint,timestamptz) from public,anon,authenticated;

create function public.read_thiepn_hub_tms60(p_operation text,p_revision uuid,p_translation text,p_request_id uuid,p_query text default null)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='200ms' set statement_timeout='1s' as $$
declare v_uid uuid:=auth.uid();v_auth jsonb;v_source public.tms60_sync_state%rowtype;v_data jsonb;v_status text;v_budget integer;v_now timestamptz:=clock_timestamp();v_exp timestamptz;
begin
 if p_operation is null or p_operation not in ('summary','continue','search') or p_request_id is null or
 (p_operation='search' and (p_query is null or char_length(p_query)>256 or btrim(p_query)='' or p_query ~ '[[:cntrl:]]')) or
 (p_operation<>'search' and p_query is not null) then raise exception 'projection_unavailable' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text,15015));
 perform 1 from private.account_hub_tms60_consent where user_id=v_uid and translation_id=p_translation for share;
 v_auth:=public.authorize_thiepn_hub_tms60(p_operation,p_revision,p_translation);
 if v_auth is null then raise exception 'projection_unavailable' using errcode='42501';end if;
 insert into private.account_hub_tms60_budget(user_id,window_started_at,requests) values(v_uid,v_now,1)
 on conflict(user_id) do update set
 window_started_at=case when private.account_hub_tms60_budget.window_started_at<=v_now-interval '1 minute' then v_now else private.account_hub_tms60_budget.window_started_at end,
 requests=case when private.account_hub_tms60_budget.window_started_at<=v_now-interval '1 minute' then 1 else private.account_hub_tms60_budget.requests+1 end
 where private.account_hub_tms60_budget.window_started_at<=v_now-interval '1 minute' or private.account_hub_tms60_budget.requests<60 returning requests into v_budget;
 if v_budget is null then raise exception 'projection_unavailable' using errcode='54000';end if;
 select * into v_source from public.tms60_sync_state where user_id=v_uid and translation_id=p_translation;
 if not found then v_status:='unconnected';
 elsif v_source.state_schema<>6 then v_status:='unsupported';
 else
  v_data:=private.project_hub_tms60(v_source.state,p_translation,p_operation,p_query,floor(extract(epoch from v_now)*1000)::bigint,v_source.updated_at);
  if v_data is null then v_status:='unsupported';
  elsif jsonb_array_length(v_data->'items')>0 or coalesce((v_data->>'dueTaskCount')::integer,0)>0 or coalesce((v_data->>'newVerseCount')::integer,0)>0 then v_status:='ready';else v_status:='empty';end if;
 end if;
 if public.authorize_thiepn_hub_tms60(p_operation,p_revision,p_translation) is null then raise exception 'projection_unavailable' using errcode='42501';end if;
 v_exp:=least(v_now+interval '5 minutes',to_timestamp((v_auth->>'expiresAt')::numeric/1000));
 return jsonb_build_object('schemaVersion',1,'providerId','tms60','operation',p_operation,'requestId',p_request_id,
 'context',jsonb_build_object('scope','account','accountId',v_uid,'workspaceId',null,'grantRevision',p_revision,'translationId',p_translation),
 'status',v_status,'privacy','private','coverage','translation-cloud-snapshot',
 'observedAt',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'expiresAt',to_char(v_exp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'sourceUpdatedAt',case when v_source.updated_at is null then null else to_char(v_source.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,'data',v_data);
end $$;
revoke all on function public.read_thiepn_hub_tms60(text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.read_thiepn_hub_tms60(text,uuid,text,uuid,text) to authenticated;
