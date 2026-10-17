import test from 'node:test';
import assert from 'node:assert/strict';
import {cp, mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {stageStaticSite,HEADERS,PUBLIC_ROOT} from '../scripts/build-cloudflare-pages.mjs';
const ROOT=resolve('.');
const REQUIRED=['index.html','app.html','sw.js','manifest.webmanifest','niv-service.json','translations.js',
  'account-sync.js','icon-192.png','icon-512.png','vendor/supabase-2.116.0.js','vendor/LICENSE.supabase'];
async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'tms60-cf-'));
  await mkdir(join(dir,'vendor'));
  const sw=await readFile(join(ROOT,'sw.js'),'utf8');
  const core=JSON.parse('['+sw.match(/const CORE=\[([^\]]+)\]/)?.[1].replaceAll("'",'"')+']');
  const fixtures=[...new Set([...REQUIRED,...PUBLIC_ROOT,...core.filter(x=>x!=='./').map(x=>x.slice(2))])];
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
    // Newly introduced files must be explicitly reviewed before publication.
    await writeFile(join(root,'extra.js'),'window.extra=true');
    await assert.rejects(stageStaticSite(root),/unreviewed root web asset: extra.js/);
    await rm(join(root,'extra.js'));
    const stage=await stageStaticSite(root);
    for(const f of REQUIRED)assert.ok(stage.files.includes(f),'missing staged '+f);
    for(const f of ['CNAME','README.md','supabase','worker','.github','tests','scripts'])assert.ok(!stage.files.includes(f));
    assert.ok(!stage.files.includes('extra.js'));
    assert.equal(await readFile(join(root,'dist','_headers'),'utf8'),HEADERS);
    assert.ok(stage.files.includes('tms60-integrity.json'));
    assert.ok(stage.files.includes('404.html'));
    const integrity=await readFile(join(root,'dist','tms60-integrity.json'));
    const sealedWorker=await readFile(join(root,'dist','sw.js'),'utf8');
    const commitment=sealedWorker.match(/const RELEASE_INTEGRITY_SHA256='([a-f0-9]{64})'/)?.[1];
    assert.ok(commitment,'staged worker must seal a release');
    assert.equal(createHash('sha256').update(integrity).digest('hex'),commitment);
    assert.equal(JSON.parse(integrity).assets['app.html'],
      createHash('sha256').update(await readFile(join(root,'app.html'))).digest('hex'));
    for(const name of ['localization-safe.js','recall-reference-fix.js','vendor/LICENSE.supabase']){
      assert.equal(JSON.parse(integrity).assets[name],
        createHash('sha256').update(await readFile(join(root,name))).digest('hex'),
        'Non-CORE public asset must be release-sealed '+name);
    }
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
    const copy=await readFile(join(root,'dist','tms60-integrity.json'));
    assert.deepEqual(copy,integrity,'Rebuilding identical source must produce identical release integrity');
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
    await cp(join(ROOT,'sw.js'),join(root,'sw.js'));
    await rm(join(root,'enhancements-core.js'));
    await assert.rejects(stageStaticSite(root),/PWA offline dependency not staged/);
  }finally{await rm(root,{recursive:true,force:true})}
});
test('content changes create a different staged worker cache identity without altering source',async()=>{
  const root=await fixture();
  try{
    const first=await stageStaticSite(root);
    const workerA=await readFile(join(root,'dist','sw.js'),'utf8');
    const cacheA=workerA.match(/const CACHE='([^']+)'/)?.[1];
    const contentA=await readFile(join(root,'app.html'),'utf8');
    await writeFile(join(root,'app.html'),contentA+'\n<!-- REVIEW-ONLY CONTENT CHANGE -->\n');
    const second=await stageStaticSite(root);
    const workerB=await readFile(join(root,'dist','sw.js'),'utf8');
    const cacheB=workerB.match(/const CACHE='([^']+)'/)?.[1];
    assert.ok(cacheA&&cacheB);
    assert.notEqual(cacheA,cacheB,'Different bytes must never share an active install cache');
    assert.notEqual(await readFile(join(root,'dist','tms60-integrity.json'),'utf8'),null);
    const sourceWorker=await readFile(join(root,'sw.js'),'utf8');
    assert.match(sourceWorker,/const RELEASE_INTEGRITY_SHA256=null;/,
      'Staging must never write back to original service-worker source');
  }finally{await rm(root,{recursive:true,force:true})}
});
test('preview inspector refuses canonical origin before any network I/O',async()=>{
  const {spawnSync}=await import('node:child_process');
  const run=spawnSync(process.execPath,['scripts/check-cloudflare-preview.mjs'],{
    cwd:ROOT,encoding:'utf8',timeout:8000,
    env:{...process.env,TMS60_PREVIEW_URL:'https://tms60.thiepn.dev/'}
  });
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/Only loopback|Never test production|notEqual/);
});

