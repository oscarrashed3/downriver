// The kite-wings of the Sky Isles race: long swept hang-glider deltas of cloth on a dark wooden frame, the
// rider hanging prone beneath, hands on the base bar of a triangular control frame. Each racer's wing has
// its own cloth: Zephy's red, salmon and cream harlequin, Lark's yellow and green, Gran Wren's blue and white,
// and Nilo's own: crisp white paper folded like a dart (it was Fold, the paper boat) with sailcloth patches.
//
// Planform (span S = 3.6 m): a sharp nose, straight leading edges swept back about 40 degrees to pointed
// tips, a root chord of 1.55 m along the keel, and a trailing edge that curves forward between the keel and
// the tips. The sail is one fan-shaped grid from the nose, shaped entirely in the vertex shader: it bellies
// up between the keel and the leading edges like a filled sail, ripples run back through it, and the
// trailing edge flutters between the battens, faster and harder with speed and in a dive.
//
// fold(k) is a choreographed sequence: the leading edges swing back in parallel to the keel and the cloth
// gathers into a pleated bundle along it, the control frame folds flat, the ribbons reel in; then (when the
// rider is standing) the bundle comes down onto the rider's shoulder, ready to cross-fade into Fold.
//
// Hierarchy: root (the world places and heads it, nose along +Z) > tilt (bank, pitch, turbulence)
// > frame, cloth, ribbons, rider (the attach point; see kiteRider.ts glidePose).
//
// Cost per wing: cloth 1.3k triangles (1 draw), frame about 2k triangles (1 draw + 1 ink), ribbons
// (1 draw), scarf (1 draw), wind lines (1 draw, only while diving). Plus the rider.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from '../props';
import { addOutlines } from '../../render/paint';
import { shapedToon, ribbonMesh, ribbonUniforms, windLines, type RibbonSpec } from './kiteCloth';
import { glidePose, reachArm, type RiderRig } from './kiteRider';

export type WingPattern = 'nilo' | 'zephy' | 'lark' | 'wren';

/** How the wing is flying this frame. */
export interface WingState {
  /** Airspeed in m/s (a cruise is about 14, a race sprint 22, a dive 30+). */
  speed: number;
  /** Bank in radians, + = the rider's right wing down (turning right). */
  bank: number;
  /** Pitch in radians, + = nose up. */
  pitch: number;
  /** 0..1 how steep a dive: nose down, cloth snapping, bar pulled in, wind lines. */
  dive: number;
  /** 0..1 how upright the rider is (landing: 0 hanging prone, 1 standing and running under the wing). */
  upright?: number;
  /** Running speed in m/s while upright (landing run). */
  run?: number;
}

interface PatternDef { mode: number; a: string; b: string; c: string; d: string; hem: string; wood: string; cell: number; ribbons: { color: string; color2?: string; stripes?: number }[] }
const PATTERNS: Record<WingPattern, PatternDef> = {
  zephy: { mode: 0, a: '#c64838', b: '#f0e0c4', c: '#e28a70', d: '#d88c4c', hem: '#7e2c24', wood: '#5e3c24', cell: 0.62,
    ribbons: [{ color: '#c64838', color2: '#f0e0c4', stripes: 5 }, { color: '#e28a70' }, { color: '#f0e0c4' }] },
  lark: { mode: 0, a: '#e4b844', b: '#f2e6c8', c: '#98bc68', d: '#de9a48', hem: '#8a6a24', wood: '#664428', cell: 0.58,
    ribbons: [{ color: '#e4b844', color2: '#f2e6c8', stripes: 5 }, { color: '#98bc68' }, { color: '#de9a48' }] },
  wren: { mode: 1, a: '#3c6cb4', b: '#f2efe6', c: '#a4c2e2', d: '#3c6cb4', hem: '#24427a', wood: '#5a3a24', cell: 0.42,
    ribbons: [{ color: '#3c6cb4', color2: '#f2efe6', stripes: 6 }, { color: '#a4c2e2' }, { color: '#f2efe6' }] },
  nilo: { mode: 2, a: '#f7f4ec', b: '#e6d8b6', c: '#c9b088', d: '#5a6a96', hem: '#c4ae84', wood: '#7a5232', cell: 0.5,
    ribbons: [{ color: '#f7f4ec', color2: '#e6d8b6', stripes: 4 }, { color: '#e6d8b6' }, { color: '#f7f4ec' }] },
};

// ---------------------------------------------------------------- cloth shader

/**
 * The sail is a fan from the nose: c.x from -1 (left leading edge) through 0 (the keel) to 1 (right leading
 * edge), c.y from 0 (the nose) to 1 (the trailing edge). P = nose + c.y * (B(c.x) - nose), where B runs
 * along the trailing edge from the keel's end to the tip. Lines of constant c.x are straight rays from the
 * nose: the seams, the battens, and (on Nilo's paper) the fold lines.
 */
