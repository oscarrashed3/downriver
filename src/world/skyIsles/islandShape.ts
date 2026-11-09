import * as THREE from 'three';
import { Noise, smoothstep, clamp, lerp } from '../noise';

// The form of one floating island, as pure functions of local space (+Y up, the island's lip near y = 0):
// - an irregular outline, R(angle);
// - a walkable top, height(x, z), with stream channels carved down to each waterfall's lip;
// - a cliff of horizontal limestone strata: each band steps in or out, is cut into blocks by vertical joints and
//   bulges a little, so ledges, overhangs and cracks come from the bands themselves;
// - an underside that tapers to a jagged, hooked point, with fingers of rock hanging from it.
// buildShell() turns that into one continuous mesh (top, grassy lip, cliff, underside) with smooth normals.

export const TAU = Math.PI * 2;

/** Park-Miller generator, as everywhere in the game; each island owns one, so islands never disturb each other. */
export function makeRng(seed: number) {
  let s = (Math.floor(Math.abs(seed) * 7919) + 13) % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export interface WaterfallSpec { angle: number; width: number; length: number }

interface Band {
  top: number; bot: number;
  /** how far the whole band steps out (+) or in (-) from the cliff line, metres */
  off: number;
  col: THREE.Color;
  nb: number; phase: number; blocks: number[]; groove: number;
  /** where round the island the ledge is strongest */
  seed: number;
}

export interface Stream {
  spec: WaterfallSpec;
  pts: THREE.Vector2[];
  /** cumulative length along pts */
  acc: number[];
  /** water surface height at each point */
  wl: number[];
  /** channel width at each point */
  w: number[];
}

// limestone, cream to pale gold, with a warmer peach band and a cooler lilac-grey one now and then
const BAND_COLS = ['#efe4c8', '#e6d3a4', '#f3ead6', '#dcc08c', '#e2c6a0', '#d3cabf', '#ead9b4', '#d8b98e'];

export class IslandShape {
  readonly R: number;
  /** feature scale: ledges, bands and lips shrink on small islands so a 2 m rock still reads as one */
  readonly sc: number;
  readonly noise: Noise;
  readonly rng: () => number;
  readonly cliffDepth: number;
  readonly underDepth: number;
  readonly wob: number;
  readonly bands: Band[] = [];
  readonly streams: Stream[] = [];
  /** top of the cliff (the first band), just under the lowest point of the lip */
  Y0 = -1;
  /** the underside's point leans this way (local x, z at the very tip) */
  tipX = 0; tipZ = 0;
  private userH?: (x: number, z: number) => number;
  private outlineCache: Float32Array;

  constructor(o: { seed: number; radius: number; wobble?: number; topHeight?: (x: number, z: number) => number; cliffDepth: number; underDepth: number; waterfalls?: WaterfallSpec[] }) {
    this.R = o.radius;
    this.sc = clamp(o.radius / 12, 0.14, 1.3);
    this.rng = makeRng(o.seed);
    this.noise = new Noise(o.seed * 131 + 7);
    this.cliffDepth = o.cliffDepth;
    this.underDepth = o.underDepth;
    this.wob = o.wobble ?? 0.6;
    this.userH = o.topHeight;
    // the outline is sampled once into a table, so edge(angle) is cheap for the game
    this.outlineCache = new Float32Array(721);
    for (let i = 0; i <= 720; i++) this.outlineCache[i] = this.outlineRaw((i / 720) * TAU);
    for (const wf of o.waterfalls ?? []) this.streams.push(this.planStream(wf));
    // the cliff starts just under the lowest point of the lip all round
    let minE = Infinity;
    for (let i = 0; i < 180; i++) minE = Math.min(minE, this.edgeY((i / 180) * TAU));
    this.Y0 = minE - 1.05 * this.sc - 0.15;
    const lean = this.rng() * TAU, ld = this.R * (0.12 + this.rng() * 0.22);
    this.tipX = Math.cos(lean) * ld; this.tipZ = Math.sin(lean) * ld;
    this.planBands();
  }

  // ---------------------------------------------------------------- outline and top

  private outlineRaw(a: number) {
    const c = Math.cos(a), s = Math.sin(a);
    const big = this.noise.fbm(c * 1.1 + 3.1, s * 1.1, 0.7, 3);
    const mid = this.noise.n3(c * 3.2, s * 3.2 + 5.3, 2.2);
    return this.R * (1 + this.wob * (0.4 * big + 0.12 * mid));
  }
  /** Radius of the grassy lip at this angle (local, about the island's axis). */
  outline(a: number) {
    const t = ((((a % TAU) + TAU) % TAU) / TAU) * 720;
    const i = Math.floor(t), f = t - i;
    return lerp(this.outlineCache[i], this.outlineCache[Math.min(720, i + 1)], f);
  }

  /** The top before streams are carved: a soft dome with low rolling swells, or the caller's own function. */
  baseHeight(x: number, z: number) {
    if (this.userH) return this.userH(x, z);
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    const s = Math.min(1, r / this.outline(a));
    const dome = this.R * 0.06 * (1 - s * s);
    const roll = this.noise.fbm(x * 0.045 + 11, 0.3, z * 0.045, 3) * Math.min(2.6, this.R * 0.16) * (0.5 + 0.5 * (1 - s * s * s * s));
    return dome + roll;
  }

  /** The walkable top: the base height with each stream's channel carved into it. */
  height(x: number, z: number) {
    let h = this.baseHeight(x, z);
    for (const st of this.streams) {
      const q = this.nearest(st, x, z);
      const half = q.w * 0.5;
      // bed under the water, banks rising to meet the meadow
      const target = q.wl - 0.32 * Math.max(0.5, this.sc) + smoothstep(half - 0.25, half + 2.2, q.d) * 3.0;
      h = smin(h, target, 0.5);
    }
    return h;
  }

  /** Height of the top at the lip, at this angle. */
  edgeY(a: number) {
    const r = this.outline(a) * 0.995;
    return this.height(Math.cos(a) * r, Math.sin(a) * r);
  }

  /** true if (x, z) is on the island's top. */
  inside(x: number, z: number) {
    return Math.hypot(x, z) <= this.outline(Math.atan2(z, x));
  }

  // ---------------------------------------------------------------- streams

  private planStream(wf: WaterfallSpec): Stream {
    const rng = this.rng;
    const a = wf.angle;
    const Re = this.outline(a);
    const a0 = a + (rng() - 0.5) * 1.1, s0 = 0.3 + rng() * 0.15;
    const r0 = this.outline(a0) * s0;
    const p0 = new THREE.Vector2(Math.cos(a0) * r0, Math.sin(a0) * r0);
    const p2 = new THREE.Vector2(Math.cos(a) * Re * 1.06, Math.sin(a) * Re * 1.06);
    const mid = p0.clone().lerp(p2, 0.5);
    const side = new THREE.Vector2(-(p2.y - p0.y), p2.x - p0.x).normalize().multiplyScalar((rng() - 0.5) * Re * 0.35);
    const p1 = mid.add(side);
    const pts: THREE.Vector2[] = [];
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      // a quadratic curve, then straightened near the lip so the water leaves the edge square on
      const q = new THREE.Vector2(u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y);
      pts.push(q);
    }
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
    // the water only ever runs downhill: a running minimum of the meadow along the path
    const wl: number[] = [], w: number[] = [];
    let lvl = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const t = i / (pts.length - 1);
      lvl = Math.min(lvl, this.baseHeight(pts[i].x, pts[i].y) - 0.3 * Math.max(0.6, this.sc));
      wl.push(lvl - smoothstep(0.75, 1, t) * 0.25 * this.sc);
      w.push(wf.width * (0.5 + 0.38 * t));
    }
    return { spec: wf, pts, acc, wl, w };
  }

  /** Nearest point of a stream's path: distance, water level, width and how far along (0..1). */
  nearest(st: Stream, x: number, z: number) {
    let best = Infinity, bi = 0, bf = 0;
    const P = st.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const ax = P[i].x, az = P[i].y, bx = P[i + 1].x, bz = P[i + 1].y;
      const dx = bx - ax, dz = bz - az;
      const L2 = dx * dx + dz * dz;
      const f = clamp(((x - ax) * dx + (z - az) * dz) / L2);
      const ex = ax + dx * f - x, ez = az + dz * f - z;
      const d2 = ex * ex + ez * ez;
      if (d2 < best) { best = d2; bi = i; bf = f; }
    }
    // the spring end is rounded: a little pool
    const wl = lerp(st.wl[bi], st.wl[bi + 1], bf), w = lerp(st.w[bi], st.w[bi + 1], bf);
    return { d: Math.sqrt(best), wl, w, t: (bi + bf) / (P.length - 1) };
  }

  // ---------------------------------------------------------------- strata

  private planBands() {
    const rng = this.rng, sc = this.sc;
    const bottom = -this.cliffDepth - this.underDepth - 1;
    let y = this.Y0, prevCol = -1, k = 0;
    while (y > bottom) {
      const kind = rng();
      // thin hard layers stick out as ledges; soft thick ones weather back
      let h: number, off: number;
      if (k === 0) { h = (1.0 + rng() * 1.2) * sc; off = 0; }
      else if (kind < 0.24) { h = (0.35 + rng() * 0.45) * sc; off = (0.35 + rng() * 0.45) * sc; }
      else if (kind < 0.5) { h = (1.2 + rng() * 1.6) * sc; off = -(0.35 + rng() * 0.55) * sc; }
      else { h = (0.8 + rng() * 1.8) * sc; off = (rng() - 0.5) * 0.5 * sc; }
      let ci = Math.floor(rng() * BAND_COLS.length);
      if (ci === prevCol) ci = (ci + 3) % BAND_COLS.length;
      prevCol = ci;
      // blocks: the band is cut by vertical joints into blocks a few metres wide, each set a little in or out
      const blockW = (2.2 + rng() * 2.6) * Math.max(0.35, sc);
      const nb = Math.max(3, Math.round((TAU * this.R) / blockW));
      const blocks: number[] = [];
      for (let i = 0; i < nb; i++) blocks.push((rng() - 0.5) * 0.8 * sc);
      this.bands.push({ top: y, bot: y - h, off, col: new THREE.Color(BAND_COLS[ci]), nb, phase: rng() * nb, blocks, groove: (0.3 + rng() * 0.35) * sc, seed: rng() * 100 });
      y -= h; k++;
    }
  }

  bandIndex(y: number) {
    const B = this.bands;
    for (let i = 0; i < B.length; i++) if (y >= B[i].bot) return i;
    return B.length - 1;
  }
  band(i: number) { return this.bands[i]; }

  /**
   * The rock wall at an angle and height: its radius about the (possibly leaning) axis, the axis offset, how deep
   * into a joint this point sits (0..1), how far down the underside it is (0..1) and the band.
   */
  wall(a: number, y: number, bandI = this.bandIndex(y)) {
    const sc = this.sc;
    const B = this.bands[bandI];
    const ca = Math.cos(a), sa = Math.sin(a);
    const Rt = this.outline(a);
    const vb = clamp((B.top - y) / (B.top - B.bot));
    const p = (a / TAU) * B.nb + B.phase;
    const i = Math.floor(p), f = p - i;
    const bi = ((i % B.nb) + B.nb) % B.nb;
    // a ledge runs part of the way round and dies out elsewhere
    const reach = smoothstep(-0.35, 0.45, this.noise.n3(ca * 1.4 + B.seed, B.seed * 0.37, sa * 1.4));
    let o = B.off * (B.off > 0 ? reach : 0.4 + 0.6 * reach) + lerp(B.blocks[bi], B.blocks[(bi + 1) % B.nb], smoothstep(0.86, 1, f));
    const blockW = (TAU * Rt) / B.nb;
    const jd = Math.min(f, 1 - f) * blockW;
    const joint = 1 - smoothstep(0, 0.45 * Math.max(0.4, sc), jd);
    o -= joint * B.groove;
    // each layer is a little rounded: full in the middle, worn back at its top edge
    o += 0.12 * sc * Math.sin(Math.PI * vb) - 0.1 * sc * (1 - smoothstep(0, 0.25, vb));
    const fq = 0.2 / Math.max(0.3, sc);
    const x = ca * this.R, z = sa * this.R;
    o += 0.3 * sc * this.noise.fbm(x * fq, y * 0.3 / Math.max(0.3, sc), z * fq, 2);
    // great buttresses and bays that run down through many layers, so the cliff is never a drum
    o += 0.9 * sc * this.noise.n3(ca * 2.6 + 4, y * 0.025 / Math.max(0.3, sc), sa * 2.6);
    const base = Rt - 0.32 * sc;
    if (y >= -this.cliffDepth) {
      const df = clamp((this.Y0 - y) / (this.Y0 + this.cliffDepth));
      return { r: Math.max(0.05, base * (1 - 0.07 * df) + o), cx: 0, cz: 0, joint, v: 0, band: B };
    }
    // the underside: a tapering, jagged cone whose point leans off-centre
    const v = clamp((-this.cliffDepth - y) / this.underDepth);
    const prof = Math.pow(1 - v, 0.78) * (1 - 0.14 * smoothstep(0, 0.12, v));
    const lobes = this.noise.n3(ca * 1.6 + 7, y * 0.02 / sc, sa * 1.6);
    const fingers = this.noise.ridged(ca * 3.2, y * 0.05 / sc + 3, sa * 3.2, 2);
    const jag = 1 + 0.38 * lobes * smoothstep(0, 0.35, v) + 0.24 * (fingers - 0.45) * smoothstep(0.1, 0.7, v);
    const r = Math.max(0, (base * 0.93 * (1 - 0.07) + o * 1.3 * (1 - v * 0.3)) * prof * jag);
    return { r, cx: this.tipX * v * v, cz: this.tipZ * v * v, joint, v, band: B };
  }

  /** The heights of the rows of the wall: two close rows at every band boundary (a crisp ledge), even spacing between. */
  wallRows(): number[] {
    const ys: number[] = [];
    const bottom = -this.cliffDepth - this.underDepth;
    const eps = 0.05 * Math.max(0.4, this.sc);
    for (const B of this.bands) {
      if (B.top <= bottom) break;
      const top = B.top - eps, bot = Math.max(B.bot + eps, bottom + 0.05);
      const under = top < -this.cliffDepth;
      const step = (under ? 0.75 : 0.45) * Math.max(0.35, this.sc);
      const n = Math.max(1, Math.round((top - bot) / step));
      for (let i = 0; i <= n; i++) ys.push(top - (top - bot) * (i / n));
    }
    return ys;
  }
}

