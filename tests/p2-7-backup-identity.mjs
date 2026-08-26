import { chromium } from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'allow'});
const page=await context.newPage();
const failures=[];
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error)));
const pass=(ok,name,detail='')=>{console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!ok)failures.push({name,detail})};

const cacheDefs={
  niv:{api:'proxy'},
  nlt:{api:'proxy'},
  hfa:{api:'proxy'},
  schlachter1951:{api:'schlachter'},
  klb1985:{api:'proxy'},
  krv1961:{api:'korean'}
};
const versions=[
  {id:'esv',short:'ESV',name:'English Standard Version'},
  {id:'niv',short:'NIV',name:'New International Version'},
  {id:'nlt',short:'NLT',name:'New Living Translation'},
  {id:'hfa',short:'HFA',name:'Hoffnung für Alle'},
  {id:'schlachter1951',short:'SCH1951',name:'Schlachter 1951'},
  {id:'klb1985',short:'KLB 1985',name:'Korean Living Bible 1985'},
  {id:'krv1961',short:'개역한글',name:'개역한글 (1961)'}
];

await page.addInitScript(({defs})=>{
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem('tms60-ui-language-v1','en');
  // Boot directly into a non-ESV translation so P2-7 also covers cold-start
  // identity before any user-driven runtime switch occurs.
  localStorage.setItem('tms60-active-translation-v1','hfa');
  for(const [id,def] of Object.entries(defs)){
    localStorage.setItem(`tms60-translation-texts-v2-${id}`,JSON.stringify({
      schema:2,
      api:def.api,
      fetchedAt:new Date().toISOString(),
      copyright:def.api==='proxy'?`P2-7 ${id.toUpperCase()} test copyright`:'',
      verses:Array.from({length:60},(_,i)=>({id:i+1,text:`P2-7 ${id.toUpperCase()} ${i+1}`}))
    }));
  }
},{defs:cacheDefs});

await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});
await page.waitForSelector('#app-frame.ready',{timeout:45000});
await page.waitForFunction(()=>window.__TMS60_P27_BACKUP_IDENTITY_PREP__==='1.0.0'&&window.__TMS60_P27_SHELL_IDENTITY__==='1.0.0',null,{timeout:15000});
let frame=page.frames().find(f=>f!==page.mainFrame());
if(!frame)throw new Error('TMS iframe not found');
await frame.waitForFunction(()=>window.__TMS60_P27_BACKUP_IDENTITY__==='1.0.0'&&window.__TMS60_BACKUP_TRANSLATION__?.bibleVersion?.id==='hfa',null,{timeout:15000});

// Capture generated files without touching the browser download directory.
await frame.evaluate(()=>{
  window.__P27_DOWNLOAD__=null;
  download=(name,text,type='application/json')=>{
    window.__P27_DOWNLOAD__={name:String(name),text:String(text),type:String(type)};
  };
});

async function exportBackup(){
  return frame.evaluate(()=>{
    window.__P27_DOWNLOAD__=null;
    exportJSON();
    const capture=window.__P27_DOWNLOAD__;
    if(!capture)throw new Error('exportJSON did not produce a captured file');
    let payload=null;
    try{payload=JSON.parse(capture.text)}catch(_){}
    return {...capture,payload};
  });
}

async function runtimeIdentity(){
  return frame.evaluate(()=>({
    runtime:window.TMSRuntimeTranslation?.inspect?.(),
    backup:window.__TMS60_BACKUP_TRANSLATION__||null,
    active:window.__TMS60_ACTIVE_TRANSLATION__||null
  }));
}

pass(await page.evaluate(()=>window.__TMS60_P27_BACKUP_IDENTITY_PREP__)==='1.0.0','P2-7 source preparation loaded');
pass(await frame.evaluate(()=>window.__TMS60_P27_BACKUP_IDENTITY__)==='1.0.0','P2-7 runtime backup identity bridge loaded');

const generatedSource=await page.evaluate(()=>document.getElementById('app-frame')?.srcdoc||'');
pass(!generatedSource.includes("application:'TMS 60 ESV Memory Lab'"),'Generated app source no longer carries the legacy hard-coded ESV backup identity');
pass(generatedSource.includes("application:'TMS 60 Memory Lab'"),'Generated app source uses a translation-neutral native fallback identity');

