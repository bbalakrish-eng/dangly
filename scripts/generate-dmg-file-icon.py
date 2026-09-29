#!/usr/bin/env python3
"""Generate a standalone icon (dmg-file-icon.icns) used only for the
installer .dmg's own Finder icon — see scripts/set-dmg-icon.js.

This is deliberately separate from assets/icon.png: that one must stay a
full-bleed square with no rounding baked in, so macOS's own Big Sur+
squircle clip and drop shadow can apply to the *installed app* (see the
white-border fix in generate-icons.py). A plain file's custom icon gets no
such automatic OS treatment — nothing clips or shadows it for you — so this
one bakes the rounded corners and a soft shadow in directly, approximating
how the real app icon looks once it's actually installed rather than
showing up as a flat, hard-edged square.
"""

import os
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

INK = (0x11, 0x13, 0x14, 255)
LIME = (0xBD, 0xEA, 0x3F, 255)

# Apple's own Big Sur+ "continuous corner" app-icon mask works out to close
# to a ~22.5% corner radius at 1024px — matched here so this reads as the
# same shape the OS's own clip gives the installed app, not the website
# brand mark's own (more aggressive, ~30.6%) rounding.
CORNER_RATIO = 0.225
RING_CX_RATIO = 0.5
RING_CY_RATIO = 0.5
RING_OUTER_RATIO = 0.182
RING_INNER_RATIO = 0.063
LINE_WIDTH_RATIO = 0.023

CANVAS = 1024
CONTENT = 824  # leaves a margin around the edges for the drop shadow to bleed into
SUPERSAMPLE = 4


def linear_gradient(w, h, color1, color2, angle=90):
    theta = np.radians(angle)
    dx, dy = np.cos(theta), np.sin(theta)
    y, x = np.mgrid[0:h, 0:w]
    proj = x * dx + y * dy
    proj = (proj - proj.min()) / (proj.max() - proj.min())
    out = np.empty((h, w, 3), dtype=np.float32)
    for c in range(3):
        out[..., c] = color1[c] + (color2[c] - color1[c]) * proj
    return Image.fromarray(out.astype(np.uint8), "RGB")


def radial_gradient(w, h, center, radius, color1, color2):
    cx, cy = center
    y, x = np.mgrid[0:h, 0:w]
    dist = np.clip(np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / radius, 0, 1)
    out = np.empty((h, w, 3), dtype=np.float32)
    for c in range(3):
        out[..., c] = color1[c] + (color2[c] - color1[c]) * dist
    return Image.fromarray(out.astype(np.uint8), "RGB")


def render():
    hi = CONTENT * SUPERSAMPLE

    # Flat body — no gradient, no gloss. The only 3D cue is a bevel: a light
    # edge along the top-left of the squircle's own outline, a dark edge
    # along the bottom-right, as if it were a raised button lit from the
    # upper-left. The ring on top stays flat/simple.
    squircle_mask = Image.new("L", (hi, hi), 0)
    ImageDraw.Draw(squircle_mask).rounded_rectangle([0, 0, hi - 1, hi - 1], radius=CORNER_RATIO * hi, fill=255)
    tile = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    tile.paste(INK, (0, 0), squircle_mask)

    edge_w = max(2, int(hi * 0.016))
    edge_outline = Image.new("L", (hi, hi), 0)
    ImageDraw.Draw(edge_outline).rounded_rectangle(
        [0, 0, hi - 1, hi - 1], radius=CORNER_RATIO * hi, outline=255, width=edge_w
    )
    edge_outline = edge_outline.filter(ImageFilter.GaussianBlur(hi * 0.003))
    edge_arr = np.array(edge_outline).astype(np.float32) / 255.0

    # A diagonal 0..1 split (1 = top-left, 0 = bottom-right) decides how much
    # of the outline at each point is "highlight" vs. "shadow".
    diag = np.array(linear_gradient(hi, hi, (255, 255, 255), (0, 0, 0), angle=135).convert("L")).astype(np.float32) / 255.0

    highlight_layer = Image.new("RGBA", (hi, hi), (255, 255, 255, 0))
    highlight_layer.putalpha(Image.fromarray((edge_arr * diag * 190).astype(np.uint8)))
    highlight_layer.putalpha(Image.composite(highlight_layer.split()[3], Image.new("L", (hi, hi), 0), squircle_mask))
    tile.alpha_composite(highlight_layer)

    shadow_layer = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    shadow_layer.putalpha(Image.fromarray((edge_arr * (1 - diag) * 190).astype(np.uint8)))
    shadow_layer.putalpha(Image.composite(shadow_layer.split()[3], Image.new("L", (hi, hi), 0), squircle_mask))
    tile.alpha_composite(shadow_layer)

    # The ring: flat lime, no shading of its own.
    cx, cy = RING_CX_RATIO * hi, RING_CY_RATIO * hi
    outer, inner = RING_OUTER_RATIO * hi, RING_INNER_RATIO * hi
    lw = LINE_WIDTH_RATIO * hi
    draw = ImageDraw.Draw(tile)
    draw.rectangle([cx - lw / 2, 0, cx + lw / 2, cy - outer + 1], fill=LIME)
    draw.ellipse([cx - outer, cy - outer, cx + outer, cy + outer], fill=LIME)
    draw.ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=INK)

    tile = tile.resize((CONTENT, CONTENT), Image.LANCZOS)

    # Soft drop shadow: a blurred, slightly-offset dark copy of the same
    # rounded silhouette, composited underneath the crisp tile — the same
    # cue a Dock/Finder icon gets for free from the OS, which a plain file
    # doesn't.
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    offset = (CANVAS - CONTENT) // 2

    shadow_shape = Image.new("RGBA", (CONTENT, CONTENT), (0, 0, 0, 0))
    ImageDraw.Draw(shadow_shape).rounded_rectangle(
        [0, 0, CONTENT - 1, CONTENT - 1], radius=CORNER_RATIO * CONTENT, fill=(0, 0, 0, 140)
    )
    shadow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    shadow.paste(shadow_shape, (offset, offset + 16), shadow_shape)
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))

    canvas = Image.alpha_composite(canvas, shadow)
    canvas.paste(tile, (offset, offset), tile)
    return canvas


def main():
    root = os.path.join(os.path.dirname(__file__), "..")
    assets = os.path.join(root, "assets")
    master = render()

    with tempfile.TemporaryDirectory() as tmp:
        iconset = os.path.join(tmp, "icon.iconset")
        os.makedirs(iconset)
        for size in (16, 32, 128, 256, 512):
            master.resize((size, size), Image.LANCZOS).save(os.path.join(iconset, f"icon_{size}x{size}.png"))
            master.resize((size * 2, size * 2), Image.LANCZOS).save(
                os.path.join(iconset, f"icon_{size}x{size}@2x.png")
            )
        out = os.path.join(assets, "dmg-file-icon.icns")
        subprocess.run(["iconutil", "-c", "icns", iconset, "-o", out], check=True)
        print(f"wrote {out}")


if __name__ == "__main__":
    main()
