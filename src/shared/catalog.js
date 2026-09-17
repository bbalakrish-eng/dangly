const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', '..', 'catalog', 'items.json');

function loadCatalog() {
  const raw = fs.readFileSync(CATALOG_PATH, 'utf-8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.items)) {
    throw new Error('Invalid catalog: "items" must be an array');
  }
  const seenIds = new Set();
  for (const item of data.items) {
    if (!item.id || seenIds.has(item.id)) {
      throw new Error(`Invalid catalog: duplicate or missing id "${item.id}"`);
    }
    seenIds.add(item.id);
  }
  return data.items;
}

module.exports = { loadCatalog, CATALOG_PATH };
