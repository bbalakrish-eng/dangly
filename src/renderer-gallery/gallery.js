const categoriesEl = document.getElementById('categories');
const customInput = document.getElementById('customEmoji');
const useCustomBtn = document.getElementById('useCustom');

let catalog = [];
let activeItem = null;

function groupByCategory(items) {
  const groups = new Map();
  items.forEach((item) => {
    const category = item.category || 'More';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  });
  return groups;
}

function renderCard(item) {
  const isActive = activeItem && activeItem.id === item.id;

  const card = document.createElement('div');
  card.className = `card${isActive ? ' active' : ''}`;

  const glyph = document.createElement('div');
  glyph.className = 'glyph';
  if (item.image) {
    const img = document.createElement('img');
    img.className = 'glyph-image';
    window.galleryAPI.resolveAssetPath(item.image).then((url) => {
      img.src = url;
    });
    glyph.appendChild(img);
  } else {
    glyph.textContent = item.glyph;
  }

  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = item.name;

  const origin = document.createElement('div');
  origin.className = 'origin';
  origin.textContent = item.origin;

  const description = document.createElement('div');
  description.className = 'description';
  description.textContent = item.description;

  const button = document.createElement('button');
  button.textContent = isActive ? 'Selected' : 'Choose';
  button.disabled = isActive;
  button.addEventListener('click', () => {
    window.galleryAPI.selectItem(item);
    activeItem = item;
    renderCatalog();
  });

  card.append(glyph, name, origin, description, button);
  return card;
}

function renderCatalog() {
  categoriesEl.innerHTML = '';
  const groups = groupByCategory(catalog);

  groups.forEach((items, category) => {
    const section = document.createElement('section');
    section.className = 'category';

    const heading = document.createElement('h2');
    heading.className = 'category-heading';
    heading.textContent = category;

    const grid = document.createElement('div');
    grid.className = 'grid';
    items.forEach((item) => grid.appendChild(renderCard(item)));

    section.append(heading, grid);
    categoriesEl.appendChild(section);
  });
}

useCustomBtn.addEventListener('click', () => {
  const glyph = customInput.value.trim();
  if (!glyph) return;

  const customItem = {
    id: `custom:${glyph}`,
    name: 'Custom',
    origin: 'Yours',
    description: 'Whatever feels lucky to you.',
    type: 'charm',
    glyph,
    ritual: { label: 'Give it a flick', animation: 'flick' },
  };

  window.galleryAPI.selectItem(customItem);
  activeItem = customItem;
  renderCatalog();
});

async function init() {
  const [items, current] = await Promise.all([
    window.galleryAPI.getCatalog(),
    window.galleryAPI.getActiveItem(),
  ]);
  catalog = items;
  activeItem = current;
  renderCatalog();
}

init();
