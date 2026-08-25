'use strict';
(() => {
  if (window.top === window || window.__TMS60_RC3_HARDENED__) return;
  window.__TMS60_RC3_HARDENED__ = '7.0.0';

  const RELEASE_SCHEMA = 7;
  const ALLOWED_PROGRESS = new Set(['unseen','learning','prove','known']);

  const buildMeta = document.querySelector('meta[name="tms60-build"]') || document.createElement('meta');
  buildMeta.name = 'tms60-build';
  buildMeta.content = '7.0.0';
  if (!buildMeta.parentNode) document.head.appendChild(buildMeta);
  document.documentElement.dataset.release = '7.0.0';

  const style = document.createElement('style');
  style.id = 'rc3-token-aliases';
  style.textContent = ':root{--line:var(--border);--accent-soft:var(--accentSoft);--surface-2:var(--surface2);--surface-soft:var(--surface2);--shadow-soft:var(--shadow)}';
  document.head.appendChild(style);

  function verseIdForProgress(p, snapshot = state) {
    for (const v of VERSES) if (snapshot?.progress?.[v.id] === p) return v.id;
    return 0;
  }
  function wordingProofs(p, snapshot = state) {
    const id = verseIdForProgress(p, snapshot);
    if (!id) return [];
    return (snapshot?.events || []).filter(e =>
      e.verseId === id && e.timestamp > p.resetAt && e.dimension === 'wording' &&
      e.mode === 'typing' && e.objective && e.exact && e.score === 100 &&
      !e.assisted && !e.hintUsed
    ).sort((a,b) => a.timestamp - b.timestamp);
  }
  function scheduledWordingProofs(p, snapshot = state) {
    return wordingProofs(p, snapshot).filter(e => e.scheduledDue > 0 && e.timestamp + 5 * MIN >= e.scheduledDue);
  }
  function delayedProofCount(p, snapshot = state) {
    const events = scheduledWordingProofs(p, snapshot);
    if (!events.length) return 0;
    let anchor = events[0].timestamp, count = 0;
    for (const e of events.slice(1)) {
      if (e.timestamp - anchor >= 6.5 * DAY) { count++; anchor = e.timestamp; }
    }
    return count;
  }
  function referenceProofCount(p, snapshot = state) {
    const id = verseIdForProgress(p, snapshot);
    if (!id) return 0;
    return (snapshot?.events || []).filter(e =>
      e.verseId === id && e.timestamp > p.resetAt && e.dimension === 'reference' &&
      e.mode === 'reference' && e.objective && e.exact && e.score === 100 &&
      !e.assisted && !e.hintUsed
    ).length;
  }
  function wordingEstablished(p, snapshot = state) {
    return !!p && p.stage === 6 && wordingProofs(p, snapshot).length >= 1;
  }

  isWordingStable = function(p, snapshot = state) {
    return wordingEstablished(p, snapshot) && p.wording.interval >= 21 && delayedProofCount(p, snapshot) >= 2;
  };
  isReferenceKnown = function(p, snapshot = state) {
    return !!p && p.reference.interval >= 14 && p.reference.reps >= 3 && referenceProofCount(p, snapshot) >= 3;
  };
  progressStatus = function(p) {
    if (isWordingStable(p)) return 'stable';
    if (wordingEstablished(p)) return 'established';
    if (p?.stage === 6) return 'known';
    if (p?.stage > 0) return 'learning';
    return 'unseen';
  };

  function reconcileProofCounters(snapshot) {
    for (const v of VERSES) {
      const p = snapshot.progress[v.id];
      const events = scheduledWordingProofs(p, snapshot);
      if (!events.length) {
        p.wording.delayedProofs = 0;
        p.wording.lastProof = 0;
        continue;
      }
      let anchor = events[0].timestamp, count = 0;
      for (const e of events.slice(1)) {
        if (e.timestamp - anchor >= 6.5 * DAY) { count++; anchor = e.timestamp; }
      }
      p.wording.delayedProofs = Math.min(count, p.wording.reps);
      p.wording.lastProof = anchor;
    }
    return snapshot;
  }

  const originalSanitizeState = sanitizeState;
  sanitizeState = function(raw) {
    return reconcileProofCounters(originalSanitizeState(raw));
  };

  compareText = function(target, input) {
    const safeTarget = String(target || '').slice(0, MAX_ANSWER_CHARS);
    const safeInput = String(input || '').slice(0, MAX_ANSWER_CHARS);
    const ops = alignWords(safeTarget, safeInput);
    const correct = ops.filter(o => o.type === 'ok').length;
    const targetWords = wordTokens(safeTarget).map(normWord);
    const inputWords = wordTokens(safeInput).map(normWord);
    const targetN = targetWords.length, inputN = inputWords.length;
    const wordScore = targetN ? 100 * correct / Math.max(targetN, inputN) : 100;
    const wordExact = targetN === inputN && targetWords.every((w,i) => w === inputWords[i]);
    const ct = cleanText(safeTarget), ci = cleanText(safeInput);
    const surfaceExact = ct === ci;
    const charScore = ct.length ? 100 * (1 - levenshtein(ct, ci) / Math.max(ct.length, ci.length, 1)) : 100;
    const weighted = Math.round(.9 * wordScore + .1 * Math.max(0, charScore));
    const score = wordExact ? 100 : Math.min(99, weighted);
    return {
      score: clamp(score,0,100), wordScore: Math.round(wordScore), charScore: Math.round(Math.max(0,charScore)),
      exact: wordExact, surfaceExact, characterExact: surfaceExact, punctuationEquivalent: wordExact,
      targetText: ct, inputText: ci, ops,
      wrong: ops.filter(o=>o.type==='wrong').map(o=>o.target),
      missing: ops.filter(o=>o.type==='missing').map(o=>o.target),
      extra: ops.filter(o=>o.type==='extra').map(o=>o.input)
    };
  };

  buildGuidedQueue = function() {
    const t = now(), goal = state.settings.dailyGoal, seed = `guided-${localDayKey(t)}-${state.events.length}`;
    let wording = VERSES.filter(v => state.progress[v.id].stage === 6 && due(state.progress[v.id].wording,t))
      .sort((a,b)=>state.progress[a.id].wording.due-state.progress[b.id].wording.due).map(v=>wordingReviewTask(v));
    let refs = VERSES.filter(v => state.progress[v.id].stage === 6 && due(state.progress[v.id].reference,t))
      .sort((a,b)=>state.progress[a.id].reference.due-state.progress[b.id].reference.due).map(v=>referenceReviewTask(v));
    if (state.settings.shuffleReviews) { wording = seededShuffle(wording,seed+'-w'); refs = seededShuffle(refs,seed+'-r'); }
    const dueTasks = [];
    while (wording.length || refs.length) { if (wording.length) dueTasks.push(wording.shift()); if (refs.length) dueTasks.push(refs.shift()); }
    let queue = spreadSiblingTasks(dueTasks,2);
    const active = VERSES.filter(v=>state.progress[v.id].stage>0&&state.progress[v.id].stage<6)
      .sort((x,y)=>(state.progress[x.id].lastReviewed||0)-(state.progress[y.id].lastReviewed||0)||x.id-y.id);
    for (const v of active.slice(0,state.settings.activePerSession)) queue.push(learningTask(v));
    const unseen = VERSES.filter(v=>state.progress[v.id].stage===0);
    const backlogLimit = Math.max(4,Math.ceil(goal*.75));
    const learningFull = active.length>0 && (state.settings.activePerSession===0 || active.length>=state.settings.activePerSession);
    const backlogExcessive = dueTasks.length + active.length >= backlogLimit || learningFull;
    if (!backlogExcessive) for (const v of unseen.slice(0,state.settings.newPerDay)) queue.push(learningTask(v));
    if (queue.length===0 && goal>0) {
      const extras = VERSES.filter(v=>state.progress[v.id].stage===6)
        .sort((x,y)=>weakScore(state.progress[y.id])-weakScore(state.progress[x.id])).slice(0,Math.min(goal,5));
      queue.push(...extras.map(v=>wordingReviewTask(v,'extra')).map(x=>({...x,scheduled:false,label:'Optional strengthening'})));
    }
    return spreadSiblingTasks(queue,2);
  };

  metrics = function() {
    const ps=VERSES.map(v=>state.progress[v.id]), t=now();
    const stable=ps.filter(p=>isWordingStable(p)).length;
    const established=ps.filter(p=>wordingEstablished(p)).length;
    const learning=ps.filter(p=>p.stage>0&&p.stage<6).length;
    const unseen=ps.filter(p=>p.stage===0).length;
    const dueW=ps.filter(p=>p.stage===6&&due(p.wording,t)).length;
    const dueR=ps.filter(p=>p.stage===6&&due(p.reference,t)).length;
    const refKnown=ps.filter(p=>isReferenceKnown(p)).length;
    const recent=state.events.filter(e=>e.timestamp>t-30*DAY&&!e.assisted&&!e.hintUsed&&e.score!=null&&((e.dimension==='wording'&&e.mode==='typing')||(e.dimension==='reference'&&e.mode==='reference')));
    const mean=recent.length?Math.round(recent.reduce((s,e)=>s+e.score,0)/recent.length):0;
    const perfect=recent.length?Math.round(100*recent.filter(e=>e.score===100).length/recent.length):0;
    return {stable,established,maintaining:Math.max(0,established-stable),learning,unseen,dueW,dueR,refKnown,mean,perfect};
  };
  packStats = function(letter) {
    const ps=VERSES.filter(v=>v.pack===letter).map(v=>state.progress[v.id]);
    return {stable:ps.filter(p=>isWordingStable(p)).length,established:ps.filter(p=>wordingEstablished(p)).length,learning:ps.filter(p=>p.stage>0&&p.stage<6).length,reference:ps.filter(p=>isReferenceKnown(p)).length,total:12};
  };
  if (typeof flashcardReviewVerses === 'function') {
    const originalFlashcardReviewVerses = flashcardReviewVerses;
    flashcardReviewVerses = function(filter) {
      if (filter === 'mastered') return VERSES.filter(v=>wordingEstablished(state.progress[v.id]));
      return originalFlashcardReviewVerses(filter);
    };
  }

  manualProgressLevel = function(p) {
    if (!p || p.stage===0) return 'unseen';
    if (p.stage<5) return 'learning';
    if (p.stage===5) return 'prove';
    return 'known';
  };
  makeManualReviewSchedule = function(days,{minInterval=1,reference=false}={}) {
    const t=preciseNow(), requested=intClamp(days,0,MAX_INTERVAL_DAYS), interval=Math.max(minInterval,requested||minInterval), due=requested===0?t:Math.min(MAX_DATE_MS,t+requested*DAY);
    return {...defaultSchedule(),phase:'review',step:0,due,interval,ease:2.5,reps:reference?3:2,lapses:0,lastScore:null,lastReviewed:t,lastProof:0,delayedProofs:0,manualDue:true};
  };
  applyManualProgressState = function(id,level,reviewDays=7,referenceLevel='learning',{snapshot=true,notify=true,save=true}={}) {
    if(!validVerseId(id)||!ALLOWED_PROGRESS.has(level)||!['unseen','learning','known'].includes(referenceLevel)) return false;
    const current=state.progress[id], v=verseById(id), oldInterval=current.wording?.interval||0;
    const rank={unseen:0,learning:1,prove:2,known:3};
    const currentRank=rank[manualProgressLevel(current)], nextRank=rank[level];
    if(snapshot) createRecoverySnapshot();
    let p=current;
    if(nextRank<currentRank||level==='unseen') {
      const star=current.starred,starChangedAt=current.starChangedAt,stamp=monotonicStamp(current.resetAt);
      removeVerseHistory(id); p=defaultProgress(stamp); p.starred=star; p.starChangedAt=starChangedAt; state.progress[id]=p;
    }
    if(level==='unseen'){p.stage=0;p.wording=defaultSchedule();}
    else if(level==='learning'){p.stage=1;p.wording=defaultSchedule();p.lastReviewed=preciseNow();}
    else if(level==='prove'){p.stage=5;p.wording={...defaultSchedule(),phase:'learning',due:preciseNow()};p.lastReviewed=preciseNow();}
    else {p.stage=6;p.wording=makeManualReviewSchedule(reviewDays);p.lastReviewed=preciseNow();p.lastScore=null;}
    if(referenceLevel==='unseen')p.reference=defaultSchedule();
    else if(referenceLevel==='learning')p.reference={...defaultSchedule(),phase:'learning',due:preciseNow()};
    else p.reference=makeManualReviewSchedule(Math.max(14,reviewDays),{minInterval:14,reference:true});
    appendEvent({verseId:id,mode:'progress-set',dimension:'practice',assisted:true,objective:false,exact:false,newIntro:false,score:null,rating:null,scheduledDue:0,oldInterval,newInterval:p.wording.interval||0,durationMs:0,wrong:[],missing:[],extra:[],hintUsed:false,source:'manual-progress'});
    if(save)scheduleSave(true);
    if(notify)toast(`${v.reference} set to ${level==='prove'?'Ready to prove':level[0].toUpperCase()+level.slice(1)}. Verified mastery still requires unaided recall evidence.`);
    return true;
  };

  const originalProgressManagerModal = progressManagerModal;
  progressManagerModal = function(selectedId=null,preset=null) {
    originalProgressManagerModal(selectedId,preset==='stable'?'known':preset);
    const level=document.getElementById('progress-level');
    level?.querySelector('option[value="stable"]')?.remove();
    const bulk=document.getElementById('progress-bulk-level');
    bulk?.querySelector('option[value="stable"]')?.remove();
    const known=level?.querySelector('option[value="known"]'); if(known) known.textContent='Known — enter maintenance (unverified)';
    const bKnown=bulk?.querySelector('option[value="known"]'); if(bKnown) bKnown.textContent='Known — unverified';
    document.querySelectorAll('.curriculum-note').forEach(n=>{if(n.textContent.includes('Stable'))n.innerHTML='<strong>User-paced:</strong> choosing Known lets you move on immediately, but verified mastery is earned only through unaided exact recall.';});
  };

  const originalStartSession = startSession;
  startSession = function(type='guided',opts={}) {
    if(type==='assessment') {
      const vs=VERSES.filter(v=>v.pack===opts.pack);
      if(vs.length!==12||vs.some(v=>!wordingEstablished(state.progress[v.id]))) {
        toast('Establish all twelve verses in this pack through verified exact recall before taking its assessment.','error');
        return false;
      }
    }
    return originalStartSession(type,opts);
  };

  const originalFinalizeSession = finalizeSession;
  finalizeSession = function() {
    const assessment=session.type==='assessment', pack=session.config?.pack;
    const eligible=!assessment||VERSES.filter(v=>v.pack===pack).every(v=>wordingEstablished(state.progress[v.id]));
    const before=state.assessments.length;
    const out=originalFinalizeSession();
    if(assessment&&!eligible) {
      if(session.summary) session.summary.passed=false;
      for(let i=before;i<state.assessments.length;i++){state.assessments[i].passed=false;state.assessments[i].criteria='';}
    }
    return out;
  };

  const originalRenderSettings = renderSettings;
  renderSettings = function() {
    originalRenderSettings();
    if(document.getElementById('setting-new')) return;
    const goal=document.getElementById('setting-goal')?.closest('.field');
    if(!goal) return;
    goal.insertAdjacentHTML('afterend',`<div class="field"><label for="setting-new">New verses per guided session</label><input id="setting-new" type="number" min="0" max="60" value="${state.settings.newPerDay}"><div class="help">New verses are suppressed when due or active-learning backlog is high.</div></div><div class="field"><label for="setting-active">Active learning verses per guided session</label><input id="setting-active" type="number" min="0" max="60" value="${state.settings.activePerSession}"><div class="help">Limits guided learning work without blocking manual verse selection.</div></div>`);
  };

  previewImport = function(file) {
    if(hasActiveSession()){toast('End the active session before importing a backup.','error');switchView('study');return;}
    if(!file||file.size>MAX_IMPORT_BYTES){toast('Backup is missing or exceeds the 32 MB safety limit.','error');return;}
    const reader=new FileReader();
    reader.onload=()=>{
      if(hasActiveSession()){pendingImport=null;toast('End the active session before importing a backup.','error');switchView('study');return;}
      try{
        const raw=JSON.parse(reader.result);
        if(!raw||typeof raw!=='object'||Array.isArray(raw)||Number(raw.version||1)>RELEASE_SCHEMA||!completeStateShape(raw)||!verseManifestMatches(raw.verseDataset)) throw new Error('shape');
        const clean=sanitizeState(raw),ps=Object.values(clean.progress),events=clean.events.length;
        pendingImport=clean;
        modal(`<div class="modal-head"><h2>Import preview</h2><button class="btn icon-btn" data-action="close-modal" aria-label="Close dialog">×</button></div><p>The file is valid and has been sanitized before use.</p><div class="grid metrics"><div class="metric"><div class="metric-label">Established</div><div class="metric-value">${ps.filter(p=>wordingEstablished(p,clean)).length}</div></div><div class="metric"><div class="metric-label">Learning</div><div class="metric-value">${ps.filter(p=>p.stage>0&&p.stage<6).length}</div></div><div class="metric"><div class="metric-label">Events</div><div class="metric-value">${events}</div></div><div class="metric"><div class="metric-label">Schema</div><div class="metric-value">${raw.version||1}</div></div></div><p class="muted small-text"><strong>Merge</strong> keeps current settings and combines unique history. <strong>Replace</strong> overwrites current progress after creating a snapshot.</p><div class="modal-actions"><button class="btn" data-action="close-modal">Cancel</button><button class="btn" data-action="import-merge">Merge</button><button class="btn danger" data-action="import-replace">Replace</button></div>`);
      }catch(_){pendingImport=null;toast('This file is not a valid TMS Memory Lab backup.','error');}
    };
    reader.onerror=()=>toast('The backup could not be read.','error');
    reader.readAsText(file);
  };

  const originalRecoverModal = recoverModal;
  recoverModal = function() {
    originalRecoverModal();
    for(const b of document.querySelectorAll('[data-action="restore-snapshot"]')) {
      const snap=pendingSnapshots[Number(b.dataset.index)];
      if(!snap) continue;
      const n=Object.values(snap.state.progress).filter(p=>wordingEstablished(p,snap.state)).length;
      b.textContent=b.textContent.replace(/·\s*\d+\s+established\b/,'· '+n+' established');
    }
  };

  document.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-action]'); if(!b) return;
    const a=b.dataset.action;
    if(a==='bulk-progress' && document.getElementById('progress-bulk-level')?.value==='stable') {
      e.preventDefault();e.stopImmediatePropagation();toast('Manual Stable is disabled. Verified mastery requires delayed unaided recall evidence.','error');return;
    }
    if(a==='assess-pack'||a==='start-assessment') {
      const pack=b.dataset.pack;
      const eligible=/^[A-E]$/.test(pack)&&VERSES.filter(v=>v.pack===pack).every(v=>wordingEstablished(state.progress[v.id]));
      if(!eligible){e.preventDefault();e.stopImmediatePropagation();toast('Establish all twelve verses in this pack through verified exact recall before taking its assessment.','error');}
    }
  },true);

  const originalDefaultState = defaultState;
  defaultState = function(epoch=0) {
    const s=originalDefaultState(epoch);
    s.settings.appearance='dark';s.settings.accent='neutral';
    return s;
  };

  state = sanitizeState(state);
  applyTheme();
  renderAll();
  updateSaveStatus(storageWriteBlocked?(storageBlockMessage||'Read-only: stored data preserved'):storageAvailable?'Saved locally':'Session-only: browser storage unavailable');
  console.info('TMS60 v7.0.0 RC3 hardening active');
})();
