import * as THREE from 'three';
import { Kit, T, boxM, ropeGeo, sagLine, clothGrid, WOOD_TILE, STONE_TILE, WALL_TILE, CELL as FC, cellUV as fUV } from '../skyIsles/sailtownKit';
import { townRng, pickOf } from './rand';

// Mossrest's building blocks: the palette (honey and cream timber, warm stone, moss greens, white linen), walls
// with doors and windows cut in them, windows, shingles, and the small things that make the village lived in:
// barrels, tubs of vegetables, benches, flower boxes, crates, lanterns, rope ladders, laundry and bunting.
// Everything goes into a sailtownKit Kit, so a whole village merges into one mesh per material.

export const PAL = {
  timber: ['#c99a5b', '#bd8d50', '#d4a868', '#b08048'],
  timberDark: ['#8d6239', '#7d5633', '#946a40'],
  timberPale: ['#e0c290', '#d8b882', '#e6caa0'],
  plaster: ['#f1e5c8', '#f4ead2', '#ebdcb8', '#efe0c0'],
  stone: ['#cbb791', '#c1af8d', '#d4c29e', '#b9a581', '#c6b088'],
  shingle: ['#a8774a', '#9b6b42', '#b48552', '#8f6542', '#a5733f', '#b98d5a'],
  door: ['#7a5232', '#8a5e38', '#6e8a5a', '#5f7f9a', '#9a6a3c'],
  shutter: ['#6f9a6a', '#c9a24c', '#7c9fbf', '#b9694a', '#8aa86a'],
  linen: ['#f8f4ea', '#fffaf0', '#efe8d8', '#f4ecdc', '#f6efe2'],
  bunting: ['#f4eee0', '#e9c46a', '#d98c6a', '#8fb3c9', '#a7c47c', '#fbf6ea', '#e6a3a0'],
  iron: '#3d3833',
  leaf: ['#5e8c3c', '#6e9a42', '#80a64a', '#4f7c36', '#93b354'],
};

export const rnd = townRng;
export type R = () => number;
export const pk = pickOf;

/** A box of w x h x d (texture tile in metres) whose bottom sits at y = 0, centred in x and z. */
export function slab(w: number, h: number, d: number, tile = WOOD_TILE, alongY = false) {
  return boxM(w, h, d, tile, alongY).translate(0, h / 2, 0);
}

/** Scale every UV of a geometry by 1/tile (for shapes whose UVs are already in metres). */
function tileUV(g: THREE.BufferGeometry, tile: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
  return g;
}

export interface Opening { kind: 'door' | 'rect' | 'round'; x: number; y: number; w: number; h: number }

/**
 * A wall panel L long, H high and t thick, standing on y = 0 along x, centred (its faces at z = +-t/2), with doors
 * (arched, cut up from the bottom edge) and rectangular or round windows cut through it.
 */
export function wallPanel(L: number, H: number, t: number, open: Opening[], tile = STONE_TILE) {
  const s = new THREE.Shape();
  s.moveTo(-L / 2, 0);
  for (const d of open.filter(o => o.kind === 'door').sort((a, b) => a.x - b.x)) {
    const r = d.w / 2;
    s.lineTo(d.x - r, 0); s.lineTo(d.x - r, d.h - r);
    for (let i = 1; i < 10; i++) { const a = Math.PI - (i / 10) * Math.PI; s.lineTo(d.x + Math.cos(a) * r, d.h - r + Math.sin(a) * r); }
    s.lineTo(d.x + r, d.h - r); s.lineTo(d.x + r, 0);
  }
  s.lineTo(L / 2, 0); s.lineTo(L / 2, H); s.lineTo(-L / 2, H);
  for (const o of open) {
    if (o.kind === 'rect') {
      const p = new THREE.Path();
      p.moveTo(o.x - o.w / 2, o.y); p.lineTo(o.x - o.w / 2, o.y + o.h); p.lineTo(o.x + o.w / 2, o.y + o.h); p.lineTo(o.x + o.w / 2, o.y);
      s.holes.push(p);
    } else if (o.kind === 'round') {
      const p = new THREE.Path();
      const n = 18;
      for (let i = 0; i < n; i++) { const a = -(i / n) * Math.PI * 2; const x = o.x + Math.cos(a) * o.w / 2, y = o.y + Math.sin(a) * o.w / 2; if (i) p.lineTo(x, y); else p.moveTo(x, y); }
      s.holes.push(p);
    }
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -t / 2);
  return tileUV(g, tile);
}

