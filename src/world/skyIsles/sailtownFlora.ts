import * as THREE from 'three';
import { Kit, rng, pick, CELL, cellUV, floraCardMat, type Rnd } from './sailtownKit';
import { addLeafMass } from './sailtownGreen';

/**
 * Sailtown's flowers and ground cover, painted on cards from the flora atlas (sailtownKit.floraAtlas): lavender
 * bushes, coreopsis, daisies, cosmos, buttercups, alyssum, grass, clover and creeping sprigs. Each plant is a small
 * prototype of a few cards; a FloraField gathers every plant of a scene and builds one InstancedMesh per kind, so a
 * whole village of meadow and flower beds is about a dozen draw calls. Grass and ground cover draw without depth
 * (they never catch the ink of the finish pass and cast no shadow dots); flowers keep depth so they sort properly.
 *
 *   const field = new FloraField();
 *   meadow(field, { bounds: [-20, -20, 20, 20], density: (x, z) => onPath(x, z) ? 0 : 1 });
 *   flowerBed(field, { line: fencePoints, depth: 1.4 });
 *   scene.add(field.build());
 */

// ---------------------------------------------------------------- cards

type V3 = THREE.Vector3;
const UP = new THREE.Vector3(0, 1, 0);

/** Collects atlas-mapped quads (position, normal, uv, colour, aTint) into one geometry. */
export class Cards {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; tnt: number[] = []; idx: number[] = [];
  /**
   * A quad centred at c with half-extent vectors a (across, u) and b (up, v), using atlas cell `cell`.
   * n is one normal for all four corners or four normals (bottom-left, bottom-right, top-right, top-left).
   * `tint` 1 lets the instance colour tint the card's grey texels; 0 keeps the vertex colour only.
   */
  quad(c: V3, a: V3, b: V3, n: V3 | V3[], cell: number, color: THREE.Color, tint = 1, shadeLow = 1) {
    const [u0, v0, u1, v1] = cellUV(cell);
    const base = this.pos.length / 3;
    const corners: [number, number, number, number][] = [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]];
    corners.forEach(([su, sv, u, v], i) => {
      this.pos.push(c.x + a.x * su + b.x * sv, c.y + a.y * su + b.y * sv, c.z + a.z * su + b.z * sv);
      const nn = Array.isArray(n) ? n[i] : n;
      this.nor.push(nn.x, nn.y, nn.z);
      this.uv.push(u, v);
      const k = sv < 0 ? shadeLow : 1;
      this.col.push(color.r * k, color.g * k, color.b * k);
      this.tnt.push(tint);
    });
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return this;
  }
  get tris() { return this.idx.length / 3; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tnt, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Vertical cards standing on a root at (x, z): `n` cards crossing at even angles, w wide and h tall, leaning `lean`
 * radians toward `dir`. Normals lean outward and up, so a plant shades like a soft mound rather than flat boards.
 */
export function crossCards(cs: Cards, x: number, z: number, w: number, h: number, cell: number, color: THREE.Color, tint: number, n = 2, rot0 = 0, lean = 0, dir = 0, y0 = 0, shadeLow = 0.8, upNormal = false) {
  const up = new THREE.Vector3(Math.sin(lean) * Math.cos(dir), Math.cos(lean), Math.sin(lean) * Math.sin(dir)).multiplyScalar(h / 2);
  const out = new THREE.Vector3(x, 0, z);
  const outL = out.length();
  for (let k = 0; k < n; k++) {
    const a = rot0 + (k / n) * Math.PI;
    const across = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(w / 2);
    const c = new THREE.Vector3(x, y0, z).add(up);
    let nrm: V3 | V3[];
    if (upNormal) nrm = UP;
    else {
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const o = outL > 1e-3 ? out.clone().divideScalar(outL) : side;
      const nl = o.clone().multiplyScalar(0.6).addScaledVector(UP, 0.8).normalize();
      // the card's two edges bend round the plant's axis a little
      nrm = [nl.clone().addScaledVector(across, -0.8 / w).normalize(), nl.clone().addScaledVector(across, 0.8 / w).normalize(), nl.clone().addScaledVector(across, 0.8 / w).normalize(), nl.clone().addScaledVector(across, -0.8 / w).normalize()];
    }
    cs.quad(c, across, up, nrm, cell, color, tint, shadeLow);
  }
}

/** A face-up card (a flower head, a clover patch) at p, tipped `tilt` radians toward `dir`, spun by `spin`. */
export function headCard(cs: Cards, p: V3, size: number, cell: number, color: THREE.Color, tint: number, tilt = 0, dir = 0, spin = 0) {
  const n = new THREE.Vector3(Math.sin(tilt) * Math.cos(dir), Math.cos(tilt), Math.sin(tilt) * Math.sin(dir)).normalize();
  const ref = Math.abs(n.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP;
  const t1 = new THREE.Vector3().crossVectors(n, ref).normalize(), t2 = new THREE.Vector3().crossVectors(n, t1);
  const a = t1.clone().multiplyScalar(Math.cos(spin)).addScaledVector(t2, Math.sin(spin)).multiplyScalar(size / 2);
  const b = t2.clone().multiplyScalar(Math.cos(spin)).addScaledVector(t1, -Math.sin(spin)).multiplyScalar(size / 2);
  cs.quad(p, a, b, n.clone().lerp(UP, 0.3).normalize(), cell, color, tint);
}

/** A thin stem from a to b: two crossed strips on the solid white cell, in its own green. */
export function stemCards(cs: Cards, a: V3, b: V3, w: number, color: THREE.Color) {
  const d = b.clone().sub(a), c = a.clone().add(b).multiplyScalar(0.5);
  const half = d.clone().multiplyScalar(0.5);
  for (const ang of [0, Math.PI / 2]) {
    const across = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(w / 2);
    cs.quad(c, across, half, UP, CELL.solid, color, 0, 0.8);
  }
}

// ---------------------------------------------------------------- plant prototypes

export type PlantKind = 'lavender' | 'coreopsis' | 'daisy' | 'cosmos' | 'buttercup' | 'alyssum' | 'grass' | 'grassTall' | 'clover' | 'sprig' | 'leafy';
export type FlowerKind = 'lavender' | 'coreopsis' | 'daisy' | 'cosmos' | 'buttercup' | 'alyssum';
/** Ground cover draws without depth (no ink, drawn late); flowers draw normally. */
const GROUND = new Set<PlantKind>(['grass', 'grassTall', 'clover', 'sprig']);

const C = (s: string) => new THREE.Color(s);
const WHITE = new THREE.Color(1, 1, 1);

/** Heads on stems above a leafy base: the shared shape of coreopsis, daisies, cosmos and buttercups. */
function headsOnStems(cs: Cards, r: Rnd, n: number, spread: number, h0: number, h1: number, size: [number, number], cell: number, stem: THREE.Color) {
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
    const hx = Math.cos(a) * d, hz = Math.sin(a) * d, hy = h0 + (h1 - h0) * Math.pow(r(), 0.8);
    stemCards(cs, new THREE.Vector3(hx * 0.3, 0, hz * 0.3), new THREE.Vector3(hx, hy, hz), 0.012, stem);
    headCard(cs, new THREE.Vector3(hx, hy, hz), size[0] + r() * (size[1] - size[0]), cell, WHITE, 1, 0.25 + (d / spread) * 0.6, a, r() * 6);
  }
}

const protoCache = new Map<PlantKind, THREE.BufferGeometry>();
/** One plant of a kind at life size (lavender ~0.7 m, daisies ~0.4 m, grass ~0.25 m), root at the origin. */
export function plantGeo(kind: PlantKind): THREE.BufferGeometry {
  const hit = protoCache.get(kind);
  if (hit) return hit;
  const cs = new Cards(), r = rng(kind.length * 131 + kind.charCodeAt(0));
  switch (kind) {
    case 'lavender': {
      // a grey-green cushion of narrow leaves, and soft violet spikes fanning out of it
      crossCards(cs, 0, 0, 0.44, 0.3, CELL.narrow, C('#93a382'), 0, 3, r(), 0, 0, -0.02, 0.7);
      crossCards(cs, 0.05, 0.03, 0.3, 0.22, CELL.narrow, C('#8a9c7a'), 0, 2, r(), 0, 0, -0.02, 0.7);
      for (let i = 0; i < 18; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.1;
        crossCards(cs, Math.cos(a) * d, Math.sin(a) * d, 0.1, 0.55 + r() * 0.25, CELL.lavender, WHITE, 1, 2, r() * 3, 0.12 + (d / 0.09) * 0.32, a, 0, 0.92);
      }
      break;
    }
    case 'coreopsis': {
      crossCards(cs, 0, 0, 0.46, 0.32, CELL.leafy, C('#6f9a48'), 0, 3, r());
      headsOnStems(cs, r, 14, 0.2, 0.26, 0.5, [0.07, 0.09], CELL.coreopsis, C('#5f8a3e'));
      break;
    }
    case 'daisy': {
      crossCards(cs, 0, 0, 0.4, 0.26, CELL.leafy, C('#6c9846'), 0, 3, r());
      headsOnStems(cs, r, 11, 0.18, 0.22, 0.44, [0.085, 0.105], CELL.daisy, C('#5c873c'));
      break;
    }
    case 'cosmos': {
      crossCards(cs, 0, 0, 0.36, 0.38, CELL.leafy, C('#729f4c'), 0, 2, r());
      headsOnStems(cs, r, 7, 0.2, 0.44, 0.78, [0.1, 0.125], CELL.cosmos, C('#5f8c40'));
      break;
    }
    case 'buttercup': {
      crossCards(cs, 0, 0, 0.3, 0.17, CELL.leafy, C('#6a9a44'), 0, 2, r());
      headsOnStems(cs, r, 10, 0.15, 0.13, 0.32, [0.05, 0.064], CELL.buttercup, C('#5f8a3e'));
      break;
    }
    case 'alyssum': {
      crossCards(cs, 0, 0, 0.32, 0.13, CELL.leafy, C('#6a9a44'), 0, 2, r());
      crossCards(cs, 0, 0, 0.36, 0.2, CELL.alyssum, WHITE, 1, 3, r(), 0, 0, -0.03);
      headCard(cs, new THREE.Vector3(0, 0.12, 0), 0.34, CELL.alyssum, WHITE, 1, 0.1, 0, r() * 6);
      break;
    }
    case 'grass': crossCards(cs, 0, 0, 0.4, 0.26, CELL.grass, WHITE, 1, 3, r(), 0, 0, -0.01, 0.94, true); break;
    case 'grassTall': crossCards(cs, 0, 0, 0.38, 0.44, CELL.grass, WHITE, 1, 3, r(), 0, 0, -0.01, 0.92, true); break;
    case 'clover': {
      headCard(cs, new THREE.Vector3(0, 0.035, 0), 0.34, CELL.clover, WHITE, 1, 0.12, 0, 0);
      headCard(cs, new THREE.Vector3(0.05, 0.07, -0.03), 0.26, CELL.clover, WHITE, 1, 0.2, 2, 1.3);
      break;
    }
    case 'sprig': {
      headCard(cs, new THREE.Vector3(0, 0.03, 0), 0.32, CELL.sprig, WHITE, 1, 0.1, 0, 0);
      crossCards(cs, 0, 0, 0.26, 0.1, CELL.sprig, WHITE, 1, 2, 0.5, 0, 0, -0.01, 0.85, true);
      break;
    }
    case 'leafy': crossCards(cs, 0, 0, 0.42, 0.34, CELL.leafy, WHITE, 1, 3, r()); break;
  }
  const g = cs.build();
  // ground cover lies in the light like the ground itself
  if (GROUND.has(kind)) { const n = g.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); }
  protoCache.set(kind, g);
  return g;
}