const CLOTH_VERT = /* glsl */ `
  uniform vec3 uNose, uTail, uTip;
  uniform float uConc, uBillow, uFlut, uPhase, uFold, uScallop, uBat, uCrease;
  varying vec2 vC; varying vec2 vP0; varying float vRay;
  // the trailing edge (and the leading edge at a = 1), flat and unfolded
  vec3 edge(float a, float sx) {
    vec3 tip = vec3(uTip.x * sx, uTip.y, uTip.z);
    vec3 b = mix(uTail, tip, a);
    b.z += uConc * pow(sin(3.14159 * a), 0.8) * (1.0 - 0.25 * a);   // curves forward between keel and tip
    b.z += uScallop * sin(3.14159 * fract(a * uBat)) * (1.0 - a);   // pulled in between the battens
    return b;
  }
  // a paper dart's folds: ridge and valley lines running from the nose (piecewise straight, so flat facets)
  float zig(float a) {
    float x = a * 3.0;
    float k = x < 1.0 ? x : x < 2.0 ? 1.0 - (x - 1.0) * 0.7 : 0.3 - (x - 2.0) * 0.3;
    return k;
  }
  vec3 sail(vec2 c, out vec2 p0, out float ray) {
    float a = clamp(abs(c.x), 0.0, 1.0), sx = c.x < 0.0 ? -1.0 : 1.0, v = c.y;
    vec3 B = edge(a, sx);
    vec3 p = uNose + v * (B - uNose);
    p0 = vec2(abs(p.x), p.z); ray = length((B - uNose).xz);
    // the paper's folds
    p.y += v * uCrease * zig(a);
    // belly: the sail fills between the keel and the leading edge, deepest two thirds of the way back
    float fill = pow(sin(3.14159 * a), 0.9) * (1.0 - (1.0 - v) * (1.0 - v)) * (1.0 - 0.25 * v);
    p.y += uBillow * fill * (0.85 + 0.15 * sin(uPhase * 0.21 + a * 3.0));
    // ripples running back through the cloth, and the trailing edge flutter
    float tr = smoothstep(0.5, 1.0, v);
    float w1 = sin(a * 13.0 - uPhase + v * 6.0), w2 = sin(a * 23.0 + uPhase * 1.63 + v * 4.0);
    float fl = uFlut * (0.3 + 0.7 * sin(3.14159 * min(1.0, a * 1.2))) * (tr * tr + 0.1 * v);
    p.y += fl * (w1 * 0.7 + w2 * 0.3);
    p.z += fl * 0.3 * w2;
    // folding: the leading edges swing back about the nose, the cloth pleats and gathers on the keel
    if (uFold > 0.0) {
      vec3 r = p - uNose;
      float rr = length(r.xz), th = rr > 1e-5 ? atan(r.x, -r.z) * (1.0 - 0.955 * uFold) : 0.0;
      p.x = uNose.x + rr * sin(th); p.z = uNose.z - rr * cos(th);
      p.y = p.y * (1.0 - 0.75 * uFold) + uFold * (0.035 * sin(a * 37.7) * v - 0.02 * v);
    }
    return p;
  }
  void shape(out vec3 P, out vec3 N) {
    vec2 c = uv; vec2 p0, q0; float ray, r2;
    P = sail(c, p0, ray);
    vec2 cu = vec2(c.x, max(c.y, 0.03));
    vec3 du = sail(cu + vec2(0.01, 0.0), q0, r2) - sail(cu, q0, r2);
    vec3 dv = sail(c + vec2(0.0, 0.01), q0, r2) - P;
    vec3 n = cross(du, dv);
    N = dot(n, n) > 1e-14 ? normalize(n) : vec3(0.0, 1.0, 0.0);
    vC = c; vP0 = p0; vRay = ray;
  }
`;

