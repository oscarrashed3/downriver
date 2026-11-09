// The Sky Isles' ground: what planet.height() means in World 2. Floating islands, each a walkable top in its own
// flat frame bent onto the little planet, over a soft floor of cloud; stone aqueducts carry the river across the
// gaps between the river islands. Everything that renders an island (world.ts) uses the same IslandShape and the
// same bend as here, so the meadow you see is exactly the ground you walk on.
import * as THREE from 'three';
import type { Planet } from '../planet';
import { smoothstep, clamp, lerp } from '../noise';
import { IslandShape, TAU, type WaterfallSpec } from './islandShape';
import { ISLES, CLOUD_H, AQ_CHANNEL, AQ_DECK, type IsleDef } from './layout';

const _v = new THREE.Vector3(), _h = new THREE.Vector3(), _q = new THREE.Quaternion();

/**
 * One island on the planet: its frame (up through its centre, e1 downriver, e2 toward the + side), the radius of
 * its local y = 0 (R + top), and its shape. Local space is the island builder's: +Y up, the lip near y = 0. The
 * bend maps local (x, y, z) onto the sphere azimuthally: distances along the top are kept, verticals point to the
 * planet's centre, so the meadow follows the curve of the world and gravity is straight down everywhere on it.
 */
export class Isle {
  readonly up: THREE.Vector3;
  readonly e1: THREE.Vector3;
  readonly e2: THREE.Vector3;
  readonly Rt: number;
  readonly shape: IslandShape;
  readonly opts: ConstructorParameters<typeof IslandShape>[0] & { waterfalls: WaterfallSpec[] };
  /** cos of the angular radius that holds the whole top (cheap test before the outline). */
  readonly cosOuter: number;
  readonly maxR: number;
  /** The knolls in local coordinates. */
  readonly knolls: { x: number; z: number; r: number; h: number }[];

  constructor(readonly p: Planet, readonly def: IsleDef, topHeight: (isle: Isle, x: number, z: number) => number) {
    const off = def.off / (p.R * Math.PI / 180 * Math.max(0.05, Math.sin(def.lat * Math.PI / 180)));
    this.up = p.dirRiver(def.lat, off);
    const s = p.dirRiver(Math.min(179.9, def.lat + 0.5), off).sub(this.up);
    if (def.lat > 179) s.copy(this.up).cross(new THREE.Vector3(0, 0, 1));
    this.e1 = s.projectOnPlane(this.up).normalize();
    if (def.spin) this.e1.applyAxisAngle(this.up, def.spin * Math.PI / 180);
    this.e2 = new THREE.Vector3().crossVectors(this.e1, this.up).normalize();
    this.Rt = p.R + def.top;
    this.knolls = (def.knolls ?? []).map(k => ({ ...this.toLocal(this.dirOff(k.lat, k.off)), r: k.r, h: k.h }));
    this.opts = {
      seed: def.seed, radius: def.r, wobble: def.wobble ?? 0.6, cliffDepth: def.cliff, underDepth: def.under, taper: def.taper,
      waterfalls: (def.falls ?? []).map(f => {
        const q = this.toLocal(p.dirRiver(f.lat, f.off / (p.R * Math.PI / 180 * Math.max(0.05, Math.sin(f.lat * Math.PI / 180)))));
        return { angle: Math.atan2(q.z, q.x), width: f.width, length: f.length };
      }),
      topHeight: (x: number, z: number) => topHeight(this, x, z),
    };
    this.shape = new IslandShape(this.opts);
    let m = 0;
    for (let i = 0; i < 180; i++) m = Math.max(m, this.shape.outline((i / 180) * TAU));
    this.maxR = m;
    this.cosOuter = Math.cos((m + 1.5) / this.Rt);
  }

  /** Planet direction at (lat, off) with off in metres from the river (measured at R, as in the layout). */
  dirOff(lat: number, off: number) {
    return this.p.dirRiver(lat, off / (this.p.R * Math.PI / 180 * Math.max(0.05, Math.sin(lat * Math.PI / 180))));
  }
  /** Local (x, z) of (lat, off). */
  at(lat: number, off: number) { return this.toLocal(this.dirOff(lat, off)); }

