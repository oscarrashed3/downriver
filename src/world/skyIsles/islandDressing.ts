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
  m.userData.noOutline = true; m.renderOrder = 1;
  m.userData.instances = N;
  return m;
}

// ------------------------------------------------------------------ hanging growth

// sampled close to the moss on the ledges, so ivy and moss read as one growth
const IVY = [new THREE.Color('#6a9a44'), new THREE.Color('#78a64a'), new THREE.Color('#5f9040'), new THREE.Color('#84ae52')];
const TIP = new THREE.Color('#aac868');
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
    m.castShadow = true; m.receiveShadow = true; m.userData.noOutline = true; m.renderOrder = 1;
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
  const step = 0.17 * s2;
  const ph = rng() * 20;
  const dark = color.clone().multiplyScalar(0.72);
  for (let d = 0; d < L; d += step) {
    const y = y0 - d;
    const w = y > sh.lipBottom(a) - 0.05 ? null : sh.wall(a, y);
    const wr = w ? w.r + 0.08 * s2 : r;
    if (wr >= r - 0.02) { r = wr; free = 0; } else free += step;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const c = out.clone().multiplyScalar(r).setY(y);
    if (w) { c.x += w.cx; c.z += w.cz; }
    const t = d / L;
    // a narrow strand: darker in its core, thinning to small sparse leaves at the tip
    const size = (0.25 - 0.1 * t) * s2 * (0.85 + rng() * 0.3);
    const col = dark.clone().lerp(color, 0.4 + 0.6 * t).lerp(TIP, smoothstep(0.45, 1, t) * 0.6);
    const sw = Math.min(0.12, free * 0.035) * s2;
    if (t < 0.7 || rng() < 1.4 - t * 1.4) cards.card(c, out, size, col, sw, ph, 1.3);
    if (t < 0.4) cards.card(c.clone().add(new THREE.Vector3(Math.sin(a), -step * 0.5, -Math.cos(a)).multiplyScalar(0.55 * size)), out, size * 0.8, color, sw, ph);
    if (flower && rng() < 0.15) cards.card(c.clone().addScaledVector(out, 0.06), out, size * 0.55, flower, sw, ph);
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
  // short drapes along the lip, here and there, so the turf's under-edge is never a clean line
  const nDrape = Math.round((perim / (1.1 * s2)) * density);
  for (let k = 0; k < nDrape; k++) {
    const a = (k / nDrape) * TAU + (rng() - 0.5) * 0.03;
    if (blocked(a, 0.03) || rng() < 0.35) continue;
    const Rt = sh.outline(a);
    const color = IVY[Math.floor(rng() * IVY.length)];
    strand(sh, cards, rng, a, sh.edgeY(a) - sh.turf(a) * 0.7, Rt + 0.02 * s2, (0.3 + rng() * 0.9) * s2, color, s2, null);
  }
  // long trailing strands, grouped: either side of each waterfall (where the spray keeps it green) and at the
  // corners of the cliff (the outline's sharpest bends), a few elsewhere
  const spots: number[] = [];
  for (const v of avoid) { spots.push(v.a + v.half + 0.06, v.a - v.half - 0.06); }
  let best: { a: number; k: number }[] = [];
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * TAU, e = 0.05;
    const k = 2 * sh.outline(a) - sh.outline(a - e) - sh.outline(a + e);
    best.push({ a, k });
  }
  best = best.sort((p, q) => q.k - p.k).slice(0, Math.max(2, Math.round(sh.R / 4)));
  for (const b of best) spots.push(b.a);
  const extra = Math.round((perim / 9) * density);
  for (let i = 0; i < extra; i++) spots.push(rng() * TAU);
  for (const a0 of spots) {
    if (blocked(a0, 0.0)) continue;
    // a curtain: five to ten strands side by side, of mixed lengths, the longest reaching up to 40% down the cliff
    const strands = 5 + Math.floor(rng() * 6);
    const Rt = sh.outline(a0);
    const color = IVY[Math.floor(rng() * IVY.length)];
    const flowering = rng() < 0.2 ? BLOSSOM[Math.floor(rng() * BLOSSOM.length)] : null;
    const longest = Math.max(1.5 * s2, sh.cliffDepth * (0.14 + rng() * 0.26));
    for (let s = 0; s < strands; s++) {
      const a = a0 + ((s - strands / 2) * (0.16 + rng() * 0.2) * s2) / Rt;
      if (blocked(a, 0.0)) continue;
      // longest in the middle of the curtain, ragged at its sides
      const mid = 1 - Math.abs(s / (strands - 1) - 0.5) * 1.2;
      const L = longest * (0.25 + 0.75 * mid * (0.5 + rng() * 0.5));
      strand(sh, cards, rng, a, sh.edgeY(a) - sh.turf(a) * 0.6, Rt + 0.02 * s2, L, color.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.05), s2, flowering);
    }
  }
  // a few short strands down from the mossy ledges
  const want = ledges.length ? Math.round((perim / 6) * density) : 0;
  for (let i = 0; i < want; i++) {
    const l = ledges[Math.floor(rng() * ledges.length)];
    if (blocked(l.a, 0.05)) continue;
    const color = IVY[Math.floor(rng() * IVY.length)];
    const w = sh.wall(l.a, l.p.y - 0.05);
    strand(sh, cards, rng, l.a, l.p.y + 0.05 * s2, w.r + 0.05 * s2, (0.4 + rng() * 1.6) * s2 * (0.6 + Math.min(1, l.w)), color, s2, rng() < 0.1 ? BLOSSOM[Math.floor(rng() * BLOSSOM.length)] : null);
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
    // (never thinner than a couple of centimetres: finer tips only alias into dots)
    const t = i / n, c = curve.getPointAt(t), r = Math.max(r0 * 0.25, r0 * Math.pow(1 - t, 0.9)) + 0.012;
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
    // it forks: two or three branches off the main root, one or two off those
    const nb = depth === 0 ? 2 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2);
    for (let b = 0; b < nb; b++) {
      const k = 1 + Math.floor(rng() * (segs - 2));
      const side = new THREE.Vector3((rng() - 0.5), 0, (rng() - 0.5)).normalize().add(out.clone().multiplyScalar(0.4)).normalize();
      rootTree(geos, rng, pts[k], side, L * (0.4 + rng() * 0.3), Math.max(0.035, r0 * (1 - k / segs) * 0.75), depth + 1);
    }
  }
}

