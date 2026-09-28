#!/usr/bin/env python3
"""Regenerate the app's icon assets from the website's own brand mark.

Source of truth is website/site.css's `.brand-mark` rule — a dark rounded
square with an off-center lime dot:
  border-radius: 11px on a 36px box (~30.56% corner radius)
  dot centered at 70%/30%, solid radius 5px on a 36px box (~13.89%)
Re-run this after changing those ratios or colors so the app icon and the
website mark never drift apart.
"""

from PIL import Image, ImageDraw

INK = (0x11, 0x13, 0x14, 255)
LIME = (0xBD, 0xEA, 0x3F, 255)

CORNER_RATIO = 11 / 36
DOT_CX_RATIO = 0.70
DOT_CY_RATIO = 0.30
DOT_RADIUS_RATIO = 5 / 36

SUPERSAMPLE = 8


def render_mark(size, corner_ratio=CORNER_RATIO):
    hi = size * SUPERSAMPLE
    img = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if corner_ratio > 0:
        draw.rounded_rectangle([0, 0, hi - 1, hi - 1], radius=corner_ratio * hi, fill=INK)
    else:
        draw.rectangle([0, 0, hi - 1, hi - 1], fill=INK)

    cx = DOT_CX_RATIO * hi
    cy = DOT_CY_RATIO * hi
    r = DOT_RADIUS_RATIO * hi
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=LIME)

    return img.resize((size, size), Image.LANCZOS)


def render_tray_template(size):
    # macOS menu-bar convention: a flat, single-color silhouette (Electron/
    # AppKit tint it automatically for light or dark menu bars, and apply the
    # selected-state highlight) rather than the mark's own colors — most of
    # the other icons in the bar follow this, ours stood out by being the
    # only full-color one. Same rounded-square silhouette as the real mark,
    # but the dot becomes a punched-out transparent notch (negative space)
    # instead of a lime fill, since a template image only has one color to
    # work with — that notch is what keeps it recognizably *our* mark rather
    # than a plain black square like everyone else's.
    hi = size * SUPERSAMPLE
    mask = Image.new("L", (hi, hi), 0)
    mdraw = ImageDraw.Draw(mask)
    corner = CORNER_RATIO * hi
    mdraw.rounded_rectangle([0, 0, hi - 1, hi - 1], radius=corner, fill=255)

    cx = DOT_CX_RATIO * hi
    cy = DOT_CY_RATIO * hi
    r = DOT_RADIUS_RATIO * hi
    mdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=0)

    mask = mask.resize((size, size), Image.LANCZOS)
    black = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    transparent = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    return Image.composite(black, transparent, mask)


def write(path, size, corner_ratio=CORNER_RATIO):
    render_mark(size, corner_ratio).save(path)
    print(f"wrote {path} ({size}x{size})")


def write_template(path, size):
    render_tray_template(size).save(path)
    print(f"wrote {path} ({size}x{size}, template)")


if __name__ == "__main__":
    import os

    root = os.path.join(os.path.dirname(__file__), "..")
    assets = os.path.join(root, "assets")
    os.makedirs(assets, exist_ok=True)

    # General app icon — electron-builder derives .icns/.ico from a single
    # large square PNG; 1024 is its recommended source size. Always full
    # color — only the menu-bar tray icon follows the template convention.
    #
    # Full-bleed square, corner_ratio=0 — NOT the website mark's own rounded
    # corner. Since macOS Big Sur, the OS clips every third-party app icon to
    # its own rounded-square template and adds the drop shadow itself; it
    # expects a full-bleed square to clip. Baking in our own (more aggressive,
    # 30.6%-radius) rounding left our shape's corners short of the OS's own
    # clip region, so Finder's white background showed through that gap as a
    # thin white border around the icon. A flat square has no corner for that
    # gap to appear in — same fix Apple's own HIG asks third-party icons to
    # follow, and how every other Mac app icon avoids this exact artifact.
    write(os.path.join(assets, "icon.png"), 1024, corner_ratio=0)

    # Menu-bar tray icon, as a macOS template image. The "Template" in the
    # filename is Electron/AppKit's own convention for auto-detecting and
    # tinting these (belt-and-suspenders with the explicit setTemplateImage
    # call in tray.js). @1x/@2x follow the matching Retina-pairing convention.
    write_template(os.path.join(assets, "tray-iconTemplate.png"), 18)
    write_template(os.path.join(assets, "tray-iconTemplate@2x.png"), 36)
