import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise, smoothstep, clamp, lerp } from '../noise';

// The form of one floating island, as pure functions of local space (+Y up, the island's lip near y = 0):
// - an irregular outline, R(angle), with bays and promontories at three scales, and a notch cut back into the cliff
//   wherever a waterfall goes over, so the rock wraps round the falling water;
// - a walkable top, height(x, z), with stream channels carved down to each waterfall's lip;
// - a cliff of limestone masses: vertical joints split it into big columns and buttresses with rounded recesses
//   between them; horizontal beds 1 to 4 m thick run through the columns, each column setting its beds a little in
//   or out so the beds jog across the joints; only a few hard beds stand out as strong ledges, and their undersides
//   are eroded round, so the form comes from blocks and overhangs, not from rings;
// - a heavy underside of big flat facets, its strata fading toward the tip, from which the builder hangs one or two
//   broken lobes.
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
  /** the bed's own warm or cool tint, multiplied onto the body's gradient */
  tint: THREE.Color;
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

// limestone: the body runs from pale warm cream under the lip, through mid gold, to a cool shaded tan-violet on the
// underside (rockGradient); the beds alternate warm and cool tints at clearly different values on top of that
const ROCK_GRAD = [C0('#f7ebd2'), C0('#ecd3a2'), C0('#e0bf8c'), C0('#cdb497'), C0('#b8a89f')];
const WARM_T = [C0('#fff6e4'), C0('#fff0d6'), C0('#fff8ea')];
const COOL_T = [C0('#e0dde0'), C0('#d8d6dc'), C0('#e6e2e2')];
function C0(s: string) { return new THREE.Color(s); }

