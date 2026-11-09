import * as THREE from 'three';
import { PAINT, NOISE_GLSL, paint, softRamp } from '../../render/paint';
import { paintCloud } from '../skyIslands';

// Materials for the floating islands of the Sky Isles. Every solid thing is a painted toon material (paint() from
// render/paint.ts), so the islands take the same light, rim, ambient and cloud shadows as World 1. The water, mist
// and grass are small custom shaders that read the same shared PAINT uniforms, so they turn with the day too.
// All of them are cached: a hundred islands still compile each program once.

const toons = new Map<string, THREE.MeshToonMaterial>();
/** A plain painted toon material, cached by colour. */
export function toonMat(color: string, variation = 1, rim = 1): THREE.MeshToonMaterial {
  const k = color + variation + '_' + rim;
  let m = toons.get(k);
  if (!m) { m = paint(new THREE.MeshToonMaterial({ color, gradientMap: softRamp() }), { variation, rim }); toons.set(k, m); }
  return m;
}

// ------------------------------------------------------------------ rock

/**
 * The island light. uBounce: warm light thrown back up by the sunlit cloud sea under the islands, so undersides and
 * shaded cliffs stay luminous instead of sinking into brown. uShadow: the soft violet-taupe the limestone leans
 * toward in shade (the shade itself is a warm sand-brown of the rock's own colour). uLit: how bright and warm lit faces are. One set, shared by every island;
 * the world can tint them at dusk.
 */
export const ISLAND_LIGHT = {
  uBounce: { value: new THREE.Color('#f4e2cc').multiplyScalar(0.2) },
  uShadow: { value: new THREE.Color('#b7a0a2') },
  uLit: { value: 1.1 },
};

/**
 * Painted light for the island body and its growth. The toon light of paint() decides how lit each fragment is
 * (sun band, half band, shade, with cast shadows and cloud shadows in it); this turns that into the pictures'
 * two-tone: lit faces in warm cream and gold, shaded ones shifted to cool lilac (rock) or blue-green (grass), with a
 * little bounce from the clouds below. vRock picks rock or grass shading.
 */
const GRADE_GLSL = /* glsl */ `
  {
    vec3 lw = vec3(0.299, 0.587, 0.114);
    vec3 alb = diffuseColor.rgb;
    float k = dot(outgoingLight, lw) / max(dot(alb, lw), 1e-3);
    // the half band counts as mostly lit: only faces turned well away from the sun go into shade
    float lit = smoothstep(0.3, 0.58, k) * 0.78 + smoothstep(0.7, 0.95, k) * 0.22;
    vec3 sunHue = uSunCol / max(dot(uSunCol, vec3(0.3333)), 1e-3);
    vec3 litC = alb * mix(vec3(1.0), sunHue, 0.3) * uLit * (1.0 + 0.12 * clamp(k - 1.0, 0.0, 1.0));
    vec3 ambHue = uAmbSky / max(dot(uAmbSky, vec3(0.3333)), 1e-3);
    float g = dot(alb, vec3(0.3333));
    // rock in shade: its own colour, warmer and deeper (sand-brown), leaning a little toward violet-taupe
    vec3 rockSh = mix(alb * vec3(0.8, 0.7, 0.64), g * uShadow * 0.98, 0.28) * mix(vec3(1.0), ambHue, 0.06);
    vec3 grassSh = alb * vec3(0.6, 0.72, 0.66);
    vec3 shC = mix(grassSh, rockSh, vRock);
    float bny = dot(pN, pUp);
    shC += alb * uBounce * (smoothstep(0.3, -1.0, bny) + 0.25);
    vec3 graded = mix(shC, litC, lit);
    // keep paint()'s rim light on top
    float rimK2 = pow(1.0 - clamp(dot(pN, pV), 0.0, 1.0), 3.0) * clamp(dot(pN, uSun) * 0.6 + 0.4, 0.0, 1.0);
    outgoingLight = graded + uRimCol * rimK2 * uRim * uMatRim * 0.6;
  }
  #include <opaque_fragment>`;
const GRADE_UNIFORMS = 'uniform vec3 uBounce; uniform vec3 uShadow; uniform float uLit; uniform vec3 uSunCol;';

