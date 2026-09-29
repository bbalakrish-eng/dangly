#!/usr/bin/env python3
"""Build the installer .dmg ourselves via the actively-maintained `dmgbuild`
PyPI package, instead of relying on electron-builder's own bundled copy of
the same tool.

Why: electron-builder's vendored dmg-builder (node_modules/dmg-builder/
vendor/dmgbuild) writes a .DS_Store that looks entirely correct on
inspection — background image copied into the volume, backgroundType=2, a
well-formed-looking backgroundImageAlias, and the right icon positions
(all confirmed by decoding it with the same vendored ds_store library) —
but Finder silently doesn't apply any of it when the .dmg is actually
opened, showing a plain default background instead. That vendored copy
hasn't been updated in years; a fresh `pip install dmgbuild` pulls in the
same upstream project's current mac_alias/ds_store libraries, which have
compatibility fixes for how modern macOS resolves alias/bookmark records
that the old bundled snapshot doesn't have.

Requires: pip3 install --user dmgbuild (see package.json's
install-dmgbuild script). Run after `electron-builder --mac` has produced
the unpacked .app for each arch — see package.json's package:mac script.
"""

import json
import os
import subprocess
import sys
import tempfile

import dmgbuild

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ASSETS = os.path.join(ROOT, "assets")
DIST = os.path.join(ROOT, "dist")

# Must stay in sync with the icon drawn into assets/dmg-background.png (see
# generate-dmg-background.py) — that image's arrow/caption are positioned
# assuming the app and Applications icons land exactly here.
APP_POS = (170, 210)
LINK_POS = (490, 210)


def read_version():
    with open(os.path.join(ROOT, "package.json")) as f:
        return json.load(f)["version"]


def build_one(app_path, out_path, version):
    volume_name = f"Dangly {version}"
    volume_icon = os.path.join(DIST, ".icon-icns", "icon.icns")
    settings = {
        "format": "UDZO",
        "files": [app_path],
        "symlinks": {"Applications": "/Applications"},
        "icon_locations": {
            "Dangly.app": APP_POS,
            "Applications": LINK_POS,
        },
        "background": os.path.join(ASSETS, "dmg-background.png"),
        "icon_size": 100,
        "window_rect": ((100, 100), (660, 420)),
        "default_view": "icon-view",
        "show_icon_preview": False,
    }
    if os.path.exists(volume_icon):
        settings["icon"] = volume_icon
    if os.path.exists(out_path):
        os.remove(out_path)
    dmgbuild.build_dmg(out_path, volume_name, settings=settings)
    print(f"built {out_path}")


def stamp_file_icon(dmg_path):
    """Give the .dmg FILE itself (as opposed to its mounted volume, which
    the `icon` setting above already covers) a custom Finder icon — see
    generate-dmg-file-icon.py for why this needs its own rounded/beveled
    artwork rather than the app's own full-bleed icon.png. Same technique
    the old set-dmg-icon.js hook used, ported here now that dmgbuild (not
    electron-builder) produces the .dmg."""
    icon_icns = os.path.join(ASSETS, "dmg-file-icon.icns")
    if not os.path.exists(icon_icns):
        print(f"stamp_file_icon: {icon_icns} not found, skipping", file=sys.stderr)
        return
    with tempfile.TemporaryDirectory() as tmp:
        tmp_icns = os.path.join(tmp, "icon.icns")
        rsrc_path = os.path.join(tmp, "icon.rsrc")
        subprocess.run(["cp", icon_icns, tmp_icns], check=True)
        subprocess.run(["sips", "-i", tmp_icns], check=True, capture_output=True)
        rsrc = subprocess.run(["DeRez", "-only", "icns", tmp_icns], check=True, capture_output=True).stdout
        with open(rsrc_path, "wb") as f:
            f.write(rsrc)
        subprocess.run(["Rez", "-append", rsrc_path, "-o", dmg_path], check=True)
        subprocess.run(["SetFile", "-a", "C", dmg_path], check=True)
    print(f"stamped custom icon on {os.path.basename(dmg_path)}")


def main():
    version = read_version()
    targets = [
        ("arm64", os.path.join(DIST, "mac-arm64", "Dangly.app")),
        ("x64", os.path.join(DIST, "mac", "Dangly.app")),
    ]
    built_any = False
    for arch, app_path in targets:
        if not os.path.exists(app_path):
            print(f"skipping {arch}: {app_path} not found", file=sys.stderr)
            continue
        out_path = os.path.join(DIST, f"Dangly-{version}-{arch}.dmg")
        build_one(app_path, out_path, version)
        stamp_file_icon(out_path)
        built_any = True
    if not built_any:
        print("no .app bundles found under dist/ — run electron-builder --mac first", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
