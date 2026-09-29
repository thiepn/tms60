import { chromium } from 'playwright';

const APP='https://tms60.thiepn.dev/';
const out={requests:[],console:[],pageErrors:[],result:null};

function seed(){
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem('tms60-ui-language-v1','en');
  localStorage.setItem('tms60-active-translation-v1','esv');
}

async function frameOf(page,timeout=45000){
  await page.waitForSelector('#app-frame.ready',{timeout});
  const end=Date.now()+timeout;
  while(Date.now()<end){
    const frame=page.frames().find(f=>f!==page.mainFrame());
    if(frame&&await frame.locator('#desktop-nav').count())return frame;
    await page.waitForTimeout(100);
  }
  throw new Error('App iframe not ready');
}

async function nav(frame,view){
  await frame.locator(`#desktop-nav [data-view="${view}"]`).click();
  await frame.waitForFunction(v=>document.documentElement.dataset.view===v,view,{timeout:10000});
}

const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({
    viewport:{width:390,height:844},
    isMobile:true,
    hasTouch:true,
    userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/136.0.0.0 Mobile Safari/537.36'
  });
  const page=await context.newPage();
  page.on('console',msg=>out.console.push({type:msg.type(),text:msg.text()}));
  page.on('pageerror',error=>out.pageErrors.push(String(error?.stack||error)));
  page.on('request',req=>{
    const url=req.url();
    if(url.includes('hycegznamzjhwinegaai.supabase.co/auth/v1/authorize'))out.requests.push(url);
  });
  await page.route('**/auth/v1/authorize**',async route=>{
    out.requests.push(route.request().url());
    await route.abort('blockedbyclient');
  });

  await page.addInitScript(seed);
  await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});
  const frame=await frameOf(page);
  await nav(frame,'settings');
  await frame.waitForSelector('[data-account-action="google-sign-in"]',{timeout:15000});

  const before=await frame.evaluate(()=>({
    href:top.location.href,
    frameHref:location.href,
    online:navigator.onLine,
    button:document.querySelector('[data-account-action="google-sign-in"]')?.outerHTML||null,
    status:document.querySelector('#tms60-account-card .account-meta')?.innerText||null,
    hasApi:Boolean(window.TMS60Account?.signInGoogle),
    supabase:Boolean(window.supabase?.createClient)
  }));

  await frame.locator('[data-account-action="google-sign-in"]').click();
  await page.waitForTimeout(3500).catch(()=>{});

  let after=null;
  try{
    after=await frame.evaluate(()=>({
      href:top.location.href,
      status:document.querySelector('#tms60-account-card .account-meta')?.innerText||null,
      toast:[...document.querySelectorAll('.toast,.notice,[role="status"]')].map(el=>el.textContent?.trim()).filter(Boolean).slice(-8)
    }));
  }catch(error){after={frameUnavailable:String(error)}}

  out.result={before,after};
  console.log(JSON.stringify(out,null,2));

  if(!before.hasApi)process.exitCode=2;
  if(!out.requests.length)process.exitCode=3;
}finally{
  await browser.close();
}