  /** Planet-local unit direction under local (x, z). */
  dirAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const s = Math.hypot(x, z);
    if (s < 1e-9) return out.copy(this.up);
    const th = s / this.Rt;
    _h.copy(this.e1).multiplyScalar(x / s).addScaledVector(this.e2, z / s);
    return out.copy(this.up).multiplyScalar(Math.cos(th)).addScaledVector(_h, Math.sin(th));
  }
  /** Local (x, y, z) to planet-local position (relative to the planet's centre). */
  toPlanet(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    return this.dirAt(x, z, out).multiplyScalar(this.Rt + y);
  }
  /** The rotation that carries the island's frame at its centre to the frame at local (x, z). */
  turnAt(x: number, z: number, out = new THREE.Quaternion()): THREE.Quaternion {
    return out.setFromUnitVectors(this.up, this.dirAt(x, z, _v));
  }
  /** The island frame's own rotation (local axes -> planet axes) at its centre. */
  basis(out = new THREE.Quaternion()): THREE.Quaternion {
    const m = new THREE.Matrix4().makeBasis(this.e1, this.up, this.e2);
    return out.setFromRotationMatrix(m);
  }
  /** Full rotation of the local frame at (x, z): basis, then turned along the curve. */
  frameAt(x: number, z: number, out = new THREE.Quaternion()): THREE.Quaternion {
    return this.turnAt(x, z, out).multiply(this.basis(_q));
  }
  /** Planet-local unit direction to local (x, z); and r: distance from the planet's centre to local y. */
  toLocal(d: THREE.Vector3): { x: number; z: number } {
    const c = clamp(d.dot(this.up), -1, 1);
    const hx = d.dot(this.e1), hz = d.dot(this.e2), hl = Math.hypot(hx, hz);
    if (hl < 1e-12) return { x: 0, z: 0 };
    const s = Math.acos(c) * this.Rt;
    return { x: s * hx / hl, z: s * hz / hl };
  }
  /** Local position of a planet-local point (x, z along the top, y above the lip level). */
  localOf(pl: THREE.Vector3): THREE.Vector3 {
    const r = pl.length();
    const q = this.toLocal(_v.copy(pl).divideScalar(r));
    return new THREE.Vector3(q.x, r - this.Rt, q.z);
  }
  /** Ground height (metres above R) under a planet direction, or null when it is not over this island's top. */
  heightAt(d: THREE.Vector3): number | null {
    if (d.dot(this.up) < this.cosOuter) return null;
    const { x, z } = this.toLocal(d);
    if (!this.shape.inside(x, z)) return null;
    return this.def.top + this.shape.height(x, z);
  }
  /** How far inside the lip (metres) local (x, z) is; negative outside. */
  inset(x: number, z: number) { return this.shape.outline(Math.atan2(z, x)) - Math.hypot(x, z); }
}

/** Everything about one planet's sky ground, built on first use and kept on the planet. */
export class SkyTerrain {
  readonly isles: Isle[] = [];
  readonly byId = new Map<string, Isle>();
  constructor(readonly p: Planet) {
    for (const def of ISLES) {
      const isle = new Isle(p, def, (is, x, z) => topRelief(this, is, x, z));
      this.isles.push(isle); this.byId.set(def.id, isle);
    }
  }
  isle(id: string) { return this.byId.get(id)!; }
}

export function sky(p: Planet): SkyTerrain {
  return (p.extras.skyTerrain ??= new SkyTerrain(p)) as SkyTerrain;
}

/** The arrival pool where the stream from the Spring Peaks lands: radius, metres. */
export const POOL_R = 3.6;

/**
 * An island's top in its own frame (metres above its lip level `top`): a soft dome with low swells and knolls,
 * and on the river islands the river's channel and banks, level with the water, dropping down the cascade at the
 * downstream end, with the arrival pool on Landing Isle.
 */
