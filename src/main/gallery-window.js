const { BrowserWindow } = require('electron');
const path = require('path');

function createGalleryWindow() {
  const win = new BrowserWindow({
    width: 640,
    height: 560,
    resizable: true,
    title: 'Choose a Charm',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'gallery-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'renderer-gallery', 'index.html'));

  return win;
}

module.exports = { createGalleryWindow };
