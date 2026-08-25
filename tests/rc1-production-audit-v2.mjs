import { chromium } from 'playwright';

const APP_URL = 'https://thiepn.github.io/tms60/';
const WORKER_URL = 'https://tms60-niv-api.thiepn.workers.dev';
const VERSION_KEY = 'tms60-active-translation-v1';
const LANG_KEY = 'tms60-ui-language-v1';
const RESULTS = { passes: [], warnings: [], failures: [], timings: {} };

function pass(name, detail = '') { RESULTS.passes.push({ name, detail }); console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
function fail(name, detail = '') { RESULTS.failures.push({ name, detail }); console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
function check(condition, name, detail = '') { if (condition) pass(name, detail); else fail(name, detail); return condition; }
function overlap(a, b) { return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y); }
function initStorage(lang = 'en', version = 'esv') {
  localStorage.setItem('tms60-onboarding-v2', '1');
  localStorage.setItem('tms60-onboarding-v3', '1');
  localStorage.setItem('tms60-ui-language-v1', lang);
  localStorage.setItem('tms60-active-translation-v1', version);
  localStorage.setItem('tms60-global-theme-v1', JSON.stringify({ appearance: 'light', accent: 'neutral' }));
}
async function fetchJson(url) { const response = await fetch(url, { headers: { Accept: 'application/json' } }); let body = null; try { body = await response.json(); } catch (_) {} return { response, body }; }
async function getAppFrame(page, timeout = 45000) {
  await page.waitForSelector('#app-frame.ready', { timeout });
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const frame = page.frames().find(f => f !== page.mainFrame());
    if (frame) { try { await frame.waitForSelector('#desktop-nav', { timeout: 1500 }); return frame; } catch (_) {} }
    await page.waitForTimeout(100);
  }
  throw new Error('App iframe did not become ready.');
}
async function openApp(browser, { lang = 'en', version = 'esv', viewport = { width: 1440, height: 1000 } } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const runtimeErrors = [], consoleErrors = [], requestHosts = new Set();
  page.on('pageerror', error => runtimeErrors.push(String(error?.stack || error)));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('request', req => { try { requestHosts.add(new URL(req.url()).hostname); } catch (_) {} });
  await page.addInitScript(initStorage, lang, version);
  const started = Date.now();
  const response = await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const frame = await getAppFrame(page);
  const loadMs = Date.now() - started;
  await page.waitForTimeout(500);
  return { context, page, frame, response, runtimeErrors, consoleErrors, requestHosts, loadMs };
}
async function navigate(frame, view) {
  await frame.locator(`#desktop-nav [data-view="${view}"]`).click();
  await frame.waitForFunction(v => document.documentElement.dataset.view === v, view, { timeout: 10000 });
  await frame.waitForTimeout(120);
}
async function bodyText(frame) { return await frame.locator('body').innerText(); }

async function auditWorker() {
  const health = await fetchJson(`${WORKER_URL}/health`);
  check(health.response.ok, 'Worker health HTTP 200', `HTTP ${health.response.status}`);
  check(health.body?.ok === true, 'Worker health payload ok=true');
  check(health.body?.apiKeyConfigured === true, 'Worker API.Bible secret configured');
  check(health.body?.build === '2026-08-25-multibible-4-free-safe', 'Worker expected production build', String(health.body?.build || 'missing'));
  for (const slug of ['niv', 'nlt', 'hfa', 'klb1985']) {
    const started = Date.now();
    const { response, body } = await fetchJson(`${WORKER_URL}/v1/bibles/${slug}/tms60`);
    RESULTS.timings[`worker_${slug}_ms`] = Date.now() - started;
    check(response.ok, `${slug.toUpperCase()} Worker endpoint`, `HTTP ${response.status}`);
    check(Array.isArray(body?.verses) && body.verses.length === 60, `${slug.toUpperCase()} returns 60 passages`, `${body?.verses?.length ?? 'none'}`);
    check(!body?.verses?.some?.(v => !String(v?.text || '').trim()), `${slug.toUpperCase()} passages are non-empty`);
  }
}

