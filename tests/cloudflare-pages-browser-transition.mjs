// Automatic two-release Chromium simulation on ONE disposable localhost origin.
// No production site, OAuth, actual device or external deployment is touched.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {chromium} from 'playwright';

const source=resolve('.'),stage=join(source,'dist');
let mode='source';
const headersFor=path=>{
  const ext=extname(path);
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
    '.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json',
    '.png':'image/png','.svg':'image/svg+xml','.css':'text/css'};
  return {'content-type':types[ext]||'application/octet-stream','cache-control':'no-store'};
};
const server=createServer(async(request,response)=>{
  const p=new URL(request.url||'/', 'http://localhost').pathname;
  const file=p==='/'?'index.html':
    (mode==='stage'&&p==='/app'?'app.html':decodeURIComponent(p.slice(1)));
  if(mode==='stage'&&(p==='/index.html'||p==='/app.html')){
    response.writeHead(308,{Location:p==='/app.html'?'/app':'/','cache-control':'no-store'});
    response.end();return;
  }
  if(!/^[a-z0-9._/-]+$/i.test(file)||file.includes('..')){
    response.writeHead(404);response.end('Not found');return;
  }
  try{
    let data=await readFile(join(mode==='source'?source:stage,file));
    if(mode==='source'&&file==='app.html')
      data=Buffer.concat([data,Buffer.from('\n<!-- TMS60_SOURCE_RELEASE -->\n')]);
    response.writeHead(200,headersFor(file));response.end(data);
  }catch(_){response.writeHead(404,{'content-type':'text/plain'});response.end('Not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port+'/';
const browser=await chromium.launch({headless:true});
try{
  for(const mobile of [false,true]){
    mode='source';
    const context=await browser.newContext({
      viewport:mobile?{width:390,height:844}:{width:1280,height:800},
      isMobile:mobile,hasTouch:mobile,serviceWorkers:'allow'
    });
    let page=await context.newPage();
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{
      localStorage.setItem('tms60-onboarding-v2','1');
      localStorage.setItem('tms60-onboarding-v3','1');
      localStorage.setItem('tms60-active-translation-v1','esv');
      localStorage.setItem('tms60-cloudflare-transition','keep-original');
      localStorage.setItem('tms60-ui-language-v1','en');
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#app-frame.ready').waitFor({timeout:30000});
    await page.evaluate(()=>navigator.serviceWorker.ready);
    const fromSource=await page.evaluate(async()=>{
      const res=await fetch('/app.html');
      return {text:await res.text(),controlled:Boolean(navigator.serviceWorker.controller)};
    });
    assert.equal(fromSource.controlled,true,'Previous worker controls the source generation');
    assert.ok(fromSource.text.includes('TMS60_SOURCE_RELEASE'),'Installed old generation is present');

    mode='stage';
    const waiting=await page.evaluate(async()=>{
      const reg=await navigator.serviceWorker.ready;
      await reg.update();
      const stop=Date.now()+20000;
      while(!reg.waiting&&Date.now()<stop)await new Promise(resolve=>setTimeout(resolve,100));
      return {waiting:Boolean(reg.waiting),active:Boolean(reg.active)};
    });
    assert.equal(waiting.waiting,true,'Validated new release waits for old study tab to close');
    const preservedOld=await page.evaluate(async()=>({
      app:await(await fetch('/app.html')).text(),
      progress:localStorage.getItem('tms60-cloudflare-transition'),
      language:localStorage.getItem('tms60-ui-language-v1'),
      translation:localStorage.getItem('tms60-active-translation-v1')
    }));
    assert.ok(preservedOld.app.includes('TMS60_SOURCE_RELEASE'),'Old tab retains its version-pinned shell');
    assert.equal(preservedOld.progress,'keep-original');
    assert.equal(preservedOld.language,'en');
    assert.equal(preservedOld.translation,'esv');

    await page.close();
    await new Promise(resolve=>setTimeout(resolve,500));
    page=await context.newPage();
    await page.goto(origin,{waitUntil:'domcontentloaded',timeout:30000});
    await page.locator('#app-frame.ready').waitFor({timeout:30000});
    const upgraded=await page.evaluate(async()=>{
      const deadline=Date.now()+20000;
      let state;
      while(Date.now()<deadline){
        const reg=await navigator.serviceWorker.ready;
        const port=new MessageChannel();
        state=await Promise.race([
          new Promise(resolve=>{
            port.port1.onmessage=e=>{port.port1.close();resolve(e.data)};
            reg.active?.postMessage({type:'TMS60_OFFLINE_STATUS'},[port.port2]);
          }),
          new Promise(resolve=>setTimeout(()=>resolve(null),1000))
        ]);
        if(state?.integrityCommitted)break;
        await new Promise(resolve=>setTimeout(resolve,150));
      }
      return {state,storage:localStorage.getItem('tms60-cloudflare-transition'),
        language:localStorage.getItem('tms60-ui-language-v1'),
        translation:localStorage.getItem('tms60-active-translation-v1'),
        app:await(await fetch('/app.html')).text()};
    });
    assert.equal(upgraded.state?.integrityCommitted,true,'New staged worker was activated');
    assert.equal(upgraded.state?.ready,true,'New staged cache is complete');
    assert.equal(upgraded.storage,'keep-original','Origin-local test state survived upgrade');
    assert.equal(upgraded.language,'en','Original UI language key survived same-origin cutover');
    assert.equal(upgraded.translation,'esv','Original active translation key survived same-origin cutover');
    assert.ok(!upgraded.app.includes('TMS60_SOURCE_RELEASE'),'No stale source code remains in new shell');
    const pretty=await page.evaluate(async()=>{
      const response=await fetch('/app');
      return {ok:response.ok,app:(await response.text()).includes('TMS Memory Lab')};
    });
    assert.equal(pretty.ok,true,'Canonical Pages pretty /app route is usable');
    assert.equal(pretty.app,true,'Cloudflare pretty route loads the actual app shell');
    await context.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded',timeout:30000});
    await page.locator('#app-frame.ready').waitFor({timeout:30000});
    assert.equal(await page.evaluate(()=>localStorage.getItem('tms60-cloudflare-transition')),
      'keep-original','Offline relaunch retains existing local state');
    await context.close();
    console.log('PASS',mobile?'mobile':'desktop','two-release same-origin SW waiting, activation, local state, offline continuity');
  }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve))}
