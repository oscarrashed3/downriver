import * as THREE from 'three';
import { Person, type PersonLook, type PoseInput } from '../../player/person';
import { Sway, anchors } from '../../player/villagers';
import { lerp, clamp } from '../noise';
import { WindScarf, SKY_WIND, type ScarfSpec, type ScarfCollider } from './windScarf';
import { RigKit, cloth, strand, lump, wrapLoop, mulberry, type V3 } from './windRig';
import {
  windBody, windFace, hairCap, lock, scarfWrap, strawHat, belt, crossStrap, goggles, torsoStrap, pivot, headInfo, dirAt,
  type Rig, type Dims, type BodyCols,
} from './windBody';

export { Crowd, type CrowdSpot } from './windCrowd';
export { SKY_WIND } from './windScarf';
export { mulberry } from './windRig';

// The windfolk of the Sky Isles: light, cheerful people whose long scarves always stream in the wind.
// They are Persons like the World 1 villagers (same joints, the same walk with its own gait, the same idles,
// blinking, glances and talking), built in the same hand-made way (small parts with folds, seams and springs)
// and to the same chunky, friendly proportions: about 5 heads tall for the children, 5.5 to 6 for the grown-ups.
//   - Every static part of one character is merged into ONE skinned mesh on the Person's joints (windRig.ts):
//     3 draw calls a character, plus 2 a scarf tail. Limbs are continuous tubes that bend at knee and elbow.
//   - The head is sculpted (jaw, chin, cheek plane, eye sockets, nose bridge, ears) and the face drawn on it as
//     decals; the hair is a cap that follows the skull with strand clumps laid over it (windBody.ts).
//   - The scarf is one bunched cowl round the neck with a flat knot; its two tails are simulated ribbons
//     (windScarf.ts) that sag in a lull, stream in the gusts and always ripple in S-curves.
//   - Every idle is posed: weight on one leg, the hips shifted, the head tilted, elbows soft, and each
//     character's own stance (Lark's hand on her satchel strap, Zephy's fists on his hips, Gran Wren on her
//     cane, the Chime-maker tapping a chime, the Sail-mender sewing).
//   - Poses on top of the Person's: cheer (both arms up, hopping), reach (the big farewell wave of picture 4),
//     glide (prone on a kite-wing, chest up, hands on the bar by IK, legs back).
//
//   const lark = makeWindfolk('lark');  scene.add(lark.root);
//   lark.animate(dt, { speed: 0, grounded: true, reach: 1 });
//
// For a cheering crowd of 40-80 use Crowd (windCrowd.ts): one merged mesh animated in the vertex shader.

export type WindfolkKind = 'lark' | 'zephy' | 'wren' | 'mender' | 'chimer' | 'crowd';

/** Person's pose plus the windfolk's own. */
export interface WindPose extends PoseInput {
  /** Both arms up, cheering, a little hop (0..1). */
  cheer?: number;
  /** A big wave: one arm reaches up and out, the body leans after it (0..1). */
  reach?: number;
  /** Which arm reaches: 1 = the left (+x, default), -1 = the right. */
  reachSide?: number;
  /** Lying prone on a kite-wing (0..1). At 1 the hips sit at the root's origin, the head towards +z. */
  glide?: number;
  /** Roll of the wing while gliding (radians, + = right wing down). */
  bank?: number;
  /** World points the two hands reach for and hold (the control bar): [arms[0], arms[1]]. */
  grip?: [THREE.Vector3 | null, THREE.Vector3 | null];
  /** The air's velocity in world space (m/s); defaults to SKY_WIND. Scarves, hair and cloth follow it. */
  air?: THREE.Vector3;
  /** Turn off the character's own standing pose (contrapposto and signature stance). */
  plain?: boolean;
}

/** Each character's own way of standing. */
type Stance = 'satchel' | 'fists' | 'cane' | 'chime' | 'sew' | 'easy' | 'clasp' | 'hips';

interface Built {
  scarves: { anchor: THREE.Object3D; spec: ScarfSpec }[];
  colliders: ScarfCollider[];
  fingers: THREE.Group[];
  braids: THREE.Object3D[];
  smile?: number;
  bent?: number;           // bent knees (Gran Wren)
  stance?: Stance;
  /** Which leg carries the weight at rest (1 = arms[1]'s side). */
  weight?: number;
  sew?: { needle: THREE.Object3D; spool: THREE.Object3D };
  /** Things held upright in the hand (the cane, the hand chime). */
  held?: THREE.Object3D[];
  arm?: { upL: number; foL: number; hand: number };
  stats?: { triangles: number; bones: number };
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q2 = new THREE.Vector3();
const _D = new THREE.Vector3(), _W = new THREE.Vector3(), _E = new THREE.Vector3(), _P = new THREE.Vector3(), _t = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _down = new THREE.Vector3(0, -1, 0);

/** A windfolk: a Person (use it exactly like a World 1 villager) with scarves and the extra poses. */
export class Windfolk extends Person {
  scarves: WindScarf[] = [];
  /** Triangles and bones of the skinned body (for budgets). */
  stats: { triangles: number; bones: number };
  private sm2: Record<string, number> = {};
  private t2 = Math.random() * 10;
  private wl = new THREE.Vector3();
  private b: Built;
  private thread: THREE.Line | null = null;

