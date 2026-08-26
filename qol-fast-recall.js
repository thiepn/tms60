'use strict';
(() => {
  if (window.top === window || window.__TMS60_FAST_RECALL_QOL__) return;
  window.__TMS60_FAST_RECALL_QOL__ = '1.8.0';

  const style = document.createElement('style');
  style.id = 'tms60-fast-recall-style';
  style.textContent = `
    .rating-row.qol-rating-ready:focus{
      outline:3px solid color-mix(in srgb,var(--accent) 62%,transparent);
      outline-offset:6px;border-radius:14px;
    }
    .qol-session-strip{
      position:static;z-index:auto;display:block;
      margin:0 0 10px;padding:2px 4px;border:0;border-radius:0;
      background:transparent;box-shadow:none;
      backdrop-filter:none;-webkit-backdrop-filter:none;
      font-size:.84rem;line-height:1.35;font-weight:760;
      text-align:center;color:var(--muted);
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    }
    .qol-session-ref{display:block;max-width:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .qol-repeat-hint{font-size:.72rem;font-weight:700;opacity:.72}
  `;
  document.head.appendChild(style);

  const visibleEnabled = el => {
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
  };

  const clickAction = selector => {
    const button = [...document.querySelectorAll(selector)].find(visibleEnabled);
    if (!button) return false;
    button.focus({preventScroll:true});
    button.click();
    return true;
  };

  const finalClozeInput = input => {
    const inputs = [...document.querySelectorAll('.cloze-input:not(:disabled)')].filter(visibleEnabled);
    return inputs.length > 0 && inputs[inputs.length - 1] === input;
  };

  const isEditable = el => !!el && el.matches?.('input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[contenteditable="true"]');

  let lastPointerAt = 0;
  document.addEventListener('pointerdown',()=>{lastPointerAt=performance.now();},true);

  const ratingRowFor = el => el?.closest?.('.rating-row') || null;
  const armRatingGroup = () => {
    const rows = [...document.querySelectorAll('.rating-row')].filter(visibleEnabled);
    for (const row of rows) {
      row.classList.add('qol-rating-ready');
      row.tabIndex = 0;
      row.setAttribute('aria-label','Choose recall rating: 1 Again, 2 Hard, 3 Good, 4 Easy. Press Enter to continue with Good when available.');
    }
    if (!rows.length || performance.now() - lastPointerAt < 220) return;
    const active = document.activeElement;
    const row = ratingRowFor(active) || rows[0];
    if (active?.matches?.('.rate-btn') || active === document.body || active === document.documentElement || active?.matches?.('.cloze-input:disabled,input:disabled,textarea:disabled')) row?.focus({preventScroll:true});
  };

  document.addEventListener('focusin',event=>{
    const button=event.target?.closest?.('.rate-btn');
    if(!button || performance.now()-lastPointerAt<220) return;
    const row=ratingRowFor(button);
    if(row?.classList.contains('qol-rating-ready')) row.focus({preventScroll:true});
  },true);

  const updateSessionStrip = () => {
    const root = document.getElementById('view-study');
    if (!root) return;
    let strip = document.getElementById('qol-session-strip');
    const active = typeof session === 'object' && Array.isArray(session.tasks) && session.tasks.length > 0 && session.index < session.tasks.length;
    if (!active) { strip?.remove(); return; }

    let label = '';
    let mode = '';
    try {
      const task = typeof currentTask === 'function' ? currentTask() : null;
      mode = task?.mode || '';
      label = mode === 'reference' ? 'Which verse?' : (typeof currentVerse === 'function' ? (currentVerse()?.reference || '') : '');
    } catch (_) {}
    if (!label) label = 'Study';

    const signature = `${session.index}|${mode}|${label}`;
    if (!strip) {
      strip = document.createElement('div');
      strip.id='qol-session-strip';
      strip.className='qol-session-strip';
      strip.setAttribute('role','status');
      strip.setAttribute('aria-live','polite');
      root.prepend(strip);
    }
    if (strip.dataset.signature === signature) return;
    strip.dataset.signature = signature;
    strip.textContent = label;
  };

  const lastRepeatTarget = () => {
    if (typeof session !== 'object' || !Array.isArray(session.results) || !session.results.length) return null;
    const result = session.results[session.results.length - 1], id = Number(result?.verseId);
    if (!Number.isInteger(id) || id < 1 || id > 60) return null;
    let mode = String(result?.mode || 'path');
    try { if (mode !== 'path' && (!Array.isArray(PRACTICE_MODES) || !PRACTICE_MODES.includes(mode))) mode='path'; } catch (_) { mode='path'; }
    return {id,mode};
  };

  const ensureRepeatButton = () => {
    const complete = [...document.querySelectorAll('.session-complete')].find(visibleEnabled);
    if (!complete) return null;
    let button = complete.querySelector('[data-qol-repeat-verse]');
    const target = lastRepeatTarget();
    if (!target) { button?.remove(); return null; }
    if (!button) {
      button=document.createElement('button'); button.type='button'; button.className='btn'; button.setAttribute('data-qol-repeat-verse','1');
      (complete.querySelector('.actions,.item-actions,.modal-actions') || complete).appendChild(button);
    }
    const signature=`${target.id}|${target.mode}`;
    if(button.dataset.signature!==signature){
      button.dataset.signature=signature; button.dataset.verseId=String(target.id); button.dataset.mode=target.mode;
      button.innerHTML='Repeat this verse <span class="qol-repeat-hint">R</span>';
    }
    return button;
  };

  const repeatVerse = button => {
    const target = button ? {id:Number(button.dataset.verseId),mode:button.dataset.mode||'path'} : lastRepeatTarget();
    if(!target || !Number.isInteger(target.id)) return false;
    try {
      if(typeof clearSession==='function') clearSession();
      if(typeof startSingleVersePractice==='function') return startSingleVersePractice(target.id,target.mode) !== false;
    } catch(error) { console.error('Could not repeat verse',error); }
    return false;
  };

  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('[data-qol-repeat-verse]');
    if(!button) return;
    event.preventDefault(); repeatVerse(button);
  },true);

  const bestStudyTarget = () => {
    const selectors = ['.rating-row.qol-rating-ready','#typing-answer:not(:disabled)','#initials-answer:not(:disabled)','#reference-answer:not(:disabled)','.cloze-input:not(:disabled)','[data-action="reveal"]:not(:disabled)','[data-action="next-phrase"]:not(:disabled)','[data-patch-action="continue-build"]:not(:disabled)','.learn-check:not(:disabled)','[data-action="speak"]:not(:disabled)','[data-action="complete-listen"]:not(:disabled)','[data-action="flashcard-next"]:not(:disabled)','.session-complete .btn.primary:not(:disabled)','.session-complete [data-qol-repeat-verse]:not(:disabled)','#view-study .btn.primary:not(:disabled)'];
    for (const selector of selectors) {
      const candidates=[...document.querySelectorAll(selector)].filter(visibleEnabled);
      if(!candidates.length) continue;
      if(selector.startsWith('.cloze-input')) return candidates.find(input=>!String(input.value||'').trim())||candidates[0];
      return candidates[0];
    }
    return null;
  };

  let focusTimer=0;
  const scheduleStudyFocus=()=>{
    clearTimeout(focusTimer);
    focusTimer=setTimeout(()=>{
      const active=document.activeElement;
      if(active&&active!==document.body&&active!==document.documentElement&&document.contains(active)&&visibleEnabled(active)) return;
      const target=bestStudyTarget(); if(!target)return;
      target.focus({preventScroll:true});
      if(target.matches?.('input,textarea')&&typeof target.select==='function'){try{target.select()}catch(_){}}
      target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
    },20);
  };

  const syncStudyQoL=()=>{
    armRatingGroup();
    updateSessionStrip();
    ensureRepeatButton();
    scheduleStudyFocus();
  };

  let syncQueued=false;
  const scheduleStudySync=()=>{
    if(syncQueued)return;
    syncQueued=true;
    requestAnimationFrame(()=>{
      syncQueued=false;
      syncStudyQoL();
    });
  };

  const repeatVerseButton=()=>{
    ensureRepeatButton();
    const complete=[...document.querySelectorAll('.session-complete')].find(visibleEnabled);
    if(!complete)return null;
    return [...complete.querySelectorAll('[data-qol-repeat-verse],button:not(:disabled)')].filter(visibleEnabled).find(button=>button.hasAttribute('data-qol-repeat-verse')||/repeat|same verse/i.test(button.textContent||''))||null;
  };

  const continueFromRating = row => {
    if (!row) return false;
    const enabled = [...row.querySelectorAll('.rate-btn:not(:disabled)')].filter(visibleEnabled);
    if (!enabled.length) return false;
    const good = enabled.find(button => button.dataset.rate === '2');
    const button = good || enabled[enabled.length - 1];
    button.focus({preventScroll:true});
    button.click();
    return true;
  };

  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.isComposing||event.altKey||event.ctrlKey||event.metaKey)return;
    if((event.key==='r'||event.key==='R')&&!isEditable(document.activeElement)){
      const repeat=repeatVerseButton(); if(repeat){event.preventDefault();event.stopImmediatePropagation();repeat.focus({preventScroll:true});repeat.click();return}
    }
    if(/^[1-4]$/.test(event.key)&&!isEditable(document.activeElement)){
      const rating=Number(event.key)-1,button=[...document.querySelectorAll(`.rate-btn[data-rate="${rating}"]`)].find(visibleEnabled);
      if(button){event.preventDefault();event.stopImmediatePropagation();button.focus({preventScroll:true});button.click();return}
    }
    if(event.key!=='Enter'||event.shiftKey)return;
    if(event.target?.matches?.('.rating-row.qol-rating-ready')){
      event.preventDefault();event.stopImmediatePropagation();continueFromRating(event.target);return;
    }
    const target=event.target; let selector='';
    if(target?.id==='typing-answer')selector='[data-action="check-typing"]';
    else if(target?.id==='initials-answer')selector='[data-action="check-initials"]';
    else if(target?.id==='reference-answer')selector='[data-action="check-reference"]';
    else if(target?.matches?.('.cloze-input:not(:disabled)')&&finalClozeInput(target))selector='[data-action="check-cloze"]';
    else return;
    event.preventDefault();event.stopImmediatePropagation();clickAction(selector);
  },true);

  let observedStudyRoot=null;
  let studyObserver=null;
  const bindStudyObserver=()=>{
    const root=document.getElementById('view-study');
    if(!root)return false;
    if(root===observedStudyRoot&&studyObserver)return true;
    studyObserver?.disconnect();
    observedStudyRoot=root;
    root.dataset.qolFocusObserved='1';
    studyObserver=new MutationObserver(scheduleStudySync);
    studyObserver.observe(root,{childList:true,subtree:true});
    syncStudyQoL();
    return true;
  };

  // The enhancement loader injects this layer only after the app core and its
  // static view roots exist. Observe Study itself, not the entire document.
  // A cheap direct-child observer on .content only handles the exceptional case
  // where a future renderer replaces #view-study wholesale; mutations inside
  // every other view no longer wake the fast-recall QoL layer.
  if(!bindStudyObserver()){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindStudyObserver,{once:true});
    else requestAnimationFrame(bindStudyObserver);
  }
  const contentRoot=document.querySelector('.content');
  if(contentRoot){
    new MutationObserver(()=>{
      const live=document.getElementById('view-study');
      if(live&&live!==observedStudyRoot)bindStudyObserver();
    }).observe(contentRoot,{childList:true});
  }
})();
