// Festival kites over Sailtown (pictures 2 and 4): hand-sewn kites in three shapes (the classic diamond,
// a bowed diamond with round shoulders, a six-sided kite), each in one of four panel layouts, with the
// spars showing through the cloth, a thin hem in a darker shade of the kite's own colour (no black ink),
// flying on long sagging strings from a roof, a festival pole or a child's hand, bobbing and waggling in
// the wind. The tails are what makes them festive: a bow-tie tail (a cord with broad bows knotted along
// it), two or three broad banded streamers, and tassels at the side points of some kites.
//
// FestivalKite is one hero kite (its own string; 3 draw calls).
// KiteParade is a whole sky of them, instanced: every kite body, every tail bundle and every string
// together cost 3 draw calls however many kites there are. The kites move on the CPU (a matrix each,
// cheap for a few hundred) and their cloth and tails ripple in the vertex shader.
//
// The cloth stays out of the depth buffer (drawn as a sorted transparent so the finish pass does not ink
// a black outline round it); its own hem draws the edge instead.
import * as THREE from 'three';
import { shapedToon, ribbonMesh, ribbonUniforms, KiteStrings, type RibbonSpec } from './kiteCloth';

/** Festival colours (red, yellow, blue, orange, and friends) to draw kite palettes from. */
export const FESTIVAL = ['#d94a3a', '#f2c24a', '#4a7cc8', '#f08a44', '#ee8a78', '#8cc46a', '#e8809a', '#a48ad4', '#5ab4b4', '#f6ecd4'];

/** 0 diamond, 1 bowed diamond (round shoulders), 2 six-sided. */
export type KiteShape = 0 | 1 | 2;
/** 0 eight wedges, 1 quarters with a diamond inset, 2 bands with a stripe down the spine, 3 a border round a sun. */
export type KitePattern = 0 | 1 | 2 | 3;

// ---------------------------------------------------------------- the kite's cloth

