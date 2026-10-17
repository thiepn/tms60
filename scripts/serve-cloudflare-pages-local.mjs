#!/usr/bin/env node
// Local-only Cloudflare Pages route emulator. No deployment, DNS, OAuth,
// Supabase or remote account access. Serves only prebuilt dist files.
import {createServer} from 'node:http';
import {readFile,lstat} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';

const directory=resolve(process.env.TMS60_STATIC_DIR||'dist');
const hostname='127.0.0.1',port=Number(process.env.TMS60_STATIC_PORT||4173);
const mime={
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json',
  '.svg':'image/svg+xml','.png':'image/png','.css':'text/css',
  '.ico':'image/x-icon','.woff2':'font/woff2','.webp':'image/webp'
};
const server=createServer(async(req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){
    res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;
  }
  let pathname;
  try{pathname=new URL(req.url||'/', 'http://127.0.0.1').pathname}
  catch(_){res.writeHead(400);res.end();return}
  if(!/^\/[a-zA-Z0-9/._-]*$/.test(pathname)||pathname.includes('..')){
    res.writeHead(404);res.end();return;
  }
  // Pages automatic .html -> extensionless redirect, including index.html.
  if(pathname==='/index.html'||pathname==='/app.html'){
    const location=pathname==='/index.html'?'/':'/app';
    res.writeHead(308,{Location:location,'Cache-Control':'no-store'});res.end();return;
  }
  let file=pathname==='/'?'index.html':pathname==='/app'?'app.html':pathname.slice(1);
  try{
    const full=join(directory,file),metadata=await lstat(full);
    if(!metadata.isFile()||metadata.isSymbolicLink())throw Error('not a public regular file');
    const payload=await readFile(full),type=mime[extname(file)]||'application/octet-stream';
    res.writeHead(200,{'content-type':type,'cache-control':
      ['sw.js','tms60-integrity.json','niv-service.json'].includes(file)
        ?'no-store, no-cache, must-revalidate':'no-cache, must-revalidate'});
    if(req.method==='HEAD')res.end();
    else res.end(payload);
  }catch(_){
    let notFound='Not found';
    try{notFound=await readFile(join(directory,'404.html'),'utf8')}catch(_){}
    res.writeHead(404,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end(req.method==='HEAD'?'':notFound);
  }
});
server.listen(port,hostname,()=>console.log('LOCAL PAGES ROUTE EMULATOR '+hostname+':'+port+' (no deployment)'));
