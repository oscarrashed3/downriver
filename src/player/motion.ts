// Nilo's body in motion: feet that plant and stay put, legs solved to reach them, hips that drop and sway,
// shoulders that turn against the hips, arms that swing with a lag, lean and bank, a head that leads,
// and cloth (coat panels, hood tip, scarf, satchel, lantern) that hangs on springs and swings with every change.
//
// Person.animate still poses everything first (sitting, kneeling, talking, the roll's tuck...). This layer then
// takes over the legs, hips and arms while he is on his feet, and adds the secondary motion on top, always.
// Approach after David Rosen's procedural animation (GDC 2014): a few hand-tuned poses, blended by code,
// with springs and foot placement doing the rest.
import * as THREE from 'three';
import type { Person } from './person';
import type { Planet } from '../world/planet';
import { clamp, lerp } from '../world/noise';

const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const frac = (x: number) => x - Math.floor(x);

/** A damped spring on one number: freq in Hz, damping 1 = critical, below 1 overshoots a little. */
export class Spring {
  x = 0; v = 0;
  constructor(public freq: number, public damp: number, x0 = 0) { this.x = x0; }
  step(target: number, dt: number) {
    const w = Math.PI * 2 * this.freq;
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) { const a = -w * w * (this.x - target) - 2 * this.damp * w * this.v; this.v += a * h; this.x += this.v * h; }
    return this.x;
  }
  reset(x = 0) { this.x = x; this.v = 0; }
}

