const grid = document.getElementById('grid');
const customInput = document.getElementById('customEmoji');
const useCustomBtn = document.getElementById('useCustom');

let catalog = [];
let activeItem = null;

function renderCatalog() {
  grid.innerHTML = '';
  catalog.forEach((item) => {
    const isActive = activeItem && activeItem.id === item.id;

    const card = document.createElement('div');
    card.className = `card${isActive ? ' active' : ''}`;

    const glyph = document.createElement('div');
    glyph.className = 'glyph';
    glyph.textContent = item.glyph;

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
    grid.appendChild(card);
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
