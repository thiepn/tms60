import { chromium } from 'playwright';

const APP='https://thiepn.github.io/tms60/';
const out={passes:[],failures:[]};
const test=(ok,name,detail='')=>{
  (ok?out.passes:out.failures).push({name,detail});
  console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);
};
function seed(){
  localStorage.setItem('tms60-onboarding-v2','1');
  localStorage.setItem('tms60-onboarding-v3','1');
  localStorage.setItem('tms60-ui-language-v1','en');
  localStorage.setItem('tms60-active-translation-v1','esv');
  localStorage.removeItem('tms60-esv-memory-lab-v1');
  localStorage.removeItem('tms60-esv-memory-lab-v1-snapshots');
}
async function frameOf(page,timeout=60000){
  await page.waitForSelector('#app-frame.ready',{timeout});
  const end=Date.now()+timeout;
  while(Date.now()<end){
    const f=page.frames().find(x=>x!==page.mainFrame());
    if(f&&await f.locator('#desktop-nav').count())return f;
    await page.waitForTimeout(100);
  }
  throw new Error('app iframe not ready');
}
async function waitForHardening(page,timeout=60000){
  const f=await frameOf(page,timeout);
  await f.waitForFunction(()=>window.__TMS60_RC3_HARDENED__==='7.0.0',{timeout});
  return f;
}

