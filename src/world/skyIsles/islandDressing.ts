import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutlines } from '../../render/paint';
import { smoothstep } from '../noise';
import { IslandShape, TAU, asBody, rockBlock } from './islandShape';
import { ivyMaterial, toonMat, tuftMaterial, islandRockMaterial } from './islandMaterials';

// What grows on and hangs from a floating island: grass tufts and flower clumps (instanced, one draw each), curtains
// of vines and moss hanging from the lip and from every ledge (one merged mesh), roots hanging out of the overhangs
// and the underside, and broken blocks drifting under it. Trees and bushes are in islandFlora.ts.

/**
 * Merge every mesh under root into one mesh per material, keeping all attributes (vertex colours, uvs), in root's
 * space. A whole island's trees become a handful of draws.
 */
export function mergeByMaterial(root: THREE.Object3D, shadows = true): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const mat = m.material as THREE.Material;
    (byMat.get(mat) ?? byMat.set(mat, []).get(mat)!).push(g);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of byMat) {
    // keep only the attributes every piece has, so pieces from different builders still merge
    const keys = Object.keys(geos[0].attributes).filter(k => geos.every(g => g.attributes[k]));
    for (const g of geos) for (const k of Object.keys(g.attributes)) if (!keys.includes(k)) g.deleteAttribute(k);
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mm = new THREE.Mesh(merged, mat);
    mm.castShadow = shadows; mm.receiveShadow = true;
    out.add(mm);
  }
  return out;
}

// ------------------------------------------------------------------ grass and flowers

/** One tuft: a soft, bushy clump of eleven short, broad blades fanning out, each with a height attribute for the wind. */
function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], h: number[] = [], idx: number[] = [];
  let r = 7;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b < 11; b++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd()) * 0.28;
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
    const ht = 0.24 + rnd() * 0.3, w = 0.07 + rnd() * 0.05, rot = rnd() * Math.PI;
    const cx = Math.cos(rot), cz = Math.sin(rot);
    // blades lean out from the middle of the tuft, so it reads as a soft mound
    const lx = Math.cos(a) * (0.15 + d), lz = Math.sin(a) * (0.15 + d);
    const base = pos.length / 3;
    for (const [x, y] of [[-w, 0], [w, 0], [-w * 0.75, 0.55], [w * 0.75, 0.55], [0, 1]]) {
      pos.push(bx + cx * x + lx * y * ht * 1.4, y * ht, bz + cz * x + lz * y * ht * 1.4);
      h.push(y);
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(h, 1));
  g.setIndex(idx);
  return g;
}

/**
 * A clump of flowers: a few stems of different heights, each with a star of petals and an eye (daisy), or a
 * stack of small blossoms up the top of the stem (spike, like lavender or lupin). aHead: 0 stem, 1 petal, 2 eye.
 */
