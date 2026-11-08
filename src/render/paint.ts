import * as THREE from 'three';

/**
 * The painted look, shared by every toon material in the game.
 * One set of uniforms drives light, wind and cloud shadows everywhere, so the whole world
 * changes together as the day turns.
 */
export const PAINT = {
  uTime: { value: 0 },
  uSun: { value: new THREE.Vector3(0.5, 0.5, 0.5).normalize() },
  uWind: { value: new THREE.Vector3(1, 0, 0) },
  uCenter: { value: new THREE.Vector3() },
  uAmbSky: { value: new THREE.Color('#5d6f99') },
  uAmbGround: { value: new THREE.Color('#3a3150') },
  uRimCol: { value: new THREE.Color('#ffd9a0') },
  uRim: { value: 0.35 },
  uCloudShadow: { value: 0.28 },
  uVariation: { value: 0.22 },
  uSunCol: { value: new THREE.Color('#fff0d8') },
};

/**
 * The thaw wave when Hollo wakes: everything nearer than uThawR to uThawC turns from winter to spring.
 * Off (uThawOn = 0) the world shows its normal colours. Shared by the terrain and the grass.
 */
export const THAW = {
  uThawC: { value: new THREE.Vector3() },
  uThawR: { value: 0 },
  uThawOn: { value: 0 },
};

export const NOISE_GLSL = /* glsl */ `
  float pHash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float pNoise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(pHash(i + vec3(0,0,0)), pHash(i + vec3(1,0,0)), f.x),
                   mix(pHash(i + vec3(0,1,0)), pHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(pHash(i + vec3(0,0,1)), pHash(i + vec3(1,0,1)), f.x),
                   mix(pHash(i + vec3(0,1,1)), pHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

/** Patch a MeshToonMaterial with the painted look. Safe to call once per material. */
export function paint(mat: THREE.MeshToonMaterial, opts: { variation?: number; rim?: number; noCloud?: boolean; crown?: number; thaw?: boolean } = {}) {
  if (mat.userData.painted) return mat;
  mat.userData.painted = true;
  const variation = opts.variation ?? 1;
  const rim = opts.rim ?? 1;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, PAINT);
    if (opts.thaw) Object.assign(shader.uniforms, THAW);
    shader.uniforms.uMatVar = { value: variation };
    shader.uniforms.uMatRim = { value: rim };
    shader.uniforms.uMatCloud = { value: opts.noCloud ? 0 : 1 };
    shader.uniforms.uMatCrown = { value: opts.crown ?? 0 };
    if (opts.thaw) shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 colorB; uniform vec3 uThawC; uniform float uThawR; uniform float uThawOn;')
      .replace('#include <color_vertex>', `#include <color_vertex>
        vec3 twp = (modelMatrix * vec4(position, 1.0)).xyz;
        float tk = uThawOn * smoothstep(uThawR, uThawR - 9.0, distance(twp, uThawC));
        vColor.rgb = mix(vColor.rgb, colorB, tk);`);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPWorld; varying vec3 vPNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 pwp = vec4(transformed, 1.0);
        vec3 pn = objectNormal;
        #ifdef USE_INSTANCING
          pwp = instanceMatrix * pwp; pn = mat3(instanceMatrix) * pn;
        #endif
        pwp = modelMatrix * pwp;
        vPWorld = pwp.xyz;
        vPNormal = normalize(mat3(modelMatrix) * pn);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPWorld; varying vec3 vPNormal;
        uniform float uTime; uniform vec3 uSun; uniform vec3 uWind; uniform vec3 uCenter;
        uniform vec3 uAmbSky; uniform vec3 uAmbGround; uniform vec3 uRimCol; uniform float uRim;
        uniform float uCloudShadow; uniform float uVariation; uniform float uMatVar; uniform float uMatRim; uniform float uMatCloud; uniform float uMatCrown;
        ${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float pv = pNoise(vPWorld * 0.21) * 0.6 + pNoise(vPWorld * 1.3) * 0.4;
        diffuseColor.rgb *= 1.0 + (pv - 0.5) * uVariation * uMatVar;`)
      .replace('#include <opaque_fragment>', `
        vec3 pUp = normalize(vPWorld - uCenter);
        vec3 pN = normalize(vPNormal);
        float hemi = dot(pN, pUp) * 0.5 + 0.5;
        vec3 amb = mix(uAmbGround, uAmbSky, hemi);
        float cs = smoothstep(0.5, 0.72, pNoise(vPWorld * 0.03 + uWind * uTime * 0.35)) * uMatCloud;
        outgoingLight = outgoingLight * (1.0 - cs * uCloudShadow) + diffuseColor.rgb * amb;
        vec3 pV = normalize(cameraPosition - vPWorld);
        float rimK = pow(1.0 - clamp(dot(pN, pV), 0.0, 1.0), 3.0) * clamp(dot(pN, uSun) * 0.6 + 0.4, 0.0, 1.0);
        outgoingLight += uRimCol * rimK * uRim * uMatRim;
        // lit crowns: the side of a tree clump that faces the sun turns into a lighter, warmer patch
        float crownK = smoothstep(0.25, 0.75, dot(pN, uSun)) * uMatCrown;
        outgoingLight = mix(outgoingLight, outgoingLight * vec3(1.22, 1.18, 0.98) + diffuseColor.rgb * vec3(0.10, 0.09, 0.03), crownK * 0.6);
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'paint' + variation + '_' + rim + (opts.noCloud ? 'n' : '') + (opts.crown ? 'c' + opts.crown : '') + (opts.thaw ? 't' : '');
  return mat;
}

let ramp: THREE.DataTexture | null = null;
/** Three soft bands: shade, half-light, full light. The shade band is mostly filled by the colored ambient. */
export function softRamp(): THREE.DataTexture {
  if (ramp) return ramp;
  const N = 64;
  const data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    const s = (a: number, b: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const v = 0.06 + s(0.44, 0.5) * 0.5 + s(0.6, 0.66) * 0.44;
    const b = Math.round(v * 255);
    data.set([b, b, b, 255], i * 4);
  }
  ramp = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  ramp.minFilter = THREE.LinearFilter; ramp.magFilter = THREE.LinearFilter;
  ramp.needsUpdate = true;
  return ramp;
}

// ---------------------------------------------------------------- ink outlines

const outlineMats = new Map<string, THREE.ShaderMaterial>();
export function outlineMaterial(color = '#3b2a30', width = 0.022): THREE.ShaderMaterial {
  const key = color + width;
  let m = outlineMats.get(key);
  if (m) return m;
  m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(color) }, uW: { value: width } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float uW;
      void main(){
        vec3 transformed = position + normal * uW;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      void main(){
        gl_FragColor = vec4(uColor, 1.0);
        #include <fog_fragment>
      }`,
  });
  outlineMats.set(key, m);
  return m;
}

