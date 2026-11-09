// The long night by Hollo's fire, and Hollo waking: the payoff of World 1.
// You take part instead of watching: sit down, the villagers come in from the dark, keep the fire going
// with logs from the pile (each log, one memory), then play the singing stones' tune with everyone humming.
// The last note, a held breath, and Hollo wakes: a thaw runs across the valley, the river surges down to the
// edge, the valley answers, and Hollo stands and hums. Nothing here can fail or block the story.
import * as THREE from 'three';
import type { Game } from '../game';
import type { ChapterOne } from './chapterOne';
import type { Beat } from './sequencer';
import type { CamPose } from '../systems/skyView';
import type { Npc } from '../systems/npc';
import { PK } from '../world/peaks';
import { orientTo } from '../world/sphere';
import { clamp, lerp, smoothstep } from '../world/noise';
import { THAW } from '../render/paint';
import { CAMPFIRE, WINTER_LINES, NIGHT_WORDS, WAKE_LINES } from '../data/story';
import { passWinter, isHealed } from '../systems/snowpack';
import { NOTE } from '../data/words';

/** The rising shot's swing round the fire, and the downstream river shot [lat, lon from the river, height]. */
const RISE_SWING = -0.3;
const RIVER_CAM = [44, 1.5, 7];

const ORDER = ['ysolde', 'bram', 'nima', 'tor', 'odo'];
const NOTES = [62, 66, 69, 74];
const TUNE = [0, 2, 1, 3];
type Phase = 'off' | 'arrive' | 'gather' | 'logs' | 'winter' | 'sing' | 'wake';
type Prompt = { label: string; act: () => void; key: string };

export class LongNight {
  phase: Phase = 'off';
  /** A prompt shown as is (no E), drawn over whatever else the frame asked for. */
  rawPrompt: string | null = null;
  autopilot = false;
  private t = 0;
  private walkers: { n: Npc; from: THREE.Vector3; seat: THREE.Object3D; t: number; started: boolean; done: boolean }[] = [];
  private level = 1;
  private logsIn = 0;
  private carrying = false;
  private lowTold = -1;
  private lineT = 0;
  private played = 0;
  private autoT = 0;
  private camOn = false;
  private pile = new THREE.Group();
  private glowLog!: THREE.Mesh;
  private carried!: THREE.Mesh;
  private rings: { m: THREE.Mesh; t: number }[] = [];