const KITE_VERT = /* glsl */ `
  uniform float uW, uTop, uBot, uBow, uPhase, uFlut;
  varying vec2 vK; varying vec3 vA; varying vec3 vB; varying vec3 vCc; varying vec3 vDd; varying float vPat;
  #ifdef KITE_INST
    attribute vec3 iColA; attribute vec3 iColB; attribute vec3 iColC; attribute vec3 iColD; attribute float iSeed; attribute vec2 iShape;
  #else
    uniform vec3 uColA, uColB, uColC, uColD; uniform float uSeed; uniform vec2 uShape;
  #endif
  // half-width of the kite at height c.y (-1 bottom point .. 1 top)
  float halfW(float y, float shp) {
    float d = y > 0.0 ? 1.0 - y : 1.0 + y;
    if (shp < 0.5) return d;
    if (shp < 1.5) return y > 0.0 ? sqrt(max(0.0, 1.0 - y)) * (1.0 - 0.15 * y) : d;
    float ay = abs(y);
    return ay < 0.35 ? 1.0 : mix(1.0, 0.5, (ay - 0.35) / 0.65);
  }
  vec3 kite(vec2 c, float seed, float shp) {
    float hw = uW * 0.5 * halfW(c.y, shp);
    float top = shp > 1.5 ? uTop * 1.25 : uTop;
    vec3 p = vec3(c.x * hw, c.y > 0.0 ? c.y * top : c.y * uBot, 0.0);
    // bowed back by the wind between the spars
    p.z -= uBow * (1.0 - c.x * c.x) * (1.0 - c.y * c.y) * (0.85 + 0.15 * sin(uPhase * 0.4 + seed * 5.0));
    // the loose edges shiver
    float e = max(abs(c.x), abs(c.y));
    p.z += uFlut * e * e * sin(uPhase + seed * 6.3 + c.x * 7.0 + c.y * 5.0);
    return p;
  }
  void shape(out vec3 P, out vec3 N) {
    #ifdef KITE_INST
      float seed = iSeed; vA = iColA; vB = iColB; vCc = iColC; vDd = iColD; vec2 sh = iShape;
    #else
      float seed = uSeed; vA = uColA; vB = uColB; vCc = uColC; vDd = uColD; vec2 sh = uShape;
    #endif
    vec2 c = uv;
    P = kite(c, seed, sh.x);
    vec3 du = kite(c + vec2(0.02, 0.0), seed, sh.x) - P;
    vec3 dv = kite(c + vec2(0.0, 0.02), seed, sh.x) - P;
    vec3 n = cross(du, dv);
    N = dot(n, n) > 1e-14 ? normalize(n) : vec3(0.0, 0.0, 1.0);
    vK = c; vPat = sh.y;
  }
`;
const KITE_FRAG_PARS = /* glsl */ `
  varying vec2 vK; varying vec3 vA; varying vec3 vB; varying vec3 vCc; varying vec3 vDd; varying float vPat;
  float band(float d, float w) { float aa = max(fwidth(d), 1e-4); return 1.0 - smoothstep(w - aa, w + aa, d); }
`;
const KITE_FRAG = /* glsl */ `
  {
    vec2 c = vK; float ax = abs(c.x), ay = abs(c.y);
    vec3 col = vA; float seam = 0.0;
    if (vPat < 0.5) {
      // eight wedges: each quarter split from the middle out, four colours round
      float q = (c.x < 0.0 ? 1.0 : 0.0) + (c.y < 0.0 ? 2.0 : 0.0);
      float hlf = ax > ay ? 1.0 : 0.0;
      float k = mod(q * 2.0 + hlf + (q > 1.5 ? 1.0 : 0.0), 4.0);
      col = k < 0.5 ? vA : k < 1.5 ? vB : k < 2.5 ? vCc : vDd;
      seam = band(abs(ax - ay), 0.012);
    } else if (vPat < 1.5) {
      // quarters, with a diamond inset where the spars cross
      col = c.y > 0.0 ? (c.x > 0.0 ? vA : vB) : (c.x > 0.0 ? vB : vA);
      float dm = ax + ay;
      if (dm < 0.42) col = vCc;
      if (dm < 0.2) col = vDd;
      seam = max(band(abs(dm - 0.42), 0.012), band(abs(dm - 0.2), 0.01));
    } else if (vPat < 2.5) {
      // bands across, and a stripe down the spine
      col = c.y > 0.18 ? vA : c.y > -0.12 ? vB : vCc;
      if (ax < 0.16) col = vDd;
      seam = max(band(abs(c.y - 0.18), 0.01), max(band(abs(c.y + 0.12), 0.01), band(abs(ax - 0.16), 0.01)));
    } else {
      // a broad border round a sun
      float edge0 = min(1.0 - ax, 1.0 - ay);
      col = edge0 < 0.3 ? vB : vA;
      float r = length(vec2(c.x, c.y * 1.2));
      if (r < 0.3) col = vCc;
      if (r < 0.3 && fract(atan(c.y, c.x) * 1.91) < 0.5 && r > 0.18) col = vDd;
      seam = max(band(abs(edge0 - 0.3), 0.01), band(abs(r - 0.3), 0.01));
    }
    // seams along the spars too
    seam = max(seam, max(band(ax, 0.008), band(ay, 0.008)));
    vec3 base = col;
    col *= 1.0 - seam * 0.28;
    // the spars behind the cloth: a honey line with a soft shadow beside it
    float spar = max(band(ax, 0.022), band(ay, 0.02));
    float sparSh = max(band(ax, 0.05), band(ay, 0.045)) - spar;
    col = mix(col, col * 0.78, sparSh * 0.6);
    col = mix(col, vec3(0.78, 0.56, 0.3), spar * 0.8);
    // a thin hem in a darker shade of the kite's own colour (instead of a black outline)
    float edge = min(1.0 - ax, 1.0 - ay);
    col = mix(col, base * 0.5, band(edge, 0.035));
    col = mix(col, base * 0.82, band(abs(edge - 0.07), 0.008));
    diffuseColor.rgb = col;
  }
`;

