'use strict';
(() => {
  if (window.top === window || window.__TMS60_WORD_NAV_QOL__) return;
  window.__TMS60_WORD_NAV_QOL__ = '1.2.0';

  const style = document.createElement('style');
  style.id = 'tms60-word-nav-qol-style';
  style.textContent = `
    .cloze-input.qol-word-target:focus{
      outline:3px solid color-mix(in srgb,var(--accent) 68%,transparent)!important;
      outline-offset:2px;
    }
    .qol-next-target:focus{
      outline:3px solid color-mix(in srgb,var(--accent) 72%,transparent)!important;
      outline-offset:3px;
      box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 16%,transparent),var(--shadow)!important;
    }
  `;
  document.head.appendChild(style);

  const isVisibleEnabled = el => {
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
  };

  const isMobileInputMode = () => {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    return coarse || mobileUA;
  };

  const clozeInputs = () => [...document.querySelectorAll('.cloze-input:not(:disabled)')].filter(isVisibleEnabled);

  const nextFocusableAfter = input => {
    const scope = input.closest('.study-card') || document.querySelector('#view-study') || document;
    const focusables = [...scope.querySelectorAll(
      'input:not(:disabled),button:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])'
    )].filter(isVisibleEnabled);
    const index = focusables.indexOf(input);
    if (index < 0) return null;
    return focusables.slice(index + 1).find(el => !el.classList.contains('cloze-input')) || null;
  };

  const focusTarget = (el, isAction = false) => {
    if (!el) return false;
    document.querySelectorAll('.qol-word-target,.qol-next-target').forEach(node => {
      if (node !== el) node.classList.remove('qol-word-target','qol-next-target');
    });
    el.classList.add(isAction ? 'qol-next-target' : 'qol-word-target');
    el.focus({preventScroll:true});
    if (typeof el.select === 'function' && !isAction) {
      try { el.select(); } catch (_) {}
    }
    el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
    return true;
  };

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const input = event.target?.closest?.('.cloze-input:not(:disabled)');
    if (!input) return;

    const inputs = clozeInputs();
    const index = inputs.indexOf(input);
    if (index < 0) return;

    if (event.key === 'Backspace' && input.value.length === 0 && index > 0) {
      event.preventDefault();
      event.stopPropagation();
      focusTarget(inputs[index - 1], false);
      return;
    }

    const mobile = isMobileInputMode();
    const advance = mobile
      ? (event.key === ' ' || event.code === 'Space')
      : (event.key === 'Tab' && !event.shiftKey);
    if (!advance) return;

    event.preventDefault();
    event.stopPropagation();

    if (index < inputs.length - 1) {
      focusTarget(inputs[index + 1], false);
      return;
    }

    const action = nextFocusableAfter(input);
    if (action) focusTarget(action, true);
  }, true);

  document.addEventListener('paste', event => {
    const input = event.target?.closest?.('.cloze-input:not(:disabled)');
    if (!input) return;
    const text = event.clipboardData?.getData('text') || '';
    const words = text.match(/[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu) || [];
    if (words.length <= 1) return;

    const inputs = clozeInputs();
    const start = inputs.indexOf(input);
    if (start < 0) return;

    event.preventDefault();
    event.stopPropagation();

    const available = inputs.length - start;
    const count = Math.min(words.length, available);
    for (let offset = 0; offset < count; offset++) {
      const target = inputs[start + offset];
      target.value = words[offset];
      target.dispatchEvent(new Event('input', {bubbles:true}));
      target.dispatchEvent(new Event('change', {bubbles:true}));
    }

    const nextIndex = start + count;
    if (nextIndex < inputs.length) focusTarget(inputs[nextIndex], false);
    else {
      const action = nextFocusableAfter(inputs[inputs.length - 1]);
      if (action) focusTarget(action, true);
    }

    if (words.length > available && typeof toast === 'function') {
      toast(`${available} pasted words fit the remaining blanks; ${words.length - available} extra word${words.length - available === 1 ? '' : 's'} were not inserted.`);
    }
  }, true);

  document.addEventListener('focusin', event => {
    const input = event.target?.closest?.('.cloze-input:not(:disabled)');
    if (input) input.classList.add('qol-word-target');
  }, true);
})();
