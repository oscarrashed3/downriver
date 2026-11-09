import * as THREE from 'three';

/**
 * Flocks of distant birds: white gulls wheeling in loose groups, flapping and gliding.
 * One instanced mesh, and every bird is moved and flapped in the vertex shader (no per-frame CPU work).
 * Each flock circles a centre in the mesh's local space (its parent decides where "up" is).
 *
 * A gull is a plump white body with a gull's bent wing (the inner wing lifted, the hand swept back and down),
 * shaded in two tones: white where the light catches it, soft blue-grey underneath, with grey wing tips.
 * Its size on screen is held between a floor (far gulls still read as birds, not scratches) and a cap (near
 * ones never become big flat blades).
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
  // aWing: 0 body, 1 inner wing, 2 hand, 3 tip; aTone: 1 = body (plumper, always white on top)
  const P: number[] = [], W: number[] = [];
  const tri = (a: number[], b: number[], c: number[], wa: number, wb: number, wc: number) => { P.push(...a, ...b, ...c); W.push(wa, wb, wc); };
  // body: a short spindle seen from above and the side (two crossed diamonds)
  const nose = [0, 0.01, 0.36], tail = [0, 0.02, -0.34], tl = [-0.07, 0.02, -0.46], tr = [0.07, 0.02, -0.46];
  const sl = [-0.075, 0, 0.02], sr = [0.075, 0, 0.02], top = [0, 0.06, 0.02], bot = [0, -0.05, 0.02];
  tri(nose, sl, tail, 0, 0, 0); tri(nose, tail, sr, 0, 0, 0);
  tri(nose, top, tail, 0, 0, 0); tri(nose, tail, bot, 0, 0, 0);
  tri(tail, tl, tr, 0, 0, 0);
  for (const s of [-1, 1]) {
    // a gull wing: broad at the root, the wrist forward, the hand long, narrow and swept back
    const r0 = [s * 0.05, 0, 0.15], r1 = [s * 0.05, 0, -0.12];
    const w0 = [s * 0.46, 0, 0.17], w1 = [s * 0.44, 0, -0.06];
    const h0 = [s * 0.78, 0, 0.06], h1 = [s * 0.74, 0, -0.08];
    const tip = [s * 1.0, 0, -0.16];
    // (wound so the upper side is the front face on both wings)
    const t = (a: number[], b: number[], c: number[], wa: number, wb: number, wc: number) => s > 0 ? tri(a, b, c, wa, wb, wc) : tri(a, c, b, wa, wc, wb);
    t(r0, w0, r1, 0, 1, 0); t(r1, w0, w1, 0, 1, 1);
    t(w0, h0, w1, 1, 2, 1); t(w1, h0, h1, 1, 2, 2);
    t(h0, tip, h1, 2, 3, 2);
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
      const a0 = r() * Math.PI * 2;
      for (let i = 0; i < f.birds; i++) {
        // a loose V behind and to the sides of the leader
        const row = Math.floor(Math.sqrt(i * 1.6));
        const side = i % 2 ? 1 : -1;
        A.push(f.center.x, f.center.y, f.center.z, f.radius);
        B.push(side * row * span * (1.1 + r() * 0.8), (r() - 0.5) * span * 1.5, -row * span * (1.2 + r() * 0.9), span * (0.85 + r() * 0.3));
        C.push(f.speed, a0, 3.6 + r() * 1.6, r() * 10);
      }
    }
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
        uWhite: { value: new THREE.Color('#fffdf8') },
        uUnder: { value: new THREE.Color('#b9c2dc') },
        uTip: { value: new THREE.Color('#8b93aa') },
        uHaze: { value: new THREE.Color('#cfe5f2') },
        uHazeD: { value: 0.0022 },
        // the bird's span on screen is held between these (radians of view)
        uMinAng: { value: 0.011 },
        uMaxAng: { value: 0.045 },
      },
      vertexShader: /* glsl */ `
        attribute float aWing; attribute vec4 aCircle; attribute vec4 aOff; attribute vec4 aFly;
        uniform float uTime, uMinAng, uMaxAng;
        varying float vShade; varying float vTip; varying vec3 vW;
        void main(){
          float ang = aFly.y + aFly.x * uTime;
          float dir = sign(aFly.x);
          // the flock's leader on its circle, bobbing gently
          vec3 c = aCircle.xyz + vec3(cos(ang) * aCircle.w, sin(uTime * 0.3 + aFly.y) * 2.0, sin(ang) * aCircle.w);
          vec3 fwd = normalize(vec3(-sin(ang), 0.0, cos(ang)) * dir);
          vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
          // each bird: offset in the flock frame, drifting a little
          vec3 off = aOff.xyz + vec3(sin(uTime * 0.5 + aFly.w), sin(uTime * 0.7 + aFly.w * 2.0) * 0.6, cos(uTime * 0.4 + aFly.w)) * 0.6;
          vec3 base = c + side * off.x + vec3(0.0, off.y, 0.0) + fwd * off.z;
          // hold its size on screen between a floor and a cap
          vec3 bw = (modelMatrix * vec4(base, 1.0)).xyz;
          float dist = length(bw - cameraPosition);
          float span = aOff.w * 2.0;
          float sc = clamp(span / dist, uMinAng, uMaxAng) * dist / span * aOff.w;
          // flap a few beats, then glide with the wings held in a gull's bend
          float ph = uTime * aFly.z + aFly.w * 6.0;
          float burst = smoothstep(-0.2, 0.4, sin(uTime * 0.6 + aFly.w * 3.0));
          float flap = mix(0.2, sin(ph), burst);
          vec3 p = position;
          float wx = abs(p.x);
          // the inner wing lifts, the hand droops (the gull's M), both swinging with the beat
          float inner = min(wx, 0.46), outer = max(wx - 0.46, 0.0);
          p.y += inner * (0.28 + flap * 0.55) + outer * (-0.35 + flap * 0.9);
          float bank = 0.25 * dir;
          p.y += p.x * bank;
          p *= sc;
          vec3 wp = base + side * p.x + vec3(0.0, p.y, 0.0) + fwd * p.z;
          vec4 w = modelMatrix * vec4(wp, 1.0);
          vW = w.xyz;
          // light: the tops of the wings catch the sun as they rise; the body stays white
          vShade = aWing < 0.5 ? 0.92 : clamp(0.62 + flap * 0.3 - outer * 0.4, 0.0, 1.0);
          vTip = aWing > 2.5 ? 1.0 : 0.0;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uWhite, uUnder, uTip, uHaze; uniform float uHazeD;
        varying float vShade; varying float vTip; varying vec3 vW;
        void main(){
          // two tones: the white upper side, the blue-grey underside (seen from below it is the back face)
          vec3 col = gl_FrontFacing ? mix(uUnder, uWhite, smoothstep(0.35, 0.7, vShade)) : mix(uUnder * 0.92, uUnder, vShade);
          col = mix(col, uTip, vTip * 0.75);
          float d = length(cameraPosition - vW);
          col = mix(col, uHaze, (1.0 - exp(-pow(d * uHazeD, 1.5))) * 0.7);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.userData.noOutline = true;
  }
  /** 0 midday .. 1 golden hour: the gulls warm up with the light. */
  setGolden(k: number) {
    this.mat.uniforms.uWhite.value.set('#fffdf8').lerp(new THREE.Color('#fff0d8'), k);
    this.mat.uniforms.uUnder.value.set('#b9c2dc').lerp(new THREE.Color('#b8a8c8'), k);
  }
  update(t: number) { this.mat.uniforms.uTime.value = t; }
}
