'use strict';
const CACHE='tms60-stability29-2026-08-26';
const CORE=['./','./index.html','./app.html','./translations.js','./niv-service.json','./enhancements.js','./enhancements-legacy.js','./rc3-hardening.js','./language-switch-hardening.js','./guided-learning-chain.js','./qol-fast-recall.js','./qol-cloze-helpers.js','./qol-word-navigation.js','./ux-patch.js','./enhancements-core.js','./localization-runtime.js','./localization-completion.js','./favicon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest'];
const STATIC_ASSETS=new Set(['./favicon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest'].map(url=>new URL(url,self.location.href).pathname));

async function cacheSuccessful(request,response,event){
  if(!response||!response.ok||response.type==='opaque')return;
  const write=caches.open(CACHE).then(cache=>cache.put(request,response.clone())).catch(()=>{});
  if(event)event.waitUntil(write);else await write;
}

async function cachedResponse(request){
  const cache=await caches.open(CACHE);
  return cache.match(request);
}

async function networkFirst(request,event,{navigation=false}={}){
  try{
    const response=await fetch(request);
    cacheSuccessful(request,response,event);
    return response;
  }catch(_){
    const hit=await cachedResponse(request);
    if(hit)return hit;
    if(navigation){
      const shell=await cachedResponse(new Request(new URL('./index.html',self.location.href)));
      if(shell)return shell;
    }
    return Response.error();
  }
}

async function cacheFirst(request,event){
  const hit=await cachedResponse(request);
  if(hit)return hit;
  try{
    const response=await fetch(request);
    cacheSuccessful(request,response,event);
    return response;
  }catch(_){
    return Response.error();
  }
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.all(CORE.map(async url=>{
      const response=await fetch(url,{cache:'reload'});
      if(!response.ok)throw new Error(`Failed to precache ${url}: ${response.status}`);
      await cache.put(url,response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('tms60-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==location.origin)return;
  if(req.headers.has('range')){event.respondWith(fetch(req));return}
  if(req.mode==='navigate'){event.respondWith(networkFirst(req,event,{navigation:true}));return}
  if(STATIC_ASSETS.has(url.pathname)){event.respondWith(cacheFirst(req,event));return}
  event.respondWith(networkFirst(req,event));
});
