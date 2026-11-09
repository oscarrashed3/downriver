import * as THREE from 'three';
import { PAINT, NOISE_GLSL, paint, softRamp } from '../../render/paint';

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
 * The island light. uBounce: light thrown back up by the sunlit cloud sea under the islands, so undersides and
 * shaded cliffs stay pale and pearly instead of sinking into brown. uShadow: the cool lilac the limestone turns in
 * shade (a hue shift, not a darkening). uLit: how bright and warm lit faces are. One set, shared by every island;
 * the world can tint them at dusk.
 */
export const ISLAND_LIGHT = {
  uBounce: { value: new THREE.Color('#d8daf4').multiplyScalar(0.22) },
  uShadow: { value: new THREE.Color('#a9a6cc') },
  uLit: { value: 1.14 },
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
    vec3 rockSh = mix(alb * vec3(0.78, 0.74, 0.76), g * uShadow * 1.04, 0.45) * mix(vec3(1.0), ambHue, 0.1);
    vec3 grassSh = alb * vec3(0.56, 0.7, 0.7);
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
    // broad patches of paler and warmer stone
    float tone = pNoise(vec3(q.x * 0.09, q.y * 0.35, q.z * 0.09) / s);
    rc *= 0.95 + 0.1 * tone;
    float strip = step(1.5, abs(vLedge));
    // bold bedding lines inside thick beds, broken here and there
    float yy = q.y + (pNoise(q * vec3(0.1, 0.02, 0.1) / s) - 0.5) * 0.5 * s;
    float f = fract(yy / (0.62 * s));
    float bw = 0.045 * s;
    float bedLine = aaStep(f * 0.62 * s, bw) * step(0.45, pNoise(q * vec3(0.22, 1.0, 0.22) / s + 3.0));
    bedLine *= step(0.22 * s, vBand.x) * step(0.18 * s, vBand.y) * (1.0 - strip);
    // vertical joint cracks: thin wandering lines, longer where they run through several beds
    float cn = pNoise(vec3(q.x * 0.85, q.y * 0.07, q.z * 0.85) / s + 31.0);
    float crack = aaStep(abs(cn - 0.5), 0.02) * step(0.5, pNoise(q * vec3(0.25, 0.45, 0.25) / s + 7.0)) * (1.0 - strip);
    rc *= 1.0 - bedLine * 0.2 - crack * 0.38;
    // the top edge of every bed catches the light: a crisp bright line (not under an overhang)
    float hi = aaStep(vBand.x, 0.07 * s) * step(-0.05, vLedge) * (1.0 - strip);
    rc = mix(rc, rc * 1.12 + vec3(0.05, 0.04, 0.02), hi);
    // ledge strips: tops lit bright, undersides dark
    rc = mix(rc, rc * 1.08 + vec3(0.03, 0.025, 0.0), strip * step(0.3, ny));
    rc = mix(rc, rc * vec3(0.5, 0.48, 0.6), strip * step(ny, -0.25));
    // the undercut: a dark band at the top of a bed that a bed above overhangs
    float uc = aaStep(vBand.x, (0.1 + 0.25 * clamp(-vLedge, 0.0, 1.0)) * s) * step(vLedge, -0.05) * (1.0 - strip);
    rc = mix(rc, rc * vec3(0.52, 0.5, 0.64), uc);
    // a thin dark crease along the foot of every bed
    rc *= 1.0 - aaStep(vBand.y, 0.04 * s) * 0.25 * (1.0 - strip);
    // moss drips: streaks of green hanging down from a mossy ledge (or the turf), tapering as they go
    float dn = pNoise(vec3(q.x * 2.6, q.y * 0.12, q.z * 2.6) / s + 11.0);
    float dl = (0.6 + 3.2 * pNoise(vec3(q.x * 0.35, 5.0, q.z * 0.35) / s)) * s * (0.4 + 0.6 * clamp(vLedge, 0.0, 1.0));
    float thr = 0.6 + 0.4 * clamp(vBand.x / dl, 0.0, 1.0);
    float drip = (1.0 - aaStep(dn, thr)) * step(0.05, vLedge) * (1.0 - strip) * uMoss;
    vec3 mossC = mix(vec3(0.42, 0.62, 0.24), vec3(0.6, 0.76, 0.32), pNoise(q * 0.6));
    rc = mix(rc, mossC, drip * 0.95);
    diffuseColor.rgb = mix(diffuseColor.rgb, rc, vRock);
    gRock = vRock * (1.0 - drip * 0.9);
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
      .replace('#include <common>', '#include <common>\nattribute float aRock; attribute vec2 aBand; attribute float aLedge; varying float vRock; varying vec3 vLoc; varying vec2 vBand; varying float vLedge;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock = aRock; vLoc = position; vBand = aBand; vLedge = aLedge;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRock; varying vec3 vLoc; varying vec2 vBand; varying float vLedge; uniform float uRockScale; uniform float uMoss; float gRock = 1.0; ' + GRADE_UNIFORMS + AASTEP)
      .replace('#include <opaque_fragment>', GRADE_GLSL.replace(/vRock/g, 'gRock'))
      .replace('#include <color_fragment>', ROCK_GLSL);
  };
  m.customProgramCacheKey = () => 'skyIslandRock3';
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
        lp *= smoothstep(0.5, 2.4, distance(base, cameraPosition));
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
        vec3 tip = mix(vec3(0.62, 0.8, 0.3), vec3(0.84, 0.9, 0.42), pch);
        tip = mix(tip, tip * vec3(0.86, 0.98, 1.04), smoothstep(0.6, 0.92, vVar) * 0.5);
        vec3 base = vCol * 0.8;
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

