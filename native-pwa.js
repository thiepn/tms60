/* Native PWA companion for the existing local-first TMS60 app.
 * Never touches verse data, review scheduling, backups, or cloud account state.
 */
'use strict';
(() => {
  if (window.__TMS60_NATIVE_PWA__) return;
  window.__TMS60_NATIVE_PWA__ = '1.0.0';

  const frame = document.getElementById('app-frame');
  const AWAKE_KEY = 'tms60-study-screen-awake-v1';
  const VIEWS = new Set(['home', 'study', 'library', 'progress', 'settings']);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let observedDoc = null;
  let settingsObserver = null;
  let viewObserver = null;
  let screenLock = null;
  let requestingLock = false;
  let restoringHistory = false;
  let hadController = Boolean(navigator.serviceWorker?.controller);
  let updatedController = false;
  let updateWaiting = false;
  let messageSerial = 0;
  let busy = false;
  let launcherShortcutHandled = false;

  function currentView() {
    const view = frame.contentDocument?.documentElement?.dataset.view;
    return VIEWS.has(view) ? view : 'home';
  }

  function readAwakePreference() {
    try { return localStorage.getItem(AWAKE_KEY) === '1'; } catch (_) { return false; }
  }

  function saveAwakePreference(enabled) {
    try { localStorage.setItem(AWAKE_KEY, enabled ? '1' : '0'); } catch (_) {}
  }

  async function synchronizeWakeLock() {
    const wanted = readAwakePreference() &&
      document.visibilityState === 'visible' && currentView() === 'study';
    if (!wanted) {
      if (screenLock) {
        const active = screenLock;
        screenLock = null;
        try { await active.release(); } catch (_) {}
      }
      return;
    }
    if (!('wakeLock' in navigator) || screenLock || requestingLock) return;
    requestingLock = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!readAwakePreference() || document.visibilityState !== 'visible' || currentView() !== 'study') {
        await lock.release();
      } else {
        screenLock = lock;
        lock.addEventListener('release', () => {
          if (screenLock === lock) screenLock = null;
        });
      }
    } catch (_) {
      // Unsupported or denied by the browser/device. The study session continues normally.
    } finally {
      requestingLock = false;
      updateAwakeControl();
    }
  }

  function getCard() { return observedDoc?.getElementById('native-pwa-card'); }

  function updateAwakeControl() {
    const card = getCard();
    if (!card) return;
    const checkbox = card.querySelector('#native-pwa-awake');
    const help = card.querySelector('#native-pwa-awake-help');
    if (checkbox) {
      checkbox.checked = readAwakePreference();
      checkbox.disabled = !('wakeLock' in navigator);
    }
    if (help) help.textContent = !('wakeLock' in navigator)
      ? 'Screen wake lock is not supported by this browser.'
      : 'Optional. Keeps the display on only while Study is open and the app is visible. May use more battery.';
  }

  function say(message, error) {
    const element = getCard()?.querySelector('#native-pwa-status');
    if (!element) return;
    element.textContent = message;
    element.setAttribute('data-error', error ? '1' : '0');
  }

  function setBusy(value) {
    busy = Boolean(value);
    const card = getCard();
    if (!card) return;
    for (const button of card.querySelectorAll('[data-native-pwa-action]')) button.disabled = busy;
  }

  function installGuidance() {
    if (standalone()) return 'Installed display mode is active: TMS60 opens in its own app window.';
    if (isIOS) return 'In Safari, use Share → Add to Home Screen → Add. Open the new icon to launch the app.';
    if (/Android/i.test(navigator.userAgent))
      return 'In Chrome, open the browser menu (⋮) → Install app or Add to Home screen. Choose Install when offered.';
    return 'Use your browser’s Install app control in the address bar or browser menu, when available.';
  }

  async function requestWorker(type) {
    if (!isSecureContext || !('serviceWorker' in navigator) || !('MessageChannel' in window))
      throw new Error('Offline installation needs HTTPS and service-worker support.');
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker is not ready. Reload online and retry.')), 7000))
    ]);
    const worker = navigator.serviceWorker.controller || reg.active;
    if (!worker) throw new Error('Service worker is not active. Reload online and retry.');
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => {
        channel.port1.close();
        reject(new Error('Offline cache did not respond.'));
      }, 12000);
      channel.port1.onmessage = event => {
        clearTimeout(timer);
        channel.port1.close();
        const result = event.data;
        if (!result || result.ok !== true) reject(new Error(result?.error || 'Offline check failed.'));
        else resolve(result);
      };
      try { worker.postMessage({ type }, [channel.port2]); }
      catch (error) { clearTimeout(timer); channel.port1.close(); reject(error); }
    });
  }

  async function refreshOfflineStatus() {
    const serial = ++messageSerial;
    if (!getCard() || busy) return;
    if (!isSecureContext || !('serviceWorker' in navigator)) {
      say('Offline installation is unavailable in this browser or insecure context.', true);
      return;
    }
    try {
      const result = await requestWorker('TMS60_OFFLINE_STATUS');
      if (serial !== messageSerial) return;
      const network = navigator.onLine ? 'Online' : 'Offline';
      const update = updateWaiting ? ' · Update pending; close all TMS60 windows to apply.' :
        (updatedController ? ' · App version changed since opening; reopen after studying.' : '');
      if (result.ready) {
        say(network + ' · Offline bundle ready (' + result.cached + '/' + result.total +
          ' files). Bundled ESV practice can run without internet.' + update);
      } else {
        say(network + ' · ' + result.cached + '/' + result.total +
          ' files cached. Use Prepare offline access to complete installation.' + update, true);
      }
    } catch (error) {
      if (serial === messageSerial) say(error.message, true);
    }
  }

  async function prepareOffline() {
    ++messageSerial;
    setBusy(true);
    say('Preparing offline study files…');
    try {
      const result = await requestWorker('TMS60_PREPARE_OFFLINE');
      if (result.ready) {
        say('Offline bundle ready (' + result.cached + '/' + result.total +
          ' files). Existing verse progress remains saved locally.');
      } else {
        say(result.cached + '/' + result.total +
          ' files cached; ' + result.missing.length +
          ' unavailable. Connect to the internet and retry. Previously cached files are preserved.', true);
      }
    } catch (error) {
      say(error.message, true);
    } finally { setBusy(false); }
  }

  async function checkUpdates() {
    setBusy(true);
    try {
      if (!('serviceWorker' in navigator)) throw new Error('Service workers are unsupported.');
      const reg = await navigator.serviceWorker.getRegistration('/');
      if (!reg) throw new Error('Install the offline app first by reloading TMS60 online.');
      await reg.update();
      // An update is deliberately left waiting instead of taking over active recall.
      const installing=reg.installing;
      if(installing && !reg.waiting) {
        await Promise.race([
          new Promise(resolve=>{
            if(['installed','activated','redundant'].includes(installing.state))return resolve();
            const onState=()=>{
              if(['installed','activated','redundant'].includes(installing.state)){
                installing.removeEventListener('statechange',onState);
                resolve();
              }
            };
            installing.addEventListener('statechange',onState);
          }),
          new Promise(resolve=>setTimeout(resolve,3000))
        ]);
      }
      updateWaiting=Boolean(reg.waiting);
      say(updateWaiting
        ? 'Update downloaded and waiting safely. Finish studying, then close every TMS60 window and reopen the installed app.'
        : installing && !['installed','redundant','activated'].includes(installing.state)
          ? 'Update download is still in progress. Check again shortly; current study is uninterrupted.'
          : 'Update check completed. Your current study session was not interrupted.');
    } catch (error) { say('Update check failed: ' + error.message, true); }
    finally { setBusy(false); }
  }

  function attachSettingsCard() {
    const doc = observedDoc;
    if (!doc || doc !== frame.contentDocument || doc.getElementById('native-pwa-card')) return;
    const stack = doc.querySelector('#view-settings .settings-grid .stack:last-child') ||
      doc.getElementById('view-settings');
    if (!stack) return;
    const card = doc.createElement('article');
    card.className = 'card flat';
    card.id = 'native-pwa-card';
    card.innerHTML =
      '<h2>Installed app & offline access</h2>' +
      '<p class="muted" id="native-pwa-install-help"></p>' +
      '<p class="muted" id="native-pwa-status" role="status" aria-live="polite">Checking offline files…</p>' +
      '<div class="actions" style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0">' +
      '<button class="btn" type="button" data-native-pwa-action="prepare">Prepare offline access</button>' +
      '<button class="btn" type="button" data-native-pwa-action="updates">Check for updates</button>' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:10px;margin-top:12px">' +
      '<input type="checkbox" id="native-pwa-awake"> Keep screen awake while studying' +
      '</label><p class="muted" id="native-pwa-awake-help"></p>' +
      '<p class="muted" style="margin-top:10px">Your progress and backups are stored separately from the app cache. ' +
      'Installing or updating the PWA does not transfer progress between devices. ' +
      'Non-ESV translations may need an initial online download.</p>';
    stack.appendChild(card);
    card.querySelector('#native-pwa-install-help').textContent = installGuidance();
    card.addEventListener('click', event => {
      const action = event.target.closest('[data-native-pwa-action]')?.dataset.nativePwaAction;
      if (action === 'prepare') void prepareOffline();
      if (action === 'updates') void checkUpdates();
    });
    card.querySelector('#native-pwa-awake').addEventListener('change', event => {
      saveAwakePreference(Boolean(event.target.checked));
      void synchronizeWakeLock();
    });
    updateAwakeControl();
    void refreshOfflineStatus();
  }

  function historyState(view) {
    const previous = history.state && typeof history.state === 'object' && !Array.isArray(history.state)
      ? history.state : {};
    return { ...previous, tms60PwaView: view };
  }

  function bindFrame() {
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc?.documentElement || !win?.switchView || observedDoc === doc) return;

    settingsObserver?.disconnect();
    viewObserver?.disconnect();
    observedDoc = doc;

    const settingsRoot = doc.getElementById('view-settings');
    if (settingsRoot) {
      settingsObserver = new MutationObserver(() => attachSettingsCard());
      settingsObserver.observe(settingsRoot, { childList: true });
    }
    attachSettingsCard();

    const nativeSwitch = win.switchView;
    win.switchView = function(view) {
      const before = currentView();
      const result = nativeSwitch.apply(this, arguments);
      const after = currentView(); // Respect the app's active-recall disclosure guard.
      if (standalone() && before !== after && !restoringHistory) {
        history.pushState(historyState(after), '', location.href);
      }
      void synchronizeWakeLock();
      return result;
    };

    viewObserver = new MutationObserver(() => { void synchronizeWakeLock(); });
    viewObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-view'] });
    if (standalone() && !history.state?.tms60PwaView)
      history.replaceState(historyState(currentView()), '', location.href);

    // PWA icon long-press actions open a real view instead of merely changing the URL.
    // Remove only our launcher parameter; never erase OAuth, Hub, or other URL state.
    if (!launcherShortcutHandled) {
      launcherShortcutHandled = true;
      const target = new URL(location.href);
      const requested = target.searchParams.get('tmsView');
      if (requested !== null) {
        target.searchParams.delete('tmsView');
        history.replaceState(historyState(currentView()), '', target.pathname + target.search + target.hash);
        if (VIEWS.has(requested) && requested !== currentView()) win.switchView(requested);
      }
    }
    void synchronizeWakeLock();
  }

  addEventListener('popstate', event => {
    if (!standalone() || !VIEWS.has(event.state?.tms60PwaView)) return;
    const win = frame.contentWindow;
    if (typeof win?.switchView !== 'function') return;
    restoringHistory = true;
    try {
      win.switchView(event.state.tms60PwaView);
      // If a recall session prohibits the destination, keep history aligned to Study.
      if (currentView() !== event.state.tms60PwaView)
        history.replaceState(historyState(currentView()), '', location.href);
    } finally { restoringHistory = false; }
    void synchronizeWakeLock();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg=>{
      const inspect=()=>{updateWaiting=Boolean(reg.waiting);void refreshOfflineStatus();};
      if(reg.waiting)inspect();
      reg.addEventListener('updatefound',()=>{
        const installing=reg.installing;
        if(!installing)return;
        installing.addEventListener('statechange',()=>{
          if(installing.state==='installed')inspect();
        });
      });
    }).catch(()=>{});
  }
  addEventListener('online', () => { void refreshOfflineStatus(); });
  addEventListener('offline', () => { void refreshOfflineStatus(); });
  document.addEventListener('visibilitychange', () => { void synchronizeWakeLock(); });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) updatedController = true;
      hadController = true;
      void refreshOfflineStatus();
    });
  }

  frame?.addEventListener('load', () => setTimeout(bindFrame, 0));
  if (frame?.classList.contains('ready')) bindFrame();
})();
