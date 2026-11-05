import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise, smoothstep, clamp, lerp } from './noise';
import { dirLatLon, angleBetween } from './sphere';
import type { WorldConfig } from './worlds';
import { makeWaterMaterial } from './water';

export interface Flatten { dir: THREE.Vector3; radius: number; height: number; blend: number }

const tmpV = new THREE.Vector3();

/** A small round world you can walk all the way around. Gravity points to its center. */
export class Planet {
  readonly group = new THREE.Group();
  readonly center: THREE.Vector3;
  readonly R: number;
  readonly noise: Noise;
  /** River path from the north pole (t=0) to the south pole (t=1), as unit directions. */
  readonly path: THREE.Vector3[] = [];
  readonly riverLon: number;
  flattens: Flatten[] = [];
  terrain!: THREE.Mesh;
  water!: THREE.Mesh;
  waterMat!: THREE.ShaderMaterial;
  ocean?: THREE.Mesh;
  /** World-specific extra state set by builders. */
  extras: Record<string, any> = {};
  private colorParams = { snowline: 0.55, glacier: 0.3 };
  flowWidth = 1;

  constructor(public cfg: WorldConfig, public index: number, riverLon: number) {
    this.center = cfg.center.clone();
    this.R = cfg.radius;
    this.noise = new Noise(cfg.seed);
    this.riverLon = riverLon;
    this.group.position.copy(this.center);
    const N = 360;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const lat = lerp(cfg.riverStartLat, 179.5, t);
      const lon = riverLon + cfg.meander * Math.sin(t * Math.PI * cfg.meanderWaves) * Math.sin(t * Math.PI);
      this.path.push(dirLatLon(lat, lon));
    }
  }

  /** Longitude of the river at a given latitude. */
  lonAtLat(lat: number): number {
    const t = clamp((lat - this.cfg.riverStartLat) / (179.5 - this.cfg.riverStartLat));
    return this.riverLon + this.cfg.meander * Math.sin(t * Math.PI * this.cfg.meanderWaves) * Math.sin(t * Math.PI);
  }

  /** Direction relative to the river: lat from north, lon offset from the river at that latitude. */
  dirRiver(lat: number, lonOffset: number, out = new THREE.Vector3()): THREE.Vector3 {
    return dirLatLon(lat, this.lonAtLat(lat) + lonOffset, out);
  }

  pathPoint(t: number, out = new THREE.Vector3()): THREE.Vector3 {
    const f = clamp(t) * (this.path.length - 1);
    const i = Math.min(this.path.length - 2, Math.floor(f));
    return out.copy(this.path[i]).lerp(this.path[i + 1], f - i).normalize();
  }

  /** Nearest point on the river: angular distance (world units) and path parameter t. */
  riverNearest(dir: THREE.Vector3): { dist: number; t: number } {
    let best = Infinity, bi = 0;
    const p = this.path;
    for (let i = 0; i < p.length; i += 4) {
      const d = 1 - dir.dot(p[i]);
      if (d < best) { best = d; bi = i; }
    }
    const lo = Math.max(0, bi - 4), hi = Math.min(p.length - 1, bi + 4);
    for (let i = lo; i <= hi; i++) {
      const d = 1 - dir.dot(p[i]);
      if (d < best) { best = d; bi = i; }
    }
    return { dist: angleBetween(dir, p[bi]) * this.R, t: bi / (p.length - 1) };
  }

  /** Raw terrain shape before the river and flattening, in world units above R. */
  baseHeight(d: THREE.Vector3): number {
    const n = this.noise, A = this.cfg.amplitude;
    const x = d.x, y = d.y, z = d.z;
    switch (this.cfg.shape) {
      case 'peaks': {
        const r = n.ridged(x * 1.4, y * 1.4, z * 1.4, 3);
        const hills = n.fbm(x * 3 + 7, y * 3, z * 3, 3) * 0.5 + 0.5;
        const cap = smoothstep(0.6, 0.97, y) * 0.35; // high glacier plateau around the north pole
        return A * (Math.pow(r, 2.6) * 0.72 + hills * 0.22 + cap);
      }
      case 'pines':
        return A * (n.fbm(x * 2.5, y * 2.5, z * 2.5, 4) * 0.5 + 0.5);
      case 'jungle': {
        const h = n.fbm(x * 2.2, y * 2.2, z * 2.2, 4) * 0.5 + 0.5;
        const steps = 7;
        const q = Math.floor(h * steps) / steps;
        const f = h * steps - Math.floor(h * steps);
        return A * (q + smoothstep(0.82, 1, f) / steps);
      }
      case 'desert': {
        const warp = n.fbm(x * 1.5, y * 1.5, z * 1.5, 2) * 2;
        const dune = Math.abs(Math.sin((x * 9 + z * 5 + warp * 3)));
        const big = n.fbm(x * 1.2 + 3, y * 1.2, z * 1.2, 3) * 0.5 + 0.5;
        return A * (dune * 0.35 * big + big * 0.7);
      }
      case 'city':
        return A * (n.fbm(x * 2, y * 2, z * 2, 3) * 0.5 + 0.5);
      case 'sea': {
        const h = n.fbm(x * 2.6, y * 2.6, z * 2.6, 4);
        return A * (h * 0.9); // mostly under the ocean (ocean sits at ~1.5)
      }
    }
  }

  height(d: THREE.Vector3): number {
    let h = this.baseHeight(d);
    for (const f of this.flattens) {
      const a = angleBetween(d, f.dir) * this.R;
      const k = smoothstep(f.radius + f.blend, f.radius, a);
      if (k > 0) h = lerp(h, f.height, k);
    }
    const { dist, t } = this.riverNearest(d);
    if (this.cfg.shape === 'sea') {
      // A long marsh island carries the river across the ocean to the lighthouse.
      const isle = smoothstep(this.cfg.riverWidth + 12, this.cfg.riverWidth + 4, dist);
      h = Math.max(h, lerp(h, 2.6 + this.noise.n3(d.x * 12, d.y * 12, d.z * 12) * 0.5, isle));
    }
    const w = this.cfg.riverWidth * 1.15 * (t < 0.03 ? t / 0.03 : 1) + 0.6;
    // A broad, gentle valley follows the river so it is always easy to walk beside it.
    const vw = this.cfg.valleyWidth ?? 14;
    const valley = smoothstep(w + this.cfg.bankWidth, w + this.cfg.bankWidth + vw, dist);
    h = lerp(Math.min(h, this.cfg.riverBed + 1.5 + h * 0.15), h, valley);
    const bed = this.cfg.riverBed;
    const k = smoothstep(w + this.cfg.bankWidth, w * 0.6, dist);
    if (k > 0) h = lerp(h, Math.min(h, bed), k);
    return h;
  }

  surfaceRadius(d: THREE.Vector3): number {
    return this.R + this.height(d);
  }

  /** World position on the surface plus an offset along the normal. */
  surfacePoint(d: THREE.Vector3, offset = 0, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(d).multiplyScalar(this.surfaceRadius(d) + offset).add(this.center);
  }

  /** Slope in radians at direction d (0 = flat). */
  slope(d: THREE.Vector3): number {
    const e = 0.6 / this.R;
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    const ref = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    t1.crossVectors(d, ref).normalize(); t2.crossVectors(d, t1).normalize();
    const p0 = this.surfacePoint(d);
    const p1 = this.surfacePoint(tmpV.copy(d).addScaledVector(t1, e).normalize());
    const p2 = this.surfacePoint(new THREE.Vector3().copy(d).addScaledVector(t2, e).normalize());
    const n = new THREE.Vector3().crossVectors(p1.sub(p0), p2.sub(p0)).normalize();
    if (n.dot(d) < 0) n.negate();
    return Math.acos(clamp(n.dot(d), -1, 1));
  }

  build() {
    const geo0 = new THREE.IcosahedronGeometry(1, this.cfg.detail);
    geo0.deleteAttribute('normal'); geo0.deleteAttribute('uv');
    const geo = mergeVertices(geo0);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const d = new THREE.Vector3();
    const heights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize();
      const h = this.height(d);
      heights[i] = h;
      pos.setXYZ(i, d.x * (this.R + h), d.y * (this.R + h), d.z * (this.R + h));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
    geo.computeVertexNormals();
    geo.userData.heights = heights;
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = false;
    this.group.add(this.terrain);
    this.recolor();

    this.waterMat = makeWaterMaterial(this.cfg.palette.water, this.cfg.palette.waterDeep);
    this.water = new THREE.Mesh(this.buildRiverGeometry(), this.waterMat);
    this.water.renderOrder = 2;
    this.group.add(this.water);

    if (this.cfg.shape === 'sea' || this.cfg.ocean) {
      const og = new THREE.IcosahedronGeometry(this.R + this.cfg.ocean!, 24);
      const om = makeWaterMaterial(this.cfg.palette.water, this.cfg.palette.waterDeep, true);
      this.ocean = new THREE.Mesh(og, om);
      this.ocean.renderOrder = 1;
      this.group.add(this.ocean);
    }
  }

  setSnow(snowline: number, glacier: number) {
    this.colorParams.snowline = snowline;
    this.colorParams.glacier = glacier;
    this.recolor();
  }

  recolor() {
    const geo = this.terrain.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nor = geo.attributes.normal as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    const heights = geo.userData.heights as Float32Array;
    const P = this.cfg.palette;
    const c = new THREE.Color(), d = new THREE.Vector3(), n = new THREE.Vector3();
    const low = new THREE.Color(P.low), mid = new THREE.Color(P.mid), high = new THREE.Color(P.high);
    const rock = new THREE.Color(P.rock), snow = new THREE.Color(P.snow ?? '#ffffff');
    const ice = new THREE.Color(P.ice ?? '#bfe3ff'), bank = new THREE.Color(P.bank ?? P.low);
    const A = this.cfg.amplitude;
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize();
      n.fromBufferAttribute(nor, i);
      const h = heights[i] / A;
      const flat = clamp(n.dot(d));
      const jitter = this.noise.n3(d.x * 30, d.y * 30, d.z * 30) * 0.05;
      if (h < 0.5) c.copy(low).lerp(mid, smoothstep(0, 0.5, h + jitter));
      else c.copy(mid).lerp(high, smoothstep(0.5, 1, h + jitter));
      c.lerp(rock, smoothstep(0.86, 0.6, flat) * 0.9);
      const rd = this.riverNearest(d).dist;
      c.lerp(bank, smoothstep(this.cfg.riverWidth + this.cfg.bankWidth + 1.5, this.cfg.riverWidth, rd) * 0.6);
      if (this.cfg.shape === 'peaks') {
        const snowAmt = smoothstep(this.colorParams.snowline + 0.05, this.colorParams.snowline - 0.08, 1 - h + jitter * 2) * smoothstep(0.55, 0.8, flat);
        c.lerp(snow, snowAmt);
        const glacierLat = Math.acos(clamp(d.y, -1, 1)) * 180 / Math.PI;
        const edge = glacierEdgeLat(this.colorParams.glacier);
        const g = smoothstep(edge + 2, edge - 2, glacierLat);
        c.lerp(ice, g * 0.85);
      }
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  buildRiverGeometry(): THREE.BufferGeometry {
    const across = 7;
    const P = this.path;
    const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
    const tan = new THREE.Vector3(), side = new THREE.Vector3(), d = new THREE.Vector3();
    let along = 0;
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      tan.subVectors(b, a).normalize();
      side.crossVectors(P[i], tan).normalize();
      const t = i / (P.length - 1);
      const w = (this.cfg.riverWidth * this.flowWidth) * (t < 0.03 ? Math.max(0.15, t / 0.03) : 1);
      if (i > 0) along += P[i].distanceTo(P[i - 1]) * this.R;
      for (let j = 0; j < across; j++) {
        const s = j / (across - 1) * 2 - 1;
        d.copy(P[i]).addScaledVector(side, (s * w) / this.R).normalize();
        const r = this.R + this.cfg.riverBed + this.cfg.waterDepth;
        verts.push(d.x * r, d.y * r, d.z * r);
        uvs.push(s, along);
      }
    }
    for (let i = 0; i < P.length - 1; i++) for (let j = 0; j < across - 1; j++) {
      const a = i * across + j, b = a + 1, c = a + across, e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** Change river width with the flow arriving here (the ripple made visible). */
  setFlow(widthMul: number, health: number) {
    if (Math.abs(widthMul - this.flowWidth) > 0.01) {
      this.flowWidth = widthMul;
      this.water.geometry.dispose();
      this.water.geometry = this.buildRiverGeometry();
    }
    this.waterMat.uniforms.uHealth.value = health;
  }

  waterLevelRadius(): number {
    return this.R + this.cfg.riverBed + this.cfg.waterDepth;
  }
}

let ramp: THREE.DataTexture | null = null;
export function toonRamp(): THREE.DataTexture {
  if (ramp) return ramp;
  const data = new Uint8Array([90, 90, 90, 255, 160, 160, 160, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  ramp.minFilter = THREE.NearestFilter; ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

/** Latitude where the glacier ends for a given snowpack (0..1). More snow, longer ice. */
export function glacierEdgeLat(snowpack: number): number { return 4 + snowpack * 35; }
