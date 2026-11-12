import * as THREE from 'three';
import { EYE_X, EYE_Y, EYE_Z, EYE_RADIUS } from './ambleHead';

// Old Amble's skeleton: where every joint sits in the rest pose, and the rig that poses it.
//
// Space ("creature space"): Amble faces +Z, up is +Y, the ground is y = 0 and x = 0 is its midline. Metres
// (Nilo is 1.2 m). Every bone has an identity rest rotation, so a bone's rest frame is just its position: a
// part built in creature space is skinned to a bone by its position alone, and a point p riding on bone b
// is found later with b.matrixWorld * (p - REST[b]).
//
// Size: the shell is 49 m long and 36 m wide (an oval, a little longer behind), its rim walk at 15.6 m and
// its top terrace at 22.4 m, so a village of walk-in houses, two windmills and trees fits on it. The legs are
// 5-6 m thick pillars, the belly about 4.4 m off the ground (Nilo walks under it), the head at about 21 m on
// a long, thick neck, the antlers reaching about 34 m. Nose to tail about 64 m.
//
// The rig can: breathe (the body and, a beat later, the shell lift), turn and lift or hang the head along the
// whole neck, plant each foot anywhere by two-bone IK (the knee bends towards a pole; the foot keeps its own
// pitch), hold a front foot off the ground, and walk (a lateral-sequence walk, see AmbleRig.gait). The shell is
// rigid on its own bone, and `shellTop` (in amble.ts) is a frame at the top terrace for the village to ride.

export const BONE = {
  root: 0, body: 1, shell: 2,
  neck0: 3, neck1: 4, neck2: 5, neck3: 6, head: 7,
  earL: 8, earR: 9, eyeL: 10, eyeR: 11, lidL: 12, lidR: 13,
  hipFL: 14, kneeFL: 15, footFL: 16,
  hipFR: 17, kneeFR: 18, footFR: 19,
  hipBL: 20, kneeBL: 21, footBL: 22,
  hipBR: 23, kneeBR: 24, footBR: 25,
  tail0: 26, tail1: 27,
} as const;
export type BoneName = keyof typeof BONE;
export const BONE_COUNT = 28;

export const LEGS = ['FL', 'FR', 'BL', 'BR'] as const;
export type Leg = typeof LEGS[number];
export const legBones = (l: Leg) => [BONE[`hip${l}`], BONE[`knee${l}`], BONE[`foot${l}`]] as const;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The shell's size and its levels (creature space). The shell is a high, lumpy dome: natural rocky ledges
 * step its top into three levels and a shoulder, then its plated flanks bulge out and curl under at a low lip. */
export const SHELL = {
  /** Centre of the oval, on the midline. */
  cz: -4,
  /** Half-width, and half-length in front of and behind the centre. */
  ax: 18.5, azFront: 23.5, azBack: 26,
  /** Superellipse exponent of the outline (2 = an ellipse; more is boxier). */
  pOut: 2.4,
  /** Heights: the crown at the centre, the shoulder where the flanks begin, the lower lip of the edge plates. */
  yTop: 29.6, yLow: 18.0, yLip: 8.2,
  /** The ledges (as a fraction of the outline radius): the crown's edge, the middle terrace's edge and the
   * shoulder's; and where the dome's top turns into the plated flank. */
  rTop: 0.36, rMid: 0.62, rLedge: 0.8, rJoin: 0.86,
} as const;

/** The head's frame: the head bone, the muzzle direction (pitched gently down) and the head's up. */
export const HEAD_POS = V(0, 24.4, 35.4);
export const HEAD_FWD = V(0, -0.3, 1).normalize();
/** The head's size against the head-local profile in ambleHead.ts. */
export const HEAD_SCALE = 1.65;
export const HEAD_SIDE = V(1, 0, 0);
export const HEAD_UP = new THREE.Vector3().crossVectors(HEAD_FWD, HEAD_SIDE).normalize();
/** A point in head-local coordinates (x to the left side, y up, z along the muzzle) in creature space. */
export function headPoint(x: number, y: number, z: number, out = new THREE.Vector3()) {
  const k = HEAD_SCALE;
  return out.copy(HEAD_POS).addScaledVector(HEAD_SIDE, x * k).addScaledVector(HEAD_UP, y * k).addScaledVector(HEAD_FWD, z * k);
}
/** A direction in head-local coordinates, in creature space. */
export function headDir(x: number, y: number, z: number, out = new THREE.Vector3()) {
  return out.set(0, 0, 0).addScaledVector(HEAD_SIDE, x).addScaledVector(HEAD_UP, y).addScaledVector(HEAD_FWD, z).normalize();
}

