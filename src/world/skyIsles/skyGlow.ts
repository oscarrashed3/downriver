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
 *
 * Also soft god-ray haze round the sun: `rays`, one camera-facing quad toward the sun drawn over everything
 * (renderOrder 8, additive, no depth test): a warm bloom of haze with faint slow-turning streaks, strongest at
 * golden hour. Add both meshes to the scene.
 */
export class SkyGlow {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  rays: THREE.Mesh;
  raysMat: THREE.ShaderMaterial;
  private sun: { value: THREE.Vector3 };
  constructor(sun: { value: THREE.Vector3 }, radius = 4500) {
    // (it also clears the target's alpha over the open sky, so the finish pass's cloud mask treats the sky like
    // cloud: ink stays on the solids themselves)
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.ZeroFactor,
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
          // (the glow paints its own sun over the sky's: one that does not bloom over the clouds)
          a = max(a, smoothstep(0.97, 0.995, s) * smoothstep(-0.05, 0.0, e));
          // (just under the bloom threshold, so the bright sky round the sun does not bloom over the clouds)
          gl_FragColor = vec4(min(col, vec3(0.95)), a);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), this.mat);
    this.mesh.renderOrder = -9;
    this.mesh.frustumCulled = false;
    this.mesh.userData.noOutline = true;
    this.sun = sun;
    // god-ray haze: additive colour, alpha untouched
    this.raysMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      uniforms: { uK: { value: 0.3 }, uCol: { value: new THREE.Color('#fff1d6') }, uTime: { value: 0 }, uFace: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = position.xy * 2.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uK, uTime, uFace; uniform vec3 uCol;
        varying vec2 vUv;
        void main(){
          float r = length(vUv);
          if (r > 1.0) discard;
          float a = atan(vUv.y, vUv.x + 1e-5); // (atan(0, 0) is undefined: a NaN pixel at the sun's centre on some GPUs)
          // slow, soft streaks fanning out from the sun
          float s = 0.5 + 0.5 * sin(a * 11.0 + sin(a * 3.0 + uTime * 0.05) * 2.0 + uTime * 0.02);
          s *= 0.55 + 0.45 * sin(a * 7.0 - 1.3 + uTime * 0.03);
          float fall = pow(1.0 - r, 2.2);
          float glow = exp(-r * 6.0) * 0.22 + exp(-r * 2.2) * 0.07;
          float k = (glow + s * fall * 0.16) * uK * uFace;
          gl_FragColor = vec4(uCol * k, 1.0);
        }`,
    });
    this.rays = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.raysMat);
    this.rays.renderOrder = 8;
    this.rays.frustumCulled = false;
    this.rays.userData.noOutline = true;
  }
  /** Whether the glow clears alpha over the open sky for the finish pass's cloud ink mask (default on). */
  setInkMask(on: boolean) {
    this.mat.blendSrcAlpha = on ? THREE.ZeroFactor : THREE.OneFactor;
    this.mat.blendDstAlpha = on ? THREE.ZeroFactor : THREE.OneMinusSrcAlphaFactor;
    this.mat.needsUpdate = true;
  }
  /** 0 midday .. 1 golden hour. */
  setGolden(k: number) {
    this.mat.uniforms.uK.value = k;
    this.mat.uniforms.uAlpha.value = 0.55 + 0.4 * k;
    this.raysMat.uniforms.uK.value = 0.22 + 0.5 * k;
    (this.raysMat.uniforms.uCol.value as THREE.Color).set('#fff4e0').lerp(new THREE.Color('#ffd9a0'), k);
  }
  update(camera: THREE.Camera, up: THREE.Vector3, t = 0) {
    this.mesh.position.setFromMatrixPosition(camera.matrixWorld);
    this.mat.uniforms.uUp.value.copy(up);
    // the ray quad: toward the sun, facing the camera, a third of the sky across
    const cam = this.mesh.position, d = 2000;
    this.rays.position.copy(cam).addScaledVector(this.sun.value, d);
    this.rays.quaternion.copy((camera as THREE.Object3D).quaternion);
    this.rays.scale.setScalar(d * 1.6);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.rays.quaternion);
    this.raysMat.uniforms.uFace.value = THREE.MathUtils.smoothstep(fwd.dot(this.sun.value), 0.2, 0.8);
    this.raysMat.uniforms.uTime.value = t;
  }
}
