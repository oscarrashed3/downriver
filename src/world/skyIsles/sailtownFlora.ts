import * as THREE from 'three';
import { paint, softRamp } from '../../render/paint';
import { chainCompile, rng, pick, type Rnd } from './sailtownKit';

/**
 * Sailtown's flowers. Small hand-built plant geometries (daisy, cosmos cup, lavender and lupine spikes, a grass
 * tuft, hydrangea florets, roses) used two ways: merged into a prop (flower boxes, planters) or instanced by the
 * hundred in drifts (flowerDrifts). Instanced flowers sway in the vertex shader on the shared PAINT clock and take
 * their petal colour from the instance colour, while stems and centres keep their own (the aTint attribute).
 */

// ---------------------------------------------------------------- geometry builders

class G {
  pos: number[] = []; nor: number[] = []; col: number[] = []; tnt: number[] = []; idx: number[] = [];
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: THREE.Color, t: number) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.col.push(c.r, c.g, c.b); this.tnt.push(t);
    return this.pos.length / 3 - 1;
  }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  build(tintAttr = true) {
    // wind every triangle to agree with its normals, so double-sided toon lighting never shows the dark back
    const P = this.pos, Nn = this.nor, I = this.idx;
    for (let i = 0; i < I.length; i += 3) {
      const [a, b, c] = [I[i], I[i + 1], I[i + 2]];
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
      const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const mx = Nn[a * 3] + Nn[b * 3] + Nn[c * 3], my = Nn[a * 3 + 1] + Nn[b * 3 + 1] + Nn[c * 3 + 1], mz = Nn[a * 3 + 2] + Nn[b * 3 + 2] + Nn[c * 3 + 2];
      if (nx * mx + ny * my + nz * mz < 0) { I[i + 1] = c; I[i + 2] = b; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (tintAttr) g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tnt, 1));
    g.setIndex(this.idx);
    return g;
  }
}
const STEM = new THREE.Color('#4f7f3a'), LEAF = new THREE.Color('#5f9444'), WHITE = new THREE.Color(1, 1, 1);

/** A thin two-sided stem from the ground up to h, with a slight bend. */
function stem(g: G, h: number, bend: number, w = 0.012) {
  for (const rot of [0, Math.PI / 2]) {
    const cx = Math.cos(rot), cz = Math.sin(rot);
    const a = g.v(-w * cx, 0, -w * cz, -cz, 0.3, cx, STEM, 0), b = g.v(w * cx, 0, w * cz, -cz, 0.3, cx, STEM, 0);
    const c = g.v(-w * 0.7 * cx + bend, h, -w * 0.7 * cz, -cz, 0.3, cx, STEM, 0), d = g.v(w * 0.7 * cx + bend, h, w * 0.7 * cz, -cz, 0.3, cx, STEM, 0);
    g.tri(a, b, d); g.tri(a, d, c);
  }
}
/** A pointed leaf blade leaving the stem at height y toward angle a. */
function leaf(g: G, y: number, a: number, len: number, wid: number, c = LEAF) {
  const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
  const b = g.v(0, y, 0, 0, 1, 0, c, 0);
  const m1 = g.v(dx * len * 0.5 + sx * wid, y + len * 0.25, dz * len * 0.5 + sz * wid, 0, 1, 0, c, 0);
  const m2 = g.v(dx * len * 0.5 - sx * wid, y + len * 0.25, dz * len * 0.5 - sz * wid, 0, 1, 0, c, 0);
  const tip = g.v(dx * len, y + len * 0.15, dz * len, 0, 1, 0, c, 0);
  g.tri(b, m1, tip); g.tri(b, tip, m2);
}
/** A radial flower head: n petals (tinted) round a centre (not tinted), facing up and a little toward +X. */
function head(g: G, cx: number, cy: number, n: number, rOut: number, rIn: number, cup: number, centre: THREE.Color, petal = WHITE, tilt = 0.35) {
  const up = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), 0);
  const ax = new THREE.Vector3(Math.cos(tilt), -Math.sin(tilt), 0), az = new THREE.Vector3(0, 0, 1);
  const P = (r: number, a: number, h: number) => new THREE.Vector3(cx, cy, 0).addScaledVector(ax, Math.cos(a) * r).addScaledVector(az, Math.sin(a) * r).addScaledVector(up, h);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, da = Math.PI / n * 0.8;
    const p0 = P(rIn * 0.6, a, 0), p1 = P(rOut * 0.75, a - da, cup * 0.6), p2 = P(rOut, a, cup), p3 = P(rOut * 0.75, a + da, cup * 0.6);
    const ids = [p0, p1, p2, p3].map(p => g.v(p.x, p.y, p.z, up.x, up.y, up.z, petal, 1));
    g.tri(ids[0], ids[1], ids[2]); g.tri(ids[0], ids[2], ids[3]);
  }
  // the centre: a small raised fan
  const c0 = P(0, 0, rIn * 0.6), cid = g.v(c0.x, c0.y, c0.z, up.x, up.y, up.z, centre, 0);
  const ring: number[] = [];
  for (let i = 0; i < 6; i++) { const p = P(rIn, (i / 6) * Math.PI * 2, 0.005); ring.push(g.v(p.x, p.y, p.z, up.x, up.y, up.z, centre, 0)); }
  for (let i = 0; i < 6; i++) g.tri(cid, ring[i], ring[(i + 1) % 6]);
}
/** A tiny octahedron bud (for spikes and hydrangea florets). */
function bud(g: G, x: number, y: number, z: number, r: number, c: THREE.Color, t: number, sy = 1.2) {
  const pts = [[r, 0, 0], [-r, 0, 0], [0, r * sy, 0], [0, -r * sy, 0], [0, 0, r], [0, 0, -r]];
  const ids = pts.map(([a, b, d]) => { const l = Math.hypot(a, b, d); return g.v(x + a, y + b, z + d, a / l, b / l, d / l, c, t); });
  const faces = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
  for (const [a, b, d] of faces) g.tri(ids[a], ids[b], ids[d]);
}