/** A root that clings to the rock: it runs down the wall, hugging it, and hangs free where the wall falls away. */
function clingRoot(geos: THREE.BufferGeometry[], sh: IslandShape, rng: () => number, a: number, y0: number, L: number, r0: number) {
  const pts: THREE.Vector3[] = [];
  let rPrev = Infinity;
  const segs = 7;
  for (let i = 0; i <= segs; i++) {
    const y = y0 - (L * i) / segs;
    a += (rng() - 0.5) * 0.25 / Math.max(4, sh.R);
    const w = sh.wall(a, y);
    // hug the wall, but never swing back in under an overhang
    const r = Math.min(rPrev + 0.05, w.r + r0 * 1.3);
    rPrev = Math.max(r, w.r + r0);
    pts.push(new THREE.Vector3(w.cx + Math.cos(a) * rPrev, y, w.cz + Math.sin(a) * rPrev));
  }
  geos.push(taperTube(pts, r0, 4));
}

/**
 * Rough chunks of rock hanging from the underside in a net of roots: geometry for the body (the chunks) and for the
 * roots (added to geos). Returns the chunk geometries.
 */
export function hangingChunks(sh: IslandShape, rng: () => number, count: number, rootGeos: THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const s2 = Math.max(0.4, sh.sc);
  for (let k = 0; k < count; k++) {
    const a = rng() * TAU;
    const v = sh.vEnd * (0.25 + rng() * 0.6);
    const y = -sh.cliffDepth - v * sh.underDepth;
    const w = sh.wall(a, y);
    const out0 = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const anchor = new THREE.Vector3(w.cx, y, w.cz).addScaledVector(out0, w.r * 0.9);
    const size = (0.6 + rng() * 0.9) * s2;
    const drop = (1.2 + rng() * 2.5) * s2;
    const c = anchor.clone().addScaledVector(out0, size * 0.6).add(new THREE.Vector3(0, -drop - size, 0));
    const g = rockBlock(rng, size, size * (1.0 + rng() * 0.6), sh.band(sh.bandIndex(y)).col, rng() < 0.6 ? 0.8 : 0);
    g.rotateY(rng() * TAU);
    g.translate(c.x, c.y, c.z);
    out.push(g);
    // the roots it hangs in: from the rock above, sagging a little, gripping over the chunk's top and on below it
    const n = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const ra = rng() * TAU, rr = size * (0.4 + rng() * 0.4);
      const from = anchor.clone().add(new THREE.Vector3(Math.cos(ra) * rr * 0.8, 0.2 * s2, Math.sin(ra) * rr * 0.8));
      const grip = c.clone().add(new THREE.Vector3(Math.cos(ra) * rr, -size * 0.05, Math.sin(ra) * rr));
      const mid = from.clone().lerp(grip, 0.5).addScaledVector(out0, 0.25 * s2);
      const below = c.clone().add(new THREE.Vector3(Math.cos(ra) * rr * 0.9, -size * (1.3 + rng() * 1.2), Math.sin(ra) * rr * 0.9));
      rootGeos.push(taperTube([from, mid, grip, grip.clone().lerp(below, 0.5).addScaledVector(out0, size * 0.35), below], (0.09 + rng() * 0.06) * s2, 5));
    }
  }
  return out;
}

