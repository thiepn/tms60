import { chromium } from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const LANG='tms60-ui-language-v1';
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

async function nav(view,{direct=false}={}){
  if(direct){
    await frame.evaluate(v=>{if(typeof switchView!=='function')throw new Error('switchView unavailable');switchView(v)},view);
  }else{
    await frame.locator(`#desktop-nav [data-view="${view}"]`).click();
  }
  await frame.waitForFunction(v=>document.documentElement.dataset.view===v,view,{timeout:10000});
  await frame.waitForTimeout(120);
}

async function assertSettings(label){
  await frame.waitForSelector('#ui-language-select',{timeout:10000});
  await frame.waitForSelector('#shell-version-select',{timeout:10000});
  await frame.waitForFunction(()=>{
    const card=document.querySelector('[data-shell-version-settings]');
    return Boolean(card&&card.contains(document.getElementById('ui-language-select'))&&card.contains(document.getElementById('shell-version-select')));
  },null,{timeout:10000});

  const report=await frame.evaluate(()=>{
    const language=document.getElementById('ui-language-select');
    const bible=document.getElementById('shell-version-select');
    const card=document.querySelector('[data-shell-version-settings]');
    const lr=language?.getBoundingClientRect(),br=bible?.getBoundingClientRect(),cr=card?.getBoundingClientRect();
    const settingsNav=document.querySelector('#desktop-nav [data-view="settings"]');
    const ns=settingsNav?getComputedStyle(settingsNav):null,nr=settingsNav?.getBoundingClientRect();
    return {
      languageCount:document.querySelectorAll('#ui-language-select').length,
      bibleCount:document.querySelectorAll('#shell-version-select').length,
      combined:Boolean(card&&language&&bible&&card.contains(language)&&card.contains(bible)),
      languageVisible:Boolean(lr&&lr.width>0&&lr.height>0),
      bibleVisible:Boolean(br&&br.width>0&&br.height>0),
      cardVisible:Boolean(cr&&cr.width>0&&cr.height>0),
      languageValue:language?.value||'',
      bibleOptions:bible?.options?.length||0,
      settingsNavUsable:Boolean(settingsNav&&!settingsNav.disabled&&ns?.display!=='none'&&ns?.visibility!=='hidden'&&nr&&nr.width>0&&nr.height>0)
    };
  });
  pass(report.languageCount===1,`One language selector ${label}`,String(report.languageCount));
  pass(report.bibleCount===1,`One Bible selector ${label}`,String(report.bibleCount));
  pass(report.combined,`Language selector remains with Bible selector ${label}`);
  pass(report.languageVisible&&report.bibleVisible&&report.cardVisible,`Combined selectors are visible ${label}`);
  pass(report.bibleOptions===7,`All Bible versions remain visible ${label}`,String(report.bibleOptions));
  pass(report.settingsNavUsable,`Settings navigation remains available ${label}`);
  return report;
}

await nav('settings');
await assertSettings('on initial open');

for(let round=1;round<=8;round++){
  await nav('home');
  await nav('settings');
  await assertSettings(`after Settings rerender ${round}`);
}

for(const lang of ['de','ko','en']){
  await frame.locator('#ui-language-select').evaluate((s,value)=>{
    s.value=value;
    s.dispatchEvent(new Event('change',{bubbles:true}));
  },lang);
  await page.waitForFunction(([key,value])=>localStorage.getItem(key)===value,[LANG,lang],{timeout:10000});
  await frame.waitForTimeout(500);
  await nav('home',{direct:true});
  await nav('settings',{direct:true});
  const report=await assertSettings(`after language ${lang}`);
  pass(report.languageValue===lang,`Language value persists as ${lang}`,report.languageValue);
}

console.log(JSON.stringify({failures},null,2));
if(failures.length)process.exitCode=1;
await browser.close();
