// Multi-segment Verlet-integrated rope, modeled on how luckydangle.app's
// charm physics actually works (reverse-engineered from its shipped JS):
// a chain of connected points rather than a single rigid pendulum, run at
// a fixed physics tick (matching their constants exactly gives the same
// springy, multi-wave feel) with:
//   - gravity + velocity damping per point
//   - a small ambient wind sway so it's never perfectly still
//   - dragging the last point (the charm) follows the cursor exactly,
//     and releasing it naturally "flings" based on real recent motion —
//     a property of Verlet integration, not a separate velocity calc
//   - dragging near the very top of the screen also eases the anchor
//     sideways, so there's no separate "handle" to find — one drag
//     gesture does both reposition-the-hang-point and swing-the-charm

function createCharmPhysics({ segments = 12, segmentLength = 15.5, initialAnchorX = 0, anchorY = 6 } = {}) {
  const GRAVITY_STEP = 0.125;
  const DAMPING = 0.98;
  const FIXED_STEP = 1 / 120;
  const CONSTRAINT_ITERATIONS = 5;
  const ANCHOR_SLIDE_ZONE = 60; // dragging the charm above this y eases the anchor toward it
  const ANCHOR_MIN_X = 40;

  const HOVER_RADIUS = 46;
  const HOVER_STRENGTH = 900;

  let anchorX = initialAnchorX;
  let accumulator = 0;
  let elapsed = 0;
  let dragging = false;
  let dragTarget = null;
  let cursor = null;
  // The charm's own rendered size, so hover proximity is measured against
  // its actual visible rectangle rather than just the single top-anchor
  // point — a fixed small radius from that one point only covered a
  // small emoji-sized charm; it barely reached the top of a 200px+ image.
  let charmWidth = 40;
  let charmHeight = 40;

  const points = Array.from({ length: segments }, (_, i) => ({
    x: anchorX,
    y: anchorY + i * segmentLength,
    px: anchorX,
    py: anchorY + i * segmentLength,
  }));

  function bob() {
    return points[points.length - 1];
  }

  function startDrag(px, py) {
    dragging = true;
    dragTarget = { x: px, y: py };
    const b = bob();
    b.x = b.px = px;
    b.y = b.py = py;
  }

  function dragTo(px, py) {
    dragTarget = { x: px, y: py };
  }

  function endDrag() {
    dragging = false;
    dragTarget = null;
  }

  function flick(strength = 18) {
    const b = bob();
    b.px += (Math.random() < 0.5 ? -1 : 1) * strength;
  }

  function updateCursor(x, y) {
    cursor = { x, y };
  }

  function setSize(width, height) {
    charmWidth = width;
    charmHeight = height;
  }

  // A subtle "flinch" when the cursor passes near the charm without
  // dragging it — nudges the bob's current position without touching its
  // previous position, which Verlet integration reads as an implicit
  // velocity kick next step, so it eases back naturally via the existing
  // gravity/damping rather than needing a separate spring model. Called
  // from stepOnce() with the fixed timestep, not from update() with the
  // real (variable) frame time — the push scales with dt², which made it
  // very sensitive to ordinary frame-timing jitter (16ms vs 18ms is a
  // small dt difference but a much larger one once squared), reading as
  // a flicker rather than smooth motion.
  function applyHoverReaction(dt) {
    if (dragging || !cursor) return;

    const b = bob();
    // The charm's art hangs below-and-centered on the bob (its top
    // attachment point) — measure distance to that rectangle's nearest
    // edge, not just the single bob point, so hovering anywhere over a
    // tall/wide image triggers the reaction, not only near its very top.
    const rectX = b.x - charmWidth / 2;
    const nearestX = Math.max(rectX, Math.min(cursor.x, rectX + charmWidth));
    const nearestY = Math.max(b.y, Math.min(cursor.y, b.y + charmHeight));
    const edgeDx = nearestX - cursor.x;
    const edgeDy = nearestY - cursor.y;
    const edgeDist = Math.hypot(edgeDx, edgeDy);
    if (edgeDist >= HOVER_RADIUS) return;

    // Direction of the push is away from the bob (the charm recoiling as
    // a whole), even though the radius check used the nearest edge.
    const dx = b.x - cursor.x;
    const dy = b.y - cursor.y;
    const dist = Math.max(Math.hypot(dx, dy), 0.5);

    const falloff = (HOVER_RADIUS - edgeDist) / HOVER_RADIUS;
    const push = falloff * falloff * HOVER_STRENGTH * dt * dt;
    b.x += (dx / dist) * push;
    b.y += (dy / dist) * push * 0.4;
  }

  function stepOnce() {
    elapsed += FIXED_STEP;
    applyHoverReaction(FIXED_STEP);
    const n = points.length;
    const wind = 0.0035 * Math.sin(elapsed * 0.55) + 0.002 * Math.sin(elapsed * 1.3 + 0.8);

    for (let i = 1; i < n; i++) {
      if (dragging && i === n - 1) continue; // bob is kinematically driven below
      const p = points[i];
      const vx = (p.x - p.px) * DAMPING;
      const vy = (p.y - p.py) * DAMPING;
      p.px = p.x;
      p.py = p.y;
      p.x += vx + wind * (i / (n - 1));
      p.y += vy + GRAVITY_STEP;
    }

    if (dragging && dragTarget) {
      const b = bob();
      b.px = b.x;
      b.py = b.y;
      b.x = dragTarget.x;
      b.y = dragTarget.y;

      if (dragTarget.y < ANCHOR_SLIDE_ZONE) {
        anchorX += (dragTarget.x - anchorX) * 0.12;
        anchorX = Math.max(anchorX, ANCHOR_MIN_X);
      }
    }

    for (let iter = 0; iter < CONSTRAINT_ITERATIONS; iter++) {
      points[0].x = anchorX;
      points[0].y = anchorY;
      if (dragging && dragTarget) {
        const b = bob();
        b.x = dragTarget.x;
        b.y = dragTarget.y;
      }

      for (let i = 0; i < n - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(Math.hypot(dx, dy), 0.0001);
        const u = (dist - segmentLength) / dist / 2;
        const cx = dx * u;
        const cy = dy * u;

        if (i === 0) {
          b.x -= cx * 2;
          b.y -= cy * 2;
        } else if (dragging && i === n - 2) {
          a.x += cx * 2;
          a.y += cy * 2;
        } else {
          a.x += cx;
          a.y += cy;
          b.x -= cx;
          b.y -= cy;
        }
      }
    }
  }

  function update(dtSeconds) {
    accumulator = Math.min(accumulator + dtSeconds, FIXED_STEP * 5);
    while (accumulator >= FIXED_STEP) {
      stepOnce();
      accumulator -= FIXED_STEP;
    }
  }

  function render(stringPolyline) {
    stringPolyline.setAttribute('points', points.map((p) => `${p.x},${p.y}`).join(' '));
    return bob();
  }

  function getPoints() {
    return points;
  }

  // The angle of the last segment (second-to-last point to the bob),
  // in degrees, 0 = hanging straight down. A hanging object naturally
  // tilts to align with the string as it swings — without this, the
  // charm only ever translates and always renders upright, which looks
  // stiff regardless of how hard it's actually swinging.
  function getSwingAngleDegrees() {
    const n = points.length;
    const a = points[n - 2];
    const b = points[n - 1];
    return (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
  }

  return {
    startDrag,
    dragTo,
    endDrag,
    flick,
    updateCursor,
    setSize,
    update,
    render,
    getPoints,
    getSwingAngleDegrees,
    getSegmentLength: () => segmentLength,
    isDragging: () => dragging,
  };
}

window.createCharmPhysics = createCharmPhysics;
