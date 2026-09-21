#!/usr/bin/env python3
"""Generate the placeholder desktop wallpaper used by the website's "wallpaper" stage theme.

An original dusk landscape (sky, sun glow, four hazy ridges, film grain). It is a stand-in:
replace website/assets/wallpapers/dusk.webp with a real photo any time; nothing else changes.
The foreground ridge sits at ~66% of the height on purpose, because the preview's pets walk
along that line, so they read as standing on the hill.

Usage:
    python3 scripts/make-wallpaper.py
Needs numpy and Pillow.
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "website", "assets", "wallpapers", "dusk.webp")
W, H = 2400, 1600
rng = np.random.default_rng(7)


def lerp_stops(t, stops):
    """Piecewise-linear colour ramp. t: array in [0,1]; stops: [(pos, (r,g,b)), ...]."""
    out = np.zeros(t.shape + (3,), dtype=np.float32)
    for c in range(3):
        out[..., c] = np.interp(t, [p for p, _ in stops], [col[c] for _, col in stops])
    return out


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


ys = (np.arange(H, dtype=np.float32) / H)[:, None]
xs = (np.arange(W, dtype=np.float32) / W)[None, :]

# Sky
sky = lerp_stops(
    ys[:, 0],
    [
        (0.00, (20, 34, 62)),
        (0.28, (44, 72, 108)),
        (0.42, (96, 128, 150)),
        (0.52, (232, 170, 134)),
        (0.62, (250, 200, 156)),
    ],
)
img = np.repeat(sky[:, None, :], W, axis=1)

# Sun glow low on the horizon, right of centre
gx, gy = 0.64, 0.53
dist = np.sqrt(((xs - gx) * (W / H)) ** 2 + (ys - gy) ** 2)
glow = np.exp(-(dist / 0.30) ** 2)[..., None]
img = img * (1 - 0.55 * glow) + np.array([255, 214, 170], dtype=np.float32) * (0.55 * glow)

haze = np.array([244, 184, 146], dtype=np.float32)
ridges = [
    # base, amplitude, colour, haze at the crest
    (0.505, 0.032, (92, 118, 132), 0.55),
    (0.560, 0.036, (58, 88, 100), 0.38),
    (0.612, 0.030, (34, 64, 76), 0.22),
    (0.664, 0.010, (13, 34, 42), 0.06),  # foreground: nearly flat, pets walk here
]

for base, amp, colour, haze_amount in ridges:
    phases = rng.uniform(0, 2 * np.pi, 4)
    freqs = np.array([1.1, 2.3, 4.7, 8.9])
    weights = np.array([1.0, 0.55, 0.25, 0.1])
    wave = sum(w * np.sin(2 * np.pi * f * xs[0] + p) for w, f, p in zip(weights, freqs, phases))
    wave = wave / np.abs(wave).max()
    crest = base + amp * wave  # per-column crest height (0..1)

    depth = (ys - crest[None, :]) * H  # px below the crest, per pixel
    coverage = np.clip(depth + 0.5, 0, 1)[..., None]  # 1px anti-aliased edge
    fade = smoothstep(depth / (0.16 * H))[..., None]
    body = np.array(colour, dtype=np.float32)
    layer = haze * haze_amount * (1 - fade) + body * (1 - haze_amount * (1 - fade))
    img = img * (1 - coverage) + layer * coverage

# Vignette and film grain
vig = 1 - 0.16 * (((xs - 0.5) * 1.6) ** 2 + ((ys - 0.5) * 1.2) ** 2)
img = img * vig[..., None]
img = img + rng.normal(0, 1.6, (H, W, 1)).astype(np.float32)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(OUT, "WEBP", quality=86, method=6)
print(f"{OUT}  {os.path.getsize(OUT) / 1024:.0f} KB")
