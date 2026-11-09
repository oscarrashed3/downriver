// The kite-wings of the Sky Isles race: hang-glider diamonds of cloth on a light wooden frame, ridden lying
// flat on top, hands on the bar. Each racer's wing has its own cloth: Zephy's red and orange harlequin,
// Lark's yellow and green, Gran Wren's blue and white checks, and Nilo's own, made from Fold (the paper boat,
// a folded letter with its old handwriting still on it) patched out with sailcloth.
//
// The cloth is one grid shaped entirely in the vertex shader (see kiteCloth.ts): it billows between the
// spars, the trailing edge flutters in scallops between the battens, and the faster you go (and the steeper
// you dive) the faster it snaps. Long ribbon tails stream from the keel and the wing tips. In a steep dive,
// wind lines rush past. fold(k) swings the leading edges back to the keel and gathers the cloth in pleats,
// so the world can turn the folded wing back into Fold.
//
// Hierarchy: root (the world places and heads it, nose along +Z) > tilt (bank and pitch, a little turbulence)
// > frame, cloth, ribbons, rider (attach point: the rider's hips; see kiteRider.ts glidePose).
//
// Cost per wing: cloth 960 triangles (1 draw), frame about 1.1k triangles (1 draw + ink), ribbons
// 5 x 36 quads (1 draw), scarf ends (1 draw), wind lines (1 draw, only drawn while diving). Plus the rider.
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
  /** 0..1 how upright the rider is (landing: 0 lying flat, 1 standing and running under the wing). */
  upright?: number;
  /** Running speed in m/s while upright (landing run). */
  run?: number;
}

interface PatternDef { mode: number; a: string; b: string; c: string; hem: string; wood: string; ribbons: { color: string; color2?: string; stripes?: number }[] }
const PATTERNS: Record<WingPattern, PatternDef> = {
  zephy: { mode: 0, a: '#dc4a36', b: '#f2903a', c: '#f6e8cc', hem: '#9a2e26', wood: '#a8743e',
    ribbons: [{ color: '#dc4a36', color2: '#f6e8cc', stripes: 6 }, { color: '#f2903a' }, { color: '#f4c24a' }, { color: '#dc4a36' }, { color: '#f2903a' }] },
  lark: { mode: 0, a: '#f4c440', b: '#8ec46a', c: '#f8eed6', hem: '#b0862a', wood: '#b8844a',
    ribbons: [{ color: '#f4c440', color2: '#f8eed6', stripes: 5 }, { color: '#8ec46a' }, { color: '#f08a3a' }, { color: '#f4c440' }, { color: '#8ec46a' }] },
  wren: { mode: 1, a: '#3f72c4', b: '#f6f4ec', c: '#9cc4ec', hem: '#2a4c8c', wood: '#9a6a3a',
    ribbons: [{ color: '#3f72c4', color2: '#f6f4ec', stripes: 7 }, { color: '#9cc4ec' }, { color: '#f6f4ec' }, { color: '#3f72c4' }, { color: '#9cc4ec' }] },
  nilo: { mode: 2, a: '#f7f0e0', b: '#e2cc9e', c: '#c9a878', hem: '#a8865a', wood: '#c8a46c',
    ribbons: [{ color: '#f6eedc', color2: '#e6d4b0', stripes: 4 }, { color: '#e8d8b4' }, { color: '#3a4470' }, { color: '#f6eedc' }, { color: '#e8d8b4' }] },
};

// ---------------------------------------------------------------- cloth shader

