'use strict';
(() => {
  const current = document.currentScript;
  const BUILD = '20260825-stability2';
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

    const languageCard = doc.getElementById('ui-language-settings-card');
    const versionCard = doc.querySelector('[data-shell-version-settings]');
    if (!languageCard || !versionCard) return;

    doc.querySelectorAll('[data-ui-language-settings]').forEach(card => {
      if (card !== languageCard) card.remove();
    });
    languageCard.dataset.uiLanguageSettings = '1';

    const oldRow = doc.getElementById('settings-language-version-row');
    if (oldRow) {
      if (languageCard.parentElement === oldRow) grid.prepend(languageCard);
      if (versionCard.parentElement === oldRow) grid.prepend(versionCard);
      oldRow.remove();
    }

    let style = doc.getElementById('settings-language-version-style');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'settings-language-version-style';
      style.textContent = [
        '#view-settings .settings-grid>#ui-language-settings-card{grid-column:1!important;grid-row:1!important;min-width:0;margin:0}',
        '#view-settings .settings-grid>[data-shell-version-settings]{grid-column:2!important;grid-row:1!important;min-width:0;margin:0}',
        '#view-settings .settings-grid>#ui-language-settings-card select,#view-settings .settings-grid>[data-shell-version-settings] select{width:100%;min-width:0}',
        '@media(max-width:900px){#view-settings .settings-grid>#ui-language-settings-card,#view-settings .settings-grid>[data-shell-version-settings]{grid-column:1/-1!important;grid-row:auto!important;width:100%;min-width:0}}',
        '@media(max-width:560px){#view-settings .settings-grid>#ui-language-settings-card,#view-settings .settings-grid>[data-shell-version-settings]{padding:14px}#view-settings .settings-grid>#ui-language-settings-card h2,#view-settings .settings-grid>[data-shell-version-settings] h2{font-size:1rem}}'
      ].join('');
      doc.head.appendChild(style);
    }

    if (languageCard.parentElement !== grid) grid.prepend(languageCard);
    if (versionCard.parentElement !== grid) grid.insertBefore(versionCard, languageCard.nextSibling);
    else if (versionCard.previousElementSibling !== languageCard) grid.insertBefore(versionCard, languageCard.nextSibling);

    languageCard.style.gridColumn = '1';
    languageCard.style.gridRow = '1';
    versionCard.style.gridColumn = '2';
    versionCard.style.gridRow = '1';
  }

  function scheduleSettingsPreferences() {
    if (settingsLayoutScheduled) return;
    settingsLayoutScheduled = true;
    setTimeout(organizeSettingsPreferences, 40);
    setTimeout(organizeSettingsPreferences, 160);
    setTimeout(organizeSettingsPreferences, 320);
  }

  function bindSettingsPreferences() {
    if (!topLevel) return;
    const frame = document.getElementById('app-frame');
    const doc = frame?.contentDocument;
    if (!doc?.body) return;
    if (settingsLayoutDoc !== doc) {
      settingsLayoutDoc = doc;
      doc.addEventListener('click', event => {
        if (event.target?.closest?.('[data-view="settings"]')) scheduleSettingsPreferences();
      }, false);
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