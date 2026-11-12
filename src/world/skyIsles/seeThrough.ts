// World 2, the Sky Isles: the camera is never blinded by a tree, a house or a windmill. Everything that can stand
// between the camera and Nilo (trees, cottages, windmills, props, tufts, people) melts away in a soft dithered
// circle round him: only the parts nearer the camera than he is, so the ground under his feet and whatever stands
// behind him stay solid. One set of shared uniforms drives every patched material.
//
// Small meshes are also taken out of the shadow pass (see visit).
//
// Materials only the Sky Isles use are patched in place; a material World 1 (or any other world) shares is cloned
// for the sky's meshes first (a ShaderMaterial's clone keeps the very same uniforms object, so its animation still
// runs), so the other worlds draw exactly as before.
import * as THREE from 'three';

export const SEE = {
  uSeeOn: { value: 0 },
  /** Nilo's place on screen, in drawing-buffer pixels. */
  uSeeXY: { value: new THREE.Vector2() },
  /** The circle's radius, pixels (x) and its view distance cut-off (y): only nearer fragments melt. */
  uSeeR: { value: new THREE.Vector2(1, 0) },
  /** Camera near and far, for linear depth. */
  uSeeNF: { value: new THREE.Vector2(0.1, 1000) },
};

const CHUNK = /* glsl */ `
uniform float uSeeOn;
uniform vec2 uSeeXY;
uniform vec2 uSeeR;
uniform vec2 uSeeNF;
float seeBayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float b = mod(q.x * 2.0 + q.y * 3.0 + floor(q.x * 0.5) * 7.0 + floor(q.y * 0.5) * 5.0, 16.0);
  return (b + 0.5) / 16.0;
}
`;
const TEST = /* glsl */ `
  if (uSeeOn > 0.001) {
    vec2 sd = (gl_FragCoord.xy - uSeeXY) / uSeeR.x;
    float sr = length(sd * vec2(1.0, 0.8));
    float zl = (uSeeNF.x * uSeeNF.y) / (uSeeNF.y - gl_FragCoord.z * (uSeeNF.y - uSeeNF.x));
    // a clean round window onto Nilo through whatever stands nearer the camera than he does, and anything right
    // in front of the lens (a leafy crown the camera backs into) melts away whole
    float k = smoothstep(1.0, 0.9, sr) * smoothstep(uSeeR.y, uSeeR.y - 0.8, zl);
    k = max(k, smoothstep(2.6, 1.4, zl));
    if (k * uSeeOn > seeBayer(gl_FragCoord.xy)) discard;
  }
`;

const MAIN = /void\s+main\s*\(\s*\)\s*\{/;

function patch(m: THREE.Material) {
  if (m.userData.see) return;
  m.userData.see = true;
  const prev = m.onBeforeCompile.bind(m);
  const prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    if (!MAIN.test(shader.fragmentShader)) return;
    Object.assign(shader.uniforms, SEE);
    shader.fragmentShader = CHUNK + shader.fragmentShader.replace(MAIN, m2 => m2 + TEST);
  };
  m.customProgramCacheKey = () => prevKey() + '|see';
  m.needsUpdate = true;
}

/** Names of groups whose meshes are ground you walk on (never melted: it would open holes under his feet). */
const GROUND = new Set(['islandBody', 'aqueduct', 'ropeBridge', 'pavedPath', 'footBridge', 'stoneSteps', 'mossrestGround']);

export class SeeThrough {
  private clones = new Map<THREE.Material, THREE.Material>();
  private others: Set<THREE.Material> | null = null;
  private done = new WeakSet<THREE.Object3D>();
  private k = 0;
  private v = new THREE.Vector3();
  private size = new THREE.Vector2();

