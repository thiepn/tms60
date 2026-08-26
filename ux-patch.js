(() => {
  'use strict';

  const SHELL_THEME_KEY = 'tms60-global-theme-v1';
  const UI_LANGUAGE_KEY = 'tms60-ui-language-v1';
  const THEME_APPEARANCES = new Set(['light', 'dark']);
  const THEME_ACCENTS = new Set(['neutral', 'blue', 'green', 'red', 'purple', 'brown', 'orange', 'magenta']);
  const UI_LANGUAGES = [
    ['en', 'English'],
    ['de', 'Deutsch'],
    ['ko', '한국어']
  ];

  let lastTaskId = null;
  let compactScheduled = false;
  let settingsPatchScheduled = false;

  function task() {
    try { return typeof currentTask === 'function' ? currentTask() : null; } catch (_) { return null; }
  }

  function verse() {
    try { return typeof currentVerse === 'function' ? currentVerse() : null; } catch (_) { return null; }
  }

  function hasProtectedSession() {
    try {
      if (typeof hasActiveSession === 'function') return Boolean(hasActiveSession());
    } catch (_) {}
    try {
      return Boolean(task() && typeof session === 'object' && session?.tasks?.length && session.index < session.tasks.length);
    } catch (_) {
      return false;
    }
  }

  function shell() {
    try { return window.parent !== window ? window.parent : window; } catch (_) { return window; }
  }

  function versionDefinitions() {
    try {
      const defs = shell().TMSVersions?.list?.();
      return Array.isArray(defs) ? defs.filter(def => def?.available) : [];
    } catch (_) {
      return [];
    }
  }

  function activeVersionId() {
    try { return String(localStorage.getItem('tms60-active-translation-v1') || ''); } catch (_) { return ''; }
  }

  function storedUiLanguage() {
    try {
      const value = shell().localStorage?.getItem(UI_LANGUAGE_KEY);
      if (UI_LANGUAGES.some(([id]) => id === value)) return value;
    } catch (_) {}
    try {
      const value = localStorage.getItem(UI_LANGUAGE_KEY);
      if (UI_LANGUAGES.some(([id]) => id === value)) return value;
    } catch (_) {}
    return 'en';
  }

  function syncShellThemeFromApp(syncParent = false) {
    const appearance = document.documentElement.dataset.mode;
    const accent = document.documentElement.dataset.accent;
    if (!THEME_APPEARANCES.has(appearance) || !THEME_ACCENTS.has(accent)) return;

    try {
      localStorage.setItem(SHELL_THEME_KEY, JSON.stringify({ appearance, accent }));
    } catch (_) {}

    if (!syncParent || window.parent === window) return;
    try {
      const parentDoc = window.parent.document;
      const modeButton = parentDoc.querySelector(`[data-mode-choice="${appearance}"]`);
      const accentButton = parentDoc.querySelector(`[data-accent-choice="${accent}"]`);
      if (modeButton && !modeButton.classList.contains('active')) modeButton.click();
      if (accentButton && !accentButton.classList.contains('active')) accentButton.click();
    } catch (_) {}
  }

  function syncVersionSwitchLock() {
    const select = document.getElementById('shell-version-select');
    if (!select) return;
    const locked = hasProtectedSession();
    select.disabled = locked;
    select.dataset.sessionLocked = locked ? '1' : '0';
    if (locked) {
      const active = activeVersionId();
      if (active && select.value !== active) select.value = active;
    }
  }

  function returnToProtectedSession() {
    try {
      if (typeof switchView === 'function') switchView('study');
      else document.querySelector('[data-view="study"]')?.click();
    } catch (_) {}
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
      .translation-picker-grid{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:12px;align-items:end}
      .translation-license-note{position:static!important;inset:auto!important;z-index:auto!important;display:block!important;max-width:none!important;margin:12px 0 0!important;padding:10px 11px!important;border:1px solid var(--border)!important;border-radius:11px!important;background:var(--surface2)!important;color:var(--muted)!important;font:inherit!important;font-size:.72rem!important;line-height:1.45!important;pointer-events:auto!important;box-shadow:none!important}
      @media(max-width:760px){
        .prompt.prompt-compact{padding:5px 0 12px}
        #view-study .study-shell{gap:10px}
        #view-study .study-card{min-height:0}
        .translation-picker-grid{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function createLanguageField() {
    const field = document.createElement('div');
    field.className = 'field';
    field.dataset.patchLanguageField = '1';

    const label = document.createElement('label');
    label.htmlFor = 'ui-language-select';
    label.textContent = 'Interface language';

    const select = document.createElement('select');
    select.id = 'ui-language-select';
    const active = storedUiLanguage();
    for (const [id, name] of UI_LANGUAGES) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = name;
      option.selected = id === active;
      select.appendChild(option);
    }

    const help = document.createElement('div');
    help.className = 'help';
    help.textContent = 'The app language changes menus and instructions. Your Bible version is a separate setting.';
    field.append(label, select, help);
    return { field, select };
  }

  function patchTranslationSettings() {
    settingsPatchScheduled = false;
    addStyles();

    const card = document.querySelector('[data-shell-version-settings]');
    const copyright = document.getElementById('translation-copyright');

    if (copyright) {
      if (card) {
        copyright.hidden = true;
        let copy = card.querySelector('[data-translation-license-copy]');
        if (!copy) {
          copy = document.createElement('div');
          copy.dataset.translationLicenseCopy = '1';
          copy.className = 'translation-license-note';
          copy.setAttribute('role', 'note');
          copy.setAttribute('aria-label', 'Bible translation copyright');
          card.appendChild(copy);
        }
        if (copy.textContent !== copyright.textContent) copy.textContent = copyright.textContent;
      } else {
        copyright.hidden = false;
        copyright.classList.add('translation-license-note');
        copyright.removeAttribute('style');
      }
    }

    if (!card) return;
    const bibleSelect = card.querySelector('#shell-version-select');
    if (!bibleSelect) return;

    const defs = versionDefinitions();
    if (defs.length) {
      const currentId = activeVersionId() || bibleSelect.value;
      const previous = bibleSelect.value;
      const desiredSignature = defs.map(def => `${def.id}\u0000${def.name} (${def.short})`).join('\u0001');
      const existingSignature = [...bibleSelect.options].map(option => `${option.value}\u0000${option.textContent}`).join('\u0001');
      if (desiredSignature !== existingSignature) {
        bibleSelect.replaceChildren();
        for (const def of defs) {
          const option = document.createElement('option');
          option.value = def.id;
          option.textContent = `${def.name} (${def.short})`;
          bibleSelect.appendChild(option);
        }
      }
      if (defs.some(def => def.id === currentId)) bibleSelect.value = currentId;
      else if (defs.some(def => def.id === previous)) bibleSelect.value = previous;
      else if (defs[0]) bibleSelect.value = defs[0].id;
    }

    let languageSelect = card.querySelector('#ui-language-select') || document.querySelector('#ui-language-select');
    let languageField = languageSelect?.closest('.field') || null;
    let languageWrapper = languageSelect?.closest('[data-ui-language-settings]') || null;

    if (!languageSelect || !languageField) {
      const created = createLanguageField();
      languageField = created.field;
      languageSelect = created.select;
      languageWrapper = null;
    }

    const storedLanguage = storedUiLanguage();
    if (languageSelect.value !== storedLanguage) languageSelect.value = storedLanguage;

    let grid = card.querySelector('[data-patch-language-controls]');
    if (!grid) {
      const oldField = bibleSelect.closest('.field');
      if (!oldField) return;
      const originalHelp = oldField.querySelector('.help') || null;

      grid = document.createElement('div');
      grid.className = 'translation-picker-grid';
      grid.dataset.patchLanguageControls = '1';

      const bibleField = document.createElement('div');
      bibleField.className = 'field';
      bibleField.dataset.patchBibleField = '1';
      const bibleLabel = document.createElement('label');
      bibleLabel.htmlFor = 'shell-version-select';
      bibleLabel.textContent = 'Bible version';
      bibleField.append(bibleLabel, bibleSelect);

      oldField.replaceWith(grid);
      grid.append(languageField, bibleField);
      if (originalHelp) {
        originalHelp.style.marginTop = '8px';
        grid.after(originalHelp);
      }
    } else {
      if (languageField.parentElement !== grid) grid.prepend(languageField);
      const bibleField = bibleSelect.closest('.field');
      if (bibleField && bibleField.parentElement !== grid) grid.appendChild(bibleField);
    }

    card.dataset.languagePickerInstalled = '1';
    card.dataset.uiLanguageSettings = '1';

    if (languageWrapper && languageWrapper !== card && languageWrapper.isConnected && !languageWrapper.contains(languageSelect)) {
      languageWrapper.remove();
    } else if (languageWrapper && languageWrapper !== card && languageWrapper.isConnected && languageSelect.closest('[data-shell-version-settings]') === card) {
      languageWrapper.remove();
    }

    for (const duplicate of [...document.querySelectorAll('#ui-language-select')]) {
      if (duplicate === languageSelect) continue;
      const wrapper = duplicate.closest('[data-ui-language-settings]');
      if (wrapper && wrapper !== card) wrapper.remove();
      else duplicate.remove();
    }

    for (const wrapper of [...document.querySelectorAll('[data-ui-language-settings]')]) {
      if (wrapper === card) continue;
      if (!wrapper.contains(languageSelect)) wrapper.remove();
    }

    syncVersionSwitchLock();
  }

  function scheduleSettingsPatch() {
    if (settingsPatchScheduled) return;
    settingsPatchScheduled = true;
    requestAnimationFrame(patchTranslationSettings);
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
    syncVersionSwitchLock();

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

  document.addEventListener('change', event => {
    const bibleSelect = event.target?.closest?.('#shell-version-select');
    if (!bibleSelect || !hasProtectedSession()) return;
    const active = activeVersionId();
    if (!active || bibleSelect.value === active) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    bibleSelect.value = active;
    syncVersionSwitchLock();
    try {
      if (typeof toast === 'function') toast('End the active session before changing Bible version.', 'error');
    } catch (_) {}
    returnToProtectedSession();
  }, true);

  document.addEventListener('click', event => {
    const themeAction = event.target.closest?.('[data-action]')?.dataset.action;
    if (themeAction === 'toggle-appearance') {
      setTimeout(() => syncShellThemeFromApp(true), 0);
    } else if (themeAction === 'set-appearance' || themeAction === 'set-accent') {
      setTimeout(() => syncShellThemeFromApp(false), 0);
    }

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

  const studyRoot = document.getElementById('view-study');
  if (studyRoot) new MutationObserver(() => {
    scheduleCompact();
    syncVersionSwitchLock();
  }).observe(studyRoot, { childList: true, subtree: true });

  const settingsRoot = document.getElementById('view-settings');
  if (settingsRoot) new MutationObserver(scheduleSettingsPatch).observe(settingsRoot, { childList: true, subtree: true });

  scheduleCompact();
  scheduleSettingsPatch();
})();

/* P1-3: destructive resets must never execute while recall state is live. */
(() => {
  'use strict';

  const RESET_ACTIONS = new Set([
    'confirm-reset-progress',
    'confirm-reset-all',
    'reset-progress',
    'reset-all'
  ]);
  let resetLockScheduled = false;

  function activeSession() {
    try { return typeof hasActiveSession === 'function' && Boolean(hasActiveSession()); }
    catch (_) { return false; }
  }

  function returnToStudy() {
    try {
      if (typeof switchView === 'function') switchView('study');
      else document.querySelector('[data-view="study"]')?.click();
    } catch (_) {}
  }

  function syncResetLock() {
    resetLockScheduled = false;
    const locked = activeSession();
    const settings = document.getElementById('view-settings');
    if (!settings) return;

    for (const action of ['confirm-reset-progress', 'confirm-reset-all']) {
      const button = settings.querySelector(`[data-action="${action}"]`);
      if (!button) continue;
      button.disabled = locked;
      button.dataset.sessionLocked = locked ? '1' : '0';
      button.setAttribute('aria-disabled', locked ? 'true' : 'false');
    }

    const danger = settings.querySelector('.danger-zone');
    if (!danger) return;
    let note = danger.querySelector('[data-session-reset-lock]');
    if (locked) {
      if (!note) {
        note = document.createElement('p');
        note.className = 'tiny muted';
        note.dataset.sessionResetLock = '1';
        note.setAttribute('role', 'status');
        danger.appendChild(note);
      }
      note.textContent = 'End the active study session before resetting stored progress.';
    } else {
      note?.remove();
    }
  }

  function scheduleResetLock() {
    if (resetLockScheduled) return;
    resetLockScheduled = true;
    requestAnimationFrame(syncResetLock);
  }

  /* Defense in depth. app.html also has a general protected-session capture guard;
     this dedicated guard keeps P1-3 protected if that broader guard changes later. */
  document.addEventListener('click', event => {
    const action = event.target?.closest?.('[data-action]')?.dataset.action;
    if (!RESET_ACTIONS.has(action) || !activeSession()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      if (typeof closeModal === 'function' && document.querySelector('.modal')) closeModal(false);
      if (typeof toast === 'function') toast('End the active session before resetting stored progress.', 'error');
    } catch (_) {}
    returnToStudy();
    scheduleResetLock();
  }, true);

  const settingsRoot = document.getElementById('view-settings');
  if (settingsRoot) new MutationObserver(scheduleResetLock).observe(settingsRoot, { childList: true, subtree: true });
  const studyRoot = document.getElementById('view-study');
  if (studyRoot) new MutationObserver(scheduleResetLock).observe(studyRoot, { childList: true, subtree: true });

  window.__TMS60_P13_RESET_GUARD__ = '1.0.0';
  scheduleResetLock();
})();