const CLOTH_FRAG_PARS = /* glsl */ `
  varying vec2 vC; varying vec2 vP0; varying float vRay;
  uniform vec3 uColA, uColB, uColC, uColD, uHem; uniform float uMode, uBat, uCell; uniform vec3 uNose, uTip;
  // a crisp antialiased line where x crosses a whole number, w wide (in x's units)
  float lineAt(float x, float w) { float d = abs(fract(x + 0.5) - 0.5); float aa = max(fwidth(x) * 0.8, 1e-4); return 1.0 - smoothstep(w - aa, w + aa, d); }
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;
const CLOTH_FRAG = /* glsl */ `
  {
    vec2 c = vC; float a = abs(c.x);
    vec2 P = vP0;                                   // flat planform position: |x|, z in metres
    vec3 col = uColA; float seam = 0.0;
    // distance in metres to the leading edge (nose to tip) and to the trailing edge (along the ray)
    vec2 le = normalize(vec2(uTip.x, uTip.z - uNose.z));
    float dLE = abs((P.x) * le.y - (P.y - uNose.z) * le.x);
    float dTE = (1.0 - c.y) * vRay;
    if (uMode < 0.5) {
      // harlequin: big diamonds laid along the leading edge, sewn from four colours
      vec2 q = vec2(P.x, P.y - uNose.z) / uCell;
      float d1 = q.x + q.y * 0.9, d2 = q.x - q.y * 0.9;
      vec2 cell = floor(vec2(d1, d2));
      float par = mod(cell.x + cell.y, 2.0);
      float h = h21(cell);
      col = par < 0.5 ? uColA : uColB;
      if (par > 0.5 && h > 0.55) col = uColC;
      if (par < 0.5 && h > 0.8) col = uColD;
      seam = max(lineAt(d1, 0.025), lineAt(d2, 0.025));
    } else if (uMode < 1.5) {
      // Gran Wren: blue and white diamonds, a broad blue band along the leading edge and down the keel
      vec2 q = vec2(P.x, P.y - uNose.z) / uCell;
      float d1 = q.x + q.y, d2 = q.x - q.y;
      vec2 cell = floor(vec2(d1, d2));
      col = mod(cell.x + cell.y, 2.0) < 0.5 ? uColA : uColB;
      seam = max(lineAt(d1, 0.03), lineAt(d2, 0.03));
      if (P.x < 0.09) { col = uColA; seam = 0.0; }
      else if (P.x < 0.13) { col = uColC; seam = 0.0; }
      if (dLE < 0.22) { col = dLE < 0.17 ? uColA : uColB; seam = 0.0; }
    } else {
      // Nilo: folded paper, the creases from the nose (the facets shade themselves), sailcloth on the outer panels
      // each facet takes the light a little differently (the dart's folds), even in the shade
      float fct = floor(min(a * 3.0, 2.99));
      col = uColA * (fct < 0.5 ? 1.0 : fct < 1.5 ? 0.9 : 0.96);
      seam = max(lineAt(a * 3.0, 0.012), lineAt(a, 0.003)) * 0.6;
      // the letter's old handwriting, faded, across the middle panels
      if (a < 0.62 && c.y > 0.3 && c.y < 0.9) {
        float row = (P.y - uNose.z) / 0.085;
        float ln = fract(row);
        float word = step(0.3, h21(vec2(floor(P.x / 0.09), floor(row))));
        float ink = (1.0 - smoothstep(0.05, 0.16, abs(ln - 0.5))) * word * (0.55 + 0.45 * sin(P.x * 140.0 + row * 9.0));
        col = mix(col, uColD, ink * 0.22);
      }
      // sailcloth patches stitched on outboard, where the boat's paper ran out
      if (a > 0.667) {
        vec2 q = vec2(P.x, P.y) / 0.42;
        vec2 cell = floor(q + vec2(0.0, floor(q.x) * 0.5));
        col = h21(cell) > 0.6 ? uColB : mix(uColB, uColA, 0.45);
        seam = max(seam, max(lineAt(q.x, 0.03), lineAt(q.y + floor(q.x) * 0.5, 0.03)) * 0.8);
        float stitch = step(0.5, fract(c.y * vRay * 12.0));
        seam = max(seam, lineAt(a * 3.0 - 0.02, 0.012) * stitch);
      }
    }
    col = mix(col, col * 0.62, seam * 0.85);
    // batten pockets: faint darker rays
    if (uMode < 1.5) col *= 1.0 - lineAt(a * uBat, 0.012 * uBat) * step(0.12, c.y) * step(c.y, 0.92) * 0.12;
    // bound hems along the leading edge (wrapped round the spar) and the trailing edge
    float aaL = max(fwidth(dLE), 1e-4), aaT = max(fwidth(dTE), 1e-4);
    float hemL = 1.0 - smoothstep(0.045 - aaL, 0.045 + aaL, dLE);
    float hemT = 1.0 - smoothstep(0.03 - aaT, 0.03 + aaT, dTE);
    col = mix(col, uHem, max(hemL, hemT * 0.9));
    diffuseColor.rgb = col;
  }
