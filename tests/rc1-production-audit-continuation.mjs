import { chromium } from 'playwright';
const APP='https://thiepn.github.io/tms60/';
const LANG='tms60-ui-language-v1', VER='tms60-active-translation-v1';
const R={pass:[],fail:[],timing:{}};
const ok=(c,n,d='')=>{(c?R.pass:R.fail).push({n,d});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);return c};
function seed(lang='en',version='esv'){localStorage.setItem('tms60-onboarding-v2','1');localStorage.setItem('tms60-onboarding-v3','1');localStorage.setItem('tms60-ui-language-v1',lang);localStorage.setItem('tms60-active-translation-v1',version)}
async function frameOf(page,t=45000){await page.waitForSelector('#app-frame.ready',{timeout:t});for(let i=0;i<t/100;i++){const f=page.frames().find(x=>x!==page.mainFrame());if(f&&await f.locator('#desktop-nav').count())return f;await page.waitForTimeout(100)}throw new Error('iframe not ready')}
async function open(browser,lang='en',version='esv',viewport={width:1440,height:1000}){const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];const hosts=new Set();page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{try{hosts.add(new URL(r.url()).hostname)}catch{}});await page.addInitScript(seed,lang,version);const t=Date.now();await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});const frame=await frameOf(page);return{context,page,frame,errors,hosts,ms:Date.now()-t}}
async function nav(f,v){const sel=`#desktop-nav [data-view="${v}"]`;await f.locator(sel).click();await f.waitForFunction(x=>document.documentElement.dataset.view===x,v,{timeout:10000});await f.waitForTimeout(180)}
const LEAKS=['End active session','Remaining tasks will be discarded.','Assessment record','No pack assessment completed.','Search book, chapter & verse or wording','Recurring word errors','Verses needing attention','Recent review history','How verse progress works','Pack progress','Next seven days','Living the New Life','Proclaiming Christ','Reliance on God’s Resources',"Reliance on God's Resources",'Being Christ’s Disciple',"Being Christ's Disciple",'Growth in Christlikeness','Read slowly, notice the structure','I read the verse aloud slowly.','I said the book, chapter & verse before and after the verse.','I looked away and recalled at least the opening phrase.','Due work is never hidden merely because it exceeds this target.','Removes canonical-order cues.','Interface scale:','Private and offline','Saved locally','All packs','All statuses','Study plan','Backup and restore','Data principles','Bible version','Memorization text','Appearance','Light / dark mode','Accent color','Reset everything','Target retention display','lighter workload','balanced','maximum maintenance'];
async function languageSwitchAudit(browser){
  const a=await open(browser);let {context,page,frame}=a;await nav(frame,'settings');
  for(const lang of ['de','ko','en']){
    const before=page.url();
    await frame.locator('#ui-language-select').evaluate((s,value)=>{s.value=value;s.dispatchEvent(new Event('change',{bubbles:true}))},lang);
    await page.waitForFunction(([k,v])=>localStorage.getItem(k)===v,[LANG,lang],{timeout:10000});
    await page.waitForTimeout(1200);
    frame=await frameOf(page);await nav(frame,'settings');
    ok(await frame.locator('#ui-language-select').inputValue()===lang,`Language switch -> ${lang}`);
    ok((await page.evaluate(k=>localStorage.getItem(k),LANG))===lang,`Language ${lang} persists`);
    ok(page.url()===before,'Language switch retains app URL',page.url());
  }
  await context.close();
}
async function localizationAudit(browser,lang){
  const a=await open(browser,lang);const{context,frame,errors}=a;
  const expected=lang==='de'?['Heute','Lernen','Bibliothek','Fortschritt','Einstellungen']:['오늘','학습','구절','진행','설정'];
  ok(expected.every(x=>(frame.locator('#desktop-nav').innerText())),`${lang} navigation structure present`);
  const navText=await frame.locator('#desktop-nav').innerText();ok(expected.every(x=>navText.includes(x)),`${lang.toUpperCase()} nav localized`,navText.replace(/\n/g,' / '));
  for(const v of ['home','study','library','progress','settings']){await nav(frame,v);await frame.waitForTimeout(250);const text=await frame.locator('body').innerText();const leaks=LEAKS.filter(x=>text.includes(x));ok(leaks.length===0,`${lang.toUpperCase()} ${v} known-English leak scan`,leaks.join(' | '));}
  ok(errors.length===0,`${lang.toUpperCase()} no uncaught runtime errors`,errors.slice(0,3).join(' | '));
  await context.close();
}
async function versionAudit(browser){
 const versions=[['esv','ESV'],['niv','NIV'],['nlt','NLT'],['hfa','HFA'],['schlachter1951','SCH1951'],['klb1985','KLB 1985'],['krv1961','개역한글']];
 for(const[v,short]of versions){const a=await open(browser,'en',v);const{context,page,frame,errors,hosts,ms}=a;R.timing['version_'+v]=ms;const notice=page.locator('#notice.error:not(.hidden)');const nt=await notice.count()?await notice.innerText():'';ok(!nt,`${short} production load`,nt);const brand=await frame.locator('.brand-sub').innerText();ok(brand.includes(short),`${short} active source`,brand);const q=await frame.locator('.quote-mini').first().innerText().catch(()=> '');ok(q.trim().length>7,`${short} verse text non-empty`,`${q.trim().length} chars`);await nav(frame,'settings');ok(await frame.locator('#shell-version-select').inputValue()===v,`${short} selector reflects active version`);ok((await page.evaluate(k=>localStorage.getItem(k),VER))===v,`${short} version persisted`);if(['niv','nlt','hfa','klb1985'].includes(v)){ok(hosts.has('tms60-niv-api.thiepn.workers.dev'),`${short} uses Worker proxy`);ok(!hosts.has('rest.api.bible'),`${short} never exposes direct API.Bible request`)}ok(errors.length===0,`${short} no uncaught runtime errors`,errors.slice(0,2).join(' | '));await context.close()}
}
async function actualVersionSwitch(browser){const a=await open(browser);const{context,page}=a;let frame=a.frame;await nav(frame,'settings');for(const [v,short]of[['niv','NIV'],['klb1985','KLB 1985'],['esv','ESV']]){await frame.locator('#shell-version-select').selectOption(v);await page.waitForFunction(([k,x])=>localStorage.getItem(k)===x,[VER,v],{timeout:15000});await page.waitForTimeout(700);frame=await frameOf(page);const brand=await frame.locator('.brand-sub').innerText();ok(brand.includes(short),`Live Bible selector switch -> ${short}`,brand);await nav(frame,'settings')}await context.close()}
async function offline(browser){const a=await open(browser);const{context,page}=a;await page.evaluate(async()=>{await navigator.serviceWorker.ready});await page.reload({waitUntil:'domcontentloaded'});await frameOf(page);await context.setOffline(true);let good=true,d='';try{await page.reload({waitUntil:'domcontentloaded',timeout:30000});const f=await frameOf(page,30000);d=await f.locator('.brand-title').innerText()}catch(e){good=false;d=String(e)}ok(good,'ESV PWA offline reload',d);await context.setOffline(false);await context.close()}
async function mobile(browser){const a=await open(browser,'en','esv',{width:390,height:844});const{context,frame,errors}=a;ok(await frame.locator('.mobile-nav').isVisible(),'Mobile nav visible at 390px');await frame.locator('.mobile-nav [data-view="settings"]').click();await frame.waitForSelector('#ui-language-select');await frame.waitForTimeout(400);const overflow=await frame.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);ok(overflow<=2,'Mobile settings no horizontal overflow',`${overflow}px`);const l=await frame.locator('#ui-language-settings-card').boundingBox(),b=await frame.locator('[data-shell-version-settings]').boundingBox();if(l&&b){ok(l.width>150&&b.width>150,'Mobile language/Bible cards usable',`${Math.round(l.width)}px/${Math.round(b.width)}px`);ok(l.y<b.y,'Mobile preference cards stack cleanly',`y=${Math.round(l.y)}/${Math.round(b.y)}`)}ok(errors.length===0,'Mobile no uncaught runtime errors',errors.join(' | '));await context.close()}
const browser=await chromium.launch({headless:true});
try{await languageSwitchAudit(browser);await localizationAudit(browser,'de');await localizationAudit(browser,'ko');await versionAudit(browser);await actualVersionSwitch(browser);await offline(browser);await mobile(browser)}catch(e){ok(false,'Continuation audit fatal error',String(e?.stack||e))}finally{await browser.close()}
console.log('\n=== RC1 CONTINUATION SUMMARY ===');console.log(JSON.stringify(R,null,2));process.exitCode=R.fail.length?1:0;
