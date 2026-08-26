chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'playBeep') {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const duration = msg.duration || 3;
    let t = 0;
    while (t < duration) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'square';
      gain.gain.setValueAtTime(0.15, now + t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.12);
      osc.start(now + t);
      osc.stop(now + t + 0.12);
      t += 0.25;
    }
  }
});
