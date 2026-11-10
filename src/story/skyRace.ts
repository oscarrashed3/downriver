// World 2, Phases 5 and 6: the qualifier (the Chime Garden's golden rings) and the Sky Race (one loop of the six
// islands through the rings on their poles). A Course is a line of gates threaded by a smooth flight path; the
// player's progress is measured along it; the other racers fly it on their own kite-wings.
import * as THREE from 'three';
import type { Game } from '../game';
import type { Beat } from './sequencer';
import type { SkyChapter } from './skyChapter';
import type { Npc } from '../systems/npc';
import { RINGS, isleDef } from '../world/skyIsles/layout';
import { KiteWing, type WingPattern } from '../world/skyIsles/kiteWing';
import { makeWindfolk, type Windfolk } from '../world/skyIsles/windfolk';
import { SKY_RACE_WORDS as W } from '../data/skyStory';
import { clamp, lerp, smoothstep } from '../world/noise';
import { orientTo } from '../world/sphere';
import { onIsle } from '../world/skyIsles/terrain';
import { safeSpot } from '../world/spots';
import { showGlideCard } from './skyParts';

const sm = (k: number) => k * k * (3 - 2 * k);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export interface Gate { center: THREE.Vector3; normal: THREE.Vector3; radius: number; obj: THREE.Object3D | null; note: number }

/** The festival song the rings play, one note a ring (MIDI). */
export const RING_SONG = [72, 76, 79, 77, 79, 84];
const RACE_NOTES = [67, 69, 72, 74, 76, 79, 81, 84];

