# Adding a new item

Add an entry to `items.json` — no code changes needed. Restart the app (or reopen the gallery) to see it.

```json
{
  "id": "unique-id",
  "name": "Display name",
  "origin": "Where it's from, shown under the name on the card",
  "category": "Charms",
  "description": "One or two sentences shown in the gallery card.",
  "type": "charm",
  "glyph": "🔔",
  "ritual": { "label": "Button text shown for its action", "animation": "flick" }
}
```

- `id` must be unique across the file.
- `category` groups items into sections in the gallery (currently: `Charms`, `Atmosphere`, `Rituals`, `Pets`; a planned future one for original power-effect items like a spinning shield or a lightning hammer isn't built yet). Purely a display grouping — pick any string, items with the same one land in the same section.
- `glyph` is the emoji fallback. For real illustrated art, add an `image` field instead (or alongside — `glyph` is unused once `image` is present):
  ```json
  { "type": "charm", "image": "assets/items/evil-eye.svg" }
  ```
  `image` is a path relative to the project root (resolved at runtime via `assets:resolve` in `src/main/main.js`, so it works identically in dev and in a packaged build). Drop the art file under `assets/items/` and point to it — no code changes. Art is sized by height (`72px`, aspect ratio preserved), so non-square art isn't squashed into a fixed box.

## Charm items (clover, evil eye, …) — hang from a string

`type: "charm"` items hang from a string anchored near the top of the screen with real pendulum + elastic physics (`src/renderer/charm-physics.js`) — automatic for the type, no catalog config needed:

- Drag the **charm itself** to pull it on its string (both the swing angle and the string's length react); release and it swings and bounces back to hanging straight down, rather than snapping instantly or staying wherever you dropped it. Dragging it up near the very top of the screen also eases the anchor sideways to follow — one gesture does both reposition-the-hang-point and swing-the-charm, no separate handle needed.
- `ritual.animation: "flick"` (the default) gives the string a smaller version of that same physics impulse on a plain click — it is a physics response, not a CSS animation.
- The charm also "flinches" subtly away from the cursor just from hovering nearby (no click needed) — `applyHoverReaction()` in `charm-physics.js`, tuned via `HOVER_RADIUS`/`HOVER_STRENGTH` constants in that file (not currently exposed per-item).
- Position isn't persisted across restarts (it re-centers on launch).
- The string attaches at the charm's *top* (the rope's last point, the "bob," equals the charm's top-center), not its middle — like a real pendant tied through a loop near its top, not skewered through its center.
- Optional `beads`: small decorative circles (not emoji — see below for why) strung along the cord above the charm:
  ```json
  "beads": [
    { "kind": "pearl", "radius": 5 },
    { "kind": "eye", "radius": 9 },
    { "kind": "pearl", "radius": 7 }
  ],
  "beadGap": 0,
  "beadClearance": 5
  ```
  - Each bead is a drawn SVG circle (`kind: "pearl"` — a glossy radial-gradient sphere, or `"eye"` — a mini concentric-circle nazar), not emoji. Emoji glyph metrics are imprecise and platform-dependent, which made pixel-accurate spacing impossible to tune; drawn circles let spacing be computed as exact radius math instead.
  - Positioning is **exact geometry**, not guesswork: `beadClearance` is the edge-to-edge gap (px) from the charm's top to the nearest bead's edge. `beadGap` is the edge-to-edge gap (px) between each pair of beads further up the rope — one number for every gap, or an array read outward from the charm, e.g. `[-2, 0]`. **`0` means the two circles are exactly tangent (touching, no overlap); negative overlaps them** (like real threaded beads resting against each other); positive leaves visible space. Since it's radius-sum math, there's no need to iteratively guess a pixel value the way the old glyph-based version required.
  - Beads ride along the rope's own physics points (`getPoints()`/`getSegmentLength()` in `charm-physics.js`) — purely visual, not separately simulated.

## Ritual items (coconut-breaking, lamp lighting, …) — fixed spot, multi-stage click action

`type: "ritual"` items do **not** hang or swing — they sit at a fixed position and respond to a click with a multi-stage sequence: swap to a "broken"/"finished" image, play a particle burst, then revert. This is the right type for actions like coconut-breaking, camphor/lamp lighting, or ash-gourd breaking — anything that's "perform this action" rather than "hang this ornament."

```json
{
  "id": "unique-id",
  "category": "Rituals",
  "type": "ritual",
  "image": "assets/items/coconut-whole.svg",
  "ritual": {
    "label": "Break the coconut",
    "animation": "break",
    "brokenImage": "assets/items/coconut-broken.svg",
    "resetAfterMs": 1800,
    "burstColors": ["#ffffff", "#f7f0e1"]
  }
}
```

On click: the image swaps to `brokenImage`, a one-shot particle burst plays (`spawnBurst` in `particle-engine.js`), then after `resetAfterMs` it reverts to the item's original `image`. Reuse this same pattern for other ritual actions — same mechanic, different art/burst tuning. Burst options: `burstColors`, `burstShape` (`"circle"` default, or `"shard"` for small rotating rectangular chips — debris rather than confetti), `burstCount`, `burstSizeRange`, `burstSpeedRange`, `burstLifespanMs`. A genuinely different *kind* of multi-stage action (not just different art/burst tuning) means extending `performBreakRitual()` in `src/renderer/renderer.js`.

## Effect items (snow, rain, leaves, …) — ambient, click-through, full-screen

Set `"type": "effect"` instead of `"charm"`, drop `ritual`, and add an `effect` block:

```json
{
  "id": "unique-id",
  "category": "Atmosphere",
  "type": "effect",
  "glyph": "❄️",
  "effect": { "preset": "snow" }
}
```

- `glyph` here is only used as the gallery preview icon — it has no effect on the actual particle rendering.
- `effect.preset` must be one of the presets defined in `src/renderer/effect-presets.js` (`snow`, `rain`, `leaves`). You can override any of that preset's fields inline, e.g. `"effect": { "preset": "snow", "density": 200, "color": "#a5d8ff" }`.
- `shape` picks how each particle is drawn: `"dot"` (a soft, gently-blurred particle, used by snow; looks like real falling snow rather than a crisp glyph), `"line"` (a short stroke, used by rain), or omitted (falls back to drawing a `glyphs` character, used by leaves — fine for irregular shapes like leaves that don't read well as plain dots).
  - For `"dot"`: `glowAmount` scales the blur radius relative to particle size (bigger = softer/hazier). `irregular: true` gives each particle a fixed, unique jagged outline (6-8 randomized vertices, rolled once per particle) instead of a perfect circle — combine with `rotate: true` for a slow tumble, so it reads as a real snowflake crystal rather than a dot.
  - `sizeBias` (applies to any shape's `sizeRange`) skews the random size distribution toward the small end when `> 1` — real snow isn't uniformly-sized, it's mostly tiny specks with occasional bigger flecks.
  - `depthCorrelated: true` (used by rain) picks one random "depth" per particle and derives `size`/`length`/`fallSpeed` all from it together, instead of randomizing each independently — a particle is consistently small-slow-faint or big-fast-bold, which reads as real depth/distance rather than noisy unrelated variation. Combine with `opacityRange`/`lineWidthRange` (for `"line"` shape) to also scale those with depth. Line-shape particles additionally render with a gradient fading to transparent along the streak (motion-blur look) rather than a flat-opacity stroke.
  - `glassSplash: true` spawns drop-hits-glass splats at random points across the whole screen at a steady average rate (`glassSplashRate`, splats/sec), independent of where any specific falling particle actually is. Each splat is drawn as one continuous teardrop shape — a rounded head (`splashBlobRadius`) tapering to a point as it drips (`splashDripLength`), angled to match the same wind-driven `angleDegrees` as the falling streaks. **Currently disabled on rain** (`glassSplash: false`) — went through several visual iterations (ripple ring → circle-plus-line drip → one-piece teardrop) and still didn't look right, so it's off rather than shipping something that looks bad. The mechanism (`updateGlassSplashes`/`drawSplat` in `particle-engine.js`) is left in place if a different visual approach is worth trying later — this runs inside the same frame loop as the falling particles, not the one-shot `spawnBurst` mechanism below (that one assumes it has the canvas to itself, safe only when no ambient effect is running, e.g. a ritual's break animation).
- `accumulate: true` makes particles settle and pile up at the ground line instead of just recycling — used by snow. Effects default to the literal bottom of the screen (`canvas.height`), *not* the Dock-aware work area pets stand on — accumulating snow is meant to reach the real bottom edge and build up from there, potentially tall enough to visually reach up over the Dock/taskbar. Whether it actually renders *in front of* the real Dock/taskbar (covering icons) or gets hidden behind it depends on whether this window's OS-level layering sits above that system UI — that's a platform-specific unknown, not something guaranteed by this code. Override with an explicit `groundY` (px) per item if some other stopping line is wanted.
  - `maxPileHeight`: cap on how tall the pile can grow, in px.
  - `depositAmount`: base amount of pile height each landed particle adds — each landing also gets randomized (±) and spreads only slightly to neighboring columns, so the pile grows as natural uneven drifts rather than a suspiciously flat, ruler-straight line.
  - `pileColor`/`pileOpacity`: override the pile's fill (defaults to the particle `color`).
  - The pile is a coarse height-map (`PILE_BUCKET_WIDTH` px per column in `particle-engine.js`) smoothed with quadratic curves — a genuinely different accumulation *look* (e.g. drifts that slide/settle over time) means extending that height-map logic, not just tuning these numbers.
- A brand-new *look* (not just a tuned variant) means adding a new preset to `effect-presets.js` — see that file's fields (density, shape/glyphs, size/speed ranges, sway, rotation, cursor-avoidance radius).
- Effect items are always click-through and never draggable — that's what distinguishes them from `charm`/`ritual` items in the renderer.

## Pet items (kitten, puppy, …) — wander autonomously

Set `"type": "pet"`, keep `ritual` (its animation plays on click), and add a `pet` block:

```json
{
  "id": "unique-id",
  "category": "Pets",
  "type": "pet",
  "glyph": "🐈",
  "pet": { "preset": "cat" },
  "ritual": { "label": "Give it a pat", "animation": "bounce" }
}
```

- `pet.preset` must be one of the presets in `src/renderer/pet-presets.js` (`cat`, `dog`). Override any field inline, e.g. `"pet": { "preset": "cat", "speed": 30 }`.
- Pets wander autonomously along the bottom edge of the screen (walk to a random point, pause, repeat) — they aren't draggable. Clicking one plays `ritual.animation` (currently only `"bounce"` exists — a real CSS animation, unlike charms' physics-driven `"flick"`).
- The ground line is computed automatically from the screen's work area (i.e. just above the Dock/taskbar), not a hardcoded pixel guess — see `computeGroundY()` in `src/renderer/renderer.js`.
- `facesLeft` (default `true`) tells the engine which way the glyph or rig art's default artwork points, so it flips it the right way when walking right vs. left. This is an art property, not something the preset can assume — check it per rig/glyph.
- `waddleDegrees` adds a small side-to-side rock synced to the step bob — used only when there's no `rig` (see below), as the best walk-cycle illusion possible with a single static glyph.
- A new *kind* of movement (not just a tuned speed/pace) means extending `src/renderer/pet-engine.js`'s state machine, not just adding a preset.

### Real leg movement via a rig

Instead of (or as well as) `glyph`, point `pet.rig` at an inline SVG built as a simple vector puppet — separate parts the engine can rotate independently, rather than a hand-drawn multi-frame sprite sheet (much easier to build and tune than getting a consistent walk-cycle sheet right):

```json
{ "type": "pet", "pet": { "preset": "cat", "rig": "assets/items/cat-rig.svg", "facesLeft": false, "footOffset": 77 } }
```

The SVG must have elements with `id="frontLeg"`, `id="backLeg"`, and optionally `id="tail"` (each with a CSS `transform-origin` set on itself, e.g. at the hip/shoulder point) — the engine rotates `frontLeg`/`backLeg` in opposite phase while walking and gently swings `tail`, giving real per-limb movement instead of a whole-body bob. See `assets/items/cat-rig.svg` for the reference structure.

- `footOffset` matters for any art taller than a text glyph's line-height: the engine positions art by its top-left corner, so without this the art's *bottom* (its actual feet) ends up well below the intended ground line. Set it to roughly how far down the feet sit within the SVG's own height (e.g. `77` out of an 80px-tall viewBox).
- Tune `legSwingDegrees` and `tailSwingDegrees` per preset/item; a genuinely different rig *structure* (more parts, a different animation style) means extending the part-lookup and `render()` logic in `pet-engine.js`.
