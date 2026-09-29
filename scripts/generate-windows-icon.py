#!/usr/bin/env python3
"""Generate a standalone Windows icon (windows-icon.ico) for the app and its
NSIS installer.

assets/icon.png is a flat, full-bleed square by design — correct for macOS,
which clips and shadows an installed .app itself, but Windows does no such
rounding/shadowing for its own .ico files either. Reuses the exact same
rounded/beveled/shaded artwork as the macOS .dmg icon (see _icon_art.py) so
both platforms carry the same design instead of Windows getting the flat
square macOS was specifically fixed to avoid.
"""

import os

from PIL import Image

from _icon_art import render

SIZES = (16, 32, 48, 64, 128, 256)


def main():
    root = os.path.join(os.path.dirname(__file__), "..")
    assets = os.path.join(root, "assets")
    master = render()

    out = os.path.join(assets, "windows-icon.ico")
    master.save(out, format="ICO", sizes=[(s, s) for s in SIZES])
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