/** A flight path through gates: points every metre, each with its distance along, and the gates' distances. */
export class Course {
  pts: THREE.Vector3[] = [];
  s: number[] = [];
  gateS: number[] = [];
  length = 0;
  constructor(readonly center: THREE.Vector3, readonly gates: Gate[], start: THREE.Vector3, extra: Map<number, THREE.Vector3[]> = new Map(), lead = 3) {
    // the control points: the start, then each gate centre (with a lead-in and lead-out along its normal)
    const ctrl: THREE.Vector3[] = [start.clone()];
    gates.forEach((g, i) => {
      for (const e of extra.get(i) ?? []) ctrl.push(e.clone());
      ctrl.push(g.center.clone().addScaledVector(g.normal, -lead), g.center.clone(), g.center.clone().addScaledVector(g.normal, lead));
    });
    // on a small round world: interpolate round the centre, so the path keeps its height between far gates
    const dense: THREE.Vector3[] = [];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const a = ctrl[i].clone().sub(center), b = ctrl[i + 1].clone().sub(center);
      const n = Math.max(1, Math.ceil(a.distanceTo(b) / 4));
      for (let k = 0; k < n; k++) {
        const t = k / n, ra = a.length(), rb = b.length();
        dense.push(a.clone().normalize().lerp(b.clone().normalize(), t).normalize().multiplyScalar(lerp(ra, rb, t)).add(center));
      }
    }
    dense.push(ctrl[ctrl.length - 1].clone());
    const curve = new THREE.CatmullRomCurve3(dense, false, 'centripetal');
    const L = curve.getLength(), N = Math.max(2, Math.ceil(L));
    let acc = 0;
    for (let i = 0; i <= N; i++) {
      const p = curve.getPointAt(i / N);
      if (i) acc += p.distanceTo(this.pts[i - 1]);
      this.pts.push(p); this.s.push(acc);
    }
    this.length = acc;
    let from = 0;
    for (const g of gates) { const i = this.nearest(g.center, from, this.pts.length); this.gateS.push(this.s[i]); from = i; }
  }
  nearest(p: THREE.Vector3, from = 0, to = this.pts.length) {
    let best = from, bd = Infinity;
    for (let i = Math.max(0, from); i < Math.min(this.pts.length, to); i++) { const d = this.pts[i].distanceToSquared(p); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  at(s: number, out = new THREE.Vector3()) {
    const i = clamp(Math.floor(s), 0, this.pts.length - 2), f = clamp(s - i, 0, 1);
    return out.copy(this.pts[i]).lerp(this.pts[i + 1], f);
  }
  dir(s: number, out = new THREE.Vector3()) {
    const i = clamp(Math.floor(s), 0, this.pts.length - 2);
    return out.copy(this.pts[Math.min(this.pts.length - 1, i + 2)]).sub(this.pts[Math.max(0, i - 1)]).normalize();
  }
}

/** Did the segment a -> b fly through the gate (crossing its plane inside the ring)? */
export function throughGate(g: Gate, a: THREE.Vector3, b: THREE.Vector3, slack = 1.2): boolean {
  const da = _v.copy(a).sub(g.center).dot(g.normal), db = _w.copy(b).sub(g.center).dot(g.normal);
  if (da * db > 0 || da === db) return false;
  const t = da / (da - db);
  const hit = a.clone().lerp(b, t);
  return hit.distanceTo(g.center) < g.radius * slack;
}

/** The gates of the race rings (from town.ts's refs.rings: RINGS order), in world space. */
export function gateOf(obj: THREE.Object3D, note: number): Gate {
  obj.updateWorldMatrix(true, false);
  const c = (obj.userData.center as THREE.Vector3 | undefined) ?? new THREE.Vector3(0, 8, 0);
  const center = obj.localToWorld(c.clone());
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(obj.matrixWorld).normalize();
  return { center, normal, radius: (obj.userData.radius as number | undefined) ?? 2.1, obj, note };
}

/** One of the other racers: a windfolk prone on a kite-wing, flying the course. */
class Racer {
  wing: KiteWing;
  s = 0;
  speed = 10;
  bank = 0;
  private lastPos = new THREE.Vector3();
  constructor(readonly person: Windfolk, pattern: WingPattern, readonly lane: number, private home: THREE.Object3D | null, private npc: Npc | null = null) {
    this.wing = new KiteWing({ pattern, span: 3.5 });
    this.wing.root.visible = false;
  }
  board(scene: THREE.Object3D) {
    if (this.person.root.parent !== this.wing.rider) {
      this.person.root.removeFromParent();
      if (!(this.wing as any).rigged) { (this.wing as any).rigged = true; this.wing.setRider(this.person as any); } else this.wing.rider.add(this.person.root);
    }
    scene.add(this.wing.root);
    this.wing.root.visible = true; this.wing.fold(0);
    // a villager's own pose runs after this each frame: ask it for the prone glide too
    if (this.npc) this.npc.pose = { glide: 1 } as Npc['pose'];
  }
  leave() {
    this.wing.root.visible = false;
    if (this.npc) this.npc.pose = {};
    if (this.home && this.person.root.parent !== this.home) { this.person.root.removeFromParent(); this.home.add(this.person.root); this.person.root.position.set(0, 0, 0); this.person.root.quaternion.identity(); }
  }
  fly(c: Course, dt: number, t: number) {
    this.s = Math.min(c.length, this.s + this.speed * dt);
    const p = c.at(this.s), d = c.dir(this.s), d2 = c.dir(this.s + 6);
    const up = p.clone().sub(c.center).normalize();
    const side = new THREE.Vector3().crossVectors(up, d).normalize();
    p.addScaledVector(side, this.lane * (1 - smoothstep(0, 1, Math.max(0, 1 - Math.min(...c.gateS.map(g => Math.abs(g - this.s))) / 10)))).addScaledVector(up, Math.sin(t * 1.3 + this.lane) * 0.25);
    const turn = new THREE.Vector3().crossVectors(d, d2).dot(up);
    this.bank = lerp(this.bank, clamp(-turn * 4, -0.5, 0.5), 1 - Math.exp(-4 * dt));
    this.wing.root.position.copy(p);
    orientTo(this.wing.root, up, d);
    this.wing.update(dt, t, { speed: Math.max(14, this.speed * 1.5), bank: this.bank, pitch: -0.05, dive: 0 });
    if (this.npc) (this.npc.pose as { bank?: number }).bank = this.bank;
    this.lastPos.copy(p);
  }
}

type RaceMode = 'qualifier' | 'race';

/** Both the qualifier and the race. */
export class SkyRace {
  mode: RaceMode | null = null;
  course: Course | null = null;
  passed: boolean[] = [];
  t = 0;
  progress = 0;
  private idx = 0;
  private prev = new THREE.Vector3();
  private racers: Racer[] = [];
  private wingRoot = new THREE.Group();
  private hudEl: HTMLDivElement;
  private lines: HTMLDivElement;
  private shortcut = false;
  private gust = false;
  private groundT = 0;
  private countdown = 0;
  /** Why the last flight ended (for playtests). */
  endWhy = '';
  private notes: number[] = [];
  /** Qualifier rings already flown (kept between tries, so a fall never costs the rings you had). */
  private qualKept: boolean[] | null = null;
  /** The ring to fly through next (in order), and the markers that show it. */
  next = 0;
  private mark: RingMarks;
  private turnBackT = 0;
  qualGates: Gate[] = [];
  raceGates: Gate[] = [];
  startQ: THREE.Vector3;
  startR: THREE.Vector3;
  /** The waterfall shortcut and the last gust, as spheres. */
  fallsAt: THREE.Vector3;
  gustAt: THREE.Vector3;
  tumble: Windfolk;

  constructor(private g: Game, private ch: SkyChapter) {
    const refs = ch.c.refs;
    const rings = (refs.rings ?? []) as THREE.Object3D[];
    ch.S.root.updateMatrixWorld(true);
    // qualifier: the five golden rings round the Chime Garden, in RINGS order
    RINGS.forEach((r, i) => { if (r.qualifier && rings[i]) this.qualGates.push(gateOf(rings[i], RING_SONG[this.qualGates.length % RING_SONG.length])); });
    // the race: out along the east side, round Whale's Rest, back along the west, and home through the gate
    const order: [string, number][] = [['sailtown', 72], ['mender', 99], ['whales', 165], ['whales', 150], ['chime', 111.8], ['windmill', 58], ['landing', 9]];
    order.forEach(([isle, lat], k) => { const i = RINGS.findIndex(r => r.isle === isle && r.lat === lat); if (rings[i]) this.raceGates.push(gateOf(rings[i], RACE_NOTES[k % RACE_NOTES.length])); });
    if (refs.raceGate) this.raceGates.push(gateOf(refs.raceGate as THREE.Object3D, 84));
    // the qualifier starts in the air a little before the first ring, level with it, lined up on the second
    {
      const g0 = this.qualGates[0], g1 = this.qualGates[1];
      const up0 = g0.center.clone().sub(ch.p.center).normalize();
      const along = g1 ? g1.center.clone().sub(g0.center).projectOnPlane(up0).normalize() : g0.normal.clone();
      this.startQ = g0 ? g0.center.clone().addScaledVector(along, -13).addScaledVector(up0, 0.3) : ch.at([96, 2], 14);
    }
    this.startR = ch.at([67.5, 12], 12);
    // the Chime Garden's west cascade, just over the lip; the last gust is placed on the course in begin()
    // (worked out from the isle itself: its middle's height, and the way its falls go over the edge)
    const isle = isleDef('chime'), fall = isle.falls![0];
    const mid = ch.at([isle.lat, isle.off]), mUp = mid.clone().sub(ch.p.center).normalize();
    const out = ch.at([fall.lat, fall.off]).sub(mid).projectOnPlane(mUp).normalize();
    const lipDir = mid.clone().addScaledVector(out, isle.r + 2).sub(ch.p.center).normalize();
    this.fallsAt = lipDir.multiplyScalar(mid.distanceTo(ch.p.center) - 3).add(ch.p.center);
    this.gustAt = ch.at([40, 8], 4);
    for (const gt of [...this.qualGates, ...this.raceGates]) gt.normal.multiplyScalar(1);
    // orient each gate's normal along the way it is flown
    this.orientAlong(this.qualGates, this.startQ);
    this.orientAlong(this.raceGates, this.startR);
    this.tumble = makeWindfolk('crowd', 23);
    ch.root.add(this.wingRoot);
    this.mark = new RingMarks(ch.root, ch.p.center);
    this.hudEl = document.createElement('div'); this.hudEl.className = 'racehud hidden';
    this.lines = document.createElement('div'); this.lines.className = 'speedlines hidden';
    document.getElementById('ui')?.append(this.lines, this.hudEl);
    addCss();
  }

  private orientAlong(gates: Gate[], start: THREE.Vector3) {
    let prev = start;
    gates.forEach((gt, i) => {
      const next = gates[i + 1]?.center ?? gt.center.clone().add(gt.center.clone().sub(prev));
      const along = next.clone().sub(prev).normalize();
      if (gt.normal.dot(along) < 0) gt.normal.negate();
      prev = gt.center;
    });
  }

  get active() { return this.mode !== null; }

  // ------------------------------------------------------------------ starting
  /** Zephy shows off through the qualifier rings first (once), then the run. */
  startQualifier() {
    const g = this.g;
    if (!this.has('sky:zephy-showed')) { g.cut(this.zephyShowOff(), () => { g.flags.add('sky:zephy-showed'); this.begin('qualifier'); }); return; }
    this.begin('qualifier');
  }
  startRace() { this.g.cut(this.raceStart(), () => this.begin('race')); }

  has(f: string) { return this.g.flags.has(f); }

  private begin(mode: RaceMode) {
    const g = this.g, pl = g.player;
    this.mode = mode;
    const gates = mode === 'qualifier' ? this.qualGates : this.raceGates;
    const start = mode === 'qualifier' ? this.startQ : this.startR;
    this.course = new Course(this.ch.p.center, gates, start, new Map(), mode === 'qualifier' ? 6 : 3);
    this.passed = mode === 'qualifier' && this.qualKept ? this.qualKept.slice() : gates.map(() => false);
    this.next = this.passed.findIndex(p => !p);
    if (this.next < 0) this.next = 0;
    this.turnBackT = 0;
    if (mode === 'race') this.gustAt = this.course.at(this.course.gateS[gates.length - 1] - 22);
    this.notes = [];
    this.t = 0; this.idx = 0; this.progress = 0; this.shortcut = false; this.gust = false; this.groundT = 0;
    this.countdown = mode === 'race' ? 3 : 0;
    // launch: a puff of the wind carries Nilo up to the start, wing open (a retry of the qualifier starts just
    // before the ring he still needs)
    let from = start, d = this.course.dir(2);
    if (mode === 'qualifier' && this.next > 0) {
      const s0 = Math.max(0, this.course.gateS[this.next] - 13);
      from = this.course.at(s0); d = this.course.dir(s0);
    }
    const up = from.clone().sub(this.ch.p.center).normalize();
    pl.pos.copy(from); pl.up.copy(up); pl.facing.copy(d.projectOnPlane(up).normalize());
    pl.vel.copy(pl.facing).multiplyScalar(11); pl.grounded = false; pl.forceOpen = true;
    if (pl.glider) { pl.glider.open = true; pl.glider.speed = 11; pl.glider.heading.copy(pl.facing); pl.glider.openT = 1; }
    g.rig.faceDir(up, pl.facing); g.rig.smoothUp.copy(up); g.rig.snap();
    this.prev.copy(pl.pos);
    g.skyMove!.extraLift = this.assist;
    if (mode === 'race') {
      const zephy = this.ch.npc('zephy'), lark = this.ch.npc('lark');
      this.racers = [
        new Racer(zephy.person as Windfolk, 'zephy', -1.8, zephy.root, zephy),
        new Racer(lark.person as Windfolk, 'lark', 1.8, lark.root, lark),
        new Racer(this.tumble, 'wren', 3.4, null),
      ];
      this.racers.forEach((r, i) => { r.board(this.wingRoot); r.s = 7 + i * 2.5; r.speed = 11; });
    }
    this.hudEl.classList.remove('hidden');
    this.mark.show(gates, mode === 'qualifier');
    g.sound.sfxPlay('whoosh');
    if (mode === 'qualifier') showGlideCard(W.qualCard, 9);
  }

  /** Keeps the wing near the course's height: the festival wind (the course's updrafts, everywhere along it). */
  private assist = (pos: THREE.Vector3) => {
    if (!this.course || this.mode === null) return 0;
    // the qualifier: the festival wind holds the wing level, so it only rises or sinks when you press up or down
    // (and it never lets you sink into the garden, or float off above the rings)
    if (this.mode === 'qualifier') {
      const pl = this.g.player, gl = pl.glider;
      if (!gl) return 0;
      const slow = clamp((10.5 - gl.speed) / (10.5 - 5.2), 0, 1);
      let k = (1.15 + 2.65 * slow) / 10;
      const ground = this.ch.p.groundBelow(pl.up, pos.distanceTo(this.ch.p.center)) - this.ch.p.R;
      const h = pos.distanceTo(this.ch.p.center) - this.ch.p.R;
      if (h - ground < 3.5) k += (3.5 - (h - ground)) * 0.12;
      const top = this.course.gates[this.next]?.center.distanceTo(this.ch.p.center) - this.ch.p.R;
      if (top && h > top + 9) k -= (h - top - 9) * 0.05;
      return k;
    }
    const c = this.course, i = c.nearest(pos, this.idx - 6, this.idx + 30);
    const want = c.pts[i].distanceTo(c.center), h = pos.distanceTo(c.center);
    return clamp((want - h) / 4.5, -0.25, 0.55);
  };

  end(win: boolean | null) {
    const g = this.g, pl = g.player;
    const mode = this.mode;
    this.mode = null;
    this.hudEl.classList.add('hidden'); this.lines.classList.add('hidden');
    this.mark.hide();
    if (g.skyMove) g.skyMove.extraLift = null;
    pl.forceOpen = false;
    for (const r of this.racers) r.leave();
    this.racers = [];
    for (const id of ['zephy', 'lark']) this.ch.sendHome(this.ch.npc(id));
    g.rig.override = null;
    if (mode === 'qualifier') {
      const n = this.passed.filter(Boolean).length;
      if (n === this.passed.length) {
        this.qualKept = null;
        RING_SONG.forEach((m, i) => g.sound.tone(m, 0.3 + i * 0.28, 'bells', 0.55));
        g.cut(this.ribbonBeats(n), () => g.save());
      } else { this.qualKept = this.passed.slice(); g.hud.notify(W.qualAgain(n, this.passed.length)); }
    } else if (mode === 'race' && win !== null) {
      if (win) g.cut(this.ch.finishBeats(), () => g.save());
      else g.cut(this.loseBeats());
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    const g = this.g, pl = g.player, c = this.course;
    if (!this.mode || !c) return;
    if (g.mode !== 'play') { this.prev.copy(pl.pos); return; }
    this.t += dt;
    if (this.countdown > 0) this.countdown -= dt;
    pl.forceOpen = true;
    // the festival wind along the course carries the wing: it never bleeds below a racing pace (dive for more)
    if (pl.glider?.open) pl.glider.speed = Math.max(pl.glider.speed, this.mode === 'race' ? 12 : 10.5);
    // progress along the course
    this.idx = c.nearest(pl.pos, this.idx - 8, this.idx + 40);
    this.progress = c.s[this.idx];
    const gates = c.gates;
    const qual = this.mode === 'qualifier';
    gates.forEach((gt, i) => {
      // the qualifier counts the rings in order only: the glowing one is the one that counts
      if (this.passed[i] || (qual && i !== this.next) || !throughGate(gt, this.prev, pl.pos, qual ? 1.35 : 1.2)) return;
      this.passed[i] = true;
      (gt.obj?.userData.chime as { ring?: (k?: number) => void } | undefined)?.ring?.(1);
      g.sound.tone(gt.note, 0, 'bells', 0.7);
      g.fold.hop();
      this.mark.flash(i);
      if (qual) g.hud.notify(W.ringGot(i + 1, gates.length));
    });
    const nx = this.passed.findIndex(p => !p);
    this.next = nx < 0 ? gates.length : nx;
    if (qual) {
      // flown past the glowing ring: it stays lit, turn back for it
      const gt = gates[this.next];
      if (gt && pl.glider) {
        const to = gt.center.clone().sub(pl.pos), dist = to.length();
        const behind = to.projectOnPlane(pl.up).normalize().dot(pl.glider.heading) < -0.2;
        this.turnBackT = behind && dist > 6 ? this.turnBackT + dt : 0;
        if (this.turnBackT > 0.8 && !this.notes.includes(this.next)) { this.notes.push(this.next); g.hud.notify(W.turnBack(this.next + 1)); }
        if (!behind) this.notes = this.notes.filter(n => n !== this.next);
      }
    } else {
      // a ring flown past without going through it costs its note
      gates.forEach((gt, i) => { if (!this.passed[i] && this.progress > c.gateS[i] + 6 && !this.notes.includes(i)) { this.notes.push(i); g.hud.notify(W.missed); } });
    }
    this.mark.update(dt, this.next, this.passed, g.camera, pl.pos);
    if (this.mode === 'race') this.updateRace(dt);
    if (!this.mode) return;
    // the end: through (or past) the last gate, or down on the ground for a while
    this.groundT = pl.grounded ? this.groundT + dt : 0;
    const last = gates.length - 1;
    if (qual ? this.passed.every(Boolean) : this.passed[last] || this.progress >= c.length - 1) { this.endWhy = `line ${this.passed[last]} ${this.progress.toFixed(0)}`; this.end(this.mode === 'race' ? this.winner() : null); return; }
    if (this.groundT > 2.5 || g.skyMove?.rescue) { this.endWhy = this.groundT > 2.5 ? 'ground' : 'rescue'; this.end(this.mode === 'race' ? false : null); return; }
    // the soft timer and the rings so far
    const n = this.passed.filter(Boolean).length;
    // the rings in order, the next one picked out (no clock: the qualifier is only to fly through all six)
    const dots = gates.map((_, i) => `<span class="${this.passed[i] ? 'rd done' : i === this.next ? 'rd next' : 'rd'}">${i + 1}</span>`).join('');
    this.hudEl.innerHTML = `<b>${this.mode === 'race' ? W.raceTitle : W.qualTitle}</b> ${dots}${this.mode === 'race' ? ` · ${this.place()}` : ` · ${W.ringNext(Math.min(this.next + 1, gates.length), gates.length)}`}`;
    void n;
    // speed lines, and the chase camera: low, behind, leaning a little into the turn
    const sp = (pl.glider?.speed ?? 0) + (pl.glider?.boost ?? 0);
    this.lines.classList.toggle('hidden', sp < 13);
    this.lines.style.opacity = String(clamp((sp - 13) / 8) * 0.7);
    if (pl.glider?.open) {
      const up = pl.up, f = pl.glider.heading;
      const roll = -(pl.glider.bank ?? 0) * 0.25;
      const camUp = up.clone().applyAxisAngle(f, roll);
      const look = pl.pos.clone().addScaledVector(f, 7).addScaledVector(up, 0.4);
      const want = pl.pos.clone().addScaledVector(f, -5.2).addScaledVector(up, 1.25);

      const o = g.rig.override;
      g.rig.override = { pos: this.aboveGround(o ? o.pos.clone().lerp(want, 1 - Math.exp(-6 * dt)) : want), look, up: o ? o.up.clone().lerp(camUp, 1 - Math.exp(-3 * dt)).normalize() : camUp };
    } else g.rig.override = null;
    this.prev.copy(pl.pos);
  }

  /** Skimming a hillside, the chase camera never sinks into the island behind (inside it is all dark outline). */
  private aboveGround(v: THREE.Vector3) {
    const P = this.ch.p, pl = this.g.player, cd = v.clone().sub(P.center).normalize();
    // and never inside a racer's wing at the chase camera's shoulder
    for (const r of this.racers) {
      const d = v.clone().sub(r.wing.root.position), L = d.length();
      if (L < 2.6) v.addScaledVector(L > 1e-3 ? d.normalize() : pl.up, 2.6 - L);
    }
    if (!onIsle(P, cd)) return v;
    const ground = P.surfacePoint(cd, 1.4), gr = ground.distanceTo(P.center);
    return pl.pos.distanceTo(P.center) > gr - 3 && v.distanceTo(P.center) < gr ? ground : v;
  }

  private updateRace(dt: number) {
    const g = this.g, pl = g.player, c = this.course!, t = g.time;
    // the waterfall shortcut: through the Chime Garden's falls, the spray throws you forward
    if (!this.shortcut && pl.pos.distanceTo(this.fallsAt) < 6) { this.shortcut = true; if (pl.glider) pl.glider.boost += 7; g.hud.notify(W.shortcut); g.sound.sfxPlay('splash'); }
    // the last gust always comes from below: be low when it comes
    const low = pl.pos.distanceTo(c.center) < c.at(this.progress).distanceTo(c.center) - 0.8;
    if (!this.gust && pl.pos.distanceTo(this.gustAt) < 9 && low) { this.gust = true; if (pl.glider) pl.glider.boost += 8; g.hud.notify(W.gust); g.sound.sfxPlay('whoosh'); }
    const ns = this.progress, nv = (pl.glider?.speed ?? 10) + (pl.glider?.boost ?? 0);
    const left = c.length - ns;
    // Zephy leads: he stays just ahead unless you took the shortcut and caught the last gust
    const lead = this.shortcut && this.gust ? -5 : this.shortcut ? 1.5 : 6;
    this.racers.forEach((r, i) => {
      const goal = i === 0 ? ns + lead : i === 1 ? ns - 3 + Math.sin(t * 0.3) * 2 : ns - 9;
      let v = nv + (goal - r.s) * 0.7;
      if (i === 0 && !(this.shortcut && this.gust) && left < 30) v = Math.max(v, nv + 1.5);
      r.speed = lerp(r.speed, clamp(v, 7, 30), 1 - Math.exp(-2 * dt));
      if (this.countdown > 0) r.speed = 11;
      r.fly(c, dt, t);
    });
    // the crowd cheers when the racers pass
    if (this.racers[0].s >= c.length - 0.5 && !this.passed[c.gates.length - 1]) { this.endWhy = 'beaten'; this.end(false); }
  }

  private place() {
    const n = 1 + this.racers.filter(r => r.s > this.progress).length;
    return ['1st', '2nd', '3rd', '4th'][n - 1];
  }
  private winner() { return this.racers.every(r => r.s <= this.progress + 0.5); }

  // ------------------------------------------------------------------ scenes
  /** Zephy flies the five rings first, every one ringing. */
  zephyShowOff(): Beat[] {
    const g = this.g, ch = this.ch, pl = g.player, zephy = ch.npc('zephy');
    const c = new Course(ch.p.center, this.qualGates, this.startQ, new Map(), 6);
    const r = new Racer(zephy.person as Windfolk, 'zephy', 0, zephy.root, zephy);
    const rung = new Set<number>();
    return [
      { line: { who: 'Zephy', text: W.showoff1 }, enter: () => { pl.lookAt = zephy.root.position.clone().addScaledVector(zephy.up, 1.4); } },
      {
        dur: Math.min(14, c.length / 11), enter: () => { r.board(this.wingRoot); r.s = 0; r.speed = 11; this.mark.show(this.qualGates, true); },
        tick: (k, dt) => {
          r.fly(c, dt, g.time);
          c.gateS.forEach((s, i) => { if (!rung.has(i) && r.s > s) { rung.add(i); g.sound.tone(c.gates[i].note, 0, 'bells', 0.6); (c.gates[i].obj?.userData.chime as { ring?: (k?: number) => void } | undefined)?.ring?.(1); } });
          const p = r.wing.root.position, up = p.clone().sub(ch.p.center).normalize(), d = c.dir(r.s);
          // a steady chase camera, a little above and outside the loop, easing (never swinging) round the turns
          const want = p.clone().addScaledVector(d, -8).addScaledVector(up, 3.2).addScaledVector(new THREE.Vector3().crossVectors(up, d), 2.5);
          const o = g.cutCam;
          g.cutCam = { pos: o && k > 0.02 ? o.pos.clone().lerp(want, 1 - Math.exp(-2.5 * dt)) : want, look: o && k > 0.02 ? o.look.clone().lerp(p, 1 - Math.exp(-5 * dt)) : p.clone(), up };
          this.mark.update(dt, Math.min(rung.size, c.gates.length - 1), c.gates.map((_, i) => rung.has(i)), g.camera, p);
        },
        exit: () => { r.leave(); ch.sendHome(zephy); this.mark.hide(); },
      },
      { line: { who: 'Zephy', text: W.showoff2 }, tick: () => { g.cutCam = ch.orbit(zephy.root.position, 4.5, 1.8, 2.4); }, exit: () => { pl.lookAt = null; } },
    ];
  }

  ribbonBeats(n: number): Beat[] {
    const g = this.g, ch = this.ch, zephy = ch.npc('zephy');
    return [
      {
        line: { text: n === this.passed.length ? W.qualClean : W.qualDone(n) }, dur: 4,
        // Nilo glides down by the race gate, where Zephy is waiting with the ribbon
        enter: () => { ch.land(safeSpot(ch.p, ch.dir([63.8, 11]), [], 3)); g.player.facing.copy(zephy.root.position.clone().sub(g.player.pos).projectOnPlane(g.player.up).normalize()); g.player.sync(); zephy.place(zephy.root.position.clone(), zephy.up.clone(), g.player.pos.clone().sub(zephy.root.position)); zephy.lookAt = g.player.pos.clone().addScaledVector(g.player.up, 1.2); },
        tick: k => { g.cutCam = this.twoShot(zephy.root.position, 5.5 - k * 0.6, 2.2); },
      },
      { line: { who: 'Zephy', text: W.ribbonZephy }, enter: () => { zephy.smileT = 2; }, tick: k => { g.cutCam = this.twoShot(zephy.root.position, 4.4 - k * 0.3, 1.8); } },
      { dur: 0.1, exit: () => { zephy.lookAt = null; g.flags.add('sky:ribbon'); g.give('item:racer-ribbon'); } },
    ];
  }

  /** Nilo and someone side by side, seen from the side away from the festival crowd (who would stand in the way). */
  twoShot(other: THREE.Vector3, r: number, h: number) {
    const ch = this.ch, pl = this.g.player, mid = pl.pos.clone().lerp(other, 0.5);
    const up = mid.clone().sub(ch.p.center).normalize();
    const side = new THREE.Vector3().crossVectors(up, other.clone().sub(pl.pos)).normalize();
    if (side.dot(ch.at([69.5, 19.5]).sub(mid)) > 0) side.negate();
    const look = mid.clone().addScaledVector(up, 1.0), at = (s: number) => mid.clone().addScaledVector(side, s * r).addScaledVector(up, h);
    // a house in the way: take the crowd's side instead
    const sgn = ch.sightGap(at(1), look) < 0.8 && ch.sightGap(at(-1), look) > ch.sightGap(at(1), look) ? -1 : 1;
    return { pos: at(sgn), look, up };
  }

  raceStart(): Beat[] {
    const g = this.g, ch = this.ch, gate = ch.home.zephy.pos;
    return [
      { line: { who: 'Gran Wren', text: W.start1 }, tick: k => { g.cutCam = ch.orbit(gate, 8, 3, 1.4 + k * 0.3); } },
      { line: { who: 'Zephy', text: W.start2 }, tick: k => { g.cutCam = ch.orbit(gate, 6, 2.2, 1.8 + k * 0.2); } },
      { line: { text: W.go }, dur: 1.6, enter: () => { for (let i = 0; i < 3; i++) g.sound.tone(72, i * 0.4, 'bells', 0.5); g.sound.tone(84, 1.2, 'bells', 0.7); g.sound.cheer(0.8, 3); } },
    ];
  }

  loseBeats(): Beat[] {
    const g = this.g, ch = this.ch, wren = ch.npc('granwren'), pl = g.player;
    const meet = () => {
      // Nilo comes down beside Gran Wren, who has been watching from the square
      const w = wren.root.position, up = w.clone().sub(ch.p.center).normalize();
      const d = safeSpot(ch.p, w.clone().addScaledVector(wren.homeForward.clone().projectOnPlane(up).normalize(), 2.3).sub(ch.p.center).normalize(), [], 3);
      ch.land(d, w.clone().sub(ch.p.surfacePoint(d)));
      // and Gran Wren comes over to him (off the riverbank)
      const wd = pl.pos.clone().addScaledVector(pl.facing, 1.7).sub(ch.p.center).normalize();
      const wp = ch.p.surfacePoint(wd, -0.05);
      wren.place(wp, wd, pl.pos.clone().sub(wp));
      pl.facing.copy(wp.clone().sub(pl.pos).projectOnPlane(pl.up).normalize()); pl.sync(); pl.lookAt = wp.clone().addScaledVector(wd, 1.1);
      wren.lookAt = pl.pos.clone().addScaledVector(pl.up, 1.2);
      void w;
    };
    // every frame: Nilo turned to face her (nothing left over from the flight turns him away)
    const face = () => {
      const w = wren.root.getWorldPosition(new THREE.Vector3());
      const f = w.sub(pl.pos).projectOnPlane(pl.up);
      if (f.lengthSq() > 1e-4) { pl.facing.copy(f.normalize()); pl.glidePose = 0; pl.sync(); }
      return wren.root.getWorldPosition(new THREE.Vector3());
    };
    // past Gran Wren's shoulder onto Nilo's face (whichever side has no house in the way)
    let fs = 0;
    const faceCam = (dist: number, h: number) => {
      const w = face(), up = pl.up.clone(), dir = w.clone().sub(pl.pos).projectOnPlane(up).normalize();
      const side = new THREE.Vector3().crossVectors(up, dir).normalize();
      const look = pl.pos.clone().lerp(w, 0.4).addScaledVector(up, 1.0);
      const at = (sd: number) => w.clone().addScaledVector(dir, dist).addScaledVector(side, sd * 1.5).addScaledVector(up, h);
      if (!fs) fs = ch.sightGap(at(1), look) >= ch.sightGap(at(-1), look) ? 1 : -1;
      return { pos: at(fs), look, up };
    };
    return [
      { line: { text: W.lost }, dur: 3.5, enter: meet, tick: k => { g.cutCam = this.twoShot(face(), 7 - k * 1.5, 3 - k); } },
      { line: { who: 'Gran Wren', text: W.wren1 }, enter: () => { wren.pose = { cheer: 1 } as Npc['pose']; }, tick: k => { g.cutCam = faceCam(2.4 - k * 0.3, 1.5); } },
      { line: { who: 'Gran Wren', text: W.wren2 }, tick: () => { g.cutCam = this.twoShot(face(), 3.6, 1.6); }, exit: () => { wren.pose = {}; wren.lookAt = null; pl.lookAt = null; ch.sendHome(wren); g.hud.notify(W.again); } },
    ];
  }
}

/**
 * The way through the rings: the next ring glows and pulses, every ring carries its number (a gold tick once flown),
 * and an arrow on screen points to the next one (over it when it is in view, at the screen's edge when it is not).
 */
class RingMarks {
  private glow: THREE.Mesh;
  private nums: THREE.Sprite[] = [];
  private gates: Gate[] = [];
  private el: HTMLDivElement;
  private shown = -1;
  private flashT: number[] = [];
  private v = new THREE.Vector3();
  constructor(private root: THREE.Object3D, private center: THREE.Vector3) {
    this.glow = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 8, 48), new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.glow.visible = false; this.glow.renderOrder = 8;
    root.add(this.glow);
    this.el = document.createElement('div'); this.el.className = 'ringptr hidden';
    this.el.innerHTML = '<svg class="tri" width="64" height="64" viewBox="-32 -32 64 64"><polygon fill="#ffd95a" stroke="#3b2a30" stroke-width="2.5" stroke-linejoin="round"/></svg><div class="lab"></div>';
    document.getElementById('ui')?.append(this.el);
  }
  private tex(label: string, kind: 'next' | 'done' | 'todo') {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    if (x) {
      x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2);
      x.fillStyle = kind === 'next' ? '#ffd95a' : kind === 'done' ? '#7cc46a' : 'rgba(255,248,238,0.85)'; x.fill();
      x.lineWidth = 8; x.strokeStyle = '#3b2a30'; x.stroke();
      x.fillStyle = '#3b2a30'; x.font = 'bold 64px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(kind === 'done' ? '\u2713' : label, 64, 68);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  show(gates: Gate[], numbers: boolean) {
    this.hide();
    this.gates = gates;
    this.flashT = gates.map(() => 0);
    if (numbers) gates.forEach((gt, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex(String(i + 1), 'todo'), depthWrite: false, transparent: true, fog: false }));
      sp.userData.kind = 'todo'; sp.renderOrder = 9;
      const up = gt.center.clone().sub(this.center).normalize();
      sp.position.copy(gt.center).addScaledVector(up, gt.radius + 1.3).sub(this.root.position);
      sp.scale.setScalar(1.5);
      this.root.add(sp); this.nums.push(sp);
    });
    this.glow.visible = true; this.shown = -1;
    this.el.classList.remove('hidden');
  }
  flash(i: number) { this.flashT[i] = 1; }
  hide() {
    for (const s of this.nums) { s.removeFromParent(); (s.material as THREE.SpriteMaterial).map?.dispose(); s.material.dispose(); }
    this.nums = []; this.gates = [];
    this.glow.visible = false;
    this.el.classList.add('hidden');
  }
  update(dt: number, next: number, passed: boolean[], camera: THREE.Camera, from: THREE.Vector3) {
    const gt = this.gates[next];
    // the numbers: the next one big and gold, the flown ones a green tick
    this.nums.forEach((sp, i) => {
      const kind = passed[i] ? 'done' : i === next ? 'next' : 'todo';
      if (sp.userData.kind !== kind) { sp.userData.kind = kind; (sp.material as THREE.SpriteMaterial).map?.dispose(); (sp.material as THREE.SpriteMaterial).map = this.tex(String(i + 1), kind); sp.material.needsUpdate = true; }
      this.flashT[i] = Math.max(0, (this.flashT[i] ?? 0) - dt * 1.5);
      sp.scale.setScalar((kind === 'next' ? 2.1 + Math.sin(performance.now() / 180) * 0.15 : 1.4) + this.flashT[i] * 1.2);
    });
    if (!gt) { this.glow.visible = false; this.el.classList.add('hidden'); return; }
    // the glowing ring
    this.glow.visible = true;
    this.glow.position.copy(gt.center).sub(this.root.position);
    this.glow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), gt.normal);
    const pulse = 1 + Math.sin(performance.now() / 220) * 0.06;
    this.glow.scale.setScalar(gt.radius * 1.02 * pulse);
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(performance.now() / 220) * 0.25;
    // the pointer on screen
    const cam = camera as THREE.PerspectiveCamera;
    const p = this.v.copy(gt.center).project(cam);
    const ahead = gt.center.clone().sub(cam.position).dot(cam.getWorldDirection(new THREE.Vector3())) > 0;
    const W = innerWidth, H = innerHeight;
    let x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
    const on = ahead && x > 40 && x < W - 40 && y > 70 && y < H - 60;
    let ang = 180;
    if (!on) {
      // at the edge, pointing the way to turn
      let dx = p.x, dy = p.y;
      if (!ahead) { dx = -dx; dy = -dy; if (Math.abs(dx) < 0.2) dx = dx < 0 ? -1 : 1; }
      const k = 1 / Math.max(Math.abs(dx) / 0.86, Math.abs(dy) / 0.72, 1e-3);
      x = (dx * k * 0.5 + 0.5) * W; y = (-dy * k * 0.5 + 0.5) * H;
      ang = Math.atan2(dx * W, dy * H) * 180 / Math.PI;
    }
    // on screen the glow and the big number mark it; the arrow only shows the way when it is out of sight
    this.el.classList.toggle('hidden', on);
    this.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
    // (the arrow's corners are turned here, not by a CSS rotate)
    const a = ang * Math.PI / 180, pt = (fx: number, fy: number) => `${(fx * Math.cos(a) - fy * Math.sin(a)).toFixed(1)},${(fx * Math.sin(a) + fy * Math.cos(a)).toFixed(1)}`;
    (this.el.firstChild!.firstChild as SVGPolygonElement).setAttribute('points', [[0, -21], [13, -2], [5, -2], [5, 15], [-5, 15], [-5, -2], [-13, -2]].map(([u, w]) => pt(u, w)).join(' '));
    const lab = this.el.lastChild as HTMLElement;
    const txt = `${next + 1}`;
    if (this.shown !== next) { this.shown = next; lab.textContent = txt; }
    lab.style.display = 'block';
  }
}

