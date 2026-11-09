import * as THREE from 'three';
import type { Person } from '../../player/person';
import type { Sway } from '../../player/villagers';
import { RigKit, cloth, strand, wrapLoop, lump, lathe, limbWeights, smooth, wob, type V3, type Weights } from './windRig';

// The windfolk body, built for the Sky Isles look of the pictures: light and long-limbed, about 6 heads tall
// for the children and 7 for the grown-ups, slender necks, narrow shoulders, legs half the height, arms that
// reach mid-thigh. Limbs are single tapered tubes skinned across the knee and elbow (windRig.ts). The head is
// an anime head: a rounded skull with a small tapered chin, big tall eyes and a tiny nose drawn as decals
// that lie exactly on the skin, hair as a cap that follows the skull with strand clumps laid over it.

export interface Dims {
  legL: number;      // hip joint to sole
  torsoL: number;    // hip joint to the base of the neck
  B: number;         // width (1 = slim)
  depth?: number;    // front-to-back squash of the torso
  armL: number;      // shoulder to wrist
  neckL: number; neckR: number;
  R: number;         // head radius
  thighR: number; calfR: number; armR: number;
  hand?: number;     // hand size
  hipX?: number;
  belly?: number;    // a rounder middle (the Sail-mender)
  chest?: number;    // a fuller chest
  coreInk?: number;  // ink on the body under the clothes (0 when a garment covers it closely)
}

export interface BodyCols { skin: string; legs: string; boot: string; sole?: string; sleeve: string; fore?: string; shirt: string; glove?: string; bootCuff?: string; bootH?: number; bootS?: number }

/** The joints and handy points of a built body. */
export interface Rig {
  k: RigKit; d: Dims;
  shY: number; shX: number; upL: number; foL: number; thighL: number; shinL: number;
  fingers: THREE.Group[];
  C: THREE.Vector3;   // skull centre in head space
  eyesY: number;
  armW: (sh: THREE.Object3D, el: THREE.Object3D) => Weights;
  /** The torso's half-width and half-depth at height y (torso space), to lay straps and garments on it. */
  torsoAt: (y: number) => [number, number];
  /** The leg's radius at height y in the thigh's frame. */
  legAt: (y: number) => number;
  skirtW: (skirt: THREE.Object3D, waist: number, len: number) => Weights;
}

export const pivot = (parent: THREE.Object3D, x: number, y: number, z: number) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
/** An empty mesh used as a joint where Person expects a Mesh (hands, brows, mouths): it draws nothing. */
const proxy = (parent: THREE.Object3D, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(); m.position.set(x, y, z); m.userData.noOutline = true; parent.add(m); return m; };

const sph = (r: number, w = 12, h = 9) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt: number, rb: number, h: number, n = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, n, 1, open);
const tor = (r: number, t: number, arc = Math.PI * 2, rs = 6, ts = 16) => new THREE.TorusGeometry(r, t, rs, ts, arc);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const cap = (r: number, l: number, n = 8) => new THREE.CapsuleGeometry(r, l, 3, n);

