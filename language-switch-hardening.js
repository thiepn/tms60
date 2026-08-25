'use strict';
(() => {
  if (window.top === window || window.__TMS60_LANGUAGE_SWITCH_HARDENING__) return;
  window.__TMS60_LANGUAGE_SWITCH_HARDENING__ = '1.1.0';

  const KEY = 'tms60-ui-language-v1';
  const SUPPORTED = new Set(['en', 'de', 'ko']);
  let reloadScheduled = false;

  function settingsStorage() {
    try {
      if (window.top && window.top !== window && window.top.localStorage) return window.top.localStorage;
    } catch (_) {}
    return localStorage;
  }

  function storedLanguage() {
    try {
      const value = settingsStorage().getItem(KEY);
      return SUPPORTED.has(value) ? value : 'en';
    } catch (_) {
      return 'en';
    }
  }

  function saveLanguage(value) {
    try {
      settingsStorage().setItem(KEY, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function activeStudySession() {
    try {
      return typeof hasActiveSession === 'function' && hasActiveSession();
    } catch (_) {
      return false;
    }
  }

  function notifyActiveSession() {
    try {
      if (typeof toast === 'function') {
        toast('End the active study session before changing the app language.', 'error');
      }
    } catch (_) {}
  }

  function reloadShell() {
    if (reloadScheduled) return;
    reloadScheduled = true;
    setTimeout(() => {
      try {
        window.top.location.reload();
      } catch (_) {
        try { location.reload(); } catch (_) {}
      }
    }, 50);
  }

  window.addEventListener('change', event => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || select.id !== 'ui-language-select') return;

    const next = String(select.value || '');
    if (!SUPPORTED.has(next)) return;

    const previous = storedLanguage();
    if (next === previous) return;

    // Capture at window level so legacy document/target language handlers never
    // enter the unstable in-place multi-layer localization path.
    event.preventDefault();
    event.stopImmediatePropagation();

    if (activeStudySession()) {
      select.value = previous;
      notifyActiveSession();
      return;
    }

    if (!saveLanguage(next)) {
      select.value = previous;
      return;
    }

    document.documentElement.lang = next;
    reloadShell();
  }, true);
})();
