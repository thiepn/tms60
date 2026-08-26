/* P2-5: lightweight in-place Bible translation switching.
 * app.html is made runtime-capable by the outer shell before its one cold boot:
 * the VERSES array remains mutable and KEY/SNAP_KEY become mutable bindings.
 * This bridge then swaps only the 60-verse dataset and translation-specific state,
 * without navigating or replacing the application iframe.
 */
'use strict';
(() => {
  if (window.__TMS60_P25_RUNTIME_TRANSLATION__) return;

  const MARKER = '1.0.1';
  const volatileStates = new Map();
  let currentMeta = {
    id: '',
    short: String(document.querySelector('.brand-sub')?.textContent || '').replace(/^Exact\s+|\s+recall$/g, '') || 'ESV',
    saveKey: typeof KEY === 'string' ? KEY : '',
    copyright: String(document.getElementById('translation-copyright')?.textContent || '').trim()
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeMeta(meta = {}) {
    const id = String(meta.id || '').trim();
    const short = String(meta.short || '').trim();
    const saveKey = String(meta.saveKey || '').trim();
    const copyright = String(meta.copyright || '').replace(/\s+/g, ' ').trim();
    if (!id || !short || !saveKey) throw new Error('Translation metadata is incomplete.');
    return { id, short, saveKey, copyright };
  }

  function normalizeVerses(verses) {
    if (!Array.isArray(verses) || verses.length !== 60) throw new Error('Translation dataset must contain exactly 60 verses.');
    const seen = new Set();
    const normalized = verses.map((raw, index) => {
      const id = Number(raw?.id);
      const reference = String(raw?.reference || '').trim();
      const text = String(raw?.text || '').replace(/\s+/g, ' ').trim();
      const pack = String(raw?.pack || '').trim();
      if (!Number.isInteger(id) || id !== index + 1 || seen.has(id) || !reference || !text || !/^[A-E]$/.test(pack)) {
        throw new Error(`Translation dataset is invalid at verse ${index + 1}.`);
      }
      seen.add(id);
      return Object.freeze({
        ...raw,
        id,
        reference,
        text,
        pack
      });
    });
    return normalized;
  }

  function setCopyright(text) {
    document.getElementById('translation-copyright')?.remove();
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return;
    const notice = document.createElement('div');
    notice.id = 'translation-copyright';
    notice.style.cssText = 'position:fixed;z-index:40;right:10px;bottom:10px;max-width:min(640px,calc(100vw - 20px));padding:6px 9px;border-radius:8px;background:rgba(9,10,12,.92);color:#aeb5c0;border:1px solid rgba(255,255,255,.10);font:10px/1.35 Inter,system-ui,sans-serif;pointer-events:none';
    notice.textContent = value;
    document.body.appendChild(notice);
  }

  function setVisibleTranslationMeta(meta) {
    const brand = document.querySelector('.brand-sub');
    if (brand) brand.textContent = `Exact ${meta.short} recall`;
    document.documentElement.dataset.bibleVersion = meta.id;
    setCopyright(meta.copyright);
  }

  function requestParentLocalization() {
    // Localization is deliberately parent-owned. The iframe storage guard makes
    // the legacy in-frame localization layer see English, so a runtime render
    // must explicitly wake the parent incremental localizer after it recreates
    // source-language UI text. This inert BODY click is the same safe mechanism
    // used by language-switch-hardening.js and activates no navigation/action.
    try {
      document.body?.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: false,
        view: window
      }));
    } catch (_) {}
  }

  function scheduleParentLocalization() {
    queueMicrotask(requestParentLocalization);
    requestAnimationFrame(requestParentLocalization);
    setTimeout(requestParentLocalization, 120);
  }

  function persistentRawExists(key) {
    try { return localStorage.getItem(key) != null; } catch (_) { return false; }
  }

  function preserveCurrentState() {
    try { volatileStates.set(KEY, clone(state)); } catch (_) {}
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!storageWriteBlocked) {
      try { rawSet(JSON.stringify(state)); } catch (_) {}
    }
  }

  function resetEphemeralState() {
    window.speechSynthesis?.cancel?.();
    clearTimeout(saveTimer);
    saveTimer = null;
    clearTimeout(libraryFilterTimer);
    libraryFilterTimer = null;
    libraryComposing = false;
    session = emptySession();
    completionLocked = false;
    suppressNextAutoSnapshot = false;
    pendingImport = null;
    pendingSnapshots = [];
    libraryOpen.clear();
    libraryFilters = { search: '', pack: 'all', status: 'all' };
    studyPickerVerseId = 1;
    studyPickerMode = 'path';
    memoryRaw = null;
    lastStorageError = null;
    closeModal(false);
  }

  function restoreVolatileStateIfNeeded() {
    if (persistentRawExists(KEY) || !volatileStates.has(KEY)) return;
    try {
      state = sanitizeState(volatileStates.get(KEY));
      applyTheme();
    } catch (_) {}
  }

  function renderForView(view) {
    renderAll();
    const target = titles[view] ? view : 'home';
    switchView(target);
    updateSaveStatus(storageWriteBlocked ? (storageBlockMessage || 'Read-only: stored data preserved') : storageAvailable ? 'Saved locally' : 'Session-only: browser storage unavailable');
  }

  function initialize(meta) {
    currentMeta = normalizeMeta(meta);
    setVisibleTranslationMeta(currentMeta);
    window.__TMS60_ACTIVE_TRANSLATION__ = Object.freeze({ ...currentMeta });
    scheduleParentLocalization();
    return inspect();
  }

  function switchDataset(payload) {
    if (hasActiveSession()) throw new Error('End the active study session before changing Bible versions.');
    const nextMeta = normalizeMeta(payload);
    const nextVerses = normalizeVerses(payload?.verses);
    const previousView = document.documentElement.dataset.view || 'home';
    const previous = {
      meta: { ...currentMeta },
      key: KEY,
      snapKey: SNAP_KEY,
      verses: [...VERSES],
      state: clone(state),
      storageAvailable,
      storageWriteBlocked,
      storageBlockMessage,
      memoryRaw,
      lastStorageError
    };

    preserveCurrentState();
    try {
      resetEphemeralState();
      VERSES.splice(0, VERSES.length, ...nextVerses);
      KEY = nextMeta.saveKey;
      SNAP_KEY = KEY + '-snapshots';
      currentMeta = nextMeta;
      load();
      restoreVolatileStateIfNeeded();
      setVisibleTranslationMeta(currentMeta);
      renderForView(previousView);
      setVisibleTranslationMeta(currentMeta);
      window.__TMS60_ACTIVE_TRANSLATION__ = Object.freeze({ ...currentMeta });
      document.dispatchEvent(new CustomEvent('tms60:translation-switched', { detail: { id: currentMeta.id, short: currentMeta.short } }));
      scheduleParentLocalization();
      return inspect();
    } catch (error) {
      VERSES.splice(0, VERSES.length, ...previous.verses);
      KEY = previous.key;
      SNAP_KEY = previous.snapKey;
      state = previous.state;
      storageAvailable = previous.storageAvailable;
      storageWriteBlocked = previous.storageWriteBlocked;
      storageBlockMessage = previous.storageBlockMessage;
      memoryRaw = previous.memoryRaw;
      lastStorageError = previous.lastStorageError;
      currentMeta = previous.meta;
      applyTheme();
      renderForView(previousView);
      setVisibleTranslationMeta(currentMeta);
      window.__TMS60_ACTIVE_TRANSLATION__ = Object.freeze({ ...currentMeta });
      scheduleParentLocalization();
      throw error;
    }
  }

  function inspect() {
    return {
      marker: MARKER,
      id: currentMeta.id,
      short: currentMeta.short,
      saveKey: KEY,
      verseCount: VERSES.length,
      firstReference: VERSES[0]?.reference || '',
      firstText: VERSES[0]?.text || '',
      activeSession: hasActiveSession(),
      view: document.documentElement.dataset.view || 'home'
    };
  }

  // Keep backup identity aligned with an in-place translation switch. The cold
  // boot source still receives its historical string substitution, while runtime
  // switches no longer need to rebuild that source just to update this metadata.
  const nativeExportJSON = exportJSON;
  exportJSON = function exportRuntimeTranslationJSON() {
    if (storageWriteBlocked) return nativeExportJSON();
    const payload = {
      ...state,
      verseDataset: VERSES.map(v => ({ id: v.id, reference: v.reference, text: v.text, pack: v.pack, packName: v.packName, positionInPack: v.positionInPack, scheduledDate: v.scheduledDate })),
      exportedAt: new Date().toISOString(),
      application: `TMS 60 ${currentMeta.short} Memory Lab`
    };
    download(`tms60-backup-${localDayKey()}.json`, JSON.stringify(payload, null, 2));
    toast('Progress backup exported.');
  };

  window.TMSRuntimeTranslation = Object.freeze({ initialize, switchDataset, inspect });
  window.__TMS60_P25_RUNTIME_TRANSLATION__ = MARKER;
})();
