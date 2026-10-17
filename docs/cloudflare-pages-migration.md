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

## PR #23 source reconciliation / PWA recovery

PR #23 head `56f755d4eff51d40c1b0cd58e2d1247d54a807e6`
was compared against source main. Its full PWA engine cannot be copied onto
this branch because it depends on unmerged `native-pwa.js` and separate P1/P2
artifacts. This branch instead adapts only its compatible SW protocol:

- Active HTML/JS and root navigation are served from a canonical version-pinned
  app cache (URL query parameters cannot mix code or cached icons). Dynamic
  non-core resources remain network-first and the manifest remains network-first.
- A replacement SW installs fully online or aborts, deleting its candidate
  cache without replacing the old installed offline bundle. Old clients are
  not force-activated; activation cleans only old TMS60 cache namespaces.
- First-install partial downloads can still recover. MessageChannel
  TMS60_OFFLINE_STATUS / TMS60_PREPARE_OFFLINE report actual complete/incomplete
  asset readiness; no synthetic mastery or local state rewriting.
- Tests use original main PWA files and a VM fake cache/network to exercise
  interrupted HTTP 503/network update, cache integrity, version pinning and
  delayed activation, plus real staged desktop/mobile Chromium offline boot.
- The **separately owned P1/P2 native installer features** and true physical
  Android behavior remain out of scope and NOT TESTED, not silently replaced.

Cloudflare staging now verifies every SW CORE entry is actually in dist,
guards symlinked vendor paths and assets above Cloudflare Pages Free 25 MiB
per-asset limit, and generates a reproducible SHA256SUMS for reviewers.
This artifact checksum detects corrupted staged bytes but does not prove
that an online future edge deployment is atomically distributed, nor does
it replace real staging acceptance.


## Integrity and read-only preview qualification (migration batch October 17)

The **staged** `dist/sw.js` has a SHA-256 commitment to
`dist/tms60-integrity.json`. The manifest contains exact SHA-256 digests
for every original service-worker CORE file; `./` resolves to index.html
with the same digest. On staged installation, the worker checks its manifest
commitment before requesting CORE and checks every successful network
response's actual bytes before caching. A 200 response from a different
rollout is **not accepted**. Missing, stale or corrupt manifests and
incomplete staged installs abort and delete the candidate cache; existing
TMS60 caches are retained. Original `sw.js` retains a null integrity
sentinel for non-Cloudflare/GitHub Pages builds. This deliberately avoids
rewriting the account, local progress or existing Google Auth contracts.

Staging also creates a minimal `404.html` to prevent Pages' SPA fallback
from falsely returning HTTP 200 for missing assets; a deterministic
`SHA256SUMS` hashes all staged output files except the checksum file.
The `_headers` and origin-owned app shell are unchanged in authority.
The checksum is for reviewer verification, **not cryptographic signing or
a guarantee that Cloudflare has deployed the asset set**. The build itself
never contacts Cloudflare.

### After a separately authorized preview exists

Run the **read-only** checker with an explicit URL:
`TMS60_PREVIEW_URL=https://<approved-project>.pages.dev/ node scripts/check-cloudflare-preview.mjs`
(replace the illustrative hostname with the real approved preview origin).
It rejects the production host, URLs with credentials, non-root paths,
unexpected redirects, and unsupported origins. It checks staged hashes
against the served preview, the worker's sealed manifest, PWA root identity,
canonical hostname, Worker endpoint and CDN `no-store` rules, and verifies
that known non-public paths return 404. It does not execute app scripts,
access authenticated APIs, request OAuth, manipulate DNS or write data.
Loopback acceptance is exercised automatically in CI.

A `pages.dev` preview **cannot** establish the existing Bible Worker CORS
or Google OAuth callback readiness. Signed-in staging needs an approved
exact redirect URL and intentionally isolated test owner; do not weaken
the Worker origin policy or allowlist all Pages preview subdomains.

Cloudflare Pages can automatically deploy Git-integrated pushes. This
branch does NOT create a project or attach a repository. Owner must later
authorize preview creation, approve branch control, and verify that no
Git-linked production publication starts unexpectedly.

### Cutover/rollback evidence fields to fill before any DNS change

- Source commit and checksum artifact, preview deployment ID and domain,
  verified `SHA256SUMS` match and actual `sw.js`/manifest commitments
