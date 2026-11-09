import * as THREE from 'three';
import { Kit, T, rng, pick, CELL, cellUV, wobble, type Rnd } from './sailtownKit';

/**
 * Sailtown's greenery built into a Kit: leaf masses (cards hugging a dark core, so a bush reads as one soft mass
 * with a clean outer edge instead of a smear of cards), hydrangea bushes with domed heads of four-petal florets,
 * rambling roses, ivy, trees and hedges. Everything here merges into the prop it belongs to.
 */

type V3 = THREE.Vector3;
const UP = new THREE.Vector3(0, 1, 0);

/** Push one card quad (centre c, half extents a/b, normal n) into flat arrays, mapped to an atlas cell or 0..1. */
function pushCard(A: CardArrays, c: V3, a: V3, b: V3, n: V3, col: THREE.Color, cell: number | null, nTilt = 0.3) {
  const [u0, v0, u1, v1] = cell == null ? [0, 0, 1, 1] : cellUV(cell);
  const base = A.pos.length / 3;
  for (const [su, sv, u, v] of [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]] as const) {
    const x = c.x + a.x * su + b.x * sv, y = c.y + a.y * su + b.y * sv, z = c.z + a.z * su + b.z * sv;
    A.pos.push(x, y, z);
    // corner normals splay out a little from the card's own, so the mass shades round
    const nn = new THREE.Vector3(a.x * su + b.x * sv, a.y * su + b.y * sv, a.z * su + b.z * sv).normalize().multiplyScalar(nTilt).add(n).normalize();
    A.nor.push(nn.x, nn.y, nn.z);
    A.uv.push(u, v);
    A.col.push(col.r, col.g, col.b);
  }
  A.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
