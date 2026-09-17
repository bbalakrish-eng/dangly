const charm = document.getElementById('charm');

let currentItem = null;

function centerCharm() {
  const rect = charm.getBoundingClientRect();
  charm.style.left = `${window.innerWidth / 2 - rect.width / 2}px`;
}

function applyItem(item) {
  currentItem = item;
  charm.textContent = item ? item.glyph : '🍀';
  if (!charm.style.left) {
    centerCharm();
  }
}

window.overlayAPI.getActiveItem().then(applyItem);
window.overlayAPI.onItemChanged(applyItem);

let isDragging = false;
let didDrag = false;
let dragOffset = { x: 0, y: 0 };

function updateClickThrough(x, y) {
  const el = document.elementFromPoint(x, y);
  const overCharm = el === charm;
  window.overlayAPI.setIgnoreMouseEvents(!overCharm, { forward: true });
}

document.addEventListener('mousemove', (e) => {
  if (isDragging) {
    didDrag = true;
    charm.style.left = `${e.clientX - dragOffset.x}px`;
    charm.style.top = `${e.clientY - dragOffset.y}px`;
    return;
  }
  updateClickThrough(e.clientX, e.clientY);
});

charm.addEventListener('mousedown', (e) => {
  isDragging = true;
  didDrag = false;
  const rect = charm.getBoundingClientRect();
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;
  e.preventDefault();
});

window.addEventListener('mouseup', () => {
  if (isDragging && !didDrag) {
    performRitual();
  }
  isDragging = false;
});

function performRitual() {
  const animationName = currentItem?.ritual?.animation || 'flick';
  charm.classList.remove(animationName);
  void charm.offsetWidth; // restart the CSS animation
  charm.classList.add(animationName);
}