async function auditManifest() {
  const response = await fetch(`${APP_URL}manifest.webmanifest`);
  check(response.ok, 'PWA manifest reachable', `HTTP ${response.status}`);
  const manifest = await response.json();
  check(manifest.display === 'standalone', 'PWA manifest uses standalone display', String(manifest.display));
  const sizes = new Set((manifest.icons || []).map(i => i.sizes));
  check(sizes.has('192x192') && sizes.has('512x512'), 'PWA manifest includes 192px and 512px icons');
}

async function auditDesktopCore(browser) {
  const app = await openApp(browser, { lang: 'en', version: 'esv' });
  const { context, page, frame, response, runtimeErrors, consoleErrors, loadMs } = app;
  RESULTS.timings.desktop_initial_load_ms = loadMs;
  check(response?.status() === 200, 'GitHub Pages returns HTTP 200', `HTTP ${response?.status()}`);
  check(loadMs < 15000, 'Initial desktop load under 15s', `${loadMs}ms`);
  check((await frame.locator('#desktop-nav').count()) === 1, 'Desktop navigation rendered once');
  check((await page.locator('#onboarding:not(.hidden)').count()) === 0, 'Existing-user load does not reopen onboarding');

  await navigate(frame, 'settings');
  await frame.waitForSelector('#ui-language-select', { timeout: 10000 });
  await frame.waitForSelector('#shell-version-select', { timeout: 10000 });
  check((await frame.locator('#ui-language-select').count()) === 1, 'Exactly one app-language selector');
  check((await frame.locator('#shell-version-select').count()) === 1, 'Exactly one Bible-version selector');
  check((await frame.locator('#ui-language-settings-card').count()) === 1, 'Exactly one app-language card');
  check((await frame.locator('[data-shell-version-settings]').count()) === 1, 'Exactly one Bible-version card');
  const langBox = await frame.locator('#ui-language-settings-card').boundingBox();
  const bibleBox = await frame.locator('[data-shell-version-settings]').boundingBox();
  if (langBox && bibleBox) {
    check(Math.abs(langBox.y - bibleBox.y) < 32, 'Language and Bible cards share the same row', `y=${Math.round(langBox.y)}/${Math.round(bibleBox.y)}`);
    check(langBox.x < bibleBox.x, 'Language card is left of Bible-version card');
    check(!overlap(langBox, bibleBox), 'Language and Bible cards do not overlap');
  } else fail('Language/Bible settings layout measurable', 'Missing bounding box');

  await frame.locator('#ui-language-select').click(); await page.keyboard.press('Escape');
  await frame.locator('#shell-version-select').click(); await page.keyboard.press('Escape');
  check((await frame.locator('#ui-language-select').count()) === 1 && (await frame.locator('#shell-version-select').count()) === 1, 'Opening both selectors does not detach/recreate controls');

  const navStarted = Date.now();
  for (let i = 0; i < 8; i++) for (const view of ['progress', 'library', 'study', 'settings', 'home']) await navigate(frame, view);
  const navMs = Date.now() - navStarted;
  RESULTS.timings.navigation_stress_ms = navMs;
  check(navMs < 18000, '40-view navigation stress remains responsive', `${navMs}ms`);
  const lag = await frame.evaluate(() => new Promise(resolve => { const t = performance.now(); setTimeout(() => resolve(performance.now() - t), 100); }));
  check(lag < 1000, 'Event loop remains responsive after navigation stress', `${Math.round(lag)}ms for 100ms timer`);

  await navigate(frame, 'settings');
  const exportButton = frame.locator('[data-action="export-json"]');
  if (await exportButton.count()) {
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await exportButton.click();
    const download = await downloadPromise;
    check(Boolean(download), 'Progress JSON export initiates a download', download ? download.suggestedFilename() : 'no download');
  } else fail('Progress export control exists');

  const regs = await page.evaluate(async () => { if (!('serviceWorker' in navigator)) return { supported: false, count: 0 }; await navigator.serviceWorker.ready; const r = await navigator.serviceWorker.getRegistrations(); return { supported: true, count: r.length }; });
  check(regs.supported && regs.count > 0, 'PWA service worker registered', `registrations=${regs.count}`);
  check(runtimeErrors.length === 0, 'No uncaught runtime errors during desktop audit', runtimeErrors.slice(0, 3).join(' | '));
  const relevantConsoleErrors = consoleErrors.filter(x => !/favicon|Failed to load resource.*404/i.test(x));
  check(relevantConsoleErrors.length === 0, 'No relevant console errors during desktop audit', relevantConsoleErrors.slice(0, 3).join(' | '));
  await context.close();
}

