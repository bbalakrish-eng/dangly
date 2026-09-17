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
