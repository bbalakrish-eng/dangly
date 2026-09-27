const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  activeItem: null,
  // Per-charm user tweaks from the Appearance tab (size, rope length,
  // opacity, hang position), keyed by item id. A charm with no entry here
  // just renders at the catalog's own defaults.
  appearanceOverrides: {},
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings) {
  const settingsPath = getSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

module.exports = { loadSettings, saveSettings };
