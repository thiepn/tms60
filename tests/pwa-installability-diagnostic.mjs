import { chromium } from 'playwright';

const targets=[
  ['tms60','http://127.0.0.1:4173/'],
  ['diet','https://thiepn.dev/diet/']
];

const browser=await chromium.launch({headless:true});
let failed=false;
try{
  for(const [name,url] of targets){
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage();
    const responses=[];
    const consoleMessages=[];
    page.on('console',message=>consoleMessages.push({type:message.type(),text:message.text()}));
    page.on('response',response=>{
      const u=response.url();
      if(/manifest\.webmanifest|\/sw\.js(?:\?|$)/.test(u))responses.push({url:u,status:response.status(),contentType:response.headers()['content-type']||''});
    });
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForTimeout(2500);

    const cdp=await context.newCDPSession(page);
    const manifest=await cdp.send('Page.getAppManifest');
    const installability=await cdp.send('Page.getInstallabilityErrors');
    const appId=await cdp.send('Page.getAppId').catch(error=>({error:String(error)}));
    const registration=await page.evaluate(async()=>{
      const regs='serviceWorker' in navigator?await navigator.serviceWorker.getRegistrations():[];
      return {
        controlled:Boolean(navigator.serviceWorker?.controller),
        registrations:regs.map(reg=>({scope:reg.scope,active:reg.active?.scriptURL||'',waiting:reg.waiting?.scriptURL||'',installing:reg.installing?.scriptURL||''})),
        manifestHref:document.querySelector('link[rel="manifest"]')?.href||''
      };
    });

    const result={
      name,url,
      manifestUrl:manifest.url||'',
      manifestErrors:manifest.errors||[],
      manifestData:manifest.data||'',
      parsed:manifest.parsed||null,
      installabilityErrors:installability.installabilityErrors||[],
      appId,
      registration,
      responses,
      consoleMessages
    };
    console.log('=== '+name.toUpperCase()+' ===');
    console.log(JSON.stringify(result,null,2));

    if(name==='tms60'){
      if(!manifest.url)failed=true;
      if((manifest.errors||[]).some(error=>error.critical))failed=true;
      if((installability.installabilityErrors||[]).length)failed=true;
      const expectedScope='http://127.0.0.1:4173/';
      if(!registration.registrations.some(reg=>reg.scope===expectedScope&&reg.active===expectedScope+'sw.js'))failed=true;
      if(registration.registrations.some(reg=>reg.scope.includes('/tms60/')))failed=true;
      if(consoleMessages.some(message=>/\/tms60\/sw\.js|service worker registration failed/i.test(message.text)))failed=true;
    }
    await context.close();
  }
}finally{
  await browser.close();
}
process.exitCode=failed?1:0;
