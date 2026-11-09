import * as THREE from 'three';
import { leafClump } from '../../render/foliage';
import {
  Kit, T, rng, pick, type Rnd, uvMetres, boxM, archShape, archRing, archTop, ropeGeo, sagLine, clothGrid, wobble, tint, townMat,
  WALL_TILE, STONE_TILE, WOOD_TILE,
} from './sailtownKit';
import { roseGeo, hydrangeaGeo, blossomGeo, flowerGeo, type FlowerKind } from './sailtownFlora';

/**
 * Sailtown, the windfolk village (World 2, Sky Isles): round cream stone cottages under blue scalloped slate,
 * windmills whose lattice sails turn, wind chimes at the doors, laundry and bunting in the wind, the market stall,
 * the arched footbridge, fences, planters, and the golden race gate of the kite-wing race.
 *
 * Every builder returns a THREE.Group with its static parts merged into one mesh per material (a cottage is about
 * ten draw calls with its ink). Anything that moves sets userData.update(dt, t); cloth (sheets, flags, pennants,
 * awning) moves in the vertex shader and costs nothing per frame. Put everything in a TownAnimator to run it all:
 *
 *   const town = new TownAnimator();
 *   scene.add(town.add(roundCottage({ seed: 3 })));
 *   ...each frame: town.update(dt, t);   when Nilo passes a door: town.ringNear(niloPos, 1.5);
 */

// ---------------------------------------------------------------- palette

