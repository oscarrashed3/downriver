import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from '../world/props';
import { clamp } from '../world/noise';
import { Spring } from './motion';
import type { Person, PersonLook } from './person';
import { toonFlat } from './person';

// The five villagers of the Spring Peaks, each built by hand: their own outline, layered clothes,
// hands with fingers, a face with brows and cheeks, and cloth and hair that hang on springs.
// Small parts of one colour on one joint are merged into a single mesh, so all this detail costs
// about as many draw calls as the old plain body.
// The Kit and the face and part helpers are exported so the Windfolk of the Sky Isles
// (src/world/skyIsles/windfolk.ts) are built in exactly the same hand.

export type VillagerKind = 'ysolde' | 'odo' | 'bram' | 'tor' | 'nima';

/** How someone walks: step rate, stride length, bounce, arm swing and side-to-side roll (1 = Nilo's defaults). */
export interface Gait { rate: number; stride: number; bounce: number; arm: number; waddle: number }
export const GAIT_DEFAULT: Gait = { rate: 1, stride: 1, bounce: 1, arm: 1, waddle: 0 };

export type V3 = [number, number, number];
export interface Opt { r?: V3; s?: number | V3; line?: boolean; dbl?: boolean; flat?: boolean }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** Collects small parts per joint and colour, then merges each set into one mesh. */
export class Kit {
  private sets = new Map<THREE.Object3D, Map<string, THREE.BufferGeometry[]>>();
  add(parent: THREE.Object3D, geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, o: Opt = {}) {
    _e.set(...(o.r ?? [0, 0, 0])); _q.setFromEuler(_e);
    const s = o.s ?? 1; if (typeof s === 'number') _s.setScalar(s); else _s.set(...s);
    _m.compose(_p.set(x, y, z), _q, _s);
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    g.applyMatrix4(_m);
    if (o.flat) g.computeVertexNormals(); // non-indexed, so every face gets its own flat normal
    const key = `${color}|${o.line === false ? 0 : 1}|${o.dbl ? 1 : 0}`;
    let set = this.sets.get(parent); if (!set) this.sets.set(parent, (set = new Map()));
    const list = set.get(key) ?? []; list.push(g); set.set(key, list);
    geo.dispose();
  }
  bake() {
    for (const [parent, set] of this.sets) for (const [key, list] of set) {
      const [color, line, dbl] = key.split('|');
      const merged = mergeGeometries(list, false)!;
      const m = new THREE.Mesh(merged, dbl === '1' ? toonFlat(color) : toon(color));
      m.castShadow = true;
      if (line === '0') { m.userData.noOutline = true; m.castShadow = false; }
      parent.add(m);
      list.forEach(g => g.dispose());
    }
    this.sets.clear();
  }
}

