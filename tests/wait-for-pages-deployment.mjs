import fs from 'node:fs/promises';

const repo = process.env.GITHUB_REPOSITORY || 'thiepn/tms60';
const sha = process.env.GITHUB_SHA;
const token = process.env.GITHUB_TOKEN;
const base = 'https://thiepn.github.io/tms60/';
const timeoutMs = 5 * 60 * 1000;
const pollMs = 5000;
const started = Date.now();

if (!sha) throw new Error('GITHUB_SHA is required');

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {})
};

const criticalAssets = ['enhancements.js', 'sw.js', 'translations.js'];
const expected = new Map();
for (const file of criticalAssets) expected.set(file, await fs.readFile(file, 'utf8'));

function normalize(text) {
  return text.replace(/\r\n/g, '\n').trimEnd();
}

async function getPagesRun() {
  const url = `https://api.github.com/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=50`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`GitHub Actions API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.workflow_runs || []).find(run =>
    run.name === 'pages build and deployment' || run.path === 'dynamic/pages/pages-build-deployment'
  );
}

async function publicAssetsMatch() {
  for (const file of criticalAssets) {
    const url = `${base}${file}?cert_sha=${encodeURIComponent(sha)}&t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) return { ok: false, detail: `${file} HTTP ${res.status}` };
    const actual = await res.text();
    if (normalize(actual) !== normalize(expected.get(file))) {
      return { ok: false, detail: `${file} has not propagated to ${sha.slice(0, 12)}` };
    }
  }
  return { ok: true, detail: 'critical public assets match checkout' };
}

let pagesSucceeded = false;
while (Date.now() - started < timeoutMs) {
  const run = await getPagesRun();
  if (!run) {
    console.log(`Waiting for Pages run for ${sha.slice(0, 12)}...`);
  } else if (run.status !== 'completed') {
    console.log(`Pages run ${run.id}: ${run.status}`);
  } else if (run.conclusion !== 'success') {
    throw new Error(`Pages deployment ${run.id} concluded ${run.conclusion}`);
  } else {
    pagesSucceeded = true;
    const match = await publicAssetsMatch();
    if (match.ok) {
      console.log(`Pages deployment ${run.id} is live for ${sha}: ${match.detail}`);
      process.exit(0);
    }
    console.log(`Pages deployment ${run.id} succeeded; waiting for edge propagation: ${match.detail}`);
  }
  await new Promise(resolve => setTimeout(resolve, pollMs));
}

throw new Error(
  pagesSucceeded
    ? `Pages deployment succeeded but public assets did not match ${sha} within ${timeoutMs / 1000}s`
    : `No successful Pages deployment for ${sha} within ${timeoutMs / 1000}s`
);
