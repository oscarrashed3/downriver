import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint, PAINT } from '../../render/paint';
import { CloudWake } from './whaleClouds';

/**
 * The sky whales of the Sky Isles: huge, gentle blue whales that swim slowly through the cloud sea
 * between the islands, with gulls riding on their backs.
 *
 * One shared geometry (built once at unit length, scaled per whale) holds the whole body, both pectoral
 * flippers, the dorsal fin and the fluke. Nothing is skinned: a vertex shader bends it along its spine with
 * a slow travelling wave (head nearly still, fluke making big strokes), sweeps the flippers about their
 * roots and lets the fluke tips trail. The same bend runs in the shadow pass, and is mirrored on the CPU so
 * the gulls, the ride anchor and the cloud wake stay glued to the moving body.
 *
 * Shape: a broad, flat-topped rostrum (U-shaped from above) with a long, nearly straight mouth line; a
 * heavy body carried well back into a tall, keeled tail stock; long humpback flippers built as flattened,
 * cambered blades with a scalloped leading edge, swept back along the flank; a short-chord, wide fluke.
 *
 * Skin (fragment shader, in rest space so it never swims over the body): a dusty slate blue-grey back with a
 * lavender lift and the darkest blue only on the ridge, soft domain-warped watercolour mottling with
 * weathered paler patches and sparse scuffs, pale barnacle freckles only near the head and flipper roots,
 * a cream belly with bold ventral pleats (pale ridges with a lit and a shaded side, plus a bump to the
 * lighting) from the chin to mid-body, a small eye with a soft lid crease.
 *
 * Light: a MeshToonMaterial patched with paint() for the shared varyings, whose final colour is relit as a
 * clear three-tone design: a bright warm top, a cool blue-violet shade, a warm bounce from the clouds on the
 * belly, soft occlusion under the jaw, at the flipper roots and under each sitting gull, and a soft rim.
 * With cloudTop set, the body melts into cloud-white as it sinks into the cloud tops (noise-warped, no hard
 * line) and is cut away below them, and a CloudWake of soft billboard puffs and wisps trails behind.
 *
 * Space: the whale faces +Z, up is +Y. The snout is at z = +length/2.
 * Cost (high detail): 24.7k triangles and 1 draw for the whale, 2 instanced draws for its gulls (4.5k
 * triangles for 7), plus the whale and the sitting gulls again in the shadow pass: 5 draws in all. Low
 * detail is 4.4k triangles. The cloud wake, when used, is one more (transparent, instanced) draw of up to
 * 170 two-triangle cards. All motion is in the vertex shader; the CPU only moves the gulls (one
 * instanced matrix each) and scans the body against the cloud tops a few times a second for the wake.
 */

export interface SkyWhaleOpts {
  /** Nose to fluke tips, metres. Default 36. */
  length?: number;
  /** Varies the mottling, the swim rhythm and where the gulls sit. */
  seed?: number;
  /** Gulls riding on the back (a couple of them take off and circle now and then). Default 7, at most 8 sit. */
  birds?: number;
  /** Mesh density. 'low' for far whales. */
  detail?: 'high' | 'low';
  /** World height of the cloud tops; when set, the whale melts into them and leaves a cloud wake. */
  cloudTop?: number | null;
  /** Gull size multiplier (1 = about a metre long). */
  birdScale?: number;
}

// ------------------------------------------------------------------------------------------------ shape

/** Where the body ends and the fluke begins (as a fraction of the length from the snout). */
const UB = 0.9;
/** The ride anchor, as a fraction of the length from the snout. */
const RIDE_U = 0.25;

// Body profile along t = u / UB: half-width, height of the back and depth of the belly (unit length).
// The head is broad and low on top; the body stays heavy well back, into a tall, narrow tail stock.
const PT = [0.045, 0.1, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.86, 0.93, 1.0];
const PW = [0.056, 0.072, 0.081, 0.087, 0.089, 0.087, 0.081, 0.071, 0.056, 0.040, 0.026, 0.014];
const PH = [0.021, 0.035, 0.049, 0.065, 0.076, 0.080, 0.079, 0.073, 0.063, 0.051, 0.037, 0.020];
const PB = [0.047, 0.073, 0.093, 0.104, 0.105, 0.099, 0.088, 0.075, 0.059, 0.044, 0.030, 0.016];

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
    return { w: PW[0] * Math.pow(k, 0.8), h: PH[0] * k, b: PB[0] * k };
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
  // superellipse exponents (< 1 is boxier): a flat-topped head, a fuller throat, and a tall tail stock
  // with soft keels above and below
  const eTop = 0.62 + 0.25 * sstep(0.05, 0.32, t) + 0.38 * sstep(0.74, 0.97, t);
  const eBot = 0.76 + 0.11 * sstep(0.45, 0.65, t) + 0.3 * sstep(0.76, 0.97, t);
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

