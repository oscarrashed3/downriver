// World 3, the Walking Town: moving about on Old Amble and round it. While you are in World 3:
//   - Mossrest's walkways, stairs, floors and walls are decks and solids that ride Amble's shell (synced every
//     frame from shellTop, so the whole village works as a moving platform: when Amble breathes or walks, Nilo
//     standing on it is carried along);
//   - the mossy treads between them are ground (the shell's own top), and the flanks and legs are solid;
//   - the thick ropes and rope ladders down beside the legs can be climbed, hand over hand, all the way up and
//     over the railing onto the walk (and back down again);
//   - jump or fall off Amble's back and Fold opens into a paper umbrella that floats you down into the grass;
//   - the camera melts whatever stands between it and Nilo (houses, trees, Amble's vines), pulls in smoothly in
//     the tight lanes and inside the houses, and never goes into the shell.
// Everything is undone outside World 3, so the other worlds run exactly as before.
import * as THREE from 'three';
import type { Game } from '../../game';
import type { Player } from '../../player/player';
import type { Solid } from '../collide';
import { deckUnder } from '../collide';
import type { Amble } from './amble';
import type { Mossrest } from './mossrest';
import { groundAt } from './mossrest';
import { shellPolar } from './ambleShell';
import { SHELL, FOOT_REST, LEGS } from './ambleRig';
import { SeeThrough, SEE } from '../skyIsles/seeThrough';
import { PaperUmbrella } from './umbrella';
import type { AmbleWalker } from './ambleWalk';
import { TOWN_MOVE } from '../../data/townWords';

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();

interface Line {
  kind: 'rope' | 'ladder';
  curve: THREE.CatmullRomCurve3;
  len: number;
  /** Arc length (from the top) where the feet are when the hands reach the pulley, and at the foot. */
  sTop: number; sFoot: number;
  out: THREE.Vector3;
  /** Where he stands on the walk at the top (creature space). */
  top: THREE.Vector3;
  /** Which of the village's leg lines (for how far its free end reaches to the ground under it). */
  i: number;
}

export class TownMove {
  active = false;
  readonly amble: Amble;
  readonly town: Mossrest;
  private sync: (a: THREE.Matrix4, b: THREE.Matrix4, center?: THREE.Vector3) => void;
  private legSolids: { s: Solid; local: THREE.Vector3 }[] = [];
  private prev = new THREE.Matrix4();
  private havePrev = false;
  private prevN = new THREE.Matrix4();
  private havePrevN = false;
  /** Standing on Amble (the shell, a deck of the village) this frame. */
  onAmble = false;
  private offT = 9;
  private lines: Line[] = [];
  climb: { line: Line; phase: 'onto' | 'up' | 'down' | 'over' | 'off'; s: number; t: number; from: THREE.Vector3; moving: number } | null = null;
  readonly umbrella: PaperUmbrella;
  private see: SeeThrough;
  private scanned = false;
  private hinted = false;
  /** Metres in front of the lens that melt away whole in a close scene shot (0: the usual 2.6). */
  cutMelt = 0;
  readonly walker: AmbleWalker;
  /** The footfalls' shake, 1 for a foot coming down right by the camera (dies away fast). */
  private shake = 0;
  /** Set down on the walk already (the arrival scene sets this, so it is not done again on the way in). */
  placed = false;

