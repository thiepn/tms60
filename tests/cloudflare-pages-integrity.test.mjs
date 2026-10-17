import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {join} from 'node:path';
import vm from 'node:vm';

// This validates the ACTUAL generated worker, not the source-only sentinel.
const root='dist',sw=readFileSync(join(root,'sw.js'),'utf8');
const json=readFileSync(join(root,'tms60-integrity.json'));
const committed=sw.match(/const RELEASE_INTEGRITY_SHA256='([a-f0-9]{64})'/)?.[1];
assert.ok(committed,'Staged worker must contain a 64-digit release commitment');
assert.equal(createHash('sha256').update(json).digest('hex'),committed);
const release=JSON.parse(json.toString('utf8'));
const cache=sw.match(/const CACHE='([^']+)'/)?.[1];
assert.equal(release.schema,1);
assert.equal(release.cache,cache);
const core=JSON.parse('['+sw.match(/const CORE=\[([^\]]+)\]/)?.[1].replaceAll("'",'"')+']');
const paths=[...new Set(core.map(p=>p==='./'?'index.html':p.slice(2)))];
assert.ok(Object.keys(release.assets).length>=paths.length,
  'Integrity manifest covers at least all original offline CORE');
for(const path of Object.keys(release.assets)){
  assert.ok(paths.includes(path)||['localization-safe.js','recall-reference-fix.js',
    'vendor/LICENSE.supabase'].includes(path),'Unexpected public asset '+path);
  const hash=createHash('sha256').update(readFileSync(join(root,path))).digest('hex');
  assert.equal(release.assets[path],hash,'Recorded CORE hash mismatch '+path);
}

function simulate({previous=false,tamper='',manifestTamper=false,manifestMissing=false}={}){
  const origin='https://stage.example.test/',handlers=new Map(),stores=new Map();
  let skips=0,activeTamper=tamper,offline=false;
  const norm=v=>new URL(v instanceof Request?v.url:String(v),origin).href;
  function getStore(name){
    if(!stores.has(name))stores.set(name,new Map());
    const map=stores.get(name);
    return {put:async(r,v)=>map.set(norm(r),v.clone()),match:async r=>map.get(norm(r))?.clone()};
  }
  const caches={open:async n=>getStore(n),keys:async()=>[...stores.keys()],
    delete:async n=>stores.delete(n)};
  if(previous){
    getStore('tms60-earlier-2026-10-01');
    stores.get('tms60-earlier-2026-10-01').set(origin+'index.html',new Response('PRIOR-SHELL'));
  }
  const fetch=async input=>{
    if(offline)throw new TypeError('simulated network outage');
    const url=new URL(norm(input));
    if(url.pathname==='/tms60-integrity.json'){
      if(manifestMissing)return new Response('missing',{status:404});
      return new Response(manifestTamper?'{"invalid":true}':json,{status:200});
    }
    if(url.pathname==='/index.html'||url.pathname==='/app.html')
      return new Response(null,{status:308,headers:{Location:url.pathname==='/app.html'?'/app':'/'}});
    let name=url.pathname==='/'?'index.html':url.pathname==='/app'?'app.html':url.pathname.slice(1);
    if(!Object.hasOwn(release.assets,name))return new Response('Not found',{status:404});
    const payload=activeTamper===name?Buffer.from('MISMATCH-BUT-HTTP-200'):readFileSync(join(root,name));
    return new Response(payload,{status:200});
  };
  const self={location:new URL(origin+'sw.js'),addEventListener:(name,fn)=>handlers.set(name,fn),
    skipWaiting:async()=>{skips++},clients:{claim:async()=>{}}};
  vm.runInNewContext(sw,{self,location:self.location,caches,fetch,
    Request,Response,URL,Promise,console,crypto:webcrypto,TextDecoder},{filename:'staged-sw.js'});
  return {
    stores,get skips(){return skips},
    setTamper(next){activeTamper=next},
    setOffline(next){offline=next},
    async fetchPath(path,options={}){
      let response;
      const pending=[];
      handlers.get('fetch')({
        request:new Request(new URL(path,origin),options),
        respondWith(next){response=Promise.resolve(next)},
        waitUntil(next){pending.push(Promise.resolve(next))}
      });
      assert.ok(response,'Service worker did not handle '+path);
      const delivered=await response;
      await Promise.all(pending);
      return delivered;
    },
    async message(type){
      let reply;
      let done;
      handlers.get('message')({
        data:{type},ports:[{postMessage(value){reply=value}}],
        waitUntil(p){done=Promise.resolve(p)}
      });
      await done;
      return reply;
    },
    async install(){
    let pending;
    handlers.get('install')({waitUntil(p){pending=Promise.resolve(p)}});
    assert.ok(pending,'No install promise');
    return pending;
  }};
}
const verified=simulate();
await verified.install();
assert.equal(verified.skips,1);
assert.equal(verified.stores.get(cache).size,core.length+1,
  'Candidate cache includes CORE and its independently verified manifest');