// The left flipper's frame: length axis L (out, down and back, about 50 degrees from vertical), the top face's
// normal N (up and out, so the flat face shows from the side and from above) and the chord C (leading edge).
const FIN_L = new THREE.Vector3(0.5, -0.5, -0.7).normalize();
const FIN_N = new THREE.Vector3(1, 0.62, 0).addScaledVector(FIN_L, -new THREE.Vector3(1, 0.62, 0).dot(FIN_L)).normalize();
const FIN_C = new THREE.Vector3().crossVectors(FIN_L, FIN_N).normalize();
const FIN_U = 0.27, FIN_LEN = 0.245;
/** Where the left flipper meets the body (rest, unit length). */
function finRootPoint() { return ringPoint(FIN_U, Math.PI * 0.64).multiply(new THREE.Vector3(0.84, 0.9, 1)); }
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
const K_SPAN = 0.16, K_CHORD = 0.052, K_SWEEP = 0.05;
const K_ROOT = 0.5 - UB + 0.024;

interface WhaleGeo { geo: THREE.BufferGeometry; eye: THREE.Vector3; finRoot: THREE.Vector3; tris: number }
const geoCache = new Map<string, WhaleGeo>();

/** Build (once per detail level) the unit-length whale: body, flippers, dorsal fin and fluke in one geometry. */
function whaleGeometry(detail: 'high' | 'low'): WhaleGeo {
  const hit = geoCache.get(detail); if (hit) return hit;
  const hi = detail === 'high';
  const NS = hi ? 150 : 60, NR = hi ? 64 : 28;
  const eye = eyeCentre();

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
      // the lower jaw bulges out a touch below the long mouth line
      const ym = mouthY(u);
      p.x *= 1 + 0.035 * sstep(0.26, 0.17, u) * sstep(ym + 0.001, ym - 0.014, p.y);
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
    // scallops (tubercles) along the leading edge, fading out towards the tip
    const tub = l > 0.1 && l < 0.95 ? 0.0032 * Math.pow(Math.max(0, Math.sin(l * Math.PI * 10.5)), 2) * (1 - 0.6 * l) : 0;
    const thick = chord * (0.25 - 0.08 * l) + 0.0006;
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
  const finRoot = finRootPoint();
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

  // ---- fluke: short chord, wide span, swept tips, a notch, a thick rounded leading edge. aW = (u, a, c, 3)
  const KN = hi ? 48 : 18, KR = hi ? 16 : 8;
  const kRings: THREE.Vector3[][] = [], kMeta: number[][][] = [];
  for (let i = 0; i <= KN; i++) {
    const a = -1 + (2 * i) / KN, aa = Math.abs(a);
    const lead = K_ROOT - K_SWEEP * Math.pow(aa, 1.6);
    let chord = K_CHORD * Math.pow(Math.max(0, 1 - Math.pow(aa, 2.6)), 0.5) + 0.002;
    chord -= 0.013 * Math.exp(-((a / 0.07) ** 2));
    const thick = chord * 0.24 * (1 - 0.35 * aa) + 0.001 + 0.014 * Math.exp(-((a / 0.13) ** 2));
    const yb = 0.006 * a * a;
    const r: THREE.Vector3[] = [], m: number[][] = [];
    for (let k = 0; k < KR; k++) {
      const ang = (k / KR) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
      const z = lead - chord / 2 + (c * chord) / 2;
      const y = yb + (s * thick / 2) * (0.5 + 0.5 * c);
      r.push(new THREE.Vector3(a * K_SPAN, y, z)); m.push([0.5 - z, a, c, 3]);
    }
    kRings.push(r); kMeta.push(m);
  }
  const fluke = loftRings(kRings, kMeta, (pt) => new THREE.Vector3(0, pt.y - 0.006 * (pt.x / K_SPAN) ** 2, 0));

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

const BEND_GLSL = /* glsl */ `
  attribute vec4 aW;
  uniform vec4 uWave;   // x body phase, y yaw phase, z fin phase, w fin amplitude (radians)
  uniform vec4 uShape;  // x body wave amplitude, y yaw amplitude, z fluke tip lag
  uniform vec3 uFinRoot;
  #ifdef WHALE_VARY
  varying vec4 vW; varying vec3 vR; varying vec3 vRN;
  #endif
  float wA(float u){ return uShape.x * (0.006 + 0.075 * pow(max(u, 0.0), 2.2)); }
  float wAd(float u){ return uShape.x * 0.165 * pow(max(u, 1e-4), 1.2); }
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
      float a = side * uWave.w * sin(uWave.z) * (0.75 + 0.5 * reach);
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
  uniform vec3 uRidge, uBack, uFlank, uLav, uSpot, uBelly, uPleatD, uPleatL, uLine, uEye, uFinRoot;
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
  vec3 whaleAlbedo(){
    float u = vW.x, yn = vW.y, part = vW.w;
    vec3 p = vR;
    vec3 q = p * 11.0 + vec3(uSeed * 17.0, uSeed * 3.0, uSeed * 5.0);
    // watercolour mottling: domain-warped fbm, big soft blotches whose density drifts over the body
    vec3 wq = q + 1.7 * vec3(wN(q * 0.45), wN(q * 0.45 + 11.3), wN(q * 0.45 + 23.7));
    float m = wFbm(wq);
    float big = wN(q * 0.3 + 40.0);
    float pale = 0.0;
    vec3 dark;
    vec3 sp = vec3(abs(p.x), p.y, p.z);
    if (part < 0.5) {
      // slate on the back, dustier and lighter down the flank, the darkest blue only along the ridge
      dark = mix(uFlank, uBack, smoothstep(-0.3, 0.55, yn + m * 0.3));
      dark = mix(dark, uRidge, smoothstep(0.6, 0.97, yn + m * 0.15) * smoothstep(0.1, 0.3, u) * 0.75);
      // countershading: the cream belly rises towards the head, with a soft, irregular edge
      float bnd = mix(-0.4, -0.16, smoothstep(0.2, 0.45, u)) - 0.3 * smoothstep(0.6, 0.9, u);
      bnd += m * 0.34 + big * 0.12;
      pale = smoothstep(bnd + 0.08, bnd - 0.15, yn);
      // the whole lower jaw is pale up to the mouth line
      float ym = whaleMouthY(u);
      pale = max(pale, smoothstep(0.235, 0.2, u) * smoothstep(ym - 0.001, ym - 0.007, p.y));
      // occlusion: round the flipper roots, under the chin and the throat
      vec3 fr = sp - uFinRoot;
      whaleAO *= 1.0 - 0.38 * exp(-dot(fr, fr) / (0.03 * 0.03));
      whaleAO *= 1.0 - 0.16 * smoothstep(-0.45, -0.9, yn) * smoothstep(0.34, 0.12, u);
    } else if (part < 1.5) {
      // flipper: dark slate top, pale underside, a pale knobbly leading edge and a pale tip
      vec3 n = normalize(vec3(vRN.x * sign(p.x), vRN.y, vRN.z));
      float under = smoothstep(0.25, -0.35, dot(n, ${v3(FIN_N)}));
      float lead = smoothstep(0.55, 0.95, vW.z) * smoothstep(0.08, 0.2, vW.y);
      pale = max(under * 0.95, (lead * 0.5 + smoothstep(0.82, 1.0, vW.y) * 0.4) * (1.0 - under));
      dark = mix(uBack, uRidge, 0.25);
      // the root sits in the shadow of the body
      whaleAO *= 1.0 - 0.3 * smoothstep(0.18, 0.0, vW.y);
    } else if (part < 2.5) {
      dark = uRidge;
    } else {
      // fluke: slate above, a mottled pale underside
      pale = smoothstep(0.1, -0.5, vRN.y) * (0.6 + 0.25 * smoothstep(-0.1, 0.3, m));
      dark = mix(uBack, uRidge, 0.4);
    }
    // the painting on the dark skin: a lavender lift in places, soft weathered paler patches, gentle darker blots
    dark = mix(dark, uLav, smoothstep(-0.1, 0.45, big) * 0.38);
    dark = mix(dark, uSpot, smoothstep(0.02, 0.32, m) * 0.5);
    dark = mix(dark, dark * 0.82, smoothstep(-0.04, -0.32, m) * 0.65);
    // sparse long scuffs, running with the body
    float sc = wN(vec3(q.x * 2.4, q.y * 2.4, q.z * 0.9) * 1.6 + 9.0);
    float scMask = smoothstep(0.3, 0.45, wN(q * 0.55 + 71.0)) * smoothstep(0.25, 0.4, wN(q * 2.3 + 13.0));
    dark = mix(dark, uSpot, wIn(abs(sc), 0.018, fwidth(sc)) * scMask * 0.22);
    vec3 belly = uBelly * (0.975 + m * 0.05);
    belly = mix(belly, uBelly * vec3(0.93, 0.94, 0.99), smoothstep(0.15, 0.45, m) * 0.5);
    vec3 col = mix(dark, belly, pale);

    if (part < 0.5) {
      // ventral pleats: bold pale ridges from the chin back to mid-body, each groove ending at its own place;
      // the upper side of each ridge catches the light and the lower side falls into shade
      float g = vW.z * 8.5;
      float li = floor(g + 0.5);
      float f = g - li;
      float aa = fwidth(g);
      float endU = 0.47 + 0.09 * wHash(vec3(li, 1.7, 2.3));
      float pm = smoothstep(0.012, 0.045, u) * smoothstep(endU, endU - 0.07, u) * smoothstep(1.42, 1.15, vW.z);
      float fade = 1.0 - smoothstep(0.25, 0.55, aa);
      float groove = wIn(abs(abs(f) - 0.5), 0.07, aa);
      float litSide = smoothstep(0.02, 0.12, f) * smoothstep(0.42, 0.22, f);
      float shadeSide = smoothstep(-0.05, -0.15, f) * smoothstep(-0.48, -0.3, f);
      col = mix(col, uPleatL, litSide * pm * 0.55 * fade);
      col = mix(col, uPleatD, (groove * 0.75 + shadeSide * 0.35) * pm * fade);
      whaleH += pm * 0.0018 * (0.5 + 0.5 * cos(6.2832 * g)) * fade;

      // the mouth: a long soft dark line with a crease under it
      float ym = whaleMouthY(u);
      float mm = smoothstep(0.003, 0.016, u) * smoothstep(${(MOUTH_U + 0.002).toFixed(3)}, ${(MOUTH_U - 0.012).toFixed(3)}, u);
      float md = p.y - ym;
      col = mix(col, uLine, wIn(abs(md), 0.0008, fwidth(p.y)) * mm * 0.85);
      whaleH -= 0.0014 * exp(-pow((md + 0.0012) / 0.0022, 2.0)) * mm;
      whaleAO *= 1.0 - 0.18 * exp(-pow((md + 0.002) / 0.003, 2.0)) * mm;

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
        whaleH += 0.0006 * exp(-pow((lr - 0.0085) / 0.0011, 2.0)) * smoothstep(0.0, 0.0035, d.y);
      }

      // twin blowholes in the splash guard
      if (p.y > 0.0) {
        vec2 b = vec2((abs(p.x) - 0.0038) / 0.001, (p.z - 0.34) / 0.006);
        float bh = length(b);
        col = mix(col, uLine * 0.9, wIn(bh, 1.0, fwidth(bh) * 1.5) * 0.7);
      }
    }
    if (part < 1.5) {
      // pale barnacle freckles, only on the head and round the flipper roots
      vec3 c = p * 210.0;
      vec3 id = floor(c);
      vec3 fo = fract(c) - 0.5 - (vec3(wHash(id + 1.3), wHash(id + 4.1), wHash(id + 7.9)) - 0.5) * 0.5;
      vec3 frd = sp - uFinRoot;
      float zone = part < 0.5 ? smoothstep(0.22, 0.05, u) * smoothstep(-0.4, 0.2, yn) : 0.0;
      zone = max(zone, exp(-dot(frd, frd) / (0.04 * 0.04)) * 0.9);
      float fk = zone * step(0.9, wHash(id)) * (0.5 + 0.5 * smoothstep(0.0, 0.3, m + 0.15));
      float fr = wIn(length(fo), 0.11 + 0.1 * wHash(id + 2.2), fwidth(c.x) * 1.2) * fk * (1.0 - smoothstep(0.3, 0.7, fwidth(c.x)));
      col = mix(col, mix(uSpot, uBelly, 0.4), fr * 0.38);
    }
    // contact shadows under the sitting gulls
    for (int i = 0; i < ${MAX_GULLS}; i++) {
      vec4 gl = uGulls[i];
      vec3 gd = p - gl.xyz;
      float gr = max(gl.w, 1e-3);
      whaleAO *= 1.0 - 0.6 * step(1e-3, gl.w) * exp(-min(dot(gd, gd) / (gr * gr), 30.0));
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

/** The lighting shared by the whales and their gulls: the toon light term relit as warm top, cool shade, warm bounce. */
const RELIGHT_GLSL = /* glsl */ `
  // how lit this point is (0 shade .. 1 full sun), from the toon ramp and the shadow map
  vec3 sunRad = uSunCol * ${(2.6 / Math.PI).toFixed(4)};
  float lum = clamp(dot(reflectedLight.directDiffuse, vec3(1.0)) / max(dot(diffuseColor.rgb * sunRad, vec3(1.0)), 1e-4), 0.0, 1.0);
  vec3 wNn = normalize(vPNormal); vec3 wV = normalize(cameraPosition - vPWorld);
  // cool blue-violet in the shade, a warm sunlit top
  vec3 shadeL = uShadeCol * (0.82 + 0.18 * (wNn.y * 0.5 + 0.5));
  // (the shade takes a little of the light's colour, so a whale seen against a low sun stays dusty, not navy)
  shadeL = mix(shadeL, vec3(dot(shadeL, vec3(0.333))) * (0.7 + 0.4 * uSunCol), 0.3);
  vec3 litL = mix(vec3(1.0), uSunCol, 0.6) * 1.1 + vec3(0.05, 0.05, 0.06);
  vec3 lightL = mix(shadeL, litL, lum);
  lightL += uSunCol * vec3(0.1, 0.07, 0.02) * smoothstep(0.55, 0.95, wNn.y) * lum;
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
      .replace(/void main\(\)\s*\{/, `uniform vec3 uSunCol, uShadeCol, uBounce, uCloudLit, uCloudShade; uniform float uCloudTop, uCloudOn;\n` + SKIN_GLSL + '\nvoid main() {')
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
          // warm light bounced up from the sunlit clouds, glowing through the pale belly
          float under = smoothstep(0.15, -0.75, wNn.y);
          outgoingLight += diffuseColor.rgb * uBounce * (0.55 + 0.45 * uSunCol) * under * (0.12 + 0.28 * whalePale) * (1.0 - 0.5 * lum) * mix(1.0, whaleAO, 0.6);
          // a soft painted rim, warm on the sun side
          float rimK = pow(1.0 - clamp(dot(wNn, wV), 0.0, 1.0), 3.0) * clamp(dot(wNn, uSun) * 0.6 + 0.4, 0.0, 1.0);
          outgoingLight += uRimCol * rimK * 0.3;
          // sinking into the cloud tops: melt into cloud-white along a ragged, drifting edge, gone below it
          if (uCloudOn > 0.5) {
            float cn = wN(vPWorld * 0.16 + vec3(0.0, 0.0, uTime * 0.25)) * 1.4 + wN(vPWorld * 0.55 + 4.0) * 0.5;
            float dd = vPWorld.y - uCloudTop + cn * 1.3;
            if (dd < -1.4) discard;
            vec3 cc = mix(uCloudShade, uCloudLit * (0.6 + 0.45 * uSunCol), clamp(lum * 0.6 + 0.25 + wNn.y * 0.25, 0.0, 1.0));
            outgoingLight = mix(outgoingLight, cc, smoothstep(1.3, -1.3, dd));
          }
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'skywhale2';

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + BEND_GLSL)
      .replace('#include <begin_vertex>', 'vec3 transformed = position; vec3 wbN = normal; whaleBend(transformed, wbN);');
  };
  depth.customProgramCacheKey = () => 'skywhale2depth';
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

