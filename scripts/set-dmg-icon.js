// electron-builder already gives the DMG's *mounted volume* a custom icon
// (from build.mac.icon, automatically) — but the .dmg FILE itself, sitting
// in Finder before you've even opened it, is a separate icon and stays the
// generic disk-image one unless something sets it explicitly. This hook
// (build.afterAllArtifactBuild) does that, using the classic macOS
// technique for giving any plain file a custom Finder icon: sips embeds an
// icon file's own icon resource into itself, DeRez reads that resource back
// out, Rez appends it onto the target file, and SetFile flips the "has a
// custom icon" flag Finder checks.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = async function setDmgIcon(buildResult) {
  if (process.platform !== 'darwin') return [];

  const dmgPaths = (buildResult.artifactPaths || []).filter((p) => p.endsWith('.dmg'));
  if (dmgPaths.length === 0) return [];

  const iconIcns = path.join(buildResult.outDir, '.icon-icns', 'icon.icns');
  if (!fs.existsSync(iconIcns)) {
    console.warn(`set-dmg-icon: ${iconIcns} not found, skipping custom .dmg icon`);
    return [];
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangly-dmg-icon-'));
  const tmpIcns = path.join(tmpDir, 'icon.icns');
  const rsrcPath = path.join(tmpDir, 'icon.rsrc');

  try {
    fs.copyFileSync(iconIcns, tmpIcns); // work on a copy — sips edits it in place
    execFileSync('sips', ['-i', tmpIcns]);
    const rsrc = execFileSync('DeRez', ['-only', 'icns', tmpIcns]);
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