function flowerGeometry(kind: 'daisy' | 'spike'): THREE.BufferGeometry {
  const pos: number[] = [], h: number[] = [], head: number[] = [], idx: number[] = [];
  let r = kind === 'daisy' ? 5 : 9;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const add = (x: number, y: number, z: number, hh: number, k: number) => { pos.push(x, y, z); h.push(hh); head.push(k); return pos.length / 3 - 1; };
  const stems = kind === 'daisy' ? 5 : 4;
  for (let s = 0; s < stems; s++) {
    const a = rnd() * TAU, d = s === 0 ? 0 : 0.12 + rnd() * 0.2;
    const x0 = Math.cos(a) * d, z0 = Math.sin(a) * d;
    const ht = kind === 'daisy' ? 0.22 + rnd() * 0.24 : 0.4 + rnd() * 0.28;
    const lx = (rnd() - 0.5) * 0.08, lz = (rnd() - 0.5) * 0.08;
    const s0 = add(x0 - 0.012, 0, z0, 0, 0), s1 = add(x0 + 0.012, 0, z0, 0, 0);
    const s2 = add(x0 + lx - 0.01, ht, z0 + lz, 0.9, 0), s3 = add(x0 + lx + 0.01, ht, z0 + lz, 0.9, 0);
    idx.push(s0, s1, s2, s1, s3, s2);
    const tx = x0 + lx, tz = z0 + lz;
    if (kind === 'daisy') {
      // a star of five petals; the centre vertex carries the eye colour, which fades out along the petals
      const pr = 0.13 + rnd() * 0.05, petals = 5;
      const c = add(tx, ht + 0.015, tz, 1, 2.6);
      const ring: number[] = [];
      for (let i = 0; i < petals * 2; i++) {
        const pa = (i / (petals * 2)) * TAU, rr = i % 2 === 0 ? pr : pr * 0.38;
        ring.push(add(tx + Math.cos(pa) * rr, ht + (i % 2 ? 0.008 : -0.006), tz + Math.sin(pa) * rr, 1, 1));
      }
      for (let i = 0; i < ring.length; i++) idx.push(c, ring[i], ring[(i + 1) % ring.length]);
    } else {
      // blossoms up the top 40% of the stem, as little crossed diamonds getting smaller toward the tip
      const n = 6;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), y = ht * (0.55 + 0.47 * t), rr = 0.075 * (1 - t * 0.55);
        {
          const rot = i * 1.9;
          const cx = Math.cos(rot), cz = Math.sin(rot);
          const p0 = add(tx + cx * rr, y, tz + cz * rr, 1, 1), p1 = add(tx, y + rr * 1.3, tz, 1, 1);
          const p2 = add(tx - cx * rr, y, tz - cz * rr, 1, 1), p3 = add(tx, y - rr * 1.1, tz, 1, 1);
          idx.push(p0, p1, p2, p0, p2, p3);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(h, 1));
  g.setAttribute('aHead', new THREE.Float32BufferAttribute(head, 1));
  g.setIndex(idx);
  return g;
}

const protoGeo: Partial<Record<'tuft' | 'daisy' | 'spike', THREE.BufferGeometry>> = {};
function proto(k: 'tuft' | 'daisy' | 'spike') {
  return protoGeo[k] ??= k === 'tuft' ? tuftGeometry() : flowerGeometry(k);
}

export interface Sprig { p: THREE.Vector3; up: THREE.Vector3; scale: number; col: THREE.Color }

/** One instanced draw of tufts or flower clumps, all in island-local space. */
export function sprigMesh(list: Sprig[], kind: 'tuft' | 'daisy' | 'spike', seed: number): THREE.Mesh | null {
  if (!list.length) return null;
  let s = seed * 31 + 3; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const N = list.length;
  // shuffled, so lowering instanceCount for a lower detail level thins evenly
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const P = new Float32Array(N * 3), U = new Float32Array(N * 3), RS = new Float32Array(N * 2), V = new Float32Array(N), Cc = new Float32Array(N * 3);
  const box = new THREE.Box3();
  list.forEach((q, i) => {
    P.set([q.p.x, q.p.y, q.p.z], i * 3); U.set([q.up.x, q.up.y, q.up.z], i * 3);
    RS.set([rnd() * TAU, q.scale], i * 2); V[i] = rnd(); Cc.set([q.col.r, q.col.g, q.col.b], i * 3);
    box.expandByPoint(q.p);
  });
  const src = proto(kind);
  const g = new THREE.InstancedBufferGeometry();
  g.index = src.index;
  g.setAttribute('position', src.attributes.position);
  g.setAttribute('aH', src.attributes.aH);
  if (src.attributes.aHead) g.setAttribute('aHead', src.attributes.aHead);
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(P, 3));
  g.setAttribute('iUp', new THREE.InstancedBufferAttribute(U, 3));
  g.setAttribute('iRS', new THREE.InstancedBufferAttribute(RS, 2));
  g.setAttribute('iVar', new THREE.InstancedBufferAttribute(V, 1));
  g.setAttribute('iCol', new THREE.InstancedBufferAttribute(Cc, 3));
  g.instanceCount = N;
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere()); g.boundingSphere.radius += 2;
  g.boundingBox = box.expandByScalar(2);
  const m = new THREE.Mesh(g, tuftMaterial(kind === 'tuft' ? 'grass' : 'flower'));
  m.userData.noOutline = true;
  m.userData.instances = N;
  return m;
}

// ------------------------------------------------------------------ hanging growth

const IVY = [new THREE.Color('#5a9a3e'), new THREE.Color('#6eaa46'), new THREE.Color('#4f8e3a'), new THREE.Color('#82b64e')];
const TIP = new THREE.Color('#b4d468');
const BLOSSOM = [new THREE.Color('#f2a6c4'), new THREE.Color('#fff4ea'), new THREE.Color('#c8a8ee'), new THREE.Color('#ffd86a')];