/** Eyes, ears and antler roots in head-local coordinates (left side; mirror x for the right). */
export const EYE_LOCAL = V(EYE_X, EYE_Y, EYE_Z);
export const EYE_R = EYE_RADIUS * HEAD_SCALE;
export const EAR_LOCAL = V(1.2, 1.3, -0.5);
export const ANTLER_LOCAL = V(0.72, 1.78, 0.25);

/** Legs: hip, knee, ankle (rest). Front knees and hind stifles both point a little forwards. */
const LEG_REST: Record<Leg, [THREE.Vector3, THREE.Vector3, THREE.Vector3]> = {
  FL: [V(9.6, 10.4, 11.0), V(11.2, 6.0, 12.0), V(12.1, 1.7, 11.5)],
  FR: [V(-9.6, 10.4, 11.0), V(-11.2, 6.0, 12.0), V(-12.1, 1.7, 11.5)],
  BL: [V(9.8, 10.4, -18.0), V(11.4, 6.1, -16.8), V(12.3, 1.7, -18.0)],
  BR: [V(-9.8, 10.4, -18.0), V(-11.4, 6.1, -16.8), V(-12.3, 1.7, -18.0)],
};
/** Each foot's centre on the ground (rest), a little ahead of its ankle. */
export const FOOT_REST: Record<Leg, THREE.Vector3> = {
  FL: V(12.2, 0, 11.9), FR: V(-12.2, 0, 11.9), BL: V(12.4, 0, -17.6), BR: V(-12.4, 0, -17.6),
};

/** Rest positions of every bone, creature space. */
export const REST: THREE.Vector3[] = (() => {
  const r: THREE.Vector3[] = new Array(BONE_COUNT);
  r[BONE.root] = V(0, 0, 0);
  r[BONE.body] = V(0, 11.4, -4);
  r[BONE.shell] = V(0, 14.0, SHELL.cz);
  r[BONE.neck0] = V(0, 13.6, 17.5);
  r[BONE.neck1] = V(0, 16.2, 23.6);
  r[BONE.neck2] = V(0, 19.2, 28.3);
  r[BONE.neck3] = V(0, 22.0, 32.0);
  r[BONE.head] = HEAD_POS.clone();
  r[BONE.earL] = headPoint(EAR_LOCAL.x, EAR_LOCAL.y, EAR_LOCAL.z);
  r[BONE.earR] = headPoint(-EAR_LOCAL.x, EAR_LOCAL.y, EAR_LOCAL.z);
  r[BONE.eyeL] = headPoint(EYE_LOCAL.x, EYE_LOCAL.y, EYE_LOCAL.z);
  r[BONE.eyeR] = headPoint(-EYE_LOCAL.x, EYE_LOCAL.y, EYE_LOCAL.z);
  r[BONE.lidL] = r[BONE.eyeL].clone();
  r[BONE.lidR] = r[BONE.eyeR].clone();
  for (const l of LEGS) { const [h, k, f] = legBones(l); [r[h], r[k], r[f]] = LEG_REST[l].map(p => p.clone()); }
  r[BONE.tail0] = V(0, 10.0, -25.5);
  r[BONE.tail1] = V(0, 8.6, -29.0);
  return r;
})();

const PARENT: number[] = (() => {
  const p = new Array(BONE_COUNT).fill(-1);
  p[BONE.body] = BONE.root; p[BONE.shell] = BONE.body;
  p[BONE.neck0] = BONE.body; p[BONE.neck1] = BONE.neck0; p[BONE.neck2] = BONE.neck1; p[BONE.neck3] = BONE.neck2; p[BONE.head] = BONE.neck3;
  for (const b of [BONE.earL, BONE.earR, BONE.eyeL, BONE.eyeR, BONE.lidL, BONE.lidR]) p[b] = BONE.head;
  for (const l of LEGS) { const [h, k, f] = legBones(l); p[h] = BONE.body; p[k] = h; p[f] = k; }
  p[BONE.tail0] = BONE.body; p[BONE.tail1] = BONE.tail0;
  return p;
})();

/** The axis each eyelid turns about to close (head-local forward, as seen on that side), creature space. */
export const LID_AXIS = { L: HEAD_FWD.clone(), R: HEAD_FWD.clone() };

