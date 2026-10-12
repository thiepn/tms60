import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const BASE='http://127.0.0.1:4173/';
const failures=[];
const checks=[];
const check=(name,ok,detail='')=>{
  const item={name,status:ok?'PASS':'FAIL',detail:String(detail).slice(0,800)};
  checks.push(item);
  if(!ok)failures.push(item);
  console.log(item.status+' '+name+(detail?' — '+item.detail:''));
};
const browser=await chromium.launch({headless:true});
let context;
async function openMobile(width,standalone=false,shortcut=''){
  const ctx=await browser.newContext({
    viewport:{width,height:844},
    isMobile:true,hasTouch:true,deviceScaleFactor:2,
    userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
    serviceWorkers:'allow'
  });
  await ctx.addInitScript(({standalone})=>{
    try{
      localStorage.setItem('tms60-onboarding-v2','1');
      localStorage.setItem('tms60-ui-language-v1','en');
      localStorage.setItem('tms60-active-translation-v1','esv');
    }catch(_){}
    if(standalone){
      const nativeMatch=window.matchMedia.bind(window);
      window.matchMedia=query=>{
        if(query==='(display-mode: standalone)')return {matches:true,media:query};
        return nativeMatch(query);
      };
    }
  },{standalone});
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(BASE+shortcut,{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#app-frame.ready').waitFor({timeout:30000});
  const child=page.frameLocator('#app-frame');
  await child.locator('#desktop-nav').waitFor({timeout:30000});
  await child.locator('#native-pwa-card').waitFor({timeout:10000});
  return {ctx,page,child,errors};
}
try{
  const app=await openMobile(390,true,'?tmsView=study');
  context=app.ctx;
  const {page,child,errors}=app;

  // Chromium exposes real manifest/installability diagnostics without
  // installing an actual Android WebAPK in the Linux runner.
  const cdp=await page.context().newCDPSession(page);
  const manifest=await cdp.send('Page.getAppManifest');
  const eligibility=await cdp.send('Page.getInstallabilityErrors');
  check('Chrome finds app manifest',Boolean(manifest.url),manifest.url||'');
  check('Manifest has no critical parser errors',!(manifest.errors||[]).some(e=>e.critical),
    JSON.stringify(manifest.errors||[]));
  check('Chromium reports no installability errors',
    (eligibility.installabilityErrors||[]).length===0,
    JSON.stringify(eligibility.installabilityErrors||[]));
  check('Launcher Study shortcut opens the actual Study screen',
    await child.locator('#view-study').evaluate(e=>e.classList.contains('active')));
  check('Launcher query consumed safely',!(await page.url()).includes('tmsView='));

  const nav=child.locator('.mobile-nav');
  check('390px mobile navigation visible',await nav.isVisible());
  let overflow=await child.locator('html').evaluate(e=>e.scrollWidth-e.clientWidth);
  check('390px document has no horizontal overflow',overflow<=5,String(overflow)+'px');
  await child.locator('.mobile-nav [data-view="progress"]').click();
  check('Progress screen opens',
    await child.locator('#view-progress').evaluate(e=>e.classList.contains('active')));
  check('Standalone view recorded in history',
    await page.evaluate(()=>history.state?.tms60PwaView)==='progress');

  await page.evaluate(()=>history.back());
  await page.waitForFunction(()=>history.state?.tms60PwaView==='study');
  check('Android Back restores previous Study view',
    await child.locator('#view-study').evaluate(e=>e.classList.contains('active')));

  // Exercise app's established persistence writer with synthetic, temporary
  // data in a disposable browser profile, not real account records.
  const before=await child.locator('html').evaluate(()=>{
    const initial=state.progress[1].stage;
    state.progress[1].stage=2;
    save();
    return {initial,now:state.progress[1].stage};
  });
  check('Synthetic verse state saved through existing writer',before.now===2);
  const worker=await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    if(navigator.serviceWorker.controller)return true;
    return new Promise(resolve=>{
      const timer=setTimeout(()=>resolve(false),15000);
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        clearTimeout(timer);resolve(Boolean(navigator.serviceWorker.controller));
      },{once:true});
    });
  });
  check('Service worker controls candidate page',worker);

  const card=child.locator('#native-pwa-card');
  await card.locator('[data-native-pwa-action="prepare"]').click();
  await card.locator('[data-native-pwa-action="prepare"]').waitFor({state:'visible'});
  await page.waitForTimeout(1000);
  const status=await card.locator('#native-pwa-status').innerText();
  check('Prepare offline access reports complete bundle',status.includes('Offline bundle ready'),status);

  await app.ctx.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#app-frame.ready').waitFor({timeout:30000});
  const offlineChild=page.frameLocator('#app-frame');
  await offlineChild.locator('#view-study').waitFor({timeout:15000});
  const persisted=await offlineChild.locator('html').evaluate(()=>state.progress[1].stage);
  check('Offline restart preserves actual verse progress',persisted===2,JSON.stringify({persisted}));
  check('Offline Study remains usable',
    await offlineChild.locator('#view-study').evaluate(e=>e.classList.contains('active')) ||
    await offlineChild.locator('.mobile-nav [data-view="study"]').isVisible());
  check('No uncaught page errors in mobile session',errors.length===0,errors.join(' | '));
  await app.ctx.setOffline(false);
  await app.ctx.close();
  context=null;

  // Independent narrow viewport acceptance; no production origin is visited.
  const narrow=await openMobile(360,false);
  context=narrow.ctx;
  check('360px mobile navigation visible',await narrow.child.locator('.mobile-nav').isVisible());
  overflow=await narrow.child.locator('html').evaluate(e=>e.scrollWidth-e.clientWidth);
  check('360px document has no horizontal overflow',overflow<=5,String(overflow)+'px');
  const css=await narrow.child.locator('.mobile-nav').evaluate(e=>getComputedStyle(e).paddingBottom);
  check('Bottom gesture-safe spacing present',Number.parseFloat(css)>=8,css);
  await narrow.ctx.close();
  context=null;
}catch(error){
  check('Chromium PWA integration suite completed',false,error.stack||String(error));
}finally{
  await context?.close().catch(()=>{});
  await browser.close();
}
console.log('P2 MOBILE RESULTS '+JSON.stringify({passed:checks.length-failures.length,failed:failures.length,checks}));
process.exitCode=failures.length?1:0;
