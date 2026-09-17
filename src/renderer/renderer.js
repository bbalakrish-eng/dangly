const charm = document.getElementById('charm');
const canvas = document.getElementById('effects');
const pet = document.getElementById('pet');
const petGlyph = pet.querySelector('.pet-glyph');

let currentItem = null;
let particleSystem = null;
let petSystem = null;
let interactiveEl = null; // element eligible for click-through + click reactions
let displayInfo = null;

function computeGroundY() {
  if (!displayInfo) return window.innerHeight - 60;
  const insetBottom =
    displayInfo.bounds.y + displayInfo.bounds.height - (displayInfo.workArea.y + displayInfo.workArea.height);
  return window.innerHeight - Math.max(insetBottom, 0) - 16;
}

function centerCharm() {
  const rect = charm.getBoundingClientRect();
  charm.style.left = `${window.innerWidth / 2 - rect.width / 2}px`;
}

function teardownCurrent() {
  if (particleSystem) {
    particleSystem.stop();
    particleSystem = null;
  }
  if (petSystem) {
    petSystem.stop();
    petSystem = null;
  }
  charm.classList.add('hidden');
  pet.classList.add('hidden');
  interactiveEl = null;
}

function applyItem(item) {
  currentItem = item;
  teardownCurrent();

  if (!item || item.type === 'charm') {
    charm.classList.remove('hidden');
    charm.textContent = item ? item.glyph : '🍀';
    if (!charm.style.left) centerCharm();
    interactiveEl = charm;
    return;
  }

  if (item.type === 'effect') {
    particleSystem = window.createParticleSystem(canvas, item.effect || {});
    particleSystem.start();
    return;
  }

  if (item.type === 'pet') {
    pet.classList.remove('hidden');
    petGlyph.textContent = item.glyph;
    petSystem = window.createPetSystem(pet, { ...(item.pet || {}), groundY: computeGroundY() });
    petSystem.start();
    interactiveEl = pet;
  }
}

async function init() {
  displayInfo = await window.overlayAPI.getDisplayInfo();
  const initialItem = await window.overlayAPI.getActiveItem();
  applyItem(initialItem);
}

window.overlayAPI.onItemChanged(applyItem);
init();

let isDragging = false;
let didDrag = false;
let dragOffset = { x: 0, y: 0 };

function updateClickThrough(x, y) {
  const el = document.elementFromPoint(x, y);
  const overInteractive = Boolean(interactiveEl && interactiveEl.contains(el));
  window.overlayAPI.setIgnoreMouseEvents(!overInteractive, { forward: true });
}

document.addEventListener('mousemove', (e) => {
  if (particleSystem) {
    particleSystem.updateCursor(e.clientX, e.clientY);
  }

  if (isDragging) {
    didDrag = true;
    charm.style.left = `${e.clientX - dragOffset.x}px`;
    charm.style.top = `${e.clientY - dragOffset.y}px`;
    return;
  }
  updateClickThrough(e.clientX, e.clientY);
});

document.addEventListener('mousedown', (e) => {
  if (currentItem?.type === 'charm' && e.target === charm) {
    isDragging = true;
    didDrag = false;
    const rect = charm.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    e.preventDefault();
  }
});

window.addEventListener('mouseup', (e) => {
  if (currentItem?.type === 'charm') {
    if (isDragging && !didDrag) {
      performRitual(charm);
    }
    isDragging = false;
    return;
  }

  if (currentItem?.type === 'pet' && pet.contains(e.target)) {
    performRitual(petGlyph);
  }
});

function performRitual(target) {
  const animationName = currentItem?.ritual?.animation || 'flick';
  target.classList.remove(animationName);
  void target.offsetWidth; // restart the CSS animation
  target.classList.add(animationName);
}
