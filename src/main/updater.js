const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

// Manual, one-click updates rather than the silent background-download-then-
// prompt flow electron-updater defaults to: nothing happens until the user
// presses "Check for updates" in Settings, and a found update downloads and
// installs on its own from there without a second click.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

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
  autoUpdater.on('update-available', (info) => {
    emit({ state: 'available', version: info.version });
    autoUpdater.downloadUpdate();
  });
  autoUpdater.on('update-not-available', () => emit({ state: 'not-available' }));
  autoUpdater.on('download-progress', (progress) => {
    emit({ state: 'downloading', percent: Math.round(progress.percent) });
  });
  autoUpdater.on('update-downloaded', () => {
    emit({ state: 'downloaded' });
    // A brief pause rather than an instant quit — the status message above
    // is the only warning the user gets that the app is about to relaunch.
    setTimeout(() => autoUpdater.quitAndInstall(), 1500);
  });
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
