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
 * The island light. uBounce: cool blue-white light thrown back up by the sunlit cloud sea and the sky under the
 * islands, so undersides stay luminous and read as sky-lit, not brown. uShadow: the desaturated blue-violet grey the
 * limestone turns in shade (picture 1's cliffs). uLit: how bright lit faces are. One set, shared by every island;
 * the world can tint them at dusk.
 */
export const ISLAND_LIGHT = {
  uBounce: { value: new THREE.Color('#d6e2f6').multiplyScalar(0.26) },
  uShadow: { value: new THREE.Color('#aeaabb') },
  uLit: { value: 1.12 },
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
    // baked occlusion: recesses, joints and the undersides of ledges fall into shade even in the sun
    lit *= 1.0 - smoothstep(0.15, 0.85, gAO) * 0.9;
    vec3 sunHue = uSunCol / max(dot(uSunCol, vec3(0.3333)), 1e-3);
    // foliage takes the sun's colour strongly (warm at golden hour), rock a little less
    vec3 litC = alb * mix(vec3(1.0), sunHue, mix(0.74, 0.38, vRock)) * uLit * (1.0 + 0.12 * clamp(k - 1.0, 0.0, 1.0));
    vec3 ambHue = uAmbSky / max(dot(uAmbSky, vec3(0.3333)), 1e-3);
    float g = dot(alb, vec3(0.3333));
    // rock in shade: a desaturated blue-violet grey, with a little of its own warmth left in it
    vec3 rockSh = mix(alb * vec3(0.84, 0.78, 0.74), g * uShadow * 1.02, 0.45) * mix(vec3(1.0), ambHue, 0.08);
    vec3 grassSh = alb * vec3(0.58, 0.7, 0.68) * mix(vec3(1.0), ambHue, 0.35);
    vec3 shC = mix(grassSh, rockSh, vRock) * (1.0 - 0.32 * gAO);
    float bny = dot(pN, pUp);
    // bounce from the cloud sea and the sky below: undersides tint blue-white
    shC += alb * uBounce * (smoothstep(0.2, -0.9, bny) * 1.1 + 0.18) * (1.0 - 0.5 * gAO);
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
    float arc = atan(q.z, q.x + 1e-5) * length(q.xz);
    rc *= 1.0 - bedLine * 0.07;
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
    rc = mix(rc, rc * vec3(0.8, 0.76, 0.8), strip * step(ny, -0.25));
    // the undercut: a warm dark band at the top of a bed that a bed above overhangs
    float uc = aaStep(vBand.x, (0.12 + 0.3 * clamp(-vLedge, 0.0, 1.0)) * s) * step(vLedge, -0.05) * (1.0 - strip);
    rc = mix(rc, rc * vec3(0.82, 0.78, 0.8), uc);
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
    // the moss mantle: a crisp, ragged-edged sheet of moss poured over the top of the cliff, darker in its folds
    float mr = vMantle + (pNoise(q * 0.55 / s + 4.0) - 0.5) * 1.6 * s + (pNoise(q * 1.9 / s) - 0.5) * 0.55 * s;
    float mant = 1.0 - aaStep(mr, 0.0);
    // clumpy: dark hollows and lit cushions in two tones, the cushions catching the light from above
    float cush = smoothstep(0.5, 0.6, pNoise(q * vec3(1.8, 2.6, 1.8) / s + 9.0) * 0.6 + pNoise(q * 0.4 / s) * 0.4 + 0.1 * ny);
    vec3 mantC = mix(vec3(0.25, 0.39, 0.14), vec3(0.33, 0.48, 0.17), cush);
    mantC *= 0.82 + 0.18 * smoothstep(0.0, 1.2 * s, mr);
    rc = mix(rc, mantC, mant);
    moss = max(moss, mant);
    diffuseColor.rgb = mix(diffuseColor.rgb, rc, vRock);
    gRock = vRock * (1.0 - moss * 0.85);
    gAO = vAO;
  }`;

const AASTEP = /* glsl */ `
  // 1 where v < t, with a pixel-wide soft edge (so painted lines stay crisp but never crawl)
  float aaStep(float v, float t){ float w = max(fwidth(v), 1e-4) * 0.8; return 1.0 - smoothstep(t - w, t + w, v); }`;

/**
 * Give a painted material the island grading: foliage (rock 0: lit yellow-green taking the sun's colour, shade
 * shifted to blue-green) or stone and plaster (rock 1: shade toward the cool blue-violet grey).
 */
export function gradeFoliage(m: THREE.MeshToonMaterial, key: string, rock = 0) {
  const base = m.onBeforeCompile;
  const baseKey = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    Object.assign(sh.uniforms, ISLAND_LIGHT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n#define vRock ' + rock.toFixed(2) + '\n#define gAO 0.0\n' + GRADE_UNIFORMS)
      .replace('#include <opaque_fragment>', GRADE_GLSL);
  };
  m.customProgramCacheKey = () => baseKey + key + 'g2' + rock;
  return m;
}

const rockMats: Partial<Record<'flat' | 'bent', THREE.MeshToonMaterial>> = {};
/**
 * The island body: grass, soil and limestone all come from vertex colours (beds, moss, stains are baked per vertex);
 * the fragment paints the strokes of ROCK_GLSL on the stone and grades the light (GRADE_GLSL).
 * bent: for an island bent onto a planet (skyIsles/bend.ts), whose vertices keep their flat island-space position
 * in an aLoc attribute, so the strokes stay laid out as in the island's own frame.
 */
export function islandRockMaterial(bent = false): THREE.MeshToonMaterial {
  const key = bent ? 'bent' : 'flat';
  const had = rockMats[key];
  if (had) return had;
  const m = paint(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: softRamp() }), { variation: 0.4, rim: 0.6 });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    Object.assign(sh.uniforms, ISLAND_LIGHT);
    sh.uniforms.uRockScale = { value: 1 };
    sh.uniforms.uMoss = { value: 1 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRock; attribute vec2 aBand; attribute float aLedge; attribute float aUnder; attribute float aAO; attribute float aMantle; varying float vMantle; varying float vRock; varying vec3 vLoc; varying vec2 vBand; varying float vLedge; varying float vUnder; varying float vAO;' + (bent ? ' attribute vec3 aLoc;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock = aRock; vLoc = ' + (bent ? 'aLoc' : 'position') + '; vBand = aBand; vLedge = aLedge; vUnder = aUnder; vAO = aAO; vMantle = aMantle;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRock; varying vec3 vLoc; varying vec2 vBand; varying float vLedge; varying float vUnder; varying float vAO; varying float vMantle; uniform float uRockScale; uniform float uMoss; float gRock = 1.0; float gAO = 0.0; ' + GRADE_UNIFORMS + AASTEP)
      .replace('#include <opaque_fragment>', GRADE_GLSL.replace(/vRock/g, 'gRock'))
      .replace('#include <color_fragment>', ROCK_GLSL);
  };
  m.customProgramCacheKey = () => 'skyIslandRock5' + key;
  rockMats[key] = m;
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
      .replace('#include <common>', '#include <common>\n#define vRock 0.0\n#define gAO 0.0\n' + GRADE_UNIFORMS)
      .replace('#include <opaque_fragment>', GRADE_GLSL);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSway; uniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed += vec3(sin(uTime * 1.3 + aSway.y), 0.0, cos(uTime * 1.05 + aSway.y * 1.7)) * aSway.x;`);
  };
  m.customProgramCacheKey = () => 'skyIslandIvy3';
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
        // (the sun's colour carries most of the light, so the meadow warms with the rock at golden hour)
        vec3 light = uSunCol * lam * 0.85 * (1.0 - cs * uCloudShadow) + uAmbSky * 1.0 + vec3(0.04, 0.05, 0.03);
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

