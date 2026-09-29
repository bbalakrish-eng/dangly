"""Shared rendering for the "standalone icon" used wherever an OS won't
automatically round/shadow our icon for us — currently the macOS .dmg file
(generate-dmg-file-icon.py) and the Windows installer/app icon
(generate-windows-icon.py). Both platforms should look like the same design
decision, so the actual drawing code lives here once instead of being
copied and drifting apart.

assets/icon.png stays a flat, full-bleed square on purpose (see the
white-border fix in generate-icons.py) — that's correct for macOS, which
clips and shadows an installed .app itself. Windows does no such thing
either, for its own .ico files, which is why it needs this too, not just
the .dmg.
"""

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

INK = (0x11, 0x13, 0x14, 255)
INK_HILITE = (0x34, 0x39, 0x3D)  # body's lit side (upper-left)
INK_SHADE = (0x05, 0x06, 0x06)  # body's shaded side (lower-right)
LIME = (0xBD, 0xEA, 0x3F, 255)

# Apple's own Big Sur+ "continuous corner" app-icon mask works out to close
# to a ~22.5% corner radius at 1024px — matched here so this reads as the
# same shape the OS's own clip gives an installed .app on macOS, not the
# website brand mark's own (more aggressive, ~30.6%) rounding. Windows has
# no equivalent convention to match, so this same shape is reused there too.
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

    # A little body shading plus a bevel — subtler than an earlier "domed
    # button" pass (too strong), but a flat fill alone read as no 3D at all
    # beyond the edges.
    squircle_mask = Image.new("L", (hi, hi), 0)
    ImageDraw.Draw(squircle_mask).rounded_rectangle([0, 0, hi - 1, hi - 1], radius=CORNER_RATIO * hi, fill=255)
    # Radial, not linear — centered up and to the left, so it reads as a
    # curved/domed surface rather than a straight diagonal wipe.
    body = radial_gradient(hi, hi, (hi * 0.28, hi * 0.24), hi * 1.05, INK_HILITE, INK_SHADE)
    tile = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    tile.paste(body, (0, 0), squircle_mask)

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
    # The hole reveals the body's own gradient rather than flat ink, so it
    # doesn't look like a flat patch dropped onto a shaded surface.
    hole_mask = Image.new("L", (hi, hi), 0)
    ImageDraw.Draw(hole_mask).ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=255)
    tile.paste(body, (0, 0), hole_mask)

    tile = tile.resize((CONTENT, CONTENT), Image.LANCZOS)

    # Soft drop shadow: a blurred, slightly-offset dark copy of the same
    # rounded silhouette, composited underneath the crisp tile — the same
    # cue a Dock/Finder icon (or a modern Windows app icon) gets for free
    # from the OS when it's an installed app, which a plain standalone icon
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
