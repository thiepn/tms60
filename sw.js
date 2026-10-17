'use strict';
const CACHE='tms60-cloudflare-recovery-2026-10-17';
const CORE=['./','./index.html','./app.html','./translations.js','./hub-entry.js','./p2-5-source-prep.js','./p2-5-shell-runtime.js','./p2-6-theme-sync.js','./runtime-translation-switch.js','./p2-8-localized-tts-reference.js','./niv-service.json','./enhancements.js','./enhancements-legacy.js','./rc3-hardening.js','./language-switch-hardening.js','./guided-learning-chain.js','./qol-fast-recall.js','./qol-cloze-helpers.js','./qol-word-navigation.js','./ux-patch.js','./ux-patch-core.js','./typo-tolerance.js','./typo-scoring-finalizer.js','./enhancements-core.js','./localization-runtime.js','./localization-completion.js','./favicon.svg','./icon-192.png','./icon-512.png','./vendor/supabase-2.116.0.js','./account-sync.js','./manifest.webmanifest'];
const STATIC_ASSETS=new Set(['./favicon.svg','./icon-192.png','./icon-512.png'].map(url=>new URL(url,self.location.href).pathname));
const MANIFEST_PATH=new URL('./manifest.webmanifest',self.location.href).pathname;
// P3 version-pinned shell, adapted to main's canonical CORE (no native-pwa.js).
const ROOT_PATH=new URL('./',self.location.href).pathname;
const PRECACHE_PATHS=new Set(CORE.filter(path=>path!=='./manifest.webmanifest').map(path=>new URL(path,self.location.href).pathname));
function canonicalShellRequest(url){return new Request(new URL(url.pathname,self.location.origin))}


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
    if(response.status>=500){
      const hit=await cachedResponse(request);
      if(hit)return hit;
      if(new URL(request.url).pathname===MANIFEST_PATH){
        const canonical=await cachedResponse(new Request(new URL('./manifest.webmanifest',self.location.href)));
        if(canonical)return canonical;
      }
    }
    return response;
  }).catch(async()=>{
    const hit=await cachedResponse(request);
    if(hit)return hit;
    if(new URL(request.url).pathname===MANIFEST_PATH){
      const canonical=await cachedResponse(new Request(new URL('./manifest.webmanifest',self.location.href)));
      if(canonical)return canonical;
    }
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
    const older=(await caches.keys()).filter(name=>name!==CACHE&&name.startsWith('tms60-'));
    const isUpdate=older.length>0;
    const cache=await caches.open(CACHE);
    const results=await Promise.allSettled(CORE.map(url=>precacheAsset(cache,url)));
    const missing=results.filter(x=>x.status==='rejected'||x.value?.source==='missing');
    if(missing.length)console.warn('TMS60 offline bundle incomplete:',missing.length);
    const unsafeUpdate=isUpdate&&results.some(x=>x.status==='rejected'||x.value?.source!=='network');
    if(unsafeUpdate){
      await caches.delete(CACHE);
      throw new Error('Incomplete TMS60 update: previous installed cache preserved.');
    }
    const shell=(await cache.match(new Request(new URL('./index.html',self.location.href))))
      ||(await cache.match(new Request(new URL('./',self.location.href))));
    if(!shell)throw new Error('TMS60 precache could not preserve any usable app shell.');
    // New version waits for old clients to close; no mid-recall activation.
    if(!isUpdate)await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('tms60-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==location.origin)return;
  if(req.headers.has('range')){event.respondWith(fetch(req));return}
  if(req.mode==='navigate'){
    if(url.pathname===ROOT_PATH||PRECACHE_PATHS.has(url.pathname)){
      event.respondWith(cacheFirst(canonicalShellRequest(url)));return;
    }
    event.respondWith(networkFirst(req,event,{navigation:true}));return;
  }
  if(url.pathname===MANIFEST_PATH){event.respondWith(networkFirst(req,event));return}
  if(STATIC_ASSETS.has(url.pathname)){event.respondWith(cacheFirst(canonicalShellRequest(url)));return}
  if(PRECACHE_PATHS.has(url.pathname)){event.respondWith(cacheFirst(canonicalShellRequest(url)));return}
  event.respondWith(networkFirst(req,event));
});
// User-initiated offline readiness reporting from the original P2/P3 protocol.
async function offlineBundleStatus(cache){
  const checks=await Promise.all(CORE.map(async url=>{
    try{
      const response=await cache.match(new Request(new URL(url,self.location.href)));
      return {url,present:Boolean(response&&response.ok)};
    }catch(_){return {url,present:false}}
  }));
  const missing=checks.filter(item=>!item.present).map(item=>item.url);
  return {ok:true,ready:missing.length===0,cached:checks.length-missing.length,total:checks.length,missing};
}
self.addEventListener('message',event=>{
  const type=event.data?.type,port=event.ports?.[0];
  if(!port||!['TMS60_OFFLINE_STATUS','TMS60_PREPARE_OFFLINE'].includes(type))return;
  event.waitUntil((async()=>{
    try{
      const cache=await caches.open(CACHE);
      if(type==='TMS60_PREPARE_OFFLINE'){
        const before=await offlineBundleStatus(cache);
        await Promise.allSettled(before.missing.map(url=>precacheAsset(cache,url)));
      }
      port.postMessage(await offlineBundleStatus(cache));
    }catch(error){port.postMessage({ok:false,error:String(error?.message||error)})}
  })());
});

