import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise, smoothstep, clamp, lerp } from '../noise';

// The form of one floating island, as pure functions of local space (+Y up, the island's lip near y = 0):
// - an irregular outline, R(angle), with bays and promontories at three scales;
// - a walkable top, height(x, z), with stream channels carved down to each waterfall's lip;
// - a cliff of many thin horizontal limestone beds: each bed steps in or out, is cut into blocks by vertical joints,
//   and whole stretches of cliff lean or step back, so ledges, overhangs and cracks come from the beds themselves;
// - a broad, stepped underside that ends in a blunt jagged base, from which the builder hangs two or three lobes.
// buildShell() turns that into one mesh made of separate sections (the top and lip, one face per bed, one ledge
// strip between beds), each with its own normals, so every ledge edge stays crisp.

export const TAU = Math.PI * 2;

/** Park-Miller generator, as everywhere in the game; each island owns one, so islands never disturb each other. */
export function makeRng(seed: number) {
  let s = (Math.floor(Math.abs(seed) * 7919) + 13) % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export interface WaterfallSpec { angle: number; width: number; length: number }

export interface Band {
  top: number; bot: number;
  /** how far the whole bed steps out (+) or in (-) from the cliff line, metres */
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

/** A drift of flowers on the meadow: the ground under it takes a little of its colour, so it reads from afar. */
export interface Drift { x: number; z: number; r: number; col: THREE.Color; spike: boolean }

// limestone: warm cream and pale gold, a warmer peach bed and, now and then, a cooler grey-lilac one
const BAND_COLS = ['#eedfbd', '#e9d3a2', '#f4ead2', '#e2c792', '#ecd2ac', '#f0e2c2', '#e5cc9c', '#dccfc4'];

export class IslandShape {
  readonly R: number;
  /** feature scale: ledges, beds and lips shrink on small islands so a 2 m rock still reads as one */
  readonly sc: number;
  readonly noise: Noise;
  readonly rng: () => number;
  readonly cliffDepth: number;
  readonly underDepth: number;
  readonly wob: number;
  readonly bands: Band[] = [];
  readonly streams: Stream[] = [];
  readonly drifts: Drift[] = [];
  /** top of the first bed: just under the highest point of the lip (see lipBottom for the cliff top at an angle) */
  Y0 = -1;
  /** the underside leans this way (local x, z at its base) */
  tipX = 0; tipZ = 0;
  /** the shell's underside stops this far down (0..1 of underDepth); lobes hang on below */
  readonly vEnd = 0.6;
  private userH?: (x: number, z: number) => number;
  private outlineCache: Float32Array;
  private bays: { a: number; w: number; d: number }[] = [];
  /** whole stretches of cliff that step back below a bed, and how far */
  private steps: { k: number; a: number; w: number; d: number }[] = [];
  private leanA = 0; private leanK = 0;

  constructor(o: { seed: number; radius: number; wobble?: number; topHeight?: (x: number, z: number) => number; cliffDepth: number; underDepth: number; waterfalls?: WaterfallSpec[] }) {
    this.R = o.radius;
    this.sc = clamp(o.radius / 12, 0.14, 1.3);
    this.rng = makeRng(o.seed);
    this.noise = new Noise(o.seed * 131 + 7);
    this.cliffDepth = o.cliffDepth;
    this.underDepth = o.underDepth;
    this.wob = o.wobble ?? 0.85;
    this.userH = o.topHeight;
    const rng = this.rng;
    // big bites out of the outline, and a promontory or two
    const nb = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < nb; i++) this.bays.push({ a: rng() * TAU, w: 0.14 + rng() * 0.3, d: -(0.14 + rng() * 0.2) });
    for (let i = 0; i < 1 + Math.floor(rng() * 2); i++) this.bays.push({ a: rng() * TAU, w: 0.2 + rng() * 0.3, d: 0.08 + rng() * 0.12 });
    // the outline is sampled once into a table, so edge(angle) is cheap for the game
    this.outlineCache = new Float32Array(721);
    for (let i = 0; i <= 720; i++) this.outlineCache[i] = this.outlineRaw((i / 720) * TAU);
    for (const wf of o.waterfalls ?? []) this.streams.push(this.planStream(wf));
    // the beds start under the highest point of the lip; where the lip is lower, the top beds are simply cut off
    // by it, so the cliff under the turf is never one tall blank bed
    let maxE = -Infinity;
    for (let i = 0; i < 180; i++) maxE = Math.max(maxE, this.lipBottom((i / 180) * TAU));
    this.Y0 = maxE - 0.02;
    const lean = rng() * TAU, ld = this.R * (0.1 + rng() * 0.18);
    this.tipX = Math.cos(lean) * ld; this.tipZ = Math.sin(lean) * ld;
    // one side of the cliff leans in toward the bottom more than the other
    this.leanA = rng() * TAU; this.leanK = 0.05 + rng() * 0.12;
    this.planBands();
    // two or three stretches of cliff step back hard below some bed (big overhangs, as in the pictures)
    const nCliff = this.bands.filter(b => b.top > -this.cliffDepth).length;
    for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
      this.steps.push({ k: 2 + Math.floor(rng() * Math.max(1, nCliff - 3)), a: rng() * TAU, w: 0.5 + rng() * 0.9, d: (0.6 + rng() * 0.9) * this.sc });
    }
  }

  // ---------------------------------------------------------------- outline and top

  private outlineRaw(a: number) {
    const c = Math.cos(a), s = Math.sin(a);
    const big = this.noise.fbm(c * 1.1 + 3.1, s * 1.1, 0.7, 3);
    const mid = this.noise.n3(c * 3.2, s * 3.2 + 5.3, 2.2);
    const small = this.noise.n3(c * 8.5 + 1.7, s * 8.5, 6.1);
    let bay = 0;
    for (const b of this.bays) {
      const d = Math.atan2(Math.sin(a - b.a), Math.cos(a - b.a)) / b.w;
      bay += b.d * Math.exp(-d * d * 2.2);
    }
    return this.R * Math.max(0.5, 1 + this.wob * (0.42 * big + 0.15 * mid + 0.045 * small + bay));
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

  /** Turf thickness at the lip at this angle (metres): ragged, thin in places and thick with soil in others. */
  turf(a: number) {
    const n = this.noise.n3(Math.cos(a) * 6 + 2, 3.3, Math.sin(a) * 6) * 0.5 + 0.5;
    const f = this.noise.n3(Math.cos(a) * 17, 7.7, Math.sin(a) * 17) * 0.5 + 0.5;
    return this.sc * (0.55 + 0.75 * n + 0.3 * f);
  }

  /** Height of the underside of the turf at the lip, at this angle: the top of the rock there. */
  lipBottom(a: number) { return this.edgeY(a) - this.turf(a); }

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
      pts.push(new THREE.Vector2(u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y));
    }
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
    // the water only ever runs downhill: a running minimum of the meadow along the path
    const wl: number[] = [], w: number[] = [];
    let lvl = Infinity;
    // the stream is narrower than the fall: the water spreads out as it goes over the lip
    const sw = Math.min(wf.width * 0.6, 1.2 + this.R * 0.12);
    for (let i = 0; i < pts.length; i++) {
      const t = i / (pts.length - 1);
      lvl = Math.min(lvl, this.baseHeight(pts[i].x, pts[i].y) - 0.3 * Math.max(0.6, this.sc));
      wl.push(lvl - smoothstep(0.75, 1, t) * 0.25 * this.sc);
      w.push(sw * (0.5 + 0.5 * t + 0.5 * smoothstep(0.85, 1, t)));
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
    const wl = lerp(st.wl[bi], st.wl[bi + 1], bf), w = lerp(st.w[bi], st.w[bi + 1], bf);
    return { d: Math.sqrt(best), wl, w, t: (bi + bf) / (P.length - 1) };
  }

  // ---------------------------------------------------------------- strata

  private planBands() {
    const rng = this.rng, sc = this.sc;
    // small rocks keep a handful of beds rather than dozens of slivers
    const hs = Math.max(0.35, sc);
    const bottom = -this.cliffDepth - this.underDepth * this.vEnd - 0.5;
    let y = this.Y0, prevCol = -1, k = 0;
    while (y > bottom) {
      const kind = rng();
      const under = y < -this.cliffDepth;
      // many thin beds of mixed thickness: hard thin ones stick out as ledges, soft thicker ones weather back
      let h: number, off: number;
      if (k === 0) { h = (0.7 + rng() * 0.6) * hs; off = 0; }
      else if (kind < 0.3) { h = (0.28 + rng() * 0.32) * hs; off = (0.22 + rng() * 0.4) * sc; }
      else if (kind < 0.55) { h = (0.7 + rng() * 0.9) * hs; off = -(0.2 + rng() * 0.4) * sc; }
      else { h = (0.4 + rng() * 0.7) * hs; off = (rng() - 0.5) * 0.36 * sc; }
      if (under) h *= 1.35;
      let ci = Math.floor(rng() * BAND_COLS.length);
      if (ci === prevCol) ci = (ci + 3) % BAND_COLS.length;
      // the cool bed is rare
      if (ci === 7 && rng() < 0.5) ci = 1;
      prevCol = ci;
      // blocks: the bed is cut by vertical joints into blocks a few metres wide, each set a little in or out
      const blockW = (1.8 + rng() * 2.6) * Math.max(0.35, sc);
      const nb = Math.max(3, Math.round((TAU * this.R) / blockW));
      const blocks: number[] = [];
      for (let i = 0; i < nb; i++) blocks.push((rng() - 0.5) * 0.5 * sc);
      this.bands.push({ top: y, bot: y - h, off, col: new THREE.Color(BAND_COLS[ci]), nb, phase: rng() * nb, blocks, groove: (0.18 + rng() * 0.22) * sc, seed: rng() * 100 });
      y -= h; k++;
    }
  }

  bandIndex(y: number) {
    const B = this.bands;
    for (let i = 0; i < B.length; i++) if (y >= B[i].bot) return i;
    return B.length - 1;
  }
  band(i: number) { return this.bands[i]; }

  /** Underside profile: the share of the cliff radius left at depth v (0 at the cliff base, vEnd at the shell's end). */
  underProfile(v: number, a: number) {
    // broad and chunky: it keeps most of its width for a while, then pulls in, in a different way round the island
    const lob = this.noise.n3(Math.cos(a) * 1.5 + 7, v * 1.3, Math.sin(a) * 1.5);
    const k = 1.15 + 0.5 * lob;
    return Math.max(0.12, 1 - Math.pow(v / this.vEnd, k) * 0.72) * (1 + 0.16 * lob * smoothstep(0, 0.3, v));
  }

  /**
   * The rock wall at an angle and height: its radius about the (possibly leaning) axis, the axis offset, how deep
   * into a joint this point sits (0..1), how far down the underside it is (0..1) and the bed.
   */
  wall(a: number, y: number, bandI = this.bandIndex(y)) {
    const sc = this.sc;
    const B = this.bands[bandI];
    const ca = Math.cos(a), sa = Math.sin(a);
    const Rt = this.outline(a);
    const vb = clamp((B.top - y) / Math.max(1e-3, B.top - B.bot));
    const p = (a / TAU) * B.nb + B.phase;
    const i = Math.floor(p), f = p - i;
    const bi = ((i % B.nb) + B.nb) % B.nb;
    // a ledge runs part of the way round and dies out elsewhere
    const reach = smoothstep(-0.35, 0.45, this.noise.n3(ca * 1.4 + B.seed, B.seed * 0.37, sa * 1.4));
    let o = B.off * (B.off > 0 ? reach : 0.4 + 0.6 * reach) + lerp(B.blocks[bi], B.blocks[(bi + 1) % B.nb], smoothstep(0.9, 1, f));
    const blockW = (TAU * Rt) / B.nb;
    const jd = Math.min(f, 1 - f) * blockW;
    const joint = 1 - smoothstep(0, 0.3 * Math.max(0.4, sc), jd);
    o -= joint * B.groove;
    // a crisp small chamfer at the top of each bed, a hint of fullness in its middle
    o += 0.05 * sc * Math.sin(Math.PI * vb) - 0.07 * sc * (1 - smoothstep(0, 0.12, vb * (B.top - B.bot) / Math.max(0.3, sc)));
    const fq = 0.2 / Math.max(0.3, sc);
    const x = ca * this.R, z = sa * this.R;
    o += 0.22 * sc * this.noise.fbm(x * fq, B.seed, z * fq, 2);
    // buttresses and bays that run down through many beds, so the cliff is never a drum
    o += 1.1 * sc * this.noise.n3(ca * 2.6 + 4, y * 0.025 / Math.max(0.3, sc), sa * 2.6);
    // whole stretches step back hard below a given bed
    for (const s of this.steps) {
      if (bandI < s.k) continue;
      const d = Math.atan2(Math.sin(a - s.a), Math.cos(a - s.a)) / s.w;
      o -= s.d * Math.exp(-d * d * 2.5);
    }
    const base = Rt - 0.32 * sc;
    const lean = this.leanK * (0.5 + 0.5 * Math.cos(a - this.leanA));
    if (y >= -this.cliffDepth) {
      const df = clamp((this.Y0 - y) / (this.Y0 + this.cliffDepth));
      return { r: Math.max(0.05, base * (1 - 0.04 * df - lean * df) + o), cx: 0, cz: 0, joint, v: 0, band: B };
    }
    // the underside: broad, stepped and lobed, its base leaning off-centre
    const v = clamp((-this.cliffDepth - y) / this.underDepth, 0, this.vEnd);
    const prof = this.underProfile(v, a);
    const r = Math.max(0.05, (base * (1 - 0.04 - lean) + o * 1.2) * prof);
    const lv = v / this.vEnd;
    return { r, cx: this.tipX * lv * lv, cz: this.tipZ * lv * lv, joint, v, band: B };
  }
}