const GULL_WHITE = '#f8f6f1', GULL_GREY = '#aeb6c6', GULL_TIP = '#2f323e', GULL_BILL = '#eadb9e', GULL_EYE = '#23252e';

/** A gull sitting with its wings folded: long, low and horizontal, the head tucked in (about 0.65 m; faces +Z). */
function sittingGull() {
  return kit([
    // body: a long low teardrop, deepest at the breast
    { g: new THREE.SphereGeometry(1, 12, 8), c: GULL_WHITE, p: [0, 0.095, 0.0], s: [0.075, 0.07, 0.25] },
    { g: new THREE.SphereGeometry(1, 10, 7), c: GULL_WHITE, p: [0, 0.1, 0.13], s: [0.07, 0.072, 0.12] },
    // head: small, low, sitting on the shoulders; a thin pale bill
    { g: new THREE.SphereGeometry(1, 10, 7), c: GULL_WHITE, p: [0, 0.15, 0.22], s: [0.046, 0.044, 0.058] },
    { g: new THREE.ConeGeometry(0.011, 0.075, 6), c: GULL_BILL, p: [0, 0.143, 0.305], r: [Math.PI / 2 + 0.12, 0, 0], s: [1, 1, 0.75] },
    { g: new THREE.SphereGeometry(0.008, 5, 4), c: GULL_EYE, p: [0.033, 0.158, 0.24] },
    { g: new THREE.SphereGeometry(0.008, 5, 4), c: GULL_EYE, p: [-0.033, 0.158, 0.24] },
    // folded grey wings lying along the back, and the dark crossed primaries past the tail
    { g: new THREE.SphereGeometry(1, 10, 6), c: GULL_GREY, p: [0.048, 0.128, -0.05], s: [0.045, 0.032, 0.23], r: [0.06, 0.07, -0.25] },
    { g: new THREE.SphereGeometry(1, 10, 6), c: GULL_GREY, p: [-0.048, 0.128, -0.05], s: [0.045, 0.032, 0.23], r: [0.06, -0.07, 0.25] },
    { g: new THREE.ConeGeometry(0.03, 0.2, 6), c: GULL_TIP, p: [0.018, 0.13, -0.3], r: [-Math.PI / 2 + 0.06, 0, 0], s: [1.2, 1, 0.35] },
    { g: new THREE.ConeGeometry(0.03, 0.2, 6), c: GULL_TIP, p: [-0.018, 0.128, -0.3], r: [-Math.PI / 2 + 0.06, 0, 0], s: [1.2, 1, 0.35] },
    // white tail under the wing tips
    { g: new THREE.ConeGeometry(0.045, 0.14, 6), c: GULL_WHITE, p: [0, 0.095, -0.27], r: [-Math.PI / 2, 0, 0], s: [1.3, 1, 0.45] },
  ]);
}