/**
 * The strokes painted on the limestone (where aRock is 1), in local space so they stay put on a moving island:
 * - a sharp bright line along the top edge of every bed, and ledge tops lit brighter still;
 * - a dark undercut line under every bed that overhangs, and dark ledge undersides;
 * - a few bold bedding lines inside the thicker beds and vertical joint cracks, as crisp toon strokes;
 * - green moss drips running down the face below every mossy ledge and below the turf.
 * aBand: metres below the top of this bed and above its bottom; aLedge: + ledge above, - overhang above,
 * +-2 on the ledge strips themselves.
 */
const ROCK_GLSL = /* glsl */ `#include <color_fragment>
  {
    vec3 q = vLoc;
    vec3 upW = normalize(vPWorld - uCenter);
    float ny = dot(normalize(vPNormal), upW);
    float s = uRockScale;
    vec3 rc = diffuseColor.rgb;
    // the strata and cracks fade out down the underside, toward its tip
    float strat = 1.0 - smoothstep(0.25, 0.9, vUnder);
    // broad patches of paler and warmer stone (same hue family: warm and cool shifts, not grey)
    float tone = pNoise(vec3(q.x * 0.07, q.y * 0.25, q.z * 0.07) / s);
    rc *= mix(vec3(0.95, 0.96, 0.98), vec3(1.04, 1.02, 0.97), tone);
    float strip = step(1.5, abs(vLedge));
    // a few faint bedding lines inside the thick beds, broken here and there
    float yy = q.y + (pNoise(q * vec3(0.1, 0.02, 0.1) / s) - 0.5) * 0.6 * s;
    float f = fract(yy / (1.1 * s));
    float bedLine = aaStep(f * 1.1 * s, 0.035 * s) * step(0.5, pNoise(q * vec3(0.18, 1.0, 0.18) / s + 3.0));
    bedLine *= step(0.4 * s, vBand.x) * step(0.4 * s, vBand.y) * (1.0 - strip) * strat;
    // vertical fracture: near-straight cracks running down through the beds, at irregular spacing along the wall,
    // each running a few metres and stopping (arc: distance round the island, so they stay vertical on any face)
    float arc = atan(q.z, q.x) * length(q.xz);
    float crack = 0.0;
    for (int k = 0; k < 2; k++) {
      float sp = (k == 0 ? 2.3 : 0.9) * s;
      float aw = arc + (pNoise(vec3(q.y * 0.15 / s, 3.0 + float(k), arc * 0.2 / s)) - 0.5) * 0.3 * s;
      float cell = floor(aw / sp), fc = fract(aw / sp);
      float hc = fract(sin(cell * 12.9898 + float(k) * 4.1) * 43758.5453);
      float runs = step(k == 0 ? 0.42 : 0.6, pNoise(vec3(cell * 1.7, q.y * (k == 0 ? 0.09 : 0.25) / s, float(k) * 5.0)));
      float line = aaStep(abs(fc - (0.3 + 0.4 * hc)) * sp, (k == 0 ? 0.028 : 0.016) * s) * step(k == 0 ? 0.35 : 0.72, hc) * runs;
      crack = max(crack, line * (k == 0 ? 1.0 : 0.5));
    }
    crack *= (1.0 - strip) * strat;
    rc *= 1.0 - bedLine * 0.12 - crack * 0.34;
    // vertical water stains: soft streaks down the faces, a little deeper and cooler, crossing the beds
    float stn = pNoise(vec3(arc * 0.35 / s, q.y * 0.03 / s, 21.0)) * 0.7 + pNoise(vec3(arc * 1.1 / s, q.y * 0.08 / s, 5.0)) * 0.3;
    float stain = smoothstep(0.56, 0.72, stn) * (1.0 - strip) * strat;
    rc = mix(rc, rc * vec3(0.9, 0.88, 0.9), stain * 0.7);
    // sunlit ochre streaks washed down the top of the cliff from the soil
    float och = smoothstep(0.55, 0.75, pNoise(vec3(q.x * 0.55, q.y * 0.03, q.z * 0.55) / s + 17.0));
    och *= smoothstep(-9.0 * s, -0.5 * s, q.y) * (1.0 - strip) * strat;
    rc = mix(rc, rc * vec3(1.02, 0.86, 0.62), och * 0.6);
    // the top edge of every bed catches the light: a crisp bright line (not under an overhang)
    float hi = aaStep(vBand.x, 0.06 * s) * step(-0.05, vLedge) * (1.0 - strip) * strat;
    rc = mix(rc, rc * 1.08 + vec3(0.04, 0.03, 0.01), hi);
    // ledge strips: tops lit bright, undersides warm and dark
    rc = mix(rc, rc * 1.06 + vec3(0.03, 0.025, 0.0), strip * step(0.3, ny));
    rc = mix(rc, rc * vec3(0.66, 0.56, 0.52), strip * step(ny, -0.25));
    // the undercut: a warm dark band at the top of a bed that a bed above overhangs
    float uc = aaStep(vBand.x, (0.12 + 0.3 * clamp(-vLedge, 0.0, 1.0)) * s) * step(vLedge, -0.05) * (1.0 - strip);
    rc = mix(rc, rc * vec3(0.7, 0.6, 0.56), uc);
    // moss: it sits on the ledge tops and fades down the face below them, thinning in a ragged painted edge
    float mn = pNoise(vec3(q.x * 0.9, q.y * 0.25, q.z * 0.9) / s + 11.0);
    float mlen = (0.35 + 1.4 * pNoise(vec3(q.x * 0.25, 5.0, q.z * 0.25) / s)) * s * clamp(vLedge, 0.0, 1.0);
    float mv = vBand.x / max(mlen, 1e-3);
    // (in patches along the ledge, as on the ledge tops)
    float mpatch = smoothstep(0.42, 0.62, pNoise(vec3(q.x * 0.12, q.y * 0.05, q.z * 0.12) / s + 2.0));
    float moss = (1.0 - aaStep(0.55, mv + (mn - 0.5) * 0.9)) * step(0.05, vLedge) * (1.0 - strip) * uMoss * mpatch;
    float mossSoft = (1.0 - smoothstep(0.0, 1.6, mv + (mn - 0.5) * 0.6)) * step(0.05, vLedge) * (1.0 - strip) * uMoss * mpatch;
    vec3 mossC = mix(vec3(0.44, 0.58, 0.27), vec3(0.56, 0.68, 0.32), pNoise(q * 0.5));
    rc = mix(rc, mossC, moss * 0.9);
    rc = mix(rc, rc * vec3(0.86, 0.95, 0.74), mossSoft * (1.0 - moss) * 0.6);
    diffuseColor.rgb = mix(diffuseColor.rgb, rc, vRock);
    gRock = vRock * (1.0 - moss * 0.85);
  }`;