const G = THREE;
export const cap = (r: number, len: number, rs = 10) => new G.CapsuleGeometry(r, len, 4, rs);
export const sph = (r: number, w = 12, h = 9) => new G.SphereGeometry(r, w, h);
export const cyl = (rt: number, rb: number, h: number, n = 10, open = false) => new G.CylinderGeometry(rt, rb, h, n, 1, open);
export const box = (x: number, y: number, z: number) => new G.BoxGeometry(x, y, z);
export const tor = (r: number, t: number, arc = Math.PI * 2, rs = 6, ts = 14) => new G.TorusGeometry(r, t, rs, ts, arc);
export const cone = (r: number, h: number, n = 8) => new G.ConeGeometry(r, h, n);
export function lathe(pts: [number, number][], n = 16, start = 0, len = Math.PI * 2) {
  return new G.LatheGeometry(pts.map(([r, y]) => new G.Vector2(r, y)), n, start, len);
}
/** Cloth folds: ripple a lathe's radius around its axis, more towards the hem. */
export function folds(g: THREE.BufferGeometry, n: number, amt: number, yTop: number, yBot: number, seed = 0) {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(x, z), k = clamp((yTop - y) / (yTop - yBot));
    const f = 1 + amt * k * (Math.sin(a * n + seed) * 0.7 + Math.sin(a * (n * 2 + 1) + seed * 2) * 0.3);
    p.setXYZ(i, x * f, y, z * f);
  }
  g.computeVertexNormals();
  return g;
}
/** A flat triangle (paper, cloth ends). */
export function tri(a: V3, b: V3, c: V3) {
  const g = new G.BufferGeometry();
  g.setAttribute('position', new G.Float32BufferAttribute([...a, ...b, ...c], 3));
  g.setAttribute('uv', new G.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- springs

interface Hang { o: THREE.Object3D; bx: number; bz: number; sx: Spring; sz: Spring; gain: number; wind: number; bob: number; limit: number; prev: THREE.Vector3; vel: THREE.Vector3; has: boolean }
const _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _w3 = new THREE.Vector3(), _wq = new THREE.Quaternion(), _wq2 = new THREE.Quaternion();

/** Parts that hang and swing: braids, scarf ends, bags, lanterns, bells, hair puffs, an apron. */
export class Sway {
  items: Hang[] = [];
  /** Staffs and poles that stay upright in the hand however the arm swings, leaning by `tilt`. */
  upright: { o: THREE.Object3D; tilt: THREE.Quaternion }[] = [];
  ref: THREE.Object3D | null = null;
  stand(o: THREE.Object3D, tx = 0, tz = 0) { this.upright.push({ o, tilt: new THREE.Quaternion().setFromEuler(new THREE.Euler(tx, 0, tz)) }); }
  add(o: THREE.Object3D, { freq = 1.8, damp = 0.35, gain = 0.035, wind = 0.25, bob = 0.15, limit = 0.9 } = {}) {
    this.items.push({ o, bx: o.rotation.x, bz: o.rotation.z, sx: new Spring(freq, damp), sz: new Spring(freq, damp), gain, wind, bob, limit, prev: new THREE.Vector3(), vel: new THREE.Vector3(), has: false });
    return o;
  }
  update(dt: number, wind: THREE.Vector3, moving: number, ph: number, t: number) {
    if (dt <= 0) return;
    if (this.ref) for (const u of this.upright) {
      u.o.parent!.getWorldQuaternion(_wq).invert();
      u.o.quaternion.copy(_wq).multiply(this.ref.getWorldQuaternion(_wq2)).multiply(u.tilt);
    }
    for (const h of this.items) {
      const p = h.o.getWorldPosition(_w1);
      let ax = 0, az = 0;
      if (h.has) {
        const v = _w2.subVectors(p, h.prev).divideScalar(dt);
        const a = _w3.subVectors(v, h.vel).divideScalar(dt);
        h.vel.copy(v);
        if (a.lengthSq() < 4e4) {
          h.o.parent!.getWorldQuaternion(_wq).invert(); a.applyQuaternion(_wq);
          ax = clamp(a.z * h.gain, -h.limit, h.limit); az = clamp(-a.x * h.gain, -h.limit, h.limit);
        }
      }
      h.prev.copy(p); h.has = true;
      const gust = 0.75 + Math.sin(t * 1.3 + h.bx * 7) * 0.25;
      const tx = ax + Math.max(0, -wind.z) * h.wind * gust + Math.abs(Math.sin(ph)) * moving * h.bob;
      const tz = az + wind.x * h.wind * 0.6 * gust;
      h.o.rotation.x = h.bx + h.sx.step(tx, dt);
      h.o.rotation.z = h.bz + h.sz.step(tz, dt);
    }
  }
}

// ---------------------------------------------------------------- shared body parts

export interface LegSpec { B: number; thigh: string; shin: string; boot: string; bare?: boolean; skin: string; bootH?: number; bootS?: number; cuff?: string; cuffY?: number; pad?: string; wrap?: string; sock?: string; patch?: string; thighR?: number; shinR?: number }
export function legs(p: Person, k: Kit, o: LegSpec) {
  for (const s of [-1, 1]) {
    const thigh = new G.Group(); thigh.position.set(0.1 * s * o.B, -0.02, 0);
    k.add(thigh, cap(0.095 * o.B * (o.thighR ?? 1), 0.25), o.thigh, 0, -0.2, 0);
    if (o.patch && s === 1) k.add(thigh, box(0.08, 0.09, 0.02), o.patch, 0.01, -0.24, 0.088 * o.B * (o.thighR ?? 1), { r: [0, 0, 0.2] });
    const knee = new G.Group(); knee.position.y = -0.4;
    k.add(knee, cap(0.082 * o.B * (o.shinR ?? 1), 0.24), o.shin, 0, -0.18, 0);
    if (o.cuff) k.add(knee, tor(0.085 * o.B * (o.shinR ?? 1), 0.024), o.cuff, 0, o.cuffY ?? -0.08, 0, { r: [Math.PI / 2, 0, 0] });
    if (o.sock) k.add(knee, cyl(0.078, 0.074, 0.12, 10), o.sock, 0, -0.27, 0);
    if (o.wrap) for (let i = 0; i < 5; i++) k.add(knee, tor(0.083 * o.B * (o.shinR ?? 1), 0.016, Math.PI * 2, 4, 12), o.wrap, 0, -0.06 - i * 0.045, 0, { r: [Math.PI / 2 + (i % 2 ? 0.18 : -0.18), 0, 0] });
    if (o.pad) k.add(knee, sph(0.062, 10, 8), o.pad, 0, -0.02, 0.055, { s: [1, 1, 0.6] });
    const bs = o.bootS ?? 1;
    if (o.bare) {
      k.add(knee, sph(0.075, 10, 8), o.skin, 0, -0.39, 0.04, { s: [0.85, 0.55, 1.5] });
      for (let i = 0; i < 4; i++) k.add(knee, sph(0.017, 6, 5), o.skin, -0.035 + i * 0.022 - s * 0.004, -0.405, 0.135 - Math.abs(i - 1) * 0.008, { line: false });
    } else {
      k.add(knee, sph(0.09, 12, 8), o.boot, 0, -0.385, 0.045, { s: [0.95 * bs, 0.72, 1.5 * bs] });
      k.add(knee, cyl(0.086 * bs, 0.084 * bs, o.bootH ?? 0.12, 10), o.boot, 0, -0.33 + (0.12 - (o.bootH ?? 0.12)) * -0.5 + 0, 0);
      k.add(knee, sph(0.092, 12, 6), '#2a1e18', 0, -0.425, 0.045, { s: [0.98 * bs, 0.22, 1.55 * bs], line: false });
      for (let i = 0; i < 3; i++) k.add(knee, box(0.05, 0.008, 0.01), '#2a1e18', 0, -0.33 - i * 0.03, 0.086 * bs, { line: false });
    }
    thigh.add(knee); p.hips.add(thigh); p.legs.push({ thigh, knee });
  }
}

/** A hand with four fingers and a thumb, gently curled, merged into one mesh. */
export function handGeo(s: number, size = 1) {
  const parts: THREE.BufferGeometry[] = [];
  const put = (g: THREE.BufferGeometry, x: number, y: number, z: number, r: V3 = [0, 0, 0], sc: V3 = [1, 1, 1]) => {
    _e.set(...r); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(...sc));
    const n = g.toNonIndexed(); n.deleteAttribute('uv'); n.applyMatrix4(_m); parts.push(n); g.dispose();
  };
  put(sph(0.052, 10, 8), 0, 0, 0, [0, 0, 0], [0.95, 1.05, 0.62]);
  for (let i = 0; i < 4; i++) put(cap(0.0135, 0.04, 6), (-0.027 + i * 0.018) * s, -0.06 + Math.abs(i - 1.5) * 0.006, 0.006, [0.35, 0, (i - 1.5) * 0.06 * s]);
  put(cap(0.015, 0.035, 6), -0.042 * s, -0.012, 0.022, [0.5, 0, 0.7 * s]);
  const g = mergeGeometries(parts)!; g.scale(size, size, size); return g;
}

export interface ArmSpec { B: number; sleeve: string; fore: string; skin: string; cuff?: string; rolled?: boolean; puff?: number; shX?: number; hand?: number; foreR?: number }
export function arms(p: Person, k: Kit, o: ArmSpec) {
  for (const s of [-1, 1]) {
    const sh = new G.Group(); sh.position.set((o.shX ?? 0.215) * s * o.B, 0.42, 0);
    k.add(sh, cap(0.07 * o.B * (o.puff ?? 1), 0.18), o.sleeve, 0, -0.13, 0);
    k.add(sh, sph(0.085 * o.B * (o.puff ?? 1), 10, 8), o.sleeve, 0, -0.02, 0);
    const el = new G.Group(); el.position.y = -0.27;
    k.add(el, cap(0.06 * o.B * (o.foreR ?? 1), 0.13), o.rolled ? o.skin : o.fore, 0, -0.1, 0);
    if (o.rolled) k.add(el, tor(0.066 * o.B, 0.028, Math.PI * 2, 6, 12), o.sleeve, 0, -0.01, 0, { r: [Math.PI / 2, 0, 0] });
    else k.add(el, tor(0.064 * o.B * (o.foreR ?? 1), 0.022, Math.PI * 2, 6, 12), o.cuff ?? o.fore, 0, -0.19, 0, { r: [Math.PI / 2, 0, 0] });
    const hand = new G.Mesh(handGeo(s, o.hand ?? 1), toon(o.skin)); hand.position.set(0, -0.25, 0.01); hand.castShadow = true;
    el.add(hand); sh.add(el); sh.rotation.z = 0.08 * s;
    p.torso.add(sh); p.arms.push({ sh, el, hand });
  }
}

export interface FaceSpec { skin: string; brow: string; browW?: number; browT?: number; browTilt?: number; nose?: 'button' | 'round' | 'long' | 'bulb'; noseC?: string; blush?: string; wrinkles?: boolean; lids?: number; ears?: number; skull?: V3; freckles?: boolean; lashes?: boolean }
export function face(p: Person, k: Kit, look: PersonLook, f: FaceSpec) {
  const h = p.head, sk = f.skull ?? [1, 1.05, 0.98];
  k.add(h, sph(0.165, 16, 12), f.skin, 0, 0.17, 0, { s: sk });
  k.add(h, sph(0.12, 12, 9), f.skin, 0, 0.1, 0.035, { s: [1.1, 0.8, 1] });
  for (const s of [-1, 1]) k.add(h, sph(0.05, 8, 6), f.skin, 0.085 * s, 0.13, 0.115, { s: [1, 0.8, 0.7], line: false }); // cheeks
  const er = 0.032 * (f.ears ?? 1);
  for (const s of [-1, 1]) {
    k.add(h, sph(er, 8, 6), f.skin, (0.155 + er * 0.3) * s, 0.16, 0, { s: [0.6, 1, 0.9], r: [0, 0, -0.3 * s * ((f.ears ?? 1) - 1)] });
    k.add(h, sph(er * 0.55, 6, 5), '#c88a78', (0.16 + er * 0.42) * s, 0.16, 0.004, { s: [0.4, 0.8, 0.6], line: false, r: [0, 0, -0.3 * s * ((f.ears ?? 1) - 1)] });
  }
  const nc = f.noseC ?? f.skin;
  switch (f.nose ?? 'button') {
    case 'button': k.add(h, sph(0.022, 8, 6), nc, 0, 0.15, 0.163, { line: false }); break;
    case 'round': k.add(h, sph(0.03, 8, 6), nc, 0, 0.145, 0.165, { s: [1.1, 0.9, 0.9], line: false }); break;
    case 'long': k.add(h, sph(0.026, 8, 6), nc, 0, 0.15, 0.162, { s: [0.85, 1.5, 1.2], r: [-0.3, 0, 0], line: false }); break;
    case 'bulb': k.add(h, sph(0.042, 10, 8), nc, 0, 0.145, 0.165, { s: [1.1, 0.95, 0.9], line: false }); break;
  }
  for (const s of [-1, 1]) k.add(h, sph(0.026, 8, 6), f.blush ?? '#ef9e92', 0.092 * s, 0.128, 0.143, { s: [1.2, 0.75, 0.3], r: [0, 0.55 * s, 0], line: false });
  if (f.wrinkles) for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i++) k.add(h, box(0.028, 0.004, 0.004), '#b88a78', 0.112 * s, 0.19 - i * 0.016, 0.128, { r: [0, 0.7 * s, (0.25 + i * 0.3) * -s], line: false });
    k.add(h, tor(0.05, 0.0035, 1.1, 3, 8), '#b88a78', 0.035 * s, 0.13, 0.15, { r: [0, 0, s > 0 ? 3.9 : 4.1 - 1.1 + 0.3], line: false });
    k.add(h, box(0.04, 0.004, 0.004), '#c09080', 0, 0.255 + (s > 0 ? 0 : 0.014), 0.142, { line: false });
  }
  if (f.freckles) for (let i = 0; i < 10; i++) { const s = i % 2 ? 1 : -1, j = i >> 1; k.add(h, sph(0.0045, 4, 3), '#b8745a', s * (0.07 + (j % 3) * 0.014), 0.142 + ((j * 7) % 3) * 0.009, 0.15 - (j % 3) * 0.006, { line: false }); }
  for (const s of [-1, 1]) {
    const eye = new G.Group(); eye.position.set(0.062 * s, 0.185, 0.148);
    const iris = new G.Mesh(sph(0.026, 10, 8), toon('#2a2230')); iris.scale.set(0.85, 1.35 * (f.lids ?? 1), 0.5); iris.userData.noOutline = true;
    const glint = new G.Mesh(sph(0.008, 6, 4), new G.MeshBasicMaterial({ color: '#ffffff' })); glint.position.set(0.008 * s, 0.012, 0.012); glint.userData.noOutline = true;
    eye.add(iris, glint);
    if (f.lids && f.lids < 1) { const lid = new G.Mesh(sph(0.03, 10, 6, ), toon(f.skin)); lid.scale.set(1, 0.6, 0.55); lid.position.set(0, 0.022, 0.002); lid.userData.noOutline = true; eye.add(lid); }
    if (f.lashes) { const l = new G.Mesh(box(0.034, 0.006, 0.006), toon('#2a2230')); l.position.set(0.006 * s, 0.03 * (f.lids ?? 1), 0.008); l.rotation.z = -0.35 * s; l.userData.noOutline = true; eye.add(l); }
    h.add(eye); p.eyes.push(eye);
    const brow = new G.Mesh(box(0.06 * (f.browW ?? 1), 0.013 * (f.browT ?? 1), 0.014), toon(f.brow));
    brow.geometry.rotateZ((f.browTilt ?? 0) * s);
    brow.position.set(0.062 * s, 0.238, 0.152); brow.userData.noOutline = true;
    h.add(brow); p.brows.push(brow);
  }
  p.mouthFlat = new G.Mesh(box(0.04, 0.008, 0.01), toon('#6a3a3a')); p.mouthFlat.position.set(0, 0.105, 0.152);
  p.mouthSmile = new G.Mesh(tor(0.024, 0.006, Math.PI, 4, 12), toon('#6a3a3a')); p.mouthSmile.position.set(0, 0.115, 0.15); p.mouthSmile.rotation.z = Math.PI;
  p.mouthO = new G.Mesh(sph(0.014, 8, 6), toon('#5a2a30')); p.mouthO.position.set(0, 0.1, 0.152); p.mouthO.scale.set(1, 1.3, 0.4);
  for (const m of [p.mouthFlat, p.mouthSmile, p.mouthO]) m.userData.noOutline = true;
  h.add(p.mouthFlat, p.mouthSmile, p.mouthO);
  void look;
}

