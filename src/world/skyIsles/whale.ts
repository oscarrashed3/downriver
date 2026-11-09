import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint, PAINT } from '../../render/paint';
import { CloudWake } from './whaleClouds';

/**
 * The sky whales of the Sky Isles: huge, gentle blue whales that swim slowly through the cloud sea
 * between the islands, with gulls riding on their backs.
 *
 * One shared geometry (built once at unit length, scaled per whale) holds the whole body, both pectoral
 * fins, the dorsal fin and the fluke. Nothing is skinned: a vertex shader bends it along its spine with a
 * slow travelling wave (head nearly still, fluke making big strokes), sweeps the fins about their roots
 * and lets the fluke tips trail. The same bend runs in the shadow pass, and is mirrored on the CPU so the
 * gulls and the ride anchor stay glued to the moving back.
 *
 * The skin is painted in the fragment shader from rest-space coordinates, so it never swims over the body:
 * a blue-grey back with soft pale dapples, a cream belly with real ventral pleats (lines plus a bump to
 * the lighting), a smiling mouth line, a small kind eye with a lid, blowholes and pale freckles on the head.
 * It is a MeshToonMaterial patched with the game's paint() look, a gentler three-tone ramp, a warm bounce
 * from the clouds below on the pale belly and a soft sheen along the back.
 *
 * Space: the whale faces +Z, up is +Y. The snout is at z = +length/2.
 * Cost (high detail): 22.5k triangles and 1 draw for the whale, 2 instanced draws for its gulls (about 3.5k
 * triangles for 7), plus the whale and sitting gulls again in the shadow pass. Low detail is 4.2k triangles.
 * The cloud wake, when used, is one more instanced draw.
 */

export interface SkyWhaleOpts {
  /** Nose to fluke tips, metres. Default 36. */
  length?: number;
  /** Varies the mottling, the swim rhythm and where the gulls sit. */
  seed?: number;
  /** Gulls riding on the back (a couple of them take off and circle now and then). Default 7. */
  birds?: number;
  /** Mesh density. 'low' for far whales. */
  detail?: 'high' | 'low';
  /** World height of the cloud tops; when set, the whale leaves a cloud wake where it breaks through. */
  cloudTop?: number | null;
  /** Gull size multiplier (1 = about a metre long). */
  birdScale?: number;
}

// ------------------------------------------------------------------------------------------------ shape

/** Where the body ends and the fluke begins (as a fraction of the length from the snout). */
const UB = 0.9;
/** The ride anchor and gull band, as fractions of the length from the snout. */
const RIDE_U = 0.25;

// Body profile along t = u / UB: half-width, height of the back and depth of the belly (unit length).
const PT = [0.045, 0.1, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.86, 0.93, 1.0];
const PW = [0.047, 0.067, 0.079, 0.087, 0.089, 0.086, 0.078, 0.063, 0.045, 0.028, 0.018, 0.011];
const PH = [0.026, 0.042, 0.056, 0.070, 0.079, 0.081, 0.077, 0.066, 0.052, 0.038, 0.026, 0.015];
const PB = [0.042, 0.070, 0.092, 0.104, 0.106, 0.098, 0.083, 0.063, 0.043, 0.029, 0.021, 0.013];

function smoothstepJS(a: number, b: number, x: number) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

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

/** Half-width, back height and belly depth at u (0 snout .. UB end of the body); the snout is a rounded dome. */
function profile(u: number) {
  const t = u / UB;
  if (t < PT[0]) {
    const k = Math.sqrt(Math.max(0, 1 - (1 - t / PT[0]) ** 2));
    return { w: PW[0] * k, h: PH[0] * k, b: PB[0] * k };
  }
  return { w: fW(t), h: fH(t), b: fB(t) };
}

/** The painted mouth line (rest y, unit length) for u in 0..0.19: a long, gentle smile. */
function mouthY(u: number) { const x = Math.min(1, u / 0.19); return -0.003 - 0.016 * x + 0.012 * x ** 4; }
const MOUTH_GLSL = `float whaleMouthY(float u){ float x = min(1.0, u / 0.19); return -0.003 - 0.016 * x + 0.012 * x * x * x * x; }`;

/** A point on the bare body surface at u, angle phi (0 = top, PI = belly, PI/2 = the +x side). */
function ringPoint(u: number, phi: number, out = new THREE.Vector3()) {
  const { w, h, b } = profile(u);
  const s = Math.sin(phi), c = Math.cos(phi);
  const t = u / UB;
  const eTop = 2 / 2.3, eBot = 2 / (t < 0.55 ? 2.6 : 2.3);
  const e = c >= 0 ? eTop : eBot;
  const x = w * Math.sign(s) * Math.abs(s) ** e;
  const y = (c >= 0 ? h : b) * Math.sign(c) * Math.abs(c) ** e;
  return out.set(x, y, 0.5 - u);
}