const AASTEP = /* glsl */ `
  // 1 where v < t, with a pixel-wide soft edge (so painted lines stay crisp but never crawl)
  float aaStep(float v, float t){ float w = max(fwidth(v), 1e-4) * 0.8; return 1.0 - smoothstep(t - w, t + w, v); }`;

/** Give a painted foliage material the island grading (lit yellow-green, shade shifted to blue-green). */
export function gradeFoliage(m: THREE.MeshToonMaterial, key: string) {
  const base = m.onBeforeCompile;
  const baseKey = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    Object.assign(sh.uniforms, ISLAND_LIGHT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n#define vRock 0.0\n' + GRADE_UNIFORMS)
      .replace('#include <opaque_fragment>', GRADE_GLSL);
  };
  m.customProgramCacheKey = () => baseKey + key;
  return m;
}

let rockMat: THREE.MeshToonMaterial | null = null;
/**
 * The island body: grass, soil and limestone all come from vertex colours (beds, moss, stains are baked per vertex);
 * the fragment paints the strokes of ROCK_GLSL on the stone and grades the light (GRADE_GLSL).
 */
export function islandRockMaterial(): THREE.MeshToonMaterial {
  if (rockMat) return rockMat;
  const m = paint(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: softRamp() }), { variation: 0.4, rim: 0.6 });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    Object.assign(sh.uniforms, ISLAND_LIGHT);
    sh.uniforms.uRockScale = { value: 1 };
    sh.uniforms.uMoss = { value: 1 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRock; attribute vec2 aBand; attribute float aLedge; attribute float aUnder; varying float vRock; varying vec3 vLoc; varying vec2 vBand; varying float vLedge; varying float vUnder;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock = aRock; vLoc = position; vBand = aBand; vLedge = aLedge; vUnder = aUnder;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRock; varying vec3 vLoc; varying vec2 vBand; varying float vLedge; varying float vUnder; uniform float uRockScale; uniform float uMoss; float gRock = 1.0; ' + GRADE_UNIFORMS + AASTEP)
      .replace('#include <opaque_fragment>', GRADE_GLSL.replace(/vRock/g, 'gRock'))
      .replace('#include <color_fragment>', ROCK_GLSL);
  };
  m.customProgramCacheKey = () => 'skyIslandRock4';
  rockMat = m;
  return m;
}

