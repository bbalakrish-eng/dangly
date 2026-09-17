// Drives a single DOM element (the pet) through a small walk/idle state
// machine: wander to a random point along the bottom edge, pause, repeat.
// Position and left/right facing are applied via `transform` on `el`
// itself, so the click-reaction animation (added/removed by renderer.js)
// is kept on a separate inner element to avoid the two fighting over the
// same CSS property.

function createPetSystem(el, rawConfig) {
  const preset = window.PET_PRESETS[rawConfig.preset] || {};
  const config = { ...preset, ...rawConfig };

  let x = 0;
  let facing = 1;
  let state = 'idle';
  let stateTimer = 0;
  let targetX = 0;
  let bobPhase = 0;
  let animationFrame = null;
  let lastTime = null;

  function groundY() {
    if (typeof config.groundY === 'number') return config.groundY;
    return window.innerHeight - (config.groundMargin ?? 60);
  }

  function pickNewTarget() {
    const margin = 40;
    targetX = margin + Math.random() * (window.innerWidth - margin * 2);
  }

  function render() {
    const bob = state === 'walking' ? Math.sin(bobPhase) * (config.bobAmount ?? 4) : 0;
    const waddle = state === 'walking' ? Math.sin(bobPhase) * (config.waddleDegrees ?? 0) : 0;
    // Most animal emoji face left by default; flip only when travelling right.
    const orientationSign = config.facesLeft === false ? 1 : -1;
    el.style.transform =
      `translate(${x}px, ${groundY() + bob}px) ` +
      `scaleX(${facing * orientationSign}) rotate(${waddle}deg)`;
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
    x = window.innerWidth / 2;
    targetX = x;
    state = 'idle';
    stateTimer = 1;
    lastTime = null;
    render();
    animationFrame = requestAnimationFrame(frame);
  }

  function stop() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
  }

  return { start, stop };
}

window.createPetSystem = createPetSystem;
