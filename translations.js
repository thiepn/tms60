/* TMS 60 translation adapter.
 * ESV remains bundled in app.html. Schlachter 1951 and Korean Revised Version
 * 1952/1961 are loaded from the GetBible v2 query API and cached locally.
 * NIV is registered but intentionally has no text source until an authorized
 * Biblica/API.Bible source is connected.
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
      available: false, bundled: false, saveKey: 'tms60-niv-memory-lab-v1',
      note: 'Ready in the version system; an authorized NIV text source is still required.'
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

  const CACHE_SCHEMA = 1;
  const CACHE_PREFIX = 'tms60-translation-texts-v1-';

  function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
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

  function readCachedTexts(def, baseVerses) {
    try {
      const raw = localStorage.getItem(cacheKey(def.id));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.schema !== CACHE_SCHEMA || parsed?.api !== def.api || !Array.isArray(parsed.verses) || parsed.verses.length !== baseVerses.length) return null;
      const textById = new Map(parsed.verses.map(v => [Number(v.id), normalizeText(v.text)]));
      const translated = baseVerses.map(v => ({ ...v, text: textById.get(v.id) || '' }));
      return translated.every(v => v.text) ? translated : null;
    } catch (_) {
      return null;
    }
  }

  function writeCachedTexts(def, verses) {
    try {
      localStorage.setItem(cacheKey(def.id), JSON.stringify({
        schema: CACHE_SCHEMA,
        api: def.api,
        fetchedAt: new Date().toISOString(),
        verses: verses.map(v => ({ id: v.id, text: v.text }))
      }));
    } catch (_) {}
  }

  async function fetchTranslatedVerses(def, baseVerses) {
    const cached = readCachedTexts(def, baseVerses);
    if (cached) return cached;
    if (!def.api) throw new Error(`${def.short} has no authorized text source configured.`);

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
    return translated;
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

  async function buildAppSource(source, versionId) {
    const def = VERSION_DEFS[versionId] || VERSION_DEFS.esv;
    if (!def.available) throw new Error(`${def.name} is registered but its authorized text source has not been connected yet.`);
    const manifest = extractBaseVerses(source);
    const verses = def.bundled ? manifest.verses : await fetchTranslatedVerses(def, manifest.verses);

    let patched = source.slice(0, manifest.jsonStart) + JSON.stringify(verses) + source.slice(manifest.end);
    patched = replaceOnce(patched, "const KEY='tms60-esv-memory-lab-v1'", `const KEY='${def.saveKey}'`);
    patched = patched.replace(/Exact ESV recall/g, `Exact ${def.short} recall`);
    patched = patched.replace(/TMS 60 ESV Memory Lab/g, `TMS 60 ${def.short} Memory Lab`);
    return { source: patched, definition: def, verses };
  }

  window.TMSVersions = Object.freeze({
    definitions: VERSION_DEFS,
    list: () => Object.values(VERSION_DEFS),
    get: id => VERSION_DEFS[id] || VERSION_DEFS.esv,
    buildAppSource,
    clearTranslationCache(versionId) {
      try { localStorage.removeItem(cacheKey(versionId)); } catch (_) {}
    }
  });
})();
