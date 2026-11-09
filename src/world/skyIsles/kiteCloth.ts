// Shared cloth for the Sky Isles kites: toon materials whose shape is computed in the vertex shader
// (so a whole sail or a bundle of ribbons ripples for the cost of one draw call and no CPU work),
// the long streaming ribbons, and the wind lines that rush past a diving kite-wing.
//
// Every cloth material is the game's MeshToonMaterial with softRamp() and paint() (painted ambient, rim,
// noise variation), plus three things of its own:
//  - a GLSL `shape(out P, out N)` that builds the vertex from its attributes and the uniforms,
//  - an optional GLSL colour block that paints the cloth's pattern into diffuseColor,
//  - light shining through: the side of the cloth turned away from the sun glows with its own colour,
//    the way a kite looks from below against a bright sky.
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
}

/** A toon material with a shader-built shape, and its depth twin for shadows. */
export function shapedToon(o: ShapedOpts): { mat: THREE.MeshToonMaterial; depth: THREE.MeshDepthMaterial } {
  const mat = paint(new THREE.MeshToonMaterial({ color: o.color ?? '#ffffff', gradientMap: softRamp(), side: THREE.DoubleSide, vertexColors: !!o.vertexColors }),
    { variation: o.variation ?? 0.45, rim: o.rim ?? 0.8 });
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
          float toward = 0.55 + 0.45 * clamp(dot(vW, uSun), 0.0, 1.0);
          outgoingLight += diffuseColor.rgb * uSunCol * back * toward * ${tr};
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'shaped_' + o.key;
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
  width: number;
  color: string;
  /** Second colour for stripes across the ribbon (needs `stripes`). */
  color2?: string;
  /** Number of colour stripes along the ribbon (0 = plain). */
  stripes?: number;
  /** How hard this one waves (1 = normal). */
  amp?: number;
  seed?: number;
  /** Bows tied along a classic kite tail. */
  bows?: number;
  /** Instanced bundles only: which of the instance's three colours this ribbon takes (0, 1, 2). */
  slot?: number;
}

const RIBBON_VERT = /* glsl */ `
  attribute vec3 aRoot;
  attribute vec4 aRib;   // length, seed, amp, width
  attribute vec4 aRib2;  // stripes, bows, 0, 0
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
  uniform vec3 uDroop;    // where the free end sags to (local space, metres per metre of ribbon)
  varying vec2 vRib; varying vec3 vCol2; varying vec2 vStripe;
  vec3 ribCentre(float s, out float tw) {
    float L = aRib.x, seed = aRib.y, amp = aRib.z * uAmp;
    #ifdef USE_INSTANCING
      seed += iSeed;
    #endif
    float ph = uPhase * (0.85 + 0.3 * fract(seed * 7.13)) - s * L * uWaveK + seed * 6.283;
    float env = s * (0.35 + 0.65 * s);
    vec3 c = aRoot + vec3(0.0, 0.0, -s * L);
    c.y += (sin(ph) * 0.75 + sin(ph * 1.7 + 1.3) * 0.25) * amp * env * min(L, 3.0) * 0.16;
    c.x += sin(ph * 0.61 + seed * 3.1) * amp * env * min(L, 3.0) * 0.13;
    c += uDroop * (s * s * L);
    tw = sin(ph * 0.83 + seed * 2.0) * 0.75 * env * amp + (fract(seed) - 0.5) * 0.4;
    return c;
  }
  void shape(out vec3 P, out vec3 N) {
    float s = uv.x; float tw;
    vec3 c = ribCentre(s, tw);
    float tw2; vec3 c2 = ribCentre(min(s + 0.02, 1.0), tw2);
    vec3 c1 = ribCentre(max(s - 0.02, 0.0), tw2);
    vec3 T = normalize(c2 - c1 + vec3(0.0, 0.0, -1e-4));
    vec3 side = normalize(cross(T, vec3(cos(tw), sin(tw), 0.0)));
    side = normalize(cross(side, T));
    float w = aRib.w * (1.0 - 0.35 * s);
    // a swallowtail notch at the very end
    float notch = smoothstep(0.93, 1.0, s) * (1.0 - abs(uv.y - 0.5) * 2.0) * aRib.w * 0.9;
    P = c + side * (uv.y - 0.5) * w + T * (-notch) ;
    N = normalize(cross(side, T));
    vRib = uv; vCol2 = aCol2; vStripe = aRib2.xy;
    #ifdef RIB_INST
      float sl = aRib2.z;
      vRibCol = sl < 0.5 ? iColA : sl < 1.5 ? iColB : iColC;
      vCol2 = sl < 0.5 ? iColB : sl < 1.5 ? iColC : iColA;
    #endif
  }
`;
const RIBBON_FRAG_PARS = /* glsl */ `varying vec2 vRib; varying vec3 vCol2; varying vec2 vStripe;
  #ifdef RIB_INST
    varying vec3 vRibCol;
  #endif`;
