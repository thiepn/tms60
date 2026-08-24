'use strict';

const NIV_BIBLE_ID = '78a9f6124f344018-01';
const CACHE_TTL_SECONDS = 14 * 24 * 60 * 60;
const UPSTREAM_TIMEOUT_MS = 12000;
const CONCURRENCY = 5;

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

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://thiepn.github.io')
    .split(',').map(value => value.trim()).filter(Boolean);
}

function corsOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return '';
  if (allowedOrigins(env).includes(origin)) return origin;
  try {
    const url = new URL(origin);
    if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && (url.protocol === 'http:' || url.protocol === 'https:')) return origin;
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

async function fetchPassage(apiKey, passageId) {
  const params = new URLSearchParams({
    'content-type': 'text',
    'include-notes': 'false',
    'include-titles': 'false',
    'include-chapter-numbers': 'false',
    'include-verse-numbers': 'false',
    'include-verse-spans': 'false',
    'use-org-id': 'true'
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(`https://rest.api.bible/v1/bibles/${NIV_BIBLE_ID}/passages/${encodeURIComponent(passageId)}?${params}`, {
      method: 'GET',
      headers: { 'api-key': apiKey, 'Accept': 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) {
      const error = new Error(`API.Bible returned ${response.status} for ${passageId}.`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    const text = normalizeText(payload?.data?.content);
    if (!text) throw new Error(`API.Bible returned empty content for ${passageId}.`);
    return { text, copyright: normalizeText(payload?.data?.copyright || '') };
  } finally {
    clearTimeout(timer);
  }
}

async function buildDataset(apiKey) {
  const results = new Array(PASSAGES.length);
  let cursor = 0;
  let copyright = '';

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= PASSAGES.length) return;
      const [id, passageId] = PASSAGES[index];
      const result = await fetchPassage(apiKey, passageId);
      results[index] = { id, text: result.text };
      if (!copyright && result.copyright) copyright = result.copyright;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  if (results.some(item => !item?.text)) throw new Error('The NIV TMS dataset was incomplete.');
  return { verses: results, copyright, fetchedAt: new Date().toISOString() };
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
      return json({ ok: true, service: 'tms60-niv-api' }, 200, { 'Cache-Control': 'no-store' });
    }

    if (url.pathname !== '/v1/niv/tms60') return json({ error: 'Not found.' }, 404);
    if (origin === null) return json({ error: 'Origin not allowed.' }, 403);
    if (!env.API_BIBLE_KEY) {
      console.error(JSON.stringify({ event: 'niv_proxy_error', reason: 'missing_api_key' }));
      return withCors(json({ error: 'NIV service is not configured.' }, 503, { 'Cache-Control': 'no-store' }), origin);
    }

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/v1/niv/tms60`, { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) return withCors(cached, origin);

    try {
      const dataset = await buildDataset(env.API_BIBLE_KEY);
      const response = json(dataset, 200, {
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'CDN-Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      console.log(JSON.stringify({ event: 'niv_dataset_refresh', verses: dataset.verses.length }));
      return withCors(response, origin);
    } catch (error) {
      const status = Number(error?.status || 0);
      const upstreamAuth = status === 401 || status === 403;
      console.error(JSON.stringify({
        event: 'niv_proxy_error',
        reason: upstreamAuth ? 'upstream_auth' : 'upstream_failure',
        status: status || undefined,
        message: String(error?.message || error).slice(0, 300)
      }));
      return withCors(json({ error: upstreamAuth ? 'NIV service authorization needs attention.' : 'NIV service is temporarily unavailable.' }, 502, { 'Cache-Control': 'no-store' }), origin);
    }
  }
};