/** A window set in a wall opening (local: the wall's outer face at z = 0, +z out). Glazed or open to look out of. */
export function windowIn(kit: Kit, o: Opening, r: R, opts: { glass?: boolean; shutters?: boolean; box?: boolean; depth?: number } = {}) {
  const frameC = pk(r, PAL.timberDark), dep = opts.depth ?? 0.4;
  if (o.kind === 'round') {
    const R0 = o.w / 2;
    kit.add(new THREE.TorusGeometry(R0 + 0.04, 0.085, 6, 22), 'wood', frameC, T(o.x, o.y, 0.03));
    // the reveal: a short tube through the wall
    kit.add(new THREE.CylinderGeometry(R0, R0, dep, 18, 1, true), 'wood', pk(r, PAL.timber), T(o.x, o.y, -dep / 2 + 0.02, Math.PI / 2));
    kit.add(boxM(0.06, o.w, 0.06, WOOD_TILE), 'wood', frameC, T(o.x, o.y, 0.0));
    kit.add(boxM(o.w, 0.06, 0.06, WOOD_TILE), 'wood', frameC, T(o.x, o.y, 0.0));
    if (opts.glass) kit.add(new THREE.CircleGeometry(R0, 18), 'glass', '#6f8f9a', T(o.x, o.y, -0.05));
    if (opts.box) flowerBox(kit, T(o.x, o.y - R0 - 0.12, 0.12), Math.max(0.9, o.w * 1.1), r);
    return;
  }
  const { x, y, w, h } = o;
  const fw = 0.1;
  for (const [cx, cy, bw, bh] of [[x - w / 2 - fw / 2, y + h / 2, fw, h + fw * 2], [x + w / 2 + fw / 2, y + h / 2, fw, h + fw * 2], [x, y + h + fw / 2, w, fw]] as const) kit.add(boxM(bw, bh, 0.12, WOOD_TILE), 'wood', frameC, T(cx, cy, 0.03));
  // a deep sill
  kit.add(boxM(w + 0.3, 0.09, 0.26, WOOD_TILE), 'wood', frameC, T(x, y - 0.04, 0.08));
  kit.add(boxM(w, 0.06, dep, WOOD_TILE), 'wood', pk(r, PAL.timber), T(x, y - 0.03, -dep / 2));
  kit.add(boxM(0.06, h, 0.05, WOOD_TILE), 'wood', frameC, T(x, y + h / 2, 0));
  kit.add(boxM(w, 0.05, 0.05, WOOD_TILE), 'wood', frameC, T(x, y + h * 0.55, 0));
  if (opts.glass) kit.add(new THREE.PlaneGeometry(w, h), 'glass', '#6f8f9a', T(x, y + h / 2, -0.06));
  if (opts.shutters) {
    const sc = pk(r, PAL.shutter);
    for (const sd of [-1, 1]) {
      kit.add(boxM(w * 0.5, h, 0.05, WOOD_TILE, true), 'wood', sc, T(x + sd * (w / 2 + w * 0.27 + 0.06), y + h / 2, 0.08, 0, sd * 0.25, 0));
      kit.add(boxM(w * 0.5, 0.05, 0.07, WOOD_TILE), 'wood', shade(sc, 0.8), T(x + sd * (w / 2 + w * 0.27 + 0.06), y + h * 0.3, 0.11, 0, sd * 0.25, 0));
    }
  }
  if (opts.box) flowerBox(kit, T(x, y - 0.1, 0.2), w + 0.25, r);
}

