import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { leafClump } from '../../render/foliage';
import { addOutlines } from '../../render/paint';
import { smoothstep } from '../noise';
import { IslandShape, TAU } from './islandShape';
import { ivyMaterial, toonMat, tuftMaterial, islandRockMaterial } from './islandMaterials';

// What grows on and hangs from a floating island: grass tufts and flower clumps (instanced, one draw each),
// round-crowned trees and bushes (merged per material), ivy curtains and vines down the cliffs (one merged mesh),
// roots poking out of the underside and loose rocks drifting under it.

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

/** One tuft: six tapering blades, each with a height attribute for the wind. */
function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], h: number[] = [], idx: number[] = [];
  let r = 7;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b < 6; b++) {
    const a = rnd() * TAU, d = rnd() * 0.3;
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
    const ht = 0.4 + rnd() * 0.5, w = 0.045 + rnd() * 0.03, rot = rnd() * Math.PI;
    const cx = Math.cos(rot), cz = Math.sin(rot), lean = (rnd() - 0.5) * 0.3;
    const base = pos.length / 3;
    for (const [x, y] of [[-w, 0], [w, 0], [-w * 0.65, 0.5], [w * 0.65, 0.5], [0, 1]]) {
      pos.push(bx + cx * x + lean * y * cz, y * ht, bz + cz * x - lean * y * cx);
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
  const stems = kind === 'daisy' ? 4 : 3;
  for (let s = 0; s < stems; s++) {
    const a = rnd() * TAU, d = s === 0 ? 0 : 0.08 + rnd() * 0.16;
    const x0 = Math.cos(a) * d, z0 = Math.sin(a) * d;
    const ht = kind === 'daisy' ? 0.28 + rnd() * 0.26 : 0.45 + rnd() * 0.3;
    const lx = (rnd() - 0.5) * 0.08, lz = (rnd() - 0.5) * 0.08;
    const s0 = add(x0 - 0.012, 0, z0, 0, 0), s1 = add(x0 + 0.012, 0, z0, 0, 0);
    const s2 = add(x0 + lx - 0.01, ht, z0 + lz, 0.9, 0), s3 = add(x0 + lx + 0.01, ht, z0 + lz, 0.9, 0);
    idx.push(s0, s1, s2, s1, s3, s2);
    const tx = x0 + lx, tz = z0 + lz;
    if (kind === 'daisy') {
      // a star of five petals; the centre vertex carries the eye colour, which fades out along the petals
      const pr = 0.07 + rnd() * 0.05, petals = 5;
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
        const t = i / (n - 1), y = ht * (0.6 + 0.42 * t), rr = 0.055 * (1 - t * 0.6);
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

// ------------------------------------------------------------------ trees and bushes

const LEAVES = ['#5f9c3a', '#77ae47', '#4f8c38'];

/**
 * A round-crowned meadow tree, as in the pictures: a short stout trunk that forks, and a broad crown of leaf clumps,
 * one big one on top and smaller ones at the branch tips. lean tips it outward over a cliff edge.
 */
export function meadowTree(rng: () => number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const bark = toonMat('#7a5a40', 0.6, 0.6);
  const h = (2.4 + rng() * 1.4) * scale;
  const trunkG = new THREE.CylinderGeometry(0.17 * scale, 0.32 * scale, h, 7, 5);
  // a gentle bend and a flared foot
  const p = trunkG.attributes.position as THREE.BufferAttribute;
  const bend = (rng() - 0.5) * 0.5 * scale, ph = rng() * 3;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / h + 0.5;
    const flare = 1 + 0.55 * Math.pow(1 - smoothstep(0, 0.22, y), 2);
    p.setXYZ(i, p.getX(i) * flare + Math.sin(y * 2.2 + ph) * bend * y, p.getY(i), p.getZ(i) * flare);
  }
  trunkG.computeVertexNormals();
  const trunk = new THREE.Mesh(trunkG, bark); trunk.position.y = h / 2; g.add(trunk);
  const leaf = LEAVES[Math.floor(rng() * LEAVES.length)];
  const leaf2 = LEAVES[Math.floor(rng() * LEAVES.length)];
  const top = new THREE.Vector3(Math.sin(2.2 + ph) * bend, h, 0);
  const crown = (2.0 + rng() * 0.5) * scale;
  const main = leafClump({ radius: crown, color: leaf, squash: 0.78, seed: Math.floor(rng() * 9999) });
  main.position.copy(top).add(new THREE.Vector3(0, crown * 0.55, 0)); g.add(main);
  const nb = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * TAU + rng() * 0.8, len = (1.3 + rng() * 0.6) * scale;
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * scale, 0.13 * scale, len, 5), bark);
    limb.position.copy(top).add(new THREE.Vector3(0, -0.5 * scale, 0));
    limb.rotation.set(0, -a, 0.9 + rng() * 0.3, 'YXZ');
    limb.translateY(len / 2);
    g.add(limb);
    const tip = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(len * 0.82).add(top);
    const cr = (1.1 + rng() * 0.5) * scale;
    const c = leafClump({ radius: cr, color: i % 2 ? leaf : leaf2, squash: 0.75, seed: Math.floor(rng() * 9999) });
    c.position.copy(tip).add(new THREE.Vector3(0, cr * 0.15, 0)); g.add(c);
  }
  return g;
}

