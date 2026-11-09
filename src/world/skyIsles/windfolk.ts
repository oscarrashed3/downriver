import * as THREE from 'three';
import { Person, type PersonLook, type PoseInput } from '../../player/person';
import { Sway, anchors } from '../../player/villagers';
import { lerp } from '../noise';
import { WindScarf, SKY_WIND, type ScarfSpec, type ScarfCollider } from './windScarf';
import { RigKit, cloth, strand, lump, wrapLoop, mulberry, type V3 } from './windRig';
import {
  windBody, windFace, hairCap, lock, scarfWrap, strawHat, belt, crossStrap, goggles, torsoStrap, pivot, headInfo, headPt, dirAt,
  type Rig, type Dims, type BodyCols,
} from './windBody';

export { Crowd, type CrowdSpot } from './windCrowd';
export { SKY_WIND } from './windScarf';
export { mulberry } from './windRig';

// The windfolk of the Sky Isles: light, long-limbed people whose long scarves always stream in the wind.
// They are Persons like the World 1 villagers (same joints, the same walk with its own gait, the same idles,
// blinking, glances and talking), built in the same hand-made way (small parts with folds, seams and springs),
// but to the proportions of the pictures: about 6 heads tall for the children, 7 for the grown-ups.
//   - Every static part of one character is merged into ONE skinned mesh on the Person's joints (windRig.ts):
//     3 draw calls a character, plus 2 a scarf tail. Limbs are continuous tubes that bend at knee and elbow.
//   - The face is drawn as decals lying on the skin (big tall eyes, tiny nose, three mouths), the hair is a
//     cap that follows the skull with strand clumps laid over it (windBody.ts).
//   - The scarf is wrapped round the neck in lumpy loops with a knot; its long tails are simulated ribbons
//     (windScarf.ts) that hang in soft S-curves and stream in the gusts.
//   - Poses on top of the Person's: cheer (both arms up, hopping), reach (the big farewell wave of picture 4),
//     glide (prone under a kite-wing, hands on the bar, legs trailing), and each character's own idle.
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
  /** Lying prone under a kite-wing (0..1). At 1 the hips sit at the root's origin, the head towards +z. */
  glide?: number;
  /** Roll of the wing while gliding (radians, + = right wing down). */
  bank?: number;
  /** The air's velocity in world space (m/s); defaults to SKY_WIND. Scarves, hair and cloth follow it. */
  air?: THREE.Vector3;
}

interface Built {
  scarves: { anchor: THREE.Object3D; spec: ScarfSpec }[];
  colliders: ScarfCollider[];
  fingers: THREE.Group[];
  braids: THREE.Object3D[];
  smile?: number;
  bent?: number;           // bent knees (Gran Wren)
  sew?: { needle: THREE.Object3D; spool: THREE.Object3D };
  stats?: { triangles: number; bones: number };
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q2 = new THREE.Vector3();

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

    const cheer = this.ease('cheer', p.cheer ?? 0, dt, 6);
    const reach = this.ease('reach', p.reach ?? 0, dt, 5);
    const glide = this.ease('glide', p.glide ?? 0, dt, 5);
    const bank = this.ease('bank', p.bank ?? 0, dt, 4);
    const still = p.speed < 0.3 ? 1 : 0;
    const busy = Math.max(cheer, reach, glide);
    let curl = 0.5; // fingers gently curled

    // our brows are drawn already shaped: undo the Person's default tilt
    for (let i = 0; i < 2; i++) this.brows[i].rotation.z += 0.12 * (i === 0 ? -1 : 1);
    // windfolk sway with the gusts when they stand
    this.torso.rotation.z += Math.sin(t * 0.8) * 0.02 * still;

    // ---- Gran Wren: knees always a little bent under her hunch
    if (this.b.bent) {
      const k = this.b.bent * (1 - glide);
      for (const L of this.legs) { L.thigh.rotation.x -= 0.24 * k; L.knee.rotation.x += 0.46 * k; }
      this.hips.position.y -= 0.028 * k;
    }

    // ---- the Sail-mender at rest: needle up in one hand, spool in the other, drawing the thread now and then
    if (this.b.sew) {
      const k = still * (1 - busy) * (p.sit ? 1 - p.sit : 1) * (p.talking ? 0.4 : 1);
      const pull = this.cycle2(t, 6.5, 1.4);
      const R = this.arms[1], L = this.arms[0];
      R.sh.rotation.x = lerp(R.sh.rotation.x, -0.7 - pull * 0.5, k); R.sh.rotation.z = lerp(R.sh.rotation.z, 0.3 + pull * 0.5, k); R.el.rotation.x = lerp(R.el.rotation.x, -1.75 + pull * 0.75, k);
      L.sh.rotation.x = lerp(L.sh.rotation.x, -0.42, k); L.sh.rotation.z = lerp(L.sh.rotation.z, -0.18, k); L.el.rotation.x = lerp(L.el.rotation.x, -1.25, k);
      this.head.rotation.x = lerp(this.head.rotation.x, 0.22, k * 0.7);
      curl = lerp(curl, 1.0, k);
    }

    // ---- cheer: arms flung up in a V, hands open, small hops, head up, mouth open
    if (cheer > 0.001) {
      const pump = Math.sin(t * 7.5);
      for (let i = 0; i < 2; i++) {
        const A = this.arms[i], s = i === 0 ? -1 : 1, ph = pump * (i ? 1 : -1);
        A.sh.rotation.x = lerp(A.sh.rotation.x, -0.3 + ph * 0.1, cheer);
        A.sh.rotation.z = lerp(A.sh.rotation.z, s * (2.6 + ph * 0.15), cheer);
        A.el.rotation.x = lerp(A.el.rotation.x, -0.3 - Math.max(0, ph) * 0.45, cheer);
        A.el.rotation.y = lerp(A.el.rotation.y, s * 1.4, cheer);
      }
      this.hips.position.y += Math.max(0, Math.sin(t * 5.2)) * 0.05 * cheer;
      this.torso.rotation.x -= 0.1 * cheer;
      this.head.rotation.x = lerp(this.head.rotation.x, -0.3, cheer);
      curl = lerp(curl, 0.15, cheer);
      if (cheer > 0.5 && !(p.surprise && p.surprise > 0.5)) { const o = Math.sin(t * 2.1) > -0.3; this.mouthO.visible = o; this.mouthSmile.visible = !o; this.mouthFlat.visible = false; }
    }

    // ---- reach: the farewell wave of picture 4: arm right up and out, hand open, body leaning after it
    if (reach > 0.001) {
      const rs = (p.reachSide ?? 1) < 0 ? -1 : 1;
      const A = this.arms[rs > 0 ? 1 : 0], B = this.arms[rs > 0 ? 0 : 1];
      const wv = Math.sin(t * 6.2);
      A.sh.rotation.x = lerp(A.sh.rotation.x, -0.45, reach);
      A.sh.rotation.z = lerp(A.sh.rotation.z, rs * (2.5 + wv * 0.12), reach);
      A.el.rotation.x = lerp(A.el.rotation.x, -0.12 - Math.max(0, wv) * 0.3, reach);
      A.el.rotation.y = lerp(A.el.rotation.y, rs * 1.5, reach);
      // the other arm drops back and out for balance
      B.sh.rotation.x = lerp(B.sh.rotation.x, 0.3, reach);
      B.sh.rotation.z = lerp(B.sh.rotation.z, -0.3 * rs, reach);
      B.el.rotation.x = lerp(B.el.rotation.x, -0.25, reach);
      this.torso.rotation.x = lerp(this.torso.rotation.x, -0.06, reach);
      this.torso.rotation.y = lerp(this.torso.rotation.y, 0.18 * rs, reach);
      this.torso.rotation.z = lerp(this.torso.rotation.z, -0.16 * rs, reach);
      this.head.rotation.x = lerp(this.head.rotation.x, -0.4, reach);
      this.head.rotation.y = lerp(this.head.rotation.y, 0.12 * rs, reach);
      this.head.rotation.z = lerp(this.head.rotation.z, -0.12 * rs, reach);
      // weight on one leg, the other knee easing
      const Lg = this.legs[rs > 0 ? 0 : 1];
      Lg.knee.rotation.x = lerp(Lg.knee.rotation.x, 0.3, reach);
      Lg.thigh.rotation.x = lerp(Lg.thigh.rotation.x, 0.12, reach);
      curl = lerp(curl, 0.05, reach);
      if (reach > 0.5) { this.mouthSmile.visible = true; this.mouthFlat.visible = false; this.mouthO.visible = false; }
    }

