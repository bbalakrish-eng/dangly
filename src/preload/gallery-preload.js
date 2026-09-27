const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('galleryAPI', {
  getCatalog: () => ipcRenderer.invoke('catalog:get'),
  getActiveItem: () => ipcRenderer.invoke('catalog:get-active'),
  selectItem: (item) => ipcRenderer.send('item:select', item),
  resolveAssetPath: (relativePath) => ipcRenderer.invoke('assets:resolve', relativePath),
  getAppearance: (itemId) => ipcRenderer.invoke('appearance:get', itemId),
  setAppearance: (itemId, overrides) => ipcRenderer.send('appearance:set', itemId, overrides),
  resetAppearance: (itemId) => ipcRenderer.send('appearance:reset', itemId),
});
