'use strict';
(() => {
  if (window.top === window || window.__TMS60_CLOZE_HELPERS_QOL__) return;
  window.__TMS60_CLOZE_HELPERS_QOL__ = '1.0.0';

  const visibleEnabled = el => {
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
  };

  let lastPointerAt = 0;
  document.addEventListener('pointerdown',()=>{lastPointerAt=performance.now();},true);

  const clozeInputs = () => [...document.querySelectorAll('.cloze-input:not(:disabled)')].filter(visibleEnabled);

  let timer = 0;
  const focusFirstUnfinished = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
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
    }, 70);
  };

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