// ------------------------------------------------------------------ ivy and vines

let ivyTex: THREE.CanvasTexture | null = null;
/** A spray of small ivy leaves, three-lobed and pointed, so a card's edge breaks up into leaves. */
function ivySheet(): THREE.CanvasTexture {
  if (ivyTex) return ivyTex;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!;
  let s = 31; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#fff';
  for (let i = 0; i < 15; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.9) * S * 0.3;
    const cx = S / 2 + Math.cos(a) * d, cy = S / 2 + Math.sin(a) * d;
    const L = 19 + r() * 13;
    x.save(); x.translate(cx, cy); x.rotate(r() * Math.PI * 2);
    // a three-lobed ivy leaf
    x.beginPath(); x.moveTo(0, L * 0.35);
    x.quadraticCurveTo(-L * 0.75, L * 0.2, -L * 0.62, -L * 0.15);
    x.quadraticCurveTo(-L * 0.3, -L * 0.2, -L * 0.18, -L * 0.42);
    x.quadraticCurveTo(0, -L * 0.9, L * 0.18, -L * 0.42);
    x.quadraticCurveTo(L * 0.3, -L * 0.2, L * 0.62, -L * 0.15);
    x.quadraticCurveTo(L * 0.75, L * 0.2, 0, L * 0.35);
    x.fill(); x.restore();
  }
  x.beginPath(); x.arc(S / 2, S / 2, S * 0.2, 0, Math.PI * 2); x.fill();
  ivyTex = new THREE.CanvasTexture(c);
  ivyTex.colorSpace = THREE.NoColorSpace;
  return ivyTex;
}

let ivyMat: THREE.MeshToonMaterial | null = null;
/**
 * Leaf cards for ivy curtains and hanging vines. Vertex colours shade each strand; aSway (amount, phase) lets the
 * free-hanging ends swing a little in the wind, in the vertex shader, so a curtain of vines costs no CPU.
 */