/** Everything the game can set on Amble's pose; the rig eases towards it. */
export interface AmblePose {
  /** -1 head hanging low (thirsty) .. 0 rest .. 1 lifted high. */
  headLift: number;
  /** Turn of the head and neck, radians (+ to Amble's left). */
  headYaw: number;
  /** A foot held off the ground: 0 planted .. 1 lifted and drawn back (a hurt paw). */
  footLift: Record<Leg, number>;
  /** Walk speed in strides per second (0 stands). The lab walks on a treadmill; the game moves the root. */
  walk: number;
  /** Lean of the body, radians: + sits back on the hind legs (pitch), + rolls to the left. */
  pitch: number; roll: number;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _e = new THREE.Euler();
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

/** Rotation taking the frame (dir0, pole0) to (dir, pole). */
const _f0 = new THREE.Vector3(), _f1 = new THREE.Vector3(), _f2 = new THREE.Vector3(), _f3 = new THREE.Vector3();
function frameRot(dir0: THREE.Vector3, pole0: THREE.Vector3, dir: THREE.Vector3, pole: THREE.Vector3, out: THREE.Quaternion) {
  const p0 = _f0.copy(pole0).addScaledVector(dir0, -pole0.dot(dir0)).normalize();
  const s0 = _f1.crossVectors(dir0, p0);
  _m.makeBasis(dir0, p0, s0);
  const p1 = _f2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  const s1 = _f3.crossVectors(dir, p1);
  _m2.makeBasis(dir, p1, s1);
  _m.transpose();
  _m2.multiply(_m);
  return out.setFromRotationMatrix(_m2);
}

interface LegState {
  l: Leg; len1: number; len2: number; dir1: THREE.Vector3; dir2: THREE.Vector3;
  /** Ankle target (creature space) and the foot's pitch. */
  target: THREE.Vector3; footPitch: number;
  /** Where this foot is planted when standing. */
  home: THREE.Vector3;
}

export class AmbleRig {
  bones: THREE.Bone[] = [];
  skeleton: THREE.Skeleton;
  /** The root bone (add it under Amble's root group). */
  rootBone: THREE.Bone;
  pose: AmblePose = { headLift: 0, headYaw: 0, footLift: { FL: 0, FR: 0, BL: 0, BR: 0 }, walk: 0, pitch: 0, roll: 0 };
  /** The eased values the rig actually shows. */
  private cur = { headLift: 0, headYaw: 0, footLift: { FL: 0, FR: 0, BL: 0, BR: 0 } as Record<Leg, number>, walk: 0, pitch: 0, roll: 0 };
  private legs: LegState[] = [];
  private gaitPhase = 0;
  /** Idle inputs set by Amble each frame. */
  breath = 0; shellBreath = 0;
  idle = { headYaw: 0, headPitch: 0, earL: 0, earR: 0, earFlickL: 0, earFlickR: 0, lookX: 0, lookY: 0, blink: 0, lid: 0.22, tail: 0 };
  /** The feet that came down this frame (walking), for the thud, the dust and the shake. */
  planted: Leg[] = [];
  /** How fast the legs are walking now (the eased walk), and the ground speed that keeps the planted feet still. */
  get walkNow() { return this.cur.walk; }
  get groundSpeed() { const w = this.cur.walk; return w > 1e-3 ? 6.476 * w * Math.min(1, w * 4) : 0; }
  private lastPh: Record<Leg, number> = { FL: 0, FR: 0, BL: 0, BR: 0 };
  /** The ground under each foot when standing (creature space y); the game can set it to follow the planet. */
  groundY: Record<Leg, number> = { FL: 0, FR: 0, BL: 0, BR: 0 };

  constructor() {
    for (let i = 0; i < BONE_COUNT; i++) {
      const b = new THREE.Bone();
      b.name = (Object.keys(BONE) as BoneName[]).find(k => BONE[k] === i)!;
      this.bones.push(b);
    }
    for (let i = 0; i < BONE_COUNT; i++) {
      const p = PARENT[i];
      if (p >= 0) { this.bones[p].add(this.bones[i]); this.bones[i].position.copy(REST[i]).sub(REST[p]); }
      else this.bones[i].position.copy(REST[i]);
    }
    this.rootBone = this.bones[BONE.root];
    this.skeleton = new THREE.Skeleton(this.bones);
    for (const l of LEGS) {
      const [h, k, f] = legBones(l);
      const d1 = REST[k].clone().sub(REST[h]), d2 = REST[f].clone().sub(REST[k]);
      this.legs.push({ l, len1: d1.length(), len2: d2.length(), dir1: d1.normalize(), dir2: d2.normalize(), target: REST[f].clone(), footPitch: 0, home: REST[f].clone() });
    }
  }

