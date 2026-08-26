import { chromium } from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const PROXY_VERSIONS=['niv','nlt','hfa','klb1985'];
const CACHE_PREFIX='tms60-translation-texts-v2-';
const CACHE_SCHEMA=2;
const THIRTY_DAYS=30*24*60*60*1000;

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'allow'});
const page=await context.newPage();
const failures=[];
const pass=(ok,name,detail='')=>{console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!ok)failures.push({name,detail})};

async function ensureServiceWorker(page,timeout=15000){
  return page.evaluate(async timeout=>{
    if(!('serviceWorker'in navigator))throw new Error('Service workers are unavailable in this browser context.');
    let registration=await navigator.serviceWorker.getRegistration();
    if(!registration)registration=await navigator.serviceWorker.register('sw.js');
    const ready=await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service worker did not become ready in time.')),timeout))
    ]);
    return {scope:ready.scope,controlled:Boolean(navigator.serviceWorker.controller)};
  },timeout);
}

await page.addInitScript(()=>{
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem('tms60-ui-language-v1','en');
  // Seed ESV only on the first navigation. Later test reloads deliberately set
  // another active translation and must not be overwritten by this init hook.
  if(!localStorage.getItem('tms60-active-translation-v1'))localStorage.setItem('tms60-active-translation-v1','esv');
});

await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});
await page.waitForFunction(()=>Boolean(window.TMSVersions?.buildAppSource),null,{timeout:15000});
await page.waitForSelector('#app-frame.ready',{timeout:45000});
let workerReady=await ensureServiceWorker(page);
if(!workerReady.controlled){
  // A newly registered worker may be active before it controls the document.
  // Reload once while online so the subsequent offline boot checks are genuine
  // service-worker navigations instead of browser network failures.
  await page.reload({waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>Boolean(window.TMSVersions?.buildAppSource),null,{timeout:15000});
  await page.waitForSelector('#app-frame.ready',{timeout:45000});
  workerReady=await ensureServiceWorker(page);
}
pass(Boolean(workerReady.scope),'Service worker is ready for P1-6 PWA checks',JSON.stringify(workerReady));
pass(workerReady.controlled,'Page is controlled before P1-6 offline reloads',JSON.stringify(workerReady));

const manifest=await page.evaluate(async()=>{
  const source=await fetch('app.html',{cache:'no-store'}).then(r=>r.text());
  const built=await TMSVersions.buildAppSource(source,'esv');
  return {source,verses:built.verses.map(v=>({id:v.id,reference:v.reference}))};
});
pass(manifest.verses.length===60,'Loaded 60-verse base manifest',String(manifest.verses.length));

function staleRecord(version){
  return {
    schema:CACHE_SCHEMA,
    api:'proxy',
    fetchedAt:new Date(Date.now()-THIRTY_DAYS).toISOString(),
    copyright:`P1-6 stale copyright ${version}`,
    verses:manifest.verses.map(v=>({id:v.id,text:`P1-6 STALE ${version.toUpperCase()} ${v.id}`}))
  };
}

await page.evaluate(({versions,prefix,records})=>{
  for(const version of versions)localStorage.setItem(prefix+version,JSON.stringify(records[version]));
},{versions:PROXY_VERSIONS,prefix:CACHE_PREFIX,records:Object.fromEntries(PROXY_VERSIONS.map(v=>[v,staleRecord(v)]))});

// Unit-level production-path check while the browser is explicitly offline.
await context.setOffline(true);
const offlineBuilds=await page.evaluate(async({source,versions})=>{
  const output={};
  for(const version of versions){
    try{
      const built=await TMSVersions.buildAppSource(source,version);
      output[version]={
        ok:true,
        count:built.verses.length,
        first:built.verses[0]?.text||'',
        last:built.verses.at(-1)?.text||'',
        copyrightIncluded:built.source.includes(`P1-6 stale copyright ${version}`)
      };
    }catch(error){output[version]={ok:false,error:String(error?.message||error)}}
  }
  return output;
},{source:manifest.source,versions:PROXY_VERSIONS});

for(const version of PROXY_VERSIONS){
  const result=offlineBuilds[version];
  pass(result?.ok,`${version}: 30-day-old cache builds while offline`,JSON.stringify(result));
  pass(result?.count===60,`${version}: offline stale cache retains all 60 verses`,String(result?.count));
  pass(result?.first===`P1-6 STALE ${version.toUpperCase()} 1`,`${version}: first stale cached verse preserved`,result?.first);
  pass(result?.last===`P1-6 STALE ${version.toUpperCase()} 60`,`${version}: last stale cached verse preserved`,result?.last);
  pass(result?.copyrightIncluded===true,`${version}: stale cached copyright preserved`);
}

// End-to-end PWA boot: with only service-worker assets + localStorage available,
// each proxy translation must still open instead of falling back to ESV.
for(const version of PROXY_VERSIONS){
  await page.evaluate(version=>localStorage.setItem('tms60-active-translation-v1',version),version);
  await page.reload({waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForSelector('#app-frame.ready',{timeout:45000});
  let frame;
  for(let i=0;i<160;i++){
    frame=page.frames().find(f=>f!==page.mainFrame());
    if(frame&&await frame.locator('#desktop-nav').count())break;
    await page.waitForTimeout(100);
  }
  const boot=frame?await frame.evaluate(()=>({
    first:typeof VERSES!=='undefined'?VERSES[0]?.text||'':'',
    count:typeof VERSES!=='undefined'?VERSES.length:0,
    version:localStorage.getItem('tms60-active-translation-v1')||''
  })):null;
  pass(Boolean(frame),`${version}: iframe boots offline from PWA cache`);
  pass(boot?.count===60,`${version}: offline PWA boot has 60 verses`,JSON.stringify(boot));
  pass(boot?.first===`P1-6 STALE ${version.toUpperCase()} 1`,`${version}: offline shell uses stale translation instead of ESV fallback`,JSON.stringify(boot));
  pass(boot?.version===version,`${version}: active translation remains selected offline`,boot?.version);
}

// Online with a stale cache: a service failure should fall back to the stale
// validated copy rather than making the translation unavailable.
await context.setOffline(false);
await page.route('**/v1/bibles/hfa/tms60',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'test outage'})}));
const outageFallback=await page.evaluate(async source=>{
  localStorage.setItem('tms60-translation-texts-v2-hfa',JSON.stringify({
    schema:2,api:'proxy',fetchedAt:new Date(Date.now()-30*24*60*60*1000).toISOString(),copyright:'P1-6 outage copyright',
    verses:Array.from({length:60},(_,i)=>({id:i+1,text:`P1-6 OUTAGE HFA ${i+1}`}))
  }));
  try{
    const built=await TMSVersions.buildAppSource(source,'hfa');
    return {ok:true,first:built.verses[0].text,count:built.verses.length};
  }catch(error){return {ok:false,error:String(error?.message||error)}}
},manifest.source);
pass(outageFallback.ok,'HFA: stale cache survives online proxy outage',JSON.stringify(outageFallback));
pass(outageFallback.first==='P1-6 OUTAGE HFA 1'&&outageFallback.count===60,'HFA: outage fallback uses validated stale dataset',JSON.stringify(outageFallback));
await page.unroute('**/v1/bibles/hfa/tms60');