- Current Cloudflare zone and TMS60 CNAME target `thiepn.github.io`,
  `proxied=false`, TTL 600; hostname remains `tms60.thiepn.dev`
- GitHub Pages last qualified release and rollback release artifact SHA,
  owner-controlled rollback authorization and expected DNS/cache delay
- Consent-backed browser export of local-only learning progress and all
  original translation-specific keys; non-destructive restore rehearsal
- Account OAuth exact production redirect, owner-scoped RLS/Supabase sync,
  translation proxy CORS and original API.Bible license/rights
- Browser installed PWA offline/update compatibility across host cutover
  and genuine Android device evidence from the separate PWA PR #23 gate
- Explicit human sign-off. **NOT TESTED/NO_GO** until independently verified
  after preview authorization. Do not clear site data or migrate records.


## Read-only 2026-10-17 migration completion: owner prerequisites

The remaining preview/cutover tasks require *new explicit authorization*.
Current live DNS is `tms60.thiepn.dev CNAME thiepn.github.io`, DNS-only,
TTL 600 seconds. **Do not remove or repoint it to test a preview.**

### Staged worker and preview hardening

- On a staged build, the service worker now persists the checksum-verified
  release manifest in its own version-specific cache, in addition to the CORE.
  Restarted workers validate that saved manifest against their embedded SHA.
- In an integrity-sealed release, cached CORE reads and runtime cache misses
  compare the response bytes against the saved manifest. A cache miss with a
  200 response containing different code fails closed instead of poisoning
  the installed version. Offline-readiness checks detect corrupted cache data.
- User-initiated `TMS60_PREPARE_OFFLINE` uses the committed manifest and
  cannot repair missing executable code using unverified current-edge bytes
  or previous-version fallback files. Full updates still wait for old
  clients to close. Tests cover candidate and prior-cache retention.
- The preview read-only checker **must** be run with the `dist/SHA256SUMS`
  from a separately qualified candidate, or `TMS60_QUALIFIED_DIST` pointing
  to an unpacked verified artifact. It rejects a preview with a self-consistent
  but DIFFERENT checksum manifest; a hostile preview cannot certify itself.
  Node's HTTPS certificate validation is active. The checker never contacts
  production, OAuth, Bible Worker, Supabase or Cloudflare APIs.
- Exact original Worker CORS logic was exercised locally. Both
  `https://tms60.thiepn.dev` and `https://preview-tms60.thiepn.dev`
  are accepted via the existing HTTPS `*.thiepn.dev` policy, but
  arbitrary `*.pages.dev` URLs are not. This proves source behavior only,
  not the live Worker binding or real cross-origin API response.
- Original `account-sync.js` still derives `redirectTo` from
  `topWindow.location.href`, keeps a PKCE verifier and returns on
  `?tms60_auth=1`. Production callback:
  `https://tms60.thiepn.dev/?tms60_auth=1`. A staging callback must be
  individually approved and registered; no broad preview wildcard or
  per-preview production identity changes. Local-only preview can be
  tested without any signed-in session.

### Owner's gated sequence — no action taken by this PR

1. **Approve a preview only** and document target account/project, permitted
   branch, approval scope, build configuration and whether Cloudflare Git
   integration would trigger automatic production publication. Keep
   `tms60.thiepn.dev` and Github Pages release active.
2. Create a separate preview ONLY after approval, preferably with branch
   deployments explicitly restricted. Retain the new deployment ID, exact
   source SHA and HTTPS URL. Run preview checker against the independently
   reviewed candidate artifact before any account test.
3. Verify live preview TLS certificate, `_headers` behavior, redirects,
   HTTPS/no mixed content and canonical root manifest. The checker automates
   parts of this once an approved endpoint exists; not yet tested on Cloudflare.
4. For signed-in testing, owner must approve an isolated `*.thiepn.dev`
   staging hostname and *exact* OAuth callback in shared Supabase Auth
   settings, or a truly separate authorized test identity/tenant. **Do not
   use real user progress for staging**, enable indiscriminate wildcard
   CORS, or run Supabase migrations.
5. Obtain separate evidence for original local-first progress and translation
   keys (with user consent), RLS-backed account restore, Google sign-in callback,
   Bible Worker CORS and authorized translation rights. Do not expose
   secrets or copy localStorage into issue comments.