/** A column of the cliff between two vertical joints: angles, how far it stands out, how it leans, its joint depth. */
interface Column { a0: number; a1: number; off: number; lean: number; joint: number; seed: number }

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
  /** notches cut for the waterfalls: angle, half-width (radians), depth (metres) */
  private notches: { a: number; w: number; d: number }[] = [];
  /** the cliff's columns, in angle order from cols[0].a0 round to cols[0].a0 + TAU */
  private cols: Column[] = [];
  /** how much the cliff narrows from the lip to its base (share of the radius) */
  readonly taper: number;
  /** facets of the underside: values at (facet, row) nodes, interpolated linearly so faces stay flat */
  private facets: Float32Array; private nFacet: number;

  constructor(o: { seed: number; radius: number; wobble?: number; topHeight?: (x: number, z: number) => number; cliffDepth: number; underDepth: number; waterfalls?: WaterfallSpec[]; taper?: number }) {
    this.R = o.radius;
    this.sc = clamp(o.radius / 12, 0.14, 1.3);
    this.rng = makeRng(o.seed);
    this.noise = new Noise(o.seed * 131 + 7);
    this.cliffDepth = o.cliffDepth;
    this.underDepth = o.underDepth;
    this.wob = o.wobble ?? 0.85;
    this.userH = o.topHeight;
    this.taper = o.taper ?? 0.06;
    const rng = this.rng;
    // the waterfalls each cut a round-backed notch into the lip and on down the cliff
    for (const wf of o.waterfalls ?? []) this.notches.push({ a: wf.angle, w: (wf.width * 0.5 + 1.1 * this.sc) / this.R, d: Math.min(this.R * 0.12, wf.width * 0.45 + 0.9 * this.sc) });
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
    this.planColumns();
    this.planBands();
    // the underside's facets: a coarse grid round and down it
    this.nFacet = Math.max(5, Math.round(5 + this.R * 0.45));
    this.facets = new Float32Array(this.nFacet * 8);
    // small rocks break more boldly, so an islet is a broken stone and never a smooth top
    const famp = this.R < 4 ? 0.55 : 0.32;
    for (let i = 0; i < this.facets.length; i++) this.facets[i] = 1 + (rng() - 0.5) * famp;
    // two or three stretches of cliff step back hard below some bed (big overhangs, as in the pictures)
    const nCliff = this.bands.filter(b => b.top > -this.cliffDepth).length;
    for (let i = 0; i < 1 + Math.floor(rng() * 2); i++) {
      this.steps.push({ k: 1 + Math.floor(rng() * Math.max(1, nCliff - 2)), a: rng() * TAU, w: 0.4 + rng() * 0.6, d: (0.8 + rng() * 1.0) * this.sc });
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
    const r = this.R * Math.max(0.5, 1 + this.wob * (0.42 * big + 0.15 * mid + 0.045 * small + bay));
    return r - this.notchDepth(a);
  }
  /** How far the waterfall notches cut back into the outline at this angle (metres): a flat-backed U. */
  notchDepth(a: number) {
    let d = 0;
    for (const n of this.notches) {
      const u = Math.abs(Math.atan2(Math.sin(a - n.a), Math.cos(a - n.a))) / n.w;
      d = Math.max(d, n.d * (1 - smoothstep(0.55, 1.15, u)));
    }
    return d;
  }
  /** 1 inside a waterfall notch, fading to 0 at its shoulders. */
  inNotch(a: number) {
    let k = 0;
    for (const n of this.notches) {
      const u = Math.abs(Math.atan2(Math.sin(a - n.a), Math.cos(a - n.a))) / n.w;
      k = Math.max(k, 1 - smoothstep(0.6, 1.4, u));
    }
    return k;
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

  /** Vertical joints split the cliff into columns 3 to 8 m wide; each stands out or back and leans its own way. */
  private planColumns() {
    const rng = this.rng, sc = this.sc, s3 = Math.max(0.35, sc);
    const start = rng() * TAU;
    let a = start;
    while (a < start + TAU - 1e-3) {
      const w = (3 + rng() * 5) * s3 / this.R;
      const a1 = Math.min(start + TAU, a + w);
      // a deep, rounded recess between big buttresses, or now and then only a tight crack
      const deep = rng() < 0.7;
      this.cols.push({ a0: a, a1, off: (rng() - 0.45) * 1.3 * sc, lean: (rng() - 0.5) * 0.09, joint: (deep ? 0.55 + rng() * 0.8 : 0.15) * sc, seed: rng() * 100 });
      a = a1;
    }
    // the last column must not be a sliver
    if (this.cols.length > 2 && this.cols[this.cols.length - 1].a1 - this.cols[this.cols.length - 1].a0 < 1.5 * s3 / this.R) {
      const last = this.cols.pop()!;
      this.cols[this.cols.length - 1].a1 = last.a1;
    }
  }
  /** A column's tone: brightness and warmth, so neighbouring blocks of the cliff read apart. */
  columnTone(a: number, _y: number) {
    const c = this.column(a, this.outline(a)).c;
    const h = Math.sin(c.seed * 91.7) * 0.5 + 0.5;
    return { k: 0.95 + 0.08 * h, warm: 0.12 * (1 - h) };
  }
  /** The column at an angle, and how far (metres) the point is from the nearer of its two joints. */
  column(a: number, Rt: number) {
    const C = this.cols, a0 = C[0].a0;
    const t = a0 + ((((a - a0) % TAU) + TAU) % TAU);
    let lo = 0, hi = C.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (C[m].a0 <= t) lo = m; else hi = m - 1; }
    const c = C[lo];
    const dPrev = (t - c.a0) * Rt, dNext = (c.a1 - t) * Rt;
    // the recess takes the depth of the joint it is next to
    const jPrev = C[(lo - 1 + C.length) % C.length].joint, jNext = c.joint;
    return { i: lo, c, d: Math.min(dPrev, dNext), jd: dPrev < dNext ? jPrev : jNext, u: (t - c.a0) / Math.max(1e-5, c.a1 - c.a0) };
  }

  private planBands() {
    const rng = this.rng, sc = this.sc;
    // small rocks keep a handful of beds rather than dozens of slivers
    const hs = Math.max(0.3, sc);
    const bottom = -this.cliffDepth - this.underDepth * this.vEnd - 0.5;
    let y = this.Y0, k = 0;
    // only a few hard beds stand out as strong ledges (about one every 4-6 m of cliff)
    let nextLedge = (2 + rng() * 3) * hs;
    while (y > bottom) {
      const under = y < -this.cliffDepth;
      // beds of very mixed thickness, 1 to 4 m
      let h = (k === 0 ? 1.2 + rng() * 1.2 : 1 + Math.pow(rng(), 1.4) * 3) * hs;
      // most beds run flush with the one above: they read by colour and a faint line, not by a step
      let off = (rng() - 0.5) * 0.08 * sc;
      if (!under && this.Y0 - y > nextLedge) {
        // a hard bed: thinner, standing well out
        off = (0.55 + rng() * 0.7) * sc;
        h = (0.8 + rng() * 0.9) * hs;
        nextLedge = this.Y0 - y + (4 + rng() * 3) * hs;
      } else if (rng() < 0.2) off = -(0.25 + rng() * 0.3) * sc;
      if (under) h *= 1.3;
      // warm and cool beds alternate (now and then two of a kind together), hard beds always warm and pale
      let warm = (k % 2 === 0) !== (rng() < 0.2);
      if (off > 0.3 * sc) warm = true;
      const fam = warm ? WARM_T : COOL_T;
      const tint = fam[Math.floor(rng() * fam.length)].clone();
      const col = this.rockGradient(y - h * 0.5).multiply(tint);
      this.bands.push({ top: y, bot: y - h, off, col, tint, nb: 0, phase: 0, blocks: [], groove: (0.08 + rng() * 0.1) * sc, seed: rng() * 100 });
      y -= h; k++;
    }
  }

  /** The body's vertical value gradient: pale cream at the lip, gold through the middle, cool tan-violet below. */
  rockGradient(y: number, out = new THREE.Color()) {
    const t = clamp((this.Y0 - y) / Math.max(1, this.cliffDepth));
    const v = clamp((-this.cliffDepth - y) / Math.max(1, this.underDepth * this.vEnd));
    const G = ROCK_GRAD;
    if (t < 1) {
      if (t < 0.35) return out.copy(G[0]).lerp(G[1], smoothstep(0, 0.35, t));
      return out.copy(G[1]).lerp(G[2], smoothstep(0.35, 1, t));
    }
    if (v < 0.5) return out.copy(G[2]).lerp(G[3], smoothstep(0, 0.5, v));
    return out.copy(G[3]).lerp(G[4], smoothstep(0.5, 1, v));
  }
  /** Rock colour at a height in a bed: the gradient times the bed's tint. */
  rockColor(y: number, bi: number, out = new THREE.Color()) {
    return this.rockGradient(y, out).multiply(this.bands[Math.min(bi, this.bands.length - 1)].tint);
  }

  bandIndex(y: number) {
    const B = this.bands;
    for (let i = 0; i < B.length; i++) if (y >= B[i].bot) return i;
    return B.length - 1;
  }
  band(i: number) { return this.bands[i]; }

  /** Underside profile: the share of the cliff radius left at depth v (0 at the cliff base, vEnd at the shell's end). */
  underProfile(v: number, a: number) {
    // heavy: it keeps most of its girth for a while, then pulls in, in a different way round the island
    const lob = this.noise.n3(Math.cos(a) * 1.3 + 7, v * 1.1, Math.sin(a) * 1.3);
    const k = 1.5 + 0.5 * lob;
    // broken by setbacks: the girth pulls in by steps (a flat-bottomed overhang, then a steep face), never a cone
    const steps = 4, sv = (v / this.vEnd) * steps + 0.35 * lob;
    const fi = Math.floor(sv), ff = sv - fi;
    const stepped = (fi + smoothstep(0.7, 0.95, ff)) / steps;
    const vv = lerp(v / this.vEnd, clamp(stepped), 0.75);
    return Math.max(0.14, 1 - Math.pow(vv, k) * 0.7) * (1 + 0.12 * lob * smoothstep(0, 0.3, v));
  }
  /** The underside's big flat facets: a coarse grid of values, interpolated linearly (so faces stay planar). */
  private facet(a: number, v: number) {
    const n = this.nFacet;
    const fa = ((((a / TAU) % 1) + 1) % 1) * n, fr = Math.min(6.999, (v / this.vEnd) * 6);
    const i = Math.floor(fa), j = Math.floor(fr), u = fa - i, w = fr - j;
    const F = this.facets, at = (ii: number, jj: number) => F[(ii % n) * 8 + jj];
    return lerp(lerp(at(i, j), at(i + 1, j), u), lerp(at(i, j + 1), at(i + 1, j + 1), u), w);
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
    const h = Math.max(1e-3, B.top - B.bot);
    const vb = clamp((B.top - y) / h);
    const notch = this.inNotch(a);
    // ---- the column: its own stand-out and lean, and a rounded recess at each joint
    const col = this.column(a, Rt);
    const c = col.c;
    const depthRaw = clamp((this.Y0 - y) / Math.max(1, this.cliffDepth));
    // the taper comes in setbacks (three or four steps, each a flat-bottomed overhang), never as a smooth cone
    const nS = 3 + (Math.floor(this.leanA * 10) % 2), ks = depthRaw * nS + 0.3 * this.noise.n3(ca * 1.4, 3.3, sa * 1.4);
    const depthK = lerp(depthRaw, clamp((Math.floor(ks) + smoothstep(0.75, 0.97, ks - Math.floor(ks))) / nS), 0.8);
    let o = c.off + c.lean * (this.Y0 - y);
    const jw = (0.5 + 0.9 * col.jd / Math.max(0.2, sc)) * Math.max(0.35, sc);
    const joint = 1 - smoothstep(0, jw, col.d);
    o -= col.jd * joint * joint * (3 - 2 * joint);
    // every column bulges out in the middle and every bed swells between its joints, so a face is a rounded mass of
    // stone that shades from lit to shade across it, never a flat panel
    o += 0.5 * sc * (Math.sqrt(Math.max(0, Math.sin(Math.PI * col.u))) - 0.55);
    o += 0.22 * sc * Math.sin(Math.PI * vb) * (h > 0.6 * sc ? 1 : 0.4);
    // ---- the bed: it runs through every column, but each column sets it a little in or out, so beds jog at joints
    const hsh = Math.sin((col.i + 1) * 12.9898 + bandI * 78.233) * 43758.5453;
    const jog = (hsh - Math.floor(hsh) - 0.5) * 0.22 * sc;
    // a hard bed stands out only along part of the island, and dies out elsewhere
    const reach = smoothstep(-0.2, 0.35, this.noise.n3(ca * 1.2 + B.seed, B.seed * 0.37, sa * 1.2));
    const bo = B.off > 0.3 * sc ? B.off * reach : B.off;
    o += bo + jog;
    // erosion: the bottom of every bed is worn back and rounded (hard beds into a round-nosed overhang), the top
    // keeps a crisp small chamfer
    const nose = Math.max(0, bo) * 0.85 + 0.03 * sc;
    o -= nose * Math.pow(smoothstep(0.3, 1.0, vb), 1.7);
    o -= 0.06 * sc * (1 - smoothstep(0, 0.1, vb * h / Math.max(0.3, sc)));
    // weathering at two scales, so faces are never flat sheets
    const fq = 0.16 / Math.max(0.3, sc);
    const x = ca * this.R, z = sa * this.R;
    o += 0.28 * sc * this.noise.fbm(x * fq, y * fq * 0.7 + B.seed, z * fq, 2);
    // big buttresses and bays running down the whole cliff
    o += 0.9 * sc * this.noise.n3(ca * 2.2 + 4, y * 0.02 / Math.max(0.3, sc), sa * 2.2);
    // whole stretches step back hard below a given bed
    for (const s of this.steps) {
      if (bandI < s.k) continue;
      const d = Math.atan2(Math.sin(a - s.a), Math.cos(a - s.a)) / s.w;
      o -= s.d * Math.exp(-d * d * 2.5);
    }
    // in a waterfall's notch the rock is worn smooth by the water: little of the blockiness
    o *= 1 - 0.8 * notch;
    const base = Rt - 0.32 * sc;
    const lean = this.leanK * (0.5 + 0.5 * Math.cos(a - this.leanA));
    if (y >= -this.cliffDepth) {
      return { r: Math.max(0.05, base * (1 - this.taper * depthK - lean * depthK) + o), cx: 0, cz: 0, joint, v: 0, band: B };
    }
    // ---- the underside: heavy, in big flat facets, the blockiness of the beds fading out toward its tip
    const v = clamp((-this.cliffDepth - y) / this.underDepth, 0, this.vEnd);
    const lv = v / this.vEnd;
    const prof = this.underProfile(v, a) * this.facet(a, v);
    const r = Math.max(0.05, (base * (1 - this.taper - lean) + o * (1 - 0.65 * smoothstep(0, 1, lv))) * prof);
    return { r, cx: this.tipX * lv * lv, cz: this.tipZ * lv * lv, joint: joint * (1 - lv), v, band: B };
  }
}

