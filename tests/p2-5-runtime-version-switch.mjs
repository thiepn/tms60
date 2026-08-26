import { chromium } from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const VERSION_KEY='tms60-active-translation-v1';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'allow'});
const page=await context.newPage();
const failures=[];
const pass=(ok,name,detail='')=>{console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!ok)failures.push({name,detail})};
const cacheDefs={
  niv:{api:'proxy'},nlt:{api:'proxy'},hfa:{api:'proxy'},klb1985:{api:'proxy'},
  schlachter1951:{api:'schlachter'},krv1961:{api:'korean'}
};

await page.addInitScript(({defs})=>{
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem('tms60-ui-language-v1','en');
  localStorage.setItem('tms60-active-translation-v1','esv');
  for(const [id,def] of Object.entries(defs)){
    const proxy=def.api==='proxy';
    localStorage.setItem(`tms60-translation-texts-v2-${id}`,JSON.stringify({
      schema:2,
      api:def.api,
      fetchedAt:new Date().toISOString(),
      copyright:proxy?`P2-5 ${id.toUpperCase()} test copyright`:'',
      verses:Array.from({length:60},(_,i)=>({id:i+1,text:`P2-5 ${id.toUpperCase()} ${i+1}`}))
    }));
  }
},{defs:cacheDefs});

await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});
await page.waitForSelector('#app-frame.ready',{timeout:45000});
await page.waitForFunction(()=>window.__TMS60_P25_SOURCE_PREP__==='1.0.0'&&window.__TMS60_P25_SHELL_RUNTIME__==='1.0.0',null,{timeout:15000});
let frame=page.frames().find(f=>f!==page.mainFrame());
await frame.waitForFunction(()=>window.__TMS60_P25_RUNTIME_TRANSLATION__==='1.0.0',null,{timeout:15000});
await page.waitForTimeout(250);

pass(Boolean(frame),'App iframe boots once');
pass(await page.evaluate(()=>window.__TMS60_P25_SOURCE_PREP__)==='1.0.0','P2-5 lightweight source preparation loaded');
pass(await page.evaluate(()=>window.__TMS60_P25_SHELL_RUNTIME__)==='1.0.0','P2-5 shell runtime loaded');
pass(await frame.evaluate(()=>window.__TMS60_P25_RUNTIME_TRANSLATION__)==='1.0.0','P2-5 in-frame runtime bridge loaded');

await frame.evaluate(()=>switchView('settings'));
await frame.waitForSelector('#shell-version-select',{timeout:10000});
await page.evaluate(()=>{
  window.__P25_FRAME_LOADS__=0;
  document.getElementById('app-frame').addEventListener('load',()=>window.__P25_FRAME_LOADS__++);
});
const initialFrame=frame;
const identity=await frame.evaluate(()=>{
  window.__P25_SENTINEL__='p2-5-document-survived';
  return {timeOrigin:performance.timeOrigin,href:location.href};
});

// Verify translation-specific progress stays separated even though the document
// itself is no longer destroyed between version changes.
await frame.evaluate(()=>{state.progress[1].stage=6;save();});
let ok=await page.evaluate(()=>activateVersion('niv'));
pass(ok===true,'ESV -> NIV runtime switch succeeds');
frame=page.frames().find(f=>f!==page.mainFrame());
pass(frame===initialFrame,'ESV -> NIV keeps the same Playwright frame object');
pass(await frame.evaluate(()=>window.__P25_SENTINEL__)==='p2-5-document-survived','ESV -> NIV keeps the same iframe document sentinel');
pass(await frame.evaluate(()=>performance.timeOrigin)===identity.timeOrigin,'ESV -> NIV keeps the same iframe time origin');
pass(await frame.evaluate(()=>state.progress[1].stage)===0,'NIV starts from its own independent progress state');
await frame.evaluate(()=>{state.progress[1].stage=2;save();});

ok=await page.evaluate(()=>activateVersion('esv'));
pass(ok===true,'NIV -> ESV runtime switch succeeds');
pass(await frame.evaluate(()=>state.progress[1].stage)===6,'Returning to ESV restores ESV-specific progress');
ok=await page.evaluate(()=>activateVersion('niv'));
pass(ok===true,'ESV -> NIV second runtime switch succeeds');
pass(await frame.evaluate(()=>state.progress[1].stage)===2,'Returning to NIV restores NIV-specific progress');

