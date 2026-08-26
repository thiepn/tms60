/* P2-5 source preparation.
 * Keep the one cold iframe boot compatible with the existing translation adapter,
 * then make that generated document capable of later in-place dataset swaps.
 */
'use strict';
(() => {
  if (window.__TMS60_P25_SOURCE_PREP__) return;
  const versions = window.TMSVersions;
  if (!versions?.buildAppSource) return;

  const nativeBuildAppSource = versions.buildAppSource.bind(versions);
  let baseVerses = null;

  function extractBaseVerses(source) {
    const startMarker = 'const VERSES=';
    const endMarker = ';\nconst PACKS=';
    const start = source.indexOf(startMarker);
    if (start < 0) throw new Error('Could not locate the base TMS verse dataset.');
    const jsonStart = start + startMarker.length;
    const end = source.indexOf(endMarker, jsonStart);
    if (end < 0) throw new Error('Could not locate the end of the base TMS verse dataset.');
    const verses = JSON.parse(source.slice(jsonStart, end));
    if (!Array.isArray(verses) || verses.length !== 60) throw new Error('The base TMS verse dataset is invalid.');
    return verses.map(v => Object.freeze({ ...v }));
  }

  function decodeHtml(value) {
    const area = document.createElement('textarea');
    area.innerHTML = String(value || '');
    return area.value.replace(/\s+/g, ' ').trim();
  }

  function extractCopyright(source) {
    const match = String(source || '').match(/<div id="translation-copyright"[^>]*>([\s\S]*?)<\/div>/i);
    return match ? decodeHtml(match[1]) : '';
  }

  function makeRuntimeCapable(source) {
    let patched = String(source || '');
    const freezeMarker = 'for(const verse of VERSES)Object.freeze(verse);Object.freeze(VERSES);Object.freeze(PACKS);';
    if (!patched.includes(freezeMarker)) throw new Error('Could not prepare the TMS verse dataset for runtime switching.');
    patched = patched.replace(freezeMarker, 'for(const verse of VERSES)Object.freeze(verse);Object.freeze(PACKS);');

    const keyPattern = /const KEY='([^']+)',SNAP_KEY=KEY\+'-snapshots',SCHEMA=/;
    if (!keyPattern.test(patched)) throw new Error('Could not prepare translation-specific storage for runtime switching.');
    patched = patched.replace(keyPattern, "let KEY='$1',SNAP_KEY=KEY+'-snapshots';const SCHEMA=");

    if (!patched.includes('runtime-translation-switch.js')) {
      patched = patched.replace('</body>', '<script src="runtime-translation-switch.js"></scr' + 'ipt></body>');
    }
    return patched;
  }

  async function buildAppSource(source, versionId) {
    if (!baseVerses) baseVerses = extractBaseVerses(source);
    const built = await nativeBuildAppSource(source, versionId);
    const copyright = extractCopyright(built.source);
    return {
      ...built,
      source: makeRuntimeCapable(built.source),
      copyright
    };
  }

  async function loadDataset(versionId) {
    if (!baseVerses) throw new Error('The base TMS dataset is not ready yet.');
    // The legacy adapter expects the normal source markers, but it only needs the
    // 60-verse manifest to fetch/cache wording. Feed it a tiny probe document
    // instead of rebuilding the ~277 KB application source.
    const probe = `const VERSES=${JSON.stringify(baseVerses)};\nconst PACKS={};\nconst KEY='tms60-esv-memory-lab-v1';\n<body></body>`;
    const built = await nativeBuildAppSource(probe, versionId);
    return {
      definition: built.definition,
      verses: built.verses,
      copyright: extractCopyright(built.source),
      probeBytes: probe.length
    };
  }

  window.TMSVersions = Object.freeze({ ...versions, buildAppSource });
  window.TMSRuntimeDatasetSource = Object.freeze({ loadDataset });
  window.__TMS60_P25_SOURCE_PREP__ = '1.0.0';
})();
