import { chromium } from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'allow'});
const page=await context.newPage();
const failures=[];
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error)));
const pass=(ok,name,detail='')=>{console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!ok)failures.push({name,detail})};

await page.addInitScript(()=>{
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem('tms60-ui-language-v1','en');
  localStorage.setItem('tms60-active-translation-v1','esv');
  localStorage.setItem('tms60-translation-texts-v2-hfa',JSON.stringify({
    schema:2,
    api:'proxy',
    fetchedAt:new Date().toISOString(),
    copyright:'P2-9 HFA source-contract copyright',
    verses:Array.from({length:60},(_,i)=>({id:i+1,text:`P2-9 HFA ${i+1}`}))
  }));
});

await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});
await page.waitForSelector('#app-frame.ready',{timeout:45000});
await page.waitForFunction(()=>window.__TMS60_P29_SOURCE_CONTRACT__==='1.0.0'&&Boolean(window.TMSSourceContract),null,{timeout:15000});

pass(await page.evaluate(()=>window.__TMS60_P29_SOURCE_CONTRACT__)==='1.0.0','P2-9 semantic source contract is loaded');
pass(await page.evaluate(()=>window.__TMS60_P25_SOURCE_PREP__)==='1.0.0','P2-5 compatibility marker remains stable');
pass(await page.evaluate(()=>window.__TMS60_P27_BACKUP_IDENTITY_PREP__)==='1.0.0','P2-7 compatibility marker remains stable');

