// Drives a single DOM element (the pet) through a small walk/idle state
// machine: wander to a random point along the bottom edge, pause, repeat.
// Position and left/right facing are applied via `transform` on `el`
// itself, so the click-reaction animation (added/removed by renderer.js)
// is kept on a separate inner element (`glyphEl`) to avoid the two
// fighting over the same CSS property.
//
// Two rendering modes, chosen by whether config.rig is set:
//   - No rig: glyphEl shows a plain emoji, and the engine fakes a walk
//     with a whole-body bob + waddle rock (the only illusion possible
//     with one static glyph).
//   - config.rig set: glyphEl is filled with the referenced inline SVG,
//     and the engine animates its #frontLeg/#backLeg/#tail parts
//     independently — real per-limb movement instead of a faked wobble.

function createPetSystem(el, glyphEl, rawConfig) {
  const preset = window.PET_PRESETS[rawConfig.preset] || {};
  const config = { ...preset, ...rawConfig };
  const hasRig = Boolean(config.rig);

  let x = 0;
  let facing = 1;
  let state = 'idle';
  let stateTimer = 0;
  let targetX = 0;
  let bobPhase = 0;
  let animationFrame = null;
  let lastTime = null;
  const rigParts = {};

  function groundY() {
    if (typeof config.groundY === 'number') return config.groundY;
    return window.overlayHost.size().height - (config.groundMargin ?? 60);
  }

  function pickNewTarget() {
    const margin = 40;
    targetX = margin + Math.random() * (window.overlayHost.size().width - margin * 2);
  }

  async function loadRig() {
    const url = await window.overlayAPI.resolveAssetPath(config.rig);
    const response = await fetch(url);
    glyphEl.innerHTML = await response.text();
    rigParts.frontLeg = glyphEl.querySelector('#frontLeg');
    rigParts.backLeg = glyphEl.querySelector('#backLeg');
    rigParts.tail = glyphEl.querySelector('#tail');
  }

  function render() {
    const bob = state === 'walking' ? Math.sin(bobPhase) * (config.bobAmount ?? 4) : 0;
    const waddle = !hasRig && state === 'walking' ? Math.sin(bobPhase) * (config.waddleDegrees ?? 0) : 0;
    // Most animal emoji/art face left by default; flip only when travelling right.
    const orientationSign = config.facesLeft === false ? 1 : -1;
    // el's own (0,0) is its top-left corner, but "groundY" means where the
    // feet should land — for art taller than a text glyph's line-height
    // (e.g. an SVG rig), footOffset shifts it up so the feet, not the top
    // edge, sit on the ground line.
    const footOffset = config.footOffset ?? 0;
    el.style.transform =
      `translate(${x}px, ${groundY() + bob - footOffset}px) ` +
      `scaleX(${facing * orientationSign}) rotate(${waddle}deg)`;

    if (rigParts.frontLeg && rigParts.backLeg) {
      const legAmp = config.legSwingDegrees ?? 25;
      // A true phase offset (not a mirror-image negation) reads as a more
      // natural gait — legs at exact opposite extremes at the same instant
      // looks too symmetric/mechanical for a 2-leg side-view rig.
      const legPhaseOffset = config.legPhaseOffset ?? Math.PI * 0.8;
      const frontSwing = state === 'walking' ? Math.sin(bobPhase) * legAmp : 0;
      const backSwing = state === 'walking' ? Math.sin(bobPhase + legPhaseOffset) * legAmp : 0;
      rigParts.frontLeg.style.transform = `rotate(${frontSwing}deg)`;
      rigParts.backLeg.style.transform = `rotate(${backSwing}deg)`;
    }
    if (rigParts.tail) {
      const tailSwing = Math.sin(bobPhase * 0.6 + 1) * (config.tailSwingDegrees ?? 8);
      rigParts.tail.style.transform = `rotate(${tailSwing}deg)`;
    }
  }

  function update(dt) {
    if (state === 'idle') {
      stateTimer -= dt;
      if (stateTimer <= 0) {
        pickNewTarget();
        state = 'walking';
      }
      return;
    }

    const dx = targetX - x;
    if (Math.abs(dx) < 4) {
      state = 'idle';
      const idleMin = config.idleMin ?? 2;
      const idleMax = config.idleMax ?? 5;
      stateTimer = idleMin + Math.random() * (idleMax - idleMin);
      return;
    }

    facing = dx >= 0 ? 1 : -1;
    x += facing * (config.speed ?? 60) * dt;
    bobPhase += dt * (config.bobSpeed ?? 8);
  }

  function frame(time) {
    if (lastTime === null) lastTime = time;
    const dt = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;

    update(dt);
    render();

    animationFrame = requestAnimationFrame(frame);
  }

  function start() {
    x = window.overlayHost.size().width / 2;
    targetX = x;
    state = 'idle';
    stateTimer = 1;
    lastTime = null;
    if (hasRig) loadRig();
    render();
    animationFrame = requestAnimationFrame(frame);
  }

  function stop() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
  }

  return { start, stop };
}

window.createPetSystem = createPetSystem;
