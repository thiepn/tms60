import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const sw=fs.readFileSync('sw.js','utf8');
const pwa=fs.readFileSync('native-pwa.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const origin='https://tms60.example.test/';
const cacheName=sw.match(/const CACHE='([^']+)'/)?.[1];
const core=JSON.parse('['+sw.match(/const CORE=\[([^\]]+)\]/)?.[1].replaceAll("'",'"')+']');
const normalize=input=>new URL(input instanceof Request?input.url:String(input),origin).href;
assert.ok(cacheName?.startsWith('tms60-native-pwa-p2-'));
assert.ok(core.includes('./native-pwa.js'));
assert.equal(manifest.display,'standalone');
assert.equal(manifest.id,'/');
assert.equal(manifest.start_url,'/');
assert.equal(manifest.scope,'/');
assert.match(index, /<script src="native-pwa\.js"><\/script>/);
assert.match(pwa,/reg\.waiting/);
assert.match(pwa,/popstate/);
assert.match(pwa,/tmsView/);
new vm.Script(sw);
new vm.Script(pwa);

function harness({previous=false,broken=null,serverFailure=null}={}){
  const stores=new Map();
  const oldCache='tms60-native-pwa-2026-10-13';
  if(previous){
    stores.set(oldCache,new Map(core.map(path=>[normalize(path),new Response('older:'+path)])));
  }
  const cacheFor=name=>{
    if(!stores.has(name))stores.set(name,new Map());
    const map=stores.get(name);
    return {
      async put(req,res){map.set(normalize(req),res.clone())},
      async match(req){return map.get(normalize(req))?.clone()}
    };
  };
  const caches={
    open:async name=>cacheFor(name),
    keys:async()=>Array.from(stores.keys()),
    delete:async name=>stores.delete(name)
  };
  const listeners={};let skipped=0;let claimed=0;
  const self={
    location:new URL(origin+'sw.js'),
    addEventListener(type,callback){listeners[type]=callback},
    skipWaiting:async()=>{skipped++},
    clients:{claim:async()=>{claimed++}}
  };
  const fetch=async input=>{
    const url=normalize(input);
    if(broken && url===normalize(broken))throw Error('synthetic network outage');
    if(serverFailure && url===normalize(serverFailure))
      return new Response('temporary server failure',{status:503});
    return new Response('fresh:'+url,{status:200});
  };
  vm.runInNewContext(sw,{self,location:self.location,caches,fetch,Request,Response,URL,console,Promise});
  const eventFor=(type,attrs={})=>{
    let pending;let response;
    listeners[type]({
      ...attrs,
      waitUntil(promise){pending=Promise.resolve(promise)},
      respondWith(promise){response=Promise.resolve(promise)}
    });
    return {pending,response};
  };
  return {
    stores,oldCache,cacheName,get skipped(){return skipped},get claimed(){return claimed},
    async install(){return eventFor('install').pending},
    async activate(){return eventFor('activate').pending},
    async fetch(url){
      const e=eventFor('fetch',{request:new Request(normalize(url))});
      return e.response;
    }
  };
}

// Fresh installation can claim the shell; a full bundle is cached.
const fresh=harness();
await fresh.install();
assert.equal(fresh.skipped,1);
assert.equal(fresh.stores.get(cacheName).size,core.length);
await fresh.activate();
assert.equal(fresh.claimed,1);

// Updating a previously installed app must not force takeover of active practice.
const update=harness({previous:true});
await update.install();
assert.equal(update.skipped,0,'Updates may not skip the waiting phase');
assert.ok(update.stores.has(update.oldCache),'Previous offline cache is preserved until activation');
assert.equal(update.stores.get(cacheName).size,core.length);
await update.activate(); // Browser runs this only after incumbent clients close.
assert.equal(update.claimed,1);
assert.ok(!update.stores.has(update.oldCache));

// A mixed old/new bundle must never replace the working offline version.
const unavailable=harness({previous:true,broken:'./app.html'});
await assert.rejects(()=>unavailable.install(),/Incomplete TMS60 update/);
assert.equal(unavailable.skipped,0);
assert.ok(unavailable.stores.has(unavailable.oldCache));
assert.ok(!unavailable.stores.has(cacheName));

// An upstream 503 should use the last successful cached resource, not a broken page.
const server=harness({serverFailure:'./app.html'});
// During initial precache, all assets are available except the transient 503.
// Place a known-good response in the active app cache to simulate a past good request.
server.stores.set(cacheName,new Map([[normalize('./app.html'),new Response('known good')]]));
const fallback=await server.fetch('./app.html');
assert.equal(await fallback.text(),'known good');

console.log('PASS P2 standalone metadata, JS syntax, first install, waiting update, atomic rollback and 503 cache fallback');
