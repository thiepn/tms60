import { chromium } from 'playwright';

const targets=[
  ['tms60','https://tms60.thiepn.dev/'],
  ['diet','https://thiepn.dev/diet/']
];

const dnsDiagnostics={};
for(const type of ['CNAME','A','AAAA']){
  try{
    const response=await fetch(`https://dns.google/resolve?name=tms60.thiepn.dev&type=${type}`,{headers:{accept:'application/dns-json'}});
    const data=await response.json();
    dnsDiagnostics[type]={status:data.Status,answers:(data.Answer||[]).map(answer=>({name:answer.name,type:answer.type,ttl:answer.TTL,data:answer.data}))};
  }catch(error){dnsDiagnostics[type]={error:String(error)}}
}
console.log('=== GOOGLE DNS ===');
console.log(JSON.stringify(dnsDiagnostics,null,2));

const browser=await chromium.launch({headless:true});
let failed=false;
try{
  for(const [name,url] of targets){
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage();
    await page.addInitScript(()=>{
      window.__pwaInstallEvent={fired:false};
      window.addEventListener('beforeinstallprompt',event=>{
        window.__pwaInstallEvent={fired:true,platforms:event.platforms||[],hasPrompt:typeof event.prompt==='function'};
      });
    });
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
        manifestHref:document.querySelector('link[rel="manifest"]')?.href||'',
        installEvent:window.__pwaInstallEvent||null,
        location:location.href,
        baseURI:document.baseURI,
        scripts:[...document.scripts].map(script=>script.src).filter(Boolean)
      };
    });

    const iconDiagnostics={};
    for(const iconName of ['icon-192.png','icon-512.png']){
      const iconUrl=new URL(iconName,url).href;
      const response=await fetch(iconUrl,{cache:'no-store'});
      const bytes=new Uint8Array(await response.arrayBuffer());
      const pngSignature=[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
      const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      iconDiagnostics[iconName]={
        url:iconUrl,
        status:response.status,
        contentType:response.headers.get('content-type')||'',
        bytes:bytes.length,
        pngSignature,
        width:pngSignature&&bytes.length>=24?view.getUint32(16):null,
        height:pngSignature&&bytes.length>=24?view.getUint32(20):null,
        bitDepth:pngSignature&&bytes.length>=26?bytes[24]:null,
        colorType:pngSignature&&bytes.length>=26?bytes[25]:null
      };
    }

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
      consoleMessages,
      iconDiagnostics
    };
    console.log('=== '+name.toUpperCase()+' ===');
    console.log(JSON.stringify(result,null,2));

    if(name==='tms60'){
      if(!manifest.url)failed=true;
      if((manifest.errors||[]).some(error=>error.critical))failed=true;
      if((installability.installabilityErrors||[]).length)failed=true;
      const expectedScope='https://tms60.thiepn.dev/';
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