/** Leaf cards collected into one mesh (ivy material): each card faces out from the wall, aSway lets loose ends swing. */
class Cards {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; sway: number[] = []; idx: number[] = [];
  constructor(private rng: () => number) {}
  card(c: THREE.Vector3, out: THREE.Vector3, size: number, color: THREE.Color, sw: number, ph: number, stretch = 1) {
    const rng = this.rng;
    const t = new THREE.Vector3(-out.z, 0, out.x).normalize();
    const rot = (rng() - 0.5) * 1.2;
    const down = new THREE.Vector3(0, 1, 0);
    const ax = t.clone().multiplyScalar(Math.cos(rot)).addScaledVector(down, Math.sin(rot)).multiplyScalar(size);
    const ay = t.clone().multiplyScalar(-Math.sin(rot)).addScaledVector(down, Math.cos(rot)).multiplyScalar(size * stretch);
    const n = out.clone().addScaledVector(down, 0.35).normalize();
    const base = this.pos.length / 3;
    const shade = 0.88 + rng() * 0.24;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const v = c.clone().addScaledVector(ax, su).addScaledVector(ay, sv);
      // the top edge tucks in against the wall, the bottom edge hangs a little out
      v.addScaledVector(out, (sv < 0 ? 0.25 : -0.05) * size);
      this.pos.push(v.x, v.y, v.z); this.nor.push(n.x, n.y, n.z); this.uv.push((su + 1) / 2, (sv + 1) / 2);
      this.col.push(color.r * shade, color.g * shade, color.b * shade); this.sway.push(sw, ph);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  mesh(): THREE.Mesh | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 2));
    g.setIndex(this.idx);
    const m = new THREE.Mesh(g, ivyMaterial());
    m.castShadow = true; m.receiveShadow = true; m.userData.noOutline = true;
    return m;
  }
}

/**
 * One strand of hanging growth from (angle a, height y0) down to length L: it follows the rock where a ledge pushes
 * it out and hangs free where the wall falls back. Overlapping cards, two or three per step, darker at the root and
 * lighter toward the tip, so a few strands side by side read as one soft curtain.
 */
function strand(sh: IslandShape, cards: Cards, rng: () => number, a: number, y0: number, r0: number, L: number, color: THREE.Color, s2: number, flower: THREE.Color | null) {
  let r = r0, free = 0;
  const step = 0.2 * s2;
  const ph = rng() * 20;
  for (let d = 0; d < L; d += step) {
    const y = y0 - d;
    const w = y > sh.lipBottom(a) - 0.05 ? null : sh.wall(a, y);
    const wr = w ? w.r + 0.12 * s2 : r;
    if (wr >= r - 0.02) { r = wr; free = 0; } else free += step;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const c = out.clone().multiplyScalar(r).setY(y);
    if (w) { c.x += w.cx; c.z += w.cz; }
    const t = d / L;
    // a full curtain near the top, thinning to single leaves at the tip
    const size = (0.42 - 0.2 * t) * s2 * (0.85 + rng() * 0.3);
    const col = color.clone().lerp(TIP, smoothstep(0.35, 1, t) * 0.7);
    const sw = Math.min(0.14, free * 0.035) * s2;
    cards.card(c, out, size, col, sw, ph, 1.15);
    if (t < 0.75) cards.card(c.clone().add(new THREE.Vector3(Math.sin(a), -step * 0.5, -Math.cos(a)).multiplyScalar(0.6 * size)), out, size * 0.85, col, sw, ph);
    if (t < 0.4) cards.card(c.clone().add(new THREE.Vector3(-Math.sin(a), -step * 0.3, Math.cos(a)).multiplyScalar(0.7 * size)), out, size * 0.8, col, sw, ph);
    if (flower && rng() < 0.2) cards.card(c.clone().addScaledVector(out, 0.08), out, size * 0.4, flower, sw, ph);
    a += (rng() - 0.5) * 0.003;
  }
}

/**
 * Curtains of vines and moss down the cliffs: from under the lip all the way round (short drapes everywhere, so the
 * turf's under-edge is never a clean line; long curtains in places), and from every mossy ledge down the face below
 * it. avoid: angles (with half-widths, radians) to keep clear, the waterfalls.
 */
