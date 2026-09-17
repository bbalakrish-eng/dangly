const { app, ipcMain, BrowserWindow } = require('electron');
const { createOverlayWindow } = require('./overlay-window');
const { createTray } = require('./tray');

let overlayWindow = null;
let tray = null;

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  overlayWindow = createOverlayWindow();
  tray = createTray(overlayWindow);
});

app.on('window-all-closed', () => {
  // Stay resident in the tray/menu bar instead of quitting.
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.setIgnoreMouseEvents(ignore, options);
});
