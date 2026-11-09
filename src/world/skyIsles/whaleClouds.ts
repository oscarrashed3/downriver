import * as THREE from 'three';
import { PAINT } from '../../render/paint';

/**
 * Cloud for the sky whales, in the game's own cloud style (World 1's painted cumulus): solid, flat-bottomed
 * puff spheres heaped into cauliflower clusters, shaded with warm sunlit tops, cool blue-grey bellies and a
 * soft bright edge, and inked by the finish pass like everything else. Being solid, they hide what lies in
 * them properly (no ink line of a hidden flipper shows through), and where a whale lies in them the cloud
 * meets its skin in a soft crease, as if it pushed the cloud aside.
 *
 * - CloudWake: the cloud a whale gathers and leaves where it lies in the cloud tops (heaps that billow up
 *   round its lower flanks and move with it, puffs left behind as it swims on, wisps off the flipper and
 *   fluke tips). One instanced draw per whale.
 * - SoftCloudLayer: a stand-in cloud sea for the lab (the world brings its own). One instanced draw.
 * The whales cast a soft shadow on these puffs (setCloudShadow).
 */

/** How many whales can cast a soft shadow on the puffs at once. */
const MAX_SHADOWS = 4;
const shadowU = { value: Array.from({ length: MAX_SHADOWS * 2 }, () => new THREE.Vector4()) };
let shadowNext = 0;
/** Claim a shadow slot (or -1 when all are taken). */
export function claimCloudShadow(): number { return shadowNext < MAX_SHADOWS ? shadowNext++ : -1; }
/**
 * Set a whale's shadow on the cloud puffs: an ellipse centred at (x, z), its long axis along (dx, dz) (unit),
 * half length and half width in metres, `strength` 0..1 (0 = off), and only on cloud lower than `maxY` (world).
 */
export function setCloudShadow(slot: number, x: number, z: number, dx: number, dz: number, halfLen: number, halfWidth: number, strength: number, maxY: number) {
  if (slot < 0) return;
  shadowU.value[slot * 2].set(x, z, dx, dz);
  shadowU.value[slot * 2 + 1].set(halfLen, halfWidth, strength, maxY);
}

