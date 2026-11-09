// Shared cloth for the Sky Isles kites: toon materials whose shape is computed in the vertex shader
// (so a whole sail or a bundle of ribbons ripples for the cost of one draw call and no CPU work),
// the streaming ribbons, the wind lines that rush past a diving kite-wing, and kite strings.
//
// Every cloth material is the game's MeshToonMaterial with softRamp() and paint() (painted ambient, rim,
// noise variation), plus three things of its own:
//  - a GLSL `shape(out P, out N)` that builds the vertex from its attributes and the uniforms,
//  - an optional GLSL colour block that paints the cloth's pattern into diffuseColor,
//  - light shining through: the side of the cloth turned away from the sun glows a little with its own
//    colour, the way a kite looks from below against a bright sky.
// A matching depth material carries the same shape into the shadow map.
import * as THREE from 'three';
import { paint, softRamp, PAINT, NOISE_GLSL } from '../../render/paint';

export interface ShapedOpts {
  /** Unique name for the shader program cache. */
  key: string;
  color?: string;
  uniforms: Record<string, THREE.IUniform>;
  /** GLSL for the vertex shader: uniforms, attributes, varyings and `void shape(out vec3 P, out vec3 N)`. */
  vertex: string;
  /** GLSL for the fragment shader: uniforms, varyings, helpers. */
  fragPars?: string;
  /** GLSL run after the base colour is known; may change `diffuseColor.rgb`. */
  fragColor?: string;
  /** How much sun shines through from behind (0 = opaque card, 0.6 = thin silk). */
  translucency?: number;
  vertexColors?: boolean;
  variation?: number;
  rim?: number;
  /** Shade every triangle flat (crisp facets, like folded paper). */
  flat?: boolean;
}

/** A toon material with a shader-built shape, and its depth twin for shadows. */
export function shapedToon(o: ShapedOpts): { mat: THREE.MeshToonMaterial; depth: THREE.MeshDepthMaterial } {
  const mat = paint(new THREE.MeshToonMaterial({ color: o.color ?? '#ffffff', gradientMap: softRamp(), side: THREE.DoubleSide, vertexColors: !!o.vertexColors }),
    { variation: o.variation ?? 0.45, rim: o.rim ?? 0.8 });
  if (o.flat) mat.defines = { ...mat.defines, FLAT_SHADED: '' };
  const painted = mat.onBeforeCompile;
  const tr = (o.translucency ?? 0.4).toFixed(3);
  mat.onBeforeCompile = (shader, r) => {
    painted.call(mat, shader, r);
    Object.assign(shader.uniforms, o.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${NOISE_GLSL}\n${o.vertex}`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal; vec3 sP; shape(sP, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = sP;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uSunCol;\n${o.fragPars ?? ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${o.fragColor ?? ''}`)
      .replace('#include <opaque_fragment>', `
        { // sun through the cloth: the face turned from the sun glows with the cloth's own colour
          vec3 nW = normalize(vPNormal) * (gl_FrontFacing ? 1.0 : -1.0);
          float back = clamp(-dot(nW, uSun), 0.0, 1.0);
          vec3 vW = normalize(vPWorld - cameraPosition);
          float toward = 0.4 + 0.6 * clamp(dot(vW, uSun), 0.0, 1.0);
          outgoingLight += diffuseColor.rgb * uSunCol * back * toward * ${tr};
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'shaped_' + o.key + (o.flat ? 'F' : '');
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, o.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${NOISE_GLSL}\n${o.vertex}`)
      .replace('#include <begin_vertex>', 'vec3 sP; vec3 sN; shape(sP, sN); vec3 transformed = sP;');
  };
  depth.customProgramCacheKey = () => 'shapedDepth_' + o.key;
  return { mat, depth };
}

// ---------------------------------------------------------------- ribbons

/** One streaming ribbon: where it starts, how long and wide, and its colours. */
export interface RibbonSpec {
  root: THREE.Vector3 | [number, number, number];
  length: number;
  /** Width at the root, metres. */
  width: number;
  color: string;
  /** Second colour for stripes across the ribbon (needs `stripes`) and for bows. */
  color2?: string;
  /** Number of colour stripes along the ribbon (0 = plain). */
  stripes?: number;
  /** How hard this one waves (1 = normal). */
  amp?: number;
  seed?: number;
  /** Bow-tie knots tied along a classic kite tail. */
  bows?: number;
  /** How much narrower the free end is (0 = straight, 0.6 = tapers to 40 %). */
  taper?: number;
  /** Depth of the fishtail notch at the free end, in ribbon widths (0 = cut straight). */
  notch?: number;
  /** Instanced bundles only: which of the instance's three colours this ribbon takes (0, 1, 2). */
  slot?: number;
}

