import { chromium } from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const THEME_KEY='tms60-global-theme-v1';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'allow'});
const page=await context.newPage();
const failures=[];
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error)));
const pass=(ok,name,detail='')=>{console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!ok)failures.push({name,detail})};

await page.addInitScript(()=>{
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem('tms60-ui-language-v1','en');
  localStorage.setItem('tms60-active-translation-v1','esv');
  localStorage.setItem('tms60-global-theme-v1',JSON.stringify({appearance:'dark',accent:'blue'}));
});

async function readyFrame(){
  await page.waitForSelector('#app-frame.ready',{timeout:45000});
  await page.waitForFunction(()=>window.__TMS60_P26_THEME_SYNC__==='1.0.0'&&window.__TMS60_P26_THEME_SYNC_STATS__?.bindings>=1,null,{timeout:15000});
  const frame=page.frames().find(f=>f!==page.mainFrame());
  if(!frame)throw new Error('TMS iframe not found');
  await frame.waitForSelector('#desktop-nav',{timeout:15000});
  return frame;
}

async function shellTheme(){
  return page.evaluate(key=>{
    let stored=null;
    try{stored=JSON.parse(localStorage.getItem(key)||'null')}catch(_){}
    const activeMode=document.querySelector('[data-mode-choice].active')?.dataset.modeChoice||'';
    const activeAccent=document.querySelector('[data-accent-choice].active')?.dataset.accentChoice||'';
    return {stored,activeMode,activeAccent,stats:{...(window.__TMS60_P26_THEME_SYNC_STATS__||{})}};
  },THEME_KEY);
}

async function appTheme(frame){
  return frame.evaluate(()=>({
    appearance:state.settings.appearance,
    accent:state.settings.accent,
    mode:document.documentElement.dataset.mode||'',
    dataAccent:document.documentElement.dataset.accent||''
  }));
}

async function waitTheme(frame,appearance,accent){
  await page.waitForFunction(([key,appearance,accent])=>{
    try{
      const theme=JSON.parse(localStorage.getItem(key)||'null');
      return theme?.appearance===appearance&&theme?.accent===accent;
    }catch(_){return false}
  },[THEME_KEY,appearance,accent],{timeout:10000});
  await frame.waitForFunction(([appearance,accent])=>state.settings.appearance===appearance&&state.settings.accent===accent&&document.documentElement.dataset.mode===appearance&&document.documentElement.dataset.accent===accent,[appearance,accent],{timeout:10000});
  await page.waitForTimeout(120);
}

async function runStateAction(frame,action,appearance,accent){
  await frame.evaluate(({action,appearance,accent})=>{
    const incoming=sanitizeState(JSON.parse(JSON.stringify(state)));
    incoming.settings.appearance=appearance;
    incoming.settings.accent=accent;
    if(action==='import-replace'||action==='import-merge'){
      pendingImport=incoming;
    }else if(action==='restore-snapshot'){
      pendingSnapshots=[{date:Date.now()-1000,state:incoming}];
    }else{
      throw new Error(`Unsupported P2-6 test action: ${action}`);
    }
    const button=document.createElement('button');
    button.type='button';
    button.dataset.action=action;
    if(action==='restore-snapshot')button.dataset.index='0';
    button.hidden=true;
    document.body.appendChild(button);
    button.click();
    button.remove();
  },{action,appearance,accent});
}

await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});
let frame=await readyFrame();
pass(await page.evaluate(()=>window.__TMS60_P26_THEME_SYNC__)==='1.0.0','P2-6 theme sync bridge loaded');

let shell=await shellTheme();
let app=await appTheme(frame);
pass(app.appearance==='dark'&&app.accent==='blue','Cold boot still obeys the pre-existing global shell theme',JSON.stringify(app));
pass(shell.stored?.appearance==='dark'&&shell.stored?.accent==='blue','Cold boot does not let per-version state overwrite global theme',JSON.stringify(shell));