export function hangingGrowth(sh: IslandShape, rng: () => number, density: number, ledges: { p: THREE.Vector3; a: number; w: number }[], avoid: { a: number; half: number }[]): THREE.Mesh | null {
  const cards = new Cards(rng);
  const s2 = Math.max(0.45, sh.sc);
  const blocked = (a: number, pad: number) => avoid.some(v => Math.abs(Math.atan2(Math.sin(a - v.a), Math.cos(a - v.a))) < v.half + pad);
  const perim = TAU * sh.R;
  // short drapes all round the lip
  const nDrape = Math.round((perim / (0.55 * s2)) * density);
  for (let k = 0; k < nDrape; k++) {
    const a = (k / nDrape) * TAU + (rng() - 0.5) * 0.02;
    if (blocked(a, 0.05) || rng() < 0.25) continue;
    const Rt = sh.outline(a);
    const color = IVY[Math.floor(rng() * IVY.length)];
    strand(sh, cards, rng, a, sh.edgeY(a) - sh.turf(a) * 0.7, Rt + 0.02 * s2, (0.4 + rng() * 1.2) * s2, color, s2, null);
  }
  // long curtains: several strands side by side
  const clusters = Math.round((perim / 4.2) * density);
  for (let k = 0; k < clusters; k++) {
    const a0 = rng() * TAU;
    if (blocked(a0, 0.12)) continue;
    const strands = 3 + Math.floor(rng() * 5);
    const Rt = sh.outline(a0);
    const color = IVY[Math.floor(rng() * IVY.length)];
    const flowering = rng() < 0.3 ? BLOSSOM[Math.floor(rng() * BLOSSOM.length)] : null;
    const longest = Math.min(sh.cliffDepth * 0.9, (2.5 + rng() * 8) * s2);
    for (let s = 0; s < strands; s++) {
      const a = a0 + ((s - strands / 2) * 0.22 * s2) / Rt + (rng() - 0.5) * 0.02;
      const L = longest * (0.4 + rng() * 0.6) * (1 - 0.5 * Math.abs(s - strands / 2) / strands);
      strand(sh, cards, rng, a, sh.edgeY(a) - sh.turf(a) * 0.6, Rt + 0.02 * s2, L, color.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.05), s2, flowering);
    }
  }
  // moss and grass running down from the ledges
  const want = ledges.length ? Math.round((perim / 1.3) * density) : 0;
  for (let i = 0; i < want; i++) {
    const l = ledges[Math.floor(rng() * ledges.length)];
    if (blocked(l.a, 0.08)) continue;
    const color = IVY[Math.floor(rng() * IVY.length)];
    const w = sh.wall(l.a, l.p.y - 0.05);
    strand(sh, cards, rng, l.a, l.p.y + 0.05 * s2, w.r + 0.05 * s2, (0.5 + rng() * 2.4) * s2 * (0.6 + Math.min(1, l.w)), color, s2, rng() < 0.12 ? BLOSSOM[Math.floor(rng() * BLOSSOM.length)] : null);
  }
  return cards.mesh();
}

// ------------------------------------------------------------------ roots and loose rocks

/** A tapering tube along a list of points (radius r0 at the start, a fine point at the end). */
function taperTube(pts: THREE.Vector3[], r0: number, radial = 5): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts);
  const n = Math.max(5, pts.length * 2);
  const frames = curve.computeFrenetFrames(n, false);
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, c = curve.getPointAt(t), r = r0 * Math.pow(1 - t, 0.9) + 0.006;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      const v = c.clone().addScaledVector(frames.normals[i], Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A root that leaves the rock, arcs out and hangs down, branching into finer tendrils on the way. */
function rootTree(geos: THREE.BufferGeometry[], rng: () => number, start: THREE.Vector3, out: THREE.Vector3, L: number, r0: number, depth: number) {
  const pts = [start.clone()];
  const p = start.clone();
  const dir = out.clone().multiplyScalar(0.85).add(new THREE.Vector3(0, -0.3, 0)).normalize();
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    dir.lerp(new THREE.Vector3(0, -1, 0), 0.3).add(new THREE.Vector3((rng() - 0.5) * 0.45, 0, (rng() - 0.5) * 0.45)).normalize();
    p.addScaledVector(dir, L / segs);
    pts.push(p.clone());
  }
  geos.push(taperTube(pts, r0, depth === 0 ? 6 : 4));
  if (depth < 2) {
    const nb = depth === 0 ? 2 + Math.floor(rng() * 2) : Math.floor(rng() * 2);
    for (let b = 0; b < nb; b++) {
      const k = 1 + Math.floor(rng() * (segs - 2));
      const side = new THREE.Vector3((rng() - 0.5), 0, (rng() - 0.5)).normalize().add(out.clone().multiplyScalar(0.4)).normalize();
      rootTree(geos, rng, pts[k], side, L * (0.35 + rng() * 0.3), r0 * (1 - k / segs) * 0.7, depth + 1);
    }
  }
}

