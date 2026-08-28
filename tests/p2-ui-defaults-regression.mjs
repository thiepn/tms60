import { chromium } from 'playwright';

const APP=process.env.TMS60_APP||'https://thiepn.github.io/tms60/';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
const failures=[],pageErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error)));
const pass=(ok,name,detail='')=>{console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!ok)failures.push({name,detail})};

await page.addInitScript(()=>{
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem('tms60-ui-language-v1','en');
  localStorage.setItem('tms60-active-translation-v1','esv');
});
await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});
await page.waitForSelector('#app-frame.ready',{timeout:45000});
const frame=page.frames().find(candidate=>candidate!==page.mainFrame());
await frame.waitForSelector('#view-home',{timeout:15000});

const result=await frame.evaluate(()=>{
  const reference=new Date(2027,0,2,12).getTime();
  const expected=new Date(2027,0,2,12);
  expected.setDate(expected.getDate()+120);
  const expectedKey=`${expected.getFullYear()}-${String(expected.getMonth()+1).padStart(2,'0')}-${String(expected.getDate()).padStart(2,'0')}`;
  const stateTarget=defaultState().settings.targetDate;
  const today=new Date();
  today.setHours(12,0,0,0);
  today.setDate(today.getDate()+120);
  const liveExpected=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  return{
    stateTarget,liveExpected,
    invalidFallback:sanitizeTargetDate('not-a-date',reference),
    expiredLegacy:sanitizeTargetDate('2026-12-27',reference),
    expectedKey,
    customPreserved:sanitizeTargetDate('2032-04-05',reference),
    singular:formatMinutes(1),
    plural:formatMinutes(2),
    ratingCaps:[74,75,89,90,99,100].map(score=>[score,maxRatingForScore(score)]),
    homeText:document.getElementById('view-home').innerText
  };
});

pass(result.stateTarget===result.liveExpected,'Fresh target date rolls 120 local-calendar days forward',`${result.stateTarget} / ${result.liveExpected}`);
pass(result.invalidFallback===result.expectedKey,'Invalid target date receives the rolling default',result.invalidFallback);
pass(result.expiredLegacy===result.expectedKey,'Expired legacy default date migrates forward',result.expiredLegacy);
pass(result.customPreserved==='2032-04-05','A valid custom target date remains unchanged',result.customPreserved);
pass(result.singular==='1 minute','One-minute estimates use singular grammar',result.singular);
pass(result.plural==='2 minutes','Multi-minute estimates use plural grammar',result.plural);
pass(JSON.stringify(result.ratingCaps)===JSON.stringify([[74,0],[75,1],[89,1],[90,2],[99,2],[100,3]]),'Score caps use the 75/90/100 rating thresholds',JSON.stringify(result.ratingCaps));
pass(!/Approximately 1 minutes\b/.test(result.homeText),'Home screen never renders “1 minutes”');
pass(pageErrors.length===0,'P2 UI/default regression has no page errors',pageErrors.join(' | '));

console.log('\n=== P2 UI DEFAULTS SUMMARY ===');
console.log(JSON.stringify({failures,result},null,2));
if(failures.length)process.exitCode=1;
await browser.close();
