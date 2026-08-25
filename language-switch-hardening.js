'use strict';
(() => {
  if (window.top === window || window.__TMS60_LANGUAGE_SWITCH_HARDENING__) return;
  window.__TMS60_LANGUAGE_SWITCH_HARDENING__ = '1.3.0';

  const KEY = 'tms60-ui-language-v1';
  const SUPPORTED = new Set(['en', 'de', 'ko']);

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

  window.addEventListener('change', event => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || select.id !== 'ui-language-select') return;

    const next = String(select.value || '');
    if (!SUPPORTED.has(next)) return;

    const previous = storedLanguage();
    if (next === previous) {
      queueMicrotask(syncSelectors);
      return;
    }

    if (activeStudySession()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      select.value = previous;
      notifyActiveSession();
      return;
    }

    if (!saveLanguage(next)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      select.value = previous;
      return;
    }

    // Persist before the document/target handlers run, then deliberately let the
    // normal event continue. The parent localization runtime owns DE/KO and can
    // translate this same document in place. Rebuilding the iframe here caused
    // the prior ready/unload race and is no longer necessary now that the legacy
    // iframe localizer is pinned to canonical English.
    document.documentElement.lang = next;
    queueMicrotask(syncSelectors);
    setTimeout(syncSelectors, 120);
  }, true);

  syncSelectors();
  const observer = new MutationObserver(() => queueMicrotask(syncSelectors));
  observer.observe(document.body, { childList: true, subtree: true });
})();