const CLOTH_VERT = /* glsl */ `
  uniform vec3 uNose, uTail, uTip;
  uniform float uBillow, uFlut, uPhase, uFold, uScallop, uBat, uLeBow;
  varying vec2 vC; varying float vCrease;
  // the flat sail at cloth coordinate c (x: -1 left tip .. 1 right tip, y: 0 leading edge .. 1 trailing edge)
  vec3 sail(vec2 c) {
    float a = abs(c.x), sx = c.x < 0.0 ? -1.0 : 1.0;
    vec3 tip = vec3(uTip.x * sx, uTip.y, uTip.z);
    vec3 le = mix(uNose, tip, a);
    le.y += uLeBow * sin(3.14159 * a);  // the leading edge spars bow up like a drawn bow
    vec3 te = mix(uTail, tip, a);
    // the trailing edge pulls in between the battens (scallops)
    float sc = sin(fract(a * uBat) * 3.14159) * (1.0 - a * 0.4);
    te.z += uScallop * sc * (1.0 - uFold);
    vec3 p = mix(le, te, c.y);
    // billow: the sail fills between the keel, the leading edge and the tips
    float fill = sin(3.14159 * a) * sin(3.14159 * c.y * 0.62) * (1.0 - uFold * 0.8);
    p.y += uBillow * fill * (0.75 + 0.25 * sin(uPhase * 0.23 + a * 3.0));
    // ripples running back through the cloth, and the trailing edge flutter
    float tr = smoothstep(0.45, 1.0, c.y);
    float w1 = sin(a * 15.0 - uPhase + c.y * 5.0), w2 = sin(a * 26.0 + uPhase * 1.63 + c.y * 3.0);
    float fl = uFlut * (0.35 + 0.65 * sin(3.14159 * a)) * (tr * tr + 0.12 * c.y);
    p.y += fl * (w1 * 0.7 + w2 * 0.3);
    p.z += fl * 0.35 * w2;
    // folding: the cloth gathers in pleats against the keel
    p.y += uFold * 0.06 * sin(a * 18.85) * (0.4 + c.y);
    p.y += uFold * 0.1 * a;
    return p;
  }
  void shape(out vec3 P, out vec3 N) {
    vec2 c = uv;
    P = sail(c);
    vec3 du = sail(c + vec2(0.01, 0.0)) - P;
    vec3 dv = sail(c + vec2(0.0, 0.01)) - P;
    N = normalize(cross(du, dv));
    vC = c;
  }
`;

const CLOTH_FRAG_PARS = /* glsl */ `
  varying vec2 vC;
  uniform vec3 uColA, uColB, uColC, uHem; uniform float uMode, uBat;
  float lineAt(float x, float w) { float d = abs(fract(x + 0.5) - 0.5); return 1.0 - smoothstep(w * 0.5, w, d); }
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;
const CLOTH_FRAG = /* glsl */ `
  {
    vec2 c = vC; float a = abs(c.x);
    vec3 col = uColA; float seam = 0.0; float shade = 1.0;
    if (uMode < 0.5) {
      // harlequin: big diamonds across the sail, three colours
      vec2 q = vec2(c.x * 2.6, c.y * 2.2 + 0.25);
      float d1 = q.x + q.y, d2 = q.x - q.y;
      vec2 cell = floor(vec2(d1, d2));
      float par = mod(cell.x + cell.y, 2.0);
      col = par < 0.5 ? uColA : uColB;
      if (mod(cell.x * 2.0 + cell.y, 5.0) < 1.0) col = uColC;
      seam = max(lineAt(d1, 0.035), lineAt(d2, 0.035));
    } else if (uMode < 1.5) {
      // checks: blue and white squares laid on the diagonal, a blue band down the keel
      vec2 q = vec2(c.x * 4.0, c.y * 3.2);
      float d1 = q.x + q.y, d2 = q.x - q.y;
      vec2 cell = floor(vec2(d1, d2));
      col = mod(cell.x + cell.y, 2.0) < 0.5 ? uColA : uColB;
      if (a < 0.1) col = uColA;
      else if (a < 0.14) col = uColC;
      seam = max(lineAt(d1, 0.03), lineAt(d2, 0.03));
    } else {
      // Fold: the old letter in the middle (faint handwriting, crisp creases), sailcloth patches outboard
      col = uColA;
      // creases: from the nose out to the trailing edge, and across, each fold lit a little differently
      float f1 = c.x * 3.0, f2 = c.x * 1.6 + c.y * 2.2, f3 = c.x * 1.6 - c.y * 2.2;
      shade = 1.0 + 0.08 * (step(0.5, fract(f1)) - 0.5) + 0.06 * (step(0.5, fract(f2 * 0.5)) - 0.5) - 0.05 * (step(0.5, fract(f3 * 0.5)) - 0.5);
      seam = max(lineAt(f1, 0.014), max(lineAt(f2 * 0.5, 0.012), lineAt(f3 * 0.5, 0.012))) * 0.55;
      // the letter's lines of writing, faded
      if (a < 0.42 && c.y > 0.12 && c.y < 0.78) {
        float ln = fract(c.y * 16.0);
        float word = step(0.32, h21(vec2(floor(c.x * 30.0), floor(c.y * 16.0))));
        float ink = (1.0 - smoothstep(0.04, 0.12, abs(ln - 0.5))) * word * (0.6 + 0.4 * sin(c.x * 160.0 + c.y * 40.0));
        col = mix(col, vec3(0.36, 0.4, 0.58), ink * 0.45);
      }
      // sailcloth patches, stitched on
      if (a > 0.46) {
        vec2 q = vec2(a * 3.0, c.y * 2.0 + floor(a * 3.0) * 0.5);
        vec2 cell = floor(q);
        col = mod(cell.x + cell.y, 2.0) < 0.5 ? uColB : mix(uColB, uColC, 0.5);
        if (h21(cell) > 0.82) col = uColC;
        seam = max(seam, max(lineAt(q.x, 0.035), lineAt(q.y, 0.035)));
        float stitch = step(0.5, fract((c.x + c.y) * 90.0));
        seam = max(seam, (max(lineAt(q.x + 0.06, 0.012), lineAt(q.y + 0.06, 0.012))) * stitch * 0.8);
      }
      if (abs(a - 0.46) < 0.012) seam = 1.0;
    }
    // batten pockets, chordwise
    float bat = lineAt(a * uBat, 0.018 * uBat) * step(0.06, c.y) * step(c.y, 0.9) * step(0.05, a);
    col *= 1.0 - bat * 0.16;
    col = mix(col, col * 0.7, seam * 0.75);
    // the hem: a bound edge along the leading edge (wrapped round the spar) and the trailing edge
    float hemL = 1.0 - smoothstep(0.035, 0.05, c.y);
    float hemT = smoothstep(0.955, 0.97, c.y);
    float hemS = smoothstep(0.965, 0.98, a);
    col = mix(col, uHem, max(hemL, max(hemT * 0.85, hemS)));
    diffuseColor.rgb = col * shade;
  }
