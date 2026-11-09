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
 * Each puff knows the mass it belongs to, so the shader blends the puff's own normal with the mass's dome
 * normal: every billow keeps a little light and shadow, but the whole mass reads as one cloud. The light is a
 * two-band toon ramp with a blended, noise-broken edge (shadow, a half-tone band, light), so billows never split
 * in half like beach balls; thin rims glow a little with light passing through, undersides catch a warm bounce,
 * internal fluff noise breaks up every surface, and the outermost puffs (skirts, rim detail) dissolve into wisps.
 * Low parts sink into mist (valleys read deep), and distance fades everything into the sky's haze.
 *
 * Clouds are sorted transparent puffs that never write depth, so the finish pass draws no ink on them. Their
 * blending clears the render target's alpha where they cover (cloudBlend, always within 0..1); the finish
 * pass, with FINISH_CLOUD_MASK on, drops the ink there, so the outlines of things behind clouds do not bleed
 * through. A PuffLayer culls its puffs against the view (and the planet's horizon) and sorts the
 * survivors back to front every frame on the CPU, which is cheap for a few thousand puffs.
 */

// ------------------------------------------------------------------ palettes

/** Colours of a cloud at one light (sRGB hex). */
export interface CloudPalette {
  /** Sunlit crown, its warm shoulder, and the lit-but-occluded half tone. */
  top: string; warm: string; mid: string;
  /** Shadow side: the belly, the deep base and tucks, and the sky-lit (up-facing) shadow. */
  belly: string; deep: string; skyShade: string;
  rim: string; glow: string;
  /** The hottest tone, only on the very tops facing the sun (golden hour), and how much of it. */
  crown: string; crownK: number;
  /** Warm light bounced up onto the undersides, and the mist the valleys sink into. */
  bounce: string; mist: string;
  /** How strongly clouds glow at their edges when you look toward the sun (the silver lining). */
  glowK: number;
  /** Brightness of the very tops of the sunlit crowns (above 1 they start to bloom). */
  gain: number;
  /** Where the terminator sits on the wrapped light (higher = more of the heap in shadow). */
  term: number;
}

// (the lab's and the game's bloom threshold is ~0.96 linear: the crowns sit just under it, and only the very
// tops are pushed over it by `gain`, so the bloom stays a glint on the crowns rather than a veil)
export const MIDDAY: CloudPalette = {
  top: '#f4f5f8', warm: '#f1eee8', mid: '#d9dcef',
  belly: '#b3bde9', deep: '#8f9fdb', skyShade: '#c9d4f4',
  rim: '#ffffff', glow: '#fff3df',
  crown: '#ffffff', crownK: 0,
  bounce: '#e6e2e4', mist: '#ccd8f2',
  glowK: 0.25, gain: 1.1, term: 0.33,
};
export const GOLDEN: CloudPalette = {
  top: '#f6eee4', warm: '#f4dcc6', mid: '#e3d0d0',
  belly: '#bab0cb', deep: '#9c93b4', skyShade: '#d0c7da',
  rim: '#fff0d6', glow: '#ffd9a4',
  crown: '#ffcd98', crownK: 0.75,
  bounce: '#efcfb6', mist: '#e6d6d2',
  glowK: 1.35, gain: 1.1, term: 0.4,
};

/** Uniforms every cloud material shares with its CloudSea (one palette drives them all). */
export function cloudUniforms() {
  const c = (k: keyof CloudPalette) => ({ value: new THREE.Color(MIDDAY[k] as string) });
  return {
    uSun: PAINT.uSun,
    uTime: { value: 0 },
    uTop: c('top'), uWarm: c('warm'), uMid: c('mid'),
    uBelly: c('belly'), uDeep: c('deep'), uSkyShade: c('skyShade'),
    uRim: c('rim'), uGlow: c('glow'), uCrown: c('crown'), uBounce: c('bounce'), uMist: c('mist'),
    uCrownK: { value: MIDDAY.crownK },
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
  mix('crown', u.uCrown.value); mix('bounce', u.uBounce.value); mix('mist', u.uMist.value);
  const num = (key: 'glowK' | 'gain' | 'term' | 'crownK') => a[key] + (b[key] - a[key]) * k;
  u.uGlowK.value = num('glowK'); u.uGain.value = num('gain'); u.uTerm.value = num('term'); u.uCrownK.value = num('crownK');
}

/**
 * Cloud blending: ordinary alpha blending for colour, while the alpha channel is cleared to 0 wherever a cloud
 * fragment lands. Opaque things leave alpha at 1 (and the sky glow clears it over the open sky), so afterwards
 * alpha < 0.5 means "cloud or sky here", and the finish pass (FINISH_CLOUD_MASK) draws ink only on solids
 * that no cloud covers. Alpha always stays within 0..1.
 */
export function cloudBlend<M extends THREE.Material>(m: M) {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendEquationAlpha = THREE.AddEquation;
  m.userData.cloudBlend = true;
  return setCloudMask(m, true);
}

/**
 * Whether a cloud material writes the ink mask into alpha (on: alpha cleared where it covers). Turn it off
 * wherever nothing consumes the mask (FINISH_CLOUD_MASK off): the clouds then leave alpha opaque, so a pass or
 * canvas that respects alpha never shows holes through them.
 */
export function setCloudMask<M extends THREE.Material>(m: M, on: boolean) {
  m.blendSrcAlpha = on ? THREE.ZeroFactor : THREE.OneFactor;
  m.blendDstAlpha = on ? THREE.ZeroFactor : THREE.OneMinusSrcAlphaFactor;
  m.needsUpdate = true;
  return m;
}

// ------------------------------------------------------------------ gaps: openings in the sea onto the lands below

/**
 * Openings in the cloud sea (onto the next world's lands far below). A gap space holds up to 8 round gaps
 * (centre xyz, radius in metres) with a wobbly, irregular edge; gapAt(world point) is > 0 inside a gap and < 0
 * outside (about -1 far away). Flat gap spaces ignore y; spherical ones (the shell) measure on a sphere of
 * radius uGapR. Floors open where gapAt > 0, and puffs whose mass stands in a gap fade away.
 * One GapUniforms object is shared by every material of one gap space; uGapM maps world to gap space.
 */
export function gapUniforms(mode: 'flat' | 'sphere', radius = 1, wobble = 1) {
  return {
    uGaps: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 1)) },
    uNGaps: { value: 0 },
    uGapM: { value: new THREE.Matrix4() },
    uGapMode: { value: mode === 'sphere' ? 2 : 1 },
    uGapR: { value: radius },
    uGapS: { value: wobble },
  };
}
export type GapUniforms = ReturnType<typeof gapUniforms>;

