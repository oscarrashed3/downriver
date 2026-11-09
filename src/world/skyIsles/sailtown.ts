import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  Kit, T, rng, pick, type Rnd, uvMetres, boxM, archShape, archRing, archTop, ropeGeo, sagLine, clothGrid, wobble, tint, townMat,
  patAttr, type ClothPattern, CELL, WALL_TILE, STONE_TILE, WOOD_TILE, LINEN_TILE,
} from './sailtownKit';
import { Cards, headCard, plantGeo, PETALS, type FlowerKind } from './sailtownFlora';
import { addLeafMass, addHydrangeaBush, addRoses, addIvy, climbPath, HYDRANGEA, type WallPoint } from './sailtownGreen';

/**
 * Sailtown, the windfolk village (World 2, Sky Isles): round cream stone cottages under blue scalloped slate,
 * windmills whose lattice sails turn, wind chimes at the doors, laundry and bunting in the wind, the market stall,
 * the arched footbridge, fences, low stone walls, flagstone lanes, planters, and the golden race gate of the
 * kite-wing race.
 *
 * Every builder returns a THREE.Group with its static parts merged into one mesh per material (a cottage is about
 * a dozen draw calls with its ink). Anything that moves sets userData.update(dt, t); cloth (sheets, flags, pennants,
 * awning, streamers) moves in the vertex shader and costs nothing per frame. Put everything in a TownAnimator:
 *
 *   const town = new TownAnimator();
 *   scene.add(town.add(roundCottage({ seed: 3 })));
 *   ...each frame: town.update(dt, t);   when Nilo passes a door: town.ringNear(niloPos, 1.5);
 *
 * Meadow, flower beds and trees live in sailtownFlora / sailtownGreen (re-exported at the bottom).
 */

// ---------------------------------------------------------------- palette

export const SAIL = {
  wall: '#f6e9cf', wallWarm: '#f3dfbc', stone: '#ecdcbc', stoneDark: '#c8b08a',
  slate: ['#4e6a94', '#47618a', '#5a759c', '#425a82', '#617ba3', '#536d96', '#3c5480'],
  timber: '#7a5434', timberDark: '#5a3c26', weathered: '#9a7a58', plank: '#a87a4e',
  door: ['#8a5a34', '#7a4e2e', '#94643a'], shutters: ['#c8794a', '#b8693c', '#5d84b4', '#7fa36a'],
  iron: '#3a3238', brass: '#e4b350', silver: '#d8dde4', glass: '#4a6886',
  festival: ['#e0473b', '#f2c53d', '#3f78c8', '#f08a32', '#f6efe2', '#6aae5a'],
  roses: ['#f592b4', '#f7b0c6', '#ee7aa2', '#fff4f6', '#f46a86'],
  box: ['#e8475e', '#f07aa0', '#ffffff', '#f2c53d', '#b48ae0'],
  green: ['#5c8c3e', '#4f7f38', '#6b9a46', '#46733a'],
  /** Flagstones: warm sand and ochre, a step darker than the walls. */
  flag: ['#e3d8c2', '#d9ccb4', '#e8dfcb', '#d0c2a8', '#ddd1ba', '#d5c6ac', '#cbbca2', '#e0d3b6'],
  terracotta: '#c8693f',
};

/**
 * Sailtown's light, after picture 2's hazy afternoon: a warm key, cooler but light shadows (never purple), a warm
 * ground bounce, and a pale warm haze that fades the depth toward the horizon. The world's sky and daylight own the
 * real values; this is the look the props were tuned under (the lab applies it).
 */
export const SAILTOWN_LIGHT = {
  day: {
    sun: '#fff0d0', sunIntensity: 3.05, sunDir: [0.42, 0.74, 0.44] as [number, number, number],
    ambSky: '#a8c6f2', ambSkyK: 0.74, ambGround: '#c8b084', ambGroundK: 0.4, rim: '#ffe8bc',
    fog: '#a6c6ec', fogDensity: 0.0026, skyTop: '#3d84dc', skyHorizon: '#cfe6f8',
  },
  golden: {
    sun: '#ffc68a', sunIntensity: 2.5, sunDir: [0.75, 0.2, -0.62] as [number, number, number],
    ambSky: '#c6b4b0', ambSkyK: 0.62, ambGround: '#b89474', ambGroundK: 0.44, rim: '#ffcf90',
    fog: '#f0d8b6', fogDensity: 0.0042, skyTop: '#76a0dc', skyHorizon: '#ffdcac',
  },
};

// ---------------------------------------------------------------- animation

export type Updater = (dt: number, t: number) => void;

/**
 * Runs every animated part of the town with one call. add(obj) finds every descendant with userData.update
 * (windmill rotors, chimes, weather vanes) and every chime (userData.chime) so ringNear() can ring them.
 */
export class TownAnimator {
  private items: { obj: THREE.Object3D; f: Updater }[] = [];
  readonly chimes: Chime[] = [];
  /** Skip parts further than this from `focus` (set focus each frame from the camera); 0 = never skip. */
  cullDistance = 0;
  focus = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  add<T extends THREE.Object3D>(obj: T): T {
    obj.traverse(o => {
      if (typeof o.userData.update === 'function') this.items.push({ obj: o, f: o.userData.update });
      if (o.userData.chime instanceof Chime) this.chimes.push(o.userData.chime);
    });
    return obj;
  }
  remove(obj: THREE.Object3D) {
    const set = new Set<THREE.Object3D>(); obj.traverse(o => set.add(o));
    this.items = this.items.filter(i => !set.has(i.obj));
    for (let i = this.chimes.length - 1; i >= 0; i--) if (set.has(this.chimes[i].root)) this.chimes.splice(i, 1);
  }
  update(dt: number, t: number) {
    const cull = this.cullDistance * this.cullDistance;
    for (const it of this.items) {
      if (cull > 0 && it.obj.getWorldPosition(this.tmp).distanceToSquared(this.focus) > cull) continue;
      it.f(dt, t);
    }
  }
  /** Ring every chime within `radius` of a world point (Nilo brushing past a door, a racer through a gate). */
  ringNear(p: THREE.Vector3, radius = 1.5, strength = 1) {
    let n = 0;
    for (const c of this.chimes) if (c.root.getWorldPosition(this.tmp).distanceTo(p) < radius) { c.ring(strength); n++; }
    return n;
  }
}

// ---------------------------------------------------------------- small geometry helpers

/**
 * A surface of revolution from a profile [radius, height][], with analytic normals (outward when `out`) and UVs in
 * metres (U around, rounded to whole texture tiles so the seam never shows).
 */
function lathe(profile: [number, number][], segs: number, tile: number, out = true, a0 = 0, a1 = Math.PI * 2, cut?: (a: number, y: number) => boolean) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const maxR = Math.max(...profile.map(p => p[0]));
  const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
  const uTiles = full ? Math.max(1, Math.round(maxR * (a1 - a0) / tile)) : maxR * (a1 - a0) / tile;
  let vAcc = 0;
  for (let j = 0; j < profile.length; j++) {
    const [r, y] = profile[j];
    const pr = profile[Math.max(0, j - 1)], nx = profile[Math.min(profile.length - 1, j + 1)];
    const dr = nx[0] - pr[0], dy = nx[1] - pr[1];
    let n2r = dy, n2y = -dr; const l = Math.hypot(n2r, n2y) || 1; n2r /= l; n2y /= l;
    if (!out) { n2r = -n2r; n2y = -n2y; }
    if (j > 0) vAcc += Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]);
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (i / segs) * (a1 - a0), s = Math.sin(a), c = Math.cos(a);
      pos.push(s * r, y, c * r); nor.push(s * n2r, n2y, c * n2r);
      uv.push((i / segs) * uTiles, vAcc / tile);
    }
  }
  const W = segs + 1;
  for (let j = 0; j < profile.length - 1; j++) for (let i = 0; i < segs; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    if (cut && cut(a0 + ((i + 0.5) / segs) * (a1 - a0), (profile[j][1] + profile[j + 1][1]) / 2)) continue;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return orient(g);
}

/** Flip any triangle whose winding disagrees with its vertex normals, so custom geometry is never inside out. */
function orient(g: THREE.BufferGeometry) {
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute, idx = g.index!;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3(), t = new THREE.Vector3();
  for (let i = 0; i < idx.count; i += 3) {
    const i0 = idx.getX(i), i1 = idx.getX(i + 1), i2 = idx.getX(i + 2);
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    t.subVectors(b, a).cross(c.sub(a));
    nn.fromBufferAttribute(n, i0).add(c.fromBufferAttribute(n, i1)).add(c.fromBufferAttribute(n, i2));
    if (t.dot(nn) < 0) { idx.setX(i + 1, i2); idx.setX(i + 2, i1); }
  }
  return g;
}

/** A cylinder with UVs in metres, for posts and poles (grain runs along the length). */
function postGeo(rTop: number, rBot: number, h: number, segs = 7) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs, 1);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * h / WOOD_TILE, uv.getX(i) * Math.PI * 2 * rBot / WOOD_TILE);
  return g;
}

/** A wooden barrel: bulging staves and two dark iron hoops. Returns parts added to the kit at m. */
export function addBarrel(kit: Kit, m: THREE.Matrix4, r: Rnd, h = 0.85, rad = 0.3) {
  const prof: [number, number][] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push([rad * (0.84 + 0.16 * Math.sin(t * Math.PI)), t * h]); }
  kit.with(m, () => {
    kit.add(lathe(prof, 14, WOOD_TILE), 'wood', new THREE.Color(SAIL.plank).multiplyScalar(0.9 + r() * 0.2));
    kit.add(new THREE.CircleGeometry(rad * 0.82, 14).rotateX(-Math.PI / 2).translate(0, h - 0.02, 0), 'wood', '#8a6240');
    for (const y of [0.15, 0.85]) {
      const rr = rad * (0.84 + 0.16 * Math.sin(y * Math.PI)) + 0.012;
      kit.add(new THREE.CylinderGeometry(rr, rr, 0.05, 14, 1, true), 'plain', SAIL.iron, T(0, y * h, 0));
    }
  });
}

/** A slatted wooden crate (open top), optionally heaped with round produce of one colour. */
export function addCrate(kit: Kit, m: THREE.Matrix4, r: Rnd, w = 0.6, d = 0.42, h = 0.32, fill?: string, fruitR = 0.055) {
  kit.with(m, () => {
    const wood = new THREE.Color(SAIL.plank).lerp(new THREE.Color('#d8b585'), r() * 0.5);
    kit.add(boxM(w, 0.02, d, WOOD_TILE), 'wood', wood.clone().multiplyScalar(0.7), T(0, 0.02, 0));
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      kit.add(boxM(w, h * 0.26, 0.02, WOOD_TILE), 'wood', wood, T(0, h * (0.16 + k * 0.33), s * (d / 2 - 0.01)));
      kit.add(boxM(0.02, h * 0.26, d, WOOD_TILE), 'wood', wood, T(s * (w / 2 - 0.01), h * (0.16 + k * 0.33), 0));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.add(boxM(0.04, h, 0.04, WOOD_TILE, true), 'wood', wood.clone().multiplyScalar(0.8), T(sx * (w / 2 - 0.02), h / 2, sz * (d / 2 - 0.02)));
    if (fill) {
      const base = new THREE.Color(fill);
      const nx = Math.floor(w / (fruitR * 2)), nz = Math.floor(d / (fruitR * 2));
      for (let layer = 0; layer < 2; layer++) for (let i = 0; i < nx - layer; i++) for (let j = 0; j < nz - layer; j++) {
        const x = -w / 2 + fruitR * (1.1 + layer) + i * fruitR * 2, z = -d / 2 + fruitR * (1.1 + layer) + j * fruitR * 2;
        const y = h - fruitR * 0.6 + layer * fruitR * 1.3 + Math.sin(i * 1.3 + j) * 0.01;
        kit.add(new THREE.SphereGeometry(fruitR * (0.9 + r() * 0.2), 7, 5), 'bloom', base.clone().multiplyScalar(0.85 + r() * 0.3), T(x, y, z));
      }
    }
  });
}

/** A woven basket: a flared bowl with a darker rim and handle. */
export function addBasket(kit: Kit, m: THREE.Matrix4, r: Rnd, rad = 0.2, fill?: string) {
  kit.with(m, () => {
    const c = new THREE.Color('#c99a5a').multiplyScalar(0.9 + r() * 0.2);
    kit.add(lathe([[rad * 0.7, 0], [rad * 0.9, rad * 0.4], [rad, rad * 0.75]], 14, 0.3), 'wood', c);
    kit.add(new THREE.TorusGeometry(rad, 0.018, 4, 16).rotateX(Math.PI / 2), 'plain', c.clone().multiplyScalar(0.7), T(0, rad * 0.75, 0));
    kit.add(new THREE.TorusGeometry(rad * 0.85, 0.014, 4, 12, Math.PI), 'plain', c.clone().multiplyScalar(0.7), T(0, rad * 0.75, 0));
    if (fill) for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2, d = r() * rad * 0.5;
      kit.add(new THREE.SphereGeometry(rad * 0.28, 7, 5), 'bloom', new THREE.Color(fill).multiplyScalar(0.85 + r() * 0.3), T(Math.cos(a) * d, rad * 0.72, Math.sin(a) * d, 0, 0, 0, 1, 0.8, 1));
    }
  });
}

/**
 * A flower box or wall-foot planting: leafy mounds with blossom cards in one palette, and trailing strands that
 * spill over the front edge. Built in its own frame (+Z out, y = 0 at the soil).
 */
function addBloomMound(kit: Kit, m: THREE.Matrix4, r: Rnd, w: number, d: number, h: number, palette: readonly string[], blooms = 10, trailing = 0) {
  kit.with(m, () => {
    const nC = Math.max(1, Math.round(w / 0.26));
    for (let i = 0; i < nC; i++) {
      const x = -w / 2 + (i + 0.5) * (w / nC);
      addLeafMass(kit, T(x + (r() - 0.5) * 0.05, h * 0.55, (r() - 0.5) * d * 0.2, 0, r() * 6, 0), r, { radius: Math.min(0.2, h * 1.1), squash: 0.7, flat: Math.min(1, d / 0.36), color: pick(r, SAIL.green), size: 0.12, ao: 0.45 });
    }
    const cs = new Cards();
    const cells = [CELL.cosmos, CELL.buttercup, CELL.rose, CELL.daisy];
    for (let i = 0; i < blooms; i++) {
      const c = new THREE.Color(pick(r, palette)).multiplyScalar(0.92 + r() * 0.12);
      const x = -w / 2 + r() * w, z = (r() - 0.25) * d * 0.7;
      headCard(cs, new THREE.Vector3(x, h * (0.85 + r() * 0.6), z), 0.06 + r() * 0.04, pick(r, cells), c, 1, 0.5 + r() * 0.5, Math.PI / 2 + (r() - 0.5) * 1.6, r() * 6);
    }
    // a cascade of small leaves and flowers over the front
    const trail: WallPoint[] = [];
    for (let i = 0; i < trailing; i++) {
      const x = -w / 2 + r() * w;
      for (let k = 0; k < 3; k++) trail.push({ p: new THREE.Vector3(x + (r() - 0.5) * 0.05, -0.02 - k * 0.11, d * 0.52), n: new THREE.Vector3(0, 0.1, 1).normalize(), s: 0.55 - k * 0.1 });
    }
    if (trail.length) addIvy(kit, trail, r, { colors: ['#4f7f38', '#5c8c3e', '#6b9a46'], perPoint: 3 });
    for (let i = 0; i < trailing * 2; i++) {
      const c = new THREE.Color(pick(r, palette));
      headCard(cs, new THREE.Vector3(-w / 2 + r() * w, -0.05 - r() * 0.2, d * 0.56), 0.045 + r() * 0.02, CELL.alyssum, c, 1, 1.3, Math.PI / 2, r() * 6);
    }
    kit.add(cs.build(), 'flora', null);
  });
}

/** A plant prototype with its tint baked into the vertex colours (for merging into a prop instead of instancing). */
function bakedPlant(kind: Parameters<typeof plantGeo>[0], color: THREE.Color) {
  const g = plantGeo(kind).clone();
  const c = g.attributes.color as THREE.BufferAttribute, t = g.attributes.aTint as THREE.BufferAttribute;
  for (let i = 0; i < c.count; i++) if (t.getX(i) > 0.5) c.setXYZ(i, c.getX(i) * color.r, c.getY(i) * color.g, c.getZ(i) * color.b);
  return g;
}

// ---------------------------------------------------------------- slate roof

interface ConeRoof {
  eaveR: number; y0: number; height: number; seed: number; base?: readonly string[]; tileW?: number; courseH?: number;
  /** 'cone': a straight cone with a soft bell kick at the eaves. 'onion': the bulging windmill cap. */
  shape?: 'cone' | 'onion';
  /** How much the eaves kick out (0 = straight cone). */
  kick?: number;
  /** The soffit's colour (the underside of the eaves). */
  soffit?: string;
}

/** An onion-cap profile r/eaveR against s: bulging out above the curb, then drawing in to a point. */
const ONION: [number, number][] = [[0, 1], [0.16, 1.13], [0.34, 1.08], [0.52, 0.86], [0.7, 0.55], [0.86, 0.26], [1, 0.03]];
function onionR(s: number) {
  const k = Math.min(ONION.length - 2, Math.floor(s * (ONION.length - 1)));
  const [s0, r0] = ONION[k], [s1, r1] = ONION[k + 1];
  const p = ONION[Math.max(0, k - 1)][1], q = ONION[Math.min(ONION.length - 1, k + 2)][1];
  const t = Math.min(1, Math.max(0, (s - s0) / (s1 - s0)));
  // Catmull-Rom between the profile points
  return 0.5 * ((2 * r0) + (-p + r1) * t + (2 * p - 5 * r0 + 4 * r1 - q) * t * t + (-p + 3 * r0 - 3 * r1 + q) * t * t * t);
}

/**
 * A roof of layered scalloped slates: courses of small round-bottomed tiles, each its own shade of blue (with a few
 * lichened and a few paler ones), the lower edge lifted with a thickness so every course casts a little step.
 * Under it, a planked soffit. Returns the apex height and the profile, so chimneys and finials can sit on it.
 */