const RIBBON_VERT = /* glsl */ `
  attribute vec3 aRoot;
  attribute vec4 aRib;   // length, seed, amp, width
  attribute vec4 aRib2;  // stripes, bows, slot, taper
  attribute vec4 aBow;   // 1 = bow vertex, bow x (across), bow y (along), notch
  attribute vec3 aCol2;
  #ifdef USE_INSTANCING
    attribute float iSeed;
  #endif
  #ifdef RIB_INST
    // instanced bundles take their colours per instance: aRib2.z picks the slot (0, 1, 2)
    attribute vec3 iColA; attribute vec3 iColB; attribute vec3 iColC;
    varying vec3 vRibCol;
  #endif
  uniform float uPhase;   // integrated wave phase (radians), grows faster with speed
  uniform float uAmp;     // overall flap amplitude
  uniform float uWaveK;   // waves per metre along the ribbon
  uniform vec3 uFlow;     // which way the air carries the ribbons (local space, unit)
  uniform vec3 uDroop;    // pulled this way more and more towards the free end (local space; gravity when slow)
  uniform float uLenK;    // reeled in: 1 full length, 0 nothing left
  varying vec2 vRib; varying vec3 vCol2; varying vec3 vStripe;
  vec3 ribCentre(float s, out float tw) {
    float L = aRib.x * uLenK, seed = aRib.y, amp = aRib.z * uAmp;
    #ifdef USE_INSTANCING
      seed += iSeed;
    #endif
    float ph = uPhase * (0.85 + 0.3 * fract(seed * 7.13)) - s * L * uWaveK + seed * 6.283;
    // the root is held still; the swing grows towards the free end
    float env = s * (0.3 + 0.7 * s);
    vec3 dir = normalize(uFlow + uDroop * s);
    vec3 c = aRoot + dir * (s * L);
    vec3 up = normalize(cross(dir, abs(dir.x) > 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 sd = cross(up, dir);
    float A = amp * env * min(L, 3.0);
    c += up * (sin(ph) * 0.75 + sin(ph * 1.7 + 1.3) * 0.25) * A * 0.12;
    c += sd * sin(ph * 0.61 + seed * 3.1) * A * 0.09;
    tw = sin(ph * 0.83 + seed * 2.0) * 0.7 * env * amp + (fract(seed) - 0.5) * 0.4;
    return c;
  }
  void shape(out vec3 P, out vec3 N) {
    float s = uv.x; float tw;
    vec3 c = ribCentre(s, tw);
    float tw2; vec3 c2 = ribCentre(min(s + 0.02, 1.0), tw2);
    vec3 c1 = ribCentre(max(s - 0.02, 0.0), tw2);
    vec3 T = normalize(c2 - c1 + uFlow * 1e-4);
    vec3 ref = abs(T.y) > 0.9 ? vec3(cos(tw), 0.0, sin(tw)) : vec3(cos(tw), sin(tw), 0.0);
    vec3 side = cross(T, ref);
    side = dot(side, side) > 1e-12 ? normalize(cross(normalize(side), T)) : normalize(cross(cross(T, vec3(0.0, 0.0, 1.0)) + vec3(1e-3, 0.0, 0.0), T));
    float w = aRib.w * (1.0 - aRib2.w * s) * (0.35 + 0.65 * uLenK);
    if (aBow.x > 0.5) {
      // a bow-tie knot across the tail
      P = c + side * aBow.y * (0.5 + 0.5 * uLenK) + T * aBow.z;
    } else {
      // a fishtail notch at the free end: the middle of the cut pulled back towards the root
      float mid = 1.0 - abs(uv.y - 0.5) * 2.0;
      float notch = step(0.999, s) * mid * w * aBow.w;
      P = c + side * (uv.y - 0.5) * w - T * notch;
    }
    N = normalize(cross(side, T));
    vRib = uv; vStripe = vec3(aRib2.xy, aBow.x);
    #ifndef RIB_INST
      vCol2 = aCol2;
    #else
      float sl = aRib2.z;
      vRibCol = sl < 0.5 ? iColA : sl < 1.5 ? iColB : iColC;
      vCol2 = sl < 0.5 ? iColB : sl < 1.5 ? iColC : iColA;
    #endif
  }
`;
const RIBBON_FRAG_PARS = /* glsl */ `varying vec2 vRib; varying vec3 vCol2; varying vec3 vStripe;
  #ifdef RIB_INST
    varying vec3 vRibCol;
  #endif`;