export function neckHead(p: Person, k: Kit, skin: string, HS: number, neckR = 0.05) {
  p.neck.position.y = 0.5; p.torso.add(p.neck);
  k.add(p.neck, cyl(neckR, neckR + 0.01, 0.11, 8), skin, 0, 0.02, 0);
  p.head.position.y = 0.07; p.head.scale.setScalar(HS); p.neck.add(p.head);
  p.head.add(p.hair);
}
export function anchors(p: Person) {
  p.hipR.position.set(0.2, -0.02, 0.05); p.torso.add(p.hipR);
  p.strapPoint.position.set(0.12, 0.3, 0.17); p.torso.add(p.strapPoint);
}
/** A pivot that hangs from a parent at a point, ready for the Sway. */
export function pivot(parent: THREE.Object3D, x: number, y: number, z: number) { const g = new G.Group(); g.position.set(x, y, z); parent.add(g); return g; }

// ---------------------------------------------------------------- Ysolde, keeper of the spring

function ysolde(p: Person, k: Kit, L: PersonLook, sway: Sway) {
  const B = L.build ?? 0.9, skin = L.skin, dress = L.coat ?? '#3e4673', dark = '#2c3156', shawl = L.shawl ?? '#8c7f72', stripe = '#a8623f', hair = L.hair;
  legs(p, k, { B, thigh: dress, shin: '#3a3448', boot: L.boots, skin, bootH: 0.1 });
  const T = p.torso;
  k.add(T, cap(0.165 * B, 0.22), dress, 0, 0.27, 0, { s: [1, 1, 0.82] });
  // a long dress in two tiers, the under-skirt a shade darker, with folds that deepen towards the hem
  const skirt = new G.Group(); T.add(skirt); p.coat = skirt;
  k.add(skirt, folds(lathe([[0.0, 0.16], [0.17 * B, 0.16], [0.2 * B, 0.02], [0.27 * B, -0.35], [0.33 * B, -0.72], [0.32 * B, -0.74]], 20), 9, 0.07, 0.05, -0.74), dress, 0, 0, 0, { s: [1, 1, 0.86], dbl: true });
  k.add(skirt, folds(lathe([[0.25 * B, -0.5], [0.345 * B, -0.8], [0.335 * B, -0.82]], 20), 9, 0.07, -0.5, -0.82, 0.6), dark, 0, 0, 0, { s: [1, 1, 0.86], dbl: true });
  k.add(skirt, tor(0.33 * B, 0.012, Math.PI * 2, 4, 24), '#c8b89a', 0, -0.715, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.86, 1], line: false }); // a pale trim
  // apron, faded linen, tied at the waist
  k.add(skirt, folds(lathe([[0.215 * B, 0.08], [0.29 * B, -0.35], [0.31 * B, -0.56]], 10, -0.75, 1.5), 5, 0.06, 0.08, -0.56), '#b8ae98', 0, 0, 0.012, { s: [1.03, 1, 0.9], dbl: true });
  k.add(T, tor(0.19 * B, 0.02, Math.PI * 2, 4, 18), '#5a3a22', 0, 0.09, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.86, 1] });
  k.add(T, box(0.035, 0.03, 0.012), '#c8a050', 0, 0.09, 0.165, { line: false });
  // a long layered shawl: capelet over the shoulders, a point down the back, two ends down the front
  k.add(T, folds(lathe([[0.09, 0.53], [0.17 * B, 0.48], [0.28 * B, 0.33], [0.32 * B, 0.2], [0.315 * B, 0.18]], 16), 7, 0.06, 0.45, 0.18, 1), shawl, 0, 0, 0, { s: [1, 1, 0.9], dbl: true });
  k.add(T, tor(0.305 * B, 0.013, Math.PI * 2, 4, 20), stripe, 0, 0.23, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.9, 1], line: false });
  for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2; k.add(T, cone(0.011, 0.06, 4), '#6e6258', Math.sin(a) * 0.31 * B, 0.155, Math.cos(a) * 0.28 * B, { r: [Math.PI, 0, 0], line: false }); }
  k.add(T, cone(0.2 * B, 0.42, 12), shawl, 0, 0.0, -0.215 * B, { r: [Math.PI + 0.1, 0, 0], s: [1.1, 1, 0.22] });
  for (let i = 0; i < 5; i++) k.add(T, cone(0.01, 0.05, 4), '#6e6258', (i - 2) * 0.018, -0.23 + Math.abs(i - 2) * 0.03, -0.235 * B, { r: [Math.PI, 0, 0], line: false });
  for (const s of [-1, 1]) {
    const end = pivot(T, 0.08 * s, 0.4, 0.17 * B); end.rotation.set(-0.12, 0, 0.06 * s);
    k.add(end, box(0.085, 0.5, 0.022), shawl, 0, -0.25, 0, { r: [0, 0, 0] });
    k.add(end, box(0.087, 0.03, 0.025), stripe, 0, -0.42, 0, { line: false });
    for (let i = 0; i < 5; i++) k.add(end, cone(0.008, 0.05, 3), '#6e6258', -0.034 + i * 0.017, -0.52, 0, { r: [Math.PI, 0, 0], line: false });
    sway.add(end, { freq: 1.4, damp: 0.3, gain: 0.03, wind: 0.3, bob: 0.08, limit: 0.5 });
  }
  // brooch closing the shawl
  k.add(T, cyl(0.032, 0.032, 0.015, 12), '#c8a050', 0, 0.42, 0.2 * B, { r: [Math.PI / 2 - 0.3, 0, 0] });
  k.add(T, sph(0.017, 8, 6), '#4a8a9a', 0, 0.423, 0.212 * B, { line: false });
  // tin cup on the belt
  const cup = pivot(T, 0.2 * B, 0.07, 0.07); k.add(cup, cyl(0.04, 0.036, 0.075, 10), '#b8b8b8', 0, -0.06, 0); k.add(cup, tor(0.022, 0.006, Math.PI, 3, 8), '#9a9a9a', 0.04, -0.06, 0, { r: [0, 0, -Math.PI / 2] });
  sway.add(cup, { freq: 2.4, gain: 0.02, wind: 0.05 });
  arms(p, k, { B, sleeve: dress, fore: dress, skin, cuff: '#e8e0cc', hand: 0.95 });
  neckHead(p, k, skin, (L.head ?? 1) * 1.12);
  face(p, k, L, { skin, brow: '#cfc9be', browW: 1.05, browT: 0.9, browTilt: -0.15, nose: 'long', noseC: '#e6bca4', wrinkles: true, lids: 0.85, blush: '#eaa496' });
  // white hair drawn back from a centre part, a braid down her back
  const h = p.hair;
  k.add(h, sph(0.172, 14, 10), hair, 0, 0.235, -0.03, { s: [1.04, 0.8, 1.05] });
  k.add(h, sph(0.168, 14, 10), hair, 0, 0.18, -0.055, { s: [1.04, 0.92, 0.95] });
  for (const s of [-1, 1]) { k.add(h, sph(0.07, 10, 8), hair, 0.12 * s, 0.24, 0.07, { s: [0.75, 0.7, 1.2], r: [0, 0, 0.4 * s] }); k.add(h, sph(0.05, 8, 6), hair, 0.15 * s, 0.17, -0.03, { s: [0.6, 1.1, 1] }); }
  k.add(h, box(0.004, 0.006, 0.12), '#bdb6aa', 0, 0.37, 0.03, { line: false, r: [0.35, 0, 0] });
  let par: THREE.Object3D = pivot(h, 0, 0.2, -0.165);
  k.add(par, sph(0.06, 10, 8), hair, 0, 0, 0, { s: [1, 0.9, 0.8] });
  for (let i = 0; i < 7; i++) {
    const seg = pivot(par, 0, i === 0 ? -0.03 : -0.075, i === 0 ? -0.02 : 0); if (i === 0) seg.rotation.x = 0.12;
    const r = 0.042 - i * 0.003;
    k.add(seg, sph(r, 8, 6), hair, 0.012, -0.04, 0, { s: [0.95, 1.1, 0.85], r: [0, 0, 0.5] });
    k.add(seg, sph(r, 8, 6), hair, -0.012, -0.075, 0, { s: [0.95, 1.1, 0.85], r: [0, 0, -0.5] });
    sway.add(seg, { freq: 1.6 + i * 0.1, damp: 0.4, gain: 0.012, wind: 0.015, bob: 0.02, limit: 0.25 });
    par = seg;
  }
  k.add(par, tor(0.022, 0.009, Math.PI * 2, 4, 10), stripe, 0, -0.1, 0, { r: [Math.PI / 2, 0, 0], line: false });
  k.add(par, cone(0.03, 0.06, 6), hair, 0, -0.14, 0, { r: [Math.PI, 0, 0] });
  // a carved walking staff with a small bell, taller than she is
  const staff = new G.Group(); staff.position.set(0, -0.02, 0.03); p.arms[0].hand.add(staff); p.held.push(staff);
  const wood = '#8a6440';
  k.add(staff, cyl(0.02, 0.024, 1.36, 7), wood, 0, -0.29, 0, { flat: true });
  sway.stand(staff, 0.12, 0.1);
  for (let i = 0; i < 6; i++) k.add(staff, tor(0.023, 0.006, Math.PI * 2, 3, 8), '#6a4a2e', 0, 0.2 - i * 0.05, 0, { r: [Math.PI / 2 + (i % 2 ? 0.25 : -0.25), 0, 0], line: false });
  k.add(staff, tor(0.05, 0.017, Math.PI * 1.5, 6, 12), wood, 0.03, 0.42, 0, { r: [0, Math.PI / 2, 0] });
  k.add(staff, sph(0.022, 8, 6), wood, 0.03, 0.47, -0.05);
  const bell = pivot(staff, 0.03, 0.38, 0.05);
  k.add(bell, cyl(0.003, 0.003, 0.05, 3), '#a83a2a', 0, -0.025, 0, { line: false });
  k.add(bell, cone(0.026, 0.045, 10), '#d8b050', 0, -0.06, 0);
  k.add(bell, sph(0.008, 6, 4), '#7a5a20', 0, -0.085, 0, { line: false });
  sway.add(bell, { freq: 2.2, damp: 0.25, gain: 0.05, wind: 0.15, bob: 0.25 });
}