let waterMats: Partial<Record<'fall' | 'stream' | 'fallDepth', THREE.ShaderMaterial>> = {};
/**
 * Painted moving water. uv.x runs across the sheet from -1 to 1, uv.y along it in metres; aT is 0 at the lip and 1
 * where the fall ends. Streaks scroll down the sheet, white foam gathers at the lip and the soft ragged edges, and
 * the lower fall breaks up into spray and fades out into the mist. The stream on top uses the same water, flatter.
 */
export function waterMaterial(kind: 'fall' | 'stream' | 'fallDepth'): THREE.ShaderMaterial {
  const have = waterMats[kind];
  if (have) return have;
  const depthOnly = kind === 'fallDepth';
  const m = new THREE.ShaderMaterial({
    fog: true, transparent: !depthOnly, depthWrite: depthOnly, colorWrite: !depthOnly, side: THREE.DoubleSide,
    defines: kind === 'stream' ? { STREAM: 1 } : depthOnly ? { DEPTH_ONLY: 1 } : {},
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
          float foam = max(rip * 0.7, bank * (0.5 + 0.5 * n2));
          foam = max(foam, smoothstep(0.8, 1.0, vT) * (0.4 + 0.6 * n2));
          vec3 col = mix(deep * 0.92, pale, foam);
          float a = (0.82 + foam * 0.18) * smoothstep(0.0, 0.06, vT);
        #else
          float flow = y - uTime * (8.5 + vLayer * 1.3);
          vec3 col; float a; float aBody = 0.0;
          {
            // broad, long streaks and finer foam threads scrolling down, each strand at its own pace
            float n1 = pNoise(vec3(x * 3.2 + vLayer * 11.0, flow * 0.05, 0.0));
            float n2 = pNoise(vec3(x * 8.5 + vLayer * 5.0, flow * 0.18, 3.0));
            float n3 = pNoise(vec3(x * 19.0 + vLayer * 2.0, flow * 0.45, 9.0));
            float body = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
            // near-white body; a little blue only in the troughs, mostly in the upper fall
            float trough = 1.0 - smoothstep(0.3, 0.44, body);
            col = mix(vec3(1.0), vec3(0.6, 0.78, 0.94), trough * 0.7 * (1.0 - smoothstep(0.45, 0.85, vT)));
            // high-contrast white foam threads
            col = mix(col, vec3(1.08), smoothstep(0.58, 0.68, n2 * 0.7 + n3 * 0.3) * 0.7);
            // thick white water for the first metres under the lip
            col = mix(col, vec3(1.04), 1.0 - smoothstep(0.5, 3.5, y));
            // soft ragged edges that widen and fray as the water falls
            float rag = (pNoise(vec3(x * 2.4 + vLayer, flow * 0.12, 7.0)) - 0.5) * (0.3 + 0.7 * vT);
            float e0 = mix(0.72, 0.2, vT);
            a = 1.0 - smoothstep(e0 + rag, 1.0 + rag * 0.25, abs(x));
            // the solid body (for the depth pass): the strand's core, narrowing to a rounded tongue lower down
            float brk = pNoise(vec3(x * 2.6 + vLayer * 3.0, flow * 0.035, 13.0));
            aBody = a * (1.0 - smoothstep(0.42 + 0.32 * brk, 0.62 + 0.32 * brk, vT)) * smoothstep(0.0, 0.4, y);
            a *= mix(0.98, 0.8, smoothstep(0.35, 1.0, vT));
            // lower down it breaks into ropes and spray
            float holes = smoothstep(0.4, 0.95, vT) * (1.0 - smoothstep(0.34, 0.56, body + 0.12 * (1.0 - vT)));
            a *= 1.0 - holes;
            a *= 1.0 - smoothstep(0.72, 1.0, vT);
            a *= smoothstep(0.0, 0.4, y);
            col *= 1.0 - 0.05 * mod(vLayer, 2.0);
          }
        #endif
        #ifdef DEPTH_ONLY
          // the opaque body of the fall writes depth, so the screen ink outlines the curtain instead of drawing the
          // silhouettes of whatever is behind it through it
          // (only the strands' solid cores: no holes, so the ink never draws inside the broken lower fall)
          if (aBody < 0.6) discard;
          gl_FragColor = vec4(0.0);
          return;
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
        vUv = position.xy + 0.5; vSeed = iData.y; vAlpha = iData.z;
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
        float a = 1.0 - smoothstep(0.35, 0.95, d);
        if (a < 0.01) discard;
        float z = sqrt(max(0.0, 1.0 - dot(p, p)));
        vec3 N = normalize(vRight * p.x + vUpV * p.y + vToCam * z);
        float lit = smoothstep(-0.4, 0.7, dot(N, uSun));
        vec3 shade = vec3(0.84, 0.88, 0.97), bright = vec3(1.06, 1.05, 1.03);
        vec3 col = mix(shade, bright, lit) * (0.76 + uSunCol * 0.28);
        gl_FragColor = vec4(col, a * vAlpha);
        #include <fog_fragment>
      }`,
  });
  Object.assign(m.uniforms, sharedU());
  mistMat = m;
  return m;
}

let bowMat: THREE.ShaderMaterial | null = null;
/** A faint rainbow standing in the spray: a camera-facing arc, its colours thinning out where the mist thins. */
export function rainbowMaterial(): THREE.ShaderMaterial {
  if (bowMat) return bowMat;
  const m = new THREE.ShaderMaterial({
    fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uStrength: { value: 0.13 } },
    vertexShader: /* glsl */ `
      #include <common>
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec4 mvPosition = viewMatrix * modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 sc = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), 1.0);
        mvPosition.xy += position.xy * sc.xy;
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      uniform float uStrength; uniform float uTime;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main(){
        vec2 p = vec2(vUv.x * 2.0 - 1.0, vUv.y);
        float r = length(p);
        float band = (r - 0.72) / 0.2;
        if (band < 0.0 || band > 1.0) discard;
        vec3 col = clamp(abs(fract(band * 0.82 + vec3(0.0, 0.66, 0.33)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
        col = mix(col, vec3(1.0), 0.25);
        float a = sin(band * 3.14159);
        float ang = atan(p.y, p.x);
        a *= smoothstep(0.35, 0.95, ang) * smoothstep(2.5, 1.7, ang);
        a *= smoothstep(0.0, 0.35, p.y) * (0.35 + 0.65 * pNoise(vec3(p * 3.0, uTime * 0.1)));
        gl_FragColor = vec4(col * a * uStrength, 1.0);
      }`,
  });
  Object.assign(m.uniforms, sharedU());
  bowMat = m;
  return m;
}
