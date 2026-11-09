import * as THREE from 'three';
import { NOISE_GLSL, PAINT } from '../../render/paint';

/**
 * The building blocks of the Sky Isles cumulus: painted billows that are lit as one heap.
 *
 * A puff is an ellipsoid drawn as a camera-facing impostor: one quad per puff, and the fragment shader casts the
 * view ray at the ellipsoid, so every silhouette is a true curve at any distance (no facets), with a
 * noise-eroded rim that rolls slowly, crisp but soft like a brush edge. The ray hit gives a per-pixel normal
 * and depth, and a puff can be cut flat by its heap's base plane (the flat bottoms of cumulus).
 *
 * Each puff knows the heap it belongs to, so the shader blends the puff's own normal with the heap's dome normal:
 * every billow keeps a little light and shadow, but the whole mass reads as one cloud, with a clear toon
 * terminator between warm cream crowns and cool periwinkle bellies, darker toward the heap's base and in the
 * tucks between billows (an occlusion baked per puff, plus the puff's own lower rim).
 *
 * Clouds are sorted transparent puffs that never write depth, so the finish pass draws no ink on them. Their
 * blending also pulls the render target's alpha below zero wherever they cover (cloudBlend); the finish pass,
 * with FINISH_CLOUD_MASK on, drops the ink there, so the outlines of things behind clouds do not bleed through.
 * A PuffLayer culls its puffs against the view (and the planet's horizon) and sorts the survivors back to front
 * every frame on the CPU, which is cheap for a few thousand puffs.
 */

// ------------------------------------------------------------------ palettes

/** Colours of a cloud at one light (sRGB hex). */
export interface CloudPalette {
  /** Sunlit crown, its warm shoulder, and the lit-but-occluded half tone. */
  top: string; warm: string; mid: string;
  /** Shadow side: the belly, the deep base and tucks, and the sky-lit (up-facing) shadow. */
  belly: string; deep: string; skyShade: string;
  rim: string; glow: string;
  /** How strongly clouds glow at their edges when you look toward the sun (the silver lining). */
  glowK: number;
  /** Brightness of the sunlit crowns (above 1 they start to bloom). */
  gain: number;
  /** Where the terminator sits on the wrapped light (higher = more of the heap in shadow). */
  term: number;
}

export const MIDDAY: CloudPalette = {
  top: '#fffaf0', warm: '#fff3e0', mid: '#dcdcf0',
  belly: '#b2b4e6', deep: '#8c9ad6', skyShade: '#c7d1f2',
  rim: '#ffffff', glow: '#fff3dc',
  glowK: 0.2, gain: 0.96, term: 0.38,
};
export const GOLDEN: CloudPalette = {
  top: '#fff6e2', warm: '#ffd6a0', mid: '#eec8c0',
  belly: '#ada2d4', deep: '#827cba', skyShade: '#c8bce0',
  rim: '#ffe6b4', glow: '#ffd28a',
  glowK: 1.2, gain: 1.08, term: 0.4,
};

/** Uniforms every cloud material shares with its CloudSea (one palette drives them all). */
export function cloudUniforms() {
  return {
    uSun: PAINT.uSun,
    uTime: { value: 0 },
    uTop: { value: new THREE.Color(MIDDAY.top) },
    uWarm: { value: new THREE.Color(MIDDAY.warm) },
    uMid: { value: new THREE.Color(MIDDAY.mid) },
    uBelly: { value: new THREE.Color(MIDDAY.belly) },
    uDeep: { value: new THREE.Color(MIDDAY.deep) },
    uSkyShade: { value: new THREE.Color(MIDDAY.skyShade) },
    uRim: { value: new THREE.Color(MIDDAY.rim) },
    uGlow: { value: new THREE.Color(MIDDAY.glow) },
    uGlowK: { value: MIDDAY.glowK },
    uGain: { value: MIDDAY.gain },
    uTerm: { value: MIDDAY.term },
    uHaze: { value: new THREE.Color('#cfe5f2') },
    uHazeD: { value: 0.0011 },
  };
}
export type CloudUniforms = ReturnType<typeof cloudUniforms>;

const ca = new THREE.Color(), cb = new THREE.Color();
/** Blend the shared uniforms between midday (k = 0) and golden hour (k = 1). */
export function applyPalette(u: CloudUniforms, k: number, a = MIDDAY, b = GOLDEN) {
  const mix = (key: keyof CloudPalette, c: THREE.Color) => c.copy(ca.set(a[key] as string)).lerp(cb.set(b[key] as string), k);
  mix('top', u.uTop.value); mix('warm', u.uWarm.value); mix('mid', u.uMid.value); mix('belly', u.uBelly.value);
  mix('deep', u.uDeep.value); mix('skyShade', u.uSkyShade.value); mix('rim', u.uRim.value); mix('glow', u.uGlow.value);
  u.uGlowK.value = a.glowK + (b.glowK - a.glowK) * k;
  u.uGain.value = a.gain + (b.gain - a.gain) * k;
  u.uTerm.value = a.term + (b.term - a.term) * k;
}

