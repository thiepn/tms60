'use strict';
(() => {
  const current = document.currentScript;
  const BUILD = '20260824i';
  const assetUrl = name => {
    const url = new URL(name, current?.src || location.href);
    url.searchParams.set('v', BUILD);
    return url.href;
  };
  const coreUrl = assetUrl('enhancements-core.js');
  const safeLocalizationUrl = assetUrl('localization-safe.js');
  const topLevel = window.top === window;
  const FLAG = 'tms60-onboarding-v3';
  let needsUpgradeOnboarding = false;

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

  const script = document.createElement('script');
  script.src = coreUrl;
  script.dataset.tmsVnextCore = '1';
  script.async = false;
  script.onload = () => {
    if (!topLevel) {
      document.querySelectorAll('script[data-tms-safe-i18n]').forEach(node => node.remove());
      const i18n = document.createElement('script');
      i18n.src = safeLocalizationUrl;
      i18n.dataset.tmsSafeI18n = '1';
      i18n.async = false;
      i18n.onload = () => {
        document.documentElement.dataset.tmsSafeI18n = 'loaded';
        window.dispatchEvent(new Event('tms-safe-i18n-ready'));
      };
      i18n.onerror = () => {
        document.documentElement.dataset.tmsSafeI18n = 'error';
        console.error('TMS 60 localization completion layer failed to load.');
      };
      document.head.appendChild(i18n);
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
  script.onerror = () => console.error('TMS 60 experience layer failed to load.');
  document.head.appendChild(script);
})();