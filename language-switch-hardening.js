'use strict';
(() => {
  if (window.top === window || window.__TMS60_LANGUAGE_SWITCH_HARDENING__) return;
  window.__TMS60_LANGUAGE_SWITCH_HARDENING__ = '1.8.0';

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

/* P1-4: reference recall accepts German and Korean Bible-book names. */
(() => {
  if (window.top === window || window.__TMS60_P14_LOCALIZED_REFERENCE_RECALL__) return;
  if (typeof window.normalizeReference !== 'function') return;

  const nativeNormalizeReference = window.normalizeReference;
  const LOCALIZED_BOOK_ALIASES = Object.freeze({
    'genesis': [
      '1 mose','erstes mose','erste mose','genesis','창세기','창'
    ],
    'exodus': [
      '2 mose','zweites mose','zweite mose','exodus','출애굽기','출'
    ],
    'leviticus': [
      '3 mose','drittes mose','dritte mose','levitikus','lev','레위기','레'
    ],
    'numbers': [
      '4 mose','viertes mose','vierte mose','numeri','num','민수기','민'
    ],
    'joshua': [
      'josua','jos','여호수아','수'
    ],
    'psalm': [
      'psalm','psalmen','ps','시편','시'
    ],
    'proverbs': [
      'sprüche','sprueche','spr','잠언','잠'
    ],
    'isaiah': [
      'jesaja','jes','이사야','사'
    ],
    'lamentations': [
      'klagelieder','klgl','kla','예레미야애가','애'
    ],
    'matthew': [
      'matthäus','matthaeus','matth','matt','mt','마태복음','마'
    ],
    'mark': [
      'markus','mark','mk','마가복음','막'
    ],
    'luke': [
      'lukas','luk','lk','누가복음','눅'
    ],
    'john': [
      'johannes','joh','jn','요한복음','요'
    ],
    'acts': [
      'apostelgeschichte','apostelgesch','apg','사도행전','행'
    ],
    'romans': [
      'römer','roemer','röm','roem','rom','로마서','롬'
    ],
    '1 corinthians': [
      '1 korinther','1 kor','erste korinther','erster korinther','ersten korinther','i korinther','i kor','고린도전서','고전'
    ],
    '2 corinthians': [
      '2 korinther','2 kor','zweite korinther','zweiter korinther','zweiten korinther','ii korinther','ii kor','고린도후서','고후'
    ],
    'galatians': [
      'galater','gal','갈라디아서','갈'
    ],
    'ephesians': [
      'epheser','eph','에베소서','엡'
    ],
    'philippians': [
      'philipper','phil','빌립보서','빌'
    ],
    '1 timothy': [
      '1 timotheus','1 tim','erste timotheus','erster timotheus','ersten timotheus','i timotheus','i tim','디모데전서','딤전'
    ],
    '2 timothy': [
      '2 timotheus','2 tim','zweite timotheus','zweiter timotheus','zweiten timotheus','ii timotheus','ii tim','디모데후서','딤후'
    ],
    'titus': [
      'titus','tit','디도서','딛'
    ],
    'hebrews': [
      'hebräer','hebraeer','hebr','heb','히브리서','히'
    ],
    '1 peter': [
      '1 petrus','1 pet','erste petrus','erster petrus','ersten petrus','i petrus','i pet','베드로전서','벧전'
    ],
    '1 john': [
      '1 johannes','1 joh','erste johannes','erster johannes','ersten johannes','i johannes','i joh','요한일서','요일'
    ],
    'revelation': [
      'offenbarung','offenb','offb','요한계시록','계시록','계'
    ]
  });

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeLocalizedInput(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[‐‑‒–—]/g, '-')
      .replace(/\./g, '')
      .replace(/(\d)\s*,\s*(\d)/g, '$1:$2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const aliasEntries = Object.entries(LOCALIZED_BOOK_ALIASES)
    .flatMap(([canonical, aliases]) => aliases.map(alias => ({ canonical, alias: normalizeLocalizedInput(alias) })))
    .sort((a, b) => b.alias.length - a.alias.length);

  function mapLocalizedBook(reference) {
    const input = normalizeLocalizedInput(reference);
    for (const { canonical, alias } of aliasEntries) {
      const pattern = alias.split(/\s+/).map(escapeRegex).join('\\s*');
      const match = input.match(new RegExp(`^${pattern}(?=\\s*\\d)`, 'u'));
      if (!match) continue;
      return canonical + input.slice(match[0].length);
    }
    return input;
  }

  window.normalizeReference = function localizedNormalizeReference(value) {
    return nativeNormalizeReference(mapLocalizedBook(value));
  };

  // Keep the public comparator pinned to the localized normalizer even if the
  // original implementation is refactored to capture its previous helper.
  window.referenceCorrect = function localizedReferenceCorrect(target, input) {
    return window.normalizeReference(target) === window.normalizeReference(input);
  };

  window.__TMS60_P14_LOCALIZED_REFERENCE_RECALL__ = '1.0.0';
})();

/* P1-5: speech language and voice selection follow the Bible translation. */
(() => {
  if (window.top === window || window.__TMS60_P15_TRANSLATION_TTS__) return;

  const VERSION_SPEECH = Object.freeze({
    esv: Object.freeze({ lang: 'en-US', prefix: 'en' }),
    niv: Object.freeze({ lang: 'en-US', prefix: 'en' }),
    nlt: Object.freeze({ lang: 'en-US', prefix: 'en' }),
    hfa: Object.freeze({ lang: 'de-DE', prefix: 'de' }),
    schlachter1951: Object.freeze({ lang: 'de-DE', prefix: 'de' }),
    klb1985: Object.freeze({ lang: 'ko-KR', prefix: 'ko' }),
    krv1961: Object.freeze({ lang: 'ko-KR', prefix: 'ko' })
  });

  function activeSpeechConfig() {
    let version = 'esv';
    try { version = localStorage.getItem('tms60-active-translation-v1') || 'esv'; } catch (_) {}
    return VERSION_SPEECH[version] || VERSION_SPEECH.esv;
  }

  function voiceLanguage(voice) {
    return String(voice?.lang || '').toLowerCase().replace('_', '-');
  }

  function voicesFor(prefix) {
    try {
      return voices.filter(voice => voiceLanguage(voice) === prefix || voiceLanguage(voice).startsWith(`${prefix}-`));
    } catch (_) {
      return [];
    }
  }

  function install(attempt = 0) {
    if (window.__TMS60_P15_TRANSLATION_TTS__) return;
    if (typeof voiceOptions !== 'function' || typeof speakCurrent !== 'function') {
      if (attempt < 240) setTimeout(() => install(attempt + 1), 25);
      return;
    }

    // enhancements-core owns the translation-aware TTS override. Wait until it
    // has installed its version before replacing it, so this fix cannot be
    // overwritten by a later asynchronous core load.
    let source = '';
    try { source = Function.prototype.toString.call(speakCurrent); } catch (_) {}
    const coreTtsReady = source.includes('tms60-active-translation-v1') && source.includes('schlachter1951');
    if (!coreTtsReady && attempt < 240) {
      setTimeout(() => install(attempt + 1), 25);
      return;
    }

    voiceOptions = function translationVoiceOptions() {
      const { lang, prefix } = activeSpeechConfig();
      const matching = voicesFor(prefix);
      if (!matching.length) return `<option value="">Default browser voice (${htmlEsc(lang)})</option>`;
      const saved = String(state?.settings?.audioVoice || '');
      return matching.map(voice => `<option value="${htmlEsc(voice.name)}" ${voice.name === saved ? 'selected' : ''}>${htmlEsc(voice.name)} (${htmlEsc(voice.lang)})</option>`).join('');
    };

    speakCurrent = function translationSpeakCurrent() {
      const v = currentVerse();
      if (!v || !speechAvailable()) {
        toast('Speech synthesis is not available in this browser.', 'error');
        return;
      }

      speechSynthesis.cancel();
      const { lang, prefix } = activeSpeechConfig();
      const matching = voicesFor(prefix);
      const utterance = new SpeechSynthesisUtterance(`${v.reference}. ${v.text}`);
      const select = document.getElementById('voice-select');
      const rate = document.getElementById('audio-rate');
      const selectedName = String(select?.value || '');
      const savedName = String(state?.settings?.audioVoice || '');
      const chosenVoice = matching.find(voice => voice.name === selectedName)
        || matching.find(voice => voice.name === savedName)
        || matching[0]
        || null;

      utterance.lang = lang;
      utterance.voice = chosenVoice;
      utterance.rate = clamp(rate?.value || state.settings.audioRate, .6, 1.3);

      const chosenName = chosenVoice?.name || '';
      const changed = state.settings.audioRate !== utterance.rate || state.settings.audioVoice !== chosenName;
      state.settings.audioRate = utterance.rate;
      state.settings.audioVoice = chosenName;
      if (changed) markSettingsChanged();

      speechSynthesis.speak(utterance);
      scheduleSave();
    };

    window.__TMS60_P15_TRANSLATION_TTS__ = '1.0.0';
  }

  install();
})();
