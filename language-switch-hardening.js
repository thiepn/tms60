'use strict';
(() => {
  if (window.top === window || window.__TMS60_LANGUAGE_SWITCH_HARDENING__) return;
  window.__TMS60_LANGUAGE_SWITCH_HARDENING__ = '1.7.1';

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

  function requestParentLocalization() {
    // Parent localization layers already respond to inert document clicks. Use
    // BODY as the event target so the app's delegated click handler safely sees
    // an Element with closest(), while no button/action/view is activated.
    try {
      document.body?.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: false,
        view: window
      }));
    } catch (_) {}
  }

  function installIdempotentActiveNavigation() {
    if (window.__TMS60_IDEMPOTENT_ACTIVE_NAV__ || typeof switchView !== 'function') return;
    const coreSwitchView = switchView;
    window.__TMS60_IDEMPOTENT_ACTIVE_NAV__ = '1.0.1';
    switchView = function(view) {
      const current = document.documentElement.dataset.view;
      const activeView = current === view &&
        document.getElementById(`view-${view}`)?.classList.contains('active');

      // Study is stateful: starting a manual/smart/guided session often changes
      // session state first and then calls switchView('study') while Study is
      // already the active view. Suppressing that render leaves the chooser DOM
      // on screen and prevents the new exercise (including Cloze) from appearing.
      // Other same-view navigation can still use the idempotent fast path.
      if (activeView && view !== 'study') {
        try {
          const drawerWasOpen = document.getElementById('sidebar')?.classList.contains('open');
          if (typeof setSidebarOpen === 'function') setSidebarOpen(false, drawerWasOpen);
          const mobileScroller = matchMedia('(max-width:760px)').matches ? document.querySelector('.content') : null;
          if (mobileScroller) mobileScroller.scrollTo({ top: 0, behavior: 'auto' });
          else scrollTo({ top: 0, behavior: 'auto' });
        } catch (_) {}
        return;
      }
      return coreSwitchView(view);
    };
  }

  window.addEventListener('change', event => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || select.id !== 'ui-language-select') return;

    const next = String(select.value || '');
    if (!SUPPORTED.has(next)) return;

    const previous = storedLanguage();

    // App-language changes are parent-owned. Consume the original change during
    // capture so the legacy iframe listener never receives it.
    event.preventDefault();
    event.stopImmediatePropagation();

    if (activeStudySession()) {
      select.value = previous;
      notifyActiveSession();
      return;
    }

    if (next !== previous && !saveLanguage(next)) {
      select.value = previous;
      return;
    }

    document.documentElement.lang = next;
    syncSelectors();
    queueMicrotask(() => {
      requestParentLocalization();
      syncSelectors();
    });
    setTimeout(() => {
      requestParentLocalization();
      syncSelectors();
    }, 120);
  }, true);

  installIdempotentActiveNavigation();
  syncSelectors();
  const observer = new MutationObserver(() => queueMicrotask(syncSelectors));
  observer.observe(document.body, { childList: true, subtree: true });
})();