export type FlowerKind = 'daisy' | 'cosmos' | 'buttercup' | 'lavender' | 'lupine' | 'tuft';

const geoCache = new Map<string, THREE.BufferGeometry>();
/** One plant of a kind, about life size (daisies 0.35 m, lavender 0.6 m), origin at its root. */
export function flowerGeo(kind: FlowerKind): THREE.BufferGeometry {
  let geo = geoCache.get(kind);
  if (geo) return geo;
  const g = new G(), r = rng(kind.length * 31 + 7);
  switch (kind) {
    case 'daisy': {
      stem(g, 0.3, 0.03); leaf(g, 0.05, 0.4, 0.14, 0.03); leaf(g, 0.1, 2.6, 0.12, 0.03);
      head(g, 0.03, 0.3, 13, 0.095, 0.026, 0.012, new THREE.Color('#f2c230'), WHITE, 0.7);
      break;
    }
    case 'cosmos': {
      stem(g, 0.44, -0.04); leaf(g, 0.12, 1.2, 0.12, 0.025); leaf(g, 0.2, 4.0, 0.1, 0.025);
      head(g, -0.04, 0.44, 8, 0.1, 0.022, 0.03, new THREE.Color('#e8b83a'), WHITE, 0.75);
      break;
    }
    case 'buttercup': {
      stem(g, 0.26, 0.02); leaf(g, 0.03, 1.0, 0.1, 0.035); leaf(g, 0.04, 3.6, 0.1, 0.035);
      head(g, 0.02, 0.26, 5, 0.065, 0.018, 0.03, new THREE.Color('#d89a20'), WHITE, 0.6);
      // a second bloom lower down
      stem(g, 0.18, -0.06);
      head(g, -0.06, 0.18, 5, 0.04, 0.012, 0.025, new THREE.Color('#d89a20'), WHITE, -0.4);
      break;
    }
    case 'lavender': case 'lupine': {
      const lup = kind === 'lupine';
      const stems = lup ? 2 : 3;
      for (let s = 0; s < stems; s++) {
        const a = (s / stems) * Math.PI * 2 + r(), lean = lup ? 0.04 + r() * 0.05 : 0.06 + r() * 0.06;
        const h = (lup ? 0.5 : 0.46) + r() * 0.14;
        const bx = Math.cos(a) * lean, bz = Math.sin(a) * lean;
        // stem as a thin quad pair leaning out
        for (const rot of [0, Math.PI / 2]) {
          const cx = Math.cos(rot) * 0.008, cz = Math.sin(rot) * 0.008;
          const v0 = g.v(-cx, 0, -cz, 0, 0.3, 1, STEM, 0), v1 = g.v(cx, 0, cz, 0, 0.3, 1, STEM, 0);
          const v2 = g.v(bx - cx, h, bz - cz, 0, 0.3, 1, STEM, 0), v3 = g.v(bx + cx, h, bz + cz, 0, 0.3, 1, STEM, 0);
          g.tri(v0, v1, v3); g.tri(v0, v3, v2);
        }
        // the flower spike: one bumpy tapered column (whorls of florets) rather than many loose buds,
        // so it reads as a soft spike and does not break into ink specks
        const spikeLen = lup ? 0.3 : 0.2, rows = lup ? 7 : 5, segs = lup ? 4 : 3;
        const r0 = lup ? 0.032 : 0.02;
        const ring0 = g.pos.length / 3;
        for (let i = 0; i <= rows; i++) {
          const t = i / rows, y = h - spikeLen + t * spikeLen, k = y / h;
          const rr = i === rows ? 0.002 : r0 * (1 - t * 0.75) * (0.72 + 0.28 * Math.abs(Math.sin(t * Math.PI * (lup ? 6 : 4.5))));
          const sh = 0.72 + t * 0.4;
          for (let j = 0; j < segs; j++) {
            const a = (j / segs) * Math.PI * 2 + i * 0.6;
            g.v(bx * k + Math.cos(a) * rr, y, bz * k + Math.sin(a) * rr, Math.cos(a), 0.35, Math.sin(a), new THREE.Color(sh, sh, sh), 1);
          }
        }
        for (let i = 0; i < rows; i++) for (let j = 0; j < segs; j++) {
          const a = ring0 + i * segs + j, b = ring0 + i * segs + (j + 1) % segs, c = a + segs, d = b + segs;
          g.tri(a, b, d); g.tri(a, d, c);
        }
      }
      // silvery grey-green foliage at the base
      for (let i = 0; i < (lup ? 5 : 7); i++) leaf(g, 0.02, (i / 7) * Math.PI * 2 + r(), lup ? 0.16 : 0.12, lup ? 0.04 : 0.015, lup ? LEAF : new THREE.Color('#7f9a6c'));
      break;
    }
    case 'tuft': {
      for (let b = 0; b < 7; b++) {
        const a = r() * Math.PI * 2, d = r() * 0.1, h = 0.12 + r() * 0.12, w = 0.03 + r() * 0.015, lean = (r() - 0.3) * 0.1;
        const bx = Math.cos(a) * d, bz = Math.sin(a) * d, rot = r() * Math.PI, cx = Math.cos(rot), cz = Math.sin(rot);
        const lo = new THREE.Color(0.7, 0.78, 0.62), hi = new THREE.Color(1.05, 1.08, 0.95);
        const v0 = g.v(bx - cx * w, 0, bz - cz * w, 0, 1, 0, lo, 1), v1 = g.v(bx + cx * w, 0, bz + cz * w, 0, 1, 0, lo, 1);
        const v2 = g.v(bx + lean * cz, h, bz - lean * cx, 0, 1, 0, hi, 1);
        g.tri(v0, v1, v2);
      }
      break;
    }
  }
  geo = g.build();
  geo.computeBoundingSphere();
  geoCache.set(kind, geo);
  return geo;
}