/** Smooth minimum. */
export function smin(a: number, b: number, k: number) {
  const h = clamp(0.5 + 0.5 * (b - a) / k);
  return lerp(b, a, h) - k * h * (1 - h);
}

// ------------------------------------------------------------------------------------------- the shell mesh

const C = (s: string) => new THREE.Color(s);
const GRASS = [C('#76a843'), C('#8cbc4e'), C('#a3cc5c'), C('#bad466')];
const SOIL = C('#94704a'), SOIL_D = C('#76573c');
const MOSS = C('#82ac48'), MOSS_D = C('#68983f'), MOSS_L = C('#a6c45a');
const EARTH = C('#cdb08c'), BED = C('#9a967a'), SAND = C('#dccca2');

/**
 * The attributes every piece of an island body carries, so they merge into one draw:
 * color, aRock (0 grass .. 1 limestone), aBand (metres below the top of this bed, metres above its bottom),
 * aLedge (+ a ledge sticks out above this face, - the bed above overhangs it; 0 none). Normals come per section.
 */
export class BodyBuilder {
  pos: number[] = []; col: number[] = []; rock: number[] = []; band: number[] = []; ledge: number[] = []; idx: number[] = [];
  /** finished sections, each with its own normals */
  parts: THREE.BufferGeometry[] = [];
  vert(x: number, y: number, z: number, c: THREE.Color, r: number, bd = 50, bu = 50, l = 0) {
    this.pos.push(x, y, z); this.col.push(c.r, c.g, c.b); this.rock.push(r); this.band.push(bd, bu); this.ledge.push(l);
    return this.pos.length / 3 - 1;
  }
  /** Grid rows of N points (closed rings): quads between consecutive rows, outward winding when rows go down. */
  ringGrid(first: number, rows: number, N: number) {
    for (let k = 0; k < rows - 1; k++) for (let j = 0; j < N; j++) {
      const a = first + k * N + j, b = first + k * N + ((j + 1) % N), c = first + (k + 1) * N + j, d = first + (k + 1) * N + ((j + 1) % N);
      this.idx.push(a, b, c, b, d, c);
    }
  }
  /** Close the section so far into its own geometry (normals smoothed only inside it). */
  cut() {
    if (!this.idx.length) { this.reset(); return; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aRock', new THREE.Float32BufferAttribute(this.rock, 1));
    g.setAttribute('aBand', new THREE.Float32BufferAttribute(this.band, 2));
    g.setAttribute('aLedge', new THREE.Float32BufferAttribute(this.ledge, 1));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    this.parts.push(g);
    this.reset();
  }
  private reset() { this.pos = []; this.col = []; this.rock = []; this.band = []; this.ledge = []; this.idx = []; }
  /** Everything as one geometry (index kept). */
  merge(): THREE.BufferGeometry { this.cut(); return this.parts.length === 1 ? this.parts[0] : mergeGeometries(this.parts, false)!; }
}

/** Give a plain geometry (a block, a chunk) the body attributes, so it merges with the island body. */
export function asBody(g: THREE.BufferGeometry, rock = 1): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(0.85), 3));
  if (!g.attributes.aRock) g.setAttribute('aRock', new THREE.Float32BufferAttribute(new Float32Array(n).fill(rock), 1));
  g.setAttribute('aBand', new THREE.Float32BufferAttribute(new Float32Array(n * 2).fill(50), 2));
  g.setAttribute('aLedge', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  if (g.attributes.uv) g.deleteAttribute('uv');
  // the shell is indexed; a flat-shaded piece gets a plain index so they still merge
  if (!g.index) g.setIndex(Array.from({ length: n }, (_, i) => i));
  return g;
}

