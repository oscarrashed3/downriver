import * as THREE from 'three';

/** Sky that always looks right from wherever you stand: its gradient follows your local "up". */
export class Sky {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  clouds: THREE.InstancedMesh;
  constructor(scene: THREE.Scene, sunDir: THREE.Vector3) {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uUp: { value: new THREE.Vector3(0, 1, 0) },
        uSun: { value: sunDir.clone() },
        uTop: { value: new THREE.Color('#4c5aa8') },
        uHorizon: { value: new THREE.Color('#ffd2b0') },
        uCloud: { value: new THREE.Color('#fff1e6') },
        uTime: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 uUp, uSun, uTop, uHorizon, uCloud; uniform float uTime; varying vec3 vDir;
        float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vDir);
          float e = dot(d, uUp);
          vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.65, e));
          // the cloud sea below the horizon, glowing where the sun is
          float sunAmt = max(dot(d, uSun), 0.0);
          vec3 sea = mix(uCloud * 0.92, uHorizon, 0.35) + vec3(1.0,0.85,0.6) * pow(sunAmt, 6.0) * 0.4;
          col = mix(col, sea, smoothstep(0.02, -0.12, e));
          col = mix(col, mix(uCloud, uHorizon, 0.6) * 0.75, smoothstep(-0.25, -0.9, e));
          // sun disk and halo
          col += vec3(1.0, 0.86, 0.62) * (pow(sunAmt, 900.0) * 3.0 + pow(sunAmt, 18.0) * 0.45);
          // stars on the night side
          float night = smoothstep(0.15, -0.35, dot(uUp, uSun));
          vec3 sp = floor(d * 380.0);
          float star = step(0.9975, h(sp)) * smoothstep(0.0, 0.3, e);
          col = mix(col, col * vec3(0.25, 0.28, 0.5), night * 0.75);
          col += vec3(star) * night * (0.6 + 0.4 * sin(uTime * 2.0 + h(sp) * 20.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);

    // Puffy clouds drifting around the worlds.
    const puff = new THREE.IcosahedronGeometry(1, 2);
    const cm = new THREE.MeshLambertMaterial({ color: '#fff4ec', emissive: '#a98fa0', emissiveIntensity: 0.35, flatShading: false });
    const count = 900;
    this.clouds = new THREE.InstancedMesh(puff, cm, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let rnd = 7;
    const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    let k = 0;
    while (k < count) {
      const ang = r() * Math.PI * 2, dist = 140 + r() * 420;
      const cx = Math.cos(ang) * dist, cz = Math.sin(ang) * dist, cy = 120 - r() * 1950;
      const n = 5 + Math.floor(r() * 5);
      const size = 10 + r() * 18;
      for (let j = 0; j < n && k < count; j++, k++) {
        p.set(cx + (r() - 0.5) * size * 2.6, cy + (r() - 0.5) * size * 0.6, cz + (r() - 0.5) * size * 1.6);
        const sc = size * (0.5 + r() * 0.6);
        s.set(sc, sc * 0.7, sc);
        m.compose(p, q, s);
        this.clouds.setMatrixAt(k, m);
      }
    }
    scene.add(this.clouds);
  }

  update(up: THREE.Vector3, camPos: THREE.Vector3, t: number) {
    this.mat.uniforms.uUp.value.copy(up);
    this.mat.uniforms.uTime.value = t;
    this.mesh.position.copy(camPos);
  }

  setPalette(top: string, horizon: string) {
    (this.mat.uniforms.uTop.value as THREE.Color).set(top);
    (this.mat.uniforms.uHorizon.value as THREE.Color).set(horizon);
  }
}
