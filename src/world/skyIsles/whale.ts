import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint, PAINT } from '../../render/paint';
import { CloudWake, claimCloudShadow, setCloudShadow, type HugPuff } from './whaleClouds';

/**
 * The sky whales of the Sky Isles: huge, gentle blue whales that swim slowly through the cloud sea
 * between the islands, with gulls riding on their backs.
 *
 * One shared geometry (built once at unit length, scaled per whale) holds the whole body, both pectoral
 * flippers, the dorsal fin and the fluke. Nothing is skinned: a vertex shader bends it along its spine with
 * a slow travelling wave (a heave of the whole spine, the head nodding a beat ahead, growing into big fluke
 * strokes), sweeps the flippers about their roots and lets the fluke tips trail. The same bend runs in the
 * shadow pass, and is mirrored on the CPU so the gulls, the ride anchor and the cloud wake stay glued to the
 * moving body.
 *
 * Shape: chunky like the pictures (about 4.5 : 1), the girth peaking just behind the flippers; a broad,
 * flat-topped rostrum (U-shaped from above) over a deep, heavy lower jaw and a sagging pleated throat; a back
 * flattened in section and a belly keeled towards the midline, so it never reads as a capsule; a tall, keeled
 * tail stock; long humpback flippers (cambered blades with bold leading-edge knobs) growing out of soft
 * shoulders; a wide fluke with a clear notch, a fleshy root and tips that droop and twist, so it shows area.
 *
 * Skin (fragment shader, in rest space so it never swims over the body): clear steel blue, deeper on the
 * ridge and lighter down the flank, painted like watercolour: soft darker pools, irregular paler mottles in
 * clumps and a dense salt of small light flecks (cellular noise, warped, at two scales, denser on the back),
 * brush strokes along the body, pale barnacle freckles in clusters on the head; a clean warm-cream belly whose
 * edge the dapples break up, with ventral pleats from the chin that wander in spacing, end one by one and fade
 * out before mid-body (antialiased by their pixel footprint); dark-topped flippers with clean cream
 * undersides; a small eye with a soft lid crease and a long mouth line sweeping back into the belly.
 *
 * Light: a MeshToonMaterial patched with paint() for the shared varyings, whose final colour is relit as a
 * soft three-tone design: a warm sunlit top, a lifted cool steel shade (never navy), sky fill on the back, a
 * bounce from the clouds through the pale belly, soft occlusion under the jaw, at the flipper roots and under
 * each sitting gull, and a soft rim. At golden hour the shade warms and dusts over in the low sun's glow and a
 * strong warm rim lights the edges, brightest against the light, so the whale stays luminous.
 * With cloudTop set, the whale rides the cloud tops: it melts into cloud-white where it dips below them (a
 * billowing edge) and is cut away further down, spreads its flippers, gathers solid cumulus heaps round its
 * lower flanks (CloudWake, in the game's own cloud style), leaves puffs behind and casts a soft shadow on the
 * cloud.
 *
 * Space: the whale faces +Z, up is +Y. The snout is at z = +length/2.
 * Cost (high detail): 25.0k triangles and 1 draw for the whale; 2 instanced draws for its gulls (9.9k
 * triangles for 5 sitting and 8 flying), plus the whale and the sitting gulls again in the shadow pass: 5 draws
 * in all. Low detail is 4.4k triangles. The cloud wake, when used, is one more instanced draw of up to 150
 * puffs (320 triangles each; about 60 in use, 20k triangles). All motion is in the vertex shader; the CPU only
 * moves the gulls (one instanced matrix each), the cloud heaps, and scans the body against the cloud tops a
 * few times a second for the wake.
 */

export interface SkyWhaleOpts {
  /** Nose to fluke tips, metres. Default 36. */
  length?: number;
  /** Varies the mottling, the swim rhythm and where the gulls sit. */
  seed?: number;
  /** Gulls riding on the back (a couple of them take off and circle now and then). Default 7, at most 8. */
  birds?: number;
  /** Mesh density. 'low' for far whales. */
  detail?: 'high' | 'low';
  /** World height of the cloud tops; when set, the whale melts into them and leaves a cloud wake. */
  cloudTop?: number | null;
  /** Gull size multiplier (1 = about 1.5 m long). */
  birdScale?: number;
  /** Gulls flying in a loose stream that rises off the back and trails behind the whale. Default 6. */
  flock?: number;
}

// ------------------------------------------------------------------------------------------------ shape

/** Where the body ends and the fluke begins (as a fraction of the length from the snout). */
const UB = 0.9;
/** The ride anchor, as a fraction of the length from the snout. */
const RIDE_U = 0.25;

// Body profile along t = u / UB: half-width, height of the back and depth of the belly (unit length).
// Chunky like the pictures (about 4.5 : 1): the girth peaks early, just behind the flippers, the deep head
// and lower jaw hang into a sagging pleated throat, and the body tapers into a tall, keeled tail stock.
const PT = [0.045, 0.1, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.86, 0.93, 1.0];
const PW = [0.072, 0.093, 0.104, 0.110, 0.110, 0.104, 0.093, 0.078, 0.060, 0.042, 0.026, 0.015];
const PH = [0.026, 0.043, 0.062, 0.080, 0.092, 0.095, 0.091, 0.082, 0.069, 0.055, 0.042, 0.025];
const PB = [0.060, 0.096, 0.124, 0.136, 0.131, 0.119, 0.102, 0.084, 0.065, 0.050, 0.038, 0.022];

function sstep(a: number, b: number, x: number) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

/** Monotone cubic interpolation through (xs, ys). */
function mono(xs: number[], ys: number[]) {
  const n = xs.length, d: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m.push(d[0]);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], s = (x - xs[i]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}
const fW = mono(PT, PW), fH = mono(PT, PH), fB = mono(PT, PB);

/** Half-width, back height and belly depth at u (0 snout .. UB end of the body). The rostrum tip is a broad U. */
function profile(u: number) {
  const t = u / UB;
  if (t < PT[0]) {
    const k = Math.sqrt(Math.max(0, 1 - (1 - t / PT[0]) ** 2));
    return { w: PW[0] * Math.pow(k, 0.5), h: PH[0] * Math.pow(k, 0.9), b: PB[0] * k };
  }
  return { w: fW(t), h: fH(t), b: fB(t) };
}

/** The painted mouth line (rest y, unit length) for u in 0..MOUTH_U: long and nearly straight, gently down, no hook. */
const MOUTH_U = 0.2;
function mouthY(u: number) { const x = Math.min(1, u / MOUTH_U); return -0.004 - 0.0125 * x + 0.0028 * x * x; }
const MOUTH_GLSL = `float whaleMouthY(float u){ float x = min(1.0, u / ${MOUTH_U.toFixed(3)}); return -0.004 - 0.0125 * x + 0.0028 * x * x; }`;

/** A point on the bare body surface at u, angle phi (0 = top, PI = belly, PI/2 = the +x side). */
function ringPoint(u: number, phi: number, out = new THREE.Vector3()) {
  const { w, h, b } = profile(u);
  const s = Math.sin(phi), c = Math.cos(phi);
  const t = u / UB;
  // superellipse exponents (< 1 is boxier, > 1 comes to a soft keel): a flat-topped rostrum, a broad, gently
  // flattened back, a round heavy jaw and throat, a belly that keels a little towards the midline, and a
  // tall tail stock with keels above and below
  const eTop = 0.6 + 0.2 * sstep(0.04, 0.3, t) + 0.4 * sstep(0.72, 0.97, t);
  const eBot = 0.8 + 0.28 * sstep(0.3, 0.6, t) + 0.25 * sstep(0.78, 0.97, t);
  const e = c >= 0 ? eTop : eBot;
  const x = w * Math.sign(s) * Math.abs(s) ** e;
  const y = (c >= 0 ? h : b) * Math.sign(c) * Math.abs(c) ** e;
  return out.set(x, y, 0.5 - u);
}

/** The eye centre (left side, rest space, unit length): just above and behind the end of the mouth. */
const EYE_U = 0.214;
function eyeCentre() {
  const target = mouthY(MOUTH_U) + 0.0072;
  let lo = 0.6, hi = 2.4;
  const p = new THREE.Vector3();
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; ringPoint(EYE_U, m, p); if (p.y > target) lo = m; else hi = m; }
  return ringPoint(EYE_U, (lo + hi) / 2, p).clone();
}

/** Reverse every triangle. */
function flipWinding(g: THREE.BufferGeometry) {
  const ix = g.index!.array as Uint32Array | Uint16Array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.index!.needsUpdate = true;
  return g;
}

/**
 * Loft rings (equal length, closed) into a tube with capped ends. `meta` gives the aW attribute per point.
 * Winding is fixed afterwards so the normals face out (checked against `outward` at one point).
 */
function loftRings(rings: THREE.Vector3[][], meta: number[][][], outward: (p: THREE.Vector3) => THREE.Vector3) {
  const n = rings[0].length;
  const pos: number[] = [], aw: number[] = [], idx: number[] = [];
  rings.forEach((r, i) => r.forEach((p, j) => { pos.push(p.x, p.y, p.z); aw.push(...meta[i][j]); }));
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + ((j + 1) % n), c = (i + 1) * n + j, d = (i + 1) * n + ((j + 1) % n);
    idx.push(a, c, b, b, c, d);
  }
  const cap = (ri: number, flip: boolean) => {
    const ctr = new THREE.Vector3(); for (const p of rings[ri]) ctr.add(p); ctr.multiplyScalar(1 / n);
    const ci = pos.length / 3; pos.push(ctr.x, ctr.y, ctr.z); aw.push(...meta[ri][0]);
    for (let j = 0; j < n; j++) { const a = ri * n + j, b = ri * n + ((j + 1) % n); if (flip) idx.push(ci, b, a); else idx.push(ci, a, b); }
  };
  cap(0, false); cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(aw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  // check one mid-tube vertex: flip if its normal points inwards
  const mi = Math.floor(rings.length / 2) * n + Math.floor(n / 4);
  const nrm = new THREE.Vector3().fromBufferAttribute(g.attributes.normal as THREE.BufferAttribute, mi);
  const p = new THREE.Vector3().fromBufferAttribute(g.attributes.position as THREE.BufferAttribute, mi);
  if (nrm.dot(outward(p)) < 0) { flipWinding(g); g.computeVertexNormals(); }
  return g;
}

