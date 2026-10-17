import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=async name=>readFile(name,'utf8');

test('root PWA identity and Github Pages rollback authority unchanged',async()=>{
  const [index,manifestFile,worker,build,sourceSw,stagedSw,stageManifest,release]=await Promise.all([
    source('index.html'),source('manifest.webmanifest'),source('worker/src/index.js'),
    source('scripts/build-cloudflare-pages.mjs'),source('sw.js'),
    source('dist/sw.js'),source('dist/manifest.webmanifest'),source('.github/workflows/gated-pages-release.yml')
  ]);
  const manifest=JSON.parse(manifestFile),candidate=JSON.parse(stageManifest);
  for(const file of [manifest,candidate]){
    assert.equal(file.id,'/');assert.equal(file.scope,'/');
    assert.equal(file.start_url,'/');assert.equal(file.display,'standalone');
  }
  assert.deepEqual(candidate,manifest,'Staging must not rewrite installed app identity');
  assert.match(index,/<link rel="canonical" href="https:\/\/tms60\.thiepn\.dev\/">/);
  assert.match(index,/navigator\.serviceWorker\.register\('\/sw\.js',\{scope:'\/',updateViaCache:'none'\}\)/);
  assert.match(index,/const CANONICAL_ORIGIN='https:\/\/tms60\.thiepn\.dev'/);
  assert.match(sourceSw,/const RELEASE_INTEGRITY_SHA256=null;/);
  assert.match(stagedSw,/const RELEASE_INTEGRITY_SHA256='[a-f0-9]{64}';/);
  assert.match(release,/actions\/deploy-pages@v4/);
  assert.doesNotMatch(build,/deploy-pages@|wrangler deploy|cloudflare\/pages-projects/i);
  assert.match(worker,/ALLOWED_ORIGINS/);
  assert.equal(index,await source('dist/index.html'),'No environment-specific production hostname rewrite');
});

test('actual Bible Worker CORS function preserves canonical and HTTPS staging while rejecting Pages',async()=>{
  const worker=await source('worker/src/index.js');
  const begin=worker.indexOf('function allowedOrigins(env)');
  const end=worker.indexOf('function withCors(',begin);
  assert.ok(begin>=0&&end>begin,'Real Worker origin policy exists');
  const portion=worker.slice(begin,end);
  const actual=vm.runInNewContext(portion+
    "(origin,allowed)=>corsOrigin({headers:{get:name=>name==='Origin'?origin:null}},{ALLOWED_ORIGINS:allowed})",
    {URL});
  for(const host of ['https://tms60.thiepn.dev','https://preview-tms60.thiepn.dev'])
    assert.equal(actual(host,''),host,'Allowed HTTPS origin '+host);
  for(const origin of ['https://some-project.pages.dev','https://x.tms60.pages.dev',
    'https://evilthiepn.dev','https://tms60.thiepn.dev.attacker.test',
    'http://tms60.thiepn.dev','https://unknown.example.com'])
    assert.equal(actual(origin,''),null,'Disallowed Worker origin '+origin);
  assert.equal(actual('http://127.0.0.1:4173',''),'http://127.0.0.1:4173');
  assert.equal(actual('https://example.pages.dev','https://example.pages.dev'),
    'https://example.pages.dev','Explicit original ALLOWED_ORIGINS override stays functional');
});

test('OAuth PKCE callback remains rooted in the existing top-window origin and shared identity',async()=>{
  const [account,index]=await Promise.all([source('account-sync.js'),source('index.html')]);
  assert.match(account,/const SUPABASE_URL='https:\/\/hycegznamzjhwinegaai\.supabase\.co'/);
  assert.match(account,/const SESSION_STORAGE_KEY='sb-hycegznamzjhwinegaai-auth-token'/);
  assert.match(account,/const PREF_KEY='tms60-account-sync-prefs-v1'/);
  assert.match(account,/flowType:'pkce'/);
  assert.match(account,/detectSessionInUrl:false/);
  assert.match(account,/const redirect=new URL\(topWindow\.location\.href\)/);
  assert.match(account,/redirect\.searchParams\.set\('tms60_auth','1'\)/);
  assert.match(account,/redirectTo:redirect\.toString\(\)/);
  assert.match(account,/const callbackFlowId=url\.searchParams\.get\('sb_flow_id'\)/);
  assert.match(account,/exchangeCodeForSession\(code/);
  assert.match(account,/topWindow\.history\.replaceState/);
  assert.doesNotMatch(account,/pages\.dev|preview-tms60\.thiepn\.dev/);
  assert.ok(index.includes('https://tms60.thiepn.dev/'));
  const callback=new URL('https://tms60.thiepn.dev/');
  callback.searchParams.set('tms60_auth','1');
  assert.equal(callback.toString(),'https://tms60.thiepn.dev/?tms60_auth=1');
  assert.notEqual('https://preview-tms60.thiepn.dev/?tms60_auth=1',
    callback.toString(),'Staging account test needs separately authorized exact redirect');
});
