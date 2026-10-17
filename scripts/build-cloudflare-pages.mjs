#!/usr/bin/env node
// Build public browser assets only. No deployment, credentials, API or DNS changes.
import {readdir, readFile, copyFile, mkdir, lstat, rm, writeFile, rename, mkdtemp} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';

const EXT=new Set(['.html','.js','.json','.svg','.png','.webmanifest','.css','.ico','.webp','.woff2']);
// Explicitly approved browser surface. A newly added root .js/.json/.html
// must be reviewed and added here, not silently published to Pages.
export const PUBLIC_ROOT=new Set([
  'account-sync.js','app.html','enhancements-core.js','enhancements-legacy.js',
  'enhancements.js','favicon.svg','guided-learning-chain.js','hub-entry.js',
  'icon-192.png','icon-512.png','index.html','language-switch-hardening.js',
  'localization-completion.js','localization-runtime.js','localization-safe.js',
  'manifest.webmanifest','niv-service.json','p2-5-shell-runtime.js',
  'p2-5-source-prep.js','p2-6-theme-sync.js','p2-8-localized-tts-reference.js',
  'qol-cloze-helpers.js','qol-fast-recall.js','qol-word-navigation.js',
  'rc3-hardening.js','recall-reference-fix.js','runtime-translation-switch.js',
  'sw.js','translations.js','typo-scoring-finalizer.js','typo-tolerance.js',
  'ux-patch-core.js','ux-patch.js'
]);
const REQUIRED=['index.html','app.html','sw.js','manifest.webmanifest','niv-service.json','translations.js',
  'account-sync.js','icon-192.png','icon-512.png','vendor/supabase-2.116.0.js','vendor/LICENSE.supabase'];
export const HEADERS=[
  '/*','  X-Content-Type-Options: nosniff','  Referrer-Policy: strict-origin-when-cross-origin','',
  '/sw.js','  Cache-Control: no-store, no-cache, must-revalidate','',
  '/index.html','  Cache-Control: no-cache, must-revalidate','',
  '/','  Cache-Control: no-cache, must-revalidate','',
  '/app.html','  Cache-Control: no-cache, must-revalidate','',
  '/app','  Cache-Control: no-cache, must-revalidate','',
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
export async function stageStaticSite(root=process.cwd(),{beforePublish}={}){
  root=resolve(root);
  const out=join(root,'dist');
  const lock=join(root,'.tms60-cloudflare-stage.lock');
  let temp=null,backup=null,locked=false;
  // mkdir is exclusive across processes. Do not delete an existing lock:
  // it might be an active builder or require owner investigation after crash.
  try{
    await mkdir(lock);locked=true;
  }catch(error){
    if(error.code==='EEXIST')throw Error('Static staging denied: staging lock exists; concurrent build or interrupted owner review');
    throw error;
  }
  try{
  try{
    const s=await lstat(out);
    check(s.isDirectory()&&!s.isSymbolicLink(),'dist is symlink or non-directory');
  }catch(e){if(e.code!=='ENOENT')throw e}
  const files=[];
  for(const entry of await readdir(root,{withFileTypes:true})){
    const ext='.'+entry.name.split('.').at(-1).toLowerCase();
    if(!EXT.has(ext))continue;
    check(entry.isFile()&&!entry.isSymbolicLink(),'unsafe root public asset '+entry.name);
    check(PUBLIC_ROOT.has(entry.name),'unreviewed root web asset: '+entry.name);
    files.push(entry.name);
  }
  const vendor=await lstat(join(root,'vendor'));
  check(vendor.isDirectory()&&!vendor.isSymbolicLink(),'vendored runtime folder must not be a symlink');
  files.push('vendor/supabase-2.116.0.js','vendor/LICENSE.supabase');
  const selected=[...new Set(files)].sort();
  for(const name of PUBLIC_ROOT)check(selected.includes(name),'approved browser asset missing: '+name);
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
  // Prepare a fully verified candidate beside dist on the same filesystem.
  // NEVER delete the previously qualified artifact before this succeeds.
  temp=await mkdtemp(join(root,'.tms60-cloudflare-candidate-'));
  for(const name of selected){
    const source=join(root,name),target=join(temp,name);
    if(name.includes('/'))await mkdir(join(temp,name.split('/')[0]),{recursive:true});
    await copyFile(source,target);
  }
  // Seal every approved public runtime asset, not just the offline CORE.
  // Non-CORE JavaScript and manifest updates must not mix release generations.
  // sw.js is excluded to avoid a self-hash cycle; it commits to this manifest.
  const assets={};
  for(const name of selected.filter(x=>x!=='sw.js')){
    const bytes=await readFile(join(temp,name));
    assets[name]=createHash('sha256').update(bytes).digest('hex');
  }
  // Source + all public runtime bytes determine a distinct versioned cache.
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
  await writeFile(join(temp,'sw.js'),stagedWorker,'utf8');
  await writeFile(join(temp,'tms60-integrity.json'),integrity,'utf8');
  // A concrete 404 keeps Pages from pretending that a missing dependency is
  // a successful SPA navigation. Do not redirect or rewrite user state.
  await writeFile(join(temp,'404.html'),
    '<!doctype html><html lang="en"><meta charset="utf-8"><title>Not found</title><h1>Not found</h1></html>\n','utf8');
  await writeFile(join(temp,'_headers'),HEADERS,'utf8');
  const hashes=[];
  for(const name of ['_headers','404.html','tms60-integrity.json',...selected].sort()){
    const value=await readFile(join(temp,name));
    const sha=createHash('sha256').update(value).digest('hex');
    hashes.push(sha+'  '+name);
  }
  await writeFile(join(temp,'SHA256SUMS'),hashes.join('\n')+'\n','utf8');
  // All artifacts and checksums exist before entering the short commit window.
  if(beforePublish)await beforePublish({candidate:temp,previous:out});
  let exists=false;
  try{await lstat(out);exists=true}catch(error){if(error.code!=='ENOENT')throw error}
  if(exists){
    backup=join(root,'.tms60-cloudflare-previous-'+randomUUID());
    await rename(out,backup);
  }
  try{
    await rename(temp,out);
    temp=null;
  }catch(error){
    if(backup){
      try{await rename(backup,out);backup=null}
      catch(restoreError){
        throw new AggregateError([error,restoreError],
          'Static staging failed and previous artifact needs manual recovery from '+backup);
      }
    }
    throw error;
  }
  if(backup){await rm(backup,{recursive:true,force:true});backup=null}
  return {directory:out,files:['_headers','404.html','tms60-integrity.json','SHA256SUMS',...selected]};
  }finally{
    if(temp)await rm(temp,{recursive:true,force:true});
    // Any remaining backup is intentionally preserved if rollback failed.
    if(locked)await rm(lock,{recursive:true,force:true});
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  stageStaticSite().then(x=>console.log('Staged',x.files.length,'public files in dist (NOT DEPLOYED)'))
    .catch(e=>{console.error(e);process.exitCode=1});
}
