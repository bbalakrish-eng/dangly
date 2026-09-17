const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  getActiveItem: () => ipcRenderer.invoke('catalog:get-active'),
  onItemChanged: (callback) => {
    ipcRenderer.on('item:changed', (_event, item) => callback(item));
  },
});