/**
 * Cloud blending: ordinary alpha blending for colour, while the alpha channel is pulled down by the cloud's
 * coverage (dst.a - src.a). Opaque things leave alpha at 1, so after the clouds alpha < 0.5 means "cloud here".
 * (Bloom only ever adds to alpha, and the game's half-float targets keep values below zero, so the mask holds.)
 */
export function cloudBlend<M extends THREE.Material>(m: M) {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendEquationAlpha = THREE.ReverseSubtractEquation;
  m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneFactor;
  return m;
}

// ------------------------------------------------------------------ the puff material

export interface PuffMaterialOptions {
  /** Up is a fixed uFlatUp (the far, flattened sea; pads) rather than radial from uCenter (the shell). */
  flat?: boolean;
  /** Cut puffs flat this far below their heap's base point (metres); default: no cut. */
  flatBottom?: number;
  /** Strength of the breathing and rolling (default 1). */
  billow?: number;
  /** Puffs fade out when the camera comes closer than this (metres). */
  nearFade?: number;
  /** How deep the rim is eroded by noise, as a fraction of the puff (default 0.16). */
  erode?: number;
  /** Write the ray-hit depth so the puffs meet solids correctly (near layers and pads; costs early-z). */
  depth?: boolean;
}

/**
 * One material per layer: the shared uniforms plus the layer's own frame.
 * Per instance: instanceMatrix (the ellipsoid), aHeap (heap base point, heap radius), aInfo (heap height, seed,
 * openness 0..1 from the baked occlusion, haze multiplier).
 */