/** Mirror a geometry across x = 0 (positions and winding). */
function mirrorX(g: THREE.BufferGeometry) {
  const m = g.clone();
  const pp = m.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pp.count; i++) pp.setX(i, -pp.getX(i));
  flipWinding(m);
  m.computeVertexNormals();
  return m;
}

// The left flipper's frame: length axis L (out, a little down and back), the top face's normal N (mostly up,
// tipped out, so the dark top shows from the side and from above and the pale underside from below) and the
// chord C (towards the leading edge).
const FIN_L = new THREE.Vector3(0.66, -0.36, -0.66).normalize();
const FIN_N0 = new THREE.Vector3(0.42, 1, 0);
const FIN_N = FIN_N0.clone().addScaledVector(FIN_L, -FIN_N0.dot(FIN_L)).normalize();
const FIN_C = new THREE.Vector3().crossVectors(FIN_L, FIN_N).normalize();
const FIN_U = 0.27, FIN_LEN = 0.27;
/** Where the left flipper meets the body (rest, unit length). */
function finRootPoint() { return ringPoint(FIN_U, Math.PI * 0.66).multiply(new THREE.Vector3(0.8, 0.88, 1)); }
/** A point on the left flipper at fraction l of its length and chord position c (-1 trailing .. 1 leading), mid-thickness. */
function finPoint(l: number, c: number, out = new THREE.Vector3()) {
  const chord = finChord(l);
  const sweep = -0.05 * Math.pow(l, 1.6);
  const droop = -0.014 * l * l;
  return out.copy(finRootPoint()).addScaledVector(FIN_L, l * FIN_LEN).addScaledVector(FIN_N, droop).addScaledVector(FIN_C, (c * chord) / 2 + sweep);
}
/** Flipper chord at fraction l of its length: narrow at the root, broadest about a third out, a rounded tip. */
function finChord(l: number) { return 0.06 * (0.68 + 0.32 * sstep(0, 0.32, l)) * Math.sqrt(Math.max(0, 1 - Math.pow(l, 2.4))) + 0.0015; }

// The fluke: half span, chord at the centre, how far back the tips sweep, and where its leading edge starts.
const K_SPAN = 0.185, K_CHORD = 0.08, K_SWEEP = 0.06;
/** How far the fluke tips droop below the root (unit length): a permanent soft curve that shows area from the side. */
const K_DROOP = 0.06;
const K_ROOT = 0.5 - UB + 0.024;

interface WhaleGeo { geo: THREE.BufferGeometry; eye: THREE.Vector3; finRoot: THREE.Vector3; tris: number }
const geoCache = new Map<string, WhaleGeo>();

/** Build (once per detail level) the unit-length whale: body, flippers, dorsal fin and fluke in one geometry. */
function whaleGeometry(detail: 'high' | 'low'): WhaleGeo {
  const hit = geoCache.get(detail); if (hit) return hit;
  const hi = detail === 'high';
  const NS = hi ? 150 : 60, NR = hi ? 64 : 28;
  const eye = eyeCentre();
  const finRoot = finRootPoint();
  // the shoulder: a soft swelling round each flipper root, pushed out along the flipper, so the blade grows
  // out of the body instead of being pasted on
  const shoulder = finRoot.clone().addScaledVector(FIN_L, 0.012);
  const fr = new THREE.Vector3();

  // ---- body: rings along the spine, denser towards the head
  const pos: number[] = [], aw: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3();
  pos.push(0, -0.003, 0.5); aw.push(0, 0, Math.PI / 2, 0);
  for (let i = 0; i <= NS; i++) {
    const ti = 0.006 + 0.994 * Math.pow(i / NS, 1.25);
    const u = ti * UB;
    const pr = profile(u);
    for (let j = 0; j < NR; j++) {
      const phi = (j / NR) * Math.PI * 2;
      ringPoint(u, phi, p);
      const yn = p.y >= 0 ? p.y / Math.max(pr.h, 1e-5) : p.y / Math.max(pr.b, 1e-5);
      // the eye sits in a soft bulge
      const ex = Math.abs(p.x) - eye.x, ey = p.y - eye.y, ez = p.z - eye.z;
      const eb = 0.0022 * Math.exp(-(ey * ey + ez * ez) / (0.0095 * 0.0095)) * (Math.abs(ex) < 0.02 ? 1 : 0);
      p.x += Math.sign(p.x) * eb;
      // the raised splash guard round the blowholes
      if (p.y > 0) p.y += 0.003 * Math.exp(-(((u - 0.16) / 0.016) ** 2) - (p.x / 0.012) ** 2);
      // the lower jaw bulges out below the long mouth line, a heavy lip
      const ym = mouthY(u);
      p.x *= 1 + 0.05 * sstep(0.27, 0.16, u) * sstep(ym + 0.001, ym - 0.016, p.y);
      // the flipper shoulders
      fr.set(Math.abs(p.x), p.y, p.z).sub(shoulder);
      const sh = 0.011 * Math.exp(-fr.lengthSq() / (0.036 * 0.036));
      if (sh > 1e-5) { p.x += Math.sign(p.x) * FIN_L.x * sh; p.y += FIN_L.y * sh; p.z += FIN_L.z * sh * 0.5; }
      pos.push(p.x, p.y, p.z);
      aw.push(u, yn, Math.abs(phi - Math.PI), 0);
    }
  }
  // the end of the tail stock (hidden in the fluke)
  pos.push(0, 0, 0.5 - UB - 0.004); aw.push(UB, 0, Math.PI / 2, 0);
  const ring = (i: number, j: number) => 1 + i * NR + (j % NR);
  for (let j = 0; j < NR; j++) idx.push(0, ring(0, j), ring(0, j + 1));
  for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) {
    const a = ring(i, j), b = ring(i, j + 1), c = ring(i + 1, j), d = ring(i + 1, j + 1);
    idx.push(a, c, b, b, c, d);
  }
  const end = pos.length / 3 - 1;
  for (let j = 0; j < NR; j++) idx.push(end, ring(NS, j + 1), ring(NS, j));
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute('aW', new THREE.Float32BufferAttribute(aw, 4));
  body.setIndex(idx);
  flipWinding(body);
  body.computeVertexNormals();

  // ---- pectoral flippers: long flattened blades, cambered, with knobbly leading edges and a backward curve.
  // aW = (FIN_U, l along the length, c across the chord (-1 trailing .. 1 leading), 1)
  const FN = hi ? 44 : 14, FR = hi ? 20 : 10;
  const finRings: THREE.Vector3[][] = [], finMeta: number[][][] = [];
  const fq = new THREE.Vector3();
  for (let i = 0; i <= FN; i++) {
    const l = Math.pow(i / FN, 0.92);
    const chord = finChord(l);
    // scallops (tubercles): bold knobs along the leading edge, fading out towards the tip
    const tub = l > 0.08 && l < 0.95 ? 0.0068 * Math.pow(Math.max(0, Math.sin(l * Math.PI * 9.5)), 1.5) * (1 - 0.55 * l) : 0;
    // thick and round at the root (it sinks into the shoulder), thinning to a blade
    const thick = chord * (0.25 - 0.08 * l) + 0.0006 + 0.016 * (1 - sstep(0, 0.2, l));
    const r: THREE.Vector3[] = [], m: number[][] = [];
    for (let k = 0; k < FR; k++) {
      const a = (k / FR) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      // chord coordinate: a full, rounded leading edge (c = 1) and a thin trailing edge (c = -1)
      const cc = c + (c > 0 ? (tub / Math.max(chord, 1e-4)) * 2 * c * c : 0);
      // thickness: fuller towards the leading edge, the whole section arched (cambered) towards the top face
      const y = (s * thick / 2) * (0.55 + 0.45 * c) + 0.075 * chord * (1 - c * c);
      finPoint(l, cc, fq).addScaledVector(FIN_N, y);
      r.push(fq.clone()); m.push([FIN_U, l, c, 1]);
    }
    finRings.push(r); finMeta.push(m);
  }
  const finL = loftRings(finRings, finMeta, (pt) => pt.clone().sub(finPoint(0.5, 0)));
  const finR = mirrorX(finL);

  // ---- dorsal fin: small and swept back, two thirds of the way along. aW = (u, 1, 0, 2)
  const DN = hi ? 8 : 4, DR = hi ? 12 : 8;
  const du = 0.715, dTop = profile(du).h;
  const dRings: THREE.Vector3[][] = [], dMeta: number[][][] = [];
  for (let i = 0; i <= DN; i++) {
    const h = i / DN;
    const chord = 0.05 * Math.pow(1 - h, 0.85) + 0.002;
    const zc = 0.5 - du - 0.035 * Math.pow(h, 1.4);
    const y = dTop - 0.008 + h * 0.022;
    const r: THREE.Vector3[] = [], m: number[][] = [];
    for (let k = 0; k < DR; k++) {
      const a = (k / DR) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const z = zc + (c * chord) / 2;
      r.push(new THREE.Vector3((s * chord * 0.22 / 2) * (0.6 + 0.4 * c), y, z)); m.push([0.5 - z, 1, 0, 2]);
    }
    dRings.push(r); dMeta.push(m);
  }
  const dorsal = loftRings(dRings, dMeta, (pt) => new THREE.Vector3(pt.x, 0, 0));

  // ---- fluke: wide span, swept tips, a clear notch, a thick rounded leading edge and a fleshy root; the
  // tips droop a little and twist (trailing edge down), so it shows its area from the side and from below.
  // aW = (u, a, c, 3)
  const KN = hi ? 56 : 20, KR = hi ? 16 : 8;
  const kRings: THREE.Vector3[][] = [], kMeta: number[][][] = [];
  const kOut = (x: number) => new THREE.Vector3(0, -K_DROOP * Math.pow(Math.abs(x) / K_SPAN, 1.6), 0);
  for (let i = 0; i <= KN; i++) {
    const a = -1 + (2 * i) / KN, aa = Math.abs(a);
    const lead = K_ROOT - K_SWEEP * Math.pow(aa, 1.6);
    let chord = K_CHORD * Math.pow(Math.max(0, 1 - Math.pow(aa, 2.6)), 0.5) + 0.002;
    chord -= 0.016 * Math.exp(-((a / 0.07) ** 2));
    const thick = chord * 0.26 * (1 - 0.4 * aa) + 0.001 + 0.024 * Math.exp(-((a / 0.15) ** 2));
    const yb = kOut(a * K_SPAN).y;
    const tw = 0.42 * Math.pow(aa, 1.2);
    const r: THREE.Vector3[] = [], m: number[][] = [];
    for (let k = 0; k < KR; k++) {
      const ang = (k / KR) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
      const dz = (c * chord) / 2;
      const dy = (s * thick / 2) * (0.5 + 0.5 * c);
      // twist about the quarter chord: the trailing edge sinks towards the tips
      const zq = lead - chord * 0.25, rz = dz - chord * 0.25;
      const z = zq + rz * Math.cos(tw) - dy * Math.sin(tw);
      const y = yb + rz * Math.sin(tw) + dy * Math.cos(tw);
      r.push(new THREE.Vector3(a * K_SPAN, y, z)); m.push([0.5 - z, a, c, 3]);
    }
    kRings.push(r); kMeta.push(m);
  }
  const fluke = loftRings(kRings, kMeta, (pt) => new THREE.Vector3(0, pt.y - kOut(pt.x).y, 0));

  const parts = [body, finL, finR, dorsal, fluke];
  const geo = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  geo.computeBoundingSphere();
  geo.boundingSphere!.radius *= 1.25;
  const out = { geo, eye, finRoot, tris: geo.index!.count / 3 };
  geoCache.set(detail, out);
  return out;
}