interface CardArrays { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[] }
const arrays = (): CardArrays => ({ pos: [], nor: [], uv: [], col: [], idx: [] });
function toGeo(A: CardArrays) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(A.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(A.col, 3));
  g.setIndex(A.idx);
  return g;
}
/** Two tangents of a normal, spun by `spin`, scaled to half extents. */
function tangents(n: V3, spin: number, hw: number, hh = hw): [V3, V3] {
  const ref = Math.abs(n.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : UP;
  const t1 = new THREE.Vector3().crossVectors(ref, n).normalize(), t2 = new THREE.Vector3().crossVectors(n, t1);
  const a = t1.clone().multiplyScalar(Math.cos(spin)).addScaledVector(t2, Math.sin(spin)).multiplyScalar(hw);
  const b = t2.clone().multiplyScalar(Math.cos(spin)).addScaledVector(t1, -Math.sin(spin)).multiplyScalar(hh);
  return [a, b];
}
/** A matrix placing local +Z along `n` at `p` (for things laid on a wall). */
export function onNormal(p: V3, n: V3): THREE.Matrix4 {
  const z = n.clone().normalize();
  const x = new THREE.Vector3().crossVectors(UP, z); if (x.lengthSq() < 1e-6) x.set(1, 0, 0); x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(p);
}

// ---------------------------------------------------------------- leaf mass

export interface LeafMassOpts {
  radius: number;
  /** Vertical squash of the mass (1 = round). */
  squash?: number;
  /** Squash along local Z (for masses pressed against a wall: 0.4-0.6). */
  flat?: number;
  color: THREE.ColorRepresentation;
  /** Number of cards (default from the size). */
  cards?: number;
  /** Card size (m); default 0.6 x radius. */
  size?: number;
  /** An atlas cell for the cards (ivy, leafy, leafBig); default the shared leaf-spray sheet. */
  cell?: number;
  /** The dark core: true by default. Its value relative to the leaves (default 0.5). */
  core?: boolean;
  ao?: number;
}

/**
 * A mass of leaves: cards laid over the surface of a squashed ball, lit from the top and darker underneath and in
 * the core. The cards hug the core, so the finish pass only inks the outer silhouette.
 */
export function addLeafMass(kit: Kit, m: THREE.Matrix4, r: Rnd, o: LeafMassOpts) {
  const R = o.radius, sq = o.squash ?? 0.8, fl = o.flat ?? 1;
  const n = o.cards ?? Math.max(10, Math.min(80, Math.round(12 + R * R * 110)));
  const base = new THREE.Color(o.color);
  const A = arrays();
  for (let i = 0; i < n; i++) {
    const dir = new THREE.Vector3(r() * 2 - 1, r() * 1.7 - 0.6, r() * 2 - 1);
    if (fl < 1) dir.z = Math.abs(dir.z) * 0.8 + 0.2;   // a wall mass shows its front
    dir.normalize();
    const c = dir.clone().multiplyScalar(R * (0.8 + r() * 0.2)); c.y *= sq; c.z *= fl;
    const size = (o.size ?? R * 0.6) * (0.75 + r() * 0.5);
    const nrm = dir.clone(); nrm.y /= sq; if (fl < 1) nrm.z /= Math.max(0.3, fl); nrm.normalize();
    // the card's plane is tipped off the surface at random (its shading normal stays the mass's), so on the outline
    // cards show their face instead of standing edge-on as flat flakes
    const pn = nrm.clone().add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(1.3)).normalize();
    const [a, b] = tangents(pn, r() * Math.PI * 2, size / 2);
    // light from above, shade beneath and toward the back; a little jitter per card
    const k = (0.6 + 0.5 * (dir.y * 0.5 + 0.5)) * (0.9 + r() * 0.2) * (fl < 1 ? 0.85 + 0.15 * dir.z : 1);
    const col = base.clone().multiplyScalar(k);
    if (r() < 0.12) col.lerp(new THREE.Color('#b8c86a'), 0.18);   // a few young, yellower leaves
    pushCard(A, c, a, b, nrm, col, o.cell ?? null);
  }
  kit.add(toGeo(A), o.cell == null ? 'leaf' : 'flora', null, m);
  if (o.core !== false) {
    const core = wobble(new THREE.IcosahedronGeometry(R * 0.78, 1), R * 0.07, 3 / R, Math.floor(r() * 99));
    kit.add(core, 'core', base.clone().multiplyScalar(o.ao ?? 0.5), m.clone().multiply(T(0, 0, 0, 0, 0, 0, 1, sq, fl)));
  }
}

// ---------------------------------------------------------------- hydrangea

export const HYDRANGEA = {
  blue: ['#7d9ce8', '#8fa6f0', '#6f8ee0', '#a3b6f4', '#9d92e6'],
  violet: ['#a58fe4', '#b9a2ee', '#9585dc', '#c2a8ec', '#8f9ae8'],
  pink: ['#f2a8c8', '#ea94bc', '#f6c0d6', '#e7a0d0', '#d99ad8'],
};

/**
 * A hydrangea head: a domed core under 40-80 four-petal floret cards, coloured across a family (blue into violet into
 * a touch of pink) and lighter on top. Origin at the head's centre.
 */
export function addHydrangeaHead(kit: Kit, m: THREE.Matrix4, r: Rnd, hr: number, palette: readonly string[]) {
  const pal = palette.map(c => new THREE.Color(c));
  kit.add(new THREE.SphereGeometry(hr * 0.86, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), 'core', pal[0].clone().multiplyScalar(0.5), m);
  const n = Math.round(Math.max(40, Math.min(80, 60 * (hr / 0.14) ** 2)));
  const A = arrays();
  const tilt = new THREE.Vector3(r() - 0.5, 0, r() - 0.5).multiplyScalar(0.6);
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 1.55, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996 + r() * 0.3;
    const nrm = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize();
    const c = nrm.clone().multiplyScalar(hr * (0.9 + r() * 0.14));
    // colour drifts across the head; value falls from the sunny top to the underside
    const t = 0.5 + 0.5 * Math.sin(nrm.x * 2.1 + tilt.x * 5 + nrm.z * 1.7);
    const col = pal[Math.floor(t * (pal.length - 1) + r() * 1.2) % pal.length].clone();
    col.multiplyScalar((0.72 + 0.34 * (y * 0.5 + 0.5)) * (0.92 + r() * 0.14));
    if (r() < 0.1) col.lerp(new THREE.Color('#ffffff'), 0.3);
    const [ta, tb] = tangents(nrm, r() * 6.28, hr * (0.24 + r() * 0.07));
    pushCard(A, c, ta, tb, nrm.clone().lerp(UP, 0.25).normalize(), col, CELL.floret, 0.15);
  }
  kit.add(toGeo(A), 'flora', null, m);
}