export interface ShellOut {
  geo: THREE.BufferGeometry;
  /** up-facing ledge points (on the strips between beds), for grass, moss tufts and hanging growth */
  ledges: { p: THREE.Vector3; n: THREE.Vector3; a: number; w: number }[];
  /** points along the lip for the overhanging fringe: position, normal, angle */
  lip: { p: THREE.Vector3; n: THREE.Vector3; a: number }[];
  /** points under the turf edge, where soil, roots and drapes hang from */
  lipUnder: { p: THREE.Vector3; a: number }[];
  /** where the shell's underside ends: its centre (local) and the bottom ring's mean radius */
  base: { c: THREE.Vector3; r: number };
}

/** Grass colour of the meadow at (x, z): soft patches, lighter dabs, flower drifts, sand on the stream banks. */
export function meadowColor(sh: IslandShape, x: number, z: number, out = new THREE.Color()) {
  const n = sh.noise;
  const k = n.fbm(x * 0.09, 4.2, z * 0.09, 2) * 0.5 + 0.5;
  const d = n.n3(x * 0.35, 9.1, z * 0.35) * 0.5 + 0.5;
  out.copy(GRASS[0]).lerp(GRASS[1], smoothstep(0.2, 0.55, k)).lerp(GRASS[2], smoothstep(0.55, 0.85, k));
  out.lerp(GRASS[3], smoothstep(0.7, 0.9, d) * 0.6);
  for (const f of sh.drifts) {
    const dd = Math.hypot(x - f.x, z - f.z);
    if (dd < f.r) out.lerp(TMP.copy(f.col).lerp(WHITE, 0.15), (1 - smoothstep(f.r * 0.35, f.r, dd)) * 0.55);
  }
  for (const st of sh.streams) {
    const q = sh.nearest(st, x, z);
    const half = q.w * 0.5;
    out.lerp(SAND, 1 - smoothstep(half - 0.1, half + 0.7, q.d));
    out.lerp(BED, 1 - smoothstep(half * 0.5, half, q.d));
  }
  return out;
}
const TMP = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1), WET = new THREE.Color('#dfe7e6');