  constructor(public kind: WindfolkKind, look: PersonLook, built: Built) {
    super(look);
    this.b = built;
    for (const s of built.scarves) this.scarves.push(new WindScarf(s.anchor, this.root, s.spec, built.colliders));
    this.stats = built.stats ?? { triangles: 0, bones: 0 };
    if (built.sew) {
      // the Sail-mender's waxed thread, from the needle's eye back to the spool, sagging between his hands
      const g = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 10 }, () => new THREE.Vector3()));
      this.thread = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#b8402e' }));
      this.thread.frustumCulled = false;
      this.root.add(this.thread);
    }
  }

  private ease(key: string, target: number, dt: number, rate: number) {
    const v = this.sm2[key] ?? target;
    return (this.sm2[key] = lerp(v, target, 1 - Math.exp(-rate * dt)));
  }

  /** Midpoint of the two hands in world space (where a glider's control bar goes). */
  gripPoint(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return out.copy(this.arms[0].hand.getWorldPosition(_v)).add(this.arms[1].hand.getWorldPosition(_w)).multiplyScalar(0.5);
  }

  /**
   * Two-bone IK: bend the elbow and turn the shoulder so the palm of arm `i` lands on `target` (world), the
   * elbow pointing towards `pole` (torso frame). Blended by k over the pose already set.
   */
  private reachTo(i: number, target: THREE.Vector3, pole: THREE.Vector3, k: number) {
    const A = this.arms[i], ar = this.b.arm;
    if (!ar || k < 0.001) return;
    this.torso.updateWorldMatrix(true, false);
    const D = this.torso.worldToLocal(_D.copy(target)).sub(A.sh.position);
    const a = ar.upL, b = ar.foL + 0.03 * ar.hand;
    const d = clamp(D.length(), 0.05, (a + b) * 0.995);
    const bend = Math.PI - Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
    const th = -bend;
    // the wrist with that bend, in the shoulder's frame; turn it onto the target, then roll the elbow to the pole
    _W.set(0, -a - b * Math.cos(th), -b * Math.sin(th)).normalize();
    D.normalize();
    _qa.setFromUnitVectors(_W, D);
    _E.copy(_down).applyQuaternion(_qa);
    _E.addScaledVector(D, -_E.dot(D)); _P.copy(pole).addScaledVector(D, -pole.dot(D));
    if (_E.lengthSq() > 1e-6 && _P.lengthSq() > 1e-6) {
      _E.normalize(); _P.normalize();
      const ang = Math.atan2(_t.crossVectors(_E, _P).dot(D), _E.dot(_P));
      _qb.setFromAxisAngle(D, ang); _qa.premultiply(_qb);
    }
    A.sh.quaternion.slerp(_qa, k);
    A.el.rotation.x = lerp(A.el.rotation.x, th, k); A.el.rotation.y = lerp(A.el.rotation.y, 0, k);
  }

  animate(dt: number, p: WindPose) {
    this.t2 += dt;
    const t = this.t2;
    const air = p.air ?? SKY_WIND;
    // the air in this person's own frame drives the springs (braids, skirt, hat ribbons)
    if (!p.windLocal) {
      this.root.updateWorldMatrix(true, false);
      _m4.copy(this.root.matrixWorld).invert();
      this.wl.copy(air).transformDirection(_m4).multiplyScalar(Math.min(1.2, air.length() * 0.15));
    }
    const smile = Math.max(p.smile ?? 0, this.b.smile ?? 0);
    super.animate(dt, { ...p, smile, windLocal: p.windLocal ?? this.wl });
    // joints the Person leaves alone: start them from rest every frame
    this.hips.position.x = 0; this.hips.rotation.z = 0; this.neck.rotation.x = 0; this.body.rotation.z = 0; this.body.position.x = 0;
    for (const L of this.legs) L.thigh.rotation.y = 0;

    const cheer = this.ease('cheer', p.cheer ?? 0, dt, 6);
    const reach = this.ease('reach', p.reach ?? 0, dt, 5);
    const glide = this.ease('glide', p.glide ?? 0, dt, 5);
    const bank = this.ease('bank', p.bank ?? 0, dt, 4);
    const still = this.ease('still', p.speed < 0.3 && !p.sit && !p.lie && !p.kneel ? 1 : 0, dt, 4);
    const busy = Math.max(cheer, reach, glide);
    const rest = still * (1 - busy) * (p.plain ? 0 : 1) * (p.talking ? 0.5 : 1) * (p.idle && p.idle !== 'none' ? 0 : 1);
    let curl = 0.5; // fingers gently curled

    // our brows are drawn already shaped: undo the Person's default tilt
    for (let i = 0; i < 2; i++) this.brows[i].rotation.z += 0.12 * (i === 0 ? -1 : 1);

    // ---- standing: weight on one leg, hips shifted over it, shoulders tipped against them, head tilted,
    //      elbows soft; the weight shifts now and then
    if (rest > 0.001) {
      const ws = (this.b.weight ?? 1) * (Math.sin(t * 0.11) > -0.75 ? 1 : -1);
      const wsE = this.ease('ws', ws, dt, 1.2);
      const k = rest;
      const breathe = Math.sin(t * 0.9) * 0.012;
      this.hips.position.x += 0.035 * wsE * k;
      this.hips.rotation.z = 0.075 * wsE * k;
      this.torso.rotation.z += (-0.11 * wsE + breathe) * k;
      this.torso.rotation.y += 0.08 * wsE * k;
      for (let i = 0; i < 2; i++) {
        const L = this.legs[i], side = i === 0 ? -1 : 1, carry = side * wsE > 0 ? 1 : 0;
        // the carrying leg straight and in under the body; the free one eased, knee forward, foot out
        L.thigh.rotation.z = lerp(L.thigh.rotation.z, -0.075 * wsE + (carry ? -0.03 * side : 0.07 * side), k);
        L.thigh.rotation.x = lerp(L.thigh.rotation.x, carry ? 0.02 : -0.16, k);
        L.knee.rotation.x = lerp(L.knee.rotation.x, carry ? 0.04 : 0.3, k);
        L.thigh.rotation.y = (carry ? 0 : 0.25 * side) * k;
      }
      this.hips.position.y -= 0.012 * k;
      this.head.rotation.z += (0.13 * wsE + Math.sin(t * 0.7) * 0.02) * k;
      this.head.rotation.x += 0.04 * k;
      for (let i = 0; i < 2; i++) {
        const A = this.arms[i], s = i === 0 ? -1 : 1;
        A.sh.rotation.z = lerp(A.sh.rotation.z, (0.13 + 0.03 * Math.sin(t * 0.8 + i)) * s, k);
        A.sh.rotation.x = lerp(A.sh.rotation.x, -0.08, k);
        A.el.rotation.x = lerp(A.el.rotation.x, -0.42 - 0.05 * Math.sin(t * 0.9 + i * 2), k);
      }
      this.stance(this.b.stance ?? 'easy', k, t);
      curl = lerp(curl, this.b.stance === 'fists' ? 1.5 : this.b.stance === 'cane' ? 1.45 : 0.75, k);
    }

    // ---- Gran Wren: knees always a little bent under her hunch, the head lifted against it to look ahead
    if (this.b.bent) {
      const k = this.b.bent * (1 - glide);
      for (const L of this.legs) { L.thigh.rotation.x -= 0.22 * k; L.knee.rotation.x += 0.42 * k; }
      this.hips.position.y -= 0.03 * k;
      this.neck.rotation.x = -0.42 * k;
    }

    // ---- cheer: arms flung up, elbows bent, hands open, small hops, head up, mouth open
    if (cheer > 0.001) {
      const pump = Math.sin(t * 7.5);
      for (let i = 0; i < 2; i++) {
        const A = this.arms[i], s = i === 0 ? -1 : 1, ph = pump * (i ? 1 : -1);
        A.sh.rotation.x = lerp(A.sh.rotation.x, -0.35 + ph * 0.1, cheer);
        A.sh.rotation.y = lerp(A.sh.rotation.y, 0, cheer);
        A.sh.rotation.z = lerp(A.sh.rotation.z, s * (2.35 + ph * 0.15), cheer);
        A.el.rotation.x = lerp(A.el.rotation.x, -0.55 - Math.max(0, ph) * 0.45, cheer);
        A.el.rotation.y = lerp(A.el.rotation.y, -s * 0.9, cheer);
      }
      this.hips.position.y += Math.max(0, Math.sin(t * 5.2)) * 0.05 * cheer;
      this.torso.rotation.x -= 0.1 * cheer;
      this.head.rotation.x = lerp(this.head.rotation.x, -0.3, cheer);
      curl = lerp(curl, 0.0, cheer);
      if (cheer > 0.5 && !(p.surprise && p.surprise > 0.5)) { const o = Math.sin(t * 2.1) > -0.3; this.mouthO.visible = o; this.mouthSmile.visible = !o; this.mouthFlat.visible = false; }
    }

    // ---- reach: the farewell wave of picture 4: up on her toes, leaning into it, the arm high with the elbow
    //      soft and the hand open and waving, the other arm back for balance, the head up after the whale
    if (reach > 0.001) {
      const rs = (p.reachSide ?? 1) < 0 ? -1 : 1;
      const A = this.arms[rs > 0 ? 1 : 0], B = this.arms[rs > 0 ? 0 : 1];
      const wv = Math.sin(t * 5.4);
      A.sh.rotation.x = lerp(A.sh.rotation.x, -1.05, reach);
      A.sh.rotation.y = lerp(A.sh.rotation.y, 0, reach);
      A.sh.rotation.z = lerp(A.sh.rotation.z, rs * (2.0 + wv * 0.1), reach);
      A.el.rotation.x = lerp(A.el.rotation.x, -0.32 - Math.max(0, wv) * 0.22, reach);
      A.el.rotation.y = lerp(A.el.rotation.y, -rs * 1.1, reach);
      // the other arm drops back and out for balance, the hand open
      B.sh.rotation.x = lerp(B.sh.rotation.x, 0.42, reach);
      B.sh.rotation.z = lerp(B.sh.rotation.z, -0.42 * rs, reach);
      B.el.rotation.x = lerp(B.el.rotation.x, -0.35, reach);
      // lean forward into the wave, up on the toes
      this.body.rotation.x = lerp(this.body.rotation.x, 0.07, reach);
      this.hips.position.y += 0.028 * reach;
      this.torso.rotation.x = lerp(this.torso.rotation.x, 0.06, reach);
      this.torso.rotation.y = lerp(this.torso.rotation.y, 0.22 * rs, reach);
      this.torso.rotation.z = lerp(this.torso.rotation.z, -0.14 * rs, reach);
      this.head.rotation.x = lerp(this.head.rotation.x, -0.42, reach);
      this.head.rotation.y = lerp(this.head.rotation.y, 0.15 * rs, reach);
      this.head.rotation.z = lerp(this.head.rotation.z, -0.14 * rs, reach);
      // weight on the front foot, the back leg straight and back
      const Lf = this.legs[rs > 0 ? 1 : 0], Lb = this.legs[rs > 0 ? 0 : 1];
      Lf.thigh.rotation.x = lerp(Lf.thigh.rotation.x, -0.1, reach); Lf.knee.rotation.x = lerp(Lf.knee.rotation.x, 0.14, reach);
      Lb.thigh.rotation.x = lerp(Lb.thigh.rotation.x, 0.26, reach); Lb.knee.rotation.x = lerp(Lb.knee.rotation.x, 0.3, reach);
      curl = lerp(curl, 0.0, reach);
      if (reach > 0.5) { this.mouthSmile.visible = true; this.mouthFlat.visible = false; this.mouthO.visible = false; }
    }

    // ---- glide: prone on the wing, chest arched up, head lifted to look ahead, legs together trailing
    if (glide > 0.001) {
      const H = this.H;
      this.body.rotation.x = lerp(this.body.rotation.x, Math.PI / 2, glide);
      this.body.rotation.z = lerp(this.body.rotation.z, -bank * 0.4, glide);
      this.body.position.set(0, lerp(this.body.position.y, 0.0, glide), lerp(this.body.position.z, -this.hipY * H, glide));
      this.hips.position.set(lerp(this.hips.position.x, 0, glide), lerp(this.hips.position.y, this.hipY, glide), 0);
      this.hips.rotation.z = lerp(this.hips.rotation.z, 0, glide);
      this.torso.rotation.set(lerp(this.torso.rotation.x, -0.32 + Math.sin(t * 1.3) * 0.02, glide), lerp(this.torso.rotation.y, 0, glide), lerp(this.torso.rotation.z, bank * 0.2, glide));
      this.neck.rotation.x = lerp(this.neck.rotation.x, -0.5, glide);
      this.head.rotation.set(lerp(this.head.rotation.x, -0.62, glide), lerp(this.head.rotation.y, Math.sin(t * 0.5) * 0.08, glide), lerp(this.head.rotation.z, 0, glide));
      // arms forward towards the bar (IK below puts the hands on it)
      for (let i = 0; i < 2; i++) {
        const A = this.arms[i], s = i === 0 ? -1 : 1;
        A.sh.rotation.set(lerp(A.sh.rotation.x, -2.3, glide), 0, lerp(A.sh.rotation.z, s * 0.35, glide));
        A.el.rotation.set(lerp(A.el.rotation.x, -0.6, glide), 0, 0);
      }
      // legs straight and together, lifted a little behind, one knee kicking now and then
      for (let i = 0; i < 2; i++) {
        const L = this.legs[i], s = i === 0 ? -1 : 1;
        L.thigh.rotation.set(lerp(L.thigh.rotation.x, 0.16 + Math.sin(t * 2.3 + i) * 0.03, glide), 0, lerp(L.thigh.rotation.z, -s * 0.03, glide));
        L.knee.rotation.x = lerp(L.knee.rotation.x, 0.12 + (i ? 0.18 + Math.max(0, Math.sin(t * 1.1)) * 0.25 : 0), glide);
      }
      if (this.coat) this.coat.rotation.x = lerp(this.coat.rotation.x, -0.12 + Math.sin(t * 9) * 0.04, glide);
      // braids stream back in the slipstream
      for (const b of this.b.braids) b.rotation.x = lerp(b.rotation.x, 1.6 + Math.sin(t * 7 + b.id) * 0.08, glide);
      curl = lerp(curl, 1.5, glide);
    }

    // the coat hem flutters in the wind when standing
    if (this.coat && glide < 0.5) this.coat.rotation.x += Math.sin(t * 6.3) * 0.012 + Math.sin(t * 10.7) * 0.006;
    // fingers
    for (let i = 0; i < this.b.fingers.length; i++) this.b.fingers[i].rotation.z = -(i === 0 ? -1 : 1) * curl * 1.1;
    // the mouths are joints of the skinned face: hidden ones shrink to nothing
    for (const m of [this.mouthFlat, this.mouthSmile, this.mouthO]) m.scale.setScalar(m.visible ? 1 : 0.0001);
    if (this.mouthO.visible && cheer > 0.5) this.mouthO.scale.set(1.25, 1.35 + Math.sin(t * 6) * 0.15, 1);

    // the waving arm aimed by IK: up, out and forward after the whale, the elbow soft and out to the side,
    // swinging side to side about the shoulder
    if (reach > 0.001 && this.b.arm) {
      const rs = (p.reachSide ?? 1) < 0 ? -1 : 1, i = rs > 0 ? 1 : 0, A = this.arms[i];
      const wv = Math.sin(t * 5.4), L = (this.b.arm.upL + this.b.arm.foL) * 0.93;
      this.root.updateMatrixWorld(true);
      // aimed in the body's own upright frame (not the leaning torso's), from the shoulder
      const ws = this.torso.getWorldScale(_q2).x;
      _w.set(rs * (0.5 + wv * 0.15), 1.0, 0.32).normalize().transformDirection(this.root.matrixWorld).multiplyScalar(L * ws);
      A.sh.getWorldPosition(_v).add(_w);
      this.reachTo(i, _v, _P.set(rs, -0.35, -0.5), reach);
      A.el.rotation.y = lerp(A.el.rotation.y, -rs * 0.5, reach);
    }

    // hands on the bar
    if (p.grip) {
      this.root.updateMatrixWorld(true);
      for (let i = 0; i < 2; i++) { const g = p.grip[i]; if (g) this.reachTo(i, g, _P.set(i === 0 ? -1 : 1, -0.6, -0.4), glide); }
    }
    this.root.updateMatrixWorld(true);
    if (this.thread && this.b.sew) this.drawThread();
    // the scarves last, once every joint is where it will be drawn
    for (const s of this.scarves) s.update(dt, t, air);
  }

  /** Each character's own stance, blended in by k (on top of the weight shift). */
  private stance(st: Stance, k: number, t: number) {
    const [L, R] = this.arms; // L = arms[0] (-x), R = arms[1] (+x)
    const set = (A: typeof L, x: number, y: number, z: number, el: number, ely = 0) => {
      A.sh.rotation.x = lerp(A.sh.rotation.x, x, k); A.sh.rotation.y = lerp(A.sh.rotation.y, y, k); A.sh.rotation.z = lerp(A.sh.rotation.z, z, k);
      A.el.rotation.x = lerp(A.el.rotation.x, el, k); A.el.rotation.y = lerp(A.el.rotation.y, ely, k);
    };
    const tap = this.cycle2(t, 3.2, 1.6) * Math.abs(Math.sin(t * 9));
    switch (st) {
      case 'satchel':
        // Lark: one hand holding the satchel strap at her chest, the other easy by her side, swinging a little
        set(L, -0.55, 0, 0.12, -1.95, 0.75);
        set(R, -0.05 + Math.sin(t * 0.8) * 0.04, 0, 0.2, -0.5);
        this.head.rotation.x -= 0.05 * k;
        break;
      case 'fists':
        // Zephy: fists on his hips, elbows out, chest up, chin up and a cocky lean
        set(L, 0.3, 0, -0.6, -1.85, 1.2);
        set(R, 0.3, 0, 0.6, -1.85, -1.2);
        this.torso.rotation.x -= 0.07 * k;
        this.head.rotation.x -= 0.1 * k;
        break;
      case 'cane':
        // Gran Wren: her hand on the cane's knob in front of her, the other tucked behind her back
        set(R, -0.62, 0, 0.12, -0.55, 0.4);
        set(L, 0.3, 0, -0.2, -1.2, 1.1);
        break;
      case 'chime':
        // the Chime-maker: a little chime held up by her ear, her hammer tapping it, her head tipped to listen
        set(L, -1.35, 0, -0.42, -1.75, -0.6);
        set(R, -1.05 - tap * 0.06, 0, 0.3, -1.55 + tap * 0.25, 0.5);
        this.head.rotation.z -= 0.16 * k; this.head.rotation.y -= 0.18 * k; this.head.rotation.x += 0.08 * k;
        break;
      case 'sew': {
        // the Sail-mender: the needle in one big hand, the spool in the other, drawing the thread out now and then
        const pull = this.cycle2(t, 6.5, 1.4);
        set(R, -0.55 - pull * 0.25, 0, 0.22 + pull * 0.55, -1.35 + pull * 0.55, 0.3);
        set(L, -0.5, 0, -0.16, -1.15, -0.4);
        this.head.rotation.x += 0.22 * k;
        break;
      }
      case 'hips':
        // one hand on the hip
        set(R, 0.22, 0, 0.6, -1.7, 1.2);
        break;
      case 'clasp':
        // hands clasped in front
        set(L, -0.32, 0, -0.2, -1.05, -0.5);
        set(R, -0.32, 0, 0.2, -1.05, 0.5);
        break;
      case 'easy': default:
        break;
    }
  }

  private drawThread() {
    const a = this.b.sew!.needle.getWorldPosition(_v), b = this.b.sew!.spool.getWorldPosition(_w);
    const inv = _m4.copy(this.root.matrixWorld).invert();
    const pa = this.thread!.geometry.attributes.position as THREE.BufferAttribute;
    const sag = 0.06 * this.H;
    for (let i = 0; i < pa.count; i++) {
      const u = i / (pa.count - 1);
      _q2.lerpVectors(a, b, u); _q2.y -= Math.sin(u * Math.PI) * sag;
      _q2.applyMatrix4(inv); pa.setXYZ(i, _q2.x, _q2.y, _q2.z);
    }
    pa.needsUpdate = true;
  }

  private cycle2(t: number, period: number, hold: number) {
    const u = ((t % period) + period) % period, e = 0.5;
    if (u > hold + 2 * e) return 0;
    const k = Math.min(1, u / e, (hold + 2 * e - u) / e);
    return k * k * (3 - 2 * k);
  }

  dispose() { for (const s of this.scarves) s.dispose(); }
}

