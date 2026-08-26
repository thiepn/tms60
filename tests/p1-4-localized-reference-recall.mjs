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
await frame.waitForFunction(()=>window.__TMS60_P14_LOCALIZED_REFERENCE_RECALL__==='1.0.0',null,{timeout:10000});

const cases=[
  // Required P1-4 examples.
  ['2 Corinthians 5:17','2. Korinther 5:17','German full numbered book'],
  ['John 14:21','Johannes 14:21','German full book'],
  ['2 Corinthians 5:17','고린도후서 5:17','Korean full numbered book'],
  ['John 14:21','요한복음 14:21','Korean full book'],

  // Common German input forms and German chapter/verse comma notation.
  ['2 Corinthians 5:17','2 Kor 5,17','German abbreviation + comma'],
  ['Romans 3:23','Römer 3,23','German umlaut + comma'],
  ['1 John 5:13','1. Joh 5,13','German numbered abbreviation'],
  ['Isaiah 53:6','Jesaja 53,6','German OT name'],
  ['Psalm 119:9-11','Psalm 119,9-11','German range'],
  ['Lamentations 3:22-23','Klagelieder 3,22-23','German long OT name'],
  ['Leviticus 19:11','3. Mose 19,11','German Pentateuch naming'],

  // Common Korean full names and standard abbreviations.
  ['2 Corinthians 5:17','고후5:17','Korean numbered abbreviation without space'],
  ['Romans 3:23','롬 3:23','Korean abbreviation'],
  ['1 John 5:13','요일5:13','Korean numbered abbreviation'],
  ['Isaiah 53:6','사53:6','Korean OT abbreviation without space'],
  ['Psalm 119:9-11','시 119:9-11','Korean Psalm abbreviation'],
  ['Lamentations 3:22-23','애3:22-23','Korean Lamentations abbreviation'],
  ['Leviticus 19:11','레 19:11','Korean Leviticus abbreviation'],

  // Existing English behavior must remain intact.
  ['2 Corinthians 5:17','2 Cor 5:17','Existing English abbreviation'],
  ['John 14:21','John 14:21','Existing English full name']
];

const results=await frame.evaluate(cases=>cases.map(([target,input,label])=>({
  target,input,label,
  targetNormalized:normalizeReference(target),
  inputNormalized:normalizeReference(input),
  correct:referenceCorrect(target,input)
})),cases);

for(const result of results){
  pass(result.correct,result.label,`${result.input} -> ${result.inputNormalized}`);
  pass(result.targetNormalized===result.inputNormalized,`${result.label} canonical normalization`,`${result.targetNormalized} / ${result.inputNormalized}`);
}

const negatives=await frame.evaluate(()=>[
  ['2 Corinthians 5:17','2. Korinther 5:18'],
  ['John 14:21','요한복음 14:22'],
  ['Romans 3:23','롬 3:24']
].map(([target,input])=>({target,input,correct:referenceCorrect(target,input)})));
for(const result of negatives)pass(!result.correct,'Wrong localized verse remains incorrect',`${result.input} vs ${result.target}`);

// Exercise the real reference-recall UI, not only helper functions.
await frame.evaluate(()=>{
  if(typeof startSingleVersePractice!=='function')throw new Error('startSingleVersePractice unavailable');
  if(!startSingleVersePractice(1,'reference'))throw new Error('Could not start reference recall');
});
await frame.waitForSelector('#reference-answer',{timeout:10000});
await frame.locator('#reference-answer').fill('2. Korinther 5:17');
await frame.locator('[data-action="check-reference"]').click();
await frame.waitForFunction(()=>Boolean(session?.exercise?.checked),null,{timeout:10000});
let uiResult=await frame.evaluate(()=>({score:session.exercise.result?.score,answer:session.exercise.answer,feedback:document.querySelector('.feedback')?.textContent||''}));
pass(uiResult.score===100,'German localized reference scores 100% in real recall UI',JSON.stringify(uiResult));
pass(/Correct/i.test(uiResult.feedback),'German localized recall shows correct feedback',uiResult.feedback);

// End the first manual session, then test Korean through the same real UI path.
const endButton=frame.locator('[data-action="end-session"]').last();
await endButton.click();
await frame.waitForSelector('[data-action="end-session-now"]',{timeout:10000});
await frame.locator('[data-action="end-session-now"]').click();
await frame.waitForFunction(()=>typeof hasActiveSession==='function'&&!hasActiveSession(),null,{timeout:10000});
await frame.evaluate(()=>{
  if(!startSingleVersePractice(4,'reference'))throw new Error('Could not start Korean reference recall test');
});
await frame.waitForSelector('#reference-answer',{timeout:10000});
await frame.locator('#reference-answer').fill('요한복음 14:21');
await frame.locator('[data-action="check-reference"]').click();
await frame.waitForFunction(()=>Boolean(session?.exercise?.checked),null,{timeout:10000});
uiResult=await frame.evaluate(()=>({score:session.exercise.result?.score,answer:session.exercise.answer,feedback:document.querySelector('.feedback')?.textContent||''}));
pass(uiResult.score===100,'Korean localized reference scores 100% in real recall UI',JSON.stringify(uiResult));
pass(/Correct/i.test(uiResult.feedback),'Korean localized recall shows correct feedback',uiResult.feedback);

console.log(JSON.stringify({failures},null,2));
if(failures.length)process.exitCode=1;
await browser.close();
