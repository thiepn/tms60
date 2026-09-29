import { chromium } from 'playwright';

const APP='http://127.0.0.1:4173/';
let failures=0;
const check=(condition,name,detail='')=>{
  console.log(`${condition?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);
  if(!condition)failures++;
};

async function frameOf(page,timeout=30000){
  await page.waitForSelector('#app-frame.ready',{timeout});
  const end=Date.now()+timeout;
  while(Date.now()<end){
    const frame=page.frames().find(f=>f!==page.mainFrame());
    if(frame&&await frame.locator('.mobile-nav,#desktop-nav').count())return frame;
    await page.waitForTimeout(100);
  }
  throw new Error('App iframe not ready');
}

async function nav(frame,view){
  const mobile=frame.locator(`.mobile-nav [data-view="${view}"]`);
  if(await mobile.isVisible())await mobile.click();
  else await frame.locator(`#desktop-nav [data-view="${view}"]`).click();
  await frame.waitForFunction(v=>document.documentElement.dataset.view===v,view,{timeout:10000});
}

const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({
    viewport:{width:390,height:844},
    isMobile:true,
    hasTouch:true
  });
  const page=await context.newPage();

  // Seed only the top-level origin; addInitScript would also execute in srcdoc.
  await page.goto(APP,{waitUntil:'domcontentloaded',timeout:30000});
  await page.evaluate(()=>{
    localStorage.setItem('tms60-onboarding-v2','1');
    localStorage.setItem('tms60-onboarding-v3','1');
    localStorage.setItem('tms60-ui-language-v1','en');
    localStorage.setItem('tms60-active-translation-v1','esv');
  });
  await page.reload({waitUntil:'domcontentloaded',timeout:30000});

  const frame=await frameOf(page);
  await nav(frame,'settings');
  await frame.waitForSelector('[data-account-action="google-sign-in"]',{timeout:10000});

  let authorizeUrl='';
  await page.route('**/auth/v1/authorize**',async route=>{
    authorizeUrl=route.request().url();
    await route.abort('blockedbyclient');
  });

  const frameIdentity=await frame.evaluate(()=>({
    href:location.href,
    origin:location.origin,
    baseURI:document.baseURI,
    topHref:(()=>{try{return top.location.href}catch(_){return 'blocked'}})()
  }));
  check(frameIdentity.href==='about:srcdoc','Regression exercises the real srcdoc architecture',JSON.stringify(frameIdentity));
  check(frameIdentity.topHref===APP,'srcdoc can access the canonical top-level app URL',frameIdentity.topHref);

  await frame.locator('[data-account-action="google-sign-in"]').click();
  const deadline=Date.now()+10000;
  while(!authorizeUrl&&Date.now()<deadline)await page.waitForTimeout(50);

  check(Boolean(authorizeUrl),'Continue with Google starts the Supabase authorize request',authorizeUrl);
  if(authorizeUrl){
    const authorize=new URL(authorizeUrl);
    const redirect=authorize.searchParams.get('redirect_to');
    check(redirect===APP+'?tms60_auth=1','OAuth callback is derived from the top-level app, not srcdoc',String(redirect));
    check(!String(redirect).startsWith('about:'),'OAuth callback never uses about:srcdoc',String(redirect));
    check(authorize.searchParams.get('provider')==='google','Google provider remains selected');
    check(Boolean(authorize.searchParams.get('code_challenge')),'PKCE code challenge is present');
  }

  await context.close();
}finally{
  await browser.close();
}
process.exitCode=failures?1:0;
