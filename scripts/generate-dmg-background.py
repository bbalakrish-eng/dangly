#!/usr/bin/env python3
"""Generate the background image shown in the installer DMG's Finder window.

The ring mark drawn here mirrors generate-icons.py's render_mark — re-run
both together if the mark's ratios or colors ever change. Icon positions
baked into this image (the arrow, the message placement) must match
package.json's build.mac.dmg.contents x/y values, since Finder draws the
actual app/Applications icons on top of this as a separate layer.
"""

import os

from PIL import Image, ImageDraw, ImageFont

INK = (0x11, 0x13, 0x14)
LIME = (0xBD, 0xEA, 0x3F)
WHITE = (0xF2, 0xF3, 0xF1)
MUTED = (0xA3, 0xA9, 0xA2)

SCALE = 2  # exported at @2x for a crisp look on Retina displays
WIDTH, HEIGHT = 660, 420  # @1x window size — keep in sync with package.json
FONT_PATH = "/System/Library/Fonts/SFNS.ttf"

# Must match package.json's build.mac.dmg.contents.
APP_X, APP_Y = 170, 210
LINK_X, LINK_Y = 490, 210


def font(size):
    return ImageFont.truetype(FONT_PATH, size * SCALE)


def draw_ring(draw, cx, cy, outer, inner, line_len):
    lw = max(2, outer * 0.24)
    draw.rectangle([cx - lw / 2, cy - outer - line_len, cx + lw / 2, cy - outer + 2], fill=LIME)
    draw.ellipse([cx - outer, cy - outer, cx + outer, cy + outer], fill=LIME)
    draw.ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=INK)


def main():
    root = os.path.join(os.path.dirname(__file__), "..")
    assets = os.path.join(root, "assets")

    w, h = WIDTH * SCALE, HEIGHT * SCALE
    img = Image.new("RGB", (w, h), INK)
    draw = ImageDraw.Draw(img)

    # Small ring mark + wordmark near the top, the same "brand corner" every
    # other surface (app icon, website, settings window) carries.
    mark_cx, mark_cy = w / 2 - 46 * SCALE, 44 * SCALE
    draw_ring(draw, mark_cx, mark_cy, 9 * SCALE, 3.2 * SCALE, 11 * SCALE)
    wordmark_font = font(19)
    draw.text((mark_cx + 20 * SCALE, mark_cy - 13 * SCALE), "Dangly", font=wordmark_font, fill=WHITE)

    # A clean solid arrow from the app icon to the Applications alias —
    # electron-builder's own default background is a faint dashed arrow with
    # no text, easy to miss if you don't already know the drag-to-install
    # convention. This is deliberately bolder and paired with a caption.
    arrow_y = APP_Y * SCALE
    arrow_x1 = (APP_X + 68) * SCALE
    arrow_x2 = (LINK_X - 68) * SCALE
    head = 16 * SCALE
    shaft_w = 5 * SCALE
    draw.rectangle([arrow_x1, arrow_y - shaft_w / 2, arrow_x2 - head, arrow_y + shaft_w / 2], fill=LIME)
    draw.polygon(
        [(arrow_x2 - head, arrow_y - head), (arrow_x2, arrow_y), (arrow_x2 - head, arrow_y + head)],
        fill=LIME,
    )

    # The actual instruction — below where Finder will print the app's own
    # filename label under each icon, so the two don't collide.
    msg = "Drag Dangly into Applications to install it"
    msg_font = font(14)
    bbox = draw.textbbox((0, 0), msg, font=msg_font)
    msg_w = bbox[2] - bbox[0]
    draw.text((w / 2 - msg_w / 2, (APP_Y + 100) * SCALE), msg, font=msg_font, fill=MUTED)

    out_2x = os.path.join(assets, "dmg-background@2x.png")
    out_1x = os.path.join(assets, "dmg-background.png")
    img.save(out_2x)
    img.resize((WIDTH, HEIGHT), Image.LANCZOS).save(out_1x)
    print(f"wrote {out_1x} and {out_2x}")


if __name__ == "__main__":
    main()