/** A rose bloom (pink by default), about 9 cm across: a soft rounded bud in a ring of open petals. Not tinted. */
export function roseGeo(c: THREE.Color, size = 1): THREE.BufferGeometry {
  const g = new G();
  const s = 0.045 * size;
  const light = c.clone().lerp(new THREE.Color(1, 1, 1), 0.35), deep = c.clone().multiplyScalar(0.88);
  // the open petals: five rounded flaps
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, da = 0.75;
    const ctr = g.v(0, s * 0.15, 0, 0, 1, 0, deep, 0);
    const ids: number[] = [];
    for (let k = 0; k <= 3; k++) {
      const aa = a - da + (k / 3) * da * 2, rr = s * (k === 0 || k === 3 ? 0.8 : 1.05);
      ids.push(g.v(Math.cos(aa) * rr, s * 0.32, Math.sin(aa) * rr, Math.cos(aa) * 0.5, 0.85, Math.sin(aa) * 0.5, c, 0));
    }
    for (let k = 0; k < 3; k++) g.tri(ctr, ids[k], ids[k + 1]);
  }
  // the heart: a squashed ball, lighter on top
  const segs = 6, rows = 3;
  const base = g.pos.length / 3;
  for (let j = 0; j <= rows; j++) {
    const ph = (j / rows) * Math.PI * 0.5;
    for (let i = 0; i < segs; i++) {
      const th = (i / segs) * Math.PI * 2;
      const nx = Math.cos(th) * Math.cos(ph), ny = Math.sin(ph), nz = Math.sin(th) * Math.cos(ph);
      g.v(nx * s * 0.62, s * 0.3 + ny * s * 0.5, nz * s * 0.62, nx, ny, nz, j >= 2 ? light : c, 0);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < segs; i++) {
    const a0 = base + j * segs + i, a1 = base + j * segs + (i + 1) % segs, b0 = a0 + segs, b1 = a1 + segs;
    g.tri(a0, a1, b1); g.tri(a0, b1, b0);
  }
  return g.build(false);
}