const shade = (c: string, k: number) => new THREE.Color(c).multiplyScalar(k);

/** Flora cards: a quad (centre, half axes) on one cell of Sailtown's flora atlas. */
export function card(kit: Kit, cell: number, color: THREE.ColorRepresentation, m: THREE.Matrix4, w: number, h: number, kind: 'flora' | 'leaf' = 'flora') {
  const g = new THREE.PlaneGeometry(w, h);
  if (kind === 'flora') {
    const [u0, v0, u1, v1] = fUV(cell);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
  }
  g.translate(0, h / 2, 0);
  kit.add(g, kind, color, m);
}
const LEAFC = ['#5e8c3c', '#6e9a42', '#7ea64a', '#557f36', '#8bb352'];
const BLOOMC = ['#fbf6ea', '#ffffff', '#f6d9e2', '#e9a3b4', '#f2cf5a', '#c9b6e8', '#e8875f', '#f4e3a0'];
/** One flower head: five round petals round a little yellow eye, facing along local +y. */
function blossom(kit: Kit, m: THREE.Matrix4, s: number, c: THREE.ColorRepresentation) {
  const g = new THREE.CircleGeometry(s, 10).rotateX(-Math.PI / 2);
  // scallop the rim into five petals and cup the head a little
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 1; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const a = Math.atan2(z, x); const k = 0.72 + 0.28 * Math.abs(Math.cos(a * 2.5)); p.setXYZ(i, x * k, s * 0.25 * k, z * k); }
  g.computeVertexNormals();
  kit.add(g, 'bloom', c, m);
  kit.push(m);
  kit.add(new THREE.SphereGeometry(s * 0.28, 5, 3), 'bloom', '#e0b13a', T(0, s * 0.08, 0));
  kit.pop();
}
/** A little bunch of flowers: a soft mound of leaves with round flower heads nodding out of it (local y up). */
export function posy(kit: Kit, m: THREE.Matrix4, size: number, r: R, _cells?: number[]) {
  kit.push(m);
  const nl = 2 + Math.floor(r() * 2);
  for (let k = 0; k < nl; k++) {
    const a = r() * Math.PI * 2, d = size * 0.18 * r();
    const rr = size * (0.24 + r() * 0.1);
    kit.add(new THREE.SphereGeometry(rr, 7, 5).scale(1, 0.72, 1), 'plain', new THREE.Color(pk(r, LEAFC)).multiplyScalar(0.9 + r() * 0.2), T(Math.cos(a) * d, rr * 0.55, Math.sin(a) * d));
  }
  const c1 = pk(r, BLOOMC), c2 = pk(r, BLOOMC);
  const nb = 5 + Math.floor(r() * 4);
  for (let k = 0; k < nb; k++) {
    const a = r() * Math.PI * 2, el = 0.35 + r() * 0.9;
    const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    const at = dir.clone().multiplyScalar(size * 0.36).add(new THREE.Vector3(0, size * 0.2, 0));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    blossom(kit, new THREE.Matrix4().compose(at, q, new THREE.Vector3(1, 1, 1)), size * (0.08 + r() * 0.04), k % 3 === 2 ? c2 : c1);
  }
  kit.pop();
}

