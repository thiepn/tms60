import { chromium } from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const WORKER='https://tms60-niv-api.thiepn.workers.dev';
const LANG='tms60-ui-language-v1';
const VER='tms60-active-translation-v1';
const R={passes:[],failures:[],timings:{}};
const check=(c,n,d='')=>{(c?R.passes:R.failures).push({name:n,detail:d});console.log(`${c?'PASS':'FAIL'} ${n}${d?' — '+d:''}`);return c};
const overlap=(a,b)=>!(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);
function seed({lang='en',version='esv'}={}){
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem(LANG,lang);
  localStorage.setItem(VER,version);
  localStorage.setItem('tms60-global-theme-v1',JSON.stringify({appearance:'light',accent:'neutral'}));
}
async function frameOf(page,timeout=45000){
  await page.waitForSelector('#app-frame.ready',{timeout});
  const end=Date.now()+timeout;
  while(Date.now()<end){const f=page.frames().find(x=>x!==page.mainFrame());if(f&&await f.locator('#desktop-nav').count())return f;await page.waitForTimeout(100)}
  throw new Error('app iframe not ready');
}
async function open(browser,{lang='en',version='esv',viewport={width:1440,height:1000}}={}){
  const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[],consoleErrors=[],hosts=new Set();
  page.on('pageerror',e=>errors.push(String(e?.stack||e)));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
  page.on('request',r=>{try{hosts.add(new URL(r.url()).hostname)}catch{}});
  await page.addInitScript(seed,{lang,version});
  const t=Date.now();const response=await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});const frame=await frameOf(page);await page.waitForTimeout(400);
  return{context,page,frame,response,errors,consoleErrors,hosts,ms:Date.now()-t};
}
async function nav(f,v){await f.locator(`#desktop-nav [data-view="${v}"]`).click();await f.waitForFunction(x=>document.documentElement.dataset.view===x,v,{timeout:10000});await f.waitForTimeout(150)}
async function workerAudit(){
  const health=await fetch(`${WORKER}/health`).then(r=>Promise.all([r,r.json()]));check(health[0].ok,'Worker health HTTP 200',String(health[0].status));check(health[1]?.ok===true,'Worker health payload');check(health[1]?.apiKeyConfigured===true,'Worker API key configured');
  for(const v of ['niv','nlt','hfa','klb1985']){const t=Date.now(),r=await fetch(`${WORKER}/v1/bibles/${v}/tms60`),j=await r.json();R.timings[`worker_${v}`]=Date.now()-t;check(r.ok,`${v.toUpperCase()} Worker endpoint`,String(r.status));check(Array.isArray(j?.verses)&&j.verses.length===60,`${v.toUpperCase()} returns 60 passages`,String(j?.verses?.length));check(!j?.verses?.some(x=>!String(x?.text||'').trim()),`${v.toUpperCase()} passages non-empty`)}
}
async function manifestAudit(){const r=await fetch(`${APP}manifest.webmanifest`),m=await r.json();check(r.ok,'PWA manifest reachable');check(m.display==='standalone','PWA standalone display');const s=new Set((m.icons||[]).map(x=>x.sizes));check(s.has('192x192')&&s.has('512x512'),'PWA icons 192/512')}
const LEAKS=['Assessment record','Search book, chapter & verse or wording','Recurring word errors','Verses needing attention','Recent review history','How verse progress works','Pack progress','Next seven days','Living the New Life','Proclaiming Christ','Reliance on God’s Resources',"Reliance on God's Resources",'Being Christ’s Disciple',"Being Christ's Disciple",'Growth in Christlikeness','Due work is never hidden merely because it exceeds this target.','Removes canonical-order cues.','Interface scale:','Private and offline','Saved locally','All packs','All statuses'];
async function desktopAudit(browser){
  const a=await open(browser);const{context,page,frame,response,errors,consoleErrors,ms}=a;R.timings.desktop=ms;check(response?.status()===200,'GitHub Pages HTTP 200',String(response?.status()));check(ms<15000,'Desktop load <15s',`${ms}ms`);check(await frame.locator('#desktop-nav').count()===1,'Desktop nav rendered once');check(await page.locator('#onboarding:not(.hidden)').count()===0,'Existing-user onboarding suppressed');
  await nav(frame,'settings');await frame.waitForSelector('#ui-language-select');await frame.waitForSelector('#shell-version-select');check(await frame.locator('#ui-language-select').count()===1,'One language selector');check(await frame.locator('#shell-version-select').count()===1,'One Bible selector');const l=await frame.locator('#ui-language-settings-card').boundingBox(),b=await frame.locator('[data-shell-version-settings]').boundingBox();check(Boolean(l&&b),'Preference cards measurable');if(l&&b){check(!overlap(l,b),'Preference cards do not overlap');check(l.width>=140&&b.width>=140,'Preference cards usable width',`${Math.round(l.width)}/${Math.round(b.width)}`)}
  const t=Date.now();for(let i=0;i<6;i++)for(const v of ['progress','library','study','settings','home'])await nav(frame,v);R.timings.navStress=Date.now()-t;check(R.timings.navStress<18000,'30-view navigation responsive',`${R.timings.navStress}ms`);const lag=await frame.evaluate(()=>new Promise(r=>{const t=performance.now();setTimeout(()=>r(performance.now()-t),100)}));check(lag<1000,'Event loop responsive',`${Math.round(lag)}ms`);
  await nav(frame,'settings');const exp=frame.locator('[data-action="export-json"]');if(await exp.count()){const dl=page.waitForEvent('download',{timeout:10000}).catch(()=>null);await exp.click();check(Boolean(await dl),'JSON export downloads')}else check(false,'JSON export control exists');
  const regs=await page.evaluate(async()=>{await navigator.serviceWorker.ready;return(await navigator.serviceWorker.getRegistrations()).length});check(regs>0,'Service worker registered',String(regs));check(errors.length===0,'Desktop no runtime errors',errors.slice(0,3).join(' | '));check(consoleErrors.filter(x=>!/favicon|404/i.test(x)).length===0,'Desktop no relevant console errors',consoleErrors.slice(0,3).join(' | '));await context.close();
}
async function localizationAudit(browser){
  const a=await open(browser);let{context,page,frame}=a;await nav(frame,'settings');const url=page.url();
  for(const l of ['de','ko','en']){await frame.locator('#ui-language-select').evaluate((s,v)=>{s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}))},l);await page.waitForFunction(([k,v])=>localStorage.getItem(k)===v,[LANG,l],{timeout:10000});await page.waitForTimeout(700);frame=await frameOf(page);await nav(frame,'settings');check(await frame.locator('#ui-language-select').inputValue()===l,`Language switch ${l}`);check(page.url()===url,`Language ${l} does not reload shell URL`)}await context.close();
  for(const l of ['de','ko']){const x=await open(browser,{lang:l});const f=x.frame,n=await f.locator('#desktop-nav').innerText(),expected=l==='de'?['Heute','Lernen','Bibliothek','Fortschritt','Einstellungen']:['오늘','학습','구절','진행','설정'];check(expected.every(v=>n.includes(v)),`${l.toUpperCase()} nav localized`,n.replace(/\n/g,' / '));for(const v of ['home','study','library','progress','settings']){await nav(f,v);const text=await f.locator('body').innerText(),leaks=LEAKS.filter(q=>text.includes(q));check(!leaks.length,`${l.toUpperCase()} ${v} no known English leaks`,leaks.join(' | '))}check(!x.errors.length,`${l.toUpperCase()} no runtime errors`,x.errors.join(' | '));await x.context.close()}
}
async function versionAudit(browser){for(const[v,s]of[['esv','ESV'],['niv','NIV'],['nlt','NLT'],['hfa','HFA'],['schlachter1951','SCH1951'],['klb1985','KLB 1985'],['krv1961','개역한글']]){const a=await open(browser,{version:v});const{context,page,frame,errors,hosts}=a;const notice=page.locator('#notice.error:not(.hidden)'),msg=await notice.count()?await notice.innerText():'';check(!msg,`${s} cold load`,msg);const brand=await frame.locator('.brand-sub').innerText();check(brand.includes(s),`${s} active source`,brand);check((await frame.locator('.quote-mini').first().innerText().catch(()=>'' )).trim().length>=8,`${s} verse text non-empty`);await nav(frame,'settings');check(await frame.locator('#shell-version-select').inputValue()===v,`${s} selector correct`);check((await page.evaluate(k=>localStorage.getItem(k),VER))===v,`${s} persists`);if(['niv','nlt','hfa','klb1985'].includes(v)){check(hosts.has('tms60-niv-api.thiepn.workers.dev'),`${s} uses Worker proxy`);check(!hosts.has('rest.api.bible'),`${s} no direct API.Bible request`)}check(!errors.length,`${s} no runtime errors`,errors.join(' | '));await context.close()}}
async function offlineAudit(browser){const a=await open(browser);const{context,page}=a;await page.evaluate(async()=>await navigator.serviceWorker.ready);await page.reload({waitUntil:'domcontentloaded'});await frameOf(page);await context.setOffline(true);try{await page.reload({waitUntil:'domcontentloaded',timeout:30000});const f=await frameOf(page,30000);check(Boolean(await f.locator('.brand-title').innerText()),'Offline ESV reload')}catch(e){check(false,'Offline ESV reload',String(e))}await context.setOffline(false);await context.close()}
async function mobileAudit(browser){for(const width of [390,768,1024]){const a=await open(browser,{viewport:{width,height:844}}),f=a.frame;if(width<=760){check(await f.locator('.mobile-nav').isVisible(),`Mobile nav visible ${width}px`);await f.locator('.mobile-nav [data-view="settings"]').click()}else await nav(f,'settings');await f.waitForFunction(()=>document.documentElement.dataset.view==='settings');await f.waitForTimeout(400);const overflow=await f.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);check(overflow<=2,`No horizontal overflow ${width}px`,`${overflow}px`);const l=await f.locator('#ui-language-settings-card').boundingBox(),b=await f.locator('[data-shell-version-settings]').boundingBox();check(Boolean(l&&b),`Preference cards visible ${width}px`);if(l&&b){check(!overlap(l,b),`Preference cards do not overlap ${width}px`);check(l.width>=140&&b.width>=140,`Preference cards usable ${width}px`,`${Math.round(l.width)}/${Math.round(b.width)}`)}check(!a.errors.length,`No runtime errors ${width}px`,a.errors.join(' | '));await a.context.close()}}

const browser=await chromium.launch({headless:true});
try{await workerAudit();await manifestAudit();await desktopAudit(browser);await localizationAudit(browser);await versionAudit(browser);await offlineAudit(browser);await mobileAudit(browser)}catch(e){check(false,'Production audit fatal',String(e?.stack||e))}finally{await browser.close()}
console.log('\n=== RC1 PRODUCTION V3 SUMMARY ===');console.log(JSON.stringify(R,null,2));process.exitCode=R.failures.length?1:0;
