import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('sw.js','utf8'),origin='https://candidate.example.test/';
const cacheName=source.match(/const CACHE='([^']+)'/)?.[1];
const core=JSON.parse('['+source.match(/const CORE=\[([^\]]+)\]/)?.[1].replaceAll("'",'"')+']');
assert.match(cacheName,/^tms60-cloudflare-recovery-\d{4}-\d{2}-\d{2}$/);
assert.ok(core.includes('./account-sync.js'));
assert.ok(!core.includes('./native-pwa.js'),'Unmerged PWA P2 dependencies must not be imported');

function harness({old=false,fail='',status=0}={}){
  const stores=new Map(),handlers=new Map();
  let generation='v1',requests=0,skips=0,claims=0;
  const normalize=v=>new URL(v instanceof Request?v.url:String(v),origin).href;
  function store(name){
    if(!stores.has(name))stores.set(name,new Map());
    const data=stores.get(name);
    return {match:async q=>data.get(normalize(q))?.clone(),
      put:async(q,response)=>{data.set(normalize(q),response.clone())}};
  }
  const caches={open:async name=>store(name),keys:async()=>[...stores.keys()],
    delete:async name=>stores.delete(name)};
  if(old){
    store('tms60-prior-2026-10-01');
    for(const p of core)stores.get('tms60-prior-2026-10-01').set(normalize(p),
      new Response('OLD:'+normalize(p),{status:200}));
  }
  const fetch=async q=>{
    requests++;
    if(fail&&normalize(q)===normalize(fail)){
      if(status)return new Response('failure',{status});
      throw new TypeError('interrupt');
    }
    return new Response(generation+':'+normalize(q),{status:200});
  };
  const self={location:new URL(origin+'sw.js'),addEventListener:(name,cb)=>handlers.set(name,cb),
    skipWaiting:async()=>{skips++},clients:{claim:async()=>{claims++}}};
  vm.runInNewContext(source,{self,location:self.location,caches,fetch,
    Request,Response,URL,Promise,console},{filename:'sw.js'});
  function event(kind,props={}){
    let pending,response;
    handlers.get(kind)({...props,waitUntil:q=>{pending=Promise.resolve(q)},
      respondWith:q=>{response=Promise.resolve(q)}});
    return {pending,response};
  }
  function request(path,navigate=false){
    const r=new Request(new URL(path,origin));
    if(!navigate)return r;
    return new Proxy(r,{get(target,k){if(k==='mode')return 'navigate';
      const v=target[k];return typeof v==='function'?v.bind(target):v}});
  }
  return {stores,normalize,
    get requests(){return requests},get skips(){return skips},get claims(){return claims},
    setGeneration:x=>{generation=x},setFailure:x=>{fail=x},
    install:()=>event('install').pending,activate:()=>event('activate').pending,
    get:(path,nav=false)=>event('fetch',{request:request(path,nav)}).response,
    async message(type){
      let answer;
      await event('message',{data:{type},ports:[{postMessage:x=>{answer=x}}]}).pending;
      return answer;
    }
  };
}
const live=harness();
await live.install();
assert.equal(live.skips,1);
const stored=live.stores.get(cacheName);
assert.equal(stored.size,core.length);
live.setGeneration('v2');
const count=live.requests;
for(const [p,nav] of [['app.html',false],['?tmsView=study',true],['index.html',true],
  ['icon-192.png?v=old',false],['account-sync.js?v=x',false]]){
  const res=await live.get(p,nav);
  assert.match(await res.text(),/^v1:/,'Pinned installed shell '+p);
}
assert.equal(live.requests,count,'Core fetches cannot pull mixed-version assets');
assert.match(await (await live.get('manifest.webmanifest?v=new')).text(),/^v2:/);
assert.match(await (await live.get('non-core-dynamic.json')).text(),/^v2:/);
assert.match(await (await stored.get(origin+'app.html')).text(),/^v1:/);
assert.equal((await live.message('TMS60_OFFLINE_STATUS')).ready,true);

for(const status of [0,503]){
  const bad=harness({old:true,fail:'icon-512.png',status});
  await assert.rejects(bad.install(),/Incomplete TMS60 update/);
  assert.equal(bad.skips,0);
  assert.ok(bad.stores.has('tms60-prior-2026-10-01'));
  assert.ok(!bad.stores.has(cacheName));
  assert.match(await (await bad.stores.get('tms60-prior-2026-10-01')
    .get(origin+'app.html')).text(),/^OLD:/);
}
const next=harness({old:true});
await next.install();
assert.equal(next.skips,0,'No forced activation over old clients');
assert.ok(next.stores.has('tms60-prior-2026-10-01'));
await next.activate();
assert.equal(next.claims,1);
assert.ok(!next.stores.has('tms60-prior-2026-10-01'));
assert.ok(next.stores.has(cacheName));

const fresh=harness({fail:'icon-512.png',status:503});
await fresh.install();
assert.equal((await fresh.message('TMS60_OFFLINE_STATUS')).ready,false);
fresh.setFailure('');
const fixed=await fresh.message('TMS60_PREPARE_OFFLINE');
assert.equal(fixed.ready,true);
assert.equal(fixed.cached,fixed.total);
console.log('PASS main-compatible PWA P3 recovery: coherent shell, update abort, delayed activation, explicit offline repair');
