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
  if(!localStorage.getItem('tms60-active-translation-v1'))localStorage.setItem('tms60-active-translation-v1','esv');
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

await frame.waitForFunction(()=>window.__TMS60_P15_TRANSLATION_TTS__==='1.0.0',null,{timeout:15000});
await frame.waitForFunction(()=>window.__TMS60_P28_LOCALIZED_TTS_REFERENCE__==='1.0.0',null,{timeout:15000});

await frame.evaluate(()=>{
  window.__p28Spoken=[];
  class FakeUtterance {
    constructor(text){this.text=text;this.lang='';this.voice=null;this.rate=1;}
  }
  Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:FakeUtterance});
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
    cancel(){},
    speak(utterance){window.__p28Spoken.push({text:utterance.text,lang:utterance.lang,voice:utterance.voice?{name:utterance.voice.name,lang:utterance.voice.lang}:null,rate:utterance.rate});},
    getVoices(){return voices;},
    pause(){},resume(){},paused:false
  }});
  voices=[
    {name:'English Voice',lang:'en-US'},
    {name:'Deutsch Stimme',lang:'de-DE'},
    {name:'Korean Voice',lang:'ko-KR'}
  ];
});

const single=await frame.evaluate(()=>{
  const originalCurrentVerse=currentVerse;
  const sample={reference:'2 Corinthians 5:17',text:'Sample verse text'};
  currentVerse=()=>sample;
  const run=(version,uiLanguage)=>{
    localStorage.setItem('tms60-active-translation-v1',version);
    localStorage.setItem('tms60-ui-language-v1',uiLanguage);
    state.settings.audioVoice='';
    window.__p28Spoken.length=0;
    speakCurrent();
    return window.__p28Spoken.at(-1)||null;
  };
  const result={
    esv:run('esv','ko'),
    niv:run('niv','de'),
    nlt:run('nlt','ko'),
    hfa:run('hfa','en'),
    schlachter1951:run('schlachter1951','ko'),
    klb1985:run('klb1985','en'),
    krv1961:run('krv1961','de')
  };
  currentVerse=originalCurrentVerse;
  return result;
});

for(const id of ['esv','niv','nlt']){
  pass(single[id]?.text==='2 Corinthians 5:17. Sample verse text',`${id}: English reference remains canonical`,JSON.stringify(single[id]));
  pass(single[id]?.lang==='en-US',`${id}: English speech language preserved`,JSON.stringify(single[id]));
}
for(const id of ['hfa','schlachter1951']){
  pass(single[id]?.text==='2. Korinther, Kapitel 5, Vers 17. Sample verse text',`${id}: German reference is localized`,JSON.stringify(single[id]));
  pass(single[id]?.lang==='de-DE',`${id}: German speech language preserved`,JSON.stringify(single[id]));
  pass(!single[id]?.text?.startsWith('2 Corinthians'),`${id}: canonical English book name is not spoken`,single[id]?.text||'');
}
for(const id of ['klb1985','krv1961']){
  pass(single[id]?.text==='고린도후서 5장 17절. Sample verse text',`${id}: Korean reference is localized`,JSON.stringify(single[id]));
  pass(single[id]?.lang==='ko-KR',`${id}: Korean speech language preserved`,JSON.stringify(single[id]));
  pass(!single[id]?.text?.startsWith('2 Corinthians'),`${id}: canonical English book name is not spoken`,single[id]?.text||'');
}

// Exercise every canonical reference used by the frozen 60-verse bank. This
// catches a missing localized book mapping without altering the verse bank.
const corpus=await frame.evaluate(()=>{
  const originalCurrentVerse=currentVerse;
  const refs=[...new Set(VERSES.map(v=>v.reference))];
  const run=(version,reference)=>{
    localStorage.setItem('tms60-active-translation-v1',version);
    currentVerse=()=>({reference,text:'X'});
    window.__p28Spoken.length=0;
    speakCurrent();
    return window.__p28Spoken.at(-1)?.text||'';
  };
  const german=refs.map(reference=>({reference,text:run('hfa',reference)}));
  const korean=refs.map(reference=>({reference,text:run('klb1985',reference)}));
  currentVerse=originalCurrentVerse;
  return {refs,german,korean};
});

pass(corpus.refs.length===60,'P2-8 audit covers all 60 canonical references',`count=${corpus.refs.length}`);
const germanFailures=corpus.german.filter(row=>!/, Kapitel \d+, Vers(?:e)? \d+/.test(row.text)||/^\d?\s*[A-Za-z]/.test(row.text));
const koreanFailures=corpus.korean.filter(row=>!/[가-힣].*\d+장 \d+절/.test(row.text)||row.text.includes(':'));
pass(germanFailures.length===0,'Every TMS reference has German spoken-reference localization',JSON.stringify(germanFailures));
pass(koreanFailures.length===0,'Every TMS reference has Korean spoken-reference localization',JSON.stringify(koreanFailures));

const ranged=corpus.refs.find(reference=>/-\d+$/.test(reference));
pass(Boolean(ranged),'60-verse corpus contains a ranged reference for grammar coverage',String(ranged||''));
if(ranged){
  const rangeResult=await frame.evaluate(reference=>{
    const originalCurrentVerse=currentVerse;
    const run=version=>{
      localStorage.setItem('tms60-active-translation-v1',version);
      currentVerse=()=>({reference,text:'Range sample'});
      window.__p28Spoken.length=0;
      speakCurrent();
      return window.__p28Spoken.at(-1)?.text||'';
    };
    const result={de:run('schlachter1951'),ko:run('krv1961')};
    currentVerse=originalCurrentVerse;
    return result;
  },ranged);
  pass(/Verse \d+ bis \d+/.test(rangeResult.de),'German ranged reference uses localized range grammar',rangeResult.de);
  pass(/\d+절에서 \d+절/.test(rangeResult.ko),'Korean ranged reference uses localized range grammar',rangeResult.ko);
}

pass(await frame.evaluate(()=>window.__TMS60_P15_TRANSLATION_TTS__==='1.0.0'),'P1-5 translation-language TTS layer remains installed');
pass(await frame.evaluate(()=>window.__TMS60_P28_LOCALIZED_TTS_REFERENCE__==='1.0.0'),'P2-8 localized-reference TTS layer is installed');

console.log(JSON.stringify({failures},null,2));
if(failures.length)process.exitCode=1;
await browser.close();
