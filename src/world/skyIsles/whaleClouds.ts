import * as THREE from 'three';

/**
 * Painted cloud puffs for the sky whales: the soft three-tone cumulus of the game's sky (warm sunlit tops,
 * cool lavender bellies, a bright rim), as an instanced, fogged material. Used for the cloud wake a whale
 * leaves where it breaks the cloud tops, and for the simple cloud layer of the whale lab.
 */

let puffGeo: THREE.BufferGeometry | null = null;
/** A unit puff: an icosphere with a flattened underside, so a layer of them reads as a cloud sea. */
export function puffGeometry(): THREE.BufferGeometry {
  if (puffGeo) return puffGeo;
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    // smooth sphere normals, and a flat underside facing straight down
    if (p.getY(i) < -0.38) { p.setY(i, -0.38); n.setXYZ(i, 0, -1, 0); }
    else { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, y, z); n.setXYZ(i, x / l, y / l, z / l); }
  }
  puffGeo = g;
  return g;
}

let puffMat: THREE.ShaderMaterial | null = null;
/** One shared material for every whale puff. `sun` is kept in step by the caller (setPuffSun). */
export function puffMaterial(): THREE.ShaderMaterial {
  if (puffMat) return puffMat;
  puffMat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uSun: { value: new THREE.Vector3(0.45, 0.78, 0.43).normalize() },
      uTop: { value: new THREE.Color('#f4f5f8') },
      uBelly: { value: new THREE.Color('#aab6d8') },
      uWarm: { value: new THREE.Color('#fff0dc') },
    }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vN; varying vec3 vW; varying float vSeed; varying float vUp;
      void main(){
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vSeed = fract(instanceMatrix[3].x * 0.013 + instanceMatrix[3].z * 0.007 + instanceMatrix[3].y * 0.019);
        vUp = position.y;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uSun, uTop, uBelly, uWarm;
      varying vec3 vN; varying vec3 vW; varying float vSeed; varying float vUp;
      void main(){
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        float lit = clamp(dot(N, uSun) * 0.5 + 0.5, 0.0, 1.0);
        float k = smoothstep(-0.4, 0.7, N.y) * 0.55 + lit * 0.45;
        k = smoothstep(0.36, 0.52, k) * 0.72 + k * 0.28;
        vec3 col = mix(uBelly, uTop, k);
        // warm light caught in the sunward side of each puff
        col = mix(col, col * uWarm, smoothstep(0.55, 0.95, lit) * 0.35);
        float fres = pow(1.0 - abs(dot(N, V)), 2.5);
        col += vec3(1.0, 0.95, 0.86) * fres * 0.1 * lit;
        col *= 0.965 + vSeed * 0.07;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  return puffMat;
}

/** Point every whale puff's light at the sun (unit vector, world space). */
export function setPuffSun(sunDir: THREE.Vector3) { (puffMaterial().uniforms.uSun.value as THREE.Vector3).copy(sunDir); }

/**
 * A simple flat-topped cloud layer: clumps of puffs whose tops reach about `top`, scattered over a disc.
 * One instanced draw. Used by the whale lab; the real world has its own clouds.
 */
export function cloudSea(opts: { center?: THREE.Vector3; radius?: number; top?: number; clumps?: number; seed?: number; avoid?: { at: THREE.Vector3; r: number }; flat?: number; size?: number } = {}): THREE.InstancedMesh {
  const c = opts.center ?? new THREE.Vector3(), R = opts.radius ?? 400, top = opts.top ?? 0;
  const clumps = opts.clumps ?? 120;
  let s = (opts.seed ?? 5) * 7919 + 13;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const per = 6;
  const mesh = new THREE.InstancedMesh(puffGeometry(), puffMaterial(), clumps * per);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i < clumps; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
    const cx = c.x + Math.cos(a) * d, cz = c.z + Math.sin(a) * d;
    if (opts.avoid && Math.hypot(cx - opts.avoid.at.x, cz - opts.avoid.at.z) < opts.avoid.r) continue;
    const size = (opts.size ?? 1) * (14 + r() * 16);
    for (let j = 0; j < per; j++, k++) {
      const rad = size * (0.55 + r() * 0.55);
      p.set(cx + (r() - 0.5) * size * 2.8, top - rad * 0.55 * (opts.flat ?? 1) + (r() - 0.3) * 4 * (opts.flat ?? 1), cz + (r() - 0.5) * size * 2.8);
      sc.set(rad * (1 + r() * 0.4), rad * 0.72 * (opts.flat ?? 1), rad * (1 + r() * 0.4));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
      m.compose(p, q, sc);
      mesh.setMatrixAt(k, m);
    }
  }
  mesh.count = k;
  mesh.frustumCulled = false;
  return mesh;
}

interface Puff { pos: THREE.Vector3; vel: THREE.Vector3; age: number; life: number; size: number; yaw: number; stretch: number }

/**
 * The soft cloud wake a whale leaves where it breaks the cloud tops: puffs that swell up where the body
 * cuts the cloud surface, stretch out behind and melt back down. Lives in world space (add `mesh` to the scene).
 */
export class CloudWake {
  readonly mesh: THREE.InstancedMesh;
  private pool: Puff[] = [];
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  constructor(max = 72) {
    this.mesh = new THREE.InstancedMesh(puffGeometry(), puffMaterial(), max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < max; i++) this.pool.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 1, life: 0, size: 0, yaw: 0, stretch: 1 });
  }
  /** Start a puff at `pos` (world), drifting with `vel`, about `size` metres across at its fullest. */
  spawn(pos: THREE.Vector3, vel: THREE.Vector3, size: number, yaw: number, life = 5) {
    const p = this.pool[this.next]; this.next = (this.next + 1) % this.pool.length;
    p.pos.copy(pos); p.vel.copy(vel); p.age = 0; p.life = life * (0.75 + Math.random() * 0.5);
    p.size = size; p.yaw = yaw; p.stretch = 1.4 + Math.random() * 0.8;
  }
  update(dt: number) {
    let n = 0;
    for (const p of this.pool) {
      if (p.age >= p.life) continue;
      p.age += dt;
      p.pos.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.exp(-dt * 0.6));
      const k = p.age / p.life;
      // swell quickly, then melt slowly back into the layer
      const grow = Math.min(1, p.age / 0.9);
      const env = (1 - (1 - grow) * (1 - grow)) * (1 - k * k);
      const r = p.size * 0.5 * Math.max(env, 0.001);
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.yaw);
      this.s.set(r, r * 0.6, r * p.stretch * (1 + k * 0.6));
      this.m.compose(p.pos, this.q, this.s);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