/** A soft round mass of leaves round a dark core (the crown of a tree or a bush), centred at c. */
export function crown(kit: Kit, c: THREE.Vector3, rad: number, leafC: THREE.Color, r: R, squash = 0.8) {
  kit.add(new THREE.IcosahedronGeometry(rad * 0.74, 1).scale(1, squash, 1), 'core', leafC.clone().multiplyScalar(0.55), T(c.x, c.y, c.z));
  const n = Math.round(10 + rad * 9);
  for (let i = 0; i < n; i++) {
    const dir = new THREE.Vector3(r() * 2 - 1, (r() * 1.6 - 0.5) * squash, r() * 2 - 1).normalize();
    const q = c.clone().addScaledVector(dir, rad * (0.72 + r() * 0.3));
    const s = rad * (0.55 + r() * 0.3);
    const g = new THREE.PlaneGeometry(s * 2, s * 2);
    const mm = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
    mm.multiply(new THREE.Matrix4().makeRotationZ(r() * Math.PI)).setPosition(q);
    const na = g.attributes.normal as THREE.BufferAttribute;
    for (let j = 0; j < na.count; j++) na.setXYZ(j, 0, 0, -1);
    kit.add(g, 'leaf', leafC.clone().multiplyScalar(0.85 + 0.3 * (dir.y * 0.5 + 0.5)), mm);
  }
}
/** A bush on the ground (local y up): two or three leaf masses, sometimes in flower. */
export function shrub(kit: Kit, m: THREE.Matrix4, r: R, size = 1, flowers = r() < 0.4) {
  kit.push(m);
  const n = 2 + Math.floor(r() * 2);
  const base = new THREE.Color(pk(r, PAL.leaf));
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, d = size * 0.35 * (k ? 1 : 0);
    const rad = size * (k ? 0.45 + r() * 0.15 : 0.6);
    crown(kit, new THREE.Vector3(Math.cos(a) * d, rad * 0.7, Math.sin(a) * d), rad, base.clone().multiplyScalar(0.9 + r() * 0.2), r, 0.75);
  }
  if (flowers) {
    const c = pk(r, BLOOMC);
    for (let k = 0; k < 7; k++) {
      const a = r() * Math.PI * 2, el = 0.2 + r() * 1.0;
      const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      blossom(kit, new THREE.Matrix4().compose(dir.clone().multiplyScalar(size * 0.62).add(new THREE.Vector3(0, size * 0.45, 0)), q, new THREE.Vector3(1, 1, 1)), size * 0.09, c);
    }
  }
  kit.pop();
}
/** Ivy: leaf cards along a path of points (e.g. down a wall from the eaves), facing out along `out`. */
export function vine(kit: Kit, pts: THREE.Vector3[], out: THREE.Vector3, r: R, size = 0.42) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const L = curve.getLength(), n = Math.max(2, Math.round(L / (size * 0.55)));
  const base = new THREE.Color(pk(r, PAL.leaf));
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t);
    const s = size * (1 - 0.45 * t) * (0.8 + r() * 0.4);
    for (let k = 0; k < 2; k++) {
      const dir = out.clone().add(new THREE.Vector3((r() - 0.5) * 0.8, (r() - 0.5) * 0.6, (r() - 0.5) * 0.8)).normalize();
      const g = new THREE.PlaneGeometry(s * 2, s * 2);
      const mm = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0));
      mm.multiply(new THREE.Matrix4().makeRotationZ(r() * Math.PI)).setPosition(p.clone().addScaledVector(out, 0.06 + r() * 0.1).add(new THREE.Vector3((r() - 0.5) * s, 0, (r() - 0.5) * s)));
      const na = g.attributes.normal as THREE.BufferAttribute;
      for (let j = 0; j < na.count; j++) na.setXYZ(j, 0, 0, -1);
      kit.add(g, 'leaf', base.clone().multiplyScalar(0.8 + r() * 0.35), mm);
    }
  }
}

/** A flower box: a planked trough (local: centred on x, its back at z = 0 against a wall) spilling flowers. */
export function flowerBox(kit: Kit, m: THREE.Matrix4, w: number, r: R) {
  kit.push(m);
  const c = pk(r, PAL.timber);
  kit.add(boxM(w, 0.26, 0.3, WOOD_TILE), 'wood', c, T(0, -0.13, 0.15));
  kit.add(boxM(w + 0.06, 0.05, 0.34, WOOD_TILE), 'wood', shade(c, 0.85), T(0, 0.0, 0.15));
  kit.add(boxM(w - 0.06, 0.05, 0.24, WOOD_TILE), 'plain', '#5a4330', T(0, 0.02, 0.15));
  for (let k = 0; k < Math.max(2, Math.round(w / 0.32)); k++) posy(kit, T(-w / 2 + 0.16 + k * ((w - 0.32) / Math.max(1, Math.round(w / 0.32) - 1)), 0.02, 0.15, 0, r() * 3, 0), 0.42 + r() * 0.15, r);
  // trailing leaves over the front
  for (let k = 0; k < Math.max(1, Math.round(w / 0.5)); k++) if (r() < 0.7) { const x = -w / 2 + 0.2 + r() * (w - 0.4); vine(kit, [new THREE.Vector3(x, 0.02, 0.3), new THREE.Vector3(x + (r() - 0.5) * 0.2, -0.25, 0.34), new THREE.Vector3(x + (r() - 0.5) * 0.3, -0.45 - r() * 0.3, 0.36)], new THREE.Vector3(0, 0, 1), r, 0.16); }
  kit.pop();
}

