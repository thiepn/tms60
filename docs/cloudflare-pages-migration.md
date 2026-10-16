# TMS60 GitHub Pages to Cloudflare Pages: owner-controlled migration

Status: PREPARED, NOT DEPLOYED. No automatic Cloudflare deployment, DNS change,
Supabase change, Worker modification or production merge is authorized.
Canonical URL: https://tms60.thiepn.dev/ (MUST NOT CHANGE).
Audited main SHA (2026-10-16): 3ecc39eb517f6cd4d4171046e376fc4108f928c6.
Related draft PR #23 is stacked on an unfinished PWA P2 branch, not main.

## Actual source and connected resource inventory (read-only)

* GitHub main currently runs .github/workflows/gated-pages-release.yml:
  tests candidate before publishing an exact artifact to GitHub Pages on main.
  Preserve it until a separately authorized cutover.
* Cloudflare: Junsosmart account; active thiepn.dev zone; DNS-only
  CNAME tms60.thiepn.dev -> thiepn.github.io, TTL 600.
  There is no existing TMS60 Pages project in that account.
  Worker tms60-niv-api exists with the API_BIBLE_KEY secret binding and
  ALLOWED_ORIGINS binding. The Worker source accepts HTTPS *.thiepn.dev;
  arbitrary *.pages.dev origins are not allowed.
* TMS60 root PWA manifest: id=/, scope=/, start_url=/, standalone.
  index.html registers /sw.js and uses a same-origin srcdoc iframe to host app.html.
  The offline cache and shell must retain consistent update/recovery behavior.
* ESV is bundled; GetBible sources and niv-service.json point to existing
  tms60-niv-api.thiepn.workers.dev. Never copy its API key to the frontend.
* Browser progress keys are per translation; caches, preferences and PKCE
  tokens are stored in same-origin browser storage. An origin change hides
  existing progress; changing hostname/path is not an acceptable migration.
* THIEPN Account Supabase project hycegznamzjhwinegaai is ACTIVE_HEALTHY.
  Live TMS60 migrations are listed. public.tms60_sync_state and
  public.tms60_backups exist with RLS enabled. account-sync.js uses
  a browser publishable key, PKCE/session storage, translation-scoped owner
  binding and local-first sync. Do not copy/delete database rows.

## Implementation in this branch

Run: node scripts/build-cloudflare-pages.mjs (Node 22).
Output directory: dist (for future Cloudflare Pages configuration).
The script copies only root frontend public assets and required vendor runtime
and license, excluding CNAME, SQL, tests, Worker source, workflows and README.
It validates canonical origin, root PWA identity, Bible proxy URL and
refuses symlinks. Generated _headers keep service-worker, shell, manifest
and API configuration from becoming immutable/stale at the CDN layer.
No production source behavior, account contracts or data schema is changed.

The PR workflow runs Node regressions and desktop/mobile Chromium against
a local server serving dist; it stores a downloadable review-only build.
It has read-only GitHub permissions, contains no Cloudflare token or
deployment step, and does not upload the build to Cloudflare.

## Preview deployment: future, needs separate owner authorization

1. Reverify exact HEAD, entire source asset list and compatibility with
   the separate PWA draft PR #23. Qualify no data-loss/offline updates first.
2. Only after owner explicitly approves a PREVIEW deployment, create a
   Cloudflare Pages project connected to thiepn/tms60; build command:
   node scripts/build-cloudflare-pages.mjs ; output: dist ; root: repo root.
   Git integration normally deploys automatically. Configure preview and
   production-branch controls deliberately; do not auto-publish main.
3. Keep live GitHub Pages and the canonical CNAME unchanged. Deploy preview
   only to an isolated Cloudflare Pages preview URL and inspect static
   asset hashes, headers, redirects, root manifest/service worker and caches.
4. CORS caveat: the Bible Worker does NOT allow *.pages.dev. Do not open
   wildcard CORS to solve preview testing. An authorized dedicated
   *.thiepn.dev staging hostname can test Worker integration separately.
5. Auth caveat: Supabase PKCE callback is derived from the current origin.
   Do not allowlist arbitrary Pages previews in production account auth.
   Guest/local-only preview is safe; account preview requires an exact
   reviewed callback and authorization plan. No production user writes.
6. Validate real Chrome Android install/offline/update and browser state,
   translation text, exact account backup/restore authorization, TLS and
   Cloudflare CDN headers before proposing any cutover.

## Cutover gate (NOT authorized by this PR)

Back up/export progress on https://tms60.thiepn.dev while GitHub Pages is
active; retain GitHub Pages CNAME and known-good tested artifact.
Record DNS target thiepn.github.io, proxied=false, TTL=600 before any change.
Confirm owner approval, new Cloudflare deployment URL, domain ownership,
valid certificate, byte-identical static assets, protected sync continuity,
Worker CORS and service-worker update compatibility. Plan rollback by
repointing the SAME hostname to GitHub Pages; never reset localStorage as
a troubleshooting shortcut. Stop after staging until owner authorizes
cutover. DNS caching and previously installed service workers can delay
rollback; verify them explicitly.

## Evidence boundary

Source/cloud account/DNS/Supabase inventory: checked read-only 2026-10-16.
CI, local Chromium, staging builder: pending exact-head workflow evidence.
Cloudflare Pages deploy, live preview, live OAuth callback on new host,
real cross-origin translation preview, physical Android WebAPK,
production cutover and tested rollback: NOT TESTED.
