// World 2, the Sky Isles: moving around. Ties the flight model (flight.ts) to the game while you are in World 2:
// Fold the paper glider as a real wing under Nilo (KiteWing, pattern 'nilo'), lying prone with hood and cape
// flapping, folding back into Fold on landing; updraft columns that lift you; cloud pads that bounce you and
// squash; island rock you glide beside and under (never through); the soft fall into the cloud sea, where a
// cloud raft (or now and then a young whale) catches you and floats you up to the nearest island; and the ride
// on Windmill Isle's sail. Everything here is reset to null outside World 2, so World 1 runs as it always did.
import * as THREE from 'three';
import type { Game } from '../../game';
import type { Player } from '../../player/player';
import { KiteWing } from './kiteWing';
import { CloudPad } from './cloudPad';
import { SkyWhale } from './whale';
import { newGlider, type GliderState } from './flight';
import { UPDRAFTS, AQ_DECK, AQ_KERB } from './layout';
import { onIsle, isleAt, pushOutOfIsles, sky, type Isle } from './terrain';
import { SKY_MOVE } from '../../data/skyWords';
import type { SkyWorld } from './world';

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();

/** Fold, opened out into a paper glider under Nilo. */
class NiloWing {
  readonly wing: KiteWing;
  state: 'off' | 'open' | 'land' = 'off';
  private t = 0;
  private foldK = 1;
  private upright = 0;
  private rigged = false;
  private scarfAt = new THREE.Object3D();
  private capeAt = new THREE.Object3D();
  constructor(private pl: Player) {
    this.wing = new KiteWing({ pattern: 'nilo', span: 3.7 });
    this.wing.root.visible = false;
    this.wing.fold(1);
    pl.root.add(this.wing.root);
    // where the scarf ends and the hood's cape leave Nilo's back
    this.scarfAt.position.set(0.05, 0.62, -0.13); this.capeAt.position.set(0, 0.6, -0.17);
    pl.person.torso.add(this.scarfAt, this.capeAt);
  }
  get shown() { return this.wing.root.visible; }
  private attach() {
    const P = this.pl.person;
    if (P.root.parent === this.wing.rider) return;
    P.root.removeFromParent();
    if (!this.rigged) {
      this.rigged = true;
      this.wing.setRider(P, { anchor: this.scarfAt, color: '#2e3456', length: 2.5, width: 0.4 }, { anchor: this.capeAt, color: '#c49a6c', length: 0.85, width: 0.46 });
    } else this.wing.rider.add(P.root);
    this.pl.motion.inertialize();
  }
  detach() {
    const P = this.pl.person;
    if (P.root.parent !== this.pl.root) { this.pl.root.add(P.root); this.pl.motion.inertialize(); }
    this.wing.root.visible = false;
    this.state = 'off';
    this.foldK = 1; this.upright = 0;
  }
  /** Where the folded bundle is now (world space), for Fold to fly on from. */
  bundleAt(out: THREE.Vector3) { return this.wing.tilt.localToWorld(this.wing.foldPoint(_u.set(0, 0.1, this.wing.nose.z * 0.4), out)); }

