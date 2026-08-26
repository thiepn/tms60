import { chromium } from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const VERSION_KEY='tms60-active-translation-v1';
const NIV_CACHE_KEY='tms60-translation-texts-v2-niv';

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'allow'});
const page=await context.newPage();
const failures=[];
const pass=(ok,name,detail='')=>{console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!ok)failures.push({name,detail})};

// Do not initialize the Bible-version preference here: addInitScript also runs
// for srcdoc child frames, so touching VERSION_KEY in this hook could mask or
// manufacture the exact persistence bug this regression is meant to detect.
await page.addInitScript(()=>{
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem('tms60-ui-language-v1','en');
});

await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});
await page.waitForFunction(()=>Boolean(window.TMSVersions?.buildAppSource),null,{timeout:15000});
await page.waitForSelector('#app-frame.ready',{timeout:45000});
await page.evaluate(async()=>{if('serviceWorker'in navigator)await navigator.serviceWorker.ready;});

// Simulate a saved NIV preference with no usable local NIV text, followed by a
// temporary server failure during startup. The shell may use ESV for this boot,
// but must not overwrite the user's persisted NIV preference.
await page.evaluate(({versionKey,cacheKey})=>{
  localStorage.setItem(versionKey,'niv');
  localStorage.removeItem(cacheKey);
},{versionKey:VERSION_KEY,cacheKey:NIV_CACHE_KEY});

await page.route('**/v1/bibles/niv/tms60',route=>route.fulfill({
  status:503,
  contentType:'application/json',
  body:JSON.stringify({error:'P1-7 temporary outage'})
}));

await page.reload({waitUntil:'domcontentloaded',timeout:45000});
await page.waitForSelector('#app-frame.ready',{timeout:45000});
let frame=page.frames().find(f=>f!==page.mainFrame());
const fallback=frame?await frame.evaluate(()=>({
  first:typeof VERSES!=='undefined'?VERSES[0]?.text||'':'',
  count:typeof VERSES!=='undefined'?VERSES.length:0,
  saved:localStorage.getItem('tms60-active-translation-v1')||''
})):null;
const notice=await page.locator('#notice').textContent();

pass(Boolean(frame),'Temporary translation failure still boots the app');
pass(fallback?.count===60,'Temporary fallback has the full 60-verse ESV dataset',JSON.stringify(fallback));
pass(fallback?.first?.includes('Therefore, if anyone is in Christ'),'Temporary fallback actually uses ESV wording',fallback?.first||'');
pass(fallback?.saved==='niv','Temporary fallback preserves saved NIV preference',fallback?.saved||'');
pass((notice||'').includes('using ESV temporarily'),'User is told the ESV fallback is temporary',notice||'');

// Restore the service and verify that the next startup automatically retries
// the still-saved NIV preference instead of staying on ESV.
await page.unroute('**/v1/bibles/niv/tms60');
await page.route('**/v1/bibles/niv/tms60',route=>route.fulfill({
  status:200,
  contentType:'application/json',
  body:JSON.stringify({
    copyright:'P1-7 recovered NIV',
    verses:Array.from({length:60},(_,i)=>({id:i+1,text:`P1-7 RECOVERED NIV ${i+1}`}))
  })
}));

await page.reload({waitUntil:'domcontentloaded',timeout:45000});
await page.waitForSelector('#app-frame.ready',{timeout:45000});
frame=page.frames().find(f=>f!==page.mainFrame());
const recovered=frame?await frame.evaluate(()=>({
  first:typeof VERSES!=='undefined'?VERSES[0]?.text||'':'',
  last:typeof VERSES!=='undefined'?VERSES.at(-1)?.text||'':'',
  count:typeof VERSES!=='undefined'?VERSES.length:0,
  saved:localStorage.getItem('tms60-active-translation-v1')||''
})):null;

pass(recovered?.count===60,'Recovered preferred translation has all 60 verses',JSON.stringify(recovered));
pass(recovered?.first==='P1-7 RECOVERED NIV 1','Next startup retries and restores NIV automatically',recovered?.first||'');
pass(recovered?.last==='P1-7 RECOVERED NIV 60','Recovered NIV dataset is complete',recovered?.last||'');
pass(recovered?.saved==='niv','Successful retry keeps NIV as saved preference',recovered?.saved||'');

// A deliberate successful switch to ESV must still persist normally. The new
// non-persistent behavior is only for automatic emergency fallback.
const deliberate=await page.evaluate(async()=>{
  const ok=await activateVersion('esv');
  return {ok,saved:localStorage.getItem('tms60-active-translation-v1')||''};
});
pass(deliberate.ok===true,'Deliberate version change still succeeds',JSON.stringify(deliberate));
pass(deliberate.saved==='esv','Deliberate ESV selection still persists',deliberate.saved||'');

await page.unroute('**/v1/bibles/niv/tms60');
console.log(JSON.stringify({failures},null,2));
if(failures.length)process.exitCode=1;
await browser.close();