function kiteUniforms(w: number, h: number) {
  return { uW: { value: w }, uTop: { value: h * 0.36 }, uBot: { value: h * 0.64 }, uBow: { value: w * 0.08 }, uPhase: { value: 0 }, uFlut: { value: w * 0.02 } };
}

/** The kite's cloth grid: uv.x from -1 to 1 across, uv.y from -1 (bottom point) to 1 (top point). */
function kiteGrid(nx = 8, ny = 12) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { pos.push(0, 0, 0); uv.push(i / nx * 2 - 1, j / ny * 2 - 1); }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
  return g;
}

/** A kite cloth material: toon, painted, kept out of the depth buffer (its own hem is its outline). */
function kiteMaterial(key: string, U: Record<string, THREE.IUniform>, inst: boolean) {
  const { mat, depth } = shapedToon({ key, uniforms: U, vertex: KITE_VERT, fragPars: KITE_FRAG_PARS, fragColor: KITE_FRAG, translucency: 0.55, variation: 0.25 });
  if (inst) { mat.defines = { ...mat.defines, KITE_INST: '' }; depth.defines = { KITE_INST: '' }; }
  mat.transparent = true; mat.depthWrite = false;
  return { mat, depth };
}

/**
 * Tail ribbons in kite space (they trail along -Z of their mesh, which is turned to hang down the kite):
 * a bow-tie tail from the bottom point, two or three broad banded streamers, tassels at the side points.
 */
function tailSpecs(w: number, h: number, shape: number, colors: string[], seed: number, inst: boolean, streamers = 2, tassels = false): RibbonSpec[] {
  const bot = -h * 0.64;
  const col = (i: number) => colors[i % colors.length];
  const at = (x: number, y: number): [number, number, number] => [x, 0, y];
  const th = inst ? 1.2 : 1;
  const specs: RibbonSpec[] = [
    // the bow-tie tail: a cord with broad bows knotted along it
    { root: at(0, bot), length: h * 2.8, width: 0.035 * th * w, color: '#f6ecd4', color2: col(0), bows: 6, seed, amp: 0.85, taper: 0.1, slot: 0 },
    { root: at(0.05 * w, bot), length: h * 2.1, width: 0.16 * th * w, color: col(1), color2: col(2), stripes: 4, seed: seed + 0.37, amp: 1.1, taper: 0.35, notch: 1.1, slot: 1 },
    { root: at(-0.05 * w, bot), length: h * 1.7, width: 0.14 * th * w, color: col(2), color2: col(3), stripes: 3, seed: seed + 0.71, amp: 1.25, taper: 0.35, notch: 1.1, slot: 2 },
  ];
  if (streamers > 2) specs.push({ root: at(0, bot + 0.02), length: h * 1.35, width: 0.09 * th * w, color: col(3), color2: col(0), stripes: 2, seed: seed + 1.13, amp: 1.3, taper: 0.4, notch: 1, slot: 0 });
  if (tassels) {
    // the side points: on a six-sided kite the corners of the waist, on a diamond the cross spar's ends
    const sideY = shape === 2 ? h * 0.36 * 1.25 * 0.35 : 0, sideX = w * 0.5 * 0.97;
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) specs.push({ root: at(s * sideX, sideY - i * 0.02), length: h * (0.42 + i * 0.12), width: 0.045 * th * w, color: col(i + (s > 0 ? 1 : 2)), seed: seed + 2 + i * 0.3 + s, amp: 1.4, taper: 0.5, slot: (i + (s > 0 ? 1 : 2)) % 3 });
  }
  return specs;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const TAIL_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/** Where a kite flies at time t, and how it is turned: shared by the hero kite and the parade. */