  constructor(private g: Game, private idx: number) {
    const refs = g.contents[idx].refs;
    this.amble = refs.amble as Amble;
    this.town = refs.town as Mossrest;
    const p = g.planets[idx];
    this.amble.root.updateMatrixWorld(true);
    const cols = this.town.colliders();
    this.sync = cols.sync;
    p.solids.push(...cols.solids);
    p.decks.push(...cols.decks);
    // the legs: solid columns from the ground to the shell (proxies placed from Amble's root)
    for (const l of LEGS) {
      const o = new THREE.Object3D();
      const s: Solid = { obj: o, shape: { kind: 'circle', r: 3.3 }, h: 9 };
      this.legSolids.push({ s, local: FOOT_REST[l].clone() });
      p.solids.push(s);
    }
    this.syncNow();
    // the ropes and ladders down the legs: climb from the foot, or from the walk at the top
    this.walker = refs.walker as AmbleWalker;
    // each footfall: a deep thud, and the ground shaking a little (more the nearer the foot)
    this.walker.onStep = (_leg, at) => {
      if (!this.active) return;
      const d = at.distanceTo(this.g.camera.position);
      const k = THREE.MathUtils.clamp(1.25 - d / 40, 0.15, 1);
      this.shake = Math.max(this.shake, k);
      this.g.sound.sfxPlay('thud');
    };
    for (const [li, L] of this.town.legLines.entries()) {
      const curve = new THREE.CatmullRomCurve3(L.pts, false, 'centripetal');
      const len = curve.getLength();
      const at = (s: number) => this.reach(li, curve.getPointAt(clamp(s / len)));
      // feet at the top: about 0.9 m under the pulley; at the foot: just off the grass
      let sTop = 0.5, sFoot = len - 0.3;
      for (let s = 0; s < len; s += 0.1) if (at(s).y < L.pts[0].y - 1.0) { sTop = s; break; }
      for (let s = len; s > 0; s -= 0.1) if (at(s).y > 0.35) { sFoot = s; break; }
      const line: Line = { kind: L.kind, curve, len, sTop, sFoot, out: L.out.clone().setY(0).normalize(), top: L.top.clone(), i: li };
      this.lines.push(line);
      const me = this;
      g.contents[idx].interactables.push({
        id: 'townRopeUp', world: idx, get pos() { return me.world(at(sFoot - 0.3).addScaledVector(line.out, 0.7), new THREE.Vector3()); }, radius: 2.4,
        label: () => (this.climb || !this.g.player.grounded || this.onAmble ? null : line.kind === 'ladder' ? TOWN_MOVE.ladderUp : TOWN_MOVE.ropeUp),
        act: () => this.startClimb(line),
      });
      g.contents[idx].interactables.push({
        id: 'townRopeDown', world: idx, get pos() { return me.world(line.top, new THREE.Vector3()); }, radius: 1.6,
        label: () => (this.climb || !this.onAmble ? null : line.kind === 'ladder' ? TOWN_MOVE.ladderDown : TOWN_MOVE.ropeDown),
        act: () => this.startDown(line),
      });
    }
    this.umbrella = new PaperUmbrella();
    g.scene.add(this.umbrella.root);
    // the melt: the village (not its walks and floors), Amble's vines and the lookout
    this.see = new SeeThrough(g.scene, () => [this.town.group, this.town.neck, this.amble.growth], { keepShader: true });
  }

  /** A point of a rope's free end (creature space) where it reaches to the ground under it now (as its mesh does). */
  private reach(li: number, c: THREE.Vector3) {
    const w = clamp((4.5 - c.y) / (4.5 - 0.12));
    c.y += w * (this.town.ropeGround.value[li] ?? 0);
    return c;
  }

  /** Creature space (the village's own frame) to world. */
  world(v: THREE.Vector3, out: THREE.Vector3) { return out.copy(v).applyMatrix4(this.town.group.matrixWorld); }
  private toCreature(v: THREE.Vector3, out: THREE.Vector3) { return out.copy(v).applyMatrix4(_m.copy(this.town.group.matrixWorld).invert()); }
  /** Creature-space direction to world (no translation). */
  private dirWorld(v: THREE.Vector3, out: THREE.Vector3) { return out.copy(v).transformDirection(this.town.group.matrixWorld); }

  private syncNow() {
    this.amble.root.updateMatrixWorld(true);
    this.sync(this.amble.shellTop.matrixWorld, this.amble.neckRide.matrixWorld, this.g.planets[this.idx].center);
    for (const { s, local } of this.legSolids) {
      s.obj.position.copy(local).applyMatrix4(this.amble.root.matrixWorld);
      s.obj.quaternion.copy(this.amble.root.quaternion);
    }
  }

  // ------------------------------------------------------------------ the rules the player obeys in World 3