// ================================================================ shared pieces

const SKIN = { fair: '#f4d6be', light: '#f0c9a8', warm: '#e8b48e', tan: '#d29a70', brown: '#b07a54', deep: '#8a5a3e' };

/** Colliders for the scarf tails: the chest, the belly and the head. */
function scarfColliders(p: Person, r: Rig): ScarfCollider[] {
  const T = r.d.torsoL, [rx] = r.torsoAt(T * 0.6);
  return [
    { o: pivot(p.torso, 0, T * 0.62, 0), r: rx * 1.1 },
    { o: pivot(p.torso, 0, T * 0.25, 0), r: rx * 1.1 },
    { o: pivot(p.head, 0, r.C.y, r.C.z), r: r.d.R * 1.15 },
  ];
}

/** A bodice: the torso's own shape plus a margin, from the shoulders to `bottom`, with seams. */
function bodice(r: Rig, T: THREE.Object3D, color: string, top: number, bottom: number, margin = 0.012, o: { start?: number; len?: number; seed?: number; lines?: number[]; flare?: number; hem?: number; lining?: number } = {}) {
  const pts: [number, number][] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const y = top + (bottom - top) * (i / N);
    const [rx] = r.torsoAt(y);
    pts.push([rx + margin + (o.flare ?? 0) * Math.pow(i / N, 2), y]);
  }
  pts.unshift([r.d.neckR + margin + 0.004, top + 0.012]);
  const [rx0, rz0] = r.torsoAt(0.3);
  r.k.add(T, cloth(pts, { n: 22, folds: 6, amt: 0.03, yTop: top, seed: o.seed ?? 0, sz: rz0 / rx0, lines: o.lines, hem: o.hem ?? 0.006, start: o.start, len: o.len }), color, 0, 0, 0, { lining: o.lining });
}

/** A skirt or coat-tail hung from a pivot at the waist, blended into the torso above, on a spring. */
function skirt(p: Person, r: Rig, sway: Sway, color: string, waist: number, len: number, rTop: number, rHem: number, o: { start?: number; len?: number; seed?: number; folds?: number; amt?: number; lines?: number[]; lining?: number; hem?: number; hemArc?: number; spring?: boolean; sz?: number; bulge?: number } = {}) {
  const sk = (p.coat as THREE.Object3D | null) ?? pivot(p.torso, 0, waist, 0);
  if (!p.coat) p.coat = sk;
  const pts: [number, number][] = [];
  const N = 6;
  for (let i = 0; i <= N; i++) { const u = i / N; pts.push([rTop + (rHem - rTop) * Math.pow(u, 1.3) + (o.bulge ?? 0) * Math.sin(u * Math.PI), waist - len * u]); }
  const [rx0, rz0] = r.torsoAt(waist);
  r.k.add(p.torso, cloth(pts, { n: 26, folds: o.folds ?? 8, amt: o.amt ?? 0.09, yTop: waist, seed: o.seed ?? 0, sz: o.sz ?? Math.min(1, (rz0 / rx0) * 1.12), lines: o.lines, hem: o.hem ?? 0.018, start: o.start, len: o.len, hemArc: o.hemArc }), color, 0, 0, 0, { w: r.skirtW(sk, waist, len * 0.55), lining: o.lining ?? 0.7 });
  if (o.spring !== false && !sway.items.some(h => h.o === sk)) sway.add(sk, { freq: 1.5, damp: 0.3, gain: 0.03, wind: 0.22, bob: 0.07, limit: 0.4 });
  return sk;
}

/** A braid hanging from the head on a chain of springs, ending in a tie and a tuft. */
function braid(k: RigKit, sway: Sway, head: THREE.Object3D, at: V3, color: string, tie: string, o: { segs?: number; r?: number; len?: number; rx?: number; rz?: number } = {}) {
  const segs = o.segs ?? 5, R = o.r ?? 0.022, L = (o.len ?? 0.34) / segs;
  let par: THREE.Object3D = pivot(head, ...at);
  par.rotation.set(o.rx ?? 0.25, 0, o.rz ?? 0);
  const root = par;
  k.add(par, lump(R * 1.3, 0.12, at[0] * 40), color, 0, -R * 0.5, 0);
  for (let i = 0; i < segs; i++) {
    const seg = pivot(par, 0, i === 0 ? -R : -L, 0);
    const r = R * (1 - i * 0.06);
    // two plaited lobes a segment, crossing, the lower one a shade darker
    k.add(seg, new THREE.SphereGeometry(r, 9, 7), color, r * 0.32, -L * 0.3, 0, { s: [0.95, 1.35, 0.85], r: [0, 0, 0.55] });
    k.add(seg, new THREE.SphereGeometry(r, 9, 7), new THREE.Color(color).multiplyScalar(0.9), -r * 0.32, -L * 0.78, 0, { s: [0.95, 1.35, 0.85], r: [0, 0, -0.55] });
    sway.add(seg, { freq: 1.5 + i * 0.12, damp: 0.28, gain: 0.03, wind: 0.2, bob: 0.08, limit: 0.6 });
    par = seg;
  }
  k.add(par, new THREE.TorusGeometry(R * 0.6, R * 0.32, 5, 10), tie, 0, -L * 1.02, 0, { r: [Math.PI / 2, 0, 0], ink: 0.6 });
  k.add(par, strand([[0, -L * 1.05, 0], [0.004, -L * 1.5, 0.004], [0, -L * 2.0, 0]], R * 1.6, R * 1.1, { segs: 6, tip: 0.2, root: 0.6 }), color);
  return root;
}

/** A few loose wisps at the temples, hanging along the cheeks and lifting in the wind, on springs. */
function wisps(k: RigKit, sway: Sway, head: THREE.Object3D, color: string, n: number, seed: number, side = 0) {
  const { R, C } = headInfo();
  const rnd = mulberry(seed);
  for (let i = 0; i < n; i++) {
    const s = side || (i % 2 ? 1 : -1);
    const yaw = s * (0.85 + rnd() * 0.3), pitch = 0.05 + rnd() * 0.3;
    const d = dirAt(yaw, pitch);
    const base = new THREE.Vector3().copy(C).addScaledVector(d, R * 1.05);
    const wp = pivot(head, base.x, base.y, base.z);
    const out = d.clone().setY(0).normalize().multiplyScalar(0.012);
    const L = 0.07 + rnd() * 0.05;
    k.add(wp, strand([[0, 0, 0], [out.x * 0.6, -L * 0.4, out.z * 0.6 + 0.006], [out.x * 1.3, -L * 0.75, out.z * 1.2 + 0.004], [out.x * 2.4 + s * 0.008, -L, out.z * 2.0]], 0.012, 0.005, { segs: 8, sides: 5, tip: 0.05, root: 1 }), color, 0, 0, 0, { ink: 0.5 });
    sway.add(wp, { freq: 2.4 + rnd(), damp: 0.2, gain: 0.03, wind: 0.5, bob: 0.1, limit: 0.7 });
  }
}

