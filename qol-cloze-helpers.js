'use strict';
(() => {
  if (window.top === window || window.__TMS60_CLOZE_HELPERS_QOL__) return;
  window.__TMS60_CLOZE_HELPERS_QOL__ = '1.1.0';

  const style = document.createElement('style');
  style.id = 'tms60-cloze-helper-style';
  style.textContent = `
    .qol-cloze-counter{
      display:flex;justify-content:flex-end;align-items:center;
      margin:0 auto 8px;max-width:820px;color:var(--muted);
      font-size:.78rem;font-weight:720;letter-spacing:.02em;
    }
  `;
  document.head.appendChild(style);

  const visibleEnabled = el => {
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
  };

  let lastPointerAt = 0;
  document.addEventListener('pointerdown',()=>{lastPointerAt=performance.now();},true);

  const clozeInputs = () => [...document.querySelectorAll('.cloze-input:not(:disabled)')].filter(visibleEnabled);

  const updateCounter = () => {
    const line = document.querySelector('.cloze-line');
    const inputs = clozeInputs();
    let counter = document.getElementById('qol-cloze-counter');
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
    counter.textContent = `${index + 1} / ${inputs.length} words`;
  };

  let timer = 0;
  const focusFirstUnfinished = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      updateCounter();
      if (performance.now() - lastPointerAt < 220) return;
      const inputs = clozeInputs();
      if (!inputs.length) return;
      if (typeof currentTask === 'function' && currentTask()?.mode !== 'cloze') return;
      if (typeof session === 'object' && session?.exercise?.checked) return;

      const firstEmpty = inputs.find(input => !String(input.value || '').trim());
      const target = firstEmpty || inputs[inputs.length - 1];
      const active = document.activeElement;
      if (active === target) return;
      if (active?.matches?.('.cloze-input:not(:disabled)') && !firstEmpty) return;
      if (active?.matches?.('.cloze-input:not(:disabled)') && !String(active.value || '').trim()) return;

      target.focus({preventScroll:true});
      try { target.select(); } catch (_) {}
      target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
      updateCounter();
    }, 70);
  };

  document.addEventListener('focusin',event=>{
    if (event.target?.matches?.('.cloze-input:not(:disabled)')) updateCounter();
  },true);
  document.addEventListener('input',event=>{
    if (event.target?.matches?.('.cloze-input:not(:disabled)')) updateCounter();
  },true);

  const bind = () => {
    const root = document.getElementById('view-study');
    if (!root || root.dataset.qolClozeResumeObserved === '1') return;
    root.dataset.qolClozeResumeObserved = '1';
    new MutationObserver(focusFirstUnfinished).observe(root,{childList:true,subtree:true});
    focusFirstUnfinished();
  };

  bind();
  new MutationObserver(bind).observe(document.body,{childList:true,subtree:true});
})();