const staged=verified.stores.get(cache);
assert.equal((await verified.fetchPath('/app')).ok,true,
  'Cloudflare pretty /app fetch must use the pinned original app.html cache');
verified.setTamper('app.html');
const pinnedPretty=await verified.fetchPath('/app');
assert.equal(pinnedPretty.ok,true,'Mixed-release pretty /app response must not replace CORE');
assert.equal(Buffer.from(await pinnedPretty.arrayBuffer()).equals(readFileSync(join(root,'app.html'))),true,
  'Non-navigation /app returns exact installed app bytes, never mixed CDN code');
verified.setTamper('');
for(const target of ['/app','/app.html','/index.html','/manifest.webmanifest',
  '/localization-safe.js']){
  const partial=await verified.fetchPath(target,{headers:{Range:'bytes=0-9'}});
  assert.equal(partial.type,'error','Integrity-sealed asset must reject unverified partial request '+target);
}
assert.ok(staged.has('https://stage.example.test/tms60-integrity.json'));

// A 200 OK response with bytes from a different rollout cannot refill a missing
// installed code asset, including via the user-initiated offline repair flow.
staged.delete('https://stage.example.test/app.html');
verified.setTamper('app.html');
assert.equal((await verified.fetchPath('/app')).type,'error',
  'A missing app.html must not be reintroduced via the /app alias');
const refused=await verified.fetchPath('app.html');
assert.equal(refused.type,'error','Unverified cache miss must fail closed');
assert.equal((await verified.message('TMS60_PREPARE_OFFLINE')).ready,false,
  'Corrupt CDN response cannot repair the sealed PWA cache');
assert.ok(!staged.has('https://stage.example.test/app.html'));

verified.setTamper('');
const repaired=await verified.message('TMS60_PREPARE_OFFLINE');
assert.equal(repaired.ok,true);
assert.equal(repaired.ready,true,'Valid asset bytes repair the missing CORE');
assert.ok(staged.has('https://stage.example.test/app.html'));

// A cached entry that was later corrupted must also be rejected at runtime.
staged.set('https://stage.example.test/app.html',new Response('POISONED-CACHE'));
verified.setTamper('app.html');
assert.equal((await verified.message('TMS60_OFFLINE_STATUS')).ready,false);
assert.equal((await verified.fetchPath('app.html')).type,'error',
  'A corrupted cached asset cannot be served or refilled with mismatched bytes');
verified.setTamper('');
assert.equal((await verified.fetchPath('app.html')).ok,true,
  'Validated recovery may replace corrupted cached bytes');
verified.setOffline(true);
assert.equal((await verified.message('TMS60_OFFLINE_STATUS')).ready,true,
  'Verified manifest survives offline worker restarts and status checks');
verified.setOffline(false);

// Manifest remains network-first only when it matches the exact pinned build.
// An HTTP 200 from an alternate Pages rollout is neither returned nor cached.
const pinnedManifest=await verified.fetchPath('manifest.webmanifest');
assert.equal(pinnedManifest.ok,true);
verified.setTamper('manifest.webmanifest');
const mismatchManifest=await verified.fetchPath('manifest.webmanifest');
assert.equal(mismatchManifest.ok,true,'Pinned manifest should survive mixed-generation HTTP 200');
assert.equal(await mismatchManifest.text(),await pinnedManifest.text());
verified.setOffline(true);
assert.equal((await verified.fetchPath('manifest.webmanifest')).ok,true,
  'Pinned manifest remains available offline after attempted cache poisoning');
verified.setOffline(false);

// A non-CORE original runtime script must also be protected from an altered
// CDN generation. The response must fail closed if no trusted cache exists.
verified.setTamper('localization-safe.js');
assert.equal((await verified.fetchPath('localization-safe.js')).type,'error',
  'Non-CORE script cannot execute from an unverified staged release');
verified.setTamper('');
assert.equal((await verified.fetchPath('localization-safe.js')).ok,true);
verified.setTamper('localization-safe.js');
assert.equal((await verified.fetchPath('localization-safe.js')).ok,true,
  'A verified cached dynamic module survives a mixed-release response');
verified.setTamper('');

// Without its sealed manifest, even cached code must fail closed rather
// than trusting an unauthenticated current-edge manifest.
staged.delete('https://stage.example.test/tms60-integrity.json');
assert.equal((await verified.fetchPath('app.html')).type,'error');
assert.equal((await verified.message('TMS60_OFFLINE_STATUS')).ok,false);

for(const variant of [{tamper:'app.html'},{manifestTamper:true},{manifestMissing:true}]){
  const scenario=simulate({previous:true,...variant});
  await assert.rejects(scenario.install());
  assert.equal(scenario.skips,0);
  assert.ok(scenario.stores.has('tms60-earlier-2026-10-01'));
  assert.ok(!scenario.stores.has(cache),'Rejected staged cache must be removed');
}
const fullUpdate=simulate({previous:true});
await fullUpdate.install();
assert.equal(fullUpdate.skips,0);
assert.ok(fullUpdate.stores.has(cache));
console.log('PASS staged integrity across install, restart, cache misses, offline repair, cache poison and prior-cache update');
