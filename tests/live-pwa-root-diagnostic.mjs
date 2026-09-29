import { chromium } from 'playwright';

const targets=[
  ['tms60','https://tms60.thiepn.dev/'],
  ['diet','https://thiepn.dev/diet/']
];

const browser=await chromium.launch({headless:true});
try{
  for(const [name,url] of targets){
    const context=await browser.newContext();
    const page=await context.newPage();
    const consoleMessages=[];
    const responses=[];
    let bip=false;
    page.on('console',m=>consoleMessages.push({type:m.type(),text:m.text()}));
    page.on('response',r=>{
      const u=r.url();
      if(/manifest\.webmanifest|\/sw\.js(?:\?|$)/.test(u))responses.push({url:u,status:r.status(),contentType:r.headers()['content-type']||''});
    });
    await page.addInitScript(()=>window.addEventListener('beforeinstallprompt',()=>{window.__BIP_SEEN__=true},{capture:true}));
    await page.goto(url,{waitUntil:'networkidle',timeout:45000});
    await page.waitForTimeout(2500);

    const cdp=await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const manifest=await cdp.send('Page.getAppManifest');
    const installability=await cdp.send('Page.getInstallabilityErrors');
    const state=await page.evaluate(async()=>{
      const regs='serviceWorker' in navigator?await navigator.serviceWorker.getRegistrations():[];
      return {
        href:location.href,
        origin:location.origin,
        manifestHref:document.querySelector('link[rel="manifest"]')?.href||'',
        displayStandalone:matchMedia('(display-mode: standalone)').matches,
        beforeInstallPromptSeen:Boolean(window.__BIP_SEEN__),
        registrations:regs.map(r=>({
          scope:r.scope,
          active:r.active?.scriptURL||'',
          waiting:r.waiting?.scriptURL||'',
          installing:r.installing?.scriptURL||''
        }))
      };
    });

    console.log(JSON.stringify({
      name,url,
      state,
      manifest:{
        url:manifest.url||'',
        errors:manifest.errors||[],
        data:manifest.data||'',
        parsed:manifest.parsed||null
      },
      installabilityErrors:installability.installabilityErrors||[],
      responses,
      console:consoleMessages.filter(x=>/service worker|manifest|install|404/i.test(x.text))
    },null,2));
    await context.close();
  }
}finally{
  await browser.close();
}
