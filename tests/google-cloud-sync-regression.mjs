import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const app=read('app.html');
const cloud=read('cloud-sync.js');
const config=read('cloud-config.js');
const sw=read('sw.js');
const setup=read('GOOGLE_SYNC_SETUP.md');

const failures=[];
const pass=(ok,name,detail='')=>{
  console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);
  if(!ok)failures.push({name,detail});
};

const syntax=spawnSync(process.execPath,['--check',new URL('../cloud-sync.js',import.meta.url).pathname],{encoding:'utf8'});
pass(syntax.status===0,'cloud-sync.js parses as JavaScript',syntax.stderr.trim());

pass(config.includes("googleClientId: ''"),'OAuth is fail-closed until a client ID is configured');
pass(!/clientSecret|client_secret|CLIENT_SECRET/.test(config+cloud),'No Google client secret is embedded');
pass(cloud.includes('https://www.googleapis.com/auth/drive.appdata'),'OAuth scope is limited to Drive app data');
pass(!cloud.includes('https://www.googleapis.com/auth/drive '),'Broad Drive scope is not requested');
pass(cloud.includes("parents:['appDataFolder']"),'Uploads target Drive appDataFolder');
pass(cloud.includes("spaces:'appDataFolder'"),'Cloud lookup is restricted to appDataFolder');

const localWrites=[...cloud.matchAll(/localStorage\.setItem\(([^\n;]+)/g)].map(match=>match[1]);
pass(localWrites.length===1&&localWrites[0].startsWith('PREF_KEY'),'Only non-token cloud preferences are persisted locally',localWrites.join(' | '));
pass(!/localStorage\.setItem\([^\n]*(token|access_token)/i.test(cloud),'Access tokens are never written to localStorage');
pass(cloud.includes('let token=null')&&cloud.includes('tokenExpiresAt'),'OAuth access token is memory-only');

pass(cloud.includes('const baseSave=save;')&&cloud.includes('save=function()'),'Cloud sync hooks after the existing local save path');
pass(cloud.includes('mergeStates(state,remote.state)'),'Cloud/local progress uses existing deterministic merge logic');
pass(cloud.includes('createRecoverySnapshot();'),'Cloud merge/restore preserves local recovery snapshots');
pass(cloud.includes('setNewEpoch();'),'Intentional cloud restore advances state epoch');
pass(cloud.includes('await createCloudBackup();'),'Restore protects the pre-restore state with a cloud backup');
pass(cloud.includes('if(hasActiveSession())'),'Cloud merge/restore is guarded during active recall');

const configIndex=app.indexOf('<script src="./cloud-config.js"></script>');
const runtimeIndex=app.indexOf('<script src="./cloud-sync.js"></script>');
pass(configIndex>0&&runtimeIndex>configIndex,'Cloud configuration loads before cloud runtime');
pass(app.includes('Local-first and private'),'Legacy no-network privacy claim was replaced');
pass(app.includes('optional Google sync'),'Settings copy reflects optional cloud sync');

pass(sw.includes("'./cloud-config.js'")&&sw.includes("'./cloud-sync.js'"),'Service worker precaches cloud runtime');
pass(sw.includes("tms60-google-sync43-2026-09-28"),'Service-worker cache version was advanced');

pass(setup.includes('Authorized JavaScript origins'),'OAuth setup documents authorized JavaScript origins');
pass(setup.includes('https://www.googleapis.com/auth/drive.appdata'),'Setup guide documents the exact Drive scope');
pass(setup.includes('Do **not** commit a Google client secret'),'Setup guide prohibits client-secret deployment');

if(failures.length){
  console.error(`\n${failures.length} Google sync regression check(s) failed.`);
  process.exit(1);
}
console.log('\nAll Google account/sync/backup regression checks passed.');
