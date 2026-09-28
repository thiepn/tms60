# Google account, sync, and cloud backup setup

TMS60 can optionally synchronize progress through the user's own Google Drive **Application Data** folder. The app remains fully usable without an account.

## What the integration stores

- `tms60-sync-v1.json` — the current merged sync state.
- `tms60-backup-v1-<timestamp>.json` — manual cloud recovery points (the newest 7 are retained by default).

These files live in Google Drive's hidden `appDataFolder`; they do not appear in normal My Drive and are only accessible to this OAuth application.

## 1. Create or select a Google Cloud project

Open Google Cloud Console and select the project that should own TMS60 authentication.

## 2. Enable Google Drive API

Enable **Google Drive API** for the project.

## 3. Configure Google Auth Platform

Create/configure the OAuth consent screen.

Recommended app name: `TMS60 Memory Lab`

For a public deployment, use an External audience. While the app is in testing, add the Google accounts that should be allowed to sign in as test users.

The app requests only:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/drive.appdata`

`drive.appdata` is used only for TMS60's own hidden application data.

## 4. Create a Web OAuth client

Create an OAuth 2.0 Client ID with application type **Web application**.

Add the origins that actually host TMS60 under **Authorized JavaScript origins**. For the current deployment these are normally:

```text
https://thiepn.github.io
https://thiepn.dev
```

For local development, add the exact localhost origin you use, for example:

```text
http://localhost:8000
```

Origins do not include a path such as `/tms60/`.

## 5. Configure TMS60

Open `cloud-config.js` and set the public client ID:

```js
window.TMS60_CLOUD_CONFIG = Object.freeze({
  googleClientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  // ...
});
```

Do **not** commit a Google client secret. This client-side integration does not need one.

## 6. Deploy and verify

After deployment:

1. Open TMS60 over HTTPS.
2. Go to **Settings → Google account & sync**.
3. Choose **Continue with Google**.
4. Grant the requested access.
5. Confirm that **Sync now** reports `Up to date`.
6. Make progress on one device, sync, then connect another device and verify the progress merges.
7. Create a cloud backup, modify progress, then verify the backup restore flow creates a recovery snapshot and restores the selected state.

## Sync behavior

- Local storage remains the first write target.
- Automatic cloud sync is debounced and only runs while a Google session is connected.
- The app downloads the remote state before uploading, merges using TMS60's existing deterministic state merge rules, then verifies once more to reduce simultaneous-device race risk.
- Destructive cloud restore creates both a fresh cloud backup of the current state and a local recovery snapshot first.
- A restored backup receives a new state epoch so the intentional restore wins over stale devices on the next merge.
- Google access tokens are kept in memory only. Reloading or reopening the app can require **Reconnect Google**; local progress is unaffected.
