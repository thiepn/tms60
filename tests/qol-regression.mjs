import { chromium } from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const out={passes:[],failures:[]};
function test(condition,name,detail=''){
  (condition?out.passes:out.failures).push({name,detail});
  console.log(`${condition?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);
}
function seed(){
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem('tms60-ui-language-v1','en');
  localStorage.setItem('tms60-active-translation-v1','esv');
  localStorage.removeItem('tms60-qol-empty-advance-guard-v1');
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
async function waitForQoL(page,timeout=150000){
  const end=Date.now()+timeout;
  while(Date.now()<end){
    try{
      const frame=await frameOf(page,30000);
      const versions=await frame.evaluate(()=>({
        word:window.__TMS60_WORD_NAV_QOL__||'',
        fast:window.__TMS60_FAST_RECALL_QOL__||'',
        cloze:window.__TMS60_CLOZE_HELPERS_QOL__||''
      }));
      if(versions.word==='1.4.0'&&versions.fast==='1.5.0'&&versions.cloze==='1.5.0')return frame;
    }catch{}
    await page.waitForTimeout(4000);
    await page.reload({waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
  }
  throw new Error('Latest QoL bundle did not reach GitHub Pages in time');
}
async function open(browser,{mobile=false}={}){
  const context=await browser.newContext(mobile?{
    viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    userAgent:'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'
  }:{viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(seed);
  await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});
  const frame=await waitForQoL(page);
  return{context,page,frame,errors};
}
async function openCloze(frame){
  const nav=await frame.locator('#desktop-nav [data-view="study"]').count()?frame.locator('#desktop-nav [data-view="study"]'):frame.locator('.mobile-nav [data-view="study"]');
  await nav.click();
  await frame.waitForSelector('#study-mode-select',{timeout:10000});
  await frame.locator('#study-mode-select').selectOption('cloze');
  await frame.locator('[data-action="study-selected-verse"]').click();
  await frame.waitForSelector('.cloze-input:not(:disabled)',{timeout:10000});
  await frame.waitForTimeout(180);
}
async function fillExpected(frame,wrongIndex=-1){
  const inputs=frame.locator('.cloze-input:not(:disabled)');
  const count=await inputs.count();
  for(let i=0;i<count;i++){
    const input=inputs.nth(i);
    const expected=await input.getAttribute('data-expected');
    await input.fill(i===wrongIndex?'definitelywrong':expected||'');
  }
  return count;
}

const browser=await chromium.launch({headless:true});
try{
  {
    const {context,frame,errors}=await open(browser);
    await openCloze(frame);
    let inputs=frame.locator('.cloze-input:not(:disabled)');
    const count=await inputs.count();
    test(count>=2,'Cloze test exposes multiple blanks',String(count));
    test(await frame.locator('#qol-session-strip').isVisible(),'Persistent session progress strip visible');
    test(await frame.locator('#qol-cloze-counter').isVisible(),'Active blank counter visible');

    const first=inputs.nth(0),second=inputs.nth(1);
    await first.focus();
    await first.press('Tab');
    test(await first.evaluate(el=>document.activeElement===el),'Empty-advance guard blocks blank Tab');

    await first.fill('alpha');
    await first.press('Tab');
    test(await second.evaluate(el=>document.activeElement===el),'Desktop Tab advances to next cloze blank');

    await second.fill('');
    await second.press('Backspace');
    test(await first.evaluate(el=>document.activeElement===el),'Backspace on empty blank moves backward');

    await first.evaluate(el=>{
      const event=new Event('paste',{bubbles:true,cancelable:true});
      Object.defineProperty(event,'clipboardData',{value:{getData:()=> 'alpha beta gamma'}});
      el.dispatchEvent(event);
    });
    const pasted=[];
    for(let i=0;i<Math.min(3,count);i++)pasted.push(await inputs.nth(i).inputValue());
    test(pasted[0]==='alpha'&&pasted[1]==='beta'&&(count<3||pasted[2]==='gamma'),'Multi-word paste distributes across blanks',pasted.join(' / '));

    inputs=frame.locator('.cloze-input:not(:disabled)');
    await inputs.nth(1).focus();
    await inputs.nth(1).press('Control+ArrowLeft');
    test(await inputs.nth(0).evaluate(el=>document.activeElement===el),'Ctrl+Left moves to previous cloze blank');
    await inputs.nth(0).press('Control+ArrowRight');
    test(await inputs.nth(1).evaluate(el=>document.activeElement===el),'Ctrl+Right moves to next cloze blank');

    await frame.evaluate(()=>localStorage.setItem('tms60-qol-empty-advance-guard-v1','0'));
    await inputs.nth(0).fill('');
    await inputs.nth(0).focus();
    await inputs.nth(0).press('Tab');
    test(await inputs.nth(1).evaluate(el=>document.activeElement===el),'Empty-advance guard can be disabled');
    await frame.evaluate(()=>localStorage.setItem('tms60-qol-empty-advance-guard-v1','1'));

    await fillExpected(frame);
    inputs=frame.locator('.cloze-input:not(:disabled)');
    await inputs.nth((await inputs.count())-1).focus();
    await inputs.nth((await inputs.count())-1).press('Enter');
    await frame.waitForSelector('.rating-row.qol-rating-ready',{timeout:5000});
    test(await frame.locator('.rating-row.qol-rating-ready').count()===1,'Enter on final cloze blank checks words');
    test(await frame.locator('.rating-row.qol-rating-ready').evaluate(el=>document.activeElement===el),'Post-check focus lands safely on rating group');

    await frame.locator('body').press('3');
    await frame.waitForSelector('.session-complete',{timeout:5000});
    test(await frame.locator('.session-complete').isVisible(),'1–4 rating shortcut completes recall');

    const repeatButton=frame.locator('.session-complete button').filter({hasText:/repeat|same verse/i}).first();
    const repeatAvailable=await repeatButton.count();
    if(repeatAvailable){
      await frame.locator('body').press('r');
      await frame.waitForSelector('.cloze-input:not(:disabled)',{timeout:5000});
      test(true,'R repeats the same verse from completion');
    }else test(false,'R repeats the same verse from completion','No repeat/same-verse button rendered');

    inputs=frame.locator('.cloze-input:not(:disabled)');
    const expected0=await inputs.nth(0).getAttribute('data-expected');
    await inputs.nth(0).fill(expected0||'x');
    if(await inputs.count()>1) await inputs.nth(1).fill('');
    for(let i=2;i<await inputs.count();i++){
      const expected=await inputs.nth(i).getAttribute('data-expected');
      await inputs.nth(i).fill(expected||'');
    }
    await frame.evaluate(()=>{
      session.exercise.clozeAnswers=[...document.querySelectorAll('.cloze-input')].map(x=>x.value);
      renderStudy();
    });
    await frame.waitForTimeout(300);
    const enabled=frame.locator('.cloze-input:not(:disabled)');
    if(await enabled.count()>1){
      test(await enabled.nth(1).evaluate(el=>document.activeElement===el),'Resume focuses first unfinished cloze blank');
    }

    await fillExpected(frame,0);
    inputs=frame.locator('.cloze-input:not(:disabled)');
    const last=inputs.nth((await inputs.count())-1);
    await last.focus();
    await last.press('Enter');
    await frame.waitForSelector('[data-qol-fix-cloze]',{timeout:5000});
    test(await frame.locator('[data-qol-fix-cloze]').isVisible(),'Fix errors button appears after cloze mistakes');
    await frame.locator('[data-qol-fix-cloze]').click();
    await frame.waitForTimeout(220);
    const fixInputs=frame.locator('.cloze-input:not(:disabled)');
    test(await fixInputs.count()===1,'Fix errors reopens only incorrect blanks',String(await fixInputs.count()));
    test(await fixInputs.first().getAttribute('data-ci')==='0','Fix errors starts at first incorrect blank');

    test(errors.length===0,'Desktop QoL run has no page errors',errors.join(' | '));
    await context.close();
  }

  {
    const {context,frame,errors}=await open(browser,{mobile:true});
    await openCloze(frame);
    const inputs=frame.locator('.cloze-input:not(:disabled)');
    const count=await inputs.count();
    test(await inputs.first().getAttribute('enterkeyhint')==='next','Mobile intermediate blank exposes Next keyboard hint');
    test(await inputs.nth(count-1).getAttribute('enterkeyhint')==='done','Mobile final blank exposes Done keyboard hint');
    await inputs.first().fill('alpha');
    await inputs.first().focus();
    await inputs.first().press('Space');
    if(count>1)test(await inputs.nth(1).evaluate(el=>document.activeElement===el),'Mobile Space advances to next blank');
    const box=await frame.locator('.content').boundingBox();
    const activeBox=await inputs.nth(Math.min(1,count-1)).boundingBox();
    if(box&&activeBox)test(activeBox.y>=box.y-2&&activeBox.y+activeBox.height<=box.y+box.height+2,'Active mobile blank remains inside study viewport');
    test(errors.length===0,'Mobile QoL run has no page errors',errors.join(' | '));
    await context.close();
  }
}catch(error){
  test(false,'QoL regression fatal',String(error?.stack||error));
}finally{
  await browser.close();
}
console.log(JSON.stringify(out,null,2));
process.exitCode=out.failures.length?1:0;