/** A barrel standing on y = 0. */
export function barrel(kit: Kit, m: THREE.Matrix4, r: R, h = 0.95, rad = 0.36) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(rad * (0.86 + 0.14 * Math.sin(Math.PI * t)), t * h)); }
  const g = new THREE.LatheGeometry(pts, 14);
  kit.add(g, 'wood', pk(r, PAL.timber), m);
  kit.push(m);
  kit.add(new THREE.CircleGeometry(rad * 0.86, 14).rotateX(-Math.PI / 2), 'wood', pk(r, PAL.timberDark), T(0, h - 0.02, 0));
  for (const y of [0.16, h - 0.16]) kit.add(new THREE.TorusGeometry(rad * (0.86 + 0.14 * Math.sin(Math.PI * y / h)) + 0.01, 0.025, 4, 16), 'plain', PAL.iron, T(0, y, 0, Math.PI / 2));
  kit.pop();
}

/** A half-barrel tub of vegetables: lettuces and leafy greens, carrot tops, sometimes a marrow. */
export function vegTub(kit: Kit, m: THREE.Matrix4, r: R, rad = 0.55) {
  kit.push(m);
  const h = 0.5;
  const pts = [new THREE.Vector2(rad * 0.88, 0), new THREE.Vector2(rad, h * 0.6), new THREE.Vector2(rad * 1.02, h)];
  kit.add(new THREE.LatheGeometry(pts, 16), 'wood', pk(r, PAL.timber), T());
  kit.add(new THREE.TorusGeometry(rad * 0.97, 0.025, 4, 16), 'plain', PAL.iron, T(0, h * 0.55, 0, Math.PI / 2));
  kit.add(new THREE.CircleGeometry(rad * 0.98, 16).rotateX(-Math.PI / 2), 'plain', '#5b4431', T(0, h - 0.06, 0));
  const n = 4 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r(), d = rad * 0.5 * Math.sqrt(r());
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    const kind = r();
    if (kind < 0.45) {
      // a lettuce: a squashed ball of leaves
      kit.add(new THREE.IcosahedronGeometry(0.17, 1).scale(1, 0.75, 1), 'plain', pk(r, ['#8ab54e', '#9cc25a', '#77a444']), T(cx, h + 0.04, cz));
      for (let q = 0; q < 4; q++) { const b = q * 1.57 + r(); kit.add(new THREE.SphereGeometry(0.1, 6, 4).scale(1.3, 0.5, 0.8), 'plain', '#9cc860', T(cx + Math.cos(b) * 0.12, h + 0.0, cz + Math.sin(b) * 0.12, 0.4, -b, 0)); }
    } else if (kind < 0.75) {
      // carrots: orange shoulders and feathery tops
      kit.add(new THREE.ConeGeometry(0.05, 0.14, 6).rotateX(Math.PI), 'plain', '#e07a2c', T(cx, h - 0.02, cz));
      for (let q = 0; q < 5; q++) { const b = q * 1.26 + r(); kit.add(new THREE.ConeGeometry(0.025, 0.3, 3).translate(0, 0.15, 0), 'plain', '#6f9e3c', T(cx, h - 0.02, cz, Math.cos(b) * 0.35, 0, Math.sin(b) * 0.35)); }
    } else {
      for (let q = 0; q < 3; q++) kit.add(new THREE.SphereGeometry(0.12, 6, 4).scale(1, 0.8, 1), 'plain', pk(r, ['#5e8c3c', '#6e9a42', '#7a6aa0']), T(cx + (r() - 0.5) * 0.15, h + 0.05 + q * 0.04, cz + (r() - 0.5) * 0.15));
    }
  }
  kit.pop();
}