/** A gull in flight, wings spread (span about 1.4 m); aWing grows from the shoulder to the tip for the flap. */
function flyingGull() {
  const wing = (side: number) => {
    const g = new THREE.BoxGeometry(0.66, 0.02, 0.2, 8, 1, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + 0.33, k = x / 0.66; // 0 shoulder .. 1 tip
      const chord = 1 - 0.65 * k * k;
      p.setZ(i, p.getZ(i) * chord - 0.06 * k * k);
      p.setY(i, p.getY(i) + 0.07 * Math.sin(Math.PI * Math.min(1, k * 1.4)) - 0.05 * k * k);
      p.setX(i, side * (x + 0.05));
    }
    g.computeVertexNormals();
    return g;
  };
  const tip = (side: number) => {
    const g = new THREE.BoxGeometry(0.18, 0.022, 0.09, 2, 1, 1);
    g.translate(side * 0.66, 0.0, -0.08);
    return g;
  };
  const w = (x: number) => Math.min(1, Math.abs(x) / 0.72);
  return kit([
    { g: new THREE.SphereGeometry(1, 10, 8), c: GULL_WHITE, s: [0.075, 0.07, 0.26] },
    { g: new THREE.SphereGeometry(1, 9, 7), c: GULL_WHITE, p: [0, 0.035, 0.24], s: [0.045, 0.043, 0.058] },
    { g: new THREE.ConeGeometry(0.011, 0.075, 6), c: GULL_BILL, p: [0, 0.03, 0.32], r: [Math.PI / 2 + 0.1, 0, 0] },
    { g: new THREE.ConeGeometry(0.06, 0.16, 6), c: GULL_WHITE, p: [0, 0.0, -0.3], r: [-Math.PI / 2, 0, 0], s: [1.3, 1, 0.3] },
    { g: wing(1), c: GULL_GREY, wing: w },
    { g: wing(-1), c: GULL_GREY, wing: w },
    { g: tip(1), c: GULL_TIP, wing: w },
    { g: tip(-1), c: GULL_TIP, wing: w },
  ]);
}

