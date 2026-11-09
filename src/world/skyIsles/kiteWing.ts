// The kite-wings of the Sky Isles race (picture 3): broad, low, hand-made wings of sewn cloth on a light
// honey-wood frame, the rider lying prone ON TOP of the sail, hands on a wooden cross bar, legs trailing
// off the back, a huge scarf streaming behind. Each racer's sail is a hand-cut layout of big triangles
// and diamonds (kitePanels.ts): Zephy's red, orange, salmon and cream, Lark's yellow, green and cream,
// Gran Wren's blues and white. Nilo's is his own: Fold the paper boat opened out into a paper dart, with
// real fold facets (flat-shaded ridges and valleys) and sailcloth patches stitched on.
//
// Planform (span S = 4 m): a sharp nose, straight leading edges swept back to pointed tips, a root chord
// of 1.85 m along the keel, a trailing edge curving forward between keel and tip. The sail is one
// fan-shaped grid from the nose, shaped in the vertex shader: it bellies up between the keel and the
// leading edges, ripples run back through it, the trailing edge flutters, faster and harder with speed
// and in a dive. In the fragment shader: the painted panels, a two-tone terminator across the billow,
// the frame's shadow lines, and warm sunlight glowing through the cloth from behind.
//
// The frame is thin and mostly hidden: the keel and a spreader under the sail, the leading edges rolled
// inside cloth sleeves, and on top one wooden cross bar the rider holds, on two short struts and cords.
//
// fold(k) folds the wing accordion-style along its seams like a paper fan (0..0.45), stands the two
// halves up in a V about the keel (0.22..0.7), then bends the ends up into a boat-like hull with ribbons
// tied round it (0.42..1): a shape that can cross-fade into Fold the paper boat. Standing (landing), the
// rider carries the folded wing crosswise in front of the chest.
//
// Hierarchy: root (the world places and heads it, nose along +Z) > tilt (bank, pitch, turbulence)
// > frame, sleeves, cloth, ribbons, ties, rider (the attach point; see kiteRider.ts glidePose).
//
// Cost per wing: cloth 1.3k triangles (1 draw), frame about 1.2k triangles (2 draws: wood, sleeves),
// tails (1 draw), scarf and cape (1 draw each), ties (1 draw, folded only), wind lines (1 draw, diving only).
// Plus the rider.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from '../props';
import { shapedToon, ribbonMesh, ribbonUniforms, windLines, type RibbonSpec } from './kiteCloth';
import { glidePose, reachArm, type RiderRig } from './kiteRider';
import { planform, fanXZ, sailTexture, PAPER_FOLDS, type WingPattern } from './kitePanels';

export type { WingPattern } from './kitePanels';

/** How the wing is flying this frame. */
export interface WingState {
  /** Airspeed in m/s (a cruise is about 14, a race sprint 22, a dive 30+). */
  speed: number;
  /** Bank in radians, + = the rider's right wing down (turning right). */
  bank: number;
  /** Pitch in radians, + = nose up. */
  pitch: number;
  /** 0..1 how steep a dive: nose down, cloth snapping, wind lines. */
  dive: number;
  /** 0..1 how upright the rider is (landing: 0 prone on top, 1 standing under the wing / carrying it). */
  upright?: number;
  /** Running speed in m/s while upright (landing run). */
  run?: number;
}

interface PatternDef {
  paper: boolean; wood: string; sleeve: string; tie: string;
  /** The two keel tails, and the tip ribbons. */
  tails: { color: string; color2: string; stripes: number }[];
  tips: { color: string; color2: string; stripes: number };
}
const PATTERNS: Record<WingPattern, PatternDef> = {
  zephy: { paper: false, wood: '#d8aa66', sleeve: '#b2392a', tie: '#f0c252',
    tails: [{ color: '#c8412f', color2: '#f3e3c3', stripes: 2 }, { color: '#e9833c', color2: '#f0c252', stripes: 1 }],
    tips: { color: '#f3e3c3', color2: '#c8412f', stripes: 1 } },
  lark: { paper: false, wood: '#d8aa66', sleeve: '#c89a34', tie: '#98be5e',
    tails: [{ color: '#efc24a', color2: '#98be5e', stripes: 2 }, { color: '#f4ead0', color2: '#e5a142', stripes: 1 }],
    tips: { color: '#98be5e', color2: '#efc24a', stripes: 1 } },
  wren: { paper: false, wood: '#d2a464', sleeve: '#2c4c88', tie: '#f4f1e8',
    tails: [{ color: '#3c6ab2', color2: '#f4f1e8', stripes: 2 }, { color: '#9dc0e4', color2: '#f4f1e8', stripes: 1 }],
    tips: { color: '#f4f1e8', color2: '#3c6ab2', stripes: 1 } },
  nilo: { paper: true, wood: '#dcb070', sleeve: '#e6dcc4', tie: '#3a4a86',
    tails: [{ color: '#f6f1e4', color2: '#3a4a86', stripes: 2 }, { color: '#e8d8b4', color2: '#f6f1e4', stripes: 1 }],
    tips: { color: '#f6f1e4', color2: '#c9a878', stripes: 1 } },
};

