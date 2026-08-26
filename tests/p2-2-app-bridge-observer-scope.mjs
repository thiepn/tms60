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

async function nav(frame,view){
  const button=frame.locator(`#desktop-nav [data-view="${view}"]`);
  await button.click();
  await frame.waitForFunction(v=>document.documentElement.dataset.view===v,view,{timeout:10000});
}

const browser=await chromium.launch({headless:true});
try{
  const sourceResponse=await fetch(`${APP}index.html?bridge-scope-audit=${Date.now()}`,{cache:'no-store'});
  const source=await sourceResponse.text();
  check(sourceResponse.ok,'Shell source reachable',String(sourceResponse.status));
  check(source.includes("window.__TMS60_APP_BRIDGE_SCOPE__='2.2.0'"),'Scoped app-bridge revision loaded');
  check(!/\.observe\(doc\.body\s*,\s*\{[^}]*subtree\s*:\s*true/i.test(source),'Whole iframe-body subtree observer removed');
  check(!source.includes("observer.observe(doc.body,{childList:true,subtree:true})"),'Legacy app-bridge body observer removed');
  check(source.includes("settingsObserver.observe(settingsRoot,{childList:true,subtree:true})"),'Settings bridge observes Settings root only');
  check(source.includes("rootObserver.observe(contentRoot,{childList:true})"),'Settings-root replacement fallback observes direct content children only');
  check(!source.includes("rootObserver.observe(contentRoot,{childList:true,subtree:true})"),'Root-replacement fallback does not observe content subtree');

  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error?.stack||error)));
  await page.addInitScript(seed);
  await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});
  const frame=await frameOf(page);
  await page.waitForFunction(()=>window.__TMS60_APP_BRIDGE_SCOPE__==='2.2.0',null,{timeout:10000});

  check(await page.evaluate(()=>window.__TMS60_APP_BRIDGE_SCOPE__)==='2.2.0','App bridge scope marker initialized');
  const initialStats=await page.evaluate(()=>({...window.__TMS60_APP_BRIDGE_STATS__}));
  check(initialStats?.settingsBindings>=1,'Settings observer bound at startup',JSON.stringify(initialStats));

  await nav(frame,'settings');
  await frame.waitForSelector('[data-shell-version-settings] #shell-version-select',{timeout:10000});
  await frame.waitForSelector('[data-shell-version-settings] #ui-language-select',{timeout:10000});
  let selectors=await frame.evaluate(()=>({
    language:document.querySelectorAll('#ui-language-select').length,
    bible:document.querySelectorAll('#shell-version-select').length,
    combined:Boolean(document.querySelector('[data-shell-version-settings] #ui-language-select')&&document.querySelector('[data-shell-version-settings] #shell-version-select')),
    versions:document.querySelector('#shell-version-select')?.options.length||0
  }));
  check(selectors.language===1&&selectors.bible===1,'One language and one Bible selector after initial bridge attach',JSON.stringify(selectors));
  check(selectors.combined&&selectors.versions===7,'Combined Settings translation controls remain intact',JSON.stringify(selectors));

  // Settings rerenders must still recreate the shell-owned Bible card.
  for(let i=0;i<8;i++){
    await frame.evaluate(()=>{ if(typeof renderSettings==='function')renderSettings(); else throw new Error('renderSettings unavailable'); });
    await frame.waitForSelector('[data-shell-version-settings] #shell-version-select',{timeout:10000});
    await frame.waitForTimeout(35);
  }
  selectors=await frame.evaluate(()=>({
    language:document.querySelectorAll('#ui-language-select').length,
    bible:document.querySelectorAll('#shell-version-select').length,
    combined:Boolean(document.querySelector('[data-shell-version-settings] #ui-language-select')&&document.querySelector('[data-shell-version-settings] #shell-version-select')),
    versions:document.querySelector('#shell-version-select')?.options.length||0
  }));
  check(selectors.language===1&&selectors.bible===1&&selectors.combined&&selectors.versions===7,'Bridge survives repeated Settings rerenders',JSON.stringify(selectors));

  // Heavy mutations in Study must not wake the Settings bridge observer.
  const beforeStudyMutation=await page.evaluate(()=>({...window.__TMS60_APP_BRIDGE_STATS__}));
  await nav(frame,'study');
  const mutationStart=Date.now();
  await frame.evaluate(()=>{
    const root=document.getElementById('view-study');
    if(!root)throw new Error('Study root missing');
    for(let i=0;i<500;i++){
      const node=document.createElement('span');
      node.dataset.p22Noise=String(i);
      root.appendChild(node);
      node.remove();
    }
  });
  await page.waitForTimeout(120);
  out.timings.studyNoise=Date.now()-mutationStart;
  const afterStudyMutation=await page.evaluate(()=>({...window.__TMS60_APP_BRIDGE_STATS__}));
  check(afterStudyMutation.settingsMutationCallbacks===beforeStudyMutation.settingsMutationCallbacks,'Study mutations do not wake Settings bridge observer',`${beforeStudyMutation.settingsMutationCallbacks} -> ${afterStudyMutation.settingsMutationCallbacks}`);
  check(afterStudyMutation.rootChecks===beforeStudyMutation.rootChecks,'Study subtree mutations do not wake root-replacement observer',`${beforeStudyMutation.rootChecks} -> ${afterStudyMutation.rootChecks}`);
  check(out.timings.studyNoise<3000,'Heavy unrelated Study mutations remain responsive',`${out.timings.studyNoise}ms`);

  // A real Settings mutation should wake the scoped observer and self-heal the card.
  await nav(frame,'settings');
  const beforeSettingsMutation=await page.evaluate(()=>({...window.__TMS60_APP_BRIDGE_STATS__}));
  await frame.evaluate(()=>document.querySelector('[data-shell-version-settings]')?.remove());
  await frame.waitForSelector('[data-shell-version-settings] #shell-version-select',{timeout:10000});
  await page.waitForTimeout(80);
  const afterSettingsMutation=await page.evaluate(()=>({...window.__TMS60_APP_BRIDGE_STATS__}));
  check(afterSettingsMutation.settingsMutationCallbacks>beforeSettingsMutation.settingsMutationCallbacks,'Settings mutation wakes scoped bridge observer',`${beforeSettingsMutation.settingsMutationCallbacks} -> ${afterSettingsMutation.settingsMutationCallbacks}`);
  check(await frame.locator('#shell-version-select').count()===1,'Removed Bible-version card self-heals exactly once');

  // The cheap content observer is only for wholesale Settings-root replacement.
  const beforeRootReplacement=await page.evaluate(()=>({...window.__TMS60_APP_BRIDGE_STATS__}));
  await frame.evaluate(()=>{
    const old=document.getElementById('view-settings');
    if(!old)throw new Error('Settings root missing');
    const replacement=document.createElement('section');
    replacement.id='view-settings';
    replacement.className=old.className;
    replacement.innerHTML='<div class="settings-grid"><div class="stack"></div></div>';
    old.replaceWith(replacement);
  });
  await frame.waitForSelector('#view-settings [data-shell-version-settings] #shell-version-select',{timeout:10000});
  await page.waitForTimeout(80);
  const afterRootReplacement=await page.evaluate(()=>({...window.__TMS60_APP_BRIDGE_STATS__}));
  check(afterRootReplacement.rootChecks>beforeRootReplacement.rootChecks,'Direct-child observer detects Settings-root replacement',`${beforeRootReplacement.rootChecks} -> ${afterRootReplacement.rootChecks}`);
  check(afterRootReplacement.settingsBindings>beforeRootReplacement.settingsBindings,'Bridge rebinds to replacement Settings root',`${beforeRootReplacement.settingsBindings} -> ${afterRootReplacement.settingsBindings}`);
  check(await frame.locator('#view-settings #shell-version-select').count()===1,'Replacement Settings root receives Bible-version control');

  check(errors.length===0,'No runtime errors during app-bridge scope regression',errors.slice(0,3).join(' | '));
  await context.close();
}catch(error){
  check(false,'P2-2 app-bridge scope audit fatal',String(error?.stack||error));
}finally{
  await browser.close();
}

console.log('\n=== P2-2 APP BRIDGE OBSERVER SCOPE SUMMARY ===');
console.log(JSON.stringify(out,null,2));
process.exitCode=out.failures.length?1:0;
