const VARIANTS = {
  lay: ['chip-lay-1', 'chip-lay-2'], collide: ['chips-collide-1', 'chips-collide-2'],
  handle: ['chips-handle-1', 'chips-handle-2'], stack: ['chips-stack-1', 'chips-stack-2'],
  slide: ['card-slide-1', 'card-slide-2', 'card-slide-3'], place: ['card-place-1', 'card-place-2'],
  shuffle: ['card-shuffle'],
};
const sum = values => Object.values(values || {}).reduce((a, b) => a + b, 0);

// Cue plans are independent from game randomness and never alter rules or state.
export function actionSounds(action, { goldTaken = false, refilled = false, nobleVisited = false } = {}) {
  const cues = [];
  const add = (kind, at, gain = 0.55, pan = 0, rate = 1) => cues.push({ kind, at, gain, pan, rate });
  const tokens = (count, returning = false) => {
    if (!count) return;
    add(returning ? 'collide' : 'handle', 0, 0.4, returning ? -0.18 : 0.25);
    for (let i = 0; i < Math.min(count, 4); i++) {
      add(returning ? 'stack' : 'lay', 0.09 + i * 0.065, 0.34, returning ? 0.25 : -0.18);
    }
  };
  if (action.type === 'take' || action.type === 'return') tokens(sum(action.tokens), action.type === 'return');
  if (action.type === 'buy') {
    const paid = sum(action.payment);
    tokens(paid, true);
    add('slide', paid ? 0.32 : 0, 0.55, -0.12);
    add('place', paid ? 0.58 : 0.24, 0.48, -0.2);
  }
  if (action.type === 'reserve') {
    add('slide', 0, 0.5, -0.12); add('place', 0.23, 0.4, -0.25);
    if (goldTaken) add('lay', 0.36, 0.55, -0.15, 1.08);
  }
  if (refilled) add('slide', 0.72, 0.28, 0.08);
  if (action.type === 'noble' || nobleVisited) {
    const at = action.type === 'noble' ? 0 : 0.95;
    add('slide', at, 0.4, 0, 0.78);
    add('place', at + 0.3, 0.68, -0.12, 0.72);
  }
  if (action.type === 'new') add('shuffle', 0, 0.48);
  return cues;
}

export class TableAudio {
  constructor(onStatus = () => {}) {
    this.onStatus = onStatus;
    this.enabled = true; this.volume = 0.6; this.context = null;
    this.buffers = new Map(); this.sources = new Set(); this.variants = new Map();
    this.epoch = 0; this.loading = null; this.failure = false;
    try {
      const saved = JSON.parse(localStorage.getItem('splendor-audio') || 'null');
      if (saved) {
        this.enabled = saved.enabled !== false;
        if (typeof saved.volume === 'number' && Number.isFinite(saved.volume)) this.volume = Math.min(1, Math.max(0, saved.volume));
      }
    } catch { /* Preferences are optional in restricted browser sessions. */ }
  }
  save() {
    try { localStorage.setItem('splendor-audio', JSON.stringify({ enabled: this.enabled, volume: this.volume })); } catch {}
    this.onStatus();
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stop();
    this.updateGain(); this.save();
  }
  setVolume(volume) { this.volume = Math.min(1, Math.max(0, volume)); this.updateGain(); this.save(); }
  updateGain() {
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, 0.015);
  }
  // Must run directly from a pointer/keyboard gesture, not after the move's network request.
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw new Error('AudioContext unsupported');
        this.context = new AudioContext();
        this.master = this.context.createGain();
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -10; limiter.knee.value = 12; limiter.ratio.value = 4;
        this.master.connect(limiter); limiter.connect(this.context.destination);
        this.updateGain();
        this.loading = this.loadBuffers();
      }
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch { this.failure = true; this.onStatus(); }
  }
  async loadBuffers() {
    const results = await Promise.allSettled(Object.values(VARIANTS).flat().map(async name => {
      const response = await fetch(new URL(`./assets/audio/${name}.wav`, import.meta.url));
      if (!response.ok) throw new Error(`Sound unavailable: ${name}`);
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(name, buffer);
    }));
    this.failure = results.some(result => result.status === 'rejected'); this.onStatus();
  }
  stop() {
    this.epoch++;
    for (const source of this.sources) { try { source.stop(); } catch {} }
    this.sources.clear();
  }
  async play(cues) {
    if (!this.enabled || !this.context || !this.volume) return;
    const epoch = this.epoch;
    await this.loading;
    if (epoch !== this.epoch || !this.enabled || document.hidden || this.context.state !== 'running') return;
    const start = this.context.currentTime + 0.015;
    for (const cue of cues) {
      const variants = VARIANTS[cue.kind], index = this.variants.get(cue.kind) || 0;
      this.variants.set(cue.kind, index + 1);
      const buffer = this.buffers.get(variants[index % variants.length]);
      if (!buffer) continue;
      const source = this.context.createBufferSource(), gain = this.context.createGain(), pan = this.context.createStereoPanner();
      source.buffer = buffer; source.playbackRate.value = cue.rate ?? 1;
      gain.gain.value = cue.gain ?? 0.5; pan.pan.value = cue.pan ?? 0;
      source.connect(gain); gain.connect(pan); pan.connect(this.master);
      this.sources.add(source);
      source.onended = () => { this.sources.delete(source); source.disconnect(); gain.disconnect(); pan.disconnect(); };
      source.start(start + cue.at);
    }
  }
  select() { void this.play([{ kind: 'lay', at: 0, gain: 0.16, pan: 0.12 }]); }
  action(action, details) { void this.play(actionSounds(action, details)); }
}
