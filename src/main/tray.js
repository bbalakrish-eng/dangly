const { Tray, Menu, app, nativeImage } = require('electron');
const path = require('path');

function createTray({ overlayWindow, onOpenGallery }) {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  const tray = new Tray(icon);
  tray.setToolTip('Desktop Charms');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Gallery…',
      click: () => onOpenGallery(),
    },
    { type: 'separator' },
    {
      label: 'Show Charm',
      type: 'checkbox',
      checked: true,
      click: (menuItem) => {
        if (menuItem.checked) {
          overlayWindow.show();
        } else {
          overlayWindow.hide();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Desktop Charms',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  return tray;
}

module.exports = { createTray };