export function ivyMaterial(): THREE.MeshToonMaterial {
  if (ivyMat) return ivyMat;
  const m = paint(new THREE.MeshToonMaterial({
    color: '#ffffff', vertexColors: true, gradientMap: softRamp(), alphaMap: ivySheet(), alphaTest: 0.5, side: THREE.DoubleSide,
    // no depth: the screen ink then never traces every leaf card (the meshes draw after the rock, renderOrder 1)
    depthWrite: false,
  }), { variation: 0.5, rim: 1.2 });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    Object.assign(sh.uniforms, ISLAND_LIGHT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n#define vRock 0.0\n' + GRADE_UNIFORMS)
      .replace('#include <opaque_fragment>', GRADE_GLSL);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSway; uniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed += vec3(sin(uTime * 1.3 + aSway.y), 0.0, cos(uTime * 1.05 + aSway.y * 1.7)) * aSway.x;`);
  };
  m.customProgramCacheKey = () => 'skyIslandIvy2';
  ivyMat = m;
  return m;
}

// ------------------------------------------------------------------ grass tufts and flower clumps

/** The shared uniforms the custom shaders read, so they light with the world. */
const sharedU = () => ({
  uTime: PAINT.uTime, uWind: PAINT.uWind, uSun: PAINT.uSun, uSunCol: PAINT.uSunCol, uAmbSky: PAINT.uAmbSky,
  uCloudShadow: PAINT.uCloudShadow, uCenter: PAINT.uCenter,
});

const tuftMats: Partial<Record<'grass' | 'flower', THREE.ShaderMaterial>> = {};
/**
 * Instanced grass tufts (or flower clumps) in the island's own space: the instance attributes are local, and the
 * shader takes them through modelMatrix, so a whole island can be moved, turned and set on a planet as one group.
 * Blades on steep ground (the grassy lip) bow down under their own weight, so the edge reads as grass spilling over.
 */
export function tuftMaterial(kind: 'grass' | 'flower'): THREE.ShaderMaterial {
  const have = tuftMats[kind];
  if (have) return have;
  const m = new THREE.ShaderMaterial({
    fog: true,
    side: THREE.DoubleSide,
    // grass and flowers write no depth, so the screen ink never speckles every blade (the meshes draw after the
    // opaque things, renderOrder 1, and still test depth against them)
    depthWrite: false,
    defines: kind === 'flower' ? { FLOWER: 1 } : {},
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uDummy: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute float aH;
      attribute vec3 iPos; attribute vec3 iUp; attribute vec2 iRS; attribute float iVar; attribute vec3 iCol;
      #ifdef FLOWER
        attribute float aHead;
        varying float vHead;
      #endif
      uniform float uTime; uniform vec3 uWind; uniform vec3 uCenter;
      varying float vH; varying float vVar; varying vec3 vW; varying vec3 vUpN; varying vec3 vCol;
      void main(){
        vec3 base = (modelMatrix * vec4(iPos, 1.0)).xyz;
        vec3 up = normalize(mat3(modelMatrix) * iUp);
        vec3 ref = abs(up.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 t1 = normalize(cross(up, ref)); vec3 t2 = cross(up, t1);
        float c = cos(iRS.x), s = sin(iRS.x);
        vec3 ax = t1 * c + t2 * s; vec3 az = -t1 * s + t2 * c;
        vec3 lp = position * iRS.y;
        float camD = distance(base, cameraPosition);
        // shrink away up close (so blades never fill the lens) and far off, where single blades would only speckle
        // the screen ink; the meadow's own colour carries the grass at a distance
        lp *= smoothstep(0.5, 2.4, camD) * (1.0 - smoothstep(95.0, 170.0, camD));
        vec3 wp = base + ax * lp.x + up * lp.y + az * lp.z;
        // weight: on a slope the long blades hang down toward the ground below
        vec3 down = normalize(uCenter - base);
        float hh = aH * aH;
        wp += down * (1.0 - max(dot(up, -down), 0.0)) * hh * iRS.y * 0.55;
        vec3 w = uWind - up * dot(uWind, up); w = normalize(w + 1e-5);
        float along = dot(base, w);
        float wave = sin(along * 0.23 - uTime * 2.1) * 0.5 + 0.5;
        float gust = sin(along * 0.045 - uTime * 0.6 + iVar * 2.0) * 0.5 + 0.5;
        float bend = (0.1 + 0.6 * wave * (0.35 + 0.65 * gust) + 0.05 * sin(uTime * 6.0 + iVar * 40.0)) * hh * iRS.y;
        wp += w * bend * 0.8 - up * bend * bend * 0.3;
        vH = aH; vVar = iVar; vW = wp; vUpN = up; vCol = iCol;
        #ifdef FLOWER
          vHead = aHead;
        #endif
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uAmbSky; uniform vec3 uWind; uniform float uCloudShadow;
      varying float vH; varying float vVar; varying vec3 vW; varying vec3 vUpN; varying vec3 vCol;
      #ifdef FLOWER
        varying float vHead;
      #endif
      ${NOISE_GLSL}
      void main(){
        float pch = pNoise(vW * 0.09) * 0.7 + pNoise(vW * 0.4) * 0.3;
        vec3 tip = mix(vCol * 1.12, mix(vec3(0.62, 0.8, 0.3), vec3(0.84, 0.9, 0.42), pch), 0.45);
        tip = mix(tip, tip * vec3(0.86, 0.98, 1.04), smoothstep(0.6, 0.92, vVar) * 0.5);
        vec3 base = vCol * 0.9;
        vec3 col = mix(base, tip, smoothstep(0.0, 1.0, vH));
        #ifdef FLOWER
          vec3 stem = vec3(0.3, 0.52, 0.22);
          vec3 eye = mix(vec3(1.0, 0.82, 0.3), vec3(0.95, 0.55, 0.2), step(0.75, vCol.g) * step(vCol.b, 0.5));
          col = vHead < 0.5 ? stem : mix(vCol * (0.9 + 0.2 * vVar), eye, smoothstep(1.35, 1.6, vHead));
        #endif
        vec3 V = normalize(cameraPosition - vW);
        float lam = clamp(dot(vUpN, uSun) * 0.55 + 0.45, 0.0, 1.0);
        float back = pow(clamp(dot(-V, uSun), 0.0, 1.0), 4.0) * vH;
        float cs = smoothstep(0.5, 0.72, pNoise(vW * 0.03 + uWind * uTime * 0.35));
        vec3 light = uSunCol * lam * 0.6 * (1.0 - cs * uCloudShadow) + uAmbSky * 1.3 + vec3(0.06, 0.07, 0.04);
        col = col * light + uSunCol * back * vec3(0.9, 1.0, 0.45) * 0.25;
        col *= mix(0.82, 1.0, vH);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  Object.assign(m.uniforms, sharedU());
  tuftMats[kind] = m;
  return m;
}

// ------------------------------------------------------------------ water

let waterMats: Partial<Record<'fall' | 'stream', THREE.ShaderMaterial>> = {};
/**
 * Painted moving water. uv.x runs across the sheet from -1 to 1, uv.y along it in metres; aT is 0 at the lip and 1
 * where the fall ends. Streaks scroll down the sheet, white foam gathers at the lip and the soft ragged edges, and
 * the lower fall breaks up into spray and fades out into the mist. The stream on top uses the same water, flatter.
 */
export function waterMaterial(kind: 'fall' | 'stream'): THREE.ShaderMaterial {
  const have = waterMats[kind];
  if (have) return have;
  // transparent and writing no depth, so the screen ink never draws a box round the fall
  const m = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    defines: kind === 'stream' ? { STREAM: 1 } : {},
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uDummy: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute float aT; attribute float aLayer;
      varying vec2 vUv; varying float vT; varying float vLayer; varying vec3 vN; varying vec3 vW;
      void main(){
        vUv = uv; vT = aT; vLayer = aLayer;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uAmbSky;
      varying vec2 vUv; varying float vT; varying float vLayer; varying vec3 vN; varying vec3 vW;
      ${NOISE_GLSL}
      void main(){
        float x = vUv.x, y = vUv.y;
        vec3 deep = vec3(0.5, 0.74, 0.9), pale = vec3(0.98, 0.995, 1.0);
        #ifdef STREAM
          float flow = y - uTime * 1.6;
          float n1 = pNoise(vec3(x * 2.2, flow * 0.7, 1.0));
          float n2 = pNoise(vec3(x * 5.0 + 3.0, flow * 1.6, uTime * 0.4));
          float rip = smoothstep(0.62, 0.8, n1 * 0.5 + n2 * 0.5);
          float bank = smoothstep(0.55, 0.95, abs(x));
          float foam = max(rip * 0.55, bank * (0.35 + 0.4 * n2));
          foam = max(foam, smoothstep(0.88, 1.0, vT) * (0.3 + 0.6 * n2));
          vec3 col = mix(vec3(0.36, 0.6, 0.82), pale, foam);
          float a = (0.82 + foam * 0.18) * smoothstep(0.0, 0.06, vT);
        #else
          // the fall: many thin white threads scrolling down, each layer at its own pace
          float flow = y - uTime * (9.0 + vLayer * 1.7);
          vec3 col; float a;
          {
            float s = vT;
            float th1 = pNoise(vec3(x * 5.5 + vLayer * 7.0, flow * 0.022, 1.0));
            float th2 = pNoise(vec3(x * 15.0 + vLayer * 3.0, flow * 0.06, 4.0));
            float th3 = pNoise(vec3(x * 34.0 + vLayer * 1.3, flow * 0.15, 8.0));
            float thr = th1 * 0.45 + th2 * 0.35 + th3 * 0.2;
            float threads = smoothstep(0.4, 0.6, thr);
            // white threads; pale blue only in the gaps between them, mostly in the upper fall
            col = mix(vec3(0.6, 0.77, 0.92), vec3(1.03), mix(threads, 1.0, smoothstep(0.7, 1.0, s)));
            // thick white water for the first metre or two under the lip
            col = mix(col, vec3(1.04), 1.0 - smoothstep(0.3, 2.5, y));
            // soft sides that fray as the water falls (no hard edge anywhere)
            float rag = (th1 - 0.5) * (0.35 + 0.5 * s);
            a = 1.0 - smoothstep(0.5 + rag, 1.0, abs(x));
            // the body is threads with air between them, opening up as it falls
            a *= mix(0.55, 1.0, threads) * mix(1.0, smoothstep(0.32, 0.58, thr), smoothstep(0.2, 0.65, s));
            if (vLayer > 0.5) a *= 0.7 * smoothstep(0.25, 0.6, thr);
            // over the last 30-40% it spreads and breaks into spray, its end ragged in the alpha, never a line
            float sp = smoothstep(0.58, 1.0, s);
            float sn = pNoise(vec3(x * 2.6, flow * 0.04, 11.0)) * 0.6 + pNoise(vec3(x * 8.0, flow * 0.12, 3.0)) * 0.4;
            a *= clamp(1.0 - sp * 1.5 + (sn - 0.5) * 1.2 * sp, 0.0, 1.0) * mix(1.0, 0.6, sp);
            a *= 1.0 - smoothstep(0.86, 0.98, s);
            a *= smoothstep(0.0, 0.3, y);
            // seen edge-on, a part of the ribbon thins to nothing (the U keeps another part facing the eye)
            vec3 Vv = normalize(cameraPosition - vW);
            a *= smoothstep(-0.05, 0.22, abs(dot(normalize(vN), Vv)));
          }
        #endif
        vec3 N = normalize(vN);
        float lam = clamp(dot(N, uSun) * 0.5 + 0.5, 0.0, 1.0);
        vec3 V = normalize(cameraPosition - vW);
        float spec = pow(clamp(dot(reflect(-uSun, N), V), 0.0, 1.0), 24.0);
        #ifdef STREAM
          col = col * (uSunCol * (0.45 + 0.4 * lam) + uAmbSky * 0.75) + uSunCol * spec * 0.25;
        #else
          // white water is lit almost white all round; only its shaded side cools a little
          // (the sun's colour is only half let in, so a golden sun warms the water without dyeing it orange)
          vec3 sunL = mix(vec3(dot(uSunCol, vec3(0.3333))), uSunCol, 0.45);
          col = col * (uAmbSky * 1.25 + sunL * (0.6 + 0.38 * lam)) + uSunCol * spec * 0.12;
        #endif
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        #include <fog_fragment>
      }`,
  });
  Object.assign(m.uniforms, sharedU());
  waterMats[kind] = m;
  return m;
}

