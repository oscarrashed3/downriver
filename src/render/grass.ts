import * as THREE from 'three';
import type { Planet } from '../world/planet';
import { PAINT, NOISE_GLSL, THAW } from './paint';

/**
 * Wind grass: tufts of blades scattered over the terrain triangles, grouped in chunks that are
 * hidden past the horizon of this small world. Flowers share the same wind.
 */
const BLADES = 6;

function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], h: number[] = [], idx: number[] = [];
  let r = 3;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b < BLADES; b++) {
    const a = rnd() * Math.PI * 2, d = rnd() * 0.32;
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
    const ht = 0.45 + rnd() * 0.5;
    const w = 0.045 + rnd() * 0.03;
    const rot = rnd() * Math.PI;
    const cx = Math.cos(rot), cz = Math.sin(rot);
    const lean = (rnd() - 0.5) * 0.25;
    const base = pos.length / 3;
    const ring = [[-w, 0], [w, 0], [-w * 0.65, 0.5], [w * 0.65, 0.5], [0, 1]];
    for (const [x, y] of ring) {
      pos.push(bx + cx * x + lean * y * cz, y * ht, bz + cz * x - lean * y * cx);
      h.push(y);
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(h, 1));
  g.setIndex(idx);
  return g;
}

function flowerGeometry(): THREE.BufferGeometry {
  // A stem (thin quad) and a small five-petal star facing up.
  const pos: number[] = [], h: number[] = [], head: number[] = [], idx: number[] = [];
  const add = (x: number, y: number, z: number, hh: number, isHead: number) => { pos.push(x, y, z); h.push(hh); head.push(isHead); return pos.length / 3 - 1; };
  const s0 = add(-0.015, 0, 0, 0, 0), s1 = add(0.015, 0, 0, 0, 0), s2 = add(-0.012, 0.42, 0, 0.9, 0), s3 = add(0.012, 0.42, 0, 0.9, 0);
  idx.push(s0, s1, s2, s1, s3, s2);
  const c = add(0, 0.44, 0, 1, 1);
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, rr = i % 2 === 0 ? 0.11 : 0.05;
    pts.push(add(Math.cos(a) * rr, 0.44 + (i % 2 ? 0.01 : -0.01), Math.sin(a) * rr, 1, 1));
  }
  for (let i = 0; i < 10; i++) idx.push(c, pts[i], pts[(i + 1) % 10]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(h, 1));
  g.setAttribute('aHead', new THREE.Float32BufferAttribute(head, 1));
  g.setIndex(idx);
  return g;
}