  /**
   * After the decks and solids. On Amble's back Nilo walks only on the village's walks, stairs and floors and the
   * crown's paved square: the moss, the plates and the roofs are not for walking, so a step onto them is refused
   * (he slides along the edge instead, as along a railing). Off the outer edge of the ring walk he may still jump,
   * and the umbrella floats him down. The flanks push you off; the umbrella slows a fall.
   */
  private collide = (pl: Player) => {
    // walking briskly down a steep walk (the neck's, as Amble's head bobs): keep his feet on the planks
    if (!pl.onDeck && this.wasDeck && pl.vel.dot(pl.up) < 0.5) {
      const P = this.g.planets[this.idx];
      for (const d of P.decks) {
        const u = deckUnder(d, pl.pos, P.center);
        if (!u || Math.abs(u.z) > d.width / 2 + 0.05 || u.lift >= -0.15 || u.lift < -1.3) continue;
        pl.pos.addScaledVector(u.up, u.lift);
        const vu = pl.vel.dot(u.up); if (vu < 0) pl.vel.addScaledVector(u.up, -vu);
        pl.grounded = true; pl.onDeck = true;
        break;
      }
    }
    const q = this.toCreature(pl.pos, _v);
    const { rho } = shellPolar(q.x, q.z);
    let bad = false;
    if (rho < 0.97 && q.y > SHELL.yLip) {
      const gy = groundAt(q.x, q.z);
      // (on a stair whose foot is cut into the moss bank, he keeps to the treads)
      const onPlanks = pl.onDeck && this.town.deckTop(q.x, q.z, q.y, 0.3, 0) !== null;
      if (q.y < gy + 0.03 && q.y > gy - 3.5 && !onPlanks) {
        // on the shell: stand on its top
        const vu = pl.vel.dot(pl.up);
        if (vu <= 0.5) {
          q.y = gy;
          this.world(q, pl.pos);
          if (vu < 0) pl.vel.addScaledVector(pl.up, -vu);
          pl.grounded = true;
          // (where a stair's foot or head sits a little into the moss, its planks still count; never a floor up over his head)
          if (!pl.onDeck && !this.town.onPlaza(q.x, q.z) && this.town.deckTop(q.x, q.z, q.y - 0.4, 0.85, 0) === null) bad = true;
        }
      } else if (q.y <= gy - 3.5) this.pushOut(pl, q, 1.0);
      else if (!pl.onDeck && this.wasDeck && pl.vel.dot(pl.up) < 0.3 && q.y - gy < 4 && this.town.deckTop(q.x, q.z, q.y - 0.5, 1.0, -0.3) === null && !this.town.onPlaza(q.x, q.z, -0.3)) {
        // walked off the side of a walk or a stair, over the moss
        bad = true;
      }
    } else if (rho < 1.06 && q.y > SHELL.yLip - 0.5 && q.y < SHELL.yLow) this.pushOut(pl, q, 1.06);
    if (bad) this.refuse(pl, q);
    else if (pl.grounded && rho < 1.3 && q.y > SHELL.yLip && (pl.onDeck || this.town.onPlaza(q.x, q.z) || this.town.deckTop(q.x, q.z, q.y - 0.4, 0.85, 0) !== null)) { this.lastOk.copy(q); this.haveOk = true; }
    this.wasDeck = pl.onDeck;
    // the paper umbrella: a soft, slow drift down
    if (this.umbrella.open) {
      const vu = pl.vel.dot(pl.up);
      if (vu < -2.3) pl.vel.addScaledVector(pl.up, (-2.3 - vu) * 0.35);
      const h = pl.vel.clone().projectOnPlane(pl.up), hs = h.length();
      if (hs > 4.5) pl.vel.addScaledVector(h, 4.5 / hs - 1);
    }
  };
  /** Where he last stood on something walkable on Amble's back (creature space). */
  private lastOk = new THREE.Vector3();
  private haveOk = false;
  private wasDeck = false;
  /** A step onto the moss: back to the edge of the walk, keeping what of the step runs along it. */
  private refuse(pl: Player, q: THREE.Vector3) {
    const T = this.town, L = this.lastOk;
    const to = new THREE.Vector3();
    if (this.haveOk && Math.hypot(q.x - L.x, q.z - L.z) < 2.5) {
      const dx = q.x - L.x, dz = q.z - L.z;
      to.copy(L);
      for (const a of [0.45, -0.45, 0.9, -0.9, 1.3, -1.3]) {
        const c = Math.cos(a), s = Math.sin(a);
        const nx = L.x + (dx * c - dz * s) * c, nz = L.z + (dx * s + dz * c) * c;
        const y = T.walkTop(nx, nz, L.y);
        if (y !== null) { to.set(nx, y, nz); break; }
      }
    } else {
      // (somewhere a scene left him, or a long jump onto the moss: to the nearest walkable place)
      let best: THREE.Vector3 | null = null;
      for (let rr = 0.4; rr < 9 && !best; rr += 0.4) for (let a = 0; a < Math.PI * 2 && !best; a += 0.4) {
        const nx = q.x + Math.cos(a) * rr, nz = q.z + Math.sin(a) * rr, y = T.walkTop(nx, nz, q.y);
        if (y !== null) best = new THREE.Vector3(nx, y, nz);
      }
      if (!best) return;
      to.copy(best);
    }
    const mv = this.dirWorld(_w.set(to.x - L.x, 0, to.z - L.z), new THREE.Vector3()).projectOnPlane(pl.up);
    this.world(to, pl.pos);
    const h = pl.vel.clone().projectOnPlane(pl.up);
    pl.vel.sub(h);
    if (mv.lengthSq() > 1e-6) { mv.normalize(); pl.vel.addScaledVector(mv, Math.max(0, h.dot(mv))); }
    const vu = pl.vel.dot(pl.up); if (vu < 0) pl.vel.addScaledVector(pl.up, -vu);
    pl.grounded = true;
    this.lastOk.copy(to); this.haveOk = true;
  }

  /** Out through the flank, horizontally in creature space, to outline fraction rho1. */
  private pushOut(pl: Player, q: THREE.Vector3, rho1: number) {
    const { rho } = shellPolar(q.x, q.z);
    if (rho < 1e-3) return;
    const k = rho1 / rho;
    q.x *= k; q.z = SHELL.cz + (q.z - SHELL.cz) * k;
    this.world(q, pl.pos);
    const out = this.dirWorld(_w.set(q.x, 0, q.z - SHELL.cz).normalize(), new THREE.Vector3());
    const vo = pl.vel.dot(out);
    if (vo < 0) pl.vel.addScaledVector(out, -vo);
  }

