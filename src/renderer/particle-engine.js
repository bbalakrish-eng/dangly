// Generic canvas-based particle system. Behavior is entirely driven by
// the merged preset/config object — new effects are new presets, not new
// rendering code, as long as they fit the fall-and-drift model.

function createParticleSystem(canvas, rawConfig) {
  const preset = window.EFFECT_PRESETS[rawConfig.preset] || {};
  const config = { ...preset, ...rawConfig };
  const ctx = canvas.getContext('2d');

  let particles = [];
  let cursor = null;
  let animationFrame = null;
  let lastTime = null;

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function spawnParticle() {
    const x = Math.random() * canvas.width;
    return {
      x,
      baseX: x,
      y: -20 - Math.random() * canvas.height * 0.5,
      avoidX: 0,
      avoidY: 0,
      renderY: 0,
      phase: Math.random() * Math.PI * 2,
      size: config.sizeRange ? randomBetween(config.sizeRange[0], config.sizeRange[1]) : 14,
      length: config.lengthRange ? randomBetween(config.lengthRange[0], config.lengthRange[1]) : 14,
      speed: randomBetween(config.fallSpeedRange[0], config.fallSpeedRange[1]),
      glyph: config.glyphs ? config.glyphs[Math.floor(Math.random() * config.glyphs.length)] : null,
      rotation: 0,
      rotationSpeed: config.rotate ? randomBetween(-1, 1) : 0,
    };
  }

  function ensureDensity() {
    while (particles.length < config.density) {
      particles.push(spawnParticle());
    }
  }

  function updateParticle(p, dt, elapsed) {
    // Pure physics: fall speed and the natural side-to-side sway. Cursor
    // avoidance is a separate offset layered on top (see below) so it
    // isn't wiped out and re-derived from scratch every frame.
    p.y += p.speed * dt;

    const sway = config.swayAmplitude
      ? Math.sin(elapsed * (config.swayFrequency || 0.5) + p.phase) * config.swayAmplitude
      : 0;
    const naturalX = p.baseX + sway;

    if (config.cursorAvoidRadius && cursor) {
      const dx = naturalX + p.avoidX - cursor.x;
      const dy = p.y + p.avoidY - cursor.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < config.cursorAvoidRadius && dist > 0.01) {
        const push = (1 - dist / config.cursorAvoidRadius) * (config.cursorAvoidStrength ?? 400) * dt;
        p.avoidX += (dx / dist) * push;
        p.avoidY += (dy / dist) * push;
      }
    }

    // Spring the offset back toward zero once the cursor moves away, so
    // particles resume their natural path instead of drifting forever.
    const relax = Math.exp(-dt * 4);
    p.avoidX *= relax;
    p.avoidY *= relax;

    p.x = naturalX + p.avoidX;
    p.renderY = p.y + p.avoidY;

    if (config.rotate) {
      p.rotation += p.rotationSpeed * dt;
    }

    if (p.y > canvas.height + 40) {
      Object.assign(p, spawnParticle());
    }
  }

  function drawParticle(p) {
    const y = p.renderY;

    if (config.shape === 'line') {
      const angle = ((config.angleDegrees || 0) * Math.PI) / 180;
      const dx = Math.sin(angle) * p.length;
      const dy = Math.cos(angle) * p.length;
      ctx.strokeStyle = config.color || 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, y);
      ctx.lineTo(p.x + dx, y + dy);
      ctx.stroke();
      return;
    }

    ctx.save();
    ctx.translate(p.x, y);
    if (config.rotate) ctx.rotate(p.rotation);
    ctx.font = `${p.size}px sans-serif`;
    ctx.fillStyle = config.color || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.glyph || '', 0, 0);
    ctx.restore();
  }

  function frame(time) {
    if (lastTime === null) lastTime = time;
    const dt = Math.min((time - lastTime) / 1000, 0.05);
    const elapsed = time / 1000;
    lastTime = time;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ensureDensity();
    for (const p of particles) {
      updateParticle(p, dt, elapsed);
      drawParticle(p);
    }

    animationFrame = requestAnimationFrame(frame);
  }

  function start() {
    // Canvas sizing is owned centrally by renderer.js, since one-shot
    // bursts (see spawnBurst below) need it ready even when no ambient
    // effect is running.
    particles = [];
    lastTime = null;
    animationFrame = requestAnimationFrame(frame);
  }

  function stop() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = [];
  }

  function updateCursor(x, y) {
    cursor = { x, y };
  }

  return { start, stop, updateCursor };
}

window.createParticleSystem = createParticleSystem;

// One-shot particle burst (e.g. a ritual "break" action) — independent of
// the ambient system above, safe to use even while a charm item is active,
// since charms never draw on this canvas themselves.
function spawnBurst(canvas, options) {
  const ctx = canvas.getContext('2d');
  const {
    x,
    y,
    count = 24,
    colors = ['#ffffff'],
    sizeRange = [3, 6],
    speedRange = [80, 220],
    gravity = 300,
    lifespanMs = 700,
    shape = 'circle', // 'circle' | 'shard' (small rotating rectangular chips, for debris-style breaks)
  } = options;

  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = speedRange[0] + Math.random() * (speedRange[1] - speedRange[0]);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 100,
      size: sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]),
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 12,
      born: performance.now(),
    });
  }

  let lastTime = null;

  function frame(time) {
    if (lastTime === null) lastTime = time;
    const dt = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let stillAlive = false;
    for (const p of particles) {
      const age = time - p.born;
      if (age >= lifespanMs) continue;
      stillAlive = true;

      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;

      ctx.globalAlpha = 1 - age / lifespanMs;
      ctx.fillStyle = p.color;

      if (shape === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    if (stillAlive) {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

window.spawnBurst = spawnBurst;
