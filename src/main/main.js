const { app, ipcMain, BrowserWindow, screen, globalShortcut } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { createOverlayWindow, sendActiveItem } = require('./overlay-window');
const { createTray } = require('./tray');
const { createGalleryWindow } = require('./gallery-window');
const { loadCatalog } = require('../shared/catalog');
const { loadSettings, saveSettings } = require('./store');

const TOGGLE_VISIBILITY_SHORTCUT = 'Control+Shift+D';

let overlayWindow = null;
let galleryWindow = null;
let catalog = [];
let settings = null;
let trayHandle = null;

function toggleOverlayVisibility() {
  if (overlayWindow.isVisible()) {
    overlayWindow.hide();
  } else {
    overlayWindow.show();
  }
  trayHandle.syncShowToggle(overlayWindow.isVisible());
}

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

  trayHandle = createTray({ onOpenGallery: openGallery, onToggleVisibility: toggleOverlayVisibility });

  const registered = globalShortcut.register(TOGGLE_VISIBILITY_SHORTCUT, toggleOverlayVisibility);
  if (!registered) {
    console.error(`Failed to register global shortcut: ${TOGGLE_VISIBILITY_SHORTCUT}`);
  }
});

app.on('window-all-closed', () => {
  // Stay resident in the tray/menu bar instead of quitting.
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
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

ipcMain.handle('assets:resolve', (_event, relativePath) => {
  return pathToFileURL(path.join(app.getAppPath(), relativePath)).href;
});
