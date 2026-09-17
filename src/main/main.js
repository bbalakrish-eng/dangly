const { app, ipcMain, BrowserWindow, screen } = require('electron');
const { createOverlayWindow, sendActiveItem } = require('./overlay-window');
const { createTray } = require('./tray');
const { createGalleryWindow } = require('./gallery-window');
const { loadCatalog } = require('../shared/catalog');
const { loadSettings, saveSettings } = require('./store');

let overlayWindow = null;
let galleryWindow = null;
let catalog = [];
let settings = null;

function resolveActiveItem() {
  return settings.activeItem || catalog[0] || null;
}

function setActiveItem(item) {
  settings.activeItem = item;
  saveSettings(settings);
  sendActiveItem(overlayWindow, item);
}

function openGallery() {
  if (galleryWindow && !galleryWindow.isDestroyed()) {
    galleryWindow.focus();
    return;
  }
  galleryWindow = createGalleryWindow();
  galleryWindow.on('closed', () => {
    galleryWindow = null;
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  catalog = loadCatalog();
  settings = loadSettings();

  overlayWindow = createOverlayWindow();
  overlayWindow.webContents.once('did-finish-load', () => {
    sendActiveItem(overlayWindow, resolveActiveItem());
  });

  createTray({ overlayWindow, onOpenGallery: openGallery });
});

app.on('window-all-closed', () => {
  // Stay resident in the tray/menu bar instead of quitting.
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.setIgnoreMouseEvents(ignore, options);
});

ipcMain.handle('catalog:get', () => catalog);
ipcMain.handle('catalog:get-active', () => resolveActiveItem());
ipcMain.on('item:select', (_event, item) => setActiveItem(item));

ipcMain.handle('display:get-info', () => {
  const display = screen.getPrimaryDisplay();
  return { bounds: display.bounds, workArea: display.workArea };
});