const RIBBON_FRAG = /* glsl */ `
  #ifdef RIB_INST
    diffuseColor.rgb = vRibCol;
  #endif
  if (vStripe.x > 0.5 && fract(vRib.x * vStripe.x) < 0.5) diffuseColor.rgb = vCol2;
  if (vStripe.z > 0.5) diffuseColor.rgb = vCol2;
  // a slightly darker hem along both edges
  float edge = min(vRib.y, 1.0 - vRib.y);
  diffuseColor.rgb *= 0.9 + 0.1 * smoothstep(0.0, 0.15, edge);
`;

/** Uniforms one ribbon bundle shares; drive uPhase (and the rest) from the owner's update. */
export function ribbonUniforms() {
  return {
    uPhase: { value: 0 }, uAmp: { value: 1 }, uWaveK: { value: 1.6 }, uLenK: { value: 1 },
    uFlow: { value: new THREE.Vector3(0, 0, -1) }, uDroop: { value: new THREE.Vector3(0, -0.08, 0) },
  };
}

/** Many ribbons in one geometry: each a strip of `seg` rows of three vertices laid along the flow from its root, plus its bows. */
export function ribbonGeometry(specs: RibbonSpec[], seg = 36): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], col: number[] = [], col2: number[] = [], root: number[] = [], rib: number[] = [], rib2: number[] = [], bow: number[] = [], idx: number[] = [];
  const c = new THREE.Color(), c2 = new THREE.Color();
  let base = 0;
  specs.forEach((sp, k) => {
    const r = Array.isArray(sp.root) ? sp.root : sp.root.toArray();
    c.set(sp.color); c2.set(sp.color2 ?? sp.color);
    const vert = (s: number, y: number, b: [number, number, number, number]) => {
      pos.push(r[0], r[1], r[2]); uv.push(s, y);
      col.push(c.r, c.g, c.b); col2.push(c2.r, c2.g, c2.b);
      root.push(r[0], r[1], r[2]);
      rib.push(sp.length, sp.seed ?? k * 0.37 + 0.11, sp.amp ?? 1, sp.width);
      rib2.push(sp.stripes ?? 0, sp.bows ?? 0, sp.slot ?? 0, sp.taper ?? 0.3);
      bow.push(...b);
    };
    for (let i = 0; i <= seg; i++) for (let j = 0; j < 3; j++) vert(i / seg, j / 2, [0, 0, 0, sp.notch ?? 0]);
    for (let i = 0; i < seg; i++) for (let j = 0; j < 2; j++) {
      const a = base + i * 3 + j;
      idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
    }
    base += (seg + 1) * 3;
    // bows: two little triangles meeting at the knot, sticking out either side of the tail
    const nb = sp.bows ?? 0, bw = Math.max(0.09, sp.width * 2.2), bh = bw * 0.5;
    for (let b = 0; b < nb; b++) {
      const s = (b + 0.7) / (nb + 0.4);
      for (const sx of [-1, 1]) {
        vert(s, 0.5, [1, 0, 0, 0]); vert(s, 0.5, [1, sx * bw, bh, 0]); vert(s, 0.5, [1, sx * bw, -bh, 0]);
        idx.push(base, base + 1, base + 2); base += 3;
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aCol2', new THREE.Float32BufferAttribute(col2, 3));
  g.setAttribute('aRoot', new THREE.Float32BufferAttribute(root, 3));
  g.setAttribute('aRib', new THREE.Float32BufferAttribute(rib, 4));
  g.setAttribute('aRib2', new THREE.Float32BufferAttribute(rib2, 4));
  g.setAttribute('aBow', new THREE.Float32BufferAttribute(bow, 4));
  g.setIndex(idx);
  // the shader moves the ribbons a long way from where they start: a generous bound keeps them from being culled
  let far = 0; for (const s of specs) far = Math.max(far, s.length);
  const ctr = new THREE.Vector3(); specs.forEach(s => ctr.add(new THREE.Vector3().fromArray(Array.isArray(s.root) ? s.root : s.root.toArray())));
  ctr.divideScalar(Math.max(1, specs.length));
  g.boundingSphere = new THREE.Sphere(ctr, far * 1.2 + 1);
  return g;
}

/**
 * A bundle of ribbons as one mesh. `u` from ribbonUniforms(); instanced when `count` is given.
 * Ribbons are thin, so they stay out of the depth buffer (the finish pass would ink them into black
 * noodles) and draw after the other opaque things.
 */
export function ribbonMesh(specs: RibbonSpec[], u = ribbonUniforms(), opts: { seg?: number; count?: number; key?: string; ink?: boolean } = {}) {
  const g = ribbonGeometry(specs, opts.seg ?? 36);
  const inst = !!opts.count;
  const { mat, depth } = shapedToon({ key: 'ribbon' + (inst ? 'I' : '') + (opts.key ?? ''), uniforms: u, vertex: RIBBON_VERT, fragPars: RIBBON_FRAG_PARS, fragColor: RIBBON_FRAG, translucency: 0.35, vertexColors: !inst, variation: 0.2, rim: 0.6 });
  if (inst) { mat.defines = { ...mat.defines, RIB_INST: '' }; depth.defines = { RIB_INST: '' }; }
  if (!opts.ink) mat.depthWrite = false;
  const m = opts.count ? new THREE.InstancedMesh(g, mat, opts.count) : new THREE.Mesh(g, mat);
  m.customDepthMaterial = depth;
  m.castShadow = true;
  m.frustumCulled = !opts.count;
  m.renderOrder = 2;
  m.userData.noOutline = true;
  return { mesh: m, uniforms: u };
}

// ---------------------------------------------------------------- wind lines

/**
 * Speed streaks rushing past along -Z around a moving thing, faded in by `uAmt`: each a thin bright
 * sliver with a sharp head and a long fading tail. They cluster round the given points (the wing tips,
 * the leading edges), with a few strays. One draw call; everything happens in the vertex shader.
 */
export function windLines(opts: { count?: number; around: THREE.Vector3[]; spread?: number; length?: [number, number]; span?: number; seed?: number }) {
  const n = opts.count ?? 22, spread = opts.spread ?? 0.35, span = opts.span ?? 12, [l0, l1] = opts.length ?? [1.2, 3.6];
  let s = (opts.seed ?? 7) * 9301 + 49297;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const SEG = 6;
  const pos: number[] = [], line: number[] = [], len: number[] = [], idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const at = opts.around[i % opts.around.length];
    const a = rnd() * Math.PI * 2, r = spread * (0.25 + Math.pow(rnd(), 1.5) * (i % 5 === 4 ? 3 : 1));
    const l = [at.x + r * Math.cos(a), at.y + r * Math.sin(a) * 0.6, rnd() * span, 0.7 + rnd() * 0.6];
    const L = l0 + rnd() * (l1 - l0);
    const b = pos.length / 3;
    for (let k = 0; k <= SEG; k++) for (const sd of [-1, 1]) { pos.push(k / SEG, sd, 0); line.push(...l); len.push(L); }
    for (let k = 0; k < SEG; k++) { const q = b + k * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aLine', new THREE.Float32BufferAttribute(line, 4));
  g.setAttribute('aLen', new THREE.Float32BufferAttribute(len, 1));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), span + 4);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
    uniforms: { uAmt: { value: 0 }, uTime: { value: 0 }, uSpeed: { value: 30 }, uSpan: { value: span }, uCol: { value: new THREE.Color('#ffffff') } },
    vertexShader: /* glsl */ `
      attribute vec4 aLine; attribute float aLen;
      uniform float uAmt, uTime, uSpeed, uSpan;
      varying float vA;
      void main(){
        float x = position.x;                     // 0 head .. 1 tail
        float z = mod(aLine.z - uTime * uSpeed * aLine.w, uSpan) - uSpan * 0.4;
        float life = 1.0 - smoothstep(uSpan * 0.2, uSpan * 0.55, abs(z));
        vec3 p = vec3(aLine.xy, z - x * aLen * (0.6 + 0.4 * uAmt));
        vec4 v = modelViewMatrix * vec4(p, 1.0);
        vec4 vt = modelViewMatrix * vec4(p - vec3(0.0, 0.0, 0.2), 1.0);
        vec3 d = normalize(vt.xyz - v.xyz);
        vec3 side = normalize(cross(d, normalize(v.xyz)));
        // a sharp head that swells quickly, then a long thinning tail
        float w = (0.006 + 0.0008 * length(v.xyz)) * smoothstep(0.0, 0.12, x) * (1.0 - 0.75 * x);
        v.xyz += side * position.y * w;
        gl_Position = projectionMatrix * v;
        vA = uAmt * life * aLine.w * smoothstep(0.0, 0.06, x) * pow(1.0 - x, 1.4);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCol; varying float vA;
      void main(){ gl_FragColor = vec4(uCol, vA * 0.55); }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.userData.noOutline = true;
  m.renderOrder = 5;
  return { mesh: m, uniforms: mat.uniforms };
}

// ---------------------------------------------------------------- strings

/**
 * Kite strings: `n` strings of `pts` points each, drawn as thin camera-facing strips (never thinner than
 * about `minPx` pixels, so they don't break up), each with its own opacity, fading out with distance.
 * Write the points with set(i, j, v) and call commit() once a frame. One draw call for all of them.
 */
export class KiteStrings {
  mesh: THREE.Mesh;
  private P: THREE.BufferAttribute; private Nx: THREE.BufferAttribute;
  constructor(readonly n: number, readonly pts: number, opts: { color?: string; alpha?: number[]; width?: number; minPx?: number; fade?: [number, number] } = {}) {
    const V = n * pts * 2;
    const g = new THREE.BufferGeometry();
    this.P = new THREE.BufferAttribute(new Float32Array(V * 3), 3); this.P.setUsage(THREE.DynamicDrawUsage);
    this.Nx = new THREE.BufferAttribute(new Float32Array(V * 3), 3); this.Nx.setUsage(THREE.DynamicDrawUsage);
    const side = new Float32Array(V), alpha = new Float32Array(V), along = new Float32Array(V), idx: number[] = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < pts; j++) for (let k = 0; k < 2; k++) {
      const v = (i * pts + j) * 2 + k;
      side[v] = k ? 1 : -1; alpha[v] = opts.alpha?.[i] ?? 0.8; along[v] = j / (pts - 1);
      if (j < pts - 1 && k === 0) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    g.setAttribute('position', this.P); g.setAttribute('aNext', this.Nx);
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    g.setIndex(idx);
    const [f0, f1] = opts.fade ?? [25, 110];
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uCol: { value: new THREE.Color(opts.color ?? '#fbf6ea') }, uW: { value: opts.width ?? 0.006 }, uPx: { value: (opts.minPx ?? 1.1) / 900 }, uFade: { value: new THREE.Vector2(f0, f1) } },
      vertexShader: /* glsl */ `
        attribute vec3 aNext; attribute float aSide; attribute float aAlpha; attribute float aAlong;
        uniform float uW, uPx; uniform vec2 uFade;
        varying float vA;
        void main(){
          vec4 v = modelViewMatrix * vec4(position, 1.0);
          vec4 vn = modelViewMatrix * vec4(aNext, 1.0);
          vec3 d = vn.xyz - v.xyz; d = length(d) > 1e-5 ? normalize(d) : vec3(0.0, 1.0, 0.0);
          vec3 sd = normalize(cross(d, normalize(v.xyz)));
          float dist = -v.z;
          float w = max(uW, dist * uPx * 2.0 / projectionMatrix[1][1]);
          v.xyz += sd * aSide * w * 0.5;
          gl_Position = projectionMatrix * v;
          // fainter far away, and towards the kite end (lost against the sky)
          vA = aAlpha * (1.0 - smoothstep(uFade.x, uFade.y, dist)) * (1.0 - 0.35 * aAlong) * min(1.0, uW / w * 2.5 + 0.35);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; varying float vA;
        void main(){ gl_FragColor = vec4(uCol, vA); }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.userData.noOutline = true;
  }
  /** Point j of string i. */
  set(i: number, j: number, v: THREE.Vector3) {
    const b = (i * this.pts + j) * 2;
    this.P.setXYZ(b, v.x, v.y, v.z); this.P.setXYZ(b + 1, v.x, v.y, v.z);
  }
  /** A string from a to b sagging under its own weight (`sag` x its length at the middle). */
  curve(i: number, a: THREE.Vector3, b: THREE.Vector3, sag = 0.1) {
    const d = a.distanceTo(b), n = this.pts;
    for (let j = 0; j < n; j++) {
      const t = j / (n - 1);
      _sv.lerpVectors(a, b, t); _sv.y -= 4 * t * (1 - t) * d * sag * (1 - t * 0.4);
      this.set(i, j, _sv);
    }
  }
  /** Upload this frame's points (and each point's neighbour, for the strip's direction). */
  commit() {
    const P = this.P.array as Float32Array, Nx = this.Nx.array as Float32Array, n = this.pts;
    for (let i = 0; i < this.n; i++) for (let j = 0; j < n; j++) {
      const b = (i * n + j) * 6, o = (i * n + (j < n - 1 ? j + 1 : j - 1)) * 6;
      const s = j < n - 1 ? 1 : -1;
      for (let k = 0; k < 6; k += 3) for (let c = 0; c < 3; c++) Nx[b + k + c] = P[b + c] + (P[o + c] - P[b + c]) * s;
    }
    this.P.needsUpdate = true; this.Nx.needsUpdate = true;
  }
}
const _sv = new THREE.Vector3();

export { PAINT };
