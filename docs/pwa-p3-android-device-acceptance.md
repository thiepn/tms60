# TMS60 PWA P3 — Android release acceptance

**Qualification state:** NOT TESTED on a physical Android device. This document is a procedure, not certification.

**Source chain:** P1 `3d598638332f651b5d78b32920ceeba785213d26` → P2 `e502a549dfbb51553031e015ca4510993761f133` → P3 branch `feature/native-pwa-p3-device-release-readiness`.

## Candidate custody and preview boundary

1. Download the **p3-candidate-static-site** artifact attached to the successful P3 *candidate acceptance* GitHub Actions run. It contains only the candidate static-site files, `SOURCE-COMMIT.txt`, and `SHA256SUMS`. Check the hash manifest before inspection.
2. Extract into a **separate disposable directory** and serve at the origin root: `python3 -m http.server 4173 --bind 127.0.0.1`. Browse `http://localhost:4173/` on the same computer. This is a local *desktop preview*, NOT a public deployment or proof of Android WebAPK eligibility.
3. A real Android installation needs a device-accessible, secure origin with a root-scoped manifest and worker. **Do not upload this artifact to production, remap tms60.thiepn.dev, reconfigure DNS, or create a preview deployment without explicit approval.** A localhost or emulator Chromium test must not be reported as a physical Chrome/WebAPK acceptance.
4. Use a **new disposable Chrome profile** or test-only device. Do not clear site storage, reset progress, uninstall a live app, import real backups, sign in to THIEPN Account, or use private academic/personal records.

## Physical-device acceptance record (fill in actual evidence)

Record Android version, phone model, Chrome build, test origin, origin's TLS status, exact P3 commit, manifest identity/scope, date and tester. Each check below requires direct observation and a timestamped screenshot/video/log from that device. Mark `PASS`, `FAIL`, or `NOT_TESTED`; **never infer PASS from CI**.

| ID | Test on an actual Android device | Acceptance criteria | Status |
| --- | --- | --- | --- |
| A01 | Open exact candidate HTTPS origin in Chrome | Candidate commit/version established; no redirect to production | NOT_TESTED |
| A02 | Chrome menu → Install app (when offered) | Genuine install offered with expected TMS 60 name and icon; no competing app identity | NOT_TESTED |
| A03 | Launch from the installed home-screen icon | Separate standalone task without browser address bar | NOT_TESTED |
| A04 | Long-press launcher icon → Study / Progress | Shortcut opens matching page; no broken query/redirect | NOT_TESTED |
| A05 | Settings → Prepare offline access | Full 33-file offline bundle reported; fresh install available offline | NOT_TESTED |
| A06 | Turn on airplane mode, force-close and relaunch | Bundled ESV opens and Study works with Wi-Fi/cellular off | NOT_TESTED |
| A07 | Complete test-only learning/practice and relaunch offline | Progress, due state, translation identity and settings persist | NOT_TESTED |
| A08 | Android Back and task/app switcher | Navigation returns to prior view; no accidental loss/reveal during protected recall | NOT_TESTED |
| A09 | Use touch keyboard in recall at 360/390-equivalent width and portrait/landscape | Typing, ratings, bottom navigation, cutout and gesture inset remain usable | NOT_TESTED |
| A10 | Enable 'Keep screen awake' in Study, then background app | Display wake lock releases in background and outside Study; denial is nonfatal | NOT_TESTED |
| A11 | Two open app contexts, request an update | Active exercise continues; installed update waits; closure/relaunch activates full version | NOT_TESTED |
| A12 | Interrupt an update download or return HTTP 503 in an isolated test host | Previously installed complete offline bundle remains usable, without mixed assets | NOT_TESTED |
| A13 | Attempt optional account flow in an authorized disposable test tenant | OAuth returns to correct origin; local-only mode remains functional without sign-in | NOT_TESTED |
| A14 | Inspect app info and installed icon after update | Single TMS60 identity, current icon/scope, no duplicate installed app | NOT_TESTED |

**Do not fake A11/A12 by hitting production.** They require a controlled non-production staging origin with two versioned builds and deliberately simulated failure conditions.

## Evidence and release rule

A release reviewer should attach: source SHA, CI run links, a checksum-verified candidate artifact, exact installation origin, physical device/version metadata, the A01–A14 result sheet with evidence references, and a written list of open regressions. Protect personally identifying device/account material before sharing.

**Release gate:** no physical Android PASS claims without evidence. A01–A10 and A14 must PASS for basic device acceptance; A11–A12 require separately controlled update-failure acceptance; A13 is only applicable after a disposable authorized account environment is available. All unresolved functional FAIL results are blockers. Human approval is mandatory before merging, changing DNS, deploying any preview, or releasing to production. The P3 artifact does not contain a deployable verification stamp and is not proof of readiness by itself.

## Original data boundaries

Local-first progress, translation-specific states, existing verse evidence, revision/snapshot data and THIEPN Account sync are authoritative in the existing app. P3 changes only the service worker and candidate qualification artifacts. The release procedure must not copy or inspect personal backups.
