(() => {
  'use strict';

  const originalRenderStudy = renderStudy;
  const originalCompleteCurrent = completeCurrent;
  const originalAdvanceFlashcardReview = advanceFlashcardReview;

  function activeSessionTask() {
    try { return currentTask(); } catch (_) { return null; }
  }

  function activeSessionVerse() {
    try { return currentVerse(); } catch (_) { return null; }
  }

  function scrollSessionTop() {
    requestAnimationFrame(() => {
      const content = document.querySelector('.content');
      if (content) content.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }

  function addPatchStyles() {
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

  function hideBuildOpeningPhrase(root, task, verse) {
    if (task?.mode !== 'build' || !verse) return;
    const phrases = phraseSplit(verse.text);
    if (!phrases.length) return;

    if (!Number.isFinite(session.exercise.phraseIndex)) session.exercise.phraseIndex = 0;
    const shown = Math.max(0, Math.min(phrases.length, Number(session.exercise.phraseIndex) || 0));

    if (shown === 0) {
      root.querySelectorAll('.phrase').forEach(el => {
        el.classList.add('hidden-phrase');
        el.textContent = 'Hidden phrase';
      });
      const reveal = root.querySelector('[data-action="next-phrase"]');
      if (reveal) reveal.textContent = 'Reveal first phrase';
    }

    if (shown >= phrases.length) {
      root.querySelector('.rating-row')?.remove();
      const actionHost = root.querySelector('.phrase-list')?.nextElementSibling;
      if (actionHost && !root.querySelector('[data-patch-action="continue-build"]')) {
        actionHost.innerHTML = '<button class="btn primary" type="button" data-patch-action="continue-build">Continue</button>';
      }
      setTimeout(() => root.querySelector('[data-patch-action="continue-build"]')?.focus({ preventScroll: true }), 0);
    }
  }

  function compactActiveStudy() {
    addPatchStyles();
    const root = document.getElementById('view-study');
    const task = activeSessionTask();
    const verse = activeSessionVerse();
    if (!root || !task || !verse || !session?.tasks?.length || session.index >= session.tasks.length) return;

    // Remove the redundant multi-line session chrome. The lightweight QoL
    // session strip supplies the one safe line that remains.
    root.querySelector('.page-head')?.remove();
    root.querySelector('.study-toolbar')?.remove();
    root.querySelector('.study-meta')?.remove();
    root.querySelectorAll('.prompt-ref').forEach(el => el.remove());
    root.querySelectorAll('.prompt').forEach(el => el.classList.add('prompt-compact'));

    // Do not leak the reference answer anywhere during reference recall.
    if (task.mode === 'reference') {
      root.querySelectorAll('.queue-item').forEach(item => {
        const label = item.querySelectorAll('span')[1];
        if (label && label.textContent.trim() === verse.reference) label.textContent = 'Current verse';
      });
    }

    const referenceInput = root.querySelector('#reference-answer');
    if (referenceInput) referenceInput.removeAttribute('placeholder');

    hideBuildOpeningPhrase(root, task, verse);

    // Keep session exit available without occupying the top of the exercise.
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

  renderStudy = function (...args) {
    const result = originalRenderStudy.apply(this, args);
    compactActiveStudy();
    return result;
  };

  completeCurrent = function (...args) {
    const before = session?.index;
    const result = originalCompleteCurrent.apply(this, args);
    if (session?.index !== before || session?.summary) scrollSessionTop();
    return result;
  };

  advanceFlashcardReview = function (...args) {
    const before = session?.index;
    const result = originalAdvanceFlashcardReview.apply(this, args);
    if (session?.index !== before || session?.summary) scrollSessionTop();
    return result;
  };

  // Build mode now begins with every phrase hidden. Reveal exactly one phrase
  // per click/Space and continue without forcing a rating after acquisition.
  document.addEventListener('click', event => {
    const buildNext = event.target.closest?.('[data-action="next-phrase"]');
    if (buildNext && activeSessionTask()?.mode === 'build') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const verse = activeSessionVerse();
      const phrases = verse ? phraseSplit(verse.text) : [];
      const current = Number.isFinite(session.exercise.phraseIndex) ? session.exercise.phraseIndex : 0;
      if (current < phrases.length) {
        session.exercise.phraseIndex = current + 1;
        renderStudy();
      }
      return;
    }

    const continueBuild = event.target.closest?.('[data-patch-action="continue-build"]');
    if (continueBuild && activeSessionTask()?.mode === 'build') {
      event.preventDefault();
      event.stopImmediatePropagation();
      completeCurrent(2, 100, null, { assisted: true });
    }
  }, true);

  document.addEventListener('keydown', event => {
    const task = activeSessionTask();
    if (!task || !document.getElementById('view-study')?.classList.contains('active')) return;
    const active = document.activeElement;

    if ((event.code === 'Space' || event.key === ' ') && task.mode === 'build' && !['INPUT','TEXTAREA','SELECT'].includes(active?.tagName)) {
      const verse = activeSessionVerse();
      const phrases = verse ? phraseSplit(verse.text) : [];
      const current = Number.isFinite(session.exercise.phraseIndex) ? session.exercise.phraseIndex : 0;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (current < phrases.length) {
        session.exercise.phraseIndex = current + 1;
        renderStudy();
      } else {
        document.querySelector('[data-patch-action="continue-build"]')?.focus({ preventScroll: true });
      }
    }
  }, true);

  renderStudy();
})();