function kitePose(anchor: THREE.Vector3, height: number, wind: THREE.Vector3, seed: number, t: number, pos: THREE.Vector3, quat: THREE.Quaternion) {
  const side = _a.set(-wind.z, 0, wind.x).normalize();
  const dist = height * (0.5 + 0.25 * Math.abs(Math.sin(seed * 2.3)));
  const sw = Math.sin(t * 0.31 + seed * 4) * 0.7 + Math.sin(t * 0.83 + seed * 9) * 0.3;
  pos.copy(anchor).addScaledVector(wind, dist + Math.sin(t * 0.4 + seed) * height * 0.03)
    .addScaledVector(side, sw * height * 0.1 + Math.sin(seed * 5.1) * height * 0.15)
    .add(_b.set(0, height + Math.sin(t * 0.57 + seed * 3) * height * 0.04 + Math.sin(t * 1.9 + seed) * 0.12, 0));
  // face upwind towards the flyer, tipped back (a real kite's angle to the wind), so the tails hang down
  // and blow back downwind; waggle round the face and nod, each kite leaning its own way
  _d.copy(pos).addScaledVector(wind, -1).add(_c.set(0, -0.45, 0));
  _m.lookAt(pos, _d, _c.set(0, 1, 0));
  quat.setFromRotationMatrix(_m);
  quat.multiply(_q2.setFromAxisAngle(_c.set(0, 1, 0), Math.PI));
  const lean = (((seed * 3.7) % 1) - 0.5) * 0.6;
  const roll = lean + Math.sin(t * 1.15 + seed * 7) * 0.14 + Math.sin(t * 2.7 + seed * 3) * 0.04 - sw * 0.15;
  const nod = Math.sin(t * 1.6 + seed * 5) * 0.06 - 0.1;
  quat.multiply(_q2.setFromEuler(_e.set(nod, 0, roll)));
}

/** The bridle point a string ties to: just in front of the kite's face, where the spars cross. */
function bridle(pos: THREE.Vector3, quat: THREE.Quaternion, w: number, out: THREE.Vector3) {
  return out.set(0, -0.05 * w, 0.22 * w).applyQuaternion(quat).add(pos);
}

export interface FestivalKiteOpts {
  /** Two to four colours for the panels and the tails. */
  colors: string[];
  /** Where the string is held or tied (a roof, a pole, a hand). Update `anchor` to follow a hand. */
  anchor: THREE.Vector3;
  /** How high above the anchor it flies, metres. */
  height: number;
  seed: number;
  /** Kite width in metres (default 1.3; height is 1.4 x width). */
  size?: number;
  shape?: KiteShape;
  pattern?: KitePattern;
  /** Broad streamers in the tail (2 or 3), and tassels at the side points. */
  streamers?: number;
  tassels?: boolean;
  /** Horizontal wind direction (default the game's wind). */
  wind?: THREE.Vector3;
}

/** One festival kite on its string. root holds the kite (moved every update) and the string. */
export class FestivalKite {
  root = new THREE.Group();
  /** The kite itself (cloth, tails), posed every update. */
  kite = new THREE.Group();
  anchor: THREE.Vector3;
  height: number;
  wind: THREE.Vector3;
  private U: Record<string, THREE.IUniform>;
  private RU = ribbonUniforms();
  private string: KiteStrings;
  private seed: number;
  private w: number;
  private phase = 0;

  constructor(opts: FestivalKiteOpts) {
    const w = this.w = opts.size ?? 1.3, h = w * 1.4;
    this.anchor = opts.anchor.clone(); this.height = opts.height; this.seed = opts.seed;
    this.wind = (opts.wind ?? new THREE.Vector3(1, 0, 0.3)).clone().setY(0).normalize();
    const cols = [...opts.colors, '#f6ecd4', '#f2c24a', '#4a7cc8'].slice(0, 4);
    const shape = opts.shape ?? 0, pattern = opts.pattern ?? 0;
    this.U = {
      ...kiteUniforms(w, h), uColA: { value: new THREE.Color(cols[0]) }, uColB: { value: new THREE.Color(cols[1]) }, uColC: { value: new THREE.Color(cols[2]) },
      uColD: { value: new THREE.Color(cols[3]) }, uSeed: { value: opts.seed }, uShape: { value: new THREE.Vector2(shape, pattern) },
    };
    const { mat, depth } = kiteMaterial('festkite3', this.U, false);
    const cloth = new THREE.Mesh(kiteGrid(10, 16), mat);
    cloth.customDepthMaterial = depth; cloth.castShadow = true; cloth.userData.noOutline = true;
    const tails = ribbonMesh(tailSpecs(w, h, shape, cols, opts.seed, false, opts.streamers ?? 2, opts.tassels ?? shape === 2), this.RU, { seg: 48, key: 'fest' }).mesh;
    tails.quaternion.copy(TAIL_TURN);
    this.kite.add(cloth, tails);
    // the string: a gentle sag from the anchor up to the bridle
    this.string = new KiteStrings(1, 24, { alpha: [0.85], width: 0.008, minPx: 1.2, fade: [30, 120] });
    this.root.add(this.kite, this.string.mesh);
    this.update(0, 0);
  }