// ---------------------------------------------------------------- cloth shader

const F = PAPER_FOLDS;
/** Heights of the paper's ridges and valleys at each fold line (keel and leading edge low). */
const ZIG = [0, 0.55, 0.12, 0.62, 0.18, 0];

/**
 * The sail is a fan from the nose: c.x from -1 (left leading edge) through 0 (the keel) to 1 (right
 * leading edge), c.y from 0 (the nose) to 1 (the trailing edge). P = nose + c.y * (B(c.x) - nose), where B
 * runs along the trailing edge from the keel's end to the tip. Lines of constant c.x are straight rays
 * from the nose: the seams, and (on Nilo's paper) the fold lines.
 */
const CLOTH_VERT = /* glsl */ `
  uniform vec3 uNose, uTail, uTip;
  uniform float uConc, uBillow, uFlut, uPhase, uCrease, uPleat;
  uniform vec3 uFoldK;   // accordion, V, boat
  uniform vec2 uBoat;    // the folded hull's middle (z) and half length
  varying vec2 vPF; varying vec3 vUp0;
  vec3 edge(float a, float sx) {
    vec3 tip = vec3(uTip.x * sx, uTip.y, uTip.z);
    vec3 b = mix(uTail, tip, a);
    b.z += uConc * pow(sin(3.14159 * a), 0.8) * (1.0 - 0.25 * a);
    return b;
  }
  float tri(float x) { return 1.0 - abs(fract(x) * 2.0 - 1.0); }
  // the paper dart's ridges and valleys, straight between the fold lines (so the facets are flat)
  float zig(float a) {
    ${F.slice(1).map((f, i) => `if (a <= ${f.toFixed(4)}) return mix(${ZIG[i].toFixed(3)}, ${ZIG[i + 1].toFixed(3)}, (a - ${F[i].toFixed(4)}) / ${(f - F[i]).toFixed(4)});`).join('\n    ')}
    return 0.0;
  }
  // folding: (A) swing back to the keel like a closing fan, pleated along the seams; (B) the halves stand
  // up in a V about the keel; (C) the ends bend up into a hull and it gathers shorter
  vec3 foldP(vec3 p, float a, float sx) {
    float kA = uFoldK.x, kB = uFoldK.y, kC = uFoldK.z;
    if (kA + kB + kC <= 0.0) return p;
    vec3 r = p - uNose;
    float rr = length(r.xz);
    float th = rr > 1e-5 ? atan(r.x, -r.z) : 0.0;
    th *= 1.0 - 0.76 * kA;
    p.x = uNose.x + rr * sin(th); p.z = uNose.z - rr * cos(th);
    p.y = mix(p.y, uNose.y, 0.75 * kA) + kA * uPleat * tri(a * 4.0) * min(rr, 1.2);
    float ph = sx * kB * 1.35;
    float x = p.x, y = p.y - uNose.y;
    p.x = x * cos(ph) - y * sin(ph); p.y = uNose.y + x * sin(ph) + y * cos(ph);
    float zr = (p.z - uBoat.x) / uBoat.y;
    p.y += kC * 0.4 * uBoat.y * zr * zr;
    p.z = uBoat.x + (p.z - uBoat.x) * (1.0 - 0.5 * kC);
    return p;
  }
  vec3 sail(vec2 c, out vec2 pf) {
    float a = clamp(abs(c.x), 0.0, 1.0), sx = c.x < 0.0 ? -1.0 : 1.0, v = c.y;
    vec3 B = edge(a, sx);
    vec3 p = uNose + v * (B - uNose);
    pf = p.xz;
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
    return foldP(p, a, sx);
  }
  void shape(out vec3 P, out vec3 N) {
    vec2 c = uv; vec2 pf, q;
    P = sail(c, pf);
    vec2 cu = vec2(c.x, max(c.y, 0.03));
    // step towards the keel's other side never crosses it (the fold treats the halves apart)
    float e = c.x >= 0.0 ? -0.01 : 0.01;
    if (abs(c.x) < 0.011) e = -e;
    vec3 du = (sail(cu + vec2(e, 0.0), q) - sail(cu, q)) * sign(e);
    vec3 dv = sail(c + vec2(0.0, 0.01), q) - P;
    vec3 n = cross(du, dv);
    N = dot(n, n) > 1e-14 ? normalize(n) : vec3(0.0, 1.0, 0.0);
    vPF = pf;
    vUp0 = mat3(modelMatrix) * vec3(0.0, 1.0, 0.0);
  }
`;