/**
 * The fall's look, shared by its colour pass and its depth prepass. x: -1..1 across, y: metres along, s: 0 at the
 * lip to 1 at the end, layer: 0 body, 1 veil, 2 mist sheet behind, 3 lip roll. Returns the alpha, writes the colour.
 * The body is a mostly opaque curtain (85-95% in its core, solid white at the lip) of broad white and pale-blue
 * streaks scrolling down, its sides churned into clumps of foam; it breaks up into spray over its last third.
 */
const FALL_GLSL = /* glsl */ `
  float fallLook(float x, float y, float s, float layer, out vec3 col){
    float ax = abs(x);
    float flow = y - uTime * (8.5 + layer * 1.3);
    // broad streaks (never fine threads): a few wide bands of brighter and bluer water
    float n1 = pNoise(vec3(x * 2.4 + layer * 5.0, flow * 0.028, 1.0));
    float n2 = pNoise(vec3(x * 5.5 + layer * 3.0, flow * 0.075, 4.0));
    float n3 = pNoise(vec3(x * 3.0, flow * 0.22, 8.0));
    float st = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
    // spray over the last third
    float sp = smoothstep(0.6, 1.0, s);
    float sn = pNoise(vec3(x * 2.2, flow * 0.05, 11.0)) * 0.6 + pNoise(vec3(x * 6.0, flow * 0.14, 3.0)) * 0.4;
    float a;
    if (layer < 0.5) {
      col = mix(vec3(0.7, 0.85, 0.97), vec3(1.06, 1.06, 1.05), smoothstep(0.3, 0.62, st));
      // solid white water for the first few metres under the lip
      col = mix(col, vec3(1.07), 1.0 - smoothstep(1.0, 4.5, y));
      // the core: 85-95% opaque, its edge wandering
      float rag = (n1 - 0.5) * 0.25;
      float core = (0.86 + 0.09 * smoothstep(0.45, 0.7, st)) * (1.0 - smoothstep(0.5 + rag, 0.68 + rag, ax));
      core = max(core, (1.0 - smoothstep(0.5, 4.0, y)) * (1.0 - smoothstep(0.72, 0.86, ax)));
      // churned sides: clumps of foam, alpha-tested, scrolling with the water
      float cl = pNoise(vec3(x * 4.5, flow * 0.11, 7.0)) * 0.6 + pNoise(vec3(x * 10.0, flow * 0.27, 2.0)) * 0.4;
      float clump = smoothstep(0.47, 0.53, cl + (0.8 - ax) * 1.3) * (1.0 - smoothstep(0.9, 1.0, ax));
      col = mix(col, vec3(1.07), clump * (1.0 - smoothstep(0.4, 0.65, 1.0 - ax)) * 0.8);
      a = max(core, clump * 0.96);
      // the spray: the curtain tears into falling clumps, then thins into the mist
      a *= clamp(1.0 - sp * 1.25 + (sn - 0.5) * 1.6 * sp, 0.0, 1.0);
      col = mix(col, vec3(1.04), sp);
    } else if (layer < 1.5) {
      // the veil: bright foam streaks running down the front
      col = vec3(1.1);
      a = smoothstep(0.55, 0.72, st) * 0.75 * (1.0 - smoothstep(0.55, 0.95, ax));
      a *= clamp(1.0 - sp * 1.4 + (sn - 0.5) * sp, 0.0, 1.0);
    } else if (layer < 2.5) {
      // the mist sheet behind: wide, soft, thickening as the water falls
      col = vec3(0.95, 0.97, 1.0);
      float m = pNoise(vec3(x * 1.6, flow * 0.02 + uTime * 0.05, 13.0));
      // (faint up top, where it would only veil the cliff beside the water)
      a = (0.04 + 0.36 * smoothstep(0.2, 0.7, s)) * (0.6 + 0.6 * m) * (1.0 - smoothstep(0.35, 1.0, ax));
      a *= smoothstep(0.5, 4.0, y) * (1.0 - smoothstep(0.75, 1.0, s));
    } else {
      // the lip roll: a white churning roll of foam
      col = vec3(1.08);
      float cl = pNoise(vec3(x * 5.0, y * 1.4 - uTime * 3.0, 5.0)) * 0.6 + pNoise(vec3(x * 12.0, y * 3.0 - uTime * 5.0, 9.0)) * 0.4;
      a = smoothstep(0.42, 0.5, cl + (0.85 - ax) * 0.9 - s * 0.35) * smoothstep(0.0, 0.15, s);
    }
    a *= 1.0 - smoothstep(0.9, 0.99, s);
    return clamp(a, 0.0, 1.0);
  }`;