const RIBBON_FRAG = /* glsl */ `
  #ifdef RIB_INST
    diffuseColor.rgb = vRibCol;
  #endif
  if (vStripe.x > 0.5 && fract(vRib.x * vStripe.x) < 0.5) diffuseColor.rgb = vCol2;
  // a darker hem along both edges, and a fold crease down the middle
  float edge = min(vRib.y, 1.0 - vRib.y);
  diffuseColor.rgb *= 0.86 + 0.14 * smoothstep(0.0, 0.12, edge);
  diffuseColor.rgb *= 0.95 + 0.05 * smoothstep(0.0, 0.05, abs(vRib.y - 0.5));
  if (vStripe.y > 0.5) { // bows tied along the tail: knots of the second colour
    float b = fract(vRib.x * vStripe.y);
    if (b < 0.06 && vRib.x > 0.04) diffuseColor.rgb = vCol2 * 0.9;
  }
`;

/** Uniforms one ribbon bundle shares; drive uPhase from the owner's update. */
export function ribbonUniforms() {
  return { uPhase: { value: 0 }, uAmp: { value: 1 }, uWaveK: { value: 1.6 }, uDroop: { value: new THREE.Vector3(0, -0.08, 0) } };
}

/** Many ribbons in one geometry, each a strip of `seg` quads, laid along -Z from its root. */
export function ribbonGeometry(specs: RibbonSpec[], seg = 36): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], col: number[] = [], col2: number[] = [], root: number[] = [], rib: number[] = [], rib2: number[] = [], idx: number[] = [];
  const c = new THREE.Color(), c2 = new THREE.Color();
  let base = 0;
  specs.forEach((sp, k) => {
    const r = Array.isArray(sp.root) ? sp.root : sp.root.toArray();
    c.set(sp.color); c2.set(sp.color2 ?? sp.color);
    for (let i = 0; i <= seg; i++) for (let j = 0; j < 2; j++) {
      pos.push(r[0], r[1], r[2]);
      uv.push(i / seg, j);
      col.push(c.r, c.g, c.b); col2.push(c2.r, c2.g, c2.b);
      root.push(r[0], r[1], r[2]);
      rib.push(sp.length, sp.seed ?? k * 0.37 + 0.11, sp.amp ?? 1, sp.width);
      rib2.push(sp.stripes ?? 0, sp.bows ?? 0, sp.slot ?? 0, 0);
    }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    base += (seg + 1) * 2;
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
  g.setIndex(idx);
  // the shader moves the ribbons a long way from where they start: a generous bound keeps them from being culled
  let far = 0; for (const s of specs) far = Math.max(far, s.length);
  const ctr = new THREE.Vector3(); specs.forEach(s => ctr.add(new THREE.Vector3().fromArray(Array.isArray(s.root) ? s.root : s.root.toArray())));
  ctr.divideScalar(Math.max(1, specs.length));
  g.boundingSphere = new THREE.Sphere(ctr, far * 1.2 + 1);
  return g;
}

/** A bundle of ribbons as one mesh. `u` from ribbonUniforms(); instanced when `count` is given. */
export function ribbonMesh(specs: RibbonSpec[], u = ribbonUniforms(), opts: { seg?: number; count?: number; key?: string } = {}) {
  const g = ribbonGeometry(specs, opts.seg ?? 36);
  const inst = !!opts.count;
  const { mat, depth } = shapedToon({ key: 'ribbon' + (inst ? 'I' : '') + (opts.key ?? ''), uniforms: u, vertex: RIBBON_VERT, fragPars: RIBBON_FRAG_PARS, fragColor: RIBBON_FRAG, translucency: 0.55, vertexColors: true, variation: 0.25 });
  if (inst) { mat.defines = { RIB_INST: '' }; depth.defines = { RIB_INST: '' }; }
  const m = opts.count ? new THREE.InstancedMesh(g, mat, opts.count) : new THREE.Mesh(g, mat);
  m.customDepthMaterial = depth;
  m.castShadow = true;
  m.frustumCulled = !opts.count;
  m.userData.noOutline = true;
  return { mesh: m, uniforms: u };
}

// ---------------------------------------------------------------- wind lines

/**
 * Speed streaks: thin bright lines rushing past along -Z around a moving thing, faded in by `uAmt`.
 * One draw call; everything happens in the vertex shader. Lines face the camera.
 */
export function windLines(opts: { count?: number; radius?: [number, number]; length?: number; span?: number; seed?: number } = {}) {
  const n = opts.count ?? 70, [r0, r1] = opts.radius ?? [0.8, 3.2], span = opts.span ?? 14;
  let s = (opts.seed ?? 7) * 9301 + 49297;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pos: number[] = [], line: number[] = [], idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = r0 + Math.pow(rnd(), 0.7) * (r1 - r0);
    const l = [r * Math.cos(a), r * Math.sin(a) * 0.7, rnd() * span, 0.6 + rnd() * 0.8];
    for (let k = 0; k < 4; k++) { pos.push(k >> 1, (k & 1) * 2 - 1, 0); line.push(...l); } // position.xy: which end, which side
    const b = i * 4; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aLine', new THREE.Float32BufferAttribute(line, 4));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), span + r1);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
    uniforms: { uAmt: { value: 0 }, uTime: { value: 0 }, uSpeed: { value: 30 }, uLen: { value: opts.length ?? 2.6 }, uSpan: { value: span }, uCol: { value: new THREE.Color('#ffffff') } },
    vertexShader: /* glsl */ `
      attribute vec4 aLine;
      #define aEnd position.xy
      uniform float uAmt, uTime, uSpeed, uLen, uSpan;
      varying float vA; varying float vX;
      void main(){
        float z = mod(aLine.z - uTime * uSpeed * aLine.w, uSpan) - uSpan * 0.45;
        float fade = 1.0 - smoothstep(uSpan * 0.25, uSpan * 0.55, abs(z));
        vec3 a = vec3(aLine.xy, z), b = vec3(aLine.xy, z - uLen * aLine.w * (0.5 + uAmt));
        vec4 va = modelViewMatrix * vec4(a, 1.0), vb = modelViewMatrix * vec4(b, 1.0);
        vec3 d = normalize(vb.xyz - va.xyz);
        vec3 side = normalize(cross(d, normalize(va.xyz))) * (0.02 + 0.0015 * length(va.xyz));
        vec4 p = mix(va, vb, aEnd.x);
        p.xyz += side * aEnd.y * (1.0 - aEnd.x * 0.7);
        gl_Position = projectionMatrix * p;
        vA = uAmt * fade * (0.45 + 0.55 * aLine.w); vX = aEnd.x;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCol; varying float vA; varying float vX;
      void main(){ gl_FragColor = vec4(uCol, vA * (1.0 - vX) * 0.7); }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.userData.noOutline = true;
  m.renderOrder = 5;
  return { mesh: m, uniforms: mat.uniforms };
}

export { PAINT };