/** 1 right where a waterfall pours over the lip at this angle, 0 away from it. */
function fallWet(sh: IslandShape, a: number) {
  let w = 0;
  for (const st of sh.streams) {
    const half = (st.spec.width * 0.55) / sh.outline(st.spec.angle);
    const d = Math.abs(Math.atan2(Math.sin(a - st.spec.angle), Math.cos(a - st.spec.angle)));
    w = Math.max(w, 1 - smoothstep(half * 0.8, half * 1.3, d));
  }
  return w;
}

/**
 * The whole outer skin: the top (rings from the centre out) and the ragged turf lip as one smooth section; then for
 * every bed of the cliff and underside one face section and one ledge strip joining it to the next bed (flat where
 * a bed sticks out, so ledge tops catch the sun with a sharp edge, and facing down where a bed overhangs); then a
 * jagged cap closing the underside. N: points round each ring.
 */
export function buildShell(sh: IslandShape, N: number, bare = false): ShellOut {
  const sc = sh.sc, s4 = Math.max(0.4, sc);
  const B = new BodyBuilder();
  const tmp = new THREE.Color();
  const nTop = Math.max(3, Math.ceil(sh.R / 0.8));
  const rockTop = (x: number, z: number) => tmp.copy(sh.band(0).col).multiplyScalar(0.96 + 0.08 * sh.noise.n3(x, 1, z));
  const lip: ShellOut['lip'] = [], lipUnder: ShellOut['lipUnder'] = [];
  // ---- the top
  for (let i = 0; i <= nTop; i++) {
    const s = i / nTop;
    for (let j = 0; j < N; j++) {
      const a = (j / N) * TAU, Rt = sh.outline(a);
      const x = Math.cos(a) * Rt * s, z = Math.sin(a) * Rt * s;
      const y = sh.height(x, z);
      if (bare) B.vert(x, y, z, rockTop(x, z), 1);
      else B.vert(x, y, z, meadowColor(sh, x, z, tmp), 0);
    }
  }
  // ---- the lip: the turf bulges out over the edge by a ragged amount, then tucks back under, soil showing in
  // broken patches between tongues of grass reaching down over it
  const lipU = [0.18, 0.4, 0.62, 0.82, 1];
  const lipEnd = new Float32Array(N);
  for (const u of lipU) {
    for (let j = 0; j < N; j++) {
      const a = (j / N) * TAU, Rt = sh.outline(a), yE = sh.edgeY(a), T = sh.turf(a);
      // where a waterfall goes over, the lip is worn smooth and wet: no bulge, pale water-worn stone
      const wet = fallWet(sh, a);
      const over = sc * (0.25 + 0.35 * (sh.noise.n3(Math.cos(a) * 9, 1.1, Math.sin(a) * 9) * 0.5 + 0.5)) * (1 - wet);
      const r = Rt + over * Math.sin(Math.PI * Math.min(1, u * 1.2)) - 0.34 * sc * u;
      const y = yE - T * Math.pow(u, 1.15);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (u === 1) lipEnd[j] = y;
      if (bare) { B.vert(x, y, z, rockTop(x, z), 1); continue; }
      meadowColor(sh, x, z, tmp);
      const tongue = sh.noise.n3(Math.cos(a) * 23, 4.4, Math.sin(a) * 23) * 0.5 + 0.5;
      const soil = smoothstep(0.5, 0.95, u + 0.25 * sh.noise.n3(x * 0.8, 2, z * 0.8) - 0.35 * tongue);
      tmp.lerp(u > 0.9 ? SOIL_D : SOIL, soil * (1 - wet)).lerp(WET, wet * smoothstep(0.1, 0.4, u));
      B.vert(x, y, z, tmp, soil * 0.3 * (1 - wet));
      if (u === 0.4) lip.push({ p: new THREE.Vector3(x, y, z), n: new THREE.Vector3(Math.cos(a), 0.6, Math.sin(a)).normalize(), a });
      if (u === 0.82) lipUnder.push({ p: new THREE.Vector3(x, y, z), a });
    }
  }
  B.ringGrid(0, nTop + 1 + lipU.length, N);
  B.cut();
  // ---- the beds
  const NB = sh.bands.length;
  const yBottom = -sh.cliffDepth - sh.underDepth * sh.vEnd;
  type RingPt = { x: number; y: number; z: number; r: number; w: ReturnType<IslandShape['wall']> };
  /** ring of a bed at height y (or at per-angle heights) */
  const ring = (bi: number, y: number, ys?: Float32Array): RingPt[] => {
    const out: RingPt[] = [];
    for (let j = 0; j < N; j++) {
      const a = (j / N) * TAU;
      const yy = ys ? ys[j] : y;
      const w = sh.wall(a, yy, bi);
      out.push({ x: w.cx + Math.cos(a) * w.r, y: yy, z: w.cz + Math.sin(a) * w.r, r: w.r, w });
    }
    return out;
  };
  const ledges: ShellOut['ledges'] = [];
  let prevBottom: RingPt[] | null = null;
  let prevBand = -1;
  // ledge amount at each angle, for the face below the strip
  const ledgeAmt = new Float32Array(N).fill(bare ? 0 : 1);
  for (let bi = 0; bi < NB; bi++) {
    const Bd = sh.bands[bi];
    if (bi > 0 && Bd.top <= yBottom + 0.05) break;
    const bot = Math.max(Bd.bot, yBottom);
    const h = Bd.top - bot;
    const under = Bd.top < -sh.cliffDepth;
    const step = (under ? 1.0 : 0.75) * s4;
    // rows: the top, a chamfer row just under it, even rows, the bottom
    const ts: number[] = [0];
    const ch = Math.min(0.1 * s4, h * 0.2);
    if (h > 0.35 * s4) ts.push(ch / h);
    const nIn = Math.max(0, Math.round(h / step) - 1);
    for (let i = 1; i <= nIn; i++) { const t = i / (nIn + 1); if (t > ch / h + 0.05) ts.push(t); }
    ts.push(1);
    // every row is cut off by the turf above it: beds above the lip at some angle shrink to nothing there
    const rows: RingPt[][] = [];
    for (const t of ts) {
      const ys = new Float32Array(N);
      for (let j = 0; j < N; j++) ys[j] = Math.min(lerp(Bd.top, bot, t), lipEnd[j] - 0.02 * sc);
      rows.push(ring(bi, 0, ys));
    }
    // ---- the strip from the bed above (its bottom ring) to this bed's top ring
    if (prevBottom) {
      const first = B.pos.length / 3;
      const r0 = prevBottom, r1 = rows[0];
      for (const [rr, isUpper] of [[r0, true], [r1, false]] as const) for (let j = 0; j < N; j++) {
        const q = rr[j];
        const dr = r1[j].r - r0[j].r; // + this bed sticks out under the one above: a ledge top
        const k = sh.noise.n3(q.x * 0.5, q.y * 0.5, q.z * 0.5) * 0.5 + 0.5;
        const mossy = !bare && dr > 0.08 * s4 && q.y > yBottom + 2 ? smoothstep(0.08, 0.35, dr / s4) * (0.55 + 0.45 * k) : 0;
        tmp.copy(isUpper ? sh.band(prevBand).col : Bd.col);
        if (q.w.v > 0) tmp.lerp(EARTH, smoothstep(0, 0.6, q.w.v) * 0.45);
        tmp.lerp(k > 0.5 ? MOSS_L : MOSS, mossy * 0.95);
        B.vert(q.x, q.y, q.z, tmp, 1 - mossy, 0, 50, dr > 0 ? 2 : -2);
      }
      B.ringGrid(first, 2, N);
      B.cut();
      for (let j = 0; j < N; j++) {
        const dr = r1[j].r - r0[j].r;
        // still right under the turf (the beds above were cut off here): moss drips from the turf
        if (lipEnd[j] - 0.02 * sc - r1[j].y < 0.05 * sc && !bare) { ledgeAmt[j] = 1; continue; }
        ledgeAmt[j] = dr > 0.06 * s4 ? Math.min(1, dr / (0.4 * s4)) : dr < -0.06 * s4 ? -Math.min(1, -dr / (0.4 * s4)) : 0;
        if (!bare && dr > 0.25 * s4 && r1[j].y > -sh.cliffDepth - sh.underDepth * 0.25) {
          const a = (j / N) * TAU;
          const p0 = new THREE.Vector3((r0[j].x + r1[j].x) / 2, r1[j].y, (r0[j].z + r1[j].z) / 2);
          ledges.push({ p: p0, n: new THREE.Vector3(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3).normalize(), a, w: dr });
        }
      }
    }
    // ---- the face
    const first = B.pos.length / 3;
    for (let k = 0; k < rows.length; k++) for (let j = 0; j < N; j++) {
      const q = rows[k][j];
      const w = q.w;
      const ca = Math.cos((j / N) * TAU), sa = Math.sin((j / N) * TAU);
      tmp.copy(w.band.col);
      // broad vertical water stains, broken bed by bed (so they never fan out into a star from below)
      const stain = smoothstep(0.4, 0.8, sh.noise.n3(ca * sh.R * 0.6 / s4, bi * 0.37, sa * sh.R * 0.6 / s4));
      tmp.multiplyScalar(1 - stain * 0.08 - w.joint * 0.16);
      // deeper under the island the rock turns a little warmer and earthier
      if (w.v > 0) tmp.lerp(EARTH, smoothstep(0, 0.6, w.v) * 0.45).multiplyScalar(1 - 0.12 * w.v);
      let rk = 1;
      const yTop = Math.min(Bd.top, lipEnd[j] - 0.02 * sc);
      if (!bare && lipEnd[j] - q.y < 1.2 * sc) {
        // a ragged band of moss right under the turf
        const mn = sh.noise.n3(ca * 7.3 + 1, 0.5, sa * 7.3) * 0.5 + 0.5;
        const m = 1 - smoothstep(0, (0.15 + 0.7 * mn) * sc, lipEnd[j] - q.y);
        tmp.lerp(mn > 0.5 ? MOSS : MOSS_D, m * 0.9);
        rk = 1 - m * 0.8;
      }
      B.vert(q.x, q.y, q.z, tmp, rk, yTop - q.y, q.y - bot, ledgeAmt[j]);
    }
    B.ringGrid(first, rows.length, N);
    B.cut();
    prevBottom = rows[rows.length - 1];
    prevBand = bi;
  }
  // ---- the cap: the underside closes in a jagged, broken base (the lobes hang from it)
  const cx = sh.tipX, cz = sh.tipZ;
  const last = prevBottom!;
  let rb = 0;
  for (const q of last) rb += q.r / N;
  {
    const first = B.pos.length / 3;
    const yb = last[0].y;
    const capRows = [0, 0.45, 0.8, 1];
    for (const t of capRows) for (let j = 0; j < N; j++) {
      const a = (j / N) * TAU, q = last[j];
      const jag = sh.noise.n3(Math.cos(a) * 1.6 + 3, t * 1.5, Math.sin(a) * 1.6) * 0.5 + 0.5;
      const x = lerp(q.x, cx, t), z = lerp(q.z, cz, t);
      const y = yb - sh.underDepth * 0.08 * Math.sin(Math.PI * t * 0.9) * (0.4 + jag) - (t === 1 ? sh.underDepth * 0.06 : 0);
      tmp.copy(q.w.band.col).lerp(EARTH, 0.5).multiplyScalar(0.86);
      B.vert(x, y, z, tmp, 1);
    }
    B.ringGrid(first, capRows.length, N);
    B.cut();
  }
  return { geo: B.merge(), ledges, lip, lipUnder, base: { c: new THREE.Vector3(cx, last[0].y, cz), r: rb } };
}

