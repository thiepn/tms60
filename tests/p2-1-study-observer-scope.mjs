import { chromium } from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const out={passes:[],failures:[],timings:{}};
const check=(condition,name,detail='')=>{
  (condition?out.passes:out.failures).push({name,detail});
  console.log(`${condition?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);
  return condition;
};

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

async function waitForFastRecall(page,timeout=150000){
  const end=Date.now()+timeout;
  while(Date.now()<end){
    try{
      const frame=await frameOf(page,30000);
      const version=await frame.evaluate(()=>window.__TMS60_FAST_RECALL_QOL__||'');
      if(version==='1.8.0')return frame;
    }catch{}
    await page.waitForTimeout(3000);
    await page.reload({waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
  }
  throw new Error('Scoped fast-recall bundle did not reach the tested site in time');
}

async function nav(frame,view){
  await frame.locator(`#desktop-nav [data-view="${view}"]`).click();
  await frame.waitForFunction(v=>document.documentElement.dataset.view===v,view,{timeout:10000});
}

const browser=await chromium.launch({headless:true});
try{
  const sourceResponse=await fetch(`${APP}qol-fast-recall.js?scope-audit=${Date.now()}`,{cache:'no-store'});
  const source=await sourceResponse.text();
  check(sourceResponse.ok,'Fast-recall source reachable',String(sourceResponse.status));
  check(source.includes("window.__TMS60_FAST_RECALL_QOL__ = '1.8.0'"),'Scoped fast-recall revision loaded');
  check(!source.includes('new MutationObserver(bindStudyObserver).observe(document.body,{childList:true,subtree:true})'),'Whole-body subtree observer removed');
  check(!/\.observe\(document\.body\s*,\s*\{[^}]*subtree\s*:\s*true/i.test(source),'No body subtree observation remains in fast-recall layer');
  check(source.includes('studyObserver.observe(root,{childList:true,subtree:true})'),'Study mutations observed at Study root only');
  check(source.includes('.observe(contentRoot,{childList:true})'),'Root-replacement fallback observes direct content children only');
  check(!source.includes('.observe(contentRoot,{childList:true,subtree:true})'),'Content fallback does not observe its subtree');

  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error?.stack||error)));
  await page.addInitScript(seed);
  await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});
  const frame=await waitForFastRecall(page);

  check(await frame.evaluate(()=>window.__TMS60_FAST_RECALL_QOL__)==='1.8.0','Fast-recall QoL initializes in app frame');
  check(await frame.locator('#view-study').getAttribute('data-qol-focus-observed')==='1','Study root receives scoped observer marker');

  const start=Date.now();
  for(let i=0;i<8;i++){
    for(const view of ['progress','library','settings','home','study'])await nav(frame,view);
  }
  out.timings.unrelatedNavigationStress=Date.now()-start;
  check(out.timings.unrelatedNavigationStress<20000,'40-view navigation remains responsive',`${out.timings.unrelatedNavigationStress}ms`);

  await nav(frame,'study');
  await frame.waitForSelector('#study-mode-select',{timeout:10000});
  await frame.locator('#study-mode-select').selectOption('cloze');
  await frame.locator('[data-action="study-selected-verse"]').click();
  await frame.waitForSelector('.cloze-input:not(:disabled)',{timeout:10000});
  await frame.waitForTimeout(150);
  check(await frame.locator('#qol-session-strip').isVisible(),'Fast-recall Study synchronization still works');
  check(await frame.locator('.cloze-input:not(:disabled)').count()>=2,'Cloze remains functional after observer scoping');
  check(errors.length===0,'No runtime errors during observer-scope regression',errors.slice(0,3).join(' | '));
  await context.close();
}catch(error){
  check(false,'P2-1 observer-scope audit fatal',String(error?.stack||error));
}finally{
  await browser.close();
}

console.log('\n=== P2-1 STUDY OBSERVER SCOPE SUMMARY ===');
console.log(JSON.stringify(out,null,2));
process.exitCode=out.failures.length?1:0;
