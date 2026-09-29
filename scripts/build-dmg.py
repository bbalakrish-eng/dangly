#!/usr/bin/env python3
"""Build the installer .dmg ourselves, customizing it in the correct order —
see the long comment below for why this exists instead of just calling
`dmgbuild.build_dmg()` directly (which has the same bug as electron-builder's
own bundled copy of the same tool).

Requires: pip3 install --user dmgbuild (see package.json's
install-dmgbuild script) — reused here for its Alias/Bookmark/DSStore
plumbing, just sequenced correctly. Run after `electron-builder --mac` has
produced the unpacked .app for each arch — see package.json's package:mac
script.

--- Why not just dmgbuild.build_dmg()? ---

Both electron-builder's bundled dmg-builder and a fresh `pip install
dmgbuild` build the .DS_Store (background image reference, icon positions)
while a TEMPORARY, writable disk image is mounted, and only AFTER that
write the FINAL compressed, read-only .dmg via `hdiutil convert`. The
background reference is an "alias"/"bookmark" record — mac_alias's
Alias.for_file()/Bookmark.for_file() — which bakes in filesystem-specific
identifiers (catalog node IDs and similar) for the file *as it exists on
that temporary volume*. `hdiutil convert` rebuilds the filesystem into the
final image, which can change those identifiers — so the alias silently
stops resolving, and Finder falls back to a plain default background,
despite the .DS_Store otherwise decoding as entirely correct (confirmed:
decoded it by hand, background copied in, backgroundType=2, valid-looking
alias, right icon positions — none of it actually rendered).

The fix: build the plain, uncustomized .dmg and convert it to its FINAL
compressed form *first*. Only then mount it — via a "shadow" file, since
the final image is read-only, and a shadow lets hdiutil treat writes as an
overlay without touching the base image — and construct the Alias/Bookmark
records and .DS_Store against files as they exist on that now-permanent
filesystem. Converting the shadow's changes back into a new compressed
image afterward just applies that overlay; it doesn't rebuild the
filesystem again, so the identifiers baked in this time stay valid.
"""

import json
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile

from ds_store import DSStore
from mac_alias import Alias

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ASSETS = os.path.join(ROOT, "assets")
DIST = os.path.join(ROOT, "dist")

# Must stay in sync with assets/dmg-background.png (see
# generate-dmg-background.py) — that image's arrow/caption are drawn
# assuming the app and Applications icons land exactly here.
APP_POS = (170, 210)
LINK_POS = (490, 210)
WINDOW_RECT = ((100, 100), (660, 420))
ICON_SIZE = 100


def read_version():
    with open(os.path.join(ROOT, "package.json")) as f:
        return json.load(f)["version"]


def run(*args, **kwargs):
    kwargs.setdefault("check", True)
    return subprocess.run(args, **kwargs)


def make_hidpi_background(out_dir):
    """Combine dmg-background.png + dmg-background@2x.png into one
    multi-resolution TIFF, the same way dmgbuild's own lookForHiDPI does —
    a plain PNG alone shows soft/blurry on a Retina display."""
    bg1x = os.path.join(ASSETS, "dmg-background.png")
    bg2x = os.path.join(ASSETS, "dmg-background@2x.png")
    combined = os.path.join(out_dir, "background.tiff")
    if os.path.exists(bg2x):
        run("tiffutil", "-cathidpicheck", bg1x, bg2x, "-out", combined)
    else:
        run("sips", "-s", "format", "tiff", bg1x, "--out", combined)
    return combined


def attach(image_path, shadow=None):
    # Deliberately NOT passing -mountpoint: letting hdiutil pick the normal
    # /Volumes/<name> location is what makes Alias.for_file()/Bookmark.for_file()
    # below correctly recognize the file as living on a disk-image volume. A
    # custom mountpoint nested inside a temp directory (tried first) made
    # them record a long chain of ".." components back to that temp path
    # instead — valid only until the temp dir is gone, so it silently
    # doesn't resolve once the .dmg is actually mounted normally later.
    args = ["attach", image_path, "-nobrowse", "-owners", "off", "-plist"]
    if shadow:
        args += ["-shadow", shadow]
    result = run("hdiutil", *args, capture_output=True)
    info = plistlib.loads(result.stdout)
    for entity in info.get("system-entities", []):
        mount_point = entity.get("mount-point")
        if mount_point:
            return mount_point
    raise RuntimeError(f"hdiutil attach did not report a mount point for {image_path}")


def detach(mount_point):
    for _ in range(5):
        result = subprocess.run(["hdiutil", "detach", mount_point], capture_output=True)
        if result.returncode == 0:
            return
    subprocess.run(["hdiutil", "detach", mount_point, "-force"])


