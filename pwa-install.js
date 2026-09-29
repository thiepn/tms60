'use strict';
(() => {
  let deferredPrompt = null;
  let installButton = null;

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true;

  function setState(state) {
    document.documentElement.dataset.pwaState = state;
    window.dispatchEvent(new CustomEvent('tms60:pwa-state', { detail: { state } }));
  }

  function ensureInstallButton() {
    if (installButton || isStandalone() || !document.body) return installButton;
    installButton = document.createElement('button');
    installButton.type = 'button';
    installButton.id = 'pwa-install-button';
    installButton.className = 'pwa-install-button';
    installButton.textContent = 'Install app';
    installButton.setAttribute('aria-label', 'Install TMS 60 as an app');
    installButton.hidden = true;
    installButton.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      const prompt = deferredPrompt;
      deferredPrompt = null;
      installButton.disabled = true;
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice?.outcome === 'accepted') {
          setState('installing');
          installButton.hidden = true;
        } else {
          setState('browser');
          installButton.hidden = true;
        }
      } catch (error) {
        console.warn('TMS60 install prompt failed', error);
        setState('browser');
      } finally {
        installButton.disabled = false;
      }
    });
    document.body.appendChild(installButton);
    return installButton;
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    const button = ensureInstallButton();
    if (button) button.hidden = false;
    setState('installable');
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (installButton) installButton.remove();
    installButton = null;
    setState('installed');
  });

  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', event => {
    if (event.matches) {
      deferredPrompt = null;
      if (installButton) installButton.remove();
      installButton = null;
      setState('installed');
    }
  });

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) {
      setState(isStandalone() ? 'installed' : 'unsupported');
      return null;
    }
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './',
        updateViaCache: 'none'
      });
      await navigator.serviceWorker.ready;
      registration.update().catch(() => {});
      setState(isStandalone() ? 'installed' : (deferredPrompt ? 'installable' : 'browser'));
      return registration;
    } catch (error) {
      console.error('TMS60 service worker registration failed', error);
      setState('service-worker-error');
      return null;
    }
  }

  window.TMSPWA = {
    isStandalone,
    install: async () => {
      if (!deferredPrompt) return { available: false };
      const prompt = deferredPrompt;
      deferredPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      return { available: true, outcome: choice?.outcome || 'unknown' };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureInstallButton();
      setState(isStandalone() ? 'installed' : 'browser');
      registerServiceWorker();
    }, { once: true });
  } else {
    ensureInstallButton();
    setState(isStandalone() ? 'installed' : 'browser');
    registerServiceWorker();
  }
})();