// ------------------------------------------------------------------------------------------------ motion

/** Travelling wave constant (radians over the length): a bit under one wavelength on the body. */
const WK = 4.6;
/** The body pivots about this point, so the head and tail move against each other. */
const PIVOT = 0.3;
/** Wave amplitude (unit length) = WA0 + WA1 * u^2.2: WA0 heaves the whole spine, head included, WA1 is the stroke. */
const WA0 = 0.011, WA1 = 0.07;

const BEND_GLSL = /* glsl */ `
  attribute vec4 aW;
  uniform vec4 uWave;   // x body phase, y yaw phase, z fin phase, w fin amplitude (radians)
  uniform vec4 uShape;  // x body wave amplitude, y yaw amplitude, z fluke tip lag, w flipper lift (radians)
  uniform vec3 uFinRoot;
  #ifdef WHALE_VARY
  varying vec4 vW; varying vec3 vR; varying vec3 vRN;
  #endif
  // amplitude along the spine: a heave of the whole body (the head nods too) growing into big fluke strokes
  float wA(float u){ return uShape.x * (${WA0.toFixed(4)} + ${WA1.toFixed(4)} * pow(max(u, 0.0), 2.2)); }
  float wAd(float u){ return uShape.x * ${(WA1 * 2.2).toFixed(4)} * pow(max(u, 1e-4), 1.2); }
  float wD(float u){ return wA(u) * sin(uWave.x - ${WK.toFixed(2)} * u); }
  float wDd(float u){ float ph = uWave.x - ${WK.toFixed(2)} * u; return wAd(u) * sin(ph) - ${WK.toFixed(2)} * wA(u) * cos(ph); }
  float wE(float u){ return uShape.y * u * u * sin(uWave.y - 2.0 * u); }
  float wEd(float u){ float ph = uWave.y - 2.0 * u; return uShape.y * (2.0 * u * sin(ph) - 2.0 * u * u * cos(ph)); }
  vec2 wRot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
  /** Bend a rest-space point and normal along the swimming spine. */
  void whaleBend(inout vec3 p, inout vec3 n){
    float u = aW.x, part = aW.w;
    if (part > 0.5 && part < 1.5) {
      // flipper: a slow stroke about the body axis from the swept-back rest pose (the tip bending further),
      // with a fore-and-aft sweep and a little twist along the blade
      float side = p.x >= 0.0 ? 1.0 : -1.0;
      vec3 root = vec3(uFinRoot.x * side, uFinRoot.yz);
      vec3 o = p - root;
      float reach = aW.y;
      // (lifted towards level, the flippers lie out over the cloud tops instead of hanging down into them)
      float a = side * (uWave.w * sin(uWave.z) * (0.75 + 0.5 * reach) + uShape.w * (0.7 + 0.3 * reach));
      float b = side * uWave.w * 0.45 * sin(uWave.z - 1.3) * (0.6 + 0.4 * reach);
      o.xy = wRot(o.xy, a); n.xy = wRot(n.xy, a);
      o.zx = wRot(o.zx, b); n.zx = wRot(n.zx, b);
      p = root + o;
    }
    if (part > 2.5) {
      // the fluke tips trail behind each stroke
      float k = p.x / ${K_SPAN.toFixed(3)};
      p.y += uShape.z * k * k * cos(uWave.x - ${WK.toFixed(2)} * 0.97);
    }
    float zc = 0.5 - u;
    float th = atan(-wDd(u)), ps = atan(-wEd(u));
    vec3 o = vec3(p.x, p.y, p.z - zc);
    o.zy = wRot(o.zy, th); n.zy = wRot(n.zy, th);
    o.zx = wRot(o.zx, ps); n.zx = wRot(n.zx, ps);
    p = vec3(wE(u), wD(u) - wD(${PIVOT.toFixed(2)}), zc) + o;
  }
`;

// ------------------------------------------------------------------------------------------------ skin

const MAX_GULLS = 8;
const v3 = (v: THREE.Vector3) => `vec3(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`;

