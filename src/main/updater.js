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
    emit({ state: 'error', message: err?.message || String(err) });
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
    emit({ state: 'error', message: err?.message || String(err) });
  }
}

module.exports = { initUpdater, checkForUpdates };