function slateCone(kit: Kit, o: ConeRoof) {
  const r = rng(o.seed);
  const pal = (o.base ?? SAIL.slate).map(c => new THREE.Color(c));
  const onion = o.shape === 'onion', kick = o.kick ?? 0.5;
  // profile in s (0 at the eave, 1 at the tip); defined past the eave too (s < 0), where the bottom scallops hang
  const rad = (s: number) => onion ? o.eaveR * onionR(Math.max(0, s)) + (s < 0 ? -s * o.eaveR : 0) : o.eaveR * (1 - s);
  const yy = (s: number) => o.y0 + o.height * (onion ? s : s - kick * s * Math.pow(Math.max(0, 1 - s), 4));
  const eps = 1e-3;
  const dr = (s: number) => (rad(s + eps) - rad(s - eps)) / (2 * eps), dy = (s: number) => (yy(s + eps) - yy(s - eps)) / (2 * eps);
  const speed = (s: number) => Math.hypot(dr(s), dy(s));
  let slant = 0; for (let i = 0; i < 40; i++) slant += speed((i + 0.5) / 40) / 40;
  const sMax = 0.9, courseH = o.courseH ?? 0.19, tileW = o.tileW ?? 0.22;
  const nC = Math.max(3, Math.round(slant * sMax / courseH));
  const ds = sMax / nC;
  const thick = 0.035, scallop = 0.055;
  const pos: number[] = [], nor: number[] = [], cl: number[] = [], idx: number[] = [];
  const N = new THREE.Vector3(), D = new THREE.Vector3();
  const normalAt = (th: number, s: number, out: THREE.Vector3) => out.set(Math.sin(th) * dy(s), -dr(s), Math.cos(th) * dy(s)).normalize();
  const pointAt = (th: number, s: number, lift: number, out: THREE.Vector3) => {
    normalAt(th, s, N);
    return out.set(Math.sin(th) * rad(s), yy(s), Math.cos(th) * rad(s)).addScaledVector(N, lift);
  };
  const lichen = new THREE.Color('#a3aa72'), pale = new THREE.Color('#9fb3cf'), moss = new THREE.Color('#7f9a5a');
  const K = 3;
  for (let i = 0; i < nC; i++) {
    const sB = i * ds, sT = Math.min(sMax + 0.03, (i + 1) * ds + ds * 0.55);
    const rMid = rad(sB + ds * 0.5);
    const nT = Math.max(6, Math.round((Math.PI * 2 * rMid) / tileW));
    const off = (i % 2) * 0.5 + r() * 0.1;
    const gap = 0.01 / Math.max(0.2, rMid);
    const sp = speed(sB);
    for (let j = 0; j < nT; j++) {
      const th0 = ((j + off) / nT) * Math.PI * 2 + gap, th1 = ((j + 1 + off) / nT) * Math.PI * 2 - gap;
      // each slate its own shade, close in value; a rare paler or lichened one, low in contrast, so the roof never checkers
      const c = pal[Math.floor(r() * pal.length)].clone().multiplyScalar(0.93 + r() * 0.1);
      const roll = r();
      if (roll < 0.02) c.lerp(lichen, 0.22);
      else if (roll < 0.045) c.lerp(pale, 0.16);
      else if (roll < 0.06 && i < 3) c.lerp(moss, 0.18);
      // the eave course darker and heavier, like the pictures' deep blue eave line
      if (i === 0) c.multiplyScalar(0.78);
      const lipC = c.clone().multiplyScalar(0.55);
      const liftJ = r() * 0.01, dropJ = (r() - 0.5) * 0.016;
      const tilt = (r() - 0.5) * 0.24;
      const base = pos.length / 3;
      for (let k = 0; k <= K; k++) {
        const f = k / K, th = th0 + (th1 - th0) * f;
        const drop = (scallop * Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2)) + dropJ) / sp;
        const top = pointAt(th, sT, 0.004, new THREE.Vector3());
        const bot = pointAt(th, sB - drop, thick + liftJ, new THREE.Vector3());
        normalAt(th, sB, N);
        const lip = bot.clone().addScaledVector(N, -thick * 1.1);
        normalAt(th, (sB + sT) / 2, N);
        N.x += Math.cos(th) * tilt; N.z -= Math.sin(th) * tilt; N.normalize();
        D.set(-Math.sin(th) * dr(sB), -dy(sB), -Math.cos(th) * dr(sB)).normalize();
        pos.push(top.x, top.y, top.z, bot.x, bot.y, bot.z, lip.x, lip.y, lip.z);
        nor.push(N.x, N.y, N.z, N.x, N.y, N.z, D.x, D.y, D.z);
        cl.push(c.r * 0.86, c.g * 0.86, c.b * 0.88, c.r, c.g, c.b, lipC.r, lipC.g, lipC.b);
      }
      for (let k = 0; k < K; k++) {
        const a = base + k * 3, b = base + (k + 1) * 3;
        idx.push(a, a + 1, b + 1, a, b + 1, b);
        idx.push(a + 1, a + 2, b + 2, a + 1, b + 2, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.setIndex(idx);
  kit.add(orient(g), 'slate', null);
  // a smooth cap where the courses meet, and the soffit underneath
  const capProf: [number, number][] = [];
  for (let i = 0; i <= 4; i++) { const s = sMax - 0.04 + (1 - sMax + 0.04) * (i / 4); capProf.push([rad(s) + 0.03 * (1 - i / 4) + 0.01, yy(s) + 0.03]); }
  kit.add(lathe(capProf, 16, 1), 'slate', new THREE.Color(pal[3]).multiplyScalar(0.85));
  const soff: [number, number][] = [];
  for (let i = 0; i <= 8; i++) { const s = (i / 8) * 0.95; soff.push([rad(s), yy(s) - 0.03]); }
  kit.add(lathe(soff, 40, WOOD_TILE, false), 'wood', o.soffit ?? '#c4a47e');
  return { apex: yy(1), rad, yy, slant, nC, normalAt };
}

// ---------------------------------------------------------------- windows and doors

interface WinOpts { w: number; h: number; shutter: string; box?: readonly string[] | null; arched?: boolean; frame?: string }

/**
 * A shuttered window built in its own frame (local +Z out of the wall, y = 0 at the sill): glass with a sky sheen,
 * a timber frame and cross, a stone lintel and sill, two board shutters folded back, and a flower box spilling over.
 */
function addWindow(kit: Kit, m: THREE.Matrix4, r: Rnd, o: WinOpts) {
  const { w, h } = o;
  const frame = new THREE.Color(o.frame ?? SAIL.timber);
  kit.with(m, () => {
    // glass, set back in a dark reveal
    kit.add(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.2), 'plain', '#4a3a34', T(0, h / 2, -0.08));
    if (o.arched) {
      const sh = archShape(w, h, 8);
      kit.add(new THREE.ShapeGeometry(sh), 'glass', SAIL.glass, T(0, 0, 0.025));
    } else kit.add(new THREE.PlaneGeometry(w, h), 'glass', SAIL.glass, T(0, h / 2, 0.025));
    // frame and cross
    const fw = 0.065;
    if (o.arched) {
      kit.add(new THREE.ExtrudeGeometry(archRing(w + fw * 2, h + fw, w, h, 10), { depth: 0.08, bevelEnabled: false }), 'wood', frame, T(0, 0, 0.0));
      kit.add(boxM(w + fw * 2, fw, 0.09, WOOD_TILE), 'wood', frame, T(0, -fw / 2, 0.03));
      kit.add(boxM(0.035, h - 0.04, 0.05, WOOD_TILE, true), 'wood', frame, T(0, h / 2, 0.05));
      kit.add(boxM(w, 0.035, 0.05, WOOD_TILE), 'wood', frame, T(0, h * 0.5, 0.05));
    } else {
      for (const [x, y, bw, bh] of [[0, h + fw / 2, w + fw * 2, fw], [0, -fw / 2, w + fw * 2, fw], [-(w + fw) / 2, h / 2, fw, h], [(w + fw) / 2, h / 2, fw, h]] as const)
        kit.add(boxM(bw, bh, 0.09, WOOD_TILE, bh > bw), 'wood', frame, T(x, y, 0.03));
      kit.add(boxM(0.035, h, 0.05, WOOD_TILE, true), 'wood', frame, T(0, h / 2, 0.05));
      kit.add(boxM(w, 0.035, 0.05, WOOD_TILE), 'wood', frame, T(0, h * 0.55, 0.05));
      // a cream stone lintel
      kit.add(boxM(w + 0.34, 0.13, 0.12, STONE_TILE), 'stone', SAIL.stone, T(0, h + fw + 0.065, 0.02));
    }
    // sill
    kit.add(boxM(w + 0.26, 0.07, 0.2, STONE_TILE), 'stone', SAIL.stone, T(0, -fw - 0.035, 0.07));
    // shutters, folded back against the wall (the wall curves away, so they turn a little)
    const sw = w / 2 + 0.03, sc = new THREE.Color(o.shutter);
    for (const s of [-1, 1]) {
      const hx = s * (w / 2 + fw);
      kit.with(T(hx, 0, 0.03, 0, s * -0.32, 0), () => {
        const cx = s * sw / 2;
        const shH = o.arched ? h * 0.82 : h + fw;
        for (let b = 0; b < 3; b++) {
          const bw = sw / 3 - 0.008;
          kit.add(boxM(bw, shH, 0.035, WOOD_TILE, true), 'wood', sc.clone().multiplyScalar(0.92 + r() * 0.14), T(s * (b + 0.5) * (sw / 3), shH / 2, 0));
        }
        for (const y of [0.18, 0.82]) kit.add(boxM(sw * 0.94, 0.06, 0.03, WOOD_TILE), 'wood', sc.clone().multiplyScalar(0.8), T(cx, shH * y, 0.03));
        const diag = boxM(0.05, shH * 0.7, 0.03, WOOD_TILE, true);
        kit.add(diag, 'wood', sc.clone().multiplyScalar(0.8), T(cx, shH / 2, 0.03, 0, 0, s * Math.atan2(sw * 0.8, shH * 0.64)));
        for (const y of [0.18, 0.82]) kit.add(new THREE.BoxGeometry(0.1, 0.025, 0.02), 'plain', SAIL.iron, T(0, shH * y, 0.04));
      });
    }
    // flower box
    if (o.box) {
      const bw = w + 0.3, bd = 0.24, bh = 0.2;
      kit.with(T(0, -fw - 0.08 - bh / 2, 0.16), () => {
        kit.add(boxM(bw, bh, bd, WOOD_TILE), 'wood', SAIL.timber, T(0, 0, 0));
        kit.add(boxM(bw + 0.04, 0.04, bd + 0.04, WOOD_TILE), 'wood', SAIL.timberDark, T(0, bh / 2, 0));
        for (const s of [-1, 1]) kit.add(new THREE.BoxGeometry(0.025, 0.1, 0.12), 'plain', SAIL.iron, T(s * bw * 0.35, -bh / 2 - 0.03, -0.05, 0.6, 0, 0));
        addBloomMound(kit, T(0, bh / 2 - 0.02, 0), r, bw - 0.04, bd, 0.16, o.box!, Math.round(bw * 22), 3);
      });
    }
  });
}

/**
 * An arched plank door in a cream stone surround (local +Z out, y = 0 at the threshold): vertical boards, iron
 * straps, a ring handle, a little arched window, and two stone steps.
 */
function addDoor(kit: Kit, m: THREE.Matrix4, r: Rnd, o: { w: number; h: number; color: string; depthBack?: number }) {
  const { w, h } = o;
  const dc = new THREE.Color(o.color);
  kit.with(m, () => {
    // stone surround: voussoirs round the arch, quoins down the sides
    const sg = new THREE.ExtrudeGeometry(archRing(w + 0.36, h + 0.18, w, h, 14), { depth: 0.24, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 14 });
    uvMetres(sg, 1, 1, STONE_TILE);
    kit.add(sg, 'stone', SAIL.stone, T(0, 0, -0.08));
    // joints between the arch stones: thin dark wedges
    for (let i = 1; i < 7; i++) {
      const a = (i / 7) * Math.PI, rr = w / 2 + 0.09;
      kit.add(new THREE.BoxGeometry(0.02, 0.2, 0.02), 'plain', '#a8957a', T(Math.cos(a) * rr, h - w / 2 + Math.sin(a) * rr, 0.17, 0, 0, a - Math.PI / 2));
    }
    // dark reveal behind the leaf (so the curved wall never peeks through)
    kit.add(new THREE.ExtrudeGeometry(archShape(w + 0.02, h + 0.01, 14), { depth: 0.3, bevelEnabled: false }), 'plain', '#3a2a24', T(0, 0, -(o.depthBack ?? 0.36)));
    // the leaf: planks with grooves
    const leaf = new THREE.ExtrudeGeometry(archShape(w - 0.02, h - 0.01, 14), { depth: 0.06, bevelEnabled: false });
    uvMetres(leaf, 1, 1, WOOD_TILE);
    // grain vertical: swap uv
    const uv = leaf.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
    kit.add(leaf, 'wood', dc, T(0, 0, -0.02));
    const nPl = 5;
    for (let i = 1; i < nPl; i++) {
      const x = -w / 2 + (i / nPl) * w, top = archTop(w - 0.02, h - 0.01, x) - 0.03;
      kit.add(new THREE.BoxGeometry(0.012, top - 0.02, 0.01), 'plain', dc.clone().multiplyScalar(0.55), T(x, top / 2, 0.042));
    }
    for (let i = 0; i < nPl; i++) {  // a slight shade difference per board
      const x0 = -w / 2 + (i / nPl) * w, x1 = x0 + w / nPl, xm = (x0 + x1) / 2, top = archTop(w - 0.02, h - 0.01, xm) - 0.06;
      kit.add(new THREE.PlaneGeometry(w / nPl - 0.02, top - 0.05), 'wood', dc.clone().multiplyScalar(0.92 + r() * 0.16), T(xm, top / 2, 0.041));
    }
    // iron straps with nail heads
    for (const y of [0.32, h * 0.62]) {
      kit.add(new THREE.BoxGeometry(w * 0.86, 0.055, 0.015), 'plain', SAIL.iron, T(0, y, 0.05));
      for (let k = 0; k < 5; k++) kit.add(new THREE.SphereGeometry(0.012, 5, 3), 'bloom', '#55494c', T(-w * 0.38 + k * w * 0.19, y, 0.058));
    }
    // ring handle and plate
    kit.add(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 10).rotateX(Math.PI / 2), 'brass', SAIL.brass, T(w * 0.3, h * 0.45, 0.05));
    kit.add(new THREE.TorusGeometry(0.045, 0.009, 5, 12), 'brass', SAIL.brass, T(w * 0.3, h * 0.45 - 0.04, 0.065, 0.3, 0, 0));
    // little arched window in the door
    const ww = w * 0.32, wh = w * 0.38, wy = h * 0.66;
    kit.add(new THREE.ShapeGeometry(archShape(ww, wh, 8)), 'glass', SAIL.glass, T(0, wy, 0.046));
    kit.add(new THREE.ExtrudeGeometry(archRing(ww + 0.06, wh + 0.03, ww, wh, 8), { depth: 0.03, bevelEnabled: false }), 'wood', dc.clone().multiplyScalar(0.7), T(0, wy - 0.015, 0.04));
    kit.add(new THREE.BoxGeometry(0.02, wh, 0.02), 'wood', dc.clone().multiplyScalar(0.7), T(0, wy + wh / 2, 0.06));
    kit.add(new THREE.BoxGeometry(ww, 0.02, 0.02), 'wood', dc.clone().multiplyScalar(0.7), T(0, wy + wh * 0.45, 0.06));
    // the doorstep: one big worn stone, a rounded front with a carved bevel, its middle dished by feet
    {
      const sw = w * 1.25, sd = 0.62, sh = new THREE.Shape();
      sh.moveTo(-sw / 2, 0); sh.lineTo(sw / 2, 0); sh.lineTo(sw / 2, sd * 0.45);
      sh.bezierCurveTo(sw / 2, sd * 1.02, -sw / 2, sd * 1.02, -sw / 2, sd * 0.45); sh.lineTo(-sw / 2, 0);
      const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.03, bevelSegments: 3, curveSegments: 16 });
      sg.rotateX(Math.PI / 2);
      const sp = sg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < sp.count; i++) {
        const x = sp.getX(i), z = sp.getZ(i), y = sp.getY(i);
        // worn: dished in the middle where feet fall, a little uneven
        if (y > 0.015) sp.setY(i, y - Math.exp(-((x / (w * 0.4)) ** 2) - (((z - 0.25) / 0.25) ** 2)) * 0.025 + Math.sin(x * 9 + z * 7) * 0.004);
      }
      sg.computeVertexNormals();
      uvMetres(sg, 1, 1, 1.2);
      kit.add(sg, 'rough', '#d6c6a6', T(0, 0.0, -0.02));
    }
  });
}

// ---------------------------------------------------------------- round cottage

export interface CottageOpts {
  seed?: number;
  /** Wall radius at the base (m). */
  radius?: number;
  wallHeight?: number;
  roofHeight?: number;
  /** Eave overhang beyond the wall top (m). */
  overhang?: number;
  wall?: string;
  door?: string;
  shutter?: string;
  /** Number of ground-floor windows besides the door (1..5). */
  windows?: number;
  /** Number of upper-floor windows (0..4). */
  upperWindows?: number;
  roses?: boolean;
  /** Rose colours (default pinks and reds). */
  rosePalette?: readonly string[];
  ivy?: boolean;
  chimney?: boolean;
  /** Hang wind chimes beside the door. */
  chimes?: boolean;
  /** A whale weather vane on the roof tip. */
  vane?: boolean;
  /** Flower-box colours. */
  flowers?: readonly string[];
  /** Hydrangeas round the footing: a palette from HYDRANGEA, or null for none. */
  hydrangea?: readonly string[] | null;
}

/**
 * A round windfolk cottage after picture 2: a tall, slightly tapered cylinder of cream plaster over stone, two rows
 * of shuttered windows (flower boxes below), a broad cone of small blue scalloped slates whose eaves kick out low
 * and deep over timber rafters, an arched door at +Z with stone steps, rambling roses that climb beside the door,
 * round the arch and spill along the eave, ivy, hydrangeas at the footing, a stone chimney, and optionally wind
 * chimes and a whale weather vane.
 * userData: chimney (top of the flue, local), door (threshold, local), chime (Chime when chimes), radius (eave).
 */