/** A cuff turned back at the end of a sleeve: a short thick band on the forearm. */
function cuffBand(r: Rig, A: { el: THREE.Object3D }, y: number, rad: number, color: string, h = 0.03) {
  r.k.add(A.el, cloth([[rad, y + h / 2], [rad + 0.006, y], [rad, y - h / 2]], { n: 12, folds: 3, amt: 0.05, hem: 0, hemLine: false }), color, 0, 0, 0, { lining: 0.7 });
}

/** Start a character: a kit and a spring set; build the body; return the rig. */
function begin(p: Person, d: Dims, c: BodyCols) {
  const k = new RigKit(), sway = new Sway();
  const r = windBody(p, k, d, c);
  return { k, sway, r };
}

function finish(p: Person, r: Rig, sway: Sway, out: Built) {
  anchors(p);
  out.fingers = r.fingers;
  out.arm = { upL: r.upL, foL: r.foL, hand: r.d.hand ?? 1 };
  out.stats = r.k.bake(p.body, p.root);
  sway.ref = p.root;
  p.sway = sway;
  if (p.look.hunch) p.torso.rotation.x = p.look.hunch * 0.3;
}

/** Scarf tail lengths are set against the wearer's real height (metres), so no tail outgrows its owner. */
function tails(heightM: number, a: number, b: number) { return [heightM * a, heightM * b]; }

// ================================================================ Lark

function lark(p: Person, L: PersonLook, out: Built) {
  const skin = L.skin, coat = '#f4ecdc', shirt = '#efe2c8', hair = '#6e4226', yellow = '#f6c430', leg = '#dac6a2', leather = '#7a4a2a';
  const { k, sway, r } = begin(p, { legL: 0.66, torsoL: 0.44, B: 1.06, depth: 0.8, armL: 0.5, neckL: 0.05, neckR: 0.04, R: 0.15, thighR: 0.066, calfR: 0.053, armR: 0.038, hand: 1.2, coreInk: 0.3 },
    { skin, legs: leg, boot: '#8a5a36', bootCuff: '#a8744a', bootH: 0.15, sleeve: coat, shirt });
  const T = p.torso, top = r.d.torsoL;
  // the long cream coat-dress of picture 4: a fitted bodice, a belt, an A-line skirt to mid-calf, open a little
  // at the front over the under-dress, with a stitched band at the hem
  bodice(r, T, coat, top - 0.01, 0.05, 0.012, { lines: [0.3], seed: 1.3 });
  const [wx] = r.torsoAt(0.06);
  skirt(p, r, sway, '#e8dcc4', 0.06, 0.5, wx + 0.01, 0.185, { seed: 4.1, folds: 7, amt: 0.08, hem: 0.012 });
  skirt(p, r, sway, coat, 0.07, 0.53, wx + 0.016, 0.215, { start: 0.18, len: Math.PI * 2 - 0.36, seed: 2.1, folds: 9, amt: 0.11, lines: [-0.4], hem: 0.024, bulge: 0.012 });
  // a placket of buttons down the front
  for (let i = 0; i < 4; i++) { const y = 0.36 - i * 0.075; const [, rz] = r.torsoAt(y); k.add(T, new THREE.SphereGeometry(0.008, 6, 4), '#c8a070', 0.014, y, rz + 0.014, { ink: 0 }); }
  belt(k, T, 0.07, wx + 0.02, r.torsoAt(0.07)[1] + 0.02, '#8a5a32', '#d8ae52', 0.034);
  // wide sleeves, gathered at the shoulder, falling open at the wrist with a turned-back cuff
  for (const A of p.arms) {
    const w = r.armW(A.sh, A.el), aR = r.d.armR;
    k.add(A.sh, cloth([[aR + 0.016, 0.04], [aR + 0.022, -0.03], [aR + 0.026, -r.upL * 0.7], [aR + 0.032, -r.upL], [aR + 0.05, -r.upL - r.foL * 0.55], [aR + 0.062, -r.upL - r.foL * 0.85]], { n: 14, folds: 5, amt: 0.14, seed: A.sh.position.x * 30, hem: 0.008, yTop: -r.upL * 0.5 }), coat, 0, 0, 0, { w, lining: 0.72 });
    cuffBand(r, A, -r.foL * 0.84, aR + 0.06, '#e6d6b8', 0.034);
  }
  // the satchel on a strap over her right shoulder, the bag swinging on her left hip (a spring)
  crossStrap(k, T, [-0.11, top - 0.04, 0], [0.13, 0.02, 0], r.torsoAt(0.25)[0] + 0.03, 0.84, leather, 0.026);
  const bag = pivot(T, 0.16, 0.0, 0.035); bag.rotation.set(0, 0.25, 0.08);
  k.add(bag, new THREE.SphereGeometry(0.085, 14, 10), '#a8703e', 0.022, -0.075, 0, { s: [0.45, 0.82, 1.0] });
  k.add(bag, new THREE.SphereGeometry(0.086, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.5), '#8a5a30', 0.025, -0.05, 0, { s: [0.47, 0.75, 1.02] });
  k.add(bag, new THREE.BoxGeometry(0.012, 0.024, 0.018), '#d8ae52', 0.062, -0.08, 0.0, { ink: 0 });
  k.add(bag, strand([[0.02, -0.01, 0.03], [0.025, 0.04, 0.05], [0.03, 0.06, 0.035]], 0.02, 0.008), '#8ab060'); // a sprig poking out
  sway.add(bag, { freq: 1.5, damp: 0.22, gain: 0.07, wind: 0.12, bob: 0.35, limit: 0.7 });
  // the scarf
  const anchorsS = scarfWrap(p, r, sway, yellow, { bulk: 1.0, side: -1, seed: 1, endC: '#fff0c0' });
  // face: warm brown eyes, a light lash line, freckles, an open smile
  windFace(p, r, { skin, eye: '#6a4026', eyeW: 1.0, eyeH: 1.05, lash: 0.8, lashC: '#3a2218', brow: '#6e4226', browW: 0.95, browT: 0.85, browArch: 0.3, browTilt: 0.05, blush: '#f09884', freckles: true, nose: 'dot', mouth: 'smile' });
  // hair: a centre part, bangs swept from it, locks framing the face, the rest drawn back into two long braids
  const h = p.head;
  hairCap(k, h, hair, { front: 0.42, side: -0.12, back: -0.55, sheen: '#c08a5a' });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) k.add(h, lock([s * 0.06, 1.15 - i * 0.05], [s * (0.18 + i * 0.2), 0.3 - i * 0.06], 0.058 - i * 0.004, { thick: 0.018, curl: 0.004, steps: 6 }), hair, 0, 0, 0, { ink: 0.6 });
    k.add(h, lock([s * 0.85, 0.75], [s * 1.12, -0.5], 0.05, { thick: 0.018, curl: 0.012, steps: 6 }), hair, 0, 0, 0, { ink: 0.6 });
    k.add(h, lock([s * 1.15, 0.9], [s * 1.55, -0.1], 0.066, { thick: 0.02, steps: 6 }), hair, 0, 0, 0, { ink: 0.6 });
    for (let i = 0; i < 3; i++) k.add(h, lock([s * (0.6 + i * 0.45), 1.25], [s * (2.25 + i * 0.12), -0.05], 0.078, { thick: 0.022, steps: 7 }), hair, 0, 0, 0, { ink: 0.5 });
  }
  const { R, C } = headInfo();
  for (const s of [-1, 1]) {
    const at = new THREE.Vector3().copy(C).addScaledVector(dirAt(s * 2.1, -0.25), R * 1.0);
    out.braids.push(braid(k, sway, h, [at.x, at.y, at.z], hair, yellow, { segs: 6, r: 0.026, len: 0.38, rx: 0.35, rz: 0.14 * s }));
  }
  wisps(k, sway, h, hair, 4, 11);
  out.colliders = scarfColliders(p, r);
  const [l1, l2] = tails(1.18, 0.68, 0.5);
  out.scarves.push(
    { anchor: anchorsS[0], spec: { length: l1, width: 0.1, color: yellow, stripe: '#fff0c0', stripes: [[0.9, 0.93]], droop: 0.9, flutter: 1.1, seed: 1 } },
    { anchor: anchorsS[1], spec: { length: l2, width: 0.09, color: yellow, stripe: '#fff0c0', stripes: [[0.88, 0.91]], droop: 1.0, flutter: 1.2, seed: 4.6, segs: 14 } },
  );
  out.smile = 0.7; out.stance = 'satchel'; out.weight = -1;
  finish(p, r, sway, out);
}

// ================================================================ Zephy