  /** After the player's update: open, fly, land and fold, following the glider state. Returns true when it just folded away. */
  update(dt: number, t: number, g: GliderState | null) {
    const pl = this.pl;
    const open = !!g?.open;
    let folded = false;
    if (open && this.state !== 'open') { this.attach(); this.state = 'open'; this.t = 0; this.wing.root.visible = true; }
    else if (!open && this.state === 'open') {
      // touching down: run out under the wing, then fold it; let go in the air: it folds straight back into Fold
      if (pl.grounded) { this.state = 'land'; this.t = 0; }
      else { this.detach(); return true; }
    }
    this.t += dt;
    const sp = pl.vel.clone().projectOnPlane(pl.up).length();
    if (this.state === 'open') {
      this.foldK = Math.max(0, this.foldK - dt / 0.32);
      this.upright = Math.max(0, this.upright - dt / 0.25);
    } else if (this.state === 'land') {
      // touch down, run a few steps under the wing, then it folds back into Fold
      this.upright = Math.min(1, this.upright + dt / 0.22);
      if (this.t > 0.45 || !pl.grounded && this.t > 0.9) this.foldK = Math.min(1, this.foldK + dt / 0.7);
      if (this.foldK >= 1 && this.t > 1.25) { this.detach(); folded = true; }
    }
    if (this.state === 'off') return folded;
    const w = this.wing;
    w.fold(this.foldK);
    const speed = g ? g.speed + g.boost : sp;
    const dive = g ? clamp(-g.pitch / 0.62) : 0;
    w.update(dt, t, {
      // the wing's cloth and ribbons are tuned for race speeds: a glide reads as a brisk cruise
      speed: this.state === 'land' ? Math.max(3, sp) : Math.max(14, speed * 1.6),
      bank: this.state === 'open' && g ? g.bank : 0,
      pitch: this.state === 'open' && g ? g.pitch * 0.6 + (g.openT < 0.4 ? 0.25 * (1 - g.openT / 0.4) : 0) : 0.05,
      dive: this.state === 'open' ? dive : 0,
      upright: this.upright, run: pl.grounded ? sp : 0,
    });
    // keep the rider's feet (the person's root) on the player's position: move the wing, not Nilo
    _v.copy(w.rider.position).applyQuaternion(w.tilt.quaternion).add(w.tilt.position);
    w.root.position.copy(_v).negate();
    return folded;
  }
}

/** A carrier for the soft fall: a cloud raft or a young whale. */
interface Rescue {
  phase: 'sink' | 'catch' | 'rise' | 'hop';
  t: number;
  whale: boolean;
  /** Path (world space) from under the cloud to beside the island's lip. */
  curve: THREE.CubicBezierCurve3;
  /** Where he steps off onto the island (world). */
  land: THREE.Vector3;
  from: THREE.Vector3;
  face: THREE.Vector3;
  dur: number;
}

export class SkyMove {
  readonly wingVis: NiloWing;
  private drafts: { dir: THREE.Vector3; r0: number; r1: number; rad: number }[] = [];
  lastSafe: THREE.Vector3 | null = null;
  private safeT = 0;
  rescue: Rescue | null = null;
  private raft: CloudPad | null = null;
  private whale: SkyWhale | null = null;
  private rescues = 0;
  active = false;
  private hinted = false;
  private sail: { phase: 'climb' | 'grab' | 'ride'; t: number; from: THREE.Vector3; stock: number; peak: number; rising: boolean } | null = null;
  /** Story hook: Nilo let go at the top of the windmill's sail. */
  onSailTop: (() => void) | null = null;
  /** Extra lift added everywhere (the race's festival wind keeps you near the course's height); may be negative. */
  extraLift: ((pos: THREE.Vector3) => number) | null = null;
  /** Story hook: a fall into the cloud sea ended (he is back on an island). */
  onRescued: (() => void) | null = null;

  constructor(private g: Game, private world: SkyWorld, private idx: number) {
    const p = world.p;
    this.wingVis = new NiloWing(g.player);
    for (const u of UPDRAFTS) {
      const d = p.dirRiver(u.lat, u.off / (p.R * Math.PI / 180 * Math.sin(u.lat * Math.PI / 180)));
      this.drafts.push({ dir: d, r0: p.R + 3, r1: p.R + 4 + u.h, rad: 3.6 });
    }
    // the windmill on Windmill Isle: climb up and ride a sail over the top
    const mill = world.dressing.refs.windmill;
    if (mill) {
      world.root.updateMatrixWorld(true);
      const foot = mill.localToWorld(new THREE.Vector3(0, 0.4, 3.4));
      g.contents[idx].interactables.push({
        id: 'skySail', world: idx, pos: foot, radius: 2.6,
        label: () => (this.sail || this.rescue ? null : SKY_MOVE.sailPrompt),
        act: () => this.startSail(),
      });
    }
  }

  // ------------------------------------------------------------------ the rules the player obeys in World 2

