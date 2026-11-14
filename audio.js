"use strict";
// Sound synthesis
const wallAudio = {
  ctx: null,
  master: null,
  enabled: true,
  volume: .6,
  last: new Map(),
  gaps: {click:25, autoclick:350, crit:90, achievement:450, upgradeAvailable:450},

  init() {
    try {
      const stored = JSON.parse(localStorage.getItem("wall-smacker-audio"));
      if (typeof stored?.enabled === "boolean") this.enabled = stored.enabled;
      if (Number.isFinite(stored?.volume)) this.volume = Math.max(0,Math.min(1,stored.volume));
    } catch {}
    const unlock = () => this.unlock();
    window.addEventListener("pointerdown",unlock,true);
    window.addEventListener("keydown",unlock,true);
    window.addEventListener("click",unlock,true);
  },

  unlock() {
    if (!this.enabled || !this.volume || this.ctx?.state === "running") return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      if (!this.ctx) {
        this.ctx = new Context();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.master.gain.value = this.volume*.6;
      }
      if (this.ctx.state === "suspended" || this.ctx.state === "interrupted") {
        this.ctx.resume().catch(()=>{});
      }
    } catch {}
  },

  update(enabled, volume) {
    this.enabled = enabled;
    this.volume = volume;
    if (this.master) this.master.gain.value = enabled ? volume*.6 : 0;
    try { localStorage.setItem("wall-smacker-audio",JSON.stringify({enabled,volume})); } catch {}
    this.unlock();
  },

  // ---------------- Building blocks ----------------
  // One oscillator note with a quick attack and exponential fade
  tone(o) {
    const c = this.ctx;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const v = o.vol === undefined ? 0.3 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  },

  // A burst of filtered static
  noise(o) {
    const c = this.ctx;
    const t = c.currentTime + (o.delay || 0);
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * o.dur), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = o.freq || 2000;
    filter.Q.value = o.q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(o.vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  },

  // Several notes in a row (step = seconds between notes; 0 = chord)
  notes(freqs, o) {
    const self = this;
    freqs.forEach(function(f, i) {
      self.tone({ freq: f, type: o.type, dur: o.dur, vol: o.vol, delay: (o.delay || 0) + i * o.step, attack: o.attack });
    });
  },

  play(name) {
    if (!this.enabled || !this.volume || document.hidden || this.ctx?.state !== "running") return;
    const now = performance.now();
    if (now-(this.last.get(name) ?? -Infinity)<(this.gaps[name] || 0)) return;
    this.last.set(name,now);
    const r = 1+(Math.random()-.5)*.12;
    switch (name) {
      case "click":
        this.tone({ freq: 520 * r, to: 360 * r, type: "square", dur: 0.05, vol: 0.1 });
        break;
      case "autoclick": // A low, muted knock for automatic punches.
        this.tone({ freq: 205 * r, to: 95 * r, type: "triangle", dur: 0.075, vol: 0.13 });
        break;
      case "crit":
        this.tone({ freq: 880, to: 1320, type: "square", dur: 0.08, vol: 0.12 });
        this.tone({ freq: 1760, type: "triangle", dur: 0.15, vol: 0.12, delay: 0.05 });
        break;
      case "buy":
        this.tone({ freq: 440 * r, to: 880 * r, type: "triangle", dur: 0.09, vol: 0.2 });
        break;
      case "levelup":
        this.tone({ freq: 330, to: 660, type: "triangle", dur: 0.15, vol: 0.15 });
        this.notes([659.25, 830.61, 987.77, 1318.5], { type: "square", step: 0.07, dur: 0.18, vol: 0.08, delay: 0.1 });
        this.noise({ freq: 7000, q: 2, dur: 0.35, vol: 0.04, delay: 0.3 });
        break;
      case "upgrade":
        this.notes([523.25, 659.25, 783.99], { type: "triangle", step: 0.06, dur: 0.14, vol: 0.18 });
        break;
      case "achievement":
        this.notes([783.99, 987.77, 1174.66, 1567.98], { type: "square", step: 0.08, dur: 0.16, vol: 0.08 });
        break;
      case "glitchSpawn":
        // Attention-grabbing "error" alert: static crackle, stuttering beeps, falling glitch sweep
        this.noise({ freq: 1500, q: 0.7, dur: 0.25, vol: 0.3 });
        [990, 660, 990, 660].forEach(function(freq, i) {
          this.tone({ freq: freq, type: "square", dur: 0.08, vol: 0.13, delay: 0.1 + i * 0.11 });
        }, this);
        for (let i = 0; i < 5; i++) {
          this.tone({ freq: 300 + Math.random() * 2200, type: "square", dur: 0.025, vol: 0.06, delay: 0.55 + i * 0.03 });
        }
        this.tone({ freq: 1400, to: 180, type: "sawtooth", dur: 0.35, vol: 0.07, delay: 0.7 });
        break;
      case "glitchClaim":
        this.tone({ freq: 400, to: 2000, type: "sine", dur: 0.25, vol: 0.18 });
        this.notes([1046.5, 1318.5, 1568], { type: "triangle", step: 0.06, dur: 0.2, vol: 0.12, delay: 0.12 });
        break;
      case "tab":
        this.tone({ freq: 900, type: "sine", dur: 0.04, vol: 0.07 });
        break;
      case "toggle":
        this.tone({ freq: 660, type: "sine", dur: 0.08, vol: 0.12 });
        break;
      case "select":   // ×1/×10/Max buttons, request type chips
        this.tone({ freq: 700, type: "square", dur: 0.03, vol: 0.06 });
        this.tone({ freq: 1050, type: "square", dur: 0.03, vol: 0.05, delay: 0.03 });
        break;
      case "save":
        this.notes([660, 990, 1320], { type: "square", step: 0.04, dur: 0.05, vol: 0.06 });
        this.noise({ freq: 5000, q: 2, dur: 0.06, vol: 0.04, delay: 0.12 });
        break;
      case "load":
        this.notes([523.25, 783.99, 1046.5], { type: "triangle", step: 0.06, dur: 0.16, vol: 0.12 });
        break;
      case "error":
        this.notes([400, 300], { type: "square", step: 0.09, dur: 0.1, vol: 0.08 });
        break;
      case "newGen":   // first unit of a new generator type
        this.notes([523.25, 659.25, 783.99, 1046.5, 1318.5], { type: "triangle", step: 0.05, dur: 0.25, vol: 0.12 });
        this.noise({ freq: 6000, q: 2, dur: 0.3, vol: 0.04, delay: 0.2 });
        break;
      case "upgradeAvailable":
        this.notes([1318.5, 1760], { type: "sine", step: 0.06, dur: 0.12, vol: 0.05 });
        break;
      case "fractureExplosion":
        this.tone({ freq: 135, to: 38, type: "triangle", dur: .32, vol: .23 });
        this.noise({ freq: 440, q: .6, dur: .34, vol: .22 });
        this.noise({ freq: 2100, q: .9, dur: .11, vol: .14 });
        break;
      case "glitchMiss":
        this.tone({ freq: 600, to: 150, type: "square", dur: 0.35, vol: 0.06 });
        this.noise({ freq: 1200, q: 0.8, dur: 0.2, vol: 0.08 });
        break;
      case "coreStage":  // a Core stage completes
        this.tone({ freq: 60, to: 240, type: "sawtooth", dur: 0.8, vol: 0.09, attack: 0.2 });
        this.notes([261.63, 392, 523.25, 783.99, 1046.5], { type: "triangle", step: 0.08, dur: 0.9, vol: 0.1, delay: 0.3 });
        this.noise({ freq: 5000, q: 1, dur: 0.9, vol: 0.05, delay: 0.5 });
        break;
      case "ending":     // the Omega Core is complete
        this.tone({ freq: 55, to: 110, type: "sawtooth", dur: 2.5, vol: 0.07, attack: 0.8 });
        this.notes([261.63, 329.63, 392, 523.25], { type: "sine", step: 0, dur: 3, vol: 0.07, delay: 0.6, attack: 0.6 });
        this.notes([1046.5, 1318.5, 1568, 2093], { type: "triangle", step: 0.25, dur: 0.8, vol: 0.05, delay: 1.4 });
        break;
    }
  }
};
wallAudio.init();
