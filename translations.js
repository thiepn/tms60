/* TMS 60 translation adapter.
 * ESV remains bundled in app.html. Schlachter 1951 and Korean Revised Version
 * 1952/1961 are loaded from the GetBible v2 query API and cached locally.
 * NIV is loaded through API.Bible using a user-supplied API key with NIV access.
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
      available: true, bundled: false, source: 'apiBible', bibleId: '78a9f6124f344018-01',
      saveKey: 'tms60-niv-memory-lab-v1',
      note: 'Loads the 60 TMS passages from API.Bible. Your API key is stored only in this browser and is never committed to the repository.'
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

  const API_BIBLE_BOOK_IDS = Object.freeze({
    'Genesis':'GEN','Exodus':'EXO','Leviticus':'LEV','Numbers':'NUM','Deuteronomy':'DEU','Joshua':'JOS','Judges':'JDG','Ruth':'RUT',
    '1 Samuel':'1SA','2 Samuel':'2SA','1 Kings':'1KI','2 Kings':'2KI','1 Chronicles':'1CH','2 Chronicles':'2CH','Ezra':'EZR',
    'Nehemiah':'NEH','Esther':'EST','Job':'JOB','Psalm':'PSA','Psalms':'PSA','Proverbs':'PRO','Ecclesiastes':'ECC',
    'Song of Solomon':'SNG','Isaiah':'ISA','Jeremiah':'JER','Lamentations':'LAM','Ezekiel':'EZK','Daniel':'DAN','Hosea':'HOS',
    'Joel':'JOL','Amos':'AMO','Obadiah':'OBA','Jonah':'JON','Micah':'MIC','Nahum':'NAM','Habakkuk':'HAB','Zephaniah':'ZEP',
    'Haggai':'HAG','Zechariah':'ZEC','Malachi':'MAL','Matthew':'MAT','Mark':'MRK','Luke':'LUK','John':'JHN','Acts':'ACT',
    'Romans':'ROM','1 Corinthians':'1CO','2 Corinthians':'2CO','Galatians':'GAL','Ephesians':'EPH','Philippians':'PHP',
    'Colossians':'COL','1 Thessalonians':'1TH','2 Thessalonians':'2TH','1 Timothy':'1TI','2 Timothy':'2TI','Titus':'TIT',
    'Philemon':'PHM','Hebrews':'HEB','James':'JAS','1 Peter':'1PE','2 Peter':'2PE','1 John':'1JN','2 John':'2JN',
    '3 John':'3JN','Jude':'JUD','Revelation':'REV'
  });

  const CACHE_SCHEMA = 2;
  const CACHE_PREFIX = 'tms60-translation-texts-v2-';
  const API_BIBLE_KEY_STORAGE = 'tms60-api-bible-key-v1';
  const NIV_CACHE_MAX_AGE = 14 * 24 * 60 * 60 * 1000;

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

  function apiBiblePassageId(reference) {
    const ref = parseReference(reference);
    const bookId = API_BIBLE_BOOK_IDS[ref.book];
    if (!bookId) throw new Error(`API.Bible book mapping is missing for ${ref.book}.`);
    const first = `${bookId}.${ref.chapter}.${ref.firstVerse}`;
    const last = `${bookId}.${ref.chapter}.${ref.lastVerse}`;
    return ref.firstVerse === ref.lastVerse ? first : `${first}-${last}`;
  }

  function cacheKey(versionId) {
    return CACHE_PREFIX + versionId;
  }

  function getApiBibleKey() {
    try { return String(localStorage.getItem(API_BIBLE_KEY_STORAGE) || '').trim(); } catch (_) { return ''; }
  }

  function setApiBibleKey(value) {
    const key = String(value || '').trim();
    try {
      if (key) localStorage.setItem(API_BIBLE_KEY_STORAGE, key);
      else localStorage.removeItem(API_BIBLE_KEY_STORAGE);
    } catch (_) {}
    return key;
  }

  function clearApiBibleKey() {
    setApiBibleKey('');
  }

  function requestApiBibleKey() {
    const existing = getApiBibleKey();
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const old = document.getElementById('tms60-api-key-dialog');
      if (old) old.remove();

      const root = document.createElement('div');
      root.id = 'tms60-api-key-dialog';
      root.style.cssText = 'position:fixed;inset:0;z-index:3000;display:grid;place-items:center;padding:20px;background:rgba(3,4,5,.78);backdrop-filter:blur(12px)';
      root.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="tms60-api-key-title" style="width:min(560px,100%);border:1px solid rgba(255,255,255,.15);border-radius:18px;background:#121418;color:#f3f5f7;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.55);font:14px/1.5 Inter,system-ui,sans-serif">
        <h2 id="tms60-api-key-title" style="margin:0 0 8px;font-size:20px">Connect NIV through API.Bible</h2>
        <p style="margin:0 0 16px;color:#aeb5c0">NIV is available through API.Bible. Enter an API.Bible key that has access to the New International Version. The key is saved only in this browser and sent directly to API.Bible; it is not added to GitHub.</p>
        <label style="display:grid;gap:7px;color:#d9dde3;font-weight:700">API.Bible key
          <input id="tms60-api-key-input" type="password" autocomplete="off" spellcheck="false" style="width:100%;min-height:44px;border:1px solid #3a3f47;border-radius:10px;background:#090a0c;color:#fff;padding:10px 12px;font:inherit">
        </label>
        <p style="margin:10px 0 0;color:#8f97a2;font-size:12px">API.Bible recommends keeping API keys server-side. TMS 60 is currently a static GitHub Pages app, so this key remains local to your browser rather than being committed into public source code.</p>
        <div style="display:flex;gap:9px;justify-content:flex-end;margin-top:18px">
          <button id="tms60-api-key-cancel" type="button" style="min-height:42px;border:1px solid #414750;border-radius:10px;background:#1d2025;color:#e8ebef;padding:8px 14px;font:inherit;font-weight:700">Cancel</button>
          <button id="tms60-api-key-save" type="button" style="min-height:42px;border:1px solid #fff;border-radius:10px;background:#f3f5f7;color:#101216;padding:8px 14px;font:inherit;font-weight:800">Connect NIV</button>
        </div>
      </div>`;
      document.body.appendChild(root);

      const input = root.querySelector('#tms60-api-key-input');
      const finish = value => {
        root.remove();
        if (value) resolve(value);
        else reject(new Error('NIV API.Bible connection was cancelled.'));
      };
      root.querySelector('#tms60-api-key-save').addEventListener('click', () => {
        const key = setApiBibleKey(input.value);
        if (!key) { input.focus(); return; }
        finish(key);
      });
      root.querySelector('#tms60-api-key-cancel').addEventListener('click', () => finish(''));
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') root.querySelector('#tms60-api-key-save').click();
        if (event.key === 'Escape') finish('');
      });
      setTimeout(() => input.focus(), 0);
    });
  }

  function readCachedTexts(def, baseVerses) {
    try {
      const raw = localStorage.getItem(cacheKey(def.id));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.schema !== CACHE_SCHEMA || !Array.isArray(parsed.verses) || parsed.verses.length !== baseVerses.length) return null;
      if (def.source === 'apiBible') {
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

  async function fetchApiBiblePassage(def, base, apiKey) {
    const passageId = apiBiblePassageId(base.reference);
    const params = new URLSearchParams({
      'content-type': 'text',
      'include-notes': 'false',
      'include-titles': 'false',
      'include-chapter-numbers': 'false',
      'include-verse-numbers': 'false',
      'include-verse-spans': 'false',
      'use-org-id': 'true'
    });
    const endpoint = `https://rest.api.bible/v1/bibles/${encodeURIComponent(def.bibleId)}/passages/${encodeURIComponent(passageId)}?${params}`;
    const response = await fetch(endpoint, { headers: { 'api-key': apiKey, 'Accept': 'application/json' } });
    if (response.status === 401 || response.status === 403) {
      clearApiBibleKey();
      throw new Error('API.Bible rejected this key or the key does not have NIV access. Try NIV again with an API.Bible key licensed for the New International Version.');
    }
    if (!response.ok) throw new Error(`API.Bible returned HTTP ${response.status} for ${base.reference}.`);
    const payload = await response.json();
    const text = normalizeText(payload?.data?.content);
    if (!text) throw new Error(`API.Bible returned no NIV text for ${base.reference}.`);
    return { verse: { ...base, text }, copyright: normalizeText(payload?.data?.copyright || '') };
  }

  async function fetchNivVerses(def, baseVerses) {
    const cached = readCachedTexts(def, baseVerses);
    if (cached) return cached;

    const apiKey = await requestApiBibleKey();
    const results = new Array(baseVerses.length);
    let copyright = '';
    const concurrency = 5;
    let cursor = 0;

    async function worker() {
      while (true) {
        const index = cursor++;
        if (index >= baseVerses.length) return;
        const result = await fetchApiBiblePassage(def, baseVerses[index], apiKey);
        results[index] = result.verse;
        if (!copyright && result.copyright) copyright = result.copyright;
      }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));
    if (results.length !== 60 || results.some(v => !v?.text)) throw new Error('Incomplete NIV TMS dataset.');
    writeCachedTexts(def, results, copyright);
    return { verses: results, copyright };
  }

  async function fetchTranslatedVerses(def, baseVerses) {
    return def.source === 'apiBible' ? fetchNivVerses(def, baseVerses) : fetchGetBibleVerses(def, baseVerses);
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
        small.textContent = 'NIV · API.Bible';
      }
    }
    const note = document.querySelector('.legal-note');
    if (note && note.textContent.includes('NIV remains disabled')) {
      note.textContent = note.textContent.replace(
        'NIV remains disabled until an authorized Biblica text source is connected.',
        'NIV loads through API.Bible and requires an API.Bible key with NIV access.'
      );
    }
  }

  window.TMSVersions = Object.freeze({
    definitions: VERSION_DEFS,
    list: () => Object.values(VERSION_DEFS),
    get: id => VERSION_DEFS[id] || VERSION_DEFS.esv,
    buildAppSource,
    getApiBibleKey,
    setApiBibleKey,
    clearApiBibleKey,
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