const FORBIDDEN_UI = [
  'End active session','Remaining tasks will be discarded.','Assessment record','No pack assessment completed.',
  'Search book, chapter & verse or wording','Recurring word errors','Verses needing attention','Recent review history',
  'How verse progress works','Pack progress','Next seven days','Living the New Life','Proclaiming Christ',
  'Reliance on God’s Resources',"Reliance on God's Resources",'Being Christ’s Disciple',"Being Christ's Disciple",'Growth in Christlikeness',
  'Read slowly, notice the structure','I read the verse aloud slowly.','I said the book, chapter & verse before and after the verse.',
  'I looked away and recalled at least the opening phrase.','Due work is never hidden merely because it exceeds this target.',
  'Removes canonical-order cues.','Interface scale:','Private and offline','Saved locally','All packs','All statuses'
];
async function assertNoKnownEnglish(frame, lang) {
  for (const view of ['progress','library','study','settings']) {
    await navigate(frame, view);
    const text = await bodyText(frame);
    const leaks = FORBIDDEN_UI.filter(s => text.includes(s));
    if (leaks.length) fail(`${lang.toUpperCase()} ${view} has no known English UI leaks`, leaks.join(' | '));
    else pass(`${lang.toUpperCase()} ${view} has no known English UI leaks`);
  }
}
async function switchLanguage(page, frame, lang) {
  await frame.locator('#ui-language-select').selectOption(lang);
  await page.waitForFunction(([key, value]) => localStorage.getItem(key) === value, [LANG_KEY, lang], { timeout: 10000 });
  await page.waitForTimeout(1500);
  return await getAppFrame(page);
}
async function auditLocalizationAndSwitching(browser) {
  const app = await openApp(browser, { lang: 'en', version: 'esv' });
  const { context, page } = app;
  let frame = app.frame;
  await navigate(frame, 'settings');
  for (const lang of ['de','ko']) {
    frame = await switchLanguage(page, frame, lang);
    await navigate(frame, 'settings');
    check(await frame.locator('#ui-language-select').inputValue() === lang, `Language selector switches to ${lang}`);
    const stored = await page.evaluate(key => localStorage.getItem(key), LANG_KEY);
    check(stored === lang, `${lang} language preference persists in localStorage`);
    const navText = await frame.locator('#desktop-nav').innerText();
    const expected = lang === 'de' ? ['Heute','Lernen','Bibliothek','Fortschritt','Einstellungen'] : ['오늘','학습','구절','진행','설정'];
    check(expected.every(x => navText.includes(x)), `${lang.toUpperCase()} primary navigation fully localized`, navText.replace(/\n/g, ' / '));
    await assertNoKnownEnglish(frame, lang);
  }
  frame = await switchLanguage(page, frame, 'en');
  await navigate(frame, 'settings');
  check(await frame.locator('#ui-language-select').inputValue() === 'en', 'Language selector can switch back to English');
  await context.close();
}

