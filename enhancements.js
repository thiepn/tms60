'use strict';
(() => {
  const current = document.currentScript;
  const coreUrl = new URL('enhancements-core.js', current?.src || location.href).href;
  const topLevel = window.top === window;
  const FLAG = 'tms60-onboarding-v3';
  let needsUpgradeOnboarding = false;

  if (topLevel) {
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
  script.onload = () => {
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
  document.head.appendChild(script);
})();