  /**
   * keepShader: a clone keeps the original's own shader patch (onBeforeCompile and its cache key), which
   * Material.clone drops. World 3 asks for it (its village shares the painted kit materials); the Sky Isles keep
   * the behaviour they were tuned with.
   */
  constructor(private scene: THREE.Scene, private roots: () => THREE.Object3D[], private opts: { keepShader?: boolean } = {}) {}

  /** Patch the materials under the sky's roots (new meshes too: call now and then). */
  scan() {
    const roots = this.roots();
    if (!this.others) {
      // every material drawn by anything outside the sky's roots
      const inSky = new Set<THREE.Object3D>(roots);
      this.others = new Set();
      const walk = (o: THREE.Object3D) => {
        if (inSky.has(o)) return;
        const m = (o as THREE.Mesh).material;
        if (m) for (const x of Array.isArray(m) ? m : [m]) this.others!.add(x);
        for (const c of o.children) walk(c);
      };
      walk(this.scene);
      // and the ground's own materials (the island rock is shared with its loose stones): those are cloned too
      const ground = (o: THREE.Object3D, g: boolean) => {
        const gg = g || GROUND.has(o.name);
        const m = (o as THREE.Mesh).material;
        if (gg && m) for (const x of Array.isArray(m) ? m : [m]) this.others!.add(x);
        for (const c of o.children) ground(c, gg);
      };
      for (const r of roots) ground(r, false);
    }
    for (const r of roots) this.visit(r, false);
  }

  private visit(o: THREE.Object3D, ground: boolean) {
    const g = ground || GROUND.has(o.name);
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !g && !this.done.has(o)) {
      this.done.add(o);
      // (and the small things cast no shadow: a peg's or a flower's is a speck nobody sees, and a draw call each)
      if (mesh.castShadow) {
        if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
        if (mesh.geometry.boundingSphere!.radius * o.getWorldScale(this.v).x < 0.6) mesh.castShadow = false;
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const out = mats.map(m => this.use(m));
      mesh.material = Array.isArray(mesh.material) ? out : out[0];
    }
    for (const c of o.children) this.visit(c, g);
  }

  private use(m: THREE.Material): THREE.Material {
    if ((m as THREE.MeshBasicMaterial).transparent || m.userData.noSee) return m;
    if (!this.others!.has(m)) { patch(m); return m; }
    let c = this.clones.get(m);
    if (!c) {
      c = m.clone();
      const sm = m as THREE.ShaderMaterial;
      if (sm.isShaderMaterial) (c as THREE.ShaderMaterial).uniforms = sm.uniforms;
      if (this.opts.keepShader && Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) {
        c.onBeforeCompile = m.onBeforeCompile;
        c.customProgramCacheKey = m.customProgramCacheKey;
      }
      patch(c);
      this.clones.set(m, c);
    }
    return c;
  }

  /** Each frame: where Nilo is on screen, and whether the melt is on (eased). */
  update(dt: number, on: boolean, camera: THREE.PerspectiveCamera, target: THREE.Vector3, renderer: THREE.WebGLRenderer) {
    this.k += ((on ? 1 : 0) - this.k) * (1 - Math.exp(-6 * dt));
    SEE.uSeeOn.value = this.k < 0.01 ? 0 : this.k;
    if (SEE.uSeeOn.value === 0) return;
    renderer.getDrawingBufferSize(this.size);
    const ndc = this.v.copy(target).project(camera);
    SEE.uSeeXY.value.set((ndc.x * 0.5 + 0.5) * this.size.x, (ndc.y * 0.5 + 0.5) * this.size.y);
    const dist = camera.position.distanceTo(target);
    // about 2.3 m round him, in pixels at his distance
    const px = (2.3 / (dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))) * this.size.y / 2;
    SEE.uSeeR.value.set(Math.max(40, px), dist - 1.1);
    SEE.uSeeNF.value.set(camera.near, camera.far);
  }

  /** Off everywhere (other worlds): the uniform stays 0, so patched shaders draw exactly as they did. */
  off() { this.k = 0; SEE.uSeeOn.value = 0; }
}
