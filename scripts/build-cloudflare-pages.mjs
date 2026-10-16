#!/usr/bin/env node
// Build public browser assets only. No deployment, credentials, API or DNS changes.
import {readdir, readFile, copyFile, mkdir, lstat, rm, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';

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
  '/niv-service.json','  Cache-Control: no-store, no-cache, must-revalidate',''
].join('\n');
function check(ok,msg){if(!ok)throw Error('Static staging denied: '+msg)}
async function isSafeFile(path){const s=await lstat(path);check(s.isFile()&&!s.isSymbolicLink(),'non-regular asset: '+path)}
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
  files.push('vendor/supabase-2.116.0.js','vendor/LICENSE.supabase');
  const selected=[...new Set(files)].sort();
  for(const name of REQUIRED)check(selected.includes(name),'missing '+name);
  for(const name of selected)await isSafeFile(join(root,name));
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
  await writeFile(join(out,'_headers'),HEADERS,'utf8');
  return {directory:out,files:['_headers',...selected]};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  stageStaticSite().then(x=>console.log('Staged',x.files.length,'public files in dist (NOT DEPLOYED)'))
    .catch(e=>{console.error(e);process.exitCode=1});
}