const SKIN_GLSL = /* glsl */ `
  varying vec4 vW; varying vec3 vR; varying vec3 vRN;
  uniform vec3 uRidge, uBack, uFlank, uSpotL, uSpotD, uBelly, uPleatD, uPleatL, uLine, uEye, uFinRoot;
  uniform vec4 uGulls[${MAX_GULLS}];
  uniform float uSeed, uLen;
  float whaleH = 0.0;
  float whalePale = 0.0;
  float whaleAO = 1.0;
  ${MOUTH_GLSL}
  // gradient noise (smoother and less blocky than value noise), about -0.7..0.7
  // (a sine-free hash: sin() of large lattice coordinates loses precision on some GPUs and shows as bands)
  vec3 wG(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return -1.0 + 2.0 * fract((p.xxy + p.yxx) * p.zyx); }
  float wN(vec3 p){
    vec3 i = floor(p), f = fract(p), w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(mix(dot(wG(i), f), dot(wG(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), w.x),
                   mix(dot(wG(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(wG(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), w.x), w.y),
               mix(mix(dot(wG(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(wG(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), w.x),
                   mix(dot(wG(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(wG(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), w.x), w.y), w.z);
  }
  float wFbm(vec3 p){ return wN(p) * 0.55 + wN(p * 2.03 + 3.1) * 0.3 + wN(p * 4.07 + 7.7) * 0.15; }
  float wHash(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
  /** A soft-edged mask: 1 inside d < r, antialiased over the pixel footprint. */
  float wIn(float d, float r, float aa){ return 1.0 - smoothstep(r - aa * 0.5, r + aa, d); }
  /** Cellular noise: x = distance to the nearest scattered point, y = a random value for that point's cell. */
  vec2 wCell(vec3 p){
    vec3 i = floor(p), f = fract(p);
    float d = 9.0, h = 0.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 o = vec3(float(x), float(y), float(z)), id = i + o;
      vec3 r = o + 0.15 + 0.7 * vec3(wHash(id), wHash(id + 17.1), wHash(id + 31.7)) - f;
      float dd = dot(r, r);
      if (dd < d) { d = dd; h = wHash(id + 5.3); }
    }
    return vec2(sqrt(d), h);
  }
  /**
   * One layer of painted dapples at cell scale \`sc\`: light spots where the cell's value is under \`light\`,
   * darker blotches where it is over 1 - \`dark\`. Soft, slightly ragged edges; antialiased, and melting into
   * their average tone when they get smaller than a pixel. Returns (light, dark) coverage.
   */
  vec2 wDapple(vec3 p, float sc, vec3 warp, float light, float dark){
    vec3 c = p * sc + warp;
    vec2 w = wCell(c);
    float aa = length(fwidth(c));
    float r = 0.2 + 0.2 * fract(w.y * 13.7);
    float m = 1.0 - smoothstep(r - 0.06 - aa * 0.5, r + 0.05 + aa, w.x);
    vec2 cov = vec2(step(w.y, light), step(1.0 - dark, w.y)) * m;
    // far away: the average tone of the layer instead of shimmering pinpoints
    return mix(cov, vec2(light, dark) * 0.22, smoothstep(0.35, 0.9, aa));
  }
  vec3 whaleAlbedo(){
    float u = vW.x, yn = vW.y, part = vW.w;
    vec3 p = vR;
    vec3 sp = vec3(abs(p.x), p.y, p.z);
    vec3 q = p * 11.0 + vec3(uSeed * 17.0, uSeed * 3.0, uSeed * 5.0);
    float m = wFbm(q);
    float big = wN(q * 0.3 + 40.0);
    float pale = 0.0;
    float dors = 0.0;    // how much of the back's painting this point gets (dense dapples on the back)
    vec3 dark;
    if (part < 0.5) {
      // steel blue: lighter down the flank, a deeper blue only along the ridge
      dark = mix(uFlank, uBack, smoothstep(-0.25, 0.6, yn + m * 0.2));
      dark = mix(dark, uRidge, smoothstep(0.55, 0.97, yn + m * 0.1) * smoothstep(0.08, 0.3, u) * 0.8);
      // countershading: the cream belly rises towards the head, with a soft, irregular edge
      float bnd = mix(-0.4, -0.26, smoothstep(0.25, 0.45, u)) - 0.34 * smoothstep(0.55, 0.9, u);
      bnd += m * 0.26 + big * 0.1;
      pale = smoothstep(bnd + 0.06, bnd - 0.12, yn);
      // the whole lower jaw is pale up to the mouth line, and the line runs on from the corner of the mouth,
      // sweeping down and back until it meets the belly
      float ym = whaleMouthY(u) - max(u - ${MOUTH_U.toFixed(3)}, 0.0) * 0.16 + m * 0.004 * smoothstep(0.2, 0.3, u);
      pale = max(pale, smoothstep(0.44, 0.3, u) * smoothstep(ym + 0.002, ym - 0.006, p.y));
      dors = smoothstep(-0.5, 0.7, yn);
      // occlusion: round the flipper roots, under the chin and the throat
      vec3 fr = sp - uFinRoot;
      whaleAO *= 1.0 - 0.3 * exp(-dot(fr, fr) / (0.03 * 0.03)) * smoothstep(0.2, -0.6, yn);
      whaleAO *= 1.0 - 0.14 * smoothstep(-0.45, -0.9, yn) * smoothstep(0.34, 0.12, u);
    } else if (part < 1.5) {
      // flipper: a dark, dappled top and a clean cream underside, with a crisp (slightly ragged) edge between
      // them; the knobbly leading edge and the tip are pale too
      vec3 n = normalize(vec3(vRN.x * sign(p.x), vRN.y, vRN.z));
      float side = dot(n, ${v3(FIN_N)}) + wN(q * 3.0) * 0.12;
      float under = smoothstep(0.1, -0.1, side);
      float lead = smoothstep(0.6, 0.95, vW.z) * smoothstep(0.1, 0.25, vW.y);
      float tip = smoothstep(0.84, 0.97, vW.y);
      pale = max(under, max(lead * 0.55, tip * 0.6));
      dark = mix(uBack, uRidge, 0.35);
      dors = 0.75 * (1.0 - under);
      whaleAO *= 1.0 - 0.25 * smoothstep(0.16, 0.0, vW.y);
    } else if (part < 2.5) {
      dark = uRidge;
      dors = 0.5;
    } else {
      // fluke: steel blue above, a pale, lightly mottled underside
      float under = smoothstep(0.15, -0.35, vRN.y);
      pale = under * (0.75 + 0.2 * smoothstep(-0.1, 0.3, m));
      dark = mix(uBack, uRidge, 0.45);
      dors = 0.7 * (1.0 - under);
    }

    // ---- the painting on the blue skin
    vec3 warp = vec3(wN(q * 1.3), wN(q * 1.3 + 5.2), wN(q * 1.3 + 9.4));
    // a gentle tonal drift (never a reflection-like blotch)
    dark *= 0.96 + 0.08 * smoothstep(-0.4, 0.4, big);
    // brush strokes running along the body
    float br = wN(vec3(p.x * 150.0, p.y * 150.0, p.z * 13.0) + uSeed) + 0.5 * wN(vec3(p.x * 330.0, p.y * 330.0, p.z * 30.0) + 3.0);
    dark *= 1.0 + 0.07 * br;
    // watercolour: soft darker pools, irregular paler mottles in clumps, and a dense salt of small light
    // flecks, all thicker towards the back; light freckling near the head
    float head = part < 0.5 ? smoothstep(0.24, 0.06, u) : 0.0;
    vec3 dq = p * vec3(1.0, 1.0, 0.7) + uSeed;
    vec3 fw = vec3(wN(p * 95.0), wN(p * 95.0 + 3.3), wN(p * 95.0 + 7.1));
    float pool = smoothstep(0.08, 0.32, wFbm(q * 1.7 + warp * 1.2));
    dark = mix(dark, uSpotD, pool * (0.25 + 0.2 * dors));
    float clump = smoothstep(-0.25, 0.3, wN(q * 0.9 + 21.0));
    vec2 d1 = wDapple(dq, 60.0, warp * 0.6 + fw * 1.1, (0.1 + 0.3 * dors) * (0.4 + 0.6 * clump), 0.05 + 0.12 * dors);
    vec2 d2 = wDapple(dq + 7.0, 170.0, fw * 1.4, 0.16 + 0.3 * dors + 0.2 * head, 0.05 + 0.12 * dors);
    float spL = clamp(d1.x * 0.5 + d2.x * 0.55, 0.0, 1.0);
    float spD = clamp(d1.y * 0.6 + d2.y * 0.5, 0.0, 1.0);
    dark = mix(dark, uSpotL, spL * (0.5 + 0.25 * head));
    dark = mix(dark, uSpotD, spD * 0.45);
    // the dapples spill over the pale edge and break it up
    float edge = pale * (1.0 - pale) * 4.0;
    pale *= 1.0 - (d1.y + d2.y * 0.8) * edge * 0.7;
    pale = max(pale * (1.0 - edge * 0.2), pale * (d1.x + d2.x) * edge);

    vec3 belly = uBelly * (0.98 + m * 0.04);
    vec3 col = mix(dark, belly, pale);

    if (part < 0.5) {
      // ventral pleats: soft grooves from the chin back towards mid-body; the spacing wanders and widens up
      // the flank, each groove ends at its own place, and they fade out before mid-body
      float z = vW.z;
      float g = (z + 0.03 * sin(z * 9.0 + u * 26.0 + uSeed)) * 9.5 * (1.0 - 0.1 * z);
      float aa = fwidth(g);
      float li = floor(g + 0.5);
      float f = g - li;
      float k = 0.6 + 0.4 * wHash(vec3(li, 3.1, uSeed));
      float endU = 0.32 + 0.12 * wHash(vec3(li, 1.7, 2.3));
      float pm = smoothstep(0.01, 0.05, u) * smoothstep(endU, endU - 0.1, u) * smoothstep(1.35, 0.9, z)
               * (1.0 - 0.5 * smoothstep(0.1, 0.3, u)) * k;
      pm *= 1.0 - smoothstep(0.3, 0.6, aa);
      float groove = 1.0 - smoothstep(0.06, 0.06 + aa * 1.5 + 0.04, abs(f));
      float rib = sin(6.2832 * f);
      col = mix(col, uPleatL, max(rib, 0.0) * 0.4 * pm);
      col = mix(col, uPleatD, (groove * 0.7 + max(-rib, 0.0) * 0.22) * pm);

      // the mouth: a long soft dark line with a crease under it
      float ym = whaleMouthY(u);
      float mm = smoothstep(0.003, 0.016, u) * smoothstep(${(MOUTH_U + 0.002).toFixed(3)}, ${(MOUTH_U - 0.012).toFixed(3)}, u);
      float md = p.y - ym;
      col = mix(col, uLine, wIn(abs(md), 0.0008, fwidth(p.y)) * mm * 0.85);
      whaleH -= 0.001 * exp(-pow((md + 0.0012) / 0.0024, 2.0)) * mm;
      whaleAO *= 1.0 - 0.16 * exp(-pow((md + 0.002) / 0.003, 2.0)) * mm;

      // the eye: small and dark, a soft lid crease above, a gentle darker socket round it, a low catchlight
      vec3 e = sp - uEye;
      if (abs(e.x) < 0.02) {
        vec2 d = vec2(e.z, e.y);
        float ea = fwidth(d.x) + fwidth(d.y);
        col *= 1.0 - 0.14 * exp(-dot(d, d) / 0.00012);
        float eo = length(d / vec2(0.0052, 0.0038));
        col = mix(col, uLine * 0.8, wIn(eo, 1.0, ea / 0.0045));
        col = mix(col, vec3(0.8, 0.82, 0.88), wIn(length(d - vec2(0.0016, 0.0011)), 0.0009, ea) * 0.55);
        float lr = length(d - vec2(0.0004, -0.0035));
        float lid = wIn(abs(lr - 0.0085), 0.00045, ea) * smoothstep(0.0, 0.0035, d.y) * smoothstep(0.0095, 0.004, abs(d.x + 0.0005));
        col = mix(col, uLine, lid * 0.5);
        whaleH += 0.0005 * exp(-pow((lr - 0.0085) / 0.0012, 2.0)) * smoothstep(0.0, 0.0035, d.y);
      }

      // twin blowholes in the splash guard
      if (p.y > 0.0) {
        vec2 b = vec2((abs(p.x) - 0.0038) / 0.001, (p.z - 0.34) / 0.006);
        float bh = length(b);
        col = mix(col, uLine * 0.9, wIn(bh, 1.0, fwidth(bh) * 1.5) * 0.7);
      }
    }
    if (part < 1.5) {
      // pale barnacle freckles in clusters, only on the head, the chin and round the flipper roots
      vec3 c = p * 260.0;
      vec3 id = floor(c);
      vec3 fo = fract(c) - 0.5 - (vec3(wHash(id + 1.3), wHash(id + 4.1), wHash(id + 7.9)) - 0.5) * 0.5;
      vec3 frd = sp - uFinRoot;
      float zone = part < 0.5 ? smoothstep(0.2, 0.03, u) * smoothstep(-0.7, 0.1, yn) : 0.0;
      zone = max(zone, exp(-dot(frd, frd) / (0.035 * 0.035)) * 0.8);
      zone *= smoothstep(-0.1, 0.3, wN(q * 2.2 + 50.0) + 0.15);
      float fk = zone * step(0.72, wHash(id));
      float fr = wIn(length(fo), 0.13 + 0.12 * wHash(id + 2.2), fwidth(c.x) * 1.2) * fk * (1.0 - smoothstep(0.3, 0.7, fwidth(c.x)));
      col = mix(col, mix(uSpotL, uBelly, 0.6), fr * 0.6);
    }
    // contact shadows under the sitting gulls
    for (int i = 0; i < ${MAX_GULLS}; i++) {
      vec4 gl = uGulls[i];
      vec3 gd = p - gl.xyz;
      float gr = max(gl.w, 1e-3);
      whaleAO *= 1.0 - 0.55 * step(1e-3, gl.w) * exp(-min(dot(gd, gd) / (gr * gr), 30.0));
    }
    whalePale = pale;
    return col;
  }
`;

/** Three soft tones (shade, half-light, full light) from 0 to 1; the colours are put on in the relight. */
let wRamp: THREE.DataTexture | null = null;
function whaleRamp() {
  if (wRamp) return wRamp;
  const N = 64, data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    // x = N.L * 0.5 + 0.5: shade facing away from the sun, half-light on the flanks, full light only on the
    // planes that face the sun squarely (so a side lit from behind the camera still reads as a form)
    const v = sstep(0.46, 0.54, x) * 0.5 + sstep(0.74, 0.82, x) * 0.5;
    const b = Math.round(v * 255);
    data.set([b, b, b, 255], i * 4);
  }
  wRamp = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  wRamp.minFilter = wRamp.magFilter = THREE.LinearFilter;
  wRamp.needsUpdate = true;
  return wRamp;
}

type U = Record<string, THREE.IUniform>;

/**
 * The lighting shared by the whales and their gulls: the toon light term relit as a soft three-tone design. The
 * shade is a lifted, cool steel tone (never navy), the sunlit side warm; at golden hour the shade warms in the
 * low sun's glow and a strong warm rim lights the edges, brightest when the sun is behind the whale.
 */