const CLOTH_FRAG_PARS = /* glsl */ `
  varying vec2 vPF; varying vec3 vUp0;
  uniform sampler2D uPanels; uniform float uSpan, uChord, uNoseZ, uSpreadZ, uPaper; uniform vec3 uShadeTint;
  // soft lines where the keel and the spreader sit under the cloth
  float sparLines() {
    float aaX = max(fwidth(vPF.x), 1e-4), aaZ = max(fwidth(vPF.y), 1e-4);
    float k = 1.0 - smoothstep(0.015, 0.035 + aaX * 1.5, abs(vPF.x));
    float s = 1.0 - smoothstep(0.012, 0.03 + aaZ * 1.5, abs(vPF.y - uSpreadZ));
    return max(k, s);
  }
`;
const CLOTH_FRAG = /* glsl */ `
  float kwSpar = 0.0;
  {
    vec2 tuv = vec2(0.5 + vPF.x / uSpan, (uNoseZ - vPF.y) / uChord);
    vec3 col = texture2D(uPanels, tuv).rgb;
    kwSpar = sparLines() * (1.0 - uPaper);
    col *= 1.0 - 0.14 * kwSpar;
    // a two-tone terminator across the billow: the side of each belly turned from the sun steps darker
    vec3 nF = normalize(vPNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 u0 = normalize(vUp0) * (gl_FrontFacing ? 1.0 : -1.0);
    float rel = dot(nF, uSun) - dot(u0, uSun);
    col *= mix(uShadeTint, vec3(1.0), smoothstep(-0.07, -0.03, rel));
    diffuseColor.rgb = col;
  }
`;

// ---------------------------------------------------------------- the wing

export interface KiteWingOpts {
  pattern: WingPattern;
  /** Wing span in metres (3.2 .. 4.2). */
  span?: number;
  /** Draw wind lines in a dive (default true). */
  windLines?: boolean;
}

