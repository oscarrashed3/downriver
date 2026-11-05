import * as THREE from 'three';

/** Sky that always looks right from wherever you stand: its gradient follows your local "up". */
export class Sky {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  clouds: THREE.InstancedMesh;
  cloudMat: THREE.ShaderMaterial;
  constructor(scene: THREE.Scene, sunDir: THREE.Vector3, towersAround?: THREE.Vector3) {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uUp: { value: new THREE.Vector3(0, 1, 0) },
        uSun: { value: sunDir.clone() },
        uTop: { value: new THREE.Color('#3f8be0') },
        uHorizon: { value: new THREE.Color('#e8f3f8') },
        uCloud: { value: new THREE.Color('#fff4ea') },
        uDusk: { value: new THREE.Color('#ffa58a') },
        uTime: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 uUp, uSun, uTop, uHorizon, uCloud, uDusk; uniform float uTime; varying vec3 vDir;
        float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vDir);
          float e = dot(d, uUp);
          float sunE = dot(uUp, uSun);
          float day = smoothstep(-0.25, 0.25, sunE);
          float dusk = smoothstep(0.45, 0.05, abs(sunE - 0.05)) ;
          float sunAmt = max(dot(d, uSun), 0.0);
          vec3 top = mix(vec3(0.05, 0.07, 0.18), uTop, day);
          vec3 hor = mix(vec3(0.16, 0.18, 0.36), uHorizon, day);
          hor = mix(hor, uDusk, dusk * (0.55 + 0.45 * pow(sunAmt, 2.0)));
          vec3 col = mix(hor, top, pow(smoothstep(-0.02, 0.75, e), 0.55));
          // the cloud sea below the horizon, glowing where the sun is
          vec3 seaC = mix(vec3(0.86, 0.93, 1.0), hor, 0.3) * mix(0.25, 1.0, day) + vec3(1.0,0.82,0.6) * pow(sunAmt, 6.0) * 0.35 * day;
          col = mix(col, seaC, smoothstep(0.02, -0.12, e));
          vec3 deep = mix(vec3(0.62, 0.78, 0.95), vec3(0.22, 0.46, 0.84), smoothstep(-0.3, -0.95, e));
          col = mix(col, deep * mix(0.18, 1.0, day), smoothstep(-0.2, -0.55, e));
          // sun disk and halo
          col += vec3(1.0, 0.86, 0.62) * (pow(sunAmt, 900.0) * 3.0 + pow(sunAmt, 14.0) * 0.4 * (0.4 + dusk));
          // moon opposite the sun, and stars at night
          float moonAmt = max(dot(d, -uSun), 0.0);
          float night = 1.0 - day;
          col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99965, 0.9998, moonAmt) * 1.4 + pow(moonAmt, 60.0) * 0.12) * night;
          vec3 sp = floor(d * 380.0);
          float star = step(0.9972, h(sp)) * smoothstep(-0.05, 0.3, e);
          col += vec3(star) * night * (0.55 + 0.45 * sin(uTime * 2.0 + h(sp) * 20.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);

    // Painted cumulus: warm sunlit tops, cool blue-grey bellies, soft bright edges.
    const puff = new THREE.IcosahedronGeometry(1, 3);
    this.cloudMat = new THREE.ShaderMaterial({
      fog: false,
      uniforms: {
        uSun: { value: sunDir.clone() },
        uTop: { value: new THREE.Color('#fff7ea') },
        uBelly: { value: new THREE.Color('#9eb0d2') },
        uDay: { value: 1 },
        uDusk: { value: new THREE.Color('#ffb29a') },
        uDuskAmt: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vW; varying float vSeed;
        void main(){
          vec3 lp = position; lp.y = max(lp.y, -0.38);
          vec4 wp = modelMatrix * instanceMatrix * vec4(lp, 1.0);
          vW = wp.xyz;
          vec3 nn = position.y < -0.37 ? vec3(0.0, -1.0, 0.0) : normal;
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * nn);
          vSeed = fract(instanceMatrix[3].x * 0.013 + instanceMatrix[3].z * 0.007);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun, uTop, uBelly, uDusk; uniform float uDay, uDuskAmt;
        varying vec3 vN; varying vec3 vW; varying float vSeed;
        void main(){
          vec3 N = normalize(vN);
          vec3 V = normalize(cameraPosition - vW);
          float up = N.y;
          float lit = clamp(dot(N, uSun) * 0.5 + 0.5, 0.0, 1.0);
          float k = smoothstep(-0.35, 0.65, up) * 0.6 + lit * 0.4;
          k = smoothstep(0.38, 0.5, k) * 0.7 + k * 0.3;
          vec3 col = mix(uBelly, uTop, k);
          col = mix(col, col * uDusk * 1.15, uDuskAmt * (0.4 + lit * 0.6));
          float fres = pow(1.0 - abs(dot(N, V)), 2.5);
          col += vec3(1.0, 0.95, 0.85) * fres * 0.18 * lit;
          col *= mix(0.22, 1.0, uDay);
          col *= 0.96 + vSeed * 0.08;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const towers = towersAround ? 16 : 0;
    const count = 900 + towers * 26;
    this.clouds = new THREE.InstancedMesh(puff, this.cloudMat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let rnd = 7;
    const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    let k = 0;
    while (k < 900) {
      const ang = r() * Math.PI * 2, dist = 140 + r() * 420;
      const cx = Math.cos(ang) * dist, cz = Math.sin(ang) * dist, cy = 120 - r() * 1950;
      const n = 5 + Math.floor(r() * 5);
      const size = 10 + r() * 18;
      for (let j = 0; j < n && k < 900; j++, k++) {
        p.set(cx + (r() - 0.5) * size * 2.6, cy + (r() - 0.5) * size * 0.6, cz + (r() - 0.5) * size * 1.6);
        const sc = size * (0.5 + r() * 0.6);
        s.set(sc, sc * 0.7, sc);
        m.compose(p, q, s);
        this.clouds.setMatrixAt(k, m);
      }
    }
    // Towering cumulus around the first world: the big summer clouds you see from the ridges.
    if (towersAround) {
      for (let t = 0; t < towers; t++) {
        const ang = (t / towers) * Math.PI * 2 + r() * 0.3;
        const dist = 175 + r() * 120;
        const base = towersAround.clone().add(new THREE.Vector3(Math.cos(ang) * dist, -70 + r() * 60, Math.sin(ang) * dist));
        const height = 60 + r() * 90;
        for (let j = 0; j < 26 && k < count; j++, k++) {
          const f = j / 25;
          const rad = (1 - f * 0.55) * (16 + r() * 10);
          p.copy(base).add(new THREE.Vector3((r() - 0.5) * rad * 2.2, f * height + (r() - 0.5) * 8, (r() - 0.5) * rad * 2.2));
          const sc = rad * (0.7 + r() * 0.5);
          s.set(sc, sc * 0.85, sc);
          m.compose(p, q, s);
          this.clouds.setMatrixAt(k, m);
        }
      }
    }
    this.clouds.count = k;
    this.clouds.frustumCulled = false;
    scene.add(this.clouds);
  }

  update(up: THREE.Vector3, camPos: THREE.Vector3, t: number, sun: THREE.Vector3, day: number, dusk: number) {
    this.mat.uniforms.uUp.value.copy(up);
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uSun.value.copy(sun);
    this.cloudMat.uniforms.uSun.value.copy(sun);
    this.cloudMat.uniforms.uDay.value = day;
    this.cloudMat.uniforms.uDuskAmt.value = dusk;
    this.mesh.position.copy(camPos);
  }

  setPalette(top: string, horizon: string) {
    (this.mat.uniforms.uTop.value as THREE.Color).set(top);
    (this.mat.uniforms.uHorizon.value as THREE.Color).set(horizon);
  }
}