/**
 * Roots: thick, tapered, warm brown roots coming out from under the overhangs and the underside's upper beds, each
 * branching into tendrils that hang down.
 */
export function roots(sh: IslandShape, rng: () => number, count: number): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [];
  const s2 = Math.max(0.4, sh.sc);
  for (let k = 0; k < count; k++) {
    const a = rng() * TAU;
    // most from just under the cliff base and the first underside beds, some from under the lip
    const y = rng() < 0.25 ? sh.lipBottom(a) - (0.5 + rng() * 1.5) * s2 : -sh.cliffDepth - Math.pow(rng(), 1.5) * sh.underDepth * 0.45;
    const w = sh.wall(a, y);
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const start = new THREE.Vector3(w.cx, y, w.cz).addScaledVector(out, w.r * 0.97);
    rootTree(geos, rng, start, out, (1.6 + rng() * 3.6) * s2, (0.09 + rng() * 0.11) * s2, 0);
  }
  if (!geos.length) return null;
  const m = new THREE.Mesh(mergeGeometries(geos, false)!, toonMat('#a07450', 0.5, 0.8));
  m.castShadow = true; m.receiveShadow = true;
  addOutlines(m, '#5a3e2c', 0.012 * s2);
  return m;
}

/** A small rough rock chunk with the island's band colours, flat-ish on top, for debris and boulders. */
export function rockChunk(rng: () => number, size: number, col: THREE.Color, mossy: boolean): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(size, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const ph = rng() * 10;
  const colors: number[] = [], rk: number[] = [];
  const tmp = new THREE.Color();
  const moss = new THREE.Color('#86ab4c');
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i).normalize();
    const n = 1 + 0.18 * Math.sin(v.x * 4 + ph) * Math.cos(v.z * 3.3 + ph) + 0.1 * Math.sin(v.y * 6 + ph * 2);
    let y = v.y * n * size * 0.8;
    if (y > size * 0.35) y = size * 0.35 + (y - size * 0.35) * 0.3;
    p.setXYZ(i, v.x * n * size, y, v.z * n * size);
    tmp.copy(col).multiplyScalar(0.85 + 0.2 * (v.y * 0.5 + 0.5));
    if (mossy) tmp.lerp(moss, smoothstep(0.35, 0.8, v.y));
    colors.push(tmp.r, tmp.g, tmp.b); rk.push(mossy ? 1 - smoothstep(0.35, 0.8, v.y) : 1);
  }
  // (an icosahedron is built non-indexed, so the colour arrays line up with its vertices one to one)
  const ng = g;
  ng.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  ng.setAttribute('aRock', new THREE.Float32BufferAttribute(rk, 1));
  ng.computeVertexNormals();
  return asBody(ng);
}

/** Loose blocks drifting under and beside the island, one merged mesh in island space: broken limestone, some mossy. */
export function looseRocks(sh: IslandShape, rng: () => number, count: number): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [];
  const s5 = Math.max(0.5, sh.sc);
  for (let k = 0; k < count; k++) {
    const a = rng() * TAU;
    const v = 0.05 + rng() * 0.55;
    const y = -sh.cliffDepth - v * sh.underDepth;
    const w = sh.wall(a, y);
    const d = w.r + (1.2 + rng() * 4) * s5;
    const size = (0.25 + Math.pow(rng(), 2) * 0.8) * s5;
    const g = rockBlock(rng, size, size * (0.6 + rng() * 0.6), sh.band(sh.bandIndex(y)).col, rng() < 0.5 ? 0.9 : 0);
    g.rotateY(rng() * TAU); g.rotateX((rng() - 0.5) * 0.5);
    g.translate(w.cx + Math.cos(a) * d, y + (rng() - 0.5) * 2, w.cz + Math.sin(a) * d);
    geos.push(g);
  }
  if (!geos.length) return null;
  const m = new THREE.Mesh(mergeGeometries(geos, false)!, islandRockMaterial());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