function zephy(p: Person, L: PersonLook, out: Built) {
  const skin = L.skin, shirt = '#f2e8d4', hair = '#36271f', red = '#d8452e', leather = '#7a4a2a', brass = '#d0a24a', trousers = '#6c5440';
  const { k, sway, r } = begin(p, { legL: 0.68, torsoL: 0.45, B: 1.12, depth: 0.8, armL: 0.52, neckL: 0.05, neckR: 0.042, R: 0.152, thighR: 0.068, calfR: 0.054, armR: 0.04, hand: 1.22, coreInk: 1 },
    { skin, legs: trousers, boot: '#5a3a24', bootH: 0.22, bootS: 1.06, bootCuff: '#7a5034', sleeve: shirt, shirt, glove: '#8a5432' });
  const T = p.torso, top = r.d.torsoL;
  // trousers up to the waist, a loose shirt-tail over them, full sleeves with the gloves' cuffs
  k.add(p.hips, cloth([[r.torsoAt(0.08)[0] + 0.003, 0.08], [r.torsoAt(0)[0] + 0.006, -0.0], [0.11, -0.08], [0.0, -0.09]], { n: 18, folds: 4, amt: 0.03, hem: 0, hemLine: false, sz: 0.8 }), trousers);
  const [wx] = r.torsoAt(0.1);
  skirt(p, r, sway, shirt, 0.12, 0.2, wx + 0.012, wx + 0.04, { seed: 1.7, folds: 7, amt: 0.09, hem: 0.016, lining: 0.75 });
  for (const A of p.arms) {
    const w = r.armW(A.sh, A.el), aR = r.d.armR;
    // a full shirt sleeve, billowing over the forearm, gathered into the glove
    k.add(A.sh, cloth([[aR + 0.012, 0.045], [aR + 0.018, -0.05], [aR + 0.022, -r.upL], [aR + 0.024, -r.upL - r.foL * 0.5], [aR + 0.012, -r.upL - r.foL * 0.78]], { n: 12, folds: 5, amt: 0.14, seed: A.sh.position.x * 20, hem: 0.004, yTop: 0 }), shirt, 0, 0, 0, { w, lining: 0.75 });
    k.add(A.el, cloth([[aR * 0.7 + 0.012, -r.foL * 0.74], [aR * 0.8 + 0.022, -r.foL * 0.9], [aR * 0.75 + 0.014, -r.foL + 0.005]], { n: 10, folds: 0, amt: 0, hem: 0.002, hemLine: false }), '#8a5432', 0, 0, 0, { lining: 0.7 });
  }
  // an open collar
  for (const s of [-1, 1]) k.add(T, strand([[s * 0.014, top - 0.005, r.torsoAt(top - 0.02)[1] + 0.01], [s * 0.05, top - 0.05, r.torsoAt(top - 0.06)[1] + 0.016], [s * 0.066, top - 0.085, r.torsoAt(top - 0.09)[1] + 0.008]], 0.045, 0.007, { segs: 5, sides: 4, tip: 0.3, root: 1, up: () => new THREE.Vector3(0, 0.3, 1).normalize() }), shirt);
  // the flying harness, broad enough to read at play distance: shoulder straps front and back, a chest strap
  // with a brass ring, a broad belt with buckles, leg loops
  for (const s of [-1, 1]) for (const z of [1, -1]) torsoStrap(r, T, [[s * 0.55, top - 0.06], [s * 0.5, top * 0.68], [s * 0.44, top * 0.34], [s * 0.42, 0.06]], z, 0.036, leather, 0.008, 0.012);
  torsoStrap(r, T, [[-0.68, top * 0.62], [-0.2, top * 0.63], [0.2, top * 0.63], [0.68, top * 0.62]], 1, 0.03, leather, 0.016, 0.012);
  k.add(T, new THREE.TorusGeometry(0.018, 0.0055, 5, 12), brass, 0, top * 0.63, r.torsoAt(top * 0.63)[1] + 0.03, { ink: 0.5 });
  belt(k, T, 0.07, r.torsoAt(0.07)[0] + 0.022, r.torsoAt(0.07)[1] + 0.022, leather, brass, 0.05);
  for (const s of [-1, 1]) {
    k.add(T, new THREE.TorusGeometry(0.014, 0.0045, 4, 10), brass, s * 0.075, 0.035, r.torsoAt(0.04)[1] + 0.026, { ink: 0.5 });
    k.add(p.legs[s < 0 ? 0 : 1].thigh, new THREE.TorusGeometry(r.d.thighR + 0.01, 0.012, 5, 14), leather, 0, -0.06, 0, { r: [Math.PI / 2 + 0.25, 0, 0], s: [1, 1, 1.4] });
  }
  // a pouch on the hip
  const pouch = pivot(T, -0.14, 0.04, 0.02);
  k.add(pouch, new THREE.SphereGeometry(0.05, 10, 8), '#8a5a34', -0.01, -0.05, 0, { s: [0.5, 1, 1.1] });
  k.add(pouch, new THREE.SphereGeometry(0.051, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), leather, -0.01, -0.03, 0, { s: [0.52, 0.7, 1.12] });
  sway.add(pouch, { freq: 2, damp: 0.3, gain: 0.03, wind: 0.05, bob: 0.2, limit: 0.4 });
  const anchorsS = scarfWrap(p, r, sway, red, { bulk: 1.1, side: 1, seed: 3, endC: '#b83a28' });
  windFace(p, r, { skin, eye: '#4a2e1e', eyeW: 0.98, eyeH: 0.94, lash: 1.05, brow: hair, browW: 1.1, browT: 1.4, browArch: 0.18, browTilt: 0.12, cocky: true, blush: '#e48c78', nose: 'small', mouth: 'grin' });
  // tousled dark hair: a cap and locks every which way, a fringe falling over the brow, goggles pushed up
  const h = p.head;
  hairCap(k, h, hair, { front: 0.45, side: -0.2, back: -0.62, sheen: '#6a5246' });
  const fr: [number, number, number, number][] = [[-0.5, -0.65, 0.056, 0.05], [-0.15, -0.35, 0.066, 0.0], [0.15, 0.1, 0.06, 0.03], [0.45, 0.55, 0.056, 0.06], [0.75, 0.95, 0.05, 0.02], [-0.8, -1.0, 0.05, 0.03]];
  for (const [y0, y1, w, curl] of fr) k.add(h, lock([y0 * 0.6, 1.2], [y1, 0.3 + Math.abs(y1) * 0.12], w, { thick: 0.02, curl, steps: 6, out: [y1 * 0.02, 0.03, 0.015] }), hair, 0, 0, 0, { ink: 0.6 });
  const tufts: [number, number, number, number][] = [[0.0, 1.35, 0.35, 0.9], [0.7, 1.2, 1.2, 0.65], [-0.8, 1.15, -1.3, 0.55], [2.2, 1.0, 2.6, 0.3], [-2.2, 1.0, -2.6, 0.25], [3.0, 1.1, 3.1, 0.2], [1.6, 0.9, 1.9, 0.1], [-1.6, 0.9, -1.9, 0.05], [2.7, 0.5, 2.9, -0.4], [-2.7, 0.5, -2.95, -0.45]];
  for (const [y0, p0, y1, p1] of tufts) k.add(h, lock([y0, p0], [y1, p1], 0.066, { thick: 0.024, curl: 0.055, steps: 6 }), hair, 0, 0, 0, { ink: 0.6 });
  const { R, C } = headInfo();
  const strap = wrapLoop(R * 1.04, 0.012, { lumps: 1, creases: 0, flat: 0.5 });
  k.add(h, strap, '#5a3820', C.x, C.y + R * 0.28, C.z - R * 0.04, { r: [-0.42, 0, 0], s: [0.93, 1, 1.02], ink: 0.6 });
  const gp = new THREE.Vector3().copy(C).addScaledVector(dirAt(0, 0.62), R * 1.07);
  goggles(k, h, gp.x, gp.y, gp.z, { r: [-0.68, 0, 0], size: 1.3 });
  out.colliders = scarfColliders(p, r);
  const [l1, l2] = tails(1.2, 0.7, 0.5);
  out.scarves.push(
    { anchor: anchorsS[0], spec: { length: l1, width: 0.11, color: red, stripe: '#b83a28', stripes: [[0.06, 0.08]], droop: 0.9, tatter: true, seed: 2 } },
    { anchor: anchorsS[1], spec: { length: l2, width: 0.095, color: red, droop: 1.0, tatter: true, seed: 7.3, segs: 15 } },
  );
  out.smile = 1; out.stance = 'fists'; out.weight = 1;
  finish(p, r, sway, out);
}

// ================================================================ Gran Wren