// ---------------------------------------------------------------- Odo, bridge keeper

function odo(p: Person, k: Kit, L: PersonLook, sway: Sway) {
  const B = L.build ?? 1.4, skin = L.skin, coat = L.coat ?? '#c79a3c', dark = '#9c7428', shirt = L.top, hat = L.hatColor ?? '#3e3a34';
  legs(p, k, { B: B * 0.85, thigh: L.trousers, shin: L.trousers, boot: L.boots, skin, bootS: 1.15, bootH: 0.14, thighR: 1.25, shinR: 1.15 });
  const T = p.torso;
  // a round barrel of a body under a long oilskin coat
  k.add(T, sph(0.255 * B * 0.8, 16, 12), shirt, 0, 0.22, 0, { s: [1, 1.08, 0.92] });
  const coatG = new G.Group(); T.add(coatG); p.coat = coatG;
  const W = B * 0.8;
  k.add(coatG, folds(lathe([[0.11, 0.53], [0.2 * W, 0.5], [0.27 * W, 0.4], [0.32 * W, 0.22], [0.335 * W, 0.05], [0.3 * W, -0.12], [0.3 * W, -0.28], [0.32 * W, -0.36], [0.31 * W, -0.37]], 20), 7, 0.05, -0.05, -0.37), coat, 0, 0, 0, { s: [1, 1, 0.9], dbl: true });
  // the seam where it buttons, big horn buttons, pocket flaps, a turned-up collar
  k.add(coatG, box(0.012, 0.74, 0.01), dark, 0.03, 0.09, 0.29 * W, { r: [-0.05, 0, 0], line: false });
  for (let i = 0; i < 4; i++) k.add(coatG, sph(0.022, 8, 6), '#4a3020', 0.065, 0.36 - i * 0.14, 0.3 * W * (i === 1 || i === 2 ? 1.06 : 1) * 0.9 + 0.02, { s: [1, 1, 0.5] });
  for (const s of [-1, 1]) {
    k.add(coatG, box(0.13, 0.05, 0.03), dark, 0.17 * s, -0.08, 0.27 * W * 0.9 + 0.02, { r: [-0.1, 0.45 * s, 0] });
    k.add(coatG, box(0.11, 0.4, 0.008), '#e8c870', 0.2 * s, 0.12, 0.25 * W, { r: [0, 0.6 * s, 0], s: [0.25, 1, 1], line: false }); // waxed sheen
  }
  k.add(coatG, folds(lathe([[0.1, 0.5], [0.15, 0.6], [0.17, 0.64], [0.16, 0.645]], 14, 0.6, Math.PI * 2 - 1.2), 5, 0.05, 0.6, 0.5), coat, 0, 0, -0.01, { dbl: true });
  k.add(coatG, tor(0.3 * W, 0.016, Math.PI * 2, 4, 24), dark, 0, -0.34, 0, { r: [Math.PI / 2, 0, 0], s: [1.05, 0.9, 1], line: false });
  // a towel over the left shoulder
  k.add(T, box(0.11, 0.3, 0.02), '#f2ead6', -0.17 * B * 0.8, 0.42, 0.06, { r: [0.15, 0, -0.1] });
  k.add(T, box(0.11, 0.008, 0.022), '#a83a3a', -0.17 * B * 0.8, 0.32, 0.075, { r: [0.15, 0, -0.1], line: false });
  arms(p, k, { B: B * 0.82, sleeve: coat, fore: coat, skin, cuff: dark, shX: 0.255, puff: 1.12, hand: 1.08, foreR: 1.1 });
  neckHead(p, k, skin, (L.head ?? 1) * 1.12, 0.065);
  face(p, k, L, { skin, brow: '#f2eee6', browW: 1.3, browT: 1.9, browTilt: 0.2, nose: 'bulb', noseC: '#f0a88c', wrinkles: true, skull: [1.06, 1.0, 1.0], blush: '#f39a88' });
  // bald on top, a white fringe round the back, round spectacles, a walrus moustache
  const h = p.hair, wh = L.hair;
  k.add(h, sph(0.12, 12, 8), wh, 0, 0.15, -0.12, { s: [1.25, 0.6, 0.55] });
  for (const s of [-1, 1]) k.add(h, sph(0.06, 8, 6), wh, 0.14 * s, 0.17, -0.05, { s: [0.75, 1, 1.3] });
  for (const s of [-1, 1]) {
    k.add(p.head, tor(0.034, 0.006, Math.PI * 2, 4, 14), '#4a3a30', 0.062 * s, 0.185, 0.168, { line: false });
    k.add(p.head, sph(0.034, 10, 6), '#d8ecf0', 0.062 * s, 0.185, 0.164, { s: [1, 1, 0.12], line: false });
    k.add(p.head, sph(0.055, 10, 8), wh, 0.05 * s, 0.112, 0.15, { s: [1.35, 0.6, 0.65], r: [0, 0, 0.45 * s] });
    k.add(p.head, sph(0.03, 8, 6), wh, 0.1 * s, 0.085, 0.13, { s: [0.9, 1.1, 0.8], r: [0, 0, 0.3 * s] });
  }
  k.add(p.head, box(0.03, 0.005, 0.005), '#4a3a30', 0, 0.19, 0.17, { line: false });
  for (const e of p.eyes) e.scale.set(1, 1, 1);
  // a wide-brimmed hat with a lantern hook on the band
  const hatG = pivot(p.head, 0, 0.29, -0.01); hatG.rotation.set(-0.08, 0, 0.05);
  k.add(hatG, lathe([[0.0, 0.0], [0.2, 0.0], [0.33, -0.025], [0.36, -0.05], [0.355, -0.055], [0.2, -0.015], [0.0, -0.015]], 24), hat, 0, 0, 0, { dbl: true });
  k.add(hatG, cyl(0.15, 0.165, 0.16, 16), hat, 0, 0.08, 0);
  k.add(hatG, sph(0.15, 14, 6), hat, 0, 0.16, 0, { s: [1, 0.22, 1] });
  k.add(hatG, cyl(0.168, 0.168, 0.035, 16, true), '#7a5a30', 0, 0.025, 0, { dbl: true });
  k.add(hatG, tor(0.025, 0.006, Math.PI * 1.3, 4, 8), '#3a3a3a', 0.175, 0.06, 0, { r: [Math.PI / 2, 0, 0.6] });
  const hl = pivot(hatG, 0.195, 0.045, 0.0);
  k.add(hl, cyl(0.003, 0.003, 0.04, 3), '#3a3a3a', 0, -0.02, 0, { line: false });
  k.add(hl, cone(0.025, 0.025, 6), '#3a3a3a', 0, -0.045, 0);
  k.add(hl, cyl(0.02, 0.02, 0.04, 6), '#ffe0a0', 0, -0.075, 0, { line: false });
  k.add(hl, cyl(0.024, 0.024, 0.01, 6), '#3a3a3a', 0, -0.1, 0);
  sway.add(hl, { freq: 2.2, damp: 0.25, gain: 0.05, wind: 0.2, bob: 0.3 });
  // the long lamp pole, held upright, a lantern swinging from its crook
  const pole = new G.Group(); pole.position.set(0, -0.02, 0.03); p.arms[1].hand.add(pole); p.held.push(pole);
  const wood = '#6a4a30';
  k.add(pole, cyl(0.02, 0.024, 2.2, 7), wood, 0, 0.32, 0, { flat: true });
  sway.stand(pole, 0.05, -0.08);
  k.add(pole, tor(0.026, 0.008, Math.PI * 2, 4, 8), '#4a4a4a', 0, 1.0, 0, { r: [Math.PI / 2, 0, 0] });
  k.add(pole, tor(0.12, 0.016, Math.PI * 0.75, 5, 10), '#4a4a4a', 0.0, 1.32, 0.12, { r: [0, Math.PI / 2, Math.PI * 0.12] });
  const lan = pivot(pole, 0, 1.36, 0.24);
  k.add(lan, cyl(0.004, 0.004, 0.08, 3), '#3a3a3a', 0, -0.04, 0, { line: false });
  k.add(lan, tor(0.018, 0.005, Math.PI * 2, 3, 8), '#3a3a3a', 0, -0.07, 0);
  k.add(lan, cone(0.06, 0.05, 6), '#3a3a3a', 0, -0.1, 0);
  k.add(lan, cyl(0.045, 0.045, 0.1, 6), '#ffd890', 0, -0.17, 0, { line: false });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; k.add(lan, box(0.006, 0.11, 0.006), '#3a3a3a', Math.sin(a) * 0.05, -0.17, Math.cos(a) * 0.05, { line: false }); }
  k.add(lan, cyl(0.055, 0.05, 0.02, 6), '#3a3a3a', 0, -0.23, 0);
  sway.add(lan, { freq: 1.3, damp: 0.2, gain: 0.05, wind: 0.15, bob: 0.2, limit: 0.6 });
  const glow = new G.Mesh(sph(0.035, 8, 6), new G.MeshBasicMaterial({ color: new G.Color('#ffc860').multiplyScalar(1.6) })); glow.position.y = -0.17; glow.userData.noOutline = true; lan.add(glow);
}

