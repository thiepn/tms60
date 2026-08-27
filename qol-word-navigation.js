'use strict';
(() => {
  if (window.top === window || window.__TMS60_WORD_NAV_QOL__) return;
  window.__TMS60_WORD_NAV_QOL__ = '1.9.0';

  const EMPTY_GUARD_KEY = 'tms60-qol-empty-advance-guard-v1';
  const MOBILE_MODE = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');

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
    .cloze-input.qol-empty-blocked{
      animation:qol-empty-pulse .24s ease 0s 2 alternate;
      border-color:var(--warn)!important;
      box-shadow:0 0 0 3px color-mix(in srgb,var(--warn) 20%,transparent)!important;
    }
    @keyframes qol-empty-pulse{from{transform:scale(1)}to{transform:scale(1.035)}}
    @media(prefers-reduced-motion:reduce){.cloze-input.qol-empty-blocked{animation:none}}
  `;
  document.head.appendChild(style);

  const readEmptyGuard = () => {
    try {
      const value = localStorage.getItem(EMPTY_GUARD_KEY);
      return value == null ? true : value !== '0';
    } catch (_) { return true; }
  };

  const isVisibleEnabled = el => {
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
  };

  const isMobileInputMode = () => MOBILE_MODE;
  const studyRoot = () => document.getElementById('view-study');
  const clozeInputs = () => [...(studyRoot()?.querySelectorAll('.cloze-input:not(:disabled)') || [])].filter(isVisibleEnabled);

  const syncClozeKeyboardHints = () => {
    const inputs = clozeInputs();
    inputs.forEach((input,index) => {
      const hint = index === inputs.length - 1 ? 'done' : 'next';
      if (input.getAttribute('enterkeyhint') !== hint) input.setAttribute('enterkeyhint', hint);
      if (input.getAttribute('inputmode') !== 'text') input.setAttribute('inputmode','text');
    });
  };

  const nextFocusableAfter = input => {
    const scope = input.closest('.study-card') || studyRoot() || document;
    const focusables = [...scope.querySelectorAll(
      'input:not(:disabled),button:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])'
    )].filter(isVisibleEnabled);
    const index = focusables.indexOf(input);
    if (index < 0) return null;
    return focusables.slice(index + 1).find(el => !el.classList.contains('cloze-input')) || null;
  };

  const clearTargetClasses = keep => {
    const root = studyRoot() || document;
    root.querySelectorAll('.qol-word-target,.qol-next-target').forEach(node => {
      if (node !== keep) node.classList.remove('qol-word-target','qol-next-target');
    });
  };

  const focusTarget = (el, isAction = false) => {
    if (!el) return false;
    clearTargetClasses(el);
    el.classList.add(isAction ? 'qol-next-target' : 'qol-word-target');
    el.focus({preventScroll:true});
    if (typeof el.select === 'function' && !isAction) {
      try { el.select(); } catch (_) {}
    }
    el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
    return true;
  };

  // Backward navigation is deliberately different from normal forward focus:
  // place the caret at the end so the very next Backspace deletes text rather
  // than selecting the whole previous blank or jumping again.
  const focusBackwardTarget = el => {
    if (!el) return false;
    clearTargetClasses(el);
    el.classList.add('qol-word-target');
    el.focus({preventScroll:true});
    try {
      const end = String(el.value || '').length;
      el.setSelectionRange(end,end);
    } catch (_) {}
    el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
    return true;
  };

  const canNativeBackspaceDelete = input => {
    const value = String(input.value || '');
    if (!value.length) return false;
    const start = typeof input.selectionStart === 'number' ? input.selectionStart : value.length;
    const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
    return start !== end || start > 0;
  };

  let lastBoundaryBackspace = null;

  const dispatchEdited = input => {
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  };

  const deletePreviousCharacter = input => {
    const inputs = clozeInputs();
    const index = inputs.indexOf(input);
    if (index <= 0 || canNativeBackspaceDelete(input)) return false;

    // Cross the artificial word boundary exactly like Backspace crosses a
    // normal character boundary: move only backward and delete in the same
    // keystroke. Skip empty blocks so deletion never gets stuck between words.
    let targetIndex = index - 1;
    while (targetIndex > 0 && !String(inputs[targetIndex].value || '').length) targetIndex--;
    const target = inputs[targetIndex];
    focusBackwardTarget(target);
    const value = String(target.value || '');
    if (value.length) {
      const end = value.length;
      target.setRangeText('',end - 1,end,'end');
      dispatchEdited(target);
    }
    return true;
  };

  const blockEmptyAdvance = input => {
    input.classList.remove('qol-empty-blocked');
    void input.offsetWidth;
    input.classList.add('qol-empty-blocked');
    setTimeout(()=>input.classList.remove('qol-empty-blocked'),650);
    focusTarget(input,false);
  };

  const advanceFromInput = input => {
    const inputs = clozeInputs();
    const index = inputs.indexOf(input);
    if (index < 0) return false;

    if (readEmptyGuard() && !String(input.value || '').trim()) {
      blockEmptyAdvance(input);
      return true;
    }

    if (index < inputs.length - 1) {
      focusTarget(inputs[index + 1], false);
      return true;
    }

    const action = nextFocusableAfter(input);
    if (action) return focusTarget(action, true);
    return false;
  };

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const input = event.target?.closest?.('.cloze-input:not(:disabled)');
    if (!input) return;

    const inputs = clozeInputs();
    const index = inputs.indexOf(input);
    if (index < 0) return;

    if (event.key === 'Backspace') {
      // Never steal a Backspace that can delete selected/text content in the
      // current blank. Only travel backward when the caret is already at the
      // beginning (or the blank is empty), where native Backspace has nothing
      // left to delete in this block.
      if (index > 0 && deletePreviousCharacter(input)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        lastBoundaryBackspace = {input,at:performance.now()};
      }
      return;
    }

    const mobile = isMobileInputMode();
    const advance = mobile
      ? (event.key === ' ' || event.code === 'Space' || event.key === 'Enter')
      : (event.key === 'Tab' && !event.shiftKey);
    if (!advance) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    advanceFromInput(input);
  }, true);

  document.addEventListener('beforeinput', event => {
    if (event.defaultPrevented || event.isComposing || !isMobileInputMode()) return;
    const input = event.target?.closest?.('.cloze-input:not(:disabled)');
    if (!input) return;

    // Some mobile keyboards report Backspace only as beforeinput. Preserve the
    // same rule: native deletion wins whenever the current blank can delete.
    if (event.inputType === 'deleteContentBackward') {
      const duplicate = lastBoundaryBackspace?.input === input && performance.now() - lastBoundaryBackspace.at < 120;
      if (duplicate || deletePreviousCharacter(input)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }

    const data = String(event.data ?? '');
    if (event.inputType !== 'insertText' || !/^\s+$/u.test(data)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    advanceFromInput(input);
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
    if (input) {
      syncClozeKeyboardHints();
      input.classList.add('qol-word-target');
    }
  }, true);

  let syncScheduled = false;
  const scheduleSync = () => {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      syncClozeKeyboardHints();
    });
  };

  const root = studyRoot();
  if (root) new MutationObserver(scheduleSync).observe(root,{childList:true,subtree:true});
  syncClozeKeyboardHints();
})();
