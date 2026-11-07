// The second and third lanterns of world 1.
//  - The singing stones: four old stones beside Hollo. Listen to each, then play Hollo's sleepy tune back on them.
//  - Carry the fire: Odo shows Nilo that Fold can fold itself into a paper lantern. Nilo lights it at the village fire
//    and carries the ember up to the fire ring beside Hollo, keeping it out of the wind.
import * as THREE from 'three';
import type { Game } from '../game';
import type { Planet } from '../world/planet';
import type { WorldContent } from '../world/content';
import type { Beat } from './sequencer';
import { PK } from '../world/peaks';
import * as Q from '../world/props2';
import { toon } from '../world/props';
import { safeSpot } from '../world/spots';
import { GOAL, NOTE, PROMPT } from '../data/words';
import { orientTo } from '../world/sphere';

const NOTES = [62, 66, 69, 74];
/** The order Hollo hums them in. */
const TUNE = [0, 2, 1, 3];
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export class LanternTasks {
  stones: THREE.Object3D[] = [];
  private glows: THREE.MeshBasicMaterial[] = [];
  private flash: number[] = [0, 0, 0, 0];
  private played = 0;
  private humT = -1;
  /** 0..1: how much fire is left in the lantern. */
  heat = 1;
  private lantern: THREE.Group;
  private flame: THREE.Mesh;
  private lowWarned = false;
  private t = 0;
  /** Called when the ember reaches Hollo, so the chapter can start the long night. */
  onDelivered: () => void = () => {};

  constructor(private g: Game, private p: Planet, private c: WorldContent) {
    const R = c.refs;
    const hollo = (R.hollo as { root: THREE.Object3D }).root.position;
    const up = hollo.clone().sub(p.center).normalize();
    const wake = p.surfacePoint(p.dirRiver(PK.wake[0], PK.wake[1]));
    const toWake = wake.clone().sub(hollo).projectOnPlane(up).normalize();
    const side = new THREE.Vector3().crossVectors(up, toWake).normalize();
    // an arc of four stones round the far side of Hollo, away from where Nilo wakes
    [-1.9, -2.5, 2.5, 1.9].forEach((a, i) => {
      const dir = toWake.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
      const w = hollo.clone().addScaledVector(dir, 7.5);
      const d = safeSpot(p, w.sub(p.center).normalize(), c.avoid, 5);
      const st = Q.echoStone();
      st.scale.setScalar(0.85 + i * 0.07);
      p.surfacePoint(d, -0.2, st.position);
      orientTo(st, d, hollo.clone().sub(st.position));
      this.g.scene.add(st);
      p.solids.push({ obj: st, shape: { kind: 'circle', r: 0.5 }, h: 2.2, id: 'singing' + i });
      this.stones.push(st);
      this.glows.push(st.userData.glow as THREE.MeshBasicMaterial);
    });
    // Fold as a paper lantern, held in Nilo's hand while the ember is carried
    this.lantern = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.2, 6), toon('#f4e8cc', '#ffb860', 0.5));
    paper.position.y = -0.16; this.lantern.add(paper);
    const lid = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.08, 6), toon('#efe0c0')); lid.position.y = -0.03; this.lantern.add(lid);
    this.flame = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffcf70', transparent: true, opacity: 0.95 }));
    this.flame.position.y = -0.16; this.flame.userData.noOutline = true; this.lantern.add(this.flame);
    this.lantern.visible = false;
    g.player.person.arms[1].hand.add(this.lantern);
    this.register();
  }

  has(f: string) { return this.g.flags.has(f); }

  register() {
    const g = this.g, add = (it: WorldContent['interactables'][number]) => this.c.interactables.push(it);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.stones.forEach((st, i) => add({
      id: 'singing' + i, world: 0, pos: st.position.clone(), radius: 3,
      get hold() { return self.has('stone-heard:' + i) ? undefined : 1.4; },
      label: () => {
        if (!this.has('kite-flown') || this.has('stones-done')) return null;
        if (!this.has('stone-heard:' + i)) return PROMPT.stoneListen;
        return this.allHeard() ? PROMPT.stonePlay : null;
      },
      act: () => this.touchStone(i),
    }));
    const hollo = (this.c.refs.hollo as { root: THREE.Object3D }).root;
    add({
      id: 'hollo-hum', world: 0, get pos() { return hollo.position; }, radius: 8,
      label: () => (this.allHeard() && !this.has('stones-done') && this.humT < 0 ? PROMPT.holloHum : null),
      act: () => this.hum(),
    });
    add({
      id: 'light-lantern', world: 0, pos: (this.c.refs.fire as THREE.Object3D).position.clone(), radius: 4.5,
      label: () => (this.has('quest:ember') && !this.has('ember-carry') && !this.has('ember-delivered') ? PROMPT.lightLantern : null),
      act: () => this.lightEmber(),
    });
    add({
      id: 'set-ember', world: 0, pos: (this.c.refs.holloFire as THREE.Object3D).position.clone(), radius: 4.5,
      label: () => (this.has('ember-carry') && !this.has('ember-delivered') ? PROMPT.setEmber : null),
      act: () => this.deliver(),
    });
    void g;
  }

  allHeard() { return [0, 1, 2, 3].every(i => this.has('stone-heard:' + i)); }

  touchStone(i: number) {
    const g = this.g;
    if (!this.has('stone-heard:' + i)) {
      g.give('stone-heard:' + i);
      g.sound.melody([NOTES[i]], 0.6);
      this.flash[i] = 1.6;
      const n = [0, 1, 2, 3].filter(k => this.has('stone-heard:' + k)).length;
      g.hud.notify(NOTE.stoneHeard(n));
      if (n === 4) setTimeout(() => this.hum(), 1600);
      g.save();
      return;
    }
    if (!this.allHeard() || this.humT >= 0) return;
    g.sound.melody([NOTES[i]], 0.5);
    this.flash[i] = 1;
    if (TUNE[this.played] === i) {
      this.played++;
      if (this.played === 4) this.solved();
    } else {
      this.played = 0;
      g.sound.sfxPlay('bump');
      g.hud.notify(NOTE.stoneWrong);
    }
  }

  /** Hollo hums the four notes in his sleep, and the stones glow along with him. */
  hum() {
    if (this.humT >= 0) return;
    this.humT = 0; this.played = 0;
    this.g.sound.melody(TUNE.map(i => NOTES[i] - 12), 0.7);
    this.g.hud.notify(NOTE.holloHums);
  }

  solved() {
    const g = this.g;
    g.give('stones-done'); g.give('journal:stones'); g.give('ember-open');
    g.sound.melody([62, 66, 69, 74, 78], 0.3);
    this.flash = [2.5, 2.5, 2.5, 2.5];
    setTimeout(() => { g.sound.sfxPlay('chime'); g.hud.notify(NOTE.lantern2); g.save(); }, 1500);
    g.save();
  }

  // ------------------------------------------------------------------ Odo and Fold
  /** Right after Odo asks for the ember: Fold creases and opens into a little paper lantern. */
  foldScene() {
    const g = this.g, pl = g.player, fold = g.fold;
    if (this.has('fold:shown')) return;
    g.flags.add('fold:shown');
    const at = fold.root.position.clone(), up = at.clone().sub(this.p.center).normalize();
    const side = new THREE.Vector3().crossVectors(up, pl.facing).normalize();
    g.cut([
      { dur: 2.4, enter: () => { g.cutCam = { pos: at.clone().addScaledVector(side, 2.2).addScaledVector(pl.facing, 1.2).addScaledVector(up, 1.0), look: at.clone().addScaledVector(up, 0.3), up }; fold.hop(); g.sound.sfxPlay('paper'); },
        tick: k => fold.root.scale.setScalar(1 + Math.sin(k * Math.PI * 2) * 0.3), exit: () => fold.root.scale.setScalar(1) },
      { line: { text: 'Fold turns, creases, and opens into a little paper lantern. It looks very pleased with itself.' }, enter: () => fold.hop() },
    ], () => { g.save(); });
  }

  lightEmber() {
    const g = this.g;
    g.give('ember-carry');
    this.heat = 1; this.lowWarned = false;
    g.sound.sfxPlay('chime'); g.fold.hop();
    g.hud.notify(NOTE.emberLit);
    g.save();
  }

  deliver() {
    const g = this.g, fire = this.c.refs.holloFire as THREE.Object3D;
    g.flags.delete('ember-carry');
    g.give('ember-delivered'); g.give('ember-lit'); g.give('journal:ember');
    fire.visible = true;
    g.sound.melody([62, 69, 74, 78, 81], 0.35);
    g.hud.notify(NOTE.lantern3);
    this.onDelivered();
    g.save();
  }

  /** The wind right here: gusts come and go, high ground is windier, walls, rocks and trees shelter you. */
  exposure(pos: THREE.Vector3): { gust: number; open: number } {
    const p = this.p, t = this.t;
    const gust = clamp(0.35 + 0.65 * Math.max(0, Math.sin(t * 0.55) * Math.sin(t * 0.21 + 1.3)) * 1.6);
    let shelter = 0;
    for (const s of p.solids) { const d = s.obj.position.distanceTo(pos); if (d < 4.5) shelter = Math.max(shelter, 1 - d / 4.5); }
    const d = pos.clone().sub(p.center).normalize();
    const high = clamp(p.height(d) / p.cfg.amplitude * 1.4);
    return { gust, open: clamp((0.5 + high * 0.6) * (1 - shelter * 0.9)) };
  }

  update(dt: number) {
    const g = this.g, pl = g.player;
    this.t += dt;
    // stones glow: dim before you listen, steady once heard, bright when they sing
    if (this.humT >= 0) {
      this.humT += dt;
      const k = Math.floor(this.humT / 0.7);
      if (k < 4 && this.humT % 0.7 < 0.05) this.flash[TUNE[k]] = Math.max(this.flash[TUNE[k]], 0.9);
      if (this.humT > 3.2) this.humT = -1;
    }
    this.glows.forEach((m, i) => {
      this.flash[i] = Math.max(0, this.flash[i] - dt);
      const base = this.has('stones-done') ? 0.75 : this.has('stone-heard:' + i) ? 0.45 : 0.15 + 0.08 * Math.sin(this.t * 1.5 + i);
      m.opacity = clamp(base + this.flash[i] * 0.6);
    });
    // the ember
    const carrying = this.has('ember-carry') && !this.has('ember-delivered');
    this.lantern.visible = carrying && g.mode !== 'raft';
    g.fold.root.visible = !carrying || g.mode === 'cut';
    if (!carrying) return;
    if (g.mode !== 'play') return;
    const { gust, open } = this.exposure(pl.pos);
    const running = pl.running && pl.vel.length() > 6;
    const drain = 0.012 + gust * open * 0.07 + (running ? 0.07 : 0);
    const shelter = open < 0.2;
    this.heat = clamp(this.heat - drain * dt + (shelter ? 0.05 * dt : 0));
    const f = 0.6 + this.heat * 0.6 + Math.sin(this.t * 23) * 0.08 * (1 + gust * open * 2);
    this.flame.scale.set(f, f * (1.2 + gust * open * 0.4), f);
    (this.flame.material as THREE.MeshBasicMaterial).color.set(this.heat > 0.35 ? '#ffcf70' : '#ff8a50');
    if (this.heat < 0.35 && !this.lowWarned) { this.lowWarned = true; g.hud.notify(NOTE.emberLow); }
    if (this.heat > 0.6) this.lowWarned = false;
    if (this.heat <= 0) {
      g.flags.delete('ember-carry');
      g.sound.sfxPlay('soft');
      g.hud.notify(NOTE.emberOut);
      g.save();
    }
  }

  /** The flame meter for the goal line. */
  meter(): string {
    if (!this.has('ember-carry') || this.has('ember-delivered')) return '';
    const n = Math.ceil(this.heat * 5);
    return `Ember  ${'●'.repeat(n)}${'○'.repeat(5 - n)}`;
  }

  guide(): THREE.Vector3 | null {
    if (!this.has('kite-flown')) return null;
    if (!this.has('stones-done')) {
      const i = [0, 1, 2, 3].find(k => !this.has('stone-heard:' + k));
      return i !== undefined ? this.stones[i].position.clone() : (this.c.refs.hollo as { root: THREE.Object3D }).root.position.clone();
    }
    if (!this.has('ember-delivered')) {
      if (!this.has('quest:ember')) return null; // Odo: the chapter points at him
      return this.has('ember-carry') ? (this.c.refs.holloFire as THREE.Object3D).position.clone() : (this.c.refs.fire as THREE.Object3D).position.clone();
    }
    return null;
  }
}
void GOAL;
