// What the overlay engine treats as "the screen": how big it is, and where its top-left corner
// sits in the page. In the desktop app that's the whole window (the defaults below). A host
// that embeds the engine in a smaller area (the website's preview stage) defines
// window.overlayHost.size / .origin before this file loads. Load before the other engine files.
window.overlayHost = window.overlayHost || {};

window.overlayHost.size =
  window.overlayHost.size || (() => ({ width: window.innerWidth, height: window.innerHeight }));

window.overlayHost.origin = window.overlayHost.origin || (() => ({ x: 0, y: 0 }));

// A mouse event's position in overlay coordinates.
window.overlayHost.point = (event) => {
  const origin = window.overlayHost.origin();
  return { x: event.clientX - origin.x, y: event.clientY - origin.y };
};