export interface HydrangeaOpts { radius?: number; heads?: number; palette?: readonly string[] }
/**
 * A hydrangea bush: a mound of large serrated leaves with 4-8 heads sitting in its top. Origin at the ground.
 */
export function addHydrangeaBush(kit: Kit, m: THREE.Matrix4, r: Rnd, o: HydrangeaOpts = {}) {
  const R = o.radius ?? 0.45, pal = o.palette ?? HYDRANGEA.blue;
  addLeafMass(kit, m.clone().multiply(T(0, R * 0.62, 0)), r, { radius: R, squash: 0.72, color: '#4f8a3e', cell: CELL.leafBig, size: 0.2, cards: Math.round(30 + R * R * 120), ao: 0.42 });
  const nH = o.heads ?? Math.round(4 + R * 6);
  for (let i = 0; i < nH; i++) {
    const a = (i / nH) * Math.PI * 2 + r() * 0.6, up = 0.35 + r() * 0.55;
    const d = Math.cos(up) * R * 0.78, hy = R * 0.62 + Math.sin(up) * R * 0.72 * 0.72 + 0.04;
    const hr = (0.11 + r() * 0.05) * Math.min(1.25, R / 0.45 + 0.2);
    addHydrangeaHead(kit, m.clone().multiply(T(Math.cos(a) * d, hy, Math.sin(a) * d, (r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5)), r, hr, pal);
  }
}

// ---------------------------------------------------------------- roses and ivy

export const ROSES = ['#f07aa0', '#e8506e', '#f6a6c0', '#d63c58', '#f48fb0'];

/** A point on a wall for climbers: position, outward normal, and a size factor. */
export interface WallPoint { p: V3; n: V3; s?: number }

/**
 * Rambling roses along a run of wall points: clumped leaf masses pressed to the wall with dark interiors, and many
 * small layered blooms in two or three pinks and reds, with buds. Each cluster has its own leading colour.
 */
export function addRoses(kit: Kit, pts: WallPoint[], r: Rnd, o: { palette?: readonly string[]; blooms?: number; leaves?: boolean } = {}) {
  const pal = (o.palette ?? ROSES).map(c => new THREE.Color(c));
  const A = arrays();
  for (const w of pts) {
    const s = w.s ?? 1;
    const m = onNormal(w.p, w.n);
    if (o.leaves !== false) addLeafMass(kit, m.clone().multiply(T(0, 0, 0.05 * s, 0, 0, r() * 6)).multiply(T(0, 0, 0, 0, 0, 0, 1.25, 1, 1)), r, { radius: (0.17 + r() * 0.08) * s, flat: 0.38, squash: 0.85, color: pick(r, ['#5a8a40', '#62904a', '#548240']), size: 0.13 * s, ao: 0.5 });
    const lead = pal[Math.floor(r() * pal.length)];
    const nb = Math.round((o.blooms ?? 7) * s * (0.7 + r() * 0.6));
    for (let i = 0; i < nb; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * 0.24 * s;
      const local = new THREE.Vector3(Math.cos(a) * d, Math.sin(a) * d * 0.9, (0.13 + r() * 0.06) * s);
      const p = local.applyMatrix4(m);
      const nrm = w.n.clone().add(new THREE.Vector3(r() - 0.5, r() * 0.5, r() - 0.5).multiplyScalar(0.7)).normalize();
      const col = (r() < 0.7 ? lead : pick(r, pal)).clone().multiplyScalar(0.88 + r() * 0.2);
      const bud = r() < 0.2;
      const [ta, tb] = tangents(nrm, r() * 6.28, (bud ? 0.022 : 0.04 + r() * 0.018) * s);
      pushCard(A, p, ta, tb, nrm.clone().lerp(UP, 0.3).normalize(), bud ? col.clone().multiplyScalar(0.8) : col, CELL.rose, 0.2);
    }
  }
  if (A.pos.length) kit.add(toGeo(A), 'flora', null);
}

/** Ivy: small lobed leaves laid close against the wall along a run of points (a climbing stem). */
export function addIvy(kit: Kit, pts: WallPoint[], r: Rnd, o: { colors?: readonly string[]; perPoint?: number; spread?: number } = {}) {
  const cols = (o.colors ?? ['#3f6b35', '#4a7a3c', '#365f30', '#56843f']).map(c => new THREE.Color(c));
  const A = arrays();
  const sp = o.spread ?? 1;
  for (const w of pts) {
    const s = w.s ?? 1, m = onNormal(w.p, w.n);
    const n = Math.round((o.perPoint ?? 4) * (0.7 + r() * 0.6));
    for (let i = 0; i < n; i++) {
      const p = new THREE.Vector3((r() - 0.5) * 0.32 * s * sp, (r() - 0.5) * 0.3 * s, 0.02 + r() * 0.05).applyMatrix4(m);
      const nrm = w.n.clone().add(new THREE.Vector3(r() - 0.5, r() - 0.3, r() - 0.5).multiplyScalar(0.5)).normalize();
      const [ta, tb] = tangents(nrm, r() * 6.28, (0.09 + r() * 0.05) * s);
      pushCard(A, p, ta, tb, nrm, pick(r, cols).clone().multiplyScalar(0.85 + r() * 0.3), CELL.ivy, 0.2);
    }
  }
  if (A.pos.length) kit.add(toGeo(A), 'flora', null);
}

/**
 * A climbing run of wall points from a root upward with a wander, for ivy or roses. `at(a, y)` turns an angle (or
 * any wall coordinate) and a height into a point and outward normal.
 */
export function climbPath(r: Rnd, a0: number, y0: number, y1: number, step: number, wander: number, at: (a: number, y: number) => WallPoint): WallPoint[] {
  const out: WallPoint[] = [];
  let a = a0;
  for (let y = y0; y < y1; y += step * (0.8 + r() * 0.4)) { a += (r() - 0.5) * wander; out.push(at(a, y)); }
  return out;
}

// ---------------------------------------------------------------- trees and hedges

export interface TreeOpts { seed?: number; height?: number; spread?: number; colors?: readonly string[]; masses?: number }

/**
 * A broadleaf village tree: a leaning trunk that forks into a few limbs, each carrying a cluster of leaf masses, so
 * the crown is irregular and lumpy (lit lobes, shaded pockets) rather than one ball. Origin at the root.
 */
export function townTree(o: TreeOpts = {}): THREE.Group {
  const seed = o.seed ?? 1, r = rng(seed * 17 + 3);
  const H = o.height ?? 6, S = o.spread ?? H * 0.42;
  const cols = o.colors ?? ['#6a9a48', '#76a450', '#5e8e42', '#83ad58', '#5a8840'];
  const kit = new Kit();
  const bark = new THREE.Color('#7a5c42');
  const limb = (a: V3, b: V3, r0: number, r1: number) => {
    const d = b.clone().sub(a), len = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, 7, 2).translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
    kit.add(g, 'wood', bark.clone().multiplyScalar(0.85 + r() * 0.25), new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1)));
  };
  const lean = new THREE.Vector3((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5);
  const fork = new THREE.Vector3(lean.x, H * 0.45, lean.z);
  limb(new THREE.Vector3(0, -0.1, 0), fork, H * 0.05, H * 0.036);
  // root flare
  kit.add(new THREE.ConeGeometry(H * 0.085, H * 0.12, 7), 'wood', bark.clone().multiplyScalar(0.8), T(0, H * 0.05, 0));
  const nL = 3 + Math.floor(r() * 2);
  const tips: V3[] = [];
  for (let i = 0; i < nL; i++) {
    const a = (i / nL) * Math.PI * 2 + r() * 0.8, out = S * (0.45 + r() * 0.35);
    const tip = new THREE.Vector3(fork.x + Math.cos(a) * out, H * (0.68 + r() * 0.16), fork.z + Math.sin(a) * out);
    limb(fork, tip, H * 0.03, H * 0.014);
    tips.push(tip);
  }
  tips.push(new THREE.Vector3(fork.x, H * 0.86, fork.z));
  // the crown: masses round each limb tip, bigger at the top, a skirt of smaller ones below
  const nM = o.masses ?? 11;
  for (let i = 0; i < nM; i++) {
    const t = tips[i % tips.length];
    const rad = S * (0.42 + r() * 0.2) * (i < tips.length ? 1 : 0.8);
    const p = t.clone().add(new THREE.Vector3((r() - 0.5) * S * 0.6, (r() - 0.3) * S * 0.35, (r() - 0.5) * S * 0.6));
    const low = p.y < H * 0.72;
    addLeafMass(kit, T(p.x, p.y, p.z, 0, r() * 6, 0), r, { radius: rad, squash: 0.78, color: new THREE.Color(pick(r, cols)).multiplyScalar(low ? 0.86 : 1), size: rad * 0.42, cards: Math.round(50 + rad * rad * 55), ao: 0.5 });
  }
  const g = new THREE.Group(); g.name = 'townTree';
  kit.build(g, { inkWidth: 0.02 });
  g.userData.tris = kit.tris;
  return g;
}

