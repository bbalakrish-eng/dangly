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

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
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
    resize();
    particles = [];
    lastTime = null;
    window.addEventListener('resize', resize);
    animationFrame = requestAnimationFrame(frame);
  }

  function stop() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    window.removeEventListener('resize', resize);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = [];
  }

  function updateCursor(x, y) {
    cursor = { x, y };
  }

  return { start, stop, updateCursor };
}

window.createParticleSystem = createParticleSystem;
