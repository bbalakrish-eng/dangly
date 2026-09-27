(() => {
  // A small, curated set — this section is a second taste of the physics, not another full
  // catalog browse (that's what the hero and the showcase below are for).
  const CHARM_IDS = ['drishti-bommai', 'crescent-lantern', 'maneki-neko', 'evil-eye'];
  const STRINGS = [
    { id: 'gold', label: 'Gold thread', color: '#a8783f' },
    { id: 'silver', label: 'Silver chain', color: '#9aa3ab' },
    { id: 'rose', label: 'Rose cord', color: '#c9808a' },
  ];

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let items = [];
  let activeId = null;
  // Catalog art is sized for the hero's own much taller stage — at that same size here it fills
  // most of this shorter frame, so every charm in this demo starts at a smaller baseline (the
  // slider still moves it from there) rather than at the catalog's literal default.
  let sizeScale = 0.55;

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderPicker() {
    const picker = $('picker');
    picker.innerHTML = '';
    items.forEach((item) => {
      const tile = make('button', 'pick');
      tile.type = 'button';
      tile.setAttribute('aria-pressed', String(item.id === activeId));

      if (item.image) {
        const img = make('img');
        img.src = item.image;
        img.alt = '';
        img.loading = 'lazy';
        img.draggable = false;
        tile.appendChild(img);
      } else if (item.glyph) {
        tile.appendChild(make('span', 'pick-glyph', item.glyph));
      }
      tile.appendChild(make('em', null, item.name));

      tile.addEventListener('click', () => select(item.id));
      picker.appendChild(tile);
    });
  }

  function renderSwatches() {
    const wrap = $('swatches');
    wrap.innerHTML = '';
    STRINGS.forEach((string, i) => {
      const dot = make('button', 'swatch');
      dot.type = 'button';
      dot.style.setProperty('--dot', string.color);
      dot.setAttribute('aria-label', string.label);
      dot.setAttribute('aria-pressed', String(i === 0));
      dot.addEventListener('click', () => {
        document.documentElement.style.setProperty('--string', string.color);
        wrap.querySelectorAll('.swatch').forEach((el) => el.setAttribute('aria-pressed', String(el === dot)));
      });
      wrap.appendChild(dot);
    });
  }

  function select(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    activeId = id;
    document.querySelectorAll('.pick').forEach((tile, i) => {
      tile.setAttribute('aria-pressed', String(items[i].id === id));
    });
    window.miniBridge.select(item);
    window.miniBridge.setAppearance(id, { sizeScale });
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => window.miniBridge.relayout(), 150);
  });

  $('sizeSlider').addEventListener('input', (event) => {
    sizeScale = Number(event.target.value) / 100;
    $('sizeValue').textContent = `${event.target.value}%`;
    if (activeId) window.miniBridge.setAppearance(activeId, { sizeScale });
  });

  // Same idea as the hero: a charm hanging perfectly still reads as a picture, not an object —
  // a cursor brushing past it once goes through the real hover reaction, so it sways on its own.
  function welcomeSway() {
    const charm = $('charm');
    if (!charm || charm.classList.contains('hidden')) return;
    const rect = charm.getBoundingClientRect();
    const y = rect.top + rect.height * 0.45;
    [-42, -30, -18].forEach((offset, i) => {
      setTimeout(() => {
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: rect.left + offset, clientY: y, bubbles: true }));
      }, i * 40);
    });
  }

  function tickClock() {
    const clock = $('clock');
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'short' });
    const date = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    clock.textContent = `${day} ${date}   ${time}`;
  }

  // Starting the physics loop only once this section is actually visible (rather than the
  // instant the page loads) is handled by the parent page: it leaves this iframe's `src` unset
  // until it scrolls into view (see the IntersectionObserver in site.js), so this script simply
  // never runs at all until then — nothing to gate here.
  function start() {
    tickClock();
    setInterval(tickClock, 30000);
    renderSwatches();
    const start = items.find((item) => item.id === 'maneki-neko') || items[0];
    activeId = start.id;
    window.miniBridge.start(start);
    if (!reduceMotion) setTimeout(welcomeSway, 700);
  }

  async function init() {
    const response = await fetch('catalog/items.json');
    const catalog = await response.json();
    items = CHARM_IDS.map((id) => catalog.items.find((item) => item.id === id)).filter(Boolean);
    renderPicker();
    start();
  }

  init();
})();