  /** The camera stays above the shell (never inside the dome). */
  private floor = (dir: THREE.Vector3, r: number) => {
    const p = this.g.planets[this.idx];
    const base = p.surfaceRadius(dir);
    const q = this.toCreature(_w.copy(dir).multiplyScalar(r).add(p.center), new THREE.Vector3());
    const { rho } = shellPolar(q.x, q.z);
    if (rho > 0.97 || q.y < SHELL.yLip) return base;
    const gy = groundAt(q.x, q.z);
    if (q.y > gy + 0.6 || q.y < gy - 6) return base;
    return Math.max(base, r + (gy + 0.3 - q.y));
  };

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    const pl = this.g.player, rig = this.g.rig;
    if (!on) {
      if (pl.collide === this.collide) pl.collide = null;
      if (rig.floor === this.floor) rig.floor = null;
      rig.smoothBlock = false;
      if (rig.follow === this.followDir) rig.follow = null;
      rig.pitchMin = -0.25; rig.distCap = null; rig.pitchGoal = null; rig.posRate = 9; rig.distSpeed = Infinity;
      this.haveOk = false;
      this.see.off();
      SEE.uSeeCircle.value = 1; SEE.uSeeNear.value.set(2.6, 1.4);
      this.setClutter(false);
      this.umbrella.close(true);
      this.g.fold.root.visible = true;
      pl.pose = {};
      this.climb = null;
      this.placed = false;
      return;
    }
    pl.collide = this.collide;
    rig.floor = this.floor; rig.smoothBlock = true;
    // a calm camera: it chases its goal gently and changes distance no faster than a slow walk
    rig.posRate = 6; rig.distSpeed = 3.5;
    SEE.uSeeCircle.value = 0;
    if (!this.scanned) { this.scanned = true; this.see.scan(); }
    this.syncNow();
    this.prev.copy(this.town.group.matrixWorld); this.havePrev = true;
    this.prevN.copy(this.town.neck.matrixWorld); this.havePrevN = true;
    // the early-afternoon sun stands ahead of Amble and off to its right, so the village and the face are lit
    // from the meadow side (as in Oscar's picture); the pinned hour keeps that bearing as Nilo walks about
    {
      const d = this.g.day, e = d.pin ?? 0.62, upA = this.dirWorld(_v.set(0, 1, 0), new THREE.Vector3());
      const h = this.dirWorld(_w.set(-0.5, 0, 0.87), new THREE.Vector3()).projectOnPlane(upA).normalize();
      d.sun.copy(upA).multiplyScalar(e).addScaledVector(h, Math.sqrt(Math.max(0, 1 - e * e))).normalize();
    }
    // (until the arrival scene is written) set down on the walk on Amble's right side, looking along it
    if (!this.placed) { this.placed = true; this.dropOnShell(); }
  }

  /** What else hangs in World 3's sky: the other worlds, their falling streams, the cloud sea. */
  private clutter: THREE.Object3D[] = [];
  private clutterHidden = false;
  /** Objects that stay up whatever (the sky whale of the arrival, while it flies here). */
  keepInSky = new Set<THREE.Object3D>();
  /**
   * World 3's sky is its own: the other planets (and all they carry), the streams between the worlds and the Sky
   * Isles' cloud sea are hidden while you are here (not on the stream ride in, which needs them), and come back
   * exactly as they were when you leave. Their columns of warm air are left to the game, which shows them itself.
   */
  setClutter(hide: boolean) {
    if (hide === this.clutterHidden) return;
    this.clutterHidden = hide;
    const g = this.g;
    if (!hide) { for (const o of this.clutter) o.visible = true; this.clutter = []; return; }
    const skip = new Set<THREE.Object3D>([...g.updrafts, g.player.root, g.fold.root, g.fold.string, g.fox.f.root, this.umbrella.root, g.sky.mesh, g.sky.clouds, g.motes.points, g.rain.points, g.blizzard.points, ...this.keepInSky]);
    const w = new THREE.Vector3();
    const add = (o: THREE.Object3D) => { if (o.visible && !skip.has(o)) { o.visible = false; this.clutter.push(o); } };
    for (const s of g.streams) add(s);
    add(g.cloudSea.group);
    for (const c of g.scene.children) {
      if ((c as THREE.Light).isLight || (c as THREE.Camera).isCamera || skip.has(c)) continue;
      c.getWorldPosition(w);
      const near = g.planets.findIndex((q, i) => i !== this.idx && w.distanceTo(q.center) < q.R + 80);
      if (near >= 0 && w.distanceTo(g.planets[this.idx].center) > g.planets[this.idx].R + 80) add(c);
    }
  }

  /** Stand Nilo on the walkway, by the stretch of picture 3 (on the right flank, between the cottages). */
  dropOnShell() {
    const pl = this.g.player, p = this.g.planets[this.idx], ring = this.town.ring;
    const i = Math.max(1, ring.ths.findIndex(t => t > 4.6));
    const at = this.world(ring.P(i, 0.45).add(new THREE.Vector3(0, 0.05, 0)), new THREE.Vector3());
    const ahead = this.world(ring.P(i - 2, 0.45), new THREE.Vector3());
    pl.pos.copy(at); pl.up.copy(at).sub(p.center).normalize();
    pl.vel.set(0, 0, 0); pl.grounded = true;
    pl.facing.copy(ahead).sub(at).projectOnPlane(pl.up).normalize();
    pl.sync();
    this.onAmble = true; this.offT = 0;
    this.g.rig.faceDir(pl.up, pl.facing); this.g.rig.smoothUp.copy(pl.up); this.g.rig.snap();
  }

  /** Before the player moves: carried by the shell; the climb takes over the frame. */
  takeOver(dt: number): boolean {
    if (this.climb) { this.updateClimb(dt); return true; }
    return false;
  }

  /** After the player moved. */
  afterMove() {
    const pl = this.g.player;
    const q = this.toCreature(pl.pos, _v);
    const { rho } = shellPolar(q.x, q.z);
    // on Amble: on its shell or anything of the village (the meadow is far below)
    this.onAmble = pl.grounded && q.y > SHELL.yLip && rho < 1.25;
    if (this.onAmble) this.offT = 0; else this.offT += 1 / 60;
    // off the back: the umbrella opens once he is clearly falling (and closes as he lands)
    const p = this.g.planets[this.idx];
    const r = pl.pos.distanceTo(p.center);
    const above = r - p.surfaceRadius(pl.up);
    if (!this.umbrella.open && !pl.grounded && this.offT < 3 && pl.vel.dot(pl.up) < -3.5 && above > 3) {
      this.umbrella.openAt(pl);
      this.g.fold.root.visible = false;
      this.g.sound.sfxPlay('paper');
      if (!this.hinted) { this.hinted = true; this.g.hud.notify(TOWN_MOVE.umbrellaHint); }
    }
    if (this.umbrella.open && pl.grounded) {
      this.umbrella.close();
      pl.landT = 0.12; pl.squash = 0.08;
      this.g.sound.sfxPlay('soft');
    }
  }

  private lookPt = new THREE.Vector3();
  /** Every frame in World 3, after Amble has moved: carry, sync the colliders, the village, the camera melt. */
  frame(dt: number, t: number) {
    const pl = this.g.player;
    this.setClutter(this.g.mode !== 'ride' && this.g.skyView.k < 0.02);
    this.syncNow();
    // Amble's eyes find Nilo when he is down near its head (not when he rides on its back), and its head follows
    const hd = this.amble.rig.bone('head').getWorldPosition(this.lookPt).distanceTo(pl.pos);
    // (only while he is down on the meadow: up on the walk along its neck a turning head would carry the planks
    // out from under him)
    const P = this.g.planets[this.idx], dn = pl.pos.clone().sub(P.center), gh = dn.length() - P.R - P.height(dn.normalize());
    this.amble.lookAt = hd < 55 && !this.onAmble && !this.climb && gh < 2.5 && !pl.onDeck ? this.lookPt.copy(pl.pos) : null;
    const M = this.town.group.matrixWorld;
    // (a jump or a hop off a step keeps the shell's own going: he comes down where he took off, even as it turns)
    const q0 = this.toCreature(pl.pos, _w), aloft = !pl.grounded && this.offT < 1.5 && q0.y > SHELL.yLip - 2 && shellPolar(q0.x, q0.z).rho < 1.15;
    // (out on the neck walk or the lookout he rides with the neck itself, which bobs and turns on its own)
    const Mn = this.town.neck.matrixWorld;
    let onNeck = false;
    if (this.havePrevN && pl.grounded) {
      const l = pl.pos.clone().applyMatrix4(_m.copy(this.prevN).invert());
      onNeck = this.town.neckTop(l.x, l.z, l.y) !== null;
    }
    if (this.havePrev && (this.onAmble || this.climb || aloft || onNeck)) {
      // carried along by the shell (or the neck): move with it since the last frame
      if (onNeck) _m.copy(this.prevN).invert().premultiply(Mn);
      else _m.copy(this.prev).invert().premultiply(M);
      pl.pos.applyMatrix4(_m);
      _q.setFromRotationMatrix(_m);
      pl.facing.applyQuaternion(_q);
      pl.sync();
      // and the camera with him, locked to the village's frame (so a walking Amble does not make it wobble)
      const rig = this.g.rig;
      rig.pos.applyMatrix4(_m); rig.look.applyMatrix4(_m); rig.ref.applyQuaternion(_q);
      if (this.g.mode === 'play' && !rig.override) { this.g.camera.position.applyMatrix4(_m); this.g.camera.quaternion.premultiply(_q); }
    }
    // the fox rides along too, when she is up on Amble with him
    if (this.havePrev && this.g.fox.ground && (this.onAmble || this.climb || aloft)) {
      const fx = this.g.fox, p = this.g.planets[this.idx];
      const fp = fx.f.root.position;
      if (fp.distanceTo(p.center) > p.surfaceRadius(fx.dir) + 2) {
        fp.applyMatrix4(_m); fx.dir.copy(fp).sub(p.center).normalize();
        fx.f.root.quaternion.premultiply(_q);
      }
    }
    this.prev.copy(M); this.havePrev = true;
    this.prevN.copy(Mn); this.havePrevN = true;
    // the ropes' and ladders' free ends reach down (or are pushed up) to the ground under them, wherever Amble is
    {
      const p = this.g.planets[this.idx], G = this.town.ropeGround.value, inv = _m.copy(M).invert();
      this.town.endFeet.forEach((f, i) => {
        const w = this.world(f, _v);
        const gw = p.surfacePoint(_w.copy(w).sub(p.center).normalize(), 0, new THREE.Vector3());
        G[i] = clamp(gw.applyMatrix4(inv).y - f.y + 0.1, -6, 3);
      });
    }
    // the footfalls' shake, on top of wherever the camera is
    if (this.shake > 0.002) {
      const k = this.shake * this.shake, tt = this.g.time;
      this.g.camera.position.addScaledVector(this.g.camera.up, Math.sin(tt * 38) * 0.05 * k).add(_v.set(Math.sin(tt * 31 + 1), 0, Math.sin(tt * 43 + 2)).multiplyScalar(0.025 * k));
      this.shake *= Math.exp(-6 * dt);
    }
    this.camFrame(dt);
    this.town.update(dt, t, this.g.camera);
    this.umbrella.update(dt, t, pl);
    if (this.umbrella.shown) { pl.pose = { ...pl.pose, holdUp: this.umbrella.k }; this.g.fold.root.visible = false; }
    else if (pl.pose.holdUp) { const { holdUp: _h, ...rest } = pl.pose; void _h; pl.pose = rest; this.g.fold.root.visible = true; }
    const free = this.g.mode === 'play' && !this.g.rig.override;
    // a close scene shot (or a framed view while working) melts whatever leafy stuff is near the lens
    const melt = this.cutMelt > 0 && (this.g.mode === 'cut' || !!this.g.rig.override);
    SEE.uSeeNear.value.set(melt ? this.cutMelt : 2.6, melt ? Math.max(1.4, this.cutMelt - 1.8) : 1.4);
    this.see.update(dt, free || melt, this.g.camera, pl.pos.clone().addScaledVector(pl.up, 0.9), this.g.renderer);
  }

  // ------------------------------------------------------------------ the camera on Amble's back

  private followDir = new THREE.Vector3();
  /** The lived-in house Nilo is inside, if any. */
  houseIn(): Mossrest['houses'][number] | null {
    const q = this.toCreature(this.g.player.pos, new THREE.Vector3());
    for (const h of this.town.houses) {
      if (!h.walkIn) continue;
      const dx = q.x - h.at.x, dz = q.z - h.at.z, c = Math.cos(h.rot), s = Math.sin(h.rot);
      if (Math.abs(dx * c - dz * s) < h.w / 2 - 0.15 && Math.abs(dx * s + dz * c) < h.d / 2 - 0.15 && Math.abs(q.y - h.at.y) < 1.2) return h;
    }
    return null;
  }
  /**
   * Up on Amble: the camera never looks up from under the walks (it keeps a little above Nilo), swings in behind
   * the way he is walking once the mouse is left alone, and inside a house comes in close and looks down into the
   * room. (The houses, trees and railings never push it about: they melt away instead.)
   */
  private camFrame(_dt: number) {
    const rig = this.g.rig, pl = this.g.player;
    const up = this.onAmble || !!this.climb;
    const inside = up && this.houseIn() !== null;
    rig.pitchMin = up ? 0.08 : -0.25;
    rig.distCap = inside ? 3.2 : null;
    rig.pitchGoal = inside ? 0.5 : null;
    const h = pl.vel.clone().projectOnPlane(pl.up);
    if (up && !inside && !this.climb && h.length() > 1.2) { this.followDir.copy(h); rig.follow = this.followDir; rig.followK = 0.55; }
    else if (rig.follow === this.followDir) rig.follow = null;
  }

  // ------------------------------------------------------------------ the golden beam along the walks

  /** What the beam is leading him to now, beyond the task itself (for a hint in the goal line). */
  routeHint: 'up' | 'down' | 'rope' | 'ropeUp' | 'neck' | null = null;
  private routeAdj: { j: number; w: number }[][] | null = null;
  private routeT = 9;
  private routeAt: THREE.Vector3 | null = null;
  private routeFor = new THREE.Vector3(1e9, 0, 0);
  /** The shortest way along the route network from node s to node t (node indices, s first). */
  routePath(s: number, t: number) {
    const R = this.town.paths;
    if (!this.routeAdj) {
      this.routeAdj = R.nodes.map(() => []);
      for (const [a, b] of R.edges) { const w = R.nodes[a].p.distanceTo(R.nodes[b].p); this.routeAdj[a].push({ j: b, w }); this.routeAdj[b].push({ j: a, w }); }
    }
    const n = R.nodes.length, D = new Array(n).fill(1e9), from = new Array(n).fill(-1), done = new Array(n).fill(false);
    D[s] = 0;
    for (;;) {
      let u = -1; for (let i = 0; i < n; i++) if (!done[i] && D[i] < 1e9 && (u < 0 || D[i] < D[u])) u = i;
      if (u < 0 || u === t) break;
      done[u] = true;
      for (const { j, w } of this.routeAdj[u]) if (D[u] + w < D[j]) { D[j] = D[u] + w; from[j] = u; }
    }
    const out: number[] = []; for (let i = t; i >= 0; i = from[i]) out.unshift(i);
    return out[0] === s ? out : [s];
  }
  /** On Amble's back or out along its neck and head (a world point). */
  private onBack(w: THREE.Vector3) {
    const q = this.toCreature(w, new THREE.Vector3());
    return q.y > SHELL.yLip + 3 && (shellPolar(q.x, q.z).rho < 1.3 || (Math.abs(q.x) < 8 && q.z > SHELL.cz + 15 && q.y > 14));
  }
  /**
   * Where the golden beam should stand to lead Nilo to `target` (world): the next stair foot or head, the neck walk,
   * the rope down (or up) a leg, along the walks, or the target itself once nothing is in the way.
   */
  routeTo(target: THREE.Vector3 | null, dt: number): THREE.Vector3 | null {
    if (!target) { this.routeHint = null; return null; }
    this.routeT += dt;
    if (this.routeT < 0.25 && target.distanceTo(this.routeFor) < 1 && this.routeAt) return this.routeAt;
    this.routeT = 0; this.routeFor.copy(target);
    const R = this.town.paths, pl = this.g.player, up = pl.up;
    const P = R.nodes.map(n => n.neck ? this.town.neck.localToWorld(n.p.clone()) : this.world(n.p, new THREE.Vector3()));
    const dist = (a: THREE.Vector3, b: THREE.Vector3) => { const d = a.clone().sub(b), v = d.dot(up); return Math.sqrt(d.lengthSq() + 3 * v * v); };
    const nearest = (w: THREE.Vector3, ok: (i: number) => boolean = () => true) => { let bi = 0, bd = 1e9; P.forEach((p, i) => { if (!ok(i)) return; const d = dist(p, w); if (d < bd) { bd = d; bi = i; } }); return bi; };
    const path = (a: number, b: number) => this.routePath(a, b);
    const me = pl.pos, niloUp = this.onAmble || !!this.climb || this.onBack(me), targetUp = this.onBack(target);
    let at: THREE.Vector3 = target.clone(), hint: typeof this.routeHint = null;
    if (niloUp && !this.climb) {
      const s = nearest(me);
      let goalNode: number;
      if (targetUp) goalNode = nearest(target);
      else {
        // down by the rope (or ladder) whose foot is nearest the target
        let best = -1, bd = 1e9;
        R.nodes.forEach((n, i) => { if (n.kind !== 'rope') return; const L = this.lines[n.line!]; const d = this.ropePos(L, L.sFoot).distanceTo(target); if (d < bd) { bd = d; best = i; } });
        goalNode = best;
      }
      if (goalNode >= 0) {
        const pth = path(s, goalNode);
        for (let k = 1; k < pth.length; k++) {
          const n = R.nodes[pth[k]];
          const key = n.kind === 'foot' || n.kind === 'top' || (n.kind === 'neck' && R.nodes[pth[k - 1]].kind === 'ring') || n.kind === 'rope';
          if (!key || dist(P[pth[k]], me) < 3.2) continue;
          at = P[pth[k]].clone();
          hint = n.kind === 'neck' ? 'neck' : n.kind === 'rope' ? 'rope' : P[pth[pth.length - 1]].clone().sub(me).dot(up) > 1.5 ? 'up' : 'down';
          break;
        }
        if (!targetUp && !hint && R.nodes[goalNode].kind === 'rope') hint = 'rope';
      }
    } else if (!niloUp && targetUp && !this.climb) {
      // up by the rope or ladder whose foot is nearest him
      let bd = 1e9;
      for (const L of this.lines) { const f = this.ropePos(L, L.sFoot); const d = f.distanceTo(me); if (d < bd) { bd = d; at = f; } }
      hint = 'ropeUp';
    }
    this.routeHint = hint;
    this.routeAt = at;
    return at;
  }

  // ------------------------------------------------------------------ the ropes and ladders

  private ropePos(line: Line, s: number, out = new THREE.Vector3()) {
    const c = this.reach(line.i, line.curve.getPointAt(clamp(s / line.len)));
    c.addScaledVector(line.out, line.kind === 'ladder' ? 0.28 : 0.32);
    return this.world(c, out);
  }

  startClimb(line: Line) {
    const g = this.g, pl = g.player;
    pl.vel.set(0, 0, 0);
    this.climb = { line, phase: 'onto', s: line.sFoot, t: 0, from: pl.pos.clone(), moving: 0 };
    g.sound.sfxPlay('soft');
    if (!this.hinted) { this.hinted = true; g.hud.notify(TOWN_MOVE.ropeHint); }
    g.rig.easeFromHere(0.9);
    g.rig.faceDir(pl.up, this.dirWorld(line.out.clone().negate(), new THREE.Vector3())); g.rig.pitch = 0.15;
  }

  startDown(line: Line) {
    const pl = this.g.player;
    pl.vel.set(0, 0, 0);
    this.climb = { line, phase: 'over', s: line.sTop, t: 0, from: pl.pos.clone(), moving: -1 };
    this.g.sound.sfxPlay('soft');
    this.g.rig.easeFromHere(0.9);
  }

  private updateClimb(dt: number) {
    const g = this.g, p = g.planets[this.idx], pl = g.player, c = this.climb!, inp = g.input, L = c.line;
    c.t += dt;
    const inward = this.dirWorld(L.out.clone().negate(), new THREE.Vector3());
    const settle = (pos: THREE.Vector3, face: THREE.Vector3, moving: number, climbing = true) => {
      pl.pos.copy(pos);
      pl.up.copy(pos).sub(p.center).normalize();
      pl.facing.copy(face).projectOnPlane(pl.up).normalize();
      pl.vel.set(0, 0, 0); pl.grounded = true;
      pl.animate(dt, moving, climbing); pl.sync();
    };
    if (c.phase === 'onto') {
      // a step to the rope, and hands up onto it
      const k = sstep(0, 0.5, c.t);
      const at = c.from.clone().lerp(this.ropePos(L, c.s), k);
      settle(at, inward, 1.2, k > 0.4);
      if (c.t >= 0.5) { c.phase = 'up'; c.t = 0; }
      return;
    }
    if (c.phase === 'up' || c.phase === 'down') {
      // hold up (W, the up arrow or Space) to climb, down (S or the down arrow) to go back down; let go to hang
      const upK = inp.key('KeyW') || inp.key('ArrowUp') || inp.key('Space') ? 1 : 0;
      const downK = inp.key('KeyS') || inp.key('ArrowDown') ? 1 : 0;
      const want = upK - downK;
      c.moving += (want - c.moving) * (1 - Math.exp(-6 * dt));
      // up the rope means towards the top of the curve (smaller s)
      c.s -= c.moving * (c.moving > 0 ? 2.0 : 2.8) * dt;
      if (c.s <= L.sTop) {
        // the hands reach the pulley beam: ease to a stop, then over the railing onto the walk
        c.s = L.sTop; c.phase = 'over'; c.t = 0; c.from = this.ropePos(L, L.sTop); c.moving = 1;
      } else if (c.s >= L.sFoot && c.moving < 0) {
        // at the foot: step off backwards onto the grass
        c.s = L.sFoot; c.phase = 'off'; c.t = 0; c.from = this.ropePos(L, L.sFoot);
        return;
      }
      const sway = Math.sin(g.time * 1.1) * 0.04 * (c.s / L.len);
      const at = this.ropePos(L, c.s).addScaledVector(this.dirWorld(new THREE.Vector3(-L.out.z, 0, L.out.x), new THREE.Vector3()), sway);
      settle(at, inward, Math.abs(c.moving) * 2.0, true);
      return;
    }
    if (c.phase === 'off') {
      const k = sstep(0, 0.45, c.t);
      const to = this.ropePos(L, L.sFoot).addScaledVector(this.dirWorld(L.out, new THREE.Vector3()), 0.9);
      const d = to.clone().sub(p.center).normalize();
      p.surfacePoint(d, 0, to);
      settle(c.from.clone().lerp(to, k), inward, 1.0, k < 0.5);
      if (c.t >= 0.45) { this.climb = null; pl.grounded = true; g.rig.easeFromHere(0.6); }
      return;
    }
    // over the railing onto the walk (or back over onto the rope going down): one smooth arc
    const going = c.moving > 0;
    const k = sstep(0, 0.9, c.t);
    const top = this.world(L.top, new THREE.Vector3());
    const a = going ? c.from : this.ropePos(L, L.sTop);
    const b = going ? top : this.ropePos(L, L.sTop);
    const start = going ? a : c.from;
    const at = start.clone().lerp(b, k).addScaledVector(pl.up, Math.sin(Math.PI * k) * 0.7);
    settle(at, going ? inward : inward, 1.0, true);
    if (c.t >= 0.9) {
      if (going) { this.climb = null; pl.grounded = true; this.onAmble = true; this.offT = 0; pl.animate(0, 0, false); g.rig.easeFromHere(0.6); }
      else { c.phase = 'down'; c.t = 0; c.s = L.sTop; c.moving = -1; }
    }
  }
}