function wren(p: Person, L: PersonLook, out: Built) {
  const skin = L.skin, jacket = '#8e5a34', dark = '#6a4026', fleece = '#f4ead6', blue = '#3f72b8', hair = '#f4f1ea', trousers = '#6a6250';
  const { k, sway, r } = begin(p, { legL: 0.6, torsoL: 0.43, B: 0.98, depth: 0.82, armL: 0.48, neckL: 0.05, neckR: 0.036, R: 0.145, thighR: 0.052, calfR: 0.043, armR: 0.034, hand: 1.12, coreInk: 0.3 },
    { skin, legs: trousers, boot: '#4a3020', bootH: 0.16, bootCuff: '#6a4a30', sleeve: jacket, shirt: '#d8cdb4' });
  const T = p.torso, top = r.d.torsoL;
  // a rounded old back under the jacket, so the hunch reads in silhouette
  k.add(T, new THREE.SphereGeometry(0.12, 14, 10), jacket, 0, top * 0.72, -0.045, { s: [1.05, 0.9, 0.75], ink: 0.9 });
  // the old flying jacket: open at the front, short, worn leather with seams, patched elbows, fleece cuffs
  bodice(r, T, jacket, top - 0.02, -0.08, 0.016, { start: 0.32, len: Math.PI * 2 - 0.64, lines: [top * 0.65, top * 0.28], seed: 0.4, flare: 0.02, lining: 0.7 });
  k.add(p.hips, cloth([[r.torsoAt(0.06)[0] + 0.003, 0.06], [r.torsoAt(0)[0] + 0.006, -0.0], [0.09, -0.07], [0.0, -0.08]], { n: 16, folds: 3, amt: 0.03, hem: 0, hemLine: false, sz: 0.8 }), trousers);
  for (const A of p.arms) {
    const w = r.armW(A.sh, A.el), aR = r.d.armR;
    k.add(A.sh, cloth([[aR + 0.014, 0.04], [aR + 0.018, -0.05], [aR + 0.017, -r.upL], [aR + 0.016, -r.upL - r.foL * 0.7], [aR + 0.017, -r.upL - r.foL * 0.86]], { n: 12, folds: 5, amt: 0.1, seed: A.sh.position.x * 12, hem: 0.004, lines: [-r.upL * 0.45] }), jacket, 0, 0, 0, { w, lining: 0.7 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.add(A.el, lump(0.016, 0.25, i + A.sh.position.x * 9), fleece, Math.sin(a) * (aR + 0.012), -r.foL * 0.86, Math.cos(a) * (aR + 0.012)); }
    k.add(A.el, new THREE.SphereGeometry(0.032, 10, 8), dark, 0, 0.0, -0.034, { s: [0.9, 1.1, 0.4] });
  }
  // the sheepskin collar: a broad shawl collar lying over the shoulders, its edge a fluffy roll of fleece
  const [cx, cz] = r.torsoAt(top - 0.06);
  k.add(T, cloth([[r.d.neckR + 0.02, top + 0.03], [cx * 0.8, top - 0.01], [cx + 0.03, top - 0.07], [cx + 0.04, top - 0.11]], { n: 22, start: 0.5, len: Math.PI * 2 - 1.0, folds: 6, amt: 0.06, hem: 0.008, hemLine: false, sz: cz / cx * 1.05 }), fleece, 0, 0, -0.004, { lining: 0.9, ink: 0.8 });
  for (let i = 0; i < 22; i++) {
    const a = 0.55 + (i / 21) * (Math.PI * 2 - 1.1);
    k.add(T, lump(0.022, 0.3, i * 1.7), fleece, Math.sin(a) * (cx + 0.04), top - 0.11 + Math.sin(i * 2.1) * 0.006, Math.cos(a) * (cz + 0.045) - 0.004, { s: [1.1, 0.8, 1], ink: 0.7 });
  }
  // the lapels running down the open front, fleece-edged
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { const y = top - 0.12 - i * 0.045; const [lx, lz] = r.torsoAt(y); k.add(T, lump(0.019, 0.3, i + s * 3), fleece, s * lx * 0.42, y, lz + 0.014, { ink: 0.6 }); }
  // a winner's pin on the jacket
  k.add(T, new THREE.CylinderGeometry(0.018, 0.018, 0.007, 12), '#e8c050', -0.09, top * 0.6, r.torsoAt(top * 0.6)[1] + 0.022, { r: [Math.PI / 2, 0, 0], ink: 0.5 });
  k.add(T, new THREE.ConeGeometry(0.01, 0.03, 3), '#c8402a', -0.09, top * 0.6 - 0.025, r.torsoAt(top * 0.55)[1] + 0.024, { r: [Math.PI, 0, 0], ink: 0 });
  const anchorsS = scarfWrap(p, r, sway, blue, { bulk: 0.85, side: 1, seed: 5, endC: '#e8eef8' });
  windFace(p, r, { skin, eye: '#3c5a7a', eyeW: 0.92, eyeH: 0.74, lash: 0.85, lids: 0.45, brow: '#d8d2c6', browW: 1.15, browT: 1.4, browArch: 0.12, browTilt: 0.2, blush: '#eaa090', wrinkles: true, nose: 'long', mouth: 'soft' });
  // white hair drawn back tight into a bun, a few wisps escaping; her old flying goggles pushed up on her brow
  const h = p.head;
  hairCap(k, h, hair, { front: 0.55, side: 0.0, back: -0.6, sheen: '#ffffff', lift: 0.008 });
  for (let i = -3; i <= 3; i++) k.add(h, lock([i * 0.28, 0.5], [i * 0.12 + Math.PI, 0.75], 0.055, { thick: 0.013, steps: 8, lift: 0.012 }), hair, 0, 0, 0, { ink: 0.4 });
  const { R, C } = headInfo();
  const bp = new THREE.Vector3().copy(C).addScaledVector(dirAt(Math.PI, 0.62), R * 1.12);
  k.add(h, lump(0.064, 0.14, 2), hair, bp.x, bp.y, bp.z, { s: [1, 0.92, 0.95] });
  k.add(h, new THREE.TorusGeometry(0.055, 0.012, 5, 16), '#dcd6ca', bp.x, bp.y - 0.008, bp.z + 0.012, { r: [0.9, 0, 0], ink: 0.5 });
  k.add(h, new THREE.CylinderGeometry(0.0045, 0.0045, 0.17, 5), blue, bp.x, bp.y + 0.01, bp.z, { r: [0.3, 0, 1.35], ink: 0.4 });
  const strap = wrapLoop(R * 1.05, 0.012, { lumps: 1, creases: 0, flat: 0.5 });
  k.add(h, strap, '#5a3820', C.x, C.y + R * 0.3, C.z - R * 0.02, { r: [-0.5, 0, 0], s: [0.93, 1, 1.02], ink: 0.6 });
  const gp = new THREE.Vector3().copy(C).addScaledVector(dirAt(0, 0.58), R * 1.08);
  goggles(k, h, gp.x, gp.y, gp.z, { r: [-0.6, 0, 0], size: 1.25, brass: '#b8863a' });
  wisps(k, sway, h, hair, 3, 23);
  // her cane: knotted ash with a brass ferrule and a worn knob, held upright under her hand
  const cane = new THREE.Group(); cane.position.set(0, -0.06, 0.02); p.arms[1].hand.add(cane);
  k.add(cane, new THREE.CylinderGeometry(0.013, 0.016, 0.78, 7), '#8a6440', 0, -0.36, 0, { ink: 0.8 });
  k.add(cane, lump(0.024, 0.15, 3), '#6a4a2c', 0, 0.03, 0, { s: [1.3, 0.9, 1], ink: 0.8 });
  k.add(cane, new THREE.CylinderGeometry(0.015, 0.014, 0.03, 7), '#c8a050', 0, -0.74, 0, { ink: 0.5 });
  for (let i = 0; i < 3; i++) k.add(cane, lump(0.017, 0.2, i), '#7a5434', 0, -0.15 - i * 0.2, 0, { s: [1, 0.6, 1], ink: 0.5 });
  sway.stand(cane, 0.05, 0);
  out.held = [cane];
  out.colliders = scarfColliders(p, r);
  const [l1, l2] = tails(1.25, 0.6, 0.42);
  out.scarves.push(
    { anchor: anchorsS[0], spec: { length: l1, width: 0.09, color: blue, stripe: '#e8eef8', stripes: [[0.78, 0.8], [0.84, 0.86]], droop: 1.0, seed: 3 } },
    { anchor: anchorsS[1], spec: { length: l2, width: 0.08, color: blue, stripe: '#e8eef8', stripes: [[0.82, 0.84]], droop: 1.1, seed: 9.4, segs: 12 } },
  );
  out.bent = 1; out.smile = 0.6; out.stance = 'cane'; out.weight = 1;
  finish(p, r, sway, out);
}

// ================================================================ the Sail-mender

function mender(p: Person, L: PersonLook, out: Built) {
  const skin = L.skin, shirt = '#9ab6c8', canvas = '#dccfae', strapC = '#a89770', scarfC = '#e2783a', beard = '#7a5236', hairC = '#6a4630', trousers = '#5e5444';
  const { k, sway, r } = begin(p, { legL: 0.8, torsoL: 0.6, B: 1.62, depth: 0.86, belly: 0.05, chest: 0.03, armL: 0.6, neckL: 0.06, neckR: 0.068, R: 0.15, thighR: 0.092, calfR: 0.072, armR: 0.058, hand: 1.45, hipX: 0.1 },
    { skin, legs: trousers, boot: '#4a3020', bootS: 1.12, bootH: 0.14, sleeve: shirt, fore: skin, shirt });
  const T = p.torso, top = r.d.torsoL;
  k.add(p.hips, cloth([[r.torsoAt(0.08)[0] + 0.003, 0.08], [r.torsoAt(0)[0] + 0.006, -0.0], [0.15, -0.09], [0.0, -0.1]], { n: 18, folds: 4, amt: 0.03, hem: 0, hemLine: false, sz: 0.85 }), trousers);
  // the shirt's open collar
  for (const s of [-1, 1]) k.add(T, strand([[s * 0.024, top - 0.01, r.torsoAt(top - 0.03)[1] + 0.006], [s * 0.066, top - 0.06, r.torsoAt(top - 0.07)[1] + 0.012], [s * 0.08, top - 0.1, r.torsoAt(top - 0.11)[1] + 0.004]], 0.055, 0.008, { segs: 5, sides: 4, tip: 0.3, root: 1, up: () => new THREE.Vector3(0, 0.3, 1).normalize() }), shirt);
  // rolled sleeves: a loose sleeve to above the elbow, turned back into a thick soft cuff
  for (const A of p.arms) {
    const w = r.armW(A.sh, A.el), aR = r.d.armR;
    k.add(A.sh, cloth([[aR + 0.016, 0.05], [aR + 0.022, -0.04], [aR * 0.94 + 0.022, -r.upL * 0.78]], { n: 12, folds: 5, amt: 0.1, seed: A.sh.position.x * 7, hem: 0, hemLine: false }), shirt, 0, 0, 0, { w, lining: 0.7 });
    k.add(A.sh, cloth([[aR * 0.92 + 0.02, -r.upL * 0.7], [aR * 0.98 + 0.032, -r.upL * 0.79], [aR * 0.92 + 0.028, -r.upL * 0.9], [aR * 0.88 + 0.012, -r.upL * 0.94]], { n: 12, folds: 4, amt: 0.08, hem: 0.004, hemLine: false, seed: A.sh.position.x * 5 }), new THREE.Color(shirt).multiplyScalar(0.93), 0, 0, 0, { w, lining: 0.75 });
  }
  // the canvas apron: bib and skirt in one, curved hem, folds, a stitched pocket, straps over the shoulders
  const atop = top * 0.74;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 10; i++) { const y = atop - (atop + 0.44) * (i / 10); const [rx] = r.torsoAt(Math.max(y, -0.05)); pts.push([rx + 0.016 + (y < 0.05 ? (0.05 - y) * 0.18 : 0), y]); }
  const apron = pivot(T, 0, 0.05, 0); p.coat = apron;
  const [rx0, rz0] = r.torsoAt(0.25);
  k.add(T, cloth(pts, { n: 18, start: -1.05, len: 2.1, folds: 5, amt: 0.06, yTop: 0.05, seed: 0.7, sz: rz0 / rx0 * 1.04, hem: 0.012, hemArc: 0.12, lines: [atop - 0.02, -0.16] }), canvas, 0, 0, 0, { w: r.skirtW(apron, 0.06, 0.32), lining: 0.8 });
  sway.add(apron, { freq: 1.7, damp: 0.35, gain: 0.025, wind: 0.25, bob: 0.06, limit: 0.4 });
  const pr = r.torsoAt(0.0)[0] + 0.026;
  k.add(T, cloth([[pr, 0.02], [pr + 0.006, -0.15]], { n: 8, start: -0.55, len: 1.1, folds: 0, amt: 0, hem: 0.003, lines: [-0.0], sz: rz0 / rx0 * 1.04 }), '#cfc09c', 0, 0, 0, { w: r.skirtW(apron, 0.06, 0.32), lining: 0.8 });
  for (let i = 0; i < 3; i++) k.add(T, new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4), '#e0e0e8', -0.07 + i * 0.014, 0.04, pr * rz0 / rx0 * 1.04 + 0.004, { r: [0, 0, 0.15 - i * 0.12], ink: 0.4, w: r.skirtW(apron, 0.06, 0.32) });
  for (const s of [-1, 1]) {
    torsoStrap(r, T, [[s * 0.5, atop - 0.01], [s * 0.46, top - 0.04]], 1, 0.034, strapC, 0.014);
    torsoStrap(r, T, [[s * 0.46, top - 0.04], [s * 0.1, top * 0.5], [-s * 0.5, 0.08]], -1, 0.034, strapC, 0.01);
  }
  belt(k, T, 0.08, r.torsoAt(0.08)[0] + 0.03, r.torsoAt(0.08)[1] + 0.032, '#8a6a40', '#b8b8b0', 0.04);
  k.add(T, wrapLoop(0.04, 0.014, { lumps: 4, creases: 12 }), '#e8d8a8', -r.torsoAt(0.08)[0] - 0.024, 0.05, 0.06, { r: [0, 0, Math.PI / 2] });
  const anchorsS = scarfWrap(p, r, sway, scarfC, { bulk: 1.15, side: -1, seed: 6, endC: '#f4e2b0' });
  windFace(p, r, { skin, eye: '#3a2418', eyeW: 0.92, eyeH: 0.82, lash: 0.95, lids: 0.3, brow: hairC, browW: 1.25, browT: 1.6, browArch: 0.22, browTilt: -0.12, blush: '#e08a70', nose: 'round', mouth: 'smile', lips: '#6a3030' });
  const h = p.head;
  hairCap(k, h, hairC, { front: 0.4, side: -0.35, back: -0.7, sheen: '#a07a58' });
  const { R, C } = headInfo();
  // a full short beard of real hair, like the World 1 shepherd's: soft clumps along the jaw and round the chin,
  // a moustache of two swept locks; his smile shows through it
  for (let i = 0; i < 11; i++) {
    const a = -1.45 + (i / 10) * 2.9;
    const d = dirAt(a, -0.42 - 0.22 * Math.cos(a));
    const pt = new THREE.Vector3().copy(C).addScaledVector(d, R * 0.98);
    k.add(h, lump(R * (0.26 + 0.06 * Math.cos(a)), 0.22, i * 1.3), beard, pt.x, pt.y - R * 0.04, pt.z - R * 0.05, { s: [1, 0.95, 0.8], ink: 0.8 });
  }
  { const pt = new THREE.Vector3().copy(C).addScaledVector(dirAt(0, -1.05), R * 0.95); k.add(h, lump(R * 0.34, 0.2, 9), beard, pt.x, pt.y - R * 0.06, pt.z + R * 0.06, { s: [1.15, 0.9, 0.8], ink: 0.8 }); }
  for (const s of [-1, 1]) k.add(h, lock([s * 0.04, -0.44], [s * 0.5, -0.62], 0.06, { thick: 0.024, lift: 0.01, steps: 6, curl: 0.006 }), new THREE.Color(beard).multiplyScalar(1.08), 0, 0, 0, { ink: 0.7 });
  // a battered straw hat tipped back off his face
  strawHat(k, h, sway, { R, brim: 2.2, crown: 0.8, band: '#c84a3a', y: 0.36, tilt: [-0.38, 0, -0.06], seed: 3 });
  // a big curved sail needle in the right hand, a spool of red thread in the left
  const nd = pivot(p.arms[1].hand, 0.0, -0.05, 0.02); nd.rotation.set(0.0, 0, 0.3);
  k.add(nd, new THREE.TorusGeometry(0.09, 0.0048, 5, 14, Math.PI * 0.6), '#e4e6ee', -0.09, 0.0, 0.0, { r: [0, 0, -0.2], ink: 0.5 });
  k.add(nd, new THREE.ConeGeometry(0.006, 0.03, 6), '#e4e6ee', 0.0, 0.09, 0, { r: [0, 0, 0.4], ink: 0.4 });
  const eye = pivot(nd, -0.07, -0.05, 0);
  const sp = pivot(p.arms[0].hand, 0, -0.06, 0.03);
  k.add(sp, new THREE.CylinderGeometry(0.032, 0.032, 0.065, 12), '#c8503a', 0, 0, 0, { r: [0, 0, Math.PI / 2] });
  for (const s of [-1, 1]) k.add(sp, new THREE.CylinderGeometry(0.043, 0.043, 0.012, 12), '#9a7048', 0.038 * s, 0, 0, { r: [0, 0, Math.PI / 2] });
  out.sew = { needle: eye, spool: sp };
  out.colliders = scarfColliders(p, r);
  const [l1, l2] = tails(1.98, 0.4, 0.3);
  out.scarves.push(
    { anchor: anchorsS[0], spec: { length: l1, width: 0.12, color: scarfC, stripe: '#f4e2b0', stripes: [[0.84, 0.88]], droop: 1.25, seed: 5, segs: 14 } },
    { anchor: anchorsS[1], spec: { length: l2, width: 0.11, color: scarfC, stripe: '#f4e2b0', stripes: [[0.8, 0.84]], droop: 1.3, seed: 8.2, segs: 12 } },
  );
  out.smile = 0.8; out.stance = 'sew'; out.weight = -1;
  finish(p, r, sway, out);
}

