'use strict';
(() => {
  if (window.top === window || window.__TMS60_P28_LOCALIZED_TTS_REFERENCE__) return;

  const VERSION_SPEECH = Object.freeze({
    esv: Object.freeze({ lang: 'en-US', prefix: 'en', referenceLanguage: 'en' }),
    niv: Object.freeze({ lang: 'en-US', prefix: 'en', referenceLanguage: 'en' }),
    nlt: Object.freeze({ lang: 'en-US', prefix: 'en', referenceLanguage: 'en' }),
    hfa: Object.freeze({ lang: 'de-DE', prefix: 'de', referenceLanguage: 'de' }),
    schlachter1951: Object.freeze({ lang: 'de-DE', prefix: 'de', referenceLanguage: 'de' }),
    klb1985: Object.freeze({ lang: 'ko-KR', prefix: 'ko', referenceLanguage: 'ko' }),
    krv1961: Object.freeze({ lang: 'ko-KR', prefix: 'ko', referenceLanguage: 'ko' })
  });

  const BOOKS = Object.freeze({
    Genesis: Object.freeze({ de: '1. Mose', ko: '창세기' }),
    Exodus: Object.freeze({ de: '2. Mose', ko: '출애굽기' }),
    Leviticus: Object.freeze({ de: '3. Mose', ko: '레위기' }),
    Numbers: Object.freeze({ de: '4. Mose', ko: '민수기' }),
    Joshua: Object.freeze({ de: 'Josua', ko: '여호수아' }),
    Psalm: Object.freeze({ de: 'Psalm', ko: '시편' }),
    Psalms: Object.freeze({ de: 'Psalm', ko: '시편' }),
    Proverbs: Object.freeze({ de: 'Sprüche', ko: '잠언' }),
    Isaiah: Object.freeze({ de: 'Jesaja', ko: '이사야' }),
    Lamentations: Object.freeze({ de: 'Klagelieder', ko: '예레미야애가' }),
    Matthew: Object.freeze({ de: 'Matthäus', ko: '마태복음' }),
    Mark: Object.freeze({ de: 'Markus', ko: '마가복음' }),
    Luke: Object.freeze({ de: 'Lukas', ko: '누가복음' }),
    John: Object.freeze({ de: 'Johannes', ko: '요한복음' }),
    Acts: Object.freeze({ de: 'Apostelgeschichte', ko: '사도행전' }),
    Romans: Object.freeze({ de: 'Römer', ko: '로마서' }),
    '1 Corinthians': Object.freeze({ de: '1. Korinther', ko: '고린도전서' }),
    '2 Corinthians': Object.freeze({ de: '2. Korinther', ko: '고린도후서' }),
    Galatians: Object.freeze({ de: 'Galater', ko: '갈라디아서' }),
    Ephesians: Object.freeze({ de: 'Epheser', ko: '에베소서' }),
    Philippians: Object.freeze({ de: 'Philipper', ko: '빌립보서' }),
    '1 Timothy': Object.freeze({ de: '1. Timotheus', ko: '디모데전서' }),
    '2 Timothy': Object.freeze({ de: '2. Timotheus', ko: '디모데후서' }),
    Titus: Object.freeze({ de: 'Titus', ko: '디도서' }),
    Hebrews: Object.freeze({ de: 'Hebräer', ko: '히브리서' }),
    '1 Peter': Object.freeze({ de: '1. Petrus', ko: '베드로전서' }),
    '1 John': Object.freeze({ de: '1. Johannes', ko: '요한일서' }),
    Revelation: Object.freeze({ de: 'Offenbarung', ko: '요한계시록' })
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

  function localizedReference(reference, language) {
    const source = String(reference || '').trim();
    if (language === 'en') return source;

    const match = source.match(/^(.+?)\s+(\d+):(\d+)(?:[-–](\d+))?$/u);
    if (!match) return source;

    const localizedBook = BOOKS[match[1]]?.[language];
    if (!localizedBook) return source;

    const chapter = match[2];
    const firstVerse = match[3];
    const lastVerse = match[4] || '';

    if (language === 'de') {
      return lastVerse
        ? `${localizedBook}, Kapitel ${chapter}, Verse ${firstVerse} bis ${lastVerse}`
        : `${localizedBook}, Kapitel ${chapter}, Vers ${firstVerse}`;
    }

    if (language === 'ko') {
      return lastVerse
        ? `${localizedBook} ${chapter}장 ${firstVerse}절에서 ${lastVerse}절`
        : `${localizedBook} ${chapter}장 ${firstVerse}절`;
    }

    return source;
  }

  function install(attempt = 0) {
    if (window.__TMS60_P28_LOCALIZED_TTS_REFERENCE__) return;
    if (window.__TMS60_P15_TRANSLATION_TTS__ !== '1.0.0' || typeof speakCurrent !== 'function') {
      if (attempt < 240) setTimeout(() => install(attempt + 1), 25);
      return;
    }

    speakCurrent = function localizedTranslationSpeakCurrent() {
      const v = currentVerse();
      if (!v || !speechAvailable()) {
        toast('Speech synthesis is not available in this browser.', 'error');
        return;
      }

      speechSynthesis.cancel();
      const { lang, prefix, referenceLanguage } = activeSpeechConfig();
      const matching = voicesFor(prefix);
      const spokenReference = localizedReference(v.reference, referenceLanguage);
      const utterance = new SpeechSynthesisUtterance(`${spokenReference}. ${v.text}`);
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

    window.__TMS60_P28_LOCALIZED_TTS_REFERENCE__ = '1.0.0';
  }

  install();
})();