  private lift = (pos: THREE.Vector3) => {
    const p = this.world.p;
    _v.copy(pos).sub(p.center);
    const r = _v.length(); _v.divideScalar(r);
    let k = 0;
    for (const d of this.drafts) {
      if (r < d.r0 - 2 || r > d.r1 + 5) continue;
      const dist = Math.acos(clamp(_v.dot(d.dir), -1, 1)) * r;
      if (dist > d.rad) continue;
      k = Math.max(k, sstep(d.rad, d.rad * 0.35, dist) * sstep(d.r1 + 5, d.r1 - 3, r) * sstep(d.r0 - 2, d.r0 + 2, r));
    }
    return this.extraLift ? k + this.extraLift(pos) : k;
  };

  private collide = (pl: Player) => {
    const p = this.world.p;
    // cloud pads: land on one and it squashes and throws you up again
    const vU = pl.vel.dot(pl.up);
    if (vU < 0.5) {
      const r = pl.pos.distanceTo(p.center);
      for (const pad of this.world.pads) {
        _w.copy(pad.root.position); // planet-local (the sky world sits at the planet's centre)
        const pr = _w.length();
        const top = pr + pad.topY;
        if (r > top + 0.2 || r < top - 0.9) continue;
        _u.copy(pl.pos).sub(p.center).normalize();
        const dist = Math.acos(clamp(_u.dot(_w.divideScalar(pr)), -1, 1)) * r;
        if (dist > pad.size * 0.5) continue;
        const k = clamp(-vU / 12, 0.25, 1);
        pad.squash(0.4 + k * 0.6);
        pl.pos.copy(_u).multiplyScalar(top + 0.02).add(p.center);
        const up = Math.min(14, Math.max(10.5, -vU * 0.55 + 6));
        pl.vel.addScaledVector(_u, up - vU);
        pl.grounded = false; pl.squash = 0.3;
        if (pl.glider) pl.glider.open = false;
        this.g.sound.sfxPlay('soft');
        this.g.fold.hop();
        break;
      }
    }
    // the aqueducts: the low kerb along each outer edge keeps you on the parapet walk
    {
      _u.copy(pl.pos).sub(p.center);
      const r = _u.length(); _u.divideScalar(r);
      const lim = AQ_DECK - AQ_KERB - 0.3;
      if (!isleAt(p, _u)) {
        const rn = p.riverNearest(_u);
        if (rn.t > 0.01 && rn.t < 0.995 && rn.dist > lim && rn.dist < AQ_DECK + 0.6) {
          const deckR = p.R + p.bedAt(rn.t) + p.cfg.waterDepth + 0.45;
          if (r > deckR - 0.6 && r < deckR + 1.4) {
            const c = p.pathPoint(rn.t, _w);
            const tan = c.addScaledVector(_u, -c.dot(_u)).normalize();
            _u.addScaledVector(tan, (rn.dist - lim) / p.R).normalize();
            pl.pos.copy(_u).multiplyScalar(r).add(p.center);
            const vo = pl.vel.dot(tan);
            if (vo < 0) pl.vel.addScaledVector(tan, -vo);
          }
        }
      }
    }
    // island rock: slide along the cliffs and under the undersides, never through them
    _v.copy(pl.pos).sub(p.center);
    if (pushOutOfIsles(p, _v, pl.vel)) pl.pos.copy(_v).add(p.center);
  };

  private floor = (dir: THREE.Vector3, r: number) => this.world.p.groundBelow(dir, r);

