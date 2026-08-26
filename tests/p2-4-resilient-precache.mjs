import vm from 'node:vm';
import {chromium} from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const EXPECTED_CACHE='tms60-stability30-2026-08-26';
let failures=0;
const check=(condition,name,detail='')=>{
  console.log(`${condition?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);
  if(!condition)failures++;
};
const seed=()=>{
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem('tms60-ui-language-v1','en');
  localStorage.setItem('tms60-active-translation-v1','esv');
};
async function frameOf(page,timeout=25000){
  await page.waitForSelector('#app-frame.ready',{timeout});
  for(let i=0;i<timeout/100;i++){
    const frame=page.frames().find(x=>x!==page.mainFrame());
    if(frame&&await frame.locator('#desktop-nav').count())return frame;
    await page.waitForTimeout(100);
  }
  throw new Error('app frame did not become ready');
}
async function settleWorker(page,timeout=15000){
  return page.evaluate(async timeout=>{
    if(!('serviceWorker'in navigator))throw new Error('Service workers are unavailable in this browser context.');
    let reg=await navigator.serviceWorker.getRegistration();
    if(!reg)reg=await navigator.serviceWorker.register('sw.js');
    reg=await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service worker did not become ready in time.')),timeout))
    ]);
    await reg.update();
    const worker=reg.installing||reg.waiting;
    if(worker&&worker.state!=='activated'){
      await Promise.race([
        new Promise(resolve=>{
          const onState=()=>{
            if(worker.state==='activated'||worker.state==='redundant'){
              worker.removeEventListener('statechange',onState);
              resolve();
            }
          };
          worker.addEventListener('statechange',onState);
          onState();
        }),
        new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service worker update did not settle in time.')),timeout))
      ]);
    }
    await new Promise(r=>setTimeout(r,300));
    return {controlled:Boolean(navigator.serviceWorker.controller),caches:await caches.keys()};
  },timeout);
}

function makeServiceWorkerHarness(source,{failedPath,oldFallback=false,httpFailure=false}={}){
  const scope='https://example.test/tms60/sw.js';
  const normalize=input=>{
    if(input instanceof Request)return input.url;
    if(input instanceof URL)return input.href;
    return new URL(String(input),scope).href;
  };
  const stores=new Map();
  const cacheFor=name=>{
    if(!stores.has(name))stores.set(name,new Map());
    const store=stores.get(name);
    return {
      async put(request,response){store.set(normalize(request),response.clone())},
      async match(request){const hit=store.get(normalize(request));return hit?hit.clone():undefined},
      async keys(){return [...store.keys()].map(url=>new Request(url))}
    };
  };
  const cachesMock={
    async open(name){return cacheFor(name)},
    async keys(){return [...stores.keys()]},
    async delete(name){return stores.delete(name)},
    async match(request){
      for(const store of stores.values()){
        const hit=store.get(normalize(request));
        if(hit)return hit.clone();
      }
      return undefined;
    }
  };
  if(oldFallback){
    const old=cacheFor('tms60-stability29-2026-08-26');
    old.put(new Request(new URL(failedPath,scope)),new Response(`old-cache:${failedPath}`,{status:200}));
  }
  const handlers={};
  let skipWaitingCalled=false;
  const failedUrl=failedPath?new URL(failedPath,scope).href:null;
  const fetchMock=async(input)=>{
    const url=normalize(input);
    if(failedUrl&&url===failedUrl){
      if(httpFailure)return new Response('temporary upstream failure',{status:503});
      throw new TypeError('simulated temporary network failure');
    }
    return new Response(`fresh:${url}`,{status:200});
  };
  const selfMock={
    location:new URL(scope),
    addEventListener(type,handler){handlers[type]=handler},
    async skipWaiting(){skipWaitingCalled=true},
    clients:{async claim(){}}
  };
  vm.runInNewContext(source,{
    self:selfMock,
    location:selfMock.location,
    caches:cachesMock,
    fetch:fetchMock,
    Request,
    Response,
    URL,
    console,
    Promise,
    setTimeout,
    clearTimeout
  },{filename:'sw.js'});
  return {
    stores,
    normalize,
    handlers,
    get skipWaitingCalled(){return skipWaitingCalled},
    async install(){
      let pending;
      handlers.install({waitUntil(value){pending=Promise.resolve(value)}});
      if(!pending)throw new Error('install handler did not call waitUntil');
      return pending;
    }
  };
}

const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(seed);

  const sourceResponse=await page.request.get(APP+'sw.js',{headers:{'cache-control':'no-cache'}});
  const source=await sourceResponse.text();
  check(sourceResponse.status()===200,'Service worker source reachable',String(sourceResponse.status()));
  check(source.includes(EXPECTED_CACHE),'P2-4 cache revision deployed');
  check(source.includes('Promise.allSettled(CORE.map'),'Install uses all-settled precaching');
  check(source.includes('previousCachedResponse'),'Previous-cache fallback is explicit');
  check(source.includes('precacheAsset'),'Per-asset precache isolation is explicit');
  check(!source.includes('Promise.all(CORE.map'),'All-or-nothing CORE Promise.all removed');
  check(!source.includes('Failed to precache'),'Single asset failure no longer throws the old fatal precache error');

  const freshHarness=makeServiceWorkerHarness(source,{failedPath:'./app.html'});
  let freshInstallError='';
  try{await freshHarness.install()}catch(error){freshInstallError=String(error?.stack||error)}
  const freshStore=freshHarness.stores.get(EXPECTED_CACHE)||new Map();
  check(!freshInstallError,'Fresh install survives one unavailable precache asset',freshInstallError);
  check(freshHarness.skipWaitingCalled,'Fresh resilient install still reaches skipWaiting');
  check(!freshStore.has(freshHarness.normalize('./app.html')),'Unavailable fresh-install asset is allowed to remain missing');
  check(freshStore.has(freshHarness.normalize('./index.html'))&&freshStore.has(freshHarness.normalize('./translations.js')),'Other precache assets still populate after one failure',String(freshStore.size));

  const updateHarness=makeServiceWorkerHarness(source,{failedPath:'./icon-512.png',oldFallback:true,httpFailure:true});
  let updateInstallError='';
  try{await updateHarness.install()}catch(error){updateInstallError=String(error?.stack||error)}
  const updateStore=updateHarness.stores.get(EXPECTED_CACHE)||new Map();
  const fallbackResponse=updateStore.get(updateHarness.normalize('./icon-512.png'));
  const fallbackText=fallbackResponse?await fallbackResponse.clone().text():'';
  check(!updateInstallError,'Update install survives one HTTP precache failure',updateInstallError);
  check(updateHarness.skipWaitingCalled,'Update resilient install still reaches skipWaiting');
  check(fallbackText==='old-cache:./icon-512.png','Failed update asset is copied from previous TMS cache',fallbackText);
  check(updateStore.has(updateHarness.normalize('./index.html'))&&updateStore.has(updateHarness.normalize('./app.html')),'Successful update assets still refresh normally',String(updateStore.size));

  await page.goto(APP,{waitUntil:'domcontentloaded',timeout:25000});
  await frameOf(page);
  const worker=await settleWorker(page);
  check(worker.controlled,'Page is controlled by a service worker');
  check(worker.caches.includes(EXPECTED_CACHE),'Current P2-4 cache is active',worker.caches.join(', '));
  check(!worker.caches.some(name=>name.startsWith('tms60-')&&name!==EXPECTED_CACHE),'Older TMS caches removed after successful production install',worker.caches.join(', '));

  const cacheState=await page.evaluate(async cacheName=>{
    const cache=await caches.open(cacheName);
    const urls=(await cache.keys()).map(r=>new URL(r.url).pathname);
    const ends=name=>urls.some(x=>x.endsWith(`/tms60/${name}`)||x.endsWith(`/${name}`));
    return {
      index:ends('index.html'),
      app:ends('app.html'),
      translations:ends('translations.js'),
      icon:ends('icon-512.png'),
      count:urls.length
    };
  },EXPECTED_CACHE);
  check(cacheState.index&&cacheState.app&&cacheState.translations&&cacheState.icon,'Normal production install still precaches complete app assets',JSON.stringify(cacheState));

  await context.setOffline(true);
  try{
    await page.reload({waitUntil:'domcontentloaded',timeout:25000});
    const frame=await frameOf(page);
    const brand=await frame.locator('.brand-title').innerText();
    check(Boolean(brand),'Offline navigation remains functional after resilient-install change',brand);
  }catch(error){
    check(false,'Offline navigation remains functional after resilient-install change',String(error?.stack||error));
  }
  await context.setOffline(false);

  check(errors.length===0,'No runtime errors during P2-4 regression',errors.join(' | '));
  await context.close();
}catch(error){
  check(false,'P2-4 resilient precache fatal',String(error?.stack||error));
}finally{
  await browser.close();
}

console.log('\n=== P2-4 RESILIENT PRECACHE SUMMARY ===');
console.log(JSON.stringify({failures},null,2));
process.exitCode=failures?1:0;