/** Petal palettes after the pictures: soft pinks, lavender, butter and gold yellows, white. */
export const PETALS: Record<FlowerKind, string[]> = {
  lavender: ['#a891e6', '#b8a2ee', '#9c88de', '#c2aef2'],
  coreopsis: ['#ffc928', '#ffd23f', '#f7b81e'],
  daisy: ['#ffffff', '#fff8ee', '#fbeef4'],
  cosmos: ['#f39ab8', '#f7b6cc', '#ec84aa', '#ffffff', '#f6c6d8'],
  buttercup: ['#ffd84a', '#ffe070', '#ffcf30'],
  alyssum: ['#ffffff', '#f2e8ff', '#fbe2ee'],
};
/** Grass in light (warm yellow-green) to grass in the hollows (cool blue-green); muted, never lime. */
export const GRASS = { warm: new THREE.Color('#a9bd62'), mid: new THREE.Color('#8fb05a'), cool: new THREE.Color('#6f9c66') };

// ---------------------------------------------------------------- noise (CPU)

function hash2(x: number, y: number, s: number) { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); }
/** Smooth 2D value noise in [0, 1]. */
export function vnoise(x: number, y: number, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---------------------------------------------------------------- the field

interface Inst { m: THREE.Matrix4; c: THREE.Color }

/**
 * Gathers every plant of a scene (or a world chunk) and builds them as one InstancedMesh per kind, plus the merged
 * leaf mounds of the flower beds (`kit`). build() may be called once.
 */
export class FloraField {
  private items = new Map<PlantKind, Inst[]>();
  /** Leaf mounds and other merged greenery that belongs with the plants (bed bases). */
  readonly kit = new Kit();
  private q = new THREE.Quaternion(); private e = new THREE.Euler(); private p = new THREE.Vector3(); private s = new THREE.Vector3();

  /** Add one plant. `tilt` leans it (radians) toward `tiltDir`. */
  add(kind: PlantKind, x: number, y: number, z: number, scale: number, rotY: number, color: THREE.Color, tilt = 0, tiltDir = 0) {
    this.e.set(Math.sin(tiltDir) * tilt, rotY, Math.cos(tiltDir) * tilt); this.q.setFromEuler(this.e);
    const m = new THREE.Matrix4().compose(this.p.set(x, y, z), this.q, this.s.set(scale, scale * (0.9 + ((x * 7.3 + z * 3.1) % 1 + 1) % 1 * 0.2), scale));
    (this.items.get(kind) ?? this.items.set(kind, []).get(kind)!).push({ m, c: color });
  }
  count(kind?: PlantKind) { if (kind) return this.items.get(kind)?.length ?? 0; let n = 0; for (const v of this.items.values()) n += v.length; return n; }

  build(target = new THREE.Group()): THREE.Group {
    target.name = target.name || 'floraField';
    let tris = 0;
    for (const [kind, list] of this.items) {
      if (!list.length) continue;
      const geo = plantGeo(kind);
      const ground = GROUND.has(kind);
      const im = new THREE.InstancedMesh(geo, floraCardMat(ground ? 0.45 : 1, ground), list.length);
      list.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = false; im.receiveShadow = true;
      im.userData.noOutline = true;
      if (ground) im.renderOrder = 5;
      im.computeBoundingSphere();
      im.name = kind;
      target.add(im);
      tris += (geo.index!.count / 3) * list.length;
    }
    const k = new THREE.Group(); k.name = 'bedMounds';
    this.kit.build(k, { outline: false });
    target.add(k);
    target.userData.tris = tris + this.kit.tris;
    return target;
  }
}

// ---------------------------------------------------------------- meadow

export interface MeadowOpts {
  /** [x0, z0, x1, z1] in the field's space. */
  bounds: [number, number, number, number];
  heightAt?: (x: number, z: number) => number;
  /** Density multiplier at a point: 0 = bare (paths, water, floors), 1 = lawn, 2-3 = lush edges. */
  density?: (x: number, z: number) => number;
  /** Grass tufts per m² at density 1 (default 7). */
  grass?: number;
  /** Clover and creeping sprigs per m² (default 1.6). */
  cover?: number;
  /** Wild flowers per m² (default 0.25), in small patches. */
  flowers?: number;
  seed?: number;
  /** Size of the grass (1 = ankle-high lawn). */
  scale?: number;
}

/**
 * A painted meadow: dense short grass in instanced tufts, coloured in large soft patches from warm to cool, clover and
 * creeping ground cover in between, and wild flowers gathered in small drifts (never an even confetti).
 */
export function meadow(field: FloraField, o: MeadowOpts) {
  const r = rng(o.seed ?? 1), [x0, z0, x1, z1] = o.bounds, sd = (o.seed ?? 1) * 0.37;
  const dens = o.density ?? (() => 1), hAt = o.heightAt ?? (() => 0), S = o.scale ?? 1;
  const nG = o.grass ?? 7, nC = o.cover ?? 1.6, nF = o.flowers ?? 0.25;
  const cell = 0.5, A = cell * cell;
  const tmp = new THREE.Color();
  const flowerKinds: FlowerKind[] = ['daisy', 'buttercup', 'daisy', 'alyssum', 'coreopsis', 'cosmos'];
  for (let x = x0; x < x1; x += cell) for (let z = z0; z < z1; z += cell) {
    const k = dens(x + cell / 2, z + cell / 2);
    if (k <= 0) continue;
    const big = vnoise(x * 0.09, z * 0.09, sd), fine = vnoise(x * 0.5, z * 0.5, sd + 3);
    const emit = (per: number, f: (px: number, pz: number) => void) => {
      const e = per * A * k; let n = Math.floor(e); if (r() < e - n) n++;
      for (let i = 0; i < n; i++) {
        const px = x + r() * cell, pz = z + r() * cell;
        if (dens(px, pz) <= 0) continue;
        f(px, pz);
      }
    };
    emit(nG, (px, pz) => {
      const t = big * 0.75 + fine * 0.25;
      tmp.copy(GRASS.cool).lerp(GRASS.mid, Math.min(1, t * 1.6)).lerp(GRASS.warm, Math.max(0, t * 1.6 - 0.6));
      const c = tmp.clone().multiplyScalar(0.9 + r() * 0.2);
      const tall = k > 1.6 && r() < 0.3;
      field.add(tall ? 'grassTall' : 'grass', px, hAt(px, pz) - 0.01, pz, S * (0.7 + r() * 0.6) * (0.85 + Math.min(k, 2.5) * 0.15), r() * 6.28, c);
    });
    emit(nC, (px, pz) => {
      const c = tmp.copy(GRASS.mid).lerp(GRASS.warm, r() * 0.4).multiplyScalar(1.0 + r() * 0.12).clone();
      field.add(r() < 0.55 ? 'clover' : 'sprig', px, hAt(px, pz), pz, 0.8 + r() * 0.6, r() * 6.28, c);
    });
    // wild flowers only where the patch noise says so, in one kind per patch
    const fp = vnoise(x * 0.22 + 9, z * 0.22, sd + 7);
    if (fp > 0.58) emit(nF * (fp - 0.58) * 9, (px, pz) => {
      const kind = flowerKinds[Math.floor(vnoise(px * 0.15, pz * 0.15, sd + 11) * flowerKinds.length * 0.999)];
      const pal = PETALS[kind];
      field.add(kind, px, hAt(px, pz) - 0.02, pz, 0.7 + r() * 0.35, r() * 6.28, C(pick(r, pal)).multiplyScalar(0.92 + r() * 0.1), (r() - 0.5) * 0.2, r() * 6);
    });
  }
}

// ---------------------------------------------------------------- flower beds

export interface BedOpts {
  /** The back edge of the bed (a fence, a wall, a path border), in order, on the ground. */
  line: THREE.Vector3[];
  /** How far the bed reaches from the back edge (m), toward `side` (+1 = left of the line's travel). */
  depth?: number;
  side?: 1 | -1;
  /** Height scale at the back (1 = waist-high beds against the fence; it falls away toward the front). */
  height?: number;
  /** Relative weights of the kinds; each drift along the bed is one kind. */
  mix?: Partial<Record<FlowerKind, number>>;
  /** Plants per m² at the back (default 11); the front is about half as dense. */
  density?: number;
  /** Leaf mounds along the back for body (default true). */
  mounds?: boolean;
  heightAt?: (x: number, z: number) => number;
  /** Skip points where this returns false (a path, a doorway). */
  keep?: (x: number, z: number) => boolean;
  seed?: number;
}

/**
 * A mounded flower bed after picture 2: dense drifts that rise toward the fence or wall behind, on a body of leafy
 * mounds, with grass spilling round the front. Drifts change kind every metre or so, one colour family each.
 */
export function flowerBed(field: FloraField, o: BedOpts) {
  const r = rng(o.seed ?? 3);
  const curve = new THREE.CatmullRomCurve3(o.line, false, 'catmullrom', 0.3);
  const L = curve.getLength(), D = o.depth ?? 1.3, side = o.side ?? 1, H = o.height ?? 1;
  const hAt = o.heightAt ?? (() => 0), keep = o.keep ?? (() => true);
  const mix = o.mix ?? { lavender: 2, coreopsis: 2, daisy: 2.5, cosmos: 1.2, buttercup: 1, alyssum: 0.8 };
  const kinds = Object.keys(mix) as FlowerKind[];
  const total = kinds.reduce((s, k) => s + (mix[k] ?? 0), 0);
  const pickKind = () => { let t = r() * total; for (const k of kinds) { t -= mix[k] ?? 0; if (t <= 0) return k; } return kinds[0]; };
  // drifts: [start (m along the bed), kind, colour]
  const drifts: { s: number; kind: FlowerKind; c: THREE.Color }[] = [];
  for (let s = 0; s < L; s += 0.7 + r() * 1.1) { const kind = pickKind(); drifts.push({ s, kind, c: C(pick(r, PETALS[kind])) }); }
  const driftAt = (s: number, t: number) => {
    // drifts slant across the bed, so the boundaries are not straight lines
    const ss = s + (t - 0.5) * 0.6;
    let d = drifts[0];
    for (const dd of drifts) if (dd.s <= ss) d = dd;
    return d;
  };
  const dens = o.density ?? 11;
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3();
  const frame = (s: number) => { const u = Math.min(1, Math.max(0, s / L)); curve.getPointAt(u, P); curve.getTangentAt(u, T); T.y = 0; T.normalize(); N.set(-T.z, 0, T.x).multiplyScalar(side); };
  const step = 0.25;
  for (let s = 0; s < L; s += step) {
    frame(s);
    for (let t = 0; t < 1; t += step / D) {
      const k = dens * (1 - 0.55 * t) * step * step;
      let n = Math.floor(k); if (r() < k - n) n++;
      for (let i = 0; i < n; i++) {
        const tt = t + r() * step / D, ss = s + r() * step;
        frame(ss);
        // a ragged front edge
        if (tt > 0.75 + 0.25 * Math.sin(ss * 2.3 + (o.seed ?? 0))) continue;
        const x = P.x + N.x * tt * D + (r() - 0.5) * 0.08, z = P.z + N.z * tt * D + (r() - 0.5) * 0.08;
        if (!keep(x, z)) continue;
        const d = driftAt(ss, tt);
        const sc = H * (1.15 - 0.55 * tt) * (0.8 + r() * 0.4);
        const c = d.c.clone().multiplyScalar(0.9 + r() * 0.14);
        if (r() < 0.08) c.set(pick(r, PETALS[d.kind]));
        field.add(d.kind, x, hAt(x, z) - 0.02, z, sc, r() * 6.28, c, (r() - 0.5) * 0.25 + tt * 0.15, Math.atan2(N.x, N.z));
        // leafy filler between the flowers keeps the bed from showing bare ground
        if (r() < 0.35) field.add('leafy', x + (r() - 0.5) * 0.2, hAt(x, z) - 0.02, z + (r() - 0.5) * 0.2, sc * (0.7 + r() * 0.4), r() * 6.28, C('#7aa452').multiplyScalar(0.8 + r() * 0.25));
      }
    }
    // grass spilling over the front edge
    for (let i = 0; i < 3; i++) {
      const tt = 0.7 + r() * 0.45, x = P.x + N.x * tt * D, z = P.z + N.z * tt * D;
      if (keep(x, z)) field.add('grass', x, hAt(x, z) - 0.01, z, 0.9 + r() * 0.5, r() * 6.28, GRASS.mid.clone().lerp(GRASS.warm, r() * 0.6));
    }
  }
  if (o.mounds !== false) {
    for (let s = 0.2; s < L - 0.1; s += 0.55 + r() * 0.3) {
      frame(s);
      const x = P.x + N.x * 0.25, z = P.z + N.z * 0.25;
      if (!keep(x, z)) continue;
      const rad = (0.28 + r() * 0.16) * H;
      addLeafMass(field.kit, new THREE.Matrix4().makeTranslation(x, hAt(x, z) + rad * 0.45, z), r, { radius: rad, squash: 0.75, color: pick(r, ['#5f8c42', '#6a9648', '#58843e']) });
    }
  }
}