// ================================================================ the Chime-maker

function chimer(p: Person, L: PersonLook, out: Built) {
  const skin = L.skin, dress = '#5f8f8c', apronC = '#ece0c6', hair = '#bab6b2', lav = '#a98fd8', brass = '#d4a84a', silver = '#d8dce0';
  const { k, sway, r } = begin(p, { legL: 0.76, torsoL: 0.52, B: 0.92, depth: 0.76, armL: 0.56, neckL: 0.07, neckR: 0.034, R: 0.138, thighR: 0.055, calfR: 0.044, armR: 0.033, hand: 1.08, coreInk: 0.3 },
    { skin, legs: '#4e4a5a', boot: '#5a3a2a', bootH: 0.1, sleeve: dress, shirt: dress });
  const T = p.torso, top = r.d.torsoL;
  // a fitted bodice and a dress that tapers in at the waist and falls in long folds to the ankle
  bodice(r, T, dress, top - 0.01, 0.05, 0.011, { lines: [top * 0.6], seed: 0.5 });
  const [wx] = r.torsoAt(0.06);
  const sk = skirt(p, r, sway, dress, 0.06, r.d.legL - 0.03, wx + 0.012, 0.26, { seed: 1.1, folds: 10, amt: 0.1, hem: 0.016, lines: [-(r.d.legL - 0.03) + 0.1] });
  for (let i = 0; i < 6; i++) { const y = top * 0.84 - i * 0.065; const [, rz] = r.torsoAt(y); k.add(T, new THREE.SphereGeometry(0.008, 6, 4), brass, 0, y, rz + 0.013, { ink: 0 }); }
  // a work apron over the skirt, cream with a stitched pocket
  const [ax, az] = r.torsoAt(0.05);
  const apts: [number, number][] = [];
  for (let i = 0; i <= 6; i++) { const u = i / 6; apts.push([ax + 0.03 + 0.11 * Math.pow(u, 1.2), 0.05 - 0.6 * u]); }
  k.add(T, cloth(apts, { n: 14, start: -0.95, len: 1.9, folds: 5, amt: 0.06, seed: 2.2, sz: az / ax * 1.1, hem: 0.01, hemArc: 0.08, lines: [-0.2] }), apronC, 0, 0, 0, { w: r.skirtW(sk, 0.06, 0.45), lining: 0.8 });
  k.add(T, cloth([[ax + 0.075, -0.12], [ax + 0.085, -0.25]], { n: 8, start: -0.45, len: 0.9, folds: 0, amt: 0, hem: 0.003, lines: [-0.125], sz: az / ax * 1.1 }), '#ddd0b2', 0, 0, 0, { w: r.skirtW(sk, 0.06, 0.45), lining: 0.8 });
  for (const A of p.arms) {
    const w = r.armW(A.sh, A.el), aR = r.d.armR;
    k.add(A.sh, cloth([[aR + 0.013, 0.04], [aR + 0.016, -0.04], [aR + 0.015, -r.upL], [aR + 0.017, -r.upL - r.foL * 0.8], [aR + 0.026, -r.upL - r.foL * 0.9]], { n: 12, folds: 4, amt: 0.08, seed: A.sh.position.x * 11, hem: 0.004, yTop: -0.1 }), dress, 0, 0, 0, { w, lining: 0.7 });
    cuffBand(r, A, -r.foL * 0.86, aR + 0.024, '#ece2cc', 0.026);
  }
  // a pointed cream collar
  for (const s of [-1, 1]) k.add(T, strand([[s * 0.01, top - 0.005, r.torsoAt(top - 0.02)[1] + 0.012], [s * 0.05, top - 0.035, r.torsoAt(top - 0.04)[1] + 0.016], [s * 0.065, top - 0.085, r.torsoAt(top - 0.09)[1] + 0.01]], 0.05, 0.006, { segs: 5, sides: 4, tip: 0.1, root: 1, up: () => new THREE.Vector3(0, 0.4, 1).normalize() }), '#efe4d0');
  // the tool belt over the apron: little hammers and tuning forks swinging
  belt(k, T, 0.06, ax + 0.03, az + 0.03, '#7a5030', brass, 0.04);
  const tools: [number, number, number][] = [[-0.9, 0.1, 0], [-0.5, 0.11, 1], [0.55, 0.09, 2], [0.95, 0.1, 0], [-1.35, 0.09, 1], [1.4, 0.1, 2]];
  for (const [a, len, type] of tools) {
    const pv = pivot(T, Math.sin(a) * (ax + 0.04), 0.04, Math.cos(a) * (az + 0.04));
    if (type === 0 || type === 2) {
      k.add(pv, new THREE.CylinderGeometry(0.0065, 0.0065, len, 5), '#a8784a', 0, -len / 2, 0, { ink: 0.5 });
      k.add(pv, new THREE.BoxGeometry(type === 2 ? 0.048 : 0.038, 0.018, 0.018), type === 2 ? brass : '#8a8a90', 0, -len, 0, { r: [0, a, 0], ink: 0.5 });
    } else {
      k.add(pv, new THREE.CylinderGeometry(0.004, 0.004, 0.035, 4), silver, 0, -0.018, 0, { ink: 0 });
      for (const s of [-1, 1]) k.add(pv, new THREE.BoxGeometry(0.005, 0.065, 0.005), silver, 0.007 * s, -0.068, 0, { r: [0, a, 0], ink: 0.3 });
    }
    sway.add(pv, { freq: 2.4 + type * 0.3, damp: 0.25, gain: 0.05, wind: 0.15, bob: 0.35, limit: 0.6 });
  }
  const anchorsS = scarfWrap(p, r, sway, lav, { bulk: 0.85, side: 1, seed: 8, endC: '#f0e8ff' });
  windFace(p, r, { skin, eye: '#5a6a50', eyeW: 0.9, eyeH: 0.8, lash: 0.9, lids: 0.3, brow: '#8a8480', browW: 1.0, browT: 0.85, browArch: 0.32, browTilt: -0.05, blush: '#e09a8e', wrinkles: true, nose: 'long', mouth: 'soft', glasses: '#8a6a3a' });
  // grey hair in a low knot under a soft felt hat with a real crown and a lavender band
  const h = p.head;
  hairCap(k, h, hair, { front: 0.5, side: -0.1, back: -0.55, sheen: '#e8e6e2' });
  for (let i = -3; i <= 3; i++) k.add(h, lock([i * 0.3, 0.4], [i * 0.12 + Math.PI * (i < 0 ? -0.6 : 0.6), -0.2], 0.05, { thick: 0.014, steps: 7, lift: 0.011 }), hair, 0, 0, 0, { ink: 0.4 });
  const { R, C } = headInfo();
  const kp = new THREE.Vector3().copy(C).addScaledVector(dirAt(Math.PI, -0.25), R * 1.08);
  k.add(h, lump(0.055, 0.15, 7), hair, kp.x, kp.y, kp.z, { s: [1.1, 0.85, 0.9] });
  strawHat(k, h, sway, { R, brim: 1.75, crown: 0.95, band: lav, straw: '#8a7a6a', y: 0.34, tilt: [-0.16, 0, 0.1], ribbon: true, seed: 5 });
  wisps(k, sway, h, hair, 2, 31);
  // her little hammer in the right hand; a hand chime (a brass disc and four silver tubes) in the left
  const hm = pivot(p.arms[1].hand, 0, -0.04, 0.02); hm.rotation.set(0.5, 0, 0.1);
  k.add(hm, new THREE.CylinderGeometry(0.0075, 0.0075, 0.16, 6), '#a8784a', 0, 0.04, 0, { ink: 0.5 });
  k.add(hm, new THREE.BoxGeometry(0.052, 0.022, 0.022), brass, 0, 0.12, 0, { ink: 0.5 });
  const ch = new THREE.Group(); ch.position.set(0, -0.05, 0.01); p.arms[0].hand.add(ch);
  k.add(ch, new THREE.CylinderGeometry(0.003, 0.003, 0.05, 3), '#7a5030', 0, -0.025, 0, { ink: 0 });
  k.add(ch, new THREE.CylinderGeometry(0.03, 0.03, 0.008, 12), brass, 0, -0.052, 0, { ink: 0.5 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; k.add(ch, new THREE.CylinderGeometry(0.0055, 0.0055, 0.06 + i * 0.012, 6), silver, Math.sin(a) * 0.019, -0.09 - i * 0.006, Math.cos(a) * 0.019, { ink: 0.4 }); }
  sway.stand(ch, 0, 0);
  out.held = [ch];
  out.colliders = scarfColliders(p, r);
  const [l1, l2] = tails(1.62, 0.5, 0.36);
  out.scarves.push(
    { anchor: anchorsS[0], spec: { length: l1, width: 0.085, color: lav, stripe: '#f0e8ff', stripes: [[0.3, 0.32], [0.6, 0.62], [0.9, 0.92]], droop: 1.1, flutter: 1.3, seed: 6 } },
    { anchor: anchorsS[1], spec: { length: l2, width: 0.075, color: lav, stripe: '#f0e8ff', stripes: [[0.88, 0.9]], droop: 1.15, flutter: 1.3, seed: 11.5, segs: 13 } },
  );
  out.smile = 0.5; out.stance = 'chime'; out.weight = -1;
  finish(p, r, sway, out);
}

// ================================================================ a windfolk of the crowd

const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length) % a.length];

