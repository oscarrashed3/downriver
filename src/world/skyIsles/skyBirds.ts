import * as THREE from 'three';

/**
 * Flocks of distant birds: white gulls wheeling in loose groups, flapping and gliding.
 * One InstancedMesh, and every bird is moved and flapped in the vertex shader (no per-frame CPU work).
 * Each flock circles a centre in the mesh's local space (its parent decides where "up" is).
 */
export interface FlockSpec {
  /** Centre of the flock's circle (local space). */
  center: THREE.Vector3;
  /** Circle radius and angular speed (rad/s; negative turns the other way). */
  radius: number; speed: number;
  birds: number;
  /** Wingspan in metres. */
  span?: number;
}

function birdGeometry() {
  // body (a thin diamond) and two wings of two panels each; aWing: 0 body, 1 inner wing, 2 wing tip
  const P: number[] = [], W: number[] = [];
  const tri = (a: number[], b: number[], c: number[], wa: number, wb: number, wc: number) => { P.push(...a, ...b, ...c); W.push(wa, wb, wc); };
  const nose = [0, 0, 0.42], tail = [0, 0.02, -0.5], tl = [-0.09, 0, -0.62], tr = [0.09, 0, -0.62];
  const sl = [-0.06, 0, 0], sr = [0.06, 0, 0];
  tri(nose, sl, tail, 0, 0, 0); tri(nose, tail, sr, 0, 0, 0);
  tri(tail, tl, tr, 0, 0, 0);
  for (const s of [-1, 1]) {
    const root0 = [s * 0.05, 0, 0.14], root1 = [s * 0.05, 0, -0.16];
    const mid0 = [s * 0.5, 0, 0.1], mid1 = [s * 0.48, 0, -0.14];
    const tip = [s * 1.0, 0, -0.18];
    tri(root0, mid0, root1, 0, 1, 0); tri(root1, mid0, mid1, 0, 1, 1);
    tri(mid0, tip, mid1, 1, 2, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(W, 1));
  return g;
}

export class SkyBirds {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  constructor(flocks: FlockSpec[], seed = 5) {
    let s = seed * 9301 + 49297;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const geo = new THREE.InstancedBufferGeometry().copy(birdGeometry() as unknown as THREE.InstancedBufferGeometry);
    const A: number[] = [], B: number[] = [], C: number[] = [];
    for (const f of flocks) {
      const span = f.span ?? 1.6;
      for (let i = 0; i < f.birds; i++) {
        // loose V-ish cluster: behind and to the sides of the leader
        const row = Math.floor(Math.sqrt(i * 1.6));
        const side = i % 2 ? 1 : -1;
        A.push(f.center.x, f.center.y, f.center.z, f.radius);
        B.push(side * row * span * (1.1 + r() * 0.8), (r() - 0.5) * span * 1.5, -row * span * (1.2 + r() * 0.9), span * (0.85 + r() * 0.3));
        C.push(f.speed, r() * Math.PI * 2, 4.5 + r() * 2.0, r() * 10);
      }
    }
    // flocks share a starting angle per flock (the leader's), stored in C.y of bird 0 of each flock
    let k = 0;
    for (const f of flocks) { const a0 = r() * Math.PI * 2; for (let i = 0; i < f.birds; i++, k++) C[k * 4 + 1] = a0; }
    geo.setAttribute('aCircle', new THREE.InstancedBufferAttribute(new Float32Array(A), 4));
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(B), 4));
    geo.setAttribute('aFly', new THREE.InstancedBufferAttribute(new Float32Array(C), 4));
    geo.instanceCount = A.length / 4;
    this.mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      // drawn after the clouds without depth: no ink specks, and no ink showing through clouds
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWhite: { value: new THREE.Color('#fbf8f2') },
        uUnder: { value: new THREE.Color('#a8b2d2') },
        uHaze: { value: new THREE.Color('#cfe5f2') },
        uHazeD: { value: 0.0035 },
      },
      vertexShader: /* glsl */ `
        attribute float aWing; attribute vec4 aCircle; attribute vec4 aOff; attribute vec4 aFly;
        uniform float uTime;
        varying float vShade; varying vec3 vW;
        void main(){
          float t = uTime + aFly.w * 0.0;
          float ang = aFly.y + aFly.x * uTime;
          float dir = sign(aFly.x);
          // the flock's leader on its circle, bobbing gently
          vec3 c = aCircle.xyz + vec3(cos(ang) * aCircle.w, sin(uTime * 0.3 + aFly.y) * 2.0, sin(ang) * aCircle.w);
          vec3 fwd = normalize(vec3(-sin(ang), 0.0, cos(ang)) * dir);
          vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
          // each bird: offset in the flock frame, drifting a little
          vec3 off = aOff.xyz + vec3(sin(uTime * 0.5 + aFly.w), sin(uTime * 0.7 + aFly.w * 2.0) * 0.6, cos(uTime * 0.4 + aFly.w)) * 0.6;
          vec3 base = c + side * off.x + vec3(0.0, off.y, 0.0) + fwd * off.z;
          // flap a few beats, then glide with wings held a little up
          float ph = uTime * aFly.z + aFly.w * 6.0;
          float burst = smoothstep(-0.2, 0.4, sin(uTime * 0.6 + aFly.w * 3.0));
          float flap = mix(0.18, sin(ph), burst);
          vec3 p = position * aOff.w;
          float wx = abs(position.x);
          p.y += aWing * wx * flap * 0.55 * aOff.w;
          p.y += (aWing > 1.5 ? 1.0 : 0.0) * flap * 0.12 * aOff.w;
          // banking into the turn
          float bank = 0.25 * dir;
          p.y += p.x * bank;
          vec3 wp = base + side * p.x + vec3(0.0, p.y, 0.0) + fwd * p.z;
          vec4 w = modelMatrix * vec4(wp, 1.0);
          vW = w.xyz;
          vShade = aWing > 0.5 ? clamp(0.55 + flap * 0.35, 0.0, 1.0) : 0.85;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uWhite, uUnder, uHaze; uniform float uHazeD;
        varying float vShade; varying vec3 vW;
        void main(){
          vec3 col = mix(uUnder, uWhite, gl_FrontFacing ? vShade : vShade * 0.6);
          float d = length(cameraPosition - vW);
          col = mix(col, uHaze, 1.0 - exp(-pow(d * uHazeD, 1.5)));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.userData.noOutline = true;
  }
  update(t: number) { this.mat.uniforms.uTime.value = t; }
}
