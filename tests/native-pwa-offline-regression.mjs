/* Focused source/worker regression. No network, device, CI or personal data required. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const index=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const native=fs.readFileSync('native-pwa.js','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const origin='https://tms60.example.test/';
const normalize=value=>new URL(value instanceof Request?value.url:String(value),origin).href;

assert.match(index, /<script src="native-pwa\.js"><\/script>/);
assert.match(sw, /'\.\/native-pwa\.js'/);
assert.match(sw, /TMS60_OFFLINE_STATUS/);
assert.match(sw, /TMS60_PREPARE_OFFLINE/);
assert.match(native, /standalone\(\)/);
assert.match(native, /synchronizeWakeLock/);
assert.match(native, /native-pwa-card/);
assert.match(native, /popstate/);
assert.equal(manifest.display,'standalone');
assert.equal(manifest.start_url,'/');
assert.equal(manifest.id,'/');
assert.equal(manifest.scope,'/');
new vm.Script(native,{filename:'native-pwa.js'});

const storeMap=new Map();
const cacheFor=name=>{
  if(!storeMap.has(name))storeMap.set(name,new Map());
  const store=storeMap.get(name);
  return {
    async put(req,res){store.set(normalize(req),res.clone())},
    async match(req){return store.get(normalize(req))?.clone()}
  };
};
const handlers={};
let appUnavailable=true;
const selfMock={
  location:new URL(origin+'sw.js'),
  addEventListener(type,fn){handlers[type]=fn},
  skipWaiting:async()=>{},
  clients:{claim:async()=>{}}
};
const cachesMock={
  open:async name=>cacheFor(name),
  keys:async()=>[...storeMap.keys()],
  delete:async name=>storeMap.delete(name)
};
const fetchMock=async input=>{
  if(appUnavailable&&normalize(input)===origin+'app.html')throw new Error('offline fixture');
  return new Response('fixture',{status:200});
};
vm.runInNewContext(sw,{self:selfMock,location:selfMock.location,caches:cachesMock,
  fetch:fetchMock,Request,Response,URL,console,Promise,setTimeout,clearTimeout},{filename:'sw.js'});
assert.equal(typeof handlers.install,'function');
assert.equal(typeof handlers.message,'function');

async function waitFor(type,payload={}){
  let pending,reply;
  const port={postMessage(data){reply=data}};
  handlers[type]({data:payload,ports:[port],waitUntil(p){pending=p}});
  assert.ok(pending,type+' registered a waitUntil promise');
  await pending;
  return reply;
}
await waitFor('install');
const partial=await waitFor('message',{type:'TMS60_OFFLINE_STATUS'});
assert.equal(partial.ok,true);
assert.equal(partial.ready,false);
assert.ok(partial.missing.includes('./app.html'));
assert.ok(partial.cached>0);
assert.ok(partial.total>partial.cached);

appUnavailable=false;
const repaired=await waitFor('message',{type:'TMS60_PREPARE_OFFLINE'});
assert.equal(repaired.ok,true);
assert.equal(repaired.ready,true);
assert.equal(repaired.missing.length,0);
assert.equal(repaired.cached,repaired.total);

const repeat=await waitFor('message',{type:'TMS60_OFFLINE_STATUS'});
assert.equal(repeat.ready,true);
console.log('PASS Native PWA metadata, worker cache readiness, offline repair, and script syntax');