    // ---- glide: prone, the body stretched flat and long, hips at the root's origin, head towards +z
    if (glide > 0.001) {
      const H = this.H;
      this.body.rotation.x = lerp(this.body.rotation.x, Math.PI / 2, glide);
      this.body.rotation.z = lerp(this.body.rotation.z, -bank * 0.4, glide);
      this.body.position.set(0, lerp(this.body.position.y, 0.0, glide), lerp(this.body.position.z, -this.hipY * H, glide));
      this.hips.position.y = lerp(this.hips.position.y, this.hipY, glide);
      this.torso.rotation.set(lerp(this.torso.rotation.x, -0.08, glide), lerp(this.torso.rotation.y, 0, glide), lerp(this.torso.rotation.z, bank * 0.2, glide));
      // the head lifted to look ahead
      this.neck.rotation.x = lerp(this.neck.rotation.x, -0.55, glide);
      this.head.rotation.set(lerp(this.head.rotation.x, -0.75, glide), lerp(this.head.rotation.y, 0, glide), lerp(this.head.rotation.z, 0, glide));
      // arms reaching forward to the bar, a little bent, hands gripping it overhand
      const flex = Math.sin(t * 1.6) * 0.03;
      for (let i = 0; i < 2; i++) {
        const A = this.arms[i], s = i === 0 ? -1 : 1;
        A.sh.rotation.set(lerp(A.sh.rotation.x, -2.62 + flex + bank * 0.1 * s, glide), 0, lerp(A.sh.rotation.z, s * 0.3, glide));
        A.el.rotation.set(lerp(A.el.rotation.x, -0.38, glide), lerp(A.el.rotation.y, -s * 1.3, glide), 0);
      }
      // legs straight and together, trailing behind
      for (let i = 0; i < 2; i++) {
        const L = this.legs[i], s = i === 0 ? -1 : 1;
        L.thigh.rotation.x = lerp(L.thigh.rotation.x, 0.05 + Math.sin(t * 2.3 + i) * 0.02, glide);
        L.thigh.rotation.z = lerp(L.thigh.rotation.z, -s * 0.025, glide);
        L.knee.rotation.x = lerp(L.knee.rotation.x, 0.1 + (i ? 0.05 : 0), glide);
      }
      if (this.coat) this.coat.rotation.x = lerp(this.coat.rotation.x, -0.05 + Math.sin(t * 9) * 0.03, glide);
      // braids stream straight back in the slipstream
      for (const b of this.b.braids) b.rotation.x = lerp(b.rotation.x, 1.75 + Math.sin(t * 7 + b.id) * 0.06, glide);
      curl = lerp(curl, 1.45, glide);
    } else if (!this.b.bent) this.neck.rotation.x = 0;

    // fingers
    for (let i = 0; i < this.b.fingers.length; i++) this.b.fingers[i].rotation.z = -(i === 0 ? -1 : 1) * curl * 1.1;
    // the mouths are joints of the skinned face: hidden ones shrink to nothing
    for (const m of [this.mouthFlat, this.mouthSmile, this.mouthO]) m.scale.setScalar(m.visible ? 1 : 0.0001);
    if (this.mouthO.visible && cheer > 0.5) this.mouthO.scale.set(1.25, 1.35 + Math.sin(t * 6) * 0.15, 1);

    this.root.updateMatrixWorld(true);
    if (this.thread && this.b.sew) this.drawThread();
    // the scarves last, once every joint is where it will be drawn
    for (const s of this.scarves) s.update(dt, t, air);
  }

  private drawThread() {
    const a = this.b.sew!.needle.getWorldPosition(_v), b = this.b.sew!.spool.getWorldPosition(_w);
    const inv = _m4.copy(this.root.matrixWorld).invert();
    const pa = this.thread!.geometry.attributes.position as THREE.BufferAttribute;
    const sag = 0.1 * this.H;
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

const SKIN = { fair: '#f4d6be', light: '#f0c9a8', warm: '#e2ae88', tan: '#cc966e', brown: '#a8704e', deep: '#7e5238' };

/** Colliders for the scarf tails: the chest, the belly and the head. */
function scarfColliders(p: Person, r: Rig): ScarfCollider[] {
  const T = r.d.torsoL, [rx] = r.torsoAt(T * 0.6);
  return [
    { o: pivot(p.torso, 0, T * 0.62, 0), r: rx * 1.08 },
    { o: pivot(p.torso, 0, T * 0.25, 0), r: rx * 1.08 },
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
    // two plaited lobes a segment, crossing
    k.add(seg, new THREE.SphereGeometry(r, 9, 7), color, r * 0.32, -L * 0.3, 0, { s: [0.95, 1.35, 0.85], r: [0, 0, 0.55] });
    k.add(seg, new THREE.SphereGeometry(r, 9, 7), color, -r * 0.32, -L * 0.78, 0, { s: [0.95, 1.35, 0.85], r: [0, 0, -0.55] });
    sway.add(seg, { freq: 1.6 + i * 0.12, damp: 0.32, gain: 0.018, wind: 0.14, bob: 0.04, limit: 0.5 });
    par = seg;
  }
  k.add(par, new THREE.TorusGeometry(R * 0.6, R * 0.3, 5, 10), tie, 0, -L * 1.02, 0, { r: [Math.PI / 2, 0, 0], ink: 0.6 });
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
    k.add(wp, strand([[0, 0, 0], [out.x * 0.6, -L * 0.4, out.z * 0.6 + 0.006], [out.x * 1.3, -L * 0.75, out.z * 1.2 + 0.004], [out.x * 2.4 + s * 0.008, -L, out.z * 2.0]], 0.011, 0.005, { segs: 8, sides: 5, tip: 0.05, root: 1 }), color, 0, 0, 0, { ink: 0.5 });
    sway.add(wp, { freq: 2.4 + rnd(), damp: 0.2, gain: 0.03, wind: 0.5, bob: 0.1, limit: 0.7 });
  }
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
  out.stats = r.k.bake(p.body, p.root);
  sway.ref = p.root;
  p.sway = sway;
  if (p.look.hunch) p.torso.rotation.x = p.look.hunch * 0.3;
}

// ================================================================ Lark

