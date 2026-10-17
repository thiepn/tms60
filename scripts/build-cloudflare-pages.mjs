#!/usr/bin/env node
// Build public browser assets only. No deployment, credentials, API or DNS changes.
import {readdir, readFile, copyFile, mkdir, lstat, rm, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const EXT=new Set(['.html','.js','.json','.svg','.png','.webmanifest','.css','.ico','.webp','.woff2']);
const REQUIRED=['index.html','app.html','sw.js','manifest.webmanifest','niv-service.json','translations.js',
  'account-sync.js','icon-192.png','icon-512.png','vendor/supabase-2.116.0.js','vendor/LICENSE.supabase'];
export const HEADERS=[
  '/*','  X-Content-Type-Options: nosniff','  Referrer-Policy: strict-origin-when-cross-origin','',
  '/sw.js','  Cache-Control: no-store, no-cache, must-revalidate','',
  '/index.html','  Cache-Control: no-cache, must-revalidate','',
  '/','  Cache-Control: no-cache, must-revalidate','',
  '/app.html','  Cache-Control: no-cache, must-revalidate','',
  '/manifest.webmanifest','  Cache-Control: no-cache, must-revalidate','',
  '/niv-service.json','  Cache-Control: no-store, no-cache, must-revalidate','',
  '/tms60-integrity.json','  Cache-Control: no-store, no-cache, must-revalidate',''
].join('\n');
function check(ok,msg){if(!ok)throw Error('Static staging denied: '+msg)}
async function isSafeFile(path){
  const s=await lstat(path);
  check(s.isFile()&&!s.isSymbolicLink(),'non-regular asset: '+path);
  check(s.size<=25*1024*1024,'Cloudflare Pages asset exceeds 25 MiB: '+path);
}
export async function stageStaticSite(root=process.cwd()){
  root=resolve(root);
  const out=join(root,'dist');
  try{
    const s=await lstat(out);
    check(s.isDirectory()&&!s.isSymbolicLink(),'dist is symlink or non-directory');
  }catch(e){if(e.code!=='ENOENT')throw e}
  const files=[];
  for(const entry of await readdir(root,{withFileTypes:true})){
    const ext='.'+entry.name.split('.').at(-1).toLowerCase();
    if(!EXT.has(ext))continue;
    check(entry.isFile()&&!entry.isSymbolicLink(),'unsafe root public asset '+entry.name);
    check(!['package.json','package-lock.json'].includes(entry.name),'npm metadata must not be served');
    files.push(entry.name);
  }
  const vendor=await lstat(join(root,'vendor'));
  check(vendor.isDirectory()&&!vendor.isSymbolicLink(),'vendored runtime folder must not be a symlink');
  files.push('vendor/supabase-2.116.0.js','vendor/LICENSE.supabase');
  const selected=[...new Set(files)].sort();
  for(const name of REQUIRED)check(selected.includes(name),'missing '+name);
  for(const name of selected)await isSafeFile(join(root,name));
  const workerSource=await readFile(join(root,'sw.js'),'utf8');
  const buildCache=workerSource.match(/const CACHE='([^']+)'/)?.[1];
  check(/^tms60-[a-z0-9-]+-\d{4}-\d{2}-\d{2}$/.test(buildCache||''),'SW release cache is not versioned');
  const sentinel='const RELEASE_INTEGRITY_SHA256=null;';
  check(workerSource.split(sentinel).length===2,'missing or repeated service-worker release sentinel');
  const coreMatch=workerSource.match(/const CORE=\[([^\]]+)\]/);
  check(Boolean(coreMatch),'service worker static CORE inventory missing');
  let core;
  try{core=JSON.parse('['+coreMatch[1].replaceAll("'",'"')+']')}
  catch(_){throw Error('Static staging denied: service worker CORE inventory invalid')}
  check(Array.isArray(core)&&core.length>0,'no PWA CORE assets');
  for(const raw of core){
    check(typeof raw==='string'&&raw.startsWith('./'),'unexpected PWA core path '+raw);
    const name=raw==='./'?'index.html':raw.slice(2);
    check(!name.includes('..')&&selected.includes(name),'PWA offline dependency not staged: '+name);
  }
  const index=await readFile(join(root,'index.html'),'utf8');
  const manifest=JSON.parse(await readFile(join(root,'manifest.webmanifest'),'utf8'));
  const proxy=JSON.parse(await readFile(join(root,'niv-service.json'),'utf8'));
  check(index.includes('https://tms60.thiepn.dev/'),'canonical origin changed');
  check(/serviceWorker\.register\(['"]\/sw\.js['"]/.test(index),'root service worker changed');
  check(manifest.id==='/'&&manifest.start_url==='/'&&manifest.scope==='/'&&manifest.display==='standalone',
    'PWA app identity/start/scope changed');
  check(proxy.baseUrl==='https://tms60-niv-api.thiepn.workers.dev','Bible Worker endpoint changed');
  await rm(out,{recursive:true,force:true});
  await mkdir(out,{recursive:true});
  for(const name of selected){
    const source=join(root,name),target=join(out,name);
    if(name.includes('/'))await mkdir(join(out,name.split('/')[0]),{recursive:true});
    await copyFile(source,target);
  }
  // A deterministic build-bound manifest lets the worker reject complete but
  // mixed-generation Cloudflare responses. It deliberately hashes original
  // public CORE files, not private user data or remote APIs.
  const assets={};
  for(const name of [...new Set(core.map(x=>x==='./'?'index.html':x.slice(2)))].sort()){
    const bytes=await readFile(join(out,name));
    assets[name]=createHash('sha256').update(bytes).digest('hex');
  }
  // Source + all precached bytes determine a distinct versioned cache.
  // This avoids cache collisions when Cloudflare serves a different rollout.
  const fingerprint=createHash('sha256').update(workerSource)
    .update(JSON.stringify(assets)).digest('hex').slice(0,16);
  const cacheDate=buildCache.slice(-10);
  const stageCache='tms60-release-'+fingerprint+'-'+cacheDate;
  const sourceWorkerSha256=createHash('sha256').update(workerSource).digest('hex');
  const integrity=JSON.stringify({schema:1,cache:stageCache,sourceWorkerSha256,assets})+'\n';
  const commitment=createHash('sha256').update(integrity).digest('hex');
  const stagedWorker=workerSource
    .replace("const CACHE='"+buildCache+"';","const CACHE='"+stageCache+"';")
    .replace(sentinel,"const RELEASE_INTEGRITY_SHA256='"+commitment+"';");
  await writeFile(join(out,'sw.js'),stagedWorker,'utf8');
  await writeFile(join(out,'tms60-integrity.json'),integrity,'utf8');
  // A concrete 404 keeps Pages from pretending that a missing dependency is
  // a successful SPA navigation. Do not redirect or rewrite user state.
  await writeFile(join(out,'404.html'),
    '<!doctype html><html lang="en"><meta charset="utf-8"><title>Not found</title><h1>Not found</h1></html>\n','utf8');
  await writeFile(join(out,'_headers'),HEADERS,'utf8');
  const hashes=[];
  for(const name of ['_headers','404.html','tms60-integrity.json',...selected].sort()){
    const value=await readFile(join(out,name));
    const sha=createHash('sha256').update(value).digest('hex');
    hashes.push(sha+'  '+name);
  }
  await writeFile(join(out,'SHA256SUMS'),hashes.join('\n')+'\n','utf8');
  return {directory:out,files:['_headers','404.html','tms60-integrity.json','SHA256SUMS',...selected]};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  stageStaticSite().then(x=>console.log('Staged',x.files.length,'public files in dist (NOT DEPLOYED)'))
    .catch(e=>{console.error(e);process.exitCode=1});
}
