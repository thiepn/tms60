'use strict';
(() => {
  if (window.top === window || window.__TMS60_FAST_RECALL_QOL__) return;
  window.__TMS60_FAST_RECALL_QOL__ = '1.1.0';

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
})();