export function roundCottage(opts: CottageOpts = {}): THREE.Group {
  const seed = opts.seed ?? 1, r = rng(seed);
  const R = opts.radius ?? 2.3, H = opts.wallHeight ?? R * 1.62, taper = 0.93, Rt = R * taper;
  const over = opts.overhang ?? 0.55 + R * 0.14;
  const eaveR = Rt + over;
  const roofH = opts.roofHeight ?? eaveR * 0.8;
  const lean = Math.atan2(R - Rt, H);
  const rAt = (y: number) => R + (Rt - R) * (y / H);
  const wallAt = (a: number, y: number, out = 0): WallPoint => ({ p: new THREE.Vector3(Math.sin(a) * (rAt(y) + out), y, Math.cos(a) * (rAt(y) + out)), n: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)) });
  const g = new THREE.Group(); g.name = 'roundCottage';
  const kit = new Kit();

  // walls: a lathe with many rows, nudged by noise so it reads hand-built, with the doorway cut out at +Z
  const dw = 0.98, dh = 2.1;
  const prof: [number, number][] = [];
  for (let i = 0; i <= 16; i++) { const y = 0.5 + (H - 0.5) * (i / 16); prof.push([rAt(y), y]); }
  const doorCut = (a: number, y: number) => { const x = Math.sin(a) * R; return Math.cos(a) > 0 && Math.abs(x) < dw / 2 + 0.05 && y - 0.3 < archTop(dw + 0.1, dh + 0.05, x); };
  const wall = wobble(lathe(prof, 64, WALL_TILE, true, 0, Math.PI * 2, doorCut), 0.022, 2.1, seed);
  kit.add(wall, 'wall', new THREE.Color(opts.wall ?? SAIL.wall).multiplyScalar(0.97 + r() * 0.05));
  // stone footing, flared, and a string course at the upper floor
  // the base course: a taller plinth of darker coursed stone, battered out at the foot
  kit.add(wobble(lathe([[R + 0.17, -0.1], [R + 0.14, 0.3], [R + 0.11, 0.56], [R + 0.03, 0.64]], 48, STONE_TILE, true, 0, Math.PI * 2, (a) => Math.cos(a) > 0 && Math.abs(Math.sin(a) * R) < dw / 2 + 0.16), 0.018, 3, seed + 1), 'stone', SAIL.stoneDark);
  const ySc = H * 0.5;
  kit.add(lathe([[rAt(ySc) + 0.01, ySc - 0.07], [rAt(ySc) + 0.06, ySc - 0.03], [rAt(ySc) + 0.06, ySc + 0.03], [rAt(ySc) + 0.01, ySc + 0.07]], 48, STONE_TILE), 'stone', SAIL.stone);

  // the roof: low, deep eaves; the slope meets the wall top just above it
  const kick = 0.5;
  const sWallTop = 1 - Rt / eaveR;
  const roofY0 = H + 0.05 - roofH * (sWallTop - kick * sWallTop * Math.pow(1 - sWallTop, 4));
  const roof = slateCone(kit, { eaveR, y0: roofY0, height: roofH, seed: seed * 7 + 3, kick, soffit: '#c8aa84' });
  // the wall plate, rafter ends under the soffit following the slope, and a fascia round the eave
  kit.add(lathe([[Rt + 0.03, H - 0.16], [Rt + 0.07, H + 0.04]], 40, WOOD_TILE), 'wood', SAIL.timber);
  const sEnd = 0.04;
  const nRaf = Math.round((Math.PI * 2 * Rt) / 0.5);
  for (let i = 0; i < nRaf; i++) {
    const a = (i / nRaf) * Math.PI * 2;
    const r0 = roof.rad(sWallTop), r1 = roof.rad(sEnd), y0 = roof.yy(sWallTop) - 0.08, y1 = roof.yy(sEnd) - 0.08;
    const len = Math.hypot(r0 - r1, y0 - y1);
    kit.add(boxM(0.08, 0.1, len, WOOD_TILE), 'wood', '#9a7352',
      T(Math.sin(a) * (r0 + r1) / 2, (y0 + y1) / 2, Math.cos(a) * (r0 + r1) / 2, 0, a, 0).multiply(T(0, 0, 0, Math.atan2(y0 - y1, r1 - r0), 0, 0)));
  }
  // a deep, dark fascia board and a rolled slate-blue drip edge: the heavy eave line of picture 2
  kit.add(lathe([[eaveR - 0.05, roofY0 - 0.26], [eaveR - 0.01, roofY0 - 0.24], [eaveR + 0.005, roofY0 + 0.02]], 56, WOOD_TILE), 'wood', SAIL.timberDark);
  kit.add(lathe([[eaveR - 0.03, roofY0 - 0.25], [eaveR + 0.02, roofY0 - 0.22], [eaveR + 0.025, roofY0 - 0.15], [eaveR + 0.01, roofY0 - 0.1]], 56, 1), 'plain', '#3c4c6a');
  // finial: a turned wooden knob and a brass ball
  kit.add(postGeo(0.04, 0.07, 0.35), 'wood', SAIL.timberDark, T(0, roof.apex + 0.12, 0));
  kit.add(new THREE.SphereGeometry(0.08, 10, 8), 'brass', SAIL.brass, T(0, roof.apex + 0.34, 0));

  // the door at +Z, set into the doorway
  addDoor(kit, T(0, 0.3, rAt(1.3) - 0.04, -lean, 0, 0), r, { w: dw, h: dh, color: opts.door ?? pick(r, SAIL.door) });
  g.userData.door = new THREE.Vector3(0, 0, R + 0.6);

  // windows: a ground-floor row with flower boxes, and a smaller upper row between them, never over the door
  const shutter = opts.shutter ?? pick(r, SAIL.shutters);
  const nWin = Math.max(0, Math.min(5, opts.windows ?? 3));
  const winAngles = [1.0, -1.05, 2.15, -2.2, Math.PI].slice(0, nWin);
  winAngles.forEach((a, i) => {
    const y = 1.0, wy = y + 0.45;
    const m = T(Math.sin(a) * (rAt(wy) - 0.03), y, Math.cos(a) * (rAt(wy) - 0.03), 0, a, 0).multiply(T(0, 0, 0, -lean, 0, 0));
    addWindow(kit, m, r, { w: 0.66, h: 0.84, shutter, box: i < 3 ? (opts.flowers ?? SAIL.box) : null, arched: i % 2 === 1 });
  });
  const nUp = Math.max(0, Math.min(4, opts.upperWindows ?? 3));
  const upAngles = [0.55, -0.6, 1.6, -1.65].slice(0, nUp);
  const yUp = Math.min(H * 0.56 + 0.1, roofY0 - 0.85);
  upAngles.forEach((a, i) => {
    const wy = yUp + 0.35;
    const m = T(Math.sin(a) * (rAt(wy) - 0.03), yUp, Math.cos(a) * (rAt(wy) - 0.03), 0, a, 0).multiply(T(0, 0, 0, -lean, 0, 0));
    addWindow(kit, m, r, { w: 0.52, h: 0.66, shutter, box: i === 0 ? (opts.flowers ?? SAIL.box) : null, arched: i % 2 === 0 });
  });

  // chimney through the slope, on the side away from the door
  if (opts.chimney !== false) {
    const ca = 2.2 + r() * 1.6, s = 0.4;
    const cr = roof.rad(s) - 0.12, cy = roof.yy(s);
    const ch = 1.7;
    const cm = T(Math.sin(ca) * cr, cy - 0.55 + ch / 2, Math.cos(ca) * cr, 0, ca, 0);
    kit.with(cm, () => {
      kit.add(wobble(boxM(0.62, ch, 0.62, STONE_TILE), 0.012, 4, seed), 'stone', SAIL.stone);
      kit.add(boxM(0.8, 0.1, 0.8, STONE_TILE), 'stone', SAIL.stoneDark, T(0, ch / 2 + 0.05, 0));
      kit.add(boxM(0.7, 0.06, 0.7, STONE_TILE), 'stone', SAIL.stoneDark, T(0, ch * 0.18, 0));
      kit.add(new THREE.CylinderGeometry(0.11, 0.13, 0.28, 8), 'plain', '#b8653f', T(0.1, ch / 2 + 0.24, 0.05));
      kit.add(new THREE.CylinderGeometry(0.09, 0.11, 0.2, 8), 'plain', '#a85a38', T(-0.14, ch / 2 + 0.2, -0.08));
    });
    g.userData.chimney = new THREE.Vector3(Math.sin(ca) * cr + 0.1, cy - 0.55 + ch + 0.45, Math.cos(ca) * cr);
  }

  // rambling roses: up one side of the door, round the arch, along under the eave, and over the eave's edge
  const roseSide = r() > 0.5 ? 1 : -1;
  if (opts.roses !== false) {
    const side = roseSide, pts: WallPoint[] = [];
    const a0 = side * (dw / 2 + 0.3) / R;
    for (let y = 0.45; y < dh + 0.1; y += 0.26) pts.push({ ...wallAt(a0 + Math.sin(y * 3.1) * 0.07, y, 0.02), s: 0.75 + (y < 1 ? 0.15 : 0) });
    // round the arch: from the rose side over the top to the far shoulder
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, ang = side > 0 ? t * Math.PI * 0.9 : Math.PI - t * Math.PI * 0.9;
      const ax = Math.cos(ang) * (dw / 2 + 0.24), ay = 0.3 + dh - dw / 2 + Math.sin(ang) * (dw / 2 + 0.24);
      pts.push({ ...wallAt(ax / R, ay, 0.03), s: 0.85 });
    }
    // up to the eave beside the door, then spreading along the wall top under the eave
    const yTop = Math.min(H - 0.35, roofY0 + 0.55);
    for (let y = dh + 0.4; y < yTop; y += 0.26) pts.push({ ...wallAt(a0 + 0.03 * side, y, 0.02), s: 0.95 });
    for (let k = 1; k <= 4; k++) {
      if (r() < k * 0.1) continue;
      for (const dir of [1, -0.7]) pts.push({ ...wallAt(a0 + side * dir * k * 0.15, yTop - 0.12 - r() * 0.3 * (k / 4), 0.02), s: 0.8 - k * 0.08 });
    }
    addRoses(kit, pts, r, { palette: opts.rosePalette, blooms: 9 });
    // strands of rose and ivy hanging from the eave's edge where the climber meets it: thin trailing lines of
    // leaves with a bloom here and there, never blobs
    const strands: WallPoint[] = [];
    for (let k = -3; k <= 4; k++) {
      const a = a0 + side * k * 0.13 + (r() - 0.5) * 0.05, len = 0.35 + r() * (k > -2 && k < 3 ? 0.9 : 0.45);
      const re = roof.rad(0.03) - 0.06, y0 = roof.yy(0.03) - 0.1;
      for (let y = 0; y < len; y += 0.075) {
        const sway = Math.sin(y * 5 + k) * 0.02;
        strands.push({ p: new THREE.Vector3(Math.sin(a + sway) * (re - y * 0.12), y0 - y, Math.cos(a + sway) * (re - y * 0.12)), n: new THREE.Vector3(Math.sin(a), 0.15, Math.cos(a)).normalize(), s: 0.42 - (y / len) * 0.18 });
      }
    }
    addIvy(kit, strands, r, { colors: ['#4f7f38', '#5a8a40', '#466f34', '#62904a'], perPoint: 2, spread: 0.35 });
    const bl: WallPoint[] = strands.filter(() => r() < 0.14).map(w => ({ ...w, s: 0.5 }));
    addRoses(kit, bl, r, { palette: opts.rosePalette, blooms: 3, leaves: false });
  }
  // ivy climbing the back and one side
  if (opts.ivy !== false) {
    for (let k = 0; k < 2; k++) {
      const a0 = (k === 0 ? Math.PI : -roseSide * 1.55) + (r() - 0.5) * 0.4;
      const main = climbPath(r, a0, 0.4, H * (0.55 + r() * 0.35), 0.22, 0.1, (a, y) => ({ ...wallAt(a, y, 0.01), s: 1.1 - y / H * 0.4 }));
      const spur = climbPath(r, a0 + 0.25, 0.3, H * 0.4, 0.22, 0.15, (a, y) => ({ ...wallAt(a, y, 0.01), s: 0.9 }));
      addIvy(kit, [...main, ...spur], r, { perPoint: 6 });
    }
  }
  // hydrangeas and leafy bushes round the footing (never in front of the door)
  const hyd = opts.hydrangea === undefined ? pick(r, [HYDRANGEA.blue, HYDRANGEA.violet, HYDRANGEA.pink]) : opts.hydrangea;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.5 + r() * 0.3;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.5) continue;
    const m = T(Math.sin(a) * (R + 0.3), 0, Math.cos(a) * (R + 0.3), 0, a, 0);
    if (hyd && i % 2 === 0) addHydrangeaBush(kit, m, r, { radius: 0.42 + r() * 0.12, palette: hyd });
    else addLeafMass(kit, m.clone().multiply(T(0, 0.3, 0)), r, { radius: 0.42 + r() * 0.14, squash: 0.75, color: pick(r, SAIL.green), ao: 0.45 });
  }

  // chime bracket beside the door
  if (opts.chimes !== false) {
    const ca = -roseSide * (dw / 2 + 0.55) / R, cy = 2.55;   // on the side away from the roses
    const rr = rAt(cy);
    const bm = T(Math.sin(ca) * rr, cy, Math.cos(ca) * rr, 0, ca, 0);
    // a clean wrought-iron bracket: a round wall plate, one arm curving out with a scroll under it, the hook at the end
    kit.with(bm, () => {
      kit.add(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 12).rotateX(Math.PI / 2), 'plain', SAIL.iron, T(0, 0, 0.01));
      kit.add(ropeGeo([new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(0, 0.03, 0.22), new THREE.Vector3(0, 0.02, 0.42), new THREE.Vector3(0, -0.01, 0.52)], 0.016, 6), 'plain', SAIL.iron);
      const sc: THREE.Vector3[] = [];
      for (let k = 0; k <= 18; k++) { const a = (k / 18) * Math.PI * 2.4, rr = 0.085 * (1 - k / 26); sc.push(new THREE.Vector3(0, -0.095 + Math.cos(a) * rr, 0.17 - Math.sin(a) * rr)); }
      kit.add(ropeGeo(sc, 0.009, 5), 'plain', SAIL.iron);
      kit.add(new THREE.TorusGeometry(0.03, 0.007, 4, 10, Math.PI * 1.6), 'plain', SAIL.iron, T(0, -0.035, 0.5, 0, Math.PI / 2, 0));
    });
    const chimes = doorChimes({ seed: seed + 5, tubes: 7, size: 1.5 });
    chimes.position.set(Math.sin(ca) * (rr + 0.5), cy - 0.02, Math.cos(ca) * (rr + 0.5));
    chimes.rotation.y = ca;
    g.add(chimes);
    g.userData.chime = chimes.userData.chime;
  }

  kit.build(g, { inkWidth: 0.02 });

  if (opts.vane) {
    const v = whaleVane(seed);
    v.position.set(0, roof.apex + 0.42, 0);
    g.add(v);
  }
  g.userData.radius = eaveR;
  g.userData.wallRadius = R;
  g.userData.eaveY = roofY0;
  g.userData.tris = kit.tris;
  return g;
}

/** A little brass whale on a rod, turning slowly to face the wind. */
function whaleVane(seed: number): THREE.Group {
  const r = rng(seed + 77);
  const g = new THREE.Group(); g.name = 'whaleVane';
  const kit = new Kit();
  kit.add(postGeo(0.012, 0.015, 0.7), 'plain', SAIL.iron, T(0, 0.35, 0));
  const s = new THREE.Shape();
  // a whale in profile, nose at +X
  s.moveTo(0.42, 0.0); s.quadraticCurveTo(0.4, 0.14, 0.15, 0.13); s.quadraticCurveTo(-0.2, 0.12, -0.36, 0.03);
  s.lineTo(-0.5, 0.12); s.lineTo(-0.47, 0.0); s.lineTo(-0.5, -0.1); s.lineTo(-0.36, -0.02);
  s.quadraticCurveTo(-0.1, -0.1, 0.2, -0.09); s.quadraticCurveTo(0.42, -0.08, 0.42, 0.0);
  const vg = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
  const turn = new THREE.Group(); turn.position.y = 0.62;
  const k2 = new Kit();
  k2.add(vg, 'brass', SAIL.brass, T(0.05, 0, -0.01));
  k2.add(new THREE.ConeGeometry(0.03, 0.12, 6).rotateZ(-Math.PI / 2), 'brass', SAIL.brass, T(0.5, 0, 0));
  k2.build(turn, { outline: false });
  kit.build(g, { outline: false });
  g.add(turn);
  let ang = r() * 6;
  turn.userData.update = (dt: number, t: number) => {
    const target = Math.sin(t * 0.13 + seed) * 0.5;
    ang += (target - ang) * Math.min(1, dt * 0.8);
    turn.rotation.y = ang + Math.sin(t * 2.3 + seed) * 0.04;
  };
  return g;
}

// ---------------------------------------------------------------- wind chimes

/**
 * One set of hanging chimes: a swinging body (string, top disc, clapper, wind sail and tassel) and its tubes as a
 * single InstancedMesh whose matrices swing every frame. ring(strength) sets them clanging; onStrike(i, vol) is
 * called when a tube is struck, for the sound engine.
 */
export class Chime {
  root: THREE.Group;
  energy = 0;
  onStrike: ((tube: number, volume: number) => void) | null = null;
  /** Each tube's mesh and instance slot (a set may mix metals, one InstancedMesh each). */
  private slots: [THREE.InstancedMesh, number][];
  private body: THREE.Group;
  private n: number;
  private attach: THREE.Vector3[] = [];
  private len: number[] = [];
  private phase: number[] = [];
  private nextStrike: number[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private calm: number;
  private swing: number;

  /** calm scales the idle sway in the breeze; swing scales how far a ring throws the tubes. */
  private bodySway: boolean;
  /** bodySway: the whole set swings on its hook (door chimes); off for tubes hung from a fixed frame (the gate). */
  constructor(root: THREE.Group, body: THREE.Group, tubes: THREE.InstancedMesh | [THREE.InstancedMesh, number][], attach: THREE.Vector3[], len: number[], seed: number, calm = 1, swing = 1, bodySway = true) {
    this.root = root; this.body = body; this.n = attach.length; this.attach = attach; this.len = len; this.calm = calm; this.swing = swing; this.bodySway = bodySway;
    this.slots = Array.isArray(tubes) ? tubes : attach.map((_, i) => [tubes, i] as [THREE.InstancedMesh, number]);
    const r = rng(seed);
    for (let i = 0; i < this.n; i++) { this.phase.push(r() * 6.28); this.nextStrike.push(0); }
  }
  /** Set the chimes swinging (1 = a brush of the hand; 3 = a racer straight through). */
  ring(strength = 1) { this.energy = Math.min(3, this.energy + strength); }
  update(dt: number, t: number) {
    this.energy *= Math.exp(-dt * 0.9);
    const E = Math.min(this.energy, 2) * this.swing, k = this.calm;
    // the whole set sways on its hook
    if (this.bodySway) {
      this.body.rotation.x = (Math.sin(t * 1.3 + this.phase[0]) * 0.05 + 0.04) * k + E * 0.12 * Math.sin(t * 5.1);
      this.body.rotation.z = Math.sin(t * 0.9 + this.phase[1]) * 0.04 * k + E * 0.1 * Math.sin(t * 4.3 + 1);
    }
    for (let i = 0; i < this.n; i++) {
      const ph = this.phase[i], w = 2.2 / Math.sqrt(this.len[i] / 0.3);
      const ax = (Math.sin(t * w + ph) * 0.06 + 0.05) * k + E * 0.22 * Math.sin(t * w * 2.6 + ph);
      const az = Math.sin(t * w * 0.8 + ph * 1.3) * 0.05 * k + E * 0.2 * Math.cos(t * w * 2.2 + ph * 0.7);
      this.e.set(ax, 0, az); this.q.setFromEuler(this.e);
      this.s.set(1, this.len[i] / 0.3, 1);
      this.m.compose(this.attach[i], this.q, this.s);
      const [mesh, slot] = this.slots[i];
      mesh.setMatrixAt(slot, this.m);
      if (this.energy > 0.12 && t > this.nextStrike[i]) {
        this.nextStrike[i] = t + 0.18 + Math.random() * 0.5 / E;
        this.onStrike?.(i, Math.min(1, E * 0.5));
      }
    }
    for (const [mesh] of this.slots) mesh.instanceMatrix.needsUpdate = true;
  }
}

/** The tube instance: a short dark cord then a metal tube 0.3 m long (scaled in Y per tube), pivot at the top. */
const tubeGeoCache = new Map<number, THREE.BufferGeometry>();
/** `thick` scales the tube's radius (the gate's tubes are much fatter than a door chime's). */
function chimeTubeGeo(thick = 1) {
  const hit = tubeGeoCache.get(thick);
  if (hit) return hit;
  const k = thick;
  const cord = tint(new THREE.CylinderGeometry(0.003 * Math.sqrt(k), 0.003 * Math.sqrt(k), 0.05, 3).translate(0, -0.025, 0), '#3a3238');
  const tube = tint(new THREE.CylinderGeometry(0.021 * k, 0.021 * k, 0.25, 14, 1).translate(0, -0.05 - 0.125, 0), '#ffffff');
  const cap = tint(new THREE.CylinderGeometry(0.023 * k, 0.023 * k, 0.008, 14).translate(0, -0.05, 0), '#8a8478');
  for (const x of [cord, tube, cap]) x.deleteAttribute('uv');
  const merged = new THREE.BufferGeometry();
  const parts = [cord, tube, cap].map(p => p.index ? p.toNonIndexed() : p);
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  for (const name of ['position', 'normal', 'color']) {
    const arr = new Float32Array(n * 3); let o = 0;
    for (const p of parts) { arr.set(p.attributes[name].array as Float32Array, o); o += p.attributes[name].array.length; }
    merged.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  tubeGeoCache.set(thick, merged);
  return merged;
}

export interface ChimeOpts { seed?: number; tubes?: number; metal?: 'silver' | 'brass'; size?: number; tassel?: string }

/**
 * Wind chimes for a door (origin at the hook; they hang down about 0.8 m). userData.chime is the Chime with ring();
 * userData.update swings them.
 */
export function doorChimes(opts: ChimeOpts = {}): THREE.Group {
  const seed = opts.seed ?? 1, r = rng(seed), n = opts.tubes ?? 6, S = opts.size ?? 1;
  const g = new THREE.Group(); g.name = 'doorChimes';
  const body = new THREE.Group(); g.add(body);
  const kit = new Kit();
  // the top: a clear round disc of turned wood with a brass rim, hung on three cords from a ring
  const discY = -0.16 * S, discR = 0.135 * S;
  kit.add(new THREE.TorusGeometry(0.018 * S, 0.004 * S, 4, 10), 'brass', SAIL.brass, T(0, -0.01, 0));
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; kit.add(ropeGeo([new THREE.Vector3(0, -0.02, 0), new THREE.Vector3(Math.cos(a) * discR * 0.8, discY + 0.02 * S, Math.sin(a) * discR * 0.8)], 0.0025, 3), 'plain', '#3a3238'); }
  kit.add(lathe([[0.01, discY + 0.025 * S], [discR * 0.92, discY + 0.02 * S], [discR, discY + 0.005 * S], [discR, discY - 0.015 * S], [discR * 0.94, discY - 0.022 * S], [0.01, discY - 0.022 * S]], 20, WOOD_TILE), 'wood', '#8a5a34');
  kit.add(new THREE.TorusGeometry(discR, 0.006 * S, 4, 24).rotateX(Math.PI / 2), 'brass', SAIL.brass, T(0, discY - 0.005 * S, 0));
  // clapper and wind sail on a long cord through the middle
  const clY = discY - 0.26 * S;
  kit.add(new THREE.CylinderGeometry(0.004, 0.004, 0.72 * S, 3), 'plain', '#3a3238', T(0, discY - 0.36 * S, 0));
  kit.add(new THREE.CylinderGeometry(0.045 * S, 0.045 * S, 0.02 * S, 10), 'wood', SAIL.plank, T(0, clY, 0));
  const tas = opts.tassel ?? '#d8443a';
  // a paper wind-sail, a brass bead, a knot and a long thread tassel
  kit.add(new THREE.BoxGeometry(0.12 * S, 0.2 * S, 0.008), 'plain', '#f6efe2', T(0, discY - 0.52 * S, 0));
  kit.add(new THREE.BoxGeometry(0.12 * S, 0.035 * S, 0.01), 'plain', tas, T(0, discY - 0.44 * S, 0));
  kit.add(new THREE.SphereGeometry(0.028 * S, 8, 6), 'brass', SAIL.brass, T(0, discY - 0.66 * S, 0));
  kit.add(new THREE.SphereGeometry(0.03 * S, 8, 6), 'plain', tas, T(0, discY - 0.71 * S, 0, 0, 0, 0, 1, 0.8, 1));
  kit.add(new THREE.CylinderGeometry(0.02 * S, 0.045 * S, 0.22 * S, 10, 1, true), 'plain', tas, T(0, discY - 0.84 * S, 0));
  kit.add(new THREE.CylinderGeometry(0.035 * S, 0.035 * S, 0.02 * S, 10), 'brass', SAIL.brass, T(0, discY - 0.74 * S, 0));
  kit.build(body, { outline: false });
  // tubes
  const metal = opts.metal ?? 'silver';
  const mat = townMat(metal === 'silver' ? 'chrome' : 'brass');
  const tubes = new THREE.InstancedMesh(chimeTubeGeo(S), mat, n);
  tubes.castShadow = true; tubes.frustumCulled = false;
  const tcol = new THREE.Color(metal === 'brass' ? SAIL.brass : SAIL.silver);
  const attach: THREE.Vector3[] = [], len: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    attach.push(new THREE.Vector3(Math.cos(a) * discR * 0.72, discY - 0.022 * S, Math.sin(a) * discR * 0.72));
    len.push((0.22 + 0.3 * (i / Math.max(1, n - 1)) + r() * 0.03) * S);
    tubes.setColorAt(i, (metal === 'brass' ? tcol.clone() : new THREE.Color('#a8b2be')).multiplyScalar(0.92 + r() * 0.1));
  }
  body.add(tubes);
  const chime = new Chime(g, body, tubes, attach, len, seed);
  g.userData.chime = chime;
  g.userData.update = (dt: number, t: number) => chime.update(dt, t);
  chime.update(0, r() * 10);
  return g;
}

