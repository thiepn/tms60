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
assert.deepEqual(Object.keys(release.assets).sort(),[...paths].sort());
for(const path of paths){
  const hash=createHash('sha256').update(readFileSync(join(root,path))).digest('hex');
  assert.equal(release.assets[path],hash,'Recorded CORE hash mismatch '+path);
}

function simulate({previous=false,tamper='',manifestTamper=false,manifestMissing=false}={}){
  const origin='https://stage.example.test/',handlers=new Map(),stores=new Map();
  let skips=0;
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
    const url=new URL(norm(input));
    if(url.pathname==='/tms60-integrity.json'){
      if(manifestMissing)return new Response('missing',{status:404});
      return new Response(manifestTamper?'{"invalid":true}':json,{status:200});
    }
    let name=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(!paths.includes(name))return new Response('Not found',{status:404});
    const payload=tamper===name?Buffer.from('MISMATCH-BUT-HTTP-200'):readFileSync(join(root,name));
    return new Response(payload,{status:200});
  };
  const self={location:new URL(origin+'sw.js'),addEventListener:(name,fn)=>handlers.set(name,fn),
    skipWaiting:async()=>{skips++},clients:{claim:async()=>{}}};
  vm.runInNewContext(sw,{self,location:self.location,caches,fetch,
    Request,Response,URL,Promise,console,crypto:webcrypto,TextDecoder},{filename:'staged-sw.js'});
  return {stores,get skips(){return skips},async install(){
    let pending;
    handlers.get('install')({waitUntil(p){pending=Promise.resolve(p)}});
    assert.ok(pending,'No install promise');
    return pending;
  }};
}
const verified=simulate();
await verified.install();
assert.equal(verified.skips,1);
assert.equal(verified.stores.get(cache).size,core.length);

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
console.log('PASS staged SHA-256 manifest: exact CORE; reject 200 mixed version, altered/missing manifest; safe previous-cache update');
