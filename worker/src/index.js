'use strict';

const WORKER_BUILD = '2026-08-25-multibible-3-free-safe';
const CACHE_TTL_SECONDS = 14 * 24 * 60 * 60;
const UPSTREAM_TIMEOUT_MS = 15000;
const CONCURRENCY = 3;
const MAX_RETRY_SUBREQUESTS = 12;

const BIBLES = Object.freeze({
  niv: Object.freeze({ id: '78a9f6124f344018-01', short: 'NIV', name: 'New International Version' }),
  nlt: Object.freeze({ id: 'd6e14a625393b4da-01', short: 'NLT', name: 'New Living Translation' }),
  hfa: Object.freeze({ id: 'da0947e25c9636bb-01', short: 'HFA', name: 'Hoffnung für Alle' }),
  klb1985: Object.freeze({ id: 'e959e47176271f18-01', short: 'KLB 1985', name: 'Korean Living Bible 1985' })
});

const PASSAGES = Object.freeze([
  [1,'2CO.5.17'],[2,'GAL.2.20'],[3,'ROM.12.1'],[4,'JHN.14.21'],[5,'2TI.3.16-2TI.3.17'],[6,'JOS.1.8'],
  [7,'JHN.15.7'],[8,'PHP.4.6-PHP.4.7'],[9,'MAT.18.20'],[10,'HEB.10.24-HEB.10.25'],[11,'MAT.4.19'],[12,'ROM.1.16'],
  [13,'ROM.3.23'],[14,'ISA.53.6'],[15,'ROM.6.23'],[16,'HEB.9.27'],[17,'ROM.5.8'],[18,'1PE.3.18'],[19,'EPH.2.8-EPH.2.9'],
  [20,'TIT.3.5'],[21,'JHN.1.12'],[22,'REV.3.20'],[23,'1JN.5.13'],[24,'JHN.5.24'],[25,'1CO.3.16'],[26,'1CO.2.12'],
  [27,'ISA.41.10'],[28,'PHP.4.13'],[29,'LAM.3.22-LAM.3.23'],[30,'NUM.23.19'],[31,'ISA.26.3'],[32,'1PE.5.7'],[33,'ROM.8.32'],
  [34,'PHP.4.19'],[35,'HEB.2.18'],[36,'PSA.119.9-PSA.119.11'],[37,'MAT.6.33'],[38,'LUK.9.23'],[39,'1JN.2.15-1JN.2.16'],[40,'ROM.12.2'],
  [41,'1CO.15.58'],[42,'HEB.12.3'],[43,'MRK.10.45'],[44,'2CO.4.5'],[45,'PRO.3.9-PRO.3.10'],[46,'2CO.9.6-2CO.9.7'],
  [47,'ACT.1.8'],[48,'MAT.28.19-MAT.28.20'],[49,'JHN.13.34-JHN.13.35'],[50,'1JN.3.18'],[51,'PHP.2.3-PHP.2.4'],[52,'1PE.5.5-1PE.5.6'],[53,'EPH.5.3'],
  [54,'1PE.2.11'],[55,'LEV.19.11'],[56,'ACT.24.16'],[57,'HEB.11.6'],[58,'ROM.4.20-ROM.4.21'],[59,'GAL.6.9-GAL.6.10'],[60,'MAT.5.16']
]);

/*
 * Cloudflare Workers Free allows only 50 external subrequests per incoming
 * request. Fetching all 60 TMS passages individually can never succeed on that
 * plan. These 34 grouped ranges cover all 60 TMS references while staying
 * safely below the limit. API.Bible JSON content exposes verseOrgIds, which we
 * use to extract only the exact TMS verses from each broader range.
 */
const FETCH_RANGES = Object.freeze([
  '2CO.4.5-2CO.5.17','2CO.9.6-2CO.9.7',
  'GAL.2.20-GAL.6.10',
  'ROM.1.16-ROM.6.23','ROM.8.32-ROM.12.2',
  'JHN.1.12-JHN.5.24','JHN.13.34-JHN.15.7',
  '2TI.3.16-2TI.3.17','JOS.1.8',
  'PHP.2.3-PHP.4.19',
  'MAT.4.19-MAT.6.33','MAT.18.20','MAT.28.19-MAT.28.20',
  'HEB.2.18','HEB.9.27-HEB.12.3',
  'ISA.26.3','ISA.41.10','ISA.53.6',
  '1PE.2.11-1PE.5.7','EPH.2.8-EPH.5.3',
  'TIT.3.5','REV.3.20','1JN.2.15-1JN.5.13',
  '1CO.2.12-1CO.3.16','1CO.15.58',
  'LAM.3.22-LAM.3.23','NUM.23.19','PSA.119.9-PSA.119.11',
  'LUK.9.23','MRK.10.45','PRO.3.9-PRO.3.10',
  'ACT.1.8','ACT.24.16','LEV.19.11'
]);

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://thiepn.github.io,https://thiepn.dev')
    .split(',').map(value => value.trim()).filter(Boolean);
}

function corsOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return '';
  if (allowedOrigins(env).includes(origin)) return origin;
  try {
    const url = new URL(origin);
    if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && (url.protocol === 'http:' || url.protocol === 'https:')) return origin;
    if ((url.hostname === 'thiepn.dev' || url.hostname.endsWith('.thiepn.dev')) && url.protocol === 'https:') return origin;
  } catch (_) {}
  return null;
}

function withCors(response, origin) {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Accept, Content-Type');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    ...extraHeaders
  });
  return new Response(JSON.stringify(data), { status, headers });
}

function resolveBible(pathname) {
  if (pathname === '/v1/niv/tms60') return { slug: 'niv', bible: BIBLES.niv };
  const match = pathname.match(/^\/v1\/bibles\/([a-z0-9-]+)\/tms60$/);
  if (!match) return null;
  const slug = match[1];
  const bible = BIBLES[slug];
  return bible ? { slug, bible } : null;
}

function appendVerseText(map, orgId, text) {
  const id = normalizeText(orgId);
  const piece = normalizeText(text);
  if (!id || !piece) return;
  const previous = map.get(id);
  map.set(id, previous ? `${previous} ${piece}` : piece);
}

function collectVerseText(content) {
  const map = new Map();

  function visit(node, inheritedOrgIds = []) {
    if (Array.isArray(node)) {
      for (const child of node) visit(child, inheritedOrgIds);
      return;
    }
    if (!node || typeof node !== 'object') return;

    const attrs = node.attrs && typeof node.attrs === 'object' ? node.attrs : {};
    let orgIds = inheritedOrgIds;
    if (Array.isArray(attrs.verseOrgIds) && attrs.verseOrgIds.length) orgIds = attrs.verseOrgIds;
    else if (typeof attrs.verseOrgId === 'string' && attrs.verseOrgId) orgIds = [attrs.verseOrgId];
    else if (typeof attrs.verseId === 'string' && attrs.verseId) orgIds = [attrs.verseId];

    if (node.type === 'text' && typeof node.text === 'string' && orgIds.length) {
      for (const orgId of orgIds) appendVerseText(map, orgId, node.text);
    }

    if (Array.isArray(node.items)) visit(node.items, orgIds);
    if (Array.isArray(node.content)) visit(node.content, orgIds);
  }

  visit(content, []);
  return map;
}

function expandTargetIds(passageId) {
  const match = String(passageId).match(/^([1-3]?[A-Z]{2,3})\.(\d+)\.(\d+)(?:-\1\.(\d+)\.(\d+))?$/);
  if (!match) throw new Error(`Unsupported TMS passage id: ${passageId}`);
  const book = match[1];
  const chapter = Number(match[2]);
  const first = Number(match[3]);
  const endChapter = Number(match[4] || match[2]);
  const last = Number(match[5] || match[3]);
  if (chapter !== endChapter) throw new Error(`Cross-chapter TMS target is not supported: ${passageId}`);
  const ids = [];
  for (let verse = first; verse <= last; verse += 1) ids.push(`${book}.${chapter}.${verse}`);
  return ids;
}

