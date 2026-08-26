'use strict';
(() => {
  if (window.top === window || window.__TMS60_CLOZE_HELPERS_QOL__) return;
  window.__TMS60_CLOZE_HELPERS_QOL__ = '1.7.0';

  const EMPTY_GUARD_KEY = 'tms60-qol-empty-advance-guard-v1';
  const MOBILE_MODE = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');

  const style = document.createElement('style');
  style.id = 'tms60-cloze-helper-style';
  style.textContent = `
    .qol-cloze-counter{
      display:flex;justify-content:flex-end;align-items:center;
      margin:0 auto 8px;max-width:820px;color:var(--muted);
      font-size:.78rem;font-weight:720;letter-spacing:.02em;
    }
    .cloze-input.qol-locked-correct{opacity:.62;background:var(--successSoft);border-color:color-mix(in srgb,var(--success) 35%,var(--border))}
    [data-qol-fix-cloze]{margin-left:6px}
  `;
  document.head.appendChild(style);

  const visibleEnabled = el => {
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
  };

  const mobileMode = () => MOBILE_MODE;
  const emptyGuardEnabled = () => {
    try { const value=localStorage.getItem(EMPTY_GUARD_KEY); return value == null ? true : value !== '0'; }
    catch (_) { return true; }
  };
  const normalizeWord = value => String(value || '').toLocaleLowerCase('en-US').replace(/[’]/g,"'").trim();

  let lastPointerAt = 0;
  let mobilePositionToken = 0;
  document.addEventListener('pointerdown',()=>{lastPointerAt=performance.now();},true);

  const studyRoot = () => document.getElementById('view-study');
  const clozeInputs = () => [...(studyRoot()?.querySelectorAll('.cloze-input:not(:disabled)') || [])].filter(visibleEnabled);
  const allClozeInputs = () => [...(studyRoot()?.querySelectorAll('.cloze-input') || [])].filter(el=>el.getClientRects().length>0);

  const positionMobileInput = input => {
    if (!input || !mobileMode()) return;
    const token = ++mobilePositionToken;
    const move = () => {
      if (token !== mobilePositionToken || document.activeElement !== input || !document.contains(input)) return;
      const scroller = document.querySelector('.content');
      if (!scroller || scroller.scrollHeight <= scroller.clientHeight) {
        input.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});
        return;
      }
      const sr = scroller.getBoundingClientRect();
      const ir = input.getBoundingClientRect();
      const desiredTop = sr.top + Math.max(72, sr.height * 0.34);
      const delta = ir.top - desiredTop;
      if (Math.abs(delta) > 12) scroller.scrollBy({top:delta,behavior:'auto'});
    };
    setTimeout(move,70);
    setTimeout(move,260);
  };

  const focusClozeInput = input => {
    if (!input) return false;
    input.focus({preventScroll:true});
    try { input.select(); } catch (_) {}
    input.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
    positionMobileInput(input);
    return true;
  };

  const errorIndicesFromDom = () => allClozeInputs()
    .filter(input => normalizeWord(input.value) !== normalizeWord(input.dataset.expected))
    .map(input => Number(input.dataset.ci))
    .filter(Number.isInteger);

  const applyFixOnlyMode = () => {
    if (typeof session !== 'object' || session?.exercise?.checked) return;
    const errors = Array.isArray(session?.exercise?.qolErrorIndices) ? session.exercise.qolErrorIndices : [];
    if (!errors.length) return;
    const allowed = new Set(errors.map(Number));
    for (const input of allClozeInputs()) {
      const editable = allowed.has(Number(input.dataset.ci));
      input.disabled = !editable;
      input.classList.toggle('qol-locked-correct',!editable);
    }
    const inputs = clozeInputs();
    const active = document.activeElement;
    if (inputs[0] && !inputs.includes(active)) setTimeout(()=>focusClozeInput(inputs[0]),35);
  };

  const injectFixErrorsButton = () => {
    if (typeof currentTask === 'function' && currentTask()?.mode !== 'cloze') return;
    const checked = typeof session === 'object' && session?.exercise?.checked;
    const actions = studyRoot()?.querySelector('.cloze-line')?.parentElement?.querySelector('.answer-actions');
    if (!checked || !actions) return;
    const errors = errorIndicesFromDom();
    if (!errors.length) {
      if (session?.exercise) delete session.exercise.qolErrorIndices;
      actions.querySelector('[data-qol-fix-cloze]')?.remove();
      return;
    }
    let button = actions.querySelector('[data-qol-fix-cloze]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.setAttribute('data-qol-fix-cloze','1');
      actions.appendChild(button);
    }
    const label = `Fix ${errors.length} error${errors.length===1?'':'s'}`;
    if (button.textContent !== label) button.textContent = label;
  };

  const updateCounter = () => {
    const root = studyRoot();
    const line = root?.querySelector('.cloze-line');
    const inputs = clozeInputs();
    let counter = root?.querySelector('#qol-cloze-counter');
    if (!line || !inputs.length) {
      counter?.remove();
      return;
    }
    if (!counter) {
      counter = document.createElement('div');
      counter.id = 'qol-cloze-counter';
      counter.className = 'qol-cloze-counter';
      counter.setAttribute('aria-hidden','true');
      line.parentNode.insertBefore(counter,line);
    }
    const active = document.activeElement;
    let index = inputs.indexOf(active);
    if (index < 0) {
      const firstEmpty = inputs.findIndex(input => !String(input.value || '').trim());
      index = firstEmpty >= 0 ? firstEmpty : inputs.length - 1;
    }
    const correcting = Array.isArray(session?.exercise?.qolErrorIndices) && session.exercise.qolErrorIndices.length > 0;
    const text = correcting ? `${index + 1} / ${inputs.length} errors` : `${index + 1} / ${inputs.length} words`;
    if (counter.textContent !== text) counter.textContent = text;
  };

  const injectSettingsToggle = () => {
    const view = document.getElementById('view-settings');
    const stack = view?.querySelector('.settings-grid .stack');
    if (!stack || view.querySelector('#qol-recall-controls-card')) return;
    const card = document.createElement('article');
    card.id = 'qol-recall-controls-card';
    card.className = 'card flat';
    card.innerHTML = `<h2>Recall controls</h2><label class="switch-row"><span><strong>Require text before advancing cloze blanks</strong><br><span class="tiny muted">When enabled, Space/Tab/Next keeps focus on an empty blank instead of skipping it.</span></span><input type="checkbox" id="qol-empty-advance-guard" ${emptyGuardEnabled()?'checked':''}></label>`;
    stack.appendChild(card);
  };

  let timer = 0;
  const refreshClozeHelpers = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      applyFixOnlyMode();
      updateCounter();
      injectFixErrorsButton();
      if (performance.now() - lastPointerAt < 220) return;
      const inputs = clozeInputs();
      if (!inputs.length) return;
      if (typeof currentTask === 'function' && currentTask()?.mode !== 'cloze') return;
      if (typeof session === 'object' && session?.exercise?.checked) return;

      const active = document.activeElement;
      if (inputs.includes(active)) {
        updateCounter();
        return;
      }

      const firstEmpty = inputs.find(input => !String(input.value || '').trim());
      const target = firstEmpty || inputs[inputs.length - 1];
      focusClozeInput(target);
      updateCounter();
    }, 70);
  };

  document.addEventListener('click',event=>{
    const button = event.target?.closest?.('[data-qol-fix-cloze]');
    if (!button || typeof session !== 'object' || !session?.exercise) return;
    const inputs = allClozeInputs();
    const errors = errorIndicesFromDom();
    if (!errors.length) return;
    session.exercise.clozeAnswers = inputs.map(input=>String(input.value || ''));
    session.exercise.qolErrorIndices = errors;
    session.exercise.checked = false;
    session.exercise.result = null;
    if (typeof renderStudy === 'function') renderStudy();
    setTimeout(()=>{applyFixOnlyMode();updateCounter();},40);
  },true);

  document.addEventListener('keydown',event=>{
    const input = event.target?.closest?.('.cloze-input:not(:disabled)');
    if (!input || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const inputs = clozeInputs();
    const index = inputs.indexOf(input);
    if (index < 0) return;
    const targetIndex = event.key === 'ArrowLeft' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= inputs.length) return;
    event.preventDefault();
    event.stopPropagation();
    focusClozeInput(inputs[targetIndex]);
    updateCounter();
  },true);

  document.addEventListener('change',event=>{
    if (event.target?.id !== 'qol-empty-advance-guard') return;
    try { localStorage.setItem(EMPTY_GUARD_KEY,event.target.checked?'1':'0'); } catch (_) {}
  },true);

  document.addEventListener('focusin',event=>{
    if (event.target?.matches?.('.cloze-input:not(:disabled)')) {
      updateCounter();
      positionMobileInput(event.target);
    }
  },true);
  document.addEventListener('input',event=>{
    if (event.target?.matches?.('.cloze-input:not(:disabled)')) updateCounter();
  },true);

  const root = studyRoot();
  if (root && root.dataset.qolClozeResumeObserved !== '1') {
    root.dataset.qolClozeResumeObserved = '1';
    new MutationObserver(refreshClozeHelpers).observe(root,{childList:true,subtree:true});
    refreshClozeHelpers();
  }

  const settingsRoot = document.getElementById('view-settings');
  if (settingsRoot) new MutationObserver(injectSettingsToggle).observe(settingsRoot,{childList:true,subtree:true});
  injectSettingsToggle();
})();
