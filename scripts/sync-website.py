#!/usr/bin/env python3
"""Copy the app's shared engine, catalog and art into website/.

The website demo runs the same physics, particle and pet code as the desktop app, so this
copies them rather than forking them. Re-run after changing anything under src/renderer/,
catalog/ or assets/items/. website/ is a plain static folder: drag it onto any static host.

Usage:
    python3 scripts/sync-website.py
"""
import os
import re
import shutil

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SITE = os.path.join(ROOT, "website")

ENGINE_FILES = [
    "host.js",
    "effect-presets.js",
    "particle-engine.js",
    "pet-presets.js",
    "pet-engine.js",
    "charm-physics.js",
    "audio.js",
    "renderer.js",
]
# Only what the site references: WebP art, plus the SVG the kitten rig is loaded from.
ASSET_EXTENSIONS = (".webp",)
ASSET_EXTRAS = ("cat-rig.svg",)


def copy_engine():
    out = os.path.join(SITE, "engine")
    os.makedirs(out, exist_ok=True)
    for name in ENGINE_FILES:
        shutil.copy2(os.path.join(ROOT, "src", "renderer", name), os.path.join(out, name))

    # The app's stylesheet also styles <html>/<body> as a click-through transparent window.
    # On a web page that rule would disable every click, so it's dropped; the rest (charm,
    # beads, chain, flame, shatter, pet) is used as is.
    with open(os.path.join(ROOT, "src", "renderer", "styles.css"), encoding="utf-8") as f:
        css = f.read()
    css, removed = re.subn(r"^html, body \{.*?\}\n\n", "", css, count=1, flags=re.S | re.M)
    assert removed == 1, "expected to strip the html/body rule from styles.css"
    with open(os.path.join(out, "overlay.css"), "w", encoding="utf-8") as f:
        f.write(css)


def copy_catalog():
    out = os.path.join(SITE, "catalog")
    os.makedirs(out, exist_ok=True)
    shutil.copy2(os.path.join(ROOT, "catalog", "items.json"), os.path.join(out, "items.json"))


def copy_assets():
    src = os.path.join(ROOT, "assets", "items")
    out = os.path.join(SITE, "assets", "items")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    count = 0
    for name in sorted(os.listdir(src)):
        if name.endswith(ASSET_EXTENSIONS) or name in ASSET_EXTRAS:
            shutil.copy2(os.path.join(src, name), os.path.join(out, name))
            count += 1
    return count


def main():
    copy_engine()
    copy_catalog()
    n = copy_assets()
    print(f"website/ synced: {len(ENGINE_FILES)} engine files, catalog, {n} assets")


if __name__ == "__main__":
    main()