/** A part that hangs (or stands up, like the hood tip) and swings on a spring when the body accelerates. */
class Swinger {
  sx: Spring; sz: Spring;
  private prev = new THREE.Vector3(); private vel = new THREE.Vector3(); private has = false;
  private q = new THREE.Quaternion();
  constructor(public obj: THREE.Object3D, freq: number, damp: number, public gain: number, public up = false, public limit = 0.9) {
    this.sx = new Spring(freq, damp); this.sz = new Spring(freq, damp);
  }
  /** World acceleration of the pivot, turned into the parent's frame, drives the swing. Returns [x, z] angles. */
  update(dt: number, extraX = 0, extraZ = 0): [number, number] {
    const p = this.obj.getWorldPosition(_v1);
    let ax = 0, az = 0;
    if (this.has && dt > 1e-4) {
      const v = _v2.subVectors(p, this.prev).divideScalar(dt);
      const a = _v3.subVectors(v, this.vel).divideScalar(dt);
      this.vel.copy(v);
      // into the parent's frame
      this.obj.parent!.getWorldQuaternion(this.q).invert();
      a.applyQuaternion(this.q);
      // a hanging part lags behind: speeding forward swings its tip back (+x rotation), sideways the other way
      const s = this.up ? -1 : 1;
      ax = clamp(a.z * this.gain * s, -this.limit, this.limit);
      az = clamp(-a.x * this.gain * s, -this.limit, this.limit);
      if (a.lengthSq() > 4e4) { ax = 0; az = 0; } // a teleport, not a motion
    } else this.vel.set(0, 0, 0);
    this.prev.copy(p); this.has = true;
    return [this.sx.step(ax + extraX, dt), this.sz.step(az + extraZ, dt)];
  }
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

export interface MotionInput {
  planet: Planet;
  pos: THREE.Vector3; up: THREE.Vector3; facing: THREE.Vector3;
  /** Where the stick points (zero when let go). */
  moveDir: THREE.Vector3;
  grounded: boolean; onDeck: boolean; vUp: number;
  /** 0..1: how much the body is doing something else (sitting, kneeling, rolling, climbing...). */
  busy: number;
  /** 0..1 crouch from a hard landing. */
  crouch: number;
  /** Skidding to a stop before turning round, 0..1. */
  skid: number;
  /** Wind in the body's own frame. */
  wind: THREE.Vector3;
  /** Run held. */
  running: boolean;
  /** Gliding with the cloak spread. */
  gliding?: boolean;
}

interface Foot { released: boolean; planted: boolean; plant: THREE.Vector3; lift: THREE.Vector3; pos: THREE.Vector3; wasStance: boolean; heel: number; seq: number; over: boolean }

const L1 = 0.35, L2 = 0.27, ANKLE_H = 0.08;
const JOINTS = ['hips', 'torso', 'chest', 'thigh0', 'thigh1', 'knee0', 'knee1', 'ankle0', 'ankle1', 'sh0', 'sh1', 'el0', 'el1', 'head'] as const;

export class Motion {
  airFrames = 0;
  airT = 0;
  feet: Foot[] = [0, 1].map(() => ({ released: false, planted: true, plant: new THREE.Vector3(), lift: new THREE.Vector3(), pos: new THREE.Vector3(), wasStance: true, heel: 0, seq: 0, over: false }));
  phase = 0;
  /** How much the legs follow the feet (vs Person's own pose). */
  private legW = new Spring(4, 1, 0);
  private armW = new Spring(3, 1, 0);
  private airW = new Spring(5, 0.9, 0);
  private rise = new Spring(6, 0.8, 0);
  private reach = new Spring(7, 0.9, 0);
  private glideW = new Spring(3, 0.9, 0);
  private leadLeg = 0;
  private lean = new Spring(2.2, 0.55);
  private bank = new Spring(2.0, 0.7);
  private headLead = new Spring(3.5, 0.8);
  private hipDrop = new Spring(5, 0.6);
  private armSw = [new Spring(5, 0.5), new Spring(5, 0.5)];
  private elb = [new Spring(4, 0.45), new Spring(4, 0.45)];
  private wristS = [new Spring(4.5, 0.35), new Spring(4.5, 0.35)];
  private coat: Swinger[] = [];
  private flare: Spring[] = [];
  private tip: Swinger | null = null;
  private scarf: Swinger[] = [];
  private satchel: Swinger | null = null;
  private lantern: Swinger | null = null;
  private lastVel = new THREE.Vector3();
  private lastPos = new THREE.Vector3(); private havePos = false; private measured = new THREE.Vector3();
  private lastFacing = new THREE.Vector3(0, 0, 1);
  private started = false;
  private t = 0;
  private idleShift = 0; private idleT = 3; private tugT = 0; private lookT = 6; private look = new Spring(1.5, 0.8);
  // inertialization: the leftover difference between the old and the new pose, fading out
  private inert: Record<string, THREE.Euler> = {};
  private last: Record<string, THREE.Euler> = {};
  private inertT = 1;
  /** A foot came down (for footstep sounds and dust). */
  onPlant?: (i: number, speed: number) => void;
  debug = false; dbg: Record<number, unknown> = {};
  private M = new THREE.Matrix4(); private Mi = new THREE.Matrix4(); private q = new THREE.Quaternion();
  private tmp = new THREE.Object3D();

  constructor(public P: Person, public lantObj?: THREE.Object3D) {
    for (const c of P.coatPanels) { this.coat.push(new Swinger(c.pivot, 1.8, 0.32, 0.012)); this.flare.push(new Spring(2.4, 0.4)); }
    if (P.hoodTip) this.tip = new Swinger(P.hoodTip, 2.6, 0.3, 0.01, true, 0.45);
    P.scarfTail.forEach((s, i) => this.scarf.push(new Swinger(s, 1.6 + i * 0.4, 0.3, 0.014 + i * 0.004)));
    if (P.satchelPivot) this.satchel = new Swinger(P.satchelPivot, 1.9, 0.3, 0.01, false, 0.6);
    if (lantObj) this.lantern = new Swinger(lantObj, 1.5, 0.22, 0.015, false, 1.0);
  }

  /** Snap to a new action: from now on the old pose fades out over about 0.2 s instead of crossfading. */
  inertialize() { this.inertT = 0; for (const k of JOINTS) { const l = this.last[k]; if (l) (this.inert[k] ??= new THREE.Euler()).copy(l); } this.pendingInert = true; }
  private pendingInert = false;

