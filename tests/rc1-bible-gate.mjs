import {chromium} from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const VER='tms60-active-translation-v1';
const STRICT_VERSIONS=new Set(['esv','niv','nlt','hfa','klb1985']);
let fails=0;

const check=(condition,name,detail='')=>{
  console.log(`${condition?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);
  if(!condition)fails++;
};

function seed({version,key}){
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem('tms60-ui-language-v1','en');
  localStorage.setItem(key,version);
}

async function frameOf(page,timeout=25000){
  await page.waitForSelector('#app-frame.ready',{timeout});
  for(let i=0;i<timeout/100;i++){
    const frame=page.frames().find(item=>item!==page.mainFrame());
    if(frame&&await frame.locator('#desktop-nav').count())return frame;
    await page.waitForTimeout(100);
  }
  throw new Error('frame not ready');
}

async function nav(frame,view){
  await frame.locator(`#desktop-nav [data-view="${view}"]`).click();
  await frame.waitForFunction(value=>document.documentElement.dataset.view===value,view,{timeout:5000});
  await frame.waitForTimeout(250);
}

const browser=await chromium.launch({headless:true});
try{
  for(const [version,label] of [
    ['esv','ESV'],
    ['niv','NIV'],
    ['nlt','NLT'],
    ['hfa','HFA'],
    ['schlachter1951','SCH1951'],
    ['klb1985','KLB 1985'],
    ['krv1961','개역한글']
  ]){
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await context.newPage();
    const errors=[];
    const hosts=new Set();
    page.on('pageerror',error=>errors.push(String(error?.stack||error)));
    page.on('request',request=>{try{hosts.add(new URL(request.url()).hostname)}catch{}});
    await page.addInitScript(seed,{version,key:VER});

    try{
      await page.goto(APP,{waitUntil:'domcontentloaded',timeout:25000});
      const frame=await frameOf(page);
      const notice=page.locator('#notice.error:not(.hidden)');
      const message=await notice.count()?await notice.innerText():'';
      const brand=await frame.locator('.brand-sub').innerText();
      const quote=await frame.locator('.quote-mini').first().innerText().catch(()=> '');
      const loadedRequested=brand.includes(label);

      if(STRICT_VERSIONS.has(version)){
        check(!message,`${label} loads`,message);
        check(loadedRequested,`${label} active source`,brand);
      }else if(loadedRequested){
        check(true,`${label} external source loads when provider is reachable`,brand);
      }else{
        check(
          /Could not load .*using ESV temporarily/i.test(message),
          `${label} external source failure falls back safely`,
          message
        );
        check(brand.includes('ESV'),`${label} fallback uses ESV without corrupting the app`,brand);
      }

      check(quote.trim().length>7,`${label} verse text`,`${quote.trim().length} chars`);
      await nav(frame,'settings');
      check(await frame.locator('#shell-version-select').inputValue()===version,`${label} selector value`);
      check((await page.evaluate(key=>localStorage.getItem(key),VER))===version,`${label} persists preferred version`);

      if(['niv','nlt','hfa','klb1985'].includes(version)){
        check(hosts.has('tms60-niv-api.thiepn.workers.dev'),`${label} Worker proxy`);
        check(!hosts.has('rest.api.bible'),`${label} no direct API.Bible browser call`);
      }

      check(!errors.length,`${label} no runtime errors`,errors.join(' | '));
    }catch(error){
      check(false,`${label} complete production load`,String(error?.stack||error));
    }finally{
      await context.close();
    }
  }

  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  await page.addInitScript(seed,{version:'esv',key:VER});
  await page.goto(APP,{waitUntil:'domcontentloaded',timeout:25000});
  let frame=await frameOf(page);
  await nav(frame,'settings');

  for(const [version,label] of [['niv','NIV'],['klb1985','KLB 1985'],['esv','ESV']]){
    await frame.locator('#shell-version-select').evaluate((select,value)=>{
      select.value=value;
      select.dispatchEvent(new Event('change',{bubbles:true}));
    },version);
    await page.waitForFunction(([key,value])=>localStorage.getItem(key)===value,[VER,version],{timeout:15000});
    await page.waitForTimeout(1200);
    frame=await frameOf(page);
    const brand=await frame.locator('.brand-sub').innerText();
    check(brand.includes(label),`live selector switch ${label}`,brand);
    await nav(frame,'settings');
  }

  await context.close();
}catch(error){
  check(false,'Bible gate fatal',String(error?.stack||error));
}finally{
  await browser.close();
}

process.exitCode=fails?1:0;
