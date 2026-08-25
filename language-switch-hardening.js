'use strict';
(() => {
  if (window.top === window || window.__TMS60_LANGUAGE_SWITCH_HARDENING__) return;
  window.__TMS60_LANGUAGE_SWITCH_HARDENING__ = '1.2.0';

  const KEY = 'tms60-ui-language-v1';
  const VERSION_KEY = 'tms60-active-translation-v1';
  const SUPPORTED = new Set(['en', 'de', 'ko']);
  let rebuildScheduled = false;

  function topStorage() {
    try {
      if (window.top && window.top !== window && window.top.localStorage) return window.top.localStorage;
    } catch (_) {}
    return null;
  }

  function storedLanguage() {
    try {
      const store = topStorage();
      const value = store ? store.getItem(KEY) : null;
      return SUPPORTED.has(value) ? value : 'en';
    } catch (_) {
      return 'en';
    }
  }

  function saveLanguage(value) {
    try {
      const store = topStorage();
      if (!store) return false;
      store.setItem(KEY, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function syncSelectors() {
    const lang = storedLanguage();
    document.querySelectorAll('#ui-language-select').forEach(select => {
      if (select instanceof HTMLSelectElement && select.value !== lang) select.value = lang;
    });
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

  function rebuildApp() {
    if (rebuildScheduled) return;
    rebuildScheduled = true;
    setTimeout(async () => {
      try {
        const topWindow = window.top;
        const store = topStorage();
        const fallbackVersion = store?.getItem(VERSION_KEY) || 'esv';
        const version = typeof topWindow.readActiveVersion === 'function'
          ? topWindow.readActiveVersion()
          : fallbackVersion;
        if (typeof topWindow.loadVersion === 'function') {
          await topWindow.loadVersion(version);
          return;
        }
        topWindow.location.reload();
      } catch (_) {
        try { window.top.location.reload(); } catch (_) {}
      }
    }, 40);
  }

  window.addEventListener('change', event => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || select.id !== 'ui-language-select') return;

    const next = String(select.value || '');
    if (!SUPPORTED.has(next)) return;

    const previous = storedLanguage();
    if (next === previous) {
      syncSelectors();
      return;
    }

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
    rebuildApp();
  }, true);

  syncSelectors();
  const observer = new MutationObserver(() => queueMicrotask(syncSelectors));
  observer.observe(document.body, { childList: true, subtree: true });
})();