/** The eye centre (left side, rest space, unit length): just above and behind the corner of the mouth. */
const EYE_U = 0.212;
function eyeCentre() {
  // find the angle on the side where the surface passes y = -0.0035
  let lo = 0.6, hi = 2.4;
  const p = new THREE.Vector3();
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; ringPoint(EYE_U, m, p); if (p.y > -0.0035) lo = m; else hi = m; }
  return ringPoint(EYE_U, (lo + hi) / 2, p).clone();
}

/** Loft closed rings (each a list of points) into an indexed tube, capping both ends with a centre point. */
function loft(rings: THREE.Vector3[][]) {
  const n = rings[0].length;
  const pos: number[] = [], idx: number[] = [];
  for (const r of rings) for (const p of r) pos.push(p.x, p.y, p.z);
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + ((j + 1) % n), c = (i + 1) * n + j, d = (i + 1) * n + ((j + 1) % n);
    idx.push(a, c, b, b, c, d);
  }
  const cap = (ri: number, flip: boolean) => {
    const ctr = new THREE.Vector3(); for (const p of rings[ri]) ctr.add(p); ctr.multiplyScalar(1 / n);
    const ci = pos.length / 3; pos.push(ctr.x, ctr.y, ctr.z);
    for (let j = 0; j < n; j++) { const a = ri * n + j, b = ri * n + ((j + 1) % n); if (flip) idx.push(ci, b, a); else idx.push(ci, a, b); }
  };
  cap(0, false); cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Flatten an airfoil ring: chord along z (leading edge at +z), thickness along y. */
function airfoil(n: number, chord: number, thick: number, lead = 0) {
  const pts: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    // fuller near the leading edge, thin and sharp at the trailing edge
    const z = (c * chord) / 2 + (c > 0 ? lead * c : 0);
    const y = (s * thick / 2) * (0.62 + 0.38 * c);
    pts.push([z, y]);
  }
  return pts;
}

/** Reverse every triangle (for lofts whose rings run the other way round). */
function flipWinding(g: THREE.BufferGeometry) {
  const ix = g.index!.array as Uint32Array | Uint16Array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.index!.needsUpdate = true;
  return g;
}

function setPart(g: THREE.BufferGeometry, part: number, uOf: (x: number, y: number, z: number, i: number) => [number, number, number]) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const a = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const [u, yn, ang] = uOf(p.getX(i), p.getY(i), p.getZ(i), i);
    a.set([u, yn, ang, part], i * 4);
  }
  g.setAttribute('aW', new THREE.BufferAttribute(a, 4));
  return g;
}

interface WhaleGeo { geo: THREE.BufferGeometry; eye: THREE.Vector3; finRoot: THREE.Vector3; tris: number }
const geoCache = new Map<string, WhaleGeo>();

