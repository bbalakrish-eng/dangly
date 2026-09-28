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

  // Real art for image-shaped particles (e.g. the autumn leaves) — loaded once per config.images
  // entry, keyed by the catalog-relative path so spawnParticle() can just pick a key at random.
  // resolveAssetPath is async (the app resolves it to a file:// path; the website just echoes it
  // back), so a particle can exist for a few frames before its image is ready — drawParticle()
  // skips it silently until then rather than waiting on a promise mid-frame.
  const imageCache = {};
  if (config.images && config.images.length) {
    config.images.forEach((src) => {
      const entry = { img: new Image(), ready: false, aspect: 1 };
      imageCache[src] = entry;
      const resolved = window.overlayAPI ? window.overlayAPI.resolveAssetPath(src) : Promise.resolve(src);
      resolved.then((url) => {
        entry.img.onload = () => {
          entry.ready = true;
          entry.aspect = entry.img.naturalWidth / entry.img.naturalHeight;
        };
        entry.img.src = url;
      });
    });
  }

  // Ground/accumulation state (only used when config.accumulate is true —
  // e.g. snow settling at the bottom edge instead of just recycling).
  const PILE_BUCKET_WIDTH = 8;
  let pileHeights = null;

  function ensurePileArray() {
    if (!config.accumulate) return;
    const bucketCount = Math.max(1, Math.ceil(canvas.width / PILE_BUCKET_WIDTH));
    if (!pileHeights || pileHeights.length !== bucketCount) {
      const fresh = new Float32Array(bucketCount);
      if (pileHeights) fresh.set(pileHeights.subarray(0, Math.min(pileHeights.length, bucketCount)));
      pileHeights = fresh;
    }
  }

  function groundYFor(x) {
    // Default is the literal bottom of the canvas — which spans the whole
    // screen, Dock/taskbar area included — not the Dock-aware work area
    // pets use, since accumulating snow is meant to reach the real bottom
    // edge and build up from there.
    const base = config.groundY ?? canvas.height;
    if (!config.accumulate || !pileHeights) return base;
    const bucket = Math.min(Math.max(Math.floor(x / PILE_BUCKET_WIDTH), 0), pileHeights.length - 1);
    return base - pileHeights[bucket];
  }

  function depositAt(x, amount) {
    if (!pileHeights) return;
    const bucket = Math.min(Math.max(Math.floor(x / PILE_BUCKET_WIDTH), 0), pileHeights.length - 1);
    const maxHeight = config.maxPileHeight ?? 30;
    // Randomize each landing's contribution and keep the spread to
    // neighbors tight — uniform amounts spread widely is what was making
    // the pile grow as a suspiciously flat, ruler-straight line instead
    // of natural uneven drifts.
    const jitteredAmount = amount * (0.4 + Math.random() * 1.2);
    for (let d = -1; d <= 1; d++) {
      const b = bucket + d;
      if (b < 0 || b >= pileHeights.length) continue;
      const falloff = d === 0 ? 1 : 0.2;
      pileHeights[b] = Math.min(pileHeights[b] + jitteredAmount * falloff, maxHeight);
    }
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  // sizeBias > 1 skews toward the small end of the range (occasional
  // bigger ones, mostly tiny) — real snow isn't uniformly-sized dots.
  function randomSized(min, max, bias) {
    return min + (max - min) * Math.pow(Math.random(), bias);
  }

  // A handful of irregular vertices (fixed per particle, not re-rolled
  // every frame) so each flake reads as a unique jagged crystal instead of
  // a perfect circle — real snowflakes aren't round.
  function randomShapePoints() {
    if (!config.irregular) return null;
    const count = 6 + Math.floor(Math.random() * 3);
    return Array.from({ length: count }, (_, i) => ({
      angle: (i / count) * Math.PI * 2,
      radiusScale: 0.65 + Math.random() * 0.55,
    }));
  }

  // With depthCorrelated, one random "depth" (0 = distant, 1 = close)
  // drives size/length/speed/opacity together, so a particle is
  // consistently small-slow-faint or big-fast-opaque — independent random
  // ranges can produce a "big but slow and faint" streak, which reads as
  // noisy rather than a believable sense of depth.
  function lerpRange(range, t) {
    return range[0] + (range[1] - range[0]) * t;
  }

  function spawnParticle() {
    const x = Math.random() * canvas.width;
    const depth = Math.random();
    const useDepth = Boolean(config.depthCorrelated);

    return {
      x,
      baseX: x,
      y: -20 - Math.random() * canvas.height * 0.5,
      avoidX: 0,
      avoidY: 0,
      renderY: 0,
      phase: Math.random() * Math.PI * 2,
      depth,
      size: config.sizeRange
        ? useDepth
          ? lerpRange(config.sizeRange, depth)
          : randomSized(config.sizeRange[0], config.sizeRange[1], config.sizeBias ?? 1)
        : 14,
      length: config.lengthRange
        ? useDepth
          ? lerpRange(config.lengthRange, depth)
          : randomBetween(config.lengthRange[0], config.lengthRange[1])
        : 14,
      speed: useDepth ? lerpRange(config.fallSpeedRange, depth) : randomBetween(config.fallSpeedRange[0], config.fallSpeedRange[1]),
      glyph: config.glyphs ? config.glyphs[Math.floor(Math.random() * config.glyphs.length)] : null,
      imageSrc: config.images ? config.images[Math.floor(Math.random() * config.images.length)] : null,
      shapePoints: randomShapePoints(),
      rotation: Math.random() * Math.PI * 2,
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

    const ground = groundYFor(p.x);
    if (p.renderY > ground) {
      if (config.accumulate) {
        // Flat per-landing amount, not scaled by particle size — snow is
        // biased toward tiny flakes (sizeBias), so scaling by size made
        // most landings deposit next to nothing, and the pile take far
        // longer to become visible than it looked like it should.
        depositAt(p.x, config.depositAmount ?? 0.35);
      }
      Object.assign(p, spawnParticle());
    }
  }

  // "Glass splats": small ripples appearing at random points across the
  // whole screen at a steady average rate — simulating rain hitting the
  // glass/window you're looking through, rather than rain hitting the
  // ground at the bottom edge. They live in their own short-lived array
  // updated/drawn inside the SAME frame loop as the falling particles —
  // a separate independent rAF-driven system (like the one-shot
  // spawnBurst below) would each clear the canvas on its own schedule and
  // stomp on the other's output, since both would draw to this canvas at
  // the same time.
  let splashes = [];
  let glassSplashTimer = 0;

  function spawnSplash(x, y, depth) {
    splashes.push({ x, y, age: 0, maxAge: config.splashDuration ?? 0.22, depth });
  }

  function updateGlassSplashes(dt) {
    if (!config.glassSplash) return;
    glassSplashTimer -= dt;
    if (glassSplashTimer <= 0) {
      const rate = config.glassSplashRate ?? 4; // average splats per second
      glassSplashTimer = (1 / rate) * (0.4 + Math.random());
      spawnSplash(Math.random() * canvas.width, Math.random() * canvas.height, 0.4 + Math.random() * 0.6);
    }
  }

  function updateAndDrawSplashes(dt) {
    updateGlassSplashes(dt);
    if (!splashes.length) return;
    splashes = splashes.filter((s) => {
      s.age += dt;
      if (s.age >= s.maxAge) return false;
      drawSplat(s, s.age / s.maxAge);
      return true;
    });
  }

  // A drop hitting glass: one continuous teardrop shape — a rounded head
  // (the impact point) tapering smoothly to a point as it drips — rather
  // than a separate circle-plus-line, which always reads as two
  // disconnected pieces no matter how they're aligned. Grows via a single
  // smooth curve (no distinct "phases") and drips at a slight angle
  // matching the wind-driven fall angle, not straight down.
  function drawSplat(s, t) {
    const color = config.splashColor || config.color || 'rgba(255, 255, 255, 0.7)';
    const depthScale = 0.5 + s.depth * 0.5;

    const grow = t * t * (3 - 2 * t); // smoothstep: one continuous ease, no phase seam
    const headRadius = (config.splashBlobRadius ?? 4) * depthScale * Math.min(grow / 0.3, 1);
    const dripLength = (config.splashDripLength ?? 30) * depthScale * grow;

    const fadeStart = 0.6;
    const fade = t < fadeStart ? 1 : Math.max(1 - (t - fadeStart) / (1 - fadeStart), 0);

    const angle = ((config.angleDegrees || 0) * Math.PI) / 180;
    const tipX = s.x + Math.sin(angle) * dripLength;
    const tipY = s.y + Math.cos(angle) * dripLength;
    // Perpendicular to the drip direction, pulled slightly inside the
    // head's radius so the tail's base sits fully inside the circle —
    // guarantees the two shapes overlap with no visible seam, without
    // needing exact arc-sweep math for a true teardrop curve.
    const perpX = Math.cos(angle) * headRadius * 0.9;
    const perpY = -Math.sin(angle) * headRadius * 0.9;

    ctx.save();
    ctx.globalAlpha = fade * (config.splashOpacity ?? 0.8);
    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.arc(s.x, s.y, headRadius, 0, Math.PI * 2);
    ctx.fill();

    if (dripLength > 0.5) {
      ctx.beginPath();
      ctx.moveTo(s.x - perpX, s.y - perpY);
      ctx.lineTo(s.x + perpX, s.y + perpY);
      ctx.lineTo(tipX, tipY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function toTransparent(color) {
    const match = /rgba?\(([^)]+)\)/.exec(color);
    if (!match) return 'rgba(255, 255, 255, 0)';
    const [r, g, b] = match[1].split(',');
    return `rgba(${r},${g},${b}, 0)`;
  }

  function drawParticle(p) {
    const y = p.renderY;

    if (config.shape === 'line') {
      const angle = ((config.angleDegrees || 0) * Math.PI) / 180;
      const dx = Math.sin(angle) * p.length;
      const dy = Math.cos(angle) * p.length;
      const depth = p.depth ?? 1;
      const baseColor = config.color || 'rgba(255, 255, 255, 0.6)';

      // A gradient fading to transparent along the streak (rather than a
      // flat-opacity line) reads as motion blur; opacity/width scaling
      // with depth makes closer drops read as bolder, distant ones fainter.
      const gradient = ctx.createLinearGradient(p.x, y, p.x + dx, y + dy);
      gradient.addColorStop(0, baseColor);
      gradient.addColorStop(1, toTransparent(baseColor));

      ctx.save();
      ctx.globalAlpha = config.opacityRange ? lerpRange(config.opacityRange, depth) : 1;
      ctx.strokeStyle = gradient;
      ctx.lineWidth = config.lineWidthRange ? lerpRange(config.lineWidthRange, depth) : 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, y);
      ctx.lineTo(p.x + dx, y + dy);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (config.shape === 'dot') {
      // A soft, gently-blurred particle reads as real falling snow far
      // better than a crisp glyph like the ❄ character (a sharp little
      // asterisk at small sizes). An irregular jagged outline (rather than
      // a perfect circle) reads as a real, unique snowflake crystal.
      ctx.save();
      ctx.globalAlpha = config.opacity ?? 0.85;
      ctx.fillStyle = config.color || '#ffffff';
      ctx.shadowColor = config.color || '#ffffff';
      ctx.shadowBlur = p.size * (config.glowAmount ?? 1.2);
      ctx.beginPath();
      if (p.shapePoints) {
        p.shapePoints.forEach((pt, i) => {
          const r = p.size * pt.radiusScale;
          const px = p.x + Math.cos(pt.angle + p.rotation) * r;
          const py = y + Math.sin(pt.angle + p.rotation) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      } else {
        ctx.arc(p.x, y, p.size, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
      return;
    }

    if (config.shape === 'image') {
      const entry = p.imageSrc && imageCache[p.imageSrc];
      if (!entry || !entry.ready) return; // not loaded yet — this particle just sits out a few frames
      const drawWidth = p.size;
      const drawHeight = p.size / entry.aspect;
      ctx.save();
      ctx.translate(p.x, y);
      if (config.rotate) ctx.rotate(p.rotation);
      ctx.globalAlpha = config.opacity ?? 1;
      ctx.drawImage(entry.img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      ctx.restore();
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

  function drawPile() {
    if (!config.accumulate || !pileHeights) return;
    const baseY = config.groundY ?? canvas.height;

    ctx.save();
    ctx.globalAlpha = config.pileOpacity ?? 0.9;
    ctx.fillStyle = config.pileColor || config.color || '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.lineTo(0, baseY - pileHeights[0]);
    for (let i = 0; i < pileHeights.length - 1; i++) {
      const x1 = i * PILE_BUCKET_WIDTH;
      const y1 = baseY - pileHeights[i];
      const x2 = (i + 1) * PILE_BUCKET_WIDTH;
      const y2 = baseY - pileHeights[i + 1];
      ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
    }
    ctx.lineTo(canvas.width, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function frame(time) {
    if (lastTime === null) lastTime = time;
    const dt = Math.min((time - lastTime) / 1000, 0.05);
    const elapsed = time / 1000;
    lastTime = time;

    ensurePileArray();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPile();
    ensureDensity();
    for (const p of particles) {
      updateParticle(p, dt, elapsed);
      drawParticle(p);
    }
    updateAndDrawSplashes(dt);

    animationFrame = requestAnimationFrame(frame);
  }

  function start() {
    // Canvas sizing is owned centrally by renderer.js, since one-shot
    // bursts (see spawnBurst below) need it ready even when no ambient
    // effect is running.
    particles = [];
    pileHeights = null;
    splashes = [];
    lastTime = null;
    animationFrame = requestAnimationFrame(frame);
  }

  function stop() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = [];
    splashes = [];
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
    lengthRange = [8, 16], // for the 'strand' shape
    speedRange = [80, 220],
    gravity = 300,
    drag = 0, // per-second multiplicative velocity decay, 0 = none (pure ballistic)
    lifespanMs = 700,
    shape = 'circle', // fallback shape when `shapes` isn't given
    shapes, // optional array for a per-particle random shape pick, e.g. ['shard', 'shard', 'strand'] (duplicate entries bias the odds)
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
      length: lengthRange[0] + Math.random() * (lengthRange[1] - lengthRange[0]),
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: shapes && shapes.length ? shapes[Math.floor(Math.random() * shapes.length)] : shape,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 14,
      curve: (Math.random() - 0.5) * 0.6, // slight bend, so 'strand' pieces read as flexible fiber
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

      if (drag) {
        const decay = Math.exp(-drag * dt);
        p.vx *= decay;
        p.vy *= decay;
      }
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;

      ctx.globalAlpha = 1 - age / lifespanMs;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;

      if (p.shape === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      } else if (p.shape === 'strand') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.lineWidth = Math.max(p.size * 0.18, 0.6);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-p.length / 2, 0);
        ctx.quadraticCurveTo(p.curve * p.length, -p.length * 0.3, p.length / 2, 0);
        ctx.stroke();
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
