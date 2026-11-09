import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE_GLSL, PAINT } from '../../render/paint';

/**
 * The building blocks of the Sky Isles cumulus: billowing puffs that are lit as one heap.
 *
 * A heap is a dozen flattened spheres (puffs). Each puff knows the heap it belongs to, so the shader can blend
 * the puff's own normal with the heap's dome normal: every billow keeps its own little light and shadow, but the
 * whole mass still reads as one cloud with a cream sunlit crown and a cool lavender belly.
 *
 * Clouds are drawn as sorted transparent puffs that never write depth. That keeps the finish pass from inking
 * every billow (it finds its lines in the depth buffer) and gives the soft, laid-over edges of a painted cloud.
 * The price is sorting: a PuffLayer culls its puffs against the view (and the planet's horizon) and sorts the
 * survivors back to front every frame, on the CPU, which is cheap for a few thousand puffs.
 */

// ------------------------------------------------------------------ palettes

/** Colours of a cloud at one light (sRGB hex). */
export interface CloudPalette {
  top: string; warm: string; mid: string; belly: string; deep: string; rim: string; glow: string;
  /** How strongly clouds glow at their edges when you look toward the sun. */
  glowK: number;
  /** How much the sky above lights the up-facing tops, on top of the sun. */
  skyW: number;
  /** Brightness of the sunlit tops (above 1 they start to bloom). */
  gain: number;
}

export const MIDDAY: CloudPalette = {
  top: '#fffaf0', warm: '#fff3e0', mid: '#dbe2f4', belly: '#b2c0e6', deep: '#8ea6da', rim: '#ffffff', glow: '#fff3dc',
  glowK: 0.35, skyW: 0.2, gain: 1.03,
};
export const GOLDEN: CloudPalette = {
  top: '#fff0d6', warm: '#ffd08e', mid: '#dccbd6', belly: '#aaa6cf', deep: '#8188c0', rim: '#ffe0a8', glow: '#ffb060',
  glowK: 1.0, skyW: 0.18, gain: 1.1,
};

/** Uniforms every cloud material shares with its CloudSea (one palette drives them all). */
export function cloudUniforms() {
  return {
    uSun: PAINT.uSun,
    uTime: { value: 0 },
    uTop: { value: new THREE.Color(MIDDAY.top) },
    uWarm: { value: new THREE.Color(MIDDAY.warm) },
    uMid: { value: new THREE.Color(MIDDAY.mid) },
    uBelly: { value: new THREE.Color(MIDDAY.belly) },
    uDeep: { value: new THREE.Color(MIDDAY.deep) },
    uRim: { value: new THREE.Color(MIDDAY.rim) },
    uGlow: { value: new THREE.Color(MIDDAY.glow) },
    uGlowK: { value: MIDDAY.glowK },
    uSkyW: { value: MIDDAY.skyW },
    uGain: { value: MIDDAY.gain },
    uHaze: { value: new THREE.Color('#cfe5f2') },
    uHazeD: { value: 0.0017 },
  };
}
export type CloudUniforms = ReturnType<typeof cloudUniforms>;

const ca = new THREE.Color(), cb = new THREE.Color();
/** Blend the shared uniforms between midday (k = 0) and golden hour (k = 1). */
export function applyPalette(u: CloudUniforms, k: number, a = MIDDAY, b = GOLDEN) {
  const mix = (key: keyof CloudPalette, c: THREE.Color) => c.copy(ca.set(a[key] as string)).lerp(cb.set(b[key] as string), k);
  mix('top', u.uTop.value); mix('warm', u.uWarm.value); mix('mid', u.uMid.value); mix('belly', u.uBelly.value);
  mix('deep', u.uDeep.value); mix('rim', u.uRim.value); mix('glow', u.uGlow.value);
  u.uGlowK.value = a.glowK + (b.glowK - a.glowK) * k;
  u.uSkyW.value = a.skyW + (b.skyW - a.skyW) * k;
  u.uGain.value = a.gain + (b.gain - a.gain) * k;
}

// ------------------------------------------------------------------ the puff material

/**
 * One material per layer: the shared uniforms plus the layer's own frame.
 * up: either radial from uCenter (the cloud sea on a small planet) or a fixed uFlatUp (the far, flattened sea).
 */