/** Smooth minimum. */
export function smin(a: number, b: number, k: number) {
  const h = clamp(0.5 + 0.5 * (b - a) / k);
  return lerp(b, a, h) - k * h * (1 - h);
}

// ------------------------------------------------------------------------------------------- the shell mesh

const C = (s: string) => new THREE.Color(s);
const GRASS = [C('#6f9e40'), C('#86b44c'), C('#9cc55a'), C('#b2cf62')];
const SOIL = C('#8a6844'), SOIL_D = C('#6e5238');
const MOSS = C('#7fa646'), MOSS_D = C('#5f8a3c'), MOSS_L = C('#a2bd58');
const EARTH = C('#b49a7c'), BED = C('#9a967a'), SAND = C('#d8c9a0');

export interface ShellOut {
  geo: THREE.BufferGeometry;
  /** cliff vertices that face up (ledges), for grass and moss tufts */
  ledges: { p: THREE.Vector3; n: THREE.Vector3 }[];
  /** points along the lip for the overhanging fringe: position, normal, angle */
  lip: { p: THREE.Vector3; n: THREE.Vector3; a: number }[];
}

/** Grass colour of the meadow at (x, z): soft patches, lighter dabs, sand on the stream banks. */
export function meadowColor(sh: IslandShape, x: number, z: number, out = new THREE.Color()) {
  const n = sh.noise;
  const k = n.fbm(x * 0.09, 4.2, z * 0.09, 2) * 0.5 + 0.5;
  const d = n.n3(x * 0.35, 9.1, z * 0.35) * 0.5 + 0.5;
  out.copy(GRASS[0]).lerp(GRASS[1], smoothstep(0.2, 0.55, k)).lerp(GRASS[2], smoothstep(0.55, 0.85, k));
  out.lerp(GRASS[3], smoothstep(0.7, 0.9, d) * 0.6);
  for (const st of sh.streams) {
    const q = sh.nearest(st, x, z);
    const half = q.w * 0.5;
    out.lerp(SAND, 1 - smoothstep(half - 0.1, half + 0.7, q.d));
    out.lerp(BED, 1 - smoothstep(half * 0.5, half, q.d));
  }
  return out;
}