/** A bench of thick planks on two trestles (local x along the seat, the back on -z). */
export function bench(kit: Kit, m: THREE.Matrix4, r: R, w = 1.6) {
  kit.push(m);
  const c = pk(r, PAL.timber);
  kit.add(boxM(w, 0.08, 0.42, WOOD_TILE), 'wood', c, T(0, 0.46, 0));
  for (const sx of [-1, 1]) {
    kit.add(boxM(0.09, 0.44, 0.38, WOOD_TILE, true), 'wood', shade(c, 0.85), T(sx * (w / 2 - 0.18), 0.22, 0));
    kit.add(boxM(0.08, 0.5, 0.07, WOOD_TILE, true), 'wood', shade(c, 0.85), T(sx * (w / 2 - 0.18), 0.75, -0.2, -0.12, 0, 0));
  }
  kit.add(boxM(w, 0.14, 0.05, WOOD_TILE), 'wood', c, T(0, 0.92, -0.24, -0.12, 0, 0));
  kit.pop();
}

/** A plank crate (y = 0 on the ground). */
export function crate(kit: Kit, m: THREE.Matrix4, r: R, s = 0.6) {
  kit.push(m);
  const c = pk(r, PAL.timberPale);
  kit.add(boxM(s, s * 0.8, s, WOOD_TILE), 'wood', c, T(0, s * 0.4, 0));
  for (const y of [0.06, s * 0.74]) for (const [w, d] of [[s + 0.03, 0.06], [0.06, s + 0.03]]) {
    kit.add(boxM(w, 0.08, d, WOOD_TILE), 'wood', shade(c, 0.8), T(0, y, d < 0.1 ? s / 2 : 0));
    kit.add(boxM(w, 0.08, d, WOOD_TILE), 'wood', shade(c, 0.8), T(w < 0.1 ? s / 2 : 0, y, d < 0.1 ? -s / 2 : 0));
  }
  kit.pop();
}

/** A lantern on a bracket (local: hanging point at the origin). */
export function lantern(kit: Kit, m: THREE.Matrix4) {
  kit.push(m);
  kit.add(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4), 'plain', PAL.iron, T(0, -0.1, 0));
  kit.add(new THREE.ConeGeometry(0.16, 0.14, 6), 'plain', PAL.iron, T(0, -0.25, 0));
  kit.add(new THREE.CylinderGeometry(0.1, 0.11, 0.26, 6), 'bloom', '#ffd889', T(0, -0.45, 0));
  kit.add(new THREE.CylinderGeometry(0.13, 0.12, 0.04, 6), 'plain', PAL.iron, T(0, -0.6, 0));
  kit.pop();
}

/** A rope ladder hanging along a path of points (top first): two ropes and plank rungs between them. */
export function ropeLadder(kit: Kit, path: THREE.Vector3[], out: THREE.Vector3, halfW = 0.3, r: R) {
  const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), out).normalize();
  const curve = new THREE.CatmullRomCurve3(path);
  const L = curve.getLength();
  for (const sd of [-1, 1]) kit.add(ropeGeo(curve.getSpacedPoints(Math.max(6, Math.round(L / 0.8))).map(p => p.clone().addScaledVector(side, sd * halfW)), 0.065, 6), 'plain', '#b89c70');
  const n = Math.floor(L / 0.36);
  for (let k = 1; k < n; k++) {
    const p = curve.getPointAt(k / n), tg = curve.getTangentAt(k / n);
    const m = new THREE.Matrix4().makeBasis(side, tg.clone().cross(side).negate().normalize(), tg.clone().negate()).setPosition(p);
    kit.add(boxM(halfW * 2 + 0.16, 0.07, 0.14, WOOD_TILE), 'wood', pk(r, PAL.timber), m);
  }
}