// The 14-day threshold must still act as a refresh threshold while online.
await page.route('**/v1/bibles/niv/tms60',route=>route.fulfill({
  status:200,
  contentType:'application/json',
  body:JSON.stringify({copyright:'P1-6 refreshed copyright',verses:Array.from({length:60},(_,i)=>({id:i+1,text:`P1-6 REFRESHED NIV ${i+1}`}))})
}));
const refresh=await page.evaluate(async source=>{
  localStorage.setItem('tms60-translation-texts-v2-niv',JSON.stringify({
    schema:2,api:'proxy',fetchedAt:new Date(Date.now()-30*24*60*60*1000).toISOString(),copyright:'old',
    verses:Array.from({length:60},(_,i)=>({id:i+1,text:`P1-6 OLD NIV ${i+1}`}))
  }));
  const before=JSON.parse(localStorage.getItem('tms60-translation-texts-v2-niv'));
  const built=await TMSVersions.buildAppSource(source,'niv');
  const after=JSON.parse(localStorage.getItem('tms60-translation-texts-v2-niv'));
  return {first:built.verses[0].text,beforeAt:before.fetchedAt,afterAt:after.fetchedAt,copyright:after.copyright};
},manifest.source);
pass(refresh.first==='P1-6 REFRESHED NIV 1','NIV: stale cache refreshes from network when available',JSON.stringify(refresh));
pass(Date.parse(refresh.afterAt)>Date.parse(refresh.beforeAt),'NIV: successful refresh renews cache timestamp',JSON.stringify(refresh));
pass(refresh.copyright==='P1-6 refreshed copyright','NIV: successful refresh updates cached copyright',refresh.copyright);
await page.unroute('**/v1/bibles/niv/tms60');

// Corrupt/incomplete stale caches must not be accepted merely because stale
// fallback exists.
const invalid=await page.evaluate(async source=>{
  localStorage.setItem('tms60-translation-texts-v2-nlt',JSON.stringify({
    schema:2,api:'proxy',fetchedAt:new Date(Date.now()-30*24*60*60*1000).toISOString(),copyright:'',
    verses:Array.from({length:59},(_,i)=>({id:i+1,text:`BAD ${i+1}`}))
  }));
  window.TMS_BIBLE_PROXY_URL='https://invalid.test';
  const nativeFetch=window.fetch;
  window.fetch=async(url,opts)=>{
    if(String(url).startsWith('https://invalid.test/'))throw new TypeError('offline test');
    return nativeFetch(url,opts);
  };
  try{await TMSVersions.buildAppSource(source,'nlt');return {rejected:false};}
  catch(error){return {rejected:true,error:String(error?.message||error)}}
  finally{window.fetch=nativeFetch;delete window.TMS_BIBLE_PROXY_URL;}
},manifest.source);
pass(invalid.rejected===true,'Incomplete stale cache remains rejected',JSON.stringify(invalid));

console.log(JSON.stringify({failures},null,2));
if(failures.length)process.exitCode=1;
await browser.close();
