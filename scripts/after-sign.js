// electron-builder afterSign hook (see package.json's build.afterSign).
//
// We have no paid Apple Developer ID, so electron-builder's own signing step
// is skipped entirely ("cannot find valid identity") and the .app ships with
// only the bare ad-hoc stub the linker attaches to the executable — no
// bundle-level seal (_CodeSignature/CodeResources) at all. That's enough to
// just launch the app, but macOS's strict validator that Squirrel.Mac (the
// auto-updater's installer) runs against the downloaded update rejects it
// outright: "code has no resources but signature indicates they must be
// present" (confirmed via `log stream` while reproducing a failed update).
//
// Deep ad-hoc signing the whole bundle ourselves (sign "-", no certificate
// needed) gives it a real, self-consistent seal and fixes that — this runs
// after packaging but before electron-builder zips the app for the update
// artifact, so the zip that ships actually contains the signed bundle.
const { execFileSync } = require("child_process");
const path = require("path");

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath]);
  console.log(`afterSign: ad-hoc deep-signed ${appPath}`);
};
