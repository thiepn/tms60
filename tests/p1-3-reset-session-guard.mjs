import { chromium } from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
const failures=[];
const pass=(ok,name,detail='')=>{console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!ok)failures.push({name,detail})};

await page.addInitScript(()=>{
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem('tms60-ui-language-v1','en');
  localStorage.setItem('tms60-active-translation-v1','esv');
});

await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});
await page.waitForSelector('#app-frame.ready',{timeout:45000});
let frame;
for(let i=0;i<200;i++){
  frame=page.frames().find(f=>f!==page.mainFrame());
  if(frame&&await frame.locator('#desktop-nav').count())break;
  await page.waitForTimeout(100);
}
if(!frame)throw new Error('App iframe not ready');
await frame.waitForFunction(()=>window.__TMS60_P13_RESET_GUARD__==='1.0.0',null,{timeout:10000});

async function nav(view){
  await frame.evaluate(v=>{
    if(typeof switchView!=='function')throw new Error('switchView unavailable');
    switchView(v);
  },view);
  await frame.waitForFunction(v=>document.documentElement.dataset.view===v,view,{timeout:10000});
  await frame.waitForTimeout(160);
}

// Seed real progress and a non-default setting so a destructive reset would be observable.
await frame.evaluate(()=>{
  state.settings.dailyGoal=17;
  if(typeof markSettingsChanged==='function')markSettingsChanged();
  if(typeof applyManualProgressState!=='function')throw new Error('applyManualProgressState unavailable');
  if(!applyManualProgressState(1,'known',7,'known',{snapshot:false,notify:false,save:false}))throw new Error('Could not seed progress');
  if(typeof scheduleSave==='function')scheduleSave(true);
});

const seeded=await frame.evaluate(()=>({stage:state.progress[1].stage,events:state.events.length,dailyGoal:state.settings.dailyGoal}));
pass(seeded.stage===6,'Seeded verse progress before session',JSON.stringify(seeded));
pass(seeded.events>0,'Seeded review history before session',String(seeded.events));
pass(seeded.dailyGoal===17,'Seeded setting before session',String(seeded.dailyGoal));

await frame.evaluate(()=>{
  if(typeof startSingleVersePractice!=='function')throw new Error('startSingleVersePractice unavailable');
  if(!startSingleVersePractice(1,'flashcard'))throw new Error('Could not start manual practice');
  window.__p13FrameToken='reset-session-guard-frame';
});
await frame.waitForFunction(()=>typeof hasActiveSession==='function'&&hasActiveSession(),null,{timeout:10000});

const before=await frame.evaluate(()=>{
  const t=typeof currentTask==='function'?currentTask():null;
  return {
    task:t?{id:t.id,verseId:t.verseId,mode:t.mode}:null,
    stage:state.progress[1].stage,
    events:state.events.length,
    dailyGoal:state.settings.dailyGoal,
    stateEpoch:state.meta.stateEpoch,
    storage:localStorage.getItem(KEY)
  };
});
pass(Boolean(before.task),'Active task exists before reset attempts',JSON.stringify(before.task));

await nav('settings');
await frame.waitForFunction(()=>{
  const a=document.querySelector('[data-action="confirm-reset-progress"]');
  const b=document.querySelector('[data-action="confirm-reset-all"]');
  return Boolean(a?.disabled&&b?.disabled&&a.dataset.sessionLocked==='1'&&b.dataset.sessionLocked==='1');
},null,{timeout:10000});

let lock=await frame.evaluate(()=>({
  progressDisabled:Boolean(document.querySelector('[data-action="confirm-reset-progress"]')?.disabled),
  allDisabled:Boolean(document.querySelector('[data-action="confirm-reset-all"]')?.disabled),
  progressLocked:document.querySelector('[data-action="confirm-reset-progress"]')?.dataset.sessionLocked||'',
  allLocked:document.querySelector('[data-action="confirm-reset-all"]')?.dataset.sessionLocked||'',
  note:document.querySelector('[data-session-reset-lock]')?.textContent||''
}));
pass(lock.progressDisabled&&lock.allDisabled,'Destructive reset buttons disabled during active session',JSON.stringify(lock));
pass(lock.progressLocked==='1'&&lock.allLocked==='1','Reset controls expose session lock state');
pass(/End the active study session/i.test(lock.note),'Settings explains why reset is locked',lock.note);

// Hostile bypass 1: re-enable the confirmation button and click it.
await frame.evaluate(()=>{
  const button=document.querySelector('[data-action="confirm-reset-progress"]');
  if(!button)throw new Error('Reset progress button missing');
  button.disabled=false;
  button.click();
});
await frame.waitForTimeout(250);