/**
 * Roots: tangles of thin roots out of the soil layer under the lip, clinging to the top of the cliff; and thick,
 * tapered roots from under the overhangs and the underside's upper beds, branching into tendrils that hang down.
 * extra: more root tubes to merge in (the nets the hanging chunks hang in). avoid: the waterfall notches.
 */
export function roots(sh: IslandShape, rng: () => number, count: number, extra: THREE.BufferGeometry[] = [], avoid: { a: number; half: number }[] = []): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [...extra];
  const s2 = Math.max(0.4, sh.sc);
  const blocked = (a: number) => avoid.some(v => Math.abs(Math.atan2(Math.sin(a - v.a), Math.cos(a - v.a))) < v.half * 1.6 + 0.2);
  for (let k = 0; k < count; k++) {
    const a = rng() * TAU;
    if (blocked(a)) continue;
    if (rng() < 0.55) {
      // a tangle out of the soil: three to five thin roots from one spot, clinging down the top of the cliff
      const y0 = sh.lipBottom(a) + 0.15 * s2;
      const n = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) clingRoot(geos, sh, rng, a + ((rng() - 0.5) * 0.8 * s2) / sh.R, y0, (0.8 + rng() * 2.6) * s2, (0.05 + rng() * 0.05) * s2);
      continue;
    }
    const y = -sh.cliffDepth - Math.pow(rng(), 1.5) * sh.underDepth * 0.4;
    const w = sh.wall(a, y);
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const start = new THREE.Vector3(w.cx, y, w.cz).addScaledVector(out, w.r * 0.97);
    rootTree(geos, rng, start, out, (2.2 + rng() * 3.5) * s2, (0.16 + rng() * 0.14) * s2, 0);
  }
  if (!geos.length) return null;
  const m = new THREE.Mesh(mergeGeometries(geos, false)!, toonMat('#80583a', 0.5, 0.8));
  m.castShadow = true; m.receiveShadow = true;
  // (no ink hull: on roots this thin it only breaks up into dots at a distance)
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

