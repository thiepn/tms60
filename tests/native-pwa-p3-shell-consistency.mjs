import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/* This exercises real service-worker routing with disposable cache/network mocks.
 * It must not be mistaken for Android WebAPK installation evidence.
 */
const source=fs.readFileSync('sw.js','utf8');
const scope='https://candidate.example.test/';
const core=JSON.parse('['+source.match(/const CORE=\[([^\]]+)\]/)?.[1].replaceAll("'",'"')+']');
const cacheName=source.match(/const CACHE='([^']+)'/)?.[1];
const listeners=new Map();
const stores=new Map();
let generation='v1';
let fetchCount=0;
const normalize=x=>new URL(x instanceof Request?x.url:String(x),scope).href;
const cacheFor=name=>{
  if(!stores.has(name))stores.set(name,new Map());
  const store=stores.get(name);
  return {
    async put(input,response){store.set(normalize(input),response.clone())},
    async match(input){return store.get(normalize(input))?.clone()}
  };
};
const caches={
  open:async name=>cacheFor(name),
  keys:async()=>Array.from(stores.keys()),
  delete:async name=>stores.delete(name)
};
const self={
  location:new URL(scope+'sw.js'),
  addEventListener(name,callback){listeners.set(name,callback)},
  skipWaiting:async()=>{},
  clients:{claim:async()=>{}}
};
const fetch=async input=>{
  fetchCount++;
  return new Response(generation+':'+normalize(input),{status:200});
};
vm.runInNewContext(source,{self,location:self.location,caches,fetch,Request,Response,URL,Promise,console});
const makeEvent=(type,attrs={})=>{
  let response,pending;
  listeners.get(type)({
    ...attrs,
    waitUntil(p){pending=Promise.resolve(p)},
    respondWith(p){response=Promise.resolve(p)}
  });
  return {get response(){return response},get pending(){return pending}};
};
await makeEvent('install').pending;
const cache=stores.get(cacheName);
assert.equal(cache.size,core.length,'The initial install provides the complete bundle');
assert.ok((await cache.get(scope+'app.html').clone().text()).startsWith('v1:'));

generation='v2'; // Simulate a server deploying a later candidate mid-session.
const beforeCount=fetchCount;
async function get(path,{navigation=false}={}){
  const req=new Request(scope+path);
  // Worker handlers recognize Chrome's navigation request by req.mode.
  if(!navigation) return makeEvent('fetch',{request:req}).response;
  // Request.mode cannot be directly constructed, proxy the same request fields.
  const nav=new Proxy(req,{get(target,name){if(name==='mode')return'navigate';const v=target[name];return typeof v==='function'?v.bind(target):v;}});
  return makeEvent('fetch',{request:nav}).response;
}
const code=await get('app.html');
assert.ok((await code.text()).startsWith('v1:'),'Running app.html comes from pinned cache');
const root=await get('?tmsView=study',{navigation:true});
assert.ok((await root.text()).startsWith('v1:'),'Launcher query uses the installed app shell');
const index=await get('index.html',{navigation:true});
assert.ok((await index.text()).startsWith('v1:'),'Installed index.html stays on its own version');
const icon=await get('icon-192.png?v=older');
assert.ok((await icon.text()).startsWith('v1:'),'Icon query cannot bypass pinned precache');
assert.equal(fetchCount,beforeCount,'Core routes cannot refetch and poison active installed bundle');
const stillCached=await cache.get(scope+'app.html').clone().text();
assert.ok(stillCached.startsWith('v1:'),'Old shell remains intact after server update');

// Install metadata is intentionally network-first so browsers can inspect fresh
// metadata without mutating the pinned JavaScript/HTML cache.
const manifest=await get('manifest.webmanifest?v=1');
assert.ok((await manifest.text()).startsWith('v2:'),'Manifest refresh remains network-first');
assert.ok((await cache.get(scope+'app.html').clone().text()).startsWith('v1:'));

const dynamic=await get('runtime-generated.json');
assert.ok((await dynamic.text()).startsWith('v2:'),'Non-core resources remain online-capable');
assert.ok(core.every(p=>cache.has(normalize(p))),'Runtime requests do not remove precached files');
console.log('PASS P3 coherent active shell, launcher query, versioned icons, fresh manifest, and separate dynamic resources');
