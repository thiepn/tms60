/* P2-5 source preparation.
 * Keep the one cold iframe boot compatible with the existing translation adapter,
 * then make that generated document capable of later in-place dataset swaps.
 * P2-7 also removes the legacy ESV-specific backup label before the adapter runs
 * and injects explicit cold-boot translation metadata for the export bridge.
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

  function removeLegacyBackupIdentity(source) {
    const legacy = "application:'TMS 60 ESV Memory Lab'";
    if (!String(source || '').includes(legacy)) throw new Error('Could not locate the legacy ESV backup identity.');
    return String(source).replace(legacy, "application:'TMS 60 Memory Lab'");
  }

  function makeRuntimeCapable(source, definition) {
    let patched = String(source || '');
    const freezeMarker = 'for(const verse of VERSES)Object.freeze(verse);Object.freeze(VERSES);Object.freeze(PACKS);';
    if (!patched.includes(freezeMarker)) throw new Error('Could not prepare the TMS verse dataset for runtime switching.');
    patched = patched.replace(freezeMarker, 'for(const verse of VERSES)Object.freeze(verse);Object.freeze(PACKS);');

    const keyPattern = /const KEY='([^']+)',SNAP_KEY=KEY\+'-snapshots',SCHEMA=/;
    if (!keyPattern.test(patched)) throw new Error('Could not prepare translation-specific storage for runtime switching.');
    patched = patched.replace(keyPattern, "let KEY='$1',SNAP_KEY=KEY+'-snapshots';const SCHEMA=");

    const bootIdentity = {
      id: String(definition?.id || '').trim(),
      short: String(definition?.short || '').trim(),
      name: String(definition?.name || '').trim(),
      saveKey: String(definition?.saveKey || '').trim()
    };
    if (!bootIdentity.id || !bootIdentity.short || !bootIdentity.name || !bootIdentity.saveKey) {
      throw new Error('Could not prepare cold-boot translation identity.');
    }

    if (!patched.includes('runtime-translation-switch.js')) {
      const identityScript = `<script>window.__TMS60_BOOT_TRANSLATION__=${JSON.stringify(bootIdentity)};</script>`;
      patched = patched.replace('</body>', `${identityScript}<script src="runtime-translation-switch.js"></script></body>`);
    }
    return patched;
  }

  async function buildAppSource(source, versionId) {
    if (!baseVerses) baseVerses = extractBaseVerses(source);

    // Strip the old ESV-only application label before translations.js sees the
    // source. This prevents its historical whole-source string substitution from
    // being responsible for backup identity on any Bible version.
    const identityNeutralSource = removeLegacyBackupIdentity(source);
    const built = await nativeBuildAppSource(identityNeutralSource, versionId);
    const copyright = extractCopyright(built.source);
    return {
      ...built,
      source: makeRuntimeCapable(built.source, built.definition),
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
  window.__TMS60_P27_BACKUP_IDENTITY_PREP__ = '1.0.0';
})();