const a0j = (j: number, N: number) => (j / N) * TAU;

/** Smooth minimum. */
export function smin(a: number, b: number, k: number) {
  const h = clamp(0.5 + 0.5 * (b - a) / k);
  return lerp(b, a, h) - k * h * (1 - h);
}

// ------------------------------------------------------------------------------------------- the shell mesh

const C = (s: string) => new THREE.Color(s);
const GRASS = [C('#76a843'), C('#8cbc4e'), C('#a3cc5c'), C('#bad466')];
const SOIL = C('#94704a'), SOIL_D = C('#6a4d36'), ROOTS = C('#4f3626');
const MOSS = C('#86a84a'), MOSS_D = C('#6e9440'), MOSS_L = C('#a2bc5a');
const EARTH = C('#c9a47a'), BED = C('#9a967a'), SAND = C('#dccca2');

/**
 * The attributes every piece of an island body carries, so they merge into one draw:
 * color, aRock (0 grass .. 1 limestone), aAO (baked occlusion 0..1: recesses, joints, under ledges and the turf),
 * aBand (metres below the top of this bed, metres above its bottom),
 * aLedge (+ a ledge sticks out above this face, - the bed above overhangs it; 0 none), aUnder (0 on the cliff, rising
 * to 1 at the underside's tip: the strata fade out with it). Normals come per section.
 */