export function makeGrassMaterial(flower: boolean) {
  return new THREE.ShaderMaterial({
    fog: true,
    side: THREE.DoubleSide,
    defines: flower ? { FLOWER: 1 } : {},
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uPlayer: { value: new THREE.Vector3() },
      uLush: { value: 0.4 },
      uSnow: { value: 0 },
      uBloom: { value: 0.3 },
    }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute float aH;
      #ifdef FLOWER
        attribute float aHead;
        attribute vec3 iColor;
        varying vec3 vFlower;
        varying float vHead;
      #endif
      attribute vec3 iPos; attribute vec3 iUp; attribute vec2 iRS; attribute float iVar;
      #ifndef FLOWER
        attribute vec3 iGround;
      #endif
      varying vec3 vGround;
      uniform float uTime; uniform vec3 uWind; uniform vec3 uPlayer; uniform float uSnow; uniform float uBloom;
      uniform vec3 uThawC; uniform float uThawR; uniform float uThawOn;
      varying float vSnow;
      varying float vH; varying float vVar; varying vec3 vW; varying vec3 vUpN;
      void main(){
        vec3 up = normalize(iUp);
        vec3 ref = abs(up.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 t1 = normalize(cross(up, ref)); vec3 t2 = cross(up, t1);
        float c = cos(iRS.x), s = sin(iRS.x);
        vec3 ax = t1 * c + t2 * s; vec3 az = -t1 * s + t2 * c;
        vec3 lp = position * iRS.y;
        // behind the thaw wave: no snow, flowers open
        float tk = uThawOn * smoothstep(uThawR, uThawR - 9.0, distance(iPos, uThawC));
        float snowE = uSnow * (1.0 - tk);
        vSnow = snowE;
        #ifdef FLOWER
          lp *= mix(0.25, 1.0, max(uBloom, tk));
        #endif
        lp.y *= (1.0 - snowE * 0.7);
        // blades right in front of the camera bow out of the way, so they never fill the screen
        lp *= smoothstep(0.6, 2.6, distance(iPos, cameraPosition));
        vec3 wp = iPos + ax * lp.x + up * lp.y + az * lp.z;
        vec3 w = uWind - up * dot(uWind, up); w = normalize(w + 1e-5);
        float along = dot(iPos, w);
        float wave = sin(along * 0.23 - uTime * 2.1) * 0.5 + 0.5;
        float gust = sin(along * 0.045 - uTime * 0.6 + iVar * 2.0) * 0.5 + 0.5;
        float hh = aH * aH;
        float bend = (0.12 + 0.75 * wave * (0.35 + 0.65 * gust) + 0.06 * sin(uTime * 6.0 + iVar * 40.0)) * hh * iRS.y;
        wp += w * bend * 0.85 - up * bend * bend * 0.35;
        vec3 toP = wp - uPlayer; toP -= up * dot(toP, up);
        float dp = length(toP);
        float push = smoothstep(1.4, 0.15, dp) * aH;
        wp += (toP / (dp + 1e-4)) * push * 0.55 - up * push * 0.3 * iRS.y;
        vH = aH; vVar = iVar; vW = wp; vUpN = up;
        #ifndef FLOWER
          vGround = iGround;
        #else
          vGround = vec3(0.45, 0.62, 0.3);
        #endif
        #ifdef FLOWER
          vFlower = iColor; vHead = aHead;
        #endif
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uAmbSky; uniform vec3 uWind;
      uniform float uLush; uniform float uSnow; uniform float uCloudShadow;
      varying float vSnow;
      varying float vH; varying float vVar; varying vec3 vW; varying vec3 vUpN; varying vec3 vGround;
      #ifdef FLOWER
        varying vec3 vFlower; varying float vHead;
      #endif
      ${NOISE_GLSL}
      void main(){
        float pch = pNoise(vW * 0.09) * 0.7 + pNoise(vW * 0.4) * 0.3;
        vec3 baseL = vec3(0.13, 0.30, 0.17), tipL = mix(vec3(0.50, 0.70, 0.24), vec3(0.72, 0.80, 0.33), pch);
        vec3 baseD = vec3(0.30, 0.28, 0.14), tipD = vec3(0.80, 0.70, 0.42);
        vec3 base = mix(baseD, baseL, uLush), tip = mix(tipD, tipL, uLush);
        tip = mix(tip, tip * vec3(0.78, 0.95, 1.05), smoothstep(0.55, 0.9, vVar) * 0.6);
        // blades grow out of the ground they stand on: its colour at the root, a lighter warmer tip
        vec3 gBase = vGround * 0.62, gTip = mix(vGround * 1.22, vec3(0.86, 0.88, 0.55), 0.18);
        base = mix(base, gBase, 0.7 * uLush); tip = mix(tip, gTip, 0.7 * uLush);
        vec3 col = mix(base, tip, smoothstep(0.0, 1.0, vH));
        #ifdef FLOWER
          col = mix(vec3(0.25, 0.45, 0.2), vFlower, vHead);
        #endif
        col = mix(col, vec3(0.95, 0.97, 1.0), vSnow * smoothstep(0.2, 0.8, vH + 0.3));
        vec3 V = normalize(cameraPosition - vW);
        float lam = clamp(dot(vUpN, uSun) * 0.55 + 0.45, 0.0, 1.0);
        float back = pow(clamp(dot(-V, uSun), 0.0, 1.0), 4.0) * vH;
        float cs = smoothstep(0.5, 0.72, pNoise(vW * 0.03 + uWind * uTime * 0.35));
        vec3 light = uSunCol * lam * 0.42 * (1.0 - cs * uCloudShadow) + uAmbSky * 0.9;
        col = col * light + uSunCol * back * vec3(0.9, 1.0, 0.45) * 0.25;
        col *= mix(0.7, 1.0, vH);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
}

interface Chunk { mesh: THREE.Mesh; dir: THREE.Vector3; count: number }

export class Grass {
  chunks: Chunk[] = [];
  mat = makeGrassMaterial(false);
  flowerMat = makeGrassMaterial(true);
  total = 0;
  private frac = 1;
  group = new THREE.Group();

  /**
   * weight(i) gives grass density 0..1 at terrain vertex i; flowerW(dir) is the flower density.
   * perM2 is tufts per square meter at weight 1.
   */
  constructor(private planet: Planet, weight: Float32Array, perM2: number, flowerW: (d: THREE.Vector3) => number) {
    for (const m of [this.mat, this.flowerMat]) Object.assign(m.uniforms, {
      ...THAW, uTime: PAINT.uTime, uWind: PAINT.uWind, uSun: PAINT.uSun, uSunCol: PAINT.uSunCol, uAmbSky: PAINT.uAmbSky, uCloudShadow: PAINT.uCloudShadow,
    });
    const geo = planet.terrain.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const index = geo.index!;
    const center = planet.center;
    const buckets = new Map<string, { pos: number[]; up: number[]; rs: number[]; v: number[]; col: number[]; gr: number[]; flowers: boolean }>();
    let seed = 12345;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), d = new THREE.Vector3();
    const palette = [[1, 1, 0.94], [1, 0.85, 0.3], [0.98, 0.6, 0.75], [0.72, 0.62, 1.0], [1, 0.55, 0.35], [0.55, 0.75, 1.0]];
    const key = (dir: THREE.Vector3, fl: boolean) => {
      const lat = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1)) * 180 / Math.PI;
      const lon = Math.atan2(dir.z, dir.x) * 180 / Math.PI;
      const la = Math.floor(lat / 9);
      const cols = Math.max(1, Math.round(40 * Math.sin((la + 0.5) * 9 * Math.PI / 180)));
      const lo = Math.floor(((lon + 180) / 360) * cols);
      return `${fl ? 'f' : 'g'}${la}_${lo}`;
    };
    const GC = planet.grassCol, gcol = new THREE.Color(0.45, 0.62, 0.3);
    const push = (fl: boolean, wp: THREE.Vector3, up: THREE.Vector3, scale: number) => {
      d.copy(wp).sub(center).normalize();
      const k = key(d, fl);
      let bk = buckets.get(k);
      if (!bk) { bk = { pos: [], up: [], rs: [], v: [], col: [], gr: [], flowers: fl }; buckets.set(k, bk); }
      bk.pos.push(wp.x, wp.y, wp.z); bk.up.push(up.x, up.y, up.z); bk.rs.push(rnd() * Math.PI * 2, scale); bk.v.push(rnd());
      if (!fl) bk.gr.push(gcol.r, gcol.g, gcol.b);
      if (fl) { const c0 = palette[Math.floor(rnd() * palette.length)]; bk.col.push(c0[0], c0[1], c0[2]); }
    };
    for (let t = 0; t < index.count; t += 3) {
      const i0 = index.getX(t), i1 = index.getX(t + 1), i2 = index.getX(t + 2);
      const w = (weight[i0] + weight[i1] + weight[i2]) / 3;
      if (w < 0.03) continue;
      a.fromBufferAttribute(pos, i0).add(center); b.fromBufferAttribute(pos, i1).add(center); c.fromBufferAttribute(pos, i2).add(center);
      e1.subVectors(b, a); e2.subVectors(c, a);
      n.crossVectors(e1, e2);
      const area = n.length() * 0.5;
      n.normalize();
      const radial = a.clone().sub(center).normalize();
      if (n.dot(radial) < 0) n.negate();
      const expect = area * perM2 * w;
      let cnt = Math.floor(expect); if (rnd() < expect - cnt) cnt++;
      for (let j = 0; j < cnt; j++) {
        let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
        p.copy(a).addScaledVector(e1, u).addScaledVector(e2, v);
        const up = p.clone().sub(center).normalize().lerp(n, 0.5).normalize();
        p.addScaledVector(up, -0.03);
        if (GC) { const w0 = 1 - u - v, at = (q: number) => GC[i0 * 3 + q] * w0 + GC[i1 * 3 + q] * u + GC[i2 * 3 + q] * v; gcol.setRGB(at(0), at(1), at(2)); }
        push(false, p, up, (0.75 + rnd() * 0.55) * (0.7 + w * 0.5));
      }
      // Flowers
      d.copy(a).sub(center).normalize();
      const fw = flowerW(d) * w;
      if (fw > 0.02) {
        const fe = area * fw * 1.6;
        let fc = Math.floor(fe); if (rnd() < fe - fc) fc++;
        for (let j = 0; j < fc; j++) {
          let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
          p.copy(a).addScaledVector(e1, u).addScaledVector(e2, v);
          const up = p.clone().sub(center).normalize();
          push(true, p, up, 0.7 + rnd() * 0.6);
        }
      }
    }
    const tuft = tuftGeometry(), flower = flowerGeometry();
    for (const bk of buckets.values()) {
      const N = bk.v.length;
      const g = new THREE.InstancedBufferGeometry();
      const src = bk.flowers ? flower : tuft;
      g.index = src.index; g.attributes.position = src.attributes.position; g.attributes.aH = src.attributes.aH;
      if (bk.flowers) g.attributes.aHead = src.attributes.aHead;
      // shuffle so instanceCount scaling thins evenly
      const order = [...Array(N).keys()];
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      const re = (arr: number[], k: number) => { const out = new Float32Array(N * k); order.forEach((o, i) => { for (let q = 0; q < k; q++) out[i * k + q] = arr[o * k + q]; }); return out; };
      g.setAttribute('iPos', new THREE.InstancedBufferAttribute(re(bk.pos, 3), 3));
      g.setAttribute('iUp', new THREE.InstancedBufferAttribute(re(bk.up, 3), 3));
      g.setAttribute('iRS', new THREE.InstancedBufferAttribute(re(bk.rs, 2), 2));
      g.setAttribute('iVar', new THREE.InstancedBufferAttribute(re(bk.v, 1), 1));
      if (!bk.flowers) g.setAttribute('iGround', new THREE.InstancedBufferAttribute(re(bk.gr, 3), 3));
      if (bk.flowers) g.setAttribute('iColor', new THREE.InstancedBufferAttribute(re(bk.col, 3), 3));
      g.instanceCount = N;
      const mid = new THREE.Vector3();
      for (let i = 0; i < N; i++) mid.x += bk.pos[i * 3], mid.y += bk.pos[i * 3 + 1], mid.z += bk.pos[i * 3 + 2];
      mid.divideScalar(N);
      let rad = 0;
      for (let i = 0; i < N; i++) rad = Math.max(rad, Math.hypot(bk.pos[i * 3] - mid.x, bk.pos[i * 3 + 1] - mid.y, bk.pos[i * 3 + 2] - mid.z));
      g.boundingSphere = new THREE.Sphere(mid, rad + 2);
      const mesh = new THREE.Mesh(g, bk.flowers ? this.flowerMat : this.mat);
      this.group.add(mesh);
      this.chunks.push({ mesh, dir: mid.clone().sub(center).normalize(), count: N });
      this.total += bk.flowers ? 0 : N;
    }
  }

  setQuality(frac: number) {
    this.frac = frac;
    for (const c of this.chunks) (c.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.max(1, Math.floor(c.count * frac));
  }

  /** Show only chunks near the traveler and on the near side of the world. */
  update(playerPos: THREE.Vector3, camPos: THREE.Vector3, active: boolean) {
    this.group.visible = active;
    if (!active) return;
    this.mat.uniforms.uPlayer.value.copy(playerPos);
    this.flowerMat.uniforms.uPlayer.value.copy(playerPos);
    const pd = playerPos.clone().sub(this.planet.center).normalize();
    const cd = camPos.clone().sub(this.planet.center);
    const camFar = cd.length() > this.planet.R * 2.2;
    cd.normalize();
    for (const c of this.chunks) {
      const near = c.dir.dot(pd);
      c.mesh.visible = camFar ? c.dir.dot(cd) > 0.4 : near > 0.72 && c.dir.dot(cd) > 0.45;
    }
    void this.frac;
  }

  set lush(v: number) { this.mat.uniforms.uLush.value = v; this.flowerMat.uniforms.uLush.value = v; }
  set snow(v: number) { this.mat.uniforms.uSnow.value = v; this.flowerMat.uniforms.uSnow.value = v; }
  set bloom(v: number) { this.flowerMat.uniforms.uBloom.value = v; }
  get bloom() { return this.flowerMat.uniforms.uBloom.value; }
}
