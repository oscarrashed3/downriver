import * as THREE from 'three';
import type { Solid, Deck } from './collide';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise, smoothstep, clamp, lerp } from './noise';
import { dirLatLon, angleBetween } from './sphere';
import type { WorldConfig } from './worlds';
import { makeWaterMaterial } from './water';
import { paint, softRamp } from '../render/paint';

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
  private colorParams = { snowline: 0.55, glacier: 0.3, winter: 0 };
  flowWidth = 1;
  /** Worn footpaths (polylines of directions) painted into the ground; grass avoids them. */
  paths: { pts: THREE.Vector3[]; width: number }[] = [];
  /** Places kept clear of grass (house floors, the campfire ring). */
  clearings: { dir: THREE.Vector3; r: number }[] = [];
  /** Things you cannot walk through, and decks you can walk on. */
  solids: Solid[] = [];
  decks: Deck[] = [];
  /** Soft ground tints, one per named area. */
  tints: { dir: THREE.Vector3; r: number; color: THREE.Color; k: number }[] = [];
  /** Ground colour per terrain vertex without snow (rgb), for the grass blades. Filled by recolor(). */
  grassCol?: Float32Array;
  /** Grass density per terrain vertex (0..1), filled by recolor(). */
  grassW: Float32Array | null = null;

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
      case 'desert': {
        const warp = n.fbm(x * 1.5, y * 1.5, z * 1.5, 2) * 2;
        const dune = Math.abs(Math.sin((x * 9 + z * 5 + warp * 3)));
        const big = n.fbm(x * 1.2 + 3, y * 1.2, z * 1.2, 3) * 0.5 + 0.5;
        return A * (dune * 0.35 * big + big * 0.7);
      }
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
      // A long marsh island carries the river across the ocean, all the way to the edge where it falls on.
      const isle = smoothstep(this.cfg.riverWidth + 12, this.cfg.riverWidth + 4, dist);
      h = Math.max(h, lerp(h, 2.6 + this.noise.n3(d.x * 12, d.y * 12, d.z * 12) * 0.5, isle));
    }
    const w = this.cfg.riverWidth * 1.15 * (t < 0.03 ? t / 0.03 : 1) + 0.6;
    // A broad, gentle valley follows the river so it is always easy to walk beside it.
    const vw = this.cfg.valleyWidth ?? 14;
    const valley = smoothstep(w + this.cfg.bankWidth, w + this.cfg.bankWidth + vw, dist);
    h = lerp(Math.min(h, this.cfg.riverBed + 1.5 + h * 0.15), h, valley);
    const bed = this.cfg.riverBed;
    // Banks never dip below the water, so the river always sits in its own channel.
    const bank = smoothstep(w + this.cfg.bankWidth + 4, w + 0.4, dist);
    if (bank > 0) h = Math.max(h, lerp(h, bed + this.cfg.waterDepth + 0.45, bank));
    const k = smoothstep(w + this.cfg.bankWidth, w * 0.6, dist);
    if (k > 0) h = lerp(h, bed, k);
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
    geo.setAttribute('colorB', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
    geo.computeVertexNormals();
    geo.userData.heights = heights;
    const mat = paint(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: softRamp() }), { variation: 0.8, rim: 0.25, thaw: true });
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

  /** snowline: height (0..1 of amplitude) above which snow lies. glacier: snowpack for the ice tongue. winter: 0..1 blanket. */
  setSnow(snowline: number, glacier: number, winter = 0) {
    this.colorParams.snowline = snowline;
    this.colorParams.glacier = glacier;
    this.colorParams.winter = winter;
    this.recolor();
  }

  /** Angular distance (world units) from a direction to the nearest worn path, and that path's width. */
  pathDist(d: THREE.Vector3): { dist: number; width: number } {
    let best = Infinity, w = 1;
    const ab = new THREE.Vector3(), ap = new THREE.Vector3();
    for (const pth of this.paths) {
      for (let i = 0; i < pth.pts.length - 1; i++) {
        const a = pth.pts[i], b = pth.pts[i + 1];
        ab.subVectors(b, a); ap.subVectors(d, a);
        const t = clamp(ap.dot(ab) / Math.max(1e-9, ab.lengthSq()));
        const q = a.clone().addScaledVector(ab, t);
        const dist = q.distanceTo(d) * this.R;
        if (dist < best) { best = dist; w = pth.width; }
      }
    }
    return { dist: best, width: w };
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
    const moss = new THREE.Color(P.moss ?? P.mid), dab = new THREE.Color(P.dab ?? P.low), path = new THREE.Color(P.path ?? P.bank ?? P.low);
    const A = this.cfg.amplitude;
    const peaks = this.cfg.shape === 'peaks';
    if (!geo.userData.cache) {
      // River and path distances never change; compute them once.
      const rd = new Float32Array(pos.count), pd = new Float32Array(pos.count), lo = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        d.fromBufferAttribute(pos, i).normalize();
        const rn = this.riverNearest(d);
        rd[i] = rn.dist;
        const pp = this.paths.length ? this.pathDist(d) : { dist: 99, width: 1 };
        pd[i] = pp.dist / pp.width;
        const ll = Math.atan2(d.z, d.x) * 180 / Math.PI;
        const lat = Math.acos(clamp(d.y, -1, 1)) * 180 / Math.PI;
        lo[i] = ((ll - this.lonAtLat(lat) + 540) % 360) - 180;
      }
      geo.userData.cache = { rd, pd, lo };
    }
    const { rd, pd, lo } = geo.userData.cache as { rd: Float32Array; pd: Float32Array; lo: Float32Array };
    if (!this.grassW) this.grassW = new Float32Array(pos.count);
    const gw = this.grassW;
    if (!this.grassCol) this.grassCol = new Float32Array(pos.count * 3);
    const gc = this.grassCol;
    const winter = this.colorParams.winter;
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize();
      n.fromBufferAttribute(nor, i);
      const h = heights[i] / A;
      const flat = clamp(n.dot(d));
      const jitter = this.noise.n3(d.x * 30, d.y * 30, d.z * 30) * 0.05;
      const big = this.noise.n3(d.x * 7 + 3, d.y * 7, d.z * 7);
      if (h < 0.5) c.copy(low).lerp(mid, smoothstep(0, 0.5, h + jitter + big * 0.12));
      else c.copy(mid).lerp(high, smoothstep(0.5, 1, h + jitter));
      // painted dabs of brighter grass
      c.lerp(dab, smoothstep(0.25, 0.55, big) * 0.35 * smoothstep(0.6, 0.3, h));
      for (const t of this.tints) { const a = angleBetween(d, t.dir) * this.R; if (a < t.r + 6) c.lerp(t.color, smoothstep(t.r + 6, t.r - 2, a) * t.k); }
      const rocky = smoothstep(0.86, 0.6, flat);
      const rk = rock.clone().lerp(moss, smoothstep(0.62, 0.8, flat) * 0.55 * (peaks ? 1 : 0.3));
      c.lerp(rk, rocky * 0.9);
      const rdist = rd[i];
      const bankK = smoothstep(this.cfg.riverWidth + this.cfg.bankWidth + 1.5, this.cfg.riverWidth, rdist);
      c.lerp(bank, bankK * 0.6);
      const pathK = smoothstep(1.0, 0.45, pd[i]);
      c.lerp(path, pathK * 0.85);
      gc[i * 3] = c.r; gc[i * 3 + 1] = c.g; gc[i * 3 + 2] = c.b; // what the grass grows out of, before any snow
      let snowAmt = 0;
      if (peaks) {
        snowAmt = smoothstep(this.colorParams.snowline - 0.04, this.colorParams.snowline + 0.06, h + jitter * 2) * smoothstep(0.45, 0.75, flat);
        snowAmt = Math.max(snowAmt, winter * smoothstep(0.4, 0.7, flat));
        c.lerp(snow, snowAmt);
        // a tongue of ice in the side valley above Ysolde's stones
        const glacierLat = Math.acos(clamp(d.y, -1, 1)) * 180 / Math.PI;
        const edge = glacierEdgeLat(this.colorParams.glacier);
        const band = smoothstep(5, 9, lo[i]) * smoothstep(34, 26, lo[i]);
        const g = smoothstep(edge + 2, edge - 2, glacierLat) * band;
        c.lerp(ice, g * 0.85);
        snowAmt = Math.max(snowAmt, g);
      }
      col.setXYZ(i, c.r, c.g, c.b);
      let w = (1 - snowAmt) * smoothstep(0.8, 0.93, flat) * smoothstep(this.cfg.riverWidth + 1.2, this.cfg.riverWidth + this.cfg.bankWidth + 0.5, rdist) * (1 - pathK * 0.9);
      w *= smoothstep(0.92, 0.7, h);
      for (const cl of this.clearings) { const a = angleBetween(d, cl.dir) * this.R; if (a < cl.r + 1.5) w *= smoothstep(cl.r, cl.r + 1.5, a); }
      gw[i] = w;
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
    this.riverLength = along;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /**
   * Get ready for the thaw wave: the current (winter) colours stay in 'color', and the colours after the thaw
   * (snowline and winter as given) go into 'colorB'. The terrain shader blends between them behind the wave.
   */
  prepareThaw(snowline: number, glacier: number) {
    const geo = this.terrain.geometry as THREE.BufferGeometry;
    const col = geo.attributes.color as THREE.BufferAttribute, colB = geo.attributes.colorB as THREE.BufferAttribute;
    const winter = (col.array as Float32Array).slice();
    const keep = { ...this.colorParams };
    this.setSnow(snowline, glacier, 0);
    (colB.array as Float32Array).set(col.array as Float32Array); colB.needsUpdate = true;
    (col.array as Float32Array).set(winter); col.needsUpdate = true;
    Object.assign(this.colorParams, keep);
  }

  /** River length in metres along its path (the 'along' of the water's uv). */
  riverLength = 0;
  /** Distance along the river (metres) of the path point nearest `dir`. */
  alongAt(dir: THREE.Vector3) {
    let best = 0, bd = 9, along = 0;
    for (let i = 0; i < this.path.length; i++) {
      if (i > 0) along += this.path[i].distanceTo(this.path[i - 1]) * this.R;
      const d = this.path[i].distanceTo(dir);
      if (d < bd) { bd = d; best = along; }
    }
    return best;
  }

  /** The river swells to `widthMul` as a wave running down from the spring: call, then raise waterMat uSurge. */
  surgeTo(widthMul: number) {
    const old = this.flowWidth;
    this.setFlow(widthMul, this.waterMat.uniforms.uHealth.value);
    this.waterMat.uniforms.uNarrow.value = Math.min(1, old / widthMul);
    this.waterMat.uniforms.uSurge.value = 0;
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