  /** Called every frame (any mode): switch the World 2 rules on or off. */
  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    const pl = this.g.player;
    if (!on) {
      pl.glider = null; pl.liftAt = null; pl.collide = null; pl.diveHeld = false;
      this.g.rig.floor = null; this.g.rig.follow = null;
      this.wingVis.detach();
      this.g.fold.root.visible = true;
      this.g.camera.fov = 58; this.g.camera.updateProjectionMatrix();
      this.endRescue();
    } else {
      pl.liftAt = this.lift; pl.collide = this.collide;
      this.g.rig.floor = this.floor;
    }
  }

  /** Fold can be a glider here (the Step 1 intro sets the flag; tests may too). */
  get canGlide() { return this.g.flags.has('form:glider'); }

  // ------------------------------------------------------------------ play

  /** In updatePlay, before the player moves: true when this takes over the frame (the soft fall, the sail ride). */
  takeOver(dt: number): boolean {
    if (this.rescue) { this.updateRescue(dt); return true; }
    if (this.sail) { this.updateSail(dt); return true; }
    const pl = this.g.player;
    if (this.canGlide) { pl.glider ??= newGlider(); } else pl.glider = null;
    const inp = this.g.input;
    pl.diveHeld = !!pl.glider?.open && (inp.key('KeyC') || inp.key('ControlLeft') || inp.key('KeyX') || inp.key('ShiftLeft') || inp.key('ShiftRight'));
    return false;
  }

  /** In updatePlay, after the player moved. */
  afterMove() {
    const pl = this.g.player, p = this.world.p;
    const r = pl.pos.distanceTo(p.center);
    // remember the last good ground on an island, well in from its lip
    if (pl.grounded && !pl.onDeck && onIsle(p, pl.up, 2.2)) {
      this.safeT += 1 / 60;
      if (this.safeT > 0.3) (this.lastSafe ??= new THREE.Vector3()).copy(pl.up);
    } else this.safeT = 0;
    // the first time off an edge with the glider: how to fly
    if (pl.glider && !pl.grounded && !this.hinted && r - p.groundBelow(pl.up, r) > 3) { this.hinted = true; this.g.hud.notify(SKY_MOVE.glideHint); }
    // into the cloud sea: something soft comes to catch you
    if (!pl.onDeck && r < p.R + 4.2) this.startRescue();
  }

  /** Every frame in World 2 (after the player and Fold have moved): the wing, the camera, the cloth. */
  frame(dt: number, t: number) {
    const pl = this.g.player, g = pl.glider;
    const folded = this.wingVis.update(dt, t, g);
    if (folded) { this.wingVis.bundleAt(this.g.fold.pos); this.g.fold.hop(); }
    this.g.fold.root.visible = !this.wingVis.shown && !this.rescue?.whale;
    if (g?.open && g.openT < dt * 1.5) this.g.sound.sfxPlay('paper');
    // the camera swings in behind the glide, and widens a little with speed
    const rig = this.g.rig;
    rig.follow = g?.open ? g.heading : null; rig.followK = 1;
    const sp = g?.open ? g.speed + g.boost : 0;
    const fov = 58 + clamp((sp - 10) / 14) * 9;
    const cam = this.g.camera;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov += (fov - cam.fov) * (1 - Math.exp(-3 * dt)); cam.updateProjectionMatrix(); }
    // the wind of the flight in his hood, scarf and coat
    if (g?.open || !pl.grounded) {
      _q.copy(pl.root.quaternion).invert();
      pl.windLocal.addScaledVector(_v.copy(pl.vel).applyQuaternion(_q), -0.18);
    }
    if (this.raft) this.raft.update(dt, t);
    if (this.whale && this.whale.root.visible) this.whale.update(dt, t);
    if (this.fade) this.updateFade(dt);
  }

  // ------------------------------------------------------------------ the soft fall

  private carrierTop(out: THREE.Vector3) {
    if (this.rescue?.whale && this.whale) return this.whale.rideAnchor.getWorldPosition(out);
    const pad = this.raft!;
    pad.root.updateMatrixWorld(true);
    return pad.root.localToWorld(out.set(0, pad.topY, 0));
  }

  private startRescue() {
    if (this.rescue) return;
    const g = this.g, p = this.world.p, pl = g.player;
    this.rescues++;
    const whale = this.rescues % 3 === 2;
    // which island: the last safe ground's, else the nearest
    const T = sky(p);
    let isle: Isle | null = this.lastSafe ? isleAt(p, this.lastSafe) : null;
    if (!isle) {
      let best = -2;
      for (const is of T.isles) { if (is.def.islet || is.def.id === 'drift') continue; const c = is.up.dot(pl.up); if (c > best) { best = c; isle = is; } }
    }
    const is = isle!;
    // the lip nearest to where he fell, and a spot a little way in from it
    const q = is.toLocal(pl.up);
    let a = Math.atan2(q.z, q.x);
    let rim = is.shape.outline(a);
    let inX = Math.cos(a) * (rim - 3.5), inZ = Math.sin(a) * (rim - 3.5);
    let inDir = is.dirAt(inX, inZ);
    if (!onIsle(p, inDir, 1.5)) {
      // a notch or a waterfall there: use the last safe spot's side instead
      const s = this.lastSafe ? is.toLocal(this.lastSafe) : { x: 0, z: 0 };
      a = Math.atan2(s.z || 1e-3, s.x || 1e-3); rim = is.shape.outline(a);
      inX = Math.cos(a) * (rim - 3.5); inZ = Math.sin(a) * (rim - 3.5);
      inDir = is.dirAt(inX, inZ);
      if (!onIsle(p, inDir, 1.2)) inDir = this.lastSafe?.clone() ?? is.up.clone();
    }
    const land = p.surfacePoint(inDir, 0.05);
    const lipH = is.def.top + is.shape.edgeY(a);
    const end = is.toPlanet(Math.cos(a) * (rim + 2.6), lipH - is.def.top + 0.4, Math.sin(a) * (rim + 2.6)).add(p.center);
    const from = pl.pos.clone();
    const startUp = from.clone().sub(p.center).normalize();
    const s0 = startUp.clone().multiplyScalar(p.R + 1.4).add(p.center);
    const endUp = end.clone().sub(p.center).normalize();
    const out = end.clone().sub(land).projectOnPlane(endUp).normalize();
    const curve = new THREE.CubicBezierCurve3(
      s0, s0.clone().addScaledVector(startUp, 9),
      end.clone().addScaledVector(out, 7).addScaledVector(endUp, -4), end,
    );
    const dist = s0.distanceTo(end);
    this.rescue = { phase: 'sink', t: 0, whale, curve, land, from, face: land.clone().sub(end).projectOnPlane(endUp).normalize(), dur: clamp(dist / 7, 3.6, 6.5) };
    if (pl.glider) pl.glider.open = false;
    pl.vel.set(0, 0, 0);
    // the carrier comes up from under the cloud tops
    const below = s0.clone().addScaledVector(startUp, -6);
    if (whale) {
      if (!this.whale) {
        this.whale = new SkyWhale({ length: 16, seed: 7, birds: 3, detail: 'low', flock: 0 });
        this.whale.swim = 0.4;
        g.scene.add(this.whale.root);
      }
      this.whale.root.visible = true;
      this.placeWhale(below, startUp, this.rescue.face);
    } else {
      if (!this.raft) { this.raft = new CloudPad({ size: 3.9, seed: 97 }); g.scene.add(this.raft.root); }
      this.raft.root.visible = true;
      this.raft.root.position.copy(below);
      this.raft.root.quaternion.setFromUnitVectors(_u.set(0, 1, 0), startUp);
    }
    g.sound.sfxPlay('soft');
    g.fold.feel('scared');
  }

  private placeWhale(at: THREE.Vector3, up: THREE.Vector3, ahead: THREE.Vector3) {
    const w = this.whale!;
    const a = ahead.clone().projectOnPlane(up).normalize();
    if (a.lengthSq() < 0.5) a.copy(new THREE.Vector3(1, 0, 0).projectOnPlane(up).normalize());
    // the ride anchor (on the back, a quarter of the way from the snout) goes where the feet go
    w.root.position.set(0, 0, 0); w.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, a).normalize(), up, a));
    w.root.updateMatrixWorld(true);
    const off = w.rideAnchor.getWorldPosition(new THREE.Vector3());
    w.root.position.copy(at).sub(off);
  }

  private placeCarrier(at: THREE.Vector3, up: THREE.Vector3, face: THREE.Vector3) {
    if (this.rescue?.whale) { this.placeWhale(at, up, face); return; }
    const pad = this.raft!;
    pad.root.quaternion.setFromUnitVectors(_u.set(0, 1, 0), up);
    pad.root.position.copy(at).addScaledVector(up, -pad.topY);
  }

  private updateRescue(dt: number) {
    const g = this.g, p = this.world.p, pl = g.player, R = this.rescue!;
    const inp = g.input;
    const k = inp.key('Space') && R.phase === 'rise' ? 2.5 : 1;
    R.t += dt * k;
    const up = pl.pos.clone().sub(p.center).normalize();
    if (R.phase === 'sink') {
      // sinking softly into the cloud tops; the carrier comes up under him
      const e = sstep(0, 0.8, R.t);
      const goal = R.curve.getPoint(0);
      pl.pos.lerpVectors(R.from, goal, e);
      const below = goal.clone().addScaledVector(up, -6 + 6 * sstep(0.2, 0.85, R.t));
      this.placeCarrier(below, up, R.face);
      pl.grounded = false; pl.up.copy(up);
      pl.animate(dt, 0, false); pl.sync();
      if (R.t >= 0.85) {
        R.phase = 'rise'; R.t = 0;
        pl.squash = 0.3; pl.grounded = true;
        if (!R.whale) this.raft!.squash(0.9);
        g.sound.sfxPlay('land');
        g.hud.notify(R.whale ? SKY_MOVE.rescueWhale : SKY_MOVE.rescuePad);
        g.fold.feel('happy'); g.fold.hop();
        pl.facing.copy(R.face).projectOnPlane(up).normalize();
      }
      return;
    }
    if (R.phase === 'rise') {
      const u = sstep(0, 1, R.t / R.dur);
      const at = R.curve.getPoint(u);
      const cu = at.clone().sub(p.center).normalize();
      const ahead = R.curve.getTangent(Math.min(0.999, u + 0.01)).projectOnPlane(cu).normalize();
      this.placeCarrier(at, cu, R.whale ? ahead : R.face);
      this.carrierTop(pl.pos);
      pl.up.copy(cu); pl.grounded = true; pl.vel.set(0, 0, 0);
      pl.facing.lerp(_v.copy(R.face).projectOnPlane(cu).normalize(), 1 - Math.exp(-3 * dt)).projectOnPlane(cu).normalize();
      pl.animate(dt, 0, false); pl.sync();
      if (R.t >= R.dur) { R.phase = 'hop'; R.t = 0; R.from = pl.pos.clone(); pl.onJump?.(); pl.squash = -0.2; }
      return;
    }
    // the hop onto the island
    const e = clamp(R.t / 0.75);
    const pos = R.from.clone().lerp(R.land, e);
    const pu = pos.clone().sub(p.center).normalize();
    pos.addScaledVector(pu, Math.sin(Math.PI * e) * 1.6);
    pl.pos.copy(pos); pl.up.copy(pu); pl.grounded = e >= 1;
    pl.facing.copy(R.face).projectOnPlane(pu).normalize();
    pl.animate(dt, e < 1 ? 3 : 0, false); pl.sync();
    if (e >= 1) {
      pl.vel.set(0, 0, 0); pl.grounded = true;
      pl.onLand?.(5);
      this.leaveCarrier();
      this.rescue = null;
      this.onRescued?.();
    }
  }

  /** The carrier sinks back down into the clouds. */
  private fade: { t: number; whale: boolean; up: THREE.Vector3; base: THREE.Vector3; face: THREE.Vector3 } | null = null;
  private leaveCarrier() {
    const R = this.rescue!;
    const base = new THREE.Vector3();
    if (R.whale) base.copy(this.whale!.root.position); else base.copy(this.raft!.root.position);
    this.fade = { t: 0, whale: R.whale, up: base.clone().sub(this.world.p.center).normalize(), base, face: R.face.clone() };
  }
  private updateFade(dt: number) {
    const f = this.fade!;
    f.t += dt;
    const k = sstep(0, 3.5, f.t);
    if (f.whale && this.whale) {
      // the whale swims away and down
      this.whale.root.position.copy(f.base).addScaledVector(f.up, -k * 18).addScaledVector(_v.set(0, 0, 1).applyQuaternion(this.whale.root.quaternion), k * 22);
    } else if (this.raft) this.raft.root.position.copy(f.base).addScaledVector(f.up, -k * 14);
    if (f.t > 3.6) { if (this.whale) this.whale.root.visible = false; if (this.raft) this.raft.root.visible = false; this.fade = null; }
  }
  private endRescue() {
    this.rescue = null; this.fade = null;
    if (this.whale) this.whale.root.visible = false;
    if (this.raft) this.raft.root.visible = false;
  }

  // ------------------------------------------------------------------ the windmill sail

  private tip(i: number, out: THREE.Vector3) {
    const mill = this.world.dressing.refs.windmill;
    const spin = mill.userData.rotor as THREE.Object3D;
    const L = (mill.userData.sailLen as number | undefined) ?? 6.5;
    const a = i * Math.PI / 2 + 0.3;
    spin.updateMatrixWorld(true);
    // the outer end of the stock's lattice (hands on the last sail bar)
    out.set(-Math.sin(a) * (L - 0.5) + Math.cos(a) * 0.4, Math.cos(a) * (L - 0.5) + Math.sin(a) * 0.4, 0.2);
    return spin.localToWorld(out);
  }

  private startSail() {
    const g = this.g, pl = g.player;
    const spin = this.world.dressing.refs.windmill.userData.rotor as THREE.Object3D;
    // the sails turn faster while you ride one (a gust picks up)
    this.world.dressing.town.speedUp(spin, 3.2);
    this.sail = { phase: 'climb', t: 0, from: pl.pos.clone(), stock: 0, peak: -1e9, rising: false };
    if (pl.glider) pl.glider.open = false;
    pl.vel.set(0, 0, 0);
    g.sound.sfxPlay('whoosh');
  }

  private endSail() {
    const spin = this.world.dressing.refs.windmill.userData.rotor as THREE.Object3D;
    this.world.dressing.town.speedUp(spin, 1);
    this.sail = null;
  }

  private updateSail(dt: number) {
    const g = this.g, p = this.world.p, pl = g.player, s = this.sail!;
    const mill = this.world.dressing.refs.windmill;
    s.t += dt;
    const millPos = mill.getWorldPosition(new THREE.Vector3());
    const mUp = millPos.clone().sub(p.center).normalize();
    const toMill = millPos.clone().sub(pl.pos).projectOnPlane(mUp).normalize();
    if (s.phase === 'climb') {
      // up the ivy on the tower's face to where the sails sweep past
      const k = sstep(0, 1.6, s.t);
      const grab = mill.localToWorld(new THREE.Vector3(0, 7.2, 2.55));
      pl.pos.lerpVectors(s.from, grab, k);
      pl.up.copy(pl.pos).sub(p.center).normalize();
      pl.facing.copy(toMill);
      pl.grounded = true;
      pl.animate(dt, 2.5, true); pl.sync();
      if (s.t > 1.6) {
        // the stock whose tip is nearest, coming down past
        let best = 1e9;
        for (let i = 0; i < 4; i++) { const d = this.tip(i, _v).distanceTo(pl.pos); if (d < best) { best = d; s.stock = i; } }
        s.phase = 'grab'; s.t = 0; s.from = pl.pos.clone();
      }
      return;
    }
    const tip = this.tip(s.stock, new THREE.Vector3());
    const tu = tip.clone().sub(p.center).normalize();
    const hang = tip.clone().addScaledVector(tu, -1.55);
    if (s.phase === 'grab') {
      const k = sstep(0, 0.4, s.t);
      pl.pos.lerpVectors(s.from, hang, k);
      if (s.t >= 0.4) { s.phase = 'ride'; s.t = 0; g.sound.sfxPlay('bump'); }
    } else {
      pl.pos.copy(hang);
      const h = tip.distanceTo(p.center);
      if (h > s.peak) { s.peak = h; s.rising = true; }
      // over the top: let go
      if (s.rising && h < s.peak - 0.05 && s.t > 0.8) {
        const nxt = this.tip(s.stock, new THREE.Vector3());
        void nxt;
        pl.vel.copy(toMill).multiplyScalar(-1.5).addScaledVector(tu, 4.5);
        pl.grounded = false;
        this.endSail();
        if (pl.glider) g.hud.notify(SKY_MOVE.sailLetGo);
        g.sound.sfxPlay('whoosh');
        this.onSailTop?.();
        return;
      }
    }
    pl.up.copy(tu); pl.facing.copy(toMill).projectOnPlane(tu).normalize();
    pl.grounded = false;
    pl.animate(dt, 0, true); pl.sync();
  }
}