// ---------------------------------------------------------------- windmill

export interface WindmillOpts {
  seed?: number;
  /** Tower height to the cap (m). */
  height?: number;
  radius?: number;
  /** Sail length from the hub (m). */
  sail?: number;
  /** Turns per second-ish (radians/s). */
  speed?: number;
  /** A wooden gallery round the tower. */
  gallery?: boolean;
  shutter?: string;
  ivy?: boolean;
}

/**
 * Canvas for one sail, as wind-cloth: one cream sail-cloth with stitched panel seams (drawn in the cloth shader), an
 * older patch or two, and a real belly: it billows out between every pair of sail bars and across the frame, and
 * breathes a little in the wind. x across the frame, y along the stock.
 */
function sailCanvas(r: Rnd, x0: number, x1: number, y0: number, y1: number, bars: number[], patchK = 1) {
  const pos: number[] = [], uvs: number[] = [], cl: number[] = [], wv: number[] = [], dr: number[] = [], pt: number[] = [], idx: number[] = [];
  const panels = 4, cols = panels * 3, per = (x1 - x0) / panels;
  const base = new THREE.Color('#f4ead4');
  const patches: [number, number, number, THREE.Color][] = [];
  for (let i = 0; i < patchK; i++) {
    const py = y0 + r() * (y1 - y0) * 0.75;
    patches.push([Math.floor(r() * panels), py, py + 0.4 + r() * 0.5, new THREE.Color(pick(r, ['#e6d6b4', '#e2cba6', '#ece0c2']))]);
  }
  const ys: number[] = [y0, ...bars.filter(b => b > y0 + 0.05 && b < y1 - 0.05), y1];
  const rowsPer = 3;
  const P = patAttr({ kind: 'panels', period: per });
  const rowsY: { y: number; t: number }[] = [];
  for (let b = 0; b < ys.length - 1; b++) for (let k = 0; k < rowsPer; k++) rowsY.push({ y: ys[b] + (ys[b + 1] - ys[b]) * (k / rowsPer), t: k / rowsPer });
  rowsY.push({ y: y1, t: 0 });
  const W = cols + 1;
  for (let j = 0; j < rowsY.length; j++) for (let c = 0; c <= cols; c++) {
    const u = c / cols, x = x0 + (x1 - x0) * u, { y, t } = rowsY[j];
    const along = (y - y0) / (y1 - y0);
    // a belly between the bars and a deeper one across the whole frame, strongest toward the trailing edge
    const z = 0.08 * Math.sin(u * Math.PI) * Math.sin(t * Math.PI) + 0.3 * Math.sin(Math.pow(u, 0.8) * Math.PI) * Math.sin(Math.min(1, along * 1.05) * Math.PI) ** 0.5;
    pos.push(x, y, z); uvs.push((x - x0) / LINEN_TILE, (y - y0) / LINEN_TILE);
    let col = base;
    const pc = Math.floor(u * panels - 1e-6);
    for (const [pp, p0, p1, pcol] of patches) if (pp === pc && y > p0 && y < p1 && u * panels - pc > 0.02) col = pcol;
    // painted billow: the cloth lighter where it bellies out, darker where it is pulled taut to the frame and bars
    const sh = 0.8 + 0.2 * Math.sin(Math.pow(u, 0.8) * Math.PI) * (0.75 + 0.25 * Math.sin(t * Math.PI));
    cl.push(col.r * sh, col.g * sh, col.b * sh);
    wv.push(0.035 * Math.sin(u * Math.PI) * Math.sin(along * Math.PI), r() * 0.3, 0.9); dr.push(0, 0, 1); pt.push(...P);
  }
  for (let j = 0; j < rowsY.length - 1; j++) for (let c = 0; c < cols; c++) { const a = j * W + c; idx.push(a, a + 1, a + W + 1, a, a + W + 1, a + W); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.setAttribute('aWave', new THREE.Float32BufferAttribute(wv, 3));
  g.setAttribute('aDir', new THREE.Float32BufferAttribute(dr, 3));
  g.setAttribute('aPat', new THREE.Float32BufferAttribute(pt, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A windmill: a tall tapered tower of cream plaster with windows climbing it, an arched door under a little slate
 * hood, a gallery, a slate onion cap with a tail pole down to the gallery, and four open lattice sails (whips, sail
 * bars and hemlaths) whose canvas is only partly spread, two of them furled and tied (userData.update turns them).
 * userData.rotor is the turning group.
 */
export function windmill(opts: WindmillOpts = {}): THREE.Group {
  const seed = opts.seed ?? 1, r = rng(seed);
  const H = opts.height ?? 9, R = opts.radius ?? 1.9, Rt = R * 0.7;
  const rAt = (y: number) => R + (Rt - R) * (y / H);
  const lean = Math.atan2(R - Rt, H);
  const g = new THREE.Group(); g.name = 'windmill';
  const kit = new Kit();
  const prof: [number, number][] = [];
  for (let i = 0; i <= 24; i++) { const y = 0.35 + (H - 0.35) * (i / 24); prof.push([rAt(y), y]); }
  // doorways cut through the wall: [angle, sill height, width, height]
  const gy = H * 0.42, gallery = opts.gallery !== false;
  const doors: [number, number, number, number][] = [[0, 0.35, 0.95, 1.95]];
  if (gallery) doors.push([-0.9, gy, 0.7, 1.5]);
  const cut = (a: number, y: number) => doors.some(([da, dy, dw, dh]) => {
    const d = Math.atan2(Math.sin(a - da), Math.cos(a - da)), x = Math.sin(d) * rAt(y);
    return Math.cos(d) > 0 && Math.abs(x) < dw / 2 + 0.05 && y > dy - 0.05 && y - dy < archTop(dw + 0.1, dh + 0.05, x);
  });
  kit.add(wobble(lathe(prof, 72, WALL_TILE, true, 0, Math.PI * 2, cut), 0.025, 1.7, seed), 'wall', new THREE.Color(SAIL.wall).multiplyScalar(0.98 + r() * 0.04));
  kit.add(wobble(lathe([[R + 0.2, -0.1], [R + 0.15, 0.25], [R + 0.03, 0.45]], 36, STONE_TILE), 0.02, 3, seed), 'stone', SAIL.stoneDark);
  // stone string courses, and the cap curb
  for (const yc of [H * 0.25, H * 0.62, H * 0.86]) kit.add(lathe([[rAt(yc) + 0.02, yc - 0.08], [rAt(yc) + 0.08, yc - 0.03], [rAt(yc) + 0.08, yc + 0.04], [rAt(yc) + 0.02, yc + 0.08]], 36, STONE_TILE), 'stone', SAIL.stone);
  kit.add(lathe([[Rt + 0.02, H - 0.2], [Rt + 0.16, H - 0.08], [Rt + 0.16, H + 0.14]], 36, WOOD_TILE), 'wood', SAIL.timberDark);
  // door, its slate hood on brackets, and windows climbing the tower
  addDoor(kit, T(0, 0.35, rAt(1.3) - 0.04, -lean, 0, 0), r, { w: 0.95, h: 1.95, color: pick(r, SAIL.door) });
  kit.with(T(0, 2.62, rAt(2.6), 0, 0, 0), () => {
    for (const s of [-1, 1]) kit.add(boxM(0.07, 0.07, 0.62, WOOD_TILE), 'wood', SAIL.timber, T(s * 0.62, -0.16, 0.24, 0.55, 0, 0));
    kit.add(boxM(1.55, 0.06, 0.8, WOOD_TILE), 'wood', SAIL.timber, T(0, 0, 0.36, 0.42, 0, 0));
    for (let k = 0; k < 4; k++) for (let j = 0; j < 7; j++) {
      const c = new THREE.Color(pick(r, SAIL.slate)).multiplyScalar(0.9 + r() * 0.2);
      kit.add(new THREE.BoxGeometry(0.2, 0.025, 0.26), 'plain', c, T(-0.66 + j * 0.22 + (k % 2) * 0.1, 0.05 + k * 0.07, 0.68 - k * 0.17, 0.42 + (r() - 0.5) * 0.06, 0, (r() - 0.5) * 0.05));
    }
  });
  const sh = opts.shutter ?? pick(r, SAIL.shutters);
  const wins: [number, number][] = [[0.0, H * 0.5], [-1.9, H * 0.3], [1.7, H * 0.72], [2.8, H * 0.45], [0.35, H * 0.7], [-0.55, H * 0.8], [1.1, H * 0.3]];
  for (const [a, y] of wins) {
    const m = T(Math.sin(a) * (rAt(y + 0.3) - 0.03), y, Math.cos(a) * (rAt(y + 0.3) - 0.03), 0, a, 0).multiply(T(0, 0, 0, -lean, 0, 0));
    addWindow(kit, m, r, { w: 0.5, h: 0.62, shutter: sh, box: y < H * 0.4 ? SAIL.box : null, arched: true });
  }
  // the gallery: a ring deck on brackets with a post-and-rail fence
  let gr1 = R + 1;
  if (gallery) {
    const gr0 = rAt(gy); gr1 = gr0 + 0.75;
    kit.add(lathe([[gr1, gy], [gr0, gy]], 36, WOOD_TILE, true), 'wood', SAIL.plank);
    kit.add(lathe([[gr1, gy - 0.12], [gr1, gy]], 36, WOOD_TILE, true), 'wood', SAIL.timber);
    kit.add(lathe([[gr0, gy - 0.12], [gr1, gy - 0.12]], 36, WOOD_TILE, false), 'wood', SAIL.timberDark);
    const nP = 16;
    for (let i = 0; i < nP; i++) {
      const a = (i / nP) * Math.PI * 2;
      kit.add(boxM(0.07, 0.95, 0.07, WOOD_TILE, true), 'wood', SAIL.timber, T(Math.sin(a) * (gr1 - 0.06), gy + 0.47, Math.cos(a) * (gr1 - 0.06)));
      kit.add(boxM(0.06, 0.06, 0.95, WOOD_TILE), 'wood', SAIL.timberDark, T(Math.sin(a) * (gr0 + 0.3), gy - 0.45, Math.cos(a) * (gr0 + 0.3), 0, a, 0).multiply(T(0, 0, 0, 0.85, 0, 0)));
    }
    for (const y of [0.5, 0.92]) kit.add(new THREE.TorusGeometry(gr1 - 0.06, 0.03, 4, 40).rotateX(Math.PI / 2), 'wood', SAIL.timber, T(0, gy + y, 0));
    addDoor(kit, T(Math.sin(-0.9) * (rAt(gy + 0.8) - 0.04), gy, Math.cos(-0.9) * (rAt(gy + 0.8) - 0.04), 0, -0.9, 0).multiply(T(0, 0, 0, -lean, 0, 0)), r, { w: 0.7, h: 1.5, color: pick(r, SAIL.door) });
  }
  // ivy round the foot of the tower
  if (opts.ivy !== false) {
    const at = (a: number, y: number): WallPoint => ({ p: new THREE.Vector3(Math.sin(a) * (rAt(y) + 0.01), y, Math.cos(a) * (rAt(y) + 0.01)), n: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), s: 1.2 - y / H });
    for (const a0 of [-0.75, 1.4, 2.6, -2.2]) addIvy(kit, [...climbPath(r, a0, 0.4, H * (0.2 + r() * 0.22), 0.22, 0.12, at), ...climbPath(r, a0 + 0.3, 0.35, H * 0.14, 0.22, 0.14, at)], r, { perPoint: 6 });
    for (const a of [-0.6, 0.7, 2.0, -1.8]) addLeafMass(kit, T(Math.sin(a) * (R + 0.25), 0.3, Math.cos(a) * (R + 0.25), 0, a, 0), r, { radius: 0.4 + r() * 0.12, squash: 0.75, color: pick(r, SAIL.green), ao: 0.45 });
  }
  const capR = Rt + 0.32, capY = H + 0.12;
  // the cap: a pointed bell of the same blue-grey slate as the cottages, flaring out over a dark curb
  const cap = slateCone(kit, { eaveR: capR + 0.12, y0: capY, height: 2.5, seed: seed * 13 + 1, courseH: 0.17, tileW: 0.2, kick: 0.85, soffit: '#9a7352' });
  kit.add(lathe([[capR + 0.08, capY - 0.12], [capR + 0.15, capY - 0.05], [capR + 0.15, capY + 0.06]], 40, 1), 'plain', '#2f3f5e');
  kit.add(postGeo(0.03, 0.05, 0.6), 'wood', SAIL.timberDark, T(0, cap.apex + 0.2, 0));
  kit.add(new THREE.SphereGeometry(0.1, 10, 8), 'brass', SAIL.brass, T(0, cap.apex + 0.52, 0));
  kit.add(new THREE.ConeGeometry(0.05, 0.25, 8), 'brass', SAIL.brass, T(0, cap.apex + 0.72, 0));
  // windshaft housing at the front of the cap
  const hubY = H + 0.78, hubZ = Rt + 0.66, tilt = 0.14;
  kit.add(new THREE.CylinderGeometry(0.22, 0.28, 1.0, 10).rotateX(Math.PI / 2), 'wood', SAIL.timberDark, T(0, hubY - 0.05, hubZ - 0.45, -tilt, 0, 0));
  // the tail pole: from the back of the cap down to the gallery rail, braced, with a little winding wheel
  {
    const top = new THREE.Vector3(0, H + 0.25, -capR - 0.05);
    const end = gallery ? new THREE.Vector3(0, gy + 1.05, -(gr1 + 0.35)) : new THREE.Vector3(0, 1.2, -(R + 2.4));
    const d = end.clone().sub(top), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    kit.add(postGeo(0.09, 0.1, len, 7).translate(0, len / 2, 0), 'wood', SAIL.timber, new THREE.Matrix4().compose(top, q, new THREE.Vector3(1, 1, 1)));
    for (const s of [-1, 1]) {
      const a = new THREE.Vector3(s * capR * 0.8, H + 0.2, -capR * 0.55), b = top.clone().lerp(end, 0.32);
      const dd = b.clone().sub(a), l2 = dd.length();
      kit.add(postGeo(0.05, 0.05, l2, 5).translate(0, l2 / 2, 0), 'wood', SAIL.timberDark, new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dd.normalize()), new THREE.Vector3(1, 1, 1)));
    }
    kit.add(new THREE.TorusGeometry(0.36, 0.035, 5, 16), 'wood', SAIL.timberDark, T(end.x, end.y + 0.05, end.z + 0.05, 0, Math.PI / 2, 0));
    for (let k = 0; k < 4; k++) kit.add(boxM(0.03, 0.7, 0.03, WOOD_TILE), 'wood', SAIL.timberDark, T(end.x, end.y + 0.05, end.z + 0.05, k * Math.PI / 4, 0, 0));
  }
  kit.build(g, { inkWidth: 0.025 });

  // the rotor: four stocks with open lattice; canvas spread on some, furled and tied on others
  const L = opts.sail ?? H * 0.64;
  const rotor = new THREE.Group(); rotor.name = 'rotor';
  rotor.position.set(0, hubY, hubZ); rotor.rotation.x = -tilt;
  const spin = new THREE.Group(); rotor.add(spin);
  const rk = new Kit();
  rk.add(new THREE.CylinderGeometry(0.26, 0.26, 0.34, 10).rotateX(Math.PI / 2), 'wood', SAIL.timber, T(0, 0, 0.05));
  rk.add(new THREE.SphereGeometry(0.15, 10, 6), 'brass', SAIL.brass, T(0, 0, 0.25));
  const wood = new THREE.Color('#8a6748'), latt = new THREE.Color('#9c7a58');
  // how much of each sail is spread: two spread part-way, one furled, one barely spread and the rest furled
  const spread = [0.92, 0.35, 0.8, 0.15];
  for (let i = 0; i < 4; i++) {
    rk.with(T(0, 0, 0.1, 0, 0, i * Math.PI / 2 + 0.3), () => {
      // the stock is a stout beam; the lattice on it is light (the sails must read as frames, not ladders)
      rk.add(boxM(0.17, L + 0.3, 0.15, WOOD_TILE, true), 'wood', wood, T(0, (L + 0.3) / 2 - 0.3, 0));
      const x0 = -0.3, x1 = 1.08, y0 = 0.9, y1 = L - 0.05;
      // whips along the length (a narrow leading board, a middle lath, the hemlath at the trailing edge)
      for (const [x, w] of [[x0, 0.035], [0.42, 0.028], [x1, 0.045]] as const) rk.add(boxM(w, y1 - y0, w, WOOD_TILE, true), 'wood', latt, T(x, (y0 + y1) / 2, -0.03));
      // sail bars across, every 0.38 m
      const nb = Math.round((y1 - y0) / 0.38), bars: number[] = [];
      for (let b = 0; b <= nb; b++) {
        const y = y0 + (b / nb) * (y1 - y0); bars.push(y);
        rk.add(boxM(x1 - x0 + 0.06, 0.032, 0.032, WOOD_TILE), 'wood', latt, T((x0 + x1) / 2, y, -0.05));
      }
      // braces near the hub
      rk.add(boxM(0.035, 1.2, 0.035, WOOD_TILE, true), 'wood', latt, T(0.48, y0 - 0.28, -0.04, 0, 0, -0.78));
      rk.add(boxM(0.035, 0.6, 0.035, WOOD_TILE, true), 'wood', latt, T(-0.2, y0 - 0.2, -0.04, 0, 0, 0.6));
      const sp = spread[i];
      const cy1 = y0 + (y1 - y0) * sp;
      if (sp > 0.05) {
        rk.add(sailCanvas(r, 0.1, x1 - 0.04, y0 + 0.04, cy1, bars, 1 + (i % 2)), 'cloth', null, T(0, 0, 0.04));
        // the reefing line, gathered at the end of the spread cloth
        rk.add(ropeGeo([new THREE.Vector3(0.1, cy1, 0.08), new THREE.Vector3(0.55, cy1 + 0.03, 0.12), new THREE.Vector3(x1 - 0.04, cy1, 0.08)], 0.016, 4), 'plain', '#8a6a48');
      }
      // the rest of the cloth, furled into a twisted roll along the inner whip and tied every 0.7 m
      if (sp < 0.98) {
        const fy0 = sp > 0.05 ? cy1 + 0.1 : y0 + 0.05, fy1 = y1 - 0.1;
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector3(0.18 + Math.sin(t * 9) * 0.015, fy0 + (fy1 - fy0) * t, 0.08 + Math.cos(t * 7) * 0.015)); }
        rk.add(wobble(ropeGeo(pts, 0.085 - 0.02 * (sp > 0 ? 1 : 0), 6), 0.012, 14, i), 'canvas', '#efe4cc');
        for (let y = fy0 + 0.25; y < fy1 - 0.1; y += 0.7) rk.add(new THREE.TorusGeometry(0.09, 0.02, 4, 10).rotateX(Math.PI / 2), 'plain', '#7a5a3c', T(0.18, y, 0.08));
      }
    });
  }
  rk.build(spin, { inkWidth: 0.008 });
  g.add(rotor);
  const speed = opts.speed ?? 0.55;
  let ang = r() * 6;
  spin.userData.update = (dt: number) => { ang -= speed * dt; spin.rotation.z = ang; };
  g.userData.rotor = spin;
  g.userData.tris = kit.tris + rk.tris;
  return g;
}