// ---------------------------------------------------------------- Bram, goatherd

function bram(p: Person, k: Kit, L: PersonLook, sway: Sway) {
  const B = L.build ?? 0.82, skin = L.skin, vest = L.vest ?? '#6e5a3e', shirt = L.top, capC = L.hatColor ?? '#6f8a4e';
  legs(p, k, { B, thigh: L.trousers, shin: L.trousers, boot: L.boots, skin, wrap: '#a89a80', patch: '#7a6a52', bootS: 1.12, bootH: 0.14, thighR: 0.95, shinR: 0.95 });
  const T = p.torso;
  k.add(T, cap(0.165 * B, 0.28), shirt, 0, 0.27, 0, { s: [1, 1, 0.8] });
  k.add(T, sph(0.15 * B, 10, 8), L.trousers, 0, 0.03, 0, { s: [1.05, 0.7, 0.85] });
  // a patched waistcoat, open at the front
  const W = B;
  k.add(T, folds(lathe([[0.1, 0.5], [0.16 * W, 0.49], [0.2 * W, 0.42], [0.205 * W, 0.2], [0.21 * W, 0.02], [0.215 * W, -0.06]], 18, 0.32, Math.PI * 2 - 0.64), 6, 0.04, 0.3, -0.06), vest, 0, 0, 0, { s: [1, 1, 0.84], dbl: true });
  const patch = (x: number, y: number, z: number, ry: number, c: string, w = 0.08, hh = 0.08) => {
    k.add(T, box(w, hh, 0.012), c, x, y, z, { r: [0, ry, 0.15] });
    for (let i = 0; i < 4; i++) k.add(T, box(0.014, 0.003, 0.004), '#e8dcc0', x + Math.cos(ry) * (-w / 2 + 0.01 + i * w / 4), y + hh / 2 + 0.003, z - Math.sin(ry) * (-w / 2 + i * w / 4) + 0.007, { r: [0, ry, 0.15], line: false });
  };
  patch(0.13 * W, 0.12, 0.155 * W, 0.6, '#9a7a4a');
  patch(-0.12 * W, 0.3, 0.16 * W, -0.55, '#55663f', 0.06, 0.07);
  patch(0.05, 0.22, -0.18 * W, Math.PI, '#8a4a3a', 0.1, 0.1);
  // rope belt with the goat bell, a sack of feed on a strap across the body
  k.add(T, tor(0.19 * B, 0.018, Math.PI * 2, 5, 18), '#b8a070', 0, 0.02, 0, { r: [Math.PI / 2, 0, 0], s: [1.05, 0.85, 1] });
  const bell = pivot(T, 0.08, 0.0, 0.17 * B); k.add(bell, cone(0.035, 0.055, 8), '#d8b050', 0, -0.04, 0); k.add(bell, sph(0.008, 6, 4), '#7a5a20', 0, -0.07, 0, { line: false });
  sway.add(bell, { freq: 2.5, damp: 0.25, gain: 0.05, wind: 0.05, bob: 0.3 });
  for (const z of [1, -1]) k.add(T, box(0.035, 0.5, 0.012), '#8a6a40', -0.02, 0.24, 0.165 * B * z, { r: [0, 0, -0.75] });
  const sack = pivot(T, -0.21 * B, 0.0, 0.02);
  k.add(sack, sph(0.11, 10, 8), '#b89a68', 0, -0.1, 0, { s: [0.75, 1.1, 0.9] });
  k.add(sack, cyl(0.035, 0.05, 0.05, 8), '#b89a68', 0, 0.0, 0);
  k.add(sack, tor(0.038, 0.008, Math.PI * 2, 3, 10), '#7a5a30', 0, 0.0, 0, { r: [Math.PI / 2, 0, 0], line: false });
  for (let i = 0; i < 3; i++) k.add(sack, box(0.003, 0.15, 0.004), '#9a7e50', -0.035 + i * 0.035, -0.11, 0.098, { line: false });
  sway.add(sack, { freq: 1.7, damp: 0.3, gain: 0.04, wind: 0.05, bob: 0.25, limit: 0.5 });
  arms(p, k, { B: B * 1.02, sleeve: shirt, fore: shirt, skin, rolled: true, hand: 1.08, foreR: 1.05 });
  neckHead(p, k, skin, (L.head ?? 1) * 1.08, 0.055);
  face(p, k, L, { skin, brow: L.hair, browW: 1.2, browT: 1.7, browTilt: 0.12, nose: 'long', noseC: '#cf9070', skull: [0.96, 1.1, 1.0], blush: '#e38f78' });
  // scruffy short beard and moustache along the jaw
  const bc = L.beard ?? '#8a6a4e';
  for (let i = 0; i < 9; i++) { const a = -1.3 + (i / 8) * 2.6; k.add(p.head, sph(0.045, 8, 6), bc, Math.sin(a) * 0.12, 0.075 + Math.abs(a) * 0.04, Math.cos(a) * 0.1 + 0.02, { s: [1, 0.9, 0.8] }); }
  k.add(p.head, sph(0.05, 8, 6), bc, 0, 0.04, 0.11, { s: [1.2, 0.9, 0.8] });
  for (const s of [-1, 1]) k.add(p.head, sph(0.04, 8, 6), bc, 0.04 * s, 0.12, 0.15, { s: [1.4, 0.5, 0.6], r: [0, 0, 0.35 * s] });
  // hair poking out under a knitted wool cap with a turned-up cuff and a bobble
  const h = p.hair;
  for (const s of [-1, 1]) k.add(h, sph(0.05, 8, 6), L.hair, 0.15 * s, 0.17, -0.04, { s: [0.6, 1.2, 1.2] });
  k.add(h, sph(0.08, 8, 6), L.hair, 0, 0.16, -0.13, { s: [1.3, 0.8, 0.6] });
  const capG = pivot(p.head, 0, 0.26, -0.015); capG.rotation.x = -0.18;
  k.add(capG, sph(0.178, 16, 10, ), capC, 0, 0.0, 0, { s: [1.04, 0.85, 1.06] });
  k.add(capG, tor(0.172, 0.03, Math.PI * 2, 6, 22), '#5e7640', 0, -0.03, 0, { r: [Math.PI / 2, 0, 0], s: [1.02, 1.04, 1] });
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; k.add(capG, box(0.006, 0.05, 0.006), '#5e7640', Math.sin(a) * 0.205, -0.03, Math.cos(a) * 0.2, { r: [0, a, 0], line: false }); }
  k.add(capG, tor(0.12, 0.012, Math.PI * 2, 4, 18), '#e8dcc0', 0, 0.085, 0, { r: [Math.PI / 2, 0, 0], line: false });
  const bob = pivot(capG, 0, 0.15, -0.01); k.add(bob, sph(0.055, 10, 8), '#e8dcc0', 0, 0.04, 0);
  sway.add(bob, { freq: 2.4, damp: 0.3, gain: 0.03, wind: 0.15, bob: -0.25, limit: 0.5 });
  // a shepherd's crook in the right hand
  const crook = new G.Group(); crook.position.set(0, -0.02, 0.03); p.arms[1].hand.add(crook); p.held.push(crook);
  k.add(crook, cyl(0.019, 0.022, 1.72, 7), '#8a6a44', 0, 0.12, 0, { flat: true });
  sway.stand(crook, 0.1, -0.12);
  k.add(crook, tor(0.08, 0.019, Math.PI * 1.25, 6, 14), '#8a6a44', 0.08, 0.98, 0, { r: [0, 0, -0.1] });
  k.add(crook, tor(0.024, 0.007, Math.PI * 2, 3, 8), '#5a3a22', 0, 0.86, 0, { r: [Math.PI / 2, 0, 0], line: false });
}