function lark(p: Person, L: PersonLook, out: Built) {
  const skin = L.skin, coat = '#f3eadb', shirt = '#efe2c8', hair = '#6e4226', yellow = '#f4c234', leg = '#d9c4a0', leather = '#7a4a2a';
  const { k, sway, r } = begin(p, { legL: 0.95, torsoL: 0.52, B: 0.92, armL: 0.57, neckL: 0.085, neckR: 0.033, R: 0.132, thighR: 0.057, calfR: 0.045, armR: 0.031, coreInk: 0.3 },
    { skin, legs: leg, boot: '#8a5a36', bootCuff: '#a8744a', bootH: 0.19, sleeve: coat, shirt });
  const T = p.torso;
  // the long cream coat-dress: a fitted bodice, a belt, a skirt to mid-calf open a little at the front, flaring
  bodice(r, T, coat, r.d.torsoL - 0.01, 0.05, 0.011, { lines: [0.36], seed: 1.3 });
  const [wx] = r.torsoAt(0.06);
  skirt(p, r, sway, coat, 0.07, 0.74, wx + 0.014, 0.25, { start: 0.22, len: Math.PI * 2 - 0.44, seed: 2.1, folds: 9, amt: 0.1, lines: [-0.5], hem: 0.022, bulge: 0.01 });
  // a placket of buttons down the front
  for (let i = 0; i < 4; i++) { const y = 0.42 - i * 0.085; const [, rz] = r.torsoAt(y); k.add(T, new THREE.SphereGeometry(0.007, 6, 4), '#c8a070', 0.012, y, rz + 0.013, { ink: 0 }); }
  belt(k, T, 0.07, wx + 0.018, r.torsoAt(0.07)[1] + 0.018, '#8a5a32', '#d8ae52', 0.032);
  // wide sleeves, gathered at the shoulder, opening wide at the wrist
  for (const A of p.arms) {
    const w = r.armW(A.sh, A.el), aR = r.d.armR;
    k.add(A.sh, cloth([[aR + 0.014, 0.04], [aR + 0.02, -0.03], [aR + 0.026, -r.upL * 0.7], [aR + 0.034, -r.upL], [aR + 0.06, -r.upL - r.foL * 0.55], [aR + 0.078, -r.upL - r.foL * 0.92]], { n: 14, folds: 5, amt: 0.14, seed: A.sh.position.x * 30, hem: 0.01, yTop: -r.upL * 0.5 }), coat, 0, 0, 0, { w, lining: 0.72 });
  }
  // the satchel on a strap over her right shoulder, the bag swinging on her left hip
  crossStrap(k, T, [-0.1, 0.48, 0], [0.12, 0.02, 0], r.torsoAt(0.3)[0] + 0.03, 0.82, leather, 0.022);
  const bag = pivot(T, 0.135, 0.02, 0.03); bag.rotation.set(0, 0.2, 0.08);
  k.add(bag, new THREE.SphereGeometry(0.07, 12, 9), '#a8703e', 0.02, -0.07, 0, { s: [0.42, 0.85, 1.0] });
  k.add(bag, new THREE.SphereGeometry(0.071, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), '#8a5a30', 0.022, -0.045, 0, { s: [0.44, 0.75, 1.02] });
  k.add(bag, new THREE.BoxGeometry(0.012, 0.022, 0.016), '#d8ae52', 0.052, -0.07, 0.0, { ink: 0 });
  k.add(bag, strand([[0.02, -0.01, 0.03], [0.025, 0.04, 0.05], [0.03, 0.06, 0.035]], 0.018, 0.008), '#8ab060'); // a sprig poking out
  sway.add(bag, { freq: 1.7, damp: 0.25, gain: 0.05, wind: 0.08, bob: 0.3, limit: 0.6 });
  // scarf, wrapped bulky round the neck
  const anchorsS = scarfWrap(p, r, sway, yellow, { bulk: 1.05, side: -1, seed: 1, endC: '#fff0c0' });
  // face: big bright eyes, a light lash line, freckles, an open smile
  windFace(p, r, { skin, eye: '#6a4026', eyeW: 1.05, eyeH: 1.12, lash: 0.75, lashC: '#3a2218', brow: '#6e4226', browW: 0.95, browT: 0.75, browArch: 0.3, browTilt: 0.05, blush: '#f2a08c', freckles: true, nose: 'dot', mouth: 'smile' });
  // hair: a centre part, bangs swept from it, locks framing the face, the rest drawn back into two braids
  const h = p.head;
  hairCap(k, h, hair, { front: 0.42, side: -0.12, back: -0.55, sheen: '#c08a5a' });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) k.add(h, lock([s * 0.06, 1.15 - i * 0.05], [s * (0.18 + i * 0.2), 0.3 - i * 0.06], 0.052 - i * 0.004, { thick: 0.016, curl: 0.004, steps: 6 }), hair, 0, 0, 0, { ink: 0.6 });
    k.add(h, lock([s * 0.85, 0.75], [s * 1.12, -0.5], 0.045, { thick: 0.016, curl: 0.012, steps: 6 }), hair, 0, 0, 0, { ink: 0.6 });
    k.add(h, lock([s * 1.15, 0.9], [s * 1.55, -0.1], 0.06, { thick: 0.018, steps: 6 }), hair, 0, 0, 0, { ink: 0.6 });
    // the back, drawn into the braid roots: a few clumps over the cap so it is not one dome
    for (let i = 0; i < 3; i++) k.add(h, lock([s * (0.6 + i * 0.45), 1.25], [s * (2.25 + i * 0.12), -0.05], 0.07, { thick: 0.02, steps: 7 }), hair, 0, 0, 0, { ink: 0.5 });
  }
  const { R, C } = headInfo();
  for (const s of [-1, 1]) {
    const at = new THREE.Vector3().copy(C).addScaledVector(dirAt(s * 2.15, -0.22), R * 1.0);
    out.braids.push(braid(k, sway, h, [at.x, at.y, at.z], hair, yellow, { segs: 5, r: 0.022, len: 0.36, rx: 0.3, rz: 0.12 * s }));
  }
  wisps(k, sway, h, hair, 4, 11);
  out.colliders = scarfColliders(p, r);
  out.scarves.push(
    { anchor: anchorsS[0], spec: { length: 1.05, width: 0.15, color: yellow, stripe: '#fff0c0', stripes: [[0.9, 0.92]], droop: 0.95, seed: 1 } },
    { anchor: anchorsS[1], spec: { length: 0.72, width: 0.13, color: yellow, stripe: '#fff0c0', stripes: [[0.88, 0.9]], droop: 1.05, seed: 4, segs: 14 } },
  );
  out.smile = 0.7;
  finish(p, r, sway, out);
}

// ================================================================ Zephy

