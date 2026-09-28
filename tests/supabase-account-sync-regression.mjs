import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read=(path)=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const account=read('account-sync.js');
const app=read('app.html');
const sw=read('sw.js');
const migration=read('supabase/migrations/20260928194925_tms60_account_sync.sql');
const translationMigration=read('supabase/migrations/20260928203152_tms60_translation_isolation_hardening.sql');
const deleteMigration=read('supabase/migrations/20260928203953_tms60_atomic_cloud_delete.sql');
const deleteGuardMigration=read('supabase/migrations/20260928204241_tms60_cloud_delete_identity_guard.sql');

const failures=[];
const pass=(ok,name,detail='')=>{
  console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);
  if(!ok)failures.push({name,detail});
};

const syntax=spawnSync(process.execPath,['--check',new URL('../account-sync.js',import.meta.url).pathname],{encoding:'utf8'});
pass(syntax.status===0,'account-sync.js parses',syntax.stderr.trim());

pass(account.includes("https://hycegznamzjhwinegaai.supabase.co"),'Uses canonical THIEPN Account Supabase project');
pass(account.includes("sb-hycegznamzjhwinegaai-auth-token"),'Uses shared THIEPN browser session key');
pass(account.includes("provider:'google'"),'Google sign-in is routed through Supabase Auth');
pass(account.includes("flowType:'pkce'"),'OAuth uses PKCE');
pass(account.includes("persistSession:true")&&account.includes("autoRefreshToken:true"),'Shared session persists and refreshes');
pass(account.includes("exchangeCodeForSession(code,flowId?{flowId}:undefined)"),'Top-level OAuth callback binds the explicit PKCE flow ID');
pass(account.includes("PKCE_BACKUP_KEY")&&account.includes("authStorage"),'PKCE verifier has a tab-scoped recovery mirror');
pass(account.includes("'sb_flow_id'"),'OAuth callback preserves and cleans the Supabase flow ID');
pass(account.includes("AbortSignal.timeout(15000)"),'Account network requests are time-bounded');
pass(account.includes("accountErrorMessage"),'Account failures are mapped to actionable user-facing errors');
pass(account.includes("window.top")||account.includes('topWindow'),'Iframe shell OAuth bridges to top-level navigation');

pass(account.includes("from('tms60_sync_state')"),'Sync uses TMS60-owned Supabase state table');
pass(account.includes("from('tms60_backups')"),'Backups use TMS60-owned Supabase backup table');
pass(account.includes("from('account_user_apps')"),'Account app usage is registered');
pass(account.includes("mergeStates(localBefore,remoteState)"),'Existing TMS60 merge semantics are retained');
pass(account.includes(".eq('revision',expectedRevision)"),'Cloud writes use optimistic revision concurrency');
pass((account.match(/\.eq\('translation_id',TRANSLATION_ID\)/g)||[]).length>=5,'All cloud read/update/backup paths scope the active Bible translation');
pass(account.includes("translation_id:TRANSLATION_ID"),'Cloud writes persist the active translation ID');
pass(account.includes("lastSyncByTranslation"),'Last-sync metadata is isolated per Bible translation');
pass(account.includes("MAX_CLOUD_STATE_BYTES=32*1024*1024")&&account.includes("assertCloudStateSize"),'Cloud state size is preflighted before database writes');
pass(account.includes('createRecoverySnapshot();')&&account.includes('setNewEpoch();'),'Restore preserves recovery and advances state epoch');
pass(account.includes('hasActiveSession()'),'Cloud merge/restore is blocked during active recall');
pass(account.includes('boundUserByTranslation')&&account.includes('accountMismatch'),'Local translation progress is protected from silent cross-account merging');
pass(account.includes("code:'account_changed'")&&account.includes('authEpoch'),'In-flight operations are invalidated when the shared account identity changes');
pass(account.includes("client.rpc('delete_tms60_cloud_data',{p_expected_user_id:userId})"),'Cloud deletion is atomic and bound to the initiating account');
pass(account.includes('prefs.autoSync=false'),'Deleting cloud data pauses auto-sync so deleted data is not recreated');
pass(account.indexOf('const selectedState=sanitizeState(data.state)')<account.indexOf('await createCloudBackup();'),'Selected restore data is fetched before retention can prune the oldest backup');
pass(account.includes('const coreSave=save;')&&account.includes('save=function()'),'Local-first save remains the primary write path');

pass(!/googleapis\.com\/drive|drive\.appdata|Google Identity Services/.test(account),'Standalone Google Drive sync is absent');
pass(!/service[_-]?role/i.test(account),'No Supabase service-role credential is referenced');
pass(!/secret/i.test(account.match(/SUPABASE_[A-Z_]+\s*=.*$/gm)?.join('\n')||''),'Only publishable Supabase client configuration is present');

pass(migration.includes('alter table public.tms60_sync_state enable row level security'),'Sync table has RLS');
pass(migration.includes('alter table public.tms60_backups enable row level security'),'Backup table has RLS');
pass((migration.match(/\(select auth\.uid\(\)\) = user_id/g)||[]).length>=6,'Owner policies bind rows to auth.uid()');
pass(migration.includes("identity_scope")&&migration.includes("'shared'"),'Account manifest declares shared identity');
pass(migration.includes("'isolated'"),'Account manifest declares isolated app data');
pass(migration.includes("'tms60'"),'TMS60 is registered in the account app registry');
pass(translationMigration.includes('translation_id')&&translationMigration.includes('primary key (user_id, translation_id)'),'Database state is isolated by account + Bible translation');
pass(translationMigration.includes('33554432'),'Database payload ceiling matches the 32 MB client safety limit');
pass(deleteMigration.includes('security invoker'),'Cloud deletion RPC preserves RLS/security-invoker semantics');
pass(deleteGuardMigration.includes('p_expected_user_id')&&deleteGuardMigration.includes('p_expected_user_id <> v_user_id'),'Destructive RPC rejects a mid-flight account identity mismatch');
pass(deleteGuardMigration.includes('revoke all')&&deleteGuardMigration.includes('grant execute')&&deleteGuardMigration.includes('authenticated'),'Destructive RPC has an explicit authenticated-only execute grant');

const vendorIndex=app.indexOf('<script src="./vendor/supabase-2.116.0.js"></script>');
const accountIndex=app.indexOf('<script src="./account-sync.js"></script>');
pass(vendorIndex>0&&accountIndex>vendorIndex,'Pinned Supabase SDK loads before account runtime');
pass(app.includes('Local-first and private'),'Legacy no-network account claim was replaced');
pass(sw.includes("'./vendor/supabase-2.116.0.js'")&&sw.includes("'./account-sync.js'"),'Service worker precaches account runtime');
pass(sw.includes('tms60-supabase-account43-2026-09-28'),'Service worker cache version advanced');

if(failures.length){
  console.error(`\n${failures.length} Supabase account regression check(s) failed.`);
  process.exit(1);
}
console.log('\nAll TMS60 Supabase account/sync/backup regression checks passed.');