`;

// ---------------------------------------------------------------- the wing

export interface KiteWingOpts {
  pattern: WingPattern;
  /** Wing span in metres (3.2 .. 4). */
  span?: number;
  /** Ribbon tails (default 5: three from the keel, one from each tip). */
  ribbons?: number;
  /** Draw wind lines in a dive (default true). */
  windLines?: boolean;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);

export class KiteWing {
  /** Place and head this in the world: nose along +Z, up +Y. */
  root = new THREE.Group();
  /** Bank and pitch (and turbulence) live here; everything else hangs off it. */
  tilt = new THREE.Group();
  /** Attach point for the rider: the rider's root goes here (hips at its origin when lying flat). */
  rider = new THREE.Group();
  readonly span: number;
  readonly pattern: WingPattern;
  /** The geometry key points (in tilt space, unfolded). */
  readonly nose: THREE.Vector3; readonly tail: THREE.Vector3; readonly tip: THREE.Vector3;
  /** Where the hands grip the bar (tilt space). */
  readonly bar: THREE.Vector3;
  private cloth: THREE.Mesh;
  private frame: THREE.Mesh;
  private frameMat: THREE.MeshToonMaterial;
  private U: Record<string, THREE.IUniform>;
  private ribbons: THREE.Mesh;
  private RU = ribbonUniforms();
  private scarf: { mesh: THREE.Mesh; u: ReturnType<typeof ribbonUniforms>; anchor: THREE.Object3D } | null = null;
  private wind: ReturnType<typeof windLines> | null = null;
  private foldK = -1;
  private foldTip = new THREE.Vector3();
  private rig: RiderRig | null = null;
  private riderH = 0;
  /** Half the distance between the hands on the bar. */
  private gripW = 0.2;
  /** Standing with both hands up on the bar: from the bar down to the feet. */
  private standDrop = 1.6;
  private sm = { bank: 0, pitch: 0, dive: 0, speed: 14, upright: 0, bankV: 0, pitchV: 0 };
  private phase = 0; private rphase = 0;
  private def: PatternDef;

  constructor(opts: KiteWingOpts) {
    const S = this.span = opts.span ?? 3.6;
    this.pattern = opts.pattern;
    const d = this.def = PATTERNS[opts.pattern];
    // a wide swept diamond: span about 2.5 x the chord at the keel, tips drooping a little
    // swept back like a swift: the tips trail behind the keel's end, so the trailing edge curves in
    this.nose = new THREE.Vector3(0, 0.06, 0.36 * S);
    this.tail = new THREE.Vector3(0, 0, -0.13 * S);
    this.tip = new THREE.Vector3(0.5 * S, -0.05, -0.24 * S);
    this.bar = new THREE.Vector3(0, 0.3, 0.16 * S);
    this.root.add(this.tilt);
    this.tilt.add(this.rider);

    // cloth: one grid, shaped in the shader
    this.U = {
      uNose: { value: this.nose.clone() }, uTail: { value: this.tail.clone() }, uTip: { value: this.tip.clone() },
      uBillow: { value: 0.12 * S / 3.6 }, uFlut: { value: 0.03 }, uPhase: { value: 0 }, uFold: { value: 0 },
      uScallop: { value: 0.07 * S / 3.6 }, uBat: { value: 4 }, uLeBow: { value: 0.13 * S / 3.6 },
      uColA: { value: new THREE.Color(d.a) }, uColB: { value: new THREE.Color(d.b) }, uColC: { value: new THREE.Color(d.c) },
      uHem: { value: new THREE.Color(d.hem) }, uMode: { value: d.mode },
    };
    const { mat, depth } = shapedToon({ key: 'kitewing', uniforms: this.U, vertex: CLOTH_VERT, fragPars: CLOTH_FRAG_PARS, fragColor: CLOTH_FRAG,
      translucency: d.mode === 2 ? 0.5 : 0.42, variation: 0.35, rim: 0.9 });
    this.cloth = new THREE.Mesh(clothGrid(24, 10), mat);
    this.cloth.customDepthMaterial = depth;
    this.cloth.castShadow = true; this.cloth.receiveShadow = false;
    this.cloth.frustumCulled = false; // the shader moves it; the root's own bound is small enough to not bother
    this.cloth.userData.noOutline = true; // inked by the finish pass from depth
    this.tilt.add(this.cloth);

    // frame: rebuilt only when the fold changes
    this.frameMat = toon(d.wood);
    this.frame = new THREE.Mesh(new THREE.BufferGeometry(), this.frameMat);
    this.frame.castShadow = true;
    this.tilt.add(this.frame);
    this.buildFrame(0);
    addOutlines(this.frame, '#3a2a2e', 0.007);

    // ribbons: three from the tail of the keel, one from each wing tip
    const n = opts.ribbons ?? 5;
    const specs: RibbonSpec[] = [];
    const lens = [S * 1.5, S * 1.15, S * 0.95, S * 0.85, S * 0.85];
    for (let i = 0; i < n; i++) {
      const r = d.ribbons[i % d.ribbons.length];
      const atTip = i >= 3;
      const root = atTip ? [this.tip.x * (i === 3 ? 1 : -1), this.tip.y, this.tip.z - 0.05] as [number, number, number] : [(i - 1) * 0.05, -0.02, this.tail.z - 0.02] as [number, number, number];
      specs.push({ root, length: lens[i % lens.length], width: atTip ? 0.12 : 0.18 - i * 0.02, color: r.color, color2: r.color2, stripes: r.stripes, seed: i * 0.71 + S, amp: atTip ? 0.8 : 1 });
    }
    this.ribbons = ribbonMesh(specs, this.RU, { seg: 36, key: 'wing' }).mesh;
    this.tilt.add(this.ribbons);
    if (opts.windLines !== false) {
      this.wind = windLines({ count: 44, radius: [0.6, S * 0.9], span: 16, seed: S * 10 });
      this.wind.mesh.visible = false;
      this.tilt.add(this.wind.mesh);
    }
    this.fold(0);
  }

  /**
   * Put a rider on the wing. `rig` is a Person or a StandInRider (its root is added to the attach point).
   * `scarf` gives long scarf ends that stream from the rider's neck: the anchor is a joint on the rider
   * (it is followed every frame), colour and length.
   */
  setRider(rig: RiderRig, scarf?: { anchor: THREE.Object3D; color: string; length?: number }) {
    this.rig = rig;
    this.riderH = rig.hipY * rig.H;
    this.standDrop = rig.H * (rig.hipY + 0.95);
    this.rider.add(rig.root);
    if (scarf) {
      const L = scarf.length ?? 1.5;
      const u = ribbonUniforms(); u.uWaveK.value = 2.4;
      const mesh = ribbonMesh([
        { root: [0, 0, 0], length: L, width: 0.15, color: scarf.color, seed: 0.3, amp: 1.2 },
        { root: [0.05, -0.03, 0.02], length: L * 0.72, width: 0.13, color: scarf.color, seed: 1.9, amp: 1.4 },
      ], u, { seg: 24, key: 'scarf' }).mesh;
      this.tilt.add(mesh);
      this.scarf = { mesh, u, anchor: scarf.anchor };
    }
  }

  /** Fold the wing: 0 open, 1 the leading edges swept back along the keel, the cloth gathered. */
  fold(k: number) {
    k = clamp(k);
    if (Math.abs(k - this.foldK) < 1e-4) return;
    this.foldK = k;
    this.foldTipAt(k, this.foldTip);
    (this.U.uTip.value as THREE.Vector3).copy(this.foldTip);
    this.U.uFold.value = k;
    this.buildFrame(k);
    // tip ribbons ride on the folding tips
    const g = this.ribbons.geometry, root = g.getAttribute('aRoot') as THREE.BufferAttribute;
    const per = KiteWing.RIB_VERTS, n = root.count / per;
    for (let i = 3; i < n; i++) {
      const s = i === 3 ? 1 : -1;
      for (let j = 0; j < per; j++) root.setXYZ(i * per + j, this.foldTip.x * s, this.foldTip.y, this.foldTip.z - 0.05);
    }
    root.needsUpdate = true;
  }
  get folded() { return Math.max(0, this.foldK); }
  /** Landing: how high the root sits above the ground while the rider stands under the bar (upright = 1). */
  get groundHeight() { return this.standDrop - this.bar.y; }

  /** Vertices per ribbon strip (36 segments, two sides). */
  private static RIB_VERTS = 74;

  /** The right wing tip with the wing folded by k (the left mirrors it). */
  foldTipAt(k: number, out = new THREE.Vector3()) {
    const n = this.nose, t = this.tip;
    const dx = t.x, dz = t.z - n.z;
    const len = Math.hypot(dx, dz), a0 = Math.atan2(dx, -dz);
    const a = a0 * (1 - k * 0.93);
    return out.set(Math.sin(a) * len, lerp(t.y, 0.12, k), n.z - Math.cos(a) * len);
  }

  /** Spars, lashings and the bar, merged into one mesh. */
  private buildFrame(k: number) {
    const parts: THREE.BufferGeometry[] = [];
    const spar = (a: THREE.Vector3, b: THREE.Vector3, r: number, over = 0) => {
      const dir = _v.subVectors(b, a); const len = dir.length() + over * 2;
      const g = new THREE.CylinderGeometry(r * 0.85, r, len, 7, 1);
      _q.setFromUnitVectors(_up, dir.normalize());
      g.applyQuaternion(_q); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      parts.push(g);
    };
    const knot = (p: THREE.Vector3, r: number) => { const g = new THREE.SphereGeometry(r, 8, 6); g.translate(p.x, p.y, p.z); parts.push(g); };
    const S = this.span, tip = this.foldTipAt(k, new THREE.Vector3());
    const tipL = tip.clone().setX(-tip.x);
    const r = 0.019 * S / 3.6;
    // keel and leading edges, a little proud of the cloth
    spar(this.nose.clone().setY(0.01), this.tail.clone().setY(-0.01), r * 1.15, 0.06);
    // the leading edges follow the same bow as the cloth's edge, in four pieces each
    const bow = this.U.uLeBow.value as number;
    const leAt = (t: THREE.Vector3, a: number) => this.nose.clone().lerp(t, a).add(new THREE.Vector3(0, bow * Math.sin(Math.PI * a), 0));
    for (const t of [tip, tipL]) for (let i = 0; i < 4; i++) spar(leAt(t, i / 4), leAt(t, (i + 1) / 4), r * (1 - i * 0.06), i === 3 ? 0.05 : 0.004);
    // the cross bar under the sail, from leading edge to leading edge, through a hub on the keel
    const hub = new THREE.Vector3(0, -0.07, this.nose.z * 0.25 + this.tail.z * 0.1);
    const leR = this.nose.clone().lerp(tip, 0.62).add(new THREE.Vector3(0, (this.U.uLeBow.value as number) * Math.sin(Math.PI * 0.62) - 0.03, 0));
    const leL = leR.clone().setX(-leR.x);
    spar(hub, leR, r * 0.9); spar(hub, leL, r * 0.9);
    knot(hub, r * 2.2);
    // the hand bar on two struts, in front of the rider
    const bar = this.bar, bw = 0.36;
    spar(new THREE.Vector3(-bw, bar.y, bar.z), new THREE.Vector3(bw, bar.y, bar.z), r * 0.9, 0.04);
    for (const s of [-1, 1]) spar(new THREE.Vector3(s * bw * 0.85, bar.y, bar.z), new THREE.Vector3(s * 0.03, 0.02, bar.z - 0.12), r * 0.75);
    // lashings at the joints, and caps on the spar ends
    knot(this.nose, r * 1.9); knot(this.tail, r * 1.6); knot(tip, r * 1.6); knot(tipL, r * 1.6);
    knot(leR, r * 1.5); knot(leL, r * 1.5);
    for (const s of [-1, 1]) knot(new THREE.Vector3(s * bw * 0.85, bar.y, bar.z), r * 1.3);
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
    m.upright = lerp(m.upright, clamp(s.upright ?? 0), 1 - Math.exp(-5 * dt));
    const sp = clamp(m.speed / 25), dv = m.dive, up = m.upright;
    // turbulence: a slow wander and a quicker shiver, more at speed
    const tb = 0.02 + sp * 0.02 + dv * 0.03;
    const air = 1 - up;
    this.tilt.rotation.set(-(m.pitch - dv * 0.75) + Math.sin(t * 1.7) * tb * 0.5 * air, Math.sin(t * 0.9) * tb * 0.3 * air,
      m.bank + (Math.sin(t * 1.3 + 1) * tb + Math.sin(t * 5.3) * tb * 0.25 * (sp + dv)) * air);
    // the wing turns about the bar (the rider's hands), and bobs a little in flight
    _v.copy(this.bar).applyQuaternion(this.tilt.quaternion);
    this.tilt.position.copy(this.bar).sub(_v)
      .add(_w.set(Math.sin(t * 0.7 + this.span) * 0.05, Math.sin(t * 1.1) * 0.08 + Math.sin(t * 2.9) * 0.02, 0).multiplyScalar(air));

    // cloth: fuller and snappier with speed; a dive makes the trailing edge crack like a flag
    const om = 7 + m.speed * 0.5 + dv * 18;
    this.phase += dt * om;
    this.U.uPhase.value = this.phase;
    this.U.uFlut.value = (0.025 + sp * 0.04 + dv * 0.06) * (1 - this.folded * 0.7) * this.span / 3.6;
    this.U.uBillow.value = (0.13 + sp * 0.1 - dv * 0.03) * (1 - up * 0.3) * this.span / 3.6;
    // ribbons: they stretch out straight at speed and flick faster; droop when slow or folded
    this.rphase += dt * (4.5 + m.speed * 0.32 + dv * 8);
    this.RU.uPhase.value = this.rphase;
    this.RU.uAmp.value = 1.3 - sp * 0.45 + dv * 0.25;
    (this.RU.uDroop.value as THREE.Vector3).set(0, -0.05 - (1 - sp) * 0.25 - up * 0.3, 0);
    if (this.wind) {
      const amt = clamp((dv - 0.25) / 0.5) * 0.9 + clamp((m.speed - 26) / 10) * 0.3;
      this.wind.uniforms.uAmt.value = amt;
      this.wind.uniforms.uTime.value = t;
      this.wind.uniforms.uSpeed.value = 18 + m.speed * 0.8;
      this.wind.mesh.visible = amt > 0.01;
    }

    // rider: lying on the keel, weight shifted to the low wing; upright (landing) hangs below the bar
    const rig = this.rig;
    if (rig) {
      // lying on the wing (tilt space), or standing on the ground under the bar (root space, upright)
      const deck = 0.1 + this.riderH * 0.17;
      const prone = _v.set(-m.bank * 0.12, deck - this.riderH, -0.03 * this.span).applyQuaternion(this.tilt.quaternion).add(this.tilt.position);
      const stand = _w.set(0, this.bar.y - this.standDrop, this.bar.z - 0.22);
      prone.lerp(stand, up).sub(this.tilt.position);
      _q.copy(this.tilt.quaternion).invert();
      this.rider.position.copy(prone.applyQuaternion(_q));
      this.rider.quaternion.identity().slerp(_q, up);
      // a StandInRider poses its own stand / run; a Person is animated by its owner before update()
      const anyRig = rig as RiderRig & { update?: (dt: number, sp: number) => void; flutter?: (t: number, w: number, k: number) => void };
      anyRig.update?.(dt, s.run ?? 0);
      glidePose(rig, { k: 1 - up, bank: m.bank, dive: dv, wind: 0.3 + sp * 0.7, t });
      if (up > 0.01) this.holdBarUpright(rig, up, s.run ?? 0, t);
      // both hands on the bar, wherever it is
      this.root.updateMatrixWorld(true);
      for (let i = 0; i < 2; i++) {
        const g = _w.set((i === 0 ? -1 : 1) * this.gripW, this.bar.y, this.bar.z);
        this.tilt.localToWorld(g);
        reachArm(rig, i, g, 1);
      }
      anyRig.flutter?.(t, 0.3 + sp * 0.7 + dv * 0.5, 1 - up);
    }
    if (this.scarf) {
      // the scarf ends leave the neck and stream back along the wing
      this.tilt.updateMatrixWorld(true);
      const p = this.scarf.anchor.getWorldPosition(_w);
      this.tilt.worldToLocal(p);
      this.scarf.mesh.position.copy(p);
      this.scarf.mesh.rotation.set(lerp(0.12, 1.2, up), 0, 0);
      this.scarf.u.uPhase.value = this.rphase * 1.5 + 0.4;
      this.scarf.u.uAmp.value = 1.25 - sp * 0.3 + dv * 0.35;
      (this.scarf.u.uDroop.value as THREE.Vector3).set(0, -0.03 - (1 - sp) * 0.2, 0);
    }
  }

  /** Landing: standing (or running) under the wing, both hands up on the bar. */
  private holdBarUpright(r: RiderRig, up: number, run: number, t: number) {
    const k = up;
    for (let i = 0; i < 2; i++) {
      const A = r.arms[i], s = i === 0 ? -1 : 1;
      A.sh.rotation.x = lerp(A.sh.rotation.x, -2.75 + Math.sin(t * 9 + i) * 0.04 * run, k);
      A.sh.rotation.z = lerp(A.sh.rotation.z, s * 0.35, k);
      A.el.rotation.x = lerp(A.el.rotation.x, -0.35, k);
    }
    r.head.rotation.x = lerp(r.head.rotation.x, -0.15, k);
  }

  dispose() {
    this.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.isOutline) m.geometry.dispose(); });
  }
}

/** The sail grid: uv.x from -1 (left tip) to 1 (right tip), uv.y from 0 (leading edge) to 1 (trailing edge). */
function clothGrid(nu: number, nv: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const cols = nu * 2 + 1;
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) {
    // denser near the keel and the trailing edge, where the cloth moves most
    const x = (i - nu) / nu, v = j / nv;
    pos.push(0, 0, 0);
    uv.push(Math.sign(x) * Math.pow(Math.abs(x), 1.15), 1 - Math.pow(1 - v, 1.2));
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < cols - 1; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c); // wound so the front face is the top of the sail
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
  return g;
}