let gullGeos: { sit: THREE.BufferGeometry; fly: THREE.BufferGeometry } | null = null;
let gullMats: { sit: THREE.MeshToonMaterial; fly: THREE.MeshToonMaterial } | null = null;
const gullTime = { value: 0 };
const GULL_LIGHT: U = {
  uShadeCol: { value: new THREE.Color('#8c90b8') },
};

/** The gulls' toon material, relit like the whale (warm sunlit tops, cool lavender shade). */
function gullMaterial(fly: boolean) {
  const mat = paint(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: whaleRamp(), side: fly ? THREE.DoubleSide : THREE.FrontSide }), { variation: 0.1, rim: 1 });
  const painted = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    painted.call(mat, sh, r);
    Object.assign(sh.uniforms, GULL_LIGHT);
    sh.uniforms.uGullT = gullTime;
    sh.fragmentShader = sh.fragmentShader
      .replace(/void main\(\)\s*\{/, 'uniform vec3 uShadeCol, uSunCol;\nvoid main() {')
      .replace('#include <opaque_fragment>', `{
          ${RELIGHT_GLSL}
          outgoingLight = diffuseColor.rgb * lightL;
          float rimK = pow(1.0 - clamp(dot(wNn, wV), 0.0, 1.0), 3.0) * clamp(dot(wNn, uSun) * 0.6 + 0.4, 0.0, 1.0);
          outgoingLight += uRimCol * rimK * 0.3;
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
    this.birdScale = (opts.birdScale ?? 1) * 2.0;
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
      // dusty slate blue-grey (HSV saturation about 0.3), value close to the sky; darkest only on the ridge
      uRidge: { value: tone('#5c6990') },
      uBack: { value: tone('#7886ab') },
      uFlank: { value: tone('#9da6c2') },
      uLav: { value: tone('#938cc0') },
      uSpot: { value: tone('#b0bad6') },
      uBelly: { value: new THREE.Color('#eeece7') },
      uPleatD: { value: new THREE.Color('#aeaec0') },
      uPleatL: { value: new THREE.Color('#fbf8f1') },
      uLine: { value: new THREE.Color('#2a2c40') },
      uShadeCol: { value: new THREE.Color('#878cbc') },
      uBounce: { value: new THREE.Color('#ffe6c8') },
      uCloudLit: { value: new THREE.Color('#f7f5f1') },
      uCloudShade: { value: new THREE.Color('#b7c0dc') },
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
    if (n > 0) {
      const { geos, mats } = gulls();
      for (let i = 0; i < n; i++) {
        const u = 0.29 + (i / Math.max(1, n - 1)) * 0.3 + (r() - 0.5) * 0.04;
        const x = (r() - 0.5) * 0.026;
        const pr = profile(u);
        const rest = ringPoint(u, Math.asin(Math.max(-1, Math.min(1, x / pr.w))));
        this.riders.push({ u, x, yaw: (r() - 0.5) * 1.2 + (r() < 0.2 ? Math.PI : 0), s: 0.9 + r() * 0.2, rest });
      }
      const nf = n >= 5 ? 2 : n >= 2 ? 1 : 0;
      for (let k = 0; k < nf; k++) {
        this.flyers.push({ slot: Math.floor((k + 0.5) * n / nf), period: 16 + r() * 8, offset: r(), side: k % 2 ? -1 : 1, rx: 5 + r() * 4, rz: 8 + r() * 6, hh: 5 + r() * 4 });
      }
      const tri = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
      this.gullTriangles = Math.round(tri(geos.sit) * (n - nf) + tri(geos.fly) * nf);
      this.sitMesh = new THREE.InstancedMesh(geos.sit, mats.sit, n);
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
    this.wake = opts.cloudTop != null ? new CloudWake(170) : null;
    this.update(0, 0);
  }

  /** World height of the cloud tops (the whale melts into them and leaves a wake), or null for none. */
  get cloudTop(): number | null { return this.u.uCloudOn.value ? (this.u.uCloudTop.value as number) : null; }
  set cloudTop(v: number | null) { this.u.uCloudOn.value = v === null ? 0 : 1; if (v !== null) this.u.uCloudTop.value = v; }

  // ---- the CPU mirror of the bend (body only), in unit space

  private wA(u: number) { return this.amp.body * (0.006 + 0.075 * Math.pow(Math.max(u, 0), 2.2)); }
  private wD(u: number) { return this.wA(u) * Math.sin(this.ph.body - WK * u); }
  private wDd(u: number) { const ph = this.ph.body - WK * u; return this.amp.body * 0.165 * Math.pow(Math.max(u, 1e-4), 1.2) * Math.sin(ph) - WK * this.wA(u) * Math.cos(ph); }
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
    (this.u.uShape.value as THREE.Vector4).set(this.amp.body, this.amp.yaw, this.amp.lag, 0);

    // a slow, heavy roll and a gentle heave against the strokes
    this.body.rotation.z = 0.035 * Math.sin(this.ph.yaw * 0.8 + 1.0) + 0.018 * Math.sin(this.ph.fin);
    this.body.position.y = this.length * (0.005 * Math.sin(this.ph.body - 0.9) + 0.006 * Math.sin(t * 0.21));

    // the ride anchor follows the back
    const a = this.backPoint(RIDE_U, 0, this.rideAnchor.position);
    this.rideAnchor.rotation.set(-a.pitch, a.yaw, 0, 'YXZ');

    this.updateGulls(dt, t);
    if (this.wake && this.cloudTop !== null) this.updateWake(dt);
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
      const pitch = -Math.atan2(ahead.y, hz + 1e-4) * 0.6;
      const bank = -f.side * Math.cos(2 * Math.PI * tau) * 0.35;
      _e.set(pitch, yaw, bank, 'YXZ');
      _m.compose(pos, _quat.setFromEuler(_e), _sc.setScalar(bs * rd.s));
      this.flyMesh!.setMatrixAt(k, _m);
      // flap hard on take-off and landing, glide with a few beats in between
      const flap = tau < 0.25 || tau > 0.85 ? 1 : 0.25 + 0.75 * Math.max(0, Math.sin(t * 0.9 + k * 2));
      this.flapAttr!.setXY(k, k * 1.7, flap);
    });
    for (let i = this.riders.length; i < MAX_GULLS; i++) shadows[i].set(0, 0, 0, 0);
    this.sitMesh.instanceMatrix.needsUpdate = true;
    if (this.flyMesh) { this.flyMesh.instanceMatrix.needsUpdate = true; this.flapAttr!.needsUpdate = true; }
  }

  /**
   * Where the body cuts the cloud tops, swell up soft puffs that hug the flank and are left behind; where a
   * flipper tip or a fluke tip skims the cloud tops, draw out a long wisp.
   */
  private updateWake(dt: number) {
    const wake = this.wake!, top = this.cloudTop!;
    this.body.updateWorldMatrix(true, false);
    const world = this.root.getWorldPosition(_q);
    const vel = this.hasLast && dt > 0 ? world.clone().sub(this.lastWorld).divideScalar(dt) : new THREE.Vector3();
    this.lastWorld.copy(world); this.hasLast = true;
    wake.update(dt);
    const L = this.length;
    const back = vel.lengthSq() > 0.01 ? vel.clone().normalize().negate() : new THREE.Vector3(0, 0, -1).transformDirection(this.body.matrixWorld);

    // wisps off the flipper tips and the fluke tips, when they skim the cloud tops
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
          const len = L * (0.1 + this.rnd() * 0.06);
          wake.spawn(w.p.clone().addScaledVector(back, len * 0.6), vel.clone().multiplyScalar(0.25).add(new THREE.Vector3(0, 0.25, 0)), L * 0.022 * (0.8 + this.rnd() * 0.5), 3.2, back.clone().multiplyScalar(len), 0.55);
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
      wake.spawn(p, v, size, 4 + this.rnd() * 2.5, this.rnd() < 0.35 ? back.clone().multiplyScalar(size * (1.6 + this.rnd())) : undefined, 0.85);
    }
  }

  dispose() {
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.customDepthMaterial?.dispose();
    this.flyMesh?.geometry.dispose();
    this.wake?.mesh.removeFromParent();
  }
}