const RELIGHT_GLSL = /* glsl */ `
  // how lit this point is (0 shade .. 1 full sun), from the toon ramp and the shadow map
  vec3 sunRad = uSunCol * ${(2.6 / Math.PI).toFixed(4)};
  float lum = clamp(dot(reflectedLight.directDiffuse, vec3(1.0)) / max(dot(diffuseColor.rgb * sunRad, vec3(1.0)), 1e-4), 0.0, 1.0);
  vec3 wNn = normalize(vPNormal); vec3 wV = normalize(cameraPosition - vPWorld);
  // 0 at midday .. 1 when the sun is low and gold
  float warmK = clamp((0.6 - uSun.y) * 2.4, 0.0, 1.0);
  vec3 sunHue = uSunCol / max(max(uSunCol.r, uSunCol.g), 1e-3);
  vec3 shadeL = mix(vec3(0.76, 0.79, 0.86), vec3(0.86, 0.88, 0.92), warmK) * (0.9 + 0.13 * (wNn.y * 0.5 + 0.5));
  vec3 litL = mix(vec3(1.0), sunHue, 0.5) * 1.18;
  vec3 lightL = mix(shadeL, litL, lum);
  // the sky's fill on the planes that face up
  lightL += mix(vec3(0.03, 0.05, 0.09), vec3(0.05, 0.07, 0.1), warmK) * max(wNn.y, 0.0) * (1.0 - lum);
  // a soft rim, warm on the sun side, strong and golden against a low sun
  float rimF = pow(1.0 - clamp(dot(wNn, wV), 0.0, 1.0), 2.4);
  float backK = smoothstep(-0.4, 0.9, dot(-wV, uSun));
  float rimK = rimF * (clamp(dot(wNn, uSun) * 0.6 + 0.4, 0.0, 1.0) * 0.25 + warmK * (0.3 + 1.1 * backK) * smoothstep(-0.6, 0.3, wNn.y));
`;

function whaleMaterials(u: U) {
  const mat = paint(new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: whaleRamp() }), { variation: 0, rim: 1 });
  const painted = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    painted.call(mat, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = '#define WHALE_VARY\n' + sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + BEND_GLSL)
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = normal; vec3 wbP = position;
        whaleBend(wbP, objectNormal);
        vW = aW; vR = position; vRN = normal;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = wbP;');
    sh.fragmentShader = sh.fragmentShader
      .replace(/void main\(\)\s*\{/, `uniform vec3 uSunCol, uBounce, uCloudLit, uCloudShade; uniform float uCloudTop, uCloudOn;\n` + SKIN_GLSL + '\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = whaleAlbedo();')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // painted relief (pleats, mouth crease, eyelid) as a bump on the lighting normal
          vec3 sp = -vViewPosition; vec3 sx = dFdx(sp), sy = dFdy(sp);
          vec2 dh = vec2(dFdx(whaleH), dFdy(whaleH)) * uLen;
          vec3 R1 = cross(sy, normal), R2 = cross(normal, sx);
          float det = dot(sx, R1) * faceDirection;
          normal = normalize(abs(det) * normal - sign(det) * (dh.x * R1 + dh.y * R2));
        }`)
      .replace('#include <opaque_fragment>', `
        {
          ${RELIGHT_GLSL}
          outgoingLight = diffuseColor.rgb * lightL * whaleAO;
          // light bounced up from the sunlit clouds, glowing through the pale belly
          float under = smoothstep(0.15, -0.75, wNn.y);
          outgoingLight += diffuseColor.rgb * uBounce * mix(vec3(1.0), sunHue, 0.4) * under * (0.1 + 0.22 * whalePale) * (1.0 - 0.5 * lum) * mix(1.0, whaleAO, 0.6);
          // the low sun's glow wrapping round the whole body, so the shaded side stays luminous at golden hour
          outgoingLight += diffuseColor.rgb * mix(vec3(0.16, 0.18, 0.2), sunHue * 0.25, 0.5) * warmK * (1.0 - lum) * (0.5 + 0.5 * backK);
          outgoingLight += mix(uRimCol, sunHue * vec3(1.0, 0.88, 0.7), warmK) * rimK * mix(0.55, 0.8, warmK);
          // in the low gold light the blue goes a little dustier and warmer, a sunset slate rather than a vivid blue
          outgoingLight = mix(outgoingLight, vec3(dot(outgoingLight, vec3(0.3, 0.55, 0.15))) * mix(vec3(1.0), sunHue, 0.35), 0.28 * warmK * (1.0 - whalePale));
          // sinking into the cloud tops: melt into cloud-white along a ragged, drifting edge, gone below it
          if (uCloudOn > 0.5) {
            // (billowing: the edge rises and falls by a couple of metres, in lumps the size of the cloud puffs)
            float cn = wN(vPWorld * 0.09 + vec3(0.0, 0.0, uTime * 0.2)) * 1.6 + wN(vPWorld * 0.3 + 4.0) * 0.6;
            float dd = vPWorld.y - uCloudTop + cn * 1.6;
            if (dd < -1.6) discard;
            vec3 cc = mix(uCloudShade, uCloudLit * mix(vec3(1.0), sunHue, 0.35), clamp(lum * 0.6 + 0.3 + wNn.y * 0.25, 0.0, 1.0));
            outgoingLight = mix(outgoingLight, cc, smoothstep(1.8, -1.5, dd));
          }
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'skywhale3';

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + BEND_GLSL)
      .replace('#include <begin_vertex>', 'vec3 transformed = position; vec3 wbN = normal; whaleBend(transformed, wbN);');
  };
  depth.customProgramCacheKey = () => 'skywhale3depth';
  return { mat, depth };
}

// ------------------------------------------------------------------------------------------------ gulls

type V3 = [number, number, number];
/** Merge coloured primitives into one geometry with vertex colours (and an optional per-vertex wing weight). */
function kit(parts: { g: THREE.BufferGeometry; c: string; p?: V3; r?: V3; s?: V3; wing?: (x: number) => number }[]) {
  const out: THREE.BufferGeometry[] = [];
  for (const it of parts) {
    const g = it.g.index ? it.g.toNonIndexed() : it.g;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...(it.p ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(it.r ?? [0, 0, 0]))), new THREE.Vector3(...(it.s ?? [1, 1, 1])));
    g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const col = new THREE.Color(it.c), ca = new Float32Array(n * 3), wa = new Float32Array(n);
    for (let i = 0; i < n; i++) { ca.set([col.r, col.g, col.b], i * 3); wa[i] = it.wing ? it.wing(g.attributes.position.getX(i)) : 0; }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    g.setAttribute('aWing', new THREE.BufferAttribute(wa, 1));
    out.push(g);
  }
  return mergeGeometries(out, false)!;
}

const GULL_WHITE = '#f8f6f1', GULL_GREY = '#8f9db3', GULL_TIP = '#2d313c', GULL_BILL = '#efcf5a', GULL_EYE = '#23252e', GULL_LEG = '#e8a27a';

/**
 * A gull sitting with its wings folded (about 0.65 m; faces +Z): a white breast and a raised white head on a
 * short neck, a yellow bill, the grey mantle and folded wings over the back, dark crossed wing tips past a
 * white tail, pink legs. It sits nose-up, so from any side it reads as a bird, not a pebble.
 */
function sittingGull() {
  const up = -0.22; // body pitch, nose up
  return kit([
    // body and breast
    { g: new THREE.SphereGeometry(1, 12, 8), c: GULL_WHITE, p: [0, 0.13, -0.01], s: [0.075, 0.072, 0.2], r: [up, 0, 0] },
    { g: new THREE.SphereGeometry(1, 10, 8), c: GULL_WHITE, p: [0, 0.14, 0.09], s: [0.07, 0.085, 0.09] },
    // neck and head, a touch forward and up; a bill with a downturned tip
    { g: new THREE.SphereGeometry(1, 9, 7), c: GULL_WHITE, p: [0, 0.205, 0.13], s: [0.045, 0.06, 0.05] },
    { g: new THREE.SphereGeometry(1, 12, 8), c: GULL_WHITE, p: [0, 0.255, 0.155], s: [0.05, 0.047, 0.064] },
    { g: new THREE.ConeGeometry(0.014, 0.085, 6), c: GULL_BILL, p: [0, 0.248, 0.248], r: [Math.PI / 2 + 0.12, 0, 0], s: [0.8, 1, 1.1] },
    { g: new THREE.SphereGeometry(0.009, 6, 4), c: GULL_EYE, p: [0.036, 0.266, 0.18] },
    { g: new THREE.SphereGeometry(0.009, 6, 4), c: GULL_EYE, p: [-0.036, 0.266, 0.18] },
    // folded grey wings over the back, from the shoulder to past the tail
    { g: new THREE.SphereGeometry(1, 12, 6), c: GULL_GREY, p: [0.045, 0.165, -0.04], s: [0.042, 0.036, 0.21], r: [up + 0.04, 0.05, -0.3] },
    { g: new THREE.SphereGeometry(1, 12, 6), c: GULL_GREY, p: [-0.045, 0.165, -0.04], s: [0.042, 0.036, 0.21], r: [up + 0.04, -0.05, 0.3] },
    { g: new THREE.SphereGeometry(1, 8, 5), c: GULL_GREY, p: [0, 0.185, 0.01], s: [0.04, 0.025, 0.12], r: [up, 0, 0] },
    // dark primaries crossing over the tail, with a white spot near the tips
    { g: new THREE.ConeGeometry(0.03, 0.2, 6), c: GULL_TIP, p: [0.016, 0.115, -0.27], r: [-Math.PI / 2 + up + 0.25, 0, 0], s: [1.1, 1, 0.35] },
    { g: new THREE.ConeGeometry(0.03, 0.2, 6), c: GULL_TIP, p: [-0.016, 0.112, -0.27], r: [-Math.PI / 2 + up + 0.25, 0, 0], s: [1.1, 1, 0.35] },
    { g: new THREE.SphereGeometry(0.012, 5, 4), c: GULL_WHITE, p: [0.016, 0.098, -0.33] },
    { g: new THREE.SphereGeometry(0.012, 5, 4), c: GULL_WHITE, p: [-0.016, 0.096, -0.33] },
    // white tail fan under the wing tips
    { g: new THREE.ConeGeometry(0.05, 0.15, 6), c: GULL_WHITE, p: [0, 0.105, -0.22], r: [-Math.PI / 2 + up + 0.1, 0, 0], s: [1.3, 1, 0.4] },
    // legs
    { g: new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4), c: GULL_LEG, p: [0.025, 0.04, 0.02] },
    { g: new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4), c: GULL_LEG, p: [-0.025, 0.04, 0.02] },
  ]);
}

/**
 * A gull in flight (span about 1.5 m) with the gull's M: the inner wing raised to the wrist, the long pointed
 * hand angled down and swept back. The wings are two sheets, grey on top and white below, and the grey runs
 * into soft black tips. aWing grows from the shoulder (0) to the tip (1) for the flap.
 */