export function puffMaterial(shared: CloudUniforms, opts: { flat?: boolean; flatBottom?: number; billow?: number; nearFade?: number } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: {
      ...shared,
      uCenter: { value: new THREE.Vector3() },
      uFlatUp: { value: new THREE.Vector3(0, 1, 0) },
      uFlat: { value: opts.flat ? 1 : 0 },
      uFlatBottom: { value: opts.flatBottom ?? 1e4 },
      uBillow: { value: opts.billow ?? 1 },
      uNearFade: { value: opts.nearFade ?? 2.5 },
      // flat layers only: fade heaps in and out by their distance from uRingO across the plane (in0, in1, out0, out1)
      uRing: { value: new THREE.Vector4(-2, -1, 1e9, 2e9) },
      uRingO: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aHeap;   // heap centre (layer space, at the heap's base) and heap radius
      attribute vec4 aInfo;   // heap height, seed, -, haze multiplier
      uniform float uTime, uBillow, uFlat, uFlatBottom;
      uniform vec3 uCenter, uFlatUp, uRingO; uniform vec4 uRing;
      varying vec3 vW; varying vec3 vN; varying vec3 vHN; varying float vHv; varying float vSeed; varying float vHazeK; varying float vFade;
      ${NOISE_GLSL}
      void main(){
        float seed = aInfo.y;
        // billowing: two slow noise octaves swell and sink the surface, and the puff breathes a little
        vec3 p = position;
        float n1 = pNoise(p * 1.7 + vec3(seed * 17.0, uTime * 0.07, seed * 5.0));
        float n2 = pNoise(p * 3.9 + vec3(-uTime * 0.05, seed * 9.0, 2.0));
        float breathe = 1.0 + 0.03 * sin(uTime * 0.37 + seed * 40.0);
        p *= breathe * (1.0 + ((n1 - 0.5) * 0.32 + (n2 - 0.5) * 0.13) * uBillow);
        mat3 im = mat3(instanceMatrix);
        vec3 s2 = vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vec3 hc = (modelMatrix * vec4(aHeap.xyz, 1.0)).xyz;
        vec3 up = uFlat > 0.5 ? uFlatUp : normalize(hc - uCenter);
        vec3 d = wp.xyz - hc;
        float dv = dot(d, up);
        // cumulus have flat bases: squash whatever hangs below the heap's floor
        if (dv < -uFlatBottom) { wp.xyz += up * (-uFlatBottom - dv); dv = -uFlatBottom; }
        vec3 dh = d - up * dv;
        float H = max(aInfo.x, 0.1), R = max(aHeap.w, 0.1);
        // normal of the heap's dome (an ellipsoid R wide and H high) at this point
        vHN = dh * (H / R) + up * dv * (R / H);
        vHv = dv / H;
        vN = normalize(mat3(modelMatrix) * (im * (normal / s2)));
        vW = wp.xyz;
        vSeed = fract(seed * 7.13);
        vHazeK = aInfo.w;
        vec3 ro = hc - uRingO; float rho = length(ro - up * dot(ro, up));
        vFade = smoothstep(uRing.x, uRing.y, rho) * (1.0 - smoothstep(uRing.z, uRing.w, rho));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uTop, uWarm, uMid, uBelly, uDeep, uRim, uGlow, uHaze, uCenter, uFlatUp;
      uniform float uGlowK, uSkyW, uHazeD, uFlat, uNearFade, uTime, uGain;
      varying vec3 vW; varying vec3 vN; varying vec3 vHN; varying float vHv; varying float vSeed; varying float vHazeK; varying float vFade;
      ${NOISE_GLSL}
      void main(){
        if (vFade < 0.004) discard;
        vec3 up = uFlat > 0.5 ? uFlatUp : normalize(vW - uCenter);
        vec3 N = normalize(vN);
        vec3 HN = normalize(vHN + up * 1e-4);
        // light the heap as one mass, with the puff's own normal adding the billows
        vec3 Ns = normalize(N * 0.28 + HN * 0.72);
        vec3 toCam = cameraPosition - vW;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        float ndl = dot(Ns, uSun);
        float nup = dot(Ns, up);
        float hv = clamp(vHv, -0.3, 1.0);
        float high = smoothstep(-0.05, 0.8, hv);
        // tucked: where a billow turns in under its neighbours (its normal leaves the heap's dome)
        float outer = smoothstep(-0.1, 0.85, dot(N, HN));
        // soft toon light: one clean terminator band over a broad wrap
        float k = smoothstep(-0.12, 0.62, ndl * 0.85 + nup * uSkyW);
        float lit = mix(k, smoothstep(0.4, 0.6, k), 0.55);
        // the light falls off toward the heap's belly and into the tucks between billows
        lit *= mix(0.22, 1.0, high) * mix(0.45, 1.0, outer);
        // the shadow side: deep periwinkle low down, lavender bellies, pale lilac where it faces the sky
        vec3 shade = mix(uDeep, uBelly, smoothstep(-0.2, 0.5, hv));
        shade = mix(shade, uMid, smoothstep(0.0, 0.9, nup) * 0.5 * outer);
        vec3 lightC = mix(uTop, uWarm, smoothstep(0.55, 0.95, ndl)) * mix(1.0, uGain, high);
        vec3 col = mix(shade, lightC, clamp(lit, 0.0, 1.0));
        float nv = abs(dot(N, V));
        float edge = 1.0 - nv;
        // a soft cool line where a billow turns away on the shadow side, and a bright fringe on the lit side
        col = mix(col, shade * 0.94, smoothstep(0.7, 0.98, edge) * (1.0 - lit) * 0.45);
        col += uRim * smoothstep(0.6, 1.0, edge) * lit * 0.08;
        // the painted contour under each billow: a thin lilac line where it lies over the mass behind
        col = mix(col, uBelly, smoothstep(0.55, 0.9, edge) * smoothstep(0.0, -0.6, dot(N, up)) * 0.5);
        // silver lining: thin edges glow when the sun is behind them
        float fwd = pow(max(dot(-V, uSun), 0.0), 3.0);
        float sunSide = smoothstep(-0.5, 0.3, dot(N, uSun) + dot(N, up) * 0.4);
        col += uGlow * uGlowK * fwd * (smoothstep(0.5, 0.95, edge) * 1.2 * sunSide + 0.08 * high * high);
        // watercolour variation
        col *= 1.0 + (pNoise(vW * 0.09 + vSeed * 10.0) - 0.5) * 0.06 + (vSeed - 0.5) * 0.03;
        // aerial haze: further is paler and bluer, fading into the horizon
        float f = 1.0 - exp(-pow(dist * uHazeD * vHazeK, 1.5));
        // toward the sun the haze itself glows
        vec3 haze = mix(uHaze, uGlow * 1.15, clamp(pow(max(dot(-V, uSun), 0.0), 6.0) * uGlowK * 0.6, 0.0, 0.7));
        col = mix(col, haze, f);
        // each billow keeps a crisp scalloped top but melts into the mass below it: its underside edge fades out
        float under = smoothstep(0.2, -0.7, dot(N, up));
        float a = smoothstep(0.0, mix(0.14, 0.75, under), nv) * smoothstep(uNearFade, uNearFade * 2.5, dist) * vFade;
        gl_FragColor = vec4(col, a);
      }`,
  });
}

// ------------------------------------------------------------------ geometry

const puffGeos = new Map<number, THREE.BufferGeometry>();
/** A unit sphere, indexed (so the vertex shader runs once per corner). detail 1 = 80, 2 = 320, 3 = 1280 triangles. */
export function puffGeometry(detail: number) {
  let g = puffGeos.get(detail);
  if (g) return g;
  const ico = new THREE.IcosahedronGeometry(1, detail);
  ico.deleteAttribute('uv');
  g = mergeVertices(ico);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  puffGeos.set(detail, g);
  return g;
}

// ------------------------------------------------------------------ heaps

/** Collects puffs, then becomes a PuffLayer. */
export class PuffBuilder {
  mats: number[] = [];
  heaps: number[] = [];
  infos: number[] = [];
  private m = new THREE.Matrix4();
  get count() { return this.infos.length / 4; }
  add(pos: THREE.Vector3, quat: THREE.Quaternion, scale: THREE.Vector3, heapC: THREE.Vector3, heapR: number, heapH: number, seed: number, haze = 1) {
    this.m.compose(pos, quat, scale);
    this.mats.push(...this.m.elements);
    this.heaps.push(heapC.x, heapC.y, heapC.z, heapR);
    this.infos.push(heapH, seed, 0, haze);
  }
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

export interface HeapShape {
  /** Puffs in the heap. */
  n: number;
  /** How flat each puff is (height / width). */
  flat?: number;
  /** 0: a low rolling mound .. 1: a tall cauliflower. */
  tall?: number;
  /** Small billows studding the upper dome, as a fraction of n (default 0.45). */
  billows?: number;
  /** Scale of the puffs against the heap (default 1); smaller puffs come in greater numbers to fill the same dome. */
  puff?: number;
  /** Light the puffs as part of a bigger mass than this heap (e.g. one tier of a towering cumulus). */
  mass?: { base: THREE.Vector3; R: number; H: number };
}

/**
 * One cumulus heap: a skirt of wide low puffs, a ring of body puffs, and a crown on top.
 * `base` is the heap's floor centre, `R` its radius, `H` its height (to the top of the crown).
 */
export function addHeap(b: PuffBuilder, base: THREE.Vector3, up: THREE.Vector3, R: number, H: number, rnd: () => number, shape: HeapShape, haze = 1) {
  tangentFrame(up, _t1, _t2);
  _q.setFromUnitVectors(_Y, up);
  const flat = shape.flat ?? 0.82;
  const ps = shape.puff ?? 1;
  const n = Math.round(shape.n / Math.pow(ps, 1.6));
  const nSkirt = Math.max(2, Math.round(n * 0.42)), nCrown = Math.max(1, Math.round(n * 0.2)), nBody = Math.max(1, n - nSkirt - nCrown);
  // the crown leans a little to one side, so heaps are not perfect domes
  const lean = rnd() * Math.PI * 2, leanD = R * 0.18 * rnd();
  const lx = Math.cos(lean) * leanD, lz = Math.sin(lean) * leanD;
  const put = (ang: number, rho: number, y: number, pr0: number) => {
    // smaller puffs keep their place on the dome's surface
    const pr = pr0 * ps;
    y += pr0 * (1 - ps) * flat * 0.8;
    rho = Math.min(rho + pr0 * (1 - ps) * 0.6, R - pr * 0.8);
    const x = Math.cos(ang) * rho, z = Math.sin(ang) * rho;
    _p.copy(base).addScaledVector(_t1, x).addScaledVector(_t2, z).addScaledVector(up, y);
    _qy.setFromAxisAngle(_Y, rnd() * Math.PI * 2);
    const sx = pr * (0.92 + rnd() * 0.16), sz = pr * (0.92 + rnd() * 0.16);
    _s.set(sx, pr * flat * (0.9 + rnd() * 0.2), sz);
    const m = shape.mass;
    b.add(_p, _qy.premultiply(_q), _s, m ? m.base : base, m ? m.R : R, m ? m.H : H, rnd() * 100, haze);
  };
  const a0 = rnd() * Math.PI * 2;
  for (let i = 0; i < nSkirt; i++) {
    const pr = R * (0.26 + rnd() * 0.12);
    put(a0 + (i / nSkirt) * Math.PI * 2 + (rnd() - 0.5) * 0.6, R - pr * (0.95 + rnd() * 0.2), pr * flat * 0.15 + rnd() * H * 0.08, pr);
  }
  for (let i = 0; i < nBody; i++) {
    const pr = R * (0.3 + rnd() * 0.14);
    const ang = a0 + 0.4 + (i / nBody) * Math.PI * 2 + (rnd() - 0.5) * 0.8;
    const rho = R * (0.22 + rnd() * 0.25);
    put(ang, rho, H * (0.32 + rnd() * 0.16) - pr * flat * 0.4, pr);
  }
  for (let i = 0; i < nCrown; i++) {
    const pr = R * (0.28 + rnd() * 0.12) * (shape.tall ? 1 - shape.tall * 0.25 : 1);
    const ang = rnd() * Math.PI * 2, rho = R * 0.16 * Math.sqrt(rnd());
    const x = Math.cos(ang) * rho + lx, z = Math.sin(ang) * rho + lz;
    put(Math.atan2(z, x), Math.hypot(x, z), H - pr * flat * (0.9 + rnd() * 0.25), pr);
  }
  // small billows half-sunk into the upper dome: the cauliflower texture of a cumulus crown
  const nB = Math.round(n * (shape.billows ?? 0.45));
  for (let i = 0; i < nB; i++) {
    const u = rnd(), rho = R * 0.8 * Math.sqrt(u);
    const ang = rnd() * Math.PI * 2;
    const x = Math.cos(ang) * rho + lx * (1 - u), z = Math.sin(ang) * rho + lz * (1 - u);
    const ys = H * 0.92 * Math.sqrt(Math.max(0, 1 - (rho / R) ** 2));
    const pr = R * (0.15 + rnd() * 0.1);
    put(Math.atan2(z, x), Math.hypot(x, z), ys - pr * flat * 0.55, pr);
  }
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
function puffDraw(geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial, n: number): PuffDraw {
  const g = geo.clone();
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
 * An InstancedMesh of puffs that, each frame, keeps only the puffs in view (and on this side of the planet)
 * and draws them back to front. All puff data lives in the layer's local space (keep the layer unscaled).
 * With `near`, puffs closer than near.dist are drawn with a finer sphere in a second mesh, after the rest
 * (they are all in front of the others, so the back-to-front order holds across the two draws).
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
  private far: PuffDraw;
  private near?: PuffDraw;
  private nearD2 = 0;
  constructor(b: PuffBuilder, geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial, near?: { geo: THREE.BufferGeometry; dist: number }) {
    this.total = b.count;
    this.mats = new Float32Array(b.mats); this.heaps = new Float32Array(b.heaps); this.infos = new Float32Array(b.infos);
    const n = this.total;
    this.cx = new Float32Array(n); this.cy = new Float32Array(n); this.cz = new Float32Array(n); this.rad = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const e = this.mats.subarray(i * 16, i * 16 + 16);
      this.cx[i] = e[12]; this.cy[i] = e[13]; this.cz[i] = e[14];
      const s = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
      this.rad[i] = s * 1.25;
    }
    this.order = new Uint32Array(n);
    this.key = new Float32Array(n);
    this.far = puffDraw(geo, mat, n);
    this.mesh = this.far.mesh;
    if (near) {
      this.near = puffDraw(near.geo, mat, n);
      this.nearD2 = near.dist * near.dist;
      const g = new THREE.Group();
      g.add(this.far.mesh, this.near.mesh);
      this.object = g;
    } else this.object = this.mesh;
  }

  /** Puffs nearer than this (metres) go to the near mesh. */
  set nearDist(d: number) { this.nearD2 = d * d; }
  set renderOrder(r: number) { this.far.mesh.renderOrder = r; if (this.near) this.near.mesh.renderOrder = r + 0.5; }
  /** Puffs drawn last frame. */
  get drawn() { return this.far.mesh.count + (this.near?.mesh.count ?? 0); }
  /** Triangles drawn last frame. */
  get triangles() {
    const t = (d?: PuffDraw) => d ? d.mesh.count * (d.mesh.geometry.index!.count / 3) : 0;
    return t(this.far) + t(this.near);
  }

  /** Show every puff unsorted (until the next refresh). */
  showAll() { this.write(this.order.map((_, i) => i), this.total, 0); }

  /**
   * Cull and sort for `camera`. `keep(i, camL)` can reject more puffs (e.g. those behind the planet);
   * camL is the camera position in layer space. Call after the layer's matrixWorld is current.
   */
  refresh(camera: THREE.Camera, keep?: (i: number, camL: THREE.Vector3) => boolean) {
    const mw = this.mesh.matrixWorld;
    _m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mw);
    _fr.setFromProjectionMatrix(_m4);
    const camL = _camL.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(_m4.copy(mw).invert());
    const planes = _fr.planes;
    let n = 0;
    const { cx, cy, cz, rad, order, key } = this;
    for (let i = 0; i < this.total; i++) {
      const x = cx[i], y = cy[i], z = cz[i], r = rad[i];
      let inside = true;
      for (let p = 0; p < 6; p++) {
        const pl = planes[p];
        if (pl.normal.x * x + pl.normal.y * y + pl.normal.z * z + pl.constant < -r) { inside = false; break; }
      }
      if (!inside) continue;
      if (keep && !keep(i, camL)) continue;
      const dx = x - camL.x, dy = y - camL.y, dz = z - camL.z;
      key[i] = dx * dx + dy * dy + dz * dz;
      order[n++] = i;
    }
    const sub = order.subarray(0, n);
    sub.sort((a, b) => key[b] - key[a]);
    // the far ones first; the first index nearer than nearD2 starts the near mesh
    let split = n;
    if (this.near) { split = 0; while (split < n && key[sub[split]] > this.nearD2) split++; }
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
