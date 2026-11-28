/* =========================================================
 * sound.js — 아주 간단한 효과음 (파일 없이 브라우저가 직접 소리를 만듦)
 * 브라우저 규칙상 키를 한 번 누른 뒤부터 소리가 납니다.
 * ========================================================= */
const Sound = {
  ctx: null,
  muted: false,

  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
  },

  // freq: 높이, dur: 길이(초), type: 소리 모양, vol: 크기, slide: 끝으로 갈수록 바뀌는 높이
  beep(freq = 440, dur = 0.08, type = 'square', vol = 0.05, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  later(ms, fn) { setTimeout(fn, ms); },

  success() { this.beep(660, 0.06); this.later(55, () => this.beep(990, 0.07)); },
  perfect() { this.beep(880, 0.05, 'triangle', 0.06); this.later(50, () => this.beep(1320, 0.09, 'triangle', 0.06)); },
  fail()    { this.beep(180, 0.15, 'sawtooth', 0.05, -80); },
  basic()   { this.beep(520, 0.04, 'square', 0.025); },
  combo()   { [523, 659, 784, 1046].forEach((f, i) => this.later(i * 60, () => this.beep(f, 0.12, 'triangle', 0.07))); },
  hit()     { this.beep(140, 0.06, 'square', 0.03, -50); },
  hurt()    { this.beep(90, 0.22, 'sawtooth', 0.07, -40); },
  shatter() { [1400, 900, 600, 300].forEach((f, i) => this.later(i * 40, () => this.beep(f, 0.08, 'sawtooth', 0.05))); },
  tick()    { this.beep(1500, 0.025, 'sine', 0.03); },
  tool()    { this.beep(700, 0.1, 'sine', 0.06, 300); },
  wail()    { this.beep(950, 0.7, 'sawtooth', 0.05, -650); },
  boom()    { this.beep(80, 0.3, 'sawtooth', 0.08, -40); },
  levelUp() { [660, 880, 1100].forEach((f, i) => this.later(i * 80, () => this.beep(f, 0.1, 'triangle', 0.06))); },
};
