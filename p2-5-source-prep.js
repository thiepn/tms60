/* P2-5/P2-9 source preparation.
 * P2-9 isolates the legacy translation adapter behind a tiny compatibility probe
 * and applies all mutations to the real app source through a semantic contract.
 * The real app source therefore no longer depends on exact whitespace, quote
 * style, declaration adjacency, or a literal </body> marker.
 */
'use strict';
(() => {
  if (window.__TMS60_P25_SOURCE_PREP__) return;
  const versions = window.TMSVersions;
  if (!versions?.buildAppSource) return;

  const nativeBuildAppSource = versions.buildAppSource.bind(versions);
  let baseVerses = null;

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  function uniqueBinding(source, name) {
    const text = String(source || '');
    const pattern = new RegExp(`\\b(const|let|var)\\s+${escapeRegExp(name)}\\s*=\\s*`, 'g');
    const matches = [...text.matchAll(pattern)];
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one ${name} source binding; found ${matches.length}.`);
    }
    const match = matches[0];
    return {
      keyword: match[1],
      start: match.index,
      valueStart: match.index + match[0].length,
      keywordStart: match.index,
      keywordEnd: match.index + match[1].length
    };
  }

  function quotedRange(source, start, label) {
    const text = String(source || '');
    let index = start;
    while (/\s/.test(text[index] || '')) index += 1;
    const quote = text[index];
    if (quote !== '"' && quote !== "'") throw new Error(`${label} must use a quoted string initializer.`);
    const valueStart = index;
    index += 1;
    let escaped = false;
    for (; index < text.length; index += 1) {
      const ch = text[index];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) return { start: valueStart, end: index + 1, quote };
    }
    throw new Error(`${label} has an unterminated string initializer.`);
  }

  function arrayRange(source, start, label) {
    const text = String(source || '');
    let index = start;
    while (/\s/.test(text[index] || '')) index += 1;
    if (text[index] !== '[') throw new Error(`${label} must use an array initializer.`);
    const arrayStart = index;
    let depth = 0;
    let quote = '';
    let escaped = false;
    for (; index < text.length; index += 1) {
      const ch = text[index];
      if (quote) {
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if (ch === '[') depth += 1;
      else if (ch === ']') {
        depth -= 1;
        if (depth === 0) return { start: arrayStart, end: index + 1 };
        if (depth < 0) break;
      }
    }
    throw new Error(`${label} has an unterminated array initializer.`);
  }

  function readVerseManifest(source) {
    const binding = uniqueBinding(source, 'VERSES');
    const range = arrayRange(source, binding.valueStart, 'VERSES');
    let verses;
    try { verses = JSON.parse(String(source).slice(range.start, range.end)); }
    catch (_) { throw new Error('The TMS verse manifest is not valid JSON.'); }
    if (!Array.isArray(verses) || verses.length !== 60) throw new Error('The TMS verse manifest must contain exactly 60 passages.');
    return verses;
  }

  function replaceVerseManifest(source, verses) {
    if (!Array.isArray(verses) || verses.length !== 60) throw new Error('Replacement TMS verse manifest must contain exactly 60 passages.');
    const binding = uniqueBinding(source, 'VERSES');
    const range = arrayRange(source, binding.valueStart, 'VERSES');
    return String(source).slice(0, range.start) + JSON.stringify(verses) + String(source).slice(range.end);
  }

  function readStringBinding(source, name) {
    const binding = uniqueBinding(source, name);
    const range = quotedRange(source, binding.valueStart, name);
    const literal = String(source).slice(range.start, range.end);
    try {
      if (range.quote === '"') return JSON.parse(literal);
      return literal.slice(1, -1).replace(/\\(['\\])/g, '$1');
    } catch (_) {
      throw new Error(`${name} has an invalid string initializer.`);
    }
  }

  function replaceStringBinding(source, name, value) {
    const binding = uniqueBinding(source, name);
    const range = quotedRange(source, binding.valueStart, name);
    return String(source).slice(0, range.start) + JSON.stringify(String(value)) + String(source).slice(range.end);
  }

  function makeDeclarationMutable(source, name) {
    const binding = uniqueBinding(source, name);
    if (binding.keyword === 'let' || binding.keyword === 'var') return String(source);
    return String(source).slice(0, binding.keywordStart) + 'let' + String(source).slice(binding.keywordEnd);
  }

  function removeFreezeCall(source, name, { required = true } = {}) {
    const text = String(source || '');
    const pattern = new RegExp(`Object\\s*\\.\\s*freeze\\s*\\(\\s*${escapeRegExp(name)}\\s*\\)\\s*;?`, 'g');
    const matches = [...text.matchAll(pattern)];
    if (matches.length === 0 && !required) return text;
    if (matches.length !== 1) throw new Error(`Expected exactly one Object.freeze(${name}) call; found ${matches.length}.`);
    const match = matches[0];
    return text.slice(0, match.index) + text.slice(match.index + match[0].length);
  }

  function replaceElementTextByClass(source, className, text, { required = true } = {}) {
    const input = String(source || '');
    const cls = escapeRegExp(className);
    const pattern = new RegExp(`(<([a-z][\\w:-]*)\\b[^>]*\\bclass\\s*=\\s*(["'])[^"']*\\b${cls}\\b[^"']*\\3[^>]*>)([\\s\\S]*?)(<\\/\\2\\s*>)`, 'gi');
    const matches = [...input.matchAll(pattern)];
    if (matches.length === 0 && !required) return input;
    if (matches.length !== 1) throw new Error(`Expected exactly one .${className} element; found ${matches.length}.`);
    const match = matches[0];
    const replacement = match[1] + escapeHtml(text) + match[5];
    return input.slice(0, match.index) + replacement + input.slice(match.index + match[0].length);
  }

  function propertyStringRange(source, property) {
    const input = String(source || '');
    const pattern = new RegExp(`\\b${escapeRegExp(property)}\\s*:\\s*`, 'g');
    const matches = [...input.matchAll(pattern)];
    if (matches.length !== 1) throw new Error(`Expected exactly one ${property} string property; found ${matches.length}.`);
    const match = matches[0];
    const range = quotedRange(input, match.index + match[0].length, property);
    return range;
  }

  function replaceObjectStringProperty(source, property, value) {
    const input = String(source || '');
    const range = propertyStringRange(input, property);
    return input.slice(0, range.start) + JSON.stringify(String(value)) + input.slice(range.end);
  }

  function appendBeforeBody(source, fragment) {
    const input = String(source || '');
    const matches = [...input.matchAll(/<\/body\s*>/gi)];
    if (!matches.length) throw new Error('Could not locate the closing body element in generated app source.');
    const match = matches.at(-1);
    return input.slice(0, match.index) + String(fragment || '') + input.slice(match.index);
  }

  function hasScriptSource(source, file) {
    const pattern = new RegExp(`<script\\b[^>]*\\bsrc\\s*=\\s*(["'])${escapeRegExp(file)}\\1[^>]*>`, 'i');
    return pattern.test(String(source || ''));
  }

  function ensureScriptSource(source, file) {
    if (hasScriptSource(source, file)) return String(source);
    return appendBeforeBody(source, `<script src="${file}"></script>`);
  }

  const sourceContract = Object.freeze({
    readVerseManifest,
    replaceVerseManifest,
    readStringBinding,
    replaceStringBinding,
    makeDeclarationMutable,
    removeFreezeCall,
    replaceElementTextByClass,
    replaceObjectStringProperty,
    appendBeforeBody,
    hasScriptSource,
    ensureScriptSource
  });

  function decodeHtml(value) {
    const area = document.createElement('textarea');
    area.innerHTML = String(value || '');
    return area.value.replace(/\s+/g, ' ').trim();
  }

  function extractCopyright(source) {
    const match = String(source || '').match(/<div\b[^>]*\bid\s*=\s*(["'])translation-copyright\1[^>]*>([\s\S]*?)<\/div>/i);
    return match ? decodeHtml(match[2]) : '';
  }

  function injectRuntimeCopyright(source, copyright) {
    const text = String(copyright || '').replace(/\s+/g, ' ').trim();
    if (!text || /\bid\s*=\s*(["'])translation-copyright\1/i.test(String(source))) return String(source);
    const notice = `<div id="translation-copyright" style="position:fixed;z-index:40;right:10px;bottom:10px;max-width:min(640px,calc(100vw - 20px));padding:6px 9px;border-radius:8px;background:rgba(9,10,12,.92);color:#aeb5c0;border:1px solid rgba(255,255,255,.10);font:10px/1.35 Inter,system-ui,sans-serif;pointer-events:none">${escapeHtml(text)}</div>`;
    return sourceContract.appendBeforeBody(source, notice);
  }

  function makeLegacyProbe(verses) {
    // Only this private compatibility document uses the historical exact markers.
    // Future formatting changes in app.html never reach the legacy adapter.
    return `const VERSES=${JSON.stringify(verses)};\nconst PACKS={};\nconst KEY='tms60-esv-memory-lab-v1';\n<body></body>`;
  }

  async function loadLegacyDataset(versionId, verses) {
    const probe = makeLegacyProbe(verses);
    const built = await nativeBuildAppSource(probe, versionId);
    if (!Array.isArray(built?.verses) || built.verses.length !== 60) throw new Error('Translation adapter returned an invalid 60-passage dataset.');
    return {
      definition: built.definition,
      verses: built.verses,
      copyright: extractCopyright(built.source),
      probeBytes: probe.length
    };
  }

  function makeRuntimeCapable(source, definition) {
    let patched = String(source || '');
    patched = sourceContract.removeFreezeCall(patched, 'VERSES');
    patched = sourceContract.makeDeclarationMutable(patched, 'KEY');

    const bootIdentity = {
      id: String(definition?.id || '').trim(),
      short: String(definition?.short || '').trim(),
      name: String(definition?.name || '').trim(),
      saveKey: String(definition?.saveKey || '').trim()
    };
    if (!bootIdentity.id || !bootIdentity.short || !bootIdentity.name || !bootIdentity.saveKey) {
      throw new Error('Could not prepare cold-boot translation identity.');
    }

    if (!patched.includes('__TMS60_BOOT_TRANSLATION__')) {
      patched = sourceContract.appendBeforeBody(patched, `<script>window.__TMS60_BOOT_TRANSLATION__=${JSON.stringify(bootIdentity)};</script>`);
    }
    patched = sourceContract.ensureScriptSource(patched, 'ux-patch.js');
    patched = sourceContract.ensureScriptSource(patched, 'runtime-translation-switch.js');
    patched = sourceContract.ensureScriptSource(patched, 'p2-8-localized-tts-reference.js');
    return patched;
  }

  async function buildAppSource(source, versionId) {
    const parsedBase = sourceContract.readVerseManifest(source);
    if (!baseVerses) baseVerses = parsedBase.map(v => Object.freeze({ ...v }));

    const dataset = await loadLegacyDataset(versionId, baseVerses);
    let patched = sourceContract.replaceVerseManifest(source, dataset.verses);
    patched = sourceContract.replaceStringBinding(patched, 'KEY', dataset.definition.saveKey);
    patched = sourceContract.replaceElementTextByClass(patched, 'brand-sub', `Exact ${dataset.definition.short} recall`);
    patched = sourceContract.replaceObjectStringProperty(patched, 'application', 'TMS 60 Memory Lab');
    patched = injectRuntimeCopyright(patched, dataset.copyright);
    patched = makeRuntimeCapable(patched, dataset.definition);

    return {
      source: patched,
      definition: dataset.definition,
      verses: dataset.verses,
      copyright: dataset.copyright
    };
  }

  async function loadDataset(versionId) {
    if (!baseVerses) throw new Error('The base TMS dataset is not ready yet.');
    return loadLegacyDataset(versionId, baseVerses);
  }

  window.TMSSourceContract = sourceContract;
  window.TMSVersions = Object.freeze({ ...versions, buildAppSource });
  window.TMSRuntimeDatasetSource = Object.freeze({ loadDataset });
  // Keep established markers stable for closed-phase regressions.
  window.__TMS60_P25_SOURCE_PREP__ = '1.0.0';
  window.__TMS60_P27_BACKUP_IDENTITY_PREP__ = '1.0.0';
  window.__TMS60_P29_SOURCE_CONTRACT__ = '1.0.0';
})();