/**
 * A clipped hedge `length` metres along +X: a row of overlapping leaf masses with a flattened top, optionally
 * starred with small white or pink blossom. Origin at the start, on the ground.
 */
export function hedge(length = 3, o: { seed?: number; height?: number; depth?: number; color?: string; blossom?: string | null } = {}): THREE.Group {
  const r = rng((o.seed ?? 2) * 7 + 1);
  const H = o.height ?? 0.9, D = o.depth ?? 0.7;
  const kit = new Kit();
  const n = Math.max(2, Math.round(length / (H * 0.55)));
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * (length / n) + (r() - 0.5) * 0.1;
    addLeafMass(kit, T(x, H * 0.52, (r() - 0.5) * 0.08, 0, r() * 6, 0, 1, 1, D / H), r, { radius: H * 0.56, squash: 0.92, color: new THREE.Color(o.color ?? '#5a8a42').multiplyScalar(0.9 + r() * 0.18), size: H * 0.28, ao: 0.42 });
  }
  if (o.blossom) {
    const A = arrays(), bc = new THREE.Color(o.blossom);
    for (let i = 0; i < length * 14; i++) {
      const p = new THREE.Vector3(r() * length, H * (0.45 + r() * 0.6), (r() - 0.5) * D * 1.05);
      const nrm = new THREE.Vector3(0, 0.6, p.z).normalize();
      const [ta, tb] = tangents(nrm, r() * 6, 0.025 + r() * 0.015);
      pushCard(A, p, ta, tb, nrm, bc.clone().multiplyScalar(0.9 + r() * 0.15), CELL.alyssum, 0.2);
    }
    kit.add(toGeo(A), 'flora', null);
  }
  const g = new THREE.Group(); g.name = 'hedge';
  kit.build(g, { outline: false });
  return g;
}