/**
 * The whole outer skin as one indexed grid: rings of the top (from the centre out), the rounded grassy lip that
 * overhangs the cliff, then the cliff and underside rows down to the tip. One mesh, smooth normals all the way
 * round, vertex colours and aRock (0 grass, 1 limestone) for the strata shader. N: points round each ring.
 */
export function buildShell(sh: IslandShape, N: number, bare = false): ShellOut {
  const sc = sh.sc;
  const pos: number[] = [], col: number[] = [], rock: number[] = [];
  const kinds: number[] = []; // per row: 0 top, 1 lip, 2 wall
  const tmp = new THREE.Color();
  const push = (x: number, y: number, z: number, c: THREE.Color, r: number) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); rock.push(r); };
  const nTop = Math.max(3, Math.ceil(sh.R / 0.8));
  const rockTop = (x: number, z: number) => tmp.copy(sh.band(0).col).multiplyScalar(0.96 + 0.08 * sh.noise.n3(x, 1, z));
  // top rings
  for (let i = 0; i <= nTop; i++) {
    const s = i / nTop;
    for (let j = 0; j < N; j++) {
      const a = (j / N) * TAU, Rt = sh.outline(a);
      const x = Math.cos(a) * Rt * s, z = Math.sin(a) * Rt * s;
      const y = sh.height(x, z);
      if (bare) push(x, y, z, rockTop(x, z), 1);
      else push(x, y, z, meadowColor(sh, x, z, tmp), 0);
    }
    kinds.push(0);
  }
  // the lip: the turf rolls out over the edge, then tucks back under to the soil and the cliff top
  const lipU = [0.22, 0.45, 0.68, 0.86, 1];
  for (const u of lipU) {
    for (let j = 0; j < N; j++) {
      const a = (j / N) * TAU, Rt = sh.outline(a), yE = sh.edgeY(a);
      const r = Rt + sc * (0.42 * Math.sin(Math.PI * Math.min(1, u * 1.15)) - 0.34 * u);
      const y = yE - 1.0 * sc * Math.pow(u, 1.25);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (bare) { push(x, y, z, rockTop(x, z), 1); continue; }
      meadowColor(sh, x, z, tmp);
      const soil = smoothstep(0.55, 1.0, u + 0.15 * sh.noise.n3(x * 0.8, 2, z * 0.8));
      tmp.lerp(u > 0.9 ? SOIL_D : SOIL, soil);
      push(x, y, z, tmp, soil * 0.4);
    }
    kinds.push(1);
  }
  // the cliff and the underside
  const rows = sh.wallRows();
  const firstBand = sh.band(0);
  // the first stratum hangs from the lip all the way round: where the meadow rises near the edge, that layer is
  // simply taller, so there is never a stretched strip between the turf and the rock
  const lipEnd = new Float32Array(N);
  for (let j = 0; j < N; j++) lipEnd[j] = sh.edgeY((j / N) * TAU) - 1.0 * sc - 0.06 * sc;
  for (const y0 of rows) {
    const bi = sh.bandIndex(y0);
    const t0 = bi === 0 ? clamp((firstBand.top - y0) / (firstBand.top - firstBand.bot)) : 1;
    for (let j = 0; j < N; j++) {
      const a = (j / N) * TAU;
      const y = bi === 0 ? lerp(lipEnd[j], y0, t0) : y0;
      const w = sh.wall(a, y, bi);
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = w.cx + ca * w.r, z = w.cz + sa * w.r;
      tmp.copy(w.band.col);
      // vertical water stains and darker joints
      const stain = smoothstep(0.35, 0.75, sh.noise.n3(ca * sh.R * 0.7 / Math.max(0.4, sc), 0.2, sa * sh.R * 0.7 / Math.max(0.4, sc)));
      tmp.multiplyScalar(1 - stain * 0.1 * (0.5 + 0.5 * smoothstep(-sh.cliffDepth, 0, y)) - w.joint * 0.22);
      // deeper under the island the rock turns earthier and darker
      if (w.v > 0) tmp.lerp(EARTH, smoothstep(0, 0.6, w.v) * 0.55).multiplyScalar(1 - 0.22 * w.v);
      // moss creeping down from the lip in tongues
      // a thin strip of moss right under the turf (the faces below get their green from ivy cards, which stay
      // crisp up close; vertex-colour moss on a wall this coarse would only smear)
      const mn = sh.noise.n3(ca * 5.3 + 1, 0.5, sa * 5.3) * 0.5 + 0.5;
      const mossTop = bare ? 0 : (1 - smoothstep(0, (0.1 + 0.5 * mn) * sc, lipEnd[j] - y)) * 0.8;
      tmp.lerp(mn > 0.5 ? MOSS : MOSS_D, mossTop);
      push(x, y, z, tmp, 1 - mossTop * 0.7);
    }
    kinds.push(2);
  }
  // the tip: one point (the ring collapses)
  {
    const yb = -sh.cliffDepth - sh.underDepth;
    for (let j = 0; j < N; j++) push(sh.tipX, yb, sh.tipZ, tmp.copy(EARTH).multiplyScalar(0.7), 1);
    kinds.push(2);
  }
  const K = kinds.length;
  const idx: number[] = [];
  for (let k = 0; k < K - 1; k++) for (let j = 0; j < N; j++) {
    const a = k * N + j, b = k * N + ((j + 1) % N), c = (k + 1) * N + j, d = (k + 1) * N + ((j + 1) % N);
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aRock', new THREE.Float32BufferAttribute(rock, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // ledges: wall vertices that face up turn mossy, and are kept for grass tufts
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const colA = geo.attributes.color as THREE.BufferAttribute;
  const rockA = geo.attributes.aRock as THREE.BufferAttribute;
  const ledges: ShellOut['ledges'] = [];
  const lip: ShellOut['lip'] = [];
  const startWall = nTop + 1 + lipU.length;
  for (let k = startWall; k < K - 1; k++) for (let j = 0; j < N; j++) {
    const i = k * N + j;
    const ny = nor.getY(i);
    if (ny < 0.38) continue;
    const p = new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const m = smoothstep(0.38, 0.75, ny) * (0.65 + 0.35 * (sh.noise.n3(p.x * 0.6, p.y * 0.6, p.z * 0.6) * 0.5 + 0.5));
    if (bare && sh.R < 3) continue;
    tmp.setRGB(colA.getX(i), colA.getY(i), colA.getZ(i)).lerp(m > 0.6 ? MOSS_L : MOSS, m * 0.9);
    colA.setXYZ(i, tmp.r, tmp.g, tmp.b);
    rockA.setX(i, rockA.getX(i) * (1 - m * 0.8));
    if (ny > 0.62 && p.y > -sh.cliffDepth - sh.underDepth * 0.3) ledges.push({ p, n: new THREE.Vector3(nor.getX(i), ny, nor.getZ(i)) });
  }
  for (let k = nTop + 1; k < nTop + 1 + 3; k++) for (let j = 0; j < N; j++) {
    const i = k * N + j;
    lip.push({ p: new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]), n: new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i)), a: (j / N) * TAU });
  }
  return { geo, ledges, lip };
}

