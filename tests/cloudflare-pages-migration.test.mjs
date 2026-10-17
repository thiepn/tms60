import test from 'node:test';
import assert from 'node:assert/strict';
import {cp, mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {stageStaticSite,HEADERS} from '../scripts/build-cloudflare-pages.mjs';
const ROOT=resolve('.');
const REQUIRED=['index.html','app.html','sw.js','manifest.webmanifest','niv-service.json','translations.js',
  'account-sync.js','icon-192.png','icon-512.png','vendor/supabase-2.116.0.js','vendor/LICENSE.supabase'];
async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'tms60-cf-'));
  await mkdir(join(dir,'vendor'));
  const sw=await readFile(join(ROOT,'sw.js'),'utf8');
  const core=JSON.parse('['+sw.match(/const CORE=\[([^\]]+)\]/)?.[1].replaceAll("'",'"')+']');
  const fixtures=[...new Set([...REQUIRED,...core.filter(x=>x!=='./').map(x=>x.slice(2))])];
  for(const f of fixtures){
    if(f.includes('/'))await mkdir(join(dir,f.split('/')[0]),{recursive:true});
    await cp(join(ROOT,f),join(dir,f));
  }
  return dir;
}
test('static stage only includes browser files, not CNAME, SQL, worker or GitHub workflow',async()=>{
  const root=await fixture();
  try{
    await writeFile(join(root,'CNAME'),'tms60.thiepn.dev');
    await writeFile(join(root,'README.md'),'not for public stage');
    for(const folder of ['supabase','worker','.github','tests','scripts'])await mkdir(join(root,folder));
    await writeFile(join(root,'extra.js'),'window.extra=true');
    const stage=await stageStaticSite(root);
    for(const f of REQUIRED)assert.ok(stage.files.includes(f),'missing staged '+f);
    for(const f of ['CNAME','README.md','supabase','worker','.github','tests','scripts'])assert.ok(!stage.files.includes(f));
    assert.ok(stage.files.includes('extra.js'));
    assert.equal(await readFile(join(root,'dist','_headers'),'utf8'),HEADERS);
    const hashes=(await readFile(join(root,'dist','SHA256SUMS'),'utf8')).trim().split('\n');
    assert.ok(hashes.length>=REQUIRED.length+1);
    for(const row of hashes){
      const match=/^([a-f0-9]{64})  (.+)$/.exec(row);
      assert.ok(match,'invalid checksum row');
      const bytes=await readFile(join(root,'dist',match[2]));
      assert.equal(createHash('sha256').update(bytes).digest('hex'),match[1]);
    }
    assert.deepEqual(await readFile(join(root,'dist','app.html')),await readFile(join(root,'app.html')));
    const before=await readdir(join(root,'dist'));
    await stageStaticSite(root);
    assert.deepEqual(await readdir(join(root,'dist')),before);
  }finally{await rm(root,{recursive:true,force:true})}
});
test('rejects app-identity, translation-API and service worker drift',async()=>{
  const root=await fixture();
  try{
    const manifest=JSON.parse(await readFile(join(root,'manifest.webmanifest'),'utf8'));
    manifest.scope='/tms60/';
    await writeFile(join(root,'manifest.webmanifest'),JSON.stringify(manifest));
    await assert.rejects(stageStaticSite(root),/PWA app identity/);
    await cp(join(ROOT,'manifest.webmanifest'),join(root,'manifest.webmanifest'));
    await writeFile(join(root,'niv-service.json'),JSON.stringify({baseUrl:'https://other.example'}));
    await assert.rejects(stageStaticSite(root),/Bible Worker endpoint/);
    await cp(join(ROOT,'niv-service.json'),join(root,'niv-service.json'));
    await rm(join(root,'sw.js'));
    await assert.rejects(stageStaticSite(root),/missing sw.js/);
  }finally{await rm(root,{recursive:true,force:true})}
});
test('refuses asset/output symlinks',async()=>{
  const root=await fixture();
  try{
    await symlink('index.html',join(root,'unexpected.js'));
    await assert.rejects(stageStaticSite(root),/unsafe root public asset/);
    await rm(join(root,'unexpected.js'));
    await rm(join(root,'vendor'),{recursive:true});
    await symlink(ROOT+'/vendor',join(root,'vendor'));
    await assert.rejects(stageStaticSite(root),/vendored runtime folder/);
    await rm(join(root,'vendor'));
    await mkdir(join(root,'vendor'));
    await cp(join(ROOT,'vendor/supabase-2.116.0.js'),join(root,'vendor/supabase-2.116.0.js'));
    await cp(join(ROOT,'vendor/LICENSE.supabase'),join(root,'vendor/LICENSE.supabase'));
    await symlink('vendor',join(root,'dist'));
    await assert.rejects(stageStaticSite(root),/dist is symlink/);
  }finally{await rm(root,{recursive:true,force:true})}
});
test('original GitHub release, THIEPN Account keys and Worker CORS remain authoritative',async()=>{
  const read=f=>readFile(join(ROOT,f),'utf8');
  const release=await read('.github/workflows/gated-pages-release.yml');
  const check=await read('.github/workflows/cloudflare-pages-migration-readiness.yml');
  const account=await read('account-sync.js');
  const worker=await read('worker/src/index.js');
  assert.match(release,/actions\/deploy-pages@v4/);
  assert.match(check,/pull_request:/);
  assert.doesNotMatch(check,/wrangler deploy|deploy-pages@|CLOUDFLARE_API_TOKEN/);
  assert.match(account,/sb-hycegznamzjhwinegaai-auth-token/);
  assert.match(account,/tms60-account-sync-prefs-v1/);
  assert.match(worker,/url\.hostname\.endsWith\('\.thiepn\.dev'\)/);
  assert.match(HEADERS,/\/sw\.js\n  Cache-Control: no-store/);
});
