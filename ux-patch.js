(() => {
  'use strict';

  let lastTaskId = null;
  let compactScheduled = false;

  function task() {
    try { return typeof currentTask === 'function' ? currentTask() : null; } catch (_) { return null; }
  }

  function verse() {
    try { return typeof currentVerse === 'function' ? currentVerse() : null; } catch (_) { return null; }
  }

  function scrollSessionTop() {
    requestAnimationFrame(() => {
      const content = document.querySelector('.content');
      if (content) content.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }

  function addStyles() {
    if (document.getElementById('tms60-session-ux-patch')) return;
    const style = document.createElement('style');
    style.id = 'tms60-session-ux-patch';
    style.textContent = `
      .prompt.prompt-compact{padding:8px 0 14px}
      .prompt.prompt-compact .prompt-help{margin-top:0}
      .session-end-bottom{margin-top:12px}
      @media(max-width:760px){
        .prompt.prompt-compact{padding:5px 0 12px}
        #view-study .study-shell{gap:10px}
        #view-study .study-card{min-height:0}
      }
    `;
    document.head.appendChild(style);
  }

  function patchBuild(root, currentTask, currentVerse) {
    if (currentTask?.mode !== 'build' || !currentVerse || typeof phraseSplit !== 'function') return;
    const phrases = phraseSplit(currentVerse.text);
    if (!phrases.length) return;

    if (typeof session === 'object' && session?.exercise && !Number.isFinite(session.exercise.phraseIndex)) {
      session.exercise.phraseIndex = 0;
    }
    const shown = Math.max(0, Math.min(phrases.length, Number(session?.exercise?.phraseIndex) || 0));

    if (shown === 0) {
      root.querySelectorAll('.phrase').forEach(el => {
        el.classList.add('hidden-phrase');
        if (el.textContent !== 'Hidden phrase') el.textContent = 'Hidden phrase';
      });
      const reveal = root.querySelector('[data-action="next-phrase"]');
      if (reveal && reveal.textContent !== 'Reveal first phrase') reveal.textContent = 'Reveal first phrase';
    }

    if (shown >= phrases.length) {
      root.querySelector('.rating-row')?.remove();
      const actions = root.querySelector('.phrase-list')?.nextElementSibling;
      if (actions && !root.querySelector('[data-patch-action="continue-build"]')) {
        actions.innerHTML = '<button class="btn primary" type="button" data-patch-action="continue-build">Continue</button>';
        requestAnimationFrame(() => root.querySelector('[data-patch-action="continue-build"]')?.focus({ preventScroll: true }));
      }
    }
  }

  function compactStudy() {
    compactScheduled = false;
    addStyles();

    const root = document.getElementById('view-study');
    const currentTask = task();
    const currentVerse = verse();
    const active = Boolean(root && currentTask && currentVerse && typeof session === 'object' && session?.tasks?.length && session.index < session.tasks.length);

    if (!active) {
      lastTaskId = null;
      return;
    }

    const currentTaskId = String(currentTask.id ?? `${session.index}:${currentTask.mode}:${currentVerse.id}`);
    if (lastTaskId !== currentTaskId) {
      lastTaskId = currentTaskId;
      scrollSessionTop();
    }

    // The exercise itself is the focus. Remove duplicated session chrome and
    // every prompt-level reference that can leak a reference-recall answer.
    root.querySelector('.page-head')?.remove();
    root.querySelector('.study-toolbar')?.remove();
    root.querySelector('.study-meta')?.remove();
    root.querySelectorAll('.prompt-ref').forEach(el => el.remove());
    root.querySelectorAll('.prompt').forEach(el => el.classList.add('prompt-compact'));

    if (currentTask.mode === 'reference') {
      root.querySelectorAll('.queue-item').forEach(item => {
        const label = item.querySelectorAll('span')[1];
        if (label && label.textContent.trim() === currentVerse.reference) label.textContent = 'Current verse';
      });
    }

    const referenceInput = root.querySelector('#reference-answer');
    if (referenceInput?.hasAttribute('placeholder')) referenceInput.removeAttribute('placeholder');

    patchBuild(root, currentTask, currentVerse);

    const footer = root.querySelector('.study-footer');
    if (footer && !footer.querySelector('[data-patch-end-session]')) {
      const end = document.createElement('button');
      end.type = 'button';
      end.className = 'btn quiet small session-end-bottom';
      end.dataset.action = 'end-session';
      end.dataset.patchEndSession = '1';
      end.textContent = 'End session';
      footer.appendChild(end);
    }
  }

  function scheduleCompact() {
    if (compactScheduled) return;
    compactScheduled = true;
    requestAnimationFrame(compactStudy);
  }

  document.addEventListener('click', event => {
    const buildNext = event.target.closest?.('[data-action="next-phrase"]');
    if (buildNext && task()?.mode === 'build') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const currentVerse = verse();
      const phrases = currentVerse && typeof phraseSplit === 'function' ? phraseSplit(currentVerse.text) : [];
      const current = Number.isFinite(session?.exercise?.phraseIndex) ? session.exercise.phraseIndex : 0;
      if (current < phrases.length) {
        session.exercise.phraseIndex = current + 1;
        if (typeof renderStudy === 'function') renderStudy();
      }
      return;
    }

    const continueBuild = event.target.closest?.('[data-patch-action="continue-build"]');
    if (continueBuild && task()?.mode === 'build') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof completeCurrent === 'function') completeCurrent(2, 100, null, { assisted: true });
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const currentTask = task();
    if (!currentTask || currentTask.mode !== 'build') return;
    if (event.code !== 'Space' && event.key !== ' ') return;
    const active = document.activeElement;
    if (['INPUT','TEXTAREA','SELECT'].includes(active?.tagName)) return;

    const currentVerse = verse();
    const phrases = currentVerse && typeof phraseSplit === 'function' ? phraseSplit(currentVerse.text) : [];
    const current = Number.isFinite(session?.exercise?.phraseIndex) ? session.exercise.phraseIndex : 0;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (current < phrases.length) {
      session.exercise.phraseIndex = current + 1;
      if (typeof renderStudy === 'function') renderStudy();
    } else {
      document.querySelector('[data-patch-action="continue-build"]')?.focus({ preventScroll: true });
    }
  }, true);

  const root = document.getElementById('view-study');
  if (root) new MutationObserver(scheduleCompact).observe(root, { childList: true, subtree: true });
  scheduleCompact();
})();