const versions=[
  ['esv','ESV'],['niv','NIV'],['nlt','NLT'],['hfa','HFA'],['schlachter1951','SCH1951'],['klb1985','KLB 1985'],['krv1961','개역한글']
];
for(const [id,short] of versions){
  ok=await page.evaluate(id=>activateVersion(id),id);
  await page.waitForTimeout(120);
  frame=page.frames().find(f=>f!==page.mainFrame());
  const info=await frame.evaluate(()=>window.TMSRuntimeTranslation.inspect());
  const shell=await page.evaluate(()=>({
    saved:localStorage.getItem('tms60-active-translation-v1')||'',
    active:activeVersion,
    loads:window.__P25_FRAME_LOADS__,
    stats:window.__TMS60_P25_SHELL_STATS__
  }));
  const ui=await frame.evaluate(()=>({
    sentinel:window.__P25_SENTINEL__,
    timeOrigin:performance.timeOrigin,
    brand:document.querySelector('.brand-sub')?.textContent||'',
    select:document.querySelector('#shell-version-select')?.value||'',
    options:document.querySelectorAll('#shell-version-select option').length,
    view:document.documentElement.dataset.view||''
  }));
  pass(ok===true,`${id}: runtime switch succeeds`);
  pass(frame===initialFrame,`${id}: iframe object is preserved`);
  pass(ui.sentinel==='p2-5-document-survived',`${id}: iframe document is preserved`);
  pass(ui.timeOrigin===identity.timeOrigin,`${id}: iframe execution context is not rebuilt`);
  pass(info.id===id,`${id}: runtime bridge reports active translation`,JSON.stringify(info));
  pass(info.verseCount===60,`${id}: runtime dataset contains all 60 verses`,String(info.verseCount));
  if(id!=='esv')pass(info.firstText===`P2-5 ${id.toUpperCase()} 1`,`${id}: expected cached wording is active`,info.firstText);
  pass(shell.saved===id&&shell.active===id,`${id}: shell and persisted version agree`,JSON.stringify({saved:shell.saved,active:shell.active}));
  pass(ui.brand.includes(short),`${id}: visible translation identity updates`,ui.brand);
  pass(ui.select===id,`${id}: Settings selector follows runtime version`,ui.select);
  pass(ui.options===7,`${id}: all seven Bible versions remain visible`,String(ui.options));
  pass(ui.view==='settings',`${id}: current Settings view survives version switch`,ui.view);
  pass(shell.loads===0,`${id}: no iframe load event occurs during switching`,String(shell.loads));
  pass(shell.stats.lastProbeBytes>0&&shell.stats.lastProbeBytes<50000,`${id}: adapter rebuild is limited to a small dataset probe`,`${shell.stats.lastProbeBytes} bytes`);
}

// Localization is independent of Bible wording and must survive an in-place
// translation swap without forcing the user back to English.
await frame.locator('#ui-language-select').selectOption('de');
await page.waitForTimeout(450);
ok=await page.evaluate(()=>activateVersion('hfa'));
await page.waitForTimeout(450);
const de=await frame.evaluate(()=>({
  saved:localStorage.getItem('tms60-ui-language-v1')||'',
  select:document.querySelector('#ui-language-select')?.value||'',
  nav:[...document.querySelectorAll('#desktop-nav [data-view] span:last-child')].map(x=>x.textContent.trim())
}));
pass(ok===true,'German UI survives runtime Bible switch');
pass(de.saved==='de'&&de.select==='de','German UI preference remains selected',JSON.stringify(de));
pass(de.nav[0]==='Heute'&&de.nav[1]==='Lernen','German navigation remains localized after Bible switch',de.nav.join(' / '));

await frame.locator('#ui-language-select').selectOption('ko');
await page.waitForTimeout(450);
ok=await page.evaluate(()=>activateVersion('klb1985'));
await page.waitForTimeout(450);
const ko=await frame.evaluate(()=>({
  saved:localStorage.getItem('tms60-ui-language-v1')||'',
  select:document.querySelector('#ui-language-select')?.value||'',
  nav:[...document.querySelectorAll('#desktop-nav [data-view] span:last-child')].map(x=>x.textContent.trim())
}));
pass(ok===true,'Korean UI survives runtime Bible switch');
pass(ko.saved==='ko'&&ko.select==='ko','Korean UI preference remains selected',JSON.stringify(ko));
pass(ko.nav[0]==='오늘'&&ko.nav[1]==='학습','Korean navigation remains localized after Bible switch',ko.nav.join(' / '));

// Defense in depth: even a direct programmatic call must not swap wording while
// a study session is active. This is stricter than the disabled Settings control.
await frame.evaluate(()=>{localStorage.setItem('tms60-ui-language-v1','en');if(window.applyUiLanguage)window.applyUiLanguage('en');});
await frame.evaluate(()=>startSingleVersePractice(1,'flashcard'));
const beforeBlocked=await frame.evaluate(()=>({info:window.TMSRuntimeTranslation.inspect(),task:{...currentTask()},sentinel:window.__P25_SENTINEL__}));
const blocked=await page.evaluate(()=>activateVersion('esv'));
const afterBlocked=await frame.evaluate(()=>({info:window.TMSRuntimeTranslation.inspect(),task:{...currentTask()},sentinel:window.__P25_SENTINEL__,active:hasActiveSession()}));
pass(blocked===false,'Direct version switch is rejected during active session');
pass(afterBlocked.active===true,'Active session survives rejected runtime switch');
pass(afterBlocked.info.id===beforeBlocked.info.id,'Rejected runtime switch preserves Bible wording',`${beforeBlocked.info.id} -> ${afterBlocked.info.id}`);
pass(afterBlocked.task.id===beforeBlocked.task.id&&afterBlocked.task.verseId===beforeBlocked.task.verseId,'Rejected runtime switch preserves current task',JSON.stringify(afterBlocked.task));
pass(afterBlocked.sentinel==='p2-5-document-survived','Rejected switch preserves iframe document');
await frame.evaluate(()=>clearSession());

const finalShell=await page.evaluate(()=>window.__TMS60_P25_SHELL_STATS__);
pass(finalShell.runtimeSwitches>=versions.length,'Runtime switch path was used repeatedly',JSON.stringify(finalShell));
pass(finalShell.legacyFallbacks===0,'No legacy full-iframe fallback was needed',JSON.stringify(finalShell));
pass(await page.evaluate(()=>window.__P25_FRAME_LOADS__)===0,'No post-boot iframe load occurred across the full regression');

console.log('\n=== P2-5 RUNTIME VERSION SWITCH SUMMARY ===');
console.log(JSON.stringify({failures,stats:finalShell},null,2));
if(failures.length)process.exitCode=1;
await browser.close();
