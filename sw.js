'use strict';
const CACHE='tms60-cloudflare-recovery-2026-10-17';
// Staging replaces this sentinel with the SHA-256 of the exact asset manifest.
// Main/GitHub Pages has no manifest and continues its existing local-first path.
const RELEASE_INTEGRITY_SHA256=null;
const CORE=['./','./index.html','./app.html','./translations.js','./hub-entry.js','./p2-5-source-prep.js','./p2-5-shell-runtime.js','./p2-6-theme-sync.js','./runtime-translation-switch.js','./p2-8-localized-tts-reference.js','./niv-service.json','./enhancements.js','./enhancements-legacy.js','./rc3-hardening.js','./language-switch-hardening.js','./guided-learning-chain.js','./qol-fast-recall.js','./qol-cloze-helpers.js','./qol-word-navigation.js','./ux-patch.js','./ux-patch-core.js','./typo-tolerance.js','./typo-scoring-finalizer.js','./enhancements-core.js','./localization-runtime.js','./localization-completion.js','./favicon.svg','./icon-192.png','./icon-512.png','./vendor/supabase-2.116.0.js','./account-sync.js','./manifest.webmanifest'];
const STATIC_ASSETS=new Set(['./favicon.svg','./icon-192.png','./icon-512.png'].map(url=>new URL(url,self.location.href).pathname));
const MANIFEST_PATH=new URL('./manifest.webmanifest',self.location.href).pathname;
// P3 version-pinned shell, adapted to main's canonical CORE (no native-pwa.js).
const ROOT_PATH=new URL('./',self.location.href).pathname;
const PRETTY_APP_PATH=new URL('./app',self.location.href).pathname;
// Cloudflare Pages redirects /index.html => / and /app.html => /app.
// Fetch their canonical URLs on staged builds, then store them under the
// original CORE paths so legacy app and service-worker identity remain intact.
function releaseNetworkURL(input){
  const url=new URL(typeof input==='string'?input:input.url,self.location.href);
  if(!RELEASE_INTEGRITY_SHA256)return url;
  if(url.pathname===new URL('./index.html',self.location.href).pathname)url.pathname=ROOT_PATH;
  else if(url.pathname===new URL('./app.html',self.location.href).pathname)url.pathname=PRETTY_APP_PATH;
  return url;
}
const PRECACHE_PATHS=new Set(CORE.filter(path=>path!=='./manifest.webmanifest').map(path=>new URL(path,self.location.href).pathname));
function canonicalShellRequest(url){return new Request(new URL(url.pathname,self.location.origin))}
const digestHex=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
  .map(value=>value.toString(16).padStart(2,'0')).join('');
async function loadExpectedRelease({offlineOnly=false}={}){
  if(!RELEASE_INTEGRITY_SHA256)return null;
  if(!/^[a-f0-9]{64}$/.test(RELEASE_INTEGRITY_SHA256))
    throw new Error('Invalid staged integrity commitment.');
  const request=new Request(new URL('./tms60-integrity.json',self.location.href));
  const cache=await caches.open(CACHE);
  const response=offlineOnly?await cache.match(request):
    await fetch(request,{cache:'reload'});
  if(!response||!response.ok||response.type==='opaque'||response.redirected)
    throw new Error('Cannot verify exact staged integrity manifest.');
  const data=await response.clone().arrayBuffer();
  if(await digestHex(data)!==RELEASE_INTEGRITY_SHA256)
    throw new Error('Staged integrity manifest does not match this service worker.');
  const manifest=JSON.parse(new TextDecoder().decode(data));
  if(manifest.schema!==1||manifest.cache!==CACHE||!manifest.assets||typeof manifest.assets!=='object')
    throw new Error('Staged manifest has incorrect version or schema.');
  const required=new Set(CORE.map(path=>path==='./'?'index.html':path.slice(2)));
  if(Object.keys(manifest.assets).length<required.size)
    throw new Error('Staged manifest asset count is smaller than installed CORE.');
  for(const [path,hash] of Object.entries(manifest.assets))
    if(!/^[a-zA-Z0-9._/-]+$/.test(path)||path.includes('..')||!path||
      !/^[a-f0-9]{64}$/.test(hash))
      throw new Error('Staged manifest contains unsafe asset or digest: '+path);
  for(const path of required)
    if(!manifest.assets[path])
      throw new Error('Required staged asset is missing an integrity digest: '+path);
  // The signed-by-build digest commitment is embedded in the installed SW.
  // Persist the verified manifest in THIS release cache so that worker restarts
  // and offline repair never depend on fetching mutable CDN metadata again.
  if(!offlineOnly)await cache.put(request,response.clone());
  return manifest.assets;
}


function cacheSuccessful(request,response){
  if(!response||!response.ok||response.type==='opaque')return Promise.resolve();
  return caches.open(CACHE).then(cache=>cache.put(request,response.clone())).catch(()=>{});
}

async function cachedResponse(request){
  const cache=await caches.open(CACHE);
  return cache.match(request);
}