// ---------------------------------------------------------------- Tor, kite builder

function tor_(p: Person, k: Kit, L: PersonLook, sway: Sway) {
  const B = L.build ?? 0.9, skin = L.skin, jacket = L.coat ?? '#b04a30', apron = L.apron ?? '#c9b48a', leather = L.hatColor ?? '#8a5530';
  legs(p, k, { B, thigh: L.trousers, shin: skin, boot: L.boots, skin, sock: '#d8cfb8', pad: '#c8a070', bootS: 1.3, bootH: 0.16, cuff: L.trousers, cuffY: 0.02 });
  const T = p.torso;
  k.add(T, cap(0.18 * B, 0.2), jacket, 0, 0.27, 0, { s: [1, 1, 0.84] });
  k.add(T, sph(0.155 * B, 10, 8), L.trousers, 0, 0.02, 0, { s: [1.1, 0.75, 0.9] });
  k.add(T, folds(lathe([[0.12, 0.17], [0.2 * B, 0.15], [0.215 * B, 0.02], [0.2 * B, 0.0]], 16), 6, 0.06, 0.15, 0.0), jacket, 0, 0, 0, { s: [1, 1, 0.86], dbl: true });
  // the shirt collar and rolled sleeves of a jacket too big for him
  for (const s of [-1, 1]) k.add(T, tri([0, 0.5, 0.13], [0.11 * s, 0.47, 0.11], [0.03 * s, 0.39, 0.15]), L.top, 0, 0, 0, { dbl: true });
  // an apron far too big for him, every pocket full of tools
  k.add(T, box(0.24 * B, 0.2, 0.02), apron, 0, 0.3, 0.155 * B, { r: [-0.05, 0, 0] });
  for (const s of [-1, 1]) k.add(T, box(0.035, 0.3, 0.012), '#7a5a3a', 0.09 * s, 0.38, 0.0, { r: [0, 0, 0], s: [1, 1, 1] });
  for (const s of [-1, 1]) k.add(T, box(0.035, 0.012, 0.34), '#7a5a3a', 0.09 * s, 0.53, 0.0, { line: false });
  k.add(T, tor(0.2 * B, 0.014, Math.PI * 2, 4, 18), '#7a5a3a', 0, 0.12, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.86, 1] });
  k.add(T, sph(0.03, 6, 5), '#7a5a3a', 0, 0.12, -0.17 * B, { s: [1.6, 0.8, 0.6] });
  const ap = pivot(T, 0, 0.12, 0.0); p.coat = ap;
  k.add(ap, folds(new G.CylinderGeometry(0.22 * B, 0.3 * B, 0.66, 12, 1, true, -1.0, 2.0), 4, 0.05, 0.3, -0.3), apron, 0, -0.33, 0, { s: [1, 1, 0.82], dbl: true });
  k.add(ap, box(0.32 * B, 0.02, 0.012), '#b09a6e', 0, -0.62, 0.245 * B, { line: false });
  const tools = pivot(ap, 0, 0, 0);
  k.add(tools, box(0.2 * B, 0.1, 0.025), '#b09a6e', 0, -0.2, 0.215 * B);
  k.add(tools, box(0.002, 0.1, 0.03), '#8a7650', 0, -0.2, 0.217 * B, { line: false });
  k.add(tools, cyl(0.011, 0.011, 0.07, 6), '#c84030', -0.06, -0.12, 0.215 * B, { r: [0, 0, 0.15] });
  k.add(tools, cyl(0.004, 0.004, 0.05, 4), '#b8b8b8', -0.064, -0.065, 0.215 * B, { r: [0, 0, 0.15], line: false });
  k.add(tools, cyl(0.008, 0.008, 0.1, 6), '#e8c040', -0.02, -0.11, 0.218 * B, { r: [0, 0, -0.1] });
  k.add(tools, cone(0.008, 0.02, 6), '#3a3030', -0.025, -0.05, 0.218 * B, { r: [0, 0, -0.1], line: false });
  k.add(tools, box(0.02, 0.12, 0.006), '#d8b880', 0.04, -0.12, 0.22 * B, { r: [0, 0, 0.2] });
  k.add(tools, cyl(0.025, 0.025, 0.04, 10), '#b05030', 0.09, -0.13, 0.22 * B, { r: [Math.PI / 2, 0, 0] });
  k.add(tools, cyl(0.012, 0.012, 0.045, 8), '#e8dcc0', 0.09, -0.13, 0.225 * B, { r: [Math.PI / 2, 0, 0], line: false });
  k.add(tools, box(0.12, 0.08, 0.02), '#b09a6e', -0.08, -0.38, 0.25 * B, { r: [0, -0.3, 0] });
  k.add(tools, tor(0.02, 0.007, Math.PI * 1.6, 3, 8), '#8a8a8a', -0.06, -0.31, 0.25 * B);
  k.add(tools, box(0.008, 0.06, 0.008), '#8a8a8a', -0.06, -0.35, 0.25 * B, { line: false });
  k.add(tools, cyl(0.006, 0.006, 0.14, 4), '#d8c8a0', 0.02, -0.33, 0.25 * B, { r: [0, 0, -0.25] });
  sway.add(ap, { freq: 2.0, damp: 0.35, gain: 0.03, wind: 0.2, bob: 0.06, limit: 0.4 });
  arms(p, k, { B, sleeve: jacket, fore: jacket, skin, rolled: true, hand: 1.0 });
  neckHead(p, k, skin, (L.head ?? 1) * 1.12);
  face(p, k, L, { skin, brow: L.hair, browW: 0.95, browT: 1.3, browTilt: -0.1, nose: 'button', noseC: '#eeb092', ears: L.ears ?? 1.6, freckles: true, blush: '#f29a88' });
  // tufts under a leather flying cap with ear flaps, goggles pushed up
  const h = p.hair;
  for (let i = 0; i < 5; i++) k.add(h, sph(0.045, 8, 6), L.hair, -0.1 + i * 0.05, 0.25 - Math.abs(i - 2) * 0.01, 0.125, { s: [0.9, 1.4, 0.6], r: [0.3, 0, (i - 2) * 0.3] });
  for (const s of [-1, 1]) k.add(h, sph(0.05, 8, 6), L.hair, 0.16 * s, 0.24, -0.06, { s: [0.7, 1, 1.2] });
  const capG = pivot(p.head, 0, 0.24, -0.02);
  k.add(capG, sph(0.178, 16, 10), leather, 0, 0.0, 0, { s: [1.04, 0.82, 1.05] });
  for (let i = 0; i < 3; i++) k.add(capG, box(0.004, 0.006, 0.3), '#6a3e20', -0.06 + i * 0.06, 0.145, -0.02, { r: [0, 0, 0], s: [1, 1, 1], line: false });
  for (const s of [-1, 1]) {
    const flap = pivot(capG, 0.165 * s, -0.04, -0.01);
    k.add(flap, sph(0.06, 8, 6), leather, 0, -0.06, 0, { s: [0.45, 1.25, 0.95] });
    k.add(flap, tor(0.01, 0.003, Math.PI * 2, 3, 6), '#c8a060', 0.026 * s, -0.11, 0, { r: [0, Math.PI / 2, 0], line: false });
    sway.add(flap, { freq: 3, damp: 0.3, gain: 0.02, wind: 0.08, bob: 0.2, limit: 0.4 });
  }
  const gog = pivot(capG, 0, 0.09, 0.02); gog.rotation.x = -0.55;
  k.add(capG, tor(0.178, 0.012, Math.PI * 2, 4, 20), '#5a3a20', 0, 0.06, 0, { r: [Math.PI / 2 - 0.25, 0, 0], s: [1.04, 1.05, 1] });
  for (const s of [-1, 1]) {
    k.add(gog, tor(0.038, 0.013, Math.PI * 2, 6, 14), '#b8904a', 0.05 * s, 0.0, 0.165);
    k.add(gog, sph(0.036, 10, 6), '#bfe0e8', 0.05 * s, 0.0, 0.163, { s: [1, 1, 0.3], line: false });
    k.add(gog, sph(0.01, 6, 4), '#ffffff', 0.05 * s + 0.012, 0.012, 0.172, { line: false });
  }
  // a half-built kite: two spars, half its paper on, a tail of bows
  const kite = new G.Group(); kite.position.set(0, -0.06, 0.06); kite.rotation.set(0.2, 0.3, 0.1); p.arms[0].hand.add(kite); p.held.push(kite);
  const ks = pivot(kite, 0, 0.0, 0);
  const top = 0.66, cross = 0.48, wing = 0.2;
  k.add(ks, cyl(0.006, 0.006, top, 4), '#c8a070', 0, top / 2 - 0.02, 0);
  k.add(ks, cyl(0.006, 0.006, wing * 2, 4), '#c8a070', 0, cross, 0, { r: [0, 0, Math.PI / 2] });
  const paper = '#f2e6c8';
  k.add(ks, tri([0, top, 0.003], [-wing, cross, 0.003], [0, cross, 0.003]), paper, 0, 0, 0, { dbl: true });
  k.add(ks, tri([-wing, cross, 0.003], [0, -0.02, 0.003], [0, cross, 0.003]), paper, 0, 0, 0, { dbl: true });
  k.add(ks, tri([0, top, 0.003], [wing * 0.6, top - (top - cross) * 0.6, 0.003], [0, top - 0.06, 0.003]), '#e8d8b0', 0, 0, 0, { dbl: true });
  for (const [a, b] of [[[0, top], [-wing, cross]], [[-wing, cross], [0, -0.02]]] as [number, number][][]) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    k.add(ks, box(0.006, len, 0.006), '#a85a3a', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.004, { r: [0, 0, Math.atan2(-dx, dy)], line: false });
  }
  for (let i = 0; i < 4; i++) k.add(ks, box(0.004, 0.12, 0.002), '#c8b890', -0.06 - i * 0.03, cross + 0.02 + (i % 2) * 0.04, 0.005, { r: [0, 0, 0.6], line: false });
  let tp: THREE.Object3D = pivot(ks, 0, -0.02, 0);
  for (let i = 0; i < 3; i++) {
    const seg = pivot(tp, 0, i ? -0.09 : 0, 0);
    k.add(seg, cyl(0.002, 0.002, 0.09, 3), '#efe4c8', 0, -0.045, 0, { line: false });
    const c = ['#5a7ab0', '#d85a3a', '#e8b040'][i];
    k.add(seg, cone(0.022, 0.035, 3), c, -0.017, -0.085, 0, { r: [0, 0, Math.PI / 2], s: [1, 1, 0.3] });
    k.add(seg, cone(0.022, 0.035, 3), c, 0.017, -0.085, 0, { r: [0, 0, -Math.PI / 2], s: [1, 1, 0.3] });
    sway.add(seg, { freq: 2.4 + i * 0.3, damp: 0.25, gain: 0.03, wind: 0.5, bob: 0.2, limit: 0.8 });
    tp = seg;
  }
}