async function auditBibleVersions(browser) {
  const versions = [['esv','ESV'],['niv','NIV'],['nlt','NLT'],['hfa','HFA'],['schlachter1951','SCH1951'],['klb1985','KLB 1985'],['krv1961','개역한글']];
  for (const [version, short] of versions) {
    const app = await openApp(browser, { lang: 'en', version });
    const { context, page, frame, runtimeErrors, requestHosts, loadMs } = app;
    RESULTS.timings[`version_${version}_load_ms`] = loadMs;
    const notice = page.locator('#notice.error:not(.hidden)');
    const noticeText = (await notice.count()) ? await notice.innerText() : '';
    check(!noticeText, `${short} loads without production error`, noticeText);
    const brand = await frame.locator('.brand-sub').innerText();
    check(brand.includes(short), `${short} app source activated`, brand);
    const quote = await frame.locator('.quote-mini').first().innerText().catch(() => '');
    check(String(quote).trim().length >= 8, `${short} renders non-empty verse text`, `${String(quote).trim().length} chars`);
    await navigate(frame, 'settings');
    await frame.waitForSelector('#shell-version-select', { timeout: 10000 });
    check(await frame.locator('#shell-version-select').inputValue() === version, `${short} Settings selector reflects active version`);
    const stored = await page.evaluate(key => localStorage.getItem(key), VERSION_KEY);
    check(stored === version, `${short} active version persists`);
    if (['niv','nlt','hfa','klb1985'].includes(version)) {
      check([...requestHosts].some(h => h === 'tms60-niv-api.thiepn.workers.dev'), `${short} client uses secure Worker proxy`);
      check(![...requestHosts].some(h => h === 'rest.api.bible'), `${short} browser never calls API.Bible directly`);
    }
    check(runtimeErrors.length === 0, `${short} produces no uncaught runtime errors`, runtimeErrors.slice(0,2).join(' | '));
    await context.close();
  }
}

async function auditOffline(browser) {
  const app = await openApp(browser, { lang: 'en', version: 'esv' });
  const { context, page } = app;
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await getAppFrame(page);
  await context.setOffline(true);
  let offlineOk = true, detail = '';
  try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }); const frame = await getAppFrame(page, 30000); detail = await frame.locator('.brand-title').innerText(); }
  catch (error) { offlineOk = false; detail = String(error?.message || error); }
  check(offlineOk, 'Bundled ESV app reloads offline through PWA cache', detail);
  await context.setOffline(false);
  await context.close();
}

async function auditMobile(browser) {
  const app = await openApp(browser, { lang: 'en', version: 'esv', viewport: { width: 390, height: 844 } });
  const { context, frame, runtimeErrors } = app;
  check(await frame.locator('.mobile-nav').isVisible(), 'Mobile navigation visible at 390px');
  await frame.locator('.mobile-nav [data-view="settings"]').click();
  await frame.waitForSelector('#ui-language-select');
  const overflow = await frame.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 2, 'Settings has no horizontal overflow on mobile', `${overflow}px`);
  const langBox = await frame.locator('#ui-language-settings-card').boundingBox();
  const bibleBox = await frame.locator('[data-shell-version-settings]').boundingBox();
  if (langBox && bibleBox) check(langBox.width >= 150 && bibleBox.width >= 150, 'Mobile language/Bible controls remain usable widths', `${Math.round(langBox.width)}px/${Math.round(bibleBox.width)}px`);
  check(runtimeErrors.length === 0, 'No uncaught runtime errors on mobile audit', runtimeErrors.slice(0,2).join(' | '));
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await auditWorker();
  await auditManifest();
  await auditDesktopCore(browser);
  await auditLocalizationAndSwitching(browser);
  await auditBibleVersions(browser);
  await auditOffline(browser);
  await auditMobile(browser);
} catch (error) {
  fail('Audit harness completed without fatal interruption', String(error?.stack || error));
} finally { await browser.close(); }
console.log('\n=== RC1 SUMMARY ===');
console.log(JSON.stringify(RESULTS, null, 2));
process.exitCode = RESULTS.failures.length ? 1 : 0;