export class BodyBuilder {
  pos: number[] = []; col: number[] = []; rock: number[] = []; band: number[] = []; ledge: number[] = []; under: number[] = []; ao: number[] = []; mant: number[] = []; idx: number[] = [];
  /** finished sections, each with its own normals */
  parts: THREE.BufferGeometry[] = [];
  vert(x: number, y: number, z: number, c: THREE.Color, r: number, bd = 50, bu = 50, l = 0, un = 0, ao = 0, mant = -50) {
    this.pos.push(x, y, z); this.col.push(c.r, c.g, c.b); this.rock.push(r); this.band.push(bd, bu); this.ledge.push(l); this.under.push(un); this.ao.push(ao); this.mant.push(mant);
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
    g.setAttribute('aUnder', new THREE.Float32BufferAttribute(this.under, 1));
    g.setAttribute('aAO', new THREE.Float32BufferAttribute(this.ao, 1));
    g.setAttribute('aMantle', new THREE.Float32BufferAttribute(this.mant, 1));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    this.parts.push(g);
    this.reset();
  }
  private reset() { this.pos = []; this.col = []; this.rock = []; this.band = []; this.ledge = []; this.under = []; this.ao = []; this.mant = []; this.idx = []; }
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
  if (!g.attributes.aUnder) g.setAttribute('aUnder', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  if (!g.attributes.aAO) g.setAttribute('aAO', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  if (!g.attributes.aMantle) g.setAttribute('aMantle', new THREE.Float32BufferAttribute(new Float32Array(n).fill(-50), 1));
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
  out.lerp(GRASS[3], smoothstep(0.75, 0.95, d) * 0.25);
  for (const f of sh.drifts) {
    const dd = Math.hypot(x - f.x, z - f.z);
    // the ground under a drift takes its colour, so it reads as a patch of colour from the far side of the gap
    if (dd < f.r * 1.1) out.lerp(TMP.copy(f.col), (1 - smoothstep(f.r * 0.3, f.r * 1.1, dd)) * 0.3);
  }
  for (const st of sh.streams) {
    const q = sh.nearest(st, x, z);
    const half = q.w * 0.5;
    out.lerp(SAND, 1 - smoothstep(half - 0.1, half + 0.7, q.d));
    out.lerp(BED, 1 - smoothstep(half * 0.5, half, q.d));
  }
  return out;
}
const TMP = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1), WET = new THREE.Color('#c9c2a6');

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
 * jagged cap closing the underside. Below the turf a skirt of soil tucks into the rock, so no sky shows at the seam.
 * Every vertex carries baked occlusion (aAO). N: points round each ring.
 */
export function buildShell(sh: IslandShape, N: number, bare = false): ShellOut {
  const sc = sh.sc, s4 = Math.max(0.4, sc);
  const B = new BodyBuilder();
  const tmp = new THREE.Color();
  const nTop = Math.max(3, Math.ceil(sh.R / 0.8));
  const rockTop = (x: number, z: number) => sh.rockGradient(sh.Y0, tmp).multiply(sh.band(0).tint).multiplyScalar(0.96 + 0.08 * sh.noise.n3(x, 1, z));
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
  const lipEnd = new Float32Array(N), turfEndR = new Float32Array(N);
  for (const u of lipU) {
    for (let j = 0; j < N; j++) {
      const a = (j / N) * TAU, Rt = sh.outline(a), yE = sh.edgeY(a), T = sh.turf(a);
      // where a waterfall goes over, the lip is worn smooth and wet: no bulge, pale water-worn stone
      const wet = fallWet(sh, a);
      const over = sc * (0.25 + 0.35 * (sh.noise.n3(Math.cos(a) * 9, 1.1, Math.sin(a) * 9) * 0.5 + 0.5)) * (1 - wet);
      const r = Rt + over * Math.sin(Math.PI * Math.min(1, u * 1.2)) - 0.34 * sc * u;
      const y = yE - T * Math.pow(u, 1.15);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (u === 1) { lipEnd[j] = y; turfEndR[j] = r; }
      if (bare) { B.vert(x, y, z, rockTop(x, z), 1); continue; }
      meadowColor(sh, x, z, tmp);
      const tongue = sh.noise.n3(Math.cos(a) * 23, 4.4, Math.sin(a) * 23) * 0.5 + 0.5;
      const soil = smoothstep(0.5, 0.95, u + 0.25 * sh.noise.n3(x * 0.8, 2, z * 0.8) - 0.35 * tongue);
      tmp.lerp(u > 0.9 ? SOIL_D : SOIL, soil * (1 - wet)).lerp(WET, wet * smoothstep(0.1, 0.4, u));
      B.vert(x, y, z, tmp, soil * 0.3 * (1 - wet), 50, 50, 0, 0, smoothstep(0.5, 1, u) * 0.45);
      if (u === 0.4) lip.push({ p: new THREE.Vector3(x, y, z), n: new THREE.Vector3(Math.cos(a), 0.6, Math.sin(a)).normalize(), a });
      if (u === 0.82) lipUnder.push({ p: new THREE.Vector3(x, y, z), a });
    }
  }
  /**
   * The rock wall at row height yy, never standing out past the turf right under it (so the turf always covers
   * the top of the cliff), blending back to the true wall over the first metre or two.
   */
  const topBlend = 1.6 * s4;
  const rockR = (j: number, yy: number, w: ReturnType<IslandShape['wall']>) => {
    const below = lipEnd[j] - yy;
    if (below >= topBlend) return w.r;
    const cap = turfEndR[j] - 0.12 * sc;
    return lerp(Math.min(w.r, cap), w.r, smoothstep(0, topBlend, below));
  };
  // ---- the skirt: soil and roots carrying the turf down and in, into the rock, so no sky shows between turf and
  // stone anywhere round the rim (a dark band of earth under the overhang, as in the pictures)
  const skirtRows = bare ? [] : [0.3, 0.75];
  for (const k of skirtRows) for (let j = 0; j < N; j++) {
    const a = (j / N) * TAU;
    const y = lipEnd[j] - k * 0.9 * s4;
    const w = sh.wall(a, y);
    const rIn = Math.min(rockR(j, y, w), turfEndR[j]) - (k < 0.5 ? 0.02 : 0.3) * s4;
    const r = k < 0.5 ? lerp(turfEndR[j], rIn, 0.6) : rIn;
    const x = w.cx + Math.cos(a) * r, z = w.cz + Math.sin(a) * r;
    const wet = fallWet(sh, a);
    tmp.copy(SOIL_D).lerp(ROOTS, 0.35 * (sh.noise.n3(x * 1.3, y, z * 1.3) * 0.5 + 0.5)).lerp(WET, wet);
    B.vert(x, y, z, tmp, 0.3, 50, 50, 0, 0, 0.75);
  }
  B.ringGrid(0, nTop + 1 + lipU.length + skirtRows.length, N);
  B.cut();
  // ---- moss mantles: in places round the island the moss runs from the turf a fifth to a third of the way down
  // the cliff, its lower edge ragged (the hanging growth in islandDressing gives it body)
  const mantle = new Float32Array(N);
  if (!bare) for (let j = 0; j < N; j++) {
    const a = (j / N) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const where = smoothstep(-0.15, 0.35, sh.noise.n3(ca * 1.7 + 9, 2.2, sa * 1.7)) + 0.6 * fallWet(sh, a);
    const rag = 0.55 + 0.45 * (sh.noise.n3(ca * 14, 5.1, sa * 14) * 0.5 + 0.5);
    mantle[j] = Math.min(1, where) * sh.cliffDepth * (0.2 + 0.15 * rag) + 0.8 * sc;
  }
  /** metres above the mantle's lower edge (+ inside the moss); the shader adds the fine ragged edge */
  const mantleD = (j: number, y: number, x: number, z: number) => {
    if (bare || mantle[j] <= 0) return -50;
    const edge = mantle[j] * (0.75 + 0.5 * (sh.noise.n3(x * 0.25, y * 0.12, z * 0.25) * 0.5 + 0.5));
    return edge - (lipEnd[j] - y);
  };
  // ---- the beds
  const NB = sh.bands.length;
  const yBottom = -sh.cliffDepth - sh.underDepth * sh.vEnd;
  type RingPt = { x: number; y: number; z: number; r: number; w: ReturnType<IslandShape['wall']> };
  /** ring of a bed at per-angle heights */
  const ring = (bi: number, ys: Float32Array): RingPt[] => {
    const out: RingPt[] = [];
    for (let j = 0; j < N; j++) {
      const a = (j / N) * TAU;
      const yy = ys[j];
      const w = sh.wall(a, yy, bi);
      const r = rockR(j, yy, w);
      out.push({ x: w.cx + Math.cos(a) * r, y: yy, z: w.cz + Math.sin(a) * r, r, w });
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
    const step = (under ? 1.1 : 0.55) * s4;
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
      rows.push(ring(bi, ys));
    }
    // ---- the strip from the bed above (its bottom ring) to this bed's top ring
    if (prevBottom) {
      const first = B.pos.length / 3;
      const r0 = prevBottom, r1 = rows[0];
      for (const [rr, isUpper] of [[r0, true], [r1, false]] as const) for (let j = 0; j < N; j++) {
        const q = rr[j];
        const dr = r1[j].r - r0[j].r; // + this bed sticks out under the one above: a ledge top
        const k = sh.noise.n3(q.x * 0.5, q.y * 0.5, q.z * 0.5) * 0.5 + 0.5;
        // moss in patches along the ledge tops, not a continuous band
        const patch = smoothstep(-0.15, 0.35, sh.noise.n3(q.x * 0.12 / s4, q.y * 0.05, q.z * 0.12 / s4));
        const mossy = !bare && dr > 0.08 * s4 && q.y > yBottom + 2 ? smoothstep(0.1, 0.45, dr / s4) * (0.55 + 0.45 * k) * patch : 0;
        sh.rockColor(q.y, isUpper ? prevBand : bi, tmp);
        tmp.lerp(k > 0.6 ? MOSS : MOSS_D, mossy * 0.9);
        // occlusion: the inner corner of a ledge top, and the whole underside of an overhang
        const ao = dr > 0 ? (isUpper ? 0.45 : 0.05) : clamp(-dr / (0.3 * s4)) * 0.75;
        B.vert(q.x, q.y, q.z, tmp, 1 - mossy, 0, 50, dr > 0 ? 2 : -2, q.w.v / sh.vEnd, ao, mantleD(j, q.y, q.x, q.z));
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
      sh.rockColor(q.y, bi, tmp);
      // each column is its own block of stone: a touch paler or warmer than its neighbours
      const cs = sh.columnTone(a0j(j, N), q.y);
      tmp.multiplyScalar(cs.k).lerp(EARTH, cs.warm * 0.6);
      // broad vertical water stains, broken bed by bed (so they never fan out into a star from below)
      const stain = smoothstep(0.4, 0.8, sh.noise.n3(ca * sh.R * 0.6 / s4, bi * 0.37, sa * sh.R * 0.6 / s4));
      tmp.multiplyScalar(1 - stain * 0.06);
      let rk = 1;
      const yTop = Math.min(Bd.top, lipEnd[j] - 0.02 * sc);
      // the moss mantle, and a ragged band of moss right under the turf everywhere else
      const mk = mantleD(j, q.y, q.x, q.z);
      if (!bare) {
        const mn = sh.noise.n3(ca * 7.3 + 1, 0.5, sa * 7.3) * 0.5 + 0.5;
        const m = 1 - smoothstep(0, (0.15 + 0.7 * mn) * sc, lipEnd[j] - q.y);
        tmp.lerp(mn > 0.5 ? MOSS : MOSS_D, m * 0.9);
        rk = 1 - m * 0.85;
      }
      // ---- baked occlusion: hollows (from the ring's neighbours), joints, the top of a bed under an overhang, the
      // worn-back foot of every bed, the rock right under the turf, and a little more down the underside
      const R = rows[k];
      const rbar = (R[(j + N - 2) % N].r + R[(j + 2) % N].r + R[(j + N - 1) % N].r + R[(j + 1) % N].r) * 0.25;
      const rv = (rows[Math.max(0, k - 1)][j].r + rows[Math.min(rows.length - 1, k + 1)][j].r) * 0.5;
      const cav = clamp(((rbar - q.r) + 0.6 * (rv - q.r)) / (0.35 * s4));
      const dTop = yTop - q.y, dBot = q.y - bot;
      let ao = cav * 0.7 + w.joint * 0.45;
      if (ledgeAmt[j] < 0) ao += (1 - smoothstep(0, 1.4 * s4, dTop)) * 0.8 * -ledgeAmt[j];
      else if (ledgeAmt[j] > 0 && bi > 0) ao += (1 - smoothstep(0, 0.6 * s4, dTop)) * 0.25;
      ao += (1 - smoothstep(0, 0.45 * s4, dBot)) * 0.3;
      ao += (1 - smoothstep(0, 1.4 * s4, lipEnd[j] - q.y)) * 0.55 * (bare ? 0.3 : 1);
      ao += 0.2 * w.v / sh.vEnd;
      B.vert(q.x, q.y, q.z, tmp, rk, dTop, dBot, ledgeAmt[j], w.v / sh.vEnd, clamp(ao), mk);
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
      sh.rockColor(y, NB - 1, tmp).multiplyScalar(0.92);
      B.vert(x, y, z, tmp, 1, 50, 50, 0, 1, 0.35);
    }
    B.ringGrid(first, capRows.length, N);
    B.cut();
  }
  return { geo: B.merge(), ledges, lip, lipUnder, base: { c: new THREE.Vector3(cx, last[0].y, cz), r: rb } };
}

/**
 * A lobe of rock hanging under the island: a heavy broken mass in tiers, as in the pictures. Each tier is a
 * faceted drum (seven to nine sides, its corners pushed in and out) whose foot steps in under a flat-bottomed
 * overhang to the next, smaller tier, each tier set off to one side of the last, so the taper is broken by setbacks
 * and never a cone. The last tier breaks into one blunt point and, on the bigger lobes, one or two shorter
 * sub-points. Its top sits inside the body above it. Flat-shaded, coloured from the body's gradient, with baked
 * occlusion under every overhang. Returns geometry with the body attributes (it merges with the shell).
 */
export function buildLobe(sh: IslandShape, cx: number, cz: number, y0: number, r0: number, len: number, _N: number, seed: number, split = true): THREE.BufferGeometry {
  const rng = makeRng(seed * 13 + sh.R);
  const s4 = Math.max(0.4, sh.sc);
  const sides = 7 + Math.floor(rng() * 3);
  const a0 = rng() * TAU;
  const tmp = new THREE.Color();
  const pos: number[] = [], col: number[] = [], under: number[] = [], aos: number[] = [];
  // the profile: rows of (drop, radius share, centre drift, occlusion)
  type Row = { y: number; r: number; dx: number; dz: number; ao: number };
  const rows: Row[] = [];
  const tiers = Math.max(2, Math.min(5, Math.round(len / (3.2 * s4))));
  let y = y0, r = r0, dx = 0, dz = 0;
  const drift = rng() * TAU;
  for (let i = 0; i < tiers; i++) {
    const last = i === tiers - 1;
    const h = (len / tiers) * (0.75 + rng() * 0.5);
    rows.push({ y, r, dx, dz, ao: i === 0 ? 0 : 0.55 });
    rows.push({ y: y - h * 0.3, r: r * (1.02 + rng() * 0.05), dx, dz, ao: i === 0 ? 0 : 0.2 });
    if (last) {
      // the point: two quick pulls in to a blunt tip
      rows.push({ y: y - h * 0.75, r: r * 0.55, dx: dx + Math.cos(drift) * r * 0.15, dz: dz + Math.sin(drift) * r * 0.15, ao: 0.15 });
      rows.push({ y: y - h * 1.25, r: 0, dx: dx + Math.cos(drift) * r * 0.3, dz: dz + Math.sin(drift) * r * 0.3, ao: 0.3 });
      break;
    }
    rows.push({ y: y - h * 0.82, r: r * (0.9 + rng() * 0.06), dx, dz, ao: 0.1 });
    // the setback: a nearly flat step in, off to one side
    const nr = r * (0.58 + rng() * 0.17);
    const off = (r - nr) * (0.3 + rng() * 0.5), oa = drift + (rng() - 0.5) * 2.2;
    dx += Math.cos(oa) * off; dz += Math.sin(oa) * off;
    y -= h; r = nr;
  }
  // the corner grid (row 0 a little wider, so the lobe's top is buried in the body above it)
  const P: THREE.Vector3[][] = rows.map((q, k) => {
    const ring: THREE.Vector3[] = [];
    for (let j = 0; j < sides; j++) {
      const a = a0 + (j / sides) * TAU + (rng() - 0.5) * 0.35;
      const rr = q.r * (k === 0 ? 1.08 : 0.8 + rng() * 0.38);
      ring.push(new THREE.Vector3(cx + q.dx + Math.cos(a) * rr, q.y + (k > 0 && q.r > 0 ? (rng() - 0.5) * 0.35 * s4 : 0), cz + q.dz + Math.sin(a) * rr));
    }
    return ring;
  });
  const tri = (p: THREE.Vector3[], ao: number[]) => {
    // one colour per facet, so each reads as a broken face; from the body's gradient at its height
    const my = (p[0].y + p[1].y + p[2].y) / 3;
    const n = sh.noise.n3(p[0].x * 0.3, p[0].y * 0.3, p[0].z * 0.3);
    sh.rockColor(my, sh.bandIndex(my), tmp).multiplyScalar(0.97 + 0.07 * n);
    const v = clamp((-sh.cliffDepth - my) / Math.max(1, sh.underDepth));
    for (let i = 0; i < 3; i++) { const q = p[i]; pos.push(q.x, q.y, q.z); col.push(tmp.r, tmp.g, tmp.b); under.push(0.4 + 0.6 * v); aos.push(ao[i]); }
  };
  for (let k = 0; k < rows.length - 1; k++) for (let j = 0; j < sides; j++) {
    const a = P[k][j], b = P[k][(j + 1) % sides], c = P[k + 1][j], d = P[k + 1][(j + 1) % sides];
    const A = rows[k].ao, Cc = rows[k + 1].ao;
    // split each quad along its shorter diagonal, so the facets break naturally
    if (a.distanceToSquared(d) < b.distanceToSquared(c)) { tri([a, d, b], [A, Cc, A]); tri([a, c, d], [A, Cc, Cc]); }
    else { tri([a, c, b], [A, Cc, A]); tri([b, c, d], [A, Cc, Cc]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aUnder', new THREE.Float32BufferAttribute(under, 1));
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(aos, 1));
  g.computeVertexNormals();
  const parts = [asBody(g)];
  // one or two short, thick sub-points beside the main one, hanging from the underside of a middle tier
  if (split && len > 2.5 * s4 && rows.length > 4) {
    const n = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const k = 2 + 3 * Math.floor(rng() * Math.max(1, tiers - 1));
      const ring = P[Math.min(k, P.length - 2)];
      const j = Math.floor(rng() * sides);
      const c = ring[j].clone().lerp(ring[(j + 1) % sides], 0.5);
      const q = rows[Math.min(k, rows.length - 2)];
      const mx = cx + q.dx, mz = cz + q.dz;
      const rr = Math.hypot(c.x - mx, c.z - mz);
      const px = lerp(mx, c.x, 0.6), pz = lerp(mz, c.z, 0.6);
      parts.push(buildLobe(sh, px, pz, c.y + 0.4 * s4, rr * (0.42 + rng() * 0.15), (c.y - rows[rows.length - 1].y) * (0.35 + rng() * 0.25), 0, seed * 7 + i + 1, false));
    }
  }
  return parts.length > 1 ? mergeGeometries(parts, false)! : parts[0];
}

/**
 * A broken shard of limestone, for islets, chunks hanging from the underside and loose rubble: an irregular flat
 * fractured top (a hard rim where it broke off), sides that bulge and draw in, elongated down to a jagged bottom
 * of one main point and a few shorter ones. The sides are smooth-shaded large facets (shared corners), the top a
 * separate flat cap. Coloured pale at the top and cooler toward the point, with baked occlusion under the rim and
 * at the point. w: half-width, h: height. Body attributes, so it merges with the shell.
 */
export function rockBlock(rng: () => number, w: number, h: number, col: THREE.Color, mossTop = 0): THREE.BufferGeometry {
  const sides = 6 + Math.floor(rng() * 3);
  const sx = 0.75 + rng() * 0.5, sz = 0.7 + rng() * 0.4;
  const tilt = (rng() - 0.5) * 0.18;
  const tipX = (rng() - 0.5) * 0.5 * w, tipZ = (rng() - 0.5) * 0.5 * w;
  // corner angles and per-corner radii of the top (a fractured outline: some corners cut in)
  const angs: number[] = [], rad: number[] = [];
  for (let j = 0; j < sides; j++) { angs.push(((j + (rng() - 0.5) * 0.5) / sides) * TAU); rad.push(0.72 + rng() * 0.4); }
  // rows down the side: share of height, radius share
  const prof = [[0, 1], [0.12, 1.06 + rng() * 0.06], [0.38, 0.92 + rng() * 0.1], [0.62, 0.62 + rng() * 0.12], [0.84, 0.3 + rng() * 0.1]];
  const pos: number[] = [], cols: number[] = [], rk: number[] = [], ao: number[] = [], idx: number[] = [];
  const pale = col.clone().multiplyScalar(1.06), cool = col.clone().multiply(new THREE.Color('#c9c2c8'));
  const tmp = new THREE.Color(), moss = C('#86ae4a');
  const push = (x: number, y: number, z: number, c: THREE.Color, r: number, o: number) => { pos.push(x, y, z); cols.push(c.r, c.g, c.b); rk.push(r); ao.push(o); return pos.length / 3 - 1; };
  // the side grid
  const grid: number[][] = [];
  for (const [t, k] of prof) {
    const row: number[] = [];
    for (let j = 0; j < sides; j++) {
      const a = angs[j], rr = rad[j] * k * (t > 0 ? 0.88 + rng() * 0.24 : 1) * w;
      const x = Math.cos(a) * rr * sx + tipX * t * t, z = Math.sin(a) * rr * sz + tipZ * t * t;
      const y = -t * h + (t === 0 ? tilt * x : (rng() - 0.5) * 0.08 * h);
      tmp.copy(pale).lerp(cool, smoothstep(0.1, 0.9, t));
      const o = t === 0 ? 0 : (t < 0.2 ? 0.35 : 0) + smoothstep(0.5, 0.95, t) * 0.45;
      row.push(push(x, y, z, tmp, 1, o));
    }
    grid.push(row);
  }
  for (let k = 0; k < grid.length - 1; k++) for (let j = 0; j < sides; j++) {
    const a = grid[k][j], b = grid[k][(j + 1) % sides], c = grid[k + 1][j], d = grid[k + 1][(j + 1) % sides];
    idx.push(a, b, c, b, d, c);
  }
  // the jagged bottom: a main point and two or three shorter ones off the last ring
  const lastRow = grid[grid.length - 1];
  const tipY = -h * (1.05 + rng() * 0.25);
  tmp.copy(cool).multiplyScalar(0.92);
  const tip = push(tipX * 1.2, tipY, tipZ * 1.2, tmp, 1, 0.6);
  const sub = new Set<number>();
  for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) sub.add(Math.floor(rng() * sides));
  for (let j = 0; j < sides; j++) {
    const a = lastRow[j], b = lastRow[(j + 1) % sides];
    if (sub.has(j)) {
      // a shorter point hanging off this facet
      const mx = (pos[a * 3] + pos[b * 3]) / 2, mz = (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2;
      const s = push(mx * 1.1, -h * (0.88 + rng() * 0.15), mz * 1.1, tmp, 1, 0.5);
      idx.push(a, b, s, a, s, tip, s, b, tip);
    } else idx.push(a, b, tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the top: a separate flat cap (hard rim), mossy or pale broken stone
  const top = grid[0];
  const cpos: number[] = [], ccol: number[] = [], crk: number[] = [], cao: number[] = [], cidx: number[] = [];
  let cxm = 0, czm = 0;
  for (const i of top) { cxm += pos[i * 3] / sides; czm += pos[i * 3 + 2] / sides; }
  const capC = mossTop > 0 ? tmp.copy(pale).lerp(moss, mossTop) : tmp.copy(pale).multiplyScalar(1.04);
  const addC = (x: number, y: number, z: number) => { cpos.push(x, y, z); ccol.push(capC.r, capC.g, capC.b); crk.push(1 - mossTop); cao.push(0); return cpos.length / 3 - 1; };
  const cc = addC(cxm, tilt * cxm + 0.02 * h, czm);
  const ring = top.map(i => addC(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
  for (let j = 0; j < sides; j++) cidx.push(cc, ring[(j + 1) % sides], ring[j]);
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
  cap.setAttribute('color', new THREE.Float32BufferAttribute(ccol, 3));
  cap.setAttribute('aRock', new THREE.Float32BufferAttribute(crk, 1));
  cap.setAttribute('aAO', new THREE.Float32BufferAttribute(cao, 1));
  cap.setIndex(cidx);
  cap.computeVertexNormals();
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('aRock', new THREE.Float32BufferAttribute(rk, 1));
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  return mergeGeometries([asBody(g), asBody(cap)], false)!;
}
