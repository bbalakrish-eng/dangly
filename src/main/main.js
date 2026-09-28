const { app, ipcMain, BrowserWindow, screen, globalShortcut, powerMonitor } = require('electron');
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

// The saved selection is a full copy of the item as it was when picked, so
// using it directly meant an update that changed or renamed an item's files
// (or removed the item) left the user with stale paths and a broken image.
// Look it up by id in the current catalog instead, falling back to the
// first item if it no longer exists.
function resolveActiveItem() {
  const savedId = settings.activeItem?.id;
  return catalog.find((item) => item.id === savedId) || catalog[0] || null;
}

function setActiveItem(item) {
  settings.activeItem = item;
  saveSettings(settings);
  sendActiveItem(overlayWindow, item);
}

function getAppearanceOverride(itemId) {
  return settings.appearanceOverrides[itemId] || {};
}

// Pushed to the overlay whenever the Appearance tab changes something —
// the overlay applies it live (see the 'appearance:changed' handler in
// renderer.js) rather than reloading the whole charm, so a slider drag
// reads as the rope easing to its new length, not a flicker/rebuild.
function notifyAppearanceChanged(itemId) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('appearance:changed', itemId, getAppearanceOverride(itemId));
  }
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

// The overlay window's bounds are only ever set once, at creation, to
// whatever display was primary at that moment (see createOverlayWindow).
// An external monitor commonly disconnects — or is simply slow to
// redetect — across a sleep/wake cycle; when that happens the window
// keeps its old bounds from a display arrangement that may no longer
// exist, so its content (positioned relative to *its own* width/height)
// ends up somewhere that only made sense on the old screen. Re-fetching
// and re-applying the current primary display's bounds keeps the window
// itself in sync before the renderer recalculates anything from
// `window.innerWidth`/`innerHeight`.
function resyncOverlayBounds() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const { bounds } = screen.getPrimaryDisplay();
  const current = overlayWindow.getBounds();
  if (
    current.x !== bounds.x ||
    current.y !== bounds.y ||
    current.width !== bounds.width ||
    current.height !== bounds.height
  ) {
    overlayWindow.setBounds(bounds);
  }
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
  // A transparent, always-on-top, GPU-composited overlay window is
  // exactly the shape of window most likely to have its renderer killed
  // by the OS across a long display sleep (GPU context loss on wake is a
  // known Electron/Chromium failure mode) — reload it if that happens
  // instead of leaving a permanently frozen/blank overlay on screen.
  overlayWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Overlay renderer process gone, reloading:', details);
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.once('did-finish-load', () => {
        sendActiveItem(overlayWindow, resolveActiveItem());
      });
      overlayWindow.reload();
    }
  });
  // `document.visibilitychange` (used renderer-side) tracks window
  // occlusion/minimization, not actual OS sleep — confirmed by testing:
  // a real display sleep left the charm's animation loop frozen with no
  // visibilitychange ever firing to catch it. `powerMonitor` is Electron's
  // dedicated main-process API for genuine system suspend/resume, so it's
  // the one that actually fires here; tell the renderer explicitly so it
  // can force a clean restart of whatever's currently animating.
  function resyncAndNotify() {
    resyncOverlayBounds();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('system:resume');
    }
  }
  powerMonitor.on('resume', () => {
    resyncAndNotify();
    // An external monitor can take a moment to redetect after wake —
    // re-check once more shortly after in case it wasn't back yet on the
    // first pass, and nudge the renderer again if the bounds actually
    // changed as a result.
    setTimeout(() => {
      const before = overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow.getBounds() : null;
      resyncOverlayBounds();
      const after = overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow.getBounds() : null;
      if (before && after && JSON.stringify(before) !== JSON.stringify(after)) {
        overlayWindow.webContents.send('system:resume');
      }
    }, 2000);
  });
  // Covers a monitor being connected/disconnected/reconfigured
  // independent of any sleep cycle too — e.g. unplugging an external
  // monitor and falling back to the laptop's own (smaller) display.
  // Resizing the window alone isn't enough: the charm's rope anchor is
  // computed once from the display width cached in the renderer
  // (`displayInfo`) and never recalculated on its own, so without also
  // telling the renderer to refresh, a charm anchored near the *old*
  // (wider) display's right edge stays at that same x-coordinate — now
  // off the edge of the new, narrower screen entirely. Effects/pets
  // don't use that cached value so they were unaffected, which is why
  // only charms went missing.
  screen.on('display-added', resyncAndNotify);
  screen.on('display-removed', resyncAndNotify);
  screen.on('display-metrics-changed', resyncAndNotify);

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

ipcMain.handle('appearance:get', (_event, itemId) => getAppearanceOverride(itemId));
ipcMain.on('appearance:set', (_event, itemId, overrides) => {
  settings.appearanceOverrides[itemId] = { ...getAppearanceOverride(itemId), ...overrides };
  saveSettings(settings);
  notifyAppearanceChanged(itemId);
});
ipcMain.on('appearance:reset', (_event, itemId) => {
  delete settings.appearanceOverrides[itemId];
  saveSettings(settings);
  notifyAppearanceChanged(itemId);
});

ipcMain.handle('sound:get-muted', () => settings.muted);
ipcMain.on('sound:set-muted', (_event, muted) => {
  settings.muted = muted;
  saveSettings(settings);
  // Both windows can care: the overlay to gate its own Rage Room sound
  // effects, the gallery to keep its mute button in sync if it was toggled
  // from... itself (it's the only place that can toggle it today, but this
  // keeps the two from drifting if that changes).
  if (overlayWindow) overlayWindow.webContents.send('sound:changed', muted);
  if (galleryWindow) galleryWindow.webContents.send('sound:changed', muted);
});

// Rage Room items take over the whole screen's clicks (see renderer.js) —
// Escape asks to leave that mode. Falls back to the first non-rage item
// rather than "nothing selected", since the app has no real "empty" state.
ipcMain.on('rage:exit', () => {
  const fallback = catalog.find((item) => item.type !== 'rage') || catalog[0] || null;
  setActiveItem(fallback);
});

ipcMain.handle('display:get-info', () => {
  const display = screen.getPrimaryDisplay();
  return { bounds: display.bounds, workArea: display.workArea };
});

ipcMain.handle('assets:resolve', (_event, relativePath) => {
  return pathToFileURL(path.join(app.getAppPath(), relativePath)).href;
});