export function puffMaterial(shared: CloudUniforms, opts: PuffMaterialOptions = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    defines: opts.depth ? { PUFF_DEPTH: 1 } : {},
    uniforms: {
      ...shared,
      uCenter: { value: new THREE.Vector3() },
      uFlatUp: { value: new THREE.Vector3(0, 1, 0) },
      uFlat: { value: opts.flat ? 1 : 0 },
      uFlatBottom: { value: opts.flatBottom ?? 1e4 },
      uBillow: { value: opts.billow ?? 1 },
      uNearFade: { value: opts.nearFade ?? 2.5 },
      uErode: { value: opts.erode ?? 0.16 },
      // flat layers only: fade heaps in and out by their distance from uRingO across the plane (in0, in1, out0, out1)
      uRing: { value: new THREE.Vector4(-2, -1, 1e9, 2e9) },
      uRingO: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aHeap;   // heap base point (layer space) and heap radius
      attribute vec4 aInfo;   // heap height, seed, openness, haze multiplier
      uniform float uTime, uBillow, uFlat;
      uniform vec3 uCenter, uFlatUp, uRingO; uniform vec4 uRing;
      varying vec3 vW, vC, vHc, vUp;
      varying vec3 vI0, vI1, vI2;   // rows of the inverse ellipsoid frame (world -> unit sphere)
      varying vec4 vInfo;           // heap R, heap H, openness, haze multiplier
      varying float vSeed, vFade;
      void main(){
        float seed = aInfo.y;
        mat4 M = modelMatrix * instanceMatrix;
        mat3 A = mat3(M);
        vec3 c = M[3].xyz;
        vec3 hc = (modelMatrix * vec4(aHeap.xyz, 1.0)).xyz;
        vec3 up = uFlat > 0.5 ? uFlatUp : normalize(hc - uCenter);
        float H = max(aInfo.x, 0.1), R = max(aHeap.w, 0.1);
        float hv = dot(c - hc, up) / H;
        // billowing: crowns swell and roll slowly; low puffs barely move
        float k = uBillow * (0.35 + 0.65 * clamp(hv, 0.0, 1.0));
        float r0 = length(A[1]);
        float ph = uTime * 0.42 + seed * 40.0;
        A *= 1.0 + k * (0.075 * sin(ph) + 0.035 * sin(uTime * 0.91 + seed * 13.0));
        vec3 side = normalize(cross(up, abs(up.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 fw = cross(side, up);
        c += k * r0 * (up * 0.16 * sin(ph * 0.8 + 1.3) + side * 0.12 * sin(uTime * 0.27 + seed * 7.0) + fw * 0.1 * cos(uTime * 0.31 + seed * 3.0));
        mat3 I = inverse(A);
        vI0 = vec3(I[0][0], I[1][0], I[2][0]); vI1 = vec3(I[0][1], I[1][1], I[2][1]); vI2 = vec3(I[0][2], I[1][2], I[2][2]);
        float r = max(length(A[0]), max(length(A[1]), length(A[2])));
        // a quad facing the camera just in front of the bounding sphere, big enough to cover its silhouette
        vec3 toC = c - cameraPosition;
        float d = length(toC);
        vec3 f = toC / d;
        vec3 ax = normalize(cross(f, abs(f.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 ay = cross(ax, f);
        float dq = max(d - r, 0.02);
        // the ellipsoid's extent along each of the quad's axes (|A^T u|), widened for perspective
        float ex = length(vec3(dot(A[0], ax), dot(A[1], ax), dot(A[2], ax)));
        float ey = length(vec3(dot(A[0], ay), dot(A[1], ay), dot(A[2], ay)));
        float pk = dq / sqrt(max(d * d - r * r, 1e-4)) * 1.06;
        vec3 wp = cameraPosition + f * dq + (ax * position.x * ex + ay * position.y * ey) * pk;
        vW = wp; vC = c; vHc = hc; vUp = up;
        vInfo = vec4(R, H, aInfo.z, aInfo.w);
        vSeed = fract(seed * 7.13);
        vec3 ro = hc - uRingO; float rho = length(ro - up * dot(ro, up));
        vFade = smoothstep(uRing.x, uRing.y, rho) * (1.0 - smoothstep(uRing.z, uRing.w, rho));
        // the camera inside the puff, or the puff faded away: collapse the quad
        if (d < r * 1.01 || vFade < 0.004) wp = cameraPosition - f;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uTop, uWarm, uMid, uBelly, uDeep, uSkyShade, uRim, uGlow, uHaze;
      uniform float uGlowK, uHazeD, uNearFade, uTime, uGain, uTerm, uErode, uFlatBottom;
      uniform mat4 projectionMatrix;
      varying vec3 vW, vC, vHc, vUp;
      varying vec3 vI0, vI1, vI2;
      varying vec4 vInfo;
      varying float vSeed, vFade;
      ${NOISE_GLSL}
      vec3 toLocal(vec3 v){ return vec3(dot(vI0, v), dot(vI1, v), dot(vI2, v)); }
      // (inverse-transpose of the frame: a unit-sphere point to a world normal)
      vec3 toNormal(vec3 p){ return vec3(vI0.x, vI1.x, vI2.x) * p.x + vec3(vI0.y, vI1.y, vI2.y) * p.y + vec3(vI0.z, vI1.z, vI2.z) * p.z; }
      void main(){
        vec3 rd = normalize(vW - cameraPosition);
        vec3 o = toLocal(cameraPosition - vC), dl = toLocal(rd);
        float a = dot(dl, dl);
        float tc = -dot(o, dl) / a;
        vec3 q = o + dl * tc;
        float rho = length(q);
        if (rho > 1.0) discard;
        // the rim: eroded by slow rolling noise into little scallops, then a crisp brushed edge
        vec3 qd = q / max(rho, 1e-4);
        float sd = vSeed * 31.0;
        // (one noise octave for the lumps, cheap rolling harmonics for the small scallops)
        float pn = pNoise(qd * 2.3 + vec3(sd, uTime * 0.11, -sd));
        float sc = sin(qd.x * 9.0 + qd.z * 4.0 + sd + uTime * 0.35) * sin(qd.y * 8.0 - qd.z * 6.0 - sd * 1.7 + uTime * 0.27);
        float e = pn * 0.65 + (sc * 0.5 + 0.5) * 0.35;
        float rr = 1.0 - uErode * e;
        // (the rim direction is undefined at the puff's centre, so the paint noise fades out toward it)
        pn = mix(0.5, pn, smoothstep(0.15, 0.6, rho));
        float w = max(fwidth(rho) * 1.3, 0.012);
        float alpha = smoothstep(rr, rr - w, rho);
        if (alpha < 0.003) discard;
        float th = sqrt(max(rr * rr - rho * rho, 0.0) / a);
        float t = tc - th;
        vec3 P = cameraPosition + rd * t;
        vec3 N = normalize(toNormal(o + dl * t));
        vec3 up = vUp;
        // cumulus have flat bases: below the cut the ray meets the flat underside instead (or nothing)
        float dv0 = dot(P - vHc, up);
        float cut = 0.0;
        if (dv0 < -uFlatBottom) {
          float ru = dot(rd, up);
          if (ru <= 0.0) discard;
          float tp = t + (-uFlatBottom - dv0) / ru;
          if (tp > tc + th) discard;
          t = tp; P = cameraPosition + rd * t; N = -up; cut = 1.0;
        }
        float R = vInfo.x, H = vInfo.y;
        vec3 d = P - vHc;
        float dv = dot(d, up);
        vec3 dh = d - up * dv;
        // the heap's dome normal (an ellipsoid R wide and H high), so the whole mass is lit as one
        vec3 HN = normalize(dh * (H / R) + up * (dv * (R / H) + 0.001));
        float hv = clamp(dv / H, -0.3, 1.1);
        vec3 Ns = normalize(HN * 0.6 + N * 0.4);
        float dist = t;
        float ndl = dot(Ns, uSun);
        float nup = dot(Ns, up);
        // toon light: a clear terminator over a gentle wrap, broken a little by paint noise
        float wl = ndl * 0.5 + 0.5 + nup * 0.12 + (pn - 0.5) * 0.05;
        float lit = smoothstep(uTerm - 0.05, uTerm + 0.05, wl);
        float soft = smoothstep(uTerm, 1.0, wl);
        // occlusion: toward the heap's base, in the baked tucks, and on the lower rim of each billow
        float rimN = rho / rr;
        float down = smoothstep(0.25, -0.55, dot(N, up));
        float tuck = smoothstep(0.5, 0.98, rimN) * down;
        float baseK = smoothstep(-0.12, 0.55, hv);
        float open = vInfo.z;
        float ao = clamp(open * (1.0 - 0.6 * tuck) * mix(0.45, 1.0, baseK), 0.0, 1.0) * (1.0 - 0.5 * cut);
        // the shadow side: deep periwinkle at the base and in the tucks, lavender bellies, sky-lit where it faces up
        vec3 shade = mix(uDeep, uBelly, baseK * mix(0.5, 1.0, open));
        shade = mix(shade, uSkyShade, smoothstep(0.1, 0.9, nup) * 0.55 * open);
        shade = mix(uDeep * 0.9, shade, smoothstep(0.0, 0.7, ao));
        // the lit side: warm shoulder to cream crown, glowing at the top, a half tone where it is occluded
        vec3 lightC = mix(uWarm, uTop, smoothstep(0.2, 0.85, soft) * smoothstep(0.0, 0.7, hv + 0.2)) * mix(1.0, uGain, smoothstep(0.3, 0.9, hv));
        lightC = mix(uMid, lightC, smoothstep(0.25, 0.75, ao));
        // looking toward a low sun, crowns glow with light scattered through their thin tops
        float fwd = max(dot(rd, uSun), 0.0);
        float f3 = fwd * fwd * fwd, f12 = pow(fwd, 12.0);
        lit = max(lit, smoothstep(0.0, 0.7, nup) * smoothstep(0.1, 0.7, hv) * f3 * clamp(uGlowK - 0.4, 0.0, 1.0));
        vec3 col = mix(shade, lightC, lit * smoothstep(0.12, 0.45, ao));
        // a painted contour on the underside of each billow, where it lies over the mass behind
        col = mix(col, shade * 0.93, smoothstep(0.84, 0.98, rimN) * down * 0.55);
        // a bright fringe where a lit billow turns away
        col += uRim * smoothstep(0.82, 1.0, rimN) * lit * (1.0 - down) * 0.06;
        // toward the sun: silver linings on thin edges and the mass's silhouette, and warm light scattered through
        float massEdge = 1.0 - abs(dot(HN, rd));
        float edge = smoothstep(0.72, 1.0, rimN) * (0.2 + 1.2 * smoothstep(0.4, 0.95, massEdge));
        col += uGlow * uGlowK * (f3 * edge * 0.9 + f12 * massEdge * massEdge * 0.9 + f3 * 0.08 * (1.0 - lit) * open);
        // watercolour variation
        col *= 1.0 + (pn - 0.5) * 0.07 + (vSeed - 0.5) * 0.035;
        // aerial haze: further is paler and bluer, fading into the horizon; toward the sun the haze glows
        float f = 1.0 - exp(-pow(dist * uHazeD * vInfo.w, 1.5));
        vec3 haze = mix(uHaze, uGlow * 1.05, clamp(pow(fwd, 8.0) * uGlowK * 0.35, 0.0, 0.5));
        col = mix(col, haze, f);
        alpha *= smoothstep(uNearFade, uNearFade * 2.5, dist) * vFade;
        gl_FragColor = vec4(col, alpha);
        #ifdef PUFF_DEPTH
          vec4 cp = projectionMatrix * viewMatrix * vec4(P, 1.0);
          gl_FragDepth = clamp(cp.z / cp.w * 0.5 + 0.5, 0.0, 1.0);
        #endif
      }`,
  });
  return cloudBlend(m);
}

// ------------------------------------------------------------------ geometry

let quad: THREE.BufferGeometry | undefined;
/** The impostor quad every puff is drawn with (corners at +-1; the vertex shader sizes and turns it). */
export function puffQuad() {
  if (quad) return quad;
  quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return quad;
}

// ------------------------------------------------------------------ heaps

/** Collects puffs, then becomes a PuffLayer. */
export class PuffBuilder {
  mats: number[] = [];
  heaps: number[] = [];
  infos: number[] = [];
  private m = new THREE.Matrix4();
  get count() { return this.infos.length / 4; }
  add(pos: THREE.Vector3, quat: THREE.Quaternion, scale: THREE.Vector3, heapC: THREE.Vector3, heapR: number, heapH: number, seed: number, haze = 1, open = 1) {
    this.m.compose(pos, quat, scale);
    this.mats.push(...this.m.elements);
    this.heaps.push(heapC.x, heapC.y, heapC.z, heapR);
    this.infos.push(heapH, seed, open, haze);
  }
  /**
   * Bake occlusion into puffs [from, count): a puff with others piled over and around it sits in a tuck.
   * `up` is the heap's up; openness 1 = in the open, down to 0.3 = deep in a fold.
   */
  bakeOcclusion(from: number, up: THREE.Vector3) {
    const n = this.count;
    const e = this.mats;
    for (let i = from; i < n; i++) {
      const xi = e[i * 16 + 12], yi = e[i * 16 + 13], zi = e[i * 16 + 14];
      const ri = Math.hypot(e[i * 16], e[i * 16 + 1], e[i * 16 + 2]);
      let occ = 0;
      for (let j = from; j < n; j++) {
        if (j === i) continue;
        const dx = e[j * 16 + 12] - xi, dy = e[j * 16 + 13] - yi, dz = e[j * 16 + 14] - zi;
        const rj = Math.hypot(e[j * 16], e[j * 16 + 1], e[j * 16 + 2]);
        const dd = Math.hypot(dx, dy, dz);
        const reach = (ri + rj) * 1.05;
        if (dd > reach) continue;
        const above = (dx * up.x + dy * up.y + dz * up.z) / Math.max(dd, 1e-3);
        // neighbours above weigh most; bigger neighbours shade more
        occ += (1 - dd / reach) * Math.max(0, above * 0.8 + 0.25) * Math.min(1.6, rj / ri);
      }
      this.infos[i * 4 + 2] = Math.max(0.3, 1 - occ * 0.32);
    }
  }
}

const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0);

/** Tangent frame around `up`. */
export function tangentFrame(up: THREE.Vector3, t1: THREE.Vector3, t2: THREE.Vector3) {
  t1.set(1, 0, 0);
  if (Math.abs(up.x) > 0.9) t1.set(0, 0, 1);
  t1.sub(_p.copy(up).multiplyScalar(t1.dot(up))).normalize();
  t2.crossVectors(up, t1);
}

export interface CumulusShape {
  /** Detail: 1 = near (many small billows) .. 0.2 = far (a few big puffs). Default 1. */
  detail?: number;
  /** Outward spread of the flattened skirt (default 1); 0 = no skirt. */
  skirt?: number;
  /** How flat the body puffs are (height / width, default 0.82). */
  flat?: number;
  /** Crown lean, as a fraction of R (default random up to 0.22). */
  lean?: number;
  /** Small crown billows, as a multiplier (default 1). */
  billows?: number;
  /** Light the puffs as part of a bigger mass than this heap (e.g. a towering cumulus). */
  mass?: { base: THREE.Vector3; R: number; H: number };
  /** Haze multiplier (1 = normal). */
  haze?: number;
  /** Skip the baked occlusion (cheaper for the many far heaps). */
  noBake?: boolean;
  /** Leave out the core puff that fills the dome (default false). */
  noCore?: boolean;
  /** Scales the size of the billows (default 1; smaller means more, finer billows). */
  puff?: number;
}

/**
 * One cumulus heap: a flattened skirt round its foot, then a cauliflower body built in rings up a dome whose
 * puffs get smaller as they climb, a cap, and small billows studding the crown. `base` is the heap's foot,
 * `R` its radius, `H` its height (to the top of the crown). Returns the number of puffs added.
 */
export function addCumulus(b: PuffBuilder, base: THREE.Vector3, up: THREE.Vector3, R: number, H: number, rnd: () => number, shape: CumulusShape = {}) {
  const from = b.count;
  tangentFrame(up, _t1, _t2);
  _q.setFromUnitVectors(_Y, up);
  const detail = shape.detail ?? 1;
  const flat = shape.flat ?? 0.82;
  const haze = shape.haze ?? 1;
  const m = shape.mass;
  // bigger heaps carry relatively smaller billows; low detail uses fewer, bigger puffs
  const rel = Math.min(0.6, 0.4 * Math.sqrt(14 / Math.max(R, 3)) / Math.sqrt(Math.max(detail, 0.05))) * (shape.puff ?? 1);
  const leanA = rnd() * Math.PI * 2, leanD = R * (shape.lean ?? 0.22 * rnd());
  const lx = Math.cos(leanA) * leanD, lz = Math.sin(leanA) * leanD;
  // the dome's profile: wide steep sides, a rounded top
  const prof = (f: number) => R * Math.pow(Math.max(0, 1 - Math.pow(f, 2.2)), 0.55);
  const put = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    _p.copy(base).addScaledVector(_t1, x).addScaledVector(_t2, z).addScaledVector(up, y);
    _qy.setFromAxisAngle(_Y, rnd() * Math.PI * 2);
    _s.set(sx, sy, sz);
    b.add(_p, _qy.premultiply(_q), _s, m ? m.base : base, m ? m.R : R, m ? m.H : H, rnd() * 100, haze);
  };
  // a core that fills the dome, so no sky shows through between billows
  if (!shape.noCore) put(lx * 0.3, H * 0.3, lz * 0.3, R * 0.7, Math.min(H * 0.55, R * 0.8), R * 0.7);
  // the skirt: wide flat puffs round the foot, spreading out a little past the dome
  const sk = shape.skirt ?? 1;
  if (sk > 0) {
    const s0 = R * rel * 1.05;
    const nS = Math.max(4, Math.round((2 * Math.PI * R) / (s0 * 1.5)));
    const a0 = rnd() * Math.PI * 2;
    for (let i = 0; i < nS; i++) {
      const a = a0 + (i / nS) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
      const s = s0 * (0.8 + rnd() * 0.45);
      const rho = R * (0.82 + 0.18 * sk) - s * 0.55 + rnd() * s * 0.3;
      put(Math.cos(a) * rho, s * 0.12, Math.sin(a) * rho, s * 1.25, s * 0.42, s * 1.1);
    }
  }
  // the body: rings up the dome, smaller and crisper toward the top, sunk a little under its surface
  let f = 0.1 + rnd() * 0.06;
  let lastRho = R;
  while (f < 0.97) {
    const s = R * rel * (1 - 0.5 * f) * (0.95 + rnd() * 0.1);
    const rho = prof(f);
    if (rho < s * 0.75) break;
    lastRho = rho;
    const n = Math.max(3, Math.round((2 * Math.PI * rho) / (s * 1.25)));
    const a0 = rnd() * Math.PI * 2;
    // the dome's normal here (x / R^2, y / H^2), to sink the puffs along
    const nh = rho / (R * R), nv = (f * H) / (H * H), nl = Math.hypot(nh, nv);
    const step = Math.max(0.13, (s * 0.7) / H);
    for (let i = 0; i < n; i++) {
      const a = a0 + ((i + (rnd() - 0.5) * 0.5) / n) * Math.PI * 2;
      const ss = s * (0.78 + rnd() * 0.44);
      const sink = ss * 0.45;
      // (each puff slides up or down its ring, so the rings never read as tiers)
      const ff = Math.min(0.97, Math.max(0.04, f + (rnd() - 0.5) * step * 0.9));
      const rf = prof(ff);
      const r1 = rf - (nh / nl) * sink;
      put(Math.cos(a) * r1 + lx * ff * ff, ff * H - (nv / nl) * sink, Math.sin(a) * r1 + lz * ff * ff, ss, ss * flat * (0.9 + rnd() * 0.2), ss * (0.9 + rnd() * 0.2));
    }
    f += step;
  }
  // the cap over the last ring's hole
  const cs = Math.max(lastRho * 0.75, R * rel * 0.5);
  const nC = lastRho > R * rel * 1.6 ? 3 : 1;
  for (let i = 0; i < nC; i++) {
    const a = (i / nC) * Math.PI * 2 + rnd(), rr = nC > 1 ? lastRho * 0.4 : 0;
    const c = nC > 1 ? cs * 0.7 : cs;
    put(lx + Math.cos(a) * rr, H - c * flat * 0.8, lz + Math.sin(a) * rr, c * (0.9 + rnd() * 0.2), c * flat, c * (0.9 + rnd() * 0.2));
  }
  // small billows half-sunk into the crown: the cauliflower texture of a cumulus top
  const nB = Math.round((shape.billows ?? 1) * 14 * detail * Math.min(1.6, R / 14));
  for (let i = 0; i < nB; i++) {
    const ff = 0.45 + rnd() * 0.55;
    const pr = prof(ff);
    const rho = pr * (0.55 + rnd() * 0.45);
    const a = rnd() * Math.PI * 2;
    // on the dome's surface over this point
    const ys = H * Math.pow(Math.max(0, 1 - Math.pow(rho / R, 1 / 0.55 * 1)), 1 / 2.2) * 0.96;
    const s = R * rel * (0.42 - 0.12 * ff) * (0.8 + rnd() * 0.4);
    put(Math.cos(a) * rho + lx * ff * ff, ys - s * 0.35, Math.sin(a) * rho + lz * ff * ff, s, s * 0.88, s);
  }
  if (!shape.noBake) b.bakeOcclusion(from, up);
  // the core only shows where billows leave room: keep it fairly open, not a dark lump
  if (!shape.noCore) b.infos[from * 4 + 2] = 0.85;
  return b.count - from;
}

/**
 * A towering cumulus: a flat dark base under a broad foot, one tall cauliflower dome whose billows shrink and
 * crisp up toward the top, and a few shoulder heaps bulging from its flanks, all lit as one tall mass (so it has
 * a clear sunlit side and a shaded side). `base` is the foot's centre, `R` the foot's radius, `H` the height of
 * the top. Returns the mass it is lit as.
 */
export function addTower(b: PuffBuilder, base: THREE.Vector3, up: THREE.Vector3, R: number, H: number, rnd: () => number, haze = 1) {
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  tangentFrame(up, t1, t2);
  const mass = { base: base.clone(), R: R * 0.85, H };
  // the foot: a broad, flat heap
  addCumulus(b, base, up, R * 1.15, H * 0.22, rnd, { detail: 0.45, skirt: 1.2, mass, haze, billows: 0.4, lean: 0.05 });
  // the column: one tall dome, leaning a little
  const p = new THREE.Vector3().copy(base).addScaledVector(up, H * 0.06);
  addCumulus(b, p, up, R * 0.82, H * 0.94, rnd, { detail: 0.55, skirt: 0, mass, haze, billows: 1.6, lean: 0.15, flat: 0.92, puff: 0.85 });
  // shoulders bulging from its flanks, smaller as they climb
  const nS = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < nS; i++) {
    const f = 0.25 + (i / nS) * 0.45 + rnd() * 0.08;
    const a = rnd() * Math.PI * 2, rr = R * 0.82 * Math.pow(1 - Math.pow(f, 2.2), 0.55) * 0.75;
    p.copy(base).addScaledVector(up, H * f - R * 0.2).addScaledVector(t1, Math.cos(a) * rr).addScaledVector(t2, Math.sin(a) * rr);
    const sr = R * (0.55 - f * 0.3);
    addCumulus(b, p, up, sr, sr * 1.1, rnd, { detail: 0.5, skirt: 0, mass, haze, billows: 1, flat: 0.92 });
  }
  return mass;
}

/** Order a non-indexed geometry's triangles back to front as seen from `eye` (for depth-write-free solids seen from one side). */
export function sortTriangles(g: THREE.BufferGeometry, eye: THREE.Vector3) {
  const names = Object.keys(g.attributes);
  const pos = g.getAttribute('position');
  const nt = pos.count / 3;
  const d = new Float32Array(nt);
  for (let t = 0; t < nt; t++) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) { x += pos.getX(t * 3 + k); y += pos.getY(t * 3 + k); z += pos.getZ(t * 3 + k); }
    d[t] = (x / 3 - eye.x) ** 2 + (y / 3 - eye.y) ** 2 + (z / 3 - eye.z) ** 2;
  }
  const order = Array.from({ length: nt }, (_, i) => i).sort((a, b) => d[b] - d[a]);
  for (const nm of names) {
    const a = g.getAttribute(nm) as THREE.BufferAttribute, w = a.itemSize;
    const src = (a.array as Float32Array).slice();
    const dst = a.array as Float32Array;
    order.forEach((t, j) => dst.set(src.subarray(t * 3 * w, t * 3 * w + 3 * w), j * 3 * w));
    a.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ a culled, sorted layer of puffs

const _m4 = new THREE.Matrix4();
const _fr = new THREE.Frustum();

interface PuffDraw { mesh: THREE.InstancedMesh; aHeap: THREE.InstancedBufferAttribute; aInfo: THREE.InstancedBufferAttribute }
function puffDraw(mat: THREE.ShaderMaterial, n: number): PuffDraw {
  const g = puffQuad().clone();
  const aHeap = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  const aInfo = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  aHeap.setUsage(THREE.DynamicDrawUsage); aInfo.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aHeap', aHeap);
  g.setAttribute('aInfo', aInfo);
  const mesh = new THREE.InstancedMesh(g, mat, n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return { mesh, aHeap, aInfo };
}

/**
 * An InstancedMesh of puff impostors that, each frame, keeps only the puffs in view (and on this side of the
 * planet) and draws them back to front. All puff data lives in the layer's local space (keep the layer unscaled).
 * With `split`, puffs nearer than `nearDist` go to a second mesh drawn after the first (to slip a far solid in
 * between them: the near mesh's renderOrder is the layer's + 0.5).
 */
export class PuffLayer {
  /** The main mesh (add `object` to the scene, which also holds the near mesh). */
  mesh: THREE.InstancedMesh;
  readonly object: THREE.Object3D;
  readonly total: number;
  private mats: Float32Array;
  private heaps: Float32Array;
  private infos: Float32Array;
  /** Puff centres (local) and bounding radii. */
  cx: Float32Array; cy: Float32Array; cz: Float32Array; rad: Float32Array;
  private order: Uint32Array;
  private key: Float32Array;
  private packed = new Float64Array(0);
  private far: PuffDraw;
  private near?: PuffDraw;
  private nearD = 0;
  constructor(b: PuffBuilder, mat: THREE.ShaderMaterial, split = false) {
    this.total = b.count;
    this.mats = new Float32Array(b.mats); this.heaps = new Float32Array(b.heaps); this.infos = new Float32Array(b.infos);
    const n = this.total;
    this.cx = new Float32Array(n); this.cy = new Float32Array(n); this.cz = new Float32Array(n); this.rad = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const e = this.mats.subarray(i * 16, i * 16 + 16);
      this.cx[i] = e[12]; this.cy[i] = e[13]; this.cz[i] = e[14];
      const s = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
      this.rad[i] = s * 1.3;
    }
    this.order = new Uint32Array(n);
    this.key = new Float32Array(n);
    this.far = puffDraw(mat, n);
    this.mesh = this.far.mesh;
    if (split) {
      this.near = puffDraw(mat, n);
      const g = new THREE.Group();
      g.add(this.far.mesh, this.near.mesh);
      this.object = g;
    } else this.object = this.mesh;
  }

  /** Puffs nearer than this (metres) go to the near mesh. */
  set nearDist(d: number) { this.nearD = d; }
  set renderOrder(r: number) { this.far.mesh.renderOrder = r; if (this.near) this.near.mesh.renderOrder = r + 0.5; }
  /** Puffs drawn last frame. */
  get drawn() { return this.far.mesh.count + (this.near?.mesh.count ?? 0); }
  /** Triangles drawn last frame (two per puff). */
  get triangles() { return this.drawn * 2; }

  /** Show every puff unsorted (until the next refresh). */
  showAll() { this.write(this.order.map((_, i) => i), this.total, this.total); }

  /**
   * Cull and sort for `camera`. `keep(i, camL)` can reject more puffs (e.g. those behind the planet);
   * camL is the camera position in layer space. Call after the layer's matrixWorld is current.
   * `margin` widens the view by that fraction of each puff's distance, for layers refreshed only every few
   * frames (so turning the camera does not show their edges).
   */
  refresh(camera: THREE.Camera, keep?: (i: number, camL: THREE.Vector3) => boolean, margin = 0) {
    const mw = this.mesh.matrixWorld;
    _m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mw);
    _fr.setFromProjectionMatrix(_m4);
    const camL = _camL.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(_m4.copy(mw).invert());
    const planes = _fr.planes;
    let n = 0;
    const { cx, cy, cz, rad, order, key } = this;
    for (let i = 0; i < this.total; i++) {
      const x = cx[i], y = cy[i], z = cz[i];
      const r = margin > 0 ? rad[i] + margin * Math.sqrt((x - camL.x) ** 2 + (y - camL.y) ** 2 + (z - camL.z) ** 2) : rad[i];
      let inside = true;
      for (let p = 0; p < 6; p++) {
        const pl = planes[p];
        if (pl.normal.x * x + pl.normal.y * y + pl.normal.z * z + pl.constant < -r) { inside = false; break; }
      }
      if (!inside) continue;
      if (keep && !keep(i, camL)) continue;
      const dx = x - camL.x, dy = y - camL.y, dz = z - camL.z;
      // sort by distance to the puff's front, so a big core does not jump in front of the billows on it
      key[i] = Math.sqrt(dx * dx + dy * dy + dz * dz) - r * 0.4;
      order[n++] = i;
    }
    // sort far to near: pack (quantised distance, index) into doubles and use the native numeric sort
    const pk = this.packed.length >= n ? this.packed : (this.packed = new Float64Array(this.total));
    for (let j = 0; j < n; j++) { const i = order[j]; pk[j] = Math.floor((key[i] + 200) * 64) * 262144 + i; }
    const ps = pk.subarray(0, n);
    ps.sort();
    const sub = order.subarray(0, n);
    for (let j = 0; j < n; j++) sub[j] = ps[n - 1 - j] % 262144;
    // the far ones first; the first one nearer than nearD starts the near mesh
    let split = n;
    if (this.near) { split = 0; while (split < n && key[sub[split]] > this.nearD) split++; }
    this.write(sub, split, n);
    return camL;
  }

  private write(sub: ArrayLike<number>, split: number, n: number) {
    const fill = (d: PuffDraw, from: number, to: number) => {
      const im = d.mesh.instanceMatrix.array as Float32Array;
      const ah = d.aHeap.array as Float32Array, ai = d.aInfo.array as Float32Array;
      for (let j = from; j < to; j++) {
        const i = sub[j], k = j - from;
        im.set(this.mats.subarray(i * 16, i * 16 + 16), k * 16);
        ah.set(this.heaps.subarray(i * 4, i * 4 + 4), k * 4);
        ai.set(this.infos.subarray(i * 4, i * 4 + 4), k * 4);
      }
      d.mesh.count = to - from;
      d.mesh.instanceMatrix.needsUpdate = true;
      d.aHeap.needsUpdate = true; d.aInfo.needsUpdate = true;
    };
    fill(this.far, 0, split);
    if (this.near) fill(this.near, split, Math.max(split, n));
  }
}
const _camL = new THREE.Vector3();
