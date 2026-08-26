import {chromium} from 'playwright';

const APP='https://thiepn.github.io/tms60/';
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
async function settleWorker(page){
  return page.evaluate(async()=>{
    const reg=await navigator.serviceWorker.ready;
    await reg.update();
    const worker=reg.installing||reg.waiting;
    if(worker&&worker.state!=='activated'){
      await new Promise(resolve=>{
        const onState=()=>{
          if(worker.state==='activated'||worker.state==='redundant'){
            worker.removeEventListener('statechange',onState);
            resolve();
          }
        };
        worker.addEventListener('statechange',onState);
        onState();
      });
    }
    await new Promise(r=>setTimeout(r,300));
    return {controlled:Boolean(navigator.serviceWorker.controller),caches:await caches.keys()};
  });
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
  check(source.includes("tms60-stability29-2026-08-26"),'P2-3 cache revision deployed');
  check(!source.includes("cache:'no-store'")&&!source.includes('cache:"no-store"'),'Runtime no-store override removed');
  check(source.includes('function networkFirst('),'Network-first strategy is explicit');
  check(source.includes('async function cacheFirst('),'Cache-first strategy is explicit');
  check(source.includes("if(req.mode==='navigate')"),'Navigation requests have an explicit strategy');
  check(source.includes('STATIC_ASSETS.has(url.pathname)'),'Static assets have an explicit strategy');
  check(source.includes('event.respondWith(networkFirst(req,event))'),'Other same-origin GETs use normal-cache network-first');
  check(source.includes("fetch(url,{cache:'reload'})"),'Install-time freshness remains explicit');

  await page.goto(APP,{waitUntil:'domcontentloaded',timeout:25000});
  await frameOf(page);
  const worker=await settleWorker(page);
  check(worker.controlled,'Page is controlled by a service worker');
  check(worker.caches.includes('tms60-stability29-2026-08-26'),'Current P2-3 cache is active',worker.caches.join(', '));
  check(!worker.caches.some(name=>name.startsWith('tms60-')&&name!=='tms60-stability29-2026-08-26'),'Older TMS caches removed',worker.caches.join(', '));

  const cacheState=await page.evaluate(async()=>{
    const cache=await caches.open('tms60-stability29-2026-08-26');
    const urls=(await cache.keys()).map(r=>new URL(r.url).pathname);
    return {
      index:urls.some(x=>x.endsWith('/tms60/index.html')),
      app:urls.some(x=>x.endsWith('/tms60/app.html')),
      translations:urls.some(x=>x.endsWith('/tms60/translations.js')),
      icon:urls.some(x=>x.endsWith('/tms60/icon-192.png')),
      manifest:urls.some(x=>x.endsWith('/tms60/manifest.webmanifest')),
      count:urls.length
    };
  });
  check(cacheState.index&&cacheState.app&&cacheState.translations,'Mutable app shell is precached',JSON.stringify(cacheState));
  check(cacheState.icon&&cacheState.manifest,'Static assets are precached',JSON.stringify(cacheState));

  await page.reload({waitUntil:'domcontentloaded',timeout:25000});
  await frameOf(page);
  check(true,'Online reload succeeds through network-first shell strategy');

  await context.setOffline(true);
  try{
    await page.reload({waitUntil:'domcontentloaded',timeout:25000});
    const frame=await frameOf(page);
    const brand=await frame.locator('.brand-title').innerText();
    check(Boolean(brand),'Offline navigation falls back to cached app shell',brand);
    const offlineCore=await page.evaluate(async()=>{
      const results={};
      for(const path of ['translations.js','app.html','icon-192.png','manifest.webmanifest']){
        try{
          const response=await fetch(path);
          results[path]={ok:response.ok,status:response.status,length:(await response.arrayBuffer()).byteLength};
        }catch(error){results[path]={ok:false,error:String(error)}}
      }
      return results;
    });
    check(offlineCore['translations.js']?.ok&&offlineCore['translations.js'].length>100,'Mutable core asset falls back to Cache Storage offline',JSON.stringify(offlineCore['translations.js']));
    check(offlineCore['app.html']?.ok&&offlineCore['app.html'].length>1000,'App document falls back to Cache Storage offline',JSON.stringify(offlineCore['app.html']));
    check(offlineCore['icon-192.png']?.ok&&offlineCore['icon-192.png'].length>100,'Static icon is served cache-first offline',JSON.stringify(offlineCore['icon-192.png']));
    check(offlineCore['manifest.webmanifest']?.ok&&offlineCore['manifest.webmanifest'].length>100,'Manifest is served cache-first offline',JSON.stringify(offlineCore['manifest.webmanifest']));
  }catch(error){
    check(false,'Offline reload and asset fallback',String(error?.stack||error));
  }
  await context.setOffline(false);

  check(errors.length===0,'No runtime errors during P2-3 regression',errors.join(' | '));
  await context.close();
}catch(error){
  check(false,'P2-3 service worker strategy fatal',String(error?.stack||error));
}finally{
  await browser.close();
}

console.log('\n=== P2-3 SERVICE WORKER STRATEGY SUMMARY ===');
console.log(JSON.stringify({failures},null,2));
process.exitCode=failures?1:0;
