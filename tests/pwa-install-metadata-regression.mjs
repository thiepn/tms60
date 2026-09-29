import fs from 'node:fs';

let failures=0;
const check=(condition,name,detail='')=>{
  console.log(`${condition?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);
  if(!condition)failures++;
};

const index=fs.readFileSync('index.html','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const sw=fs.readFileSync('sw.js','utf8');

check(/<link\b[^>]*rel=["']manifest["'][^>]*href=["']manifest\.webmanifest["'][^>]*>/i.test(index),
  'Manifest is linked statically with the Diet-style relative path');
check(/<meta\b[^>]*name=["']mobile-web-app-capable["'][^>]*content=["']yes["'][^>]*>/i.test(index),
  'Android web-app capability metadata is static');
check(/<link\b[^>]*rel=["']apple-touch-icon["'][^>]*href=["']icon-192\.png["'][^>]*>/i.test(index),
  'Touch icon uses the Diet-style relative path');
check(/navigator\.serviceWorker\.register\(['"]\.\/sw\.js['"],\{updateViaCache:['"]none['"]\}\)/.test(index),
  'Top-level shell registers the service worker immediately with cache bypass');

check(manifest.display==='standalone','Manifest requests standalone display',manifest.display);
check(!Object.prototype.hasOwnProperty.call(manifest,'id'),'Manifest lets Chrome compute identity from the stable relative start URL');
check(manifest.start_url==='./','Manifest uses Diet-style relative start URL',manifest.start_url);
check(manifest.scope==='./','Manifest uses Diet-style relative scope',manifest.scope);
check(Array.isArray(manifest.icons)&&['192x192','512x512'].every(size=>manifest.icons.some(icon=>icon.sizes===size&&String(icon.purpose||'').split(/\s+/).includes('maskable'))),
  'Both raster install icons are maskable');

check(index.includes("window.addEventListener('beforeinstallprompt'"),
  'Top-level shell captures the real browser PWA install prompt');
check(index.includes("prompt.prompt()")&&index.includes("prompt.userChoice"),
  'In-app installer invokes the browser install flow');
check(index.includes('id="pwa-install-button"'),
  'Install action exists for browser-confirmed PWA installation');

check(/const CACHE='tms60-[a-z0-9-]+-\d{4}-\d{2}-\d{2}'/.test(sw),
  'TMS60 uses a dated namespaced device cache revision');
check(sw.includes("const MANIFEST_PATH=new URL('./manifest.webmanifest',self.location.href).pathname"),
  'Manifest has a dedicated service-worker route');
check(sw.includes("if(url.pathname===MANIFEST_PATH){event.respondWith(networkFirst(req,event));return}"),
  'Manifest is network-first online instead of permanently cache-first');
check(!/STATIC_ASSETS[^\n]*manifest\.webmanifest/.test(sw),
  'Manifest is excluded from cache-first static assets');
check(sw.includes("fetch(new Request(request,{cache:'no-cache'}))"),
  'Network-first requests revalidate instead of accepting stale browser cache');

process.exitCode=failures?1:0;