/** A low round bush of one or two clumps. */
export function bush(rng: () => number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const leaf = LEAVES[Math.floor(rng() * LEAVES.length)];
  const n = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const r = (0.55 + rng() * 0.45) * scale;
    const c = leafClump({ radius: r, color: leaf, squash: 0.7, seed: Math.floor(rng() * 9999), cards: Math.round(12 + r * 10) });
    c.position.set((rng() - 0.5) * r * 1.2, r * 0.45, (rng() - 0.5) * r * 1.2); g.add(c);
  }
  return g;
}

// ------------------------------------------------------------------ ivy curtains and vines

const IVY = [new THREE.Color('#5f9a40'), new THREE.Color('#78ab4a'), new THREE.Color('#4c853a'), new THREE.Color('#8ab852')];
const BLOSSOM = [new THREE.Color('#f2a6c4'), new THREE.Color('#fff4ea'), new THREE.Color('#c8a8ee')];

/**
 * Vines hanging down the cliffs, in curtains of several strands. Each strand starts under the lip and drapes down
 * the wall: it follows the rock where a ledge pushes it out and hangs straight where the wall falls back, so the
 * curtains read as real growth. Leaf cards face outward; the free-hanging ends sway (aSway).
 * avoid: angles (with half-widths, radians) to keep clear, the waterfalls.
 */