  update(dt: number, t: number) {
    kitePose(this.anchor, this.height, this.wind, this.seed, t, this.kite.position, this.kite.quaternion);
    this.phase += dt * 6.5;
    this.U.uPhase.value = this.phase;
    this.RU.uPhase.value = this.phase * 0.8;
    this.RU.uDroop.value.set(0, 0.3, 0); // blown back downwind as they hang
    this.RU.uAmp.value = 1.1;
    this.string.curve(0, this.anchor, bridle(this.kite.position, this.kite.quaternion, this.w, _a), 0.06);
    this.string.commit();
  }
}

// ---------------------------------------------------------------- a sky full of kites

export interface ParadeKite { anchor: THREE.Vector3; height: number; colors: string[]; seed: number; size?: number; shape?: KiteShape; pattern?: KitePattern }

export interface KiteParadeOpts {
  /** Give every kite yourself, or let the parade scatter `count` of them round `center`. */
  kites?: ParadeKite[];
  count?: number;
  center?: THREE.Vector3;
  radius?: number;
  height?: [number, number];
  /** Kite widths to scatter between (metres). */
  size?: [number, number];
  /** Where the scattered strings are tied (roof ridges, poles, hands); scattered round `center` if not given. */
  anchors?: THREE.Vector3[];
  seed?: number;
  wind?: THREE.Vector3;
  /** Draw the strings (default true). */
  strings?: boolean;
}

/** Dozens of festival kites with their tails and strings, in three draw calls. */
export class KiteParade {
  root = new THREE.Group();
  kites: ParadeKite[];
  wind: THREE.Vector3;
  private cloth: THREE.InstancedMesh;
  private tails: THREE.InstancedMesh;
  private strings: KiteStrings | null = null;
  private U: Record<string, THREE.IUniform>;
  private RU = ribbonUniforms();
  private phase = 0;
  private pos = new THREE.Vector3(); private quat = new THREE.Quaternion();
  private static W = 1.3;