/** Build the legs, torso, arms, hands, neck and skull of a windfolk on a Person's joints. */
export function windBody(p: Person, k: RigKit, d: Dims, c: BodyCols): Rig {
  const B = d.B, dp = d.depth ?? 0.74;
  const thighL = d.legL * 0.5, shinL = d.legL * 0.5 - 0.05;
  p.hipY = d.legL; p.hips.position.y = d.legL;
  const hipX = d.hipX ?? 0.068 * B;
  const tR = d.thighR, cR = d.calfR;
  const lprof: [number, number][] = [[0, 0.07], [tR * 0.9, 0.05], [tR, 0.0], [tR * 0.98, -thighL * 0.3], [tR * 0.84, -thighL * 0.7], [cR * 0.86, -thighL], [cR, -thighL - shinL * 0.28], [cR * 0.84, -thighL - shinL * 0.62], [cR * 0.62, -thighL - shinL], [0, -thighL - shinL - 0.02]];
  const legAt = (y: number) => interp(lprof, y);
  // ---- legs: one tube each from the hip to the ankle, bending at the knee
  for (const s of [-1, 1]) {
    const thigh = pivot(p.hips, hipX * s, 0, 0);
    const knee = pivot(thigh, 0, -thighL, 0);
    k.add(thigh, cloth(lprof, { n: 12, folds: 3, amt: 0.04, seed: s, hemLine: false, hem: 0 }), c.legs, 0, 0, 0, { w: limbWeights(thigh, knee, -thighL, 0.06, p.hips, 0.0, 0.3) });
    // soft boots: a shaft, a rounded toe, a dark sole, a turned cuff
    const bh = c.bootH ?? 0.16, bs = c.bootS ?? 1, f = -shinL;
    const lr = (y: number) => legAt(y - thighL) * bs + 0.013;
    k.add(knee, cloth([[lr(f + bh), f + bh], [lr(f + bh * 0.5), f + bh * 0.5], [lr(f + 0.02), f + 0.02], [lr(f) * 0.95, f - 0.03]], { n: 12, folds: 4, amt: 0.05, hem: 0, hemLine: false, lines: [f + bh * 0.35] }), c.boot);
    k.add(knee, sph(0.05, 12, 8), c.boot, 0, f - 0.022, 0.035, { s: [0.95 * bs * (cR / 0.05), 0.62, 1.75 * bs] });
    k.add(knee, sph(0.052, 12, 6), c.sole ?? '#3a2a20', 0, f - 0.042, 0.033, { s: [1.0 * bs * (cR / 0.05), 0.2, 1.8 * bs], ink: 0.6 });
    if (c.bootCuff) k.add(knee, tor(lr(f + bh), 0.014, Math.PI * 2, 5, 14), c.bootCuff, 0, f + bh, 0, { r: [Math.PI / 2, 0, 0], s: [1, 1, 1.3] });
    p.legs.push({ thigh, knee });
  }
  p.hips.add(p.torso);
  // ---- torso: hips, waist, chest, narrow sloping shoulders
  const T = d.torsoL, W = B, be = d.belly ?? 0, ch = d.chest ?? 0;
  const shY = T - 0.075, shX = 0.115 * W;
  const tprof: [number, number][] = [[0, -0.09], [0.1 * W, -0.075], [0.116 * W, -0.01], [0.112 * W + be * 0.5, 0.08], [0.1 * W + be, T * 0.36], [0.108 * W + be * 0.8 + ch * 0.5, T * 0.58], [0.118 * W + be * 0.3 + ch, T * 0.74], [0.118 * W, shY - 0.01], [0.09 * W, shY + 0.035], [d.neckR + 0.012, T - 0.012], [0, T]];
  k.add(p.torso, cloth(tprof.slice().reverse(), { n: 18, folds: 5, amt: 0.02, yTop: T, hemLine: false, hem: 0, shade: 0.1, sz: dp + be * 0.6 }), c.shirt, 0, 0, 0, { ink: d.coreInk ?? 1, w: (v) => { const wh = smooth(0.14, -0.05, v.y); return [[p.torso, 1 - wh], [p.hips, wh]]; } });
  // ---- arms
  const upL = d.armL * 0.52, foL = d.armL * 0.48, aR = d.armR;
  const armW = (sh: THREE.Object3D, el: THREE.Object3D) => limbWeights(sh, el, -upL, 0.045, p.torso, 0.0, 0.45);
  const fingers: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const sh = pivot(p.torso, shX * s, shY, 0); sh.rotation.z = 0.08 * s;
    const el = pivot(sh, 0, -upL, 0);
    const w = armW(sh, el);
    // the bare arm (or the sleeve, if the sleeve colour runs to the wrist)
    const aprof: [number, number][] = [[0, 0.04], [aR * 0.95, 0.025], [aR, -0.03], [aR * 0.9, -upL * 0.55], [aR * 0.76, -upL], [aR * 0.8, -upL - foL * 0.3], [aR * 0.58, -upL - foL], [0, -upL - foL - 0.01]];
    k.add(sh, cloth(aprof, { n: 10, folds: 3, amt: 0.03, seed: s * 3, hemLine: false, hem: 0 }), c.fore ?? c.sleeve, 0, 0, 0, { w, skin: (c.fore ?? c.sleeve) === c.skin });
    if (c.fore && c.fore !== c.sleeve) {
      // a sleeve over the upper arm, ending just below the elbow
      k.add(sh, cloth([[aR + 0.012, 0.045], [aR + 0.016, -0.02], [aR * 0.9 + 0.014, -upL * 0.6], [aR * 0.8 + 0.014, -upL - 0.035]], { n: 10, folds: 3, amt: 0.08, hem: 0.006 }), c.sleeve, 0, 0, 0, { w, lining: 0.75 });
    }
    k.add(sh, sph(aR * 1.15, 10, 8), c.sleeve, 0, -0.005, 0, { w: () => [[sh, 0.55], [p.torso, 0.45]] });
    // the hand: palm and thumb on the hand joint, the four fingers on their own joint so they can curl and open
    const hs = d.hand ?? 1, skin = c.glove ?? c.skin, isSkin = !c.glove;
    const hand = proxy(el, 0, -foL, 0);
    k.add(hand, sph(0.026 * hs, 10, 8), skin, 0, -0.028 * hs, 0.002, { s: [0.62, 1.2, 0.95], skin: isSkin });
    k.add(hand, cap(0.0085 * hs, 0.022 * hs, 6), skin, -0.012 * s * hs, -0.022 * hs, 0.02 * hs, { r: [0.6, 0, -0.5 * s], skin: isSkin });
    const fg = pivot(hand, 0, -0.054 * hs, 0); fingers.push(fg);
    for (let i = 0; i < 4; i++) k.add(fg, cap(0.0072 * hs, 0.026 * hs, 6), skin, 0.0015 * s, -0.016 * hs + Math.abs(i - 1.5) * 0.002, (-0.014 + i * 0.0095) * hs, { r: [0, 0, 0], skin: isSkin, ink: 0.7 });
    p.arms.push({ sh, el, hand });
  }
  // ---- neck and head
  p.neck.position.y = T - 0.02; p.torso.add(p.neck);
  k.add(p.neck, cyl(d.neckR * 0.95, d.neckR * 1.08, d.neckL + 0.06, 10, true), c.skin, 0, d.neckL / 2 - 0.01, 0.0, { skin: true, w: (v) => { const wt = smooth(0.0, -0.03, v.y); return [[p.neck, 1 - wt], [p.torso, wt]]; } });
  p.head.position.y = d.neckL; p.head.scale.setScalar(1); p.neck.add(p.head);
  p.head.add(p.hair);
  const C = new THREE.Vector3(0, d.R * 0.92, d.R * 0.12);
  headR = d.R; headC.copy(C);
  k.add(p.head, skull(d.R, C), c.skin, 0, 0, 0, { skin: true, ink: 0.8 });
  // small ears, mostly hidden by the hair
  for (const s of [-1, 1]) k.add(p.head, sph(d.R * 0.2, 8, 6), c.skin, s * d.R * 0.88, C.y - d.R * 0.12, C.z - d.R * 0.08, { s: [0.45, 1, 0.7], skin: true, ink: 0.6 });
  const skirtW = (skirt: THREE.Object3D, waist: number, len: number): Weights => (v) => { const ws = smooth(waist - 0.02, waist - len, v.y); return [[p.torso, 1 - ws], [skirt, ws]]; };
  const tsz = dp + be * 0.6;
  const tdown = tprof.slice().reverse();
  const torsoAt = (y: number): [number, number] => { const r = interp(tdown, y); return [r, r * tsz]; };
  return { k, d, shY, shX, upL, foL, thighL, shinL, fingers, C, eyesY: C.y - d.R * 0.2, armW, skirtW, torsoAt, legAt };
}