export function vines(sh: IslandShape, rng: () => number, density: number, avoid: { a: number; half: number }[]): THREE.Mesh | null {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], sway: number[] = [], idx: number[] = [];
  const perim = TAU * sh.R;
  const clusters = Math.round((perim / 4.5) * density);
  const sc = sh.sc, s2 = Math.max(0.45, sc);
  const card = (c: THREE.Vector3, out: THREE.Vector3, size: number, color: THREE.Color, sw: number, ph: number) => {
    const t = new THREE.Vector3(-out.z, 0, out.x).normalize();
    const rot = rng() * TAU;
    const down = new THREE.Vector3(0, 1, 0);
    const ax = t.clone().multiplyScalar(Math.cos(rot)).addScaledVector(down, Math.sin(rot)).multiplyScalar(size);
    const ay = t.clone().multiplyScalar(-Math.sin(rot)).addScaledVector(down, Math.cos(rot)).multiplyScalar(size);
    const n = out.clone().addScaledVector(down, 0.2).normalize();
    const base = pos.length / 3;
    const shade = 0.85 + rng() * 0.3;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const v = c.clone().addScaledVector(ax, su).addScaledVector(ay, sv);
      v.addScaledVector(out, (rng() - 0.3) * size * 0.4);
      pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); uv.push((su + 1) / 2, (sv + 1) / 2);
      col.push(color.r * shade, color.g * shade, color.b * shade); sway.push(sw, ph);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let k = 0; k < clusters; k++) {
    const a0 = rng() * TAU;
    if (avoid.some(v => Math.abs(Math.atan2(Math.sin(a0 - v.a), Math.cos(a0 - v.a))) < v.half + 0.12)) continue;
    const strands = 2 + Math.floor(rng() * 6);
    const Rt = sh.outline(a0);
    const color = IVY[Math.floor(rng() * IVY.length)];
    const flowering = rng() < 0.3 ? BLOSSOM[Math.floor(rng() * BLOSSOM.length)] : null;
    const longest = Math.min(sh.cliffDepth * 0.95 + sh.underDepth * 0.15, (2 + rng() * 9) * s2);
    for (let s = 0; s < strands; s++) {
      let a = a0 + ((s - strands / 2) * 0.3 * s2) / Rt + (rng() - 0.5) * 0.03;
      const L = longest * (0.35 + rng() * 0.65);
      const y0 = sh.edgeY(a) - 0.75 * sc;
      // start just under the turf of the lip
      let r = Rt + 0.05 * sc;
      let free = 0;
      const step = 0.24 * s2;
      const ph = rng() * 20;
      const tw = color.clone().lerp(IVY[Math.floor(rng() * IVY.length)], 0.4);
      for (let d = 0; d < L; d += step) {
        const y = y0 - d;
        const w = y > sh.Y0 ? null : sh.wall(a, y);
        const wr = w ? w.r + 0.14 * s2 : r;
        if (wr >= r - 0.02) { r = wr; free = 0; } else free += step;
        const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const c = out.clone().multiplyScalar(r).setY(y);
        const t = d / L;
        const size = (0.4 - 0.15 * t) * s2 * (0.8 + rng() * 0.4);
        card(c, out, size, tw, Math.min(0.12, free * 0.03) * s2, ph);
        if (rng() < 0.45) card(c.clone().add(new THREE.Vector3(0, -step * 0.5, 0)), out, size * 0.8, tw, Math.min(0.12, free * 0.03) * s2, ph);
        if (flowering && rng() < 0.18) card(c.clone().addScaledVector(out, 0.06), out, size * 0.45, flowering, Math.min(0.12, free * 0.03) * s2, ph);
        a += (rng() - 0.5) * 0.004;
      }
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, ivyMaterial());
  m.castShadow = true; m.receiveShadow = true; m.userData.noOutline = true;
  return m;
}

/** Ivy carpets: patches of leaf cards lying on the upper cliff faces, thickest just under the lip. */
export function ivyPatches(sh: IslandShape, rng: () => number, count: number, avoid: { a: number; half: number }[]): THREE.Mesh | null {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], sway: number[] = [], idx: number[] = [];
  const s2 = Math.max(0.45, sh.sc);
  for (let k = 0; k < count; k++) {
    const a0 = rng() * TAU;
    if (avoid.some(v => Math.abs(Math.atan2(Math.sin(a0 - v.a), Math.cos(a0 - v.a))) < v.half + 0.1)) continue;
    const y0 = sh.Y0 - rng() * sh.cliffDepth * 0.7;
    const color = IVY[Math.floor(rng() * IVY.length)];
    const n = 26 + Math.floor(rng() * 30);
    const spread = (0.6 + rng() * 1.0) * s2;
    for (let i = 0; i < n; i++) {
      const a = a0 + ((rng() - 0.5) * spread * 2) / sh.outline(a0);
      const y = y0 - Math.pow(rng(), 1.3) * spread * 2.4 * (1 - 0.6 * Math.abs(a - a0) * sh.outline(a0) / spread);
      if (y > sh.Y0 || y < -sh.cliffDepth) continue;
      const w = sh.wall(a, y);
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const c = out.clone().multiplyScalar(w.r + 0.08 * s2).setY(y);
      const size = (0.2 + rng() * 0.12) * s2;
      const t = new THREE.Vector3(-out.z, 0, out.x);
      const rot = rng() * TAU;
      const up = new THREE.Vector3(0, 1, 0);
      const ax = t.clone().multiplyScalar(Math.cos(rot)).addScaledVector(up, Math.sin(rot)).multiplyScalar(size);
      const ay = t.clone().multiplyScalar(-Math.sin(rot)).addScaledVector(up, Math.cos(rot)).multiplyScalar(size);
      const base = pos.length / 3;
      const shade = 0.8 + rng() * 0.35;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const v = c.clone().addScaledVector(ax, su).addScaledVector(ay, sv);
        pos.push(v.x, v.y, v.z); nor.push(out.x, 0.3, out.z); uv.push((su + 1) / 2, (sv + 1) / 2);
        col.push(color.r * shade, color.g * shade, color.b * shade); sway.push(0, 0);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, ivyMaterial());
  m.receiveShadow = true; m.userData.noOutline = true;
  return m;
}

