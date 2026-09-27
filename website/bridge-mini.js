// Stands in for the desktop app's preload script, same role as bridge.js — but this page also
// needs working appearance overrides (the size slider), which the main site's demo never uses,
// so this is its own small bridge rather than reusing bridge.js as is.
(() => {
  const listeners = { item: null, appearance: null, resume: null };
  let resolveInitial;
  const initialItem = new Promise((resolve) => {
    resolveInitial = resolve;
  });
  const overrides = {}; // in-memory only — a page refresh is a clean slate, which is fine here

  const overlay = () => document.getElementById('overlay');

  window.overlayHost = {
    size: () => {
      const el = overlay();
      return el ? { width: el.clientWidth, height: el.clientHeight } : { width: 0, height: 0 };
    },
    origin: () => {
      const el = overlay();
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    },
  };

  window.overlayAPI = {
    setIgnoreMouseEvents() {},
    getActiveItem: () => initialItem,
    onItemChanged: (callback) => {
      listeners.item = callback;
    },
    // The charm's hang point is only ever computed once, at physics start — a real visitor
    // resizing their browser (unlike the fixed-size app window this engine was built for) needs
    // this re-triggered explicitly; see the resize listener in mini-demo.js.
    onSystemResume: (callback) => {
      listeners.resume = callback;
    },
    getDisplayInfo: async () => {
      await initialItem;
      const { width, height } = window.overlayHost.size();
      return {
        bounds: { x: 0, y: 0, width, height },
        workArea: { x: 0, y: 0, width, height },
        charmAnchorX: Math.round(width * 0.6),
      };
    },
    resolveAssetPath: async (relativePath) => relativePath,
    getAppearance: async (itemId) => overrides[itemId] || {},
    onAppearanceChanged: (callback) => {
      listeners.appearance = callback;
    },
  };

  window.miniBridge = {
    start: (item) => resolveInitial(item),
    select: (item) => listeners.item && listeners.item(item),
    setAppearance: (itemId, patch) => {
      overrides[itemId] = { ...(overrides[itemId] || {}), ...patch };
      listeners.appearance && listeners.appearance(itemId, overrides[itemId]);
    },
    relayout: () => listeners.resume && listeners.resume(),
  };
})();