function zephy(p: Person, L: PersonLook, out: Built) {
  const skin = L.skin, shirt = '#f0e6d0', hair = '#36271f', red = '#d8452e', leather = '#7a4a2a', brass = '#d0a24a', trousers = '#6c5440';
  const { k, sway, r } = begin(p, { legL: 0.98, torsoL: 0.53, B: 0.98, armL: 0.59, neckL: 0.085, neckR: 0.036, R: 0.135, thighR: 0.06, calfR: 0.047, armR: 0.034, coreInk: 1 },
    { skin, legs: trousers, boot: '#5a3a24', bootH: 0.27, bootS: 1.04, bootCuff: '#7a5034', sleeve: shirt, shirt, glove: '#8a5432' });
  const T = p.torso;
  // trousers up to the waist, a loose shirt-tail over them, the sleeves full with gloves' cuffs
  k.add(p.hips, cloth([[r.torsoAt(0.08)[0] + 0.003, 0.08], [r.torsoAt(0)[0] + 0.006, -0.0], [0.1, -0.08], [0.0, -0.09]], { n: 18, folds: 4, amt: 0.03, hem: 0, hemLine: false, sz: 0.8 }), trousers);
  const [wx] = r.torsoAt(0.1);
  skirt(p, r, sway, shirt, 0.14, 0.24, wx + 0.01, wx + 0.035, { seed: 1.7, folds: 7, amt: 0.08, hem: 0.016, lining: 0.75 });
  for (const A of p.arms) {
    const w = r.armW(A.sh, A.el), aR = r.d.armR;
    k.add(A.sh, cloth([[aR + 0.01, 0.04], [aR + 0.016, -0.05], [aR + 0.018, -r.upL], [aR + 0.017, -r.upL - r.foL * 0.6], [aR + 0.012, -r.upL - r.foL * 0.8]], { n: 12, folds: 5, amt: 0.12, seed: A.sh.position.x * 20, hem: 0.004, yTop: 0 }), shirt, 0, 0, 0, { w, lining: 0.75 });
    // glove cuffs flaring over the wrist
    k.add(A.el, cloth([[aR * 0.7 + 0.01, -r.foL * 0.78], [aR * 0.8 + 0.018, -r.foL * 0.92], [aR * 0.75 + 0.012, -r.foL + 0.005]], { n: 10, folds: 0, amt: 0, hem: 0.002, hemLine: false }), '#8a5432', 0, 0, 0, { lining: 0.7 });
  }
  // an open collar
  for (const s of [-1, 1]) k.add(T, strand([[s * 0.012, r.d.torsoL - 0.01, r.torsoAt(0.5)[1] + 0.01], [s * 0.045, r.d.torsoL - 0.05, r.torsoAt(0.46)[1] + 0.016], [s * 0.06, r.d.torsoL - 0.08, r.torsoAt(0.44)[1] + 0.008]], 0.04, 0.006, { segs: 5, sides: 4, tip: 0.3, root: 1, up: () => new THREE.Vector3(0, 0.3, 1).normalize() }), shirt);
  // the flying harness: shoulder straps front and back, a chest strap with a brass ring, a broad belt, leg loops
  for (const s of [-1, 1]) for (const z of [1, -1]) torsoStrap(r, T, [[s * 0.55, r.d.torsoL - 0.06], [s * 0.5, 0.36], [s * 0.42, 0.18], [s * 0.4, 0.06]], z, 0.026, leather);
  torsoStrap(r, T, [[-0.65, 0.34], [-0.2, 0.345], [0.2, 0.345], [0.65, 0.34]], 1, 0.022, leather, 0.012);
  k.add(T, new THREE.TorusGeometry(0.014, 0.004, 5, 12), brass, 0, 0.345, r.torsoAt(0.345)[1] + 0.024, { ink: 0.5 });
  belt(k, T, 0.07, r.torsoAt(0.07)[0] + 0.02, r.torsoAt(0.07)[1] + 0.02, leather, brass, 0.045);
  for (const s of [-1, 1]) {
    k.add(T, new THREE.TorusGeometry(0.012, 0.003, 4, 10), brass, s * 0.07, 0.04, r.torsoAt(0.04)[1] + 0.022, { ink: 0.5 });
    k.add(p.legs[s < 0 ? 0 : 1].thigh, new THREE.TorusGeometry(r.d.thighR + 0.008, 0.009, 5, 14), leather, 0, -0.06, 0, { r: [Math.PI / 2 + 0.25, 0, 0], s: [1, 1, 1.4] });
  }
  // a pouch on the hip
  const pouch = pivot(T, -0.12, 0.05, 0.02);
  k.add(pouch, new THREE.SphereGeometry(0.045, 10, 8), '#8a5a34', -0.01, -0.05, 0, { s: [0.5, 1, 1.1] });
  k.add(pouch, new THREE.SphereGeometry(0.046, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), leather, -0.01, -0.03, 0, { s: [0.52, 0.7, 1.12] });
  sway.add(pouch, { freq: 2, damp: 0.3, gain: 0.03, wind: 0.05, bob: 0.2, limit: 0.4 });
  const anchorsS = scarfWrap(p, r, sway, red, { bulk: 1.15, side: 1, seed: 3, endC: '#b83a28' });
  windFace(p, r, { skin, eye: '#4a2e1e', eyeW: 0.98, eyeH: 0.98, lash: 1.05, brow: hair, browW: 1.1, browT: 1.35, browArch: 0.18, browTilt: 0.12, cocky: true, blush: '#e48c78', nose: 'small', mouth: 'grin' });
  // tousled dark hair: a cap and locks every which way, a fringe falling over the brow, goggles pushed up
  const h = p.head;
  hairCap(k, h, hair, { front: 0.45, side: -0.2, back: -0.62, sheen: '#6a5246' });
  const fr: [number, number, number, number][] = [[-0.5, -0.65, 0.05, 0.05], [-0.15, -0.35, 0.06, 0.0], [0.15, 0.1, 0.055, 0.03], [0.45, 0.55, 0.05, 0.06], [0.75, 0.95, 0.045, 0.02], [-0.8, -1.0, 0.045, 0.03]];
  for (const [y0, y1, w, curl] of fr) k.add(h, lock([y0 * 0.6, 1.2], [y1, 0.3 + Math.abs(y1) * 0.12], w, { thick: 0.018, curl, steps: 6, out: [y1 * 0.02, 0.03, 0.015] }), hair, 0, 0, 0, { ink: 0.6 });
  const tufts: [number, number, number, number][] = [[0.0, 1.35, 0.35, 0.9], [0.7, 1.2, 1.2, 0.65], [-0.8, 1.15, -1.3, 0.55], [2.2, 1.0, 2.6, 0.3], [-2.2, 1.0, -2.6, 0.25], [3.0, 1.1, 3.1, 0.2], [1.6, 0.9, 1.9, 0.1], [-1.6, 0.9, -1.9, 0.05], [2.7, 0.5, 2.9, -0.4], [-2.7, 0.5, -2.95, -0.45]];
  for (const [y0, p0, y1, p1] of tufts) k.add(h, lock([y0, p0], [y1, p1], 0.06, { thick: 0.022, curl: 0.05, steps: 6 }), hair, 0, 0, 0, { ink: 0.6 });
  const { R, C } = headInfo();
  const strap = wrapLoop(R * 1.04, 0.011, { lumps: 1, creases: 0, flat: 0.5 });
  k.add(h, strap, '#5a3820', C.x, C.y + R * 0.28, C.z - R * 0.04, { r: [-0.42, 0, 0], s: [0.93, 1, 1.02], ink: 0.6 });
  const gp = new THREE.Vector3().copy(C).addScaledVector(dirAt(0, 0.62), R * 1.07);
  goggles(k, h, gp.x, gp.y, gp.z, { r: [-0.68, 0, 0], size: 1.25 });
  out.colliders = scarfColliders(p, r);
  out.scarves.push(
    { anchor: anchorsS[0], spec: { length: 1.15, width: 0.16, color: red, stripe: '#b83a28', stripes: [[0.06, 0.08]], droop: 0.9, tatter: true, seed: 2 } },
    { anchor: anchorsS[1], spec: { length: 0.8, width: 0.14, color: red, droop: 1.0, tatter: true, seed: 7, segs: 15 } },
  );
  out.smile = 1;
  finish(p, r, sway, out);
}

// ================================================================ Gran Wren

