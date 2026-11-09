// Festival kites over Sailtown: classic diamond kites on two cross spars (on the flyer's side, where you
// see them), sewn from eight bright patchwork panels with a bound hem, flying on long sagging strings from a
// roof, a pole or a child's hand, bobbing and waggling in the wind, with fluttering tails: a thin main tail
// with bow-tie knots, two fishtailed streamers, and a pennant off each end of the cross spar.
//
// FestivalKite is one hero kite (its own string, 4 draw calls + ink on the spars).
// KiteParade is a whole sky of them, instanced: every kite body, every frame, every tail bundle and every
// string together cost 4 draw calls, however many kites there are. The kites move on the CPU (a matrix
// each, cheap for a few hundred) and their cloth and tails ripple in the vertex shader.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from '../props';
import { addOutlines } from '../../render/paint';
import { shapedToon, ribbonMesh, ribbonUniforms, KiteStrings, type RibbonSpec } from './kiteCloth';

/** Festival colours (red, yellow, blue, orange, and friends) to draw kite palettes from. */
export const FESTIVAL = ['#d94a3a', '#f2c24a', '#4a7cc8', '#f08a44', '#ee8a78', '#8cc46a', '#e8809a', '#a48ad4', '#5ab4b4'];

// ---------------------------------------------------------------- the kite's cloth

const KITE_VERT = /* glsl */ `
  uniform float uW, uTop, uBot, uBow, uPhase, uFlut;
  varying vec2 vK; varying vec3 vA; varying vec3 vB; varying vec3 vCc;
  #ifdef KITE_INST
    attribute vec3 iColA; attribute vec3 iColB; attribute vec3 iColC; attribute float iSeed;
  #else
    uniform vec3 uColA, uColB, uColC; uniform float uSeed;
  #endif
  vec3 kite(vec2 c, float seed) {
    float hw = uW * 0.5 * (c.y > 0.0 ? 1.0 - c.y : 1.0 + c.y);
    vec3 p = vec3(c.x * hw, c.y > 0.0 ? c.y * uTop : c.y * uBot, 0.0);
    // bowed back by the wind between the spars
    p.z -= uBow * (1.0 - c.x * c.x) * (1.0 - c.y * c.y) * (0.85 + 0.15 * sin(uPhase * 0.4 + seed * 5.0));
    // the loose edges shiver
    float e = max(abs(c.x), abs(c.y));
    p.z += uFlut * e * e * sin(uPhase + seed * 6.3 + c.x * 7.0 + c.y * 5.0);
    return p;
  }
  void shape(out vec3 P, out vec3 N) {
    #ifdef KITE_INST
      float seed = iSeed; vA = iColA; vB = iColB; vCc = iColC;
    #else
      float seed = uSeed; vA = uColA; vB = uColB; vCc = uColC;
    #endif
    vec2 c = uv;
    P = kite(c, seed);
    vec3 du = kite(c + vec2(0.02, 0.0), seed) - P;
    vec3 dv = kite(c + vec2(0.0, 0.02), seed) - P;
    vec3 n = cross(du, dv);
    N = dot(n, n) > 1e-14 ? normalize(n) : vec3(0.0, 0.0, 1.0);
    vK = c;
  }
`;
const KITE_FRAG_PARS = /* glsl */ `
  varying vec2 vK; varying vec3 vA; varying vec3 vB; varying vec3 vCc;
  uniform float uW, uTop, uBot; uniform vec3 uColD;
`;
const KITE_FRAG = /* glsl */ `
  {
    vec2 c = vK;
    // eight patchwork triangles: each quarter split from the middle out to its edge, four colours round
    float q = (c.x < 0.0 ? 1.0 : 0.0) + (c.y < 0.0 ? 2.0 : 0.0);
    float hlf = abs(c.x) > abs(c.y) ? 1.0 : 0.0;
    float k = mod(q * 2.0 + hlf + (q > 1.5 ? 1.0 : 0.0), 4.0);
    vec3 col = k < 0.5 ? vA : k < 1.5 ? vB : k < 2.5 ? vCc : uColD;
    // crisp seams along the spars and the diagonals, and a broad bound hem
    float aaX = max(fwidth(c.x) * 0.8, 1e-4), aaY = max(fwidth(c.y) * 0.8, 1e-4), aaD = max(fwidth(abs(c.x) - abs(c.y)) * 0.8, 1e-4);
    float seam = max(1.0 - smoothstep(0.014 - aaX, 0.014 + aaX, abs(c.x)), 1.0 - smoothstep(0.014 - aaY, 0.014 + aaY, abs(c.y)));
    seam = max(seam, 1.0 - smoothstep(0.012 - aaD, 0.012 + aaD, abs(abs(c.x) - abs(c.y))));
    float edge = min(1.0 - abs(c.x), 1.0 - abs(c.y));
    float aaE = max(fwidth(edge), 1e-4);
    float hem = 1.0 - smoothstep(0.075 - aaE, 0.075 + aaE, edge);
    col = mix(col, vec3(0.97, 0.93, 0.84), hem);
    float hemLine = 1.0 - smoothstep(0.012 - aaE, 0.012 + aaE, abs(edge - 0.075));
    col *= 1.0 - max(seam, hemLine) * 0.35;
    diffuseColor.rgb = col;
  }
`;

