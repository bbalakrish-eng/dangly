const charm = document.getElementById('charm');
const charmInner = document.getElementById('charmInner');
const canvas = document.getElementById('effects');
const pet = document.getElementById('pet');
const petGlyph = pet.querySelector('.pet-glyph');
const charmStringSvg = document.getElementById('charmString');
const charmStringLine = document.getElementById('charmStringLine');
const charmBeadsContainer = document.getElementById('charmBeads');
const charmChainContainer = document.getElementById('charmChain');
// Rage Room's full-screen click-capture layer — optional: a host page that
// never offers Rage Room items (the small "Give it a flick" mini demo)
// doesn't need to carry this markup, and every use below is null-guarded.
const rageCatcher = document.getElementById('rageCatcher');
const rageLayer = document.getElementById('rageLayer');
const rageHint = document.getElementById('rageHint');

let currentItem = null;
let particleSystem = null;
let petSystem = null;
let charmPhysics = null;
let charmLoopHandle = null;
let interactiveEl = null; // element eligible for click-through + click reactions
let displayInfo = null;
let breakResetTimer = null;
let breakThrowRAF = null;
let ritualRestPosition = null; // { left, top } captured just before a break's throw starts
let flameAnimationHandle = null;
// The current item's user tweaks from the Appearance settings panel
// (size/rope-length/opacity/hang position) — {} means "catalog defaults".
// Re-fetched whenever the item changes (see applyItem), and patched live
// while the settings window is open (see the 'appearance:changed' listener
// near the bottom of this file) without tearing down/rebuilding the charm.
let appearance = {};
// Cached locally (rather than awaited fresh on every trigger) so a Rage
// Room click can decide whether to play its sound synchronously, with no
// round-trip lag between the click and the effect.
let muted = false;

function computeGroundY() {
  if (!displayInfo) return window.overlayHost.size().height - 60;
  const insetBottom =
    displayInfo.bounds.y + displayInfo.bounds.height - (displayInfo.workArea.y + displayInfo.workArea.height);
  return window.overlayHost.size().height - Math.max(insetBottom, 0) - 16;
}

function resizeEffectsCanvas() {
  const size = window.overlayHost.size();
  canvas.width = size.width;
  canvas.height = size.height;
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
    // A round charm (the evil eye) has no flat "edge" the way a coin or
    // medallion does, so squashing it reads as an oval/distorted shape
    // rather than a 3D turn — toned down well below the original 18% so
    // it stays a subtle wobble instead of a visible egg shape.
    scaleX: 1 - 0.06 * depth,
    rotation: 1.8 * wave * Math.sin(Math.PI * t),
    brightness: 1 - 0.03 * depth,
  };
}

let triggerCharmFlip = () => {};

