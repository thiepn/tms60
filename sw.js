'use strict';
const CACHE='tms60-vnext-2026-08-24g';
const CORE=['./','./index.html','./app.html','./translations.js','./niv-service.json','./enhancements.js','./enhancements-core.js','./localization-safe.js','./favicon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('tms60-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==location.origin)return;
  event.respondWith(fetch(req).then(res=>{if(res&&res.ok){const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy))}return res}).catch(async()=>{
    const hit=await caches.match(req);if(hit)return hit;
    if(req.mode==='navigate')return caches.match('./index.html');
    return Response.error();
  }));
});