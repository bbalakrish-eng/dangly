const categoriesEl = document.getElementById('categories');
const customInput = document.getElementById('customEmoji');
const useCustomBtn = document.getElementById('useCustom');

const tabBtnLibrary = document.getElementById('tabBtnLibrary');
const tabBtnAppearance = document.getElementById('tabBtnAppearance');
const panelLibrary = document.getElementById('panelLibrary');
const panelAppearance = document.getElementById('panelAppearance');

const appearanceEmpty = document.getElementById('appearanceEmpty');
const appearanceControls = document.getElementById('appearanceControls');
const appearanceItemName = document.getElementById('appearanceItemName');
const positionStrip = document.getElementById('positionStrip');
const positionPuck = document.getElementById('positionPuck');
const positionPuckGlyph = document.getElementById('positionPuckGlyph');
const positionString = document.getElementById('positionString');
const modeToggle = document.getElementById('modeToggle');
const muteToggle = document.getElementById('muteToggle');
const sizeSlider = document.getElementById('sizeSlider');
const sizeValue = document.getElementById('sizeValue');
const ropeSlider = document.getElementById('ropeSlider');
const ropeValue = document.getElementById('ropeValue');
const opacitySlider = document.getElementById('opacitySlider');
const opacityValue = document.getElementById('opacityValue');
const resetAppearanceBtn = document.getElementById('resetAppearance');

// Where the puck sits when there's no stored position override — the app's
// own catalog default hangs a charm about 200px in from the right edge,
// which reads as "most of the way over" rather than a precise fraction, so
// the puck's unset position is just a visual approximation of that, not a
// value that gets written anywhere until the user actually drags it.
const DEFAULT_ANCHOR_PCT = 0.82;

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

// The card IS the button — the art is what a visitor is actually choosing between, so it should
// be the loudest thing on the card. A separate solid "Choose" pill under a ~60px thumbnail was
// consistently bigger/brighter than the art itself, which is backwards: the button is chrome,
// the charm is the content. The site's own picker cards work the same way (whole tile clickable,
// selection shown as an outline + a small badge, no separate button competing for attention).
function renderCard(item) {
  const isActive = activeItem && activeItem.id === item.id;

  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card';
  card.setAttribute('aria-pressed', String(isActive));
  card.setAttribute('aria-label', isActive ? `${item.name} (selected)` : `Choose ${item.name}`);
  card.disabled = isActive;

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

  card.append(glyph, name, origin, description);

  if (isActive) {
    // A filled checkmark badge in the corner, not a text label — the outline already marks the
    // whole card as selected; a small dot-and-"Selected" caption sitting under the name read as
    // an afterthought and, being tiny and low-contrast by nature, needed real fighting to stay
    // readable in light mode. A solid badge carries its own contrast regardless of card content,
    // the same way Photos/Finder mark a selected item.
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.innerHTML = '<i class="ic" style="--i: url(icons/check.svg)"></i>';
    card.appendChild(badge);
  }

  card.addEventListener('click', () => {
    if (isActive) return;
    window.galleryAPI.selectItem(item);
    activeItem = item;
    renderCatalog();
    loadAppearanceFor(activeItem);
  });

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
  loadAppearanceFor(activeItem);
});

/* ───────── Tabs ───────── */

function selectTab(tab) {
  const onLibrary = tab === 'library';
  tabBtnLibrary.setAttribute('aria-selected', String(onLibrary));
  tabBtnAppearance.setAttribute('aria-selected', String(!onLibrary));
  panelLibrary.classList.toggle('hidden', !onLibrary);
  panelAppearance.classList.toggle('hidden', onLibrary);
  // Refreshed on every visit rather than cached, in case the Library tab
  // switched charms since Appearance was last open.
  if (!onLibrary) loadAppearanceFor(activeItem);
}

tabBtnLibrary.addEventListener('click', () => selectTab('library'));
tabBtnAppearance.addEventListener('click', () => selectTab('appearance'));

/* ───────── Appearance ───────── */

function setPuckPct(pct) {
  positionPuck.style.left = `${pct * 100}%`;
  positionPuckGlyph.style.left = `${pct * 100}%`;
  positionString.style.left = `${pct * 100}%`;
}

// The position strip doubles as a small live preview — it shows the actual charm currently
// being adjusted, not just a plain dot, so dragging it there feels like moving the real thing.
function setPuckArt(item) {
  if (item.image) {
    positionPuckGlyph.classList.add('hidden');
    positionPuck.classList.remove('hidden');
    window.galleryAPI.resolveAssetPath(item.image).then((url) => {
      positionPuck.src = url;
    });
  } else {
    positionPuck.classList.add('hidden');
    positionPuck.removeAttribute('src');
    positionPuckGlyph.textContent = item.glyph || '';
    positionPuckGlyph.classList.remove('hidden');
  }
}