function kiteUniforms(w: number, h: number) {
  return { uW: { value: w }, uTop: { value: h * 0.36 }, uBot: { value: h * 0.64 }, uBow: { value: w * 0.08 }, uPhase: { value: 0 }, uFlut: { value: w * 0.02 }, uColD: { value: new THREE.Color('#f6ecd4') } };
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

/** The two cross spars (on the flyer's side of the cloth, so they show), lashed where they cross. Kite is w wide, h tall. */
function sparGeometry(w: number, h: number) {
  const top = h * 0.36, bot = h * 0.64, r = 0.016 * Math.max(1, w);
  const v = new THREE.CylinderGeometry(r, r, (top + bot) * 0.97, 6); v.translate(0, (top - bot) / 2, 0.025);
  const x = new THREE.CylinderGeometry(r, r, w * 0.97, 6); x.rotateZ(Math.PI / 2); x.translate(0, 0, 0.045);
  const k = new THREE.SphereGeometry(r * 2.4, 8, 6); k.translate(0, 0, 0.04);
  const parts = [v, x, k].map(g => { g.deleteAttribute('uv'); return g; });
  return mergeGeometries(parts)!;
}

/** Tail ribbons hanging from the bottom point and the cross spar's ends, in kite space (they trail along -Z of their mesh). */
function tailSpecs(w: number, h: number, colors: string[], seed: number, inst: boolean): RibbonSpec[] {
  const bot = -h * 0.64, top = h * 0.36;
  const col = (i: number) => colors[i % colors.length];
  // the mesh is turned so its -Z hangs down the kite: roots are given in that turned frame (x, -z, y)
  const at = (x: number, y: number): [number, number, number] => [x, 0, y];
  const th = inst ? 1.6 : 1; // far kites get a little more width so their tails still read
  const specs: RibbonSpec[] = [
    { root: at(0, bot), length: h * 2.7, width: 0.03 * th, color: '#f6ecd4', color2: col(0), bows: 6, seed: seed, amp: 0.9, taper: 0.1, slot: 0 },
    { root: at(0.04, bot), length: h * 1.9, width: 0.06 * th, color: col(1), seed: seed + 0.37, amp: 1.2, taper: 0.5, notch: 1.3, slot: 1 },
    { root: at(-0.04, bot), length: h * 1.55, width: 0.055 * th, color: col(2), seed: seed + 0.71, amp: 1.3, taper: 0.5, notch: 1.3, slot: 2 },
    { root: at(w * 0.48, top - h * 0.36), length: h * 0.95, width: 0.035 * th, color: col(1), seed: seed + 1.3, amp: 1.3, taper: 0.4, notch: 1, slot: 1 },
    { root: at(-w * 0.48, top - h * 0.36), length: h * 0.95, width: 0.035 * th, color: col(2), seed: seed + 1.9, amp: 1.3, taper: 0.4, notch: 1, slot: 2 },
  ];
  return specs;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const TAIL_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/** Where a kite flies at time t, and how it is turned: shared by the hero kite and the parade. */
function kitePose(anchor: THREE.Vector3, height: number, wind: THREE.Vector3, seed: number, t: number, pos: THREE.Vector3, quat: THREE.Quaternion) {
  const side = _a.set(-wind.z, 0, wind.x).normalize();
  const dist = height * 0.62;
  const sw = Math.sin(t * 0.31 + seed * 4) * 0.7 + Math.sin(t * 0.83 + seed * 9) * 0.3;
  pos.copy(anchor).addScaledVector(wind, dist + Math.sin(t * 0.4 + seed) * height * 0.03)
    .addScaledVector(side, sw * height * 0.1)
    .add(_b.set(0, height + Math.sin(t * 0.57 + seed * 3) * height * 0.04 + Math.sin(t * 1.9 + seed) * 0.12, 0));
  // face upwind towards the flyer, tipped back about 25 degrees (a real kite's angle to the wind), so the
  // tails hang down and blow back downwind; waggle round the face, and nod
  _d.copy(pos).addScaledVector(wind, -1).add(_c.set(0, -0.45, 0));
  _m.lookAt(pos, _d, _c.set(0, 1, 0));
  quat.setFromRotationMatrix(_m);
  // lookAt points -Z at the target; turn round so the kite's face (+Z) looks at it
  quat.multiply(_q2.setFromAxisAngle(_c.set(0, 1, 0), Math.PI));
  const roll = Math.sin(t * 1.15 + seed * 7) * 0.14 + Math.sin(t * 2.7 + seed * 3) * 0.04 - sw * 0.15;
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
  /** Horizontal wind direction (default the game's wind). */
  wind?: THREE.Vector3;
}

/** One diamond kite on its string. root holds the kite (moved every update) and the string. */
export class FestivalKite {
  root = new THREE.Group();
  /** The kite itself (cloth, spars, tails), posed every update. */
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
    this.U = { ...kiteUniforms(w, h), uColA: { value: new THREE.Color(cols[0]) }, uColB: { value: new THREE.Color(cols[1]) }, uColC: { value: new THREE.Color(cols[2]) }, uSeed: { value: opts.seed } };
    (this.U.uColD.value as THREE.Color).set(cols[3]);
    const { mat, depth } = shapedToon({ key: 'festkite2', uniforms: this.U, vertex: KITE_VERT, fragPars: KITE_FRAG_PARS, fragColor: KITE_FRAG, translucency: 0.3, variation: 0.2 });
    const cloth = new THREE.Mesh(kiteGrid(10, 14), mat);
    cloth.customDepthMaterial = depth; cloth.castShadow = true; cloth.userData.noOutline = true;
    const spars = new THREE.Mesh(sparGeometry(w, h), toon('#6e4a2c'));
    spars.castShadow = true;
    addOutlines(spars, '#3a2a2e', 0.006);
    const tails = ribbonMesh(tailSpecs(w, h, cols, opts.seed, false), this.RU, { seg: 48, key: 'fest' }).mesh;
    tails.quaternion.copy(TAIL_TURN);
    this.kite.add(cloth, spars, tails);
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

export interface ParadeKite { anchor: THREE.Vector3; height: number; colors: string[]; seed: number; size?: number }

export interface KiteParadeOpts {
  /** Give every kite yourself, or let the parade scatter `count` of them round `center`. */
  kites?: ParadeKite[];
  count?: number;
  center?: THREE.Vector3;
  radius?: number;
  height?: [number, number];
  seed?: number;
  wind?: THREE.Vector3;
  /** Draw the strings (default true). */
  strings?: boolean;
}

/** Dozens of festival kites with their tails and strings, in four draw calls. */
export class KiteParade {
  root = new THREE.Group();
  kites: ParadeKite[];
  wind: THREE.Vector3;
  private cloth: THREE.InstancedMesh;
  private spars: THREE.InstancedMesh;
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
      const n = opts.count ?? 30, c = opts.center ?? new THREE.Vector3(), R = opts.radius ?? 60, [h0, h1] = opts.height ?? [12, 34];
      this.kites = [];
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R;
        const pick = () => FESTIVAL[Math.floor(rnd() * FESTIVAL.length)];
        let A = pick(), B = pick(); while (B === A) B = pick();
        let C = pick(); while (C === A || C === B) C = pick();
        this.kites.push({ anchor: new THREE.Vector3(c.x + Math.cos(a) * r, c.y + rnd() * 6, c.z + Math.sin(a) * r), height: h0 + rnd() * (h1 - h0), colors: [A, B, C], seed: rnd() * 10, size: 1.8 + rnd() * 1.4 });
      }
    }
    const n = this.kites.length, w = KiteParade.W, h = w * 1.4;
    // shared shapes for a 1.3 m kite; each instance scales to its own size
    this.U = kiteUniforms(w, h);
    const { mat, depth } = shapedToon({ key: 'paradekite2', uniforms: this.U, vertex: KITE_VERT, fragPars: KITE_FRAG_PARS, fragColor: KITE_FRAG, translucency: 0.3, variation: 0.2 });
    mat.defines = { ...mat.defines, KITE_INST: '' }; depth.defines = { KITE_INST: '' };
    const grid = kiteGrid(6, 10);
    const cA = new Float32Array(n * 3), cB = new Float32Array(n * 3), cC = new Float32Array(n * 3), sd = new Float32Array(n);
    const col = new THREE.Color();
    this.kites.forEach((k, i) => {
      col.set(k.colors[0]).toArray(cA, i * 3); col.set(k.colors[1] ?? k.colors[0]).toArray(cB, i * 3); col.set(k.colors[2] ?? '#f6ecd4').toArray(cC, i * 3);
      sd[i] = k.seed;
    });
    const inst = (g: THREE.BufferGeometry) => {
      g.setAttribute('iColA', new THREE.InstancedBufferAttribute(cA, 3));
      g.setAttribute('iColB', new THREE.InstancedBufferAttribute(cB, 3));
      g.setAttribute('iColC', new THREE.InstancedBufferAttribute(cC, 3));
      g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(sd, 1));
    };
    inst(grid);
    this.cloth = new THREE.InstancedMesh(grid, mat, n);
    this.cloth.customDepthMaterial = depth; this.cloth.castShadow = true; this.cloth.userData.noOutline = true;
    this.spars = new THREE.InstancedMesh(sparGeometry(w, h), toon('#6e4a2c'), n);
    this.spars.userData.noOutline = true;
    const tm = ribbonMesh(tailSpecs(w, h, ['#ffffff'], 0, true), this.RU, { seg: 24, count: n, key: 'parade' });
    this.tails = tm.mesh as THREE.InstancedMesh;
    inst(this.tails.geometry);
    for (const m of [this.cloth, this.spars, this.tails]) m.frustumCulled = false;
    this.root.add(this.cloth, this.spars, this.tails);
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
      this.cloth.setMatrixAt(i, _m); this.spars.setMatrixAt(i, _m);
      _q.copy(this.quat).multiply(TAIL_TURN);
      _m.compose(this.pos, _q, _s.setScalar(sc));
      this.tails.setMatrixAt(i, _m);
      if (this.strings) this.strings.curve(i, kt.anchor, bridle(this.pos, this.quat, kt.size ?? w, _d), 0.05);
    });
    this.cloth.instanceMatrix.needsUpdate = true; this.spars.instanceMatrix.needsUpdate = true; this.tails.instanceMatrix.needsUpdate = true;
    this.strings?.commit();
  }
}
