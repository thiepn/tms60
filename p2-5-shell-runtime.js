/* P2-5 shell runtime: after the one cold iframe boot, Bible-version changes
 * fetch only the 60-verse dataset and hand it to the in-frame runtime bridge.
 */
'use strict';
(() => {
  if (window.__TMS60_P25_SHELL_RUNTIME__) return;
  const nativeActivateVersion = activateVersion;
  const stats = { runtimeSwitches: 0, runtimeFailures: 0, legacyFallbacks: 0, lastProbeBytes: 0, frameLoads: 0 };
  window.__TMS60_P25_SHELL_STATS__ = stats;

  function runtimeCopyright() {
    return String(frame.contentDocument?.getElementById('translation-copyright')?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function initializeRuntimeIdentity() {
    const runtime = frame.contentWindow?.TMSRuntimeTranslation;
    if (!runtime) return false;
    const def = getVersion(activeVersion);
    runtime.initialize({ id: activeVersion, short: def.short, name: def.name, saveKey: def.saveKey, copyright: runtimeCopyright() });
    return true;
  }

  function syncVersionControl() {
    const doc = frame.contentDocument;
    if (!doc) return;
    injectVersionSettings(doc);
    const select = doc.getElementById('shell-version-select');
    if (select) {
      select.value = activeVersion;
      if (select.dataset.sessionLocked !== '1') select.disabled = false;
    }
    relabelNeutral(doc);
  }

  function setBusy(busy) {
    const select = frame.contentDocument?.getElementById('shell-version-select');
    if (!select || select.dataset.sessionLocked === '1') return;
    select.disabled = Boolean(busy);
    select.dataset.versionLoading = busy ? '1' : '0';
  }

  frame.addEventListener('load', () => {
    stats.frameLoads++;
    // The shell's property onload handler updates activeVersion during the same
    // load event. Initialize on the next task so fallback boots get the final id.
    setTimeout(() => {
      try { initializeRuntimeIdentity(); } catch (error) { console.error(error); }
    }, 0);
  });

  activateVersion = async function activateVersionRuntime(id) {
    const target = getVersion(id);
    if (!target.available) {
      showNotice(`${target.name} is registered, but its authorized text source is still pending.`, 'error');
      injectVersionSettings(frame.contentDocument);
      return false;
    }
    if (id === activeVersion) {
      selectedVersion = id;
      syncChoices();
      syncVersionControl();
      return true;
    }

    const runtime = frame.contentWindow?.TMSRuntimeTranslation;
    const datasetSource = window.TMSRuntimeDatasetSource;
    if (!runtime?.switchDataset || !datasetSource?.loadDataset) {
      stats.legacyFallbacks++;
      return nativeActivateVersion(id);
    }

    const previous = activeVersion;
    const serial = ++loadSerial;
    setBusy(true);
    try {
      const dataset = await datasetSource.loadDataset(id);
      if (serial !== loadSerial) return false;
      stats.lastProbeBytes = Number(dataset.probeBytes || 0);

      // Set shell state first so the Settings bridge sees the target id while the
      // in-frame render replaces Settings. Persistence happens only after the
      // in-frame transaction succeeds.
      activeVersion = id;
      selectedVersion = id;
      runtime.switchDataset({
        id,
        short: target.short,
        name: target.name,
        saveKey: target.saveKey,
        verses: dataset.verses,
        copyright: dataset.copyright || ''
      });

      applySelectedTheme();
      saveActiveVersion(id);
      syncChoices();
      syncVersionControl();
      stats.runtimeSwitches++;
      showNotice(`Bible version changed to ${target.name}.`);
      return true;
    } catch (error) {
      console.error(error);
      activeVersion = previous;
      selectedVersion = previous;
      syncChoices();
      syncVersionControl();
      stats.runtimeFailures++;
      showNotice(`Could not load ${target.name}: ${error.message}`, 'error', 8000);
      return false;
    } finally {
      setBusy(false);
    }
  };

  // If the cold boot finished unusually quickly, initialize immediately as well.
  if (frame.classList.contains('ready')) {
    try { initializeRuntimeIdentity(); } catch (error) { console.error(error); }
  }

  window.__TMS60_P25_SHELL_RUNTIME__ = '1.0.0';
  window.__TMS60_P27_SHELL_IDENTITY__ = '1.0.0';
})();
