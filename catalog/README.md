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