/** A thick rope along points. */
export function rope(kit: Kit, pts: THREE.Vector3[], rad = 0.05) {
  kit.add(ropeGeo(pts, rad, 5), 'plain', '#b39668');
}

/** A washing line between a and b with sheets, shirts and towels pegged along it (cloth that moves in the wind). */
export function laundry(kit: Kit, a: THREE.Vector3, b: THREE.Vector3, r: R, sag = 0.35) {
  const pts = sagLine(a, b, sag, 14);
  kit.add(ropeGeo(pts, 0.018, 4), 'plain', '#d8ccb0');
  const L = a.distanceTo(b);
  const dir = b.clone().sub(a).setY(0).normalize();
  const yaw = Math.atan2(-dir.z, dir.x);
  let s = 0.4;
  while (s < L - 0.6) {
    const kind = r();
    const w = kind < 0.35 ? 0.9 + r() * 0.4 : kind < 0.7 ? 0.55 : 0.4;
    const h = kind < 0.35 ? 1.0 + r() * 0.3 : kind < 0.7 ? 0.65 : 0.5;
    if (s + w > L - 0.3) break;
    const t = (s + w / 2) / L;
    const p = a.clone().lerp(b, t); p.y -= 4 * sag * t * (1 - t);
    const c = new THREE.Color(pk(r, PAL.linen));
    const accent = r() < 0.35 ? pk(r, ['#9fb8cf', '#d9a6a0', '#b9c98f', '#e8cf8a']) : null;
    const g = clothGrid(w, h, 4, 5, () => c.clone(), {
      phase: r() * 6, stiff: 0.2,
      mask: kind >= 0.35 && kind < 0.7 ? (u, v) => v < 0.35 || (u > 0.22 && u < 0.78) : undefined,
      pattern: accent ? { kind: r() < 0.5 ? 'stripes' : 'gingham', accent, period: 0.12 } : undefined,
    });
    kit.add(g, 'cloth', null, T(p.x, p.y, p.z, 0, yaw, 0));
    s += w + 0.12 + r() * 0.25;
  }
}

const FLAGC = ['#f3ead4', '#fbf7ee', '#c8644e', '#d4a24a', '#efe3c6', '#d97f62'];
/** A string of bunting between a and b: small triangular cloth flags (cream, white, soft red, ochre) on a sagging line. */
export function bunting(kit: Kit, a: THREE.Vector3, b: THREE.Vector3, r: R, sag = 0.5) {
  const pts = sagLine(a, b, sag, 16);
  kit.add(ropeGeo(pts, 0.016, 3), 'plain', '#d8ccb0');
  const curve = new THREE.CatmullRomCurve3(pts);
  const L = curve.getLength();
  const n = Math.floor(L / 0.36);
  const fw = 0.3, fh = 0.4;
  let ci = Math.floor(r() * FLAGC.length);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = curve.getPointAt(t), along = curve.getTangentAt(t).normalize();
    const tg = along.clone().setY(0).normalize();
    const nrm = new THREE.Vector3(-tg.z, 0, tg.x);
    const c = new THREE.Color(FLAGC[ci++ % FLAGC.length]).multiplyScalar(0.94 + r() * 0.1);
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], cl: number[] = [], wv: number[] = [], dr: number[] = [], pat: number[] = [], idx: number[] = [];
    const rows = 3, ph = r() * 6 + i * 0.5;
    for (let j = 0; j <= rows; j++) {
      const v = j / rows, half = (1 - v) * fw / 2;
      for (const u of [-1, 0, 1]) {
        // the top edge follows the line; the flag hangs straight down from it to a point
        const q = p.clone().addScaledVector(j === 0 ? along : tg, u * half).add(new THREE.Vector3(0, -v * fh, 0));
        pos.push(q.x, q.y, q.z); nor.push(nrm.x, nrm.y, nrm.z); uv.push((u * half + fw / 2) / 0.35, v * fh / 0.35); cl.push(c.r, c.g, c.b);
        wv.push(0.12 * Math.pow(v, 1.1), ph, 0.5); dr.push(nrm.x, 0.15, nrm.z); pat.push(1, 1, 1, 0);
      }
    }
    for (let j = 0; j < rows; j++) for (let k = 0; k < 2; k++) {
      const a0 = j * 3 + k, a1 = a0 + 1, b0 = a0 + 3, b1 = b0 + 1;
      if (j === rows - 1) { idx.push(a0, b0, a1); continue; }
      idx.push(a0, b0, b1, a0, b1, a1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    g.setAttribute('aWave', new THREE.Float32BufferAttribute(wv, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dr, 3));
    g.setAttribute('aPat', new THREE.Float32BufferAttribute(pat, 4));
    g.setIndex(idx);
    kit.add(g, 'cloth', null);
  }
}