// ---------------------------------------------------------------- laundry

/** The sag offset of a catenary of span L and mid-span sag `sag` at x (0..L): y relative to the ends (negative). */
function catenary(L: number, sag: number) {
  // solve a·cosh(L/2a) − a = sag for a by bisection
  let lo = 0.01, hi = 1000;
  for (let i = 0; i < 60; i++) { const a = (lo + hi) / 2; if (a * Math.cosh(L / (2 * a)) - a > sag) lo = a; else hi = a; }
  const a = (lo + hi) / 2, top = a * Math.cosh(L / (2 * a));
  return (x: number) => a * Math.cosh((x - L / 2) / a) - top;
}

type Garment = 'sheet' | 'towel' | 'shirt' | 'trousers' | 'scarf' | 'pillow';

/**
 * A washing line of `length` metres along +X between two forked poles, sagging in a real catenary: sheets pegged at
 * three points with soft folds and a belly, striped towels, shirts, trousers, a scarf folded over the line and a
 * pillowcase, all billowing and fluttering in the shader. Origin at the first pole's foot.
 */
export function laundryLine(length = 5, seed = 1): THREE.Group {
  const r = rng(seed);
  const g = new THREE.Group(); g.name = 'laundryLine';
  const kit = new Kit();
  const H = 2.3, sag = 0.16 + length * 0.055;
  for (const x of [0, length]) {
    const lean = (r() - 0.5) * 0.05;
    kit.add(postGeo(0.055, 0.075, H + 0.15, 7), 'wood', SAIL.weathered, T(x, (H + 0.15) / 2 - 0.05, 0, lean, 0, (x ? 1 : -1) * 0.04));
    for (const s of [-1, 1]) kit.add(postGeo(0.028, 0.034, 0.34, 5), 'wood', SAIL.weathered, T(x + s * 0.07, H + 0.2, 0, 0, 0, -s * 0.38));
    kit.add(new THREE.IcosahedronGeometry(0.16, 0), 'stone', SAIL.stoneDark, T(x + 0.12, 0.02, 0.08, 0, 0, 0, 1, 0.5, 1));
    // a guy rope pegged into the ground behind each pole
    kit.add(ropeGeo([new THREE.Vector3(x, H + 0.05, 0), new THREE.Vector3(x + (x ? 0.55 : -0.55), H * 0.5, 0.05), new THREE.Vector3(x + (x ? 1.1 : -1.1), 0.02, 0.1)], 0.007, 3), 'plain', '#d8ccb0');
  }
  const drop = catenary(length, sag);
  const ropeY = (x: number) => H + drop(Math.max(0, Math.min(length, x)));
  const line: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) { const x = (i / 24) * length; line.push(new THREE.Vector3(x, ropeY(x), 0)); }
  kit.add(ropeGeo(line, 0.009, 4), 'plain', '#e6dcc4');
  let x = 0.25;
  const whites = ['#fbf8f0', '#f6f1e6', '#fffdf8', '#f3eee2'];
  const order: Garment[] = ['sheet', 'shirt', 'towel', 'trousers', 'sheet', 'scarf', 'towel', 'shirt', 'pillow', 'sheet'];
  let gi = Math.floor(r() * 3);
  while (x < length - 0.35) {
    const kind = order[gi++ % order.length];
    let w = 0, h = 0, belly = 0.1, amp = 0.36, stiff = 0.45, pegs = 2, folds = 3;
    let colFn: (u: number, v: number) => THREE.Color;
    let mask: ((u: number, v: number) => boolean) | undefined;
    let pattern: ClothPattern | undefined;
    if (kind === 'sheet') {
      w = 0.95 + r() * 0.35; h = 1.15 + r() * 0.3; belly = 0.16; amp = 0.5; stiff = 0.35; pegs = 3; folds = 4;
      const c = new THREE.Color(pick(r, whites));
      const hem = r() > 0.4 ? new THREE.Color(pick(r, ['#9ec0e8', '#f0b8c8', '#f2d27a', '#b8d8a8'])) : null;
      // a gingham sheet now and then (woven in the shader), otherwise white with a coloured hem
      if (r() > 0.7) pattern = { kind: 'gingham', accent: pick(r, ['#9fbce6', '#f0b4c4', '#b8d8a8']), period: 0.085 };
      colFn = (_u, v) => hem && v > 0.9 ? hem : c;
    } else if (kind === 'towel') {
      w = 0.5 + r() * 0.15; h = 0.78 + r() * 0.15; belly = 0.08; amp = 0.34;
      const st = new THREE.Color(pick(r, ['#4f7fc4', '#e0473b', '#6aae5a', '#f08a32'])), wc = new THREE.Color(pick(r, whites));
      if (r() > 0.5) { pattern = { kind: 'stripes', accent: st, period: 0.11 }; colFn = (_u, v) => (v > 0.9 || v < 0.06) ? st : wc; }
      else if (r() > 0.4) { pattern = { kind: 'plaid', accent: st, period: 0.16 }; colFn = () => wc; }
      else colFn = (_u, v) => (v > 0.1 && v < 0.2) || (v > 0.8 && v < 0.9) ? st : wc;
    } else if (kind === 'shirt') {
      w = 0.9; h = 0.78; belly = 0.12; amp = 0.3; stiff = 0.5;
      const c = new THREE.Color(pick(r, ['#fbf8f0', '#cfe0f4', '#f6e7b8', '#e8c8b0', '#a8c8e8']));
      if (r() > 0.6) pattern = { kind: 'stripes', accent: c.clone().multiplyScalar(0.72), period: 0.05 };
      colFn = (u, v) => (v > 0.94 ? c.clone().multiplyScalar(0.9) : c);
      // body, sloped shoulders, sleeves hanging down and out, a collar notch
      mask = (u, v) => {
        const body = u > 0.25 && u < 0.75 && !(v < 0.06 && u > 0.42 && u < 0.58);
        const sl = Math.abs(u - 0.5);
        const sleeve = sl > 0.25 && sl < 0.5 && v < 0.12 + (0.5 - sl) * 1.4 && v > (sl - 0.25) * 0.5;
        return body || sleeve;
      };
    } else if (kind === 'trousers') {
      w = 0.52; h = 1.0; belly = 0.06; amp = 0.3; stiff = 0.55;
      const c = new THREE.Color(pick(r, ['#6f86a8', '#8a7458', '#a8b48a', '#5e6f8c']));
      colFn = (_u, v) => (v < 0.06 ? c.clone().multiplyScalar(0.85) : c);
      mask = (u, v) => v < 0.3 || Math.abs(u - 0.5) > 0.06 + v * 0.02;
    } else if (kind === 'scarf') {
      w = 0.24; h = 0.95; belly = 0.03; amp = 0.55; stiff = 0.1; pegs = 1; folds = 0;
      const a = new THREE.Color(pick(r, ['#e0473b', '#f2c53d', '#3f78c8'])), b = new THREE.Color('#f6efe2');
      colFn = (_u, v) => (Math.floor(v * 10) % 3 === 0 ? b : a);
      mask = (u, v) => v < 0.92 || Math.floor(u * 5) % 2 === 0;   // a fringe at the end
    } else {
      w = 0.48; h = 0.34; belly = 0.05; amp = 0.25; stiff = 0.6;
      const c = new THREE.Color(pick(r, ['#f0b8c8', '#f2d27a', '#9ec0e8', '#fbf8f0']));
      colFn = () => c;
    }
    if (x + w > length - 0.25) break;
    const nx = Math.max(4, Math.round(w / 0.09)), ny = Math.max(5, Math.round(h / 0.09));
    const ph = r() * 6;
    const cg = clothGrid(w, h, nx, ny, colFn, {
      mask, phase: ph, stiff, pattern,
      // free to swing far at the hem and the free corners, a little belly in the middle
      weight: (u, v) => amp * Math.pow(v, 1.05) * (0.85 + 0.3 * Math.abs(u - 0.5) * 2) + 0.06 * Math.sin(u * Math.PI) * v,
    });
    // the rest shape: hang the top edge on the sagging line, droop between pegs, belly out and fold
    const p = cg.attributes.position as THREE.BufferAttribute;
    const cx = x + w / 2;
    const pegU = pegs === 1 ? [0.5] : pegs === 2 ? [0.04, 0.96] : [0.04, 0.5, 0.96];
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / w + 0.5, v = -p.getY(i) / h;
      let dPeg = 1; for (const q of pegU) dPeg = Math.min(dPeg, Math.abs(u - q));
      const droop = (pegs === 1 ? 0 : 0.07 * Math.sin(Math.min(1, dPeg / (0.5 / (pegs - 1))) * Math.PI * 0.5)) * Math.max(0, 1 - v * 1.4);
      const z = belly * Math.sin(u * Math.PI) * Math.pow(v, 0.7) + (folds ? 0.035 * Math.sin(u * Math.PI * folds * 2 + ph) * Math.min(1, v * 2) : 0);
      p.setXYZ(i, p.getX(i), p.getY(i) + ropeY(cx + p.getX(i)) - 0.01 - droop, z);
    }
    cg.computeVertexNormals();
    kit.add(cg, 'cloth', null, T(cx, 0, 0, 0, (r() - 0.5) * 0.1, 0));
    // the scarf folds over the line: a second half hanging behind
    if (kind === 'scarf') {
      const back = clothGrid(w, h * 0.8, nx, Math.round(ny * 0.8), colFn, { mask, phase: ph + 0.8, stiff, pattern, weight: (_u, v) => 0.5 * v });
      const bp = back.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < bp.count; i++) bp.setXYZ(i, bp.getX(i), bp.getY(i) + ropeY(cx + bp.getX(i)), -0.03);
      kit.add(back, 'cloth', null, T(cx, 0, 0));
    }
    for (const q of pegU) {
      const px = x + q * w;
      kit.with(T(px, ropeY(px) - 0.015, 0.01), () => {
        for (const s of [-1, 1]) kit.add(new THREE.BoxGeometry(0.014, 0.1, 0.022), 'bloom', '#d8b88a', T(s * 0.009, -0.01, 0));
        kit.add(new THREE.BoxGeometry(0.035, 0.012, 0.026), 'plain', '#8a8478', T(0, 0.015, 0));
      });
    }
    x += w + 0.1 + r() * 0.16;
  }
  kit.build(g, { inkWidth: 0.015 });
  return g;
}

// ---------------------------------------------------------------- bunting

export interface BuntingOpts { sag?: number; spacing?: number; colors?: readonly string[]; size?: number }

/**
 * Bunting strung through `points` (the hang points, e.g. poles and eaves) in deep swags: many small triangle
 * pennants in festival colours that flutter in the shader. Coordinates are in the group's space.
 */
export function bunting(points: THREE.Vector3[], seed = 1, opts: BuntingOpts = {}): THREE.Group {
  const r = rng(seed);
  const g = new THREE.Group(); g.name = 'bunting';
  const kit = new Kit();
  const cols = (opts.colors ?? SAIL.festival.slice(0, 4).concat(['#6aae5a', '#f6efe2'])).map(c => new THREE.Color(c));
  const S = opts.size ?? 0.5, spacing = opts.spacing ?? 0.38 * S;
  const fw = 0.3 * S, fh = 0.42 * S;
  let ci = Math.floor(r() * cols.length);
  for (let s = 0; s < points.length - 1; s++) {
    const a = points[s], b = points[s + 1];
    const span = a.distanceTo(b);
    const sag = opts.sag ?? 0.11 * span + 0.12;
    const line = sagLine(a, b, sag, Math.max(10, Math.round(span * 3)));
    kit.add(ropeGeo(line, 0.007, 3), 'plain', '#e8dcc0');
    const curve = new THREE.CatmullRomCurve3(line);
    const L = curve.getLength(), n = Math.floor(L / spacing);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = curve.getPointAt(t), tg = curve.getTangentAt(t);
      const along = tg.clone().normalize();
      tg.y = 0; tg.normalize();
      const nrm = new THREE.Vector3(-tg.z, 0, tg.x);
      const c = cols[ci++ % cols.length].clone().multiplyScalar(0.93 + r() * 0.12);
      const pos: number[] = [], nor: number[] = [], cl: number[] = [], wv: number[] = [], dr: number[] = [], idx: number[] = [];
      const rows = 3, ph = r() * 6 + i * 0.5;
      for (let j = 0; j <= rows; j++) {
        const v = j / rows, half = (1 - v) * fw / 2;
        for (const u of [-1, 0, 1]) {
          // the top edge follows the rope's slope; the flag hangs straight down from it
          const q = p.clone().addScaledVector(along, u * half * (j === 0 ? 1 : 0)).addScaledVector(tg, j === 0 ? 0 : u * half).add(new THREE.Vector3(0, -v * fh, 0));
          pos.push(q.x, q.y, q.z); nor.push(nrm.x, nrm.y, nrm.z); cl.push(c.r, c.g, c.b);
          wv.push(0.16 * Math.pow(v, 1.1) * S, ph, 0.7); dr.push(nrm.x, 0.15, nrm.z);
        }
      }
      for (let j = 0; j < rows; j++) for (let k = 0; k < 2; k++) {
        const a0 = j * 3 + k, a1 = a0 + 1, b0 = a0 + 3, b1 = b0 + 1;
        idx.push(a0, b0, b1, a0, b1, a1);
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      fg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      fg.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
      fg.setAttribute('aWave', new THREE.Float32BufferAttribute(wv, 3));
      fg.setAttribute('aDir', new THREE.Float32BufferAttribute(dr, 3));
      fg.setIndex(idx);
      kit.add(fg, 'cloth', null);
    }
  }
  kit.build(g, { outline: false });
  return g;
}

// ---------------------------------------------------------------- market stall

/** A burlap sack: a bulging body, a tied neck with a cord, and a flared, folded top. */
export function addSack(kit: Kit, m: THREE.Matrix4, r: Rnd, h = 0.5, open = false) {
  const rad = h * 0.4;
  const prof: [number, number][] = [[0.01, 0], [rad * 0.85, 0.02], [rad, h * 0.18], [rad * 1.02, h * 0.45], [rad * 0.88, h * 0.66], [rad * 0.42, h * 0.8], [rad * 0.3, h * 0.84]];
  if (open) prof.push([rad * 0.55, h * 0.9], [rad * 0.62, h * 0.88]);
  else prof.push([rad * 0.46, h * 0.93], [rad * 0.5, h], [rad * 0.3, h * 1.02]);
  const c = new THREE.Color('#c8a872').multiplyScalar(0.9 + r() * 0.16);
  kit.with(m, () => {
    kit.add(wobble(lathe(prof, 14, 0.4), 0.018, 11, Math.floor(r() * 99)), 'canvas', c);
    kit.add(new THREE.TorusGeometry(rad * 0.33, 0.015, 4, 12).rotateX(Math.PI / 2), 'plain', '#7a5a3c', T(0, h * 0.84, 0));
    if (open) kit.add(new THREE.CircleGeometry(rad * 0.55, 12).rotateX(-Math.PI / 2), 'bloom', pick(r, ['#e8d08a', '#d8b86a', '#c88a5a']), T(0, h * 0.89, 0));
  });
}

/** A terracotta pot (with a rim) planted with a leafy mound and flowers in one colour. */
export function addPot(kit: Kit, m: THREE.Matrix4, r: Rnd, rad = 0.16, flowers?: readonly string[]) {
  const tc = new THREE.Color(SAIL.terracotta).multiplyScalar(0.9 + r() * 0.15);
  kit.with(m, () => {
    kit.add(lathe([[rad * 0.68, 0], [rad * 0.9, rad * 1.3], [rad, rad * 1.34], [rad * 1.05, rad * 1.4], [rad * 1.05, rad * 1.62], [rad * 0.94, rad * 1.64]], 14, 0.5), 'plain', tc);
    kit.add(new THREE.CircleGeometry(rad * 0.92, 12).rotateX(-Math.PI / 2), 'plain', '#5a4232', T(0, rad * 1.56, 0));
    if (flowers) addBloomMound(kit, T(0, rad * 1.5, 0), r, rad * 1.7, rad * 1.7, rad * 0.9, flowers, 8, 0);
  });
}