function flyingGull() {
  const N = 12;
  const wing = (side: number, top: boolean) => {
    const pos: number[] = [], col: number[] = [], wg: number[] = [], idx: number[] = [];
    const grey = new THREE.Color(top ? GULL_GREY : '#eceae6'), tipC = new THREE.Color(GULL_TIP), c = new THREE.Color();
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const x = 0.05 + 0.72 * s;
      // the M: up to the wrist (s = 0.42), then down and back to a pointed tip
      const wrist = 0.42;
      const y = s < wrist ? 0.085 * Math.sin((s / wrist) * Math.PI * 0.5) : 0.085 - 0.13 * Math.pow((s - wrist) / (1 - wrist), 1.3);
      const sweep = s < wrist ? 0.03 * (s / wrist) : 0.03 - 0.2 * Math.pow((s - wrist) / (1 - wrist), 1.4);
      const chord = s < wrist ? 0.2 - 0.03 * (s / wrist) : 0.17 * Math.pow(Math.max(0, 1 - (s - wrist) / (1 - wrist)), 0.75) + 0.01;
      const lead = 0.06 + sweep, trail = lead - chord;
      const off = top ? 0.005 : -0.005;
      pos.push(side * x, y + off, lead, side * x, y + off + 0.008 * (1 - s), trail);
      c.copy(grey).lerp(tipC, top ? sstep(0.7, 0.9, s) : sstep(0.78, 0.95, s) * 0.8);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      wg.push(s, s);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = a + 1, cc = a + 2, d = a + 3;
      // winding so the top sheet faces up and the bottom sheet faces down
      if ((side > 0) === top) idx.push(a, b, cc, b, d, cc); else idx.push(a, cc, b, b, cc, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aWing', new THREE.Float32BufferAttribute(wg, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g.toNonIndexed();
  };
  const body = kit([
    { g: new THREE.SphereGeometry(1, 12, 8), c: GULL_WHITE, s: [0.07, 0.068, 0.25] },
    { g: new THREE.SphereGeometry(1, 8, 5), c: GULL_GREY, p: [0, 0.035, -0.02], s: [0.05, 0.03, 0.16] },
    { g: new THREE.SphereGeometry(1, 10, 8), c: GULL_WHITE, p: [0, 0.04, 0.24], s: [0.046, 0.045, 0.06] },
    { g: new THREE.ConeGeometry(0.012, 0.08, 6), c: GULL_BILL, p: [0, 0.035, 0.325], r: [Math.PI / 2 + 0.1, 0, 0] },
    { g: new THREE.SphereGeometry(0.008, 5, 4), c: GULL_EYE, p: [0.032, 0.052, 0.262] },
    { g: new THREE.SphereGeometry(0.008, 5, 4), c: GULL_EYE, p: [-0.032, 0.052, 0.262] },
    // a fanned white tail
    { g: new THREE.ConeGeometry(0.075, 0.17, 7), c: GULL_WHITE, p: [0, 0.0, -0.29], r: [-Math.PI / 2, 0, 0], s: [1.25, 1, 0.22] },
  ]);
  const wings = [wing(1, true), wing(1, false), wing(-1, true), wing(-1, false)];
  const g = mergeGeometries([body, ...wings], false)!;
  for (const w of wings) w.dispose();
  body.dispose();
  return g;
}

let gullGeos: { sit: THREE.BufferGeometry; fly: THREE.BufferGeometry } | null = null;
let gullMats: { sit: THREE.MeshToonMaterial; fly: THREE.MeshToonMaterial } | null = null;
const gullTime = { value: 0 };

/** The gulls' toon material, relit like the whale (warm sunlit tops, cool lavender shade). */
function gullMaterial(fly: boolean) {
  const mat = paint(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: whaleRamp(), side: fly ? THREE.DoubleSide : THREE.FrontSide }), { variation: 0.1, rim: 1 });
  const painted = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    painted.call(mat, sh, r);
    sh.uniforms.uGullT = gullTime;
    sh.fragmentShader = sh.fragmentShader
      .replace(/void main\(\)\s*\{/, 'uniform vec3 uSunCol;\nvoid main() {')
      .replace('#include <opaque_fragment>', `{
          ${RELIGHT_GLSL}
          outgoingLight = diffuseColor.rgb * lightL;
          outgoingLight += mix(uRimCol, sunHue, warmK) * rimK * 0.5;
        }
        #include <opaque_fragment>`);
    if (fly) sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWing; attribute vec2 iFlap; uniform float uGullT;')
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = normal;
        // flap: wings swing about the body axis, the outer wing lagging and bending further
        float gk = aWing;
        float fl = sin(uGullT * 7.5 + iFlap.x - gk * 0.9) * iFlap.y * (0.55 + 0.5 * gk) + 0.12 * (1.0 - iFlap.y);
        float gs = position.x >= 0.0 ? 1.0 : -1.0;
        float gc = cos(fl * gs), gsn = sin(fl * gs);
        vec3 gp = position;
        if (gk > 0.0) { gp.xy = vec2(gc * gp.x - gsn * gp.y, gsn * gp.x + gc * gp.y); objectNormal.xy = vec2(gc * objectNormal.x - gsn * objectNormal.y, gsn * objectNormal.x + gc * objectNormal.y); }`)
      .replace('#include <begin_vertex>', 'vec3 transformed = gp;');
  };
  mat.customProgramCacheKey = () => (fly ? 'skygullfly2' : 'skygullsit2');
  return mat;
}

function gulls() {
  if (!gullGeos) gullGeos = { sit: sittingGull(), fly: flyingGull() };
  if (!gullMats) gullMats = { sit: gullMaterial(false), fly: gullMaterial(true) };
  return { geos: gullGeos, mats: gullMats };
}

// ------------------------------------------------------------------------------------------------ whale

function mulberry(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

interface Rider { u: number; x: number; yaw: number; s: number; rest: THREE.Vector3 }
interface Flyer { slot: number; period: number; offset: number; side: number; rx: number; rz: number; hh: number }
/** A gull of the trailing stream: where it keeps along the stream (0 at the back .. 1 far behind and above). */
interface Streamer { s: number; phase: number; side: number; size: number }

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _r = new THREE.Vector3(), _m = new THREE.Matrix4(), _quat = new THREE.Quaternion(), _e = new THREE.Euler(), _sc = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class SkyWhale {
  /** Place, turn and move this. The whale faces +Z. */
  readonly root = new THREE.Group();
  /** Rolls and heaves with the swim; holds the mesh, the gulls and the ride anchor. */
  readonly body = new THREE.Group();
  readonly mesh: THREE.Mesh;
  /** A point on the back (just behind the blowholes) where Nilo can ride, in body space; +Y is up from the skin, +Z forward. */
  readonly rideAnchor = new THREE.Object3D();
  /** The cloud wake (world space). Add `wake.mesh` to the scene yourself when cloudTop is set. Null otherwise. */
  readonly wake: CloudWake | null;
  /** Swim intensity, 0 (gliding, barely moving) .. 1 (full, heavy strokes). Eased internally. */
  swim = 0.6;
  /** How far the flippers are lifted from their hanging rest pose, radians (a whale riding the cloud tops spreads them). */
  finLift = 0;
  readonly length: number;
  /** Triangles in one whale mesh (without gulls). */
  readonly triangles: number;
  /** Triangles in all of this whale's gulls together. */
  readonly gullTriangles: number = 0;

  private u: U;
  private sw = 0.6;
  private ph = { body: 0, yaw: 0, fin: 0 };
  private amp = { body: 1, yaw: 0.012, fin: 0.2, lag: 0.016 };
  private rnd: () => number;
  private riders: Rider[] = [];
  private flyers: Flyer[] = [];
  private streamers: Streamer[] = [];
  private sitMesh: THREE.InstancedMesh | null = null;
  private flyMesh: THREE.InstancedMesh | null = null;
  private flapAttr: THREE.InstancedBufferAttribute | null = null;
  private birdScale: number;
  private wakeT = 0;
  private wispT = 0;
  private lastWorld = new THREE.Vector3();
  private hasLast = false;

  constructor(opts: SkyWhaleOpts = {}) {
    this.length = opts.length ?? 36;
    const seed = opts.seed ?? 1;
    this.rnd = mulberry(seed);
    this.birdScale = (opts.birdScale ?? 1) * 2.5;
    const wg = whaleGeometry(opts.detail ?? 'high');
    this.triangles = wg.tris;
    const r = this.rnd;
    // a little individuality: some whales a touch bluer or greyer, lighter or darker
    const hue = (r() - 0.5) * 0.03, lit = (r() - 0.5) * 0.06;
    const tone = (c: string) => { const col = new THREE.Color(c); col.offsetHSL(hue, 0, lit); return col; };
    this.u = {
      uWave: { value: new THREE.Vector4() },
      uShape: { value: new THREE.Vector4(1, 0.012, 0.016, 0) },
      uFinRoot: { value: wg.finRoot.clone() },
      uEye: { value: wg.eye.clone() },
      // clear steel blue (no violet): a deeper blue on the ridge, lighter down the flank; pale and dark dapples
      uRidge: { value: tone('#58799f') },
      uBack: { value: tone('#6a89ae') },
      uFlank: { value: tone('#83a0c0') },
      uSpotL: { value: tone('#a9c0d8') },
      uSpotD: { value: tone('#4f6d93') },
      // a clean warm cream belly, its pleats a soft warm grey
      uBelly: { value: new THREE.Color('#f1ead9') },
      uPleatD: { value: new THREE.Color('#bdb7a8') },
      uPleatL: { value: new THREE.Color('#fbf8ef') },
      uLine: { value: new THREE.Color('#25324a') },
      uBounce: { value: new THREE.Color('#fff0dc') },
      uCloudLit: { value: new THREE.Color('#f7f5f1') },
      uCloudShade: { value: new THREE.Color('#b9c4dc') },
      uCloudTop: { value: opts.cloudTop ?? 0 },
      uCloudOn: { value: opts.cloudTop != null ? 1 : 0 },
      uGulls: { value: Array.from({ length: MAX_GULLS }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uSunCol: PAINT.uSunCol,
      uSeed: { value: r() * 10 },
      uLen: { value: this.length },
    };
    const { mat, depth } = whaleMaterials(this.u);
    this.mesh = new THREE.Mesh(wg.geo, mat);
    this.mesh.customDepthMaterial = depth;
    this.mesh.scale.setScalar(this.length);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.root.add(this.body);
    this.body.add(this.mesh, this.rideAnchor);
    this.ph.body = r() * 6.28; this.ph.yaw = r() * 6.28; this.ph.fin = r() * 6.28;

    // gulls: most sit along the back, a couple take off now and then, circle and land again
    const n = Math.min(opts.birds ?? 7, MAX_GULLS);
    const ns = Math.max(0, Math.round(opts.flock ?? 6));
    for (let k = 0; k < ns; k++) this.streamers.push({ s: (k + 0.3 + r() * 0.5) / ns, phase: r() * 6.28, side: r() < 0.5 ? -1 : 1, size: 0.85 + r() * 0.3 });
    if (n + ns > 0) {
      const { geos, mats } = gulls();
      for (let i = 0; i < n; i++) {
        const u = 0.29 + (i / Math.max(1, n - 1)) * 0.3 + (r() - 0.5) * 0.04;
        const x = (r() - 0.5) * 0.026;
        const pr = profile(u);
        const rest = ringPoint(u, Math.asin(Math.max(-1, Math.min(1, x / pr.w))));
        this.riders.push({ u, x, yaw: (r() - 0.5) * 1.2 + (r() < 0.2 ? Math.PI : 0), s: 0.9 + r() * 0.2, rest });
      }
      const nl = n >= 5 ? 2 : n >= 2 ? 1 : 0;
      for (let k = 0; k < nl; k++) {
        this.flyers.push({ slot: Math.floor((k + 0.5) * n / nl), period: 16 + r() * 8, offset: r(), side: k % 2 ? -1 : 1, rx: 5 + r() * 4, rz: 8 + r() * 6, hh: 5 + r() * 4 });
      }
      const tri = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
      const nf = nl + ns;
      this.gullTriangles = Math.round(tri(geos.sit) * (n - nl) + tri(geos.fly) * nf);
      this.sitMesh = new THREE.InstancedMesh(geos.sit, mats.sit, Math.max(1, n));
      if (!n) this.sitMesh.setMatrixAt(0, ZERO);
      this.sitMesh.castShadow = true; this.sitMesh.frustumCulled = false;
      this.body.add(this.sitMesh);
      if (nf) {
        this.flyMesh = new THREE.InstancedMesh(geos.fly, mats.fly, nf);
        this.flapAttr = new THREE.InstancedBufferAttribute(new Float32Array(nf * 2), 2);
        this.flyMesh.geometry = geos.fly.clone();
        this.flyMesh.geometry.setAttribute('iFlap', this.flapAttr);
        // (no shadow: a flying gull's shadow would sweep over the back as a big dark cross)
        this.flyMesh.frustumCulled = false;
        this.body.add(this.flyMesh);
      }
    }
    this.wake = opts.cloudTop != null ? new CloudWake(150) : null;
    if (opts.cloudTop != null) { this.finLift = 0.58; this.shadowSlot = claimCloudShadow(); }
    this.update(0, 0);
  }

  /** World height of the cloud tops (the whale melts into them and leaves a wake), or null for none. */
  get cloudTop(): number | null { return this.u.uCloudOn.value ? (this.u.uCloudTop.value as number) : null; }
  set cloudTop(v: number | null) { this.u.uCloudOn.value = v === null ? 0 : 1; if (v !== null) this.u.uCloudTop.value = v; }

  // ---- the CPU mirror of the bend (body only), in unit space

  private wA(u: number) { return this.amp.body * (WA0 + WA1 * Math.pow(Math.max(u, 0), 2.2)); }
  private wD(u: number) { return this.wA(u) * Math.sin(this.ph.body - WK * u); }
  private wDd(u: number) { const ph = this.ph.body - WK * u; return this.amp.body * WA1 * 2.2 * Math.pow(Math.max(u, 1e-4), 1.2) * Math.sin(ph) - WK * this.wA(u) * Math.cos(ph); }
  private wE(u: number) { return this.amp.yaw * u * u * Math.sin(this.ph.yaw - 2 * u); }
  private wEd(u: number) { const ph = this.ph.yaw - 2 * u; return this.amp.yaw * (2 * u * Math.sin(ph) - 2 * u * u * Math.cos(ph)); }

  /** Bend a rest-space point (unit length) at spine position u; returns body-space metres. Also gives the local pitch and yaw. */
  bendPoint(rest: THREE.Vector3, u: number, out = new THREE.Vector3()) {
    const zc = 0.5 - u;
    const th = Math.atan(-this.wDd(u)), ps = Math.atan(-this.wEd(u));
    let ox = rest.x, oy = rest.y, oz = rest.z - zc;
    let c = Math.cos(th), s = Math.sin(th);
    const z1 = c * oz - s * oy, y1 = s * oz + c * oy; oz = z1; oy = y1;
    c = Math.cos(ps); s = Math.sin(ps);
    const z2 = c * oz - s * ox, x2 = s * oz + c * ox; oz = z2; ox = x2;
    out.set(this.wE(u) + ox, this.wD(u) - this.wD(PIVOT) + oy, zc + oz).multiplyScalar(this.length);
    return { p: out, pitch: th, yaw: ps };
  }

  /** A point on the top of the back at fraction u (0 snout .. 0.9) and sideways offset x (unit), bent, in body space. */
  backPoint(u: number, x = 0, out = new THREE.Vector3()) {
    const pr = profile(u);
    const phi = Math.asin(Math.max(-1, Math.min(1, x / Math.max(pr.w, 1e-4))));
    ringPoint(u, phi, _q);
    return this.bendPoint(_q, u, out);
  }

  update(dt: number, t: number) {
    // ease the swim intensity; the rhythm slows and the strokes shrink when gliding
    this.sw += (THREE.MathUtils.clamp(this.swim, 0, 1) - this.sw) * Math.min(1, dt * 0.6);
    const sw = this.sw;
    const period = THREE.MathUtils.lerp(11, 6.5, sw);
    this.ph.body += (Math.PI * 2 / period) * dt;
    this.ph.yaw += (Math.PI * 2 / 19) * dt;
    this.ph.fin += (Math.PI * 2 / (period * 1.45)) * dt;
    this.amp.body = 0.45 + 0.8 * sw;
    this.amp.fin = 0.12 + 0.12 * sw;
    this.amp.lag = 0.008 + 0.014 * sw;
    (this.u.uWave.value as THREE.Vector4).set(this.ph.body, this.ph.yaw, this.ph.fin, this.amp.fin);
    (this.u.uShape.value as THREE.Vector4).set(this.amp.body, this.amp.yaw, this.amp.lag, this.finLift);

    // a slow, heavy roll and a gentle heave against the strokes
    this.body.rotation.z = 0.035 * Math.sin(this.ph.yaw * 0.8 + 1.0) + 0.018 * Math.sin(this.ph.fin);
    this.body.position.y = this.length * (0.007 * Math.sin(this.ph.body - 0.9) + 0.006 * Math.sin(t * 0.21));
    // the whole body pitches gently with each stroke, the head rising a beat after the fluke pushes down
    this.body.rotation.x = 0.022 * Math.sin(this.ph.body - 2.0) * (0.5 + 0.5 * sw);

    // the ride anchor follows the back
    const a = this.backPoint(RIDE_U, 0, this.rideAnchor.position);
    this.rideAnchor.rotation.set(-a.pitch, a.yaw, 0, 'YXZ');

    this.updateGulls(dt, t);
    if (this.wake && this.cloudTop !== null) this.updateWake(dt, t);
  }

  private updateGulls(_dt: number, t: number) {
    if (!this.sitMesh) return;
    gullTime.value = t;
    const bs = this.birdScale;
    const flying = new Map<number, number>();
    this.flyers.forEach((f, k) => flying.set(f.slot, k));
    const shadows = this.u.uGulls.value as THREE.Vector4[];
    // a soft contact shadow under each sitting gull, in rest space (unit length)
    const sitShadow = (i: number, rd: Rider, on: boolean) => shadows[i].set(rd.rest.x, rd.rest.y, rd.rest.z, on ? 0.0105 * bs * rd.s * (36 / this.length) : 0);
    this.riders.forEach((rd, i) => {
      const k = flying.get(i);
      const b = this.backPoint(rd.u, rd.x, _p);
      if (k === undefined) {
        // a sitting gull: settles on the skin, tilts with it, shuffles now and then
        _e.set(-b.pitch, rd.yaw + 0.15 * Math.sin(t * 0.3 + i * 2.1) * (Math.sin(t * 0.11 + i) > 0.6 ? 1 : 0), 0, 'YXZ');
        _m.compose(_p.addScaledVector(THREE.Object3D.DEFAULT_UP, -0.03 * bs), _quat.setFromEuler(_e), _sc.setScalar(bs * rd.s));
        this.sitMesh!.setMatrixAt(i, _m);
        sitShadow(i, rd, true);
        return;
      }
      const f = this.flyers[k];
      const cyc = ((t / f.period + f.offset) % 1 + 1) % 1;
      const sitEnd = 0.22, flyEnd = 1.0;
      if (cyc < sitEnd) {
        // waiting on the back, about to go
        _e.set(-b.pitch, rd.yaw, 0, 'YXZ');
        _m.compose(_p.addScaledVector(THREE.Object3D.DEFAULT_UP, -0.03 * bs), _quat.setFromEuler(_e), _sc.setScalar(bs * rd.s));
        this.sitMesh!.setMatrixAt(i, _m);
        this.flyMesh!.setMatrixAt(k, ZERO);
        sitShadow(i, rd, true);
        return;
      }
      this.sitMesh!.setMatrixAt(i, ZERO);
      sitShadow(i, rd, false);
      // in the air: a loop up, back and round, returning to the same spot on the back
      const tau = (cyc - sitEnd) / (flyEnd - sitEnd);
      const off = (tt: number, out: THREE.Vector3) => {
        const e = 0.5 - 0.5 * Math.cos(Math.PI * tt); // eased progress
        return out.set(f.side * f.rx * Math.sin(2 * Math.PI * e), f.hh * Math.pow(Math.sin(Math.PI * e), 0.7), -f.rz * Math.sin(Math.PI * e) * (1 + 0.3 * Math.sin(2 * Math.PI * e)));
      };
      // (lifted clear of the skin at take-off and landing, so the spread wings never cut into the back)
      const pos = off(tau, _q).add(_p).addScaledVector(THREE.Object3D.DEFAULT_UP, bs * 0.7 * Math.min(1, tau * 12, (1 - tau) * 12));
      const ahead = off(Math.min(1, tau + 0.01), _r).add(_p).sub(pos);
      if (tau > 0.99) ahead.set(0, -0.05, 0.1);
      const hz = Math.hypot(ahead.x, ahead.z);
      const yaw = Math.atan2(ahead.x, ahead.z);
      const pitch = THREE.MathUtils.clamp(-Math.atan2(ahead.y, hz + 1e-4) * 0.35, -0.35, 0.3);
      const bank = -f.side * Math.cos(2 * Math.PI * tau) * 0.35;
      _e.set(pitch, yaw, bank, 'YXZ');
      _m.compose(pos, _quat.setFromEuler(_e), _sc.setScalar(bs * rd.s));
      this.flyMesh!.setMatrixAt(k, _m);
      // flap hard on take-off and landing, glide with a few beats in between
      const flap = tau < 0.25 || tau > 0.85 ? 1 : 0.25 + 0.75 * Math.max(0, Math.sin(t * 0.9 + k * 2));
      this.flapAttr!.setXY(k, k * 1.7, flap);
    });
    // the stream: a loose ribbon of gulls rising off the back and trailing behind, each drifting along it,
    // weaving and bobbing, flapping in bursts and gliding in between (they fly with the whale, so face forward)
    const L = this.length, nl = this.flyers.length;
    this.streamers.forEach((st, j) => {
      const s = THREE.MathUtils.clamp(st.s + 0.035 * Math.sin(t * 0.21 + st.phase), 0, 1);
      const b = this.backPoint(0.44, 0, _p);
      _q.set(
        L * (0.07 * Math.sin(s * 6.5 + st.phase) + st.side * 0.06 * s) + 0.8 * Math.sin(t * 0.37 + st.phase * 2),
        bs * 0.9 + L * (0.04 + 0.42 * Math.pow(s, 0.9)) + 0.7 * Math.sin(t * 0.6 + st.phase),
        -L * (0.04 + 0.8 * s) + 1.2 * Math.sin(t * 0.29 + st.phase * 3),
      );
      const pos = _q.add(b.p);
      _e.set(-0.12 - 0.1 * Math.sin(t * 0.6 + st.phase + 1.2), 0.18 * Math.sin(t * 0.33 + st.phase), 0.25 * Math.sin(t * 0.41 + st.phase * 1.7), 'YXZ');
      _m.compose(pos, _quat.setFromEuler(_e), _sc.setScalar(bs * st.size));
      this.flyMesh!.setMatrixAt(nl + j, _m);
      this.flapAttr!.setXY(nl + j, st.phase * 3, 0.25 + 0.75 * sstep(-0.3, 0.3, Math.sin(t * 0.35 + st.phase)));
    });
    for (let i = this.riders.length; i < MAX_GULLS; i++) shadows[i].set(0, 0, 0, 0);
    this.sitMesh.instanceMatrix.needsUpdate = true;
    if (this.flyMesh) { this.flyMesh.instanceMatrix.needsUpdate = true; this.flapAttr!.needsUpdate = true; }
  }

  /**
   * Where the body cuts the cloud tops, swell up soft puffs that hug the flank and are left behind; where a
   * flipper tip or a fluke tip skims the cloud tops, comb out a little trail of puffs behind it.
   */
  private updateWake(dt: number, t: number) {
    const wake = this.wake!, top = this.cloudTop!;
    this.body.updateWorldMatrix(true, false);
    this.updateHugs(top, t);
    // the soft shadow on the cloud tops, cast along the sun from the middle of the body
    {
      const c = this.backPoint(0.42, 0, _r).p; this.body.localToWorld(c);
      const sun = PAINT.uSun.value, k = Math.max(0, c.y - top) / Math.max(sun.y, 0.2);
      const ax = _p.set(0, 0, 1).transformDirection(this.body.matrixWorld);
      const hz = Math.hypot(ax.x, ax.z) || 1;
      setCloudShadow(this.shadowSlot, c.x - sun.x * k, c.z - sun.z * k, ax.x / hz, ax.z / hz, this.length * 0.5, this.length * 0.13, 0.55, c.y - this.length * 0.02);
    }
    const world = this.root.getWorldPosition(_q);
    const vel = this.hasLast && dt > 0 ? world.clone().sub(this.lastWorld).divideScalar(dt) : new THREE.Vector3();
    this.lastWorld.copy(world); this.hasLast = true;
    wake.update(dt);
    const L = this.length;
    const back = vel.lengthSq() > 0.01 ? vel.clone().normalize().negate() : new THREE.Vector3(0, 0, -1).transformDirection(this.body.matrixWorld);

    // trails off the flipper tips and the fluke tips, when they skim the cloud tops
    this.wispT -= dt;
    if (this.wispT <= 0) {
      this.wispT = 0.16 + this.rnd() * 0.1;
      const tips: { rest: THREE.Vector3; u: number }[] = [
        { rest: finPoint(0.93, 0), u: FIN_U },
        { rest: finPoint(0.93, 0).multiply(new THREE.Vector3(-1, 1, 1)), u: FIN_U },
        { rest: new THREE.Vector3(K_SPAN * 0.9, 0.005, K_ROOT - K_SWEEP * 0.85 - 0.01), u: 0.97 },
        { rest: new THREE.Vector3(-K_SPAN * 0.9, 0.005, K_ROOT - K_SWEEP * 0.85 - 0.01), u: 0.97 },
      ];
      for (const tp of tips) {
        const w = this.bendPoint(tp.rest, tp.u, _r);
        this.body.localToWorld(w.p);
        const d = w.p.y - top;
        if (d < 3.5 && d > -2.5) {
          // a little trail of puffs combed out behind the tip
          const p = w.p.clone().addScaledVector(back, L * (0.01 + this.rnd() * 0.03));
          p.y = Math.max(p.y, top - 0.3);
          wake.spawn(p, vel.clone().multiplyScalar(0.2).add(new THREE.Vector3(0, 0.3, 0)), L * 0.02 * (0.8 + this.rnd() * 0.5), 2.6);
        }
      }
    }

    this.wakeT -= dt;
    if (this.wakeT > 0) return;
    this.wakeT = 0.05 + this.rnd() * 0.04;
    // find crossings of the cloud top along lines down the body
    const hits: { p: THREE.Vector3; r: number; out: THREE.Vector3 }[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const phi of [Math.PI * 0.5, Math.PI * 0.68, Math.PI * 0.86, Math.PI * 1.14, Math.PI * 1.32, Math.PI * 1.5]) {
      let prevY = 0;
      for (let i = 0; i <= 18; i++) {
        const u = 0.01 + (i / 18) * 0.88;
        ringPoint(u, phi, a);
        this.bendPoint(a, u, b);
        this.body.localToWorld(b);
        if (i > 0 && (b.y - top) * (prevY - top) <= 0) {
          const out = new THREE.Vector3(Math.sign(a.x) || 1, 0, 0).transformDirection(this.body.matrixWorld);
          hits.push({ p: b.clone(), r: profile(u).w * L, out });
        }
        prevY = b.y;
      }
    }
    if (!hits.length) return;
    for (let k = 0; k < 2; k++) {
      const h = hits[Math.floor(this.rnd() * hits.length)];
      const size = Math.max(1.6, h.r * (0.35 + this.rnd() * 0.3));
      const p = h.p.clone().addScaledVector(h.out, size * (0.2 + this.rnd() * 0.5));
      p.y = top + size * (0.05 + this.rnd() * 0.3);
      // puffs are shoved outwards and a little up, then left behind as the whale swims on
      const v = h.out.clone().multiplyScalar(0.8 + this.rnd()).add(new THREE.Vector3(0, 0.3 + this.rnd() * 0.3, 0)).addScaledVector(vel, 0.15);
      wake.spawn(p, v, size, 4 + this.rnd() * 2.5);
    }
  }

  private hugList: HugPuff[] = [];
  private shadowSlot = -1;
  /**
   * The cloud gathered round the whale: along both lower flanks, wherever the belly lies in the cloud tops,
   * heaps of puffs billow up over the flank (the near ones overlapping it from the front), breathing slowly.
   * They move with the whale; how high they climb follows how deep the body lies.
   */
  private updateHugs(top: number, t: number) {
    const L = this.length, NK = 11;
    let n = 0;
    for (let side = -1; side <= 1; side += 2) for (let k = 0; k < NK; k++) {
      const u = 0.05 + (k / (NK - 1)) * 0.82 + (side > 0 ? 0 : 0.035);
      const pr = profile(u);
      // the lowest point of the body here, and the lower flank
      ringPoint(u, Math.PI, _q);
      const low = this.bendPoint(_q, u, _r).p; this.body.localToWorld(low);
      const lowY = low.y;
      if (lowY > top + 2.5) continue;
      ringPoint(u, side > 0 ? Math.PI * 0.62 : Math.PI * 1.38, _q);
      const flank = this.bendPoint(_q, u, _r).p; this.body.localToWorld(flank);
      const h = Math.sin(k * 12.9898 + side * 78.233) * 43758.5453 % 1, hh = Math.abs(h);
      // (the ends of the body are thinner, so their heaps are smaller)
      const size = L * (0.085 + 0.045 * hh) * (0.45 + 0.55 * Math.min(1, pr.w / 0.08));
      const out = _p.set(side, 0, 0).transformDirection(this.body.matrixWorld);
      const hp = this.hugList[n] ?? (this.hugList[n] = { pos: new THREE.Vector3(), size: 0, seed: 0, along: new THREE.Vector3() });
      hp.pos.copy(flank).addScaledVector(out, size * (0.2 + 0.3 * hh));
      // the crowns climb over the lowest third of the body (a heap's crown is about 0.86 of its size above its
      // centre), but never stand far above the cloud tops
      const crown = Math.min(top + L * 0.07, Math.max(top + 0.6, lowY + L * 0.06 * (0.5 + 1.0 * hh)));
      hp.pos.y = crown - size * 0.86 + size * 0.05 * Math.sin(t * 0.5 + k * 1.7 + side);
      hp.along.set(0, 0, 1).transformDirection(this.body.matrixWorld);
      hp.size = size * (1 + 0.05 * Math.sin(t * 0.37 + k * 2.3));
      hp.seed = (hh * 7.31 + k * 0.137) % 1;
      n++;
    }
    this.hugList.length = n;
    this.wake!.setHugs(this.hugList);
  }

  dispose() {
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.customDepthMaterial?.dispose();
    this.flyMesh?.geometry.dispose();
    this.wake?.mesh.removeFromParent();
    setCloudShadow(this.shadowSlot, 0, 0, 1, 0, 1, 1, 0, 0);
  }
}
