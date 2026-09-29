import fs from 'node:fs';

let failures=0;
const check=(condition,name,detail='')=>{
  console.log(`${condition?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);
  if(!condition)failures++;
};

const index=fs.readFileSync('index.html','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));

check(/<link\b[^>]*rel=["']manifest["'][^>]*href=["']\/tms60\/manifest\.webmanifest["'][^>]*>/i.test(index),
  'Manifest is linked statically from the top-level document');
check(/<meta\b[^>]*name=["']mobile-web-app-capable["'][^>]*content=["']yes["'][^>]*>/i.test(index),
  'Android web-app capability metadata is static');
check(/<link\b[^>]*rel=["']apple-touch-icon["'][^>]*href=["']\/tms60\/icon-192\.png["'][^>]*>/i.test(index),
  'Touch icon is linked statically');
check(/navigator\.serviceWorker\.register\(['"]\/tms60\/sw\.js['"],\{updateViaCache:['"]none['"]\}\)/.test(index),
  'Top-level shell registers the service worker immediately with cache bypass');

check(manifest.display==='standalone','Manifest requests standalone display',manifest.display);
check(manifest.id==='/tms60/','Manifest has a stable app identity',manifest.id);
check(manifest.start_url==='/tms60/','Manifest start URL is scoped to TMS60',manifest.start_url);
check(manifest.scope==='/tms60/','Manifest scope is scoped to TMS60',manifest.scope);
check(Array.isArray(manifest.icons)&&manifest.icons.some(icon=>String(icon.purpose||'').split(/\s+/).includes('maskable')&&icon.sizes==='512x512'),
  'Manifest provides a 512px maskable install icon');

check(index.includes("window.addEventListener('beforeinstallprompt'"),
  'Top-level shell captures the real browser PWA install prompt');
check(index.includes("prompt.prompt()")&&index.includes("prompt.userChoice"),
  'In-app installer invokes the browser install flow');
check(index.includes('id="pwa-install-button"'),
  'Install action exists for browser-confirmed PWA installation');
check(Array.isArray(manifest.icons)&&['192x192','512x512'].every(size=>manifest.icons.some(icon=>icon.sizes===size&&String(icon.purpose||'').split(/\s+/).includes('maskable'))),
  'Both raster install icons are maskable');

process.exitCode=failures?1:0;