const result=await page.evaluate(async()=>{
  const source=await fetch('app.html',{cache:'no-store'}).then(r=>r.text());
  const changes=[];
  function alter(input,search,replacement,label){
    if(!input.includes(search))throw new Error(`Test fixture marker missing: ${label}`);
    changes.push(label);
    return input.replace(search,replacement);
  }

  let perturbed=source;
  perturbed=alter(perturbed,'const VERSES=','const\nVERSES   =   ','VERSES declaration whitespace');
  perturbed=alter(perturbed,'const PACKS=','const   PACKS = ','PACKS adjacency whitespace');
  perturbed=alter(perturbed,"const KEY='tms60-esv-memory-lab-v1'",'const   KEY   =   "tms60-esv-memory-lab-v1"','KEY quote/whitespace style');
  perturbed=alter(perturbed,'Object.freeze(VERSES);','Object . freeze ( VERSES ) ;','VERSES freeze formatting');
  perturbed=alter(perturbed,"application:'TMS 60 ESV Memory Lab'",'application : "TMS 60 ESV Memory Lab"','backup property quote/whitespace style');
  perturbed=alter(perturbed,'<div class="brand-sub">Exact ESV recall</div>','<div class = "brand-sub">  Exact   ESV   recall  </div>','brand text/attribute formatting');
  perturbed=alter(perturbed,'</body>','</body   >','closing body whitespace');

  const oldMarkers={
    verseStart:perturbed.includes('const VERSES='),
    verseEnd:perturbed.includes(';\nconst PACKS='),
    key:perturbed.includes("const KEY='tms60-esv-memory-lab-v1'"),
    freeze:perturbed.includes('Object.freeze(VERSES);'),
    backup:perturbed.includes("application:'TMS 60 ESV Memory Lab'"),
    brand:perturbed.includes('Exact ESV recall'),
    body:perturbed.includes('</body>')
  };

  const built=await window.TMSVersions.buildAppSource(perturbed,'hfa');
  const contract=window.TMSSourceContract;
  const manifest=contract.readVerseManifest(built.source);
  const key=contract.readStringBinding(built.source,'KEY');
  const scriptCount=file=>[...built.source.matchAll(new RegExp(`<script\\b[^>]*\\bsrc\\s*=\\s*["']${file.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')}["'][^>]*>`,'gi'))].length;
  const brandMatch=built.source.match(/<div\b[^>]*class\s*=\s*(["'])[^"']*\bbrand-sub\b[^"']*\1[^>]*>([\s\S]*?)<\/div>/i);
  const appMatch=built.source.match(/\bapplication\s*:\s*(["'])(.*?)\1/);

  let duplicateError='';
  try{contract.readVerseManifest(`${perturbed}\nconst VERSES=[];`)}catch(error){duplicateError=String(error?.message||error)}
  let bodyError='';
  try{contract.appendBeforeBody('<main>no closing body</main>','<script></script>')}catch(error){bodyError=String(error?.message||error)}

  return {
    changes,
    oldMarkers,
    definition:built.definition,
    manifestCount:manifest.length,
    firstText:manifest[0]?.text||'',
    lastText:manifest.at(-1)?.text||'',
    key,
    brand:brandMatch?.[2]?.replace(/\s+/g,' ').trim()||'',
    application:appMatch?.[2]||'',
    hasMutableKey:/\blet\s+KEY\s*=/.test(built.source),
    hasFrozenVerses:/Object\s*\.\s*freeze\s*\(\s*VERSES\s*\)/.test(built.source),
    closingBody:/<\/body\s*>/i.test(built.source),
    copyright:built.source.includes('P2-9 HFA source-contract copyright'),
    scripts:{
      ux:scriptCount('ux-patch.js'),
      runtime:scriptCount('runtime-translation-switch.js'),
      tts:scriptCount('p2-8-localized-tts-reference.js')
    },
    duplicateError,
    bodyError,
    sourceBytes:built.source.length
  };
});

pass(result.changes.length===7,'Regression perturbs all seven historical exact-marker assumptions',JSON.stringify(result.changes));
pass(Object.values(result.oldMarkers).every(value=>value===false),'Perturbed source defeats every historical exact marker',JSON.stringify(result.oldMarkers));
pass(result.definition?.id==='hfa','Perturbed source still builds the requested HFA translation',JSON.stringify(result.definition));
pass(result.manifestCount===60,'Semantic manifest replacement preserves all 60 passages',String(result.manifestCount));
pass(result.firstText==='P2-9 HFA 1'&&result.lastText==='P2-9 HFA 60','Translated wording is applied through the semantic manifest contract',`${result.firstText} / ${result.lastText}`);
pass(result.key==='tms60-hfa-memory-lab-v1','Translation-specific storage key is replaced independent of quote/whitespace style',result.key);
pass(result.hasMutableKey,'Runtime source makes KEY mutable without depending on the old combined declaration text');
pass(!result.hasFrozenVerses,'Runtime source removes Object.freeze(VERSES) despite formatting changes');
pass(result.brand==='Exact HFA recall','Visible Bible-version identity is replaced structurally',result.brand);
pass(result.application==='TMS 60 Memory Lab','Backup source identity is neutralized structurally',result.application);
pass(result.closingBody,'Generated source retains a valid whitespace-tolerant closing body tag');
pass(result.copyright,'Proxy copyright is injected before a non-literal closing body marker');
pass(result.scripts.ux===1&&result.scripts.runtime===1&&result.scripts.tts===1,'Required runtime scripts are injected exactly once',JSON.stringify(result.scripts));
pass(/exactly one VERSES source binding/i.test(result.duplicateError),'Ambiguous VERSES bindings fail loudly instead of patching an arbitrary occurrence',result.duplicateError);
pass(/closing body/i.test(result.bodyError),'Missing body contract fails loudly instead of silently dropping an injection',result.bodyError);
pass(result.sourceBytes>200000,'Full application source is preserved rather than replaced by the compatibility probe',String(result.sourceBytes));
pass(pageErrors.length===0,'P2-9 regression has no page errors',pageErrors.join(' | '));

console.log('\n=== P2-9 SOURCE CONTRACT SUMMARY ===');
console.log(JSON.stringify({failures,result},null,2));
if(failures.length)process.exitCode=1;
await browser.close();