function topRelief(T: SkyTerrain, isle: Isle, x: number, z: number): number {
  const p = T.p, def = isle.def, n = p.noise;
  const r = Math.hypot(x, z);
  const s = Math.min(1, r / Math.max(1, def.r * 1.1));
  const d = isle.dirAt(x, z, _v);
  const relief = def.relief ?? 0.6;
  let h = relief * (0.55 * (1 - s * s) + 0.6 * n.fbm(d.x * 9 + def.seed, d.y * 9, d.z * 9, 2) * (0.6 + 0.4 * (1 - s * s)));
  for (const k of isle.knolls) {
    const dk = Math.hypot(x - k.x, z - k.z);
    h += k.h * smoothstep(k.r, k.r * 0.25, dk);
  }
  if (def.islet) h = relief * 0.3 * (1 - s * s);
  if (!def.river) return h;
  const rn = p.riverNearest(d);
  const cfg = p.cfg, top = def.top;
  const bed = p.bedAt(rn.t) - top, water = bed + cfg.waterDepth;
  const dist = rn.dist;
  const w = cfg.riverWidth * 1.15 * (rn.t < 0.03 ? rn.t / 0.03 : 1) + 0.6;
  // level beside the water, the meadow's swells only further out (and the banks drop with the cascade)
  const near = water + 0.6;
  const far = smoothstep(w + cfg.bankWidth + 1, w + cfg.bankWidth + 13, dist);
  h = lerp(near, Math.max(h, near * (1 - far)), far);
  const bank = smoothstep(w + cfg.bankWidth + 4, w + 0.4, dist);
  if (bank > 0) h = Math.max(h, lerp(h, water + 0.45, bank));
  const k = smoothstep(w + cfg.bankWidth, w * 0.6, dist);
  if (k > 0) h = lerp(h, bed, k);
  // the pool the stream from the Spring Peaks falls into
  if (def.id === 'landing') {
    const dp = Math.acos(clamp(d.dot(p.path[0]), -1, 1)) * p.R;
    const pk = smoothstep(POOL_R + 1.6, POOL_R - 0.6, dp);
    if (pk > 0) h = lerp(h, p.bedAt(0) - top - 0.05, pk);
  }
  return h;
}

/** The soft cloud floor between the islands: walkable (the soft fall lands here), never seen (the sea covers it). */
export function cloudFloor(p: Planet, d: THREE.Vector3) {
  return CLOUD_H + 0.35 * p.noise.n3(d.x * 6, d.y * 6, d.z * 6);
}

/** Over an aqueduct: the stone channel (bed level) and its parapets, or null when not on one. */
function aqueductAt(p: Planet, d: THREE.Vector3, rn = p.riverNearest(d)): number | null {
  if (rn.dist > AQ_DECK || rn.t < 0.01 || rn.t > 0.995) return null;
  const bed = p.bedAt(rn.t);
  if (rn.dist < AQ_CHANNEL) return bed;
  return bed + p.cfg.waterDepth + 0.45;
}

/** planet.height() in the Sky Isles. */
export function skyHeight(p: Planet, d: THREE.Vector3): number {
  const T = sky(p);
  for (const isle of T.isles) {
    const h = isle.heightAt(d);
    if (h !== null) return h;
  }
  const aq = aqueductAt(p, d);
  if (aq !== null) return aq;
  return cloudFloor(p, d);
}

/** The island under a direction (null between islands). */
export function isleAt(p: Planet, d: THREE.Vector3): Isle | null {
  for (const isle of sky(p).isles) if (isle.heightAt(d) !== null) return isle;
  return null;
}

/** On an island's top, at least `inset` metres in from its lip. */
export function onIsle(p: Planet, d: THREE.Vector3, inset = 0): boolean {
  for (const isle of sky(p).isles) {
    if (d.dot(isle.up) < isle.cosOuter) continue;
    const { x, z } = isle.toLocal(d);
    if (isle.inset(x, z) >= inset) return true;
  }
  return false;
}

