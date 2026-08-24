/* TMS 60 translation adapter.
 * ESV remains bundled in app.html. Schlachter 1951 and Korean Revised Version
 * 1952/1961 are loaded from the GetBible v2 query API and cached locally.
 * NIV is loaded automatically through the TMS 60 server-side API.Bible proxy.
 */
'use strict';
(() => {
  const VERSION_DEFS = Object.freeze({
    esv: Object.freeze({
      id: 'esv', short: 'ESV', name: 'English Standard Version', language: 'English',
      available: true, bundled: true, saveKey: 'tms60-esv-memory-lab-v1',
      note: 'Bundled with TMS 60.'
    }),
    niv: Object.freeze({
      id: 'niv', short: 'NIV', name: 'New International Version', language: 'English',
      available: true, bundled: false, source: 'proxy', saveKey: 'tms60-niv-memory-lab-v1',
      note: 'Loads automatically through the TMS 60 server-side API.Bible integration. No user API key is required.'
    }),
    schlachter1951: Object.freeze({
      id: 'schlachter1951', short: 'SCH1951', name: 'Schlachter 1951', language: 'Deutsch',
      available: true, bundled: false, api: 'schlachter', saveKey: 'tms60-sch1951-memory-lab-v1',
      note: 'Schlachter-Bibel 1951. © 1951 Genfer Bibelgesellschaft. CC BY 4.0 attribution/source information: eBible.org.'
    }),
    krv1961: Object.freeze({
      id: 'krv1961', short: '개역한글', name: '개역한글 (1961)', language: '한국어',
      available: true, bundled: false, api: 'korean', saveKey: 'tms60-krv1961-memory-lab-v1',
      note: 'Korean Revised Version 1952/1961. Public-domain source distributed by GetBible from Wikisource.'
    })
  });

  const BOOK_NUMBERS = Object.freeze({
    'Genesis':1,'Exodus':2,'Leviticus':3,'Numbers':4,'Deuteronomy':5,'Joshua':6,'Judges':7,'Ruth':8,
    '1 Samuel':9,'2 Samuel':10,'1 Kings':11,'2 Kings':12,'1 Chronicles':13,'2 Chronicles':14,'Ezra':15,'Nehemiah':16,'Esther':17,
    'Job':18,'Psalm':19,'Psalms':19,'Proverbs':20,'Ecclesiastes':21,'Song of Solomon':22,'Isaiah':23,'Jeremiah':24,'Lamentations':25,
    'Ezekiel':26,'Daniel':27,'Hosea':28,'Joel':29,'Amos':30,'Obadiah':31,'Jonah':32,'Micah':33,'Nahum':34,'Habakkuk':35,'Zephaniah':36,
    'Haggai':37,'Zechariah':38,'Malachi':39,'Matthew':40,'Mark':41,'Luke':42,'John':43,'Acts':44,'Romans':45,'1 Corinthians':46,
    '2 Corinthians':47,'Galatians':48,'Ephesians':49,'Philippians':50,'Colossians':51,'1 Thessalonians':52,'2 Thessalonians':53,
    '1 Timothy':54,'2 Timothy':55,'Titus':56,'Philemon':57,'Hebrews':58,'James':59,'1 Peter':60,'2 Peter':61,'1 John':62,'2 John':63,
    '3 John':64,'Jude':65,'Revelation':66
  });

  const CACHE_SCHEMA = 2;
  const CACHE_PREFIX = 'tms60-translation-texts-v2-';
  const NIV_CACHE_MAX_AGE = 14 * 24 * 60 * 60 * 1000;
  const LEGACY_API_BIBLE_KEY_STORAGE = 'tms60-api-bible-key-v1';
  let nivServiceConfigPromise = null;

  function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function parseReference(reference) {
    const match = String(reference).match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error(`Unsupported verse reference: ${reference}`);
    const book = match[1];
    const bookNumber = BOOK_NUMBERS[book];
    if (!bookNumber) throw new Error(`Unknown Bible book: ${book}`);
    const chapter = Number(match[2]);
    const firstVerse = Number(match[3]);
    const lastVerse = Number(match[4] || match[3]);
    return { book, bookNumber, chapter, firstVerse, lastVerse };
  }

  function cacheKey(versionId) {
    return CACHE_PREFIX + versionId;
  }

  function clearLegacyApiBibleKey() {
    try { localStorage.removeItem(LEGACY_API_BIBLE_KEY_STORAGE); } catch (_) {}
  }

  function readCachedTexts(def, baseVerses) {
    try {
      const raw = localStorage.getItem(cacheKey(def.id));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.schema !== CACHE_SCHEMA || !Array.isArray(parsed.verses) || parsed.verses.length !== baseVerses.length) return null;
      if (def.id === 'niv') {
        const fetchedAt = Date.parse(parsed.fetchedAt || '');
        if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > NIV_CACHE_MAX_AGE) return null;
      } else if (parsed?.api !== def.api) return null;

      const textById = new Map(parsed.verses.map(v => [Number(v.id), normalizeText(v.text)]));
      const translated = baseVerses.map(v => ({ ...v, text: textById.get(v.id) || '' }));
      return translated.every(v => v.text) ? { verses: translated, copyright: normalizeText(parsed.copyright || '') } : null;
    } catch (_) {
      return null;
    }
  }

  function writeCachedTexts(def, verses, copyright = '') {
    try {
      localStorage.setItem(cacheKey(def.id), JSON.stringify({
        schema: CACHE_SCHEMA,
        api: def.api || def.source || '',
        fetchedAt: new Date().toISOString(),
        copyright: normalizeText(copyright),
        verses: verses.map(v => ({ id: v.id, text: v.text }))
      }));
    } catch (_) {}
  }

  async function fetchGetBibleVerses(def, baseVerses) {
    const cached = readCachedTexts(def, baseVerses);
    if (cached) return cached;
    if (!def.api) throw new Error(`${def.short} has no Bible text source configured.`);

    const references = baseVerses.map(v => v.reference).join(';');
    const endpoint = encodeURI(`https://query.getbible.net/v2/${def.api}/${references}`);
    const response = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error(`Bible text service returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (!payload || typeof payload !== 'object') throw new Error('Bible text service returned an invalid response.');

    const verseLookup = new Map();
    for (const group of Object.values(payload)) {
      const bookNumber = Number(group?.book_nr);
      if (!bookNumber || !Array.isArray(group?.verses)) continue;
      for (const verse of group.verses) {
        const chapter = Number(verse?.chapter ?? group?.chapter);
        const number = Number(verse?.verse);
        const text = normalizeText(verse?.text);
        if (chapter && number && text) verseLookup.set(`${bookNumber}:${chapter}:${number}`, text);
      }
    }

    const translated = baseVerses.map(base => {
      const ref = parseReference(base.reference);
      const pieces = [];
      for (let number = ref.firstVerse; number <= ref.lastVerse; number += 1) {
        const text = verseLookup.get(`${ref.bookNumber}:${ref.chapter}:${number}`);
        if (!text) throw new Error(`Missing ${base.reference} (${ref.bookNumber}:${ref.chapter}:${number}) from ${def.short}.`);
        pieces.push(text);
      }
      return { ...base, text: pieces.join(' ') };
    });

    if (translated.length !== 60 || translated.some(v => !v.text)) throw new Error(`Incomplete ${def.short} TMS dataset.`);
    writeCachedTexts(def, translated);
    return { verses: translated, copyright: '' };
  }

  async function getNivProxyBaseUrl() {
    const injected = normalizeText(window.TMS_NIV_PROXY_URL || '');
    if (injected) return validateProxyUrl(injected);
    if (!nivServiceConfigPromise) {
      nivServiceConfigPromise = fetch('niv-service.json', { cache: 'no-store', headers: { 'Accept': 'application/json' } })
        .then(async response => {
          if (!response.ok) throw new Error(`NIV service configuration returned HTTP ${response.status}.`);
          return response.json();
        })
        .then(config => validateProxyUrl(normalizeText(config?.baseUrl || '')));
    }
    return nivServiceConfigPromise;
  }

  function validateProxyUrl(value) {
    if (!value) throw new Error('NIV is not connected to the server-side service yet. The app owner must deploy the TMS 60 NIV Worker first.');
    let url;
    try { url = new URL(value, location.href); } catch (_) { throw new Error('The NIV service URL is invalid.'); }
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('The NIV service must use HTTPS.');
    return url.href.replace(/\/+$/, '');
  }

  async function fetchNivVerses(def, baseVerses) {
    const cached = readCachedTexts(def, baseVerses);
    if (cached) return cached;

    const baseUrl = await getNivProxyBaseUrl();
    const response = await fetch(`${baseUrl}/v1/niv/tms60`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) {
      let detail = '';
      try { detail = normalizeText((await response.json())?.error || ''); } catch (_) {}
      throw new Error(detail || `NIV service returned HTTP ${response.status}.`);
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.verses) || payload.verses.length !== 60) throw new Error('NIV service returned an incomplete TMS dataset.');

    const seen = new Set();
    const textById = new Map();
    for (const item of payload.verses) {
      const id = Number(item?.id), text = normalizeText(item?.text);
      if (!Number.isInteger(id) || id < 1 || id > 60 || seen.has(id) || !text) throw new Error('NIV service returned an invalid TMS dataset.');
      seen.add(id); textById.set(id, text);
    }
    if (seen.size !== 60) throw new Error('NIV service returned an incomplete TMS dataset.');

    const translated = baseVerses.map(base => ({ ...base, text: textById.get(base.id) || '' }));
    if (translated.some(v => !v.text)) throw new Error('NIV service is missing one or more TMS passages.');
    const copyright = normalizeText(payload.copyright || '');
    writeCachedTexts(def, translated, copyright);
    return { verses: translated, copyright };
  }

  async function fetchTranslatedVerses(def, baseVerses) {
    return def.id === 'niv' ? fetchNivVerses(def, baseVerses) : fetchGetBibleVerses(def, baseVerses);
  }

  function extractBaseVerses(source) {
    const startMarker = 'const VERSES=';
    const endMarker = ';\nconst PACKS=';
    const start = source.indexOf(startMarker);
    if (start < 0) throw new Error('Could not locate the TMS verse dataset.');
    const jsonStart = start + startMarker.length;
    const end = source.indexOf(endMarker, jsonStart);
    if (end < 0) throw new Error('Could not locate the end of the TMS verse dataset.');
    const verses = JSON.parse(source.slice(jsonStart, end));
    if (!Array.isArray(verses) || verses.length !== 60) throw new Error('The TMS verse manifest is invalid.');
    return { verses, jsonStart, end };
  }

  function replaceOnce(source, search, replacement) {
    const index = source.indexOf(search);
    if (index < 0) return source;
    return source.slice(0, index) + replacement + source.slice(index + search.length);
  }

  function injectRuntimeCopyright(source, copyright) {
    const text = normalizeText(copyright);
    if (!text) return source;
    const notice = `<div id="translation-copyright" style="position:fixed;z-index:40;right:10px;bottom:10px;max-width:min(640px,calc(100vw - 20px));padding:6px 9px;border-radius:8px;background:rgba(9,10,12,.92);color:#aeb5c0;border:1px solid rgba(255,255,255,.10);font:10px/1.35 Inter,system-ui,sans-serif;pointer-events:none">${escapeHtml(text)}</div>`;
    return replaceOnce(source, '</body>', `${notice}</body>`);
  }

  async function buildAppSource(source, versionId) {
    const def = VERSION_DEFS[versionId] || VERSION_DEFS.esv;
    if (!def.available) throw new Error(`${def.name} is not available.`);
    const manifest = extractBaseVerses(source);
    const dataset = def.bundled ? { verses: manifest.verses, copyright: '' } : await fetchTranslatedVerses(def, manifest.verses);
    const verses = dataset.verses;

    let patched = source.slice(0, manifest.jsonStart) + JSON.stringify(verses) + source.slice(manifest.end);
    patched = replaceOnce(patched, "const KEY='tms60-esv-memory-lab-v1'", `const KEY='${def.saveKey}'`);
    patched = patched.replace(/Exact ESV recall/g, `Exact ${def.short} recall`);
    patched = patched.replace(/TMS 60 ESV Memory Lab/g, `TMS 60 ${def.short} Memory Lab`);
    if (def.id === 'niv') patched = injectRuntimeCopyright(patched, dataset.copyright);
    return { source: patched, definition: def, verses };
  }

  function enableNivShellUI() {
    const button = document.querySelector('[data-version-choice="niv"]');
    if (button) {
      button.disabled = false;
      const small = button.querySelector('small');
      if (small) {
        small.classList.remove('pending');
        small.textContent = 'NIV · automatic';
      }
    }
    const note = document.querySelector('.legal-note');
    if (note) {
      note.textContent = note.textContent
        .replace('NIV remains disabled until an authorized Biblica text source is connected.', 'NIV loads automatically through the TMS 60 server-side API.Bible integration.')
        .replace('NIV loads through API.Bible and requires an API.Bible key with NIV access.', 'NIV loads automatically through the TMS 60 server-side API.Bible integration.');
    }
  }

  clearLegacyApiBibleKey();
  window.TMSVersions = Object.freeze({
    definitions: VERSION_DEFS,
    list: () => Object.values(VERSION_DEFS),
    get: id => VERSION_DEFS[id] || VERSION_DEFS.esv,
    buildAppSource,
    getApiBibleKey: () => '',
    setApiBibleKey: () => '',
    clearApiBibleKey: clearLegacyApiBibleKey,
    clearTranslationCache(versionId) {
      try { localStorage.removeItem(cacheKey(versionId)); } catch (_) {}
    }
  });

  enableNivShellUI();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enableNivShellUI, { once: true });
})();

(() => {
  function loadEnhancements(){
    if(document.querySelector('script[data-tms-vnext-loader]'))return;
    const s=document.createElement('script');s.src='enhancements.js';s.dataset.tmsVnextLoader='1';document.head.appendChild(s);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadEnhancements,{once:true});else loadEnhancements();
})();
