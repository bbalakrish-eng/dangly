// Short sound effects for Rage Room items, synthesized with the Web Audio
// API rather than shipped as audio files — no licensing to worry about, no
// asset weight, and each play can vary slightly instead of being an
// identical loop. Lazily creates its AudioContext on first use: some
// browsers (and the website's own autoplay rules) refuse to start one
// before a real user gesture, and a Rage Room sound is always triggered by
// a click, so that gesture already exists by the time this runs.
(() => {
  let ctx = null;

  function getContext() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // A short burst of filtered noise, swept from a bright "whoosh" down to a
  // low rumble — an ignition sound, not a literal recording of one. Lowpass
  // (not bandpass) plus a slow attack is deliberate: a bandpass sweep with a
  // near-instant attack is what a sharp percussive "crack" sounds like
  // (read by users as a gunshot), where fire catching is a softer, rounder
  // whoosh with no hard transient at the front.
  function playFireSound() {
    const ac = getContext();
    const duration = 1.0;
    const now = ac.currentTime;

    const bufferSize = Math.floor(ac.sampleRate * duration);
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // Fades the raw noise itself toward the tail, on top of the gain
      // envelope below, so the cut-off never sounds abrupt.
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
    }

    const noise = ac.createBufferSource();
    noise.buffer = buffer;

    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.3;
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + duration);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);

    noise.start(now);
    noise.stop(now + duration);
  }

  window.rageAudio = { playFireSound };
})();