`;

// ---------------------------------------------------------------- the wing

export interface KiteWingOpts {
  pattern: WingPattern;
  /** Wing span in metres (3.2 .. 4). */
  span?: number;
  /** Draw wind lines in a dive (default true). */
  windLines?: boolean;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();

export class KiteWing {
  /** Place and head this in the world: nose along +Z, up +Y. */
  root = new THREE.Group();
  /** Bank and pitch (and turbulence) live here; everything else hangs off it. */
  tilt = new THREE.Group();
  /** Attach point for the rider: the rider's root goes here (posed by the wing every update). */
  rider = new THREE.Group();
  readonly span: number;
  readonly pattern: WingPattern;
  /** Key points in tilt space, unfolded: nose, the keel's end, the right tip. */
  readonly nose: THREE.Vector3; readonly tail: THREE.Vector3; readonly tip: THREE.Vector3;
  /** Middle of the control frame's base bar, where the hands grip (tilt space). */
  readonly bar: THREE.Vector3;
  /** Apex of the control frame on the keel. */
  readonly apex: THREE.Vector3;
  private cloth: THREE.Mesh;
  private frame: THREE.Mesh;
  private U: Record<string, THREE.IUniform>;
  private ribbons: THREE.Mesh;
  private RU = ribbonUniforms();
  private ribTips: number[] = [];
  private scarf: { mesh: THREE.Mesh; u: ReturnType<typeof ribbonUniforms>; anchor: THREE.Object3D } | null = null;
  private wind: ReturnType<typeof windLines> | null = null;
  private foldK = -1;
  private kGeo = 0; private kLow = 0; private kFrame = 0;
  private rig: RiderRig | null = null;
  /** Rider measurements, standing at rest (root space of the rig). */
  private m = { hip: 0.62, shoulder: 0.95, shX: 0.2, height: 1.4, body: 0.55 };
  private gripW = 0.24;
  private sm = { bank: 0, pitch: 0, dive: 0, speed: 14, upright: 0, bankV: 0, pitchV: 0 };
  private phase = 0; private rphase = 0;
  private def: PatternDef;
  private f: number;

  constructor(opts: KiteWingOpts) {
    const S = this.span = opts.span ?? 3.6;
    const f = this.f = S / 3.6;
    this.pattern = opts.pattern;
    const d = this.def = PATTERNS[opts.pattern];
    this.nose = new THREE.Vector3(0, 0.04, 0.95 * f);
    this.tail = new THREE.Vector3(0, 0, -0.6 * f);
    this.tip = new THREE.Vector3(0.5 * S, -0.05 * f, -0.56 * f);
    this.apex = new THREE.Vector3(0, -0.035, 0.28 * f);
    this.bar = new THREE.Vector3(0, -0.8, 0.58 * f);
    this.root.add(this.tilt);
    this.tilt.add(this.rider);

    // cloth: one fan grid, shaped in the shader
    this.U = {
      uNose: { value: this.nose.clone() }, uTail: { value: this.tail.clone() }, uTip: { value: this.tip.clone() },
      uConc: { value: 0.36 * f }, uBillow: { value: 0.2 * f }, uFlut: { value: 0.03 }, uPhase: { value: 0 }, uFold: { value: 0 },
      uScallop: { value: 0.045 * f }, uBat: { value: 4 }, uCrease: { value: d.mode === 2 ? 0.26 * f : 0 }, uCell: { value: d.cell * f },
      uColA: { value: new THREE.Color(d.a) }, uColB: { value: new THREE.Color(d.b) }, uColC: { value: new THREE.Color(d.c) },
      uColD: { value: new THREE.Color(d.d) }, uHem: { value: new THREE.Color(d.hem) }, uMode: { value: d.mode },
    };
    if (d.mode === 2) { this.U.uBillow.value = 0.07 * f; this.U.uScallop.value = 0.02 * f; }
    const { mat, depth } = shapedToon({ key: 'kitewing2', uniforms: this.U, vertex: CLOTH_VERT, fragPars: CLOTH_FRAG_PARS, fragColor: CLOTH_FRAG,
      translucency: d.mode === 2 ? 0.16 : 0.24, variation: d.mode === 2 ? 0.15 : 0.3, rim: 0.7, flat: d.mode === 2 });
    this.cloth = new THREE.Mesh(fanGrid(24, 14), mat);
    this.cloth.customDepthMaterial = depth;
    this.cloth.castShadow = true; this.cloth.receiveShadow = false;
    this.cloth.frustumCulled = false; // the shader moves it
    this.cloth.userData.noOutline = true; // inked by the finish pass from depth
    this.tilt.add(this.cloth);

    // frame: rebuilt only when the fold changes
    this.frame = new THREE.Mesh(new THREE.BufferGeometry(), toon(d.wood));
    this.frame.castShadow = true;
    this.tilt.add(this.frame);
    this.buildFrame();
    addOutlines(this.frame, '#2e2024', 0.008);

    // ribbons: two streamers off the keel's end (tapering, fishtailed), a thin pennant off each tip
    const chord = this.nose.z - this.tail.z;
    const R = d.ribbons;
    const specs: RibbonSpec[] = [
      { root: [0.03, -0.02, this.tail.z + 0.02], length: chord * 1.9, width: 0.11 * f, color: R[0].color, color2: R[0].color2, stripes: R[0].stripes, seed: 0.3 + S, amp: 1, taper: 0.55, notch: 1.4 },
      { root: [-0.03, -0.02, this.tail.z + 0.02], length: chord * 1.5, width: 0.085 * f, color: R[1].color, seed: 1.1 + S, amp: 1.15, taper: 0.5, notch: 1.4 },
      { root: [this.tip.x, this.tip.y, this.tip.z], length: chord * 1.25, width: 0.04, color: R[2].color, seed: 2.3 + S, amp: 1.3, taper: 0.4 },
      { root: [-this.tip.x, this.tip.y, this.tip.z], length: chord * 1.2, width: 0.04, color: R[2].color, seed: 3.1 + S, amp: 1.3, taper: 0.4 },
    ];
    this.ribTips = [2, 3];
    this.ribbons = ribbonMesh(specs, this.RU, { seg: 32, key: 'wing' }).mesh;
    this.tilt.add(this.ribbons);
    if (opts.windLines !== false) {
      const t = this.tip, n = this.nose;
      const around = [t.clone(), t.clone().setX(-t.x), n.clone().lerp(t, 0.6), n.clone().lerp(t.clone().setX(-t.x), 0.6), this.tail.clone().setY(-0.4), t.clone(), t.clone().setX(-t.x)];
      this.wind = windLines({ count: 20, around, spread: 0.3 * f, length: [1.4, 4.2], span: 14, seed: S * 10 });
      this.wind.mesh.visible = false;
      this.tilt.add(this.wind.mesh);
    }
    this.fold(0);
  }

  /**
   * Put a rider on the wing. `rig` is a Person or a StandInRider (its root is added to the attach point).
   * `scarf` gives the long scarf ends that stream from the rider's neck: the anchor is a joint on the rider
   * (followed every frame), colour, length and width.
   */
  setRider(rig: RiderRig, scarf?: { anchor: THREE.Object3D; color: string; length?: number; width?: number }) {
    this.rig = rig;
    // measure the rider standing at rest
    rig.root.position.set(0, 0, 0); rig.root.quaternion.identity(); rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.root);
    const sh = rig.arms[1].sh.getWorldPosition(new THREE.Vector3());
    const hip = rig.hipY * rig.H;
    this.m = { hip, shoulder: sh.y, shX: Math.abs(sh.x), height: box.max.y, body: sh.y - hip };
    this.gripW = Math.abs(sh.x) * 1.25;
    this.rider.add(rig.root);
    if (scarf) {
      const L = scarf.length ?? 2.0, W = scarf.width ?? 0.17;
      const u = ribbonUniforms(); u.uWaveK.value = 2.2;
      const mesh = ribbonMesh([
        { root: [0, 0, 0], length: L, width: W, color: scarf.color, seed: 0.3, amp: 1.0, taper: 0.35, notch: 0.9 },
        { root: [0.05, -0.03, 0.02], length: L * 0.68, width: W * 0.85, color: scarf.color, seed: 1.9, amp: 1.2, taper: 0.3, notch: 0.9 },
      ], u, { seg: 28, key: 'scarf' }).mesh;
      this.tilt.add(mesh);
      this.scarf = { mesh, u, anchor: scarf.anchor };
    }
  }

  /**
   * Fold the wing, 0 open .. 1 a tidy bundle. 0..0.7 the leading edges swing back to the keel and the cloth
   * gathers, 0.2..0.8 the control frame folds flat and the ribbons reel in, 0.55..1 (standing) the bundle
   * comes down onto the rider's shoulder. At 1 it can cross-fade into Fold.
   */
  fold(k: number) {
    k = clamp(k);
    if (Math.abs(k - this.foldK) < 1e-4) return;
    this.foldK = k;
    this.kGeo = sstep(0, 0.7, k); this.kFrame = sstep(0.2, 0.8, k); this.kLow = sstep(0.55, 1, k);
    this.U.uFold.value = this.kGeo;
    this.buildFrame();
    // tip ribbons ride on the folding tips; all ribbons reel in
    const tip = this.foldPoint(this.tip, this.kGeo, _v);
    const g = this.ribbons.geometry, root = g.getAttribute('aRoot') as THREE.BufferAttribute;
    const per = root.count / 4;
    this.ribTips.forEach((ri, j) => { for (let i = 0; i < per; i++) root.setXYZ(ri * per + i, tip.x * (j ? -1 : 1), tip.y, tip.z); });
    root.needsUpdate = true;
    this.RU.uLenK.value = 1 - 0.88 * sstep(0.1, 0.8, k);
  }
  get folded() { return Math.max(0, this.foldK); }

  /** Where the rider's feet stand, below the root, when upright (landing): put the root this high above the ground. */
  get groundHeight() { return this.m.shoulder + 0.08 * this.m.height - this.bar.y; }

  /** A point of the unfolded wing (tilt space) moved by the fold (the same sweep the cloth shader does). */
  foldPoint(p: THREE.Vector3, k: number, out = new THREE.Vector3()) {
    const n = this.nose, rx = p.x - n.x, rz = p.z - n.z;
    const r = Math.hypot(rx, rz), th = Math.atan2(rx, -rz) * (1 - 0.955 * k);
    return out.set(n.x + r * Math.sin(th), p.y * (1 - 0.75 * k), n.z - r * Math.cos(th));
  }
  /** The right wing tip with the wing folded by k (the left mirrors it). */
  foldTipAt(k: number, out = new THREE.Vector3()) { return this.foldPoint(this.tip, sstep(0, 0.7, k), out); }

  /** The control frame's base bar ends (right; mirror for left), folded flat along the keel by kf. */
  private barEnd(kf: number, out: THREE.Vector3) {
    const a = this.apex, y0 = this.bar.y - a.y, z0 = this.bar.z - a.z;
    const R = Math.hypot(y0, z0), a0 = Math.atan2(z0, y0), a1 = Math.atan2(-0.86 * this.f, -0.07) + Math.PI * 2;
    const ang = lerp(a0, a1, kf);
    return out.set(lerp(0.44, 0.04, kf), a.y + Math.cos(ang) * R, a.z + Math.sin(ang) * R);
  }

  /** Spars, lashings, the control frame and the bar, merged into one mesh. */
  private buildFrame() {
    const parts: THREE.BufferGeometry[] = [];
    const spar = (a: THREE.Vector3, b: THREE.Vector3, r: number, over = 0, r2 = r) => {
      const dir = _w.subVectors(b, a); const len = dir.length() + over * 2;
      if (len < 1e-3) return;
      const g = new THREE.CylinderGeometry(r2, r, len, 8, 1);
      _q.setFromUnitVectors(_up, dir.normalize());
      g.applyQuaternion(_q); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      parts.push(g);
    };
    const knot = (p: THREE.Vector3, r: number) => { const g = new THREE.SphereGeometry(r, 8, 6); g.translate(p.x, p.y, p.z); parts.push(g); };
    const f = this.f, kg = this.kGeo, kf = this.kFrame;
    const F = (p: THREE.Vector3) => this.foldPoint(p, kg, new THREE.Vector3());
    const tipR = F(this.tip), tipL = F(this.tip.clone().setX(-this.tip.x));
    const nose = this.nose.clone(), tail = this.tail.clone();
    // keel: the thickest spar, from the nose to past the trailing edge
    spar(nose.clone().setY(0.0), tail.clone().setY(-0.015).setZ(tail.z - 0.06), 0.036 * f, 0.03);
    // leading edges: straight, a little proud of the cloth, tapering to the tips
    for (const t of [tipR, tipL]) spar(nose, t.clone().setY(t.y + 0.012), 0.033 * f, 0.04, 0.022 * f);
    // the cross bar under the sail, from leading edge to leading edge through a hub on the keel
    const hub = new THREE.Vector3(0, -0.06, 0.12 * f);
    const leR = F(this.nose.clone().lerp(this.tip, 0.56).add(new THREE.Vector3(0, -0.04, 0))), leL = leR.clone().setX(-leR.x);
    spar(hub, leR, 0.026 * f); spar(hub, leL, 0.026 * f);
    knot(hub, 0.05 * f);
    // the control frame: two down tubes from the apex on the keel to the base bar the hands hold
    const eR = this.barEnd(kf, new THREE.Vector3()), eL = eR.clone().setX(-eR.x);
    spar(this.apex, eR, 0.017, 0.01); spar(this.apex, eL, 0.017, 0.01);
    spar(eL, eR, 0.02, 0.03);
    knot(this.apex, 0.034); knot(eR, 0.024); knot(eL, 0.024);
    // leather grips on the bar
    for (const s of [-1, 1]) { const c = eL.clone().lerp(eR, 0.5 + s * 0.3); const g = new THREE.CylinderGeometry(0.025, 0.025, 0.1, 8); g.rotateZ(Math.PI / 2); g.translate(c.x, c.y, c.z); parts.push(g); }
    // the hang strap from the keel down to the rider's harness
    if (this.rig && this.sm.upright < 0.5) spar(new THREE.Vector3(0, -0.03, 0.02 * f), new THREE.Vector3(0, -0.42, 0.02 * f), 0.012);
    // lashings at the joints, caps on the spar ends
    knot(nose, 0.05 * f); knot(tail.clone().setZ(tail.z - 0.06), 0.04 * f); knot(tipR, 0.035 * f); knot(tipL, 0.035 * f);
    knot(leR, 0.038 * f); knot(leL, 0.038 * f);
    const g = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p; }), false)!;
    parts.forEach(p => p.dispose());
    this.frame.geometry.dispose();
    this.frame.geometry = g;
    for (const c of this.frame.children) (c as THREE.Mesh).geometry = g; // the ink outline shares it
  }

  /** Fly: speed, bank, pitch and dive drive the tilt, the cloth, the ribbons, the rider and the wind lines. */
  update(dt: number, t: number, s: WingState) {
    const m = this.sm, e = 1 - Math.exp(-4 * dt);
    // bank and pitch on a springy follow, so the wing swings into a turn and settles
    const kb = 22, db = 7;
    m.bankV += ((s.bank - m.bank) * kb - m.bankV * db) * dt; m.bank += m.bankV * dt;
    m.pitchV += ((s.pitch - m.pitch) * kb - m.pitchV * db) * dt; m.pitch += m.pitchV * dt;
    m.dive = lerp(m.dive, clamp(s.dive), e);
    m.speed = lerp(m.speed, s.speed, e);
    const prevUp = m.upright;
    m.upright = lerp(m.upright, clamp(s.upright ?? 0), 1 - Math.exp(-6 * dt));
    if ((prevUp < 0.5) !== (m.upright < 0.5)) this.buildFrame(); // the hang strap comes off
    const sp = clamp(m.speed / 25), dv = m.dive, up = m.upright, low = this.kLow * up;
    // turbulence: a slow wander and a quicker shiver, more at speed
    const tb = 0.02 + sp * 0.02 + dv * 0.03;
    const air = 1 - up;
    const pitch = lerp(-(m.pitch - dv * 0.75), -0.18 - this.kLow * 0.0, low) + Math.sin(t * 1.7) * tb * 0.5 * air;
    _e.set(pitch, Math.sin(t * 0.9) * tb * 0.3 * air, lerp(m.bank, 0, low) + (Math.sin(t * 1.3 + 1) * tb + Math.sin(t * 5.3) * tb * 0.25 * (sp + dv)) * air);
    this.tilt.quaternion.setFromEuler(_e);
    // The wing turns about the point the hands hold: the bar, or (folded, standing) the bundle on the shoulder.
    const hold = this.holdLocal(_u);
    const holdRoot = this.holdRoot(_w);
    _v.copy(hold).applyQuaternion(this.tilt.quaternion);
    this.tilt.position.copy(holdRoot).sub(_v)
      .add(_v.set(Math.sin(t * 0.7 + this.span) * 0.05, Math.sin(t * 1.1) * 0.08 + Math.sin(t * 2.9) * 0.02, 0).multiplyScalar(air));

    // cloth: fuller and snappier with speed; a dive makes the trailing edge crack like a flag
    const om = 7 + m.speed * 0.5 + dv * 18;
    this.phase += dt * om;
    const paper = this.def.mode === 2 ? 0.55 : 1;
    this.U.uPhase.value = this.phase;
    this.U.uFlut.value = (0.022 + sp * 0.03 + dv * 0.04) * (1 - this.kGeo * 0.8) * this.f * paper;
    this.U.uBillow.value = (this.def.mode === 2 ? 0.07 : 0.13 + sp * 0.09 - dv * 0.02) * (1 - up * 0.35) * this.f;

    // ribbons trail along the airflow (back along the flight path), flicking; they hang only when slow
    this.rphase += dt * (4 + m.speed * 0.45 + dv * 10);
    const divePitch = clamp(dv * 0.75 + Math.max(0, -m.pitch), 0, 1.4);
    const inv = _q2.copy(this.tilt.quaternion).invert();
    const flow = _v.set(0, Math.sin(divePitch), -Math.cos(divePitch)).applyQuaternion(inv);
    const grav = _w.set(0, -1, 0).applyQuaternion(inv).multiplyScalar(0.05 + (1 - sp) * (1 - sp) * 1.8 + up * 0.8);
    for (const u of [this.RU, this.scarf?.u]) {
      if (!u) continue;
      u.uFlow.value.copy(flow); u.uDroop.value.copy(grav);
    }
    this.RU.uPhase.value = this.rphase;
    this.RU.uAmp.value = (0.3 + (1 - sp) * 0.9 + dv * 0.1) * (1 - this.kFrame * 0.7);
    if (this.wind) {
      const amt = clamp((dv - 0.3) / 0.5) * 0.85 + clamp((m.speed - 28) / 10) * 0.25;
      this.wind.uniforms.uAmt.value = amt;
      this.wind.uniforms.uTime.value = t;
      this.wind.uniforms.uSpeed.value = 16 + m.speed * 0.7;
      this.wind.mesh.visible = amt > 0.01;
    }

    // rider: hanging prone under the keel, weight shifted to the low wing; upright (landing) stands under the bar
    const rig = this.rig;
    if (rig) {
      const M = this.m;
      // prone (tilt space): hips under the keel, shoulders a little behind the bar
      const hipZ = this.bar.z - 0.34 * this.f - M.body * 0.95;
      const prone = _v.set(-m.bank * 0.1, -0.42 - M.body * 0.22 - M.hip, hipZ).applyQuaternion(this.tilt.quaternion).add(this.tilt.position);
      // standing (root space): feet on the ground, just behind the bar
      const stand = _w.set(0, -this.groundHeight, this.bar.z - 0.32 * this.f - M.shX * 0.2);
      prone.lerp(stand, up).sub(this.tilt.position);
      _q.copy(this.tilt.quaternion).invert();
      this.rider.position.copy(prone.applyQuaternion(_q));
      this.rider.quaternion.identity().slerp(_q, up);
      // a StandInRider poses its own stand / run; a Person is animated by its owner before update()
      const anyRig = rig as RiderRig & { update?: (dt: number, sp: number) => void; flutter?: (t: number, w: number, k: number) => void };
      anyRig.update?.(dt, s.run ?? 0);
      glidePose(rig, { k: 1 - up, bank: m.bank, dive: dv, wind: 0.3 + sp * 0.7, t });
      if (up > 0.01) this.armsUpright(rig, up, s.run ?? 0, t);
      // both hands on the bar (or on the folded bundle), wherever it is
      this.root.updateMatrixWorld(true);
      for (let i = 0; i < 2; i++) {
        this.gripPoint(i, _u);
        this.tilt.localToWorld(_u);
        reachArm(rig, i, _u, 1);
      }
      anyRig.flutter?.(t, 0.3 + sp * 0.7 + dv * 0.5, 1 - up);
    }
    if (this.scarf) {
      // the scarf ends leave the neck and stream back on the wind
      this.tilt.updateMatrixWorld(true);
      const p = this.scarf.anchor.getWorldPosition(_w);
      this.tilt.worldToLocal(p);
      this.scarf.mesh.position.copy(p);
      this.scarf.u.uPhase.value = this.rphase * 1.3 + 0.4;
      this.scarf.u.uAmp.value = 0.45 + (1 - sp) * 0.8 + dv * 0.15;
    }
  }

  /** The point the hands hold, in tilt space: the bar, sliding to the bundle's balance point as it comes down. */
  private holdLocal(out: THREE.Vector3) {
    const tipZ = this.foldPoint(this.tip, 1).z;
    out.set(0, -0.09, (this.nose.z + tipZ) * 0.5 + 0.25);
    return out.lerp(this.bar, 1 - this.kLow * this.sm.upright);
  }
  /** Where that point goes in root space: the bar stays put in flight; folded and standing, it rests on the shoulder. */
  private holdRoot(out: THREE.Vector3) {
    const M = this.m, feet = -this.groundHeight;
    out.set(M.shX + 0.05, feet + M.shoulder + 0.06, this.bar.z - 0.32 * this.f + 0.25);
    return out.lerp(this.bar, 1 - this.kLow * this.sm.upright);
  }
  /** Hand i's grip (tilt space): on the base bar, or on the folded bundle in front of the shoulder. */
  private gripPoint(i: number, out: THREE.Vector3) {
    const s = i === 0 ? -1 : 1;
    const eR = this.barEnd(this.kFrame, _v);
    const w = Math.min(this.gripW, eR.x * 0.85 + 0.02);
    out.set(s * w, lerp(this.bar.y, eR.y, this.kFrame), lerp(this.bar.z, eR.z, this.kFrame));
    const h = this.holdLocal(_w);
    const carry = _v.set(0, h.y - 0.04, h.z + (i === 1 ? 0.0 : 0.32));
    return out.lerp(carry, this.kLow * this.sm.upright);
  }

  /** Landing: standing (or running) under the wing, arms up to the bar; elbows in when carrying the bundle. */
  private armsUpright(r: RiderRig, up: number, run: number, t: number) {
    for (let i = 0; i < 2; i++) {
      const A = r.arms[i], s = i === 0 ? -1 : 1;
      A.sh.rotation.x = lerp(A.sh.rotation.x, -2.4 + Math.sin(t * 9 + i) * 0.04 * run, up);
      A.sh.rotation.z = lerp(A.sh.rotation.z, s * 0.3, up);
      A.el.rotation.x = lerp(A.el.rotation.x, -0.4, up);
    }
    r.head.rotation.x = lerp(r.head.rotation.x, -0.1, up);
  }

  dispose() {
    this.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.isOutline) m.geometry.dispose(); });
  }
}

/** The sail's fan grid: uv.x from -1 (left leading edge) through 0 (keel) to 1 (right leading edge), uv.y from 0 (nose) to 1 (trailing edge). */
function fanGrid(nu: number, nv: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const cols = nu * 2 + 1;
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) {
    pos.push(0, 0, 0);
    // rows a little denser towards the trailing edge, where the cloth moves most
    uv.push((i - nu) / nu, 1 - Math.pow(1 - j / nv, 1.15));
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < cols - 1; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    // wound so the front face is the top of the sail
    if (i < nu) idx.push(a, c, b, b, c, d); else idx.push(a, d, b, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
  return g;
}
