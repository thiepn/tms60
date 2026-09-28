'use strict';

/*
 * TMS60 Google cloud sync configuration.
 *
 * The OAuth client ID is public configuration, not a secret. Create a Web
 * application OAuth client in Google Cloud Console, enable Google Drive API,
 * and add the production origins (for example https://thiepn.github.io and
 * https://thiepn.dev) as Authorized JavaScript origins.
 */
window.TMS60_CLOUD_CONFIG = Object.freeze({
  googleClientId: '',
  syncFileName: 'tms60-sync-v1.json',
  backupPrefix: 'tms60-backup-v1-',
  maxCloudBackups: 7,
  autoSyncDebounceMs: 4000,
  autoSyncMinIntervalMs: 15000
});
