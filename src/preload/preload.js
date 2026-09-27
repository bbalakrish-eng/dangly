const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  getActiveItem: () => ipcRenderer.invoke('catalog:get-active'),
  onItemChanged: (callback) => {
    ipcRenderer.on('item:changed', (_event, item) => callback(item));
  },
  getDisplayInfo: () => ipcRenderer.invoke('display:get-info'),
  resolveAssetPath: (relativePath) => ipcRenderer.invoke('assets:resolve', relativePath),
  onSystemResume: (callback) => {
    ipcRenderer.on('system:resume', () => callback());
  },
  getAppearance: (itemId) => ipcRenderer.invoke('appearance:get', itemId),
  onAppearanceChanged: (callback) => {
    ipcRenderer.on('appearance:changed', (_event, itemId, overrides) => callback(itemId, overrides));
  },
});