let mistMat: THREE.ShaderMaterial | null = null;
/**
 * Spray and mist: camera-facing puffs (one instanced draw per island) shaded like little soft spheres, bright on
 * the sun side and pale blue-grey underneath, their edges churning slowly. iPos is local to the island.
 */
export function mistMaterial(): THREE.ShaderMaterial {
  if (mistMat) return mistMat;
  const m = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uDummy: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec3 iPos; attribute vec3 iData; // size, seed, alpha
      uniform float uTime;
      varying vec2 vUv; varying float vSeed; varying float vAlpha; varying vec3 vRight; varying vec3 vUpV; varying vec3 vToCam;
      void main(){
        vec3 c = iPos + vec3(0.0, sin(uTime * 0.3 + iData.y * 6.0) * 0.25 * iData.x * 0.1, 0.0);
        vec4 wc = modelMatrix * vec4(c, 1.0);
        float size = iData.x * (1.0 + 0.06 * sin(uTime * 0.5 + iData.y * 9.0));
        vec4 mvPosition = viewMatrix * wc;
        mvPosition.xy += position.xy * size;
        vUv = position.xy + 0.5; vSeed = iData.y; vAlpha = abs(iData.z);
        // negative alpha: spray along the fall that only shows when it is seen steeply along its length
        if (iData.z < 0.0) vAlpha *= smoothstep(0.75, 0.95, abs(normalize(cameraPosition - wc.xyz).y));
        vRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vUpV = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vToCam = normalize(cameraPosition - wc.xyz);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uAmbSky;
      varying vec2 vUv; varying float vSeed; varying float vAlpha; varying vec3 vRight; varying vec3 vUpV; varying vec3 vToCam;
      ${NOISE_GLSL}
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float n = pNoise(vec3(p * 2.2 + vSeed * 17.0, uTime * 0.12 + vSeed)) * 0.65 + pNoise(vec3(p * 5.0, uTime * 0.2 - vSeed)) * 0.35;
        float d = length(p) + (n - 0.5) * 0.55;
        float a = 1.0 - smoothstep(0.45, 0.95, d);
        if (a < 0.01) discard;
        float z = sqrt(max(0.0, 1.0 - dot(p, p)));
        vec3 N = normalize(vRight * p.x + vUpV * p.y + vToCam * z);
        // toon-shaded like the cloud sea: a lit side and a shade side with a soft painted step between them
        float lit = smoothstep(-0.05, 0.2, dot(N, uSun) + (n - 0.5) * 0.4);
        // the cloud sea's own colours (paintCloud): near-white lit, a soft lilac-grey in shade
        vec3 shade = vec3(0.84, 0.85, 0.93), bright = vec3(0.98, 0.97, 0.955);
        vec3 col = mix(shade, bright, lit) * (0.9 + uSunCol * 0.1);
        gl_FragColor = vec4(col, a * vAlpha);
        #include <fog_fragment>
      }`,
  });
  Object.assign(m.uniforms, sharedU());
  mistMat = m;
  return m;
}

let bankMat: THREE.ShaderMaterial | null = null;
/**
 * The cloud bank a waterfall falls into: camera-facing heaps painted exactly like the cloud sea (paintCloud), so
 * the water is swallowed by cloud, not by a separate kind of puff. iPos is the heap's centre (local), iData: width,
 * seed (picks and mirrors one of two paintings), alpha.
 */
export function cloudBankMaterial(): THREE.ShaderMaterial {
  if (bankMat) return bankMat;
  const tex = [3, 17].map(k => { const t = new THREE.CanvasTexture(paintCloud(k, true)); t.colorSpace = THREE.SRGBColorSpace; return t; });
  const m = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { tA: { value: null }, tB: { value: null } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec3 iPos; attribute vec3 iData;
      uniform float uTime;
      varying vec2 vUv; varying float vSeed; varying float vAlpha;
      void main(){
        vec4 wc = modelMatrix * vec4(iPos + vec3(sin(uTime * 0.2 + iData.y * 9.0) * 0.3, 0.0, 0.0), 1.0);
        vec4 mvPosition = viewMatrix * wc;
        mvPosition.xy += position.xy * vec2(iData.x, iData.x * 0.5);
        vUv = position.xy + 0.5; vSeed = iData.y; vAlpha = iData.z;
        if (vSeed > 0.5) vUv.x = 1.0 - vUv.x;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D tA; uniform sampler2D tB; uniform vec3 uSunCol;
      varying vec2 vUv; varying float vSeed; varying float vAlpha;
      void main(){
        vec4 c = fract(vSeed * 7.0) > 0.5 ? texture2D(tA, vUv) : texture2D(tB, vUv);
        if (c.a < 0.02) discard;
        gl_FragColor = vec4(c.rgb * (0.9 + uSunCol * 0.1), c.a * vAlpha);
        #include <fog_fragment>
      }`,
  });
  Object.assign(m.uniforms, sharedU());
  m.uniforms.tA.value = tex[0]; m.uniforms.tB.value = tex[1];
  bankMat = m;
  return m;
}