  constructor(private g: Game, private ch: ChapterOne) {
    const bark = new THREE.MeshToonMaterial({ color: '#6a4a32' }), cut = new THREE.MeshToonMaterial({ color: '#d8b884' });
    const log = (m: THREE.Material) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.95, 8), [m, cut, cut]); l.rotation.z = Math.PI / 2; return l; };
    for (let i = 0; i < 6; i++) { const l = log(bark); l.position.set((i % 3 - 1) * 0.3, 0.14 + Math.floor(i / 3) * 0.24, (Math.floor(i / 3)) * 0.05); this.pile.add(l); }
    this.glowLog = log(new THREE.MeshToonMaterial({ color: '#8a5a32', emissive: '#ffb050', emissiveIntensity: 0 }));
    this.glowLog.position.set(0, 0.62, 0.05); this.pile.add(this.glowLog);
    this.carried = log(bark); this.carried.visible = false;
    this.pile.visible = false;
    g.scene.add(this.pile, this.carried);
  }

  get active() { return this.phase !== 'off'; }
  private get R() { return this.ch.R; }
  private get fire() { return (this.R.holloFire as THREE.Object3D).position.clone(); }
  private get seats() { return (this.R.holloFire as THREE.Object3D).userData.seats as THREE.Object3D[]; }
  private up(at: THREE.Vector3) { return at.clone().sub(this.ch.p.center).normalize(); }

  /** Where a seat is and the way it faces (into the fire). */
  private seatPose(seat: THREE.Object3D) {
    const at = seat.getWorldPosition(new THREE.Vector3());
    const up = this.up(at);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(seat.getWorldQuaternion(new THREE.Quaternion())).projectOnPlane(up).normalize();
    return { at, up, fwd };
  }

  /** Fade to night by the fire; Nilo stands by the stools, the others wait out in the dark. */
  start() {
    const g = this.g, ch = this.ch, pl = g.player, fire = this.fire, hollo = ch.hollo.root.position.clone();
    const up = this.up(fire);
    // the log pile, a few steps from the fire on the far side from Hollo
    const away = fire.clone().sub(hollo).projectOnPlane(up).normalize();
    const side = new THREE.Vector3().crossVectors(up, away).normalize();
    const pd = fire.clone().addScaledVector(away, 3.9).addScaledVector(side, 1.2).sub(ch.p.center).normalize();
    ch.p.surfacePoint(pd, -0.02, this.pile.position); orientTo(this.pile, pd, away);
    const beats: Beat[] = [{ dur: 0.8, tick: k => g.hud.setFade(smoothstep(0, 1, k), '#1a1830') }, {
      dur: 1.6,
      enter: () => {
        g.hud.setFade(1, '#1a1830', true);
        (this.R.holloFire as THREE.Object3D).visible = true;
        (this.R.holloFire as THREE.Object3D).userData.level = this.level = 1;
        this.pile.visible = true;
        const d = fire.clone().addScaledVector(away, 3).addScaledVector(side, -1.4).sub(ch.p.center).normalize();
        pl.placeAt(ch.p, d);
        pl.facing.copy(fire.clone().sub(pl.pos).projectOnPlane(pl.up).normalize());
        g.rig.faceDir(pl.up, pl.facing); g.rig.snap();
        g.day.frozen = true; g.day.setLocal(pl.up, -0.3, false);
        // everyone waits out in the dark, beyond the firelight
        this.walkers = ORDER.map((id, i) => {
          const n = ch.npc(id), seat = this.seats[i + 1], s = this.seatPose(seat);
          const from = s.at.clone().addScaledVector(s.fwd, -13).addScaledVector(new THREE.Vector3().crossVectors(s.up, s.fwd), (i - 2) * 1.5);
          const fd = from.clone().sub(ch.p.center).normalize(); ch.p.surfacePoint(fd, -0.05, from);
          n.place(from, fd, fire.clone().sub(from)); n.pose = {}; n.lookAt = null;
          n.root.visible = false;
          return { n, from, seat, t: 0, started: false, done: false };
        });
        ch.peopleAway = true;
        g.cutCam = ch.fireCam(fire, hollo, 6, 2.6, -0.5);
      },
      tick: k => g.hud.setFade(1 - smoothstep(0.3, 1, k), '#1a1830'),
    }];
    this.phase = 'arrive'; this.t = 0; this.logsIn = 0; this.carrying = false; this.played = 0; this.lowTold = -1;
    g.cut(beats, () => { g.hud.notify(NIGHT_WORDS.sit); });
  }

  /** The prompt for E while the night is on (replaces the usual one), or null to leave it alone. */
  prompt(): Prompt | null {
    if (!this.active) return null;
    const g = this.g, pl = g.player;
    if (this.phase === 'arrive' && !g.sitting) {
      const near = this.seats.map(s => ({ s, d: s.getWorldPosition(new THREE.Vector3()).distanceTo(pl.pos) })).filter(x => x.d < 2).sort((a, b) => a.d - b.d)[0];
      if (near) return { key: 'night-sit', label: NIGHT_WORDS.sitPrompt, act: () => g.sit(near.s) };
      return { key: 'night', label: '', act: () => {} };
    }
    if (this.phase === 'logs' && !g.sitting) {
      if (!this.carrying && this.level < 0.45 && this.pile.position.distanceTo(pl.pos) < 2.3) return { key: 'night-log', label: NIGHT_WORDS.takeLog, act: () => this.takeLog() };
      if (this.carrying && this.fire.distanceTo(pl.pos) < 3.2) return { key: 'night-feed', label: NIGHT_WORDS.feed, act: () => this.feed() };
      return { key: 'night', label: '', act: () => {} };
    }
    if (this.phase === 'sing') return { key: 'night', label: '', act: () => {} };
    return null;
  }

  private takeLog() { this.carrying = true; this.g.sound.sfxPlay('stepWood'); }

  private feed() {
    const g = this.g, ch = this.ch;
    this.carrying = false;
    this.level = 1.3;
    g.sound.sfxPlay('build');
    const i = this.logsIn++;
    const line = CAMPFIRE[i], n = ch.npc(ORDER[i]);
    g.hud.showCaption(line.who, line.text);
    n.smileT = 3; n.pose = { sit: 1, talking: true };
    this.lineT = 5.5;
    // sparks go up
    this.ring(this.fire, 3, '#ffc070', 1.2);
  }

  /** A ring of light running out over the ground. */
  private ring(at: THREE.Vector3, to: number, color: string, dur = 2.2) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const up = this.up(at);
    m.position.copy(at).addScaledVector(up, 0.25);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
    m.userData = { to, dur };
    this.g.scene.add(m);
    this.rings.push({ m, t: 0 });
  }

  update(dt: number) {
    if (!this.active) return;
    const g = this.g, ch = this.ch, pl = g.player, inp = g.input;
    this.t += dt;
    // rings
    for (const r of this.rings) {
      r.t += dt; const k = r.t / r.m.userData.dur;
      r.m.scale.setScalar(1 + k * r.m.userData.to);
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
    }
    for (const r of this.rings.filter(r => r.t >= r.m.userData.dur)) { g.scene.remove(r.m); r.m.geometry.dispose(); (r.m.material as THREE.Material).dispose(); }
    this.rings = this.rings.filter(r => r.t < r.m.userData.dur);
    if (this.phase === 'wake') return;

    // seated by the fire: a wide, slow shot across the flames toward Hollo, so you see everyone at once
    const seated = !!g.sitting && this.seats.includes(g.sitting) && g.mode === 'play';
    if (seated && this.phase !== 'arrive') { g.cutCam = ch.fireCam(this.fire, ch.hollo.root.position, 6.5, 3.2, -0.35 + Math.sin(this.t * 0.05) * 0.25); this.camOn = true; }
    else if (this.camOn && g.mode === 'play') { this.camOn = false; g.cutCam = null; g.rig.override = null; g.rig.easeFromHere(0.8); }
    // Fold floats over the fire like a paper lantern
    if (this.phase !== 'arrive') {
      const up = this.up(this.fire);
      g.fold.root.position.copy(this.fire).addScaledVector(up, 3 + Math.sin(this.t * 1.3) * 0.25);
    }
    // the fire
    const hf = this.R.holloFire as THREE.Object3D;
    if (this.phase === 'logs') this.level = Math.max(0.2, this.level - dt * (this.lineT > 0 ? 0.03 : 0.085));
    hf.userData.level = lerp(hf.userData.level as number, Math.min(1.3, this.level), 1 - Math.exp(-4 * dt));
    const low = this.phase === 'logs' && this.level < 0.45 && this.logsIn < 5;
    (this.glowLog.material as THREE.MeshToonMaterial[])[0].emissiveIntensity = low && !this.carrying ? 0.6 + Math.sin(this.t * 4) * 0.4 : 0;
    this.glowLog.visible = !this.carrying;
    this.carried.visible = this.carrying;
    if (this.carrying) {
      this.carried.position.copy(pl.pos).addScaledVector(pl.up, 0.95).addScaledVector(pl.facing, 0.42);
      orientTo(this.carried, pl.up, pl.facing); this.carried.rotateZ(Math.PI / 2);
    }
    if (low && this.lowTold !== this.logsIn) { this.lowTold = this.logsIn; g.hud.notify(this.logsIn === 0 ? NIGHT_WORDS.firstLow : NIGHT_WORDS.low); }

    if (this.phase === 'arrive' && g.sitting && this.seats.includes(g.sitting)) { this.phase = 'gather'; this.t = 0; }
    if (this.phase === 'arrive' && this.autopilot && this.t > 1 && g.mode === 'play' && !g.sitting) g.sit(this.seats[0]);
    if (this.phase === 'gather') this.updateWalkers(dt);

    if (this.lineT > 0) {
      this.lineT -= dt;
      if (this.lineT <= 0) {
        g.hud.showCaption(null, null);
        ch.npc(ORDER[this.logsIn - 1]).pose = { sit: 1 };
        if (this.logsIn >= 5) this.winter();
      }
    }
    if (this.phase === 'logs' && this.autopilot && low) {
      this.autoT += dt;
      if (this.autoT > 1.2 && !this.carrying) this.takeLog();
      if (this.autoT > 2.4 && this.carrying) { this.autoT = 0; this.feed(); }
    }

    if (this.phase === 'sing') {
      this.rawPrompt = NIGHT_WORDS.singPrompt(TUNE.map(i => i + 1), this.played);
      let key = -1;
      for (let i = 0; i < 4; i++) if (inp.hit('Digit' + (i + 1)) || inp.hit('Numpad' + (i + 1))) key = i;
      if (this.autopilot) { this.autoT += dt; if (this.autoT > 1.1) { this.autoT = 0; key = TUNE[this.played]; } }
      if (key >= 0) this.note(key);
    }
  }

  private updateWalkers(dt: number) {
    const g = this.g, ch = this.ch, p = ch.p, fire = this.fire;
    this.walkers.forEach((w, i) => {
      if (w.done) return;
      if (!w.started && this.t > 0.6 + i * 1.5) { w.started = true; w.n.root.visible = true; }
      if (!w.started) return;
      const s = this.seatPose(w.seat);
      const goal = s.at.clone().addScaledVector(s.fwd, 0.08);
      const cur = w.n.root.position.clone();
      // ground distance only: the stool top and the walking height differ a little
      const gap = cur.clone().sub(p.center).normalize().angleTo(goal.clone().sub(p.center).normalize()) * p.R;
      if (gap < 0.3) {
        w.done = true;
        w.n.place(goal, s.up, s.fwd); w.n.pose = { sit: 1 }; w.n.speedShown = 0; w.n.faceOverride = null;
        w.n.lookAt = fire.clone().addScaledVector(s.up, 0.8);
        g.sound.sfxPlay('stepWood');
        return;
      }
      const cd = cur.clone().sub(p.center).normalize(), gd = goal.clone().sub(p.center).normalize();
      const ang = cd.angleTo(gd), step = Math.min(1, (2.3 * dt / p.R) / Math.max(ang, 1e-6));
      const nd = cd.clone().lerp(gd, step).normalize();
      w.n.up.copy(nd);
      p.surfacePoint(nd, -0.05, w.n.root.position);
      w.n.speedShown = 2.3; w.n.faceOverride = nd.clone().sub(cd).multiplyScalar(1e3);
    });
    if (this.walkers.every(w => w.done)) { this.phase = 'logs'; this.level = 0.9; g.hud.notify(NIGHT_WORDS.allHere); }
  }

  /** The snow comes in the night: two lines and a short wide shot, then the stones begin to hum. */
  private winter() {
    const g = this.g, ch = this.ch, pl = g.player, fire = this.fire, hollo = ch.hollo.root.position.clone();
    this.phase = 'winter';
    let before = 0, lastStep = -1;
    const setWinter = (w: number) => { g.winter = w; g.grass.snow = w; const st = Math.round(w * 4); if (st !== lastStep) { lastStep = st; g.applySnow(); } };
    const beats: Beat[] = [{
      line: { text: WINTER_LINES[0] }, dur: 6.5,
      enter: () => { g.day.frozen = false; before = g.snow.snowpack; },
      tick: (k, dt) => { setWinter(smoothstep(0, 0.7, k)); g.day.t = (g.day.t + dt * 0.18 * g.seq.speed) % 1; g.cutCam = ch.fireCam(fire, hollo, 8 + k * 10, 4 + k * 18, 0.4 - k * 0.3); },
    }, {
      line: { text: WINTER_LINES[1] }, dur: 5.5,
      tick: (k, dt) => { g.day.t = (g.day.t + dt * 0.12 * g.seq.speed) % 1; g.cutCam = ch.fireCam(fire, hollo, 18 - k * 10, 22 - k * 16, 0.1 - k * 0.3); },
      exit: () => {
        passWinter(g.snow);
        if (g.snow.snowpack > before + 0.01) ch.placeNewStone(g.snow.snowpack);
        g.day.setLocal(pl.up, -0.2); g.day.frozen = true;
        ch.lanterns.flash = [1.5, 1.5, 1.5, 1.5];
      },
    }];
    g.cut(beats, () => {
      this.phase = 'sing'; this.played = 0; this.autoT = 0;
      if (!g.sitting) g.sit(this.seats[0]);
      g.hud.notify(NIGHT_WORDS.sing);
      g.sound.melody(TUNE.map(i => NOTES[i] - 12), 0.8);
    });
  }

  private note(i: number) {
    const g = this.g, ch = this.ch;
    ch.lanterns.flash[i] = 1.4;
    if (TUNE[this.played] === i) {
      g.sound.tone(NOTES[i], 0, 'bells', 0.6);
      g.sound.tone(NOTES[i] - 24, 0.05, 'strings', 0.35, 2.5); // everyone hums along
      this.ring(ch.lanterns.stones[i].position.clone(), 26, '#fff2c0', 2.6);
      for (const id of ORDER) ch.npc(id).smileT = 1.5;
      this.played++;
      if (this.played === 4) { this.phase = 'wake'; this.rawPrompt = null; g.hud.setPrompt(null); setTimeout(() => g.cut(this.wakeBeats()), 600); }
    } else {
      g.sound.tone(NOTES[i] - 12, 0, 'bells', 0.2);
      if (this.played > 0) g.hud.notify(NIGHT_WORDS.again);
      this.played = 0;
    }
  }

  // ------------------------------------------------------------------ Hollo wakes
  wakeBeats(): Beat[] {
    const g = this.g, ch = this.ch, pl = g.player, h = ch.hollo, p = ch.p, R = this.R;
    const fire = this.fire, holloAt = h.root.position.clone();
    const spring = ch.at(PK.spring), bridge = ch.at(PK.bridge);
    const sUp = this.up(spring);
    const valleyUp = p.dirRiver(45, -6);
    const highShot = (k: number): CamPose => {
      // high above the upper valley, looking down the river toward the village and the bridge
      const at = p.surfacePoint(p.dirRiver(10 + k * 6, -10 - k * 4), 30 + k * 26);
      const look = p.surfacePoint(p.dirRiver(48 + k * 6, -4), 0);
      return { pos: at, look, up: this.up(at) };
    };
    const face = () => h.head.getWorldPosition(new THREE.Vector3());
    const all = () => ORDER.map(id => ch.npc(id));
    // dawn: the clock runs from night to a warm sunrise over the thaw
    const t0 = g.day.t; g.day.setLocal(pl.up, 0.16); const t1 = g.day.t; g.day.t = t0;
    const dayAt = (k: number) => { let d = t1 - t0; if (d < 0) d += 1; g.day.t = (t0 + d * k) % 1; };
    const surgeLen = p.riverLength, atBridge = p.alongAt(this.up(bridge));
    let flared = false;
    const breath = h.breath.material as THREE.PointsMaterial;
    const theme = [74, 76, 78, 81, 78, 76, 74, 69, 71, 74, 76, 74];
    const beats: Beat[] = [];
    // 1. the last note, then everything goes quiet but the fire
    beats.push({
      dur: 2.2,
      enter: () => { g.sound.hush(true); g.cutCam = ch.fireCam(fire, holloAt, 4.5, 1.6, -0.3); all().forEach(n => (n.lookAt = face())); pl.lookAt = face(); },
    });
    // 2. his eyes open: close and low beside the fire, frost breath turning to warm mist
    beats.push({
      dur: 3.2,
      enter: () => { g.sound.tone(50, 0, 'strings', 0.5, 6); },
      tick: k => {
        const f = face(), up = this.up(f);
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(h.root.quaternion).projectOnPlane(up).normalize();
        const side = new THREE.Vector3().crossVectors(up, fwd);
        g.cutCam = { pos: f.clone().addScaledVector(fwd, 3.4 - k * 0.6).addScaledVector(up, 0.4).addScaledVector(side, 1.3), look: f, up };
        h.eyeOpen = smoothstep(0.35, 0.7, k);
        breath.color.set('#ffffff').lerp(new THREE.Color('#ffd8b0'), smoothstep(0.5, 1, k));
      },
    });
    // 3. the thaw: a wave from the spring across the whole valley, dawn breaking with it; one long high shot
    beats.push({
      line: { text: WAKE_LINES[0] }, dur: 8,
      enter: () => {
        g.sound.hush(false, 2);
        // strings swell from the first note of the thaw
        [50, 57, 62, 66].forEach((m, i) => g.sound.tone(m, i * 0.9, 'strings', 0.45, 7));
        p.prepareThaw(g.snowline(g.snow.snowpack), g.snow.snowpack);
        THAW.uThawC.value.copy(spring); THAW.uThawR.value = 0; THAW.uThawOn.value = 1;
        g.grass.bloom = 0.3; g.grass.lush = 1;
        (R.spring.userData.water as THREE.Mesh).material = ch.springMat;
        g.sound.sfxPlay('splash');
      },
      tick: k => {
        THAW.uThawR.value = smoothstep(0, 1, k) * p.R * 2.1;
        dayAt(smoothstep(0, 1, k));
        // the camera rises slowly from the fire to the high shot
        const a = ch.fireCam(fire, holloAt, 6, 2.2, -0.2), b = highShot(0);
        const e = smoothstep(0, 0.55, k);
        g.cutCam = { pos: a.pos.clone().lerp(b.pos, e), look: a.look.clone().lerp(b.look, e), up: a.up.clone().lerp(b.up, e).normalize() };
      },
    });
    // 4. the river surges from the spring down to the edge; the bridge lanterns flare as it passes
    beats.push({
      dur: 6,
      enter: () => {
        g.give('peaks-healed');
        p.surgeTo(Math.max(p.flowWidth, 1.25));
        g.sound.sfxPlay('whoosh');
      },
      tick: k => {
        p.waterMat.uniforms.uSurge.value = smoothstep(0, 1, k) * (surgeLen + 10);
        g.cutCam = highShot(smoothstep(0, 1, k));
        if (!flared && p.waterMat.uniforms.uSurge.value > atBridge) {
          flared = true;
          g.sound.sfxPlay('chime');
          [62, 69, 74, 78].forEach((m, i) => g.sound.tone(m, i * 0.12, 'strings', 0.5, 5)); // the peak
          ch.bridgeFlare = 2.5;
        }
      },
      exit: () => { p.waterMat.uniforms.uSurge.value = 1e6; THAW.uThawOn.value = 0; g.winter = 0; g.grass.snow = 0; g.applyRiver(); },
    });
    // 5. the valley answers: short cuts
    const goats = (R.goats as { obj: THREE.Object3D }[]) ?? [];
    const reactions: { at: () => THREE.Vector3; r: number; h: number; a: number; act?: (k: number) => void; cam?: (k: number) => CamPose }[] = [
      { at: () => goats[0]?.obj.position.clone() ?? ch.at(PK.pen), r: 6, h: 2.5, a: 0.6, act: k => goats.slice(0, 4).forEach((gt, i) => { const up = this.up(gt.obj.position); gt.obj.position.addScaledVector(up, Math.max(0, Math.sin((k * 2 + i * 0.3) * Math.PI)) * 0.06); }) },
      { at: () => ch.at(PK.ridge), r: 14, h: 6, a: 2.2 },
      { at: () => ch.at(PK.windmill), r: 11, h: 4, a: 1.1 },
      { at: () => fire, r: 6, h: 2.4, a: 0.9, cam: (k: number) => ch.fireCam(fire, holloAt, 6.5 - k, 2.8, -0.2 + k * 0.3), act: () => all().forEach(n => { n.pose = { wave: 1 }; n.smileT = 2; }) },
      { at: () => ch.npc('odo').root.position.clone(), r: 3.6, h: 1.8, a: 2.6, act: () => { ch.npc('odo').pose = { wave: 1 }; } },
      { at: () => this.fire, r: 5, h: 3.2, a: 1.7, act: k => { const up = this.up(this.fire); g.fold.root.position.copy(this.fire).addScaledVector(up, 2.6 + Math.sin(k * Math.PI) * 1.2); if (k < 0.05) g.fold.hop(); } },
    ];
    reactions.forEach((rc, i) => beats.push({
      dur: 1.5,
      enter: () => { if (i === 3) { all().forEach(n => (n.pose = { wave: 1 })); g.sound.sfxPlay('gift'); } if (i === 2) (R.mill as THREE.Object3D).userData.fast = 5; },
      tick: k => { const c = rc.at(); g.cutCam = rc.cam ? rc.cam(k) : ch.orbit(c, rc.r, rc.h, rc.a + k * 0.25); rc.act?.(k); },
    }));
    // 6. Hollo rises and hums; every stone answers. Seen across the fire, past the people, so his face shows
    const riseLook = (k: number) => fire.clone().lerp(holloAt, 0.62).addScaledVector(this.up(fire), 3 + k * 2.5);
    beats.push({
      line: { text: WAKE_LINES[1] }, dur: 4,
      enter: () => { all().forEach(n => (n.pose = {})); },
      tick: k => {
        h.rise = smoothstep(0, 0.55, k);
        if (k > 0.5 && !h.root.userData.hummed) {
          h.root.userData.hummed = true;
          g.sound.tone(38, 0, 'strings', 0.7, 6); g.sound.tone(45, 0.1, 'strings', 0.5, 6);
          NOTES.forEach((m, j) => g.sound.tone(m, 0.6 + j * 0.05, 'bells', 0.4, 4)); // the stones in harmony
          ch.lanterns.flash = [2.5, 2.5, 2.5, 2.5];
          ch.lanterns.stones.forEach(s => this.ring(s.position.clone(), 14, '#ffe8b0', 2.4));
        }
        const c = ch.fireCam(fire, holloAt, 9 + k * 1.5, 2.8 + k * 1.6, RISE_SWING + k * 0.08);
        g.cutCam = { ...c, look: riseLook(k) };
        const f = face(); all().forEach(n => (n.lookAt = f)); pl.lookAt = f;
      },
    });
    // 7. he lets go: his coat comes apart into soft cloud puffs that swirl round the fire and the people, drift out
    // over the river and settle as a ring of clouds above the peaks; his own cloud keeps his eyes a moment, and winks
    const cloud = ch.holloCloud, sky = ch.skyShot();
    const fUp = this.up(fire);
    const above = (v: THREE.Vector3, min: number) => { // keep the camera clear of the ground
      const d = v.clone().sub(p.center).normalize(), floor = p.surfacePoint(d, min);
      return floor.distanceTo(p.center) > v.distanceTo(p.center) ? floor : v;
    };
    const mix = (a: CamPose, b: CamPose, w: number): CamPose => ({ pos: a.pos.clone().lerp(b.pos, w), look: a.look.clone().lerp(b.look, w), up: a.up });
    let winked = false;
    // close on his own cloud for the wink, from the side of the valley shot, so the pull back to it is one straight glide
    const close = (): CamPose => {
      const big = cloud.homeCloud(), bu = this.up(big), to = sky.pos.clone().sub(big).normalize();
      return { pos: big.clone().addScaledVector(to, 24).addScaledVector(bu, -1), look: big.clone().addScaledVector(bu, 1.2), up: bu };
    };
    // looking back up the river from downstream, low over the water, as the puffs come out over it
    const riverDown = p.surfacePoint(p.dirRiver(30, 0), 0);
    const riverCam = (k: number): CamPose => {
      const pos = p.surfacePoint(p.dirRiver(RIVER_CAM[0] + k * 3, RIVER_CAM[1]), RIVER_CAM[2] + k * 6);
      return { pos, look: pos, up: this.up(pos) };
    };
    beats.push({
      line: { text: WAKE_LINES[2] }, dur: 12.5,
      enter: () => {
        cloud.begin();
        g.sound.melody(theme, 0.5); g.sound.tone(50, 0, 'strings', 0.4, 9); g.sound.tone(57, 0.2, 'strings', 0.35, 9);
        g.sound.sfxPlay('whoosh');
      },
      tick: k => {
        cloud.set(k);
        if (k > 0.79 && !winked) { winked = true; g.sound.tone(81, 0, 'bells', 0.3, 2); g.sound.tone(86, 0.25, 'bells', 0.2, 2); }
        const follow = cloud.centroid();
        // across the fire as he loosens and the puffs swirl over the people; pulling back and up as they climb;
        // then from downstream over the river as they drift out above it; then up to his own cloud for the wink
        const a0 = ch.fireCam(fire, holloAt, 10.5 + k * 22, 4.4 + k * 16, RISE_SWING + 0.08 + k * 0.3);
        const A: CamPose = { pos: a0.pos, look: riseLook(1).lerp(follow, smoothstep(0, 0.22, k)), up: fUp };
        const rc = riverCam(smoothstep(0.3, 0.62, k));
        const B: CamPose = { pos: rc.pos, look: follow.clone().lerp(riverDown, 0.3), up: rc.up };
        let cam = mix(A, B, smoothstep(0.3, 0.46, k));
        cam = mix(cam, close(), smoothstep(0.56, 0.72, k));
        cam.pos = above(cam.pos, 2.2);
        cam.up = this.up(cam.pos);
        g.cutCam = cam;
        cloud.eyesFace(cam.pos);
        all().forEach(n => (n.lookAt = follow)); pl.lookAt = follow;
      },
      exit: () => cloud.set(1),
    });
    // 8. a last wide look: the ring of clouds above the healed valley, the sun coming up warm behind it
    beats.push({
      line: { text: WAKE_LINES[3] }, dur: 5,
      tick: k => {
        const cam = mix(close(), sky, smoothstep(0, 0.8, k));
        cam.pos = above(cam.pos, 2.2); cam.up = this.up(cam.pos);
        g.cutCam = cam;
      },
    });
    beats.push({
      dur: 0.6,
      exit: () => this.end(),
    });
    void sUp; void valleyUp; void clamp;
    return beats;
  }

  /** Back to play on the healed valley. */
  private end() {
    const g = this.g, ch = this.ch, pl = g.player;
    this.phase = 'off';
    this.pile.visible = false; this.carried.visible = false;
    (ch.hollo.breath.material as THREE.PointsMaterial).color.set('#ffffff');
    g.give('peaks-healed'); g.give('journal:hollo'); g.give('item:frost');
    if (ch.has('built-fence')) g.give('journal:fences');
    void isHealed;
    g.day.frozen = false; g.day.setLocal(pl.up, 0.35);
    pl.pose = {}; pl.lookAt = null; g.sitting = null;
    for (const n of ch.c.npcs) { ch.sendHome(n); n.root.visible = true; }
    ch.peopleAway = false;
    ch.holloAwake();
    g.applyRiver();
    g.hud.notify(NOTE.allLit);
    g.save();
  }
}

