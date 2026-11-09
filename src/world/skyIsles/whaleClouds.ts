import * as THREE from 'three';
import { PAINT } from '../../render/paint';

/**
 * Soft painted cloud puffs for the sky whales: camera-facing billboards with a lumpy, feathered edge,
 * shaded like the game's cumulus (warm sunlit tops, cool lavender bellies, a silver lining on the edge).
 * They are transparent and never write depth, so the finish pass draws no ink round them: they read as
 * soft cloud, never as outlined pancakes. Each billboard is pulled a little towards the camera, so where
 * one meets a whale it lies over the body instead of slicing through it with a hard line.
 *
 * Used for the cloud wake a whale leaves where it breaks the cloud tops (puffs and stretched wisps), and
 * for the stand-in cloud layer of the whale lab. One draw call per CloudWake or SoftCloudLayer.
 */

const VERT = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute vec3 iPos;    // centre, world space
  attribute vec4 iAxis;   // xyz: stretch direction * half length (world); w: 1 = stretched wisp, 0 = round puff
  attribute vec4 iShape;  // x: half height (m), y: opacity, z: seed, w: width / height for round puffs
  uniform vec3 uSun; uniform float uPull;
  varying vec2 vUv; varying vec4 vShape; varying vec3 vSunV; varying vec3 vUpV; varying vec4 vAx; varying float vWisp;
  void main(){
    vec4 mvPosition = viewMatrix * vec4(iPos, 1.0);
    float size = iShape.x;
    vec2 ax;
    if (iAxis.w > 0.5) {
      vec2 a = (viewMatrix * vec4(iAxis.xyz, 0.0)).xy;
      float l = length(a);
      ax = l > 1e-3 ? a / l * max(l, size) : vec2(size, 0.0);
    } else {
      ax = vec2(size * iShape.w, 0.0);
    }
    vec2 axd = normalize(ax);
    vec2 ayd = vec2(-axd.y, axd.x);
    if (ayd.y < 0.0) { ayd = -ayd; }
    mvPosition.xy += position.x * ax + position.y * ayd * size;
    // lean towards the camera, so the flat card lies over what it touches instead of cutting it
    mvPosition.z += size * uPull;
    gl_Position = projectionMatrix * mvPosition;
    vUv = position.xy; vShape = iShape; vAx = vec4(axd, ayd); vWisp = iAxis.w;
    vSunV = normalize((viewMatrix * vec4(uSun, 0.0)).xyz);
    vUpV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uTop, uBelly, uWarm, uSunCol;
  varying vec2 vUv; varying vec4 vShape; varying vec3 vSunV; varying vec3 vUpV; varying vec4 vAx; varying float vWisp;
  void main(){
    vec2 uv = vUv;
    float seed = vShape.z;
    float ang = atan(uv.y, uv.x);
    // cumulus: a flatter underside and a cauliflower edge of soft lobes (wisps get a ragged, thinner edge)
    vec2 sq = vec2(uv.x, uv.y < 0.0 ? uv.y * mix(1.45, 1.0, vWisp) : uv.y);
    float r = length(sq);
    float lobes = 0.085 * sin(ang * 5.0 + seed * 6.28) + 0.055 * sin(ang * 9.0 + seed * 17.0) + 0.035 * sin(ang * 15.0 + seed * 29.0);
    float edge = r + lobes * mix(smoothstep(-0.7, 0.2, uv.y), 1.6, vWisp);
    float a = smoothstep(1.0, mix(0.8, 0.25, vWisp), edge) * vShape.y;
    if (a < 0.01) discard;
    // a fake rounded normal, in view space
    float rr = min(dot(uv, uv), 1.0);
    vec2 nb = uv * 0.85;
    vec3 nv = normalize(vec3(nb.x * vAx.xy + nb.y * vAx.zw, sqrt(max(0.08, 1.0 - rr))));
    float lit = dot(nv, vSunV) * 0.5 + 0.5;
    float up = dot(nv, vUpV);
    float k = smoothstep(-0.55, 0.7, up) * 0.55 + lit * 0.45;
    k = smoothstep(0.3, 0.62, k) * 0.7 + k * 0.3;
    vec3 col = mix(uBelly, uTop, k);
    // warm light caught on the sunward side, and a silver lining round the edge
    col = mix(col, col * uWarm * (0.6 + 0.45 * uSunCol), smoothstep(0.65, 1.0, lit) * 0.25);
    col += vec3(1.0, 0.96, 0.88) * smoothstep(0.55, 0.95, edge) * lit * 0.07;
    col *= 0.975 + fract(seed * 13.7) * 0.05;
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }`;

const spriteMats = new Map<number, THREE.ShaderMaterial>();
const puffSun = { value: new THREE.Vector3(0.45, 0.78, 0.43).normalize() };
/**
 * The shared soft-puff material. `pull` (in puff sizes) is how far each card is drawn towards the camera:
 * high for wake puffs that must lie over the whale, low for a cloud layer the whale swims in front of.
 */
export function puffMaterial(pull = 0.9): THREE.ShaderMaterial {
  const hit = spriteMats.get(pull); if (hit) return hit;
  const spriteMat = new THREE.ShaderMaterial({
    fog: true,
    transparent: true,
    depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uPull: { value: pull },
      uTop: { value: new THREE.Color('#f8f8f8') },
      uBelly: { value: new THREE.Color('#b7c0dc') },
      uWarm: { value: new THREE.Color('#fff3e4') },
      uSunCol: { value: new THREE.Color('#ffffff') },
    }]),
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  // share the game's sun colour, so the puffs turn gold at golden hour
  spriteMat.uniforms.uSunCol = PAINT.uSunCol;
  spriteMat.uniforms.uSun = puffSun;
  spriteMats.set(pull, spriteMat);
  return spriteMat;
}

/** Point the whale puffs' light at the sun (unit vector, world space). */
export function setPuffSun(sunDir: THREE.Vector3) { puffSun.value.copy(sunDir); }

/** A pool of billboards in one instanced draw. */
class SpritePool {
  readonly mesh: THREE.Mesh;
  protected geo: THREE.InstancedBufferGeometry;
  protected pos: THREE.InstancedBufferAttribute;
  protected axis: THREE.InstancedBufferAttribute;
  protected shape: THREE.InstancedBufferAttribute;
  constructor(readonly max: number, pull: number) {
    const base = new THREE.PlaneGeometry(2, 2);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.attributes.position);
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.axis = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.shape = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    for (const a of [this.pos, this.axis, this.shape]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iPos', this.pos);
    this.geo.setAttribute('iAxis', this.axis);
    this.geo.setAttribute('iShape', this.shape);
    this.geo.instanceCount = 0;
    this.mesh = new THREE.Mesh(this.geo, puffMaterial(pull));
    this.mesh.frustumCulled = false;
    this.mesh.userData.noOutline = true;
  }
  protected flush(n: number) {
    this.geo.instanceCount = n;
    this.pos.needsUpdate = this.axis.needsUpdate = this.shape.needsUpdate = true;
  }
}

interface Puff { pos: THREE.Vector3; vel: THREE.Vector3; axis: THREE.Vector3; age: number; life: number; size: number; alpha: number; seed: number; wisp: boolean }

/**
 * The soft cloud wake a whale leaves where it breaks the cloud tops: puffs that swell up where the body
 * cuts the cloud surface and wisps stretched off the flippers and fluke. They live in world space and are
 * left behind as the whale swims on, then thin out and melt. Add `mesh` to the scene. One draw call.
 */
export class CloudWake extends SpritePool {
  private pool: Puff[] = [];
  private next = 0;
  constructor(max = 160) {
    super(max, 0.9);
    this.mesh.renderOrder = 2;
    for (let i = 0; i < max; i++) this.pool.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), axis: new THREE.Vector3(), age: 1, life: 0, size: 0, alpha: 1, seed: 0, wisp: false });
  }
  /**
   * Start a puff at `pos` (world), drifting with `vel`, about `size` metres high at its fullest.
   * With `axis` (world, half length) it is a wisp stretched along that direction.
   */
  spawn(pos: THREE.Vector3, vel: THREE.Vector3, size: number, life = 5, axis?: THREE.Vector3, alpha = 0.9) {
    const p = this.pool[this.next]; this.next = (this.next + 1) % this.pool.length;
    p.pos.copy(pos); p.vel.copy(vel); p.age = 0; p.life = life * (0.75 + Math.random() * 0.5);
    p.size = size; p.alpha = alpha; p.seed = Math.random(); p.wisp = !!axis;
    if (axis) p.axis.copy(axis); else p.axis.set(0, 0, 0);
  }
  update(dt: number) {
    let n = 0;
    const P = this.pos.array as Float32Array, A = this.axis.array as Float32Array, S = this.shape.array as Float32Array;
    for (const p of this.pool) {
      if (p.age >= p.life) continue;
      p.age += dt;
      p.pos.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.exp(-dt * 0.5));
      const k = Math.min(1, p.age / p.life);
      // swell quickly, then thin out and melt
      const grow = Math.min(1, p.age / 0.8);
      const env = (1 - (1 - grow) * (1 - grow)) * (1 - k * k * k);
      const size = p.size * (0.55 + 0.45 * grow + 0.35 * k);
      P.set([p.pos.x, p.pos.y, p.pos.z], n * 3);
      const st = p.wisp ? 1 + k * 0.8 : 1;
      A.set([p.axis.x * st, p.axis.y * st, p.axis.z * st, p.wisp ? 1 : 0], n * 4);
      S.set([size * (p.wisp ? 1 - 0.3 * k : 1), env * p.alpha, p.seed, 1.5], n * 4);
      n++;
    }
    this.flush(n);
  }
}

/**
 * A stand-in cloud layer for the lab: soft puffs whose tops sit about `top`, spread over a disc, in one
 * draw. The real world has its own clouds; this only gives the whale something soft to swim through.
 * Call sort(camera position) when the camera moves, so the puffs blend back to front.
 */
export class SoftCloudLayer extends SpritePool {
  private items: { p: THREE.Vector3; size: number; seed: number; stretch: number; alpha: number }[] = [];
  constructor(opts: { center?: THREE.Vector3; radius?: number; top?: number; count?: number; seed?: number; size?: number; avoid?: { at: THREE.Vector3; r: number } } = {}) {
    const count = opts.count ?? 700;
    super(count, 0.3);
    const c = opts.center ?? new THREE.Vector3(), R = opts.radius ?? 500, top = opts.top ?? 0, S = opts.size ?? 1;
    let s = (opts.seed ?? 5) * 7919 + 13;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (opts.avoid && Math.hypot(x - opts.avoid.at.x, z - opts.avoid.at.z) < opts.avoid.r * (0.6 + r() * 0.4)) continue;
      const size = S * (8 + r() * r() * 20);
      // each card's top edge sits about `top` (a few billows a little higher), the rest of it below, so the
      // layer covers whatever is behind it up to the cloud tops and nothing above them
      this.items.push({ p: new THREE.Vector3(x, top - size * 0.9 + (r() - 0.3) * 2.5, z), size, seed: r(), stretch: 1.4 + r() * 1.0, alpha: 0.9 + r() * 0.1 });
    }
    this.mesh.renderOrder = 1;
    this.sort(new THREE.Vector3(0, 1000, 0));
    // re-sort whenever the camera has moved
    const last = new THREE.Vector3(1e9, 0, 0);
    this.mesh.onBeforeRender = (_r, _s, cam) => { if (cam.position.distanceToSquared(last) > 4) { last.copy(cam.position); this.sort(cam.position); } };
  }
  /** Order the puffs far to near from `eye`. */
  sort(eye: THREE.Vector3) {
    this.items.sort((a, b) => b.p.distanceToSquared(eye) - a.p.distanceToSquared(eye));
    const P = this.pos.array as Float32Array, A = this.axis.array as Float32Array, S = this.shape.array as Float32Array;
    this.items.forEach((it, i) => {
      P.set([it.p.x, it.p.y, it.p.z], i * 3);
      A.set([0, 0, 0, 0], i * 4);
      S.set([it.size, it.alpha, it.seed, it.stretch], i * 4);
    });
    this.flush(this.items.length);
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
