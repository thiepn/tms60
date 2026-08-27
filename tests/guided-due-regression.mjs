import { chromium } from 'playwright';

const APP=process.env.TMS60_APP||'https://thiepn.github.io/tms60/';
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
  localStorage.removeItem('tms60-esv-memory-lab-v1');
  localStorage.removeItem('tms60-esv-memory-lab-v1-snapshots');
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
      const markers=await f.evaluate(()=>({
        guided:window.__TMS60_GUIDED_CHAIN_FIX__||'',
        stable:window.__TMS60_SESSION_PLAN_STABILITY__||''
      }));
      if(markers.guided==='3.0.0'&&markers.stable==='2.0.0')return f;
    }catch{}
    await page.waitForTimeout(4000);
    await page.reload({waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
  }
  throw new Error('fixed-session hotfix did not reach the target in time');
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
  errors.length=0;

  const fixedPlan=await frame.evaluate(async()=>{
    state.settings.dailyGoal=5;
    state.settings.activePerSession=4;
    state.settings.newPerDay=1;
    for(const v of VERSES) state.progress[v.id]=defaultProgress();
    // Four active learning verses + one unseen verse = exactly five tasks.
    for(let id=1;id<=4;id++){
      state.progress[id].stage=1;
      state.progress[id].lastReviewed=id;
    }
    state.events=[];
    session=emptySession();
    completionLocked=false;

    startSession('guided',{force:true});
    const initial=session.tasks.length;
    const lengths=[initial];
    const stagesBefore=[];
    const stagesAfter=[];
    let guard=0;
    while(currentTask()&&guard++<10){
      const task=currentTask();
      const verseId=task.verseId;
      stagesBefore.push({verseId,stage:state.progress[verseId].stage,mode:task.mode});
      completeCurrent(3,100,{exact:true,score:100,wrong:[],missing:[],extra:[],ops:[],testedOps:[]});
      await new Promise(r=>setTimeout(r,260));
      stagesAfter.push({verseId,stage:state.progress[verseId].stage});
      lengths.push(session.tasks.length);
    }
    return {
      initial,
      lengths,
      stagesBefore,
      stagesAfter,
      index:session.index,
      summary:session.summary,
      events:state.events.length
    };
  });

  test(fixedPlan.initial===5,'Guided session begins with exactly five planned tasks',String(fixedPlan.initial));
  test(fixedPlan.lengths.every(n=>n===5),'Session task total never increases while completing work',fixedPlan.lengths.join(' -> '));
  test(fixedPlan.index===5,'Five-task session ends after exactly five completions',String(fixedPlan.index));
  test(fixedPlan.summary?.count===5,'Session summary keeps the original task count',JSON.stringify(fixedPlan.summary));
  test(fixedPlan.events===5,'All five completions are still recorded',String(fixedPlan.events));
  test(fixedPlan.stagesAfter.every((row,i)=>row.stage===fixedPlan.stagesBefore[i].stage+1),'Guided learning still advances each verse by one stage',JSON.stringify({before:fixedPlan.stagesBefore,after:fixedPlan.stagesAfter}));

  const failurePlan=await frame.evaluate(async()=>{
    for(const v of VERSES) state.progress[v.id]=defaultProgress();
    state.progress[1].stage=1;
    state.settings.activePerSession=1;
    state.settings.newPerDay=0;
    state.events=[];
    session=emptySession();
    completionLocked=false;

    startSession('guided',{force:true});
    const initial=session.tasks.length;
    const stageBefore=state.progress[1].stage;
    completeCurrent(0,0,{exact:false,score:0,wrong:['x'],missing:[],extra:[],ops:[],testedOps:[]});
    await new Promise(r=>setTimeout(r,280));
    return {
      initial,
      final:session.tasks.length,
      index:session.index,
      summary:session.summary,
      stageBefore,
      stageAfter:state.progress[1].stage,
      events:state.events.length,
      lastScore:state.progress[1].lastScore
    };
  });

  test(failurePlan.initial===1,'Failure regression begins with one planned task',String(failurePlan.initial));
  test(failurePlan.final===1,'Failed task cannot append same-session relearns',`${failurePlan.initial} -> ${failurePlan.final}`);
  test(failurePlan.index===1&&failurePlan.summary?.count===1,'Failed one-task session still finishes with denominator one',JSON.stringify(failurePlan));
  test(failurePlan.stageAfter===failurePlan.stageBefore,'Failed learning step does not falsely advance its stage',`${failurePlan.stageBefore} -> ${failurePlan.stageAfter}`);
  test(failurePlan.events===1&&failurePlan.lastScore===0,'Failed attempt is still recorded for future scheduling',JSON.stringify(failurePlan));

  const singlePlan=await frame.evaluate(async()=>{
    for(const v of VERSES) state.progress[v.id]=defaultProgress();
    state.events=[];
    session=emptySession();
    completionLocked=false;
    startVerseLearning(1);
    const initial=session.tasks.length;
    completeCurrent(3,100,{exact:true,score:100,wrong:[],missing:[],extra:[],ops:[],testedOps:[]});
    await new Promise(r=>setTimeout(r,280));
    return {initial,final:session.tasks.length,index:session.index,summary:session.summary,stage:state.progress[1].stage};
  });

  test(singlePlan.initial===1&&singlePlan.final===1,'Single-verse session also keeps its announced size',JSON.stringify(singlePlan));
  test(singlePlan.index===1&&singlePlan.summary?.count===1,'Single-verse session finishes instead of silently appending another stage',JSON.stringify(singlePlan));
  test(singlePlan.stage===1,'Single-verse completion still advances learning progress',String(singlePlan.stage));
  test(await frame.evaluate(()=>typeof window.__TMS60_NATIVE_INSERT_TASK__==='function'),'Original relearn helper retained only for diagnostics');
  test(errors.length===0,'Fixed-session regression has no runtime errors',errors.join(' | '));
  await context.close();
}catch(error){
  test(false,'Fixed-session regression fatal',String(error?.stack||error));
}finally{
  await browser.close();
}
console.log(JSON.stringify(out,null,2));
process.exitCode=out.failures.length?1:0;
