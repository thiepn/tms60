import assert from 'node:assert/strict';
import {chromium} from 'playwright';
// Chromium checks ONLY a locally staged build; no production writes, OAuth, or preview deployment.
const origin='http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true});
try{
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},
      isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();
    await page.route('**/auth/v1/**',r=>r.abort('blockedbyclient'));
    await page.goto(origin,{waitUntil:'domcontentloaded',timeout:30000});
    await page.evaluate(()=>{
      localStorage.setItem('tms60-onboarding-v2','1');
      localStorage.setItem('tms60-onboarding-v3','1');
      localStorage.setItem('tms60-ui-language-v1','en');
      localStorage.setItem('tms60-active-translation-v1','esv');
      localStorage.setItem('tms60-cloudflare-review-probe','persisted');
    });
    await page.reload({waitUntil:'domcontentloaded',timeout:30000});
    await page.locator('#app-frame.ready').waitFor({timeout:30000});
    const actual=await page.evaluate(async()=>{
      const reg=await navigator.serviceWorker.ready;
      return {scope:reg.scope,probe:localStorage.getItem('tms60-cloudflare-review-probe'),
        canonical:document.querySelector('link[rel="canonical"]')?.href,
        manifest:await(await fetch('/manifest.webmanifest')).json(),
        proxy:await(await fetch('/niv-service.json')).json()};
    });
    assert.equal(actual.probe,'persisted');
    assert.equal(actual.scope,origin);
    assert.equal(actual.canonical,'https://tms60.thiepn.dev/');
    assert.equal(actual.manifest.scope,'/');
    assert.equal(actual.manifest.start_url,'/');
    assert.equal(actual.manifest.id,'/');
    assert.equal(actual.proxy.baseUrl,'https://tms60-niv-api.thiepn.workers.dev');
    const workerState=await page.evaluate(async()=>{
      const registration=await navigator.serviceWorker.ready;
      if(!registration.active)throw Error('No active offline worker');
      const channel=new MessageChannel();
      return Promise.race([
        new Promise((resolve,reject)=>{
          channel.port1.onmessage=event=>resolve(event.data);
          registration.active.postMessage({type:'TMS60_OFFLINE_STATUS'},[channel.port2]);
        }),
        new Promise((_,reject)=>setTimeout(()=>reject(Error('Offline status did not reply')),8000))
      ]);
    });
    assert.equal(workerState.ok,true);
    assert.equal(workerState.ready,true,'First complete static stage must cache every file');
    assert.equal(workerState.cached,workerState.total);
    await context.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded',timeout:30000});
    await page.locator('#app-frame.ready').waitFor({timeout:30000});
    const offline=await page.evaluate(async()=>{
      const asset=await fetch('/app.html?v=previous');
      return {state:localStorage.getItem('tms60-cloudflare-review-probe'),
        active:localStorage.getItem('tms60-active-translation-v1'),
        assetOk:asset.ok,bytes:(await asset.arrayBuffer()).byteLength};
    });
    assert.equal(offline.state,'persisted');
    assert.equal(offline.active,'esv');
    assert.equal(offline.assetOk,true);
    assert.ok(offline.bytes>1000,'Offline pinned app source must remain available');
    await context.setOffline(false);
    console.log('PASS',mobile?'mobile':'desktop','PWA offline boot, complete cache, original identity, storage, proxy config');
    await context.close();
  }
}finally{await browser.close()}
