import { chromium } from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const VERSION_KEY='tms60-active-translation-v1';
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

async function nav(view){
  await frame.evaluate(v=>{
    if(typeof switchView!=='function')throw new Error('switchView unavailable');
    switchView(v);
  },view);
  await frame.waitForFunction(v=>document.documentElement.dataset.view===v,view,{timeout:10000});
  await frame.waitForTimeout(120);
}

await nav('settings');
await frame.waitForSelector('#shell-version-select',{timeout:10000});
let report=await frame.evaluate(()=>{
  const select=document.getElementById('shell-version-select');
  return {disabled:Boolean(select?.disabled),locked:select?.dataset.sessionLocked||'',value:select?.value||''};
});
pass(!report.disabled,'Bible version selector enabled before a study session');
pass(report.value==='esv','Initial Bible version is ESV',report.value);

await frame.evaluate(()=>{
  if(typeof startSingleVersePractice!=='function')throw new Error('startSingleVersePractice unavailable');
  if(!startSingleVersePractice(1,'flashcard'))throw new Error('Could not start manual practice');
});
await frame.waitForFunction(()=>typeof hasActiveSession==='function'&&hasActiveSession(),null,{timeout:10000});
await frame.evaluate(()=>{window.__p12FrameToken='session-guard-frame';});
const taskBefore=await frame.evaluate(()=>{
  const t=typeof currentTask==='function'?currentTask():null;
  return t?{id:t.id,verseId:t.verseId,mode:t.mode}:null;
});
pass(Boolean(taskBefore),'Active task created before version-switch attempt',JSON.stringify(taskBefore));

await nav('settings');
await frame.waitForFunction(()=>document.getElementById('shell-version-select')?.disabled===true,null,{timeout:10000});
report=await frame.evaluate(()=>{
  const select=document.getElementById('shell-version-select');
  return {disabled:Boolean(select?.disabled),locked:select?.dataset.sessionLocked||'',value:select?.value||''};
});
pass(report.disabled,'Bible version selector locked during active session');
pass(report.locked==='1','Session lock state exposed on Bible selector',report.locked);
pass(report.value==='esv','Locked selector remains on active version',report.value);

// Simulate a hostile/programmatic attempt that removes the disabled flag first.
// The capturing guard must still stop the shell change handler and preserve the session.
await frame.evaluate(()=>{
  const select=document.getElementById('shell-version-select');
  if(!select)throw new Error('Bible selector missing');
  select.disabled=false;
  select.value='niv';
  select.dispatchEvent(new Event('change',{bubbles:true,cancelable:true}));
});
await frame.waitForTimeout(350);

const afterAttempt=await frame.evaluate(versionKey=>{
  const select=document.getElementById('shell-version-select');
  const t=typeof currentTask==='function'?currentTask():null;
  return {
    activeVersion:localStorage.getItem(versionKey),
    selectValue:select?.value||'',
    selectDisabled:Boolean(select?.disabled),
    locked:select?.dataset.sessionLocked||'',
    activeSession:typeof hasActiveSession==='function'&&hasActiveSession(),
    task:t?{id:t.id,verseId:t.verseId,mode:t.mode}:null,
    view:document.documentElement.dataset.view,
    frameToken:window.__p12FrameToken||''
  };
},VERSION_KEY);

pass(afterAttempt.activeVersion==='esv','Programmatic switch cannot change stored Bible version',String(afterAttempt.activeVersion));
pass(afterAttempt.selectValue==='esv','Blocked switch snaps selector back to active version',afterAttempt.selectValue);
pass(afterAttempt.selectDisabled&&afterAttempt.locked==='1','Bible selector relocks after forced bypass attempt');
pass(afterAttempt.activeSession,'Active study session survives blocked version switch');
pass(JSON.stringify(afterAttempt.task)===JSON.stringify(taskBefore),'Current study task is preserved exactly',JSON.stringify(afterAttempt.task));
pass(afterAttempt.view==='study','Blocked version switch returns user to active study session',afterAttempt.view);
pass(afterAttempt.frameToken==='session-guard-frame','Iframe was not reloaded by blocked switch',afterAttempt.frameToken);

const storedAfterAttempt=await page.evaluate(key=>localStorage.getItem(key),VERSION_KEY);
pass(storedAfterAttempt==='esv','Outer shell active-version state remains ESV',String(storedAfterAttempt));

// End the session through the real UI, then verify the version selector unlocks again.
const endButton=frame.locator('[data-action="end-session"]').last();
await endButton.click();
await frame.waitForSelector('[data-action="end-session-now"]',{timeout:10000});
await frame.locator('[data-action="end-session-now"]').click();
await frame.waitForFunction(()=>typeof hasActiveSession==='function'&&!hasActiveSession(),null,{timeout:10000});
await nav('settings');
await frame.waitForFunction(()=>document.getElementById('shell-version-select')?.disabled===false,null,{timeout:10000});

const unlocked=await frame.evaluate(()=>{
  const select=document.getElementById('shell-version-select');
  return {disabled:Boolean(select?.disabled),locked:select?.dataset.sessionLocked||'',value:select?.value||''};
});
pass(!unlocked.disabled,'Bible version selector unlocks after session ends');
pass(unlocked.locked==='0','Session lock state clears after session ends',unlocked.locked);
pass(unlocked.value==='esv','Unlocked selector still reflects active Bible version',unlocked.value);

console.log(JSON.stringify({failures},null,2));
if(failures.length)process.exitCode=1;
await browser.close();
