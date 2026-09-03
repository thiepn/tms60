/* Keep the tested verse reference visible in exact-recall exercises. */
(() => {
  'use strict';

  const REFERENCE_VISIBLE_MODES = new Set(['typing', 'initials']);
  let scheduled = false;

  function activeTask() {
    try { return typeof currentTask === 'function' ? currentTask() : null; }
    catch (_) { return null; }
  }

  function activeVerse() {
    try { return typeof currentVerse === 'function' ? currentVerse() : null; }
    catch (_) { return null; }
  }

  function ensureStyles() {
    if (document.getElementById('tms60-recall-reference-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'tms60-recall-reference-fix-style';
    style.textContent = `
      .recall-prompt-ref{
        font-size:clamp(1.35rem,3vw,2rem);
        font-weight:780;
        letter-spacing:-.025em;
        line-height:1.25;
        margin-bottom:7px;
      }
    `;
    document.head.appendChild(style);
  }

  function syncReference() {
    scheduled = false;
    const root = document.getElementById('view-study');
    if (!root) return;

    const task = activeTask();
    const verse = activeVerse();
    const shouldShow = Boolean(task && verse && REFERENCE_VISIBLE_MODES.has(task.mode));

    if (!shouldShow) {
      root.querySelectorAll('[data-recall-reference-fix]').forEach(el => el.remove());
      return;
    }

    const prompt = root.querySelector('.study-card .prompt') || root.querySelector('.prompt');
    if (!prompt) return;

    let reference = prompt.querySelector('[data-recall-reference-fix]');
    if (!reference) {
      reference = document.createElement('div');
      reference.className = 'recall-prompt-ref';
      reference.dataset.recallReferenceFix = '1';
      const help = prompt.querySelector('.prompt-help');
      if (help) prompt.insertBefore(reference, help);
      else prompt.prepend(reference);
    }

    const text = String(verse.reference || '').trim();
    if (reference.textContent !== text) reference.textContent = text;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(syncReference);
  }

  ensureStyles();
  const studyRoot = document.getElementById('view-study');
  if (studyRoot) new MutationObserver(schedule).observe(studyRoot, { childList: true, subtree: true });
  schedule();

  window.__TMS60_RECALL_REFERENCE_FIX__ = '1.0.0';
})();
