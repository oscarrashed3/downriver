// Procedural sound: everything is synthesized, nothing is sampled from other works.
// The river is always a layer. Each world adds its own instrument; music grows fuller as a world heals.

type Voice = 'bells' | 'woodwind' | 'marimba' | 'pluck' | 'lyre' | 'strings';

const SCALES: Record<Voice, number[]> = {
  bells: [0, 2, 4, 7, 9, 12, 14, 16],
  woodwind: [0, 2, 3, 7, 9, 12, 14],
  marimba: [0, 2, 4, 7, 9, 12, 14, 16],
  pluck: [0, 1, 4, 5, 7, 8, 12],
  lyre: [0, 2, 4, 5, 7, 9, 12],
  strings: [0, 2, 4, 7, 9, 11, 12, 14],
};
const ROOT: Record<Voice, number> = { bells: 74, woodwind: 62, marimba: 60, pluck: 57, lyre: 62, strings: 55 };
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class Sound {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  reverb!: ConvolverNode;
  riverGain!: GainNode;
  riverFilter!: BiquadFilterNode;
  windGain!: GainNode;
  voice: Voice = 'bells';
  health = 0.3;
  private nextNote = 0;
  private step = 0;
  muted = false;
  /** Master volume 0..1, kept between visits. */
  volume = (() => { const v = Number(localStorage.getItem('downriver-volume')); return localStorage.getItem('downriver-volume') !== null && isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8; })();
  private ambT = 0;
  private fireT = 0;
  private chimeT = 0;
  /** Day (0 night .. 1 day), closeness to the campfire, the chimes and the edge, set by the game each frame. */
  amb = { day: 1, fire: 0, chimes: 0, edge: 0, birds: 1 };
  private melodyQ: { at: number; m: number }[] = [];
  /**
   * World 2 (the Sky Isles), set by the game each frame: on adds the airy flute and chime layer and the rising and
   * falling wind; race plays the theme quicker; flap (0..1) is the kite cloth snapping while gliding.
   */
  sky = { on: false, race: false, flap: 0 };
  private flapT = 0;
  private nb: AudioBuffer | null = null;
  /** One shared noise buffer for the World 2 layers (made once). */
  private noise() { return this.nb ??= this.noiseBuffer(); }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.volume; this.master.connect(ctx.destination);
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this.impulse(3.2);
    const wet = ctx.createGain(); wet.gain.value = 0.55; this.reverb.connect(wet).connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.32; this.music.connect(this.master); this.music.connect(this.reverb);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.6; this.sfx.connect(this.master); this.sfx.connect(this.reverb);
    const noise = this.noiseBuffer();
    // River
    const rs = ctx.createBufferSource(); rs.buffer = noise; rs.loop = true;
    this.riverFilter = ctx.createBiquadFilter(); this.riverFilter.type = 'bandpass'; this.riverFilter.frequency.value = 700; this.riverFilter.Q.value = 0.6;
    this.riverGain = ctx.createGain(); this.riverGain.gain.value = 0;
    rs.connect(this.riverFilter).connect(this.riverGain).connect(this.master); rs.start();
    // Wind
    const ws = ctx.createBufferSource(); ws.buffer = noise; ws.loop = true; ws.playbackRate.value = 0.5;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 220;
    lfo.connect(lg).connect(wf.frequency); lfo.start();
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.05;
    ws.connect(wf).connect(this.windGain).connect(this.master); ws.start();
    this.nextNote = ctx.currentTime + 0.5;
  }

  private noiseBuffer() {
    const ctx = this.ctx!;
    const b = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3; }
    return b;
  }
  private impulse(sec: number) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    return b;
  }

  setMuted(m: boolean) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; }
  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    try { localStorage.setItem('downriver-volume', String(this.volume)); } catch { /* private mode */ }
    if (this.volume > 0 && this.muted) this.muted = false;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  /** Called each frame with how close the river is (0 far .. 1 standing in it). */
  update(riverNear: number, flow: number, wind: number) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    this.riverGain.gain.setTargetAtTime(riverNear * (0.08 + flow * 0.22), t, 0.3);
    this.riverFilter.frequency.setTargetAtTime(500 + flow * 700, t, 0.5);
    // (in the Sky Isles the wind rises and falls in long slow gusts, and blows harder at speed)
    const gusts = this.sky.on ? 0.035 + 0.05 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.21) * Math.sin(t * 0.077 + 1.3), 1.5) + this.sky.flap * 0.06 : 0;
    this.windGain.gain.setTargetAtTime(0.03 + wind * 0.1 + gusts, t, 0.8);
    this.ambient(t);
    // Music scheduler: slow, sparse, fuller as the world heals.
    while (this.nextNote < t + 0.3) {
      this.scheduleBeat(this.nextNote);
      this.nextNote += 60 / (this.sky.on && this.sky.race ? 104 : 66) / 2;
    }
  }

  private scheduleBeat(when: number) {
    const s = this.step++;
    const scale = SCALES[this.voice], root = ROOT[this.voice];
    const density = 0.18 + this.health * 0.45;
    const r = (n: number) => { const x = Math.sin((s + 1) * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
    if (r(1) < density) {
      const deg = Math.floor(r(2) * scale.length);
      this.note(root + scale[deg], when, this.voice, 0.5 + r(3) * 0.3);
    }
    if (s % 16 === 0) this.note(root - 12 + scale[s % 32 === 0 ? 0 : 4 % scale.length], when, this.voice === 'bells' ? 'strings' : this.voice, 0.35, 5.5);
    if (this.health > 0.6 && r(4) < 0.25) this.note(root + 12 + scale[Math.floor(r(5) * scale.length)], when + 0.12, this.voice, 0.25);
    if (this.sky.on) {
      // the Sky Isles: an airy flute floating over the piano and strings, and now and then a high chime
      const pent = [0, 2, 4, 7, 9, 12, 14];
      if (r(6) < (this.sky.race ? 0.32 : 0.2)) this.flute(74 + pent[Math.floor(r(7) * pent.length)], when + 0.05, 0.4 + r(8) * 0.2, this.sky.race ? 0.6 : 1.4);
      if (r(9) < 0.07) this.note(86 + pent[Math.floor(r(10) * 5)], when + 0.2, 'bells', 0.18);
      if (this.sky.race && s % 2 === 0) this.note(48 + (s % 8 < 4 ? 0 : 5), when, 'marimba', 0.45);
    }
  }

  /** A breathy flute note: a sine with a little vibrato and a puff of air at the start. */
  private flute(m: number, when: number, vel: number, dur: number) {
    const ctx = this.ctx!, f = midi(m);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2; const g2 = ctx.createGain(); g2.gain.value = 0.12;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2; const vg = ctx.createGain(); vg.gain.value = f * 0.005;
    vib.connect(vg).connect(o.frequency);
    const g = ctx.createGain(); g.connect(this.music);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel * 0.14, when + 0.12); g.gain.setValueAtTime(vel * 0.12, when + dur * 0.6); g.gain.linearRampToValueAtTime(0, when + dur);
    o.connect(g); o2.connect(g2).connect(g);
    const src = ctx.createBufferSource(); src.buffer = this.noise();
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = f * 2; bf.Q.value = 2;
    const bg = ctx.createGain(); bg.gain.setValueAtTime(vel * 0.05, when); bg.gain.exponentialRampToValueAtTime(0.0001, when + 0.15);
    src.connect(bf).connect(bg).connect(this.music);
    for (const x of [o, o2, vib]) { x.start(when); x.stop(when + dur + 0.1); }
    src.start(when); src.stop(when + 0.2);
  }

  /** A crowd cheering: many voices (vowel-filtered noise and rising whoops) and clapping, `k` 0..1 loud. */
  cheer(k = 1, secs = 2.6) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    for (const [fq, q] of [[700, 3], [1100, 4], [2400, 5]] as const) {
      const src = ctx.createBufferSource(); src.buffer = this.noise();
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09 * k, t + 0.25); g.gain.setValueAtTime(0.08 * k, t + secs * 0.6); g.gain.linearRampToValueAtTime(0, t + secs);
      src.connect(f).connect(g).connect(this.sfx); src.start(t); src.stop(t + secs + 0.1);
    }
    for (let i = 0; i < 9; i++) {
      const w = t + Math.random() * secs * 0.6, o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = 'sawtooth'; const b = 260 + Math.random() * 300;
      o.frequency.setValueAtTime(b, w); o.frequency.exponentialRampToValueAtTime(b * (1.5 + Math.random() * 0.5), w + 0.35); o.frequency.exponentialRampToValueAtTime(b * 1.2, w + 0.6);
      lp.type = 'bandpass'; lp.frequency.value = 1200; lp.Q.value = 1.5;
      g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(0.025 * k, w + 0.05); g.gain.linearRampToValueAtTime(0, w + 0.6);
      o.connect(lp).connect(g).connect(this.sfx); o.start(w); o.stop(w + 0.65);
    }
    for (let i = 0; i < 40; i++) {
      const w = t + Math.random() * secs, src = ctx.createBufferSource(); src.buffer = this.noise();
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500 + Math.random() * 1500; f.Q.value = 1;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.06 * k * Math.random(), w); g.gain.exponentialRampToValueAtTime(0.0001, w + 0.04);
      src.connect(f).connect(g).connect(this.sfx); src.start(w); src.stop(w + 0.06);
    }
  }

  /** The sky whale's song: low, slow, gliding calls deep under everything. */
  whaleSong() {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    const calls: [number, number, number, number][] = [[0, 2.6, 92, 128], [2.2, 3.2, 120, 74], [5.0, 2.4, 82, 110]];
    for (const [at, dur, f0, f1] of calls) {
      const w = t + at, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = 'triangle'; o2.type = 'sine';
      o.frequency.setValueAtTime(f0, w); o.frequency.exponentialRampToValueAtTime(f1, w + dur * 0.7); o.frequency.exponentialRampToValueAtTime(f1 * 0.92, w + dur);
      o2.frequency.setValueAtTime(f0 * 2.01, w); o2.frequency.exponentialRampToValueAtTime(f1 * 2.01, w + dur * 0.7);
      const vib = ctx.createOscillator(); vib.frequency.value = 3.5; const vg = ctx.createGain(); vg.gain.value = 3; vib.connect(vg).connect(o.frequency);
      lp.type = 'lowpass'; lp.frequency.value = 600;
      const g2 = ctx.createGain(); g2.gain.value = 0.3;
      g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(0.22, w + dur * 0.35); g.gain.linearRampToValueAtTime(0, w + dur);
      o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(this.sfx);
      for (const x of [o, o2, vib]) { x.start(w); x.stop(w + dur + 0.1); }
    }
  }

  /** Hush the music (for a held breath before a big moment), or bring it back. */
  hush(on: boolean, secs = 0.8) { if (this.ctx) this.music.gain.setTargetAtTime(on ? 0.0 : 0.32, this.ctx.currentTime, secs / 3); }

  /** Play one note now (or after `delay` s); safe before the sound has started. */
  tone(m: number, delay = 0, voice: Voice = 'bells', vel = 0.5, len?: number) { if (this.ctx) this.note(m, this.ctx.currentTime + delay, voice, vel, len); }

  note(m: number, when: number, voice: Voice, vel = 0.5, len?: number) {
    const ctx = this.ctx!; const f = midi(m);
    const g = ctx.createGain(); g.connect(this.music);
    const o = ctx.createOscillator();
    let dur = len ?? 1.6;
    switch (voice) {
      case 'bells': {
        o.type = 'sine'; o.frequency.value = f;
        const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.76;
        const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2).connect(g);
        o2.start(when); o2.stop(when + 3);
        dur = len ?? 2.8;
        g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel * 0.25, when + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        break;
      }
      case 'marimba':
        o.type = 'sine'; o.frequency.value = f; dur = 0.9;
        g.gain.setValueAtTime(vel * 0.35, when); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        break;
      case 'pluck': case 'lyre':
        o.type = 'triangle'; o.frequency.value = f; dur = voice === 'lyre' ? 2.2 : 1.1;
        g.gain.setValueAtTime(vel * 0.3, when); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        break;
      case 'woodwind': {
        o.type = 'triangle'; o.frequency.value = f;
        const vib = ctx.createOscillator(); vib.frequency.value = 5; const vg = ctx.createGain(); vg.gain.value = f * 0.006;
        vib.connect(vg).connect(o.frequency); vib.start(when); vib.stop(when + dur + 0.1);
        g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel * 0.16, when + 0.25); g.gain.linearRampToValueAtTime(0, when + dur);
        break;
      }
      case 'strings': {
        o.type = 'sawtooth'; o.frequency.value = f;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        o.disconnect(); o.connect(lp).connect(g);
        g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel * 0.06, when + dur * 0.4); g.gain.linearRampToValueAtTime(0, when + dur);
        o.start(when); o.stop(when + dur + 0.1);
        return;
      }
    }
    o.connect(g); o.start(when); o.stop(when + dur + 0.1);
  }

  private ambient(t: number) {
    const ctx = this.ctx!;
    const a = this.amb;
    if (this.melodyQ.length && this.melodyQ[0].at <= t + 0.2) { const n = this.melodyQ.shift()!; this.note(n.m, Math.max(t, n.at), 'lyre', 0.55); }
    // kite cloth snapping and fluttering in the wind while gliding
    if (this.sky.flap > 0.05 && t > this.flapT) {
      this.flapT = t + 0.05 + Math.random() * 0.09;
      const src = ctx.createBufferSource(); src.buffer = this.noise();
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380 + Math.random() * 500; f.Q.value = 1.4;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06 * this.sky.flap * (0.4 + Math.random() * 0.6), t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      src.connect(f).connect(g).connect(this.sfx); src.start(t); src.stop(t + 0.09);
    }
    if (t < this.ambT) return;
    this.ambT = t + 0.25;
    // birdsong by day: short falling and rising sine chirps
    if (a.day > 0.5 && a.birds > 0 && Math.random() < 0.12 * a.birds) {
      const base = 2400 + Math.random() * 1800; const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = 'sine';
        const w = t + i * 0.09;
        o.frequency.setValueAtTime(base * (1 + (Math.random() - 0.5) * 0.2), w); o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.6), w + 0.07);
        g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(0.012, w + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, w + 0.08);
        o.connect(g).connect(this.sfx); o.start(w); o.stop(w + 0.1);
      }
    }
    // (no crickets at night: Oscar found them annoying)
    // the campfire crackles
    if (a.fire > 0.05 && t > this.fireT) {
      this.fireT = t + 0.05 + Math.random() * 0.25;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer();
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.05 * a.fire * Math.random(), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      src.connect(f).connect(g).connect(this.sfx); src.start(t); src.stop(t + 0.06);
    }
    // wind chimes
    if (a.chimes > 0.05 && t > this.chimeT) {
      this.chimeT = t + 0.6 + Math.random() * 1.8;
      this.note(93 + [0, 3, 5, 7, 10][Math.floor(Math.random() * 5)], t, 'bells', 0.25 * a.chimes);
    }
  }

  /** A soft, wordless voice blip for a spoken line (one per few letters). */
  voiceBlip(pitch: number) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); const g = ctx.createGain(); const f = ctx.createBiquadFilter();
    o.type = 'triangle';
    const base = 190 * pitch * (1 + (Math.random() - 0.5) * 0.25);
    o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * (0.9 + Math.random() * 0.25), t + 0.08);
    f.type = 'bandpass'; f.frequency.value = 900 * pitch; f.Q.value = 1.2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(f).connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.12);
  }

  /**
   * The music opening up under a big view. Stage 0: a soft string chord swells in, then turns (D, then G over B).
   * Stage 1: a slow bell figure on top, for the moment the home light shows.
   */
  swell(stage: 0 | 1) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    if (stage === 0) {
      [38, 50, 57, 62, 66].forEach((m, i) => this.note(m, t + i * 0.4, 'strings', i === 0 ? 1.4 : 1.1, 7.5));
      [43, 55, 59, 62, 67, 71].forEach((m, i) => this.note(m, t + 5.2 + i * 0.25, 'strings', i === 0 ? 1.3 : 1.0, 8));
    } else {
      [74, 78, 81, 86, 83, 81].forEach((m, i) => this.note(m, t + i * 0.55, 'bells', 0.42 - i * 0.03));
      this.note(90, t + 3.6, 'bells', 0.22);
    }
  }

  /** A short composed melody (the farewell theme). */
  melody(notes: number[], beat = 0.42) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + 0.2;
    notes.forEach((m, i) => { if (m > 0) this.melodyQ.push({ at: t + i * beat, m }); });
  }

  /** Small sound effects. */
  sfxPlay(kind: 'step' | 'stepSnow' | 'stepGrass' | 'stepWood' | 'stepStone' | 'jump' | 'land' | 'splash' | 'chime' | 'gift' | 'paper' | 'power' | 'build' | 'whoosh' | 'soft' | 'whistle' | 'bleat' | 'bump' | 'rumble') {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    const burst = (dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'bandpass') => {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer();
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(this.sfx); src.start(t); src.stop(t + dur + 0.05);
    };
    switch (kind) {
      case 'step': burst(0.09, 900, 1, 0.08); break;
      case 'stepSnow': burst(0.14, 2400, 0.7, 0.07); break;
      case 'stepGrass': burst(0.12, 3200, 0.5, 0.05); break;
      case 'stepWood': burst(0.08, 420, 3, 0.16); break;
      case 'stepStone': burst(0.06, 1300, 2, 0.08); break;
      case 'bump': burst(0.25, 240, 1.5, 0.3, 'lowpass'); break;
      // a long, low, soft rumble (Old Amble's voice, and the ground under its first step)
      case 'rumble': burst(3.2, 110, 0.9, 0.42, 'lowpass'); this.note(38, t + 0.2, 'strings', 0.4, 3); break;
      case 'whistle': {
        const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = 'sine';
        o.frequency.setValueAtTime(1500, t); o.frequency.linearRampToValueAtTime(2300, t + 0.18); o.frequency.linearRampToValueAtTime(1900, t + 0.35); o.frequency.linearRampToValueAtTime(2500, t + 0.55);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.04); g.gain.setValueAtTime(0.06, t + 0.5); g.gain.linearRampToValueAtTime(0, t + 0.6);
        o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.65); break;
      }
      case 'bleat': {
        const o = ctx.createOscillator(); const g = ctx.createGain(); const vib = ctx.createOscillator(); const vg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = 420; vib.frequency.value = 22; vg.gain.value = 40; vib.connect(vg).connect(o.frequency);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.05); g.gain.linearRampToValueAtTime(0, t + 0.5);
        o.connect(lp).connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.55); vib.start(t); vib.stop(t + 0.55); break;
      }
      case 'jump': burst(0.18, 600, 0.6, 0.05, 'lowpass'); break;
      case 'land': burst(0.2, 300, 0.7, 0.14, 'lowpass'); break;
      case 'splash': burst(0.6, 1400, 0.4, 0.12); break;
      case 'whoosh': burst(2.5, 500, 0.3, 0.2, 'lowpass'); break;
      case 'paper': burst(0.35, 3000, 0.5, 0.06); break;
      case 'soft': this.note(81, t, 'bells', 0.25); break;
      case 'chime': [0, 4, 7].forEach((n, i) => this.note(86 + n, t + i * 0.09, 'bells', 0.35)); break;
      case 'gift': [0, 4, 7, 12].forEach((n, i) => this.note(74 + n, t + i * 0.12, 'bells', 0.5)); break;
      case 'power': [0, 7, 12, 16, 19].forEach((n, i) => this.note(62 + n, t + i * 0.16, 'bells', 0.6)); break;
      case 'build': burst(0.25, 200, 1, 0.2, 'lowpass'); this.note(67, t + 0.1, 'marimba', 0.5); break;
    }
  }
}
