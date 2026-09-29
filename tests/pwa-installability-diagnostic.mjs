import { chromium } from 'playwright';

const APP='http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true});
let failed=false;
try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  await page.goto(APP,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(1500);

  const cdp=await context.newCDPSession(page);
  const manifest=await cdp.send('Page.getAppManifest');
  const installability=await cdp.send('Page.getInstallabilityErrors');
  const appId=await cdp.send('Page.getAppId').catch(error=>({error:String(error)}));

  const result={
    manifestUrl:manifest.url||'',
    manifestErrors:manifest.errors||[],
    manifestData:manifest.data||'',
    parsed:manifest.parsed||null,
    installabilityErrors:installability.installabilityErrors||[],
    appId
  };
  console.log(JSON.stringify(result,null,2));

  if(!manifest.url) failed=true;
  if((manifest.errors||[]).some(error=>error.critical)) failed=true;
  if((installability.installabilityErrors||[]).length) failed=true;
  await context.close();
}finally{
  await browser.close();
}
process.exitCode=failed?1:0;