  private joints(): Record<string, THREE.Object3D | null> {
    const P = this.P;
    return { hips: P.hips, torso: P.torso, chest: P.chest, thigh0: P.legs[0].thigh, thigh1: P.legs[1].thigh, knee0: P.legs[0].knee, knee1: P.legs[1].knee,
      ankle0: P.ankles[0] ?? null, ankle1: P.ankles[1] ?? null, sh0: P.arms[0].sh, sh1: P.arms[1].sh, el0: P.arms[0].el, el1: P.arms[1].el, head: P.head };
  }

  /** World point -> hips space (the space the thighs hang in). */
  private toHips(world: THREE.Vector3, out: THREE.Vector3) { return out.copy(world).applyMatrix4(this.Mi); }

  update(dt: number, I: MotionInput) {
    const P = this.P;
    if (dt <= 0) return;
    this.t += dt;
    const up = I.up;
    // velocity from where the body actually went (works whatever moved him: walking, the approach, a cutscene)
    if (this.havePos) {
      const jump = I.pos.distanceTo(this.lastPos);
      if (jump > 2) { this.started = false; this.measured.set(0, 0, 0); }
      else this.measured.lerp(_a.subVectors(I.pos, this.lastPos).divideScalar(dt), 1 - Math.exp(-25 * dt));
    }
    this.lastPos.copy(I.pos); this.havePos = true;
    const vTan = _a.copy(this.measured).projectOnPlane(up);
    const v = vTan.length();
    const fwd = _b.copy(I.facing).projectOnPlane(up).normalize();
    const side = _c.crossVectors(up, fwd).normalize(); // +x of the body (Nilo's left)
    // acceleration along and across, turn rate
    const acc = _d.copy(vTan).sub(this.lastVel).divideScalar(dt);
    if (!this.started) { acc.set(0, 0, 0); this.lastFacing.copy(fwd); }
    this.lastVel.copy(vTan);
    const accF = clamp(acc.dot(fwd), -40, 40);
    let turn = Math.atan2(_e.crossVectors(this.lastFacing, fwd).dot(up), this.lastFacing.dot(fwd)) / dt;
    if (!isFinite(turn)) turn = 0;
    this.lastFacing.copy(fwd);

    // ---- how much the legs walk: on the ground and not busy with something else ----
    const lw = this.legW.step((I.grounded || this.airT < 0.12) ? 1 - I.busy : 0, dt);
    const legW = clamp(lw);
    const moving = smooth(0.25, 1.2, v);

    // ---- gait: cadence, stance share and step length come from the real speed ----
    const runK = smooth(2.5, 9.5, v);
    const stopping = v < 0.3 && I.moveDir.lengthSq() < 0.01;
    let cad: number, sf: number, Ls: number;
    if (v < 2.5) { sf = 0.6; Ls = lerp(0.12, 0.5, smooth(0, 2.5, v)); cad = Math.max(1.5, v * sf / Math.max(0.12, Ls)); }
    else { cad = lerp(2.2, 3.3, runK); Ls = lerp(0.42, 0.6, runK); sf = clamp(Ls * cad / v, 0.18, 0.6); }
    if (I.skid > 0) { cad = 0; }

    // matrices: world -> hips space, from where the body is this frame
    this.tmp.position.copy(I.pos);
    {
      const f = fwd, r = _e.crossVectors(up, f).normalize();
      this.M.makeBasis(r, up, f); this.q.setFromRotationMatrix(this.M);
      this.tmp.quaternion.copy(this.q); this.tmp.scale.set(1, 1, 1); this.tmp.updateMatrix();
    }

    // rest stance: the feet a hand apart under the hips
    const rest = (i: number, o: THREE.Vector3) => o.copy(I.pos).addScaledVector(side, (i === 0 ? -1 : 1) * 0.1 * P.H).addScaledVector(fwd, 0.02);
    const ground = (w: THREE.Vector3) => {
      // put a point on the ground under it (the bridge deck counts as ground)
      if (I.onDeck) return w.sub(I.pos).projectOnPlane(up).add(I.pos);
      const d = _f.copy(w).sub(I.planet.center).normalize();
      return I.planet.surfacePoint(d, 0, w);
    };
    if (!this.started) { for (let i = 0; i < 2; i++) { rest(i, this.feet[i].plant); ground(this.feet[i].plant); this.feet[i].pos.copy(this.feet[i].plant); } this.started = true; }

    // ---- advance the step clock ----
    let needStep = false;
    if (stopping) {
      for (let i = 0; i < 2; i++) { const r = rest(i, _f); if (this.feet[i].plant.distanceTo(r) > 0.09 * P.H) needStep = true; }
    }
    const inDouble = (p: number) => { const a = frac(p), b = frac(p + 0.5); return a < sf && b < sf; };
    if (!stopping) this.phase += cad * dt;
    else if (needStep || !inDouble(this.phase) || this.feet.some(f => !f.planted)) { sf = 0.6; this.phase += 1.7 * dt; }
    // a moment off the ground (a bump at a run) keeps the stride; only a real fall tucks the feet under
    this.airT = I.grounded ? 0 : this.airT + dt;
    if (legW < 0.05 || this.airT > 0.12) {
      // in the air or busy: the feet follow the body, ready to land under it
      for (let i = 0; i < 2; i++) { rest(i, this.feet[i].plant); this.feet[i].pos.copy(this.feet[i].plant); this.feet[i].planted = true; this.feet[i].wasStance = true; this.feet[i].seq++; }
      this.airFrames++;
    }

    // ---- each foot: planted while it carries weight, swinging to the next landing spot otherwise ----
    const velDir = v > 0.2 ? _g.copy(vTan).normalize() : _g.copy(fwd);
    for (let i = 0; i < 2; i++) {
      const F = this.feet[i];
      const ph = frac(this.phase + i * 0.5);
      let stance = ph < sf || I.skid > 0 || (stopping && !needStep && inDouble(this.phase));
      // a planted foot left too far behind to reach lifts early, as a real one would, instead of sliding
      if (!stance) F.released = false;
      else if (F.planted && !F.released && I.skid <= 0) {
        const hipW = _k.copy(I.pos).addScaledVector(up, (P.hipY - 0.02) * P.H * 0.92);
        if (F.over || hipW.distanceTo(F.plant) > (L1 + L2 + ANKLE_H * 0.5) * P.H) F.released = true;
      }
      if (F.released) stance = false;
      if (stance && !F.wasStance) {
        F.planted = true; F.plant.copy(F.pos); ground(F.plant); F.seq++;
        if (legW > 0.5) this.onPlant?.(i, v);
        F.heel = 1;
      }
      if (!stance && F.wasStance) { F.planted = false; F.lift.copy(F.plant); }
      F.wasStance = stance;
      if (stance) {
        F.pos.copy(F.plant);
      } else {
        const s = clamp((ph - sf) / (1 - sf));
        const left = (1 - s) * (1 - sf) / Math.max(0.5, cad);
        const land = _h.copy(I.pos).addScaledVector(vTan, left).addScaledVector(velDir, Ls * 0.5 * P.H * (stopping ? 0 : 1))
          .addScaledVector(side, (i === 0 ? -1 : 1) * lerp(0.1, 0.07, runK) * P.H);
        if (stopping) rest(i, land);
        ground(land);
        const e = s * s * (3 - 2 * s);
        F.pos.lerpVectors(F.lift, land, e);
        const h = lerp(0.07, 0.2, runK) * P.H * (stopping ? 0.6 : 1);
        F.pos.addScaledVector(up, h * Math.sin(Math.PI * Math.pow(s, lerp(1, 0.65, runK))));
        F.heel = 0;
      }
      F.heel = Math.max(0, F.heel - dt * 6);
    }

    // ---- hips: drop on contact, rise in flight, sway over the standing foot, turn with the legs ----
    const f0 = frac(this.phase), f1 = frac(this.phase + 0.5);
    const q0 = f0 < sf ? f0 / sf : -1, q1 = f1 < sf ? f1 / sf : -1;
    const stanceQ = Math.max(q0, q1);
    let bob: number;
    if (stanceQ >= 0) bob = -Math.sin(Math.PI * stanceQ) * lerp(0.025, 0.06, runK);
    else { const fl = (Math.min(f0 < sf ? 1 : f0, f1 < sf ? 1 : f1) - sf) / Math.max(0.05, 0.5 - sf); bob = Math.sin(Math.PI * clamp(fl)) * 0.035 * runK; }
    bob *= moving;
    const crouch = I.crouch;
    const drop = this.hipDrop.step(lerp(0.015, 0.11, runK) * moving + crouch * 0.24 + I.skid * 0.12 - bob, dt);
    const sway = (q0 >= 0 && q1 < 0 ? -1 : q1 >= 0 && q0 < 0 ? 1 : 0);
    const swayX = Math.sin(this.phase * Math.PI * 2) * 0.022 * (1 - runK * 0.6) * moving + this.idleShift * 0.02 * (1 - moving);
    void sway;
    const pelvisYaw = Math.sin(this.phase * Math.PI * 2) * lerp(0.1, 0.2, runK) * moving;

    // apply the hips (blended with Person's pose by legW)
    P.hips.position.y = lerp(P.hips.position.y, P.hipY - drop, legW);
    P.hips.position.x = swayX * legW;
    P.hips.rotation.y = pelvisYaw * legW;
    P.hips.rotation.z = -swayX * 1.2 * legW;
    // the upper body turns back against the hips, so the shoulders face forward and twist the other way
    P.torso.rotation.y = lerp(P.torso.rotation.y, -pelvisYaw * 0.55, legW);
    if (P.chest) { P.chest.rotation.y = -pelvisYaw * 0.75 * legW; P.chest.rotation.z = swayX * 1.4 * legW; P.chest.rotation.x = 0; }

    // ---- lean and bank (step 4) ----
    const leanT = clamp(accF * 0.012, -0.3, 0.22) + runK * 0.08 * moving - I.skid * 0.45;
    const lean = this.lean.step(leanT * (1 - I.busy), dt);
    P.torso.rotation.x += lean;
    const bank = this.bank.step(clamp(-turn * v * 0.018, -0.21, 0.21) * (I.grounded ? 1 : 0.3) * (1 - I.busy), dt);
    P.root.rotation.z = bank;

    // ---- legs: two-bone IK to the feet, then the ankle keeps the sole on the ground ----
    P.root.updateMatrix(); P.body.updateMatrix(); P.hips.updateMatrix();
    this.Mi.copy(this.tmp.matrix).multiply(P.root.matrix).multiply(P.body.matrix).multiply(P.hips.matrix).invert();
    const nLocal = _i.copy(up).applyQuaternion(_q.copy(this.q).invert());
    for (let i = 0; i < 2; i++) {
      const F = this.feet[i], leg = P.legs[i], ank = P.ankles[i];
      // the ankle sits a little above the ground point
      const target = this.toHips(_j.copy(F.pos).addScaledVector(up, ANKLE_H * P.H), _j);
      const d = target.sub(leg.thigh.position);
      F.over = F.planted && d.z < 0 && d.length() > L1 + L2 - 0.004; // trailing and out of reach
      const D = clamp(d.length(), 0.05, L1 + L2 - 0.002);
      const lat = Math.atan2(d.x, Math.hypot(d.y, d.z));
      const alpha = Math.atan2(d.z, -d.y);
      const cosK = clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1);
      const knee = Math.PI - Math.acos(cosK);
      const beta = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
      const thighX = -(alpha + beta);
      leg.thigh.rotation.x = lerp(leg.thigh.rotation.x, thighX, legW);
      leg.thigh.rotation.z = lerp(leg.thigh.rotation.z, lat * 0.9, legW);
      leg.thigh.rotation.y = lerp(leg.thigh.rotation.y, 0, legW);
      leg.knee.rotation.x = lerp(leg.knee.rotation.x, knee, legW);
      if (this.debug) {
        leg.thigh.updateMatrix(); leg.knee.updateMatrix();
        const got = _k.set(0, -L2, 0).applyMatrix4(leg.knee.matrix).applyMatrix4(leg.thigh.matrix);
        this.dbg[i] = { err: +got.distanceTo(_j.copy(target).add(leg.thigh.position)).toFixed(3), D: +d.length().toFixed(3), planted: F.planted, legW: +legW.toFixed(2) };
      }
      if (ank) {
        // flat on the ground (with its slope), heel first on contact, rolling onto the toe before lifting off
        const ph = frac(this.phase + i * 0.5);
        const slope = Math.atan2(nLocal.z, nLocal.y);
        let roll = 0;
        if (!F.planted) { const s = clamp((ph - sf) / (1 - sf)); roll = Math.sin(Math.PI * s) * lerp(0.35, 0.9, runK) * (s < 0.5 ? 1 : -0.3); }
        else { const q = ph / sf; roll = -F.heel * 0.25 + smooth(0.6, 1, q) * lerp(0.35, 0.7, runK) * moving; }
        const flat = -(leg.thigh.rotation.x + leg.knee.rotation.x) - P.hips.rotation.x + slope + roll;
        const loose = I.grounded ? 0.15 : clamp(0.35 - I.vUp * 0.03, 0, 0.6); // in the air the toes point down a little
        ank.rotation.x = lerp(loose, flat, legW);
      }
    }

