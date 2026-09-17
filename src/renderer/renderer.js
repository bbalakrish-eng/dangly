const charm = document.getElementById('charm');
const canvas = document.getElementById('effects');
const pet = document.getElementById('pet');
const petGlyph = pet.querySelector('.pet-glyph');
const charmStringSvg = document.getElementById('charmString');
const charmStringLine = document.getElementById('charmStringLine');
const charmBeadsContainer = document.getElementById('charmBeads');

let currentItem = null;
let particleSystem = null;
let petSystem = null;
let charmPhysics = null;
let charmLoopHandle = null;
let interactiveEl = null; // element eligible for click-through + click reactions
let displayInfo = null;
let breakResetTimer = null;
let flameAnimationHandle = null;

function computeGroundY() {
  if (!displayInfo) return window.innerHeight - 60;
  const insetBottom =
    displayInfo.bounds.y + displayInfo.bounds.height - (displayInfo.workArea.y + displayInfo.workArea.height);
  return window.innerHeight - Math.max(insetBottom, 0) - 16;
}

function resizeEffectsCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeEffectsCanvas();
window.addEventListener('resize', resizeEffectsCanvas);

// A "coin flip" settle animation played ONCE per disturbance (a flick or
// a drag release), not continuously tied to raw velocity every frame —
// reverse-engineered from luckydangle.app's actual shipped JS. Squash
// alone (no lighting cue) reads as a flat cutout folding, not an object
// turning in 3D, so a brightness dip is synced to the same envelope: the
// charm reads as dimmer right when it's most "edge-on" (catching the
// least light), which is what actually sells the 3D illusion.
const FLIP_DURATION = 5.8; // matches the reference's own tuning
function computeFlip(elapsed) {
  const t = Math.min(Math.max(elapsed / FLIP_DURATION, 0), 1);
  if (t <= 0 || t >= 1) return { scaleX: 1, rotation: 0, brightness: 1 };
  const envelope = t * t * (3 - 2 * t); // smoothstep
  const wave = Math.sin(2 * Math.PI * envelope);
  const depth = Math.abs(wave);
  return {
    scaleX: 1 - 0.18 * depth,
    rotation: 1.8 * wave * Math.sin(Math.PI * t),
    brightness: 1 - 0.03 * depth,
  };
}

let triggerCharmFlip = () => {};

function startCharmLoop() {
  stopCharmLoop();
  charmPhysics = window.createCharmPhysics({ initialAnchorX: window.innerWidth - 200, anchorY: 6 });
  charmStringSvg.classList.remove('hidden');

  let flipElapsed = FLIP_DURATION; // start at rest (no flip in progress)
  triggerCharmFlip = () => {
    flipElapsed = 0;
  };

  let lastTime = null;
  function frame(time) {
    if (lastTime === null) lastTime = time;
    const dt = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;

    charmPhysics.setSize(charm.offsetWidth, charm.offsetHeight);
    charmPhysics.update(dt);
    const bob = charmPhysics.render(charmStringLine);
    // The string should end at the charm's TOP (like a real pendant tied
    // through a loop near its top), not its center — otherwise the charm
    // straddles the string's endpoint and looks wrong while swinging/dragging.
    charm.style.left = `${bob.x - charm.offsetWidth / 2}px`;
    // A small deliberate overlap (not bob.y exactly) — verified the string
    // endpoint, the charm's own layout position, and the source image's
    // pixel data all line up exactly with zero gap, but downscaling a
    // ~2100px image to ~200px on screen can visually soften/fade its own
    // edge a couple of pixels via the browser's image interpolation, which
    // doesn't show up when inspecting the source pixels directly. A few
    // pixels of overlap makes the connection visually solid regardless.
    charm.style.top = `${bob.y - 4}px`;
    positionBeads();

    flipElapsed = Math.min(flipElapsed + dt, FLIP_DURATION);
    const flip = computeFlip(flipElapsed);
    // Continuous tilt matching the string's actual current angle — a
    // real hanging object rotates to align with what it's hanging from
    // as it swings, not just translate while staying upright. Separate
    // from (and added to) the brief coin-flip rotation above.
    const swingTilt = Math.max(-35, Math.min(35, charmPhysics.getSwingAngleDegrees()));
    charm.style.transform = `scaleX(${flip.scaleX}) rotate(${flip.rotation + swingTilt}deg)`;
    charm.style.filter = `drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4)) brightness(${flip.brightness})`;

    charmLoopHandle = requestAnimationFrame(frame);
  }
  charmLoopHandle = requestAnimationFrame(frame);
}