/** A hydrangea head: a dome of ~26 four-petal florets in shades of one colour, radius ~0.16 m. Not tinted. */
export function hydrangeaGeo(c: THREE.Color, seed: number, radius = 0.16): THREE.BufferGeometry {
  const g = new G(), r = rng(seed);
  bud(g, 0, 0, 0, radius * 0.8, c.clone().multiplyScalar(0.62), 0, 0.9);
  const n = 40;
  for (let i = 0; i < n; i++) {
    // points on the upper 70% of a sphere (golden spiral)
    const y = 1 - (i / (n - 1)) * 1.4, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996;
    const nrm = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr);
    const ctr = nrm.clone().multiplyScalar(radius * (0.92 + r() * 0.12));
    const k = 0.78 + r() * 0.42;
    const fc = c.clone().multiplyScalar(k).lerp(new THREE.Color(1, 1, 1), r() * 0.15);
    // four petals in the tangent plane
    const t1 = new THREE.Vector3().crossVectors(nrm, Math.abs(nrm.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const t2 = new THREE.Vector3().crossVectors(nrm, t1);
    const ps = radius * 0.36;
    const ci = g.v(ctr.x, ctr.y, ctr.z, nrm.x, nrm.y, nrm.z, fc.clone().multiplyScalar(0.85), 0);
    const tips: number[] = [];
    for (let p = 0; p < 8; p++) {
      const ang = (p / 8) * Math.PI * 2 + r() * 0.3, len = p % 2 ? ps * 0.75 : ps;
      const q = ctr.clone().addScaledVector(t1, Math.cos(ang) * len).addScaledVector(t2, Math.sin(ang) * len).addScaledVector(nrm, -len * 0.15);
      tips.push(g.v(q.x, q.y, q.z, nrm.x, nrm.y, nrm.z, fc, 0));
    }
    for (let p = 0; p < 8; p++) g.tri(ci, tips[p], tips[(p + 1) % 8]);
  }
  return g.build(false);
}

/** A small blossom (5 petals and a centre) of a given colour, for flower boxes. Not tinted. */
export function blossomGeo(c: THREE.Color, centre = new THREE.Color('#f0c040'), size = 1): THREE.BufferGeometry {
  const g = new G();
  head(g, 0, 0, 5, 0.05 * size, 0.014 * size, 0.012 * size, centre, c, 0.2);
  return g.build(false);
}

// ---------------------------------------------------------------- the instanced material

const floraMats = new Map<string, THREE.MeshToonMaterial>();
/** Toon flower material: petals take the instance colour (aTint), the plant sways from the root up. */
export function floraMaterial(sway = 1): THREE.MeshToonMaterial {
  const key = 'f' + sway;
  let m = floraMats.get(key);
  if (m) return m;
  m = paint(new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: softRamp(), vertexColors: true, side: THREE.DoubleSide }), { variation: 0.35, rim: 1.5 });
  chainCompile(m, 'flora' + sway, (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTint; uniform float uTime;')
      .replace('#include <color_vertex>', `
        vColor = vec4(1.0);
        vColor.rgb *= color;
        #ifdef USE_INSTANCING_COLOR
          vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, aTint);
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 ip = instanceMatrix[3].xyz;
          #else
            vec3 ip = vec3(0.0);
          #endif
          float ph = ip.x * 0.7 + ip.z * 0.53;
          float hk = transformed.y * transformed.y * ${(1.6 * sway).toFixed(2)};
          transformed.x += (sin(uTime * 1.9 + ph) * 0.6 + sin(uTime * 3.3 + ph * 1.7) * 0.25 + 0.35) * hk * 0.5;
          transformed.z += sin(uTime * 1.4 + ph * 1.3) * hk * 0.3;
        }`);
  });
  floraMats.set(key, m);
  return m;
}

