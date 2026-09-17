const { BrowserWindow, screen } = require('electron');
const path = require('path');

function createOverlayWindow() {
  const { bounds } = screen.getPrimaryDisplay();

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    fullscreenable: false,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  return win;
}

function sendActiveItem(win, item) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('item:changed', item);
  }
}

module.exports = { createOverlayWindow, sendActiveItem };
