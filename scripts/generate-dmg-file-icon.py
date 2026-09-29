#!/usr/bin/env python3
"""Generate a standalone icon (dmg-file-icon.icns) used only for the
installer .dmg's own Finder icon — see scripts/set-dmg-icon.js.

This is deliberately separate from assets/icon.png: that one must stay a
full-bleed square with no rounding baked in, so macOS's own Big Sur+
squircle clip and drop shadow can apply to the *installed app* (see the
white-border fix in generate-icons.py). A plain file's custom icon gets no
such automatic OS treatment — nothing clips or shadows it for you — so this
one bakes the rounded corners, a bevel and a soft shadow in directly (see
_icon_art.py for the actual drawing, shared with generate-windows-icon.py).
"""

import os
import subprocess
import tempfile

from PIL import Image

from _icon_art import render

SIZES = (16, 32, 128, 256, 512)


def main():
    root = os.path.join(os.path.dirname(__file__), "..")
    assets = os.path.join(root, "assets")
    master = render()

    with tempfile.TemporaryDirectory() as tmp:
        iconset = os.path.join(tmp, "icon.iconset")
        os.makedirs(iconset)
        for size in SIZES:
            master.resize((size, size), Image.LANCZOS).save(os.path.join(iconset, f"icon_{size}x{size}.png"))
            master.resize((size * 2, size * 2), Image.LANCZOS).save(
                os.path.join(iconset, f"icon_{size}x{size}@2x.png")
            )
        out = os.path.join(assets, "dmg-file-icon.icns")
        subprocess.run(["iconutil", "-c", "icns", iconset, "-o", out], check=True)
        print(f"wrote {out}")


if __name__ == "__main__":
    main()