/**
 * A lobe of rock hanging under the island: stepped beds of the same limestone, each bed set in or out, narrowing to
 * a point that splits into two or three sub-points of different lengths. Its top sits inside the body above it.
 * Returns geometry with the body attributes (it merges with the shell).
 */
export function buildLobe(sh: IslandShape, cx: number, cz: number, y0: number, r0: number, len: number, N: number, seed: number, split = true): THREE.BufferGeometry {
  const B = new BodyBuilder();
  const rng = makeRng(seed * 13 + sh.R);
  const tmp = new THREE.Color();
  const s4 = Math.max(0.4, sh.sc);
  const lean = rng() * TAU, ld = r0 * (0.3 + rng() * 0.5);
  const lx = Math.cos(lean) * ld, lz = Math.sin(lean) * ld;
  // bed cuts down the lobe
  const cuts: number[] = [y0];
  let y = y0;
  while (y > y0 - len + 0.05) { y -= (0.6 + rng() * 1.4) * s4 * 1.2; cuts.push(Math.max(y, y0 - len)); }
  const prof = (v: number, a: number) => {
    // chunky: the lobe keeps its girth most of the way down, then breaks off into its points
    const k = 1.7 + 0.6 * sh.noise.n3(Math.cos(a) * 1.7 + seed, v, Math.sin(a) * 1.7);
    return Math.max(0, 1 - Math.pow(v, k)) * (0.85 + 0.15 * (1 - v));
  };
  const offs = cuts.map(() => (rng() - 0.4) * 0.22);
  const radAt = (bi: number, yy: number, a: number) => {
    const v = clamp((y0 - yy) / len);
    const n = sh.noise.n3(Math.cos(a) * 2.2 + seed * 3, bi * 0.7, Math.sin(a) * 2.2);
    return r0 * prof(v, a) * (1 + offs[bi] + 0.22 * n);
  };
  type P = { x: number; y: number; z: number; r: number };
  let prev: P[] | null = null;
  for (let bi = 0; bi < cuts.length - 1; bi++) {
    const top = cuts[bi], bot = cuts[bi + 1];
    if (top - bot < 0.05) break;
    const nr = Math.max(1, Math.round((top - bot) / (0.9 * s4)));
    const rows: P[][] = [];
    for (let k = 0; k <= nr; k++) {
      const yy = lerp(top, bot, k / nr), v = clamp((y0 - yy) / len);
      const row: P[] = [];
      for (let j = 0; j < N; j++) {
        const a = (j / N) * TAU;
        const r = Math.max(0.03, radAt(bi, yy, a));
        row.push({ x: cx + lx * v * v + Math.cos(a) * r, y: yy, z: cz + lz * v * v + Math.sin(a) * r, r });
      }
      rows.push(row);
    }
    const col = sh.band(sh.bandIndex(top)).col;
    if (prev) {
      const first = B.pos.length / 3;
      const p0 = prev;
      for (const rr of [p0, rows[0]]) for (let j = 0; j < N; j++) {
        const q = rr[j];
        tmp.copy(col).lerp(EARTH, 0.4);
        B.vert(q.x, q.y, q.z, tmp, 1, 0, 50, rows[0][j].r > p0[j].r ? 2 : -2);
      }
      B.ringGrid(first, 2, N); B.cut();
    }
    const first = B.pos.length / 3;
    for (let k = 0; k < rows.length; k++) for (let j = 0; j < N; j++) {
      const q = rows[k][j], v = clamp((y0 - q.y) / len);
      tmp.copy(col).lerp(EARTH, 0.3 + 0.25 * v).multiplyScalar(0.96 - 0.12 * v);
      B.vert(q.x, q.y, q.z, tmp, 1, top - q.y, q.y - bot, prev ? (rows[0][j].r > prev[j].r ? 1 : -1) : 0);
    }
    B.ringGrid(first, rows.length, N); B.cut();
    prev = rows[rows.length - 1];
  }
  // close the bottom to a short point
  if (prev) {
    const first = B.pos.length / 3;
    let mx = 0, mz = 0;
    for (const q of prev) { mx += q.x / N; mz += q.z / N; }
    const yb = prev[0].y;
    tmp.copy(EARTH).multiplyScalar(0.85);
    for (const q of prev) B.vert(q.x, q.y, q.z, tmp, 1);
    for (let j = 0; j < N; j++) B.vert(mx, yb - 0.25 * s4, mz, tmp, 1);
    B.ringGrid(first, 2, N); B.cut();
  }
  const parts = [B.merge()];
  // the point splits into two or three sub-points of different lengths
  if (split && len > 2.5 * s4) {
    const n = 2 + Math.floor(rng() * 2);
    const vS = 0.5 + rng() * 0.12;
    const yS = y0 - len * vS;
    const rS = r0 * prof(vS, 0) * 0.85;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng() * 1.2;
      const d = rS * (0.3 + rng() * 0.3);
      const px = cx + lx * vS * vS + Math.cos(a) * d, pz = cz + lz * vS * vS + Math.sin(a) * d;
      parts.push(buildLobe(sh, px, pz, yS + 0.3 * s4, rS * (0.5 + rng() * 0.25), len * (0.3 + rng() * 0.35), Math.max(7, Math.round(N * 0.6)), seed * 7 + i + 1, false));
    }
  }
  return parts.length > 1 ? mergeGeometries(parts, false)! : parts[0];
}