export const GAP_GLSL = /* glsl */ `
  uniform vec4 uGaps[8]; uniform int uNGaps; uniform mat4 uGapM; uniform float uGapMode, uGapR, uGapS;
  float gapAt(vec3 w){
    if (uNGaps == 0) return -1.0;
    vec3 p = (uGapM * vec4(w, 1.0)).xyz;
    if (uGapMode > 1.5) p = normalize(p) * uGapR; else p.y = 0.0;
    float g = -1.0;
    for (int i = 0; i < 8; i++) { if (i >= uNGaps) break; vec4 G = uGaps[i]; g = max(g, 1.0 - length(p - G.xyz) / G.w); }
    vec3 s = p * uGapS;
    return g + 0.17 * sin(s.x * 0.11 + 1.7 * sin(s.z * 0.07)) * sin(s.z * 0.1 + 1.9 * sin(s.y * 0.05 + s.x * 0.06))
             + 0.08 * sin(s.x * 0.29 + s.z * 0.23 + s.y * 0.17);
  }
`;

/** The same field on the CPU (p in gap space). */
export function gapAtJS(u: GapUniforms, p: THREE.Vector3) {
  const n = u.uNGaps.value;
  if (n === 0) return -1;
  const q = p.clone();
  if (u.uGapMode.value > 1.5) q.setLength(u.uGapR.value); else q.y = 0;
  let g = -1;
  for (let i = 0; i < n; i++) { const G = u.uGaps.value[i]; g = Math.max(g, 1 - Math.hypot(q.x - G.x, q.y - G.y, q.z - G.z) / G.w); }
  const s = q.multiplyScalar(u.uGapS.value);
  return g + 0.17 * Math.sin(s.x * 0.11 + 1.7 * Math.sin(s.z * 0.07)) * Math.sin(s.z * 0.1 + 1.9 * Math.sin(s.y * 0.05 + s.x * 0.06))
           + 0.08 * Math.sin(s.x * 0.29 + s.z * 0.23 + s.y * 0.17);
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
  /**
   * Test against solids at the ray-hit depth, not the impostor quad's (near layers and pads), so puffs meet
   * islands correctly. Puffs never write depth: written cloud depth would give the finish pass's ink depth
   * jumps on every cloud silhouette, wherever the bloom lifts the alpha mask.
   */
  depth?: boolean;
  /**
   * Mist: below `top` (metres above the shell's radius uMistR, or above the flat frame's origin) puffs sink into
   * the mist colour, fully `depth` metres lower. Default: no mist.
   */
  mist?: { top: number; depth: number };
  /** The puffs squash as one soft mass (cloud pads): see CloudPad. */
  squash?: boolean;
  /** Openings in the sea: masses standing in a gap fade away (shared gap uniforms). */
  gaps?: GapUniforms;
}