/**
 * A market stall: a plank counter under a red-and-white striped awning that sags between its rails, with a deep
 * scalloped valance; crates of apples, oranges and lemons, baskets of bread and greens, honey jars, burlap sacks with
 * tied necks, barrels, terracotta pots of flowers, and a chalk A-board. Faces +Z (the customer side). ~2.6 m wide.
 */
export function awningStall(opts: { seed?: number; width?: number; stripe?: string } = {}): THREE.Group {
  const seed = opts.seed ?? 1, r = rng(seed);
  const W = opts.width ?? 2.6, D = 1.0;
  const g = new THREE.Group(); g.name = 'awningStall';
  const kit = new Kit();
  const wood = new THREE.Color(SAIL.plank), dark = new THREE.Color(SAIL.timber);
  const backH = 2.6, frontH = 2.25;
  for (const sx of [-1, 1]) {
    kit.add(boxM(0.1, backH, 0.1, WOOD_TILE, true), 'wood', dark, T(sx * W / 2, backH / 2, -D / 2));
    kit.add(boxM(0.1, frontH, 0.1, WOOD_TILE, true), 'wood', dark, T(sx * W / 2, frontH / 2, D / 2));
    kit.add(boxM(0.07, 0.07, D, WOOD_TILE), 'wood', dark, T(sx * W / 2, 0.92, 0));
    // little turned finials on the front posts
    kit.add(new THREE.SphereGeometry(0.07, 8, 6), 'wood', dark, T(sx * W / 2, frontH + 0.05, D / 2));
  }
  // counter: top planks with a lip, a front of panelled boards with a cross-braced frame, a shelf below
  for (let i = 0; i < 4; i++) kit.add(boxM(W + 0.15, 0.05, D / 4 - 0.01, WOOD_TILE), 'wood', wood.clone().multiplyScalar(0.9 + r() * 0.2), T(0, 0.95, -D / 2 + (i + 0.5) * D / 4));
  kit.add(boxM(W + 0.2, 0.06, 0.06, WOOD_TILE), 'wood', dark, T(0, 0.99, D / 2 + 0.04));
  const nb = Math.round(W / 0.2);
  const paint = new THREE.Color(pick(r, ['#6f9fa8', '#8fae7a', '#d8a85a']));
  for (let i = 0; i < nb; i++) kit.add(boxM(W / nb - 0.014, 0.86, 0.035, WOOD_TILE, true), 'wood', paint.clone().multiplyScalar(0.86 + r() * 0.18), T(-W / 2 + (i + 0.5) * W / nb, 0.47, D / 2 + 0.02));
  for (const y of [0.1, 0.86]) kit.add(boxM(W, 0.08, 0.05, WOOD_TILE), 'wood', dark, T(0, y, D / 2 + 0.05));
  for (const s of [-1, 1]) for (const hx of [-1, 1]) {
    const cx = hx * W / 4, len = Math.hypot(W / 2 - 0.1, 0.7);
    kit.add(boxM(len, 0.07, 0.04, WOOD_TILE), 'wood', dark, T(cx, 0.48, D / 2 + 0.06, 0, 0, s * Math.atan2(0.7, W / 2 - 0.1)));
  }
  kit.add(boxM(W, 0.04, D * 0.8, WOOD_TILE), 'wood', wood.clone().multiplyScalar(0.75), T(0, 0.3, -0.05));
  // the awning: stripes run down the slope; it sags between the side rails and bellies a little in the wind
  const stripe = new THREE.Color(opts.stripe ?? '#d8443a'), cream = new THREE.Color('#f7f0e2');
  const aW = W + 0.4, back = new THREE.Vector3(0, backH + 0.05, -D / 2 - 0.1), front = new THREE.Vector3(0, frontH - 0.02, D / 2 + 0.55);
  const aLen = back.distanceTo(front), slope = Math.atan2(back.y - front.y, front.z - back.z);
  const nS = 12;
  const aw = clothGrid(aW, aLen, nS * 2, 8, () => cream, {
    phase: r() * 6, stiff: 0.2, pattern: { kind: 'stripes', accent: stripe, period: (aW / nS) * 2 },
    weight: (u, v) => 0.05 * v * (0.3 + Math.sin(u * Math.PI)), dir: new THREE.Vector3(0, 0, 1),
  });
  {
    const p = aw.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / aW + 0.5, v = -p.getY(i) / aLen;
      // sag between the side rails (deepest mid-slope), lifting back to the front rail
      p.setZ(i, p.getZ(i) - 0.16 * Math.sin(u * Math.PI) * Math.sin(Math.min(1, v * 1.05) * Math.PI) - 0.04 * Math.sin(u * Math.PI));
    }
    aw.computeVertexNormals();
  }
  kit.add(aw, 'cloth', null, T(back.x, back.y, back.z, -Math.PI / 2 + slope, 0, 0));
  // valance: deep scallops along the front and down the sides, alternating colours, free to flutter
  const scallop = (w: number, h: number, c: THREE.Color, ph: number, m: THREE.Matrix4) => {
    const vg = clothGrid(w + 0.005, h, 3, 5, () => c, {
      phase: ph, stiff: 0.8,
      mask: (u, v) => v < 0.55 || Math.abs(u - 0.5) < 0.5 * Math.sqrt(Math.max(0, 1 - ((v - 0.55) / 0.45) ** 2)) + 0.06,
      weight: (_u, v) => 0.1 * v,
    });
    kit.add(vg, 'cloth', null, m);
  };
  const nv = 12, vh = 0.34;
  for (let i = 0; i < nv; i++) scallop(aW / nv, vh, i % 2 ? cream : stripe, i * 0.6, T(-aW / 2 + (i + 0.5) / nv * aW, front.y + 0.02, front.z - 0.01));
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4, z = back.z + (front.z - back.z) * t, y = back.y + (front.y - back.y) * t;
    scallop(aLen / 4, vh * 0.8, i % 2 ? stripe : cream, i * 0.7 + sx, T(sx * (aW / 2 - 0.01), y - 0.03, z, 0, Math.PI / 2, 0).multiply(T(0, 0, 0, 0, 0, slope)));
  }
  kit.add(boxM(W + 0.2, 0.08, 0.08, WOOD_TILE), 'wood', dark, T(0, backH, -D / 2));
  kit.add(boxM(W + 0.2, 0.06, 0.06, WOOD_TILE), 'wood', dark, T(0, frontH - 0.05, D / 2));
  // goods on the counter
  addCrate(kit, T(-W * 0.32, 0.975, 0.0, 0.14, 0.05, 0), r, 0.6, 0.42, 0.22, '#d8443a');
  addCrate(kit, T(-W * 0.06, 0.975, 0.05, 0.14, -0.04, 0), r, 0.5, 0.4, 0.22, '#f08a32', 0.05);
  addCrate(kit, T(W * 0.16, 0.975, 0.02, 0.14, 0.08, 0), r, 0.45, 0.38, 0.22, '#f2d23d', 0.045);
  addBasket(kit, T(W * 0.38, 0.975, 0.1), r, 0.2, '#d8a058');
  addBasket(kit, T(W * 0.05, 0.975, -0.33), r, 0.17, '#7fb04a');
  for (let i = 0; i < 4; i++) {  // honey jars
    const jx = W * 0.3 + i * 0.11, jz = -0.32;
    kit.add(new THREE.CylinderGeometry(0.045, 0.05, 0.13, 10), 'glass', '#e8a83a', T(jx, 1.04, jz));
    kit.add(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), 'plain', i % 2 ? '#e0473b' : '#f6efe2', T(jx, 1.12, jz));
  }
  // under and beside the stall
  addCrate(kit, T(-W * 0.3, 0.32, -0.05), r, 0.55, 0.4, 0.3, '#6aae5a', 0.07);
  addBarrel(kit, T(W / 2 + 0.45, 0, 0.25), r);
  addBarrel(kit, T(W / 2 + 0.4, 0, -0.45, 0, 0, 0), r, 0.7, 0.26);
  addBasket(kit, T(W / 2 + 0.45, 0.85, 0.25), r, 0.2, '#e0473b');
  addCrate(kit, T(-W / 2 - 0.5, 0, 0.35, 0, 0.3, 0), r, 0.6, 0.42, 0.34, '#d8443a');
  addCrate(kit, T(-W / 2 - 0.5, 0.34, 0.35, 0, 0.1, 0), r, 0.55, 0.4, 0.3, '#f2d23d', 0.05);
  addSack(kit, T(W / 2 + 0.05, 0, D / 2 + 0.6, 0, r(), 0.05), r, 0.55, true);
  addSack(kit, T(W / 2 + 0.42, 0, D / 2 + 0.72, 0, r(), -0.08), r, 0.48);
  addSack(kit, T(-W / 2 - 0.15, 0, -0.4, 0, r(), 0.04), r, 0.5, true);
  // terracotta pots of flowers in front
  for (let i = 0; i < 3; i++) addPot(kit, T(-0.55 + i * 0.5, 0, D / 2 + 0.38, 0, r() * 6, 0), r, 0.13 + r() * 0.04, [pick(r, ['#f07aa0', '#f2d23d', '#ffffff', '#b48ae0', '#e0473b'])]);
  // a chalk A-board on the lane
  kit.with(T(-W / 2 - 0.1, 0, D / 2 + 0.9, 0, 0.5, 0), () => {
    for (const s of [-1, 1]) kit.with(T(0, 0, s * 0.16, -s * 0.2, 0, 0), () => {
      kit.add(boxM(0.6, 0.85, 0.03, WOOD_TILE), 'wood', SAIL.timber, T(0, 0.45, 0));
      kit.add(new THREE.PlaneGeometry(0.5, 0.62), 'plain', '#33403a', T(0, 0.5, s * 0.017, 0, s < 0 ? Math.PI : 0, 0));
      for (let k = 0; k < 4; k++) kit.add(new THREE.PlaneGeometry(0.3 - (k % 2) * 0.1, 0.022), 'bloom', '#f2efe6', T(-0.04 + (k % 2) * 0.03, 0.7 - k * 0.1, s * 0.019, 0, s < 0 ? Math.PI : 0, (r() - 0.5) * 0.08));
      kit.add(new THREE.RingGeometry(0.035, 0.05, 10), 'bloom', '#e0473b', T(0.14, 0.34, s * 0.019, 0, s < 0 ? Math.PI : 0, 0));
    });
  });
  // a little string of pennants along the counter's front
  kit.build(g, { inkWidth: 0.018 });
  g.add(bunting([new THREE.Vector3(-W / 2, frontH - 0.12, D / 2 + 0.06), new THREE.Vector3(W / 2, frontH - 0.12, D / 2 + 0.06)], seed + 3, { size: 0.4, sag: 0.12 }));
  return g;
}

// ---------------------------------------------------------------- footbridge

/**
 * The little arched wooden footbridge, spanning `length` metres along +X (centred on the origin): planks over two
 * curved stringers, a railing of posts with an arching handrail, and cream stone abutments at both ends.
 */