/**
 * A broken block of limestone (a jittered prism with flat top and bottom and hard edges), for blocks hanging from
 * the underside and for rubble. Body attributes, so it merges with the shell.
 */
export function rockBlock(rng: () => number, w: number, h: number, col: THREE.Color, mossTop = 0): THREE.BufferGeometry {
  const sides = 5 + Math.floor(rng() * 3);
  const g0 = new THREE.CylinderGeometry(w, w * (0.7 + rng() * 0.25), h, sides, 1);
  const p = g0.attributes.position as THREE.BufferAttribute;
  const jit: number[] = [];
  for (let i = 0; i <= sides; i++) jit.push(0.75 + rng() * 0.45);
  const yj: number[] = [];
  for (let i = 0; i <= sides; i++) yj.push((rng() - 0.5) * 0.3 * h);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    if (Math.hypot(x, z) < 1e-4) continue;
    const k = Math.round(((Math.atan2(z, x) + Math.PI) / TAU) * sides) % sides;
    p.setXYZ(i, x * jit[k], y + (y < 0 ? yj[k] : yj[k] * 0.25), z * jit[k]);
  }
  g0.deleteAttribute('normal'); g0.deleteAttribute('uv');
  const g = g0.toNonIndexed();
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const cols = new Float32Array(n * 3), rk = new Float32Array(n);
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const tmp = new THREE.Color(), moss = C('#86ae4a');
  for (let i = 0; i < n; i++) {
    const up = nrm.getY(i) > 0.7 ? mossTop : 0;
    tmp.copy(col).multiplyScalar(nrm.getY(i) < -0.5 ? 0.9 : 1).lerp(moss, up);
    cols.set([tmp.r, tmp.g, tmp.b], i * 3); rk[i] = 1 - up;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setAttribute('aRock', new THREE.BufferAttribute(rk, 1));
  return asBody(g);
}
