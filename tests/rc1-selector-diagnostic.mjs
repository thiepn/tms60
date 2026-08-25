import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
await page.addInitScript(()=>{
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem('tms60-ui-language-v1','en');
  localStorage.setItem('tms60-active-translation-v1','esv');
});
await page.goto('https://thiepn.github.io/tms60/',{waitUntil:'domcontentloaded'});
await page.waitForSelector('#app-frame.ready');
let frame;
for(let i=0;i<100;i++){frame=page.frames().find(f=>f!==page.mainFrame());if(frame&&await frame.locator('#desktop-nav').count())break;await page.waitForTimeout(100)}
await frame.locator('#desktop-nav [data-view="settings"]').click();
await frame.waitForFunction(()=>document.documentElement.dataset.view==='settings');
await page.waitForTimeout(1000);
const report=await frame.evaluate(()=>{
 const sel=document.getElementById('ui-language-select');
 const card=document.getElementById('ui-language-settings-card');
 const view=document.getElementById('view-settings');
 const grid=view?.querySelector('.settings-grid');
 const cs=sel?getComputedStyle(sel):null, ccs=card?getComputedStyle(card):null, vcs=view?getComputedStyle(view):null;
 const r=sel?.getBoundingClientRect(), cr=card?.getBoundingClientRect();
 const chain=[];let x=sel;while(x&&chain.length<8){const s=getComputedStyle(x);chain.push({tag:x.tagName,id:x.id,class:x.className,display:s.display,visibility:s.visibility,opacity:s.opacity,pointerEvents:s.pointerEvents,inert:x.inert||false,rect:{x:x.getBoundingClientRect().x,y:x.getBoundingClientRect().y,w:x.getBoundingClientRect().width,h:x.getBoundingClientRect().height}});x=x.parentElement}
 return {activeView:document.documentElement.dataset.view,selectCount:document.querySelectorAll('#ui-language-select').length,cardCount:document.querySelectorAll('#ui-language-settings-card').length,viewClass:view?.className,viewDisplay:vcs?.display,gridChildren:grid?[...grid.children].map(e=>({tag:e.tagName,id:e.id,class:e.className,dataVersion:e.hasAttribute('data-shell-version-settings')})):[],select:{disabled:sel?.disabled,display:cs?.display,visibility:cs?.visibility,opacity:cs?.opacity,pointerEvents:cs?.pointerEvents,rect:r&&{x:r.x,y:r.y,w:r.width,h:r.height}},card:{display:ccs?.display,visibility:ccs?.visibility,rect:cr&&{x:cr.x,y:cr.y,w:cr.width,h:cr.height}},chain};
});
console.log(JSON.stringify(report,null,2));
const visible=await frame.locator('#ui-language-select').isVisible();
const enabled=await frame.locator('#ui-language-select').isEnabled();
console.log('PLAYWRIGHT visible=',visible,'enabled=',enabled);
if(!visible||!enabled)process.exitCode=1;
await browser.close();