/** Build (once per detail level) the unit-length whale: body, fins, dorsal fin and fluke in one geometry. */
function whaleGeometry(detail: 'high' | 'low'): WhaleGeo {
  const hit = geoCache.get(detail); if (hit) return hit;
  const hi = detail === 'high';
  const NS = hi ? 150 : 60, NR = hi ? 64 : 28;
  const eye = eyeCentre();

  // ---- body: rings along the spine, denser towards the head
  const pos: number[] = [], aw: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3();
  pos.push(0, -0.002, 0.5); aw.push(0, 0, Math.PI / 2, 0);
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
      const eb = 0.0026 * Math.exp(-(ey * ey + ez * ez) / (0.0115 * 0.0115)) * (Math.abs(ex) < 0.02 ? 1 : 0);
      p.x += Math.sign(p.x) * eb;
      // the raised splash guard round the blowholes
      if (p.y > 0) p.y += 0.0034 * Math.exp(-(((u - 0.163) / 0.016) ** 2) - (p.x / 0.013) ** 2);
      // the lower jaw bulges a touch below the mouth line, the head is a little flatter on top
      p.x *= 1 + 0.03 * smoothstepJS(0.27, 0.15, u) * smoothstepJS(mouthY(u) + 0.002, mouthY(u) - 0.012, p.y);
      pos.push(p.x, p.y, p.z);
      aw.push(u, yn, Math.abs(phi - Math.PI), 0);
    }
  }
  // the end of the peduncle (hidden in the fluke)
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

  // ---- pectoral fins: long and slim, humpback-like, with knobbly leading edges
  const FL = 0.25, FN = hi ? 30 : 12, FR = hi ? 14 : 8;
  const finRings: THREE.Vector3[][] = [];
  for (let i = 0; i <= FN; i++) {
    const l = i / FN;
    const chord = 0.064 * Math.pow(1 - l, 0.55) * (1 + 0.3 * Math.sin(Math.PI * Math.min(1, l * 1.6))) + 0.002;
    const tub = l > 0.18 && l < 0.95 ? 0.0028 * Math.pow(Math.max(0, Math.sin(l * Math.PI * 8.5)), 2) * (1 - l) : 0;
    const thick = chord * 0.2 + 0.001;
    const zc = -0.03 * Math.pow(l, 1.7) - (l < 0.15 ? 0 : 0.004 * l);
    const yc = -0.006 * Math.sin(Math.PI * l);
    finRings.push(airfoil(FR, chord, thick, tub).map(([z, y]) => new THREE.Vector3(l * FL, yc + y, zc + z)));
  }
  const finRootU = 0.285;
  const fr = ringPoint(finRootU, Math.PI * 0.6);
  const finRoot = new THREE.Vector3(fr.x * 0.86, fr.y * 0.9, fr.z);
  const finM = new THREE.Matrix4().makeTranslation(finRoot.x, finRoot.y, finRoot.z)
    .multiply(new THREE.Matrix4().makeRotationY(0.6))
    .multiply(new THREE.Matrix4().makeRotationZ(-0.85))
    .multiply(new THREE.Matrix4().makeRotationX(-0.35));
  const finL = loft(finRings); finL.applyMatrix4(finM); finL.computeVertexNormals();
  setPart(finL, 1, () => [finRootU, 0, 0]);
  const finR = finL.clone();
  {
    const pp = finR.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) pp.setX(i, -pp.getX(i));
    flipWinding(finR);
    finR.computeVertexNormals();
  }

  // ---- dorsal fin: small and swept back, two thirds of the way along
  const DN = hi ? 8 : 4, DR = hi ? 12 : 8;
  const du = 0.715, dTop = profile(du).h;
  const dRings: THREE.Vector3[][] = [];
  for (let i = 0; i <= DN; i++) {
    const h = i / DN;
    const chord = 0.05 * Math.pow(1 - h, 0.85) + 0.002;
    const zc = 0.5 - du - 0.035 * Math.pow(h, 1.4);
    const y = dTop - 0.007 + h * 0.024;
    dRings.push(airfoil(DR, chord, chord * 0.22).map(([z, x]) => new THREE.Vector3(x, y, zc + z)));
  }
  const dorsal = flipWinding(loft(dRings)); dorsal.computeVertexNormals();
  setPart(dorsal, 2, (_x, _y, z) => [0.5 - z, 1, 0]);

  // ---- fluke: broad, swept-back tips, a notch in the middle of the trailing edge
  const KN = hi ? 44 : 18, KR = hi ? 14 : 8, span = 0.14, zRoot = 0.5 - UB + 0.03;
  const kRings: THREE.Vector3[][] = [];
  for (let i = 0; i <= KN; i++) {
    const a = -1 + (2 * i) / KN, aa = Math.abs(a);
    const lead = zRoot - 0.1 * Math.pow(aa, 1.5);
    let chord = 0.072 * Math.pow(Math.max(0, 1 - Math.pow(aa, 2.4)), 0.55) + 0.003;
    const notch = 0.02 * Math.exp(-((a / 0.07) ** 2));
    chord -= notch;
    const zc = lead - chord / 2;
    const thick = chord * 0.16 * (1 - 0.4 * aa) + 0.0015 * (1 - aa) + 0.012 * Math.exp(-((a / 0.12) ** 2));
    const y = 0.012 * a * a;
    kRings.push(airfoil(KR, chord, thick).map(([z, yy]) => new THREE.Vector3(a * span, y + yy, zc + z)));
  }
  const fluke = loft(kRings); fluke.computeVertexNormals();
  setPart(fluke, 3, (_x, _y, z) => [0.5 - z, 0, 0]);

  const geo = mergeGeometries([body, finL, finR, dorsal, fluke], false)!;
  for (const g of [body, finL, finR, dorsal, fluke]) g.dispose();
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
      // pectoral fin: a slow flap about the body axis (more at the tip) and a sweep fore and aft
      float side = p.x >= 0.0 ? 1.0 : -1.0;
      vec3 root = vec3(uFinRoot.x * side, uFinRoot.yz);
      vec3 o = p - root;
      float reach = clamp(length(o) / 0.25, 0.0, 1.0);
      float a = side * uWave.w * sin(uWave.z) * (0.7 + 0.6 * reach);
      float b = side * uWave.w * 0.55 * sin(uWave.z - 1.3);
      o.xy = wRot(o.xy, a); n.xy = wRot(n.xy, a);
      o.zx = wRot(o.zx, b); n.zx = wRot(n.zx, b);
      p = root + o;
    }
    if (part > 2.5) {
      // the fluke tips trail behind each stroke
      float k = p.x / 0.14;
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

const SKIN_GLSL = /* glsl */ `
  varying vec4 vW; varying vec3 vR; varying vec3 vRN;
  uniform vec3 uBack, uFlank, uBelly, uSpot, uPleat, uLine, uEye, uBounce, uSunCol;
  uniform float uSeed, uLen;
  float whaleH = 0.0;
  float whalePale = 0.0;
  ${MOUTH_GLSL}
  // gradient noise (smoother and less blocky than value noise), about -0.7..0.7
  vec3 wG(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return -1.0 + 2.0 * fract(sin(p) * 43758.5453); }
  float wN(vec3 p){
    vec3 i = floor(p), f = fract(p), w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(mix(dot(wG(i), f), dot(wG(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), w.x),
                   mix(dot(wG(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(wG(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), w.x), w.y),
               mix(mix(dot(wG(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(wG(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), w.x),
                   mix(dot(wG(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(wG(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), w.x), w.y), w.z);
  }
  float wHash(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
  /** A soft-edged mask: 1 inside d < r, antialiased over the pixel footprint. */
  float wIn(float d, float r, float aa){ return 1.0 - smoothstep(r - aa * 0.5, r + aa, d); }
  vec3 whaleAlbedo(){
    float u = vW.x, yn = vW.y, ang = vW.z, part = vW.w;
    vec3 p = vR;
    vec3 q = p * 10.0 + vec3(uSeed * 17.0, uSeed * 3.0, uSeed * 5.0);
    float n1 = 0.5 + 0.8 * (wN(q * 0.8) * 0.65 + wN(q * 2.1 + 5.0) * 0.35);
    float n2 = 0.5 + 0.9 * (wN(q * 6.0 + 3.1) * 0.62 + wN(q * 14.0 + 1.7) * 0.38);
    float n3 = 0.5 + 0.9 * wN(q * 32.0 + 7.7);
    float pale = 0.0;
    vec3 dark = mix(uFlank, uBack, smoothstep(-0.15, 0.8, yn));
    if (part < 0.5) {
      // countershading: the cream belly rises towards the head, with a soft, irregular edge
      float bnd = mix(0.02, -0.2, smoothstep(0.25, 0.6, u)) - 0.3 * smoothstep(0.6, 0.9, u);
      bnd += (n1 - 0.5) * 0.32;
      pale = smoothstep(bnd + 0.07, bnd - 0.12, yn);
      // the whole lower jaw is pale up to the mouth line
      float ym = whaleMouthY(u);
      pale = max(pale, smoothstep(0.235, 0.19, u) * smoothstep(ym + 0.001, ym - 0.005, p.y));
    } else if (part < 1.5) {
      pale = smoothstep(0.2, -0.35, vRN.y) * 0.85;
      dark = mix(uFlank, uBack, 0.45);
    } else if (part < 2.5) {
      dark = uBack;
    } else {
      pale = smoothstep(0.05, -0.55, vRN.y) * 0.55;
      dark = mix(uBack, uFlank, 0.15);
    }
    dark *= 0.93 + n1 * 0.14;
    // painted mottling: soft pale dapples, fine pale speckle and a few gentle darker blots
    dark = mix(dark, uSpot, smoothstep(0.6, 0.8, n2) * 0.34);
    dark = mix(dark, uBack * 0.84, smoothstep(0.62, 0.82, 1.0 - n2) * 0.25);
    dark = mix(dark, uSpot * 1.08, smoothstep(0.74, 0.8, n3) * 0.45 * (1.0 - smoothstep(0.3, 0.8, fwidth(n3) * 6.0)));
    vec3 belly = uBelly * (0.95 + n3 * 0.07);
    belly = mix(belly, uSpot * 1.05, smoothstep(0.64, 0.72, n2) * 0.22);
    vec3 col = mix(dark, belly, pale);

    if (part < 0.5) {
      // ventral pleats: long grooves from the chin to mid-body, each ending at its own place
      float g = ang * 13.0;
      float li = floor(g + 0.5);
      float aa = fwidth(g);
      float endU = 0.43 + 0.1 * wHash(vec3(li, 1.7, 2.3));
      float pm = smoothstep(0.012, 0.05, u) * smoothstep(endU, endU - 0.05, u) * smoothstep(1.28, 1.05, ang);
      pm *= 1.0 - smoothstep(0.3, 0.6, aa);
      float line = wIn(abs(g - li), 0.09, aa);
      col = mix(col, uPleat, line * pm * 0.75);
      whaleH += pm * 0.5 * (1.0 - cos(6.2832 * g)) * 0.0008;

      // the mouth: a soft dark line with a crease
      float ym = whaleMouthY(u);
      float mm = smoothstep(0.004, 0.02, u) * smoothstep(0.2, 0.185, u);
      float md = abs(p.y - ym);
      col = mix(col, uLine, wIn(md, 0.0007, fwidth(p.y)) * mm * 0.8);
      whaleH -= 0.0012 * exp(-pow(md / 0.0022, 2.0)) * mm;

      // the eye: small and dark, a catchlight, a soft lid line above, a darker socket round it
      vec3 e = vec3(abs(p.x), p.y, p.z) - uEye;
      if (abs(e.x) < 0.02) {
        vec2 d = vec2(e.z, e.y);
        float ea = fwidth(d.x) + fwidth(d.y);
        col *= 1.0 - 0.18 * exp(-dot(d, d) / 0.00018);
        float eo = length(d / vec2(0.0072, 0.0056));
        col = mix(col, uLine * 0.75, wIn(eo, 1.0, ea / 0.0062));
        col = mix(col, vec3(0.95, 0.95, 1.0), wIn(length(d - vec2(0.0024, 0.0019)), 0.0016, ea));
        float lr = length(d - vec2(0.0005, -0.004));
        float lid = wIn(abs(lr - 0.0108), 0.0006, ea) * smoothstep(-0.001, 0.003, d.y) * smoothstep(0.012, 0.006, abs(d.x + 0.001));
        col = mix(col, uLine, lid * 0.7);
        whaleH += 0.0006 * exp(-pow((lr - 0.0108) / 0.0012, 2.0)) * smoothstep(-0.001, 0.003, d.y);
      }

      // twin blowholes in the splash guard
      if (p.y > 0.0) {
        vec2 b = vec2((abs(p.x) - 0.004) / 0.0011, (p.z - 0.337) / 0.0065);
        float bh = length(b);
        col = mix(col, uLine * 0.9, wIn(bh, 1.0, fwidth(bh) * 1.5) * 0.85);
      }

      // pale freckles (barnacle-ish) over the head and fore-back
      vec3 c = p * 240.0;
      vec3 id = floor(c);
      vec3 f = fract(c) - 0.5 - (vec3(wHash(id + 1.3), wHash(id + 4.1), wHash(id + 7.9)) - 0.5) * 0.5;
      float fk = smoothstep(0.34, 0.1, u) * smoothstep(-0.3, 0.1, yn) * step(0.8, wHash(id));
      float fr = wIn(length(f), 0.12 + 0.1 * wHash(id + 2.2), fwidth(c.x) * 1.2) * fk * (1.0 - smoothstep(0.3, 0.7, fwidth(c.x)));
      col = mix(col, uBelly * 0.98, fr * 0.8);
    }
    whalePale = pale;
    return col;
  }
`;

/** A gentler three-tone ramp than the props': wide soft steps, so the whale reads as one painted mass. */
let wRamp: THREE.DataTexture | null = null;
function whaleRamp() {
  if (wRamp) return wRamp;
  const N = 64, data = new Uint8Array(N * 4);
  const s = (x: number, a: number, b: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    const v = 0.1 + s(x, 0.36, 0.5) * 0.46 + s(x, 0.58, 0.72) * 0.44;
    const b = Math.round(v * 255);
    data.set([b, b, b, 255], i * 4);
  }
  wRamp = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  wRamp.minFilter = wRamp.magFilter = THREE.LinearFilter;
  wRamp.needsUpdate = true;
  return wRamp;
}

type U = Record<string, THREE.IUniform>;

function whaleMaterials(u: U) {
  const mat = paint(new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: whaleRamp() }), { variation: 0, rim: 1.2 });
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
      .replace(/void main\(\)\s*\{/, SKIN_GLSL + '\nvoid main() {')
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
          vec3 wN = normalize(vPNormal); vec3 wV = normalize(cameraPosition - vPWorld);
          // warm light bounced up from the sunlit clouds, strongest on the pale belly
          float under = smoothstep(0.1, -0.8, wN.y);
          outgoingLight += diffuseColor.rgb * uBounce * (uSunCol * 0.4 + 0.6) * under * (0.22 + 0.38 * whalePale);
          // a soft sheen along the wet back
          vec3 hv = normalize(uSun + wV);
          float spk = pow(max(dot(wN, hv), 0.0), 26.0);
          outgoingLight += uSunCol * smoothstep(0.25, 0.6, spk) * 0.13 * (1.0 - whalePale);
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'skywhale1';

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + BEND_GLSL)
      .replace('#include <begin_vertex>', 'vec3 transformed = position; vec3 wbN = normal; whaleBend(transformed, wbN);');
  };
  depth.customProgramCacheKey = () => 'skywhale1depth';
  return { mat, depth };
}

