// Procedural WebAudio sound design: no external assets needed.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.crowdGain = null;
    this.drumTimer = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.noiseBuf = this.makeNoise(2);
    this.startCrowd();
  }

  makeNoise(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  noise(dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.5, attack = 0.002, decay = null, when = 0, freqEnd = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (decay ?? dur));
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone(freq, dur, { type = 'sine', gain = 0.3, when = 0, freqEnd = null, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  bat(power = 1) {
    // sharp wooden crack
    this.noise(0.12, { type: 'highpass', freq: 1800, gain: 0.9 * power, decay: 0.09 });
    this.noise(0.25, { type: 'bandpass', freq: 900, q: 3, gain: 0.6 * power, decay: 0.2 });
    this.tone(1250, 0.12, { type: 'triangle', gain: 0.35 * power, freqEnd: 700 });
    this.tone(180, 0.15, { type: 'sine', gain: 0.5 * power, freqEnd: 60 });
  }

  foulTip() {
    this.noise(0.08, { type: 'highpass', freq: 2500, gain: 0.5, decay: 0.06 });
  }

  mitt() {
    this.noise(0.1, { type: 'lowpass', freq: 900, gain: 0.9, decay: 0.08 });
    this.tone(110, 0.12, { gain: 0.5, freqEnd: 50 });
  }

  whoosh(dur = 0.35, pitch = 1) {
    this.noise(dur, { type: 'bandpass', freq: 400 * pitch, freqEnd: 2400 * pitch, q: 2, gain: 0.35, attack: dur * 0.6, decay: dur });
  }

  thud() {
    this.tone(90, 0.2, { gain: 0.4, freqEnd: 40 });
    this.noise(0.15, { type: 'lowpass', freq: 500, gain: 0.3 });
  }

  slide() {
    this.noise(0.6, { type: 'bandpass', freq: 700, q: 0.7, gain: 0.35, attack: 0.03, decay: 0.55 });
  }

  whistle() {
    this.tone(2200, 0.25, { type: 'square', gain: 0.05 });
  }

  umpire(kind = 'strike') {
    // a shouted "STEE-RIKE!" approximation with formant-ish tones
    if (kind === 'strike') {
      this.noise(0.08, { type: 'highpass', freq: 3000, gain: 0.25 });
      this.tone(220, 0.45, { type: 'sawtooth', gain: 0.12, when: 0.06, freqEnd: 150 });
      this.tone(660, 0.4, { type: 'square', gain: 0.03, when: 0.06, freqEnd: 420 });
    } else if (kind === 'out') {
      this.tone(250, 0.35, { type: 'sawtooth', gain: 0.12, freqEnd: 160 });
    }
  }

  explosion(big = 1) {
    this.noise(1.4 * big, { type: 'lowpass', freq: 1200, freqEnd: 80, gain: 0.9, decay: 1.2 * big });
    this.tone(70, 1.0, { gain: 0.7, freqEnd: 30 });
  }

  zap() {
    for (let i = 0; i < 5; i++) this.noise(0.06, { type: 'highpass', freq: 3000 + Math.random() * 3000, gain: 0.35, when: i * 0.04 });
    this.tone(1800, 0.2, { type: 'sawtooth', gain: 0.1, freqEnd: 200 });
  }

  fire() {
    this.noise(0.9, { type: 'bandpass', freq: 300, freqEnd: 1600, q: 0.8, gain: 0.5, attack: 0.1, decay: 0.9 });
  }

  chime() {
    [880, 1320, 1760].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', gain: 0.12, when: i * 0.06 }));
  }

  specialStinger() {
    // big anime-style power-up stinger
    this.tone(110, 1.2, { type: 'sawtooth', gain: 0.18, freqEnd: 440, attack: 0.3 });
    this.tone(220, 1.2, { type: 'square', gain: 0.06, freqEnd: 880, attack: 0.3 });
    this.noise(1.0, { type: 'bandpass', freq: 200, freqEnd: 6000, q: 1.5, gain: 0.4, attack: 0.8, decay: 1.0 });
    this.tone(1760, 0.6, { type: 'triangle', gain: 0.12, when: 0.9 });
  }

  firework() {
    this.noise(0.9, { type: 'lowpass', freq: 800, freqEnd: 120, gain: 0.5, decay: 0.8 });
    for (let i = 0; i < 6; i++) this.noise(0.05, { type: 'highpass', freq: 4000, gain: 0.12, when: 0.3 + Math.random() * 0.5 });
  }

  startCrowd() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.makeNoise(4);
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 0.4;
    const g = this.ctx.createGain();
    g.gain.value = 0.06;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
    this.crowdGain = g;
    this.crowdFilter = f;
  }

  crowd(level) {
    if (!this.crowdGain) return;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime(0.05 + level * 0.28, t, 0.25);
    this.crowdFilter.frequency.setTargetAtTime(600 + level * 900, t, 0.3);
  }

  /** KBO-style cheering: drum + clapper pattern "짝짝 짝짝짝" */
  cheerBeat(time, dt, active) {
    if (!this.ctx || !active) return;
    this.drumTimer -= dt;
    if (this.drumTimer <= 0) {
      const pattern = [0, 0.22, 0.6, 0.78, 0.96];
      pattern.forEach((w, i) => {
        this.tone(95, 0.18, { gain: 0.22, when: w, freqEnd: 55 });
        this.noise(0.05, { type: 'highpass', freq: 2500, gain: 0.12, when: w + 0.01 });
      });
      this.drumTimer = 1.6;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
}