// A staged version is immutable even for assets normally fetched
// network-first (including manifest and dynamically loaded script modules).
// Reject mixed-generation 200s instead of caching or executing them.
function networkFirst(request,event,{navigation=false}={}){
  if(!RELEASE_INTEGRITY_SHA256)
    return networkFirstUnsealed(request,event,{navigation});
  return (async()=>{
    const expected=await loadExpectedRelease({offlineOnly:true});
    const path=new URL(request.url).pathname.slice(ROOT_PATH.length);
    const digest=expected[path];
    if(!digest){
      if(/\.(?:js|json|html|css|webmanifest)$/.test(path))
        return Response.error();
      return networkFirstUnsealed(request,event,{navigation});
    }
    const valid=async response=>Boolean(response&&response.ok&&
      response.type!=='opaque'&&!response.redirected&&
      await digestHex(await response.clone().arrayBuffer())===digest);
    try{
      const response=await fetch(new Request(request,{cache:'no-cache'}));
      if(await valid(response)){
        event.waitUntil(cacheSuccessful(request,response));
        return response;
      }
    }catch(_){/* A network mismatch must never replace the pinned cache. */}
    const cached=await cachedResponse(request);
    if(await valid(cached))return cached;
    if(path==='manifest.webmanifest'){
      const pinned=await cachedResponse(new Request(new URL('./manifest.webmanifest',self.location.href)));
      if(await valid(pinned))return pinned;
    }
    return Response.error();
  })().catch(()=>Response.error());
}
function networkFirstUnsealed(request,event,{navigation=false}={}){
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
  try{
    const expected=RELEASE_INTEGRITY_SHA256
      ?await loadExpectedRelease({offlineOnly:true}):null;
    const pathname=new URL(request.url).pathname;
    const name=pathname===ROOT_PATH?'index.html':pathname.slice(ROOT_PATH.length);
    const hit=await cachedResponse(request);
    if(hit){
      if(!expected||(hit.ok&&
        expected[name]===await digestHex(await hit.clone().arrayBuffer())))
        return hit;
      // Do not serve a corrupt or wrong-version cached executable.
    }
    const response=await fetch(expected?releaseNetworkURL(request):request);
    if(expected&&(!response.ok||response.type==='opaque'||response.redirected||
      expected[name]!==await digestHex(await response.clone().arrayBuffer())))
      return Response.error();
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

async function precacheAsset(cache,url,expected=null){
  const request=new Request(new URL(url,self.location.href));
  try{
    const response=await fetch(expected?releaseNetworkURL(url):url,{cache:'reload'});
    if(response&&response.ok&&response.type!=='opaque'&&!response.redirected){
      if(expected){
        const name=url==='./'?'index.html':url.slice(2);
        const hash=await digestHex(await response.clone().arrayBuffer());
        if(expected[name]!==hash)return {url,source:'integrity-mismatch'};
      }
      await cache.put(request,response);
      return {url,source:'network'};
    }
  }catch(_){/* Fall through to the previous installed cache. */}

  // Staged PWA code cannot accept a previous-release fallback when the
  // current-release digest was unavailable or mismatched.
  if(expected)return {url,source:'missing'};
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
    // Do not silently accept a mixed Cloudflare edge rollout. The exact
    // manifest is bound to this worker's staged build and each CORE response.
    let expected;
    try{expected=await loadExpectedRelease()}
    catch(error){await caches.delete(CACHE);throw error}
    const cache=await caches.open(CACHE);
    const results=await Promise.allSettled(CORE.map(url=>precacheAsset(cache,url,expected)));
    const missing=results.filter(x=>x.status==='rejected'||x.value?.source==='missing');
    if(missing.length)console.warn('TMS60 offline bundle incomplete:',missing.length);
    const unsafeUpdate=(isUpdate||Boolean(expected))&&
      results.some(x=>x.status==='rejected'||x.value?.source!=='network');
    if(unsafeUpdate){
      await caches.delete(CACHE);
      throw new Error('Incomplete TMS60 update: version inconsistency; previous cache preserved.');
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
  // An integrity-sealed release must not let partial/ranged requests bypass
  // pinned response verification. Unknown media may retain original Range I/O.
  if(req.headers.has('range')){
    if(!RELEASE_INTEGRITY_SHA256){event.respondWith(fetch(req));return}
    event.respondWith((async()=>{
      const expected=await loadExpectedRelease({offlineOnly:true});
      const path=url.pathname===PRETTY_APP_PATH?'app.html':
        url.pathname===ROOT_PATH?'index.html':url.pathname.slice(ROOT_PATH.length);
      if(Object.hasOwn(expected,path))return Response.error();
      return fetch(req);
    })().catch(()=>Response.error()));
    return;
  }
  // Pages serves the app.html bytes at /app. Both navigation and fetch()
  // must be mapped to the original pinned CORE entry; otherwise non-navigation
  // /app would enter the generic unverified network-first branch.
  if(RELEASE_INTEGRITY_SHA256&&url.pathname===PRETTY_APP_PATH){
    event.respondWith(cacheFirst(new Request(new URL('./app.html',self.location.href))));return;
  }
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
  const expected=RELEASE_INTEGRITY_SHA256
    ?await loadExpectedRelease({offlineOnly:true}):null;
  const checks=await Promise.all(CORE.map(async url=>{
    try{
      const response=await cache.match(new Request(new URL(url,self.location.href)));
      if(!response||!response.ok)return {url,present:false};
      if(expected){
        const name=url==='./'?'index.html':url.slice(2);
        const hash=await digestHex(await response.arrayBuffer());
        return {url,present:hash===expected[name]};
      }
      return {url,present:true};
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
        const expected=RELEASE_INTEGRITY_SHA256
          ?await loadExpectedRelease({offlineOnly:true}):null;
        await Promise.allSettled(before.missing.map(url=>precacheAsset(cache,url,expected)));
      }
      const status=await offlineBundleStatus(cache);
      port.postMessage({...status,cache:CACHE,integrityCommitted:Boolean(RELEASE_INTEGRITY_SHA256)});
    }catch(error){port.postMessage({ok:false,error:String(error?.message||error)})}
  })());
});

