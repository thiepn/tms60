'use strict';
(() => {
  if (window.top === window || window.__TMS60_FAST_RECALL_QOL__) return;
  window.__TMS60_FAST_RECALL_QOL__ = '1.2.0';

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

  const isEditable = el => !!el && (
    el.matches?.('input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[contenteditable="true"]')
  );

  const bestStudyTarget = () => {
    const selectors = [
      '.rate-btn:not(:disabled)',
      '#typing-answer:not(:disabled)',
      '#initials-answer:not(:disabled)',
      '#reference-answer:not(:disabled)',
      '.cloze-input:not(:disabled)',
      '[data-action="reveal"]:not(:disabled)',
      '[data-action="next-phrase"]:not(:disabled)',
      '.learn-check:not(:disabled)',
      '[data-action="speak"]:not(:disabled)',
      '[data-action="complete-listen"]:not(:disabled)',
      '[data-action="flashcard-next"]:not(:disabled)',
      '.session-complete .btn.primary:not(:disabled)',
      '#view-study .btn.primary:not(:disabled)'
    ];
    for (const selector of selectors) {
      const candidates = [...document.querySelectorAll(selector)].filter(visibleEnabled);
      if (!candidates.length) continue;
      if (selector.startsWith('.cloze-input')) {
        return candidates.find(input => !String(input.value || '').trim()) || candidates[0];
      }
      return candidates[0];
    }
    return null;
  };

  let focusTimer = 0;
  const scheduleStudyFocus = () => {
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active !== document.documentElement && document.contains(active) && visibleEnabled(active)) return;
      const target = bestStudyTarget();
      if (!target) return;
      target.focus({preventScroll:true});
      if (target.matches?.('input,textarea') && typeof target.select === 'function') {
        try { target.select(); } catch (_) {}
      }
      target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
    }, 35);
  };

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;

    if (/^[1-4]$/.test(event.key) && !isEditable(document.activeElement)) {
      const rating = Number(event.key) - 1;
      const button = [...document.querySelectorAll(`.rate-btn[data-rate="${rating}"]`)].find(visibleEnabled);
      if (button) {
        event.preventDefault();
        event.stopImmediatePropagation();
        button.focus({preventScroll:true});
        button.click();
        return;
      }
    }

    if (event.key !== 'Enter' || event.shiftKey) return;

    const target = event.target;
    let selector = '';
    if (target?.id === 'typing-answer') selector = '[data-action="check-typing"]';
    else if (target?.id === 'initials-answer') selector = '[data-action="check-initials"]';
    else if (target?.id === 'reference-answer') selector = '[data-action="check-reference"]';
    else if (target?.matches?.('.cloze-input:not(:disabled)') && finalClozeInput(target)) selector = '[data-action="check-cloze"]';
    else return;

    event.preventDefault();
    event.stopImmediatePropagation();
    clickAction(selector);
  }, true);

  const bindStudyObserver = () => {
    const root = document.getElementById('view-study');
    if (!root || root.dataset.qolFocusObserved === '1') return;
    root.dataset.qolFocusObserved = '1';
    new MutationObserver(scheduleStudyFocus).observe(root,{childList:true,subtree:true});
  };
  bindStudyObserver();
  new MutationObserver(bindStudyObserver).observe(document.body,{childList:true,subtree:true});
})();
