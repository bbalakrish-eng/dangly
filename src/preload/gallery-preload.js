const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('galleryAPI', {
  getCatalog: () => ipcRenderer.invoke('catalog:get'),
  getActiveItem: () => ipcRenderer.invoke('catalog:get-active'),
  selectItem: (item) => ipcRenderer.send('item:select', item),
  resolveAssetPath: (relativePath) => ipcRenderer.invoke('assets:resolve', relativePath),
  getAppearance: (itemId) => ipcRenderer.invoke('appearance:get', itemId),
  setAppearance: (itemId, overrides) => ipcRenderer.send('appearance:set', itemId, overrides),
  resetAppearance: (itemId) => ipcRenderer.send('appearance:reset', itemId),
  getMuted: () => ipcRenderer.invoke('sound:get-muted'),
  setMuted: (muted) => ipcRenderer.send('sound:set-muted', muted),
  onMutedChanged: (callback) => {
    ipcRenderer.on('sound:changed', (_event, muted) => callback(muted));
  },
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('updates:status', (_event, status) => callback(status));
  },
  openDownloadPage: () => ipcRenderer.send('updates:open-download-page'),
  getHideOnFullscreen: () => ipcRenderer.invoke('settings:get-hide-on-fullscreen'),
  setHideOnFullscreen: (value) => ipcRenderer.send('settings:set-hide-on-fullscreen', value),
});