// ---------------------------------------------------------------- Nima, who names the clouds

function nima(p: Person, k: Kit, L: PersonLook, sway: Sway) {
  const B = L.build ?? 0.82, skin = L.skin, smock = L.coat ?? '#cfe0f0', cloud = '#fbf8f0', hair = L.hair;
  const sc = [L.scarf ?? '#d9735a', '#f0c27a'];
  legs(p, k, { B, thigh: L.trousers, shin: skin, boot: skin, skin, bare: true, cuff: L.trousers, cuffY: -0.03 });
  for (const lg of p.legs) k.add(lg.knee, cyl(0.086 * B, 0.084 * B, 0.08, 10), L.trousers, 0, 0.01, 0);
  const T = p.torso;
  k.add(T, cap(0.16 * B, 0.22), smock, 0, 0.27, 0, { s: [1, 1, 0.82] });
  // a loose smock printed with clouds
  const prof: [number, number][] = [[0.1, 0.5], [0.16 * B, 0.49], [0.2 * B, 0.4], [0.22 * B, 0.15], [0.27 * B, -0.12], [0.3 * B, -0.3], [0.295 * B, -0.31]];
  const sm = new G.Group(); T.add(sm); p.coat = sm;
  k.add(sm, folds(lathe(prof, 20), 7, 0.06, 0.2, -0.31, 2), smock, 0, 0, 0, { s: [1, 1, 0.9], dbl: true });
  k.add(sm, tor(0.3 * B, 0.012, Math.PI * 2, 4, 22), cloud, 0, -0.29, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.9, 1], line: false });
  const rAt = (y: number) => { for (let i = 1; i < prof.length; i++) if (y >= prof[i][1]) { const [r0, y0] = prof[i - 1], [r1, y1] = prof[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return prof[prof.length - 1][0]; };
  const spots: [number, number, number][] = [[0.4, 0.3, 1], [-0.6, 0.18, 0.8], [0.9, -0.05, 1.1], [-0.2, -0.18, 1], [0.15, 0.05, 0.7], [2.4, 0.2, 1], [3.1, -0.1, 1.1], [-2.5, 0.0, 0.9], [-1.4, -0.2, 1], [1.6, -0.22, 0.9], [-1.0, 0.3, 0.7]];
  for (const [a, y, s] of spots) {
    const r = rAt(y) * 1.02, x = Math.sin(a) * r, z = Math.cos(a) * r * 0.9;
    for (const [dx, dy, rr] of [[-0.02, 0, 0.022], [0.012, 0.008, 0.028], [0.038, -0.002, 0.02]] as V3[])
      k.add(sm, sph(rr * s, 8, 6), cloud, x + Math.cos(a) * dx * s, y + dy * s, z - Math.sin(a) * dx * s, { s: [1, 0.8, 0.35], r: [0, a, 0], line: false });
  }
  k.add(T, tor(0.11, 0.022, Math.PI * 2, 5, 16), cloud, 0, 0.49, 0.0, { r: [Math.PI / 2 + 0.2, 0, 0] });
  k.add(sm, box(0.09, 0.08, 0.015), '#b8cce0', 0.1, -0.05, 0.235 * B, { r: [0, 0.35, 0] });
  k.add(sm, cyl(0.006, 0.006, 0.09, 6), '#e8c040', 0.115, 0.0, 0.24 * B, { r: [0, 0, -0.2] });
  arms(p, k, { B, sleeve: '#efe4cc', fore: '#efe4cc', skin, cuff: cloud, puff: 1.15, hand: 0.92 });
  neckHead(p, k, skin, (L.head ?? 1) * 1.12);
  face(p, k, L, { skin, brow: hair, browW: 0.9, browT: 1.1, browTilt: -0.18, nose: 'button', noseC: '#c08668', lids: 0.82, lashes: true, blush: '#e48c7c' });
  // a long striped scarf: a thick wrap at the neck, one end down the front, one thrown back over the shoulder
  for (let i = 0; i < 2; i++) k.add(T, tor(0.105, 0.04, Math.PI * 2, 8, 16), sc[i], 0, 0.47 + i * 0.05, 0.0, { r: [Math.PI / 2 + 0.15 - i * 0.25, 0, 0.1 * (i ? 1 : -1)] });
  const chain = (x: number, y: number, z: number, n: number, rx: number, front: boolean) => {
    let par: THREE.Object3D = pivot(T, x, y, z); par.rotation.x = rx;
    for (let i = 0; i < n; i++) {
      const seg = pivot(par, 0, i ? -0.1 : 0, 0);
      k.add(seg, box(0.1, 0.105, 0.025), sc[i % 2], 0, -0.05, 0);
      if (i === n - 1) for (let j = 0; j < 4; j++) k.add(seg, box(0.008, 0.04, 0.008), sc[0], -0.036 + j * 0.024, -0.12, 0, { line: false });
      sway.add(seg, { freq: 1.3 + i * 0.12, damp: 0.3, gain: front ? 0.025 : 0.04, wind: front ? 0.2 : 0.45, bob: front ? 0.05 : 0.12, limit: 0.9 });
      par = seg;
    }
  };
  chain(-0.06, 0.44, 0.15, 6, -0.12, true);
  chain(0.1, 0.5, -0.1, 6, 0.35, false);
  // dark curls with two big puffs on top that bounce as she walks
  const h = p.hair;
  k.add(h, sph(0.172, 14, 10), hair, 0, 0.23, -0.03, { s: [1.06, 0.82, 1.06] });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; if (Math.cos(a) > 0.6) continue; k.add(h, sph(0.05, 8, 6), hair, Math.sin(a) * 0.165, 0.19 + (i % 2) * 0.04, Math.cos(a) * 0.16 - 0.03); }
  for (let i = 0; i < 5; i++) k.add(h, sph(0.04, 8, 6), hair, -0.1 + i * 0.05, 0.28 - Math.abs(i - 2) * 0.01, 0.12, { s: [1.1, 0.9, 0.8] });
  for (const s of [-1, 1]) {
    const puff = pivot(h, 0.11 * s, 0.33, -0.02); puff.rotation.z = -0.35 * s;
    k.add(puff, sph(0.085, 12, 9), hair, 0, 0.07, 0);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; k.add(puff, sph(0.042, 8, 6), hair, Math.sin(a) * 0.07, 0.07 + Math.cos(a) * 0.065, Math.cos(a * 2) * 0.03); }
    k.add(puff, tor(0.04, 0.012, Math.PI * 2, 4, 10), sc[0], 0, 0.0, 0, { r: [Math.PI / 2, 0, 0], line: false });
    sway.add(puff, { freq: 2.6, damp: 0.25, gain: 0.03, wind: 0.08, bob: -0.18, limit: 0.4 });
  }
  k.add(p.head, cyl(0.006, 0.006, 0.12, 6), '#e8c040', 0.175, 0.2, 0.0, { r: [0.3, 0, 1.2] });
  // notebook in the left hand, pencil in the right
  const nb = new G.Group(); nb.position.set(0, -0.06, 0.05); nb.rotation.set(0.3, 0.35, 0.1); p.arms[0].hand.add(nb); p.held.push(nb);
  k.add(nb, box(0.14, 0.18, 0.025), '#5a7ab0');
  k.add(nb, box(0.13, 0.17, 0.02), '#f2ead6', 0.004, 0, 0.004, { line: false });
  for (const [dx, dy, rr] of [[-0.02, 0, 0.022], [0.012, 0.008, 0.028], [0.038, -0.002, 0.02]] as V3[]) k.add(nb, sph(rr * 0.8, 8, 6), cloud, dx - 0.01, 0.02 + dy, -0.013, { s: [1, 0.8, 0.2], line: false });
  const pen = new G.Group(); pen.position.set(0, -0.05, 0.04); pen.rotation.set(0.6, 0, 0.3); p.arms[1].hand.add(pen); p.held.push(pen);
  k.add(pen, cyl(0.007, 0.007, 0.12, 6), '#e8c040'); k.add(pen, cone(0.007, 0.02, 6), '#3a3030', 0, -0.07, 0, { r: [Math.PI, 0, 0], line: false });
}

const BUILD: Record<VillagerKind, (p: Person, k: Kit, L: PersonLook, s: Sway) => void> = { ysolde, odo, bram, tor: tor_, nima };

/** Build a villager into a Person: fills the same joints the shared animation drives. */
export function buildVillager(p: Person, look: PersonLook) {
  const k = new Kit(), sway = new Sway();
  p.hips.add(p.torso);
  BUILD[look.villager!](p, k, look, sway);
  anchors(p);
  k.bake();
  sway.ref = p.root;
  p.sway = sway;
}