test('an interrupted candidate preserves last qualified dist and cleans only owned temporary state',async()=>{
  const root=await fixture();
  try{
    await stageStaticSite(root);
    const before=await readFile(join(root,'dist','SHA256SUMS'));
    const original=await readFile(join(root,'dist','app.html'));
    await assert.rejects(stageStaticSite(root,{beforePublish:async({candidate,previous})=>{
      assert.equal(previous,join(root,'dist'));
      assert.ok((await readFile(join(candidate,'SHA256SUMS'))).length>200);
      assert.deepEqual(await readFile(join(previous,'SHA256SUMS')),before);
      throw Error('simulated disk/publish interruption');
    }}),/simulated disk\/publish interruption/);
    assert.deepEqual(await readFile(join(root,'dist','SHA256SUMS')),before);
    assert.deepEqual(await readFile(join(root,'dist','app.html')),original);
    const left=await readdir(root);
    assert.ok(!left.includes('.tms60-cloudflare-stage.lock'));
    assert.ok(!left.some(x=>x.startsWith('.tms60-cloudflare-candidate-')));
    assert.ok(!left.some(x=>x.startsWith('.tms60-cloudflare-previous-')));
  }finally{await rm(root,{recursive:true,force:true})}
});
test('overlapping stage calls fail closed instead of racing to delete published dist',async()=>{
  const root=await fixture();
  try{
    await stageStaticSite(root);
    const before=await readFile(join(root,'dist','SHA256SUMS'));
    let entered;
    const barrier=new Promise(resolve=>{entered=resolve});
    let release;
    const hold=new Promise(resolve=>{release=resolve});
    const writer=stageStaticSite(root,{beforePublish:async()=>{entered();await hold}});
    await barrier;
    await assert.rejects(stageStaticSite(root),/staging lock exists/);
    assert.deepEqual(await readFile(join(root,'dist','SHA256SUMS')),before);
    release();
    await writer;
    assert.deepEqual(await readFile(join(root,'dist','SHA256SUMS')),before);
    assert.ok(!(await readdir(root)).includes('.tms60-cloudflare-stage.lock'));
  }finally{await rm(root,{recursive:true,force:true})}
});
test('preexisting lock fails closed without clearing it or overwriting current dist',async()=>{
  const root=await fixture();
  try{
    await stageStaticSite(root);
    const snapshot=await readFile(join(root,'dist','SHA256SUMS'));
    await mkdir(join(root,'.tms60-cloudflare-stage.lock'));
    await writeFile(join(root,'.tms60-cloudflare-stage.lock','owner'),'manual review required');
    await assert.rejects(stageStaticSite(root),/staging lock exists/);
    assert.equal(await readFile(join(root,'.tms60-cloudflare-stage.lock','owner'),'utf8'),
      'manual review required');
    assert.deepEqual(await readFile(join(root,'dist','SHA256SUMS')),snapshot);
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
