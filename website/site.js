(() => {
  // Pets (just Kitten) is fully removed from the website's own nav — not worth a category pill,
  // a quick-pick tag, or a showcase section for one item. The catalog entry itself is untouched
  // (the app still shows it); this just keeps it out of every website UI surface.
  const CATEGORIES = ['Charms', 'Rituals', 'Atmosphere'];
  const SHOWCASE_CATEGORIES = ['Charms', 'Rituals', 'Atmosphere'];
  const START_ID = 'maneki-neko';

  // Not ready to show yet: placeholder art, emoji stand-ins, unfinished rituals.
  const HIDDEN_IDS = new Set(['clover', 'star', 'heart', 'bell', 'dragon', 'puppy']);

  // Atmosphere has no artwork of its own, so it gets a line icon.
  const ICONS = { snowfall: 'snowflake', rainfall: 'cloud-rain', 'autumn-leaves': 'leaf' };

  // Quick picks cut into the stage's bottom-right corner.
  const QUICK = [
    ['snowfall', 'Snowfall'],
    ['rainfall', 'Rainfall'],
    ['autumn-leaves', 'Leaves'],
    ['coconut-break', 'Coconut'],
    ['lamp-lighting', 'Lamp'],
  ];

  const SECTIONS = {
    Charms: { blurb: 'Hang one from the top of your screen. Drag it, flick it, and watch it swing.', layout: 'charms' },
    Rituals: { blurb: 'Small ceremonies, played out on your desktop. Click to begin.', layout: 'wide' },
    Atmosphere: { blurb: 'Weather that falls across your whole screen and parts around your cursor.', layout: 'mood' },
  };

  const params = new URLSearchParams(location.search);
  const theme = params.get('theme');
  if (theme === 'orange' || theme === 'green' || theme === 'wallpaper') document.body.dataset.theme = theme;

  const $ = (id) => document.getElementById(id);

  /* ───────── Light/dark mode ─────────
     The actual color switch happens in CSS (see site.css's [data-mode] rules) and, for the very
     first paint, an inline script in <head> — this only owns the toggle button and keeping the
     page in sync with a live OS theme change while the visitor hasn't picked one explicitly. */
  function initModeToggle() {
    const button = $('modeToggle');
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = (resolved) => {
      root.dataset.modeResolved = resolved;
      button.setAttribute('aria-label', resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    };
    apply(root.dataset.modeResolved || 'light');

    button.addEventListener('click', () => {
      const next = root.dataset.modeResolved === 'dark' ? 'light' : 'dark';
      root.dataset.mode = next; // an explicit choice from here on, overriding the OS setting
      try {
        localStorage.setItem('mode', next);
      } catch {}
      apply(next);
    });

    // Only matters pre-choice: once the visitor has clicked the toggle, data-mode is set and
    // this system-level event no longer changes anything (matching the <head> script's own logic).
    media.addEventListener('change', (event) => {
      if (!root.dataset.mode) apply(event.matches ? 'dark' : 'light');
    });
  }
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let items = [];
  let byCategory = {};
  let activeId = null;

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function icon(name, className = 'ic') {
    const node = make('i', className);
    node.style.setProperty('--i', `url(icons/${name}.svg)`);
    return node;
  }

  const activeItem = () => items.find((item) => item.id === activeId);

  function originFor(item) {
    return item.origin && item.origin !== 'Sample item' ? item.origin : item.category;
  }

  function shortHint(item) {
    switch (item.type) {
      case 'charm':
        return 'Drag it, or give it a flick';
      case 'effect':
        return 'Move your cursor through it';
      case 'pet':
        return 'Click to give it a pat';
      case 'ritual':
        if (item.ritual?.persistent) return 'It stays lit. Drag it anywhere';
        return item.ritual?.label ? `Click to ${item.ritual.label.charAt(0).toLowerCase()}${item.ritual.label.slice(1)}` : 'Drag it anywhere';
      default:
        return '';
    }
  }

  // Artwork for a card: the item's own image, a stacked preview for chain charms (the lemon
  // and chilies), or a glyph — the system emoji font renders these as full illustrations
  // (not flat icons), so they read closer to real art than the plain line-icon fallback below,
  // which now only fires for the rare item with neither an image nor a glyph.
  function artFor(item, stackScale = 0.8) {
    const art = make('div', item.category === 'Atmosphere' ? 'art art-mini' : 'art');

    if (item.chain) {
      const stack = make('div', 'stack');
      const push = (src, height, rotation = 0) => {
        const img = make('img');
        img.src = src;
        img.alt = '';
        img.loading = 'lazy';
        img.draggable = false;
        img.style.height = `${Math.round(height * stackScale)}px`;
        if (rotation) img.style.transform = `rotate(${rotation}deg)`;
        img.style.marginTop = stack.children.length ? `${Math.round(-3 * stackScale)}px` : '0';
        stack.appendChild(img);
      };
      item.chain.forEach((link) => push(link.image, link.height, link.baseRotation));
      push(item.image, item.imageHeight ?? 72);
      if (item.belowImage) push(item.belowImage.image, item.belowImage.height);
      art.appendChild(stack);
      return art;
    }

    const src = item.image || item.pet?.rig;
    if (src) {
      const img = make('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      img.draggable = false;
      art.appendChild(img);
    } else if (item.glyph) {
      art.appendChild(make('span', 'glyph', item.glyph));
    } else {
      art.appendChild(icon(ICONS[item.id] || 'leaf', 'ic icon'));
    }
    return art;
  }

  /* ───────── Hero: pills, faces, tray, quick picks, chips ───────── */

  function renderPills() {
    const nav = $('pillnav');
    nav.innerHTML = '';
    const current = activeItem()?.category;
    CATEGORIES.forEach((category) => {
      if (!byCategory[category]?.length) return;
      const button = make('button', null, category);
      button.type = 'button';
      button.setAttribute('aria-current', String(category === current));
      button.addEventListener('click', () => {
        if (category !== activeItem()?.category) select(byCategory[category][0].id);
      });
      nav.appendChild(button);
    });
  }

  function renderFaces() {
    const wrap = $('faces');
    ['drishti-bommai', 'hanuman', 'laughing-buddha'].forEach((id) => {
      const item = items.find((entry) => entry.id === id);
      if (!item) return;
      const face = make('i');
      const img = make('img');
      img.src = item.image;
      img.alt = '';
      face.appendChild(img);
      wrap.appendChild(face);
    });
  }

  function renderTray() {
    const item = activeItem();
    const list = byCategory[item.category];
    const index = list.findIndex((entry) => entry.id === item.id);
    const size = Math.min(3, list.length);
    const start = Math.max(0, Math.min(index - 1, list.length - size));

    const cards = $('trayCards');
    cards.innerHTML = '';
    list.slice(start, start + size).forEach((entry) => {
      const card = make('button', 'tray-card');
      card.type = 'button';
      card.setAttribute('aria-pressed', String(entry.id === item.id));
      card.appendChild(artFor(entry, 0.4));
      card.appendChild(make('em', null, entry.name));
      card.addEventListener('click', () => select(entry.id));
      cards.appendChild(card);
    });

    const count = $('trayCount');
    count.textContent = String(index + 1);
    count.appendChild(make('sup', null, `/${list.length}`));
    $('prev').disabled = $('next').disabled = list.length < 2;
  }

  function step(direction) {
    const item = activeItem();
    const list = byCategory[item.category];
    const index = list.findIndex((entry) => entry.id === item.id);
    select(list[(index + direction + list.length) % list.length].id);
  }

  function renderTags() {
    const tags = $('tags');
    tags.innerHTML = '';
    QUICK.forEach(([id, label]) => {
      if (!items.some((entry) => entry.id === id)) return;
      const button = make('button', null, label);
      button.type = 'button';
      button.dataset.id = id;
      button.addEventListener('click', () => select(id));
      tags.appendChild(button);
    });
  }

  function syncTags() {
    document.querySelectorAll('#tags button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.id === activeId));
    });
  }

  function renderChips() {
    const item = activeItem();
    $('vertName').textContent = item.name;

    const hint = $('chipHint');
    hint.replaceChildren(icon('hand-grabbing'), document.createTextNode(shortHint(item)));
    const origin = $('chipOrigin');
    origin.replaceChildren(document.createTextNode(originFor(item)));

    // Restart the fade so the chips visibly change with the item.
    [hint, origin].forEach((chip) => {
      chip.style.animation = 'none';
      void chip.offsetWidth;
      chip.style.animation = '';
    });
  }

  /* ───────── Below the fold: everything ───────── */

  function galleryCard(item, layout, number) {
    const card = make('button', `card ${layout === 'charms' ? 'tall' : layout === 'mood' ? 'mood' : 'side'}`);
    card.type = 'button';
    card.dataset.id = item.id;
    card.setAttribute('aria-pressed', 'false');
    card.setAttribute('aria-label', `Preview ${item.name}`);

    if (layout === 'charms') {
      card.appendChild(make('span', 'num', String(number).padStart(2, '0')));
      card.appendChild(artFor(item));
      card.appendChild(make('h3', null, item.name));
      card.appendChild(make('p', null, originFor(item)));
    } else if (layout === 'mood') {
      card.appendChild(artFor(item));
      const text = make('div');
      text.appendChild(make('h3', null, item.name));
      text.appendChild(make('p', null, 'Atmosphere'));
      text.appendChild(make('p', 'desc', item.description));
      card.appendChild(text);
    } else {
      card.appendChild(artFor(item));
      const text = make('div', 'txt');
      text.appendChild(make('h3', null, item.name));
      text.appendChild(make('p', null, originFor(item)));
      text.appendChild(make('p', 'desc', item.description));
      card.appendChild(text);
    }

    card.appendChild(make('span', 'now', 'Previewing'));
    card.addEventListener('click', () => {
      select(item.id);
      if (window.scrollY > 40) window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    return card;
  }

  function renderGallery() {
    const main = $('all');
    SHOWCASE_CATEGORIES.forEach((category) => {
      const list = byCategory[category];
      if (!list?.length) return;
      const meta = SECTIONS[category];

      const section = make('section', 'sec reveal');
      section.id = `sec-${category.toLowerCase()}`;
      section.appendChild(make('h2', null, category));
      section.appendChild(make('p', null, meta.blurb));

      const grid = make('div', `grid ${meta.layout}`);
      list.forEach((item, i) => grid.appendChild(galleryCard(item, meta.layout, i + 1)));
      section.appendChild(grid);
      main.appendChild(section);
    });

    if ('IntersectionObserver' in window && !reduceMotion) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('in');
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.08 }
      );
      document.querySelectorAll('.reveal').forEach((node) => observer.observe(node));
    } else {
      document.querySelectorAll('.reveal').forEach((node) => node.classList.add('in'));
    }
  }

  function syncGallery() {
    document.querySelectorAll('.card').forEach((card) => {
      card.setAttribute('aria-pressed', String(card.dataset.id === activeId));
    });
  }

  /* ───────── Selection ───────── */

  function select(id) {
    if (!items.some((entry) => entry.id === id)) return;
    activeId = id;
    renderPills();
    renderTray();
    renderChips();
    syncTags();
    syncGallery();
    window.demoBridge.select(activeItem());
  }

  // The charm hangs perfectly still on load, which reads as a picture rather than an object.
  // A cursor brushing past it goes through the real hover reaction, so it sways once.
  function welcomeSway() {
    const charm = $('charm');
    if (!charm || charm.classList.contains('hidden')) return;
    const rect = charm.getBoundingClientRect();
    const y = rect.top + rect.height * 0.45;
    [-46, -34, -22].forEach((offset, i) => {
      setTimeout(() => {
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: rect.left + offset, clientY: y, bubbles: true }));
      }, i * 40);
    });
  }

  // The wallpaper theme's menu bar shows the visitor's own time, like a real desktop.
  function tickClock() {
    const clock = $('clock');
    if (!clock) return;
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'short' });
    const date = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    clock.textContent = `${day} ${date}   ${time}`;
  }
  tickClock();
  setInterval(tickClock, 30000);

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => window.demoBridge.relayout(), 150);
  });
  $('prev').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));

  // The "Give it a flick" section runs a second, independent live stage (its own overlay engine,
  // in an iframe) — only worth starting once a visitor actually scrolls to it, not from page load
  // alongside the hero's own copy of the same engine.
  function initReplayFrame() {
    const frame = $('replayFrame');
    if (!frame || !frame.dataset.src) return;
    if (!('IntersectionObserver' in window)) {
      frame.src = frame.dataset.src;
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          frame.src = frame.dataset.src;
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(frame);
  }
  initReplayFrame();

  async function init() {
    initModeToggle();
    const response = await fetch('catalog/items.json');
    const catalog = await response.json();
    items = catalog.items.filter((item) => !HIDDEN_IDS.has(item.id));
    CATEGORIES.forEach((category) => {
      byCategory[category] = items.filter((item) => item.category === category);
    });

    const start = items.find((item) => item.id === START_ID) || items[0];
    activeId = start.id;

    renderFaces();
    renderTags();
    renderGallery();
    renderPills();
    renderTray();
    renderChips();
    syncTags();
    syncGallery();

    // The stage's size feeds where charms hang and pets walk, so wait for the typeface before
    // the overlay measures the page.
    await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1200))]);
    window.demoBridge.start(start);
    if (!reduceMotion) setTimeout(welcomeSway, 900);
  }

  init();
})();
