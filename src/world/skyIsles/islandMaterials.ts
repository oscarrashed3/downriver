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
 * Light thrown back up by the sunlit cloud sea under the islands: undersides and shaded cliffs stay pale and
 * pearly, as in the pictures, instead of sinking into brown. One shared uniform; the world can tint it at dusk.
 */
export const ISLAND_LIGHT = {
  uBounce: { value: new THREE.Color('#d4d6f2').multiplyScalar(0.46) },
};
const BOUNCE_GLSL = /* glsl */ `
  {
    float bny = dot(pN, pUp);
    outgoingLight += diffuseColor.rgb * uBounce * (smoothstep(0.3, -1.0, bny) + 0.3);
  }
  #include <opaque_fragment>`;

let rockMat: THREE.MeshToonMaterial | null = null;
/**
 * The island body: grass, soil and limestone all come from vertex colours (bands, moss, stains are baked per vertex).
 * Where the attribute aRock is 1 the fragment paints fine bedding lines that wander a little, break off here and
 * there, and a light pitting, so a cliff reads as layered limestone up close without any texture.
 */
export function islandRockMaterial(): THREE.MeshToonMaterial {
  if (rockMat) return rockMat;
  const m = paint(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: softRamp() }), { variation: 0.55, rim: 0.7 });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.uniforms.uBounce = ISLAND_LIGHT.uBounce;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRock; varying float vRock; varying vec3 vLoc;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock = aRock; vLoc = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRock; varying vec3 vLoc; uniform vec3 uBounce;')
      .replace('#include <opaque_fragment>', BOUNCE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 q = vLoc;
          // the bedding wanders a little, as real strata do
          float yy = q.y + (pNoise(q * vec3(0.16, 0.04, 0.16)) - 0.5) * 1.3 + (pNoise(q * vec3(0.7, 0.2, 0.7)) - 0.5) * 0.25;
          // the spacing of the beds changes with height, so they never look ruled
          float sp = 0.3 + 0.22 * pNoise(vec3(q.x * 0.02, yy * 0.35, q.z * 0.02));
          float f = fract(yy / sp);
          float wdt = 0.05 + 0.08 * pNoise(q * vec3(0.4, 0.1, 0.4));
          float line = 1.0 - smoothstep(0.0, wdt, f) * smoothstep(0.0, wdt * 0.6, 1.0 - f);
          float brk = smoothstep(0.42, 0.7, pNoise(q * vec3(0.3, 1.2, 0.3)));
          float f2 = fract(yy / 0.11 + 0.37);
          float fine = (1.0 - smoothstep(0.0, 0.18, f2) * smoothstep(0.0, 0.18, 1.0 - f2)) * smoothstep(0.45, 0.75, pNoise(q * vec3(0.5, 3.0, 0.5)));
          float tone = pNoise(vec3(q.x * 0.07, yy * 1.6, q.z * 0.07));
          float pits = smoothstep(0.66, 0.82, pNoise(q * 2.6));
          // vertical fissures: thin wandering lines where a tall, narrow noise crosses its middle
          float cn = pNoise(vec3(q.x * 0.55, q.y * 0.06, q.z * 0.55) + 31.0);
          float crack = (1.0 - smoothstep(0.0, 0.035, abs(cn - 0.5))) * smoothstep(0.45, 0.7, pNoise(q * vec3(0.2, 0.5, 0.2) + 7.0));
          vec3 rc = diffuseColor.rgb * (0.92 + tone * 0.16);
          rc *= 1.0 - line * brk * 0.2 - fine * 0.06 - pits * 0.09 - crack * 0.28;
          diffuseColor.rgb = mix(diffuseColor.rgb, rc, vRock);
        }`);
  };
  m.customProgramCacheKey = () => 'skyIslandRock';
  m.userData.bounce = true;
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
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.8) * S * 0.3;
    const cx = S / 2 + Math.cos(a) * d, cy = S / 2 + Math.sin(a) * d;
    const L = 15 + r() * 12;
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
  x.beginPath(); x.arc(S / 2, S / 2, S * 0.12, 0, Math.PI * 2); x.fill();
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
    sh.uniforms.uBounce = ISLAND_LIGHT.uBounce;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uBounce;')
      .replace('#include <opaque_fragment>', BOUNCE_GLSL);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSway; uniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed += vec3(sin(uTime * 1.3 + aSway.y), 0.0, cos(uTime * 1.05 + aSway.y * 1.7)) * aSway.x;`);
  };
  m.customProgramCacheKey = () => 'skyIslandIvy';
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
        vec3 tip = mix(vec3(0.55, 0.76, 0.27), vec3(0.76, 0.84, 0.36), pch);
        tip = mix(tip, tip * vec3(0.8, 0.96, 1.05), smoothstep(0.6, 0.92, vVar) * 0.6);
        vec3 base = vCol * 0.62;
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
        vec3 light = uSunCol * lam * 0.42 * (1.0 - cs * uCloudShadow) + uAmbSky * 0.9;
        col = col * light + uSunCol * back * vec3(0.9, 1.0, 0.45) * 0.25;
        col *= mix(0.72, 1.0, vH);
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
          float foam = max(rip * 0.7, bank * (0.5 + 0.5 * n2));
          foam = max(foam, smoothstep(0.8, 1.0, vT) * (0.4 + 0.6 * n2));
          vec3 col = mix(deep * 0.92, pale, foam);
          float a = (0.82 + foam * 0.18) * smoothstep(0.0, 0.06, vT);
        #else
          float flow = y - uTime * (7.0 + vLayer * 2.5);
          float n1 = pNoise(vec3(x * 6.0 + vLayer * 11.0, flow * 0.16, 0.0));
          float n2 = pNoise(vec3(x * 15.0 + vLayer * 5.0, flow * 0.42, 3.0));
          float n3 = pNoise(vec3(x * 3.0, flow * 0.07, 9.0 + vLayer));
          float streak = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
          float foam = max(smoothstep(0.42, 0.62, n1), smoothstep(0.5, 0.7, n2) * 0.85);
          foam = 0.35 + 0.65 * max(foam, smoothstep(0.3, 0.6, streak) * 0.7);
          foam = max(foam, 1.0 - smoothstep(0.0, 2.2, y));             // white water at the lip
          foam = max(foam, smoothstep(0.35, 0.9, vT) * 0.85);          // the fall turns to spray as it drops
          // fine blue-grey striations running down the white water
          float fine = pNoise(vec3(x * 26.0 + vLayer * 3.0, flow * 0.09, 5.0));
          vec3 col = mix(deep, pale, foam);
          col = mix(col, deep * 1.05, smoothstep(0.55, 0.85, fine) * 0.45 * (1.0 - smoothstep(0.6, 1.0, vT)));
          // the edges of the sheet are thinner, so a touch more blue shows through
          col = mix(col, deep, smoothstep(0.5, 0.95, abs(x)) * 0.25);
          // ragged soft edges, and holes opening in the lower fall
          float rag = (pNoise(vec3(x * 2.0, flow * 0.25, 7.0)) - 0.5) * 0.55;
          float a = 1.0 - smoothstep(0.55 + rag, 1.0, abs(x));
          a *= mix(0.9, 1.0, foam) * (1.0 - vLayer * 0.15);
          float holes = smoothstep(0.3, 0.95, vT) * (1.0 - smoothstep(0.3, 0.62, streak + 0.12));
          a *= 1.0 - holes;
          a *= 1.0 - smoothstep(0.62, 1.0, vT);
          a *= smoothstep(0.0, 0.25, y);
        #endif
        vec3 N = normalize(vN);
        float lam = clamp(dot(N, uSun) * 0.5 + 0.5, 0.0, 1.0);
        vec3 V = normalize(cameraPosition - vW);
        float spec = pow(clamp(dot(reflect(-uSun, N), V), 0.0, 1.0), 24.0);
        col = col * (uSunCol * (0.45 + 0.4 * lam) + uAmbSky * 0.75) + uSunCol * spec * 0.25;
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
        vec3 shade = vec3(0.8, 0.85, 0.95), bright = vec3(1.04, 1.04, 1.03);
        vec3 col = mix(shade, bright, lit) * (0.72 + uSunCol * 0.3);
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