let cssDone = false;
function addCss() {
  if (cssDone) return; cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
  .racehud { position: absolute; top: 74px; left: 50%; transform: translateX(-50%); font: 15px Georgia, serif; color: #fff8ee; background: rgba(46,34,48,0.45); padding: 6px 14px; border-radius: 14px; letter-spacing: 0.04em; pointer-events: none; text-shadow: 0 1px 2px #0006; }
  .racehud.hidden, .speedlines.hidden, .ringptr.hidden { display: none; }
  .racehud .rd { display: inline-block; width: 22px; height: 22px; line-height: 22px; margin: 0 2px; border-radius: 50%; text-align: center; font-size: 13px; background: rgba(255,248,238,0.25); color: #fff8ee; }
  .racehud .rd.next { background: #ffd95a; color: #3b2a30; font-weight: bold; box-shadow: 0 0 8px #ffd95a; }
  .racehud .rd.done { background: #7cc46a; color: #22361c; }
  .ringptr { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 3; }
  .ringptr .tri { position: absolute; left: -32px; top: -32px; overflow: visible; filter: drop-shadow(0 0 3px #3b2a30) drop-shadow(0 0 6px #ffd95a88); animation: rp 0.8s ease-in-out infinite alternate; }
  .ringptr .lab { position: absolute; left: 0; top: -44px; transform: translateX(-50%); font: bold 15px Georgia, serif; color: #3b2a30; background: #ffd95a; border-radius: 10px; padding: 1px 8px; white-space: nowrap; }
  @keyframes rp { from { margin-top: -4px; } to { margin-top: 4px; } }
  .speedlines { position: absolute; inset: 0; pointer-events: none; background: repeating-conic-gradient(from 0deg at 50% 52%, rgba(255,255,255,0) 0deg 5deg, rgba(255,255,255,0.55) 5.3deg 5.6deg, rgba(255,255,255,0) 6deg 11deg);
    -webkit-mask-image: radial-gradient(ellipse at 50% 52%, transparent 38%, black 78%); mask-image: radial-gradient(ellipse at 50% 52%, transparent 38%, black 78%); animation: sl 0.35s linear infinite; }
  @keyframes sl { from { transform: rotate(0deg) scale(1.02); } to { transform: rotate(3deg) scale(1.02); } }`;
  document.head.append(s);
}