    // ---- arms: swing against the legs with the elbows and wrists trailing (blended in as he moves) ----
    const aw = clamp(this.armW.step(legW * moving * (1 - I.skid), dt));
    for (let i = 0; i < 2; i++) {
      const A = P.arms[i], other = P.legs[1 - i];
      const s = i === 0 ? -1 : 1;
      const swing = this.armSw[i].step(-other.thigh.rotation.x * lerp(1.15, 1.7, runK) * (0.6 + 0.4 * moving) - 0.08 - runK * 0.12, dt); // a full swing from the shoulder, like the legs
      const elT = -(0.45 + runK * 1.15) - Math.max(0, -swing) * 0.6;
      const el = this.elb[i].step(elT, dt);
      A.sh.rotation.x = lerp(A.sh.rotation.x, swing, aw);
      A.sh.rotation.z = lerp(A.sh.rotation.z, (0.2 + runK * 0.2 + Math.abs(swing) * 0.08) * s, aw); // arms held a little away from the body
      A.el.rotation.x = lerp(A.el.rotation.x, el, aw);
      const w = P.wrists[i];
      if (w) w.rotation.x = this.wristS[i].step(0.15 + this.armSw[i].v * 0.06, dt); // relaxed hands that trail the swing
    }
    // skid: arms fly forward for balance
    if (I.skid > 0) for (let i = 0; i < 2; i++) { const A = P.arms[i]; A.sh.rotation.x = lerp(A.sh.rotation.x, -1.1, I.skid); A.sh.rotation.z = lerp(A.sh.rotation.z, (i ? 1 : -1) * 0.5, I.skid); A.el.rotation.x = lerp(A.el.rotation.x, -0.5, I.skid); }

