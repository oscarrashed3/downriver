// Riders for the kite-wings: the prone glide pose (lying flat on the wing, hands on the bar, legs trailing,
// head up to see where they are going), the flare and run of a landing, and stand-in racers for the
// Sky Isles kite race (Zephy, Lark and Gran Wren), built like the villagers of World 1: small parts of one
// colour on one joint merged into one mesh, an inked edge, a face that reads from a chase camera.
//
// glidePose() works on any body with the Person joint layout (Nilo's Person, or a StandInRider), as a
// layer on top of whatever posed it before: k = 0 leaves the body alone, k = 1 is fully prone.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutlines, paint, softRamp } from '../../render/paint';

/** Toon with a stronger rim, so riders separate from the cloth behind them. */
const rimMats = new Map<string, THREE.MeshToonMaterial>();
export function riderToon(color: string) {
  let m = rimMats.get(color);
  if (!m) { m = paint(new THREE.MeshToonMaterial({ color, gradientMap: softRamp() }), { rim: 2.6, variation: 0.6 }); rimMats.set(color, m); }
  return m;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/** The joints glidePose needs. Person (src/player/person.ts) has all of these. */
export interface RiderRig {
  root: THREE.Object3D;
  body: THREE.Object3D;
  hips: THREE.Object3D;
  torso: THREE.Object3D;
  neck: THREE.Object3D;
  head: THREE.Object3D;
  hipY: number;
  H: number;
  arms: { sh: THREE.Object3D; el: THREE.Object3D; hand?: THREE.Object3D }[];
  legs: { thigh: THREE.Object3D; knee: THREE.Object3D }[];
  chest?: THREE.Object3D | null;
  ankles?: THREE.Object3D[];
  wrists?: THREE.Object3D[];
  coatPanels?: { pivot: THREE.Object3D }[];
  hoodTip?: THREE.Object3D | null;
  /** A long coat's skirt (Nilo): pulled in close while lying on the wing, so it does not swallow the body. */
  coat?: THREE.Object3D | null;
  scarfTail?: THREE.Object3D[];
}

export interface GlidePoseInput {
  /** 0 = leave the pose as it is (standing, running), 1 = lying flat on the wing. */
  k: number;
  /** Bank of the wing in radians (+ = right wing down): the rider shifts weight to the low side. */
  bank?: number;
  /** 0..1 steep dive: bar pulled in, legs together, head tucked. */
  dive?: number;
  /** 0..1 how hard the wind is blowing past (speed): cloth flaps harder. */
  wind?: number;
  /** Seconds, for the flapping. */
  t: number;
}

/**
 * Lay a body flat on a kite-wing, rotated about its hips (the hips stay where they are), facing +Z.
 * Call after the body's own animation each frame.
 */
export function glidePose(r: RiderRig, g: GlidePoseInput) {
  const k = clamp(g.k);
  // the hood's point is blown flatter while flying
  if (r.hoodTip) r.hoodTip.scale.set(1, 1 - 0.3 * k, 1 - 0.15 * k);
  if (r.coat) r.coat.scale.set(1 - 0.16 * k, 1 - 0.3 * k, 1 - 0.42 * k);
  if (k <= 0.001) return;
  const bank = g.bank ?? 0, dive = clamp(g.dive ?? 0), wind = clamp(g.wind ?? 0.6), t = g.t;
  const flap = (f: number, ph: number) => Math.sin(t * f * (0.6 + wind) + ph);

  // the whole body tips forward onto the wing about the hips, rolls a little with the weight shift
  const a = (Math.PI / 2 - 0.04 + dive * 0.06) * k;
  r.body.rotation.set(a, lerp(r.body.rotation.y, -bank * 0.35, k), lerp(r.body.rotation.z, 0, k));
  const hy = r.hipY * r.H;
  r.body.position.set(lerp(r.body.position.x, 0, k), hy - hy * Math.cos(a), -hy * Math.sin(a));
  r.hips.position.y = lerp(r.hips.position.y, r.hipY, k);
  // back arched so the chest and head come up off the wing
  r.torso.rotation.x = lerp(r.torso.rotation.x, -0.22 - dive * 0.1, k);
  r.torso.rotation.y = lerp(r.torso.rotation.y, 0, k);
  r.torso.rotation.z = lerp(r.torso.rotation.z, 0, k);
  if (r.chest) r.chest.rotation.x = lerp(r.chest.rotation.x, -0.12, k);
  // head up, looking ahead and into the turn
  r.head.rotation.x = lerp(r.head.rotation.x, -0.95 + dive * 0.35 + Math.sin(t * 1.3) * 0.04, k);
  r.head.rotation.y = lerp(r.head.rotation.y, bank * 0.45, k);
  r.head.rotation.z = lerp(r.head.rotation.z, 0, k);
  // hands on the bar out in front; pulled in towards the chest in a dive
  for (let i = 0; i < 2; i++) {
    const A = r.arms[i], s = i === 0 ? -1 : 1;
    const pull = dive * 0.9 + Math.max(0, s * bank) * 0.4;
    A.sh.rotation.x = lerp(A.sh.rotation.x, -2.45 + pull * 0.45, k);
    A.sh.rotation.y = lerp(A.sh.rotation.y, 0, k);
    A.sh.rotation.z = lerp(A.sh.rotation.z, s * (0.32 - pull * 0.08), k);
    A.el.rotation.x = lerp(A.el.rotation.x, -0.35 - pull * 0.9, k);
    if (r.wrists?.[i]) r.wrists[i].rotation.x = lerp(r.wrists[i].rotation.x, 0.5, k);
  }
  // legs trailing behind, a lazy kick; pressed together in a dive
  for (let i = 0; i < 2; i++) {
    const L = r.legs[i], s = i === 0 ? -1 : 1;
    const kick = flap(2.1, i * Math.PI) * 0.12 * (1 - dive * 0.7);
    L.thigh.rotation.x = lerp(L.thigh.rotation.x, 0.06 + kick * 0.5, k);
    L.thigh.rotation.y = lerp(L.thigh.rotation.y, 0, k);
    L.thigh.rotation.z = lerp(L.thigh.rotation.z, s * (0.1 - dive * 0.07) - bank * 0.08, k);
    L.knee.rotation.x = lerp(L.knee.rotation.x, 0.32 + kick - dive * 0.15, k);
    if (r.ankles?.[i]) r.ankles[i].rotation.x = lerp(r.ankles[i].rotation.x, 0.75, k);
  }
  // cloth on the body streams back along the legs and flaps
  const fl = 0.35 + wind * 0.65 + dive * 0.5;
  r.coatPanels?.forEach((c, i) => {
    const e = new THREE.Euler(0.1 * k + flap(9, i * 1.7) * 0.12 * fl * k, 0, flap(7, i) * 0.05 * k);
    c.pivot.quaternion.slerp(_cq.setFromEuler(e), k);
  });
  // the hood's point is blown flat down the back instead of standing up like a cone
  if (r.hoodTip) r.hoodTip.rotation.set(lerp(r.hoodTip.rotation.x, -1.9 + flap(11, 0.4) * 0.12 * fl, k), 0, flap(8, 1) * 0.1 * k);
  r.scarfTail?.forEach((seg, i) => {
    seg.rotation.x = lerp(seg.rotation.x, (i === 0 ? -0.2 : 0) + flap(10, i * 0.9) * (0.25 + i * 0.12) * fl, k);
    seg.rotation.z = lerp(seg.rotation.z, flap(7, i * 1.3) * 0.2 * fl, k);
  });
}

const _cq = new THREE.Quaternion();
const _t = new THREE.Vector3(), _h = new THREE.Vector3(), _ax = new THREE.Vector3(), _wq = new THREE.Quaternion();

/**
 * Two-bone reach: turn the shoulder and bend the elbow so the hand lands on `target` (world space),
 * blended in by k. The elbow bends the natural way (forearm forward), so it points back and out.
 */
export function reachArm(r: RiderRig, i: number, target: THREE.Vector3, k: number) {
  const A = r.arms[i];
  if (!A.hand || k <= 0.001) return;
  const par = A.sh.parent!;
  par.updateWorldMatrix(true, false);
  // lengths in the shoulder's parent space
  const L1 = A.el.position.length();
  A.el.updateWorldMatrix(true, true);
  const ws = par.getWorldScale(_h).x;
  const L2 = A.el.getWorldPosition(_ax).distanceTo(A.hand.getWorldPosition(_h)) / ws;
  // target relative to the shoulder, in the parent's space
  _t.copy(target); par.worldToLocal(_t).sub(A.sh.position);
  const D = Math.min(Math.max(_t.length(), Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
  const d = _t.normalize();
  const alpha = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
  const beta = Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
  // the upper arm turns away from the straight line by alpha, about the arm's own side axis
  const toEuler = (v: THREE.Vector3) => { const z = Math.asin(clamp(v.x, -1, 1)); const cz = Math.max(1e-4, Math.cos(z)); return [Math.atan2(-v.z / cz, -v.y / cz), z]; };
  const [x0, z0] = toEuler(d);
  _ax.set(Math.cos(z0), Math.sin(z0) * Math.cos(x0), Math.sin(z0) * Math.sin(x0));
  const up = d.applyQuaternion(_wq.setFromAxisAngle(_ax, alpha));
  const [x, z] = toEuler(up);
  A.sh.rotation.set(lerp(A.sh.rotation.x, x, k), lerp(A.sh.rotation.y, 0, k), lerp(A.sh.rotation.z, z, k));
  A.el.rotation.set(lerp(A.el.rotation.x, -(Math.PI - beta), k), lerp(A.el.rotation.y, 0, k), lerp(A.el.rotation.z, 0, k));
}

// ---------------------------------------------------------------- stand-in racers

type V3 = [number, number, number];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** Collects parts per joint and colour, then merges each set into one mesh (like the villagers' Kit). */
class Kit {
  private sets = new Map<THREE.Object3D, Map<string, THREE.BufferGeometry[]>>();
  add(parent: THREE.Object3D, geo: THREE.BufferGeometry, color: string, at: V3 = [0, 0, 0], o: { r?: V3; s?: number | V3; line?: boolean } = {}) {
    _e.set(...(o.r ?? [0, 0, 0])); _q.setFromEuler(_e);
    const s = o.s ?? 1; if (typeof s === 'number') _s.setScalar(s); else _s.set(...s);
    _m.compose(_p.set(...at), _q, _s);
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(_m);
    const key = color + '|' + (o.line === false ? 0 : 1);
    let set = this.sets.get(parent); if (!set) this.sets.set(parent, (set = new Map()));
    const list = set.get(key) ?? []; list.push(g); set.set(key, list);
    geo.dispose();
  }
  bake() {
    for (const [parent, set] of this.sets) for (const [key, list] of set) {
      const [color, line] = key.split('|');
      const m = new THREE.Mesh(mergeGeometries(list, false)!, riderToon(color));
      m.castShadow = true;
      if (line === '0') m.userData.noOutline = true;
      parent.add(m);
      list.forEach(g => g.dispose());
    }
    this.sets.clear();
  }
}

const sph = (r: number, w = 12, h = 9) => new THREE.SphereGeometry(r, w, h);
const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 4, 10);
const cyl = (a: number, b: number, h: number, n = 10) => new THREE.CylinderGeometry(a, b, h, n);
const tor = (r: number, t: number, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 6, 14, arc);

const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
/** A lathed shape from (radius, y) pairs. */
const lathe = (pts: [number, number][], n = 12) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n);
/** Half a disc (the open mouth): the lower half of a circle, facing +Z. */
const halfDisc = (r: number) => new THREE.CircleGeometry(r, 14, Math.PI, Math.PI);

export type RacerKind = 'zephy' | 'lark' | 'wren';

/** How a stand-in racer looks. */
export interface RacerLook {
  skin: string; hair: string; shirt: string; vest?: string; trousers: string; boots: string; scarf: string;
  hat?: string; braids?: number; bun?: boolean;
  /** Overall scale (1.2 makes a child about 1.5 m tall with the hair). */
  height: number; old?: boolean; harness: string; satchel: string; glove: string;
}
export const RACERS: Record<RacerKind, RacerLook> = {
  // Zephy: the fast boy from Sailtown, messy hair, red scarf, a leather flying harness over a cream shirt
  zephy: { skin: '#c99068', hair: '#4a2c1c', shirt: '#f1ead8', vest: '#9a6a3e', trousers: '#5d4a3c', boots: '#5a3824', scarf: '#d8402f', height: 1.2, harness: '#6a4428', satchel: '#a87440', glove: '#6a4630' },
  // Lark: two long braids, a yellow scarf, a cream smock and a green waistcoat
  lark: { skin: '#eac0a0', hair: '#6a3e26', shirt: '#efe2c4', vest: '#7fa04e', trousers: '#6a5a48', boots: '#6a4430', scarf: '#f2c43a', height: 1.1, braids: 2, harness: '#7a5030', satchel: '#b88a4a', glove: '#7a5236' },
  // Gran Wren: the oldest racer, white bun, straw hat, a blue coat
  wren: { skin: '#e4b896', hair: '#f2eee4', shirt: '#3e64a8', vest: '#2f4f8c', trousers: '#3a3a4a', boots: '#4a3428', scarf: '#5aa0e6', hat: '#e8d090', bun: true, height: 1.14, old: true, harness: '#5a4030', satchel: '#8a6038', glove: '#5a3e2c' },
};

/**
 * A small racer with the Person joint layout, so glidePose works on it. Feet at the root when standing.
 * Tapered legs and boots with a sole, mitten gloves with a thumb, a face with eye shapes, brows and a big
 * open smile, a hair silhouette of its own (Zephy's mop, Lark's braids, Gran Wren's bun and straw hat),
 * a flying harness with straps and a satchel on the back (what you see from a chase camera).
 * update() gives it a simple stand, run and blink; then glidePose lays it on the wing.
 */
export class StandInRider implements RiderRig {
  root = new THREE.Group();
  body = new THREE.Group();
  hips = new THREE.Group();
  torso = new THREE.Group();
  neck = new THREE.Group();
  head = new THREE.Group();
  hipY = 0.62;
  H = 1;
  arms: { sh: THREE.Group; el: THREE.Group; hand: THREE.Group }[] = [];
  legs: { thigh: THREE.Group; knee: THREE.Group }[] = [];
  ankles: THREE.Group[] = [];
  wrists: THREE.Group[] = [];
  scarfTail: THREE.Group[] = [];
  /** A point in each palm (left, right), for things held: a kite string, the bar. */
  hands: THREE.Group[] = [];
  /** Braids (or the hat brim) that stream in the wind. */
  hairTails: THREE.Group[] = [];
  /** Where the long scarf ends leave the neck (child of the torso). */
  scarfRoot = new THREE.Group();
  /** Between the shoulder blades, for a cape (child of the torso). */
  backRoot = new THREE.Group();
  private eyes: THREE.Object3D[] = [];
  private phase = 0;
  private blink = 2;

  constructor(public kind: RacerKind, public look: RacerLook = RACERS[kind]) {
    const L = look, k = new Kit();
    this.H = L.height / 1.2;
    this.root.add(this.body);
    this.body.scale.setScalar(this.H);
    this.body.add(this.hips); this.hips.position.y = this.hipY;
    this.hips.add(this.torso);
    // legs: tapered thigh and shin, a boot with a flared cuff, a foot with a sole and a toe cap
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group(); thigh.position.set(0.085 * s, -0.02, 0);
      k.add(thigh, sph(0.08, 10, 8), L.trousers, [0, -0.01, 0]);
      k.add(thigh, cyl(0.08, 0.062, 0.3), L.trousers, [0, -0.15, 0]);
      const knee = new THREE.Group(); knee.position.y = -0.3;
      k.add(knee, sph(0.062, 10, 8), L.trousers, [0, 0, 0]);
      k.add(knee, cyl(0.06, 0.05, 0.16), L.trousers, [0, -0.08, 0]);
      k.add(knee, lathe([[0.0, -0.27], [0.052, -0.27], [0.054, -0.2], [0.062, -0.15], [0.07, -0.12], [0.066, -0.115], [0.0, -0.115]], 12), L.boots, [0, 0, 0]);
      const ankle = new THREE.Group(); ankle.position.y = -0.27; knee.add(ankle); this.ankles.push(ankle);
      k.add(ankle, sph(0.058, 12, 8), L.boots, [0, -0.012, 0.045], { s: [0.95, 0.68, 1.75] });
      k.add(ankle, box(0.1, 0.018, 0.2), '#3a2418', [0, -0.045, 0.045], { line: false });
      thigh.add(knee); this.hips.add(thigh); this.legs.push({ thigh, knee });
    }
    // torso: shirt, waistcoat or coat, belt, a flying harness (shoulder straps, chest strap, belt) and a satchel on the back
    k.add(this.torso, cap(0.135, 0.16), L.shirt, [0, 0.2, 0], { s: [1, 1, 0.78] });
    k.add(this.torso, sph(0.13, 12, 8), L.trousers, [0, 0.02, 0], { s: [1.08, 0.7, 0.85] });
    if (L.vest) {
      k.add(this.torso, cyl(0.145, 0.158, 0.24, 14), L.vest, [0, 0.18, -0.006], { s: [1, 1, 0.8] });
      if (L.old) k.add(this.torso, lathe([[0.158, 0.06], [0.17, -0.04], [0.2, -0.16], [0.21, -0.2]], 14), L.vest, [0, 0, 0], { s: [1, 1, 0.82] }); // coat skirt
    }
    k.add(this.torso, cyl(0.15, 0.15, 0.035, 14), L.harness, [0, 0.06, 0], { s: [1.02, 1, 0.82] }); // belt
    k.add(this.torso, box(0.04, 0.03, 0.015), '#d8b060', [0, 0.06, 0.128], { line: false }); // buckle
    for (const s of [-1, 1]) {
      k.add(this.torso, box(0.035, 0.32, 0.016), L.harness, [0.07 * s, 0.2, -0.112], { r: [0.08, 0, 0.12 * s] }); // back straps
      k.add(this.torso, box(0.035, 0.3, 0.016), L.harness, [0.065 * s, 0.21, 0.112], { r: [-0.08, 0, -0.1 * s] }); // front straps
    }
    k.add(this.torso, box(0.15, 0.03, 0.016), L.harness, [0, 0.24, 0.118]); // chest strap
    k.add(this.torso, box(0.13, 0.03, 0.016), L.harness, [0, 0.26, -0.118]);
    // satchel on the back: body, a rounded flap, a buckle
    k.add(this.torso, box(0.17, 0.13, 0.07), L.satchel, [0.02, 0.15, -0.15], { r: [0, 0, -0.08] });
    k.add(this.torso, cyl(0.045, 0.045, 0.172, 10), L.satchel, [0.02, 0.21, -0.15], { r: [0, 0, Math.PI / 2 - 0.08], s: [1, 1, 0.9] });
    k.add(this.torso, box(0.16, 0.07, 0.012), L.harness, [0.022, 0.19, -0.188], { r: [0, 0, -0.08] });
    k.add(this.torso, box(0.03, 0.03, 0.012), '#d8b060', [0.022, 0.165, -0.196], { line: false });
    // arms: sleeve, rolled cuff, a leather mitten glove with a thumb
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(0.172 * s, 0.33, 0);
      const sleeve = L.old ? L.vest! : L.shirt;
      k.add(sh, sph(0.064, 10, 8), sleeve, [0, -0.01, 0]);
      k.add(sh, cyl(0.06, 0.05, 0.22), sleeve, [0, -0.11, 0]);
      const el = new THREE.Group(); el.position.y = -0.22;
      k.add(el, sph(0.05, 10, 8), sleeve, [0, 0, 0]);
      k.add(el, cyl(0.05, 0.043, 0.15), sleeve, [0, -0.075, 0]);
      k.add(el, cyl(0.05, 0.052, 0.04, 12), L.glove, [0, -0.155, 0]); // glove cuff
      const wrist = new THREE.Group(); wrist.position.y = -0.17; el.add(wrist); this.wrists.push(wrist);
      k.add(wrist, sph(0.042, 12, 9), L.glove, [0, -0.04, 0.006], { s: [0.95, 1.15, 0.72] }); // the mitten
      k.add(wrist, cap(0.016, 0.03), L.glove, [0.035 * -s, -0.025, 0.02], { r: [0.4, 0, 0.6 * s] }); // thumb
      sh.rotation.z = 0.1 * s;
      const hand = new THREE.Group(); hand.position.set(0, -0.21, 0.01); el.add(hand); this.hands.push(hand);
      sh.add(el); this.torso.add(sh); this.arms.push({ sh, el, hand });
    }
    // scarf: a thick wrap at the neck and a knot; the long ends are ribbons the wing streams (see KiteWing)
    k.add(this.torso, tor(0.085, 0.05), L.scarf, [0, 0.385, 0.0], { r: [Math.PI / 2, 0, 0], s: [1.1, 1, 1] });
    k.add(this.torso, sph(0.06, 8, 6), L.scarf, [0.05, 0.37, -0.09], { s: [1.1, 0.85, 0.9] });
    this.scarfRoot.position.set(0.04, 0.37, -0.1);
    this.torso.add(this.scarfRoot);
    this.backRoot.position.set(0, 0.33, -0.12);
    this.torso.add(this.backRoot);
    // head
    this.neck.position.y = 0.4; this.torso.add(this.neck);
    k.add(this.neck, cyl(0.04, 0.05, 0.08, 8), L.skin, [0, 0.02, 0]);
    this.head.position.y = 0.05; this.head.scale.setScalar(1.34); this.neck.add(this.head);
    k.add(this.head, sph(0.13, 18, 14), L.skin, [0, 0.14, 0], { s: [1, 1.04, 0.98] });
    k.add(this.head, sph(0.095, 14, 10), L.skin, [0, 0.085, 0.03], { s: [1.1, 0.82, 1] });
    for (const s of [-1, 1]) {
      k.add(this.head, sph(0.026, 8, 6), L.skin, [0.128 * s, 0.13, 0], { s: [0.6, 1, 0.9] }); // ears
      k.add(this.head, new THREE.CircleGeometry(0.024, 12), '#f09a8a', [0.074 * s, 0.1, 0.101], { r: [0, 0.55 * s, 0], line: false }); // cheeks
      // eyes: tall dark ovals with a big glint and a small one, set wide like the game's children
      const eye = new THREE.Group(); eye.position.set(0.047 * s, 0.148, 0.123);
      k.add(eye, sph(0.021, 12, 9), '#2a1c22', [0, 0, 0], { s: [0.82, 1.3, 0.45], line: false });
      k.add(eye, sph(0.0075, 6, 4), '#ffffff', [0.006 * s, 0.01, 0.009], { line: false });
      k.add(eye, sph(0.004, 6, 4), '#ffffff', [-0.005 * s, -0.009, 0.009], { line: false });
      this.head.add(eye); this.eyes.push(eye);
      // brows: lifted, happy
      k.add(this.head, tor(0.026, 0.0055, Math.PI * 0.7), L.old ? '#c8c0b4' : L.hair, [0.048 * s, 0.176, 0.124], { r: [0, 0, Math.PI * 0.15], line: false });
    }
    k.add(this.head, sph(0.017, 8, 6), L.skin, [0, 0.118, 0.13], { line: false }); // nose
    // a big open smile: a dark half-moon, a pink tongue, a row of teeth
    k.add(this.head, halfDisc(0.034), '#5a2226', [0, 0.084, 0.1275], { r: [-0.25, 0, 0], s: [1.15, 0.9, 1], line: false });
    k.add(this.head, halfDisc(0.022), '#e0707a', [0, 0.073, 0.129], { r: [-0.25, 0, 0], s: [1.1, 0.6, 1], line: false });
    k.add(this.head, box(0.058, 0.009, 0.004), '#fbf6ee', [0, 0.08, 0.1285], { r: [-0.25, 0, 0], line: false });
    // hair: a cap that follows the skull and tufts that break its outline (no helmet)
    k.add(this.head, sph(0.134, 16, 12), L.hair, [0, 0.176, -0.026], { s: [1.05, 0.88, 1.05] });
    if (!L.old) {
      // a fringe across the brow, and tufts all round
      for (let i = 0; i < 6; i++) { const a = -0.95 + i * 0.38; k.add(this.head, new THREE.ConeGeometry(0.038, 0.11, 6), L.hair, [Math.sin(a) * 0.088, 0.225, 0.088 + Math.cos(a) * 0.01], { r: [1.95, 0, -a * 0.6] }); }
      const n = L.braids ? 6 : 9;
      for (let i = 0; i < n; i++) { const a = -2.3 + i * (4.6 / (n - 1)); k.add(this.head, new THREE.ConeGeometry(0.05, L.braids ? 0.11 : 0.16, 6), L.hair, [Math.sin(a) * 0.12, 0.21 + Math.cos(i * 1.7) * 0.03, Math.cos(a) * 0.12 - 0.03], { r: [Math.cos(a) * 1.5, 0, -Math.sin(a) * 1.5] }); }
      if (!L.braids) for (let i = 0; i < 4; i++) k.add(this.head, new THREE.ConeGeometry(0.05, 0.15, 6), L.hair, [-0.06 + i * 0.04, 0.29, -0.02 - i * 0.02], { r: [-0.6 - i * 0.2, 0, 0.5 - i * 0.3] }); // the mop on top
    }
    if (L.bun) { k.add(this.head, sph(0.065, 12, 9), L.hair, [0, 0.25, -0.12]); k.add(this.head, tor(0.05, 0.012), '#5aa0e6', [0, 0.235, -0.1], { r: [0.9, 0, 0], line: false }); }
    if (L.braids) {
      const n = L.braids;
      for (let b = 0; b < n; b++) {
        const s = n === 1 ? 0 : b === 0 ? -1 : 1;
        const tail = new THREE.Group(); tail.position.set(0.105 * s, 0.13, -0.07); this.head.add(tail);
        // a plaited braid: lumps that alternate side to side, a ribbon bow, a tuft at the end
        for (let i = 0; i < 7; i++) k.add(tail, sph(0.036 - i * 0.002, 9, 7), L.hair, [(i % 2 ? 0.008 : -0.008), -0.03 - i * 0.05, -i * 0.006], { s: [1, 1.25, 1], r: [0, 0, (i % 2 ? 0.4 : -0.4)] });
        k.add(tail, sph(0.028, 8, 6), L.scarf, [0.024, -0.38, -0.04], { s: [1.2, 0.7, 0.6], line: false });
        k.add(tail, sph(0.028, 8, 6), L.scarf, [-0.024, -0.38, -0.04], { s: [1.2, 0.7, 0.6], line: false });
        k.add(tail, new THREE.ConeGeometry(0.03, 0.07, 6), L.hair, [0, -0.43, -0.045], { r: [Math.PI, 0, 0] });
        this.hairTails.push(tail);
      }
    }
    if (L.hat) {
      // a real straw hat: a lathed brim that dips at the front and back and turns up at the edge,
      // a pinched crown, a blue band, a plaited edge and a red flower
      const hat = new THREE.Group(); hat.position.set(0, 0.255, -0.01); hat.rotation.x = -0.1; this.head.add(hat);
      const brim = lathe([[0.1, 0.012], [0.16, 0.0], [0.23, -0.012], [0.28, -0.012], [0.305, 0.004], [0.3, 0.012], [0.24, 0.006], [0.1, 0.022]], 28);
      const bp = brim.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i), r = Math.hypot(x, z); bp.setY(i, bp.getY(i) - 0.035 * (r / 0.3) * (z * z) / (r * r + 1e-6)); }
      brim.computeVertexNormals();
      k.add(hat, brim, L.hat!, [0, 0, 0]);
      k.add(hat, lathe([[0.118, 0.0], [0.122, 0.05], [0.115, 0.095], [0.085, 0.118], [0.03, 0.105], [0.0, 0.1]], 20), L.hat!, [0, 0.01, 0]);
      k.add(hat, cyl(0.124, 0.124, 0.03, 20), '#3e64a8', [0, 0.027, 0], { line: false });
      k.add(hat, tor(0.3, 0.008), '#c4a462', [0, 0.008, 0], { r: [Math.PI / 2, 0, 0], line: false });
      k.add(hat, sph(0.03, 8, 6), '#e04a3a', [0.1, 0.035, 0.06], { s: [1, 0.7, 0.5], line: false });
      this.hairTails.push(hat);
    }
    k.bake();
    addOutlines(this.root, '#3a2a2e', 0.008);
  }

  /** Stand (speed 0) or run (m/s), blink. Call before glidePose. */
  update(dt: number, speed = 0) {
    this.phase += dt * (speed > 0.2 ? 4 + speed * 1.1 : 0);
    const run = clamp(speed / 5), ph = this.phase;
    this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0);
    this.hips.position.y = this.hipY + Math.abs(Math.sin(ph)) * run * 0.05;
    this.torso.rotation.set(0.05 + run * 0.25, Math.sin(ph) * run * 0.12, 0);
    for (let i = 0; i < 2; i++) {
      const o = i ? Math.PI : 0, L = this.legs[i];
      L.thigh.rotation.set(Math.sin(ph + o) * 0.8 * run, 0, 0);
      L.knee.rotation.set(Math.max(0, -Math.cos(ph + o)) * 1.3 * run + 0.05, 0, 0);
      this.ankles[i].rotation.set(0, 0, 0);
      const A = this.arms[i], s = i ? 1 : -1;
      A.sh.rotation.set(-Math.sin(ph + o) * 0.7 * run, 0, 0.1 * s);
      A.el.rotation.set(-0.3 - run * 0.9, 0, 0);
      this.wrists[i].rotation.set(0, 0, 0);
    }
    this.head.rotation.set(-run * 0.15, 0, 0);
    this.blink -= dt;
    const open = this.blink < 0.12 ? Math.abs(this.blink - 0.06) / 0.06 : 1;
    if (this.blink < 0) this.blink = 2 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = Math.max(0.1, open);
  }

  /** Braids and the hat brim flutter in the wind (call after glidePose). */
  flutter(t: number, wind: number, k: number) {
    this.hairTails.forEach((h, i) => {
      if (i < (this.look.braids ?? 0)) {
        // braids stream back over the shoulders when prone (towards -Y of the head, which is backwards)
        h.rotation.x = lerp(0.1, 0.75 + Math.sin(t * 9 * (0.5 + wind) + i) * 0.2 * wind, k);
        h.rotation.z = Math.sin(t * 7 + i * 2) * 0.14 * wind * k + (i ? 0.15 : -0.15) * k;
      } else h.rotation.x = -0.12 + Math.sin(t * 13) * 0.04 * wind * k; // the hat brim shivers
    });
  }
}