/** The radius of a top-down [r, y] profile at height y. */
function interp(prof: [number, number][], y: number) {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1], [r1, y1] = prof[i];
    if (y <= y0 && y >= y1) return r0 + (r1 - r0) * ((y - y0) / ((y1 - y0) || 1e-6));
  }
  return y > prof[0][1] ? prof[0][0] : prof[prof.length - 1][0];
}

/** A strap laid on the torso's surface through points [fraction of the half-width, y], front (1) or back (-1). */
export function torsoStrap(r: Rig, T: THREE.Object3D, pts: [number, number][], side: number, w: number, color: string, lift = 0.006, thick = 0.008) {
  const P: V3[] = pts.map(([fx, y]) => { const [rx, rz] = r.torsoAt(y); const x = fx * rx; return [x, y, side * (rz * Math.sqrt(Math.max(0.05, 1 - fx * fx)) + lift)]; });
  r.k.add(T, strand(P, w, thick, { segs: 12, sides: 4, tip: 1, root: 1, up: () => _b.set(0, 0, side) }), color, 0, 0, 0, { ink: 0.6 });
}

// ---------------------------------------------------------------- the head

let headR = 0.12;
const headC = new THREE.Vector3();
const _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

/** A point on the skull in the direction `d` (unit, from the centre), lifted `lift` off the skin. */
export function headPt(d: THREE.Vector3, lift = 0, out = new THREE.Vector3(), R = headR, C = headC) {
  let x = d.x * 0.9, y = d.y, z = d.z;
  if (d.y < 0) {
    const t = -d.y;
    x *= 1 - 0.34 * Math.pow(t, 1.2);
    if (d.z > 0) { z *= 1 - 0.04 * t; y *= 1.1; } else { z *= 1 - 0.32 * t; }
  }
  if (d.z > 0.5) z *= 1 - 0.07 * (d.z - 0.5) / 0.5; // a flatter face
  if (d.z < -0.2) z *= 1.04;                        // a rounder back of the head
  const k = R + lift;
  return out.set(C.x + x * k, C.y + y * k, C.z + z * k);
}
/** The direction on the face whose skin point lies at (x, y) (head space), found by a few fixed-point steps. */
function faceDir(x: number, y: number, out = new THREE.Vector3()) {
  out.set(x / headR / 0.9, (y - headC.y) / headR, 0);
  for (let i = 0; i < 6; i++) {
    out.z = Math.sqrt(Math.max(0.02, 1 - out.x * out.x - out.y * out.y));
    headPt(out, 0, _a);
    out.x += (x - _a.x) / headR; out.y += (y - _a.y) / headR;
  }
  out.z = Math.sqrt(Math.max(0.02, 1 - out.x * out.x - out.y * out.y));
  return out.normalize();
}
/** The skin normal at a direction (finite differences on the skull). */
function headNormal(d: THREE.Vector3, out = new THREE.Vector3()) {
  const e = 0.01;
  const t1 = _b.set(-d.z, 0, d.x).normalize(), t2 = new THREE.Vector3().crossVectors(d, t1).normalize();
  const p1 = headPt(_d.copy(d).addScaledVector(t1, e).normalize(), 0, new THREE.Vector3()), p0 = headPt(_d.copy(d).addScaledVector(t1, -e).normalize(), 0, new THREE.Vector3());
  const q1 = headPt(_d.copy(d).addScaledVector(t2, e).normalize(), 0, new THREE.Vector3()), q0 = headPt(_d.copy(d).addScaledVector(t2, -e).normalize(), 0, new THREE.Vector3());
  out.crossVectors(p1.sub(p0), q1.sub(q0)).normalize();
  if (out.dot(d) < 0) out.negate();
  return out;
}

function skull(R: number, C: THREE.Vector3) {
  const g = new THREE.SphereGeometry(1, 28, 22);
  const pa = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) { _d.fromBufferAttribute(pa, i).normalize(); headPt(_d, 0, _a, R, C); pa.setXYZ(i, _a.x, _a.y, _a.z); }
  g.computeVertexNormals();
  return g;
}

/**
 * A face decal: a 2D shape (points around a centre, in metres on the face) laid exactly on the skin,
 * lifted a hair. `shape(u)` gives the boundary point for u in 0..1. Built as rings so it bends with the face.
 */
