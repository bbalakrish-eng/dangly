// Stands in for the desktop app's preload script. The overlay engine in engine/ talks to the
// host only through window.overlayAPI and window.overlayHost; in the app those are Electron IPC
// and the whole window, here they are the page and the rounded preview stage.
// Load it before the engine scripts.
(() => {
  const listeners = { item: null, resume: null };
  let resolveInitial;
  const initialItem = new Promise((resolve) => {
    resolveInitial = resolve;
  });

  const overlay = () => document.getElementById('overlay');

  // The engine's "screen" is the stage, wherever it currently sits on the page.
  window.overlayHost = {
    size: () => {
      const el = overlay();
      return el ? { width: el.clientWidth, height: el.clientHeight } : { width: window.innerWidth, height: window.innerHeight };
    },
    origin: () => {
      const el = overlay();
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    },
  };

  function displayInfo() {
    const { width, height } = window.overlayHost.size();
    // Pets walk along a floor line rather than the bottom edge: the picker tray and the quick
    // picks are cut into the stage's bottom corners and would hide anything walking there.
    const floor = Math.round(height * 0.66);
    return {
      bounds: { x: 0, y: 0, width, height },
      workArea: { x: 0, y: 0, width, height: floor + 16 },
      charmAnchorX: Math.round(width * 0.52),
      ritualCenterX: Math.round(width * 0.5),
    };
  }

  window.overlayAPI = {
    setIgnoreMouseEvents() {}, // the overlay's own pointer-events rules already let clicks through
    getActiveItem: () => initialItem,
    onItemChanged: (callback) => {
      listeners.item = callback;
    },
    onSystemResume: (callback) => {
      listeners.resume = callback;
    },
    // Held back until the page has its content and typeface: the stage's size is only right
    // once layout has settled, and the engine asks as soon as it loads.
    getDisplayInfo: async () => {
      await initialItem;
      return displayInfo();
    },
    resolveAssetPath: async (relativePath) => relativePath,
  };

  window.demoBridge = {
    start: (item) => resolveInitial(item),
    select: (item) => listeners.item && listeners.item(item),
    // Same recovery path the app uses after a display change: re-read the layout, re-apply.
    relayout: () => listeners.resume && listeners.resume(),
  };
})();