/**
 * The palette of the Sky Isles crowd: earthy and muted cloth (browns, olive, oatmeal, dusty blue, slate),
 * with the saturated festival colours saved for scarves, hat bands and kerchiefs, like picture 3.
 */
export const WIND_COLORS = {
  skins: [SKIN.fair, SKIN.light, SKIN.warm, SKIN.tan, SKIN.brown, SKIN.deep],
  hairs: ['#2e221c', '#5a3a24', '#7a5032', '#b08a5a', '#e2dcd2', '#3a2a28', '#8a4a2a'],
  shirts: ['#efe4cc', '#e8dcc2', '#dcd4c0', '#e6e0d2', '#d8cfb8'],
  coats: ['#8a6a4a', '#7d7f4e', '#9a8a6a', '#6f8296', '#a8613f', '#8f9a76', '#6b6f7a', '#7a5a44', '#b8a27a', '#5f6e5c'],
  scarves: ['#d8452e', '#2f9a9a', '#e8b030', '#3f72b8', '#e2783a', '#c8503a', '#3a8a7a', '#f0c040'],
  trousers: ['#6c5440', '#5e5444', '#4e566a', '#7a6a50', '#5a4a3e', '#6a6250'],
  bands: ['#c84a3a', '#2f8a9a', '#e8a33a', '#3f72b8', '#2a2a3a', '#7a3a2a'],
};

function crowdOne(p: Person, L: PersonLook, out: Built, seed: number) {
  const rr = mulberry(seed);
  const C = WIND_COLORS;
  const B = 1.05 + rr() * 0.45, skin = L.skin, hair = pick(rr, C.hairs);
  const shirt = pick(rr, C.shirts), coatC = pick(rr, C.coats), sc = pick(rr, C.scarves), tr = pick(rr, C.trousers);
  const style = Math.floor(rr() * 3); // 0 waistcoat, 1 long coat, 2 dress
  const hat = rr() < 0.55, rolled = rr() < 0.35;
  const legL = 0.72 + rr() * 0.06;
  const { k, sway, r } = begin(p, { legL, torsoL: 0.5 + rr() * 0.04, B, depth: 0.78 + (B - 1) * 0.15, belly: rr() < 0.3 ? 0.03 : 0, armL: 0.55, neckL: 0.06, neckR: 0.04 + (B - 1) * 0.03, R: 0.146 + rr() * 0.01, thighR: 0.06 * B, calfR: 0.048 * B, armR: 0.036 * B, hand: 1.15, coreInk: 0.3 },
    { skin, legs: style === 2 ? '#5a5048' : tr, boot: pick(rr, ['#5a3a24', '#4a3020', '#7a5034']), sleeve: shirt, fore: rolled ? skin : undefined, shirt });
  const T = p.torso;
  const [wx] = r.torsoAt(0.06);
  if (style !== 2) k.add(p.hips, cloth([[r.torsoAt(0.08)[0] + 0.003, 0.08], [r.torsoAt(0)[0] + 0.006, -0.0], [0.1 * B, -0.08], [0.0, -0.09]], { n: 16, folds: 3, amt: 0.03, hem: 0, hemLine: false, sz: 0.8 }), tr);
  if (style === 0) bodice(r, T, coatC, r.d.torsoL - 0.03, -0.06, 0.012, { start: 0.3, len: Math.PI * 2 - 0.6, lines: [0.25], seed, lining: 0.65 });
  if (style === 1) { bodice(r, T, coatC, r.d.torsoL - 0.01, 0.05, 0.012, { start: 0.2, len: Math.PI * 2 - 0.4, seed, lining: 0.65 }); skirt(p, r, sway, coatC, 0.07, legL * 0.55, wx + 0.016, wx + 0.08, { start: 0.3, len: Math.PI * 2 - 0.6, seed: seed + 1, folds: 7, amt: 0.08 }); }
  if (style === 2) { bodice(r, T, coatC, r.d.torsoL - 0.01, 0.05, 0.011, { seed }); skirt(p, r, sway, coatC, 0.07, legL * 0.82, wx + 0.014, 0.25, { seed: seed + 2, folds: 9, amt: 0.09 }); }
  if (rolled) for (const A of p.arms) k.add(A.sh, wrapLoop(r.d.armR * 0.9 + 0.022, 0.014, { lumps: 2, creases: 5, flat: 1.2 }), shirt, 0, -r.upL * 0.85, 0, { w: r.armW(A.sh, A.el) });
  belt(k, T, 0.07, wx + 0.02, r.torsoAt(0.07)[1] + 0.02, '#6e4528', '#c8a050', 0.032);
  const anchorsS = scarfWrap(p, r, sway, sc, { bulk: 0.95, side: rr() < 0.5 ? 1 : -1, seed });
  windFace(p, r, { skin, eye: pick(rr, ['#4a2e1e', '#3c5a7a', '#5a6a40', '#2a1e1a']), eyeH: 0.85 + rr() * 0.2, lash: style === 2 ? 0.9 : 0.8, lids: rr() * 0.3, brow: hair, browT: 1.1 + rr() * 0.4, blush: '#e8907e', nose: pick(rr, ['dot', 'small', 'round', 'long'] as const), mouth: rr() < 0.5 ? 'smile' : 'soft', wrinkles: rr() < 0.25 });
  const h = p.head;
  hairCap(k, h, hair, { front: 0.4, side: -0.2, back: -0.6 });
  for (let i = -2; i <= 2; i++) k.add(h, lock([i * 0.15, 1.1], [i * 0.3, 0.35], 0.056, { thick: 0.018, steps: 5, curl: 0.01 }), hair, 0, 0, 0, { ink: 0.5 });
  const { R, C: HC } = headInfo();
  if (style === 2 && rr() < 0.6) { const bp = new THREE.Vector3().copy(HC).addScaledVector(dirAt(Math.PI, 0.5), R * 1.1); k.add(h, lump(0.06, 0.14, seed), hair, bp.x, bp.y, bp.z); }
  if (hat) strawHat(k, h, sway, { R, brim: 2.0 + rr() * 0.4, crown: 0.75 + rr() * 0.2, band: pick(rr, C.bands), tilt: [-0.14 + rr() * 0.08, 0, (rr() - 0.5) * 0.2], ribbon: rr() < 0.6, seed });
  out.colliders = scarfColliders(p, r);
  out.scarves.push({ anchor: anchorsS[0], spec: { length: 0.34 + rr() * 0.12, width: 0.085, color: sc, droop: 1.3, seed } });
  out.smile = rr() < 0.6 ? 1 : 0;
  out.stance = pick(rr, ['easy', 'clasp', 'hips'] as Stance[]); out.weight = rr() < 0.5 ? 1 : -1;
  finish(p, r, sway, out);
}

// ================================================================ the cast

type Builder = (p: Person, L: PersonLook, out: Built) => void;
const CAST: Record<Exclude<WindfolkKind, 'crowd'>, { build: Builder; look: Partial<PersonLook> }> = {
  lark: { build: lark, look: { skin: SKIN.light, height: 0.82, gait: { rate: 1.15, stride: 0.95, bounce: 1.6, arm: 1.1 } } },
  zephy: { build: zephy, look: { skin: SKIN.warm, height: 0.84, gait: { rate: 1.1, stride: 1.1, bounce: 1.3, arm: 1.2, waddle: 0.02 } } },
  wren: { build: wren, look: { skin: SKIN.fair, height: 0.98, hunch: 1.5, gait: { rate: 1.1, stride: 0.75, bounce: 0.5, arm: 0.7 } } },
  mender: { build: mender, look: { skin: SKIN.tan, height: 1.13, gait: { rate: 0.75, stride: 0.85, bounce: 0.6, arm: 0.6, waddle: 0.05 } } },
  chimer: { build: chimer, look: { skin: SKIN.light, height: 1.0, gait: { rate: 0.9, stride: 0.95, bounce: 0.5, arm: 0.5 } } },
};

/**
 * Make one of the windfolk. Named characters ignore the seed; 'crowd' makes a different person per seed
 * (colours, build, coat, hat, hair, scarf), full detail, for the ones who walk about or talk.
 */
export function makeWindfolk(kind: WindfolkKind, seed = 1): Windfolk {
  const out: Built = { scarves: [], colliders: [], fingers: [], braids: [] };
  let look: PersonLook;
  const base: PersonLook = { skin: SKIN.light, hair: '#5a3a24', hairStyle: 'short', top: '#f2ead6', trousers: '#6c5440', boots: '#5a3a24' };
  if (kind === 'crowd') {
    const r = mulberry(seed + 77);
    look = { ...base, skin: pick(r, WIND_COLORS.skins), height: 0.9 + r() * 0.12, gait: { rate: 0.9 + r() * 0.3, stride: 0.9 + r() * 0.2, bounce: 0.6 + r(), arm: 0.8 + r() * 0.4 } };
    look.custom = (p, L) => crowdOne(p, L, out, seed);
  } else {
    const c = CAST[kind];
    look = { ...base, ...c.look } as PersonLook;
    look.custom = (p, L) => c.build(p, L, out);
  }
  return new Windfolk(kind, look, out);
}
