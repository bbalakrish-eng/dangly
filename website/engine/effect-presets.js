// Base configs for each effect preset. A catalog item references one by
// name (item.effect.preset) and can override any field inline — see
// catalog/README.md.

window.EFFECT_PRESETS = {
  snow: {
    density: 160,
    shape: 'dot',
    irregular: true,
    color: '#fdfaf5',
    opacity: 0.85,
    sizeRange: [0.8, 5],
    sizeBias: 2.2,
    glowAmount: 0.8,
    fallSpeedRange: [20, 60],
    swayAmplitude: 20,
    swayFrequency: 0.5,
    rotate: true,
    cursorAvoidRadius: 60,
    accumulate: true,
    maxPileHeight: 140,
    depositAmount: 3,
  },
  rain: {
    density: 180,
    shape: 'line',
    color: 'rgba(190, 210, 255, 0.8)',
    depthCorrelated: true,
    lengthRange: [8, 26],
    fallSpeedRange: [350, 850],
    lineWidthRange: [0.7, 2],
    opacityRange: [0.25, 0.9],
    swayAmplitude: 2,
    angleDegrees: 8,
    cursorAvoidRadius: 0,
    // glassSplash tried and rejected (looked bad through several
    // iterations — see catalog/README.md) — left disabled rather than
    // removed from the engine, in case a different approach is worth
    // trying later.
    glassSplash: false,
  },
  leaves: {
    density: 30,
    glyphs: ['🍁', '🍂'],
    sizeRange: [18, 28],
    fallSpeedRange: [30, 60],
    swayAmplitude: 40,
    swayFrequency: 0.3,
    rotate: true,
    cursorAvoidRadius: 40,
  },
};
