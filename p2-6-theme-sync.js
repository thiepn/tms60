/* P2-6: keep restored/imported app appearance synchronized with the shell theme.
 * The outer shell remains authoritative during cold boot and Bible-version swaps.
 * Once the current iframe document is ready, this watches only the two theme
 * attributes so non-click theme changes (backup replace / snapshot restore) can
 * promote their final appearance into the shared shell theme state.
 */
'use strict';
(() => {
  if (window.__TMS60_P26_THEME_SYNC__) return;

  const MARKER = '1.0.0';
  const APPEARANCE_SET = new Set(['light', 'dark']);
  const ACCENT_SET = new Set(['neutral', 'blue', 'green', 'red', 'purple', 'brown', 'orange', 'magenta']);
  const stats = { bindings: 0, mutationCallbacks: 0, syncs: 0, changes: 0 };
  let observedDocument = null;
  let observer = null;
  let syncQueued = false;

  function readTheme(doc) {
    const appearance = doc?.documentElement?.dataset?.mode || '';
    const accent = doc?.documentElement?.dataset?.accent || '';
    if (!APPEARANCE_SET.has(appearance) || !ACCENT_SET.has(accent)) return null;
    return { appearance, accent };
  }

  function syncFromApp() {
    syncQueued = false;
    const theme = readTheme(observedDocument);
    if (!theme || observedDocument !== frame.contentDocument) return false;

    const changed = selected.appearance !== theme.appearance || selected.accent !== theme.accent;
    selected = { ...theme };
    saveTheme();
    syncChoices();
    stats.syncs++;
    if (changed) stats.changes++;
    return changed;
  }

  function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    queueMicrotask(syncFromApp);
  }

  function bindCurrentDocument() {
    const doc = frame.contentDocument;
    if (!doc?.documentElement || doc === observedDocument) return Boolean(doc?.documentElement);

    observer?.disconnect();
    observedDocument = doc;
    syncQueued = false;
    observer = new MutationObserver(records => {
      if (!records.some(record => record.attributeName === 'data-mode' || record.attributeName === 'data-accent')) return;
      stats.mutationCallbacks++;
      scheduleSync();
    });
    observer.observe(doc.documentElement, {
      attributes: true,
      attributeFilter: ['data-mode', 'data-accent']
    });
    stats.bindings++;

    // Do not immediately copy the app theme into the shell here. loadVersion()
    // intentionally applies the already-saved global shell theme at cold boot.
    return true;
  }

  frame.addEventListener('load', () => setTimeout(bindCurrentDocument, 0));
  if (frame.classList.contains('ready')) setTimeout(bindCurrentDocument, 0);

  window.__TMS60_P26_THEME_SYNC_STATS__ = stats;
  window.__TMS60_P26_THEME_SYNC__ = MARKER;
})();