function stopCharmLoop() {
  if (charmLoopHandle) cancelAnimationFrame(charmLoopHandle);
  charmLoopHandle = null;
  charmPhysics = null;
  charmStringSvg.classList.add('hidden');
  charm.style.transform = '';
  charm.style.filter = '';
  triggerCharmFlip = () => {};
}

let beadGradientCounter = 0;

// Drawn circles (not emoji) so bead-to-bead spacing can be computed as
// exact radius math (gap = 0 means precisely tangent) instead of guessing
// at imprecise, platform-dependent emoji glyph metrics.
function beadMarkup(bead) {
  const d = bead.radius * 2;
  if (bead.kind === 'eye') {
    return `<svg viewBox="0 0 100 100" width="${d}" height="${d}">
      <circle cx="50" cy="50" r="48" fill="#12224f"/>
      <circle cx="50" cy="50" r="40" fill="#2b5fd9"/>
      <circle cx="50" cy="50" r="30" fill="#eef3fb"/>
      <circle cx="50" cy="50" r="20" fill="#3aa7e0"/>
      <circle cx="50" cy="50" r="10" fill="#0b1530"/>
      <circle cx="46" cy="46" r="3" fill="#ffffff" opacity="0.85"/>
    </svg>`;
  }

  const gradId = `pearlGrad-${beadGradientCounter++}`;
  return `<svg viewBox="0 0 100 100" width="${d}" height="${d}">
    <defs>
      <radialGradient id="${gradId}" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="60%" stop-color="#e7eaf0"/>
        <stop offset="100%" stop-color="#aab1bd"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="47" fill="url(#${gradId})"/>
  </svg>`;
}

function renderBeads(item) {
  charmBeadsContainer.innerHTML = '';
  (item?.beads || []).forEach((bead) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'charm-bead';
    wrapper.style.width = `${bead.radius * 2}px`;
    wrapper.style.height = `${bead.radius * 2}px`;
    wrapper.innerHTML = beadMarkup(bead);
    charmBeadsContainer.appendChild(wrapper);
  });
}

// Rope points are a fixed ~15.5px apart, too coarse for exact pixel
// placement — this interpolates between the two nearest points so a
// fractional "steps from the bob" value lands partway along a segment.
function pointAtStepsFromBob(points, bobIndex, steps) {
  const idx = Math.max(bobIndex - steps, 0);
  const lower = Math.floor(idx);
  const upper = Math.min(Math.ceil(idx), points.length - 1);
  const frac = idx - lower;
  const a = points[lower];
  const b = points[upper];
  if (!a || !b) return a || b;
  return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
}

function positionBeads() {
  const beads = currentItem?.beads;
  if (!beads || !beads.length || !charmPhysics) return;

  const points = charmPhysics.getPoints();
  const segmentLength = charmPhysics.getSegmentLength();
  const bobIndex = points.length - 1;
  const wrappers = charmBeadsContainer.children;

  // Gaps are edge-to-edge in pixels: 0 means the two circles are exactly
  // tangent (touching, no overlap), negative overlaps them (like real
  // threaded beads resting against each other), positive leaves visible
  // space. `beadClearance` is the charm-top-to-nearest-bead gap (the bob
  // point IS the charm's top edge, so no charm radius is involved).
  // `beadGap` is the gap between each pair of beads further up the rope —
  // one number for every gap, or an array read outward from the charm.
  const clearanceGap = currentItem?.beadClearance ?? 5;
  const rawGap = currentItem?.beadGap ?? 0;
  const gapForIndex = (i) => (Array.isArray(rawGap) ? rawGap[i] ?? rawGap[rawGap.length - 1] ?? 0 : rawGap);

  const distFromBob = new Array(beads.length); // px, to each bead's CENTER
  distFromBob[beads.length - 1] = beads[beads.length - 1].radius + clearanceGap;
  for (let i = beads.length - 2; i >= 0; i--) {
    const gapIndex = beads.length - 2 - i;
    distFromBob[i] = distFromBob[i + 1] + beads[i + 1].radius + beads[i].radius + gapForIndex(gapIndex);
  }

  for (let i = 0; i < beads.length; i++) {
    const point = pointAtStepsFromBob(points, bobIndex, distFromBob[i] / segmentLength);
    const wrapper = wrappers[i];
    if (!point || !wrapper) continue;
    wrapper.style.left = `${point.x}px`;
    wrapper.style.top = `${point.y}px`;
  }
}

function renderCharmVisual(item) {
  charm.innerHTML = '';
  clearTimeout(breakResetTimer);

  if (item && item.image) {
    const img = document.createElement('img');
    img.className = item.type === 'ritual' ? 'charm-image ritual-image' : 'charm-image';
    img.draggable = false;
    charm.appendChild(img);
    window.overlayAPI.resolveAssetPath(item.image).then((url) => {
      img.src = url;
    });
    return;
  }

  charm.textContent = item ? item.glyph : '🍀';
}