async function fetchRange(apiKey, bibleId, rangeId, retryState) {
  const params = new URLSearchParams({
    'content-type': 'json',
    'include-notes': 'false',
    'include-titles': 'false',
    'include-chapter-numbers': 'false',
    'include-verse-numbers': 'true',
    'include-verse-spans': 'true',
    'use-org-id': 'true'
  });

  let attempt = 0;
  while (true) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const response = await fetch(`https://rest.api.bible/v1/bibles/${encodeURIComponent(bibleId)}/passages/${encodeURIComponent(rangeId)}?${params}`, {
        method: 'GET',
        headers: { 'api-key': apiKey, 'Accept': 'application/json' },
        signal: controller.signal
      });

      if (response.ok) {
        const payload = await response.json();
        const verseMap = collectVerseText(payload?.data?.content);
        if (!verseMap.size) throw new Error(`API.Bible returned no verse content for ${rangeId}.`);
        return { verseMap, copyright: normalizeText(payload?.data?.copyright || '') };
      }

      const error = new Error(`API.Bible returned ${response.status} for ${rangeId}.`);
      error.status = response.status;
      const retryable = response.status === 429 || response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504;
      if (!retryable || retryState.remaining <= 0) throw error;
      retryState.remaining -= 1;
      const retryAfter = Number(response.headers.get('Retry-After'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 350 * attempt);
    } catch (error) {
      const status = Number(error?.status || 0);
      const retryable = !status || status === 429 || status >= 500;
      if (!retryable || retryState.remaining <= 0) throw error;
      retryState.remaining -= 1;
      await sleep(350 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
}

async function buildDataset(apiKey, slug, bible) {
  const verseText = new Map();
  let cursor = 0;
  let copyright = '';
  const retryState = { remaining: MAX_RETRY_SUBREQUESTS };

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= FETCH_RANGES.length) return;
      const rangeId = FETCH_RANGES[index];
      const result = await fetchRange(apiKey, bible.id, rangeId, retryState);
      for (const [orgId, text] of result.verseMap) appendVerseText(verseText, orgId, text);
      if (!copyright && result.copyright) copyright = result.copyright;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const results = PASSAGES.map(([id, passageId]) => {
    const targetIds = expandTargetIds(passageId);
    const pieces = targetIds.map(orgId => verseText.get(orgId)).filter(Boolean);
    if (pieces.length !== targetIds.length) {
      const missing = targetIds.filter(orgId => !verseText.get(orgId));
      const error = new Error(`API.Bible dataset is missing ${missing.join(', ')}.`);
      error.status = 422;
      throw error;
    }
    return { id, text: normalizeText(pieces.join(' ')) };
  });

  if (results.length !== 60 || results.some(item => !item?.text)) throw new Error(`The ${bible.short} TMS dataset was incomplete.`);
  return {
    version: slug,
    bible: { id: bible.id, short: bible.short, name: bible.name },
    verses: results,
    copyright,
    fetchedAt: new Date().toISOString()
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = corsOrigin(request, env);

    if (request.method === 'OPTIONS') {
      if (origin === null) return json({ error: 'Origin not allowed.' }, 403);
      return withCors(new Response(null, { status: 204 }), origin);
    }

    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { 'Allow': 'GET, OPTIONS' });

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'tms60-bible-api',
        build: WORKER_BUILD,
        versions: Object.keys(BIBLES),
        apiKeyConfigured: Boolean(env.API_BIBLE_KEY),
        fetchStrategy: `${FETCH_RANGES.length} grouped API.Bible ranges`,
        maxExternalSubrequests: FETCH_RANGES.length + MAX_RETRY_SUBREQUESTS
      }, 200, { 'Cache-Control': 'no-store' });
    }

    const resolved = resolveBible(url.pathname);
    if (!resolved) return json({ error: 'Not found.', build: WORKER_BUILD }, 404);
    if (origin === null) return json({ error: 'Origin not allowed.' }, 403);
    if (!env.API_BIBLE_KEY) {
      console.error(JSON.stringify({ event: 'bible_proxy_error', reason: 'missing_api_key', build: WORKER_BUILD }));
      return withCors(json({ error: 'Bible service is not configured.', code: 'missing_api_key' }, 503, { 'Cache-Control': 'no-store' }), origin);
    }

    const { slug, bible } = resolved;
    const cache = caches.default;
    const canonicalPath = `/v1/bibles/${slug}/tms60`;
    const cacheKey = new Request(`${url.origin}${canonicalPath}`, { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) return withCors(cached, origin);

    try {
      const dataset = await buildDataset(env.API_BIBLE_KEY, slug, bible);
      const response = json(dataset, 200, {
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'CDN-Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'X-TMS-Worker-Build': WORKER_BUILD
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      console.log(JSON.stringify({ event: 'bible_dataset_refresh', version: slug, verses: dataset.verses.length, upstreamRequests: FETCH_RANGES.length, build: WORKER_BUILD }));
      return withCors(response, origin);
    } catch (error) {
      const status = Number(error?.status || 0);
      const upstreamAuth = status === 401 || status === 403;
      const rateLimited = status === 429;
      const invalidDataset = status === 422;
      console.error(JSON.stringify({
        event: 'bible_proxy_error',
        version: slug,
        reason: upstreamAuth ? 'upstream_auth' : rateLimited ? 'upstream_rate_limit' : invalidDataset ? 'dataset_mapping' : 'upstream_failure',
        status: status || undefined,
        message: String(error?.message || error).slice(0, 500),
        build: WORKER_BUILD
      }));
      const message = upstreamAuth
        ? `${bible.short} authorization needs attention.`
        : rateLimited
          ? `${bible.short} is temporarily rate-limited. Please try again shortly.`
          : invalidDataset
            ? `${bible.short} returned an incomplete verse mapping.`
            : `${bible.short} is temporarily unavailable.`;
      return withCors(json({ error: message, code: upstreamAuth ? 'upstream_auth' : rateLimited ? 'rate_limited' : invalidDataset ? 'dataset_mapping' : 'upstream_failure' }, 502, { 'Cache-Control': 'no-store' }), origin);
    }
  }
};