// ---------------------------------------------------------------- drifts

/** Palettes from the reference pictures: soft pinks, lavender, butter yellow, white. */
export const PETALS = {
  daisy: ['#ffffff', '#fff8ec', '#fbe9f0'],
  cosmos: ['#f39ab8', '#f7b6cc', '#e874a0', '#ffffff', '#f6c6d8'],
  buttercup: ['#ffd23f', '#ffc42a', '#ffe070'],
  lavender: ['#a990e2', '#b8a2ec', '#9e88dc'],
  lupine: ['#a586e4', '#c48ce0', '#f2a8cc', '#f6c0d8'],
  tuft: ['#7aa850', '#86b25a', '#6e9c4a', '#92bc62'],
} as const;

export interface DriftOpts {
  /** Picks a point for a drift centre: return [x, z] or null to skip. */
  area: (r: Rnd) => [number, number] | null;
  /** Ground height under a point (default 0). */
  heightAt?: (x: number, z: number) => number;
  /** Number of drifts, and plants per drift. */
  drifts?: number;
  perDrift?: number;
  /** Spread of one drift in metres. */
  spread?: number;
  /** Relative weights of each kind. */
  mix?: Partial<Record<FlowerKind, number>>;
  seed?: number;
  /** Size multiplier (bigger flowers read better in the distance). */
  scale?: number;
  /** Optional mask: return false where nothing should grow (paths, water). */
  keep?: (x: number, z: number) => boolean;
}

/**
 * Drifts of wild flowers, like the meadows in the pictures: each drift is one kind and one colour family, so the
 * colours gather in patches instead of a confetti. One InstancedMesh per kind (6 draw calls for any number).
 */
export function flowerDrifts(o: DriftOpts): THREE.Group {
  const r = rng(o.seed ?? 1);
  const mix = o.mix ?? { daisy: 3, cosmos: 2, buttercup: 2, lavender: 1.5, lupine: 1, tuft: 0 };
  const kinds = Object.keys(mix) as FlowerKind[];
  const total = kinds.reduce((s, k) => s + (mix[k] ?? 0), 0);
  const per = new Map<FlowerKind, { m: THREE.Matrix4; c: THREE.Color }[]>();
  const nD = o.drifts ?? 20, nP = o.perDrift ?? 24, spread = o.spread ?? 1.6, sc = o.scale ?? 1;
  const q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let d = 0; d < nD; d++) {
    const c = o.area(r);
    if (!c) continue;
    let pickK = r() * total, kind = kinds[0];
    for (const k of kinds) { pickK -= mix[k] ?? 0; if (pickK <= 0) { kind = k; break; } }
    const pal = PETALS[kind];
    const base = new THREE.Color(pick(r, pal));
    const list = per.get(kind) ?? per.set(kind, []).get(kind)!;
    const n = Math.round(nP * (0.6 + r() * 0.8));
    for (let i = 0; i < n; i++) {
      // gaussian-ish scatter, denser in the middle
      const a = r() * Math.PI * 2, rr = spread * Math.sqrt(-Math.log(1 - r() * 0.95)) * 0.55;
      const x = c[0] + Math.cos(a) * rr, z = c[1] + Math.sin(a) * rr;
      if (o.keep && !o.keep(x, z)) continue;
      const y = o.heightAt ? o.heightAt(x, z) : 0;
      const k = sc * (0.75 + r() * 0.5);
      e.set((r() - 0.5) * 0.25, r() * Math.PI * 2, (r() - 0.5) * 0.25); q.setFromEuler(e);
      const m = new THREE.Matrix4().compose(p.set(x, y - 0.02, z), q, s.set(k, k * (0.85 + r() * 0.3), k));
      const cc = base.clone().multiplyScalar(0.9 + r() * 0.2);
      if (r() < 0.12) cc.set(pick(r, pal));
      list.push({ m, c: cc });
    }
  }
  const g = new THREE.Group();
  g.name = 'flowerDrifts';
  let tris = 0;
  for (const [kind, list] of per) {
    if (!list.length) continue;
    const geo = flowerGeo(kind);
    const im = new THREE.InstancedMesh(geo, floraMaterial(kind === 'tuft' ? 0.7 : 1), list.length);
    list.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = false; im.receiveShadow = true;
    im.computeBoundingSphere();
    im.name = kind;
    g.add(im);
    tris += (geo.index!.count / 3) * list.length;
  }
  g.userData.tris = tris;
  return g;
}
