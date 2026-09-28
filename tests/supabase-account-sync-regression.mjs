import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read=(path)=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const account=read('account-sync.js');
const app=read('app.html');
const sw=read('sw.js');
const migration=read('supabase/migrations/20260928194925_tms60_account_sync.sql');

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
pass(account.includes("exchangeCodeForSession(code)"),'Top-level OAuth callback exchanges through Supabase');
pass(account.includes("window.top")||account.includes('topWindow'),'Iframe shell OAuth bridges to top-level navigation');

pass(account.includes("from('tms60_sync_state')"),'Sync uses TMS60-owned Supabase state table');
pass(account.includes("from('tms60_backups')"),'Backups use TMS60-owned Supabase backup table');
pass(account.includes("from('account_user_apps')"),'Account app usage is registered');
pass(account.includes("mergeStates(localBefore,remoteState)"),'Existing TMS60 merge semantics are retained');
pass(account.includes(".eq('revision',expectedRevision)"),'Cloud writes use optimistic revision concurrency');
pass(account.includes('createRecoverySnapshot();')&&account.includes('setNewEpoch();'),'Restore preserves recovery and advances state epoch');
pass(account.includes('hasActiveSession()'),'Cloud merge/restore is blocked during active recall');
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
