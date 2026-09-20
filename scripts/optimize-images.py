#!/usr/bin/env python3
"""Convert master PNGs in art-source/items/ to the compressed WebP the app ships.

Usage:
    python3 scripts/optimize-images.py                    # every PNG in art-source/items/
    python3 scripts/optimize-images.py path/to/new.png    # just these files

Output goes to assets/items/<name>.webp (WebP q92, transparency kept). Originals are
never modified or shipped: keep masters in art-source/, which is outside the build.
Images are never upscaled. Needs Pillow (pip3 install Pillow).
"""
import fnmatch
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC_DIR = os.path.join(ROOT, "art-source", "items")
OUT_DIR = os.path.join(ROOT, "assets", "items")
QUALITY = 92

# Full-size charms display at ~220px tall (440px on Retina), so 800px on the long side
# leaves ~1.8x headroom. Small pieces get sized to what they actually render at (~3x).
DEFAULT_LONG_SIDE = 800
OVERRIDES = [
    # (filename glob, dimension to limit, max px)
    ("chili_*", "width", 400),        # renders ~90px long
    ("lemon*", "height", 320),        # renders ~72px tall
    ("coconut-whole*", "height", 600),  # ritual, renders 120px tall
]


def target_size(name, w, h):
    for pattern, dim, limit in OVERRIDES:
        if fnmatch.fnmatch(name.lower(), pattern):
            scale = limit / (w if dim == "width" else h)
            break
    else:
        scale = DEFAULT_LONG_SIDE / max(w, h)
    scale = min(scale, 1.0)  # never upscale
    return max(1, round(w * scale)), max(1, round(h * scale))


def convert(path):
    name = os.path.basename(path)
    stem = os.path.splitext(name)[0]
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    nw, nh = target_size(name, w, h)
    if (nw, nh) != (w, h):
        im = im.resize((nw, nh), Image.LANCZOS)  # Pillow premultiplies alpha, so no edge halos
    out = os.path.join(OUT_DIR, stem + ".webp")
    im.save(out, "WEBP", quality=QUALITY, method=6)
    return (w, h), (nw, nh), os.path.getsize(path), os.path.getsize(out), out


def main():
    files = sys.argv[1:] or sorted(
        os.path.join(SRC_DIR, f) for f in os.listdir(SRC_DIR) if f.lower().endswith(".png")
    )
    os.makedirs(OUT_DIR, exist_ok=True)
    total_in = total_out = 0
    for f in files:
        (w, h), (nw, nh), size_in, size_out, out = convert(f)
        total_in += size_in
        total_out += size_out
        print(f"{os.path.basename(f):28s} {w}x{h} -> {nw}x{nh}   {size_in/1024:7.0f} KB -> {size_out/1024:5.0f} KB")
    print(f"{'TOTAL':28s} {'':22s} {total_in/1024/1024:6.1f} MB -> {total_out/1024/1024:5.2f} MB")


if __name__ == "__main__":
    main()