/**
 * One material per layer: the shared uniforms plus the layer's own frame.
 * Per instance: instanceMatrix (the ellipsoid), aHeap (mass base point, mass radius), aInfo (mass height,
 * seed + 128 * wisp level 0..7, openness 0..1 from the baked occlusion, haze multiplier).
 */
export function puffMaterial(shared: CloudUniforms, opts: PuffMaterialOptions = {}) {
  const defines: Record<string, number> = {};
  if (opts.depth) defines.PUFF_DEPTH = 1;
  if (opts.squash) defines.PUFF_SQUASH = 1;
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    defines,
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
      // a lift of the wrapped light (far layers: more of each mass in light) and the weight of each puff's own normal
      uLift: { value: 0 },
      // masses standing in an opening fade out (layers whose masses move over the openings); 0 = off
      uGapFade: { value: 1 },
      uOwn: { value: 0.38 },
      uMistR: { value: 0 },
      uMistTop: { value: opts.mist?.top ?? -1e5 },
      uMistDepth: { value: opts.mist?.depth ?? 1 },
      // squash (pads): the squash now and 0.06 s, 0.12 s ago; the pad's top, height, radius and base (local)
      uSq: { value: new THREE.Vector3() },
      uSqH: { value: new THREE.Vector4(1, 1, 1, 0) },
      ...(opts.gaps ?? gapUniforms('flat')),
    },
    vertexShader: /* glsl */ `
      attribute vec4 aHeap;   // mass base point (layer space) and mass radius
      attribute vec4 aInfo;   // mass height, seed + 128 * wisp, openness, haze multiplier
      uniform float uTime, uBillow, uFlat;
      uniform vec3 uCenter, uFlatUp, uRingO; uniform vec4 uRing;
      uniform vec3 uSq; uniform vec4 uSqH; uniform float uGapFade;
      varying vec3 vW, vC, vHc, vUp;
      varying vec3 vI0, vI1, vI2;   // rows of the inverse ellipsoid frame (world -> unit sphere)
      varying vec4 vInfo;           // mass R, mass H, openness, haze multiplier
      varying float vSeed, vFade, vWisp;
      ${GAP_GLSL}
      void main(){
        float wl = floor(aInfo.y / 128.0);
        float seed = aInfo.y - wl * 128.0;
        vWisp = wl / 7.0;
        mat4 M = modelMatrix * instanceMatrix;
        vec3 hc = (modelMatrix * vec4(aHeap.xyz, 1.0)).xyz;
        #ifdef PUFF_SQUASH
          // the whole cushion gives as one soft mass: the top first, the lower billows a moment later; it
          // flattens onto its base and bulges outward at the rim (volume kept, roughly)
          vec3 lc = instanceMatrix[3].xyz;
          float lag = clamp((uSqH.x - lc.y) / uSqH.y, 0.0, 1.0);
          float x = lag < 0.5 ? mix(uSq.x, uSq.y, lag * 2.0) : mix(uSq.y, uSq.z, lag * 2.0 - 1.0);
          float sy = 1.0 - x * 0.55;
          float sxz = inversesqrt(max(sy, 0.3)) * (1.0 + max(x, 0.0) * 0.22 * clamp(length(lc.xz) / uSqH.z, 0.0, 1.2));
          mat4 S = mat4(sxz, 0.0, 0.0, 0.0,  0.0, sy, 0.0, 0.0,  0.0, 0.0, sxz, 0.0,  0.0, uSqH.w * (1.0 - sy), 0.0, 1.0);
          M = modelMatrix * S * instanceMatrix;
          hc = (modelMatrix * S * vec4(aHeap.xyz, 1.0)).xyz;
        #endif
        mat3 A = mat3(M);
        vec3 c = M[3].xyz;
        vec3 up = uFlat > 0.5 ? uFlatUp : normalize(hc - uCenter);
        float H = max(aInfo.x, 0.1), R = max(aHeap.w, 0.1);
        float hv = dot(c - hc, up) / H;
        // billowing: crowns swell and roll slowly; low puffs barely move
        float k = uBillow * (0.35 + 0.65 * clamp(hv, 0.0, 1.0));
        float r0 = length(A[1]);
        float ph = uTime * 0.42 + seed * 40.0;
        A *= 1.0 + k * (0.06 * sin(ph) + 0.03 * sin(uTime * 0.91 + seed * 13.0));
        vec3 side = normalize(cross(up, abs(up.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 fw = cross(side, up);
        c += k * r0 * (up * 0.12 * sin(ph * 0.8 + 1.3) + side * 0.1 * sin(uTime * 0.27 + seed * 7.0) + fw * 0.08 * cos(uTime * 0.31 + seed * 3.0));
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
        // masses standing in an opening of the sea dissolve
        if (uGapFade > 0.5) vFade *= 1.0 - smoothstep(0.0, 0.1, gapAt(hc));
        // the camera inside the puff, or the puff faded away: collapse the quad
        if (d < r * 1.01 || vFade < 0.004) wp = cameraPosition - f;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uTop, uWarm, uMid, uBelly, uDeep, uSkyShade, uRim, uGlow, uHaze, uCrown, uBounce, uMist;
      uniform vec3 uCenter, uFlatUp, uRingO;
      uniform float uGlowK, uHazeD, uNearFade, uTime, uGain, uTerm, uErode, uFlatBottom, uCrownK, uFlat;
      uniform float uMistR, uMistTop, uMistDepth, uLift, uOwn;
      uniform mat4 projectionMatrix;
      varying vec3 vW, vC, vHc, vUp;
      varying vec3 vI0, vI1, vI2;
      varying vec4 vInfo;
      varying float vSeed, vFade, vWisp;
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
        // the rim: eroded by slow rolling noise into little scallops, then a crisp brushed edge;
        // wispy puffs are eroded deeper, with a soft, torn edge
        vec3 qd = q / max(rho, 1e-4);
        float sd = vSeed * 31.0;
        float pn = pNoise(qd * 2.3 + vec3(sd, uTime * 0.11, -sd));
        float sc = sin(qd.x * 9.0 + qd.z * 4.0 + sd + uTime * 0.35) * sin(qd.y * 8.0 - qd.z * 6.0 - sd * 1.7 + uTime * 0.27);
        float e = pn * 0.65 + (sc * 0.5 + 0.5) * 0.35;
        float rr = 1.0 - uErode * (1.0 + vWisp * 1.2) * e;
        // (the rim direction is undefined at the puff's centre, so the paint noise fades out toward it)
        pn = mix(0.5, pn, smoothstep(0.15, 0.6, rho));
        float w = max(fwidth(rho) * 1.3, 0.012) + vWisp * 0.3;
        float alpha = smoothstep(rr, rr - w, rho);
        if (vWisp > 0.0) {
          // torn into streaks toward its edge
          float st = pNoise(q * vec3(5.0, 2.2, 5.0) + vec3(sd, uTime * 0.07, 0.0));
          alpha *= mix(1.0, smoothstep(0.2, 0.7, st + 0.35 * (1.0 - rho)), vWisp * smoothstep(0.35, 0.95, rho / rr));
        }
        if (alpha < 0.003) discard;
        float th = sqrt(max(rr * rr - rho * rho, 0.0) / a);
        float t = tc - th;
        vec3 P = cameraPosition + rd * t;
        vec3 lp = o + dl * t;
        vec3 N = normalize(toNormal(lp));
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
        // the mass's dome normal (an ellipsoid R wide and H high), so the whole mass is lit as one
        vec3 HN = normalize(dh * (H / R) + up * (dv * (R / H) + 0.001));
        float hv = clamp(dv / H, -0.3, 1.1);
        vec3 Ns = normalize(HN * (1.0 - uOwn) + N * uOwn);
        float dist = t;
        float ndl = dot(Ns, uSun);
        float nup = dot(Ns, up);
        // internal fluff: soft noise at the billow's own scale, so no surface is a smooth gradient
        float fl = pNoise(lp * 3.1 + vec3(sd * 1.3, uTime * 0.05, sd)) * 0.65 + pNoise(lp * 7.3 - sd) * 0.35;
        // two-band toon light (shadow, half tone, light) with blended edges, broken by the paint and fluff noise
        float wl = ndl * 0.5 + 0.5 + nup * 0.1 + uLift + (pn - 0.5) * 0.12 + (fl - 0.5) * 0.24;
        float lit = 0.45 * smoothstep(uTerm - 0.11, uTerm - 0.01, wl) + 0.55 * smoothstep(uTerm + 0.03, uTerm + 0.15, wl);
        float soft = smoothstep(uTerm, 1.0, wl);
        // occlusion: toward the mass's base, in the baked tucks, and on the lower rim of each billow
        float rimN = rho / rr;
        float down = smoothstep(0.25, -0.55, dot(N, up));
        float tuck = smoothstep(0.5, 0.98, rimN) * down;
        float baseK = smoothstep(-0.12, 0.55, hv);
        float open = vInfo.z;
        float ao = clamp(open * (1.0 - 0.55 * tuck) * mix(0.5, 1.0, baseK), 0.0, 1.0) * (1.0 - 0.4 * cut);
        // the shadow side: deep tone at the base and in the tucks, soft bellies, sky-lit where it faces up,
        // and a warm bounce from the sunlit clouds below on the undersides
        vec3 shade = mix(uDeep, uBelly, baseK * mix(0.5, 1.0, open));
        shade = mix(shade, uSkyShade, smoothstep(0.1, 0.9, nup) * 0.55 * open);
        shade = mix(uDeep * 0.94, shade, smoothstep(0.0, 0.7, ao));
        shade = mix(shade, uBounce, smoothstep(-0.05, -0.75, dot(N, up)) * 0.32 * (0.4 + 0.6 * open));
        // the lit side: warm shoulder to white crown, a half tone where it is occluded; the very tops bloom,
        // and at golden hour only they turn hot peach where they face the sun
        float topK = smoothstep(0.8, 1.02, hv) * smoothstep(0.6, 0.98, soft);
        vec3 lightC = mix(uWarm, uTop, smoothstep(0.15, 0.8, soft) * smoothstep(0.0, 0.6, hv + 0.25));
        lightC = mix(lightC, uCrown, topK * uCrownK);
        lightC *= mix(1.0, uGain, topK);
        lightC = mix(uMid, lightC, smoothstep(0.25, 0.75, ao));
        // looking toward a low sun, crowns glow with light scattered through their thin tops
        float fwd = max(dot(rd, uSun), 0.0);
        float f3 = fwd * fwd * fwd, f12 = pow(fwd, 12.0);
        lit = max(lit, smoothstep(0.0, 0.7, nup) * smoothstep(0.1, 0.7, hv) * f3 * clamp(uGlowK - 0.4, 0.0, 1.0));
        vec3 col = mix(shade, lightC, lit * smoothstep(0.12, 0.45, ao));
        // thin rims: light passes through, so the shadowed edge of a billow lifts toward a half tone
        // (not on puffs that are small on screen: there a lit ring round a shaded middle reads as a donut)
        float thin = smoothstep(0.8, 1.0, rimN) * (1.0 - smoothstep(0.012, 0.04, fwidth(rho)));
        col = mix(col, mix(shade, lightC, 0.6), thin * (1.0 - lit) * 0.4 * (1.0 - down * 0.6));
        // a soft painted contour on the underside of each billow, where it lies over the mass behind
        col = mix(col, shade * 0.95, smoothstep(0.86, 0.99, rimN) * down * 0.35);
        // toward the sun: silver linings on thin edges and the mass's silhouette, and warm light scattered through
        float massEdge = 1.0 - abs(dot(HN, rd));
        float edge = smoothstep(0.7, 1.0, rimN) * (0.25 + 1.4 * smoothstep(0.35, 0.95, massEdge));
        float f6 = f3 * f3;
        col += uGlow * uGlowK * f3 * 0.1 * (1.0 - lit) * open;
        // watercolour variation
        col *= 1.0 + (pn - 0.5) * 0.06 + (fl - 0.5) * 0.04 + (vSeed - 0.5) * 0.03;
        // mist: the low parts sink into the valleys' blue-white mist
        float hgt = uFlat > 0.5 ? dot(P - uRingO, uFlatUp) : length(P - uCenter) - uMistR;
        float mk = clamp((uMistTop - hgt) / uMistDepth, 0.0, 1.0);
        col = mix(col, uMist * (1.0 + 0.04 * (fl - 0.5)), mk * mk * (3.0 - 2.0 * mk) * 0.88);
        // aerial haze: further is paler and bluer, fading into the horizon; toward the sun the haze glows
        float f = 1.0 - exp(-pow(dist * uHazeD * vInfo.w, 1.5));
        vec3 haze = mix(uHaze, uGlow, clamp(pow(fwd, 5.0) * uGlowK * 0.45, 0.0, 0.6));
        col = mix(col, haze, f);
        // the body stays just under the bloom threshold (~0.96): broad bright areas would bloom into a veil (and
        // the bloom's alpha would lift the finish pass's cloud mask); only the thin linings and the very tops
        // glint over it
        col = min(col, vec3(0.95 + 0.12 * topK));
        // toward the sun: silver linings on thin edges and on the mass's silhouette
        col += uGlow * uGlowK * (f3 * edge * 0.5 + f6 * smoothstep(0.5, 1.0, massEdge) * thin * 0.9 + f12 * massEdge * 0.4) * (1.0 - f * 0.6);
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

// ------------------------------------------------------------------ masses

/** Collects puffs, then becomes a PuffLayer. */
export class PuffBuilder {
  mats: number[] = [];
  heaps: number[] = [];
  infos: number[] = [];
  private m = new THREE.Matrix4();
  get count() { return this.infos.length / 4; }
  /** `wisp` 0..1: how much the puff's edge dissolves into torn wisps (skirts, outer detail). */
  add(pos: THREE.Vector3, quat: THREE.Quaternion, scale: THREE.Vector3, heapC: THREE.Vector3, heapR: number, heapH: number, seed: number, haze = 1, open = 1, wisp = 0) {
    this.m.compose(pos, quat, scale);
    this.mats.push(...this.m.elements);
    this.heaps.push(heapC.x, heapC.y, heapC.z, heapR);
    this.infos.push(heapH, (seed % 100) + 128 * Math.round(Math.min(1, Math.max(0, wisp)) * 7), open, haze);
  }
  /**
   * Bake occlusion into puffs [from, count): a puff with others piled over and around it sits in a tuck.
   * `up` is the mass's up; openness 1 = in the open, down to 0.3 = deep in a fold.
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
      this.infos[i * 4 + 2] = Math.max(0.3, 1 - occ * 0.3);
    }
  }
  /** Set the openness of puffs [from, to) (e.g. cores, which only show where billows leave room). */
  setOpen(from: number, to: number, open: number) { for (let i = from; i < to; i++) this.infos[i * 4 + 2] = open; }
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

/** The mass a puff is lit as (base point, radius, height). */
export interface MassFrame { base: THREE.Vector3; R: number; H: number }

export interface MassShape {
  /** Detail: 1 = near (a scalloped rim of medium billows, small detail on the silhouette) .. 0.15 = far. */
  detail?: number;
  /** Height / width of the billows (default 0.86). */
  flat?: number;
  /** Crown lean, as a fraction of R (default random up to 0.18). */
  lean?: number;
  /** Light the puffs as part of a bigger mass than this one (e.g. a towering cumulus). */
  mass?: MassFrame;
  /** Haze multiplier (1 = normal; lower = clearer, for walls of light far away). */
  haze?: number;
  /** Skip the baked occlusion (cheaper for the many far masses). */
  noBake?: boolean;
  /** The wispy, flattened foot spreading round the base (default 1; 0 = none). */
  skirt?: number;
  /** Small puffs on the silhouette, as a multiplier (default 1). */
  rim?: number;
  /** Wispiness of the outermost puffs (default 0.6). */
  wisp?: number;
}

/**
 * One cumulus mass, built in a clear size hierarchy (about 10:1 between core and rim detail), so it reads as one
 * big billowing heap and never as a bunch of grapes:
 *   - two or three huge core puffs that fill the body, plus an upper core under the crown;
 *   - a scalloped rim of medium billows in a few rows up the dome, of uneven size, some left out;
 *   - one big crown puff with a couple of shoulders;
 *   - small puffs only on the silhouette as detail, and a wispy flattened skirt round the foot.
 * `base` is the foot, `R` the radius, `H` the height of the crown. Returns the number of puffs added.
 */
export function addMass(b: PuffBuilder, base: THREE.Vector3, up: THREE.Vector3, R: number, H: number, rnd: () => number, shape: MassShape = {}) {
  const from = b.count;
  tangentFrame(up, _t1, _t2);
  _q.setFromUnitVectors(_Y, up);
  const detail = shape.detail ?? 1;
  const flat = shape.flat ?? 0.86;
  const haze = shape.haze ?? 1;
  const wisp = shape.wisp ?? 0.6;
  const m = shape.mass;
  const leanA = rnd() * Math.PI * 2, leanD = R * (shape.lean ?? 0.18 * rnd());
  const lx = Math.cos(leanA) * leanD, lz = Math.sin(leanA) * leanD;
  // the dome's profile: steep sides, a broad rounded top
  const prof = (f: number) => R * Math.pow(Math.max(0, 1 - Math.pow(f, 2.4)), 0.5);
  const put = (x: number, y: number, z: number, sx: number, sy: number, sz: number, w = 0) => {
    _p.copy(base).addScaledVector(_t1, x).addScaledVector(_t2, z).addScaledVector(up, y);
    _qy.setFromAxisAngle(_Y, rnd() * Math.PI * 2);
    _s.set(sx, sy, sz);
    b.add(_p, _qy.premultiply(_q), _s, m ? m.base : base, m ? m.R : R, m ? m.H : H, rnd() * 100, haze, 1, w);
  };
  // the cores: a few huge puffs filling the body, so no sky shows through anywhere
  const nCore = R > 9 ? 3 : 2;
  const a0 = rnd() * Math.PI * 2;
  for (let i = 0; i < nCore; i++) {
    const a = a0 + (i / nCore) * Math.PI * 2, d = R * (0.18 + rnd() * 0.12);
    const cr = R * (0.58 + rnd() * 0.12), cy = Math.min(H * 0.5, cr * 0.9);
    put(Math.cos(a) * d + lx * 0.2, cy * 0.8, Math.sin(a) * d + lz * 0.2, cr, cy, cr * (0.9 + rnd() * 0.2));
  }
  put(lx * 0.55, H * 0.56, lz * 0.55, R * 0.5, H * 0.34, R * 0.5);
  const coreEnd = b.count;
  // the scalloped rim: rows of medium billows up the dome, sunk into it, uneven in size
  const rows = detail > 0.45 ? [0.1, 0.36, 0.6, 0.8] : [0.14, 0.5, 0.78];
  for (let ri = 0; ri < rows.length; ri++) {
    const f = rows[ri] + (rnd() - 0.5) * 0.05;
    const rho = prof(f);
    const s = R * (detail > 0.45 ? 0.34 : 0.42) * (1 - 0.28 * f);
    const n = Math.max(3, Math.round((2 * Math.PI * rho) / (s * 1.75)));
    const aa = rnd() * Math.PI * 2;
    const nh = rho / (R * R), nv = (f * H) / (H * H), nl = Math.hypot(nh, nv);
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.14) continue;
      const a = aa + ((i + (rnd() - 0.5) * 0.6) / n) * Math.PI * 2;
      const ss = s * (0.62 + rnd() * 0.75);
      const ff = Math.min(0.95, Math.max(0.04, f + (rnd() - 0.5) * 0.12));
      const sink = ss * 0.5;
      const r1 = prof(ff) - (nh / nl) * sink;
      put(Math.cos(a) * r1 + lx * ff * ff, ff * H - (nv / nl) * sink, Math.sin(a) * r1 + lz * ff * ff, ss, ss * flat * (0.9 + rnd() * 0.2), ss * (0.9 + rnd() * 0.2));
    }
  }
  // the crown: one big top, and a couple of shoulders
  const ct = R * 0.44;
  put(lx, H - ct * flat * 0.92, lz, ct * (0.95 + rnd() * 0.15), ct * flat, ct * (0.95 + rnd() * 0.15));
  for (let i = 0; i < 2; i++) {
    const a = rnd() * Math.PI * 2, d = R * 0.32, c = R * (0.26 + rnd() * 0.08);
    put(lx * 0.9 + Math.cos(a) * d, H * 0.86 - c * flat, lz * 0.9 + Math.sin(a) * d, c, c * flat, c);
  }
  const bodyEnd = b.count;
  // small detail, only on the silhouette (barely sunk, a little wispy)
  const nS = Math.round((shape.rim ?? 1) * 10 * detail * Math.min(1.5, R / 16));
  for (let i = 0; i < nS; i++) {
    const ff = 0.25 + rnd() * 0.68;
    const rho = prof(ff) * 1.0;
    const a = rnd() * Math.PI * 2;
    const s = R * (0.055 + rnd() * 0.05);
    put(Math.cos(a) * rho + lx * ff * ff, ff * H - s * 0.3, Math.sin(a) * rho + lz * ff * ff, s, s * 0.85, s, wisp * 0.5);
  }
  // the skirt: flattened, wispy puffs spreading round the foot
  const sk = shape.skirt ?? 1;
  if (sk > 0) {
    const nK = Math.max(3, Math.round(6 * sk * Math.min(1.4, R / 14)));
    const ka = rnd() * Math.PI * 2;
    for (let i = 0; i < nK; i++) {
      const a = ka + ((i + (rnd() - 0.5) * 0.7) / nK) * Math.PI * 2;
      const s = R * (0.3 + rnd() * 0.16);
      const rho = R * (0.78 + 0.2 * sk) - s * 0.4;
      put(Math.cos(a) * rho, s * 0.08, Math.sin(a) * rho, s * 1.45, s * 0.3, s * 1.2, wisp);
    }
  }
  if (!shape.noBake) b.bakeOcclusion(from, up);
  // the cores only show where billows leave room: keep them fairly open, not dark lumps
  b.setOpen(from, coreEnd, 0.82);
  if (shape.noBake) b.setOpen(coreEnd, bodyEnd, 0.9);
  return b.count - from;
}

/**
 * A towering cumulus: one tall, billowing mass. A column of large overlapping core puffs stacked up a tapering,
 * slightly leaning axis (each overlaps the next, so there is never a gap or a ring), a scalloped rim of big
 * lobes at every level, a crown that rises to one big top, small detail only on the silhouette, and a flat,
 * wispy base. All of it is lit as one tall mass, so it has one sunlit side and one shaded side.
 * `base` is the foot's centre, `R` the foot's radius, `H` the height of the top. Returns the mass it is lit as.
 */
export function addTower(b: PuffBuilder, base: THREE.Vector3, up: THREE.Vector3, R: number, H: number, rnd: () => number, haze = 1): MassFrame {
  const from = b.count;
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  tangentFrame(up, t1, t2);
  const qUp = new THREE.Quaternion().setFromUnitVectors(_Y, up);
  const mass: MassFrame = { base: base.clone(), R: R * 0.8, H };
  const la = rnd() * Math.PI * 2, lean = R * (0.15 + rnd() * 0.2);
  const put = (x: number, y: number, z: number, sx: number, sy: number, sz: number, w = 0, open = 1) => {
    _p.copy(base).addScaledVector(t1, x).addScaledVector(t2, z).addScaledVector(up, y);
    _qy.setFromAxisAngle(_Y, rnd() * Math.PI * 2);
    _s.set(sx, sy, sz);
    b.add(_p, _qy.premultiply(qUp), _s, mass.base, mass.R, mass.H, rnd() * 100, haze, open, w);
  };
  // the axis: tapering and leaning, with a little wander
  const radAt = (f: number) => R * (1 - 0.45 * Math.pow(f, 1.6));
  const axis = (f: number) => [Math.cos(la) * lean * f * f + Math.sin(f * 5 + la) * R * 0.05, Math.sin(la) * lean * f * f + Math.cos(f * 4 + la) * R * 0.05];
  // the flat base: broad flattened puffs, wispy at the edge
  const nB = 7;
  for (let i = 0; i < nB; i++) {
    const a = (i / nB) * Math.PI * 2 + rnd() * 0.5, s = R * (0.45 + rnd() * 0.15), d = R * 0.75;
    put(Math.cos(a) * d, s * 0.15, Math.sin(a) * d, s * 1.4, s * 0.32, s * 1.2, 0.7);
  }
  put(0, R * 0.2, 0, R * 1.0, R * 0.32, R * 1.0);
  // the column: stacked cores with a scalloped rim at each level
  let y = R * 0.3;
  const top = H - radAt(1) * 0.9;
  const cores: number[] = [];
  while (y < top) {
    const f = y / H, r = radAt(f), [ax, az] = axis(f);
    const step = r * 0.5;
    cores.push(b.count);
    put(ax, y, az, r * 0.8, step * 1.25, r * 0.8);
    const n = 7 + Math.floor(rnd() * 3);
    const a0 = rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.15) continue;
      const a = a0 + ((i + (rnd() - 0.5) * 0.6) / n) * Math.PI * 2;
      const s = r * (0.2 + rnd() * rnd() * 0.32);
      const d = r * 0.9 - s * 0.45;
      put(ax + Math.cos(a) * d, y + (rnd() - 0.5) * step * 0.8, az + Math.sin(a) * d, s, s * 0.9, s);
    }
    y += step;
  }
  // the crown: one big top over a ring of shoulders
  const rt = radAt(1), [cx, cz] = axis(1);
  put(cx, H - rt * 0.88, cz, rt * 1.0, rt * 0.9, rt * 1.0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rnd(), s = rt * (0.55 + rnd() * 0.15);
    put(cx + Math.cos(a) * rt * 0.6, H - rt * 1.25, cz + Math.sin(a) * rt * 0.6, s, s * 0.9, s);
  }
  // small detail on the silhouette only
  for (let i = 0; i < 16; i++) {
    const f = 0.15 + rnd() * 0.8, r = radAt(f), [ax, az] = axis(f), a = rnd() * Math.PI * 2, s = R * (0.05 + rnd() * 0.05);
    put(ax + Math.cos(a) * r * 0.97, f * H, az + Math.sin(a) * r * 0.97, s, s * 0.85, s, 0.3);
  }
  b.bakeOcclusion(from, up);
  for (const i of cores) b.setOpen(i, i + 1, 0.8);
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
