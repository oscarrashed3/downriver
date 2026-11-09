// Riders for the kite-wings: the prone glide pose (lying flat on the wing, hands on the bar, legs trailing,
// head up to see where they are going), the flare and run of a landing, and stand-in racers for the
// Sky Isles kite race (Zephy, Lark and Gran Wren), built like the villagers of World 1: small parts of one
// colour on one joint merged into one mesh, an inked edge, a face that reads from a chase camera.
//
// glidePose() works on any body with the Person joint layout (Nilo's Person, or a StandInRider), as a
// layer on top of whatever posed it before: k = 0 leaves the body alone, k = 1 is fully prone.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from '../props';
import { addOutlines } from '../../render/paint';

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
  // cloth on the body streams back and flaps
  const fl = 0.35 + wind * 0.65 + dive * 0.5;
  r.coatPanels?.forEach((c, i) => {
    const e = new THREE.Euler(0.45 * k + flap(9, i * 1.7) * 0.18 * fl * k, 0, flap(7, i) * 0.06 * k); // lifted off the wing by the wind
    c.pivot.quaternion.slerp(new THREE.Quaternion().setFromEuler(e), k);
  });
  if (r.hoodTip) r.hoodTip.rotation.set(lerp(r.hoodTip.rotation.x, 0.5 + flap(11, 0.4) * 0.25 * fl, k), 0, flap(8, 1) * 0.15 * k);
  r.scarfTail?.forEach((seg, i) => {
    seg.rotation.x = lerp(seg.rotation.x, (i === 0 ? -0.2 : 0) + flap(10, i * 0.9) * (0.25 + i * 0.12) * fl, k);
    seg.rotation.z = lerp(seg.rotation.z, flap(7, i * 1.3) * 0.2 * fl, k);
  });
}

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
      const m = new THREE.Mesh(mergeGeometries(list, false)!, toon(color));
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

export type RacerKind = 'zephy' | 'lark' | 'wren';

/** How a stand-in racer looks. */
export interface RacerLook {
  skin: string; hair: string; shirt: string; vest?: string; trousers: string; boots: string; scarf: string;
  hat?: string; braids?: number; bun?: boolean; height: number; old?: boolean; harness?: string;
}
export const RACERS: Record<RacerKind, RacerLook> = {
  // Zephy: the fast boy from Sailtown, red scarf, a leather flying harness over a white shirt
  zephy: { skin: '#c99068', hair: '#3a2418', shirt: '#f1ead8', vest: '#8a5a36', trousers: '#5d4a3c', boots: '#5a3824', scarf: '#d8453a', height: 1.3, harness: '#6a4428', braids: 1 },
  // Lark: two long braids, a yellow scarf, a cream smock
  lark: { skin: '#eac0a0', hair: '#5a3624', shirt: '#efe2c4', vest: '#c8a46a', trousers: '#6a5a48', boots: '#6a4430', scarf: '#f0c040', height: 1.22, braids: 2, harness: '#7a5030' },
  // Gran Wren: the oldest racer, white bun, straw hat, a blue coat
  wren: { skin: '#e4b896', hair: '#f2eee4', shirt: '#3e64a8', vest: '#2f4f8c', trousers: '#3a3a4a', boots: '#4a3428', scarf: '#9cc4ec', hat: '#e2c88a', bun: true, height: 1.25, old: true, harness: '#5a4030' },
};