  bone(n: BoneName) { return this.bones[BONE[n]]; }

  /** Pose every bone for this frame. */
  update(dt: number) {
    const P = this.pose, C = this.cur;
    const ease = (a: number, b: number, rate: number) => a + (b - a) * (1 - Math.exp(-rate * dt));
    C.headLift = ease(C.headLift, P.headLift, 0.9);
    C.headYaw = ease(C.headYaw, P.headYaw, 0.9);
    C.walk = ease(C.walk, P.walk, 0.8);
    C.pitch = ease(C.pitch, P.pitch, 1.2); C.roll = ease(C.roll, P.roll, 1.2);
    for (const l of LEGS) C.footLift[l] = ease(C.footLift[l], P.footLift[l], 1.6);

    // ---- walking: a slow lateral-sequence walk (hind left, fore left, hind right, fore right), the body bobbing
    // twice a cycle and swaying over each standing side; the lab runs it on a treadmill
    const T = 4.4, duty = 0.27, stride = 5.2;
    const wk = Math.min(1, C.walk * 4);
    if (C.walk > 1e-3) this.gaitPhase = (this.gaitPhase + dt * C.walk / (T * 0.25)) % 1;
    const offs: Record<Leg, number> = { BL: 0, FL: 0.25, BR: 0.5, FR: 0.75 };
    let bob = 0, sway = 0;
    this.planted.length = 0;
    for (const L of this.legs) {
      const ph = (this.gaitPhase + offs[L.l]) % 1;
      if (wk > 0.3 && this.lastPh[L.l] < duty && ph >= duty && ph - this.lastPh[L.l] < 0.5) this.planted.push(L.l);
      this.lastPh[L.l] = ph;
      const home = L.home.clone(); home.y = this.groundY[L.l] + REST[legBones(L.l)[2]].y;
      let dz = 0, lift = 0;
      if (ph < duty) { const u = ph / duty; dz = (-0.5 + u) * stride; lift = Math.sin(Math.PI * u) * 1.3; }
      else { const u = (ph - duty) / (1 - duty); dz = (0.5 - u) * stride; }
      L.target.copy(home); L.target.z += dz * wk; L.target.y += lift * wk;
      L.footPitch = wk * (ph < duty ? -0.25 * Math.sin(Math.PI * ph / duty) : 0);
      if (ph >= duty) sway += (L.l.endsWith('L') ? 1 : -1) * 0.25;
      // a foot held up: lifted and drawn back, the toes hanging
      const k = C.footLift[L.l];
      if (k > 1e-3) {
        L.target.y += k * 2.1; L.target.z -= k * 1.3; L.target.x += Math.sign(L.target.x) * k * 0.15;
        L.footPitch += k * 0.75;
      }
    }
    bob = -Math.cos(this.gaitPhase * Math.PI * 4) * 0.13 * wk;
    // holding a front foot up: the weight shifts back and to the other side
    const lf = C.footLift.FL - C.footLift.FR, lfa = Math.max(C.footLift.FL, C.footLift.FR);

    // ---- body and shell
    const body = this.bones[BONE.body], shell = this.bones[BONE.shell];
    body.position.copy(REST[BONE.body]).sub(REST[BONE.root]);
    body.position.y += this.breath * 0.1 + bob - lfa * 0.25;
    body.position.x += sway * 0.25 * wk - lf * 0.5;
    body.position.z -= lfa * 0.35;
    _e.set(C.pitch + lfa * 0.04 + bob * 0.06, 0, C.roll + sway * 0.012 * wk + lf * 0.02);
    body.quaternion.setFromEuler(_e);
    shell.position.copy(REST[BONE.shell]).sub(REST[BONE.body]);
    shell.position.y += this.shellBreath * 0.16;
    _e.set(this.shellBreath * 0.004 - bob * 0.04, 0, -sway * 0.008 * wk);
    shell.quaternion.setFromEuler(_e);

    // ---- neck and head: the lift is spread along the neck (the base does most of it, the head tips last)
    const I = this.idle;
    const lift = C.headLift, yaw = C.headYaw + I.headYaw;
    const nb = [BONE.neck0, BONE.neck1, BONE.neck2, BONE.neck3, BONE.head];
    const liftW = [0.32, 0.28, 0.22, 0.16, 0.1], yawW = [0.12, 0.2, 0.26, 0.24, 0.18];
    // (lifting pitches the chain up: rotation about -X raises a chain pointing +Z)
    const liftTotal = lift < 0 ? lift * 1.05 : lift * 0.55;
    for (let i = 0; i < nb.length; i++) {
      const pitch = -liftTotal * liftW[i] * (lift < 0 && i === 4 ? -1.2 : 1) + (i >= 3 ? I.headPitch * 0.5 : 0) - (i === 0 ? this.breath * 0.006 : 0) + (i === 4 ? bob * 0.15 : 0);
      _q.setFromAxisAngle(Y, yaw * yawW[i]);
      _q2.setFromAxisAngle(X, pitch);
      this.bones[nb[i]].quaternion.multiplyQuaternions(_q, _q2);
    }

    // ---- ears, eyes and lids
    const earAxis = (side: 1 | -1) => _a.set(0.35 * side, 0, 1).normalize();
    const ear = (b: number, side: 1 | -1, base: number, flick: number) => {
      _q.setFromAxisAngle(earAxis(side), side * (base + flick * 0.35));
      _q2.setFromAxisAngle(Y, -side * flick * 0.25);
      this.bones[b].quaternion.multiplyQuaternions(_q2, _q);
    };
    ear(BONE.earL, 1, I.earL, I.earFlickL);
    ear(BONE.earR, -1, I.earR, I.earFlickR);
    for (const b of [BONE.eyeL, BONE.eyeR]) { _e.set(-I.lookY, I.lookX, 0, 'YXZ'); this.bones[b].quaternion.setFromEuler(_e); }
    // lids: rest is a little lowered (a soft, kind look); a blink brings them right down
    const lidAng = (I.lid + (1 - I.lid) * I.blink) * 1.3;
    _q.setFromAxisAngle(LID_AXIS.L, -lidAng); this.bones[BONE.lidL].quaternion.copy(_q);
    _q.setFromAxisAngle(LID_AXIS.R, lidAng); this.bones[BONE.lidR].quaternion.copy(_q);

    // ---- tail
    _q.setFromAxisAngle(Y, I.tail); this.bones[BONE.tail0].quaternion.copy(_q);
    _q.setFromAxisAngle(Y, I.tail * 1.4); this.bones[BONE.tail1].quaternion.copy(_q);

    // ---- legs, by two-bone IK in creature space
    const bodyQ = body.quaternion, bodyP = _b.copy(body.position).add(REST[BONE.root]);
    for (const L of this.legs) {
      const [h, k, f] = legBones(L.l);
      const hip = REST[h].clone().sub(REST[BONE.body]).applyQuaternion(bodyQ).add(bodyP);
      const to = L.target.clone().sub(hip);
      const reach = L.len1 + L.len2;
      let dist = to.length();
      dist = Math.min(Math.max(dist, Math.abs(L.len1 - L.len2) + 0.05), reach * 0.999);
      const dir = to.normalize();
      const cosA = (L.len1 * L.len1 + dist * dist - L.len2 * L.len2) / (2 * L.len1 * dist);
      const ang = Math.acos(Math.min(1, Math.max(-1, cosA)));
      // the knee bends towards +Z (forwards), splayed out a little
      const pole = _c.set(Math.sign(hip.x) * 0.15, 0, 1);
      const bend = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
      const knee = hip.clone().addScaledVector(dir, Math.cos(ang) * L.len1).addScaledVector(bend, Math.sin(ang) * L.len1);
      const ankle = hip.clone().addScaledVector(dir, dist);
      const d1 = knee.clone().sub(hip).normalize(), d2 = ankle.clone().sub(knee).normalize();
      const qHip = frameRot(L.dir1, Z, d1, Z, new THREE.Quaternion());
      const qKnee = frameRot(L.dir2, Z, d2, Z, new THREE.Quaternion());
      _e.set(L.footPitch, 0, 0); const qFoot = _q3.setFromEuler(_e);
      // world (creature) rotations to local
      this.bones[h].quaternion.copy(bodyQ).invert().multiply(qHip);
      this.bones[k].quaternion.copy(qHip).invert().multiply(qKnee);
      this.bones[f].quaternion.copy(qKnee).invert().multiply(qFoot);
    }
  }
}