export function footBridge(length = 5, opts: { seed?: number; width?: number; rise?: number } = {}): THREE.Group {
  const r = rng(opts.seed ?? 3);
  const L = length, W = opts.width ?? 1.4, rise = opts.rise ?? Math.min(0.9, L * 0.14);
  const g = new THREE.Group(); g.name = 'footBridge';
  const kit = new Kit();
  const yAt = (x: number) => rise * (1 - (2 * x / L) ** 2) + 0.15;
  const slopeAt = (x: number) => Math.atan(-8 * rise * x / (L * L));
  const plank = new THREE.Color(SAIL.plank), dark = new THREE.Color(SAIL.timber);
  // deck planks
  const nP = Math.round(L / 0.17);
  for (let i = 0; i < nP; i++) {
    const x = -L / 2 + (i + 0.5) * (L / nP);
    kit.add(boxM(L / nP - 0.018, 0.05, W + (r() - 0.5) * 0.06, WOOD_TILE), 'wood', plank.clone().multiplyScalar(0.85 + r() * 0.25), T(x, yAt(x), (r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.02, slopeAt(x)));
  }
  // stringers: short segments along the curve
  const seg = 10;
  for (const z of [-W / 2 + 0.1, W / 2 - 0.1]) for (let i = 0; i < seg; i++) {
    const x0 = -L / 2 + (i / seg) * L, x1 = -L / 2 + ((i + 1) / seg) * L, xm = (x0 + x1) / 2;
    const len = Math.hypot(x1 - x0, yAt(x1) - yAt(x0)) + 0.02;
    kit.add(boxM(len, 0.16, 0.1, WOOD_TILE), 'wood', dark, T(xm, yAt(xm) - 0.11, z, 0, 0, Math.atan2(yAt(x1) - yAt(x0), x1 - x0)));
  }
  // railings
  const nPost = 5;
  const railH = 0.85;
  for (const z of [-W / 2 + 0.02, W / 2 - 0.02]) {
    for (let i = 0; i < nPost; i++) {
      const x = -L / 2 + 0.15 + (i / (nPost - 1)) * (L - 0.3);
      const ph = railH + (i === 0 || i === nPost - 1 ? 0.12 : 0);
      kit.add(boxM(0.1, ph + 0.25, 0.1, WOOD_TILE, true), 'wood', dark, T(x, yAt(x) + (ph + 0.25) / 2 - 0.25, z, 0, 0, (r() - 0.5) * 0.04));
      kit.add(new THREE.ConeGeometry(0.085, 0.1, 4).rotateY(Math.PI / 4), 'wood', dark, T(x, yAt(x) + ph + 0.05, z));
    }
    for (const [hk, th] of [[railH - 0.05, 0.08], [railH * 0.5, 0.06]] as const) for (let i = 0; i < seg; i++) {
      const x0 = -L / 2 + 0.15 + (i / seg) * (L - 0.3), x1 = -L / 2 + 0.15 + ((i + 1) / seg) * (L - 0.3), xm = (x0 + x1) / 2;
      const y0 = yAt(x0) + hk, y1 = yAt(x1) + hk;
      kit.add(boxM(Math.hypot(x1 - x0, y1 - y0) + 0.02, th, th, WOOD_TILE), 'wood', plank.clone().multiplyScalar(0.8), T(xm, (y0 + y1) / 2, z, 0, 0, Math.atan2(y1 - y0, x1 - x0)));
    }
  }
  // stone abutments
  for (const s of [-1, 1]) {
    kit.add(wobble(boxM(0.9, 0.55, W + 0.5, STONE_TILE), 0.02, 4, s), 'stone', SAIL.stone, T(s * (L / 2 + 0.15), -0.05, 0));
    for (const z of [-1, 1]) kit.add(new THREE.IcosahedronGeometry(0.25, 0), 'stone', SAIL.stoneDark, T(s * (L / 2 + 0.3), 0.05, z * (W / 2 + 0.35), r(), r(), 0, 1, 0.7, 1));
  }
  kit.build(g, { inkWidth: 0.018 });
  g.userData.deckY = yAt;
  return g;
}

// ---------------------------------------------------------------- fence

/**
 * A rustic post-and-rail fence `length` metres along +X from the origin: square weathered posts, two split rails
 * per bay passing a little crooked. heightAt(x) lets it follow the ground (local x).
 */
export function fence(length = 6, opts: { seed?: number; height?: number; heightAt?: (x: number) => number; bay?: number } = {}): THREE.Group {
  const r = rng(opts.seed ?? 5);
  const H = opts.height ?? 1.0, bay = opts.bay ?? 1.7;
  const hAt = opts.heightAt ?? (() => 0);
  const g = new THREE.Group(); g.name = 'fence';
  const kit = new Kit();
  const n = Math.max(1, Math.round(length / bay));
  const xs: number[] = [];
  for (let i = 0; i <= n; i++) xs.push(i === 0 || i === n ? (i / n) * length : (i / n) * length + (r() - 0.5) * 0.2);
  const base = new THREE.Color(SAIL.weathered);
  const tops: THREE.Vector3[] = [];
  for (const x of xs) {
    const y = hAt(x), ph = H + 0.1 + (r() - 0.5) * 0.08;
    const c = base.clone().multiplyScalar(0.8 + r() * 0.3);
    kit.add(boxM(0.13, ph + 0.3, 0.13, WOOD_TILE, true), 'wood', c, T(x, y + (ph + 0.3) / 2 - 0.3, 0, (r() - 0.5) * 0.05, (r() - 0.5) * 0.3, (r() - 0.5) * 0.05));
    kit.add(new THREE.ConeGeometry(0.1, 0.08, 4).rotateY(Math.PI / 4), 'wood', c, T(x, y + ph + 0.04, 0));
    tops.push(new THREE.Vector3(x, y, 0));
  }
  for (let i = 0; i < xs.length - 1; i++) {
    const a = tops[i], b = tops[i + 1];
    for (const k of [0.45, 0.85]) {
      const y0 = a.y + H * k + (r() - 0.5) * 0.05, y1 = b.y + H * k + (r() - 0.5) * 0.05;
      const len = Math.hypot(b.x - a.x, y1 - y0) + 0.18;
      kit.add(boxM(len, 0.1, 0.075, WOOD_TILE), 'wood', base.clone().multiplyScalar(0.85 + r() * 0.25), T((a.x + b.x) / 2, (y0 + y1) / 2, 0.08, (r() - 0.5) * 0.1, 0, Math.atan2(y1 - y0, b.x - a.x)));
    }
  }
  kit.build(g, { inkWidth: 0.016 });
  return g;
}

// ---------------------------------------------------------------- planters

export type PlanterKind = 'hydrangea' | 'lavender' | 'roses' | 'mixed';

/**
 * A wooden crate planter (about 1 m by 0.55 m) heaped with hydrangeas, lavender, roses or a mixed bed of daisies and
 * coreopsis, spilling over its edges.
 */
export function flowerPlanter(kind: PlanterKind = 'hydrangea', seed = 1, opts: { width?: number; palette?: readonly string[] } = {}): THREE.Group {
  const r = rng(seed * 3 + kind.length);
  const W = opts.width ?? 1.0, D = 0.56, H = 0.5;
  const g = new THREE.Group(); g.name = 'flowerPlanter';
  const kit = new Kit();
  const wood = new THREE.Color(SAIL.plank).multiplyScalar(0.85);
  for (let k = 0; k < 3; k++) {
    const y = 0.09 + k * 0.155;
    for (const s of [-1, 1]) {
      kit.add(boxM(W, 0.14, 0.035, WOOD_TILE), 'wood', wood.clone().multiplyScalar(0.88 + r() * 0.2), T(0, y, s * (D / 2 - 0.018)));
      kit.add(boxM(0.035, 0.14, D, WOOD_TILE), 'wood', wood.clone().multiplyScalar(0.88 + r() * 0.2), T(s * (W / 2 - 0.018), y, 0));
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.add(boxM(0.07, H + 0.04, 0.07, WOOD_TILE, true), 'wood', SAIL.timber, T(sx * (W / 2 - 0.02), (H + 0.04) / 2, sz * (D / 2 - 0.02)));
  kit.add(boxM(W + 0.06, 0.04, D + 0.06, WOOD_TILE), 'wood', SAIL.timber, T(0, H + 0.02, 0));
  kit.add(new THREE.BoxGeometry(W - 0.08, 0.04, D - 0.08), 'plain', '#5a4232', T(0, H - 0.04, 0));
  const top = H - 0.02;
  if (kind === 'hydrangea') {
    const pal = opts.palette ?? pick(r, [HYDRANGEA.blue, HYDRANGEA.violet, HYDRANGEA.pink]);
    const n = Math.max(1, Math.round(W / 0.45));
    for (let i = 0; i < n; i++) addHydrangeaBush(kit, T(-W / 2 + (i + 0.5) * (W / n), top - 0.12, (r() - 0.5) * 0.08, 0, r() * 6, 0), r, { radius: 0.34 + r() * 0.06, heads: 5, palette: pal });
  } else if (kind === 'lavender') {
    const lc = new THREE.Color(pick(r, PETALS.lavender));
    addLeafMass(kit, T(0, top + 0.05, 0), r, { radius: W * 0.42, squash: 0.35, color: '#8a9c7a', cell: CELL.narrow, size: 0.22, ao: 0.5 });
    const n = Math.round(W * 9);
    for (let i = 0; i < n; i++) {
      const s = 0.8 + r() * 0.35;
      const pm = T(-W / 2 + 0.1 + r() * (W - 0.2), top, (r() - 0.5) * (D - 0.18), (r() - 0.5) * 0.25, r() * 6, (r() - 0.5) * 0.25, s, s, s);
      const lcol = lc.clone().multiplyScalar(0.9 + r() * 0.2);
      kit.add(bakedPlant('lavender', lcol), 'flora', null, pm);
      kit.add(bakedPlant('lavenderSpikes', lcol), 'floraSoft', null, pm.clone());
    }
  } else if (kind === 'roses') {
    const pts: WallPoint[] = [];
    for (let i = 0; i < Math.round(W * 4); i++) pts.push({ p: new THREE.Vector3(-W / 2 + 0.12 + r() * (W - 0.24), top + 0.18 + r() * 0.15, (r() - 0.5) * 0.2), n: new THREE.Vector3((r() - 0.5) * 0.6, 1, 0.4 + r() * 0.4).normalize(), s: 1.1 });
    addRoses(kit, pts, r, { palette: opts.palette, blooms: 10 });
  } else {
    const kinds: FlowerKind[] = ['daisy', 'coreopsis', 'cosmos', 'buttercup'];
    addBloomMound(kit, T(0, top, 0), r, W - 0.1, D - 0.1, 0.22, opts.palette ?? SAIL.box, Math.round(W * 16), 4);
    for (let i = 0; i < Math.round(W * 7); i++) {
      const k = pick(r, kinds), s = 0.7 + r() * 0.3;
      kit.add(bakedPlant(k, new THREE.Color(pick(r, PETALS[k]))), 'flora', null, T(-W / 2 + 0.1 + r() * (W - 0.2), top, (r() - 0.5) * (D - 0.2), 0, r() * 6, 0, s, s, s));
    }
  }
  kit.build(g, { inkWidth: 0.016 });
  return g;
}

// ---------------------------------------------------------------- steps, walls and paving

/** A dressed stone block: a box with small rounded arrises (crisp, never puffy), UVs in metres for the relief map. */
function blockGeo(w: number, h: number, d: number, bevel = 0.022) {
  const g = new RoundedBoxGeometry(w, h, d, 1, Math.min(bevel, w * 0.3, h * 0.3, d * 0.3));
  const uv = g.attributes.uv as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const su = ax > 0.5 ? d : w, sv = ay > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * su / 1.2, uv.getY(i) * sv / 1.2);
  }
  return g;
}

/**
 * Warm stone steps rising along +Z: `count` treads of `rise` each, `width` wide, each one or two big dressed slabs of
 * uneven width with crisp arrises and a dark recessed joint behind, worn cheeks of rubble and tufts at their ends.
 */
export function stoneSteps(count = 3, width = 1.6, seed = 9, rise = 0.18, tread = 0.42): THREE.Group {
  const r = rng(seed);
  const g = new THREE.Group(); g.name = 'stoneSteps';
  const kit = new Kit();
  for (let i = 0; i < count; i++) {
    const y = (i + 1) * rise;
    // the joint bed: a dark core under every tread, so the gaps between slabs read as deep mortar
    kit.add(new THREE.BoxGeometry(width - 0.04, rise + 0.12, tread), 'plain', '#6e5e4a', T(0, y - (rise + 0.12) / 2 - 0.02, i * tread + tread / 2 + 0.03));
    const split = width > 1.1 ? 0.35 + r() * 0.3 : 1;
    const parts = split < 1 ? [split, 1 - split] : [1];
    let x = -width / 2;
    for (const f of parts) {
      const sw = width * f - 0.03;
      const c = new THREE.Color(pick(r, SAIL.flag)).multiplyScalar(0.93 + r() * 0.1);
      kit.add(blockGeo(sw, rise + 0.1, tread + 0.06, 0.025), 'rough', c, T(x + sw / 2 + 0.015, y - (rise + 0.1) / 2, i * tread + tread / 2, (r() - 0.5) * 0.02, (r() - 0.5) * 0.04, (r() - 0.5) * 0.02));
      x += width * f;
    }
  }
  for (const s of [-1, 1]) for (let i = 0; i < count; i++) {
    const c = new THREE.Color(pick(r, SAIL.flag)).multiplyScalar(0.85 + r() * 0.1);
    kit.add(blockGeo(0.3 + r() * 0.12, 0.2 + r() * 0.08, 0.36 + r() * 0.1, 0.04), 'rough', c, T(s * (width / 2 + 0.17), i * rise + 0.1, i * tread + 0.2, 0, (r() - 0.5) * 0.4, (r() - 0.5) * 0.1));
    if (r() < 0.7) addLeafMass(kit, T(s * (width / 2 + 0.24), i * rise + 0.24, i * tread + 0.12), r, { radius: 0.18 + r() * 0.08, squash: 0.7, color: pick(r, SAIL.green), ao: 0.45 });
  }
  kit.build(g, { inkWidth: 0.008 });
  return g;
}

/**
 * A low dry-stone wall `length` metres along +X: courses of uneven height, blocks of uneven length (with small fillers
 * stacked here and there), crisp arrises, all set into a dark recessed mortar core; flat coping stones mossy on top,
 * ivy here and there, and plants at the foot. heightAt(x) lets it follow the ground.
 */
export function stoneWall(length = 4, opts: { seed?: number; height?: number; depth?: number; heightAt?: (x: number) => number; ivy?: boolean } = {}): THREE.Group {
  const r = rng((opts.seed ?? 4) * 11 + 5);
  const Hh = opts.height ?? 0.75, Dd = opts.depth ?? 0.45, hAt = opts.heightAt ?? (() => 0);
  const g = new THREE.Group(); g.name = 'stoneWall';
  const kit = new Kit();
  const moss = new THREE.Color('#8a9a58');
  const stoneCol = () => new THREE.Color(pick(r, SAIL.flag)).lerp(new THREE.Color('#efe4cc'), r() * 0.35).multiplyScalar(0.9 + r() * 0.12);
  // the core: mortar and rubble behind the face stones, following the ground in steps
  const nCore = Math.max(1, Math.ceil(length / 0.8));
  for (let i = 0; i < nCore; i++) { const x0 = (i / nCore) * length, x1 = ((i + 1) / nCore) * length, xm = (x0 + x1) / 2; kit.add(new THREE.BoxGeometry(x1 - x0 + 0.02, Hh - 0.08, Dd * 0.82), 'plain', '#6a5a46', T(xm, hAt(xm) + (Hh - 0.08) / 2 - 0.02, 0)); }
  let y = 0, row = 0;
  while (y < Hh - 0.14) {
    const ch = Math.min(Hh - 0.1 - y, 0.12 + r() * 0.14);
    if (ch < 0.06) break;
    let x = row % 2 ? -0.12 : 0;
    while (x < length) {
      const len = Math.min(length - x, r() < 0.2 ? 0.16 + r() * 0.1 : 0.3 + r() * 0.36);
      const xs = Math.max(0, x), le = x + len - xs;
      if (le > 0.08) {
        if (len < 0.27 && ch > 0.16) {
          // two small fillers stacked
          for (const [yy, hh] of [[0, ch * 0.5], [ch * 0.5, ch * 0.5]]) kit.add(blockGeo(le - 0.025, hh - 0.022, Dd * (0.9 + r() * 0.1), 0.014), 'rough', stoneCol(), T(xs + le / 2, hAt(xs + le / 2) + y + yy + hh / 2, (r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.06, (r() - 0.5) * 0.05));
        } else kit.add(blockGeo(le - 0.025, ch - 0.022, Dd * (0.9 + r() * 0.1), 0.02), 'rough', stoneCol(), T(xs + le / 2, hAt(xs + le / 2) + y + ch / 2, (r() - 0.5) * 0.03, (r() - 0.5) * 0.03, (r() - 0.5) * 0.06, (r() - 0.5) * 0.04));
      }
      x += len;
    }
    y += ch; row++;
  }
  // coping: flat stones laid across, mossy on top
  for (let x = 0; x < length;) {
    const len = Math.min(length - x, 0.35 + r() * 0.25);
    const geo = blockGeo(len - 0.025, 0.11, Dd + 0.1, 0.025);
    const cg = stoneCol().multiplyScalar(0.94);
    const pa = geo.attributes.position as THREE.BufferAttribute, cols = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) { const c = pa.getY(i) > 0.03 && r() < 0.7 ? cg.clone().lerp(moss, 0.3 + r() * 0.25) : cg; cols.set([c.r, c.g, c.b], i * 3); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    kit.add(geo, 'rough', null, T(x + len / 2, hAt(x + len / 2) + y + 0.055, 0, 0, 0, (r() - 0.5) * 0.05));
    x += len;
  }
  // ivy spilling down the face and tufts at the foot
  if (opts.ivy !== false) {
    for (let k = 0; k < Math.ceil(length / 2.5); k++) {
      const x0 = r() * length, pts: WallPoint[] = [];
      for (let i = 0; i < 4; i++) pts.push({ p: new THREE.Vector3(x0 + (r() - 0.5) * 0.3, hAt(x0) + y - 0.05 - i * 0.15, Dd / 2 + 0.02), n: new THREE.Vector3(0, 0.1, 1).normalize(), s: 0.9 - i * 0.15 });
      addIvy(kit, pts, r, { perPoint: 5 });
    }
    for (let x = 0.3; x < length; x += 0.6 + r() * 0.9) addLeafMass(kit, T(x, hAt(x) + 0.14, Dd / 2 + 0.12), r, { radius: 0.2 + r() * 0.1, squash: 0.7, color: pick(r, SAIL.green), ao: 0.45 });
  }
  kit.build(g, { inkWidth: 0.008 });
  g.userData.top = y + 0.11;
  return g;
}

/** Sutherland-Hodgman: keep the part of polygon `poly` where (p - o)·n <= 0. */
function clipHalf(poly: [number, number][], ox: number, oy: number, nx: number, ny: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = (a[0] - ox) * nx + (a[1] - oy) * ny, db = (b[0] - ox) * nx + (b[1] - oy) * ny;
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

export interface PathOpts {
  /** Mean flagstone size (m). */
  stone?: number;
  /** Share of stones missing (moss shows) and cracked in two. */
  missing?: number;
  cracked?: number;
}

/**
 * A flagstone lane along `points` (local, on the ground), `width` wide: irregular warm sand and ochre stones that fit
 * together (a Voronoi tiling of the band), each with its own gradient, worn darker edges and a slight height and tilt
 * jitter; dark mossy joints between them; a few cracked or missing stones; a ragged border.
 * userData: edges (points along both borders with their outward normal, for grass to spill over), holes (missing
 * stones), dist(x, z) (signed distance to the border, negative inside), tris.
 */
export function pavedPath(points: THREE.Vector3[], width = 1.4, seed = 4, heightAt?: (x: number, z: number) => number, opts: PathOpts = {}): THREE.Group {
  const r = rng(seed);
  const g = new THREE.Group(); g.name = 'pavedPath';
  const kit = new Kit();
  const hAt = heightAt ?? ((_x: number, _z: number) => 0);
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.4);
  const L = curve.getLength(), W = width, sz = opts.stone ?? 0.5;
  // frames along the lane, for mapping (s, t) to the ground
  const M = Math.max(8, Math.ceil(L / 0.1));
  const FP: THREE.Vector3[] = [], FN: THREE.Vector3[] = [];
  for (let i = 0; i <= M; i++) {
    const u = i / M, p = curve.getPointAt(u), tg = curve.getTangentAt(u); tg.y = 0; tg.normalize();
    FP.push(p); FN.push(new THREE.Vector3(-tg.z, 0, tg.x));
  }
  const world = (s: number, t: number, out = new THREE.Vector3()) => {
    const f = Math.max(0, Math.min(M - 1e-6, (s / L) * M)), i = Math.floor(f), k = f - i;
    const px = FP[i].x + (FP[i + 1].x - FP[i].x) * k, pz = FP[i].z + (FP[i + 1].z - FP[i].z) * k;
    const nx = FN[i].x + (FN[i + 1].x - FN[i].x) * k, nz = FN[i].z + (FN[i + 1].z - FN[i].z) * k;
    return out.set(px + nx * t, 0, pz + nz * t);
  };
  const ragged = (s: number, side: number) => 0.07 * (Math.sin(s * 2.1 + seed + side * 3) + 0.6 * Math.sin(s * 5.3 + side * 1.7 + seed * 2));
  // seeds: a jittered grid in (s, t), with a few left out so some stones are bigger
  // rows of uneven length and uneven count across: long slabs where a row has few seeds, small fillers where it has many
  const nA = Math.max(2, Math.round(W / (sz * 0.92)));
  const seeds: [number, number][] = [];
  for (let s = sz * 0.3; s < L; s += sz * (0.55 + r() * 0.75)) {
    const na = Math.max(1, nA + Math.floor(r() * 3) - 1);
    for (let j = 0; j < na; j++) {
      if (r() < 0.14) continue;
      seeds.push([s + (r() - 0.5) * sz * 0.6, -W / 2 + (j + 0.5) * (W / na) + (r() - 0.5) * (W / na) * 0.6]);
    }
    if (r() < 0.25) seeds.push([s + sz * 0.35, (r() - 0.5) * W * 0.8]);   // a small filler
  }
  const holes: THREE.Vector3[] = [];
  const pos: number[] = [], nor: number[] = [], cl: number[] = [], idx: number[] = [];
  const mossC = new THREE.Color('#8a9656'), tmp = new THREE.Vector3();
  const addStone = (poly: [number, number][], base: THREE.Color) => {
    // centroid, gap inset and one round of corner cutting
    let cx = 0, cy = 0; for (const [a, b] of poly) { cx += a; cy += b; } cx /= poly.length; cy /= poly.length;
    const inset = (pts: [number, number][], d: number) => pts.map(([a, b]) => { const dx = a - cx, dy = b - cy, l = Math.hypot(dx, dy) || 1; const k = Math.max(0.2, 1 - d / l); return [cx + dx * k, cy + dy * k] as [number, number]; });
    let pg = inset(poly, 0.02);
    const ch: [number, number][] = [];
    for (let i = 0; i < pg.length; i++) { const a = pg[i], b = pg[(i + 1) % pg.length]; ch.push([a[0] * 0.86 + b[0] * 0.14, a[1] * 0.86 + b[1] * 0.14], [a[0] * 0.14 + b[0] * 0.86, a[1] * 0.14 + b[1] * 0.86]); }
    pg = ch;
    const top = inset(pg, 0.05);
    const c0 = world(cx, cy);
    const y0 = hAt(c0.x, c0.z) + 0.045 + (r() - 0.5) * 0.02;
    const tiltX = (r() - 0.5) * 0.05, tiltZ = (r() - 0.5) * 0.05;
    const gdir = r() * Math.PI * 2, gx = Math.cos(gdir), gy = Math.sin(gdir);
    const mossy = r() < 0.35;
    const P = (st: [number, number], dy: number) => { const w = world(st[0], st[1], tmp); return [w.x, y0 + dy + (w.x - c0.x) * tiltX + (w.z - c0.z) * tiltZ, w.z]; };
    const colAt = (st: [number, number], k: number) => {
      const g2 = ((st[0] - cx) * gx + (st[1] - cy) * gy) / sz;
      const c = base.clone().multiplyScalar(k * (1 + g2 * 0.12));
      return c;
    };
    const vi = pos.length / 3;
    // centre
    const pc = P([cx, cy], 0.0); pos.push(...pc); nor.push(0, 1, 0); const cc = colAt([cx, cy], 1.03); cl.push(cc.r, cc.g, cc.b);
    const n = pg.length;
    for (let i = 0; i < n; i++) { const p = P(top[i], 0); pos.push(...p); nor.push(0, 1, 0); const c = colAt(top[i], 1); cl.push(c.r, c.g, c.b); }
    for (let i = 0; i < n; i++) {
      const p = P(pg[i], -0.016); pos.push(...p);
      const w = world(pg[i][0], pg[i][1]); const ox = w.x - c0.x, oz = w.z - c0.z, ol = Math.hypot(ox, oz) || 1;
      // a soft worn edge: barely tipped, barely darker, so a slab lies flat instead of puffing up
      const nn = new THREE.Vector3(ox / ol * 0.3, 1, oz / ol * 0.3).normalize(); nor.push(nn.x, nn.y, nn.z);
      const c = colAt(pg[i], 0.93); if (mossy && r() < 0.6) c.lerp(mossC, 0.35); cl.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < n; i++) {
      const p = P(pg[i], -0.075); pos.push(...p);
      const w = world(pg[i][0], pg[i][1]); const ox = w.x - c0.x, oz = w.z - c0.z, ol = Math.hypot(ox, oz) || 1;
      nor.push(ox / ol, 0.2, oz / ol);
      const c = colAt(pg[i], 0.72); cl.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, t0 = vi + 1 + i, t1 = vi + 1 + j, o0 = vi + 1 + n + i, o1 = vi + 1 + n + j, b0 = vi + 1 + 2 * n + i, b1 = vi + 1 + 2 * n + j;
      idx.push(vi, t1, t0, t0, t1, o1, t0, o1, o0, o0, o1, b1, o0, b1, b0);
    }
  };
  for (let i = 0; i < seeds.length; i++) {
    const [s, t] = seeds[i];
    let poly: [number, number][] = [[s - sz * 1.4, -W / 2 - 0.3], [s + sz * 1.4, -W / 2 - 0.3], [s + sz * 1.4, W / 2 + 0.3], [s - sz * 1.4, W / 2 + 0.3]];
    for (let j = 0; j < seeds.length; j++) {
      if (j === i) continue;
      const [s2, t2] = seeds[j];
      if (Math.abs(s2 - s) > sz * 2.2) continue;
      poly = clipHalf(poly, (s + s2) / 2, (t + t2) / 2, s2 - s, t2 - t);
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    // the ragged border and the ends
    poly = clipHalf(poly, 0, -W / 2 - ragged(s, -1), 0, -1);
    poly = clipHalf(poly, 0, W / 2 + ragged(s, 1), 0, 1);
    poly = clipHalf(poly, 0, 0, -1, 0);
    poly = clipHalf(poly, L, 0, 1, 0);
    if (poly.length < 3) continue;
    let area = 0; for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; }
    area = Math.abs(area) / 2;
    if (area < 0.03) continue;
    if (r() < (opts.missing ?? 0.035)) { holes.push(world(s, t).setY(0)); continue; }
    const base = new THREE.Color(pick(r, SAIL.flag)).multiplyScalar(0.93 + r() * 0.12);
    if (r() < (opts.cracked ?? 0.07)) {
      const a = r() * Math.PI, nx = Math.cos(a), ny = Math.sin(a);
      const A = clipHalf(poly, s + nx * 0.012, t + ny * 0.012, -nx, -ny), B = clipHalf(poly, s - nx * 0.012, t - ny * 0.012, nx, ny);
      if (A.length >= 3) addStone(A, base);
      if (B.length >= 3) addStone(B, base.clone().multiplyScalar(0.96));
    } else addStone(poly, base);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  sg.setIndex(idx);
  kit.add(orient(sg), 'plain', null);
  // the joint bed under the stones: moss and earth
  {
    const jp: number[] = [], jc: number[] = [], ji: number[] = [];
    const moss = new THREE.Color('#4a5630'), earth = new THREE.Color('#6a5a40');
    for (let i = 0; i <= M; i++) {
      const s = (i / M) * L;
      for (const side of [-1, 1]) {
        const w = world(s, side * (W / 2 + 0.06 + Math.max(0, ragged(s, side))));
        jp.push(w.x, hAt(w.x, w.z) + 0.028, w.z);
        const c = moss.clone().lerp(earth, 0.5 + 0.5 * Math.sin(s * 1.3 + side));
        jc.push(c.r, c.g, c.b);
      }
      if (i) { const a = (i - 1) * 2; ji.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const jg = new THREE.BufferGeometry();
    jg.setAttribute('position', new THREE.Float32BufferAttribute(jp, 3));
    jg.setAttribute('color', new THREE.Float32BufferAttribute(jc, 3));
    jg.setIndex(ji); jg.computeVertexNormals();
    const nn = jg.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
    kit.add(jg, 'plain', null);
  }
  kit.build(g, { outline: false });
  // borders for grass to spill over, and a distance function for masks
  const edges: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
  for (let s = 0; s < L; s += 0.18) for (const side of [-1, 1]) {
    const f = Math.min(M, Math.round((s / L) * M));
    edges.push({ p: world(s, side * (W / 2 + ragged(s, side))), n: FN[f].clone().multiplyScalar(side) });
  }
  const grid = new Map<string, number[]>();
  FP.forEach((p, i) => { const k = `${Math.floor(p.x / 2)},${Math.floor(p.z / 2)}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(i); });
  g.userData.dist = (x: number, z: number) => {
    let best = 1e9, bi = -1;
    const gx = Math.floor(x / 2), gz = Math.floor(z / 2);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const i of grid.get(`${gx + dx},${gz + dz}`) ?? []) { const d = (FP[i].x - x) ** 2 + (FP[i].z - z) ** 2; if (d < best) { best = d; bi = i; } }
    if (bi < 0) return 99;
    const t = (x - FP[bi].x) * FN[bi].x + (z - FP[bi].z) * FN[bi].z;
    const along = Math.abs((x - FP[bi].x) * FN[bi].z - (z - FP[bi].z) * FN[bi].x);
    return Math.max(Math.abs(t) - W / 2, (bi === 0 || bi === M) ? along : -99);
  };
  g.userData.edges = edges;
  g.userData.holes = holes;
  g.userData.tris = kit.tris;
  return g;
}

// ---------------------------------------------------------------- race gate

export interface GateOpts { seed?: number; height?: number; radius?: number; tubes?: number; pennants?: readonly string[] }

/**
 * A ring swept round a circle of radius R in the XY plane from a smooth closed profile [radial, z] (counter-clockwise
 * seen with +radial right and +z up), with smooth normals and UVs for the engraving: U runs round the ring in metres,
 * V comes from `band(i)` per profile point (0.3..0.7 on engraved faces, 0.02 elsewhere).
 */
function ringLathe(R: number, profile: [number, number][], segs: number, band: (i: number) => number, color: THREE.Color) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const n = profile.length;
  const pn: [number, number][] = profile.map((_, i) => {
    const a = profile[(i - 1 + n) % n], b = profile[(i + 1) % n];
    let nr = b[1] - a[1], nz = -(b[0] - a[0]); const l = Math.hypot(nr, nz) || 1; nr /= l; nz /= l;
    return [nr, nz];
  });
  for (let i = 0; i <= segs; i++) {
    const phi = (i / segs) * Math.PI * 2, c = Math.cos(phi), s = Math.sin(phi);
    for (let k = 0; k < n; k++) {
      const [pr, pz] = profile[k], [nr, nz] = pn[k];
      pos.push((R + pr) * c, (R + pr) * s, pz); nor.push(nr * c, nr * s, nz);
      uv.push(phi * R / 0.9, band(k));
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < n; k++) {
    const a = i * n + k, b = i * n + (k + 1) % n, c = a + n, d = b + n;
    idx.push(a, c, d, a, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return tint(orient(g), color);
}

/**
 * The golden race gate of the kite-wing race (picture 3): a slender ring of satin brass, lathe-profiled (a rounded
 * section with fine beads and grooves, a vine scroll engraved round its faces), hung like a bell from the gallows arm
 * of a tall carved pole and steadied by a side stay. From eyelets along its lower inner rim hang seven long chime
 * tubes, pewter and brass by turns, at staggered lengths across the ring's width (a racer flies through the open
 * upper half and the wake sets them ringing). The pole is wrapped in a striped cloth sleeve and flies long pennants.
 * The ring faces ±Z (fly along Z through it). userData.chime rings the tubes; userData.center is the ring centre
 * (local); userData.radius its clear inner radius.
 */
export function raceGate(opts: GateOpts = {}): THREE.Group {
  const seed = opts.seed ?? 1, r = rng(seed);
  const R = opts.radius ?? 2.3, cy = opts.height ?? 8.4;
  const g = new THREE.Group(); g.name = 'raceGate';
  const kit = new Kit();
  const a = 0.15, b = 0.12;   // the ring section: half-width across (radial) and half-depth (along Z)
  const brass = new THREE.Color('#e2b458'), deep = new THREE.Color('#b8893a'), bright = new THREE.Color('#f3d488');
  // the section: a rounded box with a bead on each corner and a groove either side of the engraved band
  const prof: [number, number][] = [];
  const N = 40;
  const band: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2, c = Math.cos(t), s2 = Math.sin(t);
    // superellipse: flat faces, round corners
    let pr = a * Math.sign(c) * Math.pow(Math.abs(c), 0.45), pz = b * Math.sign(s2) * Math.pow(Math.abs(s2), 0.45);
    // grooves at the shoulders, a bead proud of each corner
    const corner = Math.abs(Math.abs(t % (Math.PI / 2) - Math.PI / 4));
    const k = corner < 0.12 ? 1.06 : (corner > 0.42 && corner < 0.58 ? 0.94 : 1);
    pr *= k; pz *= k;
    prof.push([pr, pz]);
    // engraved: the outer face (t near 0) and both broad faces (t near ±pi/2)
    const onOuter = Math.abs(Math.atan2(s2, c)) < 0.5, onFace = Math.abs(Math.abs(Math.atan2(s2, c)) - Math.PI / 2) < 0.45;
    band.push(onOuter ? 0.5 + Math.atan2(s2, c) / 0.5 * 0.2 : onFace ? 0.5 + (Math.abs(Math.atan2(s2, c)) - Math.PI / 2) / 0.45 * 0.2 : 0.02);
  }
  kit.add(ringLathe(R, prof, 120, i => band[i], brass), 'satin', null, T(0, cy, 0));
  // fine bright beading round both faces, and a darker fillet inside
  for (const z of [b + 0.004, -b - 0.004]) kit.add(new THREE.TorusGeometry(R + a * 0.55, 0.011, 5, 120), 'brass', bright, T(0, cy, z));
  kit.add(new THREE.TorusGeometry(R - a * 1.0, 0.014, 5, 120), 'brass', deep, T(0, cy, 0));

  // the pole beside the ring: a stone plinth, a carved and turned shaft, brass collars
  const px = R + a + 1.05, poleTop = cy + R + 2.0, armY = cy + R + 0.62;
  kit.add(wobble(lathe([[0.82, 0], [0.82, 0.26], [0.64, 0.3], [0.64, 0.55], [0.42, 0.58], [0.42, 0.74], [0.3, 0.76]], 18, STONE_TILE), 0.015, 3, seed), 'stone', SAIL.stone, T(px, 0, 0));
  const shaftR = (y: number) => 0.24 - 0.08 * ((y - 0.76) / (poleTop - 0.76));
  const pp: [number, number][] = [];
  for (let i = 0; i <= 60; i++) {
    const y = 0.76 + (poleTop - 0.76) * (i / 60);
    const bead = Math.max(0, Math.cos(((y - 0.76) % 1.6) / 1.6 * Math.PI * 2)) ** 14 * 0.035;
    pp.push([shaftR(y) + bead, y]);
  }
  kit.add(lathe(pp, 14, WOOD_TILE), 'wood', '#7a5434', T(px, 0, 0));
  for (const y of [1.25, cy - 1.0, armY - 0.32, armY + 0.32, poleTop - 0.15]) kit.add(lathe([[shaftR(y) + 0.01, y - 0.07], [shaftR(y) + 0.04, y - 0.04], [shaftR(y) + 0.04, y + 0.04], [shaftR(y) + 0.01, y + 0.07]], 16, 1), 'brass', brass, T(px, 0, 0));
  kit.add(new THREE.SphereGeometry(0.16, 14, 10), 'brass', brass, T(px, poleTop + 0.1, 0));
  kit.add(new THREE.ConeGeometry(0.06, 0.42, 10), 'brass', brass, T(px, poleTop + 0.42, 0));
  // the gallows arm out over the ring, a curved brace under it, and a scroll at its tip
  const armL = px + 0.25;
  kit.add(boxM(armL, 0.16, 0.14, WOOD_TILE), 'wood', '#6e4a2e', T(px - armL / 2 + 0.12, armY, 0));
  kit.add(boxM(armL - 0.2, 0.04, 0.16, WOOD_TILE), 'brass', deep, T(px - armL / 2 + 0.2, armY + 0.1, 0));
  {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10, ang = t * Math.PI / 2; pts.push(new THREE.Vector3(px - 1.4 * Math.sin(ang), armY - 1.4 + 1.4 * (1 - Math.cos(ang)), 0)); }
    kit.add(ropeGeo(pts, 0.05, 6), 'wood', '#6e4a2e');
    const sc: THREE.Vector3[] = [];
    for (let k = 0; k <= 16; k++) { const t = k / 16, ang = t * Math.PI * 2.2, rr = 0.2 * (1 - t * 0.7); sc.push(new THREE.Vector3(-0.15 - Math.sin(ang) * rr, armY - 0.2 + Math.cos(ang) * rr, 0)); }
    kit.add(ropeGeo(sc, 0.022, 5), 'brass', brass);
  }
  // the hanger: a brass strap from the arm down to a shackle on the ring's crown
  const crown = cy + R + a;
  kit.add(boxM(0.06, armY - crown, 0.05, 1), 'brass', deep, T(0, (armY + crown) / 2, 0.07));
  kit.add(boxM(0.06, armY - crown, 0.05, 1), 'brass', deep, T(0, (armY + crown) / 2, -0.07));
  kit.add(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10).rotateX(Math.PI / 2), 'brass', bright, T(0, crown + 0.06, 0));
  // the side stay: a brass rod from the pole to a clamp on the ring's flank
  {
    const sy = cy - 0.2, rx = R + a;
    kit.add(new THREE.CylinderGeometry(0.035, 0.035, px - rx, 10).rotateZ(Math.PI / 2), 'brass', deep, T((px + rx) / 2, sy, 0));
    kit.add(new THREE.BoxGeometry(0.12, 0.3, b * 2 + 0.06), 'brass', deep, T(rx + 0.02, sy, 0));
    kit.add(lathe([[shaftR(sy) + 0.01, sy - 0.08], [shaftR(sy) + 0.05, sy - 0.05], [shaftR(sy) + 0.05, sy + 0.05], [shaftR(sy) + 0.01, sy + 0.08]], 16, 1), 'brass', brass, T(px, 0, 0));
  }
  // eyelets along the lower inner rim, where the tubes hang
  const n = Math.max(5, Math.min(8, opts.tubes ?? 7));
  const tubeAng: number[] = [];
  for (let i = 0; i < n; i++) tubeAng.push(-Math.PI + Math.PI * (0.16 + 0.68 * (i / (n - 1))));
  for (const th of tubeAng) kit.add(new THREE.TorusGeometry(0.035, 0.01, 4, 10), 'brass', bright, T((R - a) * Math.cos(th), cy + (R - a) * Math.sin(th) - 0.03, 0, 0, Math.PI / 2, 0));
  kit.build(g, { inkWidth: 0.012 });

  // the striped cloth sleeve on the pole: a helix of red over cream (woven in the cloth shader), static
  {
    const sk = new Kit();
    const y0 = 1.45, y1 = cy - 1.2, segs = 18, rows = 40;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [], pat: number[] = [];
    const P = patAttr({ kind: 'stripes', accent: (opts.pennants ?? ['#e0473b'])[0], period: 0.34 });
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= segs; i++) {
      const y = y0 + (y1 - y0) * (j / rows), ang = (i / segs) * Math.PI * 2, rr = shaftR(y) + 0.018;
      pos.push(px + Math.cos(ang) * rr, y, Math.sin(ang) * rr);
      // U wraps round and climbs with height, so the stripes spiral
      uv.push((ang * 0.24 + y * 0.55) / LINEN_TILE, y / LINEN_TILE); pat.push(...P);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < segs; i++) { const a0 = j * (segs + 1) + i; idx.push(a0, a0 + segs + 1, a0 + 1, a0 + 1, a0 + segs + 1, a0 + segs + 2); }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg.setAttribute('aPat', new THREE.Float32BufferAttribute(pat, 4));
    sg.setIndex(idx); sg.computeVertexNormals();
    sk.add(orient(sg), 'cloth', '#f6efe2');
    // blue binding bands at both ends of the sleeve
    for (const y of [y0, y1]) sk.add(lathe([[shaftR(y) + 0.02, y - 0.06], [shaftR(y) + 0.035, y], [shaftR(y) + 0.02, y + 0.06]], 16, 1), 'plain', (opts.pennants ?? ['', '', '#3f78c8'])[2] ?? '#3f78c8');
    sk.build(g, { outline: false });
  }

  // pennants and streamers: long tapering flags from the pole top, ribbons from the arm, waving along their length
  const ck = new Kit();
  const streamer = (at: THREE.Vector3, len: number, wid: number, cols: THREE.Color[], ph: number, dir: THREE.Vector3, droop: number, taper = 0.5) => {
    const pos: number[] = [], nor: number[] = [], cl: number[] = [], wv: number[] = [], dr: number[] = [], idx: number[] = [];
    const sn = 20, side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    for (let i = 0; i <= sn; i++) {
      const t = i / sn, w = wid * (1 - t * taper);
      const c = at.clone().addScaledVector(dir, t * len).add(new THREE.Vector3(0, -droop * t * t * len, 0));
      for (const sgn of [-1, 1]) {
        const fork = taper < 0.9 && t > 0.86 ? sgn * (t - 0.86) * 0.7 : 0;
        const p = c.clone().add(new THREE.Vector3(0, sgn * w / 2 + fork - (taper >= 0.9 ? w / 2 : 0), 0));
        pos.push(p.x, p.y, p.z); nor.push(side.x, side.y, side.z);
        const cc = cols[Math.floor(t * cols.length * 0.999)];
        cl.push(cc.r, cc.g, cc.b);
        wv.push(0.06 + t * 0.55, ph - t * 5.5, 0.25); dr.push(side.x, 0.3, side.z);
      }
      if (i < sn) { const a0 = i * 2; idx.push(a0, a0 + 1, a0 + 3, a0, a0 + 3, a0 + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    geo.setAttribute('aWave', new THREE.Float32BufferAttribute(wv, 3));
    geo.setAttribute('aDir', new THREE.Float32BufferAttribute(dr, 3));
    geo.setIndex(idx);
    ck.add(geo, 'cloth', null);
  };
  const pens = opts.pennants ?? ['#e0473b', '#f2c53d', '#3f78c8', '#f08a32'];
  const PC = pens.map(c => new THREE.Color(c)), cream = new THREE.Color('#f6efe2');
  const out = new THREE.Vector3(1, 0, 0.3).normalize();
  // three long pennants, tapering to a point, from staffs near the top of the pole
  const Y = new THREE.Vector3(0, 1, 0);
  streamer(new THREE.Vector3(px + 0.1, poleTop - 0.25, 0), 4.6, 0.66, [PC[0], cream, PC[0]], 0, out, 0.1, 0.98);
  streamer(new THREE.Vector3(px + 0.1, poleTop - 1.05, 0.04), 3.9, 0.56, [PC[2], PC[1]], 1.7, out.clone().applyAxisAngle(Y, 0.75).add(new THREE.Vector3(0, -0.25, 0)).normalize(), 0.12, 0.98);
  streamer(new THREE.Vector3(px + 0.1, poleTop - 1.75, -0.04), 3.3, 0.48, [PC[3], cream, PC[1]], 3.1, out.clone().applyAxisAngle(Y, -0.7).add(new THREE.Vector3(0, -0.35, 0)).normalize(), 0.16, 0.98);
  // a ribbon from the side stay
  streamer(new THREE.Vector3(R + a + 0.4, cy - 0.25, 0.04), 2.2, 0.12, [PC[2], cream], 2.4, new THREE.Vector3(0.3, -1, 0.3).normalize(), 0.05, 0.4);
  ck.build(g, { outline: false });

  // the chimes: long tubes hanging from the lower inner rim, staggered, pewter and brass by turns
  const tubeK = 3.6;   // tube radius 0.021 x 3.6 = 7.5 cm
  const pew = new THREE.InstancedMesh(chimeTubeGeo(tubeK), townMat('chrome'), n);
  const bra = new THREE.InstancedMesh(chimeTubeGeo(tubeK), townMat('brass'), n);
  for (const m of [pew, bra]) { m.castShadow = true; m.frustumCulled = false; m.count = 0; }
  const attach: THREE.Vector3[] = [], len: number[] = [], slots: [THREE.InstancedMesh, number][] = [];
  const lens = [1.35, 1.75, 2.05, 2.3, 1.95, 1.6, 1.25, 1.05];
  for (let i = 0; i < n; i++) {
    const th = tubeAng[i];
    attach.push(new THREE.Vector3((R - a) * Math.cos(th), (R - a) * Math.sin(th) - 0.05, 0));
    len.push(lens[i % lens.length] * (0.95 + r() * 0.1));
    const isBrass = i % 2 === 1, m = isBrass ? bra : pew;
    m.setColorAt(m.count, new THREE.Color(isBrass ? '#e8bc5c' : pick(r, ['#d0d8e0', '#c8d2dc', '#d8dee4'])));
    slots.push([m, m.count++]);
  }
  for (const m of [pew, bra]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  const body = new THREE.Group(); body.add(pew, bra); g.add(body);
  body.position.set(0, cy, 0);
  const chime = new Chime(g, body, slots, attach, len, seed + 9, 0.3, 0.45, false);
  g.userData.chime = chime;
  g.userData.update = (dt: number, t: number) => chime.update(dt, t);
  chime.update(0, 0);
  g.userData.center = new THREE.Vector3(0, cy, 0);
  g.userData.radius = R - a;
  g.userData.tris = kit.tris + ck.tris;
  return g;
}

// ---------------------------------------------------------------- stats

/** Draw calls and triangles under an object (instances counted), split into ink hulls and the rest. */
export function propStats(o: THREE.Object3D) {
  let draws = 0, tris = 0, inkDraws = 0, inkTris = 0;
  o.traverse(x => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    const n = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * ((x as THREE.InstancedMesh).isInstancedMesh ? (x as THREE.InstancedMesh).count : 1);
    if (m.userData.isOutline) { inkDraws++; inkTris += n; } else { draws++; tris += n; }
  });
  return { draws, tris: Math.round(tris), inkDraws, inkTris: Math.round(inkTris) };
}

// ---------------------------------------------------------------- re-exports for convenience

export { FloraField, meadow, flowerBed, plantGeo, PETALS, GRASS, type MeadowOpts, type BedOpts, type PlantKind, type FlowerKind } from './sailtownFlora';
export { townTree, hedge, addLeafMass, addHydrangeaBush, addRoses, addIvy, HYDRANGEA, ROSES, type TreeOpts } from './sailtownGreen';
export { CLOTH } from './sailtownKit';