const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e?.stack||e)));
  await page.addInitScript(seed);
  await page.goto(APP,{waitUntil:'domcontentloaded',timeout:45000});
  const frame=await waitForHardening(page);

  const r=await frame.evaluate(()=>{
    const DAY_MS=24*60*60*1000;
    const MIN_MS=60*1000;
    const clone=x=>JSON.parse(JSON.stringify(x));
    const reset=()=>{
      state=defaultState();
      session=emptySession();
      completionLocked=false;
      state.events=[];
      return state;
    };
    const proof=(verseId,timestamp,dimension='wording',scheduled=true)=>({
      verseId,
      timestamp,
      dimension,
      mode:dimension==='reference'?'reference':'typing',
      objective:true,
      exact:true,
      score:100,
      assisted:false,
      hintUsed:false,
      scheduledDue:scheduled?timestamp-MIN_MS:0,
      rating:3,
      newIntro:false,
      source:'rc3-integrity-test',
      wrong:[],missing:[],extra:[],durationMs:1000,
      oldInterval:0,newInterval:0
    });

    const result={};
    result.release=window.__TMS60_RC3_HARDENED__;
    result.verseCount=VERSES.length;
    result.uniqueIds=new Set(VERSES.map(v=>v.id)).size;
    result.packCounts=Object.fromEntries(['A','B','C','D','E'].map(p=>[p,VERSES.filter(v=>v.pack===p).length]));

    const target=VERSES[0].text;
    const normalized=target.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
    const words=normalized.split(' ');
    const reordered=[words[1],words[0],...words.slice(2)].join(' ');
    const casePunct=compareText(target,normalized);
    const missing=compareText(target,words.slice(0,-1).join(' '));
    const extra=compareText(target,`${normalized} extra`);
    const reorder=compareText(target,reordered);
    result.compare={
      tolerantScore:casePunct.score,
      tolerantExact:casePunct.exact,
      missingScore:missing.score,missingExact:missing.exact,
      extraScore:extra.score,extraExact:extra.exact,
      reorderScore:reorder.score,reorderExact:reorder.exact
    };

    reset();
    const id=VERSES[0].id;
    applyManualProgressState(id,'known',21,'known',{snapshot:false,notify:false,save:false});
    let p=state.progress[id];
    result.manualKnown={
      stage:p.stage,
      status:progressStatus(p),
      stable:isWordingStable(p),
      refKnown:isReferenceKnown(p),
      established:metrics().established,
      delayedProofs:p.wording.delayedProofs,
      referenceReps:p.reference.reps
    };
    p.wording.delayedProofs=99;
    p.wording.lastProof=Date.now();
    p.wording.interval=99;
    result.forgedCountersStable=isWordingStable(p);

    const raw=clone(state);
    raw.progress[id].wording.delayedProofs=99;
    raw.progress[id].wording.lastProof=Date.now();
    raw.progress[id].wording.interval=99;
    const sanitized=sanitizeState(raw);
    result.sanitize={
      delayedProofs:sanitized.progress[id].wording.delayedProofs,
      lastProof:sanitized.progress[id].wording.lastProof,
      stable:isWordingStable(sanitized.progress[id],sanitized)
    };

    reset();
    p=state.progress[id];
    p.stage=6;
    p.wording.interval=21;
    const now=Date.now();
    p.resetAt=now-17*DAY_MS;
    state.events.push(proof(id,now-15*DAY_MS,'wording',false));
    result.oneProof={status:progressStatus(p),established:metrics().established,stable:isWordingStable(p)};
    state.events.push(proof(id,now-8*DAY_MS,'wording',true));
    state.events.push(proof(id,now-1*DAY_MS,'wording',true));
    // The first exact proof also needs to be scheduled to serve as the delayed-proof anchor.
    state.events[0].scheduledDue=state.events[0].timestamp-MIN_MS;
    result.delayedProofs={stable:isWordingStable(p),status:progressStatus(p)};

    p.reference.interval=14;
    p.reference.reps=3;
    p.reference.phase='review';
    result.referenceBeforeEvidence=isReferenceKnown(p);
    state.events.push(proof(id,now-3*DAY_MS,'reference',false));
    state.events.push(proof(id,now-2*DAY_MS,'reference',false));
    state.events.push(proof(id,now-1*DAY_MS,'reference',false));
    result.referenceAfterEvidence=isReferenceKnown(p);

    reset();
    state.settings.dailyGoal=8;
    state.settings.activePerSession=3;
    state.settings.newPerDay=2;
    for(const v of VERSES.slice(0,5)) state.progress[v.id].stage=1;
    const activeIds=new Set(VERSES.slice(0,5).map(v=>v.id));
    const backlogQueue=buildGuidedQueue();
    result.backlog={
      taskCount:backlogQueue.length,
      verseIds:backlogQueue.map(t=>t.verseId),
      introducedUnseen:backlogQueue.some(t=>!activeIds.has(t.verseId))
    };
    reset();
    state.settings.dailyGoal=8;
    state.settings.activePerSession=3;
    state.settings.newPerDay=2;
    const clearQueue=buildGuidedQueue();
    result.clearBacklog={taskCount:clearQueue.length,verseIds:clearQueue.map(t=>t.verseId)};

    reset();
    const packA=VERSES.filter(v=>v.pack==='A');
    for(const v of packA){
      const q=state.progress[v.id];
      q.stage=6;
      q.wording.interval=21;
    }
    const assessmentBefore=clone(session);
    const blockedReturn=startSession('assessment',{pack:'A'});
    result.assessmentBlocked={
      returnValue:blockedReturn,
      sessionType:session.type,
      sessionUnchanged:JSON.stringify(session)===JSON.stringify(assessmentBefore)
    };

    reset();
    result.manualLevelNeverStable=['unseen','learning','prove','known'].includes(manualProgressLevel(state.progress[id]));
    return result;
  });

  test(r.release==='7.0.0','RC3 hardening layer active',String(r.release));
  test(r.verseCount===60&&r.uniqueIds===60,'Exactly 60 unique verses',`${r.verseCount}/${r.uniqueIds}`);
  test(Object.values(r.packCounts).every(n=>n===12),'Five packs contain 12 verses each',JSON.stringify(r.packCounts));
  test(r.compare.tolerantScore===100&&r.compare.tolerantExact,'Case/punctuation-only differences score exact 100',JSON.stringify(r.compare));
  test(!r.compare.missingExact&&r.compare.missingScore<100,'Missing word fails exact recall',String(r.compare.missingScore));
  test(!r.compare.extraExact&&r.compare.extraScore<100,'Extra word fails exact recall',String(r.compare.extraScore));
  test(!r.compare.reorderExact&&r.compare.reorderScore<100,'Reordered words fail exact recall',String(r.compare.reorderScore));
  test(r.manualKnown.stage===6&&r.manualKnown.status==='known','Manual Known enters maintenance but remains unverified',JSON.stringify(r.manualKnown));
  test(!r.manualKnown.stable&&!r.manualKnown.refKnown&&r.manualKnown.established===0,'Manual Known cannot create Established/Stable/reference-known',JSON.stringify(r.manualKnown));
  test(!r.forgedCountersStable,'Forged delayed-proof counters cannot create Stable');
  test(r.sanitize.delayedProofs===0&&r.sanitize.lastProof===0&&!r.sanitize.stable,'Sanitization removes proof counters unsupported by events',JSON.stringify(r.sanitize));
  test(r.oneProof.status==='established'&&r.oneProof.established===1&&!r.oneProof.stable,'One verified exact wording proof creates Established but not Stable',JSON.stringify(r.oneProof));
  test(r.delayedProofs.stable&&r.delayedProofs.status==='stable','Separated scheduled proof evidence creates Stable',JSON.stringify(r.delayedProofs));
  test(!r.referenceBeforeEvidence&&r.referenceAfterEvidence,'Reference-known requires three verified reference proofs');
  test(!r.backlog.introducedUnseen,'Backlog suppresses new verse introductions',JSON.stringify(r.backlog));
  test(r.clearBacklog.verseIds.includes(1)&&r.clearBacklog.verseIds.includes(2),'Clear backlog permits configured new introductions',JSON.stringify(r.clearBacklog));
  test(r.assessmentBlocked.returnValue===false&&r.assessmentBlocked.sessionUnchanged,'Pack assessment blocked when 12 verses lack verified Established evidence',JSON.stringify(r.assessmentBlocked));
  test(r.manualLevelNeverStable,'Manual progress model exposes no Stable level');
  test(errors.length===0,'Integrity audit produced no runtime errors',errors.join(' | '));
  await context.close();
}catch(error){
  test(false,'RC3 integrity gate fatal',String(error?.stack||error));
}finally{
  await browser.close();
}

console.log(JSON.stringify(out,null,2));
process.exitCode=out.failures.length?1:0;