6. Test real Android installed PWA update and offline continuity, including
   cross-origin preview limitations. Browser local mocks are not WebAPK proof.
7. Only when all qualification gates pass: obtain **a new cutover approval**
   documenting the current Cloudflare DNS record, expected SSL activation,
   DNS propagation, current GitHub rollback artifact and rollback owner.
   Keep exact hostname and root scope. Do not clear browser site data or
   change the Worker/Supabase identities.
8. Stop if any preview, OAuth, Worker, PWA/device or rollback evidence is absent.
   A future DNS revert is not necessarily instant; installed service workers
   may keep serving an older code bundle during propagation.

**State:** locally source-qualified; Cloudflare Pages preview, edge TLS,
physical installed-client update, live OAuth/Worker/API acceptance and
real production rollback remain **NOT_TESTED / NO_GO**. This PR does not
authorize creating Cloudflare projects, deployments or DNS modifications.


## Cloudflare Pages extensionless HTML routing (2026-10-17)

Cloudflare Pages **automatically redirects** `/index.html` to `/`
and `/app.html` to `/app`; these are different from the unmodified
GitHub Pages/test-server paths. The old migration worker rejected redirected
responses from its CORE install and would fail to install even if every
asset were present. See the official Cloudflare Pages "Serving Pages"
documentation: https://developers.cloudflare.com/pages/configuration/serving-pages/

- The **staged** worker now fetches root HTML from `/` and app HTML from
  `/app`, while caching the byte-verified responses under the original
  `./index.html` and `./app.html` CORE keys. Its source build without a
  release commitment retains original `.html` behavior for GitHub Pages.
- Missing CORE cache entries are recovered through the same verified canonical
  routes. Direct `/app` navigation is served from the pinned app shell
  offline. No installed PWA ID, hostname, account, callback or data key changes.
- The read-only preview checker verifies expected `.html` redirects,
  independently checks the bytes served at `/` and `/app`, and avoids
  mistakenly treating `404.html` (special Pages error document) as an
  ordinary HTTP 200 public asset.
- The CI now serves the built artifact through a **loopback-only** Pages route
  emulator which implements clean HTML redirects and pretty-route resolution.
  Browser/Node acceptance must pass against this stricter Pages behavior
  rather than a permissive Python file server.
- These tests are source-local simulations; actual Cloudflare edge routing,
  HTTPS and domain activation still require separately approved staging.

## Failure-atomic and concurrent staging (October 17 review gate)

The public-only static builder now uses an exclusive `.tms60-cloudflare-stage.lock`
directory. Any overlapping invocation, or an unreviewed leftover lock, fails closed;
it NEVER deletes another builder's lock. It prepares a uniquely named same-filesystem
candidate in `.tms60-cloudflare-candidate-*`, completes all SHA-256 checksums and
static release commitment before publishing, then switches the old `dist` directory
to a uniquely named rollback backup and renames the complete candidate into place.
If the final promotion fails, it attempts to put the old `dist` back before
reporting an error. An unrecoverable rename preserves the backup for manual
owner recovery. Failed prepublication discards only the unqualified candidate.

Node tests exercise interrupted staging, a blocked concurrent writer and a
pre-existing owner lock, verifying the previously qualified dist checksum and
app bytes remain intact. This is a filesystem-level candidate promotion with
a bounded rename window, NOT an atomic multipath transaction that guarantees
readers using dist never briefly observe a missing path. Consumers should
open the review artifact only after the builder successfully exits.
The lock is workspace-local, not a distributed lock across separate runners.

Preview negative tests simulate a successful HTTP 200 with tampered app bytes
despite an unchanged ledger, an unexpected Pages HTML redirect and exposure
of the normally private CNAME path. All must refuse qualification.

Desktop and mobile Chromium additionally exercise simulated same-origin
rollback (staged Cloudflare-like SW to source/GitHub-Pages-like SW). A live
study tab keeps its shell, rollback waits for client closure, settings and
PWA scope remain intact, and the reverted source shell relaunches offline.
This does NOT prove an actual DNS/TLS cutover or physical WebAPK rollback.

As before: NO production deployment, domain change, OAuth configuration,
secrets, Supabase, Bible Worker or other remote writes are authorized.