// ------------------------------------------------------------------------------------------------ gulls

type V3 = [number, number, number];
/** Merge coloured primitives into one geometry with vertex colours (and an optional per-vertex wing weight). */
function kit(parts: { g: THREE.BufferGeometry; c: string; p?: V3; r?: V3; s?: V3; wing?: (x: number) => number }[]) {
  const out: THREE.BufferGeometry[] = [];
  for (const it of parts) {
    let g = it.g.index ? it.g.toNonIndexed() : it.g;
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

const GULL_WHITE = '#f7f4ee', GULL_GREY = '#b9c1cf', GULL_TIP = '#3a3d4a', GULL_BEAK = '#f0b43c';

/** A gull sitting with its wings folded (about 0.65 m long; faces +Z). */
function sittingGull() {
  return kit([
    { g: new THREE.SphereGeometry(1, 10, 8), c: GULL_WHITE, p: [0, 0.13, 0], s: [0.11, 0.1, 0.24] },
    { g: new THREE.SphereGeometry(1, 9, 7), c: GULL_WHITE, p: [0, 0.27, 0.17], s: [0.075, 0.075, 0.085] },
    { g: new THREE.ConeGeometry(0.022, 0.09, 6), c: GULL_BEAK, p: [0, 0.26, 0.28], r: [Math.PI / 2, 0, 0] },
    { g: new THREE.SphereGeometry(1, 8, 6), c: GULL_GREY, p: [0.07, 0.17, -0.06], s: [0.05, 0.065, 0.22], r: [0.12, 0.06, 0] },
    { g: new THREE.SphereGeometry(1, 8, 6), c: GULL_GREY, p: [-0.07, 0.17, -0.06], s: [0.05, 0.065, 0.22], r: [0.12, -0.06, 0] },
    { g: new THREE.ConeGeometry(0.06, 0.2, 6), c: GULL_TIP, p: [0, 0.18, -0.27], r: [-Math.PI / 2 + 0.2, 0, 0], s: [1.3, 1, 0.5] },
    { g: new THREE.SphereGeometry(0.012, 5, 4), c: '#20222c', p: [0.05, 0.29, 0.21] },
    { g: new THREE.SphereGeometry(0.012, 5, 4), c: '#20222c', p: [-0.05, 0.29, 0.21] },
    { g: new THREE.CylinderGeometry(0.012, 0.012, 0.08, 4), c: '#e89a5a', p: [0.04, 0.03, 0.02] },
    { g: new THREE.CylinderGeometry(0.012, 0.012, 0.08, 4), c: '#e89a5a', p: [-0.04, 0.03, 0.02] },
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
      p.setX(i, side * (x + 0.06));
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
    { g: new THREE.SphereGeometry(1, 10, 8), c: GULL_WHITE, s: [0.1, 0.09, 0.26] },
    { g: new THREE.SphereGeometry(1, 9, 7), c: GULL_WHITE, p: [0, 0.06, 0.24], s: [0.07, 0.07, 0.08] },
    { g: new THREE.ConeGeometry(0.02, 0.09, 6), c: GULL_BEAK, p: [0, 0.05, 0.35], r: [Math.PI / 2, 0, 0] },
    { g: new THREE.ConeGeometry(0.07, 0.18, 6), c: GULL_WHITE, p: [0, 0.01, -0.3], r: [-Math.PI / 2, 0, 0], s: [1.3, 1, 0.35] },
    { g: wing(1), c: GULL_GREY, wing: w },
    { g: wing(-1), c: GULL_GREY, wing: w },
    { g: tip(1), c: GULL_TIP, wing: w },
    { g: tip(-1), c: GULL_TIP, wing: w },
  ]);
}

let gullGeos: { sit: THREE.BufferGeometry; fly: THREE.BufferGeometry } | null = null;
let gullMats: { sit: THREE.MeshToonMaterial; fly: THREE.MeshToonMaterial } | null = null;
const gullTime = { value: 0 };

function gulls() {
  if (!gullGeos) gullGeos = { sit: sittingGull(), fly: flyingGull() };
  if (!gullMats) {
    const sit = paint(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: whaleRamp() }), { variation: 0.15, rim: 1.4 });
    const fly = paint(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: whaleRamp(), side: THREE.DoubleSide }), { variation: 0.15, rim: 1.4 });
    const painted = fly.onBeforeCompile;
    fly.onBeforeCompile = (sh, r) => {
      painted.call(fly, sh, r);
      sh.uniforms.uGullT = gullTime;
      sh.vertexShader = sh.vertexShader
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
    fly.customProgramCacheKey = () => 'skygullfly';
    gullMats = { sit, fly };
  }
  return { geos: gullGeos, mats: gullMats };
}