/** On an aqueduct's deck. */
export function onAqueduct(p: Planet, d: THREE.Vector3): boolean {
  return !isleAt(p, d) && aqueductAt(p, d) !== null;
}

/** Ground you can walk on (an island top or an aqueduct), as opposed to the cloud floor far below. */
export function skyWalkable(p: Planet, d: THREE.Vector3): boolean {
  return onIsle(p, d) || aqueductAt(p, d) !== null;
}

/**
 * The ground under a body at distance r from the planet's centre, for movement: an island top or aqueduct only
 * when the body is at (or just under) that level, else the cloud floor below. A glider under an island is never
 * snapped up onto its top. Returns a radius, like surfaceRadius().
 */
export function groundBelow(p: Planet, d: THREE.Vector3, r: number): number {
  const h = skyHeight(p, d);
  if (r >= p.R + h - 1.0) return p.R + h;
  return p.R + cloudFloor(p, d);
}

/** Why a spot is no good for a person in the Sky Isles (not on an island, or too near its edge), or null. */
export function skySpotProblem(p: Planet, d: THREE.Vector3): string | null {
  if (!onIsle(p, d, 1.6)) return onIsle(p, d) ? 'edge' : 'air';
  return null;
}

const C = (s: string) => new THREE.Color(s);
const MEADOW = [C('#9fd47a'), C('#b2dc80'), C('#8ec86e'), C('#c2e48e')];
const CLOUD_W = C('#f8f6fb'), CLOUD_S = C('#d4daf2'), STONE = C('#e8d8b8'), BANK = C('#d9d2a8');

/**
 * recolor() in the Sky Isles: the hidden terrain's colours (the map reads them), and where the grass grows: on
 * the island tops only, never within a metre and a half of a lip (so no blade ever hangs in the air).
 */
export function skyRecolor(p: Planet) {
  const geo = p.terrain.geometry as THREE.BufferGeometry;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const col = geo.attributes.color as THREE.BufferAttribute;
  if (!p.grassW) p.grassW = new Float32Array(pos.count);
  if (!p.grassCol) p.grassCol = new Float32Array(pos.count * 3);
  const gw = p.grassW, gc = p.grassCol;
  const d = new THREE.Vector3(), nv = new THREE.Vector3(), c = new THREE.Color();
  const T = sky(p);
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    nv.fromBufferAttribute(nor, i);
    const flat = clamp(nv.dot(d));
    let w = 0;
    let isle: Isle | null = null, ins = -1;
    for (const is of T.isles) {
      if (d.dot(is.up) < is.cosOuter) continue;
      const q = is.toLocal(d);
      const k = is.inset(q.x, q.z);
      if (k >= 0) { isle = is; ins = k; break; }
    }
    if (isle) {
      const j = p.noise.n3(d.x * 23, d.y * 23, d.z * 23) * 0.5 + 0.5, big = p.noise.n3(d.x * 7 + 3, d.y * 7, d.z * 7) * 0.5 + 0.5;
      c.copy(MEADOW[0]).lerp(MEADOW[1], big).lerp(MEADOW[2], j * 0.4).lerp(MEADOW[3], smoothstep(0.6, 0.9, big) * 0.5);
      const rn = isle.def.river ? p.riverNearest(d) : null;
      if (rn) c.lerp(BANK, smoothstep(p.cfg.riverWidth + p.cfg.bankWidth + 1.5, p.cfg.riverWidth, rn.dist) * 0.55);
      w = smoothstep(1.5, 2.6, ins) * smoothstep(0.8, 0.93, flat);
      if (rn) w *= smoothstep(p.cfg.riverWidth + 1.2, p.cfg.riverWidth + p.cfg.bankWidth + 0.5, rn.dist);
      if (isle.def.islet) w *= 0.5;
    } else if (aqueductAt(p, d) !== null) {
      c.copy(STONE);
    } else {
      c.copy(CLOUD_W).lerp(CLOUD_S, p.noise.n3(d.x * 9, d.y * 9, d.z * 9) * 0.5 + 0.3);
    }
    for (const cl of p.clearings) { const a = d.angleTo(cl.dir) * p.R; if (a < cl.r + 1.5) w *= smoothstep(cl.r, cl.r + 1.5, a); }
    gc[i * 3] = c.r; gc[i * 3 + 1] = c.g; gc[i * 3 + 2] = c.b;
    col.setXYZ(i, c.r, c.g, c.b);
    gw[i] = w;
  }
  col.needsUpdate = true;
}

