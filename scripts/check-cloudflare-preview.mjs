#!/usr/bin/env node
// Read-only preview qualification. It fetches static bytes ONLY, never runs app
// JavaScript or talks to OAuth, Supabase, the Bible Worker or production DNS.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const provided=process.env.TMS60_PREVIEW_URL;
if(!provided)throw Error('TMS60_PREVIEW_URL is required (no default production target).');
const origin=new URL(provided);
const local=origin.protocol==='http:'&&['127.0.0.1','localhost'].includes(origin.hostname);
const pages=origin.protocol==='https:'&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.pages\.dev$/.test(origin.hostname);
const staging=origin.protocol==='https:'&&origin.hostname==='preview-tms60.thiepn.dev'&&
  process.env.TMS60_PREVIEW_ALLOW_STAGING==='1';
assert.ok(local||pages||staging,'Only loopback, Cloudflare Pages or explicitly approved staging origins allowed');
assert.ok(origin.pathname==='/'&&!origin.search&&!origin.hash&&!origin.username&&!origin.password,
  'Preview must start at origin root, with no credentials, query or fragment');
assert.notEqual(origin.hostname,'tms60.thiepn.dev','Never test production with preview checker');
const base=origin.origin;
// Remote SHA256SUMS is self-referential without an independently qualified
// local artifact. Refuse preview verification if the baseline is absent.
const expectedLocalLedger=await readFile(join(resolve(process.env.TMS60_QUALIFIED_DIST||'dist'),'SHA256SUMS'));
assert.ok(expectedLocalLedger.length>0,'Independent qualified artifact is empty');
function sha(bytes){return createHash('sha256').update(bytes).digest('hex')}
async function get(path){
  assert.ok(path.startsWith('/')&&!path.startsWith('//')&&!path.includes('..'),'unsafe preview path '+path);
  const response=await fetch(base+path,{
    method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',
    headers:{'Cache-Control':'no-cache','Accept':'*/*'},signal:AbortSignal.timeout(12000)
  });
  assert.ok(![301,302,303,307,308].includes(response.status),'Preview redirected '+path);
  assert.equal(new URL(response.url).origin,base,'Preview unexpectedly changed origin');
  return {status:response.status,headers:response.headers,bytes:Buffer.from(await response.arrayBuffer())};
}
const checksums=await get('/SHA256SUMS');
assert.equal(checksums.status,200,'Candidate checksum artifact is required');
assert.deepEqual(checksums.bytes,expectedLocalLedger,
  'Preview SHA256SUMS differs from exact locally qualified artifact');
const rows=checksums.bytes.toString('utf8').trim().split('\n');
const expected=new Map();
for(const line of rows){
  const match=/^([a-f0-9]{64})  ([a-zA-Z0-9._/-]+)$/.exec(line);
  assert.ok(match,'Malformed checksum ledger entry');
  const path=match[2];
  assert.ok(!path.startsWith('/')&&!path.includes('..')&&!expected.has(path),'Invalid or duplicate filename');
  expected.set(path,match[1]);
}
for(const path of ['sw.js','index.html','app.html','manifest.webmanifest','niv-service.json','tms60-integrity.json']){
  assert.ok(expected.has(path),'Missing required public asset: '+path);
}
const payload=new Map();
for(const [path,digest] of expected){
  // Cloudflare Pages consumes _headers as a control file and need not serve it.
  if(path==='_headers')continue;
  // Always test index bytes through /: Pages may canonicalize /index.html to /.
  const response=await get(path==='index.html'?'/':'/'+path);
  assert.equal(response.status,200,'Preview asset missing '+path);
  assert.equal(sha(response.bytes),digest,'Preview asset differs from tested artifact: '+path);
  payload.set(path,response);
}
const sw=payload.get('sw.js').bytes.toString('utf8');
const integrity=payload.get('tms60-integrity.json').bytes;
const expectedCommitment=sw.match(/const RELEASE_INTEGRITY_SHA256='([a-f0-9]{64})'/)?.[1];
assert.ok(expectedCommitment,'Preview service worker lacks sealed integrity commitment');
assert.equal(expectedCommitment,sha(integrity),'Preview integrity manifest from wrong rollout');
const manifest=JSON.parse(integrity.toString('utf8'));
assert.equal(manifest.cache,sw.match(/const CACHE='([^']+)'/)?.[1]);
assert.equal(manifest.schema,1);
for(const [name,hash] of Object.entries(manifest.assets)){
  assert.equal(expected.get(name),hash,'Service-worker CORE differs from deployed artifact: '+name);
}
const appManifest=JSON.parse(payload.get('manifest.webmanifest').bytes.toString());
assert.equal(appManifest.id,'/');
assert.equal(appManifest.scope,'/');
assert.equal(appManifest.start_url,'/');
const index=payload.get('index.html').bytes.toString();
assert.ok(index.includes('https://tms60.thiepn.dev/'),'Canonical domain was rewritten');
assert.ok(index.includes("serviceWorker.register('/sw.js'"),'Root service worker path changed');
const proxy=JSON.parse(payload.get('niv-service.json').bytes.toString());
assert.equal(proxy.baseUrl,'https://tms60-niv-api.thiepn.workers.dev');
for(const forbidden of ['/CNAME','/worker/src/index.js','/supabase/migrations/20260928194925_tms60_account_sync.sql','/unrelated-route-that-must-404']){
  const response=await get(forbidden);
  assert.equal(response.status,404,'Preview leaked private source or has SPA fallback at '+forbidden);
}
if(!local){
  // Node fetch verifies HTTPS certificate identity and validity.
  for(const file of ['sw.js','tms60-integrity.json','niv-service.json']){
    const cache=payload.get(file).headers.get('cache-control')||'';
    assert.match(cache,/no-store/i,'Edge cache policy missing for '+file);
  }
  assert.match(payload.get('sw.js').headers.get('content-type')||'',/javascript|ecmascript/i,
    'Service worker MIME must be JavaScript');
  assert.match(payload.get('manifest.webmanifest').headers.get('content-type')||'',
    /application\/manifest\+json|application\/json/i,
    'Manifest MIME must be application/manifest+json or JSON');
}
console.log('PASS read-only '+(local?'loopback':'authorized preview')+
  ': '+payload.size+' independently matched asset hashes, sealed SW/core integrity, original canonical origin/PWA/API and 404 isolation');
if(local)console.log('NOT_TESTED Cloudflare edge, HTTPS staging, Worker CORS, OAuth/sync and physical Android');
