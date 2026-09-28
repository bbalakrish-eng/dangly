const { Tray, Menu, app, nativeImage } = require('electron');
const path = require('path');

function createTray({ onOpenGallery, onToggleVisibility }) {
  // A macOS "template image" — a flat black silhouette that AppKit tints to
  // match the menu bar (light or dark) and highlights on click, same as most
  // other menu-bar icons. Already rendered at the exact 18px tray size, with
  // a @2x sibling for Retina that Electron picks automatically — no
  // .resize() needed (forcing one would collapse that pairing to one size).
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-iconTemplate.png');
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip('Desktop Charms');

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
      label: 'Quit Desktop Charms',
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
