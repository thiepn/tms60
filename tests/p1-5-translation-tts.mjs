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
await frame.waitForFunction(()=>window.__TMS60_P15_TRANSLATION_TTS__==='1.0.0',null,{timeout:15000});

await frame.evaluate(()=>{
  window.__p15Spoken=[];
  class FakeUtterance {
    constructor(text){this.text=text;this.lang='';this.voice=null;this.rate=1;}
  }
  Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:FakeUtterance});
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
    cancel(){},
    speak(utterance){window.__p15Spoken.push({text:utterance.text,lang:utterance.lang,voice:utterance.voice?{name:utterance.voice.name,lang:utterance.voice.lang}:null,rate:utterance.rate});},
    getVoices(){return voices;},
    pause(){},resume(){},paused:false
  }});
  voices=[
    {name:'English Voice',lang:'en-US'},
    {name:'Deutsch Stimme',lang:'de-DE'},
    {name:'Deutsch AT',lang:'de-AT'},
    {name:'Korean Voice',lang:'ko-KR'}
  ];
  if(typeof startSingleVersePractice!=='function')throw new Error('startSingleVersePractice unavailable');
  if(!startSingleVersePractice(1,'listen'))throw new Error('Could not start listen practice');
});
await frame.waitForSelector('#voice-select',{timeout:10000});

const versions=[
  ['esv','en-US','en'],
  ['niv','en-US','en'],
  ['nlt','en-US','en'],
  ['hfa','de-DE','de'],
  ['schlachter1951','de-DE','de'],
  ['klb1985','ko-KR','ko'],
  ['krv1961','ko-KR','ko']
];

for(const [version,expectedLang,prefix] of versions){
  const result=await frame.evaluate(({version,expectedLang,prefix})=>{
    localStorage.setItem('tms60-active-translation-v1',version);
    state.settings.audioVoice='English Voice';
    renderStudy();
    const select=document.getElementById('voice-select');
    const options=[...select.options].map(option=>({value:option.value,text:option.textContent}));
    const wrongOption=options.some(option=>option.value&&!(option.text||'').toLowerCase().includes(`(${prefix}-`));

    // Remove the selector to exercise the non-listen fallback path. A stale
    // English saved voice must not override German/Korean translation language.
    select.remove();
    window.__p15Spoken.length=0;
    speakCurrent();
    const spoken=window.__p15Spoken.at(-1)||null;
    return {version,expectedLang,prefix,options,wrongOption,spoken,savedVoice:state.settings.audioVoice};
  },{version,expectedLang,prefix});

  pass(result.options.length>0,`${version}: voice picker has an option`,JSON.stringify(result.options));
  pass(!result.wrongOption,`${version}: voice picker excludes other-language voices`,JSON.stringify(result.options));
  pass(result.spoken?.lang===expectedLang,`${version}: utterance language is ${expectedLang}`,JSON.stringify(result.spoken));
  pass(result.spoken?.voice?.lang?.toLowerCase().startsWith(prefix)===true,`${version}: selected voice matches ${prefix}`,JSON.stringify(result.spoken?.voice));
  pass(!['hfa','klb1985'].includes(version)||result.spoken.voice?.name!=='English Voice',`${version}: stale English voice cannot override translation language`,JSON.stringify(result.spoken?.voice));
}

// With no matching installed voice, the browser's target-language default must
// be requested rather than falling back to a known English voice.
const noGerman=await frame.evaluate(()=>{
  localStorage.setItem('tms60-active-translation-v1','hfa');
  voices=[{name:'English Voice',lang:'en-US'}];
  state.settings.audioVoice='English Voice';
  renderStudy();
  const html=voiceOptions();
  document.getElementById('voice-select')?.remove();
  window.__p15Spoken.length=0;
  speakCurrent();
  return {html,spoken:window.__p15Spoken.at(-1)||null,savedVoice:state.settings.audioVoice};
});
pass(/Default browser voice \(de-DE\)/.test(noGerman.html),'HFA without installed German voice requests browser German default',noGerman.html);
pass(noGerman.spoken?.lang==='de-DE','HFA no-match fallback still uses de-DE',JSON.stringify(noGerman.spoken));
pass(noGerman.spoken?.voice===null,'HFA no-match fallback does not force an English voice',JSON.stringify(noGerman.spoken));
pass(noGerman.savedVoice==='','HFA no-match fallback clears stale incompatible saved voice',JSON.stringify(noGerman.savedVoice));

const noKorean=await frame.evaluate(()=>{
  localStorage.setItem('tms60-active-translation-v1','klb1985');
  voices=[{name:'English Voice',lang:'en-US'}];
  state.settings.audioVoice='English Voice';
  renderStudy();
  const html=voiceOptions();
  document.getElementById('voice-select')?.remove();
  window.__p15Spoken.length=0;
  speakCurrent();
  return {html,spoken:window.__p15Spoken.at(-1)||null,savedVoice:state.settings.audioVoice};
});
pass(/Default browser voice \(ko-KR\)/.test(noKorean.html),'KLB without installed Korean voice requests browser Korean default',noKorean.html);
pass(noKorean.spoken?.lang==='ko-KR','KLB no-match fallback still uses ko-KR',JSON.stringify(noKorean.spoken));
pass(noKorean.spoken?.voice===null,'KLB no-match fallback does not force an English voice',JSON.stringify(noKorean.spoken));
pass(noKorean.savedVoice==='','KLB no-match fallback clears stale incompatible saved voice',JSON.stringify(noKorean.savedVoice));

console.log(JSON.stringify({failures},null,2));
if(failures.length)process.exitCode=1;
await browser.close();
