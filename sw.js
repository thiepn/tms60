'use strict';
const CACHE='tms60-native-pwa-p2-2026-10-13';
const CORE=['./','./index.html','./app.html','./translations.js','./hub-entry.js','./p2-5-source-prep.js','./p2-5-shell-runtime.js','./p2-6-theme-sync.js','./native-pwa.js','./runtime-translation-switch.js','./p2-8-localized-tts-reference.js','./niv-service.json','./enhancements.js','./enhancements-legacy.js','./rc3-hardening.js','./language-switch-hardening.js','./guided-learning-chain.js','./qol-fast-recall.js','./qol-cloze-helpers.js','./qol-word-navigation.js','./ux-patch.js','./ux-patch-core.js','./typo-tolerance.js','./typo-scoring-finalizer.js','./enhancements-core.js','./localization-runtime.js','./localization-completion.js','./favicon.svg','./icon-192.png','./icon-512.png','./vendor/supabase-2.116.0.js','./account-sync.js','./manifest.webmanifest'];
const STATIC_ASSETS=new Set(['./favicon.svg','./icon-192.png','./icon-512.png'].map(url=>new URL(url,self.location.href).pathname));
const MANIFEST_PATH=new URL('./manifest.webmanifest',self.location.href).pathname;

function cacheSuccessful(request,response){
  if(!response||!response.ok||response.type==='opaque')return Promise.resolve();
  return caches.open(CACHE).then(cache=>cache.put(request,response.clone())).catch(()=>{});
}

async function cachedResponse(request){
  const cache=await caches.open(CACHE);
  return cache.match(request);
}

function networkFirst(request,event,{navigation=false}={}){
  const network=fetch(new Request(request,{cache:'no-cache'}));
  event.waitUntil(network.then(response=>cacheSuccessful(request,response)).catch(()=>{}));
  return network.then(async response=>{
    // A reachable server can still be temporarily broken. Prefer a known-good
    // cached dependency over a transient 5xx response without caching the error.
    if(response.status>=500){
      const hit=await cachedResponse(request);
      if(hit)return hit;
    }
    return response;
  }).catch(async()=>{
    const hit=await cachedResponse(request);
    if(hit)return hit;
    if(navigation){
      const shell=await cachedResponse(new Request(new URL('./index.html',self.location.href)));
      if(shell)return shell;
    }
    return Response.error();
  });
}

async function cacheFirst(request){
  const hit=await cachedResponse(request);
  if(hit)return hit;
  try{
    const response=await fetch(request);
    await cacheSuccessful(request,response);
    return response;
  }catch(_){
    return Response.error();
  }
}

async function previousCachedResponse(request){
  try{
    const names=(await caches.keys()).filter(name=>name!==CACHE&&name.startsWith('tms60-')).reverse();
    for(const name of names){
      const cache=await caches.open(name);
      const hit=await cache.match(request);
      if(hit)return hit;
    }
  }catch(_){/* A previous-cache lookup must never make installation fatal. */}
  return null;
}

async function precacheAsset(cache,url){
  const request=new Request(new URL(url,self.location.href));
  try{
    const response=await fetch(url,{cache:'reload'});
    if(response&&response.ok){
      await cache.put(request,response);
      return {url,source:'network'};
    }
  }catch(_){/* Fall through to the previous installed cache. */}

  try{
    const fallback=await previousCachedResponse(request);
    if(fallback){
      await cache.put(request,fallback.clone());
      return {url,source:'previous-cache'};
    }
  }catch(_){/* This asset can be repaired by normal runtime caching later. */}

  return {url,source:'missing'};
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const previousNames=(await caches.keys()).filter(name=>name!==CACHE&&name.startsWith('tms60-'));
    const isUpdate=previousNames.length>0;
    const cache=await caches.open(CACHE);
    const results=await Promise.allSettled(CORE.map(url=>precacheAsset(cache,url)));
    const unavailable=results.filter(result=>result.status==='rejected'||result.value?.source==='missing');
    if(unavailable.length)console.warn(`TMS60 precache completed with ${unavailable.length} unavailable asset(s); runtime caching will retry them.`);
    // Never replace a working offline version with an incomplete/mixed-version update.
    // A first install can still start online and repair missing files via Settings.
    const unverifiedUpdate=isUpdate&&results.some(result=>
      result.status==='rejected'||result.value?.source!=='network');
    if(unverifiedUpdate){
      await caches.delete(CACHE);
      throw new Error('Incomplete TMS60 update: previous offline version preserved.');
    }

    const shell=(await cache.match(new Request(new URL('./index.html',self.location.href))))
      ||(await cache.match(new Request(new URL('./',self.location.href))));
    if(!shell)throw new Error('TMS60 precache could not preserve any usable app shell.');

    // On an update, the incumbent app stays on its own worker and cache until all
    // windows close. A first install may claim the already-loaded page immediately.
    if(!isUpdate)await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  // Delayed activation means no old-version client remains to be disrupted.
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('tms60-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==location.origin)return;
  if(req.headers.has('range')){event.respondWith(fetch(req));return}
  if(req.mode==='navigate'){event.respondWith(networkFirst(req,event,{navigation:true}));return}
  if(url.pathname===MANIFEST_PATH){event.respondWith(networkFirst(req,event));return}
  if(STATIC_ASSETS.has(url.pathname)){event.respondWith(cacheFirst(req));return}
  event.respondWith(networkFirst(req,event));
});


// A user-initiated, verifiable offline-readiness check. A successful install
// alone is insufficient: one missing dependency can make offline study fail.
async function offlineBundleStatus(cache) {
  const checks=await Promise.all(CORE.map(async url=>{
    try {
      const req=new Request(new URL(url,self.location.href));
      return {url,present:Boolean(await cache.match(req))};
    } catch (_) { return {url,present:false}; }
  }));
  const missing=checks.filter(item=>!item.present).map(item=>item.url);
  return {ok:true,ready:missing.length===0,cached:checks.length-missing.length,total:checks.length,missing};
}

self.addEventListener('message',event=>{
  const type=event.data?.type;
  const port=event.ports?.[0];
  if(!port||!['TMS60_OFFLINE_STATUS','TMS60_PREPARE_OFFLINE'].includes(type))return;
  event.waitUntil((async()=>{
    try {
      const cache=await caches.open(CACHE);
      if(type==='TMS60_PREPARE_OFFLINE'){
        const before=await offlineBundleStatus(cache);
        await Promise.allSettled(before.missing.map(url=>precacheAsset(cache,url)));
      }
      port.postMessage(await offlineBundleStatus(cache));
    }catch(error){
      port.postMessage({ok:false,error:String(error?.message||error)});
    }
  })());
});
