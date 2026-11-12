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
import type { Amble } from './amble';
import type { Mossrest } from './mossrest';
import { groundAt } from './mossrest';
import { shellPolar } from './ambleShell';
import { SHELL, FOOT_REST, LEGS } from './ambleRig';
import { SeeThrough } from '../skyIsles/seeThrough';
import { PaperUmbrella } from './umbrella';
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
}

export class TownMove {
  active = false;
  readonly amble: Amble;
  readonly town: Mossrest;
  private sync: (a: THREE.Matrix4, b: THREE.Matrix4) => void;
  private legSolids: { s: Solid; local: THREE.Vector3 }[] = [];
  private prev = new THREE.Matrix4();
  private havePrev = false;
  /** Standing on Amble (the shell, a deck of the village) this frame. */
  onAmble = false;
  private offT = 9;
  private lines: Line[] = [];
  climb: { line: Line; phase: 'onto' | 'up' | 'down' | 'over' | 'off'; s: number; t: number; from: THREE.Vector3; moving: number } | null = null;
  readonly umbrella: PaperUmbrella;
  private see: SeeThrough;
  private scanned = false;
  private hinted = false;
  private placed = false;

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
    for (const L of this.town.legLines) {
      const curve = new THREE.CatmullRomCurve3(L.pts, false, 'centripetal');
      const len = curve.getLength();
      const at = (s: number) => curve.getPointAt(clamp(s / len));
      // feet at the top: about 0.9 m under the pulley; at the foot: just off the grass
      let sTop = 0.5, sFoot = len - 0.3;
      for (let s = 0; s < len; s += 0.1) if (at(s).y < L.pts[0].y - 1.0) { sTop = s; break; }
      for (let s = len; s > 0; s -= 0.1) if (at(s).y > 0.35) { sFoot = s; break; }
      const line: Line = { kind: L.kind, curve, len, sTop, sFoot, out: L.out.clone().setY(0).normalize(), top: L.top.clone() };
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

  /** Creature space (the village's own frame) to world. */
  world(v: THREE.Vector3, out: THREE.Vector3) { return out.copy(v).applyMatrix4(this.town.group.matrixWorld); }
  private toCreature(v: THREE.Vector3, out: THREE.Vector3) { return out.copy(v).applyMatrix4(_m.copy(this.town.group.matrixWorld).invert()); }
  /** Creature-space direction to world (no translation). */
  private dirWorld(v: THREE.Vector3, out: THREE.Vector3) { return out.copy(v).transformDirection(this.town.group.matrixWorld); }

  private syncNow() {
    this.amble.root.updateMatrixWorld(true);
    this.sync(this.amble.shellTop.matrixWorld, this.amble.neckRide.matrixWorld);
    for (const { s, local } of this.legSolids) {
      s.obj.position.copy(local).applyMatrix4(this.amble.root.matrixWorld);
      s.obj.quaternion.copy(this.amble.root.quaternion);
    }
  }

  // ------------------------------------------------------------------ the rules the player obeys in World 3

  /** After the decks and solids: the shell's mossy top is ground; the flanks push you off; the umbrella slows a fall. */
  private collide = (pl: Player) => {
    const q = this.toCreature(pl.pos, _v);
    const { rho } = shellPolar(q.x, q.z);
    if (rho < 0.97 && q.y > SHELL.yLip) {
      const gy = groundAt(q.x, q.z);
      if (q.y < gy + 0.03 && q.y > gy - 3.5) {
        // on the shell: stand on its top
        const vu = pl.vel.dot(pl.up);
        if (vu <= 0.5) {
          q.y = gy;
          this.world(q, pl.pos);
          if (vu < 0) pl.vel.addScaledVector(pl.up, -vu);
          pl.grounded = true;
        }
      } else if (q.y <= gy - 3.5) this.pushOut(pl, q, 1.0);
    } else if (rho < 1.06 && q.y > SHELL.yLip - 0.5 && q.y < SHELL.yLow) this.pushOut(pl, q, 1.06);
    // the paper umbrella: a soft, slow drift down
    if (this.umbrella.open) {
      const vu = pl.vel.dot(pl.up);
      if (vu < -2.3) pl.vel.addScaledVector(pl.up, (-2.3 - vu) * 0.35);
      const h = pl.vel.clone().projectOnPlane(pl.up), hs = h.length();
      if (hs > 4.5) pl.vel.addScaledVector(h, 4.5 / hs - 1);
    }
  };

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
      this.see.off();
      this.umbrella.close(true);
      this.g.fold.root.visible = true;
      pl.pose = {};
      this.climb = null;
      this.placed = false;
      return;
    }
    pl.collide = this.collide;
    rig.floor = this.floor; rig.smoothBlock = true;
    if (!this.scanned) { this.scanned = true; this.see.scan(); }
    this.syncNow();
    this.prev.copy(this.town.group.matrixWorld); this.havePrev = true;
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

  /** Every frame in World 3, after Amble has moved: carry, sync the colliders, the village, the camera melt. */
  frame(dt: number, t: number) {
    const pl = this.g.player;
    this.syncNow();
    const M = this.town.group.matrixWorld;
    if (this.havePrev && (this.onAmble || this.climb)) {
      // carried along by the shell: move with it since the last frame
      _m.copy(this.prev).invert().premultiply(M);
      pl.pos.applyMatrix4(_m);
      _q.setFromRotationMatrix(_m);
      pl.facing.applyQuaternion(_q);
      pl.sync();
    }
    this.prev.copy(M); this.havePrev = true;
    this.town.update(dt, t, this.g.camera);
    this.umbrella.update(dt, t, pl);
    if (this.umbrella.shown) { pl.pose = { ...pl.pose, holdUp: this.umbrella.k }; this.g.fold.root.visible = false; }
    else if (pl.pose.holdUp) { const { holdUp: _h, ...rest } = pl.pose; void _h; pl.pose = rest; this.g.fold.root.visible = true; }
    const free = this.g.mode === 'play' && !this.g.rig.override;
    this.see.update(dt, free, this.g.camera, pl.pos.clone().addScaledVector(pl.up, 0.9), this.g.renderer);
  }

  // ------------------------------------------------------------------ the ropes and ladders

  private ropePos(line: Line, s: number, out = new THREE.Vector3()) {
    const c = line.curve.getPointAt(clamp(s / line.len));
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