  constructor(opts: KiteParadeOpts) {
    this.wind = (opts.wind ?? new THREE.Vector3(1, 0, 0.3)).clone().setY(0).normalize();
    let s = (opts.seed ?? 5) * 7919 + 13;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    if (opts.kites) this.kites = opts.kites;
    else {
      const n = opts.count ?? 30, c = opts.center ?? new THREE.Vector3(), R = opts.radius ?? 60, [h0, h1] = opts.height ?? [12, 34], [s0, s1] = opts.size ?? [1.2, 3.2];
      this.kites = [];
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R;
        const pick = () => FESTIVAL[Math.floor(rnd() * FESTIVAL.length)];
        const A = pick(); let B = pick(); while (B === A) B = pick();
        let C = pick(); while (C === A || C === B) C = pick();
        let D = pick(); while (D === A || D === B || D === C) D = pick();
        const anchor = opts.anchors?.length ? opts.anchors[i % opts.anchors.length].clone() : new THREE.Vector3(c.x + Math.cos(a) * r, c.y + rnd() * 6, c.z + Math.sin(a) * r);
        const sz = s0 + Math.pow(rnd(), 1.6) * (s1 - s0);
        this.kites.push({ anchor, height: h0 + rnd() * (h1 - h0), colors: [A, B, C, D], seed: rnd() * 10, size: sz, shape: Math.floor(rnd() * 3) as KiteShape, pattern: Math.floor(rnd() * 4) as KitePattern });
      }
    }
    const n = this.kites.length, w = KiteParade.W, h = w * 1.4;
    // shared shapes for a 1.3 m kite; each instance scales to its own size
    this.U = kiteUniforms(w, h);
    const { mat, depth } = kiteMaterial('paradekite3', this.U, true);
    const grid = kiteGrid(6, 10);
    const cA = new Float32Array(n * 3), cB = new Float32Array(n * 3), cC = new Float32Array(n * 3), cD = new Float32Array(n * 3), sd = new Float32Array(n), shp = new Float32Array(n * 2);
    const col = new THREE.Color();
    this.kites.forEach((k, i) => {
      col.set(k.colors[0]).toArray(cA, i * 3); col.set(k.colors[1] ?? k.colors[0]).toArray(cB, i * 3);
      col.set(k.colors[2] ?? '#f6ecd4').toArray(cC, i * 3); col.set(k.colors[3] ?? '#f6ecd4').toArray(cD, i * 3);
      sd[i] = k.seed; shp[i * 2] = k.shape ?? 0; shp[i * 2 + 1] = k.pattern ?? 0;
    });
    const inst = (g: THREE.BufferGeometry) => {
      g.setAttribute('iColA', new THREE.InstancedBufferAttribute(cA, 3));
      g.setAttribute('iColB', new THREE.InstancedBufferAttribute(cB, 3));
      g.setAttribute('iColC', new THREE.InstancedBufferAttribute(cC, 3));
      g.setAttribute('iColD', new THREE.InstancedBufferAttribute(cD, 3));
      g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(sd, 1));
      g.setAttribute('iShape', new THREE.InstancedBufferAttribute(shp, 2));
    };
    inst(grid);
    this.cloth = new THREE.InstancedMesh(grid, mat, n);
    this.cloth.customDepthMaterial = depth; this.cloth.castShadow = true; this.cloth.userData.noOutline = true;
    const tm = ribbonMesh(tailSpecs(w, h, 0, ['#ffffff'], 0, true, 3, false), this.RU, { seg: 24, count: n, key: 'parade' });
    this.tails = tm.mesh as THREE.InstancedMesh;
    inst(this.tails.geometry);
    for (const m of [this.cloth, this.tails]) m.frustumCulled = false;
    this.root.add(this.cloth, this.tails);
    if (opts.strings !== false) {
      // each string a little different: some catch the light, some are lost against the sky
      const alpha = this.kites.map((_, i) => 0.3 + 0.45 * ((i * 0.618) % 1));
      this.strings = new KiteStrings(n, 14, { alpha, width: 0.01, minPx: 0.9, fade: [25, 95] });
      this.root.add(this.strings.mesh);
    }
    this.update(0, 0);
  }

  update(dt: number, t: number) {
    this.phase += dt * 6.5;
    this.U.uPhase.value = this.phase;
    this.RU.uPhase.value = this.phase * 0.8;
    this.RU.uDroop.value.set(0, 0.3, 0);
    this.RU.uAmp.value = 1.1;
    const w = KiteParade.W;
    this.kites.forEach((kt, i) => {
      const sc = (kt.size ?? w) / w;
      kitePose(kt.anchor, kt.height, this.wind, kt.seed, t, this.pos, this.quat);
      _m.compose(this.pos, this.quat, _s.setScalar(sc));
      this.cloth.setMatrixAt(i, _m);
      _q.copy(this.quat).multiply(TAIL_TURN);
      _m.compose(this.pos, _q, _s.setScalar(sc));
      this.tails.setMatrixAt(i, _m);
      if (this.strings) this.strings.curve(i, kt.anchor, bridle(this.pos, this.quat, kt.size ?? w, _d), 0.05);
    });
    this.cloth.instanceMatrix.needsUpdate = true; this.tails.instanceMatrix.needsUpdate = true;
    this.strings?.commit();
  }
}
