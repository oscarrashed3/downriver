// A column of rising warm air in the Sky Isles, made visible: long pale wind ribbons spiralling up round it and
// a drift of petals carried up inside it. All the motion is in the shaders; one draw for the ribbons, one for the
// petals. Built in its own frame (+Y up the column), set on the planet like any prop.
import * as THREE from 'three';
import { PAINT } from '../../render/paint';
import { skyRng } from './rand';

let ribbonMat: THREE.ShaderMaterial | null = null;
function ribbonMaterial() {
  if (ribbonMat) return ribbonMat;
  ribbonMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: PAINT.uTime },
    vertexShader: /* glsl */ `
      attribute vec3 aRib; // (phase, speed, radius)
      uniform float uTime;
      varying float vV; varying float vA;
      void main(){
        float v = uv.y;                       // 0 at the foot, 1 at the top of the column
        float a = aRib.x + v * 7.0 + uTime * aRib.y * 0.6;
        float r = aRib.z * (0.7 + 0.5 * v);
        vec3 p = vec3(cos(a) * r, position.y, sin(a) * r);
        // the ribbon is a narrow strip: widen it sideways (tangent) by uv.x
        vec3 t = normalize(vec3(-sin(a), 0.35, cos(a)));
        p += t * (uv.x - 0.5) * 0.28;
        vV = fract(v * 1.6 - uTime * aRib.y * 0.18 + aRib.x);
        vA = smoothstep(0.0, 0.12, v) * smoothstep(1.0, 0.6, v);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vV; varying float vA;
      void main(){
        // each ribbon is a run of soft streaks rushing upward
        float s = smoothstep(0.0, 0.25, vV) * smoothstep(0.75, 0.3, vV);
        gl_FragColor = vec4(1.0, 0.98, 0.92, s * vA * 0.55);
      }`,
  });
  return ribbonMat;
}

let petalMat: THREE.ShaderMaterial | null = null;
function petalMaterial() {
  if (petalMat) return petalMat;
  petalMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: PAINT.uTime, uH: { value: 30 } },
    vertexShader: /* glsl */ `
      attribute vec4 aP; // (phase, speed, radius, angle)
      attribute vec3 aC;
      uniform float uTime, uH;
      varying vec3 vC; varying vec2 vUv; varying float vA;
      void main(){
        float k = fract(aP.x + uTime * aP.y * 0.05);
        float a = aP.w + k * 9.0 + uTime * 0.4;
        vec3 c = vec3(cos(a) * aP.z, k * uH, sin(a) * aP.z);
        vec4 mv = modelViewMatrix * vec4(c, 1.0);
        float spin = uTime * (1.5 + aP.y) + aP.w * 5.0;
        vec2 q = vec2(position.x * cos(spin) - position.y * sin(spin), position.x * sin(spin) + position.y * cos(spin) * (0.4 + 0.6 * abs(sin(spin * 0.7))));
        mv.xy += q * 0.16;
        vC = aC; vUv = position.xy + 0.5;
        vA = smoothstep(0.0, 0.08, k) * smoothstep(1.0, 0.75, k);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC; varying vec2 vUv; varying float vA;
      void main(){
        vec2 p = vUv - 0.5;
        float d = length(p * vec2(1.0, 1.6));
        if (d > 0.5) discard;
        gl_FragColor = vec4(vC * (1.05 - d * 0.4), vA);
      }`,
  });
  return petalMat;
}

const PETALS = ['#f7b8cc', '#fff4f8', '#ffe39a', '#d8c4f4', '#ffd0dc'].map(c => new THREE.Color(c));

/** One updraft column `h` metres tall and about `r` metres across. Origin at its foot. */
export function updraftColumn(h = 32, r = 2.6, seed = 1): THREE.Group {
  const rnd = skyRng(seed);
  const g = new THREE.Group(); g.name = 'updraft';
  // ribbons: N strips, each M rows up the column
  const N = 9, M = 48;
  const pos: number[] = [], uv: number[] = [], rib: number[] = [], idx: number[] = [];
  for (let n = 0; n < N; n++) {
    const ph = rnd() * 6.28, sp = 0.7 + rnd() * 0.8, rad = r * (0.55 + rnd() * 0.6);
    const base = pos.length / 3;
    for (let i = 0; i <= M; i++) {
      const v = i / M;
      for (const x of [0, 1]) { pos.push(0, v * h, 0); uv.push(x, v); rib.push(ph, sp, rad); }
      if (i < M) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  rg.setAttribute('aRib', new THREE.Float32BufferAttribute(rib, 3));
  rg.setIndex(idx);
  rg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, h / 2, 0), h / 2 + r * 2);
  const ribbons = new THREE.Mesh(rg, ribbonMaterial());
  ribbons.renderOrder = 7; ribbons.userData.noOutline = true; ribbons.frustumCulled = true;
  g.add(ribbons);
  // petals: instanced quads
  const P = 46;
  const src = new THREE.PlaneGeometry(1, 1);
  const pg = new THREE.InstancedBufferGeometry();
  pg.index = src.index; pg.setAttribute('position', src.attributes.position);
  const aP = new Float32Array(P * 4), aC = new Float32Array(P * 3);
  for (let i = 0; i < P; i++) {
    aP.set([rnd(), 0.6 + rnd() * 0.9, r * (0.2 + rnd() * 0.9), rnd() * 6.28], i * 4);
    const c = PETALS[Math.floor(rnd() * PETALS.length)];
    aC.set([c.r, c.g, c.b], i * 3);
  }
  pg.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
  pg.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 3));
  pg.instanceCount = P;
  pg.boundingSphere = rg.boundingSphere.clone();
  const pm = petalMaterial().clone();
  pm.uniforms.uTime = PAINT.uTime; pm.uniforms.uH = { value: h };
  const petals = new THREE.Mesh(pg, pm);
  petals.renderOrder = 7; petals.userData.noOutline = true;
  g.add(petals);
  return g;
}