def write_finder_view(mount_point, volume_icon):
    background_dest = os.path.join(mount_point, ".background.tiff")
    with tempfile.TemporaryDirectory() as tmp:
        combined_bg = make_hidpi_background(tmp)
        shutil.copyfile(combined_bg, background_dest)

    if volume_icon and os.path.exists(volume_icon):
        shutil.copyfile(volume_icon, os.path.join(mount_point, ".VolumeIcon.icns"))
        run("SetFile", "-a", "C", mount_point)

    alias = Alias.for_file(background_dest)

    bounds = WINDOW_RECT
    bwsp = {
        "ShowStatusBar": False,
        "WindowBounds": "{{{{{}, {}}}, {{{}, {}}}}}".format(bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]),
        "ContainerShowSidebar": False,
        "PreviewPaneVisibility": False,
        "SidebarWidth": 0,
        "ShowTabView": False,
        "ShowToolbar": False,
        "ShowPathbar": False,
        "ShowSidebar": False,
    }
    icvp = {
        "viewOptionsVersion": 1,
        "backgroundType": 2,
        "backgroundColorRed": 1.0,
        "backgroundColorGreen": 1.0,
        "backgroundColorBlue": 1.0,
        "backgroundImageAlias": alias.to_bytes(),
        "gridOffsetX": 0.0,
        "gridOffsetY": 0.0,
        "gridSpacing": 100.0,
        "arrangeBy": "none",
        "showIconPreview": False,
        "showItemInfo": False,
        "labelOnBottom": True,
        "textSize": 12.0,
        "iconSize": float(ICON_SIZE),
        "scrollPositionX": 0.0,
        "scrollPositionY": 0.0,
    }
    icvl = (b"type", b"icnv")

    ds_path = os.path.join(mount_point, ".DS_Store")
    if os.path.exists(ds_path):
        os.remove(ds_path)
    with DSStore.open(ds_path, "w+") as d:
        d["."]["vSrn"] = ("long", 1)
        d["."]["bwsp"] = bwsp
        d["."]["icvp"] = icvp
        # Deliberately NOT writing a "pBBk" bookmark entry (dmgbuild's own
        # build_dmg() does) — this is a confirmed macOS 26.2 (Tahoe) Finder
        # regression (Apple bug FB21405103, hit dmgbuild/electron-builder/
        # Blender/Rhino alike): the *presence* of that bookmark record is
        # what makes Finder silently ignore the background entirely on this
        # OS version, even though the legacy "backgroundImageAlias" in icvp
        # above is completely valid on its own and is all Finder actually
        # needs. dmgbuild's own upstream fix (1.6.7, not yet on PyPI as of
        # writing) is exactly this: drop the bookmark, keep the alias.
        d["."]["icvl"] = icvl
        d["Dangly.app"]["Iloc"] = APP_POS
        d["Applications"]["Iloc"] = LINK_POS


def build_one(app_path, out_path, version):
    volume_name = f"Dangly {version}"
    volume_icon = os.path.join(DIST, ".icon-icns", "icon.icns")

    with tempfile.TemporaryDirectory() as tmp:
        staging = os.path.join(tmp, "staging")
        os.makedirs(staging)
        run("ditto", app_path, os.path.join(staging, os.path.basename(app_path)))
        os.symlink("/Applications", os.path.join(staging, "Applications"))

        # Build straight to the final compressed, read-only format — no
        # customization yet. This IS the permanent filesystem; nothing
        # converts/rebuilds it again after this point (see the module
        # docstring for why that matters).
        final_dmg = os.path.join(tmp, "final.dmg")
        run(
            "hdiutil", "create", "-volname", volume_name, "-srcfolder", staging,
            "-fs", "HFS+", "-format", "UDZO", "-ov", final_dmg,
        )

        # Customize it via a shadow file — the base image is read-only, so
        # writes go to the shadow as an overlay instead. Mounted at whatever
        # /Volumes/<name> path hdiutil itself picks (see attach()).
        shadow = os.path.join(tmp, "shadow.shadow")
        mount_point = attach(final_dmg, shadow=shadow)
        try:
            write_finder_view(mount_point, volume_icon)
            run("sync", "--file-system", mount_point)
        finally:
            detach(mount_point)

        # Bake the shadow's changes into a new compressed image — this
        # applies the overlay, it doesn't rebuild the filesystem, so the
        # Alias/Bookmark identifiers written above stay valid.
        if os.path.exists(out_path):
            os.remove(out_path)
        run("hdiutil", "convert", final_dmg, "-shadow", shadow, "-format", "UDZO", "-o", out_path)

    print(f"built {out_path}")


def stamp_file_icon(dmg_path):
    """Give the .dmg FILE itself (as opposed to its mounted volume, handled
    by the .VolumeIcon.icns copy above) a custom Finder icon — see
    generate-dmg-file-icon.py for why this needs its own rounded/beveled
    artwork rather than the app's own full-bleed icon.png."""
    icon_icns = os.path.join(ASSETS, "dmg-file-icon.icns")
    if not os.path.exists(icon_icns):
        print(f"stamp_file_icon: {icon_icns} not found, skipping", file=sys.stderr)
        return
    with tempfile.TemporaryDirectory() as tmp:
        tmp_icns = os.path.join(tmp, "icon.icns")
        rsrc_path = os.path.join(tmp, "icon.rsrc")
        shutil.copyfile(icon_icns, tmp_icns)
        run("sips", "-i", tmp_icns, capture_output=True)
        rsrc = run("DeRez", "-only", "icns", tmp_icns, capture_output=True).stdout
        with open(rsrc_path, "wb") as f:
            f.write(rsrc)
        run("Rez", "-append", rsrc_path, "-o", dmg_path)
        run("SetFile", "-a", "C", dmg_path)
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