export const SAIL = {
  wall: '#f4e8d0', wallWarm: '#f1dfc0', stone: '#e8dbc0', stoneDark: '#cdbb9b',
  slate: ['#5f7fb0', '#56739f', '#6d8fc0', '#4d6a98', '#7495c2', '#5a77a8'],
  timber: '#7a5434', timberDark: '#5a3c26', weathered: '#9a7a58', plank: '#a87a4e',
  door: ['#8a5a34', '#7a4e2e', '#94643a'], shutters: ['#c8794a', '#b8693c', '#5d84b4', '#7fa36a'],
  iron: '#3a3238', brass: '#e4b350', silver: '#d8dde4', glass: '#4a6886',
  festival: ['#e0473b', '#f2c53d', '#3f78c8', '#f08a32', '#f6efe2', '#6aae5a'],
  roses: ['#f592b4', '#f7b0c6', '#ee7aa2', '#fff4f6', '#f46a86'],
  box: ['#e8475e', '#f07aa0', '#ffffff', '#f2c53d', '#b48ae0'],
  green: ['#5c8c3e', '#4f7f38', '#6b9a46', '#46733a'],
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

/** Leafy mound with blossoms (flower boxes, foot of walls): leaf cards and bloom heads in one palette. */
function addBloomMound(kit: Kit, m: THREE.Matrix4, r: Rnd, w: number, d: number, h: number, palette: readonly string[], blooms = 10, trailing = 0) {
  kit.with(m, () => {
    const nC = Math.max(1, Math.round(w / 0.3));
    for (let i = 0; i < nC; i++) {
      const x = -w / 2 + (i + 0.5) * (w / nC);
      const cl = leafClump({ radius: Math.min(0.24, h * 1.1), color: '#ffffff', cards: 10, squash: 0.7, seed: Math.floor(r() * 9999), core: false });
      kit.addClump(cl, pick(r, SAIL.green), T(x + (r() - 0.5) * 0.05, h * 0.6, (r() - 0.5) * d * 0.3, 0, r() * 6, 0, 1, 0.8, d / 0.42));
    }
    for (let i = 0; i < trailing; i++) {
      const cl = leafClump({ radius: 0.14, color: '#ffffff', cards: 6, squash: 1.4, seed: Math.floor(r() * 9999), core: false });
      kit.addClump(cl, pick(r, SAIL.green), T(-w / 2 + r() * w, -0.05 - r() * 0.15, d * 0.45, 0, 0, 0, 1, 1.5, 0.6));
    }
    for (let i = 0; i < blooms; i++) {
      const c = new THREE.Color(pick(r, palette));
      kit.add(blossomGeo(c, new THREE.Color('#f2c84a'), 1.5 + r() * 0.6), 'bloom', null,
        T(-w / 2 + r() * w, h * (0.8 + r() * 0.6), (r() - 0.3) * d * 0.7, -0.5 + r() * 0.3, r() * 6, (r() - 0.5) * 0.6));
    }
  });
}

// ---------------------------------------------------------------- slate roof

interface ConeRoof { eaveR: number; y0: number; height: number; seed: number; base?: readonly string[]; tileW?: number; courseH?: number; flare?: number }

/**
 * A conical roof of layered scalloped slates: courses of round-bottomed tiles, each tile its own shade of blue,
 * the lower edge lifted and given a thickness so every course casts a little step. Under it, a planked soffit.
 * Returns the apex height and the slope functions, so chimneys can sit on it.
 */
function slateCone(kit: Kit, o: ConeRoof) {
  const r = rng(o.seed);
  const pal = (o.base ?? SAIL.slate).map(c => new THREE.Color(c));
  // profile: y rises as k*s + (1-k)*s^2, shallow at the eaves and steeper toward the tip (a soft witch hat);
  // defined past the eave too (s < 0), where the bottom scallops hang
  const k = 1 / (o.flare ?? 1.3);
  const rad = (s: number) => o.eaveR * (1 - s);
  const yy = (s: number) => o.y0 + o.height * (k * s + (1 - k) * s * s);
  const dyds = (s: number) => o.height * (k + 2 * (1 - k) * s);
  const slant = Math.hypot(o.eaveR, o.height);
  const sMax = 0.9, courseH = o.courseH ?? 0.27, tileW = o.tileW ?? 0.3;
  const nC = Math.max(3, Math.round(slant * sMax / courseH));
  const ds = sMax / nC;
  const thick = 0.045, scallop = 0.075;
  const pos: number[] = [], nor: number[] = [], cl: number[] = [], idx: number[] = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3(), D = new THREE.Vector3();
  const normalAt = (th: number, s: number, out: THREE.Vector3) => out.set(Math.sin(th) * dyds(s), o.eaveR, Math.cos(th) * dyds(s)).normalize();
  const pointAt = (th: number, s: number, lift: number, out: THREE.Vector3) => {
    normalAt(th, s, N);
    return out.set(Math.sin(th) * rad(s), yy(s), Math.cos(th) * rad(s)).addScaledVector(N, lift);
  };
  const K = 4;
  for (let i = 0; i < nC; i++) {
    const sB = i * ds, sT = Math.min(sMax + 0.03, (i + 1) * ds + ds * 0.5);
    const rMid = rad(sB + ds * 0.5);
    const nT = Math.max(6, Math.round((Math.PI * 2 * rMid) / tileW));
    const off = (i % 2) * 0.5 + r() * 0.1;
    const gap = 0.012 / Math.max(0.2, rMid);
    for (let j = 0; j < nT; j++) {
      const th0 = ((j + off) / nT) * Math.PI * 2 + gap, th1 = ((j + 1 + off) / nT) * Math.PI * 2 - gap;
      const c = pal[Math.floor(r() * pal.length)].clone().multiplyScalar(0.9 + r() * 0.2);
      if (r() < 0.07) c.lerp(new THREE.Color('#a9b8c8'), 0.45);          // a weathered pale slate
      if (r() < 0.04 && i < 3) c.lerp(new THREE.Color('#7f9a5a'), 0.35);  // a touch of moss low down
      const lipC = c.clone().multiplyScalar(0.55);
      const liftJ = r() * 0.012, dropJ = (r() - 0.5) * 0.02;
      const tilt = (r() - 0.5) * 0.2;
      const base = pos.length / 3;
      for (let k = 0; k <= K; k++) {
        const f = k / K, th = th0 + (th1 - th0) * f;
        const drop = (scallop * Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2)) + dropJ) / slant;
        // top (under the course above), bottom (scalloped, lifted), lip (back down to the roof)
        const top = pointAt(th, sT, 0.004, new THREE.Vector3());
        const bot = pointAt(th, sB - drop, thick + liftJ, new THREE.Vector3());
        normalAt(th, sB, N);
        const lip = bot.clone().addScaledVector(N, -thick * 1.1);
        normalAt(th, (sB + sT) / 2, N);
        N.x += Math.cos(th) * tilt; N.z -= Math.sin(th) * tilt; N.normalize();
        // the lip faces down the slope
        D.set(Math.sin(th) * o.eaveR, -dyds(sB), Math.cos(th) * o.eaveR).normalize();
        pos.push(top.x, top.y, top.z, bot.x, bot.y, bot.z, lip.x, lip.y, lip.z);
        nor.push(N.x, N.y, N.z, N.x, N.y, N.z, D.x, D.y, D.z);
        cl.push(c.r * 0.9, c.g * 0.9, c.b * 0.9, c.r, c.g, c.b, lipC.r, lipC.g, lipC.b);
      }
      for (let k = 0; k < K; k++) {
        const a = base + k * 3, b = base + (k + 1) * 3;
        idx.push(a, a + 1, b + 1, a, b + 1, b);              // face
        idx.push(a + 1, a + 2, b + 2, a + 1, b + 2, b + 1);  // lip
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.setIndex(idx);
  // make the lip faces agree with their downslope normals and the faces with theirs
  kit.add(orient(g), 'slate', null);
  // a smooth dark cap where the courses meet, and the soffit underneath
  const capProf: [number, number][] = [];
  for (let i = 0; i <= 4; i++) { const s = sMax - 0.04 + (1 - sMax + 0.04) * (i / 4); capProf.push([rad(s) + 0.035 * (1 - i / 4) + 0.01, yy(s) + 0.03]); }
  kit.add(lathe(capProf, 16, 1), 'slate', new THREE.Color(pal[3]).multiplyScalar(0.85));
  const soff: [number, number][] = [];
  for (let i = 0; i <= 6; i++) { const s = (i / 6) * 0.95; soff.push([rad(s), yy(s) - 0.03]); }
  kit.add(lathe(soff, 40, WOOD_TILE, false), 'wood', '#8a6446');
  return { apex: yy(1), rad, yy, slant, nC };
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
        for (const s of [-1, 1]) kit.add(new THREE.BoxGeometry(0.04, 0.16, 0.18), 'plain', SAIL.iron, T(s * bw * 0.35, -bh / 2 - 0.05, -0.06, 0.6, 0, 0));
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
    // steps: a worn half-round slab and a wider one below
    const s1 = new THREE.CylinderGeometry(w * 0.85, w * 0.88, 0.15, 18, 1, false, -Math.PI / 2, Math.PI);
    uvMetres(s1, 1, 1, STONE_TILE * 0.5);
    kit.add(s1, 'stone', SAIL.stoneDark, T(0, -0.08, 0.1));
    const s2 = new THREE.CylinderGeometry(w * 1.15, w * 1.2, 0.15, 20, 1, false, -Math.PI / 2, Math.PI);
    uvMetres(s2, 1, 1, STONE_TILE * 0.5);
    kit.add(s2, 'stone', SAIL.stoneDark, T(0, -0.23, 0.12));
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
  /** Number of windows besides the door (1..5). */
  windows?: number;
  roses?: boolean;
  chimney?: boolean;
  /** Hang wind chimes beside the door. */
  chimes?: boolean;
  /** A whale weather vane on the roof tip. */
  vane?: boolean;
  /** Flower-box colours. */
  flowers?: readonly string[];
}

/**
 * A round windfolk cottage: a slightly tapered cylinder of cream plaster over stone, a broad cone of blue scalloped
 * slates with a deep overhang on timber rafters, an arched door at +Z with stone steps, shuttered windows with
 * flower boxes, climbing roses, a stone chimney, and optionally wind chimes and a whale weather vane.
 * userData: chimney (top of the flue, local), door (threshold, local), chime (Chime when chimes), radius.
 */
export function roundCottage(opts: CottageOpts = {}): THREE.Group {
  const seed = opts.seed ?? 1, r = rng(seed);
  const R = opts.radius ?? 2.3, H = opts.wallHeight ?? 2.9, taper = 0.93, Rt = R * taper;
  const roofH = opts.roofHeight ?? R * 1.05, over = opts.overhang ?? 0.75;
  const lean = Math.atan2(R - Rt, H);
  const rAt = (y: number) => R + (Rt - R) * (y / H);
  const g = new THREE.Group(); g.name = 'roundCottage';
  const kit = new Kit();

  // walls: a lathe with many rows, nudged by noise so it reads hand-built, with the doorway cut out at +Z
  const dw = 0.98, dh = 2.05;
  const prof: [number, number][] = [];
  for (let i = 0; i <= 12; i++) { const y = 0.3 + (H - 0.3) * (i / 12); prof.push([rAt(y), y]); }
  const doorCut = (a: number, y: number) => { const x = Math.sin(a) * R; return Math.cos(a) > 0 && Math.abs(x) < dw / 2 + 0.05 && y - 0.3 < archTop(dw + 0.1, dh + 0.05, x); };
  const wall = wobble(lathe(prof, 64, WALL_TILE, true, 0, Math.PI * 2, doorCut), 0.022, 2.1, seed);
  kit.add(wall, 'wall', new THREE.Color(opts.wall ?? SAIL.wall).multiplyScalar(0.97 + r() * 0.05));
  // stone footing, flared
  kit.add(wobble(lathe([[R + 0.16, -0.1], [R + 0.12, 0.2], [R + 0.04, 0.4]], 40, STONE_TILE), 0.02, 3, seed + 1), 'stone', SAIL.stoneDark);
  // timber wall plate and rafter tails under the eaves
  kit.add(lathe([[Rt + 0.05, H - 0.12], [Rt + 0.06, H + 0.06]], 40, WOOD_TILE), 'wood', SAIL.timberDark);
  const eaveR = Rt + over;
  const roofY0 = H + 0.02;
  // the roof
  const roof = slateCone(kit, { eaveR, y0: roofY0, height: roofH, seed: seed * 7 + 3 });
  // rafter ends under the soffit, following the slope, and a fascia board round the eave
  const sWall = 1 - (Rt + 0.05) / eaveR, sEnd = 0.07;
  const nRaf = Math.round((Math.PI * 2 * Rt) / 0.42);
  for (let i = 0; i < nRaf; i++) {
    const a = (i / nRaf) * Math.PI * 2;
    const r0 = roof.rad(sWall), r1 = roof.rad(sEnd), y0 = roof.yy(sWall) - 0.09, y1 = roof.yy(sEnd) - 0.09;
    const len = Math.hypot(r0 - r1, y0 - y1);
    kit.add(boxM(0.07, 0.09, len, WOOD_TILE), 'wood', SAIL.timber,
      T(Math.sin(a) * (r0 + r1) / 2, (y0 + y1) / 2, Math.cos(a) * (r0 + r1) / 2, 0, a, 0).multiply(T(0, 0, 0, Math.atan2(y0 - y1, r1 - r0), 0, 0)));
  }
  kit.add(lathe([[eaveR - 0.03, roofY0 - 0.14], [eaveR - 0.01, roofY0 + 0.02]], 48, WOOD_TILE), 'wood', SAIL.timberDark);
  // finial: a turned wooden knob and a brass ball
  kit.add(postGeo(0.04, 0.07, 0.35), 'wood', SAIL.timberDark, T(0, roof.apex + 0.12, 0));
  kit.add(new THREE.SphereGeometry(0.08, 10, 8), 'brass', SAIL.brass, T(0, roof.apex + 0.34, 0));

  // the door at +Z, set into the doorway
  addDoor(kit, T(0, 0.3, rAt(1.3) - 0.04, -lean, 0, 0), r, { w: dw, h: dh, color: opts.door ?? pick(r, SAIL.door) });
  g.userData.door = new THREE.Vector3(0, 0, R + 0.6);

  // windows round the wall, never over the door
  const shutter = opts.shutter ?? pick(r, SAIL.shutters);
  const nWin = Math.max(0, Math.min(5, opts.windows ?? 3));
  const winAngles = [0.95, -1.05, 2.1, -2.2, Math.PI].slice(0, nWin);
  winAngles.forEach((a, i) => {
    const y = 1.25, wy = y + 0.6;
    const m = T(Math.sin(a) * (rAt(wy) - 0.03), y, Math.cos(a) * (rAt(wy) - 0.03), 0, a, 0).multiply(T(0, 0, 0, -lean, 0, 0));
    addWindow(kit, m, r, { w: 0.68, h: 0.86, shutter, box: i < 3 ? (opts.flowers ?? SAIL.box) : null, arched: i % 2 === 1 });
  });

  // chimney through the back slope
  if (opts.chimney !== false) {
    const ca = 2.55 + r() * 0.4, s = 0.42;
    const cr = roof.rad(s) - 0.15, cy = roof.yy(s);
    const ch = 1.5;
    const cm = T(Math.sin(ca) * cr, cy - 0.5 + ch / 2, Math.cos(ca) * cr, 0, ca, 0);
    kit.with(cm, () => {
      const cg = wobble(boxM(0.6, ch, 0.6, STONE_TILE), 0.0, 1, 0);
      kit.add(cg, 'stone', SAIL.stone);
      kit.add(boxM(0.76, 0.1, 0.76, STONE_TILE), 'stone', SAIL.stoneDark, T(0, ch / 2 + 0.05, 0));
      kit.add(new THREE.CylinderGeometry(0.11, 0.13, 0.26, 8), 'plain', '#b8653f', T(0.1, ch / 2 + 0.22, 0.05));
      kit.add(new THREE.CylinderGeometry(0.09, 0.11, 0.2, 8), 'plain', '#a85a38', T(-0.14, ch / 2 + 0.19, -0.08));
    });
    g.userData.chimney = new THREE.Vector3(Math.sin(ca) * cr + 0.1, cy - 0.5 + ch + 0.4, Math.cos(ca) * cr);
  }

  // climbing roses: up one side of the door, over the arch, and spilling along the eave
  const roseSide = r() > 0.5 ? 1 : -1;
  if (opts.roses !== false) {
    const side = roseSide;
    const path: [number, number][] = [];   // [angle, y]
    const a0 = side * (dw / 2 + 0.35) / R;
    for (let y = 0.35; y < H - 0.1; y += 0.28) path.push([a0 + Math.sin(y * 2.3) * 0.05, y]);
    for (let k = 1; k <= 4; k++) path.push([a0 - side * k * 0.13, dh + 0.42 + Math.sin(k) * 0.08]);
    for (let k = 1; k <= 4; k++) path.push([a0 + side * k * 0.16, H - 0.15 - (k % 2) * 0.1]);
    for (const [a, y] of path) {
      const rr = rAt(y) + 0.06;
      const m = T(Math.sin(a) * rr, y, Math.cos(a) * rr, 0, a, 0);
      const cl = leafClump({ radius: 0.24 + r() * 0.1, color: '#ffffff', cards: 11, squash: 0.85, seed: Math.floor(r() * 9999), core: false });
      kit.addClump(cl, pick(r, SAIL.green), m.clone().multiply(T(0, 0, 0, 0, 0, r() * 3, 1, 1, 0.5)));
      const rc = new THREE.Color(pick(r, SAIL.roses.slice(0, 3)));
      for (let i = 0; i < 4; i++) {
        kit.add(roseGeo(rc.clone().multiplyScalar(0.92 + r() * 0.16), 1.0 + r() * 0.5), 'bloom', null,
          m.clone().multiply(T((r() - 0.5) * 0.4, (r() - 0.5) * 0.4, 0.1 + r() * 0.06, Math.PI / 2 - 0.3 + r() * 0.4, 0, r() * 6)));
      }
    }
  }
  // flowering bushes round the footing (not in front of the door)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.6 + r() * 0.3;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.45) continue;
    const m = T(Math.sin(a) * (R + 0.25), 0.25, Math.cos(a) * (R + 0.25), 0, a, 0);
    const cl = leafClump({ radius: 0.42 + r() * 0.15, color: '#ffffff', cards: 14, squash: 0.75, seed: Math.floor(r() * 9999), core: false });
    kit.addClump(cl, pick(r, SAIL.green), m);
    const fc = new THREE.Color(pick(r, ['#f07aa0', '#ffffff', '#b48ae0', '#f6a2bf']));
    for (let k = 0; k < 7; k++) kit.add(blossomGeo(fc.clone().multiplyScalar(0.9 + r() * 0.2), undefined, 1.2), 'bloom', null,
      m.clone().multiply(T((r() - 0.5) * 0.7, 0.05 + r() * 0.35, 0.15 + r() * 0.25, -0.7 + r() * 0.5, 0, (r() - 0.5))));
  }

  // chime bracket beside the door
  if (opts.chimes !== false) {
    const ca = -roseSide * (dw / 2 + 0.55) / R, cy = 2.45;   // on the side away from the roses
    const rr = rAt(cy);
    const bm = T(Math.sin(ca) * rr, cy, Math.cos(ca) * rr, 0, ca, 0);
    kit.with(bm, () => {
      kit.add(new THREE.BoxGeometry(0.035, 0.035, 0.42), 'plain', SAIL.iron, T(0, 0, 0.21));
      kit.add(new THREE.BoxGeometry(0.03, 0.3, 0.03), 'plain', SAIL.iron, T(0, -0.12, 0.04, -0.75, 0, 0));
      kit.add(new THREE.TorusGeometry(0.05, 0.008, 4, 10), 'plain', SAIL.iron, T(0, 0.0, 0.32, 0, Math.PI / 2, 0));
      kit.add(new THREE.BoxGeometry(0.12, 0.2, 0.03), 'plain', SAIL.iron, T(0, 0, 0.0));
    });
    const chimes = doorChimes({ seed: seed + 5, tubes: 6 });
    chimes.position.set(Math.sin(ca) * (rr + 0.4), cy - 0.02, Math.cos(ca) * (rr + 0.4));
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
  g.userData.radius = R + over;
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
  private tubes: THREE.InstancedMesh;
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
  constructor(root: THREE.Group, body: THREE.Group, tubes: THREE.InstancedMesh, attach: THREE.Vector3[], len: number[], seed: number, calm = 1, swing = 1) {
    this.root = root; this.body = body; this.tubes = tubes; this.n = attach.length; this.attach = attach; this.len = len; this.calm = calm; this.swing = swing;
    const r = rng(seed);
    for (let i = 0; i < this.n; i++) { this.phase.push(r() * 6.28); this.nextStrike.push(0); }
  }
  /** Set the chimes swinging (1 = a brush of the hand; 3 = a racer straight through). */
  ring(strength = 1) { this.energy = Math.min(3, this.energy + strength); }
  update(dt: number, t: number) {
    this.energy *= Math.exp(-dt * 0.9);
    const E = Math.min(this.energy, 2) * this.swing, k = this.calm;
    // the whole set sways on its hook
    this.body.rotation.x = (Math.sin(t * 1.3 + this.phase[0]) * 0.05 + 0.04) * k + E * 0.12 * Math.sin(t * 5.1);
    this.body.rotation.z = Math.sin(t * 0.9 + this.phase[1]) * 0.04 * k + E * 0.1 * Math.sin(t * 4.3 + 1);
    for (let i = 0; i < this.n; i++) {
      const ph = this.phase[i], w = 2.2 / Math.sqrt(this.len[i] / 0.3);
      const ax = (Math.sin(t * w + ph) * 0.06 + 0.05) * k + E * 0.22 * Math.sin(t * w * 2.6 + ph);
      const az = Math.sin(t * w * 0.8 + ph * 1.3) * 0.05 * k + E * 0.2 * Math.cos(t * w * 2.2 + ph * 0.7);
      this.e.set(ax, 0, az); this.q.setFromEuler(this.e);
      this.s.set(1, this.len[i] / 0.3, 1);
      this.m.compose(this.attach[i], this.q, this.s);
      this.tubes.setMatrixAt(i, this.m);
      if (this.energy > 0.12 && t > this.nextStrike[i]) {
        this.nextStrike[i] = t + 0.18 + Math.random() * 0.5 / E;
        this.onStrike?.(i, Math.min(1, E * 0.5));
      }
    }
    this.tubes.instanceMatrix.needsUpdate = true;
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
  const tube = tint(new THREE.CylinderGeometry(0.014 * k, 0.014 * k, 0.25, 10, 1).translate(0, -0.05 - 0.125, 0), '#ffffff');
  const cap = tint(new THREE.CylinderGeometry(0.016 * k, 0.016 * k, 0.008, 10).translate(0, -0.05, 0), '#c9c0b0');
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
  const discY = -0.16 * S, discR = 0.1 * S;
  kit.add(new THREE.CylinderGeometry(0.004, 0.004, -discY, 3), 'plain', '#3a3238', T(0, discY / 2, 0));
  kit.add(new THREE.CylinderGeometry(discR, discR * 1.05, 0.035 * S, 14), 'wood', SAIL.timber, T(0, discY, 0));
  kit.add(new THREE.ConeGeometry(discR * 0.6, 0.06 * S, 12), 'wood', SAIL.timberDark, T(0, discY + 0.045 * S, 0));
  // clapper and wind sail on a long cord through the middle
  const clY = discY - 0.26 * S;
  kit.add(new THREE.CylinderGeometry(0.003, 0.003, 0.62 * S, 3), 'plain', '#3a3238', T(0, discY - 0.31 * S, 0));
  kit.add(new THREE.CylinderGeometry(0.045 * S, 0.045 * S, 0.02 * S, 10), 'wood', SAIL.plank, T(0, clY, 0));
  const tas = opts.tassel ?? '#d8443a';
  kit.add(new THREE.BoxGeometry(0.09 * S, 0.14 * S, 0.008), 'plain', tas, T(0, discY - 0.6 * S, 0));
  kit.add(new THREE.ConeGeometry(0.03 * S, 0.14 * S, 6).rotateX(Math.PI), 'plain', tas, T(0, discY - 0.74 * S, 0));
  kit.add(new THREE.SphereGeometry(0.018 * S, 6, 4), 'brass', SAIL.brass, T(0, discY - 0.66 * S, 0));
  kit.build(body, { outline: false });
  // tubes
  const metal = opts.metal ?? 'silver';
  const mat = townMat(metal);
  const tubes = new THREE.InstancedMesh(chimeTubeGeo(S), mat, n);
  tubes.castShadow = true; tubes.frustumCulled = false;
  const tcol = new THREE.Color(metal === 'brass' ? SAIL.brass : SAIL.silver);
  const attach: THREE.Vector3[] = [], len: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    attach.push(new THREE.Vector3(Math.cos(a) * discR * 0.75, discY - 0.02 * S, Math.sin(a) * discR * 0.75));
    len.push((0.22 + 0.3 * (i / Math.max(1, n - 1)) + r() * 0.03) * S);
    tubes.setColorAt(i, tcol.clone().multiplyScalar(0.92 + r() * 0.1));
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
}

/**
 * A windmill: a tall tapered tower of cream plaster, small shuttered windows climbing it, an arched door, a gallery,
 * a slate cap, and four lattice sails with canvas that turn (userData.update). userData.rotor is the turning group.
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
  // a stone string course two-thirds up, and the cap curb
  const yc = H * 0.62;
  kit.add(lathe([[rAt(yc) + 0.02, yc - 0.1], [rAt(yc) + 0.09, yc - 0.04], [rAt(yc) + 0.09, yc + 0.05], [rAt(yc) + 0.02, yc + 0.1]], 36, STONE_TILE), 'stone', SAIL.stone);
  kit.add(lathe([[Rt + 0.02, H - 0.15], [Rt + 0.14, H - 0.05], [Rt + 0.14, H + 0.12]], 36, WOOD_TILE), 'wood', SAIL.timberDark);
  // door and windows
  addDoor(kit, T(0, 0.35, rAt(1.3) - 0.04, -lean, 0, 0), r, { w: 0.95, h: 1.95, color: pick(r, SAIL.door) });
  const sh = opts.shutter ?? pick(r, SAIL.shutters);
  const wins: [number, number][] = [[0.0, H * 0.5], [-1.9, H * 0.3], [1.7, H * 0.72], [2.8, H * 0.45]];
  for (const [a, y] of wins) {
    const m = T(Math.sin(a) * (rAt(y + 0.3) - 0.03), y, Math.cos(a) * (rAt(y + 0.3) - 0.03), 0, a, 0).multiply(T(0, 0, 0, -lean, 0, 0));
    addWindow(kit, m, r, { w: 0.5, h: 0.62, shutter: sh, box: y < H * 0.4 ? SAIL.box : null, arched: true });
  }
  // the gallery: a ring deck on brackets with a post-and-rail fence
  if (gallery) {
    const gr0 = rAt(gy), gr1 = gr0 + 0.75;
    kit.add(lathe([[gr1, gy], [gr0, gy]], 36, WOOD_TILE, true), 'wood', SAIL.plank);
    kit.add(lathe([[gr1, gy - 0.12], [gr1, gy]], 36, WOOD_TILE, true), 'wood', SAIL.timber);
    kit.add(lathe([[gr0, gy - 0.12], [gr1, gy - 0.12]], 36, WOOD_TILE, false), 'wood', SAIL.timberDark);
    const nP = 16;
    for (let i = 0; i < nP; i++) {
      const a = (i / nP) * Math.PI * 2;
      kit.add(boxM(0.07, 0.95, 0.07, WOOD_TILE, true), 'wood', SAIL.timber, T(Math.sin(a) * (gr1 - 0.06), gy + 0.47, Math.cos(a) * (gr1 - 0.06)));
      // bracket strut under the deck
      kit.add(boxM(0.06, 0.06, 0.95, WOOD_TILE), 'wood', SAIL.timberDark, T(Math.sin(a) * (gr0 + 0.3), gy - 0.45, Math.cos(a) * (gr0 + 0.3), 0, a, 0).multiply(T(0, 0, 0, 0.85, 0, 0)));
    }
    for (const y of [0.5, 0.92]) kit.add(new THREE.TorusGeometry(gr1 - 0.06, 0.03, 4, 40).rotateX(Math.PI / 2), 'wood', SAIL.timber, T(0, gy + y, 0));
    // the door onto the gallery
    addDoor(kit, T(Math.sin(-0.9) * (rAt(gy + 0.8) - 0.04), gy, Math.cos(-0.9) * (rAt(gy + 0.8) - 0.04), 0, -0.9, 0).multiply(T(0, 0, 0, -lean, 0, 0)), r, { w: 0.7, h: 1.5, color: pick(r, SAIL.door) });
  }
  // the cap
  const cap = slateCone(kit, { eaveR: Rt + 0.45, y0: H + 0.1, height: 2.4, seed: seed * 13 + 1, courseH: 0.25, tileW: 0.26, flare: 1.1 });
  kit.add(postGeo(0.03, 0.05, 0.5), 'wood', SAIL.timberDark, T(0, cap.apex + 0.2, 0));
  kit.add(new THREE.SphereGeometry(0.09, 10, 8), 'brass', SAIL.brass, T(0, cap.apex + 0.48, 0));
  // windshaft housing at the front of the cap
  const hubY = H + 0.75, hubZ = Rt + 0.62, tilt = 0.14;
  kit.add(new THREE.CylinderGeometry(0.2, 0.26, 1.0, 10).rotateX(Math.PI / 2), 'wood', SAIL.timberDark, T(0, hubY - 0.05, hubZ - 0.45, -tilt, 0, 0));
  kit.build(g, { inkWidth: 0.025 });

  // the rotor: four stocks with lattice and canvas, merged into one turning group
  const L = opts.sail ?? H * 0.62;
  const rotor = new THREE.Group(); rotor.name = 'rotor';
  rotor.position.set(0, hubY, hubZ); rotor.rotation.x = -tilt;
  const spin = new THREE.Group(); rotor.add(spin);
  const rk = new Kit();
  rk.add(new THREE.CylinderGeometry(0.24, 0.24, 0.32, 10).rotateX(Math.PI / 2), 'wood', SAIL.timber, T(0, 0, 0.05));
  rk.add(new THREE.SphereGeometry(0.14, 10, 6), 'brass', SAIL.brass, T(0, 0, 0.24));
  const wood = new THREE.Color('#8a6748'), latt = new THREE.Color('#a68464');
  for (let i = 0; i < 4; i++) {
    rk.with(T(0, 0, 0.1, 0, 0, i * Math.PI / 2 + 0.3), () => {
      // stock (the main spar), tapering to the tip
      rk.add(boxM(0.14, L + 0.3, 0.12, WOOD_TILE, true), 'wood', wood, T(0, (L + 0.3) / 2 - 0.3, 0));
      const x0 = -0.22, x1 = 1.0, y0 = 0.85, y1 = L - 0.05;
      // the lattice: whips along the edges, sail bars across, set just behind the cloth
      for (const x of [x0, x1, 0.4]) rk.add(boxM(0.05, y1 - y0, 0.05, WOOD_TILE, true), 'wood', latt, T(x, (y0 + y1) / 2, -0.02));
      const nb = Math.round((y1 - y0) / 0.36);
      for (let b = 0; b <= nb; b++) {
        const y = y0 + (b / nb) * (y1 - y0);
        rk.add(boxM(x1 - x0 + 0.06, 0.04, 0.04, WOOD_TILE), 'wood', latt, T((x0 + x1) / 2, y, -0.04));
      }
      // diagonal braces near the hub
      rk.add(boxM(0.04, 1.1, 0.04, WOOD_TILE, true), 'wood', latt, T(0.45, y0 - 0.25, -0.03, 0, 0, -0.75));
      // canvas: billowing a little, tied to the bars, leaving the outer bars bare on one stock (reefed)
      const reef = i === 2 ? 0.7 : 1;
      const cy0 = y0 + 0.08, cy1 = y0 + (y1 - y0) * reef - 0.04;
      const nx = 3, ny = 8;
      const cg = new THREE.PlaneGeometry(x1 - 0.06, cy1 - cy0, nx, ny);
      const p = cg.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) {
        const u = (p.getX(k) / (x1 - 0.06)) + 0.5, v = p.getY(k) / (cy1 - cy0) + 0.5;
        p.setZ(k, 0.09 * Math.sin(u * Math.PI) * (0.6 + 0.4 * Math.sin(v * Math.PI)));
      }
      cg.computeVertexNormals();
      uvMetres(cg, 1, 1, 1);
      rk.add(cg, 'canvas', new THREE.Color('#f3ead6').multiplyScalar(0.96 + r() * 0.06), T((x1 + 0.06) / 2, (cy0 + cy1) / 2, 0.035));
      // ties
      for (let b = 0; b <= nb * reef; b += 2) rk.add(new THREE.BoxGeometry(0.02, 0.02, 0.12), 'plain', '#6a5038', T(x1 - 0.02, y0 + (b / nb) * (y1 - y0), 0.02));
    });
  }
  rk.build(spin, { inkWidth: 0.018 });
  g.add(rotor);
  const speed = opts.speed ?? 0.55;
  let ang = r() * 6;
  spin.userData.update = (dt: number) => { ang -= speed * dt; spin.rotation.z = ang; };
  g.userData.rotor = spin;
  g.userData.tris = kit.tris + rk.tris;
  return g;
}

// ---------------------------------------------------------------- laundry

/**
 * A washing line of `length` metres along +X between two forked poles: sheets, striped towels, shirts and small
 * things pegged on, all billowing in the shader. Origin at the first pole's foot.
 */
export function laundryLine(length = 5, seed = 1): THREE.Group {
  const r = rng(seed);
  const g = new THREE.Group(); g.name = 'laundryLine';
  const kit = new Kit();
  const H = 2.15, sag = 0.12 + length * 0.025;
  for (const x of [0, length]) {
    const lean = (r() - 0.5) * 0.05;
    kit.add(postGeo(0.05, 0.065, H + 0.15, 6), 'wood', SAIL.weathered, T(x, (H + 0.15) / 2 - 0.05, 0, lean, 0, (x ? 1 : -1) * 0.04));
    // the fork at the top
    for (const s of [-1, 1]) kit.add(postGeo(0.025, 0.03, 0.3, 5), 'wood', SAIL.weathered, T(x + s * 0.06, H + 0.18, 0, 0, 0, -s * 0.35));
    kit.add(new THREE.IcosahedronGeometry(0.14, 0), 'stone', SAIL.stoneDark, T(x + 0.1, 0.02, 0.08, 0, 0, 0, 1, 0.5, 1));
  }
  const a = new THREE.Vector3(0, H, 0), b = new THREE.Vector3(length, H, 0);
  const ropeY = (x: number) => H - 4 * sag * (x / length) * (1 - x / length);
  kit.add(ropeGeo(sagLine(a, b, sag, 16), 0.008, 4), 'plain', '#e6dcc4');
  // items along the line
  let x = 0.3;
  const whites = ['#fbf8f0', '#f6f1e6', '#fffdf8'];
  while (x < length - 0.4) {
    const kind = pick(r, ['sheet', 'sheet', 'towel', 'shirt', 'shirt', 'small'] as const);
    let w = 0, h = 0;
    let colFn: (u: number, v: number) => THREE.Color;
    let mask: ((u: number, v: number) => boolean) | undefined;
    if (kind === 'sheet') {
      w = 0.75 + r() * 0.35; h = 0.95 + r() * 0.3;
      const c = new THREE.Color(pick(r, whites));
      const hem = r() > 0.5 ? new THREE.Color(pick(r, ['#9ec0e8', '#f0b8c8', '#f2d27a'])) : null;
      colFn = (_u, v) => hem && v > 0.9 ? hem : c;
    } else if (kind === 'towel') {
      w = 0.5 + r() * 0.15; h = 0.75 + r() * 0.2;
      const st = new THREE.Color(pick(r, ['#4f7fc4', '#e0473b', '#6aae5a', '#f08a32'])), wc = new THREE.Color(pick(r, whites));
      colFn = (u, v) => (Math.floor(u * 7) % 2 === 0 || v > 0.86 || v < 0.06) ? st : wc;
      if (r() > 0.5) colFn = (_u, v) => (v > 0.12 && v < 0.22) || (v > 0.78 && v < 0.88) ? st : wc;
    } else if (kind === 'shirt') {
      w = 0.78; h = 0.72;
      const c = new THREE.Color(pick(r, ['#fbf8f0', '#cfe0f4', '#f6e7b8', '#e8c8b0', '#a8c8e8']));
      colFn = () => c;
      // a T: sleeves along the top third, a body in the middle, a little collar notch
      mask = (u, v) => (v < 0.36 && (u > 0.02 && u < 0.98) && !(v < 0.06 && u > 0.43 && u < 0.57)) || (u > 0.24 && u < 0.76);
    } else {
      w = 0.32; h = 0.42;
      const c = new THREE.Color(pick(r, ['#e0473b', '#f2c53d', '#9ec0e8', '#fbf8f0']));
      colFn = () => c;
    }
    if (x + w > length - 0.25) break;
    const nx = Math.max(3, Math.round(w / 0.15)), ny = Math.max(4, Math.round(h / 0.14));
    const cg = clothGrid(w, h, nx, ny, colFn, { mask, phase: r() * 6, stiff: kind === 'small' ? 0.8 : r() * 0.3, weight: (u, v) => 0.12 * Math.pow(v, 1.2) * (kind === 'sheet' ? 1.6 : 1) + 0.03 * Math.sin(u * Math.PI) * v });
    // hang the top edge on the sagging rope
    const p = cg.attributes.position as THREE.BufferAttribute;
    const cx = x + w / 2;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + ropeY(cx + p.getX(i)) - 0.01);
    kit.add(cg, 'cloth', null, T(cx, 0, 0.0, 0, (r() - 0.5) * 0.12, 0));
    // pegs
    for (const px of [x + 0.04, x + w - 0.04, ...(w > 0.7 ? [cx] : [])]) {
      kit.add(new THREE.BoxGeometry(0.025, 0.09, 0.03), 'bloom', '#d8b88a', T(px, ropeY(px) - 0.01, 0));
    }
    x += w + 0.08 + r() * 0.2;
  }
  kit.build(g, { inkWidth: 0.015 });
  return g;
}

// ---------------------------------------------------------------- bunting

export interface BuntingOpts { sag?: number; spacing?: number; colors?: readonly string[]; size?: number }

/**
 * Bunting strung through `points` (the hang points, e.g. poles and eaves) with a sag between each pair: triangle
 * flags in festival colours that flutter in the shader. Coordinates are in the group's space.
 */
export function bunting(points: THREE.Vector3[], seed = 1, opts: BuntingOpts = {}): THREE.Group {
  const r = rng(seed);
  const g = new THREE.Group(); g.name = 'bunting';
  const kit = new Kit();
  const cols = (opts.colors ?? SAIL.festival.slice(0, 4).concat(['#6aae5a', '#f6efe2'])).map(c => new THREE.Color(c));
  const spacing = opts.spacing ?? 0.42, S = opts.size ?? 1;
  const fw = 0.3 * S, fh = 0.38 * S;
  let ci = Math.floor(r() * cols.length);
  for (let s = 0; s < points.length - 1; s++) {
    const a = points[s], b = points[s + 1];
    const span = a.distanceTo(b);
    const sag = opts.sag ?? 0.05 * span + 0.08;
    const line = sagLine(a, b, sag, Math.max(8, Math.round(span * 2)));
    kit.add(ropeGeo(line, 0.007, 3), 'plain', '#e8dcc0');
    const curve = new THREE.CatmullRomCurve3(line);
    const L = curve.getLength(), n = Math.floor(L / spacing);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = curve.getPointAt(t), tg = curve.getTangentAt(t);
      tg.y = 0; tg.normalize();
      const nrm = new THREE.Vector3(-tg.z, 0, tg.x);
      const c = cols[ci++ % cols.length].clone().multiplyScalar(0.93 + r() * 0.12);
      // a triangle grid hanging from the rope: 3 rows, narrowing to the tip
      const pos: number[] = [], nor: number[] = [], cl: number[] = [], wv: number[] = [], dr: number[] = [], idx: number[] = [];
      const rows = 3, ph = r() * 6 + i * 0.7;
      for (let j = 0; j <= rows; j++) {
        const v = j / rows, half = (1 - v) * fw / 2;
        for (const u of [-1, 0, 1]) {
          const q = p.clone().addScaledVector(tg, u * half).add(new THREE.Vector3(0, -v * fh, 0));
          pos.push(q.x, q.y, q.z); nor.push(nrm.x, nrm.y, nrm.z); cl.push(c.r, c.g, c.b);
          wv.push(0.13 * Math.pow(v, 1.1) * S, ph, 0.6); dr.push(nrm.x, 0.15, nrm.z);
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

/**
 * A market stall: a plank counter on four posts under a red-and-white striped awning with a scalloped, fluttering
 * valance; crates of apples, oranges and lemons, baskets of bread, honey jars, flowers in buckets, barrels and
 * sacks beside it, and a chalk sign. Faces +Z (the customer side). About 2.6 m wide.
 */
export function awningStall(opts: { seed?: number; width?: number; stripe?: string } = {}): THREE.Group {
  const seed = opts.seed ?? 1, r = rng(seed);
  const W = opts.width ?? 2.6, D = 1.0;
  const g = new THREE.Group(); g.name = 'awningStall';
  const kit = new Kit();
  const wood = new THREE.Color(SAIL.plank), dark = new THREE.Color(SAIL.timber);
  // posts: back ones taller
  const backH = 2.55, frontH = 2.2;
  for (const sx of [-1, 1]) {
    kit.add(boxM(0.1, backH, 0.1, WOOD_TILE, true), 'wood', dark, T(sx * W / 2, backH / 2, -D / 2));
    kit.add(boxM(0.1, frontH, 0.1, WOOD_TILE, true), 'wood', dark, T(sx * W / 2, frontH / 2, D / 2));
    kit.add(boxM(0.07, 0.07, D, WOOD_TILE), 'wood', dark, T(sx * W / 2, 0.92, 0));
  }
  // counter: top planks, a front of vertical boards, a shelf below
  for (let i = 0; i < 4; i++) kit.add(boxM(W + 0.15, 0.05, D / 4 - 0.01, WOOD_TILE), 'wood', wood.clone().multiplyScalar(0.9 + r() * 0.2), T(0, 0.95, -D / 2 + (i + 0.5) * D / 4));
  const nb = Math.round(W / 0.16);
  for (let i = 0; i < nb; i++) kit.add(boxM(W / nb - 0.012, 0.9, 0.04, WOOD_TILE, true), 'wood', wood.clone().multiplyScalar(0.8 + r() * 0.2), T(-W / 2 + (i + 0.5) * W / nb, 0.47, D / 2 + 0.02));
  kit.add(boxM(W, 0.04, D * 0.8, WOOD_TILE), 'wood', wood.clone().multiplyScalar(0.75), T(0, 0.3, -0.05));
  // the awning: stripes run down the slope; it overhangs the front and sags a little between posts
  const stripe = new THREE.Color(opts.stripe ?? '#d8443a'), cream = new THREE.Color('#f7f0e2');
  const aW = W + 0.4, back = new THREE.Vector3(0, backH + 0.05, -D / 2 - 0.1), front = new THREE.Vector3(0, frontH - 0.1, D / 2 + 0.5);
  const aLen = back.distanceTo(front), slope = Math.atan2(back.y - front.y, front.z - back.z);
  const nS = 12;
  const aw = clothGrid(aW, aLen, nS, 6, (u) => (Math.floor(u * nS) % 2 ? cream : stripe), {
    phase: r() * 6, stiff: 0.2,
    weight: (u, v) => 0.03 * v * (0.4 + Math.sin(u * Math.PI)), dir: new THREE.Vector3(0, 0, 1),
  });
  {
    // gentle sag between the side poles
    const p = aw.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i) / aW + 0.5; p.setZ(i, p.getZ(i) - 0.07 * Math.sin(u * Math.PI)); }
  }
  // clothGrid hangs along -Y; tip it to run from the back pole forward and down the slope
  kit.add(aw, 'cloth', null, T(back.x, back.y, back.z, -Math.PI / 2 + slope, 0, 0));
  // valance: a scalloped hem hanging from the front edge, free to flutter
  const nv = 14, vh = 0.2;
  for (let i = 0; i < nv; i++) {
    const u0 = i / nv;
    const vg = clothGrid(aW / nv + 0.005, vh, 2, 3, () => (i % 2 ? cream : stripe), {
      phase: i * 0.6, stiff: 0.8,
      mask: (u, v) => v < 0.62 || Math.abs(u - 0.5) < 0.5 * Math.sqrt(Math.max(0, 1 - ((v - 0.62) / 0.38) ** 2)) + 0.12,
      weight: (_u, v) => 0.08 * v,
    });
    kit.add(vg, 'cloth', null, T(-aW / 2 + (u0 + 0.5 / nv) * aW, front.y - 0.07 + 0.02, front.z - 0.02));
  }
  // a top rail at the back, and a front rail the awning ties to
  kit.add(boxM(W + 0.2, 0.08, 0.08, WOOD_TILE), 'wood', dark, T(0, backH, -D / 2));
  kit.add(boxM(W + 0.2, 0.06, 0.06, WOOD_TILE), 'wood', dark, T(0, frontH - 0.05, D / 2));
  // goods on the counter
  addCrate(kit, T(-W * 0.32, 0.975, 0.0, 0.12, 0.05, 0), r, 0.6, 0.42, 0.22, '#d8443a');
  addCrate(kit, T(-W * 0.06, 0.975, 0.05, 0.12, -0.04, 0), r, 0.5, 0.4, 0.22, '#f08a32', 0.05);
  addCrate(kit, T(W * 0.16, 0.975, 0.02, 0.12, 0.08, 0), r, 0.45, 0.38, 0.22, '#f2d23d', 0.045);
  addBasket(kit, T(W * 0.38, 0.975, 0.1), r, 0.2, '#d8a058');
  for (let i = 0; i < 3; i++) {  // honey jars
    const jx = W * 0.32 + i * 0.12, jz = -0.32;
    kit.add(new THREE.CylinderGeometry(0.045, 0.05, 0.13, 10), 'glass', '#e8a83a', T(jx, 1.04, jz));
    kit.add(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), 'plain', '#f6efe2', T(jx, 1.12, jz));
  }
  // under and beside the stall
  addCrate(kit, T(-W * 0.3, 0.32, -0.05), r, 0.55, 0.4, 0.3, '#6aae5a', 0.07);
  addBarrel(kit, T(W / 2 + 0.45, 0, 0.25), r);
  addBarrel(kit, T(W / 2 + 0.4, 0, -0.45, 0, 0, 0), r, 0.7, 0.26);
  addCrate(kit, T(-W / 2 - 0.5, 0, 0.35, 0, 0.3, 0), r, 0.6, 0.42, 0.34, '#d8443a');
  addCrate(kit, T(-W / 2 - 0.5, 0.34, 0.35, 0, 0.1, 0), r, 0.55, 0.4, 0.3, '#f2d23d', 0.05);
  // flower buckets in front
  for (let i = 0; i < 3; i++) {
    const bx = -0.4 + i * 0.45, bz = D / 2 + 0.35;
    kit.add(lathe([[0.12, 0], [0.15, 0.28]], 12, 0.5), 'silver', '#b8c4cc', T(bx, 0, bz));
    const fc = new THREE.Color(pick(r, ['#f07aa0', '#f2d23d', '#ffffff', '#b48ae0', '#e0473b']));
    for (let k = 0; k < 8; k++) {
      const a = r() * 6.28, d = r() * 0.08;
      kit.add(new THREE.CylinderGeometry(0.006, 0.006, 0.4, 4), 'bloom', '#4f7f3a', T(bx + Math.cos(a) * d, 0.35, bz + Math.sin(a) * d, (r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3));
      kit.add(blossomGeo(fc, undefined, 1.4), 'bloom', null, T(bx + Math.cos(a) * d * 1.6, 0.52 + r() * 0.1, bz + Math.sin(a) * d * 1.6, -0.3 + r() * 0.6, r() * 6, (r() - 0.5) * 0.6));
    }
  }
  // sacks
  for (let i = 0; i < 2; i++) kit.add(wobble(new THREE.SphereGeometry(0.22, 10, 8), 0.02, 9, i), 'canvas', '#c9ad7e', T(W / 2 + 0.1 + i * 0.3, 0.2, D / 2 + 0.55, 0, r(), 0, 0.9, 1.15, 0.8));
  // chalk sign hanging from the front rail
  kit.add(boxM(0.6, 0.32, 0.03, WOOD_TILE), 'plain', '#3e4a44', T(0, frontH - 0.4, D / 2 + 0.06));
  kit.add(boxM(0.66, 0.38, 0.02, WOOD_TILE), 'wood', SAIL.timber, T(0, frontH - 0.4, D / 2 + 0.04));
  for (let i = 0; i < 3; i++) kit.add(new THREE.BoxGeometry(0.36 - i * 0.08, 0.025, 0.005), 'plain', '#f2efe6', T(-0.06 + i * 0.03, frontH - 0.33 - i * 0.07, D / 2 + 0.078));
  kit.build(g, { inkWidth: 0.018 });
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
 * A wooden crate planter (about 1 m by 0.55 m) filled with hydrangeas, lavender, roses or a mixed bed.
 */
export function flowerPlanter(kind: PlanterKind = 'hydrangea', seed = 1, opts: { width?: number } = {}): THREE.Group {
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
    for (let i = 0; i < 4; i++) {
      const cl = leafClump({ radius: 0.3, color: '#ffffff', cards: 12, squash: 0.7, seed: Math.floor(r() * 9999), core: false });
      kit.addClump(cl, pick(r, SAIL.green), T(-W * 0.32 + i * W * 0.21, top + 0.12, (r() - 0.5) * 0.15));
    }
    const fam = pick(r, [['#7f9be8', '#9aa8f0', '#8a8fe0', '#a7b8f4'], ['#b39ae6', '#c6a8ee', '#9f8cdc'], ['#f2a8c8', '#e898bc', '#f6c0d6']]);
    const nH = Math.round(W * 6);
    for (let i = 0; i < nH; i++) {
      const x = -W / 2 + 0.12 + (i / (nH - 1)) * (W - 0.24) + (r() - 0.5) * 0.05;
      kit.add(hydrangeaGeo(new THREE.Color(pick(r, fam)), Math.floor(r() * 9999), 0.13 + r() * 0.05), 'bloom', null, T(x, top + 0.2 + r() * 0.16, (r() - 0.5) * D * 0.55, r() * 0.4, r() * 6, 0));
    }
  } else if (kind === 'lavender') {
    const geo = flowerGeo('lavender');
    const n = Math.round(W * 14);
    const lc = new THREE.Color(pick(r, ['#a990e2', '#b39ae8']));
    for (let i = 0; i < n; i++) {
      const pg = geo.clone(); pg.deleteAttribute('aTint');
      // tint the buds (light vertices) purple, keep stems
      const c = pg.attributes.color as THREE.BufferAttribute, t = (geo.attributes.aTint as THREE.BufferAttribute);
      const k = lc.clone().multiplyScalar(0.9 + r() * 0.2);
      for (let v = 0; v < c.count; v++) if (t.getX(v) > 0.5) c.setXYZ(v, c.getX(v) * k.r, c.getY(v) * k.g, c.getZ(v) * k.b);
      const s = 1.1 + r() * 0.4;
      kit.add(pg, 'bloom', null, T(-W / 2 + 0.08 + r() * (W - 0.16), top, (r() - 0.5) * (D - 0.16), (r() - 0.5) * 0.3, r() * 6, (r() - 0.5) * 0.3, s, s, s));
    }
  } else {
    addBloomMound(kit, T(0, top, 0), r, W - 0.1, D - 0.1, 0.25, kind === 'roses' ? SAIL.roses : SAIL.box, Math.round(W * 26), 4);
    if (kind === 'roses') for (let i = 0; i < 12; i++) kit.add(roseGeo(new THREE.Color(pick(r, SAIL.roses)), 1.4), 'bloom', null, T(-W / 2 + 0.1 + r() * (W - 0.2), top + 0.3 + r() * 0.12, (r() - 0.5) * D * 0.6, r() - 0.5, 0, r() - 0.5));
  }
  kit.build(g, { inkWidth: 0.016 });
  return g;
}

// ---------------------------------------------------------------- steps and paving

/** Rough cream stone steps rising along +Z: `count` slabs of `rise` each, `width` wide. */
export function stoneSteps(count = 3, width = 1.6, seed = 9, rise = 0.18, tread = 0.42): THREE.Group {
  const r = rng(seed);
  const g = new THREE.Group(); g.name = 'stoneSteps';
  const kit = new Kit();
  for (let i = 0; i < count; i++) {
    const y = (i + 1) * rise;
    const nSlab = Math.max(1, Math.round(width / 0.8));
    for (let k = 0; k < nSlab; k++) {
      const sw = width / nSlab - 0.02;
      const geo = wobble(boxM(sw, rise + 0.15, tread + 0.08, STONE_TILE), 0.015, 5, i * 7 + k);
      kit.add(geo, 'stone', new THREE.Color(SAIL.stone).multiplyScalar(0.92 + r() * 0.12), T(-width / 2 + (k + 0.5) * (width / nSlab), y - (rise + 0.15) / 2, i * tread + tread / 2, 0, (r() - 0.5) * 0.06, 0));
    }
  }
  for (const s of [-1, 1]) for (let i = 0; i < count; i++) kit.add(new THREE.IcosahedronGeometry(0.22, 0), 'stone', SAIL.stoneDark, T(s * (width / 2 + 0.15), i * rise + 0.1, i * tread + 0.2, r(), r(), r(), 1, 0.8, 1.2));
  kit.build(g, { inkWidth: 0.016 });
  return g;
}

/** Irregular flagstones laid along a path through `points` (local, on the ground), `width` wide. */
export function pavedPath(points: THREE.Vector3[], width = 1.4, seed = 4, heightAt?: (x: number, z: number) => number): THREE.Group {
  const r = rng(seed);
  const g = new THREE.Group(); g.name = 'pavedPath';
  const kit = new Kit();
  const curve = new THREE.CatmullRomCurve3(points);
  const L = curve.getLength();
  const step = 0.42;
  for (let d = 0; d < L; d += step) {
    const t = d / L, p = curve.getPointAt(t), tg = curve.getTangentAt(t);
    const side = new THREE.Vector3(-tg.z, 0, tg.x).normalize();
    const across = Math.max(1, Math.round(width / 0.5));
    for (let k = 0; k < across; k++) {
      const off = -width / 2 + (k + 0.5) * (width / across) + (r() - 0.5) * 0.1;
      const q = p.clone().addScaledVector(side, off).addScaledVector(tg, (r() - 0.5) * 0.1);
      const sh = new THREE.Shape(), n = 5 + Math.floor(r() * 3), rad = 0.2 + r() * 0.06;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + r() * 0.3, rr = rad * (0.8 + r() * 0.3); if (i) sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: 1 });
      const y = heightAt ? heightAt(q.x, q.z) : q.y;
      kit.add(sg, 'plain', new THREE.Color('#efe4cc').multiplyScalar(0.9 + r() * 0.12), T(q.x, y + 0.01, q.z, -Math.PI / 2, 0, r() * 6));
    }
  }
  kit.build(g, { outline: false });
  return g;
}

// ---------------------------------------------------------------- race gate

export interface GateOpts { seed?: number; height?: number; radius?: number; tubes?: number; pennants?: readonly string[] }

/**
 * The golden race gate of the kite-wing race (picture 3): a tall turned wooden pole on a stone plinth carrying a
 * big brass ring, with long chime tubes hanging inside the ring from a crossbar (racers ring them flying through),
 * pennants streaming from its sides, and a flag on the finial. The ring faces ±Z (fly along Z through it).
 * userData.chime rings the tubes; userData.center is the ring centre (local); userData.radius its inner radius.
 */
export function raceGate(opts: GateOpts = {}): THREE.Group {
  const seed = opts.seed ?? 1, r = rng(seed);
  const H = opts.height ?? 7.5, R = opts.radius ?? 2.4;
  const g = new THREE.Group(); g.name = 'raceGate';
  const kit = new Kit();
  const cy = H + R + 0.05;
  // stone plinth: two stepped drums
  kit.add(wobble(lathe([[0.95, 0], [0.95, 0.3], [0.7, 0.32], [0.7, 0.6], [0.45, 0.62]], 16, STONE_TILE), 0.02, 3, seed), 'stone', SAIL.stone);
  // the pole: octagonal, tapering, with brass bands and a spiral ribbon wrap
  kit.add(postGeo(0.14, 0.2, H, 8), 'wood', SAIL.timber, T(0, H / 2 + 0.5, 0));
  for (const y of [0.9, H * 0.45, H * 0.8, H + 0.35]) kit.add(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10), 'brass', SAIL.brass, T(0, y, 0));
  const spiral: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40, y = 1.2 + t * (H * 0.7 - 1.2), a = t * Math.PI * 2 * 4; spiral.push(new THREE.Vector3(Math.cos(a) * 0.19, y, Math.sin(a) * 0.19)); }
  kit.add(ropeGeo(spiral, 0.03, 4), 'plain', '#3f78c8');
  const spiral2 = spiral.map(p => new THREE.Vector3(-p.x, p.y + 0.18, -p.z));
  kit.add(ropeGeo(spiral2, 0.03, 4), 'plain', '#e0473b');
  // a collar at the pole top that cradles the ring
  kit.add(new THREE.CylinderGeometry(0.28, 0.2, 0.3, 10), 'brass', SAIL.brass, T(0, H + 0.5, 0));
  for (const s of [-1, 1]) {
    // curved brass struts from the pole up to the ring's lower sides
    const a = -Math.PI / 2 + s * 0.75;
    const end = new THREE.Vector3(Math.cos(a) * R, cy + Math.sin(a) * R, 0);
    const pts = [new THREE.Vector3(0, H - 0.4, 0), new THREE.Vector3(s * 0.5, H + 0.25, 0), end];
    kit.add(ropeGeo(pts, 0.045, 6), 'brass', SAIL.brass);
  }
  // the ring: a thick brass torus, an inner bead, studs, and a crossbar along the top for the chimes
  kit.add(new THREE.TorusGeometry(R, 0.2, 10, 72).scale(1, 1, 0.6), 'brass', SAIL.brass, T(0, cy, 0));
  kit.add(new THREE.TorusGeometry(R - 0.22, 0.04, 6, 72), 'brass', '#f0c868', T(0, cy, 0));
  kit.add(new THREE.TorusGeometry(R + 0.22, 0.035, 6, 72), 'brass', '#c8963a', T(0, cy, 0));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; kit.add(new THREE.SphereGeometry(0.075, 8, 6), 'brass', '#f6d27a', T(Math.cos(a) * R, cy + Math.sin(a) * R, 0.12)); kit.add(new THREE.SphereGeometry(0.075, 8, 6), 'brass', '#f6d27a', T(Math.cos(a) * R, cy + Math.sin(a) * R, -0.12)); }
  const barY = cy + R * 0.62, barW = Math.sqrt(R * R - (R * 0.62) ** 2) * 2;
  kit.add(new THREE.CylinderGeometry(0.05, 0.05, barW, 8).rotateZ(Math.PI / 2), 'brass', SAIL.brass, T(0, barY, 0));
  // finial with a flag on top
  kit.add(postGeo(0.03, 0.05, 1.3), 'wood', SAIL.timberDark, T(0, cy + R + 0.75, 0));
  kit.add(new THREE.SphereGeometry(0.13, 10, 8), 'brass', SAIL.brass, T(0, cy + R + 0.12, 0));
  kit.add(new THREE.ConeGeometry(0.07, 0.3, 8), 'brass', SAIL.brass, T(0, cy + R + 1.5, 0));
  const pens = opts.pennants ?? ['#e0473b', '#f2c53d', '#3f78c8'];
  // pennants: long tapered ribbons with forked tails, streaming down-wind from the ring's sides and the finial
  const ribbon = (at: THREE.Vector3, len: number, wid: number, c: THREE.Color, ph: number, dirX: number) => {
    const pos: number[] = [], nor: number[] = [], cl: number[] = [], wv: number[] = [], dr: number[] = [], idx: number[] = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const t = i / n, w = wid * (1 - t * 0.55);
      const along = new THREE.Vector3(dirX * t * len * 0.85, -t * len * 0.5 - t * t * len * 0.15, 0);
      for (const s of [-1, 1]) {
        const fork = t > 0.82 ? (s * (t - 0.82) * 0.6) : 0;
        const p = at.clone().add(along).add(new THREE.Vector3(0, s * w / 2 * 0.6 + fork, s * w / 2 * 0.3));
        pos.push(p.x, p.y, p.z); nor.push(0, 0, 1);
        const cc = (Math.floor(t * 4) % 2 === 0) ? c : c.clone().lerp(new THREE.Color('#ffffff'), 0.15);
        cl.push(cc.r, cc.g, cc.b);
        wv.push(t * 0.35, ph + t * 0.5, 0.3); dr.push(0, 0.25, 1);
      }
      if (i < n && !(i === n - 1)) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      if (i === n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    geo.setAttribute('aWave', new THREE.Float32BufferAttribute(wv, 3));
    geo.setAttribute('aDir', new THREE.Float32BufferAttribute(dr, 3));
    geo.setIndex(idx);
    kit.add(geo, 'cloth', null);
  };
  ribbon(new THREE.Vector3(R + 0.1, cy, 0), 3.2, 0.32, new THREE.Color(pens[0]), 0, 1);
  ribbon(new THREE.Vector3(R + 0.05, cy - 0.35, 0), 2.6, 0.26, new THREE.Color(pens[1]), 1.3, 1);
  ribbon(new THREE.Vector3(-R - 0.1, cy, 0), 3.0, 0.32, new THREE.Color(pens[2]), 2.1, 1.0);
  ribbon(new THREE.Vector3(0, cy + R + 1.3, 0), 2.2, 0.3, new THREE.Color(pens[0]), 3.3, 1);
  kit.build(g, { inkWidth: 0.025 });
  // the gate's chimes: big brass tubes on the crossbar
  const n = opts.tubes ?? 4;
  const tubes = new THREE.InstancedMesh(chimeTubeGeo(8.5), townMat('brass'), n);
  tubes.castShadow = true; tubes.frustumCulled = false;
  const attach: THREE.Vector3[] = [], len: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (barW * 0.62 / Math.max(1, n - 1));
    attach.push(new THREE.Vector3(x, -0.04, 0));
    len.push(1.5 + (1 - Math.abs(i - (n - 1) / 2) / ((n + 1) / 2)) * 1.1 + r() * 0.15);
    tubes.setColorAt(i, new THREE.Color(i % 2 ? '#f0d48a' : '#dfe6ee'));
  }
  const body = new THREE.Group(); body.add(tubes); g.add(body);
  body.position.set(0, barY, 0);   // the set swings about the crossbar
  const chime = new Chime(g, body, tubes, attach, len, seed + 9, 0.35, 0.5);
  g.userData.chime = chime;
  g.userData.update = (dt: number, t: number) => chime.update(dt, t);
  chime.update(0, 0);
  g.userData.center = new THREE.Vector3(0, cy, 0);
  g.userData.radius = R - 0.15;
  g.userData.tris = kit.tris;
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

export { flowerDrifts, type DriftOpts, type FlowerKind as SailFlowerKind } from './sailtownFlora';
export { CLOTH } from './sailtownKit';
export type { FlowerKind };
