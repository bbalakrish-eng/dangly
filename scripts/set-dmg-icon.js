// electron-builder already gives the DMG's *mounted volume* a custom icon
// (from build.mac.icon, automatically) — but the .dmg FILE itself, sitting
// in Finder before you've even opened it, is a separate icon and stays the
// generic disk-image one unless something sets it explicitly. This hook
// (build.afterAllArtifactBuild) does that, using the classic macOS
// technique for giving any plain file a custom Finder icon: sips embeds an
// icon file's own icon resource into itself, DeRez reads that resource back
// out, Rez appends it onto the target file, and SetFile flips the "has a
// custom icon" flag Finder checks.
//
// Uses assets/dmg-file-icon.icns (see generate-dmg-file-icon.py), NOT the
// app's own full-bleed icon.icns — a plain file gets no automatic OS
// rounding/shadow the way an installed .app does, so using the flat
// full-bleed icon here showed up as a hard-edged square. The dmg-file-icon
// variant bakes the rounded corners and a drop shadow in directly, so it
// still reads as "the app icon" without looking flat.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = async function setDmgIcon(buildResult) {
  if (process.platform !== 'darwin') return [];

  const dmgPaths = (buildResult.artifactPaths || []).filter((p) => p.endsWith('.dmg'));
  if (dmgPaths.length === 0) return [];

  const iconIcns = path.join(__dirname, '..', 'assets', 'dmg-file-icon.icns');
  if (!fs.existsSync(iconIcns)) {
    console.warn(`set-dmg-icon: ${iconIcns} not found — run npm run generate-dmg-file-icon, skipping`);
    return [];
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangly-dmg-icon-'));
  const tmpIcns = path.join(tmpDir, 'icon.icns');
  const rsrcPath = path.join(tmpDir, 'icon.rsrc');

  try {
    fs.copyFileSync(iconIcns, tmpIcns); // work on a copy — sips edits it in place
    execFileSync('sips', ['-i', tmpIcns]);
    // DeRez encodes the whole icns as hex text (~3-4x its binary size) — the
    // gradient-shaded icon is big enough now that this exceeds Node's
    // default 1MB execFileSync buffer (ENOBUFS) without an explicit maxBuffer.
    const rsrc = execFileSync('DeRez', ['-only', 'icns', tmpIcns], { maxBuffer: 64 * 1024 * 1024 });
    fs.writeFileSync(rsrcPath, rsrc);

    for (const dmgPath of dmgPaths) {
      execFileSync('Rez', ['-append', rsrcPath, '-o', dmgPath]);
      execFileSync('SetFile', ['-a', 'C', dmgPath]);
      console.log(`set-dmg-icon: applied custom icon to ${path.basename(dmgPath)}`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return [];
};