function startCharmLoop() {
  stopCharmLoop();
  // Prefer the width from `displayInfo` (a direct round-trip to
  // `screen.getPrimaryDisplay()` in the main process) over
  // `window.innerWidth` here: after the main process resizes this window
  // to match a display change (see resyncOverlayBounds in main.js, e.g.
  // an external monitor reconnecting after sleep), that resize reaching
  // the renderer and `window.innerWidth` actually updating is an
  // asynchronous, unsynchronized step — recalculating the anchor right
  // when 'system:resume' arrives could still read the *old* width for a
  // moment, anchoring correctly-relative-to-the-wrong-screen-size (e.g.
  // "200px from the right edge of the old, different-sized display"),
  // which reads as the charm having drifted to the middle. `displayInfo`
  // is refreshed via its own IPC round-trip right before this runs (see
  // the 'system:resume' handler), so it reflects the display Electron
  // itself just resized the window to, not whatever the DOM has caught
  // up to yet.
  const referenceWidth = displayInfo?.bounds?.width ?? window.overlayHost.size().width;
  // A user-set hang position (the Appearance panel's position strip, stored
  // as a 0–1 fraction of screen width so it still lands in the right place
  // after a display change) takes priority over the host's own default.
  // `charmAnchorX` is an optional override from the host (the website demo
  // hangs the charm inside its own layout); the app never sets it.
  const initialAnchorX =
    appearance.anchorXPct != null ? referenceWidth * appearance.anchorXPct : displayInfo?.charmAnchorX ?? referenceWidth - 200;
  const segmentLength = 15.5 * (appearance.ropeLengthScale ?? 1);
  charmPhysics = window.createCharmPhysics({ initialAnchorX, anchorY: 0, segmentLength });
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

    // A chain (see renderChain/positionChain) threads extra elements
    // above the bob, outside `charm`'s own box — without including that
    // span here, hovering over them never triggered the reaction below,
    // only the plain image did.
    const chainDistances = computeChainDistances(currentItem);
    const chainAboveHeight = chainDistances.length ? chainDistances[0] + (currentItem.chain[0].height ?? 0) / 2 : 0;
    charmPhysics.setSize(charm.offsetWidth, charm.offsetHeight, chainAboveHeight);
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
    positionChain();

    flipElapsed = Math.min(flipElapsed + dt, FLIP_DURATION);
    const flip = computeFlip(flipElapsed);
    // Continuous tilt matching the string's actual current angle — a
    // real hanging object rotates to align with what it's hanging from
    // as it swings, not just translate while staying upright. Separate
    // from (and added to) the brief coin-flip rotation above.
    // Held upright while actively being dragged — the segment between the
    // bob (kinematically pinned to the cursor) and the point above it
    // hasn't caught up to a straight line yet on any given frame, so its
    // angle to the bob can swing wildly from ordinary hand tremor or fast
    // direction changes. Since that angle drives this rotation, applying
    // it live during a drag reads as the whole charm swaying left and
    // right independent of the cursor, even though its actual position is
    // locked exactly to it. Swinging is a "hanging freely" behavior, which
    // a drag isn't — it resumes the moment the drag ends.
    const swingTilt = charmPhysics.isDragging()
      ? 0
      : Math.max(-35, Math.min(35, charmPhysics.getSwingAngleDegrees()));
    // Split across two elements rather than combined into one transform:
    // scaleX (non-uniform) composed with a large rotate in a single
    // matrix shears the shape into a skewed-looking parallelogram instead
    // of a clean tilt, and swingTilt alone ranges up to 35°. Keeping the
    // swing's rotation on `charm` and the flip's squash+rotation on the
    // nested `charmInner` keeps each transform in its own local space.
    // The Appearance panel's size slider (`sizeScale`) scales around the
    // same top-center transform-origin as the swing rotation, so the charm
    // grows/shrinks in place from its string attachment point rather than
    // drifting off it.
    const sizeScale = appearance.sizeScale ?? 1;
    charm.style.transform = `scale(${sizeScale}) rotate(${swingTilt}deg)`;
    charm.style.opacity = appearance.opacity ?? 1;
    charmInner.style.transform = `scaleX(${flip.scaleX}) rotate(${flip.rotation}deg)`;
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
  charm.style.opacity = '';
  charmInner.style.transform = '';
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

  if (bead.kind === 'ruby') {
    const gradId = `rubyGrad-${beadGradientCounter++}`;
    return `<svg viewBox="0 0 100 100" width="${d}" height="${d}">
      <defs>
        <radialGradient id="${gradId}" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#ff8f8f"/>
          <stop offset="55%" stop-color="#d81e2c"/>
          <stop offset="100%" stop-color="#6e0f14"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill="url(#${gradId})"/>
    </svg>`;
  }

  if (bead.kind === 'gold') {
    const gradId = `goldGrad-${beadGradientCounter++}`;
    return `<svg viewBox="0 0 100 100" width="${d}" height="${d}">
      <defs>
        <radialGradient id="${gradId}" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#fff6c2"/>
          <stop offset="55%" stop-color="#f2c218"/>
          <stop offset="100%" stop-color="#a3760a"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill="url(#${gradId})"/>
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

// The local direction of the rope right around a given "steps from bob"
// position — used to give each chain element (see renderChain) its own
// slight tilt matching how the string actually curves there, rather than
// every link sharing one whole-object rotation. Only ever feeds a plain
// rotate() (never combined with a non-uniform scale on the same
// element), so it can't produce the shear/skew a scaleX+rotate
// combination did for the coin-flip effect.
function angleAtStepsFromBob(points, bobIndex, steps) {
  const a = pointAtStepsFromBob(points, bobIndex, steps + 0.5);
  const b = pointAtStepsFromBob(points, bobIndex, steps - 0.5);
  if (!a || !b) return 0;
  return (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
}

// A "chain" is a sequence of separate images threaded along the rope
// above the main charm — e.g. a garland of individual chilies above a
// lemon — rather than one flat artwork. Each link is a plain <img>,
// positioned like a bead but given its own small rotation from the
// rope's local curve there (see angleAtStepsFromBob), so the whole
// garland bends naturally along the string's actual shape during a
// swing instead of moving as one rigid unit. `item.chain` is ordered
// outward from the charm, same convention as `item.beads`.
//
// Links are meant to stay close to however they were actually
// photographed (e.g. a chili shot lying roughly horizontal) and just
// stack at different points down the rope, each with a small tilt of
// its own — not rotated up onto end to "hang" vertically. Center-pivoted
// like a bead; a big rotation pivoting from the center is what read as
// an incoherent squiggle earlier, not centering itself.
function renderChain(item) {
  charmChainContainer.innerHTML = '';
  (item?.chain || []).forEach((link) => {
    const img = document.createElement('img');
    img.className = 'charm-chain-element';
    img.draggable = false;
    img.style.height = `${link.height}px`;
    charmChainContainer.appendChild(img);
    window.overlayAPI.resolveAssetPath(link.image).then((url) => {
      img.src = url;
    });
  });
}

// Distance from the bob to each chain link's center, in px, walking
// outward (index 0 = farthest). Shared by positionChain (to place each
// link) and startCharmLoop's frame loop (to size the hover-reaction
// rectangle so it covers the whole garland, not just the main image).
function computeChainDistances(item) {
  const chain = item?.chain;
  if (!chain || !chain.length) return [];

  const clearanceGap = item?.chainClearance ?? 0;
  const rawGap = item?.chainGap ?? -6;
  const gapForIndex = (i) => (Array.isArray(rawGap) ? rawGap[i] ?? rawGap[rawGap.length - 1] ?? 0 : rawGap);

  const distFromBob = new Array(chain.length);
  distFromBob[chain.length - 1] = chain[chain.length - 1].height / 2 + clearanceGap;
  for (let i = chain.length - 2; i >= 0; i--) {
    const gapIndex = chain.length - 2 - i;
    distFromBob[i] = distFromBob[i + 1] + chain[i + 1].height / 2 + chain[i].height / 2 + gapForIndex(gapIndex);
  }
  return distFromBob;
}

function positionChain() {
  const chain = currentItem?.chain;
  if (!chain || !chain.length || !charmPhysics) return;

  const points = charmPhysics.getPoints();
  const segmentLength = charmPhysics.getSegmentLength();
  const bobIndex = points.length - 1;
  const wrappers = charmChainContainer.children;
  const distFromBob = computeChainDistances(currentItem);

  for (let i = 0; i < chain.length; i++) {
    const steps = distFromBob[i] / segmentLength;
    const point = pointAtStepsFromBob(points, bobIndex, steps);
    const wrapper = wrappers[i];
    if (!point || !wrapper) continue;
    const rotationScale = chain[i].rotationScale ?? 0.5;
    const baseRotation = chain[i].baseRotation ?? 0;
    const angle = baseRotation + angleAtStepsFromBob(points, bobIndex, steps) * rotationScale;
    wrapper.style.left = `${point.x}px`;
    wrapper.style.top = `${point.y}px`;
    wrapper.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
  }
}

function renderCharmVisual(item) {
  charmInner.innerHTML = '';
  clearTimeout(breakResetTimer);

  if (item && item.image) {
    const img = document.createElement('img');
    img.className = item.type === 'ritual' ? 'charm-image ritual-image' : 'charm-image';
    img.draggable = false;
    // Overrides the shared 220px default for a charm whose proportions
    // need to sit deliberately smaller relative to other elements it's
    // paired with (e.g. a lemon next to a garland of much smaller
    // chilies) rather than dominating the whole charm.
    if (item.imageHeight) img.style.height = `${item.imageHeight}px`;
    // Most art is cropped tight enough that its own top edge is the
    // natural hang point. A pose with limbs raised well above the head
    // (e.g. arms thrown up) isn't — attaching the string at the image's
    // literal top means it visually ends at the raised hands with a gap
    // below to the head, instead of the head, with the arms rising above
    // that point the way they actually would if worn. This shifts the
    // image up by that amount (a negative margin, so it overflows above
    // `charm`'s own box rather than being clipped) so the string instead
    // reads as ending at the true hang point partway down the image.
    if (item.imageAnchorOffset) img.style.marginTop = `${-item.imageAnchorOffset}px`;
    // Horizontal counterpart: the fraction of the image's width (0–1)
    // where its hang point actually sits, for art whose loop/ring isn't
    // dead-center (e.g. a lantern whose ring is a little right of middle).
    // A percentage translate is relative to the image's own width, so it
    // needs no size known up front, and doesn't change layout/hit-box.
    if (item.imageAnchorX != null) img.style.transform = `translateX(${(0.5 - item.imageAnchorX) * 100}%)`;
    charmInner.appendChild(img);
    window.overlayAPI.resolveAssetPath(item.image).then((url) => {
      img.src = url;
    });
    // A small fixed decoration below the main charm — e.g. the knot a
    // lemon-and-chili garland is tied off with — that just rides along
    // with the charm as a rigid unit rather than swinging independently
    // on the rope the way `chain` links above the charm do.
    if (item.belowImage) {
      const belowImg = document.createElement('img');
      belowImg.className = 'charm-below-image';
      belowImg.draggable = false;
      belowImg.style.height = `${item.belowImage.height}px`;
      charmInner.appendChild(belowImg);
      window.overlayAPI.resolveAssetPath(item.belowImage.image).then((url) => {
        belowImg.src = url;
      });
    }
    return;
  }

  charmInner.textContent = item ? item.glyph : '🍀';
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
  if (breakThrowRAF) {
    // Without this, switching away mid-break (before its throw finishes
    // or its reset fires) left the loop's callback armed — it would go on
    // to run triggerBreakImpact()/the reset against `charm` and whatever
    // NEXT item now occupies it (appending the old ritual's shatter photo
    // into it, hiding its image, or later snapping its position back to
    // the old ritual's coordinates), producing a stray duplicate/misplaced
    // visual on a completely unrelated item.
    cancelAnimationFrame(breakThrowRAF);
    breakThrowRAF = null;
  }
  ritualRestPosition = null;
  // If a drag was ever left mid-gesture when switching items (isDragging
  // stuck true), the new item would silently inherit it: the very next
  // mousemove would run `charmPhysics.dragTo(cursor)` for a freshly
  // selected charm and it would snap to wherever the cursor currently is
  // instead of hanging from its own anchor, looking like it's "stuck" in
  // the middle of the screen with no dragging having happened at all.
  isDragging = false;
  didDrag = false;
  if (flameAnimationHandle) {
    // A persistent flame (see performIgniteRitual) has no reset timeout
    // to clean this up — without cancelling here, its rAF loop would
    // keep running forever in the background after switching away.
    flameAnimationHandle.cancel();
    flameAnimationHandle = null;
  }
  // The flame overlay and the shatter-photo overlay are both appended as
  // direct children of `charm` itself (siblings of `charmInner`, not
  // inside it), so clearing `charmInner`'s contents for the next item
  // doesn't touch them — without this, switching away from a lit lamp
  // (or mid-shatter) left that overlay permanently stuck on `charm`,
  // showing up on top of whatever item got selected next.
  charm.querySelectorAll('.ritual-flame-wrap, .ritual-shatter-overlay').forEach((el) => el.remove());
  charmBeadsContainer.innerHTML = '';
  charmChainContainer.innerHTML = '';
  charm.classList.add('hidden');
  pet.classList.add('hidden');
  interactiveEl = null;
  exitRageMode();
}

async function applyItem(item) {
  currentItem = item;
  // Fetched before teardown so startCharmLoop (called synchronously below)
  // already has it — the Appearance panel only offers rope-on-a-string
  // controls, so anything other than a plain charm just renders at its
  // catalog defaults.
  appearance = item && item.type === 'charm' ? (await window.overlayAPI.getAppearance(item.id)) || {} : {};
  // A rapid item switch (e.g. clicking through the gallery) could have
  // this resolve after a *later* call already changed currentItem again —
  // bail rather than tearing down and rebuilding for an item that's no
  // longer the one selected.
  if (currentItem !== item) return;
  teardownCurrent();

  if (!item || item.type === 'charm') {
    charm.classList.remove('hidden');
    renderCharmVisual(item);
    renderBeads(item);
    renderChain(item);
    startCharmLoop();
    interactiveEl = charm;
    return;
  }

  if (item.type === 'ritual') {
    // Rituals (coconut-breaking, lamp/candle lighting, …) don't hang from
    // a string — they can be dragged freely, and a plain click (no drag)
    // triggers the ritual action. A `persistent` ignite ritual (the lamp)
    // is different: it's meant to just be lit the whole time it's
    // selected, not click-triggered and not auto-extinguishing.
    charm.classList.remove('hidden');
    renderCharmVisual(item);
    const refWidth = displayInfo?.bounds?.width ?? window.overlayHost.size().width;
    const refHeight = displayInfo?.bounds?.height ?? window.overlayHost.size().height;
    charm.style.left = `${(displayInfo?.ritualCenterX ?? refWidth / 2) - 50}px`;
    charm.style.top = `${refHeight * 0.32}px`;
    interactiveEl = charm;
    if (item.ritual?.animation === 'ignite' && item.ritual?.persistent) {
      performIgniteRitual(item.ritual);
    }
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
    return;
  }

  if (item.type === 'rage') {
    enterRageMode(item);
  }
}

async function init() {
  displayInfo = await window.overlayAPI.getDisplayInfo();
  const initialItem = await window.overlayAPI.getActiveItem();
  muted = (await window.overlayAPI.getMuted?.()) ?? false;
  applyItem(initialItem);
}

window.overlayAPI.onItemChanged(applyItem);
window.overlayAPI.onMutedChanged?.((next) => {
  muted = next;
});
init();

// A long display sleep can suspend this page's animation timers
// (requestAnimationFrame/setInterval) without necessarily killing the
// renderer process outright — confirmed by leaving a charm running
// across a multi-hour sleep and finding its own periodic diagnostic
// logger had silently stopped ticking days before the process actually
// exited. Chromium is expected to resume rAF once the page is visible
// again, but re-applying the current item on resume is a cheap,
// unconditional safety net regardless of whether that resume happens
// cleanly on its own — it forces a fresh animation-frame chain (and a
// reset `lastTime`, avoiding any stale/huge delta) rather than leaving
// the charm's position frozen or drifted from whatever state it was in
// when the system went to sleep. Kept as a cheap secondary safety net,
// but testing showed this event never actually fires for a real display
// sleep on this window (it tracks occlusion/minimization, not OS
// suspend) — see the 'system:resume' listener below for the one that
// does.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentItem) {
    applyItem(currentItem);
  }
});

// Fired from the main process's `powerMonitor.on('resume', ...)` —
// Electron's actual API for OS-level sleep/wake, confirmed by testing to
// fire when 'visibilitychange' above does not. Same recovery: re-apply
// the current item to force a fresh animation loop instead of leaving
// whatever was frozen (or briefly running with the display off) on
// screen.
window.overlayAPI.onSystemResume(async () => {
  // Re-fetch fresh from the main process (a direct read of
  // screen.getPrimaryDisplay()) rather than trusting window.innerWidth —
  // see the comment in startCharmLoop() for why that can still be stale
  // at this exact moment.
  displayInfo = await window.overlayAPI.getDisplayInfo();
  resizeEffectsCanvas();
  if (currentItem) applyItem(currentItem);
});

// From the Appearance settings panel (see gallery.js): applied live, in
// place, rather than by re-running applyItem — a full reload would rebuild
// the charm's DOM and restart its rope from a straight hang on every single
// slider tick, which reads as a flicker/reset instead of a smooth live
// preview. Size and opacity are read fresh every frame (see the frame()
// loop in startCharmLoop) so updating `appearance` here is enough for
// those; rope length and position go through the physics engine's own live
// setters so the existing rope eases to the new values instead of jumping.
window.overlayAPI.onAppearanceChanged((itemId, overrides) => {
  if (!currentItem || currentItem.id !== itemId) return;
  appearance = overrides || {};
  if (!charmPhysics) return;
  charmPhysics.setSegmentLength(15.5 * (appearance.ropeLengthScale ?? 1));
  const width = displayInfo?.bounds?.width ?? window.overlayHost.size().width;
  const anchorX = appearance.anchorXPct != null ? width * appearance.anchorXPct : displayInfo?.charmAnchorX ?? width - 200;
  charmPhysics.setAnchorX(anchorX);
});

let isDragging = false;
let didDrag = false;
let ritualDragOffset = { x: 0, y: 0 };

function updateClickThrough(x, y) {
  if (rageActive) return; // forced non-click-through for the whole window; see enterRageMode
  const el = document.elementFromPoint(x, y);
  const overInteractive = Boolean(interactiveEl && interactiveEl.contains(el));
  window.overlayAPI.setIgnoreMouseEvents(!overInteractive, { forward: true });
}

document.addEventListener('mousemove', (e) => {
  const cursor = window.overlayHost.point(e);
  if (particleSystem) {
    particleSystem.updateCursor(cursor.x, cursor.y);
  }

  if (charmPhysics) {
    charmPhysics.updateCursor(cursor.x, cursor.y);
  }

  if (isDragging && currentItem?.type === 'charm' && charmPhysics) {
    didDrag = true;
    charmPhysics.dragTo(cursor.x, cursor.y);
    return;
  }

  if (isDragging && currentItem?.type === 'ritual') {
    didDrag = true;
    // Clamped so the whole item stays fully on screen — centering the
    // art on the cursor means dragging near an edge would otherwise push
    // part of it past the window's own boundary, where it simply isn't
    // rendered at all (not a CSS clip, just off the edge of the window),
    // looking like the art is being cut off by a mask.
    const screenSize = window.overlayHost.size();
    const maxLeft = screenSize.width - charm.offsetWidth;
    const maxTop = screenSize.height - charm.offsetHeight;
    const newLeft = Math.min(Math.max(cursor.x - ritualDragOffset.x, 0), maxLeft);
    const newTop = Math.min(Math.max(cursor.y - ritualDragOffset.y, 0), maxTop);
    charm.style.left = `${newLeft}px`;
    charm.style.top = `${newTop}px`;
    return;
  }

  updateClickThrough(e.clientX, e.clientY); // real viewport coordinates: it hit-tests the page
});

document.addEventListener('mousedown', (e) => {
  if (currentItem?.type === 'charm' && charm.contains(e.target) && charmPhysics) {
    isDragging = true;
    didDrag = false;
    const grab = window.overlayHost.point(e);
    charmPhysics.startDrag(grab.x, grab.y);
    e.preventDefault();
    return;
  }

  if (currentItem?.type === 'ritual' && charm.contains(e.target)) {
    isDragging = true;
    didDrag = false;
    // Grabbing the item mid-break (while the throw/fall transform is
    // still active, or lingering before its own reset fires) would
    // otherwise leave that transform's visual offset stacked on top of
    // the new drag position — the art renders wherever (left/top + that
    // leftover offset) land, not under the cursor. Snapping back to rest
    // first keeps the drag anchor exactly where the cursor grabbed it.
    cancelBreakSequence(currentItem.ritual);
    // Anchor on the item's own center rather than wherever inside its
    // (possibly padded) bounding box the click happened to land — the
    // art's visible content isn't flush with the image's edges (real
    // photo assets carry some transparent margin), so preserving the
    // exact click point could anchor the drag to empty space near an
    // edge, making the art appear to hang below/above/beside the cursor
    // instead of on it. Centering is also what the break sequence already
    // assumes when it computes the impact point from this same box.
    ritualDragOffset.x = charm.offsetWidth / 2;
    ritualDragOffset.y = charm.offsetHeight / 2;
    e.preventDefault();
  }
});

window.addEventListener('mouseup', (e) => {
  if (rageActive) {
    // Caught at the window level, not just on rageCatcher, so releasing the
    // button after dragging past the window edge still stops the trail.
    rageMouseDown = false;
    return;
  }

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

if (rageCatcher) {
  rageCatcher.addEventListener('mousedown', (e) => {
    if (!rageActive || !currentItem || currentItem.type !== 'rage') return;
    rageMouseDown = true;
    const point = window.overlayHost.point(e);
    if (currentItem.rage?.effect === 'fire') spawnFireBlast(point.x, point.y);
    if (currentItem.rage?.effect === 'bullet') spawnBulletHole(point.x, point.y);
  });

  // Continuous drag trail: while the button stays down, keep spawning a
  // light trickle of fire along the path instead of only reacting to the
  // single initial click — matches the referenced example's press-and-drag
  // painting behavior.
  rageCatcher.addEventListener('mousemove', (e) => {
    if (!rageMouseDown || !rageActive || !currentItem || currentItem.type !== 'rage') return;
    const point = window.overlayHost.point(e);
    if (currentItem.rage?.effect === 'fire') spawnFireTrail(point.x, point.y);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && rageActive) window.overlayAPI.exitRage();
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

// The flame's own SVG markup — shared by the lamp/candle ritual below and
// by the Rage Room fire effect further down, so both draw literally the
// same flame rather than two hand-tuned copies drifting apart over time.
function flameSvgMarkup(gradId, width, height) {
  return `
    <svg class="ritual-flame-svg" viewBox="0 0 40 90" width="${width}" height="${height}">
      <defs>
        <radialGradient id="${gradId}" cx="50%" cy="72%" r="65%">
          <stop offset="0%" stop-color="#fffef2"/>
          <stop offset="32%" stop-color="#fff3c2"/>
          <stop offset="68%" stop-color="#ffd25c"/>
          <stop offset="100%" stop-color="#f2a628"/>
        </radialGradient>
        <linearGradient id="${gradId}-mask" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="80%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#333333"/>
        </linearGradient>
        <mask id="${gradId}-m">
          <rect x="0" y="0" width="40" height="90" fill="url(#${gradId}-mask)"/>
        </mask>
      </defs>
      <path d="M20,90 C11,78 9,63 11,49 C13,33 16,21 18,13 A5,6 0 0 0 22,13 C24,21 27,33 29,49 C31,63 29,78 20,90 Z" fill="url(#${gradId})" mask="url(#${gradId}-m)"/>
    </svg>
  `;
}

// A real animated flame + glow layered on top of a single static "unlit"
// image, rather than swapping to a separate hand-drawn "lit" image. The
// flicker is driven per-frame in JS as a sum of several non-harmonic sine
// waves (different, unrelated frequencies) rather than a short CSS
// @keyframes loop — a short loop visibly repeats itself; summing waves
// that never share a common period reads as genuinely organic motion
// that doesn't obviously cycle. Returns a handle with its own `cancel()`
// so callers don't need to know it's a rAF loop under the hood.
function startFlameFlicker(flameSvg) {
  let start = null;
  let handle;
  function tick(time) {
    if (start === null) start = time;
    const t = (time - start) / 1000;
    const scaleY = 1 + 0.07 * Math.sin(t * 7.3) + 0.04 * Math.sin(t * 13.1 + 1.7) + 0.03 * Math.sin(t * 4.7 + 0.6);
    const scaleX = 1 - 0.05 * Math.sin(t * 6.1 + 0.9) - 0.03 * Math.sin(t * 11.3 + 2.2);
    const skew = 3 * Math.sin(t * 3.3 + 0.3) + 2 * Math.sin(t * 8.9 + 1.1);
    const shiftX = 1.5 * Math.sin(t * 2.6 + 0.4);
    flameSvg.style.transform = `translateX(${shiftX}px) scaleX(${scaleX}) scaleY(${scaleY}) skewX(${skew}deg)`;
    handle = requestAnimationFrame(tick);
  }
  handle = requestAnimationFrame(tick);
  return { cancel: () => cancelAnimationFrame(handle) };
}

function performIgniteRitual(ritual) {
  const existing = charm.querySelector('.ritual-flame-wrap');
  if (existing) existing.remove();
  if (flameAnimationHandle) flameAnimationHandle.cancel();
  clearTimeout(breakResetTimer);

  const anchor = ritual.flameAnchor || { xPct: 50, yPct: 25 };
  const gradId = `flameGrad-${flameGradientCounter++}`;
  const wrap = document.createElement('div');
  wrap.className = 'ritual-flame-wrap';
  wrap.style.left = `${anchor.xPct}%`;
  wrap.style.top = `${anchor.yPct}%`;
  wrap.innerHTML = `<div class="ritual-flame-glow"></div>${flameSvgMarkup(gradId, ritual.flameWidth || 34, ritual.flameHeight || 76)}`;
  charm.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('visible'));

  flameAnimationHandle = startFlameFlicker(wrap.querySelector('.ritual-flame-svg'));

  if (ritual.persistent) return; // stays lit for as long as the item is selected

  breakResetTimer = setTimeout(() => {
    wrap.classList.remove('visible');
    if (flameAnimationHandle) {
      flameAnimationHandle.cancel();
      flameAnimationHandle = null;
    }
    setTimeout(() => wrap.remove(), 350);
  }, ritual.resetAfterMs || 3000);
}

// ───────── Rage Room ─────────
// A fundamentally different interaction from every other item: those stay
// click-through (the app gets out of your way), but "aim and click
// anywhere on the screen" needs the opposite — the whole window has to stop
// ignoring the mouse while one of these is active. rageCatcher is a plain
// full-window element with pointer-events enabled just for this; leaving it
// is what hands click-through back to the desktop underneath.
let rageActive = false;
let rageMouseDown = false; // tracked so a drag across the screen can keep spawning fire, not just the initial click

function enterRageMode(item) {
  rageActive = true;
  if (rageCatcher) rageCatcher.classList.remove('hidden');
  if (rageHint) {
    rageHint.textContent = `${item.description || 'Click anywhere on your screen.'} Press Esc to exit.`;
    rageHint.classList.remove('hidden');
  }
  // Forced on once, rather than left to the per-mousemove hover check in
  // updateClickThrough (which now skips itself entirely while rage mode is
  // active — see there) — every point on screen needs to be "interactive"
  // here, not just the small area over a charm.
  window.overlayAPI.setIgnoreMouseEvents(false);
}

function exitRageMode() {
  if (!rageActive) return;
  rageActive = false;
  rageMouseDown = false;
  if (rageCatcher) rageCatcher.classList.add('hidden');
  if (rageHint) rageHint.classList.add('hidden');
  if (rageLayer) rageLayer.innerHTML = '';
  stopRageParticles();
}

// Shared by every Rage Room effect that needs a burst of glowing motion —
// Fire's flame/sparks and the bullet hole's muzzle flash all push into the
// same pool below rather than each keeping its own particle system. Dozens
// of small glowing circles with randomized size/speed/color, composited
// with 'screen' so overlapping ones brighten each other instead of just
// stacking flat, read as organic and irregular far better than any single
// fixed shape could. (Technique adapted from a canvas fire demo the user
// linked — see the commit message for the source.)
class RageParticle {
  constructor(x, y, opts = {}) {
    this.x = x + (Math.random() * 30 - 15);
    this.y = y + (Math.random() * 10 - 5);
    this.size = opts.size ?? Math.random() * 20 + 10;
    this.speedX = opts.vx ?? Math.random() * 3 - 1.5;
    this.speedY = opts.vy ?? Math.random() * -3 - 1.5;
    this.buoyancy = opts.buoyancy ?? Math.random() * -0.15 - 0.05;
    this.gravity = opts.gravity ?? 0;
    this.wobbleSpeed = Math.random() * 0.08 + 0.04;
    this.wobbleIntensity = opts.wobbleIntensity ?? Math.random() * 2;
    this.hue = opts.hue ?? Math.random() * 15 + 10; // 10-25: ember red-orange
    this.brightness = opts.brightness ?? Math.random() * 20 + 60;
    this.alpha = 1;
    this.decay = opts.decay ?? Math.random() * 0.024 + 0.02;
    this.shrink = opts.shrink ?? 0.35;
    this.hueFade = opts.hueFade ?? 0.4;
    this.brightnessFade = opts.brightnessFade ?? 1.2;
  }

  update(frame) {
    this.speedY += this.buoyancy + this.gravity;
    this.y += this.speedY;
    this.x += this.speedX + Math.sin(frame * this.wobbleSpeed) * this.wobbleIntensity;
    this.alpha -= this.decay;
    if (this.size > 0.5) this.size -= this.shrink;
    if (this.hue > 0) this.hue -= this.hueFade;
    if (this.brightness > 20) this.brightness -= this.brightnessFade;
  }

  dead() {
    return this.alpha <= 0 || this.size <= 0.5;
  }

  draw(ctx) {
    ctx.globalAlpha = Math.max(this.alpha, 0);
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(this.size, 0), 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${this.hue}, 100%, ${this.brightness}%)`;
    ctx.fill();
  }
}