let waterMats: Partial<Record<'fall' | 'stream', THREE.ShaderMaterial>> = {};
/**
 * Painted moving water. uv.x runs across the sheet from -1 to 1, uv.y along it in metres; aT is 0 at the lip and 1
 * where the fall ends. The stream on top is flat and streaky; the fall is FALL_GLSL.
 */
export function waterMaterial(kind: 'fall' | 'stream'): THREE.ShaderMaterial {
  const have = waterMats[kind];
  if (have) return have;
  // transparent and writing no depth (the fall's opaque core writes its depth in a prepass, fallDepthMaterial)
  const m = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    defines: kind === 'stream' ? { STREAM: 1 } : {},
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uDummy: { value: 0 } }]),
    vertexShader: FALL_VERT,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uAmbSky;
      varying vec2 vUv; varying float vT; varying float vLayer; varying vec3 vN; varying vec3 vW; varying float vBack;
      ${NOISE_GLSL}
      ${FALL_GLSL}
      void main(){
        float x = vUv.x, y = vUv.y;
        vec3 pale = vec3(0.98, 0.995, 1.0);
        vec3 col; float a;
        #ifdef STREAM
          float flow = y - uTime * 1.6;
          float n1 = pNoise(vec3(x * 2.2, flow * 0.7, 1.0));
          float n2 = pNoise(vec3(x * 5.0 + 3.0, flow * 1.6, uTime * 0.4));
          float rip = smoothstep(0.62, 0.8, n1 * 0.5 + n2 * 0.5);
          float bank = smoothstep(0.55, 0.95, abs(x));
          float foam = max(rip * 0.55, bank * (0.35 + 0.4 * n2));
          foam = max(foam, smoothstep(0.88, 1.0, vT) * (0.3 + 0.6 * n2));
          col = mix(vec3(0.36, 0.6, 0.82), pale, foam);
          a = (0.82 + foam * 0.18) * smoothstep(0.0, 0.06, vT);
        #else
          a = fallLook(x, y, vT, vLayer, col);
          if (a < 0.01) discard;
        #endif
        vec3 N = normalize(vN);
        float lam = clamp(dot(N, uSun) * 0.5 + 0.5, 0.0, 1.0);
        vec3 V = normalize(cameraPosition - vW);
        float spec = pow(clamp(dot(reflect(-uSun, N), V), 0.0, 1.0), 24.0);
        #ifdef STREAM
          col = col * (uSunCol * (0.45 + 0.4 * lam) + uAmbSky * 0.75) + uSunCol * spec * 0.25;
        #else
          // white water is lit almost white all round, the brightest thing in the view (it blooms a little);
          // only its shaded side cools (the sun's colour is half let in, so a golden sun warms it, never dyes it)
          vec3 Lw = uAmbSky * 1.35 + uSunCol * (0.72 + 0.4 * lam);
          // (lit nearly white whatever the hour: only a third of the light's colour gets into the foam)
          col = col * mix(vec3(dot(Lw, vec3(0.3333))), Lw, 0.32) + uSunCol * spec * 0.1;
        #endif
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        #include <fog_fragment>
      }`,
  });
  Object.assign(m.uniforms, sharedU());
  waterMats[kind] = m;
  return m;
}

const FALL_VERT = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute float aT; attribute float aLayer; attribute float aBack;
  varying vec2 vUv; varying float vT; varying float vLayer; varying vec3 vN; varying vec3 vW; varying float vBack;
  void main(){
    vUv = uv; vT = aT; vLayer = aLayer; vBack = aBack;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

let fallDepthMat: THREE.ShaderMaterial | null = null;
/**
 * The fall's depth prepass: writes depth (no colour) where the body is mostly opaque and there is rock close behind
 * it, so the finishing pass's screen ink, which reads the depth buffer, never draws the cliff's creases and edges
 * over the water. Where the water stands against the sky the ink then outlines it, like every other solid thing.
 */
export function fallDepthMaterial(): THREE.ShaderMaterial {
  if (fallDepthMat) return fallDepthMat;
  const m = new THREE.ShaderMaterial({
    colorWrite: false, side: THREE.DoubleSide,
    uniforms: { uDummy: { value: 0 } },
    vertexShader: FALL_VERT.replace('#include <fog_pars_vertex>', '').replace('#include <fog_vertex>', ''),
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv; varying float vT; varying float vLayer; varying vec3 vN; varying vec3 vW; varying float vBack;
      ${NOISE_GLSL}
      ${FALL_GLSL}
      void main(){
        if (vLayer > 0.5 || vBack < 0.5) discard;
        // (not where the curtain is seen right edge-on: there it is only a sliver)
        if (abs(dot(normalize(vN), normalize(cameraPosition - vW))) < 0.25) discard;
        vec3 col;
        if (fallLook(vUv.x, vUv.y, vT, 0.0, col) < 0.6) discard;
        gl_FragColor = vec4(1.0);
      }`,
  });
  Object.assign(m.uniforms, sharedU());
  fallDepthMat = m;
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
        float d = length(p) + (n - 0.5) * 0.5;
        // a soft but definite billow edge, so the spray reads as churning heaps, not as fog
        float a = 1.0 - smoothstep(0.62, 0.9, d);
        if (a < 0.01) discard;
        float z = sqrt(max(0.0, 1.0 - dot(p, p)));
        vec3 N = normalize(vRight * p.x + vUpV * p.y + vToCam * z);
        // toon-shaded like the cloud sea: a lit side and a shade side with a soft painted step between them
        float lit = smoothstep(-0.05, 0.2, dot(N, uSun) + (n - 0.5) * 0.4);
        // the cloud sea's own colours (paintCloud): near-white lit, a soft lilac-grey in shade
        vec3 shade = vec3(0.86, 0.88, 0.95), bright = vec3(1.04, 1.035, 1.02);
        vec3 col = mix(shade, bright, lit) * (0.9 + uSunCol * 0.1);
        // the rim of each billow is a touch darker, so heaps read as heaps against each other
        col *= 1.0 - 0.06 * smoothstep(0.5, 0.85, d);
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
    uniforms: { uStrength: { value: 0.32 } },
    vertexShader: /* glsl */ `
      #include <common>
      uniform vec3 uSun;
      varying vec2 vUv; varying float vBehind;
      void main(){
        vUv = uv;
        // only when the sun is behind the viewer
        vec3 wc = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vBehind = 0.45 + 0.55 * smoothstep(-0.2, 0.5, dot(normalize(cameraPosition - wc), uSun));
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
        float ang = atan(p.y, p.x + 1e-5);
        // a short segment of the arc, low in the spray
        a *= smoothstep(0.45, 0.95, ang) * smoothstep(2.7, 2.0, ang);
        a *= smoothstep(0.05, 0.4, p.y) * (0.55 + 0.45 * pNoise(vec3(p * 2.5, uTime * 0.1))) * vBehind;
        gl_FragColor = vec4(col, a * uStrength);
      }`,
  });
  Object.assign(m.uniforms, sharedU());
  bowMat = m;
  return m;
}