function teardownCurrent() {
  if (particleSystem) {
    particleSystem.stop();
    particleSystem = null;
  }
  if (petSystem) {
    petSystem.stop();
    petSystem = null;
  }
  stopCharmLoop();
  clearTimeout(breakResetTimer);
  charmBeadsContainer.innerHTML = '';
  charm.classList.add('hidden');
  pet.classList.add('hidden');
  interactiveEl = null;
}

function applyItem(item) {
  currentItem = item;
  teardownCurrent();

  if (!item || item.type === 'charm') {
    charm.classList.remove('hidden');
    renderCharmVisual(item);
    renderBeads(item);
    startCharmLoop();
    interactiveEl = charm;
    return;
  }

  if (item.type === 'ritual') {
    // Rituals (coconut-breaking, lamp lighting, …) don't hang from a
    // string — they can be dragged freely, and a plain click (no drag)
    // triggers the ritual action.
    charm.classList.remove('hidden');
    renderCharmVisual(item);
    charm.style.left = `${window.innerWidth / 2 - 50}px`;
    charm.style.top = `${window.innerHeight * 0.32}px`;
    interactiveEl = charm;
    return;
  }

  if (item.type === 'effect') {
    // Unlike pets, effects default to the literal bottom of the screen
    // (not the Dock-aware work area) — accumulating snow is meant to
    // reach the real bottom edge and build up from there.
    particleSystem = window.createParticleSystem(canvas, item.effect || {});
    particleSystem.start();
    return;
  }

  if (item.type === 'pet') {
    pet.classList.remove('hidden');
    petGlyph.textContent = item.pet?.rig ? '' : item.glyph;
    petSystem = window.createPetSystem(pet, petGlyph, { ...(item.pet || {}), groundY: computeGroundY() });
    petSystem.start();
    interactiveEl = pet;
  }
}

async function init() {
  displayInfo = await window.overlayAPI.getDisplayInfo();
  const initialItem = await window.overlayAPI.getActiveItem();
  applyItem(initialItem);
}

window.overlayAPI.onItemChanged(applyItem);
init();

let isDragging = false;
let didDrag = false;
let ritualDragOffset = { x: 0, y: 0 };

function updateClickThrough(x, y) {
  const el = document.elementFromPoint(x, y);
  const overInteractive = Boolean(interactiveEl && interactiveEl.contains(el));
  window.overlayAPI.setIgnoreMouseEvents(!overInteractive, { forward: true });
}

document.addEventListener('mousemove', (e) => {
  if (particleSystem) {
    particleSystem.updateCursor(e.clientX, e.clientY);
  }

  if (charmPhysics) {
    charmPhysics.updateCursor(e.clientX, e.clientY);
  }

  if (isDragging && currentItem?.type === 'charm' && charmPhysics) {
    didDrag = true;
    charmPhysics.dragTo(e.clientX, e.clientY);
    return;
  }

  if (isDragging && currentItem?.type === 'ritual') {
    didDrag = true;
    charm.style.left = `${e.clientX - ritualDragOffset.x}px`;
    charm.style.top = `${e.clientY - ritualDragOffset.y}px`;
    return;
  }

  updateClickThrough(e.clientX, e.clientY);
});

document.addEventListener('mousedown', (e) => {
  if (currentItem?.type === 'charm' && charm.contains(e.target) && charmPhysics) {
    isDragging = true;
    didDrag = false;
    charmPhysics.startDrag(e.clientX, e.clientY);
    e.preventDefault();
    return;
  }

  if (currentItem?.type === 'ritual' && charm.contains(e.target)) {
    isDragging = true;
    didDrag = false;
    const rect = charm.getBoundingClientRect();
    ritualDragOffset.x = e.clientX - rect.left;
    ritualDragOffset.y = e.clientY - rect.top;
    e.preventDefault();
  }
});

window.addEventListener('mouseup', (e) => {
  if (currentItem?.type === 'charm') {
    if (isDragging && !didDrag) {
      performRitual();
    }
    if (isDragging && charmPhysics) {
      charmPhysics.endDrag();
      if (didDrag) triggerCharmFlip(); // releasing a drag is a disturbance too
    }
    isDragging = false;
    return;
  }

  if (currentItem?.type === 'ritual') {
    if (isDragging && !didDrag && charm.contains(e.target)) {
      performRitualAction(currentItem.ritual);
    }
    isDragging = false;
    return;
  }

  if (currentItem?.type === 'pet' && pet.contains(e.target)) {
    performRitual();
  }
});

