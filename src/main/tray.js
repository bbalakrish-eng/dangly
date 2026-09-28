const { Tray, Menu, app, nativeImage } = require('electron');
const path = require('path');

function createTray({ onOpenGallery, onToggleVisibility }) {
  // A macOS "template image" — a flat black silhouette that AppKit tints to
  // match the menu bar (light or dark) and highlights on click, same as most
  // other menu-bar icons. Already rendered at the exact 18px tray size, with
  // a @2x sibling for Retina that Electron picks automatically — no
  // .resize() needed (forcing one would collapse that pairing to one size).
  const assets = path.join(__dirname, '..', '..', 'assets');
  let icon;
  if (process.platform === 'darwin') {
    icon = nativeImage.createFromPath(path.join(assets, 'tray-iconTemplate.png'));
    icon.setTemplateImage(true);
  } else {
    // Windows/Linux have no template-image tinting: a black silhouette would vanish on a dark
    // taskbar. Use the full-colour app icon instead (so replacing assets/icon.png updates it too).
    icon = nativeImage.createFromPath(path.join(assets, 'icon.png')).resize({ width: 32, height: 32 });
  }
  const tray = new Tray(icon);
  tray.setToolTip('Dangly');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Choose & Customize…',
      click: () => onOpenGallery(),
    },
    { type: 'separator' },
    {
      id: 'showToggle',
      label: 'Show Charm',
      type: 'checkbox',
      checked: true,
      click: () => onToggleVisibility(),
    },
    { type: 'separator' },
    {
      label: 'Quit Dangly',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);

  function syncShowToggle(visible) {
    const item = contextMenu.getMenuItemById('showToggle');
    if (item) item.checked = visible;
  }

  return { tray, syncShowToggle };
}

module.exports = { createTray };