/**
 * The underside's dressing, for the body mesh: a fringe of soil clods and root balls dangling right under the cliff
 * base (where the turf's roots come through the stone), and clusters of loose rubble lodged on the underside's
 * slopes. Root tubes for the clods go into rootGeos. avoid: the waterfall notches.
 */
export function undersideDressing(sh: IslandShape, rng: () => number, rootGeos: THREE.BufferGeometry[], avoid: { a: number; half: number }[]): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const s4 = Math.max(0.4, sh.sc);
  const blocked = (a: number) => avoid.some(v => Math.abs(Math.atan2(Math.sin(a - v.a), Math.cos(a - v.a))) < v.half * 1.3 + 0.1);
  const soil = [new THREE.Color('#8a6646'), new THREE.Color('#7a5a3e'), new THREE.Color('#946e4c')];
  // the fringe: a ragged row of clods hanging from the cliff base, in runs with gaps
  const nF = Math.round((TAU * sh.R) / (2.4 * s4));
  for (let k = 0; k < nF; k++) {
    const a = (k / nF) * TAU + (rng() - 0.5) * 0.08;
    if (blocked(a) || sh.noise.n3(Math.cos(a) * 2.5, 8.8, Math.sin(a) * 2.5) < -0.15) continue;
    const y = -sh.cliffDepth - (0.2 + rng() * 1.2) * s4;
    const w = sh.wall(a, y);
    const o = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const ww = (0.35 + rng() * 0.45) * s4, hh = (1.0 + rng() * 2.2) * s4;
    const g = rockBlock(rng, ww, hh, soil[Math.floor(rng() * soil.length)], 0);
    g.rotateY(rng() * TAU);
    const p = new THREE.Vector3(w.cx, y + 0.5 * s4, w.cz).addScaledVector(o, w.r - ww * 0.35);
    g.translate(p.x, p.y, p.z);
    out.push(g);
    // a root or two trailing out of the clod
    if (rng() < 0.5) {
      const st = p.clone().add(new THREE.Vector3(0, -hh * 0.6, 0)).addScaledVector(o, ww * 0.4);
      const L = (1.0 + rng() * 2.0) * s4;
      const pts = [st, st.clone().addScaledVector(o, 0.3 * s4).add(new THREE.Vector3(0, -L * 0.4, 0)), st.clone().addScaledVector(o, 0.2 * s4).add(new THREE.Vector3((rng() - 0.5) * 0.5, -L, (rng() - 0.5) * 0.5))];
      rootGeos.push(taperTubeExport(pts, (0.05 + rng() * 0.04) * s4));
    }
  }
  // rubble: clusters of three to six broken blocks lodged on the underside's slopes
  const nC = Math.max(1, Math.round(sh.R / 2.5));
  for (let c = 0; c < nC; c++) {
    const a = rng() * TAU;
    const v = sh.vEnd * (0.1 + rng() * 0.6);
    const n = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const aa = a + ((rng() - 0.5) * 2.5 * s4) / Math.max(3, sh.R);
      const y = -sh.cliffDepth - v * sh.underDepth + (rng() - 0.5) * 1.5 * s4;
      const w = sh.wall(aa, y);
      const o = new THREE.Vector3(Math.cos(aa), 0, Math.sin(aa));
      const size = (0.25 + Math.pow(rng(), 1.5) * 0.8) * s4;
      const g = rockBlock(rng, size, size * (0.8 + rng() * 0.8), sh.band(sh.bandIndex(y)).col, 0);
      g.rotateY(rng() * TAU); g.rotateZ((rng() - 0.5) * 0.6);
      const p = new THREE.Vector3(w.cx, y + size * 0.3, w.cz).addScaledVector(o, w.r + size * 0.1);
      g.translate(p.x, p.y, p.z);
      out.push(g);
    }
  }
  return out;
}

/** taperTube for the other builders. */
export function taperTubeExport(pts: THREE.Vector3[], r0: number, radial = 5) { return taperTube(pts, r0, radial); }
