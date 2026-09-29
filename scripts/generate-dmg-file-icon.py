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


def render():
    hi = CONTENT * SUPERSAMPLE
    tile = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)
    draw.rounded_rectangle([0, 0, hi - 1, hi - 1], radius=CORNER_RATIO * hi, fill=INK)

    cx = RING_CX_RATIO * hi
    cy = RING_CY_RATIO * hi
    outer = RING_OUTER_RATIO * hi
    inner = RING_INNER_RATIO * hi
    lw = LINE_WIDTH_RATIO * hi
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
        [0, 0, CONTENT - 1, CONTENT - 1], radius=CORNER_RATIO * CONTENT, fill=(0, 0, 0, 130)
    )
    shadow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    shadow.paste(shadow_shape, (offset, offset + 14), shadow_shape)
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))

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