let after=await frame.evaluate(()=>{
  const t=typeof currentTask==='function'?currentTask():null;
  return {
    active:typeof hasActiveSession==='function'&&hasActiveSession(),
    task:t?{id:t.id,verseId:t.verseId,mode:t.mode}:null,
    stage:state.progress[1].stage,
    events:state.events.length,
    dailyGoal:state.settings.dailyGoal,
    stateEpoch:state.meta.stateEpoch,
    storage:localStorage.getItem(KEY),
    view:document.documentElement.dataset.view,
    modal:Boolean(document.querySelector('.modal')),
    frameToken:window.__p13FrameToken||''
  };
});
pass(after.active,'Session survives hostile reset-progress confirmation attempt');
pass(JSON.stringify(after.task)===JSON.stringify(before.task),'Current task preserved after blocked reset-progress attempt',JSON.stringify(after.task));
pass(after.stage===before.stage&&after.events===before.events&&after.dailyGoal===before.dailyGoal&&after.stateEpoch===before.stateEpoch,'In-memory progress unchanged after blocked reset-progress attempt');
pass(after.storage===before.storage,'Persisted progress unchanged after blocked reset-progress attempt');
pass(after.view==='study','Blocked reset-progress attempt returns to active study session',after.view);
pass(!after.modal,'Blocked reset-progress attempt cannot open destructive modal');
pass(after.frameToken==='reset-session-guard-frame','Iframe survives blocked reset-progress attempt',after.frameToken);

// Hostile bypass 2: dispatch the final destructive action directly.
await nav('settings');
await frame.evaluate(()=>{
  const probe=document.createElement('button');
  probe.type='button';
  probe.dataset.action='reset-all';
  probe.id='p13-hostile-reset-all';
  document.getElementById('view-settings').appendChild(probe);
  probe.click();
});
await frame.waitForTimeout(250);

after=await frame.evaluate(()=>{
  const t=typeof currentTask==='function'?currentTask():null;
  return {
    active:typeof hasActiveSession==='function'&&hasActiveSession(),
    task:t?{id:t.id,verseId:t.verseId,mode:t.mode}:null,
    stage:state.progress[1].stage,
    events:state.events.length,
    dailyGoal:state.settings.dailyGoal,
    stateEpoch:state.meta.stateEpoch,
    storage:localStorage.getItem(KEY),
    view:document.documentElement.dataset.view,
    frameToken:window.__p13FrameToken||''
  };
});
pass(after.active,'Session survives direct reset-all action attempt');
pass(JSON.stringify(after.task)===JSON.stringify(before.task),'Current task preserved after direct reset-all attempt',JSON.stringify(after.task));
pass(after.stage===before.stage&&after.events===before.events&&after.dailyGoal===before.dailyGoal&&after.stateEpoch===before.stateEpoch,'In-memory progress unchanged after direct reset-all attempt');
pass(after.storage===before.storage,'Persisted progress unchanged after direct reset-all attempt');
pass(after.view==='study','Blocked reset-all attempt returns to active study session',after.view);
pass(after.frameToken==='reset-session-guard-frame','Iframe survives blocked reset-all attempt',after.frameToken);

// End the session normally. Reset must become available and continue to work.
const endButton=frame.locator('[data-action="end-session"]').last();
await endButton.click();
await frame.waitForSelector('[data-action="end-session-now"]',{timeout:10000});
await frame.locator('[data-action="end-session-now"]').click();
await frame.waitForFunction(()=>typeof hasActiveSession==='function'&&!hasActiveSession(),null,{timeout:10000});
await nav('settings');
await frame.waitForFunction(()=>{
  const a=document.querySelector('[data-action="confirm-reset-progress"]');
  const b=document.querySelector('[data-action="confirm-reset-all"]');
  return Boolean(a&&!a.disabled&&b&&!b.disabled&&a.dataset.sessionLocked==='0'&&b.dataset.sessionLocked==='0');
},null,{timeout:10000});

lock=await frame.evaluate(()=>({
  progressDisabled:Boolean(document.querySelector('[data-action="confirm-reset-progress"]')?.disabled),
  allDisabled:Boolean(document.querySelector('[data-action="confirm-reset-all"]')?.disabled),
  note:Boolean(document.querySelector('[data-session-reset-lock]'))
}));
pass(!lock.progressDisabled&&!lock.allDisabled,'Reset buttons unlock after session ends');
pass(!lock.note,'Session reset-lock explanation clears after session ends');

await frame.locator('[data-action="confirm-reset-progress"]').click();
await frame.waitForSelector('[data-action="reset-progress"]',{timeout:10000});
await frame.locator('[data-action="reset-progress"]').click();
await frame.waitForFunction(()=>state.progress[1].stage===0&&state.events.length===0,null,{timeout:10000});

const resetResult=await frame.evaluate(()=>({
  active:typeof hasActiveSession==='function'&&hasActiveSession(),
  stage:state.progress[1].stage,
  events:state.events.length,
  dailyGoal:state.settings.dailyGoal
}));
pass(!resetResult.active,'Reset executes only after session has ended');
pass(resetResult.stage===0&&resetResult.events===0,'Reset progress clears progress and review history after session ends',JSON.stringify(resetResult));
pass(resetResult.dailyGoal===17,'Reset progress still preserves settings',String(resetResult.dailyGoal));

console.log(JSON.stringify({failures},null,2));
if(failures.length)process.exitCode=1;
await browser.close();