/** A tapered tube along a curve: a trunk or branch (radius r0 at the root to r1 at the tip). */
export function taperTube(pts: THREE.Vector3[], r0: number, r1: number, radial = 7, seg = 0) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const n = seg || Math.max(4, Math.round(curve.getLength() * 1.5));
  const g = new THREE.TubeGeometry(curve, n, 1, radial, false);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const t = i / n, c = curve.getPointAt(t);
    const rr = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(rr).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A tree growing out of the shell: a gnarled trunk flaring into roots that grip the moss, a few branches, and
 * crowns of leaf cards round dark cores (local y up from the ground at the origin).
 */
export function tree(kit: Kit, m: THREE.Matrix4, r: R, h = 7, spread = 1) {
  kit.push(m);
  const bark = pk(r, ['#8a7356', '#7c6850', '#93785a']);
  const lean = new THREE.Vector3((r() - 0.5) * 0.6, 1, (r() - 0.5) * 0.6).normalize();
  const trunk = [new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0, h * 0.25, 0).addScaledVector(lean, 0.3), lean.clone().multiplyScalar(h * 0.55).add(new THREE.Vector3((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6)), lean.clone().multiplyScalar(h * 0.8)];
  const R0 = 0.28 * h / 6;
  kit.add(taperTube(trunk, R0 * 1.3, R0 * 0.45, 8), 'wood', bark);
  // roots gripping the ground
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + r() * 0.6;
    const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    kit.add(taperTube([new THREE.Vector3(0, h * 0.12, 0), d.clone().multiplyScalar(R0 * 1.8).setY(0.1), d.clone().multiplyScalar(R0 * 3.6 + r() * 0.5).setY(-0.15)], R0 * 0.7, R0 * 0.15, 5), 'wood', bark);
  }
  const crowns: [THREE.Vector3, number][] = [[trunk[3].clone().add(new THREE.Vector3(0, h * 0.12, 0)), h * 0.3 * spread]];
  const nb = 3 + Math.floor(r() * 2);
  for (let k = 0; k < nb; k++) {
    const a = (k / nb) * Math.PI * 2 + r();
    const at = trunk[2].clone().lerp(trunk[3], r() * 0.6);
    const d = new THREE.Vector3(Math.cos(a), 0.7 + r() * 0.4, Math.sin(a)).normalize();
    const end = at.clone().addScaledVector(d, h * (0.28 + r() * 0.12) * spread);
    kit.add(taperTube([at, at.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.2, 0)), end], R0 * 0.5, R0 * 0.18, 5), 'wood', bark);
    crowns.push([end, h * (0.2 + r() * 0.07) * spread]);
  }
  for (const [c, rad] of crowns) crown(kit, c, rad, new THREE.Color(pk(r, PAL.leaf)), r);
  kit.pop();
  return crowns;
}

export { FC, WALL_TILE, STONE_TILE, WOOD_TILE, T, boxM, ropeGeo, sagLine };