function performRitual() {
  if (currentItem?.type === 'charm' && charmPhysics) {
    charmPhysics.flick();
    triggerCharmFlip();
    return;
  }

  if (currentItem?.type === 'pet') {
    const animationName = currentItem?.ritual?.animation || 'bounce';
    petGlyph.classList.remove(animationName);
    void petGlyph.offsetWidth; // restart the CSS animation
    petGlyph.classList.add(animationName);
  }
}

function performRitualAction(ritual) {
  if (ritual.animation === 'ignite') {
    performIgniteRitual(ritual);
  } else {
    performBreakRitual(ritual);
  }
}

let flameGradientCounter = 0;

// A real animated flame + glow layered on top of a single static "unlit"
// image, rather than swapping to a separate hand-drawn "lit" image. The
// flicker is driven per-frame in JS as a sum of several non-harmonic sine
// waves (different, unrelated frequencies) rather than a short CSS
// @keyframes loop — a short loop visibly repeats itself; summing waves
// that never share a common period reads as genuinely organic motion
// that doesn't obviously cycle.
function performIgniteRitual(ritual) {
  const existing = charm.querySelector('.ritual-flame-wrap');
  if (existing) existing.remove();
  if (flameAnimationHandle) cancelAnimationFrame(flameAnimationHandle);
  clearTimeout(breakResetTimer);

  const anchor = ritual.flameAnchor || { xPct: 50, yPct: 25 };
  const gradId = `flameGrad-${flameGradientCounter++}`;
  const wrap = document.createElement('div');
  wrap.className = 'ritual-flame-wrap';
  wrap.style.left = `${anchor.xPct}%`;
  wrap.style.top = `${anchor.yPct}%`;
  wrap.innerHTML = `
    <div class="ritual-flame-glow"></div>
    <svg class="ritual-flame-svg" viewBox="0 0 40 65" width="${ritual.flameWidth || 34}" height="${ritual.flameHeight || 55}">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#ff7a1a"/>
          <stop offset="55%" stop-color="#ffb23d"/>
          <stop offset="100%" stop-color="#fff6c8"/>
        </linearGradient>
      </defs>
      <path d="M20,63 C12,54 9,44 12,33 C14,23 17,15 18,8 A3.5,3.5 0 0 0 22,8 C23,15 26,23 28,33 C31,44 28,54 20,63 Z" fill="url(#${gradId})"/>
    </svg>
  `;
  charm.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('visible'));

  const flameSvg = wrap.querySelector('.ritual-flame-svg');
  let flameStart = null;
  function animateFlame(time) {
    if (flameStart === null) flameStart = time;
    const t = (time - flameStart) / 1000;
    const scaleY = 1 + 0.07 * Math.sin(t * 7.3) + 0.04 * Math.sin(t * 13.1 + 1.7) + 0.03 * Math.sin(t * 4.7 + 0.6);
    const scaleX = 1 - 0.05 * Math.sin(t * 6.1 + 0.9) - 0.03 * Math.sin(t * 11.3 + 2.2);
    const skew = 3 * Math.sin(t * 3.3 + 0.3) + 2 * Math.sin(t * 8.9 + 1.1);
    const shiftX = 1.5 * Math.sin(t * 2.6 + 0.4);
    flameSvg.style.transform = `translateX(${shiftX}px) scaleX(${scaleX}) scaleY(${scaleY}) skewX(${skew}deg)`;
    flameAnimationHandle = requestAnimationFrame(animateFlame);
  }
  flameAnimationHandle = requestAnimationFrame(animateFlame);

  breakResetTimer = setTimeout(() => {
    wrap.classList.remove('visible');
    if (flameAnimationHandle) {
      cancelAnimationFrame(flameAnimationHandle);
      flameAnimationHandle = null;
    }
    setTimeout(() => wrap.remove(), 350);
  }, ritual.resetAfterMs || 3000);
}

function performBreakRitual(ritual) {
  const img = charm.querySelector('img.charm-image');
  if (!img || !ritual.brokenImage) return;

  clearTimeout(breakResetTimer);

  window.overlayAPI.resolveAssetPath(ritual.brokenImage).then((url) => {
    img.src = url;
  });

  const rect = charm.getBoundingClientRect();
  window.spawnBurst(canvas, {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    colors: ritual.burstColors || ['#ffffff', '#f7f0e1'],
    shape: ritual.burstShape,
    count: ritual.burstCount,
    sizeRange: ritual.burstSizeRange,
    speedRange: ritual.burstSpeedRange,
    lifespanMs: ritual.burstLifespanMs,
  });

  breakResetTimer = setTimeout(() => {
    if (!currentItem?.image) return;
    window.overlayAPI.resolveAssetPath(currentItem.image).then((url) => {
      img.src = url;
    });
  }, ritual.resetAfterMs || 1800);
}
