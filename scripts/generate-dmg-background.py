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

# The page background — deliberately NOT the same near-black as the app
# icon's own body: on a pure-black background the black icon had no edge to
# read against and visually merged into it. A mid gray gives it something
# to sit on top of.
BG = (0x3A, 0x3D, 0x40)
LIME = (0xBD, 0xEA, 0x3F)
MUTED = (0xC7, 0xCA, 0xCC)

SCALE = 2  # exported at @2x for a crisp look on Retina displays
WIDTH, HEIGHT = 660, 420  # @1x window size — keep in sync with package.json
FONT_PATH = "/System/Library/Fonts/SFNS.ttf"

# Must match package.json's build.mac.dmg.contents.
APP_X, APP_Y = 170, 210
LINK_X, LINK_Y = 490, 210


def font(size):
    return ImageFont.truetype(FONT_PATH, size * SCALE)


def main():
    root = os.path.join(os.path.dirname(__file__), "..")
    assets = os.path.join(root, "assets")

    w, h = WIDTH * SCALE, HEIGHT * SCALE
    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)

    # No logo/wordmark here — Finder already prints the app's own filename
    # ("Dangly") as a label right under its icon, so one drawn into the
    # background up top was just a redundant second copy of the same name.

    # A short, sleek arrow centered between the two icons — electron-builder's
    # own default background is a faint dashed arrow with no text, easy to
    # miss if you don't already know the drag-to-install convention; this is
    # paired with a caption below, so the arrow itself doesn't need to be
    # bold or span the whole gap to do its job.
    arrow_y = APP_Y * SCALE
    gap_center = (APP_X + LINK_X) / 2 * SCALE
    arrow_half = 42 * SCALE
    arrow_x1 = gap_center - arrow_half
    arrow_x2 = gap_center + arrow_half
    head = 11 * SCALE
    shaft_w = 3 * SCALE
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
