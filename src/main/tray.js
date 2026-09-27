const { Tray, Menu, app, nativeImage } = require('electron');
const path = require('path');

function createTray({ onOpenGallery, onToggleVisibility }) {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
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
