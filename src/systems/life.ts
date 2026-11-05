import * as THREE from 'three';
import type { Planet } from '../world/planet';
import { toon } from '../world/props';
import { orientTo, anyTangent } from '../world/sphere';
import { PAINT } from '../render/paint';
import { clamp, smoothstep } from '../world/noise';

/** Small lives that make the valley feel inhabited: birds, butterflies, a fox at dusk, fireflies, chimney smoke. */
export class Life {
  birds: { g: THREE.Group; wl: THREE.Object3D; wr: THREE.Object3D; a: number; r: number; h: number; sp: number; scatter: number }[] = [];
  flies: { g: THREE.Group; wl: THREE.Object3D; wr: THREE.Object3D; home: THREE.Vector3; ph: number }[] = [];
  fox: THREE.Group;
  foxT = 0;
  fireflies: THREE.Points;
  smoke: THREE.Points;
  private smokeAge: Float32Array;
  private smokeSrc: THREE.Vector3[] = [];
  private birdCenter: THREE.Vector3;
  private up: THREE.Vector3;
  private t1: THREE.Vector3;
  private t2: THREE.Vector3;
  private foxPath: THREE.Vector3[];
  group = new THREE.Group();

  constructor(scene: THREE.Scene, private p: Planet, flowerSpots: [number, number][], chimneys: THREE.Vector3[], firePos: THREE.Vector3, villageLL: number[]) {
    scene.add(this.group);
    // Birds circling over the village
    this.up = p.dirRiver(villageLL[0], villageLL[1]);
    this.birdCenter = p.surfacePoint(this.up);
    this.t1 = anyTangent(this.up); this.t2 = new THREE.Vector3().crossVectors(this.up, this.t1);
    const wingG = new THREE.BufferGeometry();
    wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 0, 0, -0.12, 0.45, 0, -0.05], 3)); wingG.computeVertexNormals();
    const bm = toon('#3a3448');
    (bm as THREE.Material).side = THREE.DoubleSide;
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), bm); body.scale.z = 2.2; g.add(body);
      const wl = new THREE.Mesh(wingG, bm), wr = new THREE.Mesh(wingG, bm); wr.scale.x = -1;
      g.add(wl, wr);
      g.scale.setScalar(1.4);
      this.group.add(g);
      this.birds.push({ g, wl, wr, a: Math.random() * Math.PI * 2, r: 8 + Math.random() * 10, h: 11 + Math.random() * 8, sp: (0.25 + Math.random() * 0.2) * (i % 3 === 0 ? -1 : 1), scatter: 0 });
    }
    // Butterflies over the flowers
    const fm = ['#ffd24a', '#f4ecdc', '#8ab8ff', '#ff9a6a'];
    flowerSpots.forEach((ll, k) => {
      for (let i = 0; i < 4; i++) {
        const g = new THREE.Group();
        const wgeo = new THREE.CircleGeometry(0.09, 6);
        const m = toon(fm[(k + i) % fm.length]); (m as THREE.Material).side = THREE.DoubleSide;
        const wl = new THREE.Mesh(wgeo, m), wr = new THREE.Mesh(wgeo, m);
        wl.position.x = 0.07; wr.position.x = -0.07;
        const pl = new THREE.Group(), pr = new THREE.Group(); pl.add(wl); pr.add(wr);
        g.add(pl, pr);
        this.group.add(g);
        this.flies.push({ g, wl: pl, wr: pr, home: p.dirRiver(ll[0] + (Math.random() - 0.5) * 5, ll[1] + (Math.random() - 0.5) * 6), ph: Math.random() * 10 });
      }
    });
    // The fox
    this.fox = new THREE.Group();
    const fur = toon('#d8783a'), white = toon('#f4ecdc'), dark = toon('#3a2a28');
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.5, 4, 8), fur); body.rotation.x = Math.PI / 2; body.position.y = 0.4;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 6), fur); head.rotation.x = Math.PI / 2; head.position.set(0, 0.55, 0.45);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.55, 6), fur); tail.rotation.x = -Math.PI / 2.4; tail.position.set(0, 0.5, -0.55);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), white); tip.position.set(0, 0.62, -0.82);
    this.fox.add(body, head, tail, tip);
    for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), dark); ear.position.set(0.07 * s, 0.72, 0.36); this.fox.add(ear); }
    for (const [x, z] of [[-0.1, 0.22], [0.1, 0.22], [-0.1, -0.22], [0.1, -0.22]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 4), dark); l.position.set(x, 0.15, z); this.fox.add(l); }
    this.fox.visible = false;
    this.group.add(this.fox);
    this.foxPath = [[22, 26], [27, 34], [33, 30], [36, 22], [30, 14], [24, 18]].map(([a, b]) => p.dirRiver(a, b));

    // Fireflies
    const N = 160;
    const fg = new THREE.BufferGeometry();
    const fp = new Float32Array(N * 3), fph = new Float32Array(N);
    const spots = [villageLL, ...flowerSpots];
    for (let i = 0; i < N; i++) {
      const s = spots[i % spots.length];
      const d = p.dirRiver(s[0] + (Math.random() - 0.5) * 12, s[1] + (Math.random() - 0.5) * 14);
      const v = p.surfacePoint(d, 0.6 + Math.random() * 2.2);
      fp.set([v.x, v.y, v.z], i * 3); fph[i] = Math.random() * 20;
    }
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    fg.setAttribute('aPh', new THREE.BufferAttribute(fph, 1));
    this.fireflies = new THREE.Points(fg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: PAINT.uTime, uNight: { value: 0 } },
      vertexShader: `attribute float aPh; uniform float uTime; varying float vA;
        void main(){ vec3 p = position + vec3(sin(uTime*0.7+aPh), sin(uTime*0.9+aPh*1.3), cos(uTime*0.6+aPh)) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p,1.0); gl_Position = projectionMatrix * mv;
          vA = pow(max(0.0, sin(uTime*1.6 + aPh*3.0)), 3.0); gl_PointSize = 60.0 / -mv.z; }`,
      fragmentShader: `uniform float uNight; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA * uNight;
          gl_FragColor = vec4(1.0, 0.92, 0.45, a); }`,
    }));
    this.fireflies.frustumCulled = false;
    this.group.add(this.fireflies);

    // Smoke from chimneys and the campfire
    this.smokeSrc = [...chimneys, firePos.clone().addScaledVector(p.dirRiver(villageLL[0], villageLL[1]), 1.2)];
    const SN = this.smokeSrc.length * 26;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SN * 3), 3));
    this.smokeAge = new Float32Array(SN);
    for (let i = 0; i < SN; i++) this.smokeAge[i] = Math.random() * 6;
    sg.setAttribute('aAge', new THREE.BufferAttribute(this.smokeAge, 1));
    this.smoke = new THREE.Points(sg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCol: { value: new THREE.Color('#eef0f4') } }]),
      vertexShader: `#include <fog_pars_vertex>
        attribute float aAge; varying float vAge;
        void main(){ vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
          vAge = aAge; gl_PointSize = (40.0 + aAge * 70.0) / -mvPosition.z * 6.0;
          #include <fog_vertex>
        }`,
      fragmentShader: `#include <fog_pars_fragment>
        uniform vec3 uCol; varying float vAge;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.15, d) * smoothstep(6.0, 1.0, vAge) * smoothstep(0.0, 0.4, vAge) * 0.42;
          gl_FragColor = vec4(uCol, a);
          #include <fog_fragment>
        }`,
    }));
    this.smoke.frustumCulled = false;
    this.group.add(this.smoke);
  }

  update(dt: number, t: number, day: number, playerPos: THREE.Vector3, whistle: boolean, active: boolean) {
    this.group.visible = active;
    if (!active) return;
    const p = this.p;
    // birds
    const near = playerPos.distanceTo(this.birdCenter) < 26;
    for (const b of this.birds) {
      if (whistle && near) b.scatter = 4 + Math.random();
      b.scatter = Math.max(0, b.scatter - dt);
      const sc = smoothstep(0, 1.5, b.scatter);
      b.a += b.sp * dt * (1 + sc * 2);
      const r = b.r + sc * 14, h = b.h + sc * 14 + Math.sin(t * 0.5 + b.r) * 1.5;
      const pos = this.birdCenter.clone().addScaledVector(this.up, h).addScaledVector(this.t1, Math.cos(b.a) * r).addScaledVector(this.t2, Math.sin(b.a) * r);
      const tan = this.t1.clone().multiplyScalar(-Math.sin(b.a) * Math.sign(b.sp)).addScaledVector(this.t2, Math.cos(b.a) * Math.sign(b.sp));
      b.g.position.copy(pos);
      orientTo(b.g, this.up, tan);
      const flap = Math.sin(t * (10 + sc * 8) + b.r * 3) * (0.6 + sc * 0.3);
      b.wl.rotation.z = flap; b.wr.rotation.z = -flap;
    }
    // butterflies, by day
    for (const f of this.flies) {
      f.g.visible = day > 0.4;
      if (!f.g.visible) continue;
      const u = t * 0.5 + f.ph;
      const d = f.home.clone();
      const ta = anyTangent(d), tb = new THREE.Vector3().crossVectors(d, ta);
      d.addScaledVector(ta, Math.sin(u * 1.3) * 3 / p.R).addScaledVector(tb, Math.cos(u * 0.9) * 3 / p.R).normalize();
      p.surfacePoint(d, 0.6 + Math.abs(Math.sin(u * 2.1)) * 1.2, f.g.position);
      orientTo(f.g, d, ta.clone().multiplyScalar(Math.cos(u * 1.3)).addScaledVector(tb, -Math.sin(u * 0.9)));
      const flap = Math.sin(t * 22 + f.ph) * 1.1;
      f.wl.rotation.y = flap; f.wr.rotation.y = -flap;
    }
    // the fox comes out when the light goes
    this.fox.visible = day < 0.55;
    if (this.fox.visible) {
      this.foxT += dt * 0.035;
      const n = this.foxPath.length;
      const ft = this.foxT % 1 * n;
      const i = Math.floor(ft), k = ft - i;
      const a = this.foxPath[i % n], b = this.foxPath[(i + 1) % n];
      const d = a.clone().lerp(b, k).normalize();
      p.surfacePoint(d, 0, this.fox.position);
      orientTo(this.fox, d, b.clone().sub(a));
      this.fox.position.addScaledVector(d, Math.abs(Math.sin(t * 9)) * 0.05);
    }
    // fireflies at night
    (this.fireflies.material as THREE.ShaderMaterial).uniforms.uNight.value = clamp(1 - day * 1.6);
    // smoke rises with the wind
    const pos = this.smoke.geometry.attributes.position as THREE.BufferAttribute;
    const per = 26;
    const w = PAINT.uWind.value;
    for (let s = 0; s < this.smokeSrc.length; s++) {
      const src = this.smokeSrc[s];
      const up = src.clone().sub(p.center).normalize();
      for (let j = 0; j < per; j++) {
        const i = s * per + j;
        this.smokeAge[i] += dt;
        if (this.smokeAge[i] > 6) this.smokeAge[i] = 0;
        const age = this.smokeAge[i];
        const v = src.clone().addScaledVector(up, age * 1.1 + Math.sin(age + j) * 0.2).addScaledVector(w, age * age * 0.12 + Math.sin(j * 7.1) * 0.2);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
    }
    pos.needsUpdate = true;
    (this.smoke.geometry.attributes.aAge as THREE.BufferAttribute).needsUpdate = true;
    (this.smoke.material as THREE.ShaderMaterial).uniforms.uCol.value.setRGB(0.55 + day * 0.4, 0.57 + day * 0.4, 0.62 + day * 0.36);
  }
}