// ------------------------------------------------------------------ roots and loose rocks

/** A tapering tube along a list of points (radius r0 at the start, a fine point at the end). */
function taperTube(pts: THREE.Vector3[], r0: number, radial = 4): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts);
  const n = Math.max(5, pts.length * 2);
  const frames = curve.computeFrenetFrames(n, false);
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, c = curve.getPointAt(t), r = r0 * Math.pow(1 - t, 0.8) + 0.004;
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

/** Roots poking out of the underside: they leave the rock, curl outward a little and hang down in thin wisps. */
export function roots(sh: IslandShape, rng: () => number, count: number): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [];
  const s2 = Math.max(0.4, sh.sc);
  for (let k = 0; k < count; k++) {
    const a = rng() * TAU;
    const v = 0.02 + rng() * 0.4;
    const y = -sh.cliffDepth - v * sh.underDepth;
    const w = sh.wall(a, y);
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const start = new THREE.Vector3(w.cx, y, w.cz).addScaledVector(out, w.r * 0.94);
    const L = (1.2 + rng() * 3.2) * s2;
    const pts = [start];
    const p = start.clone();
    let dir = out.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, -0.4, 0)).normalize();
    for (let i = 0; i < 5; i++) {
      dir.lerp(new THREE.Vector3(0, -1, 0), 0.35).add(new THREE.Vector3((rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5)).normalize();
      p.addScaledVector(dir, L / 5);
      pts.push(p.clone());
    }
    geos.push(taperTube(pts, (0.05 + rng() * 0.07) * s2));
    // a side wisp
    if (rng() < 0.5) {
      const q = pts[2].clone(), pts2 = [q];
      for (let i = 0; i < 3; i++) { q.add(new THREE.Vector3((rng() - 0.5) * 0.5, -0.4, (rng() - 0.5) * 0.5).multiplyScalar(s2)); pts2.push(q.clone()); }
      geos.push(taperTube(pts2, 0.03 * s2, 3));
    }
  }
  if (!geos.length) return null;
  const m = new THREE.Mesh(mergeGeometries(geos, false)!, toonMat('#6e4d36', 0.5, 0.8));
  m.castShadow = true; m.receiveShadow = true;
  addOutlines(m, '#3b2a30', 0.012);
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
  ng.deleteAttribute('uv');
  return ng;
}

/** Loose stones drifting under the island, one merged mesh. Each stone is placed in island space. */
export function looseRocks(sh: IslandShape, rng: () => number, count: number): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [];
  for (let k = 0; k < count; k++) {
    const a = rng() * TAU;
    const v = 0.1 + rng() * 0.75;
    const y = -sh.cliffDepth - v * sh.underDepth;
    const w = sh.wall(a, y);
    const d = w.r + (1 + rng() * 3.5) * Math.max(0.5, sh.sc);
    const size = (0.18 + Math.pow(rng(), 2) * 0.7) * Math.max(0.5, sh.sc);
    const g = rockChunk(rng, size, sh.band(sh.bandIndex(y)).col, false);
    g.rotateY(rng() * TAU); g.rotateX((rng() - 0.5) * 0.8);
    g.translate(w.cx + Math.cos(a) * d, y + (rng() - 0.5) * 2, w.cz + Math.sin(a) * d);
    geos.push(g);
  }
  if (!geos.length) return null;
  const m = new THREE.Mesh(mergeGeometries(geos, false)!, islandRockMaterial());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