    // ---- in the air: arms up on the way up, out for balance on the way down, legs reaching for the ground ----
    if (I.grounded) this.leadLeg = this.feet[0].planted ? 1 : 0;
    const aW = clamp(this.airW.step(!I.grounded && this.airT > 0.05 ? 1 - I.busy : 0, dt));
    if (aW > 0.01) {
      const rise = this.rise.step(clamp(I.vUp / 6, -1, 1), dt); // +1 going up, -1 falling
      const hDir = _k.copy(I.pos).sub(I.planet.center).normalize();
      const h = I.onDeck ? 0 : I.pos.distanceTo(I.planet.center) - I.planet.surfaceRadius(hDir);
      const reach = clamp(this.reach.step(I.vUp < 0 && h < 1.6 ? 1 - h / 1.6 : 0, dt));
      const gl = clamp(this.glideW.step(I.gliding ? 1 : 0, dt));
      const up_ = Math.max(0, rise), down = Math.max(0, -rise), apex = 1 - Math.abs(rise);
      for (let i = 0; i < 2; i++) {
        const L = P.legs[i], lead = i === this.leadLeg;
        // up: the lead knee drives high, the push leg trails; apex: both tuck; down: they stretch toward the ground
        let th = lead ? -1.05 : 0.3, kn = lead ? 1.45 : 0.55;
        th = lerp(th, lead ? -0.9 : -0.6, apex * 0.8); kn = lerp(kn, lead ? 1.5 : 1.3, apex * 0.8);
        th = lerp(th, lead ? -0.45 : -0.15, down); kn = lerp(kn, lead ? 0.55 : 0.35, down);
        th = lerp(th, lead ? -0.25 : -0.05, reach); kn = lerp(kn, 0.22, reach);
        th = lerp(th, 0.3 + (lead ? -0.12 : 0.12), gl); kn = lerp(kn, 0.45, gl);
        L.thigh.rotation.x = lerp(L.thigh.rotation.x, th, aW); L.knee.rotation.x = lerp(L.knee.rotation.x, kn, aW);
        L.thigh.rotation.z = lerp(L.thigh.rotation.z, (i ? 1 : -1) * (0.04 + down * 0.08), aW);
        const ak = P.ankles[i]; if (ak) ak.rotation.x = lerp(ak.rotation.x, lerp(0.5, 0.05, Math.max(reach, gl * 0.5)), aW);
        const A = P.arms[i], s = i === 0 ? -1 : 1;
        const wob = Math.sin(this.t * 9 + i * 2) * 0.12 * down * (1 - gl);
        let ax = lerp(-0.4, -2.1 + (lead ? 0.5 : 0), up_), az = lerp(0.35, 0.25, up_) * s, ae = lerp(-0.5, -0.35, up_);
        ax = lerp(ax, -0.35 + wob, down); az = lerp(az, (1.05 + wob) * s, down); ae = lerp(ae, -0.45, down);
        ax = lerp(ax, -0.6, apex * 0.5); az = lerp(az, 0.8 * s, apex * 0.5);
        ax = lerp(ax, -0.15, gl); az = lerp(az, 1.35 * s, gl); ae = lerp(ae, -0.15, gl);
        A.sh.rotation.x = lerp(A.sh.rotation.x, ax, aW); A.sh.rotation.z = lerp(A.sh.rotation.z, az, aW); A.el.rotation.x = lerp(A.el.rotation.x, ae, aW);
      }
      P.torso.rotation.x += aW * (up_ * -0.08 + apex * 0.1 + gl * 0.25);
    }