/**
 * A small racer with the Person joint layout, so glidePose works on it. Feet at the root when standing.
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
  scarfTail: THREE.Group[] = [];
  /** A point in each palm (left, right), for things held: a kite string, the bar. */
  hands: THREE.Group[] = [];
  /** Braids (or the hat brim) that stream in the wind. */
  hairTails: THREE.Group[] = [];
  /** Where the long scarf ends leave the neck (child of the torso). */
  scarfRoot = new THREE.Group();
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
    // legs: thigh, shin, boot with a turned cuff
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group(); thigh.position.set(0.085 * s, -0.02, 0);
      k.add(thigh, cap(0.075, 0.16), L.trousers, [0, -0.14, 0]);
      const knee = new THREE.Group(); knee.position.y = -0.3;
      k.add(knee, cap(0.065, 0.15), L.trousers, [0, -0.12, 0]);
      k.add(knee, cyl(0.072, 0.068, 0.12), L.boots, [0, -0.22, 0]);
      k.add(knee, tor(0.072, 0.018), L.boots, [0, -0.16, 0], { r: [Math.PI / 2, 0, 0] });
      k.add(knee, sph(0.075, 12, 8), L.boots, [0, -0.29, 0.04], { s: [0.95, 0.7, 1.55] });
      thigh.add(knee); this.hips.add(thigh); this.legs.push({ thigh, knee });
    }
    // torso: shirt, vest or coat, belt, a flying harness strap across the chest
    k.add(this.torso, cap(0.14, 0.16), L.shirt, [0, 0.2, 0], { s: [1, 1, 0.78] });
    k.add(this.torso, sph(0.13, 12, 8), L.trousers, [0, 0.02, 0], { s: [1.08, 0.7, 0.85] });
    if (L.vest) {
      k.add(this.torso, cyl(0.155, 0.17, 0.26, 12), L.vest, [0, 0.17, -0.004], { s: [1, 1, 0.8] });
      if (L.old) k.add(this.torso, cyl(0.17, 0.23, 0.26, 12), L.vest, [0, -0.06, 0], { s: [1, 1, 0.82] }); // coat skirt
    }
    if (L.harness) {
      k.add(this.torso, tor(0.155, 0.014), L.harness, [0, 0.03, 0], { r: [Math.PI / 2, 0, 0], s: [1.02, 0.82, 1] });
      for (const s of [-1, 1]) k.add(this.torso, cyl(0.013, 0.013, 0.34, 5), L.harness, [0.07 * s, 0.2, 0.108], { r: [0, 0, 0.22 * s] });
      k.add(this.torso, cyl(0.03, 0.03, 0.012, 8), '#c8a050', [0, 0.1, 0.12], { r: [Math.PI / 2, 0, 0], line: false });
    }
    // arms
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(0.175 * s, 0.33, 0);
      k.add(sh, cap(0.055, 0.14), L.old ? L.vest! : L.shirt, [0, -0.1, 0]);
      k.add(sh, sph(0.066, 10, 8), L.old ? L.vest! : L.shirt, [0, -0.01, 0]);
      const el = new THREE.Group(); el.position.y = -0.22;
      k.add(el, cap(0.048, 0.12), L.shirt, [0, -0.08, 0]);
      k.add(el, tor(0.05, 0.016), L.old ? L.vest! : L.harness ?? L.shirt, [0, -0.15, 0], { r: [Math.PI / 2, 0, 0] });
      k.add(el, sph(0.045, 10, 8), '#6a4630', [0, -0.205, 0.008], { s: [0.95, 1.1, 0.8] }); // leather glove
      sh.rotation.z = 0.1 * s;
      const hand = new THREE.Group(); hand.position.set(0, -0.21, 0.01); el.add(hand); this.hands.push(hand);
      sh.add(el); this.torso.add(sh); this.arms.push({ sh, el, hand });
    }
    // scarf: a thick wrap at the neck; the long ends are ribbons the wing streams (see KiteWing)
    k.add(this.torso, tor(0.085, 0.045), L.scarf, [0, 0.39, 0.0], { r: [Math.PI / 2, 0, 0] });
    k.add(this.torso, sph(0.06, 8, 6), L.scarf, [0.06, 0.37, -0.08], { s: [1, 0.8, 0.9] }); // the knot
    this.scarfRoot.position.set(0.06, 0.36, -0.1);
    this.torso.add(this.scarfRoot);
    // head
    this.neck.position.y = 0.4; this.torso.add(this.neck);
    k.add(this.neck, cyl(0.04, 0.05, 0.08, 8), L.skin, [0, 0.02, 0]);
    this.head.position.y = 0.05; this.head.scale.setScalar(1.32); this.neck.add(this.head);
    k.add(this.head, sph(0.13, 16, 12), L.skin, [0, 0.14, 0], { s: [1, 1.04, 0.98] });
    k.add(this.head, sph(0.095, 12, 9), L.skin, [0, 0.085, 0.03], { s: [1.08, 0.8, 1] });
    for (const s of [-1, 1]) {
      k.add(this.head, sph(0.025, 8, 6), L.skin, [0.128 * s, 0.13, 0], { s: [0.6, 1, 0.9] }); // ears
      k.add(this.head, sph(0.03, 8, 6), '#f0a090', [0.07 * s, 0.1, 0.1], { s: [1, 0.6, 0.4], line: false }); // cheeks
      const eye = new THREE.Group(); eye.position.set(0.048 * s, 0.15, 0.118);
      k.add(eye, sph(0.019, 10, 8), '#2a1c22', [0, 0, 0], { s: [0.85, 1.3, 0.5], line: false });
      k.add(eye, sph(0.006, 6, 4), '#ffffff', [0.006 * s, 0.01, 0.009], { line: false });
      this.head.add(eye); this.eyes.push(eye);
      k.add(this.head, new THREE.BoxGeometry(0.045, 0.011, 0.01), L.old ? '#c8c0b4' : L.hair, [0.05 * s, 0.195, 0.122], { r: [0, 0, (L.old ? 0.2 : -0.12) * s], line: false });
    }
    k.add(this.head, sph(0.017, 8, 6), L.skin, [0, 0.12, 0.13], { line: false });
    k.add(this.head, tor(0.026, 0.0065, Math.PI), '#6a3030', [0, 0.085, 0.118], { r: [0, 0, Math.PI], line: false }); // a grin
    // hair
    k.add(this.head, sph(0.135, 14, 10), L.hair, [0, 0.19, -0.02], { s: [1.06, 0.82, 1.06] });
    if (!L.old) for (let i = 0; i < 6; i++) { const a = -1 + i * 0.4; k.add(this.head, sph(0.045, 8, 6), L.hair, [Math.sin(a) * 0.09, 0.22, 0.08 + Math.cos(a) * 0.02], { s: [1, 0.8, 1.5], r: [0.9, 0, -a * 0.5] }); }
    if (L.bun) k.add(this.head, sph(0.06, 10, 8), L.hair, [0, 0.27, -0.09]);
    if (L.braids) {
      const n = L.braids;
      for (let b = 0; b < n; b++) {
        const s = n === 1 ? 0 : b === 0 ? -1 : 1;
        const tail = new THREE.Group(); tail.position.set(0.1 * s, 0.13, -0.08); this.head.add(tail);
        for (let i = 0; i < 6; i++) k.add(tail, sph(0.03 - i * 0.002, 8, 6), L.hair, [0, -0.04 - i * 0.045, -i * 0.006], { s: [1, 1.2, 1] });
        k.add(tail, sph(0.02, 6, 5), L.scarf, [0, -0.31, -0.04], { line: false }); // a ribbon tie
        this.hairTails.push(tail);
      }
    }
    if (L.hat) {
      const hat = new THREE.Group(); hat.position.set(0, 0.26, -0.01); hat.rotation.x = -0.12; this.head.add(hat);
      k.add(hat, cyl(0.26, 0.27, 0.02, 20), L.hat, [0, 0, 0]);
      k.add(hat, cyl(0.1, 0.125, 0.11, 16), L.hat, [0, 0.055, 0]);
      k.add(hat, cyl(0.127, 0.127, 0.03, 16), '#3e64a8', [0, 0.02, 0], { line: false }); // band
      this.hairTails.push(hat);
    }
    k.bake();
    addOutlines(this.root, '#3a2a2e', 0.009);
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
      const A = this.arms[i], s = i ? 1 : -1;
      A.sh.rotation.set(-Math.sin(ph + o) * 0.7 * run, 0, 0.1 * s);
      A.el.rotation.set(-0.3 - run * 0.9, 0, 0);
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
      if (h.children.length && i < (this.look.braids ?? 0)) {
        // braids stream back over the shoulders when prone (towards -Y of the head, which is backwards)
        h.rotation.x = lerp(0.1, 0.6 + Math.sin(t * 9 * (0.5 + wind) + i) * 0.18 * wind, k);
        h.rotation.z = Math.sin(t * 7 + i * 2) * 0.12 * wind * k;
      } else h.rotation.x = -0.12 + Math.sin(t * 13) * 0.04 * wind * k; // the hat brim shivers
    });
  }
}