function wren(p: Person, L: PersonLook, out: Built) {
  const skin = L.skin, jacket = '#8e5a34', dark = '#6a4026', fleece = '#f2e8d2', blue = '#3f72b8', hair = '#f4f1ea', trousers = '#6a6250';
  const { k, sway, r } = begin(p, { legL: 0.8, torsoL: 0.47, B: 0.86, armL: 0.53, neckL: 0.07, neckR: 0.03, R: 0.127, thighR: 0.047, calfR: 0.039, armR: 0.029, hand: 0.95, coreInk: 0.3 },
    { skin, legs: trousers, boot: '#4a3020', bootH: 0.2, bootCuff: '#6a4a30', sleeve: jacket, shirt: '#d8cdb4' });
  const T = p.torso;
  // the old flying jacket: open at the front, short, worn leather with seams, patched elbows, fleece cuffs
  bodice(r, T, jacket, r.d.torsoL - 0.02, -0.08, 0.014, { start: 0.32, len: Math.PI * 2 - 0.64, lines: [0.3, 0.12], seed: 0.4, flare: 0.018, lining: 0.7 });
  k.add(p.hips, cloth([[r.torsoAt(0.06)[0] + 0.003, 0.06], [r.torsoAt(0)[0] + 0.006, -0.0], [0.09, -0.07], [0.0, -0.08]], { n: 16, folds: 3, amt: 0.03, hem: 0, hemLine: false, sz: 0.8 }), trousers);
  for (const A of p.arms) {
    const w = r.armW(A.sh, A.el), aR = r.d.armR;
    k.add(A.sh, cloth([[aR + 0.013, 0.04], [aR + 0.017, -0.05], [aR + 0.016, -r.upL], [aR + 0.015, -r.upL - r.foL * 0.7], [aR + 0.016, -r.upL - r.foL * 0.86]], { n: 12, folds: 5, amt: 0.1, seed: A.sh.position.x * 12, hem: 0.004, lines: [-r.upL * 0.45] }), jacket, 0, 0, 0, { w, lining: 0.7 });
    k.add(A.el, lump(0.028, 0.15, A.sh.position.x * 9), fleece, 0, -r.foL * 0.86, 0, { s: [1.0, 0.5, 1.0] });
    k.add(A.el, new THREE.SphereGeometry(0.03, 10, 8), dark, 0, 0.0, -0.035, { s: [0.9, 1.1, 0.4] });
  }
  // a big fleece collar round the neck and shoulders
  const top = r.d.torsoL;
  k.add(T, wrapLoop(r.d.neckR + 0.07, 0.04, { seed: 4, lumps: 7, creases: 14, sx: 1.28, flat: 0.8 }), fleece, 0, top - 0.06, 0.0, { r: [0.15, 0, 0] });
  for (let i = 0; i < 9; i++) { const a = -2.4 + i * 0.6; k.add(T, lump(0.03, 0.25, i), fleece, Math.sin(a) * 0.12, top - 0.075 - Math.abs(Math.cos(a)) * 0.01, Math.cos(a) * 0.09 + 0.01, { s: [1, 0.8, 1] }); }
  for (const s of [-1, 1]) k.add(T, strand([[s * 0.05, top - 0.08, 0.09], [s * 0.07, top - 0.16, 0.1], [s * 0.08, top - 0.24, 0.09]], 0.06, 0.02, { segs: 6, tip: 0.5, root: 1, up: () => new THREE.Vector3(0, 0, 1) }), fleece); // lapels
  // a winner's pin and the old goggles round her neck, on their strap
  k.add(T, new THREE.CylinderGeometry(0.016, 0.016, 0.006, 12), '#e8c050', -0.075, 0.3, r.torsoAt(0.3)[1] + 0.02, { r: [Math.PI / 2, 0, 0], ink: 0.5 });
  k.add(T, new THREE.ConeGeometry(0.009, 0.026, 3), '#c8402a', -0.075, 0.278, r.torsoAt(0.28)[1] + 0.022, { r: [Math.PI, 0, 0], ink: 0 });
  k.add(T, wrapLoop(r.d.neckR + 0.055, 0.007, { lumps: 1, creases: 0, flat: 0.6, sx: 1.2 }), '#5a3820', 0, top - 0.09, 0.03, { r: [0.55, 0, 0], ink: 0.5 });
  goggles(k, T, 0, top - 0.15, r.torsoAt(top - 0.15)[1] + 0.04, { r: [0.35, 0, 0], size: 1.35 });
  const anchorsS = scarfWrap(p, r, sway, blue, { bulk: 0.85, side: 1, seed: 5, loops: 2, endC: '#e8eef8' });
  windFace(p, r, { skin, eye: '#3c5a7a', eyeW: 0.92, eyeH: 0.78, lash: 0.85, lids: 0.45, brow: '#d8d2c6', browW: 1.1, browT: 1.25, browArch: 0.12, browTilt: 0.2, blush: '#eaa090', wrinkles: true, nose: 'long', mouth: 'soft' });
  // white hair drawn back tight into a bun, a few wisps escaping
  const h = p.head;
  hairCap(k, h, hair, { front: 0.55, side: 0.0, back: -0.6, sheen: '#ffffff', lift: 0.007 });
  for (let i = -3; i <= 3; i++) k.add(h, lock([i * 0.28, 0.5], [i * 0.12 + Math.PI, 0.75], 0.05, { thick: 0.012, steps: 8, lift: 0.011 }), hair, 0, 0, 0, { ink: 0.4 });
  const { R, C } = headInfo();
  const bp = new THREE.Vector3().copy(C).addScaledVector(dirAt(Math.PI, 0.62), R * 1.12);
  k.add(h, lump(0.058, 0.14, 2), hair, bp.x, bp.y, bp.z, { s: [1, 0.92, 0.95] });
  k.add(h, new THREE.TorusGeometry(0.05, 0.011, 5, 16), '#dcd6ca', bp.x, bp.y - 0.008, bp.z + 0.012, { r: [0.9, 0, 0], ink: 0.5 });
  k.add(h, new THREE.CylinderGeometry(0.004, 0.004, 0.16, 5), blue, bp.x, bp.y + 0.01, bp.z, { r: [0.3, 0, 1.35], ink: 0.4 });
  wisps(k, sway, h, hair, 3, 23);
  out.colliders = scarfColliders(p, r);
  out.scarves.push(
    { anchor: anchorsS[0], spec: { length: 0.9, width: 0.12, color: blue, stripe: '#e8eef8', stripes: [[0.78, 0.8], [0.84, 0.86]], droop: 0.95, seed: 3 } },
    { anchor: anchorsS[1], spec: { length: 0.6, width: 0.105, color: blue, stripe: '#e8eef8', stripes: [[0.82, 0.84]], droop: 1.1, seed: 9, segs: 12 } },
  );
  out.bent = 1; out.smile = 0.6;
  finish(p, r, sway, out);
  p.neck.rotation.x = -0.32; // the head lifted against the hunch, looking ahead
}

// ================================================================ the Sail-mender

