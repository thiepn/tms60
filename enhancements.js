'use strict';
(() => {
  const current = document.currentScript;
  const BUILD = '20260825a';
  const assetUrl = name => {
    const url = new URL(name, current?.src || location.href);
    url.searchParams.set('v', BUILD);
    return url.href;
  };
  const coreUrl = assetUrl('enhancements-core.js');
  const runtimeUrl = assetUrl('localization-runtime.js');
  const completionUrl = assetUrl('localization-completion.js');
  const topLevel = window.top === window;
  const FLAG = 'tms60-onboarding-v3';
  let needsUpgradeOnboarding = false;
  let settingsLayoutDoc = null;
  let settingsLayoutScheduled = false;

  function organizeSettingsPreferences() {
    settingsLayoutScheduled = false;
    if (!topLevel) return;
    const frame = document.getElementById('app-frame');
    const doc = frame?.contentDocument;
    const settings = doc?.getElementById('view-settings');
    const grid = settings?.querySelector('.settings-grid');
    if (!doc || !grid) return;

    const languageCard = doc.getElementById('ui-language-settings-card') || doc.querySelector('[data-ui-language-settings]');
    const versionCard = doc.querySelector('[data-shell-version-settings]');
    if (!languageCard || !versionCard) return;

    let style = doc.getElementById('settings-language-version-style');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'settings-language-version-style';
      style.textContent = '#settings-language-version-row{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}#settings-language-version-row>.card{height:100%;margin:0}@media(max-width:760px){#settings-language-version-row{grid-template-columns:1fr}}';
      doc.head.appendChild(style);
    }

    let row = doc.getElementById('settings-language-version-row');
    if (!row) {
      row = doc.createElement('div');
      row.id = 'settings-language-version-row';
      grid.prepend(row);
    } else if (row.parentElement !== grid) {
      grid.prepend(row);
    }

    if (languageCard.parentElement !== row) row.appendChild(languageCard);
    if (versionCard.parentElement !== row) row.appendChild(versionCard);
  }

  function scheduleSettingsPreferences() {
    if (settingsLayoutScheduled) return;
    settingsLayoutScheduled = true;
    setTimeout(organizeSettingsPreferences, 20);
    setTimeout(organizeSettingsPreferences, 120);
  }

  function bindSettingsPreferences() {
    if (!topLevel) return;
    const frame = document.getElementById('app-frame');
    const doc = frame?.contentDocument;
    if (!doc?.body) return;
    if (settingsLayoutDoc !== doc) {
      settingsLayoutDoc = doc;
      doc.addEventListener('click', scheduleSettingsPreferences, false);
      doc.addEventListener('change', scheduleSettingsPreferences, false);
    }
    scheduleSettingsPreferences();
  }

  if (topLevel) {
    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      const touchIcon = document.createElement('link');
      touchIcon.rel = 'apple-touch-icon';
      touchIcon.href = new URL('icon-192.png', current?.src || location.href).href;
      document.head.appendChild(touchIcon);
    }
    try {
      needsUpgradeOnboarding = localStorage.getItem(FLAG) !== '1';
      if (needsUpgradeOnboarding) localStorage.removeItem('tms60-onboarding-v2');
    } catch (_) {}

    const frame = document.getElementById('app-frame');
    if (frame) frame.addEventListener('load', () => setTimeout(bindSettingsPreferences, 0));

    const bindCompletion = () => {
      const onboarding = document.getElementById('onboarding');
      if (!onboarding) return;
      const markIfCompleted = () => {
        try {
          if (onboarding.classList.contains('hidden') && localStorage.getItem('tms60-onboarding-v2') === '1') {
            localStorage.setItem(FLAG, '1');
          }
        } catch (_) {}
      };
      new MutationObserver(markIfCompleted).observe(onboarding, { attributes: true, attributeFilter: ['class'] });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindCompletion, { once: true });
    else bindCompletion();
  }

  function loadLocalizationCompletion() {
    if (!topLevel || document.querySelector('script[data-tms-localization-completion]')) return;
    const completion = document.createElement('script');
    completion.src = completionUrl;
    completion.dataset.tmsLocalizationCompletion = '1';
    completion.async = false;
    completion.onload = () => {
      bindSettingsPreferences();
      scheduleSettingsPreferences();
    };
    completion.onerror = () => console.error('TMS 60 localization completion layer failed to load.');
    document.head.appendChild(completion);
  }

  function loadLocalizationRuntime() {
    if (!topLevel || document.querySelector('script[data-tms-localization-runtime]')) return;
    const runtime = document.createElement('script');
    runtime.src = runtimeUrl;
    runtime.dataset.tmsLocalizationRuntime = '1';
    runtime.async = false;
    runtime.onload = loadLocalizationCompletion;
    runtime.onerror = () => console.error('TMS 60 localization runtime failed to load.');
    document.head.appendChild(runtime);
  }

  const NativeMutationObserver = window.MutationObserver;
  if (!topLevel && NativeMutationObserver) {
    window.MutationObserver = class {
      observe() {}
      disconnect() {}
      takeRecords() { return []; }
    };
  }

  const script = document.createElement('script');
  script.src = coreUrl;
  script.dataset.tmsVnextCore = '1';
  script.async = false;
  script.onload = () => {
    if (!topLevel && NativeMutationObserver) window.MutationObserver = NativeMutationObserver;
    if (topLevel) {
      loadLocalizationRuntime();
      bindSettingsPreferences();
    }
    if (!topLevel || !needsUpgradeOnboarding) return;
    const frame = document.getElementById('app-frame');
    const show = () => {
      if (frame && !frame.classList.contains('ready')) return false;
      if (typeof window.openOnboarding !== 'function') return false;
      window.openOnboarding();
      return true;
    };
    if (show() || !frame) return;
    const observer = new MutationObserver(() => {
      if (show()) observer.disconnect();
    });
    observer.observe(frame, { attributes: true, attributeFilter: ['class'] });
  };
  script.onerror = () => {
    if (!topLevel && NativeMutationObserver) window.MutationObserver = NativeMutationObserver;
    console.error('TMS 60 experience layer failed to load.');
  };
  document.head.appendChild(script);
})();