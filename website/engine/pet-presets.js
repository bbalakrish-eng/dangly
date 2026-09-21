// Base configs for each pet preset. A catalog item references one by
// name (item.pet.preset) and can override any field inline.
//
// facesLeft: true means the emoji's default artwork faces left (true for
// most animal emoji) — the engine flips it only when walking right.

window.PET_PRESETS = {
  cat: {
    speed: 60,
    idleMin: 2,
    idleMax: 6,
    bobAmount: 5,
    bobSpeed: 9,
    waddleDegrees: 6,
    facesLeft: true,
  },
  dog: {
    speed: 90,
    idleMin: 1.5,
    idleMax: 4,
    bobAmount: 6,
    bobSpeed: 11,
    waddleDegrees: 7,
    facesLeft: true,
  },
};