    // ---- head: leads into turns, and keeps a gentle idle life ----
    let want = 0;
    if (I.moveDir.lengthSq() > 0.01) want = Math.atan2(_k.crossVectors(fwd, I.moveDir).dot(up), fwd.dot(I.moveDir));
    const lead = this.headLead.step(clamp(want * 0.6 + turn * 0.06, -0.7, 0.7) * (1 - I.busy), dt);
    // idle: a weight shift every few seconds, now and then a look round, a tug at the strap
    if (v < 0.2 && I.busy < 0.5 && I.grounded) {
      this.idleT -= dt; this.lookT -= dt;
      if (this.idleT < 0) { this.idleT = 2.5 + Math.random() * 3; this.idleShift = this.idleShift > 0 ? -1 : 1; }
      if (this.lookT < 0) { this.lookT = 6 + Math.random() * 6; this.tugT = Math.random() < 0.4 ? 1.6 : 0; }
    } else { this.idleShift = 0; this.tugT = 0; }
    const lookAround = this.look.step(this.lookT < 1.6 && v < 0.2 ? Math.sin(this.t * 2.2) * 0.6 : 0, dt);
    P.head.rotation.y += lead + lookAround;
    P.head.rotation.x += -lean * 0.4;
    // the strap tug: the right hand comes up to the strap at the chest and gives it a little pull
    if (this.tugT > 0) {
      this.tugT -= dt; const k = Math.sin(Math.PI * clamp(this.tugT / 1.6));
      const A = P.arms[0]; A.sh.rotation.x = lerp(A.sh.rotation.x, -0.9, k); A.sh.rotation.z = lerp(A.sh.rotation.z, -0.35, k); A.el.rotation.x = lerp(A.el.rotation.x, -1.6 + Math.sin(this.t * 9) * 0.08 * k, k);
    }
    // breathing, a little more after running
    if (P.chest) P.chest.scale.setScalar(1 + Math.sin(this.t * (1.7 + runK)) * 0.012);

