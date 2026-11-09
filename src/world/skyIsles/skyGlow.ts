import * as THREE from 'three';

/**
 * Sky dressing for the Sky Isles: a soft painted gradient laid over the game's sky dome, so the sky matches the
 * cloud sea's light. At midday it deepens the zenith to a pastel cobalt over a pale, luminous horizon; at golden
 * hour it goes from yellow-white at the sun, through a warm cream-gold band along the horizon, to a soft clear
 * blue overhead (picture 4), instead of one flat salmon wash.
 *
 * One sphere (BackSide, 32x16) that follows the camera, drawn just after the sky and before everything else
 * transparent; depth-tested so solids stay in front. Use: const g = new SkyGlow(); scene.add(g.mesh);
 * g.setGolden(k); each frame g.update(camera, up).
 */
export class SkyGlow {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  constructor(sun: { value: THREE.Vector3 }, radius = 4500) {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
      uniforms: {
        uSun: sun,
        uUp: { value: new THREE.Vector3(0, 1, 0) },
        uK: { value: 0 },
        uZenM: { value: new THREE.Color('#5f93dc') }, uHorM: { value: new THREE.Color('#d9ebf6') }, uSunM: { value: new THREE.Color('#fffbef') },
        uZenG: { value: new THREE.Color('#7fa8e2') }, uMidG: { value: new THREE.Color('#c9d6e6') }, uHorG: { value: new THREE.Color('#ffe2b2') },
        uSunG: { value: new THREE.Color('#fff3cf') }, uHaloG: { value: new THREE.Color('#ffc978') },
        uAlpha: { value: 0.6 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun, uUp, uZenM, uHorM, uSunM, uZenG, uMidG, uHorG, uSunG, uHaloG; uniform float uK, uAlpha;
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float e = dot(d, uUp);
          float s = max(dot(d, uSun), 0.0);
          // azimuthal closeness to the sun (the warm band is widest under it)
          vec3 dh = normalize(d - uUp * e + 1e-5), sh = normalize(uSun - uUp * dot(uSun, uUp) + 1e-5);
          float az = dot(dh, sh) * 0.5 + 0.5;
          float he = smoothstep(-0.02, 0.6, e);
          // midday: cobalt overhead, a pale glowing horizon, a small white halo
          vec3 mid = mix(uHorM, uZenM, pow(he, 0.7));
          mid = mix(mid, uSunM, pow(s, 24.0) * 0.8 + pow(s, 4.0) * 0.12);
          // golden: soft blue overhead, pale in the middle, cream-gold low down (warmest toward the sun)
          vec3 gold = mix(uMidG, uZenG, smoothstep(0.04, 0.42, e));
          gold = mix(gold, uHorG, (1.0 - smoothstep(0.0, 0.1 + 0.1 * az, e)) * (0.45 + 0.55 * az));
          gold = mix(gold, uHaloG, pow(s, 12.0) * 0.5 * (1.0 - smoothstep(0.05, 0.4, e)));
          gold = mix(gold, uSunG * 1.1, pow(s, 120.0) + pow(s, 28.0) * 0.4);
          vec3 col = mix(mid, gold, uK);
          // below the horizon the clouds and the game's sky take over
          float a = uAlpha * smoothstep(-0.12, 0.0, e);
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), this.mat);
    this.mesh.renderOrder = -9;
    this.mesh.frustumCulled = false;
    this.mesh.userData.noOutline = true;
  }
  /** 0 midday .. 1 golden hour. */
  setGolden(k: number) {
    this.mat.uniforms.uK.value = k;
    this.mat.uniforms.uAlpha.value = 0.55 + 0.4 * k;
  }
  update(camera: THREE.Camera, up: THREE.Vector3) {
    this.mesh.position.setFromMatrixPosition(camera.matrixWorld);
    this.mat.uniforms.uUp.value.copy(up);
  }
}