function mender(p: Person, L: PersonLook, out: Built) {
  const skin = L.skin, shirt = '#97b4c8', canvas = '#dccfae', strapC = '#a89770', green = '#5e9a52', beard = '#4a3428', trousers = '#5e5444';
  const { k, sway, r } = begin(p, { legL: 0.95, torsoL: 0.62, B: 1.5, depth: 0.82, belly: 0.05, chest: 0.025, armL: 0.64, neckL: 0.09, neckR: 0.06, R: 0.13, thighR: 0.085, calfR: 0.066, armR: 0.05, hand: 1.3, hipX: 0.095 },
    { skin, legs: trousers, boot: '#4a3020', bootS: 1.12, bootH: 0.15, sleeve: shirt, fore: skin, shirt });
  const T = p.torso;
  k.add(p.hips, cloth([[r.torsoAt(0.08)[0] + 0.003, 0.08], [r.torsoAt(0)[0] + 0.006, -0.0], [0.13, -0.09], [0.0, -0.1]], { n: 18, folds: 4, amt: 0.03, hem: 0, hemLine: false, sz: 0.85 }), trousers);
  // the shirt's open collar
  for (const s of [-1, 1]) k.add(T, strand([[s * 0.02, r.d.torsoL - 0.01, r.torsoAt(0.58)[1] + 0.006], [s * 0.06, r.d.torsoL - 0.06, r.torsoAt(0.54)[1] + 0.012], [s * 0.075, r.d.torsoL - 0.1, r.torsoAt(0.5)[1] + 0.004]], 0.05, 0.007, { segs: 5, sides: 4, tip: 0.3, root: 1, up: () => new THREE.Vector3(0, 0.3, 1).normalize() }), shirt);
  // rolled sleeves: a loose sleeve to above the elbow, turned back twice into a thick cuff
  for (const A of p.arms) {
    const w = r.armW(A.sh, A.el), aR = r.d.armR;
    k.add(A.sh, cloth([[aR + 0.014, 0.05], [aR + 0.02, -0.04], [aR * 0.92 + 0.02, -r.upL * 0.8]], { n: 12, folds: 5, amt: 0.1, seed: A.sh.position.x * 7, hem: 0, hemLine: false }), shirt, 0, 0, 0, { w, lining: 0.7 });
    k.add(A.sh, wrapLoop(aR * 0.9 + 0.022, 0.014, { lumps: 2, creases: 6, flat: 1.2, seed: A.sh.position.x * 5 }), shirt, 0, -r.upL * 0.8, 0, { w });
    k.add(A.sh, wrapLoop(aR * 0.88 + 0.018, 0.012, { lumps: 2, creases: 5, flat: 1.2, seed: A.sh.position.x * 3 }), new THREE.Color(shirt).multiplyScalar(0.9), 0, -r.upL * 0.8 - 0.022, 0, { w });
  }
  // the canvas apron: bib and skirt in one, curved hem, folds, a stitched pocket, straps over the shoulders
  const top = 0.46;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 10; i++) { const y = top - (top + 0.5) * (i / 10); const [rx] = r.torsoAt(Math.max(y, -0.05)); pts.push([rx + 0.014 + (y < 0.05 ? (0.05 - y) * 0.16 : 0), y]); }
  const apron = pivot(T, 0, 0.05, 0); p.coat = apron;
  const [rx0, rz0] = r.torsoAt(0.25);
  k.add(T, cloth(pts, { n: 18, start: -1.05, len: 2.1, folds: 5, amt: 0.06, yTop: 0.05, seed: 0.7, sz: rz0 / rx0 * 1.04, hem: 0.012, hemArc: 0.14, lines: [top - 0.02, -0.18] }), canvas, 0, 0, 0, { w: r.skirtW(apron, 0.06, 0.35), lining: 0.8 });
  sway.add(apron, { freq: 1.7, damp: 0.35, gain: 0.025, wind: 0.25, bob: 0.06, limit: 0.4 });
  // the pocket across the belly, stitched, with needles in it
  const pr = r.torsoAt(0.0)[0] + 0.024;
  k.add(T, cloth([[pr, 0.02], [pr + 0.006, -0.16]], { n: 8, start: -0.55, len: 1.1, folds: 0, amt: 0, hem: 0.003, lines: [-0.0], sz: rz0 / rx0 * 1.04 }), '#cfc09c', 0, 0, 0, { w: r.skirtW(apron, 0.06, 0.35), lining: 0.8 });
  for (let i = 0; i < 3; i++) k.add(T, new THREE.CylinderGeometry(0.0035, 0.0035, 0.12, 4), '#e0e0e8', -0.06 + i * 0.012, 0.04, pr * rz0 / rx0 * 1.04 + 0.004, { r: [0, 0, 0.15 - i * 0.12], ink: 0.4, w: r.skirtW(apron, 0.06, 0.35) });
  // straps from the bib over the shoulders, crossing at the back
  for (const s of [-1, 1]) {
    torsoStrap(r, T, [[s * 0.55, top - 0.01], [s * 0.5, r.d.torsoL - 0.04]], 1, 0.03, strapC, 0.014);
    torsoStrap(r, T, [[s * 0.5, r.d.torsoL - 0.04], [s * 0.1, 0.3], [-s * 0.5, 0.08]], -1, 0.03, strapC, 0.01);
  }
  belt(k, T, 0.08, r.torsoAt(0.08)[0] + 0.028, r.torsoAt(0.08)[1] + 0.03, '#8a6a40', '#b8b8b0', 0.036);
  // a coil of waxed twine on the belt
  k.add(T, wrapLoop(0.035, 0.012, { lumps: 4, creases: 12 }), '#e8d8a8', -r.torsoAt(0.08)[0] - 0.02, 0.05, 0.06, { r: [0, 0, Math.PI / 2] });
  const anchorsS = scarfWrap(p, r, sway, green, { bulk: 1.0, side: -1, seed: 6, loops: 2, endC: '#e8d070' });
  windFace(p, r, { skin, eye: '#3a2418', eyeW: 0.92, eyeH: 0.8, lash: 1.0, lids: 0.3, brow: beard, browW: 1.2, browT: 1.6, browArch: 0.2, browTilt: -0.1, blush: '#c8806a', nose: 'round', mouth: 'soft', lips: '#5a2a28' });
  // short dark hair under the hat, a full short beard and a mustache
  const h = p.head;
  hairCap(k, h, beard, { front: 0.4, side: -0.35, back: -0.7 });
  const { R, C } = headInfo();
  const bg = new THREE.SphereGeometry(1, 26, 18), ba = bg.attributes.position as THREE.BufferAttribute;
  const d = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < ba.count; i++) {
    d.fromBufferAttribute(ba, i).normalize();
    const side = Math.abs(d.x) > 0.62 && d.y < -0.15 && d.y > -0.9 && d.z > -0.3;
    const chin = d.y < -0.8 && d.z > -0.1;
    const keep = side || chin;
    headPt(d, keep ? R * (0.09 + 0.05 * Math.max(0, -d.y - 0.6)) : -R * 0.1, q, R, C);
    ba.setXYZ(i, q.x, q.y, q.z);
  }
  bg.computeVertexNormals();
  k.add(h, bg, beard, 0, 0, 0, { ink: 0.8 });
  for (const s of [-1, 1]) k.add(h, lock([s * 0.06, -0.48], [s * 0.42, -0.62], 0.05, { thick: 0.022, lift: 0.006, steps: 5 }), beard, 0, 0, 0, { ink: 0.6 });
  strawHat(k, h, sway, { R, brim: 2.6, crown: 0.6, band: '#c84a3a', y: 0.36, seed: 3 });
  // a big curved sail needle in the right hand, a spool of red thread in the left
  const nd = pivot(p.arms[1].hand, 0.0, -0.05, 0.02); nd.rotation.set(0.0, 0, 0.3);
  k.add(nd, new THREE.TorusGeometry(0.09, 0.0045, 5, 14, Math.PI * 0.6), '#e4e6ee', -0.09, 0.0, 0.0, { r: [0, 0, -0.2], ink: 0.5 });
  k.add(nd, new THREE.ConeGeometry(0.006, 0.03, 6), '#e4e6ee', 0.0, 0.09, 0, { r: [0, 0, 0.4], ink: 0.4 });
  const eye = pivot(nd, -0.07, -0.05, 0);
  const sp = pivot(p.arms[0].hand, 0, -0.06, 0.03);
  k.add(sp, new THREE.CylinderGeometry(0.03, 0.03, 0.06, 12), '#c8503a', 0, 0, 0, { r: [0, 0, Math.PI / 2] });
  for (const s of [-1, 1]) k.add(sp, new THREE.CylinderGeometry(0.04, 0.04, 0.012, 12), '#9a7048', 0.036 * s, 0, 0, { r: [0, 0, Math.PI / 2] });
  out.sew = { needle: eye, spool: sp };
  out.colliders = scarfColliders(p, r);
  out.scarves.push({ anchor: anchorsS[0], spec: { length: 0.95, width: 0.15, color: green, stripe: '#e8d070', stripes: [[0.12, 0.15], [0.86, 0.9]], droop: 1.15, seed: 5, segs: 14 } });
  out.smile = 0.8;
  finish(p, r, sway, out);
}

// ================================================================ the Chime-maker

