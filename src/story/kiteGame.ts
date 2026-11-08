// Flying Grandpa's kite on Kite Ridge: a short game, not a cutscene.
// A and D lean the kite, holding E lets out line. Gusts come in as pale ribbons from one side;
// lean into a gust as it reaches the kite and the kite jumps. Three gusts and it is at the top of its line.
// Nothing can go wrong: a wrong lean only makes the kite dip, and if it touches the grass it bounces back up.
import * as THREE from 'three';
import type { Game } from '../game';
import { orientTo } from '../world/sphere';
import { clamp, lerp, smoothstep } from '../world/noise';
import { KITE_GAME } from '../data/story';

interface Gust { side: number; t: number; dur: number; judged: boolean; ribbons: THREE.Mesh[] }

const GUST_DUR = 2.6;
/** When a gust's ribbon reaches the kite, as a fraction of its sweep, and how wide the window is. */
const HIT_AT = 0.5, HIT_WIN = 0.17;

export class KiteGame {
  active = false;
  /** Gusts caught (0..3). */
  caught = 0;
  /** For filming and tests: lean and let out line by itself. */
  autopilot = false;
  private onDone: (() => void) | null = null;
  private line = 2.5;
  private elev = 0.75;
  private lean = 0;
  private dip = 0;
  private jump = 0;
  private gust: Gust | null = null;
  private nextGust = 3.5;
  private sayT = 0;
  private said = new Set<string>();
  private wonT = -1;
  private ribbonMat = new THREE.MeshBasicMaterial({ color: '#fffaf0', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false });
  private group = new THREE.Group();
  private base = new THREE.Vector3();
  private up = new THREE.Vector3();
  private down = new THREE.Vector3();
  private side = new THREE.Vector3();
  kitePos = new THREE.Vector3();

  constructor(private g: Game, private kite: THREE.Group, private string: THREE.Line) {
    g.scene.add(this.group);
  }

  /** Begin on the ridge: Nilo holds the string, the wind blows from behind him. */
  start(downwind: THREE.Vector3, onDone: () => void) {
    const g = this.g, pl = g.player;
    this.active = true; this.onDone = onDone;
    this.caught = 0; this.line = 2.5; this.elev = 0.75; this.lean = 0; this.dip = 0; this.jump = 0;
    this.gust = null; this.nextGust = 3.5; this.said.clear(); this.wonT = -1;
    this.up.copy(pl.up);
    this.down.copy(downwind).projectOnPlane(this.up).normalize();
    this.side.crossVectors(this.down, this.up).normalize();
    pl.facing.copy(this.down);
    this.kite.visible = true; this.string.visible = true;
    g.hud.setPrompt('<b>A D</b> lean into the wind &nbsp; <b>Hold E</b> let out line');
    this.say('start');
    this.place(0);
  }

  private say(id: keyof typeof KITE_GAME) {
    if (this.said.has(id)) return;
    this.said.add(id);
    this.g.hud.showCaption('Tor', KITE_GAME[id]);
    this.sayT = 3.6;
  }

