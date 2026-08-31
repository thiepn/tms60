import { chromium } from 'playwright';

const APP=process.env.TMS60_APP||'https://thiepn.github.io/tms60/';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900}});
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
  const referenceTypo=window.__TMS60_TYPO_ASSESS_REFERENCE__?.('Galatians 2:20','galations 2:20');
  const referenceTranspose=window.__TMS60_TYPO_ASSESS_REFERENCE__?.('Galatians 2:20','galatains 2:20');
  const wrongLocator=window.__TMS60_TYPO_ASSESS_REFERENCE__?.('Galatians 2:20','Galatians 2:21');
  const exactAlias=window.__TMS60_TYPO_ASSESS_REFERENCE__?.('Galatians 2:20','Gal 2:20');
  const verseTypo=compareText('God is love','God is live');
  const missingWord=compareText('I can do all things through him who strengthens me.','I can do all things him who strengthens me.');
  const punctuation=compareText('God is love.','God is love');
  const ratings=document.createElement('div');
  ratings.innerHTML=ratingHtml(maxRatingForScore(referenceTypo?.score??0));
  const good=ratings.querySelector('[data-rate="2"]');
  const easy=ratings.querySelector('[data-rate="3"]');
  return{
    marker:window.__TMS60_TYPO_TOLERANCE__,
    referenceTypo,referenceTranspose,wrongLocator,exactAlias,
    verseTypo:{score:verseTypo.score,wordScore:verseTypo.wordScore,charScore:verseTypo.charScore,minorTypoCount:verseTypo.minorTypoCount,majorErrorCount:verseTypo.majorErrorCount},
    missingWord:{score:missingWord.score,majorErrorCount:missingWord.majorErrorCount},
    punctuation:{score:punctuation.score,punctuationEquivalent:punctuation.punctuationEquivalent},
    goodEnabled:Boolean(good&&!good.disabled),
    easyDisabled:Boolean(easy&&easy.disabled),
    maxRating:maxRatingForScore(referenceTypo?.score??0)
  };
});

pass(result.marker==='1.0.0','Typo-tolerance patch loads',String(result.marker));
pass(result.referenceTypo?.score===95&&result.referenceTypo?.typoAccepted===true,'One-letter book typo is accepted at Good level',JSON.stringify(result.referenceTypo));
pass(result.referenceTranspose?.score===95&&result.referenceTranspose?.typoAccepted===true,'Adjacent transposition is treated as one typo',JSON.stringify(result.referenceTranspose));
pass(result.wrongLocator?.score===0,'Wrong chapter/verse is still rejected',JSON.stringify(result.wrongLocator));
pass(result.exactAlias?.score===100&&result.exactAlias?.exact===true,'Existing book aliases stay exact',JSON.stringify(result.exactAlias));
pass(result.maxRating===2&&result.goodEnabled&&result.easyDisabled,'95 enables Good but keeps Easy disabled',JSON.stringify({maxRating:result.maxRating,goodEnabled:result.goodEnabled,easyDisabled:result.easyDisabled}));
pass(result.verseTypo.score>=90&&result.verseTypo.score<100&&result.verseTypo.minorTypoCount===1,'Single-letter verse typo receives character-level partial credit',JSON.stringify(result.verseTypo));
pass(result.missingWord.majorErrorCount>0&&result.missingWord.score<90,'Whole-word omission remains a meaningful error',JSON.stringify(result.missingWord));
pass(result.punctuation.score===100&&result.punctuation.punctuationEquivalent===true,'Punctuation-only differences remain fully accepted',JSON.stringify(result.punctuation));
pass(pageErrors.length===0,'Typo-tolerance regression has no page errors',pageErrors.join(' | '));

console.log('\n=== TYPO TOLERANCE SUMMARY ===');
console.log(JSON.stringify({failures,result},null,2));
if(failures.length)process.exitCode=1;
await browser.close();