// ------------------------------------------------------------------------------------------------ whale

function mulberry(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

interface Rider { u: number; x: number; yaw: number; s: number }
interface Flyer { slot: number; period: number; offset: number; side: number; rx: number; rz: number; hh: number }

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _m = new THREE.Matrix4(), _quat = new THREE.Quaternion(), _e = new THREE.Euler(), _sc = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class SkyWhale {
  /** Place, turn and move this. The whale faces +Z. */
  readonly root = new THREE.Group();
  /** Rolls and heaves with the swim; holds the mesh, the gulls and the ride anchor. */
  readonly body = new THREE.Group();
  readonly mesh: THREE.Mesh;
  /** A point on the back (just behind the blowholes) where Nilo can ride, in body space; +Y is up from the skin, +Z forward. */
  readonly rideAnchor = new THREE.Object3D();
  /** The cloud wake (world space). Add it to the scene yourself when cloudTop is set. Null otherwise. */
  readonly wake: CloudWake | null;
  /** Swim intensity, 0 (gliding, barely moving) .. 1 (full, heavy strokes). Eased internally. */
  swim = 0.6;
  /** World height of the cloud tops (for the wake). */
  cloudTop: number | null;
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
  private lastWorld = new THREE.Vector3();
  private hasLast = false;

  constructor(opts: SkyWhaleOpts = {}) {
    this.length = opts.length ?? 36;
    const seed = opts.seed ?? 1;
    this.rnd = mulberry(seed);
    this.birdScale = (opts.birdScale ?? 1) * 1.9;
    this.cloudTop = opts.cloudTop ?? null;
    const wg = whaleGeometry(opts.detail ?? 'high');
    this.triangles = wg.tris;
    const r = this.rnd;
    // a little individuality: some whales bluer, some greyer
    const hue = (r() - 0.5) * 0.03, lit = (r() - 0.5) * 0.1;
    const tone = (c: string) => { const col = new THREE.Color(c); col.offsetHSL(hue, 0, lit); return col; };
    this.u = {
      uWave: { value: new THREE.Vector4() },
      uShape: { value: new THREE.Vector4(1, 0.012, 0.016, 0) },
      uFinRoot: { value: wg.finRoot.clone() },
      uEye: { value: wg.eye.clone() },
      uBack: { value: tone('#6e88bd') },
      uFlank: { value: tone('#a2b5da') },
      uBelly: { value: new THREE.Color('#eceef4') },
      uSpot: { value: tone('#c8d4ea') },
      uPleat: { value: new THREE.Color('#a9acc4') },
      uLine: { value: new THREE.Color('#262a40') },
      uBounce: { value: new THREE.Color('#ffeedb') },
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
    const n = opts.birds ?? 7;
    if (n > 0) {
      const { geos, mats } = gulls();
      for (let i = 0; i < n; i++) {
        const u = 0.3 + (i / Math.max(1, n - 1)) * 0.3 + (r() - 0.5) * 0.04;
        this.riders.push({ u, x: (r() - 0.5) * 0.022, yaw: (r() - 0.5) * 1.6 + (r() < 0.2 ? Math.PI : 0), s: 0.9 + r() * 0.2 });
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
    this.wake = this.cloudTop !== null ? new CloudWake(80) : null;
    this.update(0, 0);
  }

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
    this.amp.fin = 0.14 + 0.14 * sw;
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
    this.riders.forEach((rd, i) => {
      const k = flying.get(i);
      const b = this.backPoint(rd.u, rd.x, _p);
      if (k === undefined) {
        // a sitting gull: settles on the skin, tilts with it, shuffles now and then
        _e.set(-b.pitch, rd.yaw + 0.15 * Math.sin(t * 0.3 + i * 2.1) * (Math.sin(t * 0.11 + i) > 0.6 ? 1 : 0), 0, 'YXZ');
        _m.compose(_p.addScaledVector(THREE.Object3D.DEFAULT_UP, -0.02 * bs), _quat.setFromEuler(_e), _sc.setScalar(bs * rd.s));
        this.sitMesh!.setMatrixAt(i, _m);
        return;
      }
      const f = this.flyers[k];
      const cyc = ((t / f.period + f.offset) % 1 + 1) % 1;
      const sitEnd = 0.22, flyEnd = 1.0;
      if (cyc < sitEnd) {
        // waiting on the back, about to go
        _e.set(-b.pitch, rd.yaw, 0, 'YXZ');
        _m.compose(_p, _quat.setFromEuler(_e), _sc.setScalar(bs * rd.s));
        this.sitMesh!.setMatrixAt(i, _m);
        this.flyMesh!.setMatrixAt(k, ZERO);
        return;
      }
      this.sitMesh!.setMatrixAt(i, ZERO);
      // in the air: a loop up, back and round, returning to the same spot on the back
      const tau = (cyc - sitEnd) / (flyEnd - sitEnd);
      const off = (tt: number, out: THREE.Vector3) => {
        const e = 0.5 - 0.5 * Math.cos(Math.PI * tt); // eased progress
        return out.set(f.side * f.rx * Math.sin(2 * Math.PI * e), f.hh * Math.pow(Math.sin(Math.PI * e), 0.7), -f.rz * Math.sin(Math.PI * e) * (1 + 0.3 * Math.sin(2 * Math.PI * e)));
      };
      const pos = off(tau, _q).add(_p);
      const ahead = off(Math.min(1, tau + 0.01), new THREE.Vector3()).add(_p).sub(pos);
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
    this.sitMesh.instanceMatrix.needsUpdate = true;
    if (this.flyMesh) { this.flyMesh.instanceMatrix.needsUpdate = true; this.flapAttr!.needsUpdate = true; }
  }

  /** Where the body cuts the cloud tops, swell up puffs that trail behind. */
  private updateWake(dt: number) {
    const wake = this.wake!, top = this.cloudTop!;
    this.body.updateWorldMatrix(true, false);
    const world = this.root.getWorldPosition(_q);
    const vel = this.hasLast && dt > 0 ? world.clone().sub(this.lastWorld).divideScalar(dt) : new THREE.Vector3();
    this.lastWorld.copy(world); this.hasLast = true;
    wake.update(dt);
    this.wakeT -= dt;
    if (this.wakeT > 0) return;
    // find crossings of the cloud top along four lines down the body
    const hits: { p: THREE.Vector3; r: number; out: THREE.Vector3 }[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    // the flanks (and a little below them): where the body slides through the cloud surface
    for (const phi of [Math.PI * 0.5, Math.PI * 0.66, Math.PI * 0.82, Math.PI * 1.18, Math.PI * 1.34, Math.PI * 1.5]) {
      let prevY = 0;
      for (let i = 0; i <= 16; i++) {
        const u = 0.02 + (i / 16) * 0.86;
        ringPoint(u, phi, a);
        this.bendPoint(a, u, b);
        this.body.localToWorld(b);
        if (i > 0 && (b.y - top) * (prevY - top) <= 0) {
          // push the puff out from the body, so it hugs the flank instead of swallowing it
          c.set(Math.sign(a.x), 0, 0).transformDirection(this.body.matrixWorld);
          hits.push({ p: b.clone(), r: profile(u).w * this.length, out: c.clone() });
        }
        prevY = b.y;
      }
    }
    if (!hits.length) { this.wakeT = 0.1; return; }
    const h = hits[Math.floor(this.rnd() * hits.length)];
    const yaw = Math.atan2(vel.x, vel.z) || this.root.rotation.y;
    const size = Math.max(3, h.r * (0.8 + this.rnd() * 0.6));
    h.p.addScaledVector(h.out, size * 0.45);
    h.p.y = top - size * 0.18;
    // puffs are shoved outwards and a little up, then left behind as the whale swims on
    const v = h.out.clone().multiplyScalar(1.2 + this.rnd()).add(new THREE.Vector3(0, 0.4 + this.rnd() * 0.4, 0)).addScaledVector(vel, 0.1);
    wake.spawn(h.p, v, size, yaw, 4.5 + this.rnd() * 2.5);
    this.wakeT = 0.07 + this.rnd() * 0.05;
  }

  dispose() {
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.customDepthMaterial?.dispose();
    this.flyMesh?.geometry.dispose();
    this.wake?.mesh.removeFromParent();
  }
}