/**
 * A finger of rock hanging under the island (a second or third lobe of the underside): a jagged cone from
 * radius r0 at y0 down to a point, in the same strata colours. Its top sits inside the main body.
 */
export function buildLobe(sh: IslandShape, cx: number, cz: number, y0: number, r0: number, len: number, N: number, seed: number): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], rock: number[] = [];
  const tmp = new THREE.Color();
  const rows = Math.max(4, Math.round(len / (0.7 * Math.max(0.4, sh.sc))));
  const lean = seed * 2.1, lx = Math.cos(lean) * r0 * 0.6, lz = Math.sin(lean) * r0 * 0.6;
  for (let k = 0; k <= rows; k++) {
    const v = k / rows, y = y0 - len * v;
    const prof = Math.pow(1 - v, 0.85);
    const B = sh.band(sh.bandIndex(y));
    for (let j = 0; j < N; j++) {
      const a = (j / N) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const fing = sh.noise.ridged(ca * 3.5 + seed, y * 0.05 / sh.sc, sa * 3.5, 2);
      const r = r0 * prof * (1 + 0.45 * (fing - 0.45) * smoothstep(0, 0.5, v) + 0.15 * sh.noise.n3(ca * 2, y * 0.2, sa * 2 + seed));
      const x = cx + lx * v * v + ca * r, z = cz + lz * v * v + sa * r;
      tmp.copy(B.col).lerp(EARTH, 0.35 + 0.3 * v).multiplyScalar(0.92 - 0.25 * v);
      pos.push(x, y, z); col.push(tmp.r, tmp.g, tmp.b); rock.push(1);
    }
  }
  const idx: number[] = [];
  for (let k = 0; k < rows; k++) for (let j = 0; j < N; j++) {
    const a = k * N + j, b = k * N + ((j + 1) % N), c = (k + 1) * N + j, d = (k + 1) * N + ((j + 1) % N);
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aRock', new THREE.Float32BufferAttribute(rock, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