export function decal(cx: number, cy: number, shape: (u: number) => [number, number], lift: number, rot = 0, rings = 3, segs = 20, origin?: THREE.Vector3) {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const put = (ox: number, oy: number) => {
    const x = cx + ox * cr - oy * sr, y = cy + ox * sr + oy * cr;
    const dd = faceDir(x, y, new THREE.Vector3());
    const pt = headPt(dd, lift, new THREE.Vector3()), n = headNormal(dd, new THREE.Vector3());
    if (origin) pt.sub(origin);
    pos.push(pt.x, pt.y, pt.z); nor.push(n.x, n.y, n.z);
  };
  put(0, 0);
  for (let r = 1; r <= rings; r++) for (let j = 0; j < segs; j++) { const [bx, by] = shape(j / segs); put(bx * r / rings, by * r / rings); }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + j, 1 + (j + 1) % segs);
  for (let r = 1; r < rings; r++) for (let j = 0; j < segs; j++) {
    const a = 1 + (r - 1) * segs + j, b = 1 + (r - 1) * segs + (j + 1) % segs, c = a + segs, d = b + segs;
    idx.push(a, c, b, b, c, d);
  }
  return mkGeo(pos, nor, idx);
}
/** A band on the face along a path (brows, lash lines, smiles): `path(u)` and its width `w(u)`. */
export function band(path: (u: number) => [number, number], w: (u: number) => number, lift: number, segs = 14, origin?: THREE.Vector3) {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, [x, y] = path(u), [x2, y2] = path(Math.min(1, u + 0.01)), [x1, y1] = path(Math.max(0, u - 0.01));
    let tx = x2 - x1, ty = y2 - y1; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    for (const side of [-1, 1]) {
      const hw = w(u) * 0.5 * side;
      const dd = faceDir(x - ty * hw, y + tx * hw, new THREE.Vector3());
      const pt = headPt(dd, lift, new THREE.Vector3()), n = headNormal(dd, new THREE.Vector3());
      if (origin) pt.sub(origin);
      pos.push(pt.x, pt.y, pt.z); nor.push(n.x, n.y, n.z);
    }
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  return mkGeo(pos, nor, idx);
}
function mkGeo(pos: number[], nor: number[], idx: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  // wind the triangles to face out along the normals
  const ia = g.index!.array as Uint16Array | Uint32Array, P = g.attributes.position;
  for (let i = 0; i < ia.length; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(P, ia[i]), b = new THREE.Vector3().fromBufferAttribute(P, ia[i + 1]), c = new THREE.Vector3().fromBufferAttribute(P, ia[i + 2]);
    const n = new THREE.Vector3().crossVectors(b.sub(a), c.sub(a));
    if (n.dot(new THREE.Vector3().fromBufferAttribute(g.attributes.normal, ia[i])) < 0) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; }
  }
  return g;
}
export const ellipse = (rx: number, ry: number, ox = 0, oy = 0) => (u: number): [number, number] => [ox + Math.cos(u * Math.PI * 2) * rx, oy + Math.sin(u * Math.PI * 2) * ry];

export interface FaceSpec {
  skin: string;
  eye?: string;          // iris colour
  eyeW?: number; eyeH?: number;
  eyeX?: number;         // distance of the eyes from the middle, as a fraction of the head radius
  lash?: number;         // upper lash line thickness (1 = normal)
  lashC?: string;
  lids?: number;         // a calm, lower upper lid (0..1)
  brow: string; browW?: number; browT?: number; browArch?: number; browTilt?: number; browY?: number;
  /** One brow cocked high (Zephy). */
  cocky?: boolean;
  blush?: string; freckles?: boolean; wrinkles?: boolean;
  nose?: 'dot' | 'small' | 'long' | 'round';
  mouth?: 'smile' | 'grin' | 'soft';
  lips?: string;
  glasses?: string;
}

/**
 * The face: big tall eyes (white, iris, pupil, two glints, a lash line), brows on their own joints, a tiny
 * nose, soft blush, and three mouths that the Person shows and hides (flat, smile, O). All decals, no lumps.
 */
