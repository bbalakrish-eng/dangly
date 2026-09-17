// Base configs for each effect preset. A catalog item references one by
// name (item.effect.preset) and can override any field inline — see
// catalog/README.md.

window.EFFECT_PRESETS = {
  snow: {
    density: 80,
    glyphs: ['❄'],
    color: '#ffffff',
    sizeRange: [10, 22],
    fallSpeedRange: [20, 50],
    swayAmplitude: 20,
    swayFrequency: 0.5,
    rotate: false,
    cursorAvoidRadius: 60,
  },
  rain: {
    density: 150,
    shape: 'line',
    color: 'rgba(180, 200, 255, 0.6)',
    lengthRange: [10, 20],
    fallSpeedRange: [400, 700],
    swayAmplitude: 2,
    angleDegrees: 8,
    cursorAvoidRadius: 0,
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