function chimer(p: Person, L: PersonLook, out: Built) {
  const skin = L.skin, coat = '#5f8f8c', coatD = '#456e6c', hair = '#bab6b2', lav = '#a98fd8', brass = '#d4a84a', silver = '#d8dce0';
  const { k, sway, r } = begin(p, { legL: 0.98, torsoL: 0.56, B: 0.86, armL: 0.6, neckL: 0.095, neckR: 0.031, R: 0.122, thighR: 0.05, calfR: 0.04, armR: 0.029, hand: 0.95, coreInk: 0.3 },
    { skin, legs: '#4e4a5a', boot: '#5a3a2a', bootH: 0.12, sleeve: coat, shirt: coat });
  const T = p.torso;
  // a long coat-dress to the ankle, buttoned, over a darker underskirt
  bodice(r, T, coat, r.d.torsoL - 0.01, 0.05, 0.011, { lines: [0.32], seed: 0.5 });
  const [wx] = r.torsoAt(0.06);
  skirt(p, r, sway, coatD, 0.0, 0.86, wx + 0.012, 0.24, { seed: 1.1, folds: 9, amt: 0.08, hem: 0.014, spring: false });
  skirt(p, r, sway, coat, 0.07, 0.82, wx + 0.016, 0.26, { start: 0.3, len: Math.PI * 2 - 0.6, seed: 2.6, folds: 8, amt: 0.09, lines: [-0.45], hem: 0.018 });
  for (let i = 0; i < 6; i++) { const y = 0.46 - i * 0.075; const [, rz] = r.torsoAt(y); k.add(T, new THREE.SphereGeometry(0.008, 6, 4), brass, 0.03, y, rz + 0.013, { ink: 0 }); }
  for (const A of p.arms) {
    const w = r.armW(A.sh, A.el), aR = r.d.armR;
    k.add(A.sh, cloth([[aR + 0.012, 0.04], [aR + 0.015, -0.04], [aR + 0.014, -r.upL], [aR + 0.016, -r.upL - r.foL * 0.8], [aR + 0.026, -r.upL - r.foL * 0.9]], { n: 12, folds: 4, amt: 0.08, seed: A.sh.position.x * 11, hem: 0.004, yTop: -0.1 }), coat, 0, 0, 0, { w, lining: 0.7 });
    k.add(A.el, cloth([[aR + 0.02, -r.foL * 0.82], [aR + 0.03, -r.foL * 0.9]], { n: 12, folds: 0, amt: 0, hem: 0, hemLine: false }), '#ece2cc', 0, 0, 0, { lining: 0.8 });
  }
  // a pointed cream collar
  for (const s of [-1, 1]) k.add(T, strand([[s * 0.01, r.d.torsoL - 0.005, r.torsoAt(0.52)[1] + 0.012], [s * 0.05, r.d.torsoL - 0.035, r.torsoAt(0.5)[1] + 0.016], [s * 0.065, r.d.torsoL - 0.085, r.torsoAt(0.46)[1] + 0.01]], 0.05, 0.006, { segs: 5, sides: 4, tip: 0.1, root: 1, up: () => new THREE.Vector3(0, 0.4, 1).normalize() }), '#efe4d0');
  // the tool belt: little hammers and tuning forks swinging, a tiny chime
  const [bx, bz] = r.torsoAt(0.06);
  belt(k, T, 0.06, bx + 0.024, bz + 0.024, '#7a5030', brass, 0.038);
  const tools: [number, number, number][] = [[-0.9, 0.1, 0], [-0.5, 0.11, 1], [0.55, 0.09, 2], [0.95, 0.1, 0], [-1.35, 0.09, 1], [1.4, 0.1, 2]];
  for (const [a, len, type] of tools) {
    const pv = pivot(T, Math.sin(a) * (bx + 0.03), 0.04, Math.cos(a) * (bz + 0.03));
    if (type === 0 || type === 2) {
      k.add(pv, new THREE.CylinderGeometry(0.006, 0.006, len, 5), '#a8784a', 0, -len / 2, 0, { ink: 0.5 });
      k.add(pv, new THREE.BoxGeometry(type === 2 ? 0.045 : 0.036, 0.016, 0.016), type === 2 ? brass : '#8a8a90', 0, -len, 0, { r: [0, a, 0], ink: 0.5 });
    } else {
      k.add(pv, new THREE.CylinderGeometry(0.004, 0.004, 0.035, 4), silver, 0, -0.018, 0, { ink: 0 });
      for (const s of [-1, 1]) k.add(pv, new THREE.BoxGeometry(0.005, 0.065, 0.005), silver, 0.007 * s, -0.068, 0, { r: [0, a, 0], ink: 0.3 });
    }
    sway.add(pv, { freq: 2.4 + type * 0.3, damp: 0.25, gain: 0.05, wind: 0.15, bob: 0.35, limit: 0.6 });
  }
  const chime = pivot(T, -0.06, 0.04, bz + 0.04);
  k.add(chime, new THREE.CylinderGeometry(0.0025, 0.0025, 0.04, 3), '#7a5030', 0, -0.02, 0, { ink: 0 });
  k.add(chime, new THREE.CylinderGeometry(0.024, 0.024, 0.007, 10), brass, 0, -0.042, 0, { ink: 0.4 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; k.add(chime, new THREE.CylinderGeometry(0.005, 0.005, 0.05 + i * 0.01, 6), silver, Math.sin(a) * 0.016, -0.075 - i * 0.005, Math.cos(a) * 0.016, { ink: 0.3 }); }
  sway.add(chime, { freq: 1.9, damp: 0.2, gain: 0.06, wind: 0.3, bob: 0.4, limit: 0.7 });
  const anchorsS = scarfWrap(p, r, sway, lav, { bulk: 0.9, side: 1, seed: 8, loops: 2, endC: '#f0e8ff' });
  windFace(p, r, { skin, eye: '#5a6a50', eyeW: 0.9, eyeH: 0.82, lash: 0.9, lids: 0.3, brow: '#8a8480', browW: 1.0, browT: 0.8, browArch: 0.32, browTilt: -0.05, blush: '#e09a8e', wrinkles: true, nose: 'long', mouth: 'soft', glasses: '#8a6a3a' });
  // grey hair swept up into a high knot with a pencil through it
  const h = p.head;
  hairCap(k, h, hair, { front: 0.5, side: -0.1, back: -0.55, sheen: '#e8e6e2' });
  for (let i = -3; i <= 3; i++) k.add(h, lock([i * 0.3, 0.4], [i * 0.1, 1.35], 0.05, { thick: 0.014, steps: 7, lift: 0.011 }), hair, 0, 0, 0, { ink: 0.4 });
  const { R, C } = headInfo();
  const kp = new THREE.Vector3().copy(C).addScaledVector(dirAt(Math.PI, 1.25), R * 1.1);
  k.add(h, lump(0.06, 0.15, 7), hair, kp.x, kp.y + 0.02, kp.z, { s: [1, 0.85, 1] });
  k.add(h, new THREE.TorusGeometry(0.05, 0.01, 5, 14), '#9a9690', kp.x, kp.y, kp.z, { r: [Math.PI / 2 - 0.2, 0, 0], ink: 0.4 });
  k.add(h, new THREE.CylinderGeometry(0.0065, 0.0065, 0.22, 6), '#e8c040', kp.x, kp.y + 0.03, kp.z, { r: [0.3, 0, 1.3], ink: 0.5 });
  k.add(h, new THREE.ConeGeometry(0.0065, 0.02, 6), '#3a3030', kp.x - 0.11, kp.y + 0.055, kp.z, { r: [0, 0, 1.3 + Math.PI / 2], ink: 0 });
  wisps(k, sway, h, hair, 2, 31);
  // a little hammer in her hand
  const hm = pivot(p.arms[1].hand, 0, -0.04, 0.02); hm.rotation.set(0.5, 0, 0.1);
  k.add(hm, new THREE.CylinderGeometry(0.007, 0.007, 0.16, 6), '#a8784a', 0, 0.04, 0, { ink: 0.5 });
  k.add(hm, new THREE.BoxGeometry(0.05, 0.02, 0.02), brass, 0, 0.12, 0, { ink: 0.5 });
  out.colliders = scarfColliders(p, r);
  out.scarves.push(
    { anchor: anchorsS[0], spec: { length: 1.2, width: 0.12, color: lav, stripe: '#f0e8ff', stripes: [[0.3, 0.32], [0.6, 0.62], [0.9, 0.92]], droop: 0.95, seed: 6 } },
    { anchor: anchorsS[1], spec: { length: 0.85, width: 0.11, color: lav, stripe: '#f0e8ff', stripes: [[0.88, 0.9]], droop: 1.05, seed: 11, segs: 13 } },
  );
  out.smile = 0.5;
  finish(p, r, sway, out);
}

// ================================================================ a windfolk of the crowd

const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length) % a.length];