/** Flower density for the island grass (Grass flowerW): drifts on the tops, thickest toward the lips. */
export function skyFlowers(p: Planet, d: THREE.Vector3): number {
  const n = p.noise.n3(d.x * 11 + 5, d.y * 11, d.z * 11);
  return smoothstep(0.1, 0.5, n) * 0.9 + 0.12;
}

/**
 * Inside an island's rock (below its meadow, above its underside), for a planet-local point: the island and the
 * point in its frame, or null. The underside is taken as a bowl from the lip's cliff down to the tip.
 */
export function inIsleRock(p: Planet, pl: THREE.Vector3, pad = 0.3): { isle: Isle; x: number; y: number; z: number; rim: number; bottom: number } | null {
  const r = pl.length();
  if (r < p.R + 1) return null;
  _v.copy(pl).divideScalar(r);
  for (const isle of sky(p).isles) {
    if (_v.dot(isle.up) < isle.cosOuter) continue;
    const q = isle.toLocal(_v);
    const a = Math.atan2(q.z, q.x), rim = isle.shape.outline(a), rho = Math.hypot(q.x, q.z);
    if (rho > rim + pad) continue;
    const y = r - isle.Rt;
    const k = Math.min(1, rho / Math.max(1, rim));
    const bottom = -(isle.def.cliff * 0.8 + isle.def.under * (1 - k * k));
    if (y < bottom - pad) continue;
    const top = rho <= rim ? isle.shape.height(q.x, q.z) : isle.shape.edgeY(a);
    if (y > top - 0.9) continue;
    return { isle, x: q.x, y, z: q.z, rim, bottom };
  }
  return null;
}

/**
 * Keep a body (planet-local position `pl`, velocity `vel`) out of the islands' rock: beside a cliff it is pushed
 * out past the lip, under the underside's middle it is pushed down. Returns true when it moved anything.
 */
export function pushOutOfIsles(p: Planet, pl: THREE.Vector3, vel: THREE.Vector3 | null, radius = 0.4): boolean {
  const hit = inIsleRock(p, pl, radius);
  if (!hit) return false;
  const { isle, x, z, y, rim, bottom } = hit;
  const rho = Math.max(1e-3, Math.hypot(x, z));
  const r = pl.length();
  const side = rim + radius - rho, under = y - (bottom - radius);
  if (under < side && under < 3) {
    // under the island: down and out of the rock
    _h.copy(pl).normalize();
    pl.addScaledVector(_h, -under);
    if (vel) { const vu = vel.dot(_h); if (vu > 0) vel.addScaledVector(_h, -vu); }
    return true;
  }
  const k = (rim + radius) / rho;
  isle.dirAt(x * k, z * k, _h).multiplyScalar(r);
  const out = _h.clone().sub(pl);
  pl.copy(_h);
  if (vel && out.lengthSq() > 1e-8) { out.normalize(); const vo = vel.dot(out); if (vo < 0) vel.addScaledVector(out, -vo); }
  return true;
}

/** For the camera: the clear fraction of the segment from look to pos before it enters an island's rock. */
export function rockClear(p: Planet, look: THREE.Vector3, pos: THREE.Vector3): number {
  const a = new THREE.Vector3(), N = 12;
  for (let i = 1; i <= N; i++) {
    const k = i / N;
    a.lerpVectors(look, pos, k).sub(p.center);
    if (inIsleRock(p, a, 0.5)) return (i - 1) / N;
  }
  return 1;
}