    // ---- secondary motion on springs: coat panels, hood tip, scarf, satchel, lantern ----
    const wind = I.wind;
    const flutter = Math.sin(this.t * 7.3) * 0.04 + Math.sin(this.t * 11.1) * 0.025;
    this.coat.forEach((sw, k) => {
      const c = P.coatPanels[k];
      const legI = c.tangent.z < 0 ? 1 : 0; // panels on +x hang over the left leg (index 1)
      const front = k === 0 || k === 3;
      // the leg underneath pushes its panel forward; running makes the whole hem flare and trail
      const kick = P.legs[legI].thigh.rotation.x * (front ? 0.55 : 0.25);
      const [ax, az] = sw.update(dt, kick + runK * 0.08 * moving + Math.max(0, -wind.z) * 0.1 + flutter * (0.5 + runK), wind.x * 0.1);
      const fl = this.flare[k].step(0.06 + runK * 0.28 * moving + Math.abs(ax) * 0.3 + (I.grounded ? 0 : 0.3), dt);
      c.pivot.quaternion.setFromEuler(_eu.set(clamp(ax, -1, 1), 0, clamp(az, -0.8, 0.8)));
      c.pivot.quaternion.multiply(_q2.setFromAxisAngle(c.tangent, -fl * 0.9));
    });
    if (this.tip) { const [ax, az] = this.tip.update(dt, -runK * 0.12 * moving + flutter * 0.4, -wind.x * 0.05); this.tip.obj.rotation.set(ax, 0, az); }
    this.scarf.forEach((sw, i) => { const [ax, az] = sw.update(dt, 0, 0); sw.obj.rotation.x += ax * (i === 0 ? 1 : 0.6); sw.obj.rotation.z += az * (i === 0 ? 1 : 0.6); });
    if (this.satchel) { const [ax, az] = this.satchel.update(dt, -P.legs[1].thigh.rotation.x * 0.15, 0); this.satchel.obj.rotation.set(ax, 0, az); }
    if (this.lantern) { const [ax, az] = this.lantern.update(dt, 0, 0); this.lantern.obj.rotation.x = ax; this.lantern.obj.rotation.z += az; }

    // ---- inertialization: fade the old pose's leftover into the new one ----
    const J = this.joints();
    if (this.pendingInert) {
      this.pendingInert = false;
      for (const k of JOINTS) { const o = J[k]; const e = this.inert[k]; if (!o || !e) continue; e.set(e.x - o.rotation.x, e.y - o.rotation.y, e.z - o.rotation.z); }
    }
    if (this.inertT < 1) {
      this.inertT = Math.min(1, this.inertT + dt / 0.22);
      const k = Math.pow(1 - this.inertT, 3);
      for (const key of JOINTS) { const o = J[key], e = this.inert[key]; if (!o || !e) continue; o.rotation.x += e.x * k; o.rotation.y += e.y * k; o.rotation.z += e.z * k; }
    }
    for (const key of JOINTS) { const o = J[key]; if (!o) continue; (this.last[key] ??= new THREE.Euler()).copy(o.rotation); }
  }
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(),
  _g = new THREE.Vector3(), _h = new THREE.Vector3(), _i = new THREE.Vector3(), _j = new THREE.Vector3(), _k = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _eu = new THREE.Euler();