let bowMat: THREE.ShaderMaterial | null = null;
/** A faint rainbow standing in the spray: a camera-facing arc, its colours thinning out where the mist thins. */
export function rainbowMaterial(): THREE.ShaderMaterial {
  if (bowMat) return bowMat;
  const m = new THREE.ShaderMaterial({
    // normal blending: over white spray an additive bow would only whiten; this tints it
    fog: false, transparent: true, depthWrite: false,
    uniforms: { uStrength: { value: 0.2 } },
    vertexShader: /* glsl */ `
      #include <common>
      uniform vec3 uSun;
      varying vec2 vUv; varying float vBehind;
      void main(){
        vUv = uv;
        // only when the sun is behind the viewer
        vec3 wc = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vBehind = smoothstep(0.15, 0.55, dot(normalize(cameraPosition - wc), uSun));
        vec4 mvPosition = viewMatrix * vec4(wc, 1.0);
        vec3 sc = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), 1.0);
        mvPosition.xy += position.xy * sc.xy;
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      uniform float uStrength; uniform float uTime;
      varying vec2 vUv; varying float vBehind;
      ${NOISE_GLSL}
      void main(){
        vec2 p = vec2(vUv.x * 2.0 - 1.0, vUv.y);
        float r = length(p);
        float band = (r - 0.74) / 0.16;
        if (band < 0.0 || band > 1.0 || vBehind < 0.01) discard;
        vec3 col = clamp(abs(fract(band * 0.82 + vec3(0.0, 0.66, 0.33)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
        col = mix(col, vec3(1.0), 0.15);
        float a = sin(band * 3.14159);
        float ang = atan(p.y, p.x);
        // a short segment of the arc, low in the spray
        a *= smoothstep(0.6, 1.1, ang) * smoothstep(2.3, 1.7, ang);
        a *= smoothstep(0.0, 0.45, p.y) * (0.35 + 0.65 * pNoise(vec3(p * 3.0, uTime * 0.1))) * vBehind;
        gl_FragColor = vec4(col, a * uStrength);
      }`,
  });
  Object.assign(m.uniforms, sharedU());
  bowMat = m;
  return m;
}