let identity=await runtimeIdentity();
pass(identity.runtime?.id==='hfa'&&identity.runtime?.name==='Hoffnung für Alle','Cold boot runtime identity is HFA',JSON.stringify(identity.runtime));
pass(identity.backup?.application==='TMS 60 HFA Memory Lab','Cold boot backup application label is HFA',JSON.stringify(identity.backup));
pass(identity.backup?.bibleVersion?.id==='hfa'&&identity.backup?.bibleVersion?.name==='Hoffnung für Alle','Cold boot structured Bible identity is HFA',JSON.stringify(identity.backup?.bibleVersion));

let exported=await exportBackup();
pass(exported.payload?.application==='TMS 60 HFA Memory Lab','Cold-boot HFA export has correct application identity',exported.payload?.application||'');
pass(exported.payload?.bibleVersion?.id==='hfa'&&exported.payload?.bibleVersion?.short==='HFA'&&exported.payload?.bibleVersion?.name==='Hoffnung für Alle','Cold-boot HFA export has structured Bible-version metadata',JSON.stringify(exported.payload?.bibleVersion));
pass(exported.payload?.verseDataset?.[0]?.text==='P2-7 HFA 1','Cold-boot HFA export contains the active HFA dataset',exported.payload?.verseDataset?.[0]?.text||'');

for(const expected of versions){
  const ok=await page.evaluate(id=>activateVersion(id),expected.id);
  pass(ok===true,`${expected.id}: version activation succeeds`);
  await frame.waitForFunction(id=>window.__TMS60_BACKUP_TRANSLATION__?.bibleVersion?.id===id,expected.id,{timeout:10000});
  identity=await runtimeIdentity();
  exported=await exportBackup();

  const expectedApplication=`TMS 60 ${expected.short} Memory Lab`;
  pass(identity.backup?.application===expectedApplication,`${expected.id}: live backup identity follows active translation`,JSON.stringify(identity.backup));
  pass(identity.active?.id===expected.id&&identity.active?.short===expected.short&&identity.active?.name===expected.name,`${expected.id}: active translation metadata is complete`,JSON.stringify(identity.active));
  pass(exported.payload?.application===expectedApplication,`${expected.id}: exported application label is current`,exported.payload?.application||'');
  pass(
    exported.payload?.bibleVersion?.id===expected.id&&
    exported.payload?.bibleVersion?.short===expected.short&&
    exported.payload?.bibleVersion?.name===expected.name,
    `${expected.id}: exported structured Bible identity is current`,
    JSON.stringify(exported.payload?.bibleVersion)
  );
  pass(Array.isArray(exported.payload?.verseDataset)&&exported.payload.verseDataset.length===60,`${expected.id}: backup contains all 60 active verses`,String(exported.payload?.verseDataset?.length||0));
  if(expected.id!=='esv'){
    pass(exported.payload?.verseDataset?.[0]?.text===`P2-7 ${expected.id.toUpperCase()} 1`,`${expected.id}: backup wording matches active translation`,exported.payload?.verseDataset?.[0]?.text||'');
    pass(exported.payload?.application!=='TMS 60 ESV Memory Lab',`${expected.id}: non-ESV export cannot claim ESV identity`,exported.payload?.application||'');
  }
}

// The protected-save escape hatch must preserve raw bytes exactly. P2-7 labels
// the file with the active translation instead of mutating protected content.
await page.evaluate(()=>activateVersion('niv'));
await frame.waitForFunction(()=>window.__TMS60_BACKUP_TRANSLATION__?.bibleVersion?.id==='niv',null,{timeout:10000});
const protectedResult=await frame.evaluate(()=>{
  save();
  const raw=localStorage.getItem(KEY);
  window.__P27_DOWNLOAD__=null;
  storageWriteBlocked=true;
  storageBlockMessage='Read-only: P2-7 test';
  try{exportJSON()}finally{storageWriteBlocked=false;storageBlockMessage=''}
  return {raw,capture:window.__P27_DOWNLOAD__};
});
pass(protectedResult.capture?.name.includes('tms60-niv-preserved-save-'),'Protected raw export filename identifies active NIV translation',protectedResult.capture?.name||'');
pass(protectedResult.capture?.text===protectedResult.raw,'Protected raw export remains byte-for-byte unchanged');

pass(pageErrors.length===0,'P2-7 regression has no page errors',pageErrors.join(' | '));
console.log('\n=== P2-7 BACKUP IDENTITY SUMMARY ===');
console.log(JSON.stringify({failures,finalIdentity:await runtimeIdentity()},null,2));
if(failures.length)process.exitCode=1;
await browser.close();