export function windFace(p: Person, r: Rig, f: FaceSpec) {
  const k = r.k, h = p.head, R = r.d.R, C = r.C;
  const ex = R * (f.eyeX ?? 0.4), ey = C.y - R * 0.16;
  const ew = R * 0.19 * (f.eyeW ?? 1), eh = R * 0.27 * (f.eyeH ?? 1);
  const iris = f.eye ?? '#5a3a24', lashC = f.lashC ?? '#2a1a1e';
  for (const s of [-1, 1]) {
    const cx = ex * s;
    const eye = pivot(h, 0, 0, 0);
    const d0 = faceDir(cx, ey), at = headPt(d0, 0);
    eye.position.copy(at);
    const o = at;
    // the white, slightly flat at the top where the lid sits
    k.add(eye, decal(cx, ey, (u) => { const a = u * Math.PI * 2; return [Math.cos(a) * ew, Math.sin(a) * eh * (Math.sin(a) > 0 ? 0.92 : 1)]; }, 0.0008, 0, 2, 22, o), '#fbf7f0', 0, 0, 0, { skin: true, ink: 0 });
    // the iris, big and tall, darker at the top; a pupil; a lighter crescent below
    k.add(eye, decal(cx + ew * 0.06 * s, ey - eh * 0.04, ellipse(ew * 0.78, eh * 0.84), 0.0016, 0, 2, 22, o), iris, 0, 0, 0, { skin: true, ink: 0 });
    k.add(eye, decal(cx + ew * 0.06 * s, ey - eh * 0.32, ellipse(ew * 0.56, eh * 0.38), 0.0022, 0, 2, 18, o), new THREE.Color(iris).lerp(new THREE.Color('#e0a860'), 0.42), 0, 0, 0, { skin: true, ink: 0 });
    k.add(eye, decal(cx + ew * 0.06 * s, ey + eh * 0.12, ellipse(ew * 0.72, eh * 0.4), 0.0024, 0, 2, 18, o), new THREE.Color(iris).multiplyScalar(0.55), 0, 0, 0, { skin: true, ink: 0 });
    k.add(eye, decal(cx + ew * 0.06 * s, ey - eh * 0.02, ellipse(ew * 0.34, eh * 0.46), 0.003, 0, 2, 16, o), '#1a1216', 0, 0, 0, { skin: true, ink: 0 });
    // two glints: a big one up and out, a small one low and in
    k.add(eye, decal(cx + ew * 0.32 * s, ey + eh * 0.34, ellipse(ew * 0.26, eh * 0.2), 0.0036, 0, 2, 12, o), '#ffffff', 0, 0, 0, { skin: true, ink: 0 });
    k.add(eye, decal(cx - ew * 0.22 * s, ey - eh * 0.38, ellipse(ew * 0.12, eh * 0.09), 0.0036, 0, 1, 10, o), '#ffffff', 0, 0, 0, { skin: true, ink: 0 });
    // the upper lash line, heavier at the outer corner with a little flick; a lid if calm
    const lt = (f.lash ?? 1) * R * 0.045, lid = f.lids ?? 0;
    const top = (u: number): [number, number] => { const a = Math.PI * (0.06 + u * 0.88); return [cx - Math.cos(a) * ew * 1.12 * s * -1, ey + Math.sin(a) * eh * (0.96 - lid * 0.25) + eh * 0.02]; };
    k.add(eye, band((u) => { const [x, y] = top(1 - u); return [x, y]; }, (u) => lt * (0.45 + 0.75 * Math.pow(u, 1.5) * (s > 0 ? 1 : 1)), 0.004, 14, o), lashC, 0, 0, 0, { skin: true, ink: 0 });
    k.add(eye, band((u) => [cx + s * (ew * 1.02 + u * ew * 0.36), ey + eh * 0.42 + u * eh * 0.16], (u) => lt * (1.1 - u * 0.9), 0.004, 4, o), lashC, 0, 0, 0, { skin: true, ink: 0 });
    if (lid > 0) k.add(eye, decal(cx, ey + eh * 0.72, ellipse(ew * 1.08, eh * 0.34 * lid), 0.0042, 0, 2, 16, o), f.skin, 0, 0, 0, { skin: true, ink: 0 });
    // a light lower lash at the outer corner
    k.add(eye, band((u) => [cx + s * (ew * 0.3 + u * ew * 0.6), ey - eh * 0.88 + u * eh * 0.3], () => lt * 0.35, 0.0026, 4, o), new THREE.Color(lashC).lerp(new THREE.Color(f.skin), 0.35), 0, 0, 0, { skin: true, ink: 0 });
    p.eyes.push(eye);
    // the brow: its own joint (the Person lifts and tilts it), a slim arch
    const by = ey + eh * 1.55 + R * (f.browY ?? 0), cocked = f.cocky && s > 0;
    const bw = ew * 1.25 * (f.browW ?? 1), bt = R * 0.05 * (f.browT ?? 1), arch = (f.browArch ?? 0.25) + (cocked ? 0.35 : 0);
    const bc = new THREE.Vector3(); headPt(faceDir(cx, by), 0, bc);
    const browBase = pivot(h, bc.x, bc.y - 0.238, bc.z); // the Person sets brow.y = 0.238 + expression
    const brow = proxy(browBase, 0, 0.238, 0);
    const tilt = (f.browTilt ?? 0) * s + (cocked ? -0.12 : 0) + (f.cocky && s < 0 ? 0.1 : 0);
    k.add(brow, band((u) => { const x = (u - 0.5) * 2; return [cx + x * bw * -s * -1 + (cocked ? R * 0.01 * s : 0), by + (1 - x * x) * bw * arch + x * tilt * bw * 0.5 * s + (cocked ? R * 0.1 : 0)]; }, (u) => bt * (0.55 + 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.2))), 0.0035, 12, bc), f.brow, 0, 0, 0, { skin: true, ink: 0 });
    p.brows.push(brow);
    // blush: soft, flat, low on the cheek
    if (f.blush) k.add(h, decal(cx * 1.15, ey - eh * 1.15, ellipse(ew * 0.95, eh * 0.38), 0.0006, 0, 2, 16), f.blush, 0, 0, 0, { skin: true, ink: 0 });
    if (f.freckles) for (let i = 0; i < 4; i++) k.add(h, decal(cx * (0.82 + (i % 2) * 0.32) + s * i * R * 0.02, ey - eh * (1.05 + (i % 3) * 0.12), ellipse(R * 0.014, R * 0.014), 0.0012, 0, 1, 6), '#c07a5a', 0, 0, 0, { skin: true, ink: 0 });
    if (f.wrinkles) {
      k.add(h, band((u) => [cx + s * (ew * 1.25 + u * R * 0.06), ey - eh * 0.1 + u * eh * 0.3], () => R * 0.012, 0.001, 4), new THREE.Color(f.skin).multiplyScalar(0.8), 0, 0, 0, { skin: true, ink: 0 });
      k.add(h, band((u) => [s * (R * 0.1 + u * R * 0.06), C.y - R * 0.5 - u * R * 0.16], () => R * 0.012, 0.001, 4), new THREE.Color(f.skin).multiplyScalar(0.84), 0, 0, 0, { skin: true, ink: 0 });
    }
  }
  // the nose: a tiny wedge of shade and a highlight
  const ny = C.y - R * 0.5;
  const nose = f.nose ?? 'dot';
  const nc = new THREE.Color(f.skin).multiplyScalar(0.8);
  if (nose === 'dot') k.add(h, decal(R * 0.015, ny, ellipse(R * 0.03, R * 0.018), 0.001, 0.3, 1, 10), nc, 0, 0, 0, { skin: true, ink: 0 });
  else {
    const L = nose === 'long' ? 1.4 : nose === 'round' ? 1.1 : 0.9;
    const pt = headPt(faceDir(0, ny + R * 0.04 * L), 0);
    k.add(h, sph(R * 0.07 * (nose === 'round' ? 1.25 : 0.8), 10, 8), f.skin, pt.x, pt.y - R * 0.02, pt.z - R * 0.035, { s: [1, L, 1.1], r: [-0.25, 0, 0], skin: true, ink: 0 });
    k.add(h, decal(R * 0.03, ny - R * 0.04, ellipse(R * 0.035, R * 0.016), 0.001, 0.2, 1, 10), nc, 0, 0, 0, { skin: true, ink: 0 });
  }
  // mouths: a soft closed line, the open smile (or Zephy's grin), and an O; each on its own joint
  const my = C.y - R * 0.72, mc = new THREE.Vector3(); headPt(faceDir(0, my), 0, mc);
  const lips = f.lips ?? '#7a3a3a';
  const mouthAt = () => proxy(h, mc.x, mc.y, mc.z);
  p.mouthFlat = mouthAt();
  k.add(p.mouthFlat, band((u) => [(u - 0.5) * R * 0.26, my + Math.pow((u - 0.5) * 2, 2) * R * 0.035], (u) => R * 0.022 * (0.6 + 0.4 * Math.sin(Math.PI * u)), 0.0012, 8, mc), lips, 0, 0, 0, { skin: true, ink: 0 });
  p.mouthSmile = mouthAt();
  if (f.mouth === 'grin') {
    // a wide lopsided open grin: dark mouth, a row of teeth along the top, one corner higher
    const W2 = R * 0.24, H2 = R * 0.16;
    const D = (u: number): [number, number] => { const a = u * Math.PI * 2; const x = Math.cos(a) * W2; const y = Math.sin(a) > 0 ? Math.sin(a) * H2 * 0.18 + x * 0.25 : Math.sin(a) * H2; return [x, y + x * 0.12]; };
    k.add(p.mouthSmile, decal(0, my, D, 0.0012, 0, 3, 24, mc), '#5a2228', 0, 0, 0, { skin: true, ink: 0 });
    k.add(p.mouthSmile, decal(0, my - H2 * 0.05, (u) => { const a = u * Math.PI * 2; const x = Math.cos(a) * W2 * 0.8; return [x, Math.sin(a) > 0 ? H2 * 0.12 + x * 0.37 : x * 0.37 - H2 * 0.22]; }, 0.0018, 0, 2, 20, mc), '#fbf6ee', 0, 0, 0, { skin: true, ink: 0 });
    k.add(p.mouthSmile, decal(-W2 * 0.1, my - H2 * 0.62, ellipse(W2 * 0.4, H2 * 0.24), 0.0018, 0, 2, 14, mc), '#d8707a', 0, 0, 0, { skin: true, ink: 0 });
  } else {
    // an open, happy smile: a soft D, a little tongue
    const W2 = R * (f.mouth === 'soft' ? 0.13 : 0.16), H2 = R * (f.mouth === 'soft' ? 0.06 : 0.11);
    const D = (u: number): [number, number] => { const a = u * Math.PI * 2; const x = Math.cos(a) * W2; return [x, Math.sin(a) > 0 ? Math.sin(a) * H2 * 0.12 + Math.pow(x / W2, 2) * H2 * 0.3 : Math.sin(a) * H2]; };
    k.add(p.mouthSmile, decal(0, my, D, 0.0012, 0, 3, 22, mc), '#6a2830', 0, 0, 0, { skin: true, ink: 0 });
    k.add(p.mouthSmile, decal(0, my - H2 * 0.62, ellipse(W2 * 0.5, H2 * 0.3), 0.0018, 0, 2, 14, mc), '#e07a82', 0, 0, 0, { skin: true, ink: 0 });
  }
  p.mouthO = mouthAt();
  k.add(p.mouthO, decal(0, my - R * 0.02, ellipse(R * 0.07, R * 0.09), 0.0012, 0, 2, 16, mc), '#5a2228', 0, 0, 0, { skin: true, ink: 0 });
  if (f.glasses) {
    // round spectacles: wire rims standing just off the face, a bridge, arms back to the ears
    for (const s of [-1, 1]) {
      const pt = headPt(faceDir(ex * s, ey), R * 0.09);
      k.add(h, tor(ew * 1.45, R * 0.014, Math.PI * 2, 4, 20), f.glasses, pt.x, pt.y, pt.z, { r: [0, 0.32 * s, 0], ink: 0.4 });
      k.add(h, box(R * 0.012, R * 0.012, R * 0.75), f.glasses, s * R * 0.84, pt.y + R * 0.02, C.z + R * 0.3, { r: [0, -0.1 * s, 0], ink: 0 });
    }
    const pb = headPt(faceDir(0, ey + R * 0.05), R * 0.08);
    k.add(h, box(ex * 0.75, R * 0.012, R * 0.012), f.glasses, pb.x, pb.y, pb.z, { ink: 0 });
  }
}

