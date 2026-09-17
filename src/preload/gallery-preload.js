const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('galleryAPI', {
  getCatalog: () => ipcRenderer.invoke('catalog:get'),
  getActiveItem: () => ipcRenderer.invoke('catalog:get-active'),
  selectItem: (item) => ipcRenderer.send('item:select', item),
});
