const { exec } = require('child_process');
const { screen } = require('electron');

// Neither macOS nor Windows exposes "a video is playing full screen" to a
// third-party app directly, so this detects the closest observable proxy
// instead: some other app's frontmost window exactly filling a display.
// That's true for a full-screen video (a native player, or a browser tab
// taken full screen) — the common real case — but also for any other
// full-screen app (a game, a full-screen terminal). Good enough for a "get
// out of the way while something covers the whole screen" toggle; it isn't
// trying to be a real video-playback detector.
const POLL_INTERVAL_MS = 2000;

let timer = null;
let lastResult = false;

// macOS: needs one-time Automation permission for "System Events" (the OS
// prompts for this itself the first time it runs) — no Accessibility or
// Screen Recording access, since only window position/size is read here,
// never window titles or content.
function checkMac(cb) {
  const script = `
    tell application "System Events"
      set frontApp to first application process whose frontmost is true
      set appName to name of frontApp
      try
        set win to front window of frontApp
        set {winX, winY} to position of win
        set {winW, winH} to size of win
        return appName & "|" & winX & "," & winY & "," & winW & "," & winH
      on error
        return appName & "|none"
      end try
    end tell
  `;
  exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 1500 }, (err, stdout) => {
    if (err) return cb(false);
    const [appName, windowSpec] = stdout.trim().split('|');
    if (!appName || appName === 'Dangly' || appName === 'Finder' || windowSpec === 'none') return cb(false);
    const parts = windowSpec.split(',').map(Number);
    if (parts.length !== 4 || parts.some(Number.isNaN)) return cb(false);
    const [x, y, w, h] = parts;
    const display = screen.getDisplayNearestPoint({ x, y });
    const b = display.bounds;
    const fills = Math.abs(x - b.x) <= 2 && Math.abs(y - b.y) <= 2 && Math.abs(w - b.width) <= 2 && Math.abs(h - b.height) <= 2;
    cb(fills);
  });
}

// Windows: GetForegroundWindow + GetWindowRect compared against that
// monitor's bounds, the same "does it exactly fill the screen" check as
// macOS above. Unverified on real Windows hardware — written to the
// documented Win32/PowerShell APIs, but this project's only test machine is
// a Mac.
function checkWindows(cb) {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DanglyWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
Add-Type -AssemblyName System.Windows.Forms
$hwnd = [DanglyWin32]::GetForegroundWindow()
$rect = New-Object DanglyWin32+RECT
[void][DanglyWin32]::GetWindowRect($hwnd, [ref]$rect)
$screenBounds = [System.Windows.Forms.Screen]::FromHandle($hwnd).Bounds
Write-Output "$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)|$($screenBounds.Left),$($screenBounds.Top),$($screenBounds.Right),$($screenBounds.Bottom)"
  `;
  exec(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, { timeout: 1500 }, (err, stdout) => {
    if (err) return cb(false);
    const [winSpec, screenSpec] = stdout.trim().split('|');
    if (!winSpec || !screenSpec) return cb(false);
    const w = winSpec.split(',').map(Number);
    const s = screenSpec.split(',').map(Number);
    if (w.length !== 4 || s.length !== 4 || w.some(Number.isNaN) || s.some(Number.isNaN)) return cb(false);
    const fills = Math.abs(w[0] - s[0]) <= 2 && Math.abs(w[1] - s[1]) <= 2 && Math.abs(w[2] - s[2]) <= 2 && Math.abs(w[3] - s[3]) <= 2;
    cb(fills);
  });
}

function poll(cb) {
  if (process.platform === 'darwin') return checkMac(cb);
  if (process.platform === 'win32') return checkWindows(cb);
  cb(false); // no heuristic implemented for other platforms
}

// onChange fires only on an actual true/false transition, not every poll.
function start(onChange) {
  if (timer) return;
  timer = setInterval(() => {
    poll((fullscreen) => {
      if (fullscreen !== lastResult) {
        lastResult = fullscreen;
        onChange(fullscreen);
      }
    });
  }, POLL_INTERVAL_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  lastResult = false;
}

module.exports = { start, stop };