let rageParticles = [];
let rageFrame = 0;
let rageLoopHandle = null;

// Runs only while there's actually something to draw — started on the
// first spark of a burst, and left to stop itself once every particle in
// it has fully decayed, rather than a fixed-duration timer that has to
// guess how long that will take.
function ensureRageParticleLoop() {
  if (rageLoopHandle) return;
  const ctx = canvas.getContext('2d');
  function tick() {
    rageFrame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < rageParticles.length; i++) {
      const p = rageParticles[i];
      p.update(rageFrame);
      p.draw(ctx);
    }
    ctx.restore();
    rageParticles = rageParticles.filter((p) => !p.dead());
    if (rageParticles.length > 0) {
      rageLoopHandle = requestAnimationFrame(tick);
    } else {
      rageLoopHandle = null;
    }
  }
  rageLoopHandle = requestAnimationFrame(tick);
}

function stopRageParticles() {
  if (rageLoopHandle) cancelAnimationFrame(rageLoopHandle);
  rageLoopHandle = null;
  rageParticles = [];
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// A burst of particle flame and sparks (canvas, for the organic motion) —
// no lingering scorch/burn decal after it decays, just the fire itself.
function spawnFireBlast(x, y) {
  for (let i = 0; i < 22; i++) {
    rageParticles.push(new RageParticle(x, y));
  }

  // Sparks: smaller, brighter (yellow, not orange), thrown up and outward
  // in a wide cone around "up" — not a full 360° radial burst. A symmetric
  // radial explosion (including sparks flung straight down and sideways)
  // is what reads as a firework/muzzle-blast; real embers only ever fly
  // up-and-out, so keeping the angle inside that cone is what makes this
  // read as fire sparks instead of a "gunshot".
  const sparkSpread = Math.PI * 0.7; // ~126° wide fan centered on straight up
  for (let i = 0; i < 12; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * sparkSpread;
    const speed = Math.random() * 3.5 + 1.5;
    rageParticles.push(
      new RageParticle(x, y, {
        size: Math.random() * 3 + 1.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        buoyancy: 0,
        gravity: 0.1,
        wobbleIntensity: 0,
        hue: Math.random() * 10 + 45,
        brightness: Math.random() * 10 + 85,
        decay: Math.random() * 0.03 + 0.035,
        shrink: 0.06,
        hueFade: 0.8,
        brightnessFade: 2,
      })
    );
  }

  ensureRageParticleLoop();

  if (!muted) window.rageAudio?.playFireSound();
}

// A lighter version of spawnFireBlast for continuous mouse-drag trails — just
// a few flame particles, no scorch mark and no sound (those are one-shot
// reactions to a discrete click, not something that should repeat on every
// frame of a drag). Called from rageCatcher's mousemove handler while the
// button is held, mirroring the referenced example's press-and-drag
// painting instead of only supporting single discrete clicks.
function spawnFireTrail(x, y) {
  if (rageParticles.length > 400) return; // cap so a long drag can't run away
  for (let i = 0; i < 3; i++) {
    rageParticles.push(new RageParticle(x, y));
  }
  ensureRageParticleLoop();
}

// A jagged torn-metal shard (irregular polygon, vertex radii drawn from a
// wide random range rather than alternating cleanly between two fixed
// radii) around a dark punched hole — generated fresh each time so no two
// impacts look identical. Two earlier attempts at this didn't land: thin
// radiating crack lines read as a bug sitting on the screen, and a clean
// alternating-radius star read as a ninja-star sticker; this shape (plus
// the soft drop-shadow below) is what actually reads as a torn hole.
function bulletHoleSvgMarkup() {
  const size = 90;
  const half = size / 2;
  const vertexCount = 10 + Math.floor(Math.random() * 5);
  const points = [];
  for (let i = 0; i < vertexCount; i++) {
    const baseAngle = (Math.PI * 2 * i) / vertexCount;
    const angle = baseAngle + (Math.random() - 0.5) * ((Math.PI * 2) / vertexCount) * 0.8;
    const radius = half * (0.34 + Math.random() * 0.62);
    points.push(`${(half + Math.cos(angle) * radius).toFixed(1)},${(half + Math.sin(angle) * radius).toFixed(1)}`);
  }
  const shardPath = `M${points.join(' L')} Z`;
  const holeRadius = half * 0.34;
  const gradId = `bh-${Math.random().toString(36).slice(2, 9)}`;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="${gradId}" cx="40%" cy="38%" r="70%">
          <stop offset="0%" stop-color="#a0a0a0"/>
          <stop offset="55%" stop-color="#5c5c5c"/>
          <stop offset="100%" stop-color="#222222"/>
        </radialGradient>
        <filter id="${gradId}-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#000" flood-opacity="0.45"/>
        </filter>
      </defs>
      <path d="${shardPath}" fill="url(#${gradId})" stroke="rgba(0,0,0,0.55)" stroke-width="1" filter="url(#${gradId}-shadow)"/>
      <circle cx="${half}" cy="${half}" r="${holeRadius.toFixed(1)}" fill="#050505"/>
      <circle cx="${(half - holeRadius * 0.3).toFixed(1)}" cy="${(half - holeRadius * 0.3).toFixed(1)}" r="${(holeRadius * 0.3).toFixed(1)}" fill="rgba(255,255,255,0.14)"/>
    </svg>
  `;
}

// Impact decal (DOM, a static jagged torn-metal shard) plus a quick radial
// burst of hot particles for the muzzle flash. Unlike Fire's sparks (kept
// inside an upward cone deliberately, so they don't read as an explosion),
// a bullet impact SHOULD read as a sudden burst in every direction — that's
// the correct look here, not something to avoid.
function spawnBulletHole(x, y) {
  if (rageLayer) {
    const hole = document.createElement('div');
    hole.className = 'rage-bullet-hole';
    hole.style.left = `${x}px`;
    hole.style.top = `${y}px`;
    hole.style.transform = `translate(-50%, -50%) rotate(${Math.round(Math.random() * 360)}deg)`;
    hole.innerHTML = bulletHoleSvgMarkup();
    rageLayer.appendChild(hole);
    requestAnimationFrame(() => hole.classList.add('visible'));
    setTimeout(() => hole.classList.add('fading'), 2400);
    setTimeout(() => hole.remove(), 3200);
  }

  for (let i = 0; i < 10; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 5 + 2.5;
    rageParticles.push(
      new RageParticle(x, y, {
        size: Math.random() * 2.5 + 1,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        buoyancy: 0,
        gravity: 0.15,
        wobbleIntensity: 0,
        hue: Math.random() * 20 + 40, // yellow-white hot
        brightness: Math.random() * 8 + 90,
        decay: Math.random() * 0.05 + 0.06,
        shrink: 0.1,
        hueFade: 1.2,
        brightnessFade: 3,
      })
    );
  }

  ensureRageParticleLoop();

  if (!muted) window.rageAudio?.playGunshotSound();
}

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInCubic = (x) => x * x * x;

// Snaps a break-ritual item back to its resting state: stops the
// throw/tumble animation loop, removes the shatter photo overlay,
// restores the image's opacity/rotation, and clears the pending
// impact/reset timers. Used both to defensively reset before a fresh
// break (a rapid re-click) and to bail out of an in-flight break the
// moment the item is grabbed to drag.
function cancelBreakSequence(ritual) {
  const img = charm.querySelector('img.charm-image');
  if (!img) return null;

  clearTimeout(breakResetTimer);
  if (breakThrowRAF) {
    // Only restore the pre-throw position when actually interrupting an
    // in-flight throw. Restoring it unconditionally (on every call,
    // including the routine "clear any leftovers" at the start of a
    // brand-new break) snapped the item back to wherever its *previous*
    // break started from even after it had since been dragged somewhere
    // else — making it look like breaking only ever worked from one fixed
    // spot on screen.
    cancelAnimationFrame(breakThrowRAF);
    breakThrowRAF = null;
    if (ritualRestPosition) {
      charm.style.left = ritualRestPosition.left;
      charm.style.top = ritualRestPosition.top;
    }
  }
  img.style.transform = '';
  const existingShatter = charm.querySelector('.ritual-shatter-overlay');
  if (existingShatter) existingShatter.remove();
  img.style.opacity = '1';

  if (ritual?.brokenImage && currentItem?.image) {
    window.overlayAPI.resolveAssetPath(currentItem.image).then((url) => {
      img.src = url;
    });
  }

  return img;
}

function performBreakRitual(ritual) {
  const img = cancelBreakSequence(ritual);
  if (!img) return;

  // Captured now (its resting spot, whether that's the default center or
  // wherever it's been dragged to) and restored explicitly whenever the
  // sequence ends, whether by finishing naturally or being interrupted.
  ritualRestPosition = { left: charm.style.left, top: charm.style.top };
  const startLeft = parseFloat(ritualRestPosition.left) || 0;
  const startTop = parseFloat(ritualRestPosition.top) || 0;

  // "Thrown forcefully on the floor" reads as a toss, not a shove — a
  // quick decelerating rise (someone winding up and launching it) then a
  // longer accelerating fall past the start point down to the impact
  // (ease-in, gravity winning), landing exactly when the shatter/burst
  // fire. This is driven by a plain requestAnimationFrame loop writing
  // straight to `charm.style.left/top`, not the Web Animations API: a
  // WAAPI `.animate()` with `fill: 'forwards'` proved unreliable to
  // cancel cleanly here — Chromium can auto-replace a finished,
  // fill-forwards animation with a newer one on the same property
  // without necessarily flushing its held transform back to identity in
  // the same tick, so `charm` could end up with a leftover visual offset
  // that no `getAnimations()`-based cancel() or explicit style clear
  // reliably removed. Plain `left`/`top` writes have none of that
  // ambiguity — they're always exactly what was last assigned, which is
  // also what `charm`'s own click-through hit-testing and the drag math
  // both read. The tumbling rotation stays on the image alone (cosmetic,
  // doesn't affect hit-testing), applied the same way.
  const throwUpDistance = ritual.throwUpDistance ?? 55;
  const throwUpDurationMs = ritual.throwUpDurationMs ?? 130;
  const throwDownDistance = ritual.throwDownDistance ?? 170;
  const throwDownDurationMs = ritual.throwDownDurationMs ?? 260;
  const throwDrift = ritual.throwDrift ?? -22;
  const throwRotation = ritual.throwRotation ?? 34;
  const throwDurationMs = throwUpDurationMs + throwDownDurationMs;
  const peakDrift = throwDrift * 0.3;

  const throwStart = performance.now();

  function stepThrow(now) {
    const elapsed = now - throwStart;

    let dx;
    let dy;
    let rot;
    if (elapsed <= throwUpDurationMs) {
      const u = easeOutCubic(Math.min(elapsed / throwUpDurationMs, 1));
      dx = peakDrift * u;
      dy = -throwUpDistance * u;
      rot = -throwRotation * 0.25 * u;
    } else {
      const u = easeInCubic(Math.min((elapsed - throwUpDurationMs) / throwDownDurationMs, 1));
      dx = peakDrift + (throwDrift - peakDrift) * u;
      dy = -throwUpDistance + (throwDownDistance - -throwUpDistance) * u;
      rot = -throwRotation * 0.25 + (throwRotation - -throwRotation * 0.25) * u;
    }

    charm.style.left = `${startLeft + dx}px`;
    charm.style.top = `${startTop + dy}px`;
    img.style.transform = `rotate(${rot}deg)`;

    if (elapsed < throwDurationMs) {
      breakThrowRAF = requestAnimationFrame(stepThrow);
    } else {
      breakThrowRAF = null;
      triggerBreakImpact(ritual, img);
    }
  }

  breakThrowRAF = requestAnimationFrame(stepThrow);
}

function triggerBreakImpact(ritual, img) {
  // Some items have a real "after" state worth showing (two coconut
  // halves sitting there) — swap to it. Others (a coconut mid-shatter)
  // don't have a meaningful settled "broken" pose to show a static image
  // of; the debris burst alone tells the story, so the whole image just
  // hides for the duration instead of swapping to a second asset.
  if (ritual.brokenImage) {
    window.overlayAPI.resolveAssetPath(ritual.brokenImage).then((url) => {
      img.src = url;
    });
  } else {
    img.style.opacity = '0';
  }

  // A real photo of the actual shattering moment (debris mid-flight) reads
  // far more convincingly than any procedural burst alone. It's popped in
  // fast (like an impact flash) at the point of landing, held briefly,
  // then faded — the procedural burst below continues the motion after
  // it's gone so the debris doesn't just vanish when the photo does.
  if (ritual.shatterImage) {
    const shatterImg = document.createElement('img');
    shatterImg.className = 'ritual-shatter-overlay';
    shatterImg.draggable = false;
    const scale = ritual.shatterScale || 2.2;
    const shatterWidth = img.offsetWidth * scale;
    shatterImg.style.width = `${shatterWidth}px`;
    // Narrower than the source photo's own aspect ratio so object-fit's
    // cover+left crop (see .ritual-shatter-overlay) trims the sliced-off
    // edge instead of stretching/showing it.
    shatterImg.style.height = `${shatterWidth / (ritual.shatterCropAspect || 1.3)}px`;
    charm.appendChild(shatterImg);

    window.overlayAPI.resolveAssetPath(ritual.shatterImage).then((url) => {
      shatterImg.src = url;
    });

    requestAnimationFrame(() => shatterImg.classList.add('visible'));

    const shatterHoldMs = ritual.shatterHoldMs ?? 700;
    setTimeout(() => {
      shatterImg.classList.add('fading');
      setTimeout(() => shatterImg.remove(), 400);
    }, shatterHoldMs);
  }

  const rect = charm.getBoundingClientRect();
  const origin = window.overlayHost.origin();
  const impactX = rect.left - origin.x + rect.width / 2;
  const impactY = rect.top - origin.y + rect.height / 2;

  window.spawnBurst(canvas, {
    x: impactX,
    y: impactY,
    colors: ritual.burstColors || ['#ffffff', '#f7f0e1'],
    shape: ritual.burstShape,
    shapes: ritual.burstShapes,
    count: ritual.burstCount,
    sizeRange: ritual.burstSizeRange,
    lengthRange: ritual.burstLengthRange,
    speedRange: ritual.burstSpeedRange,
    gravity: ritual.burstGravity,
    drag: ritual.burstDrag,
    lifespanMs: ritual.burstLifespanMs,
  });

  // A watery core (coconut water) splashing outward alongside the shell
  // shards/fiber — small, fast, heavily gravity-pulled droplets that fall
  // away quicker than the debris so it reads as liquid, not more shell.
  if (ritual.splash) {
    window.spawnBurst(canvas, {
      x: impactX,
      y: impactY,
      colors: ritual.splashColors || ['#eaf7fb', '#ffffff', '#cdeaf3'],
      shape: 'circle',
      count: ritual.splashCount ?? 36,
      sizeRange: ritual.splashSizeRange || [2.5, 6],
      speedRange: ritual.splashSpeedRange || [160, 400],
      gravity: ritual.splashGravity ?? 750,
      drag: ritual.splashDrag ?? 0.3,
      lifespanMs: ritual.splashLifespanMs ?? 600,
    });
  }

  breakResetTimer = setTimeout(() => {
    img.style.transform = '';
    if (ritualRestPosition) {
      charm.style.left = ritualRestPosition.left;
      charm.style.top = ritualRestPosition.top;
    }
    img.style.opacity = '1';
    // Coconut-style breaks never touch `src` (they just hide/show the
    // same image via opacity) — only re-resolve and reassign it here if
    // this ritual actually swapped it away (a `brokenImage` ritual like
    // the ash gourd), so a plain break never forces an unnecessary
    // image reload/redecode at reset time.
    if (ritual.brokenImage && currentItem?.image) {
      window.overlayAPI.resolveAssetPath(currentItem.image).then((url) => {
        img.src = url;
      });
    }
  }, ritual.resetAfterMs || 1800);
}
