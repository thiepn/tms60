import { chromium } from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const SAVE='tms60-esv-memory-lab-v1';
const out={passes:[],failures:[]};
function test(ok,name,detail=''){
  (ok?out.passes:out.failures).push({name,detail});
  console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);
}
function seed(){
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem('tms60-ui-language-v1','en');
  localStorage.setItem('tms60-active-translation-v1','esv');
  localStorage.removeItem(SAVE);
  localStorage.removeItem(SAVE+'-snapshots');
}
async function frameOf(page,timeout=60000){
  await page.waitForSelector('#app-frame.ready',{timeout});
  const end=Date.now()+timeout;
  while(Date.now()<end){
    const f=page.frames().find(x=>x!==page.mainFrame());
    if(f&&await f.locator('#desktop-nav').count())return f;
    await page.waitForTimeout(100);
  }
  throw new Error('iframe not ready');
}
async function waitForFix(page,timeout=150000){
  const end=Date.now()+timeout;
  while(Date.now()<end){
    try{
      const f=await frameOf(page,30000);
      if(await f.evaluate(()=>window.__TMS60_GUIDED_CHAIN_FIX__==='1.0.0'))return f;
    }catch{}
    await page.waitForTimeout(4000);
    await page.reload({waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
  }
  throw new Error('guided due fix not deployed in time');
}

const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(seed);
  await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});
  const frame=await waitForFix(page);

  const result=await frame.evaluate(async()=>{
    state.settings.dailyGoal=1;
    state.settings.activePerSession=1;
    state.settings.newPerDay=1;
    for(const v of VERSES) state.progress[v.id]=defaultProgress();
    state.events=[];
    session=emptySession();
    completionLocked=false;

    startSession('guided',{force:true});
    const verseId=currentTask()?.verseId;
    const stages=[];
    let guard=0;
    while(verseId && state.progress[verseId].stage<6 && guard++<12){
      const t=currentTask();
      if(!t)break;
      stages.push({stage:state.progress[verseId].stage,mode:t.mode,source:t.source,tasks:session.tasks.length,index:session.index});
      completeCurrent(3,100,{exact:true,score:100,wrong:[],missing:[],extra:[],ops:[],testedOps:[]});
      await new Promise(r=>setTimeout(r,260));
    }
    const p=state.progress[verseId];
    return {
      verseId,
      stages,
      finalStage:p?.stage,
      wordingPhase:p?.wording?.phase,
      wordingDue:p?.wording?.due,
      wordingInterval:p?.wording?.interval,
      referencePhase:p?.reference?.phase,
      referenceDue:p?.reference?.due,
      now:Date.now(),
      summary:session.summary,
      taskCount:session.tasks.length,
      index:session.index
    };
  });

  test(result.verseId===1,'Guided session begins with first unseen verse',String(result.verseId));
  test(result.stages.length>=5,'Guided session chains multiple learning stages',JSON.stringify(result.stages));
  test(result.finalStage===6,'Guided session graduates card into maintenance',`stage=${result.finalStage}`);
  test(result.wordingPhase!=='new','Graduated wording has a scheduled review phase',String(result.wordingPhase));
  test(Number(result.wordingDue)>Number(result.now),'Graduated wording receives a future due date',`${result.wordingDue-result.now}ms`);
  test(Number(result.wordingInterval)>0,'Graduated wording receives a non-zero interval',String(result.wordingInterval));
  test(result.referencePhase!=='new','Reference review is initialized when wording graduates',String(result.referencePhase));
  test(errors.length===0,'No runtime errors during guided graduation',errors.join(' | '));
  await context.close();
}catch(error){
  test(false,'Guided due regression fatal',String(error?.stack||error));
}finally{
  await browser.close();
}
console.log(JSON.stringify(out,null,2));
process.exitCode=out.failures.length?1:0;
