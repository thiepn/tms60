'use strict';
(() => {
  if (window.top === window || window.__TMS60_FAST_RECALL_QOL__) return;
  window.__TMS60_FAST_RECALL_QOL__ = '1.5.0';

  const style = document.createElement('style');
  style.id = 'tms60-fast-recall-style';
  style.textContent = `
    .rating-row.qol-rating-ready:focus{
      outline:3px solid color-mix(in srgb,var(--accent) 62%,transparent);
      outline-offset:6px;border-radius:14px;
    }
    .qol-session-strip{
      position:sticky;top:0;z-index:12;
      display:grid;grid-template-columns:auto minmax(90px,1fr) auto;
      gap:10px;align-items:center;
      margin:0 0 14px;padding:8px 10px;
      border:1px solid color-mix(in srgb,var(--border) 78%,transparent);
      border-radius:12px;background:color-mix(in srgb,var(--surface) 94%,transparent);
      backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
      box-shadow:0 5px 18px rgba(0,0,0,.08);
      font-size:.76rem;color:var(--muted);
    }
    .qol-session-strip strong{color:var(--text);white-space:nowrap}
    .qol-session-track{height:6px;border-radius:999px;background:var(--surface3);overflow:hidden}
    .qol-session-fill{height:100%;border-radius:inherit;background:var(--accent);transition:width .2s ease}
    .qol-session-ref{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34vw}
    @media(max-width:560px){.qol-session-strip{grid-template-columns:auto 1fr}.qol-session-ref{grid-column:1/-1;max-width:none}.qol-session-track{min-width:80px}}
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

  const isEditable = el => !!el && (
    el.matches?.('input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[contenteditable="true"]')
  );

  let lastPointerAt = 0;
  document.addEventListener('pointerdown',()=>{lastPointerAt=performance.now();},true);

  const armRatingGroup = () => {
    const rows = [...document.querySelectorAll('.rating-row')].filter(visibleEnabled);
    for (const row of rows) {
      row.classList.add('qol-rating-ready');
      row.tabIndex = 0;
      row.setAttribute('aria-label','Choose recall rating: 1 Again, 2 Hard, 3 Good, 4 Easy');
    }
    if (!rows.length || performance.now() - lastPointerAt < 220) return;
    const active = document.activeElement;
    if (active?.matches?.('.rate-btn') || active === document.body || active === document.documentElement) {
      setTimeout(() => {
        const row = rows.find(visibleEnabled);
        if (row && performance.now() - lastPointerAt >= 220) row.focus({preventScroll:true});
      },45);
    }
  };

  const updateSessionStrip = () => {
    const root = document.getElementById('view-study');
    if (!root) return;
    let strip = document.getElementById('qol-session-strip');
    const active = typeof session === 'object' && Array.isArray(session.tasks) && session.tasks.length > 0 && session.index < session.tasks.length;
    if (!active) {
      strip?.remove();
      return;
    }
    const total = session.tasks.length;
    const current = Math.min(total, session.index + 1);
    let reference = '';
    try { reference = typeof currentVerse === 'function' ? (currentVerse()?.reference || '') : ''; } catch (_) {}
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'qol-session-strip';
      strip.className = 'qol-session-strip';
      strip.setAttribute('role','status');
      strip.setAttribute('aria-live','polite');
      root.prepend(strip);
    }
    strip.innerHTML = `<strong>Task ${current} of ${total}</strong><div class="qol-session-track" aria-hidden="true"><div class="qol-session-fill" style="width:${Math.round(100*current/total)}%"></div></div><span class="qol-session-ref">${reference}</span>`;
  };

  const bestStudyTarget = () => {
    const selectors = [
      '.rating-row.qol-rating-ready',
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
      armRatingGroup();
      updateSessionStrip();
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

  const repeatVerseButton = () => {
    const complete = [...document.querySelectorAll('.session-complete')].find(visibleEnabled);
    if (!complete) return null;
    const buttons = [...complete.querySelectorAll('button:not(:disabled)')].filter(visibleEnabled);
    return buttons.find(button => /repeat|same verse/i.test(button.textContent || '')) || null;
  };

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;

    if ((event.key === 'r' || event.key === 'R') && !isEditable(document.activeElement)) {
      const repeat = repeatVerseButton();
      if (repeat) {
        event.preventDefault();
        event.stopImmediatePropagation();
        repeat.focus({preventScroll:true});
        repeat.click();
        return;
      }
    }

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

    if (event.target?.matches?.('.rating-row.qol-rating-ready')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

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
    armRatingGroup();
    updateSessionStrip();
  };
  bindStudyObserver();
  new MutationObserver(bindStudyObserver).observe(document.body,{childList:true,subtree:true});
})();