// ---------------------------------------------------------------- hair

export interface HairCap { front?: number; side?: number; back?: number; lift?: number; sheen?: string; part?: number }
/**
 * A cap of hair that follows the skull: everything above the hairline (high on the forehead, down past the
 * temples, low at the nape) sits a few millimetres off the skin; the rest tucks inside the head.
 * A lighter sheen band runs round the crown, like the painted hair of the pictures.
 */
export function hairCap(k: RigKit, head: THREE.Object3D, color: string, o: HairCap = {}) {
  const g = new THREE.SphereGeometry(1, 30, 22);
  const pa = g.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pa.count * 3);
  const lift = o.lift ?? headR * 0.07, front = o.front ?? 0.3, side = o.side ?? -0.25, back = o.back ?? -0.72;
  const sheen = new THREE.Color(o.sheen ?? '#ffffff'), base = new THREE.Color(1, 1, 1), cc = new THREE.Color();
  for (let i = 0; i < pa.count; i++) {
    _d.fromBufferAttribute(pa, i).normalize();
    const fr = smooth(0.15, 0.85, _d.z), bk = smooth(0.0, 0.7, -_d.z);
    const line = _d.z > 0 ? side + (front - side) * fr + 0.05 * Math.sin(Math.atan2(_d.x, _d.z) * 9) : side + (back - side) * bk;
    const inside = _d.y < line;
    headPt(_d, inside ? -headR * 0.12 : lift + headR * 0.03 * Math.max(0, _d.y), _a);
    pa.setXYZ(i, _a.x, _a.y, _a.z);
    const sb = smooth(0.12, 0.0, Math.abs(_d.y - 0.62)) * (0.4 + 0.6 * smooth(-0.3, 0.6, _d.z));
    cc.copy(base).lerp(sheen, sb * 0.35).multiplyScalar(1 - 0.12 * smooth(0.2, -0.6, _d.y));
    cc.toArray(cols, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  k.add(head, g, color, 0, 0, 0, { ink: 0.9 });
}

/** Direction helper: from spherical angles on the head (yaw around, pitch up), unit vector. */
export const dirAt = (yaw: number, pitch: number) => new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

/**
 * A lock of hair laid over the skull: from (yaw0, pitch0) to (yaw1, pitch1), lifted off the cap,
 * with the tip curling `curl` metres away from the head. Width and thickness in metres.
 */
export function lock(from: [number, number], to: [number, number], width: number, o: { lift?: number; curl?: number; thick?: number; steps?: number; out?: V3; tip?: number; shade?: [number, number] } = {}) {
  const N = o.steps ?? 5, lift = o.lift ?? headR * 0.1;
  const pts: V3[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const d = dirAt(from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u);
    const pt = headPt(d, lift + (o.curl ?? 0) * u * u, new THREE.Vector3());
    if (o.out) pt.add(new THREE.Vector3(...o.out).multiplyScalar(u * u));
    pts.push([pt.x, pt.y, pt.z]);
  }
  const C = headC.clone();
  return strand(pts, width, o.thick ?? width * 0.45, { segs: 10, sides: 6, tip: o.tip ?? 0.05, up: (pt) => _b.copy(pt).sub(C).normalize(), shade: o.shade ?? [1.04, 0.9] });
}

/** A free lock in head space (braids' tufts, flyaways): a curve of points, broad face looking `face`. */
export function freeLock(pts: V3[], width: number, thick: number, tip = 0.05, face: V3 = [0, 0, 1]) {
  const f = new THREE.Vector3(...face).normalize();
  return strand(pts, width, thick, { segs: 10, sides: 6, tip, up: () => f, shade: [1.02, 0.92] });
}

/** Where the head is, for code that adds hair after the face (radius and centre of the skull). */
export const headInfo = () => ({ R: headR, C: headC.clone() });

// ---------------------------------------------------------------- the scarf round the neck

/**
 * A scarf wrapped round the neck: two or three overlapping lumpy loops, a knot at the front, and a short
 * end hanging from the knot on a spring. Returns the anchors (inside the wrap) for the long simulated tails.
 */
export function scarfWrap(p: Person, r: Rig, sway: Sway, color: string, o: { loops?: number; bulk?: number; side?: number; endC?: string; seed?: number } = {}) {
  const k = r.k, T = p.torso, top = r.d.torsoL, nr = r.d.neckR, bulk = o.bulk ?? 1, s = o.side ?? 1, seed = o.seed ?? 0;
  const R0 = nr + 0.03 * bulk;
  const loops = o.loops ?? 3;
  // the cloth gathered close round the neck inside the loops, so no gap shows between neck and wrap
  k.add(T, cloth([[nr + 0.006, top + 0.035], [nr + 0.012, top], [nr + 0.03 * bulk, top - 0.05], [nr + 0.045 * bulk, top - 0.08]], { n: 16, folds: 7, amt: 0.12, hem: 0, hemLine: false, seed }), color, 0, 0, 0.004, { ink: 0.3 });
  k.add(T, wrapLoop(R0 + 0.02 * bulk, 0.032 * bulk, { seed, lumps: 3, creases: 10, sx: 1.18 }), color, 0, top - 0.035, 0.01, { r: [0.22, 0, 0.05 * s] });
  k.add(T, wrapLoop(R0, 0.028 * bulk, { seed: seed + 2, lumps: 4, creases: 9 }), color, 0, top + 0.012, 0.004, { r: [-0.14, 0.4, -0.06 * s] });
  if (loops > 2) k.add(T, wrapLoop(R0 + 0.045 * bulk, 0.03 * bulk, { seed: seed + 5, lumps: 3, creases: 8, sx: 1.3, flat: 0.55 }), color, 0, top - 0.07, 0.02, { r: [0.42, 0, 0.1 * s] });
  // the knot, a little to one side, and a short end hanging from it
  const kx = 0.045 * s * bulk, kz = R0 + 0.04 * bulk, ky = top - 0.065;
  k.add(T, lump(0.03 * bulk, 0.2, seed + 1), color, kx, ky, kz, { s: [1.2, 0.95, 0.8] });
  const end = pivot(T, kx + 0.01 * s, ky - 0.01, kz + 0.005); end.rotation.set(-0.08, 0, 0.12 * s);
  k.add(end, strand([[0, 0, 0], [0.005 * s, -0.06, 0.012], [0.0, -0.13, 0.008], [-0.01 * s, -0.19 * bulk, 0.012]], 0.06 * bulk, 0.012, { segs: 10, sides: 8, tip: 0.75, root: 0.6, up: () => _b.set(0, 0, 1), shade: [0.95, 1.0] }), color);
  if (o.endC) k.add(end, strand([[-0.008 * s, -0.17 * bulk, 0.0135], [-0.01 * s, -0.19 * bulk, 0.0135]], 0.046 * bulk, 0.014, { segs: 2, sides: 8, tip: 1, root: 1, up: () => _b.set(0, 0, 1) }), o.endC, 0, 0, 0, { ink: 0.5 });
  sway.add(end, { freq: 1.6, damp: 0.25, gain: 0.03, wind: 0.5, bob: 0.12, limit: 0.7 });
  const a1 = pivot(T, -0.05 * s * bulk, top - 0.035, -R0 * 0.85);
  const a2 = pivot(T, -0.01 * s * bulk, top - 0.06, -R0 * 0.95);
  return [a1, a2];
}

// ---------------------------------------------------------------- hats, belts, straps, goggles

/** A woven straw hat: a drooping, slightly uneven brim with woven rings, a rounded crown, a band, ribbon ends. */
export function strawHat(k: RigKit, head: THREE.Object3D, sway: Sway, o: { R: number; brim?: number; crown?: number; band: string; straw?: string; tilt?: V3; ribbon?: boolean; seed?: number; y?: number }) {
  const C = headC, R = o.R, straw = o.straw ?? '#e9c877', dark = new THREE.Color(straw).multiplyScalar(0.8);
  const g = pivot(head, 0, C.y + R * (o.y ?? 0.42), C.z - R * 0.05); g.rotation.set(...(o.tilt ?? [-0.12, 0, 0.05]));
  const Rb = R * (o.brim ?? 2.4), cr = R * 0.95, ch = R * (o.crown ?? 0.55), seed = o.seed ?? 0;
  // the brim: woven rings as seams, a gentle droop, the edge a little wavy
  const brim = cloth([[cr * 0.98, 0.006], [cr * 1.08, 0.0], [Rb * 0.55, -0.012], [Rb * 0.82, -0.03], [Rb, -0.05]], { n: 30, folds: 5, amt: 0.04, yTop: 0, seed, hem: 0.012, lines: [-0.006, -0.018, -0.032], shade: 0.15 });
  k.add(g, brim, straw, 0, 0, 0, { lining: 0.78, ink: 0.8 });
  // the crown, with woven rings, and the band
  k.add(g, cloth([[0, ch + 0.01], [cr * 0.6, ch], [cr * 0.88, ch * 0.8], [cr * 0.94, ch * 0.3], [cr, 0.0]], { n: 22, folds: 4, amt: 0.02, hem: 0, hemLine: false, lines: [ch * 0.62, ch * 0.42], shade: 0.08 }), straw, 0, 0, 0, { ink: 0.8 });
  k.add(g, cloth([[cr * 1.02, ch * 0.34], [cr * 1.03, 0.0]], { n: 22, folds: 0, amt: 0, hem: 0, hemLine: false }), o.band, 0, 0.002, 0, { ink: 0.6 });
  void dark;
  if (o.ribbon !== false) for (const [x, rz, L] of [[-0.25, 0.3, 0.13], [-0.18, 0.05, 0.1]] as [number, number, number][]) {
    const rb = pivot(g, Math.sin(-2.6 + x) * cr * 1.03, ch * 0.18, Math.cos(-2.6 + x) * cr * 1.03); rb.rotation.set(0.5, 0, rz);
    k.add(rb, strand([[0, 0, 0], [0.004, -L * 0.5, -0.006], [0, -L, 0]], 0.03, 0.006, { segs: 6, tip: 0.8, root: 1, up: () => _b.set(0, 0, -1) }), o.band, 0, 0, 0, { ink: 0.6 });
    sway.add(rb, { freq: 2.2, damp: 0.25, gain: 0.04, wind: 0.9, bob: 0.1, limit: 1.1 });
  }
  return g;
}

/** A leather belt with a buckle, round the torso at height y (radius rx, depth rz). */
export function belt(k: RigKit, T: THREE.Object3D, y: number, rx: number, rz: number, c = '#6e4528', buckle = '#d2a650', w = 0.035) {
  k.add(T, cloth([[rx * 1.0, y + w / 2], [rx * 1.02, y - w / 2]], { n: 22, folds: 0, amt: 0, hem: 0, hemLine: false, sz: rz / rx }), c, 0, 0, 0, { lining: 0.6 });
  k.add(T, box(w * 1.2, w * 1.05, 0.008), buckle, 0, y, rz + 0.008, { ink: 0.5 });
  k.add(T, box(w * 0.7, w * 0.6, 0.01), c, 0, y, rz + 0.01, { ink: 0 });
}

/** A flat strap across the body, from one shoulder to the other hip (front and back). */
export function crossStrap(k: RigKit, T: THREE.Object3D, from: V3, to: V3, rx: number, rz: number, c: string, w = 0.03) {
  // a ring tilted across the torso, squashed to its depth
  const mid = new THREE.Vector3(...from).add(new THREE.Vector3(...to)).multiplyScalar(0.5);
  const len = new THREE.Vector3(...from).sub(new THREE.Vector3(...to)).length();
  const ang = Math.atan2(to[0] - from[0], from[1] - to[1]);
  const g = new THREE.TorusGeometry(1, w / 2, 3, 28); g.scale(rx, len * 0.5, 1);
  k.add(T, g, c, mid.x, mid.y, 0, { r: [0, Math.PI / 2, 0], s: [rz, 1, 1], ink: 0.7 });
  void ang;
}

/** Flying goggles: two brass cups with glassy lenses on a strap. Faces +z. */
export function goggles(k: RigKit, parent: THREE.Object3D, x: number, y: number, z: number, o: { r?: V3; size?: number; strap?: string; brass?: string } = {}) {
  const g = pivot(parent, x, y, z); g.rotation.set(...(o.r ?? [0, 0, 0]));
  const S = o.size ?? 1, brass = o.brass ?? '#c8973e', lens = '#a8d4e0';
  for (const s of [-1, 1]) {
    k.add(g, cyl(0.026 * S, 0.023 * S, 0.02 * S, 14), brass, 0.03 * S * s, 0, 0.008 * S, { r: [Math.PI / 2, 0, 0] });
    k.add(g, tor(0.024 * S, 0.005 * S, Math.PI * 2, 5, 16), new THREE.Color(brass).multiplyScalar(1.1), 0.03 * S * s, 0, 0.018 * S, { ink: 0.5 });
    k.add(g, sph(0.021 * S, 12, 8), lens, 0.03 * S * s, 0, 0.016 * S, { s: [1, 1, 0.4], ink: 0 });
    k.add(g, sph(0.006 * S, 6, 4), '#ffffff', 0.03 * S * s + 0.008 * S, 0.008 * S, 0.0245 * S, { ink: 0, s: [1, 1, 0.4] });
  }
  k.add(g, box(0.014 * S, 0.008 * S, 0.012 * S), brass, 0, 0, 0.012 * S, { ink: 0 });
  return g;
}

/** Fold shading for small bits that are not lathes: darken a geometry towards one side. */
export function tint(g: THREE.BufferGeometry, f: (p: THREE.Vector3) => number) {
  const pa = g.attributes.position as THREE.BufferAttribute, cols = new Float32Array(pa.count * 3);
  for (let i = 0; i < pa.count; i++) { const v = f(_a.fromBufferAttribute(pa, i)); cols[i * 3] = v; cols[i * 3 + 1] = v; cols[i * 3 + 2] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

export { lathe, cloth, strand, lump, wob, smooth };