const VERT = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vN; varying vec3 vW; varying float vSeed;
  void main(){
    // a flat base, like the game's cumulus
    vec3 lp = position; lp.y = max(lp.y, -0.38);
    vec4 wp = modelMatrix * instanceMatrix * vec4(lp, 1.0);
    vW = wp.xyz;
    vec3 nn = position.y < -0.37 ? vec3(0.0, -1.0, 0.0) : normal;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * nn);
    vSeed = fract(instanceMatrix[3].x * 0.013 + instanceMatrix[3].z * 0.007);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uSun, uTop, uBelly, uSunCol;
  uniform vec4 uShadow[${MAX_SHADOWS * 2}];
  varying vec3 vN; varying vec3 vW; varying float vSeed;
  void main(){
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    float lit = clamp(dot(N, uSun) * 0.5 + 0.5, 0.0, 1.0);
    float k = smoothstep(-0.35, 0.65, N.y) * 0.6 + lit * 0.4;
    k = smoothstep(0.38, 0.5, k) * 0.7 + k * 0.3;
    // the sun's colour on the lit tops (white at midday, gold at golden hour)
    vec3 sunHue = uSunCol / max(max(uSunCol.r, uSunCol.g), 1e-3);
    vec3 col = mix(uBelly * mix(vec3(1.0), sunHue, 0.1), uTop * mix(vec3(1.0), sunHue, sunHue.b < 0.5 ? 0.4 : 0.1), k);
    float fres = pow(1.0 - abs(dot(N, V)), 2.5);
    col += vec3(1.0, 0.95, 0.85) * sunHue * fres * 0.18 * lit;
    col *= 0.96 + vSeed * 0.08;
    // the soft shadows the whales cast on the cloud tops (only on cloud below the whale's belly)
    float sh = 0.0;
    for (int i = 0; i < ${MAX_SHADOWS}; i++) {
      vec4 a0 = uShadow[i * 2], a1 = uShadow[i * 2 + 1];
      if (a1.z <= 0.0) continue;
      vec2 d = vW.xz - a0.xy;
      vec2 e = vec2(dot(d, a0.zw), dot(d, vec2(-a0.w, a0.z))) / a1.xy;
      sh = max(sh, a1.z * (1.0 - smoothstep(0.3, 1.0, dot(e, e))) * smoothstep(a1.w + 1.0, a1.w - 1.5, vW.y));
    }
    col = mix(col, uBelly * vec3(0.9, 0.93, 1.0), sh * smoothstep(-0.2, 0.5, N.y));
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }`;

let puffMat: THREE.ShaderMaterial | null = null;
const puffSun = { value: new THREE.Vector3(0.45, 0.78, 0.43).normalize() };
/** The shared cloud-puff material (instanced, opaque, fogged). */
export function puffMaterial(): THREE.ShaderMaterial {
  if (puffMat) return puffMat;
  puffMat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTop: { value: new THREE.Color('#fffbf4') },
      uBelly: { value: new THREE.Color('#a3b4d4') },
    }]),
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  // share the game's sun colour, so the puffs turn gold at golden hour
  puffMat.uniforms.uSunCol = PAINT.uSunCol;
  puffMat.uniforms.uSun = puffSun;
  puffMat.uniforms.uShadow = shadowU;
  return puffMat;
}

/** Point the whale puffs' light at the sun (unit vector, world space). */
export function setPuffSun(sunDir: THREE.Vector3) { puffSun.value.copy(sunDir); }

const puffGeos = new Map<number, THREE.BufferGeometry>();
function puffGeometry(detail: number) {
  let g = puffGeos.get(detail);
  if (!g) puffGeos.set(detail, (g = new THREE.IcosahedronGeometry(1, detail)));
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3();

/** A pool of solid puffs in one instanced draw. */
class PuffPool {
  readonly mesh: THREE.InstancedMesh;
  /** `detail`: the puff sphere's subdivision (2 = 320 triangles, smooth enough at whale scale). */
  constructor(readonly max: number, detail = 2) {
    this.mesh = new THREE.InstancedMesh(puffGeometry(detail), puffMaterial(), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.userData.noOutline = true;
  }
  /** Write puff `i`: centre, radius and flattening (y scale). */
  protected put(i: number, p: THREE.Vector3, r: number, flat = 0.72) {
    _m.compose(p, _q.identity(), _s.set(r, r * flat, r));
    this.mesh.setMatrixAt(i, _m);
  }
  protected flush(n: number) {
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

interface Puff { pos: THREE.Vector3; vel: THREE.Vector3; age: number; life: number; size: number }
/** A heap of cloud that lives with the whale (set every frame): it billows round the body where it lies in the clouds. */
export interface HugPuff { pos: THREE.Vector3; size: number; seed: number; along: THREE.Vector3 }

/**
 * The cloud a whale gathers and leaves where it lies in the cloud tops: heaps that billow up round its lower
 * flanks and move with it (set by the whale each frame), puffs that swell up where the body cuts the cloud
 * surface and are left behind as the whale swims on (swelling, then shrinking away), and little trails
 * combed out behind the flipper and fluke tips. All in world space. Add `mesh` to the scene. One draw call.
 */
export class CloudWake extends PuffPool {
  private pool: Puff[] = [];
  private next = 0;
  private hugs: HugPuff[] = [];
  constructor(max = 150) {
    super(max);
    for (let i = 0; i < max; i++) this.pool.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 1, life: 0, size: 0 });
  }
  /** Start a puff at `pos` (world), drifting with `vel`, about `size` metres in radius at its fullest. */
  spawn(pos: THREE.Vector3, vel: THREE.Vector3, size: number, life = 5) {
    const p = this.pool[this.next]; this.next = (this.next + 1) % this.pool.length;
    p.pos.copy(pos); p.vel.copy(vel); p.age = 0; p.life = life * (0.75 + Math.random() * 0.5);
    p.size = size;
  }
  /** The heaps that move with the whale this frame (each is drawn as three puffs; at most a third of the pool). */
  setHugs(h: HugPuff[]) { this.hugs = h.slice(0, Math.floor(this.max / 9)); }
  update(dt: number) {
    let n = 0;
    // the heaps round the body: a big puff, a smaller crown on top and a low one trailing along the body
    for (const h of this.hugs) {
      const s = h.size, a = h.seed * 6.283;
      this.put(n++, h.pos, s, 0.72);
      _v.copy(h.pos).addScaledVector(h.along, s * 0.35 * Math.cos(a)); _v.y += s * 0.42;
      this.put(n++, _v, s * (0.55 + 0.12 * Math.sin(a * 3)), 0.8);
      _v.copy(h.pos).addScaledVector(h.along, -s * (0.75 + 0.2 * Math.sin(a))); _v.y -= s * 0.12;
      this.put(n++, _v, s * 0.7, 0.68);
    }
    for (const p of this.pool) {
      if (p.age >= p.life || n >= this.max) continue;
      p.age += dt;
      p.pos.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.exp(-dt * 0.5));
      const k = Math.min(1, p.age / p.life);
      // swell quickly, then shrink away (they are solid: they melt by getting smaller)
      const grow = Math.min(1, p.age / 0.8);
      const env = (1 - (1 - grow) * (1 - grow)) * (1 - k * k);
      const r = p.size * env * (0.8 + 0.3 * k);
      if (r < 0.05) continue;
      this.put(n++, p.pos, r, 0.72);
    }
    this.flush(n);
  }
}

/**
 * A stand-in cloud sea for the lab: heaps of puffs whose tops sit about `top`, spread over a disc, in one
 * draw. The real world has its own clouds; this only gives the whale something to swim through.
 * `corridor` keeps a lane clear (a whale swims along it, gathering its own cloud round it).
 */
export class SoftCloudLayer extends PuffPool {
  constructor(opts: { center?: THREE.Vector3; radius?: number; top?: number; count?: number; seed?: number; size?: number; corridor?: { a: THREE.Vector3; b: THREE.Vector3; r: number } } = {}) {
    const count = opts.count ?? 900;
    super(count);
    const c = opts.center ?? new THREE.Vector3(), R = opts.radius ?? 500, top = opts.top ?? 0, S = opts.size ?? 1;
    let s = (opts.seed ?? 5) * 7919 + 13;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const p = new THREE.Vector3();
    let n = 0, guard = 0;
    while (n < count && guard++ < count * 4) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      // a heap: a few puffs, big ones low and wide, smaller ones climbing on top (the crowns reach `top`)
      const size = S * (9 + r() * r() * 22);
      if (opts.corridor) {
        const { a: ca, b: cb } = opts.corridor, dx = cb.x - ca.x, dz = cb.z - ca.z;
        const h = THREE.MathUtils.clamp(((x - ca.x) * dx + (z - ca.z) * dz) / (dx * dx + dz * dz), 0, 1);
        if (Math.hypot(x - ca.x - dx * h, z - ca.z - dz * h) < opts.corridor.r + size * 0.9) continue;
      }
      const m = 3 + Math.floor(r() * 4);
      for (let j = 0; j < m && n < count; j++) {
        const lift = j / Math.max(1, m - 1);
        const sc = size * (0.95 - 0.4 * lift) * (0.8 + r() * 0.4);
        p.set(x + (r() - 0.5) * size * 2.4 * (1 - 0.5 * lift), 0, z + (r() - 0.5) * size * 1.8 * (1 - 0.5 * lift));
        // (the top of a puff is 0.72 of its radius above its centre)
        p.y = top - sc * 0.72 - size * 0.35 * (1 - lift) + (r() - 0.4) * size * 0.15;
        this.put(n++, p, sc, 0.72);
      }
    }
    this.flush(n);
  }
}

/**
 * An invisible floor at the cloud tops that only writes depth, drawn after everything else. The finish
 * pass draws its ink from the depth buffer: where a whale sinks out of sight into the clouds, the floor
 * puts cloud-top depth behind the melted edge instead of far sky, so no ink line traces the cut. Its own
 * colour is never drawn. It is a wide, shallow bowl that follows the camera: flat at the cloud tops near
 * the camera, curling up far away so it rises above the horizon before the far plane cuts it off (a flat
 * plane would leave a grey crease band where it grazes the horizon, and any rim against the sky a line).
 * One per cloud layer the whales swim through.
 */
export function cloudDepthFloor(top: number, far = 6000): THREE.Mesh {
  // (the rim runs out past the far plane, so the bowl is cut off where its depth already equals the cleared
  // depth of the empty sky: no step there for the ink to find)
  const R = far * 1.25, H = 2500, NR = 64, NA = 64;
  const pos: number[] = [], idx: number[] = [];
  pos.push(0, 0, 0);
  for (let i = 1; i <= NR; i++) {
    const r = R * Math.pow(i / NR, 1.6);
    const y = Math.pow(r / R, 4) * H;
    for (let j = 0; j < NA; j++) { const a = (j / NA) * Math.PI * 2; pos.push(Math.cos(a) * r, y, Math.sin(a) * r); }
  }
  const at = (i: number, j: number) => (i === 0 ? 0 : 1 + (i - 1) * NA + (j % NA));
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    if (i === 0) idx.push(0, at(1, j + 1), at(1, j));
    else idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true, fog: false, side: THREE.DoubleSide }));
  m.position.y = top;
  m.renderOrder = 10;
  m.frustumCulled = false;
  m.userData.noOutline = true;
  m.onBeforeRender = (_r, _s, cam) => { m.position.set(cam.position.x, top, cam.position.z); m.updateMatrixWorld(); };
  return m;
}
