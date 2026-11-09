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
        // far views (the title, the sky view): the depths below the worlds glow warm instead of going deep blue
        uAbyss: { value: 0 },
        // the dream sky of the far shots: a pale clear blue between the cornflower overhead and the warm horizon
        uDreamSky: { value: 0 },
        uAbyssCol: { value: new THREE.Color('#ffc890') },
        uAbyssMid: { value: new THREE.Color('#86a9ea') },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 uUp, uSun, uTop, uHorizon, uCloud, uDusk, uAbyssCol, uAbyssMid; uniform float uTime, uAbyss, uDreamSky; varying vec3 vDir;
        float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vDir);
          float e = dot(d, uUp);
          float sunE = dot(uUp, uSun);
          float day = smoothstep(-0.25, 0.25, sunE);
          float dusk = smoothstep(0.45, 0.05, abs(sunE - 0.05)) ;
          float sunAmt = max(dot(d, uSun), 0.0);
          // three painted stops per time of day: deep teal night, clear cobalt day, warm peach dusk
          vec3 nTop = vec3(0.03, 0.10, 0.14), nMid = vec3(0.06, 0.20, 0.25), nHor = vec3(0.16, 0.34, 0.38);
          vec3 dMid = mix(mix(uHorizon, uTop, 0.42), mix(uTop, vec3(0.9, 0.94, 1.0), 0.5), uDreamSky);
          vec3 kTop = vec3(0.24, 0.30, 0.52), kMid = vec3(0.86, 0.58, 0.56), kHor = vec3(1.0, 0.80, 0.60);
          vec3 top = mix(nTop, uTop, day), mid = mix(nMid, dMid, day), hor = mix(nHor, uHorizon, day);
          float dk = dusk * (0.6 + 0.4 * pow(sunAmt, 2.0));
          top = mix(top, kTop, dk * 0.55); mid = mix(mid, kMid, dk * 0.8); hor = mix(hor, mix(kHor, uDusk, 0.3), dk);
          float ee = clamp(e, 0.0, 1.0);
          vec3 col = ee < 0.22 ? mix(hor, mid, smoothstep(-0.02, 0.22, e)) : mix(mid, top, pow(smoothstep(0.22, 0.85, ee), 0.8));
          // the cloud sea below the horizon, glowing where the sun is
          vec3 seaC = mix(vec3(0.86, 0.93, 1.0), hor, 0.3) * mix(0.25, 1.0, day) + vec3(1.0,0.82,0.6) * pow(sunAmt, 6.0) * 0.35 * day;
          col = mix(col, seaC, smoothstep(0.02, -0.12, e));
          vec3 deep = mix(vec3(0.62, 0.78, 0.95), vec3(0.22, 0.46, 0.84), smoothstep(-0.3, -0.95, e));
          deep = mix(deep, mix(uAbyssMid, uAbyssCol, smoothstep(-0.6, -0.98, e)), uAbyss);
          col = mix(col, deep * mix(0.18, 1.0, day), smoothstep(-0.2, -0.55, e));
          // and the whole sky softens toward pearl and cornflower, like a watercolour wash
          col = mix(col, mix(col, vec3(0.95, 0.93, 0.96), 0.08 + 0.1 * smoothstep(0.0, -0.6, e)), uAbyss);
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
        uSky: { value: new THREE.Color('#b4def2') },
        uHaze: { value: 0 },
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
        uniform vec3 uSun, uTop, uBelly, uDusk, uSky; uniform float uDay, uDuskAmt, uHaze;
        varying vec3 vN; varying vec3 vW; varying float vSeed;
        float h3(vec3 p){ p = fract(p * 0.3183 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
        void main(){
          vec3 N = normalize(vN);
          // break the perfect sphere: a lumpy normal, so each puff reads as many small billows
          vec3 q = vW * 0.05;
          N = normalize(N + (vec3(n3(q), n3(q + 7.1), n3(q + 13.7)) - 0.5) * 0.45);
          vec3 V = normalize(cameraPosition - vW);
          float lit = dot(N, uSun) * 0.5 + 0.5;
          float k = smoothstep(-0.5, 0.7, N.y) * 0.55 + lit * 0.45;
          // three tones, like the painted cumulus: cool shade mass, body, warm lit crowns toward the sun
          vec3 shade = mix(uBelly, uTop, 0.18), body = mix(uBelly, uTop, 0.7), crown = uTop * 1.05;
          vec3 col = k < 0.5 ? mix(shade, body, smoothstep(0.3, 0.5, k)) : mix(body, crown, smoothstep(0.58, 0.72, k));
          col = mix(col, col * uDusk * 1.15, uDuskAmt * (0.4 + lit * 0.6));
          col *= mix(0.22, 1.0, uDay);
          // soft undersides and edges melt into the sky behind them: no hard rim
          float edge = pow(1.0 - abs(dot(normalize(vN), V)), 1.6);
          float belly = smoothstep(0.1, -0.7, normalize(vN).y);
          col = mix(col, uSky, clamp(edge * 0.55 + belly * 0.35, 0.0, 0.8));
          col *= 0.97 + vSeed * 0.06;
          // far banks sink into the same haze as the land (the fog's own falloff), so nothing pops out of the air
          float dh = length(vW - cameraPosition) * uHaze;
          col = mix(col, uSky, clamp(1.0 - exp(-dh * dh), 0.0, 0.85));
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

  /** The colour the cloud edges melt into: the sky at the horizon right now. */
  setCloudSky(c: THREE.Color, haze = 0) { (this.cloudMat.uniforms.uSky.value as THREE.Color).copy(c); this.cloudMat.uniforms.uHaze.value = haze; }

  setPalette(top: string, horizon: string) {
    (this.mat.uniforms.uTop.value as THREE.Color).set(top);
    (this.mat.uniforms.uHorizon.value as THREE.Color).set(horizon);
  }
}
