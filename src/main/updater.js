const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

// Detect-and-link only, never a silent self-install: Squirrel.Mac (the
// installer behind electron-updater's downloadUpdate()/quitAndInstall() on
// macOS) requires the downloaded update to satisfy a code requirement tied
// to the *currently running* app's own signature. We have no paid Apple
// Developer ID, so the app is only ad-hoc signed — and ad-hoc signatures are
// a unique hash per build, so a new build can never satisfy an old build's
// requirement. Confirmed by reproducing it: the download completes, then
// the actual install step fails with "code failed to satisfy specified code
// requirement(s)" and silently reverts to the old version. Rather than
// fight Squirrel.Mac's security model, this just checks for a newer version
// and points the user at the GitHub release to download and drag-install
// themselves, exactly like a first install.
autoUpdater.autoDownload = false;

let statusCallback = null;

function emit(status) {
  if (statusCallback) statusCallback(status);
}

// electron-updater's own error.message is the raw HTTP client error — for a
// failed request that includes the full response, headers and cookies
// inline as text, which is meaningless (and a little embarrassing) shown
// straight to a user. This turns the handful of cases that actually happen
// in practice into one short sentence each; everything else falls back to a
// generic message, with the real error still logged for us to debug.
function friendlyErrorMessage(err) {
  const raw = err?.message || String(err);
  if (/\b404\b/.test(raw)) {
    return "No published updates found for this app yet.";
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo|net::ERR_/i.test(raw)) {
    return "Couldn't reach the update server — check your connection.";
  }
  return "Couldn't check for updates right now.";
}

function initUpdater(onStatus) {
  statusCallback = onStatus;

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => emit({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => emit({ state: 'not-available' }));
  autoUpdater.on('error', (err) => {
    console.error('Update check failed:', err);
    emit({ state: 'error', message: friendlyErrorMessage(err) });
  });
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    emit({ state: 'error', message: "Updates only work in a packaged build, not while running from source." });
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('Update check failed:', err);
    emit({ state: 'error', message: friendlyErrorMessage(err) });
  }
}

module.exports = { initUpdater, checkForUpdates };