/**
 * Give every mesh under `root` a thin edge (inverted hull). The edge takes the darker, cooler shade of
 * the mesh's own colour rather than black ink, and is half as wide as the width asked for. Little
 * things under a metre (flowers, mushrooms, tufts) get none: at that size a line only reads as noise.
 */
export function addOutlines(root: THREE.Object3D, _color = '#3b2a30', width = 0.022) {
  const meshes: THREE.Mesh[] = [];
  root.traverse(o => { if ((o as THREE.Mesh).isMesh && !o.userData.noOutline && !o.userData.isOutline) meshes.push(o as THREE.Mesh); });
  root.updateWorldMatrix(true, true);
  const ws = new THREE.Vector3();
  for (const m of meshes) {
    const mat = m.material as THREE.MeshToonMaterial;
    if (Array.isArray(m.material) || mat.transparent) continue;
    const g = m.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    m.getWorldScale(ws);
    // only skip on the small loose props: characters are many small parts and keep their edge
    if (!root.userData.person && g.boundingSphere!.radius * Math.max(ws.x, ws.y, ws.z) < 0.5) continue;
    const base = mat.color ? mat.color.clone() : new THREE.Color('#6a6a7a');
    const hsl = { h: 0, s: 0, l: 0 }; base.getHSL(hsl);
    const edge = new THREE.Color().setHSL((hsl.h * 0.7 + 0.62 * 0.3), Math.min(1, hsl.s * 0.8 + 0.1), Math.max(0.06, hsl.l * 0.42));
    const o = new THREE.Mesh(g, outlineMaterial('#' + edge.getHexString(), width * 0.5));
    o.userData.isOutline = true;
    o.userData.noOutline = true;
    m.add(o);
  }
  return root;
}
