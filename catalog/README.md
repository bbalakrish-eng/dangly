# Adding a new item

Add an entry to `items.json` — no code changes needed. Restart the app (or reopen the gallery) to see it.

```json
{
  "id": "unique-id",
  "name": "Display name",
  "origin": "Where it's from / category shown under the name",
  "description": "One or two sentences shown in the gallery card.",
  "type": "charm",
  "glyph": "🔔",
  "ritual": { "label": "Button text shown for its action", "animation": "flick" }
}
```

- `id` must be unique across the file.
- `glyph` is a placeholder — swap for real sprite art later by changing `type` to something like `"sprite"` and adding an `assets` field once that renderer exists (not built yet).
- `ritual.animation` must match a CSS animation name the overlay knows about — currently only `"flick"` exists.

## Effect items (snow, rain, leaves, …)

Set `"type": "effect"` instead of `"charm"`, drop `ritual`, and add an `effect` block:

```json
{
  "id": "unique-id",
  "name": "Display name",
  "origin": "Category shown in the gallery",
  "description": "Shown in the gallery card.",
  "type": "effect",
  "glyph": "❄️",
  "effect": { "preset": "snow" }
}
```

- `glyph` here is only used as the gallery preview icon — it has no effect on the actual particle rendering.
- `effect.preset` must be one of the presets defined in `src/renderer/effect-presets.js` (`snow`, `rain`, `leaves`). You can override any of that preset's fields inline, e.g. `"effect": { "preset": "snow", "density": 200, "color": "#a5d8ff" }`.
- A brand-new *look* (not just a tuned variant) means adding a new preset to `effect-presets.js` — see that file's fields (density, glyphs/shape, size/speed ranges, sway, rotation, cursor-avoidance radius).
- Effect items are always click-through and never draggable — that's what distinguishes them from `charm` items in the renderer.

## Pet items (kitten, puppy, …)

Set `"type": "pet"`, keep `ritual` (its animation plays on click), and add a `pet` block:

```json
{
  "id": "unique-id",
  "name": "Display name",
  "origin": "Category shown in the gallery",
  "description": "Shown in the gallery card.",
  "type": "pet",
  "glyph": "🐈",
  "pet": { "preset": "cat" },
  "ritual": { "label": "Give it a pat", "animation": "bounce" }
}
```

- `pet.preset` must be one of the presets in `src/renderer/pet-presets.js` (`cat`, `dog`). Override any field inline, e.g. `"pet": { "preset": "cat", "speed": 30 }`.
- Pets wander autonomously along the bottom edge of the screen (walk to a random point, pause, repeat) — they aren't draggable. Clicking one plays `ritual.animation` (currently only `"bounce"` exists, alongside `"flick"` for charms).
- The ground line is computed automatically from the screen's work area (i.e. just above the Dock/taskbar), not a hardcoded pixel guess — see `computeGroundY()` in `src/renderer/renderer.js`.
- `facesLeft` (default `true`) tells the engine which way the emoji's default artwork points, so it flips the glyph the right way when walking right vs. left. Set `false` for an emoji that already faces right by default.
- `waddleDegrees` adds a small side-to-side rock synced to the step bob — the only walk-cycle illusion possible with a single static glyph. Real leg movement needs actual animated sprite frames, which isn't built yet.
- A new *kind* of movement (not just a tuned speed/pace) means extending `src/renderer/pet-engine.js`'s state machine, not just adding a preset.