async function loadAppearanceFor(item) {
  // Set before the eligibility check below — otherwise picking a
  // non-charm item (weather, a pet) left this showing whichever charm's
  // name happened to be here last, which reads as the settings still
  // belonging to that charm.
  appearanceItemName.textContent = item ? item.name : '—';

  const eligible = Boolean(item && item.type === 'charm');
  appearanceEmpty.classList.toggle('hidden', eligible);
  appearanceControls.classList.toggle('hidden', !eligible);
  if (!eligible) return;

  const overrides = (await window.galleryAPI.getAppearance(item.id)) || {};

  // A stale response for an item the user has already clicked past — the
  // Library tab's own click handler already started loading the *new*
  // item's overrides, so applying this one now would show the wrong charm's
  // settings for a moment.
  if (!activeItem || activeItem.id !== item.id) return;

  setPuckArt(item);
  const sizePct = Math.round((overrides.sizeScale ?? 1) * 100);
  const ropePct = Math.round((overrides.ropeLengthScale ?? 1) * 100);
  const opacityPct = Math.round((overrides.opacity ?? 1) * 100);
  sizeSlider.value = sizePct;
  sizeValue.textContent = `${sizePct}%`;
  ropeSlider.value = ropePct;
  ropeValue.textContent = `${ropePct}%`;
  opacitySlider.value = opacityPct;
  opacityValue.textContent = `${opacityPct}%`;
  setPuckPct(overrides.anchorXPct ?? DEFAULT_ANCHOR_PCT);
}

function patchAppearance(fragment) {
  if (!activeItem) return;
  window.galleryAPI.setAppearance(activeItem.id, fragment);
}

sizeSlider.addEventListener('input', () => {
  sizeValue.textContent = `${sizeSlider.value}%`;
  patchAppearance({ sizeScale: Number(sizeSlider.value) / 100 });
});

ropeSlider.addEventListener('input', () => {
  ropeValue.textContent = `${ropeSlider.value}%`;
  patchAppearance({ ropeLengthScale: Number(ropeSlider.value) / 100 });
});

opacitySlider.addEventListener('input', () => {
  opacityValue.textContent = `${opacitySlider.value}%`;
  patchAppearance({ opacity: Number(opacitySlider.value) / 100 });
});

resetAppearanceBtn.addEventListener('click', () => {
  if (!activeItem) return;
  window.galleryAPI.resetAppearance(activeItem.id);
  sizeSlider.value = 100;
  sizeValue.textContent = '100%';
  ropeSlider.value = 100;
  ropeValue.textContent = '100%';
  opacitySlider.value = 100;
  opacityValue.textContent = '100%';
  setPuckPct(DEFAULT_ANCHOR_PCT);
});

// Horizontal-only drag (charms only ever hang from the top edge, y is
// fixed) — pointer capture so dragging past the strip's own edges while the
// button is still down keeps tracking instead of stopping at the boundary.
let draggingPuck = false;

function pctFromEvent(event) {
  const rect = positionStrip.getBoundingClientRect();
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
}

positionStrip.addEventListener('pointerdown', (event) => {
  draggingPuck = true;
  positionStrip.setPointerCapture(event.pointerId);
  const pct = pctFromEvent(event);
  setPuckPct(pct);
  patchAppearance({ anchorXPct: pct });
});

positionStrip.addEventListener('pointermove', (event) => {
  if (!draggingPuck) return;
  const pct = pctFromEvent(event);
  setPuckPct(pct);
  patchAppearance({ anchorXPct: pct });
});

positionStrip.addEventListener('pointerup', () => {
  draggingPuck = false;
});

/* ───────── Light/dark mode ─────────
   The actual color switch happens in CSS ([data-mode-resolved] in gallery.css) and, for first
   paint, an inline script in index.html — this only owns the toggle and keeping the window in
   sync with a live OS theme change while the user hasn't picked one explicitly. */
function initModeToggle() {
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const apply = (resolved) => {
    root.dataset.modeResolved = resolved;
    modeToggle.title = resolved === 'dark' ? 'Switch to light' : 'Switch to dark';
  };
  apply(root.dataset.modeResolved || 'light');

  modeToggle.addEventListener('click', () => {
    const next = root.dataset.modeResolved === 'dark' ? 'light' : 'dark';
    root.dataset.mode = next; // an explicit choice from here on, overriding the OS setting
    try {
      localStorage.setItem('mode', next);
    } catch {}
    apply(next);
  });

  media.addEventListener('change', (event) => {
    if (!root.dataset.mode) apply(event.matches ? 'dark' : 'light');
  });
}

/* ───────── Sound ─────────
   One mute flag for every Rage Room sound effect, shared with the overlay via the main process
   (see sound:get-muted/sound:set-muted/sound:changed) so a change here takes effect immediately
   even if a Rage Room item is already active. */
function applyMuted(muted) {
  muteToggle.classList.toggle('muted', muted);
  muteToggle.title = muted ? 'Unmute Rage Room sound effects' : 'Mute Rage Room sound effects';
}

async function initMuteToggle() {
  applyMuted(await window.galleryAPI.getMuted());
  muteToggle.addEventListener('click', () => {
    const next = !muteToggle.classList.contains('muted');
    window.galleryAPI.setMuted(next);
    applyMuted(next);
  });
  window.galleryAPI.onMutedChanged(applyMuted);
}

async function init() {
  initModeToggle();
  initMuteToggle();
  const [items, current] = await Promise.all([
    window.galleryAPI.getCatalog(),
    window.galleryAPI.getActiveItem(),
  ]);
  // Not shown in the picker for now — Kitten is the only Pets item, and a whole category
  // heading for one item reads as filler (same call already made for the website's showcase).
  catalog = items.filter((item) => item.category !== 'Pets');
  activeItem = current;
  renderCatalog();
  loadAppearanceFor(activeItem);
}

init();