await runStateAction(frame,'import-replace','light','red');
await waitTheme(frame,'light','red');
shell=await shellTheme();
app=await appTheme(frame);
pass(app.appearance==='light'&&app.accent==='red','Backup replace applies imported appearance and accent in app',JSON.stringify(app));
pass(shell.stored?.appearance==='light'&&shell.stored?.accent==='red','Backup replace promotes imported theme to global shell storage',JSON.stringify(shell.stored));
pass(shell.activeMode==='light'&&shell.activeAccent==='red','Outer shell theme choices synchronize after backup replace',JSON.stringify(shell));
pass(shell.stats.changes>=1,'Theme bridge records non-click imported theme change',JSON.stringify(shell.stats));

await page.waitForTimeout(250);
await page.reload({waitUntil:'domcontentloaded',timeout:45000});
frame=await readyFrame();
await waitTheme(frame,'light','red');
shell=await shellTheme();
app=await appTheme(frame);
pass(app.appearance==='light'&&app.accent==='red','Imported theme survives full reload',JSON.stringify(app));
pass(shell.stored?.appearance==='light'&&shell.stored?.accent==='red','Reload keeps shell and imported app theme aligned',JSON.stringify(shell.stored));

await runStateAction(frame,'restore-snapshot','dark','purple');
await waitTheme(frame,'dark','purple');
shell=await shellTheme();
app=await appTheme(frame);
pass(app.appearance==='dark'&&app.accent==='purple','Snapshot restore applies restored appearance and accent in app',JSON.stringify(app));
pass(shell.stored?.appearance==='dark'&&shell.stored?.accent==='purple','Snapshot restore promotes restored theme to global shell storage',JSON.stringify(shell.stored));
pass(shell.activeMode==='dark'&&shell.activeAccent==='purple','Outer shell theme choices synchronize after snapshot restore',JSON.stringify(shell));

await page.waitForTimeout(250);
await page.reload({waitUntil:'domcontentloaded',timeout:45000});
frame=await readyFrame();
await waitTheme(frame,'dark','purple');
shell=await shellTheme();
app=await appTheme(frame);
pass(app.appearance==='dark'&&app.accent==='purple','Restored snapshot theme survives full reload',JSON.stringify(app));
pass(shell.stored?.appearance==='dark'&&shell.stored?.accent==='purple','Reload keeps shell and restored snapshot theme aligned',JSON.stringify(shell.stored));

const beforeMerge=await shellTheme();
await runStateAction(frame,'import-merge','light','orange');
await page.waitForTimeout(300);
shell=await shellTheme();
app=await appTheme(frame);
pass(app.appearance==='dark'&&app.accent==='purple','Backup merge still preserves current settings by design',JSON.stringify(app));
pass(shell.stored?.appearance==='dark'&&shell.stored?.accent==='purple','Backup merge cannot overwrite global theme with ignored imported settings',JSON.stringify(shell.stored));
pass(shell.stats.changes===beforeMerge.stats.changes,'Merge with ignored theme settings does not count as a shell theme change',`${beforeMerge.stats.changes} -> ${shell.stats.changes}`);

await frame.evaluate(()=>{
  document.querySelector('[data-action="set-appearance"][data-value="light"]')?.click();
  document.querySelector('[data-action="set-accent"][data-value="blue"]')?.click();
});
await waitTheme(frame,'light','blue');
shell=await shellTheme();
pass(shell.stored?.appearance==='light'&&shell.stored?.accent==='blue','Existing direct appearance controls remain synchronized',JSON.stringify(shell.stored));

pass(pageErrors.length===0,'P2-6 regression has no page errors',pageErrors.join(' | '));
console.log('\n=== P2-6 THEME SYNC SUMMARY ===');
console.log(JSON.stringify({failures,stats:(await shellTheme()).stats},null,2));
if(failures.length)process.exitCode=1;
await browser.close();