  private ribbon(): THREE.Mesh {
    // a long ribbon of wind, a little wavy, like the wind lines in the opening pictures
    const geo = new THREE.PlaneGeometry(9, 0.28, 32, 1);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) * (1 - Math.abs(x) / 3.6) + Math.sin(x * 1.3) * 0.22); }
    const m = new THREE.Mesh(geo, this.ribbonMat.clone());
    m.renderOrder = 5;
    this.group.add(m);
    return m;
  }

  private spawnGust() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const ribbons = [this.ribbon(), this.ribbon(), this.ribbon()];
    this.gust = { side, t: 0, dur: GUST_DUR, judged: false, ribbons };
    this.g.sound.sfxPlay('whoosh');
    if (this.caught === 0) this.say(side < 0 ? 'firstLeft' : 'firstRight');
  }

  private clearGust() {
    if (!this.gust) return;
    for (const r of this.gust.ribbons) { this.group.remove(r); r.geometry.dispose(); (r.material as THREE.Material).dispose(); }
    this.gust = null;
  }

  update(dt: number) {
    if (!this.active) return;
    const g = this.g, inp = g.input, pl = g.player;
    let leanIn = inp.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    let pay = inp.key('KeyE');
    if (this.autopilot) {
      const gu = this.gust;
      leanIn = gu && Math.abs(gu.t / gu.dur - HIT_AT) < HIT_WIN * 0.8 ? gu.side : 0;
      pay = this.line < this.maxLine() - 0.2 && !!gu;
    }
    this.lean = lerp(this.lean, leanIn, 1 - Math.exp(-8 * dt));

    // the gusts
    this.nextGust -= dt;
    if (!this.gust && this.nextGust <= 0 && this.wonT < 0) this.spawnGust();
    const gu = this.gust;
    let lift = 0;
    if (gu) {
      gu.t += dt;
      const k = gu.t / gu.dur;
      lift = smoothstep(HIT_AT - HIT_WIN * 2, HIT_AT, k) * smoothstep(HIT_AT + HIT_WIN * 3, HIT_AT, k);
      if (!gu.judged && Math.abs(k - HIT_AT) < HIT_WIN && Math.abs(leanIn) > 0.5) {
        gu.judged = true;
        if (Math.sign(leanIn) === gu.side) this.catch();
        else { this.dip = 1; g.sound.sfxPlay('soft'); this.say('wrongWay'); }
      }
      if (!gu.judged && k > HIT_AT + HIT_WIN) { gu.judged = true; this.say('missed'); }
      // ribbons sweep across the sky from their side, through the kite
      gu.ribbons.forEach((r, i) => {
        const along = (k - HIT_AT) * 26 * -gu.side;
        r.position.copy(this.kitePos).addScaledVector(this.side, along + i * 1.6 * gu.side)
          .addScaledVector(this.up, (i - 1) * 0.9 + Math.sin(g.time * 3 + i) * 0.2)
          .addScaledVector(this.down, (i - 1) * 0.8);
        r.lookAt(g.camera.position);
        (r.material as THREE.MeshBasicMaterial).opacity = smoothstep(0, 0.15, k) * smoothstep(1, 0.8, k) * 0.9;
      });
      if (k >= 1) { this.clearGust(); this.nextGust = 1.6 + Math.random() * 1.6; }
    }

    // line and height: line goes out only while held; still air while paying out makes the kite sag
    if (pay) this.line = Math.min(this.maxLine(), this.line + dt * 2.4);
    else this.line = Math.max(2.5, this.line - dt * 0.35);
    if (pay && lift < 0.1 && this.jump < 0.1) { this.dip = Math.max(this.dip, 0.35); if (this.line > 4) this.say('stillAir'); }
    this.dip = Math.max(0, this.dip - dt * 0.8);
    this.jump = Math.max(0, this.jump - dt * 0.9);
    const goal = 0.78 + lift * 0.18 + this.jump * 0.35 - this.dip * 0.55;
    this.elev = lerp(this.elev, goal, 1 - Math.exp(-2.5 * dt));
    this.place(dt);
    // touching the grass: a little bounce, never a crash
    if (this.kiteAlt() < 0.6) { this.elev += 0.25; this.dip = 0; g.sound.sfxPlay('bump'); this.say('bounce'); }

    // Nilo holds on, leans with the kite, looks up at it
    pl.lookAt = this.kitePos.clone();
    pl.pose = {};
    pl.facing.copy(this.down).addScaledVector(this.side, this.lean * 0.4).normalize();
    pl.animate(dt, 0, false); pl.sync();
    this.camera();

    this.sayT -= dt;
    if (this.sayT <= 0 && this.sayT > -1) { g.hud.showCaption(null, null); this.sayT = -1; }
    if (this.wonT >= 0) {
      this.wonT += dt;
      if (this.wonT > 3.2) this.finish();
    }
  }

  private maxLine() { return 4 + this.caught * 3.4; }
  private kiteAlt() { return this.kitePos.clone().sub(this.base).dot(this.up) + 1.2; }

  private catch() {
    const g = this.g;
    this.caught++;
    this.jump = 1; this.dip = 0;
    // the string sings: one note higher each time
    g.sound.tone(76 + [0, 4, 7][this.caught - 1], 0, 'bells', 0.5);
    g.sound.tone(88 + [0, 4, 7][this.caught - 1], 0.08, 'bells', 0.3);
    if (this.caught === 1) this.say('caught1');
    if (this.caught === 2) this.say('caught2');
    if (this.caught >= 3) {
      this.wonT = 0; this.line = this.maxLine();
      g.sound.sfxPlay('chime');
      this.say('top');
    }
  }

  private place(dt: number) {
    const g = this.g, pl = g.player;
    const hand = pl.person.arms[1].hand.getWorldPosition(new THREE.Vector3());
    this.base.copy(pl.pos);
    const L = this.line;
    const e = clamp(this.elev, 0.15, 1.25);
    const wob = Math.sin(g.time * 2.3) * 0.25 + Math.sin(g.time * 3.7) * 0.12;
    this.kitePos.copy(hand)
      .addScaledVector(this.down, Math.cos(e) * L)
      .addScaledVector(this.up, Math.sin(e) * L)
      .addScaledVector(this.side, (this.lean * 0.35 + wob * 0.15) * L);
    this.kite.position.copy(this.kitePos);
    orientTo(this.kite, this.down.clone().negate(), this.up);
    this.kite.rotation.z += wob * 0.4 + this.lean * 0.5;
    const a = this.string.geometry.attributes.position as THREE.BufferAttribute;
    a.setXYZ(0, hand.x, hand.y, hand.z); a.setXYZ(1, this.kitePos.x, this.kitePos.y, this.kitePos.z); a.needsUpdate = true;
    ((this.kite.userData.tail ?? []) as THREE.Object3D[]).forEach((t, i) => (t.rotation.x = Math.sin(g.time * 6 - i) * 0.4 + this.lean * 0.3));
    void dt;
  }

  /** Low behind Nilo, looking up past him at the kite. */
  private camera() {
    const pl = this.g.player;
    const pos = pl.pos.clone().addScaledVector(this.down, -5.2).addScaledVector(this.up, 1.5).addScaledVector(this.side, 1.8);
    const look = this.kitePos.clone().lerp(pl.pos.clone().addScaledVector(this.up, 1.2), 0.5);
    this.g.cutCam = { pos, look, up: this.up.clone() };
  }

  private finish() {
    const g = this.g;
    this.active = false;
    this.clearGust();
    this.kite.visible = false; this.string.visible = false;
    g.cutCam = null; g.rig.override = null; g.rig.easeFromHere(0.8);
    g.player.lookAt = null; g.player.pose = {};
    g.hud.setPrompt(null); g.hud.showCaption(null, null);
    const done = this.onDone; this.onDone = null;
    done?.();
  }
}