/**
 * The palette of the Sky Isles crowd: earthy and muted cloth (browns, olive, oatmeal, dusty blue, slate),
 * with the saturated festival colours saved for scarves and hat bands, like picture 3.
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
  const B = 0.95 + rr() * 0.45, skin = L.skin, hair = pick(rr, C.hairs);
  const shirt = pick(rr, C.shirts), coatC = pick(rr, C.coats), sc = pick(rr, C.scarves), tr = pick(rr, C.trousers);
  const style = Math.floor(rr() * 3); // 0 waistcoat, 1 long coat, 2 dress
  const hat = rr() < 0.7, rolled = rr() < 0.35;
  const { k, sway, r } = begin(p, { legL: 0.92 + rr() * 0.1, torsoL: 0.55 + rr() * 0.05, B, depth: 0.76 + (B - 1) * 0.2, belly: rr() < 0.3 ? 0.03 : 0, armL: 0.6, neckL: 0.08, neckR: 0.035 + (B - 1) * 0.03, R: 0.122 + rr() * 0.01, thighR: 0.055 * B, calfR: 0.044 * B, armR: 0.031 * B, coreInk: 0.3 },
    { skin, legs: style === 2 ? '#5a5048' : tr, boot: pick(rr, ['#5a3a24', '#4a3020', '#7a5034']), sleeve: shirt, fore: rolled ? skin : undefined, shirt });
  const T = p.torso;
  const [wx] = r.torsoAt(0.06);
  if (style !== 2) k.add(p.hips, cloth([[r.torsoAt(0.08)[0] + 0.003, 0.08], [r.torsoAt(0)[0] + 0.006, -0.0], [0.1, -0.08], [0.0, -0.09]], { n: 16, folds: 3, amt: 0.03, hem: 0, hemLine: false, sz: 0.8 }), tr);
  if (style === 0) bodice(r, T, coatC, r.d.torsoL - 0.03, -0.06, 0.012, { start: 0.3, len: Math.PI * 2 - 0.6, lines: [0.25], seed, lining: 0.65 });
  if (style === 1) { bodice(r, T, coatC, r.d.torsoL - 0.01, 0.05, 0.012, { start: 0.2, len: Math.PI * 2 - 0.4, seed, lining: 0.65 }); skirt(p, r, sway, coatC, 0.07, 0.5, wx + 0.016, wx + 0.08, { start: 0.3, len: Math.PI * 2 - 0.6, seed: seed + 1, folds: 7, amt: 0.08 }); }
  if (style === 2) { bodice(r, T, coatC, r.d.torsoL - 0.01, 0.05, 0.011, { seed }); skirt(p, r, sway, coatC, 0.07, 0.72, wx + 0.014, 0.25, { seed: seed + 2, folds: 9, amt: 0.09 }); }
  if (rolled) for (const A of p.arms) k.add(A.sh, wrapLoop(r.d.armR * 0.9 + 0.02, 0.012, { lumps: 2, creases: 5, flat: 1.2 }), shirt, 0, -r.upL * 0.85, 0, { w: r.armW(A.sh, A.el) });
  belt(k, T, 0.07, wx + 0.02, r.torsoAt(0.07)[1] + 0.02, '#6e4528', '#c8a050', 0.03);
  const anchorsS = scarfWrap(p, r, sway, sc, { bulk: 0.95, side: rr() < 0.5 ? 1 : -1, seed, loops: 2 });
  windFace(p, r, { skin, eye: pick(rr, ['#4a2e1e', '#3c5a7a', '#5a6a40', '#2a1e1a']), eyeH: 0.85 + rr() * 0.2, lash: style === 2 ? 0.9 : 0.8, lids: rr() * 0.3, brow: hair, browT: 1 + rr() * 0.4, blush: '#e8907e', nose: pick(rr, ['dot', 'small', 'round', 'long'] as const), mouth: rr() < 0.5 ? 'smile' : 'soft', wrinkles: rr() < 0.25 });
  const h = p.head;
  hairCap(k, h, hair, { front: 0.4, side: -0.2, back: -0.6 });
  for (let i = -2; i <= 2; i++) k.add(h, lock([i * 0.15, 1.1], [i * 0.3, 0.35], 0.05, { thick: 0.016, steps: 5, curl: 0.01 }), hair, 0, 0, 0, { ink: 0.5 });
  const { R, C: HC } = headInfo();
  if (style === 2 && rr() < 0.6) { const bp = new THREE.Vector3().copy(HC).addScaledVector(dirAt(Math.PI, 0.5), R * 1.1); k.add(h, lump(0.055, 0.14, seed), hair, bp.x, bp.y, bp.z); }
  if (hat) strawHat(k, h, sway, { R, brim: 2.2 + rr() * 0.5, crown: 0.45 + rr() * 0.2, band: pick(rr, C.bands), tilt: [-0.12 + rr() * 0.08, 0, (rr() - 0.5) * 0.2], ribbon: rr() < 0.6, seed });
  out.colliders = scarfColliders(p, r);
  out.scarves.push({ anchor: anchorsS[0], spec: { length: 0.75 + rr() * 0.4, width: 0.12, color: sc, droop: 1.05, seed } });
  out.smile = rr() < 0.6 ? 1 : 0;
  finish(p, r, sway, out);
}

// ================================================================ the cast

type Builder = (p: Person, L: PersonLook, out: Built) => void;
const CAST: Record<Exclude<WindfolkKind, 'crowd'>, { build: Builder; look: Partial<PersonLook> }> = {
  lark: { build: lark, look: { skin: SKIN.light, height: 0.7, gait: { rate: 1.15, stride: 0.95, bounce: 1.6, arm: 1.1 } } },
  zephy: { build: zephy, look: { skin: SKIN.warm, height: 0.7, gait: { rate: 1.1, stride: 1.1, bounce: 1.3, arm: 1.2, waddle: 0.02 } } },
  wren: { build: wren, look: { skin: SKIN.fair, height: 0.68, hunch: 1.1, gait: { rate: 1.1, stride: 0.75, bounce: 0.5, arm: 0.7 } } },
  mender: { build: mender, look: { skin: SKIN.brown, height: 1.04, gait: { rate: 0.75, stride: 0.85, bounce: 0.6, arm: 0.6, waddle: 0.05 } } },
  chimer: { build: chimer, look: { skin: SKIN.light, height: 0.95, gait: { rate: 0.9, stride: 0.95, bounce: 0.5, arm: 0.5 } } },
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
    look = { ...base, skin: pick(r, WIND_COLORS.skins), height: 0.86 + r() * 0.14, gait: { rate: 0.9 + r() * 0.3, stride: 0.9 + r() * 0.2, bounce: 0.6 + r(), arm: 0.8 + r() * 0.4 } };
    look.custom = (p, L) => crowdOne(p, L, out, seed);
  } else {
    const c = CAST[kind];
    look = { ...base, ...c.look } as PersonLook;
    look.custom = (p, L) => c.build(p, L, out);
  }
  return new Windfolk(kind, look, out);
}