/** A streamer that leaves the rider (scarf ends, a cape): followed from a joint every frame. */
export interface RiderStreamer { anchor: THREE.Object3D; color: string; color2?: string; length?: number; width?: number }

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _h = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();
/** How the folded bundle is carried: turned crosswise in front of the chest. */
const CARRY = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, Math.PI / 2, 0));

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
  /** Middle of the cross bar the rider holds, on top of the sail (tilt space). */
  readonly bar: THREE.Vector3;
  /** Where the spreader crosses under the sail (z); standing, the hands hold it. */
  readonly spreadZ: number;
  private P: ReturnType<typeof planform>;
  private cloth: THREE.Mesh;
  private frame: THREE.Mesh;
  private sleeves: THREE.Mesh;
  private ties: THREE.Mesh;
  private U: Record<string, THREE.IUniform>;
  private ribbons: THREE.Mesh;
  private RU = ribbonUniforms();
  private ribRoots: THREE.Vector3[] = [];
  private streamers: { mesh: THREE.Mesh; u: ReturnType<typeof ribbonUniforms>; anchor: THREE.Object3D; cape: boolean }[] = [];
  private wind: ReturnType<typeof windLines> | null = null;
  private foldK = -1;
  private kA = 0; private kB = 0; private kC = 0; private kLow = 0;
  private boat = new THREE.Vector2();
  private rig: RiderRig | null = null;
  /** Rider measurements, standing at rest (root space of the rig). */
  private m = { hip: 0.62, shoulder: 0.95, shX: 0.2, height: 1.4, body: 0.4, arm: 0.45 };
  private gripW = 0.24;
  private sm = { bank: 0, pitch: 0, dive: 0, speed: 14, upright: 0, bankV: 0, pitchV: 0 };
  private phase = 0; private rphase = 0;
  private def: PatternDef;
  private f: number;

  constructor(opts: KiteWingOpts) {
    const S = this.span = opts.span ?? 4;
    const P = this.P = planform(S);
    const f = this.f = P.f;
    this.pattern = opts.pattern;
    const d = this.def = PATTERNS[opts.pattern];
    this.nose = P.nose.clone(); this.tail = P.tail.clone(); this.tip = P.tip.clone();
    this.bar = new THREE.Vector3(0, 0.15, 0.4 * f);
    this.spreadZ = 0.12 * f;
    this.boat.set(this.nose.z - 1.2 * f, 1.3 * f);
    this.root.add(this.tilt);
    this.tilt.add(this.rider);

    // cloth: one fan grid, shaped in the shader, painted from the panel texture
    this.U = {
      uNose: { value: this.nose.clone() }, uTail: { value: this.tail.clone() }, uTip: { value: this.tip.clone() },
      uConc: { value: P.conc }, uBillow: { value: 0.16 * f }, uFlut: { value: 0.03 }, uPhase: { value: 0 },
      uCrease: { value: d.paper ? 0.24 * f : 0 }, uPleat: { value: 0.13 * f },
      uFoldK: { value: new THREE.Vector3() }, uBoat: { value: this.boat },
      uPanels: { value: sailTexture(opts.pattern, S) }, uSpan: { value: S }, uChord: { value: this.nose.z - this.tail.z }, uNoseZ: { value: this.nose.z },
      uSpreadZ: { value: this.spreadZ }, uPaper: { value: d.paper ? 1 : 0 },
      uShadeTint: { value: d.paper ? new THREE.Color().setRGB(0.86, 0.85, 0.93) : new THREE.Color().setRGB(0.8, 0.78, 0.9) },
    };
    const { mat, depth } = shapedToon({ key: 'kitewing3', uniforms: this.U, vertex: CLOTH_VERT, fragPars: CLOTH_FRAG_PARS, fragColor: CLOTH_FRAG,
      translucency: d.paper ? 0.32 : 0.62, variation: d.paper ? 0.12 : 0.22, rim: 0.7, flat: d.paper, transmitMask: '(1.0 - 0.8 * kwSpar)' });
    this.cloth = new THREE.Mesh(fanGrid(24, 14), mat);
    this.cloth.customDepthMaterial = depth;
    this.cloth.castShadow = true; this.cloth.receiveShadow = true;
    this.cloth.frustumCulled = false; // the shader moves it
    this.cloth.userData.noOutline = true; // inked by the finish pass from depth
    this.tilt.add(this.cloth);

    // frame: thin honey wood (no ink), the leading edges inside cloth sleeves; rebuilt only when the fold changes
    this.frame = new THREE.Mesh(new THREE.BufferGeometry(), toon(d.wood));
    this.sleeves = new THREE.Mesh(new THREE.BufferGeometry(), toon(d.sleeve));
    for (const m of [this.frame, this.sleeves]) { m.castShadow = true; m.userData.noOutline = true; this.tilt.add(m); }
    // ribbons tied round the folded bundle
    this.ties = new THREE.Mesh(new THREE.BufferGeometry(), toon(d.tie));
    this.ties.userData.noOutline = true; this.ties.visible = false;
    this.tilt.add(this.ties);

    // tails: two full streamers off the keel's end, a broad banded ribbon off each tip
    const chord = this.nose.z - this.tail.z;
    const T = d.tails, tp = d.tips;
    const specs: RibbonSpec[] = [
      { root: [0.02, -0.01, this.tail.z + 0.02], length: chord * 1.9, width: 0.17 * f, color: T[0].color, color2: T[0].color2, stripes: T[0].stripes, seed: 0.3 + S, amp: 1, taper: 0.45, notch: 1.2 },
      { root: [-0.03, -0.01, this.tail.z + 0.03], length: chord * 1.45, width: 0.13 * f, color: T[1].color, color2: T[1].color2, stripes: T[1].stripes, seed: 1.1 + S, amp: 1.15, taper: 0.4, notch: 1.2 },
      { root: [this.tip.x, this.tip.y, this.tip.z], length: chord * 1.15, width: 0.14 * f, color: tp.color, color2: tp.color2, stripes: tp.stripes, seed: 2.3 + S, amp: 1.2, taper: 0.35, notch: 1 },
      { root: [-this.tip.x, this.tip.y, this.tip.z], length: chord * 1.1, width: 0.14 * f, color: tp.color, color2: tp.color2, stripes: tp.stripes, seed: 3.1 + S, amp: 1.2, taper: 0.35, notch: 1 },
    ];
    this.ribRoots = specs.map(s => new THREE.Vector3().fromArray(s.root as number[]));
    this.ribbons = ribbonMesh(specs, this.RU, { seg: 32, key: 'wing' }).mesh;
    this.tilt.add(this.ribbons);
    if (opts.windLines !== false) {
      const t = this.tip, n = this.nose;
      const around = [t.clone(), t.clone().setX(-t.x), n.clone().lerp(t, 0.6), n.clone().lerp(t.clone().setX(-t.x), 0.6), this.tail.clone().setY(-0.3), t.clone(), t.clone().setX(-t.x)];
      this.wind = windLines({ count: 22, around, spread: 0.3 * f, length: [1.4, 4.2], span: 14, seed: S * 10 });
      this.wind.mesh.visible = false;
      this.tilt.add(this.wind.mesh);
    }
    this.fold(0);
  }

  /**
   * Put a rider on the wing. `rig` is a Person or a StandInRider (its root is added to the attach point).
   * `scarf`: the long scarf ends that stream from the neck (the hero streamer: wide, frayed, a slow big S).
   * `cape`: a hood or cape cloth that billows back over the shoulders (Nilo).
   */
  setRider(rig: RiderRig, scarf?: RiderStreamer, cape?: RiderStreamer) {
    this.rig = rig;
    // measure the rider standing at rest
    rig.root.position.set(0, 0, 0); rig.root.quaternion.identity(); rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.root);
    const sh = rig.arms[1].sh.getWorldPosition(new THREE.Vector3());
    const hand = rig.arms[1].hand ? rig.arms[1].hand.getWorldPosition(new THREE.Vector3()) : sh.clone().setY(sh.y - 0.45);
    const hip = rig.hips.getWorldPosition(new THREE.Vector3()).y;
    this.m = { hip, shoulder: sh.y, shX: Math.abs(sh.x), height: box.max.y, body: sh.y - hip, arm: sh.distanceTo(hand) };
    this.gripW = Math.abs(sh.x) * 1.3;
    this.rider.add(rig.root);
    this.buildFrame(); // the grips go where this rider's hands are
    if (scarf) {
      const L = scarf.length ?? 2.6, W = scarf.width ?? 0.4;
      const u = ribbonUniforms(); u.uWaveK.value = 2.0; u.uSwing.value = 1.6; u.uFray.value = 0.16;
      const c2 = scarf.color2 ?? scarf.color;
      const mesh = ribbonMesh([
        { root: [0, 0, 0], length: L, width: W, color: scarf.color, color2: c2, stripes: scarf.color2 ? 2 : 0, seed: 0.5, amp: 1.0, taper: 0.35, notch: 0.6 },
        { root: [0.06, -0.04, 0.03], length: L * 0.7, width: W * 0.8, color: scarf.color, seed: 1.9, amp: 1.15, taper: 0.3, notch: 0.6 },
      ], u, { seg: 36, key: 'scarf' }).mesh;
      this.tilt.add(mesh);
      this.streamers.push({ mesh, u, anchor: scarf.anchor, cape: false });
    }
    if (cape) {
      const u = ribbonUniforms(); u.uWaveK.value = 3.2; u.uSwing.value = 0.8; u.uFray.value = 0.08;
      const mesh = ribbonMesh([
        { root: [0, 0, 0], length: cape.length ?? 0.9, width: cape.width ?? 0.42, color: cape.color, seed: 0.5, amp: 0.6, taper: -0.25, notch: 0.5 },
      ], u, { seg: 16, key: 'cape' }).mesh;
      this.tilt.add(mesh);
      this.streamers.push({ mesh, u, anchor: cape.anchor, cape: true });
    }
  }

  /**
   * Fold the wing, 0 open .. 1 a tidy folded bundle shaped like a paper boat: 0..0.45 the leading edges
   * swing back to the keel and the cloth pleats along its seams, 0.22..0.7 the halves stand up in a V,
   * 0.42..0.88 the ends bend up into a hull and it gathers shorter, the ribbons reel in, and 0.8..1 two
   * are tied round it. Standing, the bundle comes down in front of the rider's chest from 0.5.
   */
  fold(k: number) {
    k = clamp(k);
    if (Math.abs(k - this.foldK) < 1e-4) return;
    this.foldK = k;
    this.kA = sstep(0, 0.45, k); this.kB = sstep(0.22, 0.7, k); this.kC = sstep(0.42, 0.88, k); this.kLow = sstep(0.5, 0.95, k);
    (this.U.uFoldK.value as THREE.Vector3).set(this.kA, this.kB, this.kC);
    this.buildFrame();
    // tip ribbons ride on the folding tips; all ribbons reel in
    const g = this.ribbons.geometry, root = g.getAttribute('aRoot') as THREE.BufferAttribute;
    const per = root.count / this.ribRoots.length;
    this.ribRoots.forEach((r0, ri) => {
      const r = this.foldPoint(r0, _v);
      for (let i = 0; i < per; i++) root.setXYZ(ri * per + i, r.x, r.y, r.z);
    });
    root.needsUpdate = true;
    this.RU.uLenK.value = 1 - 0.75 * sstep(0.1, 0.9, k);
    const tie = sstep(0.8, 1, k);
    this.ties.visible = tie > 0.01;
    if (this.ties.visible) this.buildTies(tie);
  }
  get folded() { return Math.max(0, this.foldK); }

  /** Height of the root above the ground when the rider stands under the wing (landing): feet on the ground. */
  get groundHeight() { return this.m.height + 0.2; }

  /** A point of the flat wing (tilt space) moved by the current fold (the same as the cloth shader, without pleats). */
  foldPoint(p: THREE.Vector3, out = new THREE.Vector3()) {
    const n = this.nose, kA = this.kA, kB = this.kB, kC = this.kC;
    if (kA + kB + kC <= 0) return out.copy(p);
    const px = p.x, py = p.y, pz = p.z;
    const rx = px - n.x, rz = pz - n.z, rr = Math.hypot(rx, rz);
    const th = (rr > 1e-5 ? Math.atan2(rx, -rz) : 0) * (1 - 0.76 * kA);
    let x = n.x + rr * Math.sin(th), y = lerp(py, n.y, 0.75 * kA);
    const z0 = n.z - rr * Math.cos(th);
    const ph = Math.sign(px) * kB * 1.35, yy = y - n.y;
    const x2 = x * Math.cos(ph) - yy * Math.sin(ph); y = n.y + x * Math.sin(ph) + yy * Math.cos(ph); x = x2;
    const zr = (z0 - this.boat.x) / this.boat.y;
    y += kC * 0.4 * this.boat.y * zr * zr;
    return out.set(x, y, this.boat.x + (z0 - this.boat.x) * (1 - 0.5 * kC));
  }

  /** The keel and spreader under the sail, the sleeved leading edges, the cross bar on top with its struts, cords and grips. */
  private buildFrame() {
    const wood: THREE.BufferGeometry[] = [], sleeve: THREE.BufferGeometry[] = [];
    const rod = (pts: THREE.Vector3[], r: number, to: THREE.BufferGeometry[], r2 = r, n = 7) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], dir = _w.subVectors(b, a), len = dir.length();
        if (len < 1e-4) continue;
        const k0 = i / (pts.length - 1), k1 = (i + 1) / (pts.length - 1);
        const g = new THREE.CylinderGeometry(lerp(r, r2, k1), lerp(r, r2, k0), len + r * 0.6, n, 1);
        _q.setFromUnitVectors(_up, dir.normalize());
        g.applyQuaternion(_q); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        to.push(g);
      }
    };
    const f = this.f, P = this.P, FP = (x: number, y: number, z: number) => this.foldPoint(new THREE.Vector3(x, y, z), new THREE.Vector3());
    // keel: under the sail from the nose to just past the trailing edge
    const keel: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) { const z = lerp(this.nose.z - 0.02, this.tail.z - 0.05, i / 6); keel.push(FP(0, -0.025, z)); }
    rod(keel, 0.017 * f, wood, 0.012 * f);
    // leading edges, rolled inside a cloth sleeve (shows as a fat hem, not a dowel)
    for (const sx of [1, -1]) {
      const le: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8, [x, z] = fanXZ(P, 1, t, sx); le.push(FP(x, lerp(this.nose.y, this.tip.y, t) + 0.006, z)); }
      rod(le, 0.026 * f, sleeve, 0.016 * f, 8);
      const cap = new THREE.SphereGeometry(0.02 * f, 8, 6); const e = le[le.length - 1]; cap.translate(e.x, e.y, e.z); sleeve.push(cap);
    }
    // the spreader under the sail, leading edge to leading edge
    const v = (this.nose.z - this.spreadZ) / (this.nose.z - this.tip.z);
    const sp: THREE.Vector3[] = [];
    for (let i = 0; i <= 4; i++) { const xx = lerp(-1, 1, i / 4) * this.tip.x * v * 0.97; sp.push(FP(xx, -0.035, this.spreadZ)); }
    rod(sp, 0.012 * f, wood);
    // the cross bar on top, where the rider's hands grip, on two short struts down to the sail
    const bw = 0.62 * f, b = this.bar;
    const bar: THREE.Vector3[] = [];
    for (let i = 0; i <= 4; i++) bar.push(FP(lerp(-bw, bw, i / 4), b.y, b.z));
    rod(bar, 0.014 * f, wood);
    for (const sx of [-1, 1]) {
      rod([FP(sx * bw * 0.72, b.y, b.z), FP(sx * bw * 0.6, 0.02, b.z - 0.08)], 0.008, wood);
      // leather grips
      rod([FP(sx * (this.gripW - 0.02), b.y, b.z), FP(sx * (this.gripW + 0.1), b.y, b.z)], 0.02, sleeve);
      // cords from the bar's ends to the leading edges
      const vb = (this.nose.z - b.z) / (this.nose.z - this.tip.z), [lx, lz] = fanXZ(P, 1, vb, sx);
      rod([FP(sx * bw, b.y, b.z), FP(lx, 0.01, lz)], 0.004, wood);
    }
    const merge = (list: THREE.BufferGeometry[]) => { const g = mergeGeometries(list.map(p => { p.deleteAttribute('uv'); return p; }), false)!; list.forEach(p => p.dispose()); return g; };
    this.frame.geometry.dispose(); this.frame.geometry = merge(wood);
    this.sleeves.geometry.dispose(); this.sleeves.geometry = merge(sleeve);
  }

  /** Two ribbons tied round the folded bundle, each with a bow on top. */
  private buildTies(k: number) {
    const parts: THREE.BufferGeometry[] = [];
    for (const zk of [-0.3, 0.3]) {
      const z = this.boat.x + zk * this.boat.y * 0.75;
      const c = this.foldPoint(new THREE.Vector3(0, 0, z));
      const hull = this.foldPoint(new THREE.Vector3(0.3 * this.f, 0, z)).sub(c);
      const rx = Math.abs(hull.x) + 0.04, ry = Math.max(0.1, hull.y * 0.5 + 0.04);
      const g = new THREE.TorusGeometry(1, 0.1, 5, 20);
      g.scale(rx * k, ry * k, 0.3); g.translate(c.x, c.y + ry * 0.55, c.z);
      parts.push(g);
      for (const s of [-1, 1]) { const b = new THREE.ConeGeometry(0.05, 0.12, 4); b.rotateZ(s * Math.PI / 2); b.scale(k, k, k); b.translate(c.x + s * 0.06, c.y + ry * 1.55, c.z); parts.push(b); }
    }
    this.ties.geometry.dispose();
    this.ties.geometry = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p; }), false)!;
    parts.forEach(p => p.dispose());
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
    m.upright = lerp(m.upright, clamp(s.upright ?? 0), 1 - Math.exp(-6 * dt));
    const sp = clamp(m.speed / 25), dv = m.dive, up = m.upright, low = this.kLow * up;
    // turbulence: a slow wander and a quicker shiver, more at speed
    const tb = 0.02 + sp * 0.02 + dv * 0.03;
    const air = 1 - up;
    _e.set(-(m.pitch - dv * 0.75) + Math.sin(t * 1.7) * tb * 0.5 * air, Math.sin(t * 0.9) * tb * 0.3 * air,
      m.bank * (1 - up * 0.8) + (Math.sin(t * 1.3 + 1) * tb + Math.sin(t * 5.3) * tb * 0.25 * (sp + dv)) * air);
    this.tilt.quaternion.setFromEuler(_e).slerp(CARRY, low);
    // the wing turns about the point the hands hold: the bar in flight, the bundle when it is carried
    const hold = this.holdLocal(_u);
    const holdRoot = this.holdRoot(_w);
    _v.copy(hold).applyQuaternion(this.tilt.quaternion);
    this.tilt.position.copy(holdRoot).sub(_v)
      .add(_v.set(Math.sin(t * 0.7 + this.span) * 0.05, Math.sin(t * 1.1) * 0.08 + Math.sin(t * 2.9) * 0.02, 0).multiplyScalar(air));

    // cloth: fuller and snappier with speed; a dive makes the trailing edge crack like a flag
    const om = 7 + m.speed * 0.5 + dv * 18;
    this.phase += dt * om;
    const paper = this.def.paper ? 0.5 : 1;
    const open = 1 - this.kA;
    this.U.uPhase.value = this.phase;
    this.U.uFlut.value = (0.022 + sp * 0.03 + dv * 0.05) * open * this.f * paper;
    this.U.uBillow.value = (this.def.paper ? 0.05 : 0.1 + sp * 0.08 - dv * 0.02) * (1 - up * 0.4) * open * this.f;

    // ribbons trail along the airflow (back along the flight path); they hang only when slow
    this.rphase += dt * (4 + m.speed * 0.45 + dv * 10);
    const divePitch = clamp(dv * 0.75 + Math.max(0, -m.pitch), 0, 1.4);
    const inv = _q2.copy(this.tilt.quaternion).invert();
    const flow = _v.set(0, Math.sin(divePitch), -Math.cos(divePitch)).applyQuaternion(inv);
    const sag = 0.05 + (1 - sp) * (1 - sp) * 1.8 + up * 0.8;
    this.RU.uFlow.value.copy(flow);
    this.RU.uDroop.value.set(0, -1, 0).applyQuaternion(inv).multiplyScalar(sag);
    this.RU.uPhase.value = this.rphase;
    this.RU.uAmp.value = (0.35 + (1 - sp) * 0.9 + dv * 0.1) * (1 - this.kA * 0.7);
    if (this.wind) {
      const amt = clamp((dv - 0.3) / 0.5) * 0.85 + clamp((m.speed - 28) / 10) * 0.25;
      this.wind.uniforms.uAmt.value = amt;
      this.wind.uniforms.uTime.value = t;
      this.wind.uniforms.uSpeed.value = 16 + m.speed * 0.7;
      this.wind.mesh.visible = amt > 0.01;
    }

    // rider: prone on top of the sail along the keel; upright (landing) under the wing, then carrying it
    const rig = this.rig;
    if (rig) {
      const M = this.m;
      // prone (tilt space): the hip axis a hand's width above the keel, shoulders an arm's reach behind the bar
      const hipZ = this.bar.z - M.arm * 0.82 - M.body * 1.02;
      const prone = _h.set(-m.bank * 0.06, 0.1 - M.hip, hipZ).applyQuaternion(this.tilt.quaternion).add(this.tilt.position);
      // standing (root space): feet on the ground under the spreader
      const stand = _u.set(0, -this.groundHeight, this.standZ());
      prone.lerp(stand, up).sub(this.tilt.position);
      _q.copy(this.tilt.quaternion).invert();
      this.rider.position.copy(prone.applyQuaternion(_q));
      this.rider.quaternion.identity().slerp(_q, up);
      // a StandInRider poses its own stand / run; a Person is animated by its owner before update()
      const anyRig = rig as RiderRig & { update?: (dt: number, sp: number) => void; flutter?: (t: number, w: number, k: number) => void };
      anyRig.update?.(dt, s.run ?? 0);
      glidePose(rig, { k: 1 - up, bank: m.bank, dive: dv, wind: 0.3 + sp * 0.7, t });
      if (up > 0.01) this.armsUpright(rig, up, s.run ?? 0, t);
      // both hands on the bar (or under the spreader, or on the folded bundle), wherever it is
      this.root.updateMatrixWorld(true);
      for (let i = 0; i < 2; i++) {
        this.gripPoint(i, _u);
        this.tilt.localToWorld(_u);
        reachArm(rig, i, _u, 1);
      }
      anyRig.flutter?.(t, 0.3 + sp * 0.7 + dv * 0.5, 1 - up);
    }
    if (this.streamers.length) {
      // the scarf ends (and the cape) leave the rider and stream back on the wind; the scarf lifts a little
      this.tilt.updateMatrixWorld(true);
      for (const st of this.streamers) {
        const p = st.anchor.getWorldPosition(_w);
        this.tilt.worldToLocal(p);
        st.mesh.position.copy(p);
        st.u.uFlow.value.copy(this.RU.uFlow.value);
        if (st.cape) st.u.uDroop.value.set(0, -1, 0).applyQuaternion(inv).multiplyScalar(0.15 + sag * 0.6);
        else st.u.uDroop.value.set(0, 1, 0).applyQuaternion(inv).multiplyScalar(-0.05 - sag * 0.4);
        st.u.uPhase.value = this.rphase * (st.cape ? 1.4 : 0.55) + 0.4;
        st.u.uAmp.value = (st.cape ? 0.5 : 0.7) + (1 - sp) * 0.5 + dv * 0.2;
        st.u.uLenK.value = 1 - 0.5 * low;
      }
    }
  }

  /** z (root space) where the rider stands when upright. */
  private standZ() { return this.spreadZ - 0.18 * this.f; }
  /** The point the hands hold, in tilt space: the bar, sliding to the bundle as it is folded and carried. */
  private holdLocal(out: THREE.Vector3) {
    const c = this.foldPoint(_h.set(0, 0.02, this.boat.x), _h);
    return out.copy(this.bar).lerp(c, this.kLow * this.sm.upright);
  }
  /** Where that point goes in root space: the bar stays put in flight; folded and standing, the bundle rests in front of the chest. */
  private holdRoot(out: THREE.Vector3) {
    const M = this.m, feet = -this.groundHeight;
    out.set(0, feet + M.shoulder - 0.4, this.standZ() + 0.38);
    return out.lerp(this.bar, 1 - this.kLow * this.sm.upright);
  }
  /** Hand i's grip (tilt space): on the cross bar in flight, under the spreader standing, round the bundle carried. */
  private gripPoint(i: number, out: THREE.Vector3) {
    const s = i === 0 ? -1 : 1, up = this.sm.upright;
    out.set(s * (this.gripW + 0.04), this.bar.y, this.bar.z);
    _h.set(s * this.gripW, -0.07, this.spreadZ);
    out.lerp(_h, sstep(0.25, 0.75, up));
    this.foldPoint(out, out);
    // carrying: hands under the hull's two ends (the bundle lies crosswise, so its length is along z here)
    const c = this.foldPoint(_h.set(0, 0, this.boat.x + s * 0.4), _h);
    return out.lerp(c, this.kLow * up);
  }

  /** Landing: standing (or running) under the wing, arms up; elbows in when carrying the bundle. */
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
    // wound so the front face is the top of the sail (+Y), split along the diagonal that runs out from the keel
    if (i < nu) idx.push(a, b, c, b, d, c); else idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
  return g;
}
