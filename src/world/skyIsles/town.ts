// The dressing of every Sky Isle, after Oscar's pictures: Sailtown's round cream cottages with blue slate roofs,
// windmills, chimes, laundry, bunting, the striped stall, the footbridge over the stream that pours off the cliff,
// fences, planters, flagstone lanes, crates and barrels, kites tied to the roofs and the race gate (picture 2);
// Windmill Isle's tall windmill; the sail-mender's hut with drying sails and laundry; the Chime Garden's golden
// ring chimes; Whale's Rest's lookout; Landing Isle's signpost and streamers; the race rings round them all.
//
// Each island is dressed in its own flat frame (x, z on the top, y up, ground = the island's height function), then
// set on the planet: small props rigidly (so windmills turn and chimes swing), lanes, beds and bunting bent.
import * as THREE from 'three';
import type { SkyWorld } from './world';
import type { Isle } from './terrain';
import { sky } from './terrain';
import { bendGroup, rigidFromLocal } from './bend';
import {
  TownAnimator, roundCottage, windmill, laundryLine, bunting, awningStall, footBridge, fence, flowerPlanter,
  raceGate, pavedPath, addBarrel, addCrate, addPot, addSack, SAIL, FloraField, flowerBed, townTree, hedge,
  doorChimes, stoneWall, type PlanterKind,
} from './sailtown';
import { Kit, T, clothGrid, boxM, ropeGeo, WOOD_TILE } from './sailtownKit';
import { FestivalKite, FESTIVAL } from './kites';
import { islandTree } from './islandFlora';
import { RINGS, SPOTS } from './layout';
import { skyRng, pickOf } from './rand';

export interface Dressing {
  town: TownAnimator;
  kites: FestivalKite[];
  update(dt: number, t: number, camera: THREE.Camera): void;
  /** Named things for the story (the race gate, the windmill, the hut...), in planet-local space. */
  refs: Record<string, THREE.Object3D>;
}

type V2 = { x: number; z: number };

/** One island being dressed: props collected in its own frame, then set on the planet in one go. */
class Dresser {
  readonly rigid: THREE.Object3D[] = [];
  readonly flat = new THREE.Group();
  readonly placed: { x: number; z: number; r: number }[] = [];
  readonly solids: { obj: THREE.Object3D; r: number; h: number }[] = [];
  constructor(readonly w: SkyWorld, readonly isle: Isle, readonly town: TownAnimator) {
    // the bridges' landings stay clear of props and flowers
    for (const q of w.bridgeSpots.get(isle.def.id) ?? []) this.placed.push({ x: q.x, z: q.z, r: q.r });
  }
  ground = (x: number, z: number) => this.isle.shape.height(x, z);
  /** Metres (on the top) from local (x, z) to the river, or Infinity on an island without one. */
  river(x: number, z: number) {
    if (!this.isle.def.river) return Infinity;
    const p = this.w.p;
    return p.riverNearest(this.isle.dirAt(x, z)).dist * this.isle.Rt / p.R;
  }
  stream(x: number, z: number) {
    let d = Infinity;
    for (const st of this.isle.shape.streams) d = Math.min(d, this.isle.shape.nearest(st, x, z).d - this.isle.shape.nearest(st, x, z).w * 0.5);
    return d;
  }
  /** Room for something of radius r at (x, z): on the top, clear of the river, streams and everything placed. */
  free(x: number, z: number, r: number, riverPad = 8.5, edgePad = 1.4) {
    if (this.isle.inset(x, z) < r + edgePad) return false;
    if (this.river(x, z) < r + riverPad) return false;
    if (this.stream(x, z) < r + 1.2) return false;
    for (const q of this.placed) if (Math.hypot(q.x - x, q.z - z) < q.r + r + 0.5) return false;
    return true;
  }
  claim(x: number, z: number, r: number) { this.placed.push({ x, z, r }); }
  /** Keep the meadow grass off a spot (a lane, a doorstep) without reserving it. */
  bare(x: number, z: number, r: number) { this.bareSpots.push({ x, z, r }); }
  readonly bareSpots: { x: number; z: number; r: number }[] = [];
  /** Stand obj on the ground at (x, z), turned yaw (its +Z then faces atan2 direction yaw). */
  put<O extends THREE.Object3D>(obj: O, x: number, z: number, yaw = 0, dy = 0): O {
    obj.position.set(x, this.ground(x, z) + dy, z);
    obj.rotation.set(0, yaw, 0);
    this.rigid.push(obj);
    this.town.add(obj);
    return obj;
  }
  solid(obj: THREE.Object3D, r: number, h: number) { this.solids.push({ obj, r, h }); }
  /** Yaw that turns +Z from (x, z) toward (tx, tz). */
  face(x: number, z: number, tx: number, tz: number) { return Math.atan2(tx - x, tz - z); }
  /** Set everything on the planet. */
  finish() {
    const w = this.w, p = w.p;
    for (const o of this.rigid) { rigidFromLocal(o, this.isle); w.root.add(o); }
    if (this.flat.children.length) {
      const b = bendGroup(this.flat, this.isle);
      w.root.add(b);
    }
    // no tall grass on the lanes, under the houses or round the props
    for (const q of [...this.placed, ...this.bareSpots]) {
      const r = q.r + 0.3;
      w.bareGrass.push({ dir: this.isle.dirAt(q.x, q.z), cosIn: Math.cos(r / this.isle.Rt), cosOut: Math.cos((r + 0.9) / this.isle.Rt) });
    }
    for (const s of this.solids) {
      const a = new THREE.Object3D();
      a.position.copy(s.obj.position).add(p.center);
      a.quaternion.copy(s.obj.quaternion);
      a.scale.copy(s.obj.scale);
      w.anchors.add(a);
      p.solids.push({ obj: a, shape: { kind: 'circle', r: s.r }, h: s.h, id: 'sky' });
    }
  }
}

/** The village frame on an island: a = metres downriver from (lat, 0), b = metres out toward the + side. */
function riverFrame(isle: Isle, lat: number) {
  const c = isle.at(lat, 0), f = isle.at(lat + 4, 0), s = isle.at(lat, 8);
  const fx = f.x - c.x, fz = f.z - c.z, fl = Math.hypot(fx, fz);
  const F = { x: fx / fl, z: fz / fl };
  let sx = s.x - c.x, sz = s.z - c.z;
  const k = sx * F.x + sz * F.z; sx -= k * F.x; sz -= k * F.z;
  const sl = Math.hypot(sx, sz);
  const S = { x: sx / sl, z: sz / sl };
  return (a: number, b: number): V2 => ({ x: c.x + F.x * a + S.x * b, z: c.z + F.z * a + S.z * b });
}

/** Zones the island builder keeps free of its own trees and bushes, where the dressing goes. */
export function planZones(w: SkyWorld) {
  const ST = sky(w.p);
  const V = riverFrame(ST.isle('sailtown'), 56);
  const zs: { x: number; z: number; r: number }[] = [];
  for (let a = -26; a <= 18; a += 6) for (const b of [11, 17, 23]) { const q = V(a, b); zs.push({ ...q, r: 5 }); }
  w.clearZones.set('sailtown', zs);
  const C = ST.isle('chime');
  w.clearZones.set('chime', [{ x: 0, z: 0, r: C.def.r * 0.45 }]);
  const L = ST.isle('landing'), VL = riverFrame(L, 20);
  w.clearZones.set('landing', [{ ...VL(0, 7), r: 5 }, { ...VL(-3, 10), r: 4 }]);
  w.clearZones.set('windmill', [{ x: 0, z: 0, r: 4.5 }]);
  w.clearZones.set('mender', [{ x: 0, z: 0, r: 5 }]);
  w.clearZones.set('whales', [{ ...riverFrame(ST.isle('whales'), 172)(0, 6), r: 6 }]);
}

const ROOF_KITE_COLS = [['#d94a3a', '#f2c24a'], ['#4a7cc8', '#f6ecd4'], ['#f08a44', '#8cc46a'], ['#e8809a', '#a48ad4'], ['#f2c24a', '#4a7cc8'], ['#5ab4b4', '#ee8a78']];

export function dressIsles(w: SkyWorld): Dressing {
  const town = new TownAnimator();
  town.cullDistance = 70;
  const kites: FestivalKite[] = [];
  const refs: Record<string, THREE.Object3D> = {};
  const ST = sky(w.p);
  const rnd = skyRng(2024);
  const dressers: Dresser[] = [];
  const D = (id: string) => { const d = new Dresser(w, ST.isle(id), town); dressers.push(d); return d; };

  /** A kite tied to a point (local to the dresser's island), flying downwind. */
  const kiteAt = (d: Dresser, x: number, y: number, z: number, height: number, seed: number) => {
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    d.rigid.push(holder);
    const cols = ROOF_KITE_COLS[seed % ROOF_KITE_COLS.length];
    const k = new FestivalKite({ colors: [cols[0], cols[1], pickOf(rnd, FESTIVAL)], anchor: new THREE.Vector3(0, 0, 0), height, seed, size: 1.1 + rnd() * 0.5, shape: (seed % 3) as 0 | 1 | 2, pattern: (seed % 4) as 0 | 1 | 2 | 3, wind: new THREE.Vector3(1, 0, 0.35) });
    holder.add(k.root);
    kites.push(k);
    return k;
  };

  /** A tall pole with a long pennant, for festival streamers. */
  const pennantPole = (seed: number, h = 4.6) => {
    const r = skyRng(seed);
    const kit = new Kit();
    kit.add(new THREE.CylinderGeometry(0.05, 0.075, h, 7), 'wood', SAIL.weathered, T(0, h / 2, 0));
    kit.add(new THREE.SphereGeometry(0.09, 8, 6), 'brass', SAIL.brass, T(0, h + 0.06, 0));
    const c = new THREE.Color(pickOf(r, SAIL.festival)), c2 = new THREE.Color(pickOf(r, SAIL.festival));
    const L = 2.2 + r() * 1.4;
    const flag = clothGrid(0.5, L, 2, 10, (_u, v) => (v < 0.5 ? c : c2), { weight: (_u, v) => Math.pow(v, 1.1), phase: r() * 6, stiff: 0.2, dir: new THREE.Vector3(0, 0, 1) });
    // a long tail hanging off the top, blown out in the shader
    kit.add(flag, 'cloth', null, T(0, h - 0.1, 0, 0, 0, Math.PI / 2 - 0.25));
    const g = new THREE.Group(); g.name = 'pennantPole';
    kit.build(g, { inkWidth: 0.014 });
    return g;
  };

  /** Clutter at a doorstep: barrels, crates, a sack, pots of flowers (one merged prop). */
  const clutter = (d: Dresser, spots: { x: number; z: number; kind: number }[], seed: number) => {
    const k = new Kit(), kr = skyRng(seed);
    for (const s of spots) {
      const m = T(s.x, d.ground(s.x, s.z), s.z, 0, kr() * 6, 0);
      if (s.kind === 0) addBarrel(k, m, kr);
      else if (s.kind === 1) addCrate(k, m, kr, 0.55, 0.4, 0.32, kr() > 0.5 ? '#d8443a' : undefined);
      else if (s.kind === 2) addSack(k, m, kr, 0.5);
      else addPot(k, m, kr, 0.16, [pickOf(kr, ['#f07aa0', '#ffffff', '#f2d23d', '#e0473b', '#b48ae0'])]);
    }
    const g = new THREE.Group(); g.name = 'clutter';
    k.build(g, { inkWidth: 0.016 });
    d.flat.add(g);
  };

  /** A fence along a polyline of local points, following the ground. */
  const fenceRun = (d: Dresser, pts: V2[], seed: number) => {
    const bridges = w.bridgeSpots.get(d.isle.def.id) ?? [];
    const onBridge = (q: V2) => bridges.some(b => Math.hypot(b.x - q.x, b.z - q.z) < b.r);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.6) continue;
      // a gap where a bridge comes in
      if (onBridge(a) || onBridge(b) || onBridge({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 })) continue;
      const y0 = d.ground(a.x, a.z);
      const f = fence(len, { seed: seed + i, heightAt: x => d.ground(a.x + (b.x - a.x) * x / len, a.z + (b.z - a.z) * x / len) - y0 });
      f.position.set(a.x, y0 - 0.02, a.z);
      f.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
      d.flat.add(f);
    }
  };

  /** A race ring (a golden ring chime on its tall pole), its ring centre `ring` metres up, facing along `yaw`. */
  /** The race rings in RINGS order (the story's qualifier and race fly through them). */
  const rings: THREE.Object3D[] = [];
  refs.rings = rings as unknown as THREE.Object3D;
  const ring = (d: Dresser, x: number, z: number, yaw: number, ringH: number, seed: number) => {
    const g = d.put(raceGate({ seed, height: ringH }), x, z, yaw, -0.05);
    d.solid(g, 0.35, ringH + 3);
    return g;
  };

  // ================================================================ Sailtown
  {
    const d = D('sailtown');
    const isle = d.isle;
    const V = riverFrame(isle, 56);
    const st = isle.shape.streams[0];
    // the lane: from the aqueduct's arrival, through the village along the river side, down to the race gate
    const laneAB: [number, number][] = [[-30, 7.5], [-24, 9.5], [-17, 11], [-10, 11.5], [-3, 11.2], [4, 11.6], [11, 12.4], [16, 14.5], [20, 17]];
    const laneAll = laneAB.map(([a, b]) => V(a, b)).filter(q => isle.inset(q.x, q.z) > 1.2);
    // cut the lane where the stream crosses it: the footbridge spans the gap
    let cross = -1, crossP: V2 | null = null;
    for (let i = 0; i < laneAll.length - 1 && st; i++) {
      for (let k = 0; k <= 10; k++) {
        const q = { x: laneAll[i].x + (laneAll[i + 1].x - laneAll[i].x) * k / 10, z: laneAll[i].z + (laneAll[i + 1].z - laneAll[i].z) * k / 10 };
        if (d.stream(q.x, q.z) < 0.2) { cross = i; crossP = q; break; }
      }
      if (cross >= 0) break;
    }
    const lanes: V2[][] = [];
    if (cross >= 0 && crossP) {
      const a = laneAll[cross], b = laneAll[cross + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
      const gapHalf = 2.6;
      lanes.push([...laneAll.slice(0, cross + 1), { x: crossP.x - ux * gapHalf, z: crossP.z - uz * gapHalf }]);
      lanes.push([{ x: crossP.x + ux * gapHalf, z: crossP.z + uz * gapHalf }, ...laneAll.slice(cross + 1)]);
      const br = footBridge(5.6, { seed: 4, width: 1.5 });
      d.put(br, crossP.x, crossP.z, Math.atan2(-uz, ux), -0.12);
      refs.footbridge = br;
      d.claim(crossP.x, crossP.z, 2.6);
    } else lanes.push(laneAll);
    const laneGroups = lanes.filter(l => l.length > 1).map((l, i) => pavedPath(l.map(q => new THREE.Vector3(q.x, 0, q.z)), 1.9, 4 + i, d.ground));
    for (const g of laneGroups) d.flat.add(g);
    const laneDist = (x: number, z: number) => Math.min(...laneGroups.map(g => (g.userData.dist as (x: number, z: number) => number)(x, z)));
    for (const l of lanes) for (const q of l) d.claim(q.x, q.z, 1.1);
    for (let i = 0; i < lanes.length; i++) for (let k = 0; k < lanes[i].length - 1; k++) {
      const a = lanes[i][k], b = lanes[i][k + 1];
      for (let s = 0.25; s < 1; s += 0.25) d.claim(a.x + (b.x - a.x) * s, a.z + (b.z - a.z) * s, 1.1);
    }
    // the round cottages: along the outer side of the lane, doors to the lane, a second row behind
    const cotSpots: [number, number, number][] = [
      [-25, 15.5, 2.1], [-18, 16.5, 2.3], [-11, 17, 2.0], [-4, 16.5, 2.4], [3, 17, 2.1], [10, 17.5, 2.0],
      [-21, 22.5, 1.8], [-14, 23.5, 1.9], [-7, 23, 1.8], [1, 23.5, 1.9], [8, 23, 1.8],
    ];
    const cottages: THREE.Group[] = [];
    let seed = 3;
    for (const [a, b, r] of cotSpots) {
      let q = V(a, b);
      let ok = d.free(q.x, q.z, r + 0.6, 8.5, 1.6);
      for (let k = 0; !ok && k < 6; k++) { q = V(a + (k % 2 ? 1.5 : -1.5) * Math.ceil((k + 1) / 2), b - 1); ok = d.free(q.x, q.z, r + 0.6, 8.5, 1.6); }
      if (!ok) continue;
      // face the nearest point of the lane
      let best = { x: q.x, z: q.z }, bd = Infinity;
      for (const l of lanes) for (const pt of l) { const dd = Math.hypot(pt.x - q.x, pt.z - q.z); if (dd < bd) { bd = dd; best = pt; } }
      const c = roundCottage({
        seed: seed += 8, radius: r, chimes: cottages.length % 2 === 0, vane: cottages.length === 3, windows: 2 + (seed % 3), upperWindows: 2 + (seed % 2),
        shutter: pickOf(rnd, SAIL.shutters),
      });
      d.put(c, q.x, q.z, d.face(q.x, q.z, best.x, best.z), -0.05);
      d.claim(q.x, q.z, r + 0.5);
      d.solid(c, (c.userData.wallRadius as number) + 0.1, 6);
      cottages.push(c);
    }
    refs.cottage = cottages[3] ?? cottages[0];
    // windmills on the rise behind the village
    const mills: THREE.Group[] = [];
    for (const [a, b, h] of [[-12, 29, 10.5], [4, 29.5, 9], [-26, 26, 8.5], [14, 26, 8], [-3, 30, 9]] as const) {
      if (mills.length >= 2) break;
      const q = V(a, b);
      if (!d.free(q.x, q.z, 2.4, 8.5, 2.2)) continue;
      const m = windmill({ seed: 5 + mills.length * 4, height: h, gallery: mills.length === 0, speed: 0.5 + mills.length * 0.2 });
      d.put(m, q.x, q.z, d.face(q.x, q.z, V(0, 8).x, V(0, 8).z) + 0.6, -0.05);
      d.claim(q.x, q.z, 2.4);
      d.solid(m, 1.9, h);
      mills.push(m);
    }
    // the market stall at the bend of the lane, on the river side
    for (const [a, b] of [[-6.5, 7.6], [0, 7.2], [-13, 7.4], [6, 7.6]] as const) {
      const q = V(a, b);
      if (!d.free(q.x, q.z, 1.5, 4.8, 1.5)) continue;
      const sp = V(a, 11.3);
      const s = d.put(awningStall({ seed: 2 }), q.x, q.z, d.face(q.x, q.z, sp.x, sp.z));
      d.claim(q.x, q.z, 1.7);
      d.solid(s, 1.3, 2.5);
      refs.stall = s;
      break;
    }
    // laundry in the yards between the cottages
    let lines = 0;
    for (const [a, b] of [[-14.5, 19.5], [-0.5, 20], [7, 20.5], [-22, 19]] as const) {
      if (lines >= 2) break;
      const q = V(a, b), q2 = V(a + 4.5, b);
      if (!d.free(q.x, q.z, 0.6) || !d.free(q2.x, q2.z, 0.6) || !d.free((q.x + q2.x) / 2, (q.z + q2.z) / 2, 0.8)) continue;
      const g = laundryLine(4.5, 3 + lines * 4);
      g.position.set(q.x, d.ground(q.x, q.z), q.z);
      g.rotation.y = Math.atan2(-(q2.z - q.z), q2.x - q.x);
      d.rigid.push(g); town.add(g);
      d.claim((q.x + q2.x) / 2, (q.z + q2.z) / 2, 2.3);
      lines++;
    }
    // bunting swagged between the eaves across the lane, and on poles along it
    const eave = (c: THREE.Object3D, toward: V2, dy = 0) => {
      const a = Math.atan2(toward.x - c.position.x, toward.z - c.position.z);
      const R = (c.userData.radius as number) - 0.3;
      return new THREE.Vector3(c.position.x + Math.sin(a) * R, c.position.y + (c.userData.eaveY as number) + dy, c.position.z + Math.cos(a) * R);
    };
    const poles: THREE.Vector3[] = [];
    for (let a = -26; a <= 16; a += 7) {
      const q = V(a, 8.4);
      if (d.river(q.x, q.z) < 5.6 || d.isle.inset(q.x, q.z) < 1.5 || d.stream(q.x, q.z) < 1) continue;
      const h = 4.4;
      const pole = pennantPole(40 + a, h);
      d.put(pole, q.x, q.z, rnd() * 6);
      d.solid(pole, 0.12, h);
      poles.push(new THREE.Vector3(q.x, d.ground(q.x, q.z) + h - 0.3, q.z));
    }
    const bunt = new THREE.Group();
    for (let i = 0; i < Math.min(cottages.length, 6); i++) {
      const c = cottages[i];
      let best: THREE.Vector3 | null = null, bd = 12;
      for (const pl of poles) { const dd = Math.hypot(pl.x - c.position.x, pl.z - c.position.z); if (dd < bd) { bd = dd; best = pl; } }
      if (best) bunt.add(bunting([eave(c, { x: best.x, z: best.z }, 0.1), best], 10 + i));
      if (i + 1 < cottages.length && cottages[i + 1].position.distanceTo(c.position) < 10) {
        const n = cottages[i + 1];
        bunt.add(bunting([eave(c, { x: n.position.x, z: n.position.z }, 0.15), eave(n, { x: c.position.x, z: c.position.z }, 0.15)], 30 + i));
      }
    }
    for (let i = 0; i < poles.length - 1; i++) if (poles[i].distanceTo(poles[i + 1]) < 11) bunt.add(bunting([poles[i], poles[i + 1]], 50 + i));
    d.flat.add(bunt);
    // kites tied to the roofs, flying high over the village
    cottages.slice(0, 6).forEach((c, i) => {
      if (i % 2 === 1 && i !== 3) return;
      const box = new THREE.Box3().setFromObject(c);
      kiteAt(d, c.position.x, box.max.y - 0.2, c.position.z, 9 + (i % 3) * 3, 7 + i * 3);
    });
    // the race start and finish: a ring gate out on the lip past the end of the lane, facing out over the clouds
    {
      const end = V(21, 19);
      let best: V2 | null = null;
      for (let k = 0; k < 40 && !best; k++) {
        const q = V(18 + (k % 5) * 2, 15 + Math.floor(k / 5) * 1.5);
        if (isle.inset(q.x, q.z) > 2.2 && isle.inset(q.x, q.z) < 6 && d.free(q.x, q.z, 1.2, 8.5, 2)) best = q;
      }
      const g0 = best ?? end;
      const out = Math.atan2(g0.z, g0.x);
      const gate = ring(d, g0.x, g0.z, Math.atan2(Math.cos(out), Math.sin(out)), 7.6, 4);
      d.claim(g0.x, g0.z, 2);
      refs.raceGate = gate;
      // the crowd's fence along the lip by the gate
      const f: V2[] = [];
      for (let a = out - 0.5; a <= out + 0.5; a += 0.12) { const r = isle.shape.outline(a) - 1.2; f.push({ x: Math.cos(a) * r, z: Math.sin(a) * r }); }
      fenceRun(d, f.filter(q => d.stream(q.x, q.z) > 1.4), 61);
    }
    // a fence and deep flower beds between the lane and the river meadow, broken for the stall
    const fenceLine: V2[] = [];
    for (let a = -24; a <= 14; a += 2.5) { const q = V(a, 9.4); if (isle.inset(q.x, q.z) > 1 && d.stream(q.x, q.z) > 1.6 && d.river(q.x, q.z) > 6.4) fenceLine.push(q); else if (fenceLine.length) break; }
    fenceRun(d, fenceLine, 21);
    const field = new FloraField();
    const keep = (x: number, z: number) => isle.inset(x, z) > 0.6 && d.stream(x, z) > 0.7 && laneDist(x, z) > 0.15 && !d.placed.some(q => q.r > 1.5 && Math.hypot(q.x - x, q.z - z) < q.r);
    if (fenceLine.length > 1) {
      flowerBed(field, { line: fenceLine.map(q => new THREE.Vector3(q.x, 0, q.z)), depth: 1.6, side: 1, height: 1.0, heightAt: d.ground, keep, seed: 3, density: 11, mix: { daisy: 3, coreopsis: 2.5, lavender: 2.5, cosmos: 1.4, buttercup: 1 } });
    }
    // beds at the cottages' feet, and flowers crowding the lip beside the falls (picture 2)
    cottages.forEach((c, i) => {
      const arc: THREE.Vector3[] = [];
      const R = (c.userData.wallRadius as number) + 0.55;
      for (let a = c.rotation.y + 0.7; a < c.rotation.y + 2.4; a += 0.2) arc.push(new THREE.Vector3(c.position.x + Math.sin(a) * R, 0, c.position.z + Math.cos(a) * R));
      flowerBed(field, { line: arc, depth: 0.8, side: -1, height: 0.8, heightAt: d.ground, keep, seed: 70 + i, density: 10, mounds: false, mix: { cosmos: 1.5, daisy: 2, lavender: 1.5, alyssum: 1 } });
    });
    if (st) {
      const lipA = Math.atan2(st.pts[st.pts.length - 1].y, st.pts[st.pts.length - 1].x);
      for (const s of [-1, 1] as const) {
        const line: THREE.Vector3[] = [];
        for (let a = lipA + s * 0.07; Math.abs(a - lipA) < 0.36; a += s * 0.02) { const r = isle.shape.outline(a) - 1.0; line.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
        flowerBed(field, { line, depth: 2.4, side: s, height: 1.0, heightAt: d.ground, keep, seed: 90 + s, density: 12, mix: { lavender: 2.5, daisy: 3, cosmos: 1.5, coreopsis: 1.2, alyssum: 1 } });
      }
      // and along the stream's banks
      const bank: THREE.Vector3[] = st.pts.filter((_, i) => i % 3 === 0).map(v => new THREE.Vector3(v.x, 0, v.y));
      flowerBed(field, { line: bank, depth: 1.3, side: 1, height: 0.9, heightAt: d.ground, keep: (x, z) => keep(x, z) && d.stream(x, z) > 0.9, seed: 95, density: 8, mix: { daisy: 2, buttercup: 2, lavender: 1 } });
    }
    d.flat.add(field.build(undefined, { fade: [18, 40] }));
    // planters by the doors, clutter at the walls, trees and hedges between the houses
    const clut: { x: number; z: number; kind: number }[] = [];
    cottages.forEach((c, i) => {
      const yaw = c.rotation.y, R = (c.userData.wallRadius as number);
      const at = (da: number, dr: number) => ({ x: c.position.x + Math.sin(yaw + da) * (R + dr), z: c.position.z + Math.cos(yaw + da) * (R + dr) });
      const pl = at(0.75, 0.55);
      if (laneDist(pl.x, pl.z) > 0.4) {
        const kinds: PlanterKind[] = ['hydrangea', 'lavender', 'roses', 'mixed'];
        d.put(flowerPlanter(kinds[i % 4], 5 + i, { width: 0.9 }), pl.x, pl.z, yaw);
      }
      for (const [da, kind] of [[-0.7, 0], [-0.9, 0], [-0.55, 3], [1.1, 1], [1.3, 3], [-1.15, 2]] as const) {
        if ((i + kind) % 3 === 2) continue;
        const q = at(da, 0.38);
        if (laneDist(q.x, q.z) > 0.25) clut.push({ ...q, kind });
      }
      if (c.userData.chime) refs['chimes' + i] = c;
    });
    clutter(d, clut, 8);
    let trees = 0;
    for (const [a, b, h] of [[-28, 20, 7.5], [-16, 28, 8], [-9, 20.5, 6.5], [6, 21, 6.4], [13, 21.5, 7], [-22, 28, 7], [16, 9.5, 6], [-31, 12, 7], [1, 28, 7.5]] as const) {
      const q = V(a, b);
      if (!d.free(q.x, q.z, 1.2, 8.0, 2.0)) continue;
      const tr = townTree({ seed: 20 + trees, height: h });
      d.put(tr, q.x, q.z, rnd() * 6, -0.05);
      d.claim(q.x, q.z, 1.2);
      d.solid(tr, 0.35, 3);
      trees++;
    }
    for (const [a0, b0, a1, b1] of [[-20, 20.2, -17.5, 20.5], [5.5, 20.5, 7.5, 20.5], [-9, 20, -7, 20.2]] as const) {
      const p0 = V(a0, b0), p1 = V(a1, b1);
      if (!d.free(p0.x, p0.z, 0.6) || !d.free(p1.x, p1.z, 0.6)) continue;
      const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      const hg = hedge(len, { seed: Math.round(a0 * 3 + 50), height: 0.95, blossom: a0 < 0 ? '#ffffff' : '#f6b8cc' });
      hg.position.set(p0.x, d.ground(p0.x, p0.z), p0.z); hg.rotation.y = Math.atan2(-(p1.z - p0.z), p1.x - p0.x);
      d.flat.add(hg);
    }
    refs.sailSquare = d.put(new THREE.Object3D(), V(-3, 11.2).x, V(-3, 11.2).z);
  }

  // ================================================================ Windmill Isle: the tallest windmill
  {
    const d = D('windmill');
    const m = windmill({ seed: 31, height: 14, radius: 2.4, sail: 6.5, gallery: true, speed: 0.45 });
    // turned so the sails face Sailtown
    const s = d.isle.toLocal(ST.isle('sailtown').up);
    d.put(m, 0, 0, Math.atan2(s.x, s.z), -0.05);
    d.claim(0, 0, 3);
    d.solid(m, 2.3, 14);
    refs.windmill = m;
    m.userData.sailLen = 6.5;
    // the climbing rope (picture a long golden braid let down from a tower): it hangs from a little lookout
    // balcony near the top, on the side away from the sails, down to the grass
    const climb = millRope(14, 2.4);
    m.add(climb);
    m.userData.rope = climb.userData;
    const f: V2[] = [];
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.2) f.push({ x: Math.cos(a) * 4.6, z: Math.sin(a) * 4.6 });
    fenceRun(d, f.filter(q => d.isle.inset(q.x, q.z) > 1), 71);
    // clutter at the foot, kept off the rope's landing spot and the bridges' landings
    {
      const yaw = m.rotation.y, rx = Math.cos(yaw) * 3.45, rz = -Math.sin(yaw) * 3.45;
      const spots = [{ x: 2.9, z: 1.2, kind: 2 }, { x: 3.1, z: 0.5, kind: 2 }, { x: 2.6, z: 1.9, kind: 0 }, { x: -2.9, z: -1, kind: 1 }, { x: -2.2, z: 2.6, kind: 0 }, { x: 1.2, z: -3.1, kind: 2 }]
        .filter(q => Math.hypot(q.x - rx, q.z - rz) > 2.2 && d.free(q.x, q.z, 0.3, 0, 0.8));
      clutter(d, spots.slice(0, 4), 12);
      d.claim(rx, rz, 1.6);
    }
    for (let i = 0; i < 2; i++) { const a = 1 + i * 2.6, r = 6; if (d.free(Math.cos(a) * r, Math.sin(a) * r, 1, 0, 1.5)) { const p = d.put(pennantPole(80 + i, 5.5), Math.cos(a) * r, Math.sin(a) * r); d.solid(p, 0.12, 5); } }
  }

  // ================================================================ Sail-mender's Isle
  {
    const d = D('mender');
    const hut = roundCottage({ seed: 61, radius: 1.9, wallHeight: 2.9, chimes: true, windows: 2, upperWindows: 0, shutter: '#7fa36a', roses: true });
    const ch = d.isle.toLocal(ST.isle('chime').up);
    const away = { x: -ch.x, z: -ch.z }, al = Math.hypot(away.x, away.z);
    const hp = { x: away.x / al * 2.5, z: away.z / al * 2.5 };
    d.put(hut, hp.x, hp.z, d.face(hp.x, hp.z, ch.x, ch.z), -0.05);
    d.claim(hp.x, hp.z, 2.6);
    d.solid(hut, 2.0, 5);
    refs.menderHut = hut;
    // drying sails: big sail-cloths hung from frames, and two lines of laundry
    const sailKit = new Kit();
    const sr = skyRng(63);
    for (let i = 0; i < 3; i++) {
      const a = Math.atan2(ch.z, ch.x) + (i - 1) * 0.75, r = 4.2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!d.free(x, z, 1.2, 0, 1.2)) continue;
      const y = d.ground(x, z), H = 3.3, W = 2.6 + sr() * 0.6;
      const yaw = Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI / 2;
      const m = T(x, y, z, 0, yaw, 0);
      sailKit.with(m, () => {
        for (const s of [-1, 1]) sailKit.add(boxM(0.1, H + 0.2, 0.1, WOOD_TILE, true), 'wood', SAIL.weathered, T(s * (W / 2 + 0.1), (H + 0.2) / 2, 0));
        sailKit.add(boxM(W + 0.5, 0.09, 0.09, WOOD_TILE), 'wood', SAIL.weathered, T(0, H + 0.05, 0));
        const base = new THREE.Color(pickOf(sr, ['#f4ead4', '#efe2c4', '#f6efe0'])), stripe = new THREE.Color(pickOf(sr, ['#d94a3a', '#4a7cc8', '#f2c24a']));
        sailKit.add(clothGrid(W, H - 0.5, 8, 10, (u, v) => (Math.abs(v - 0.7) < 0.08 || u < 0.08 ? stripe : base), { phase: sr() * 6, stiff: 0.1 }), 'cloth', null, T(0, H, 0));
      });
      d.claim(x, z, 1.6);
    }
    const sails = new THREE.Group(); sailKit.build(sails, { inkWidth: 0.016 }); d.flat.add(sails);
    let n = 0;
    for (let a = 0; a < 6.28 && n < 2; a += 0.5) {
      const r = 4.6, x0 = Math.cos(a) * r, z0 = Math.sin(a) * r, x1 = Math.cos(a + 0.9) * r, z1 = Math.sin(a + 0.9) * r;
      if (!d.free(x0, z0, 0.5, 0, 1.2) || !d.free(x1, z1, 0.5, 0, 1.2) || !d.free((x0 + x1) / 2, (z0 + z1) / 2, 0.8, 0, 1)) continue;
      const g = laundryLine(Math.hypot(x1 - x0, z1 - z0), 11 + n);
      g.position.set(x0, d.ground(x0, z0), z0); g.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
      d.rigid.push(g); town.add(g);
      d.claim((x0 + x1) / 2, (z0 + z1) / 2, 2.2);
      n++;
    }
    clutter(d, [{ x: hp.x + 2.3, z: hp.z + 0.3, kind: 2 }, { x: hp.x + 2.2, z: hp.z - 0.6, kind: 1 }, { x: hp.x - 1.9, z: hp.z + 1.5, kind: 0 }], 14);
  }

  // ================================================================ The Chime Garden: giant golden ring chimes
  {
    const d = D('chime');
    const isle = d.isle;
    // the qualifier's six rings stand on one round loop about the garden's middle, 60 degrees apart, set 30 degrees
    // off the river so no pole stands in it: every turn from one ring to the next is the same soft curve
    const VC = riverFrame(isle, 101.7);
    for (const [i, rg] of RINGS.filter(r => r.isle === 'chime').entries()) {
      const at = (rad: number, da = 0) => { const a = (150 - i * 60 + da) * Math.PI / 180; return VC(Math.cos(a) * rad, Math.sin(a) * rad); };
      let q = rg.qualifier ? at(15) : isle.at(rg.lat, rg.off);
      if (rg.qualifier && !d.free(q.x, q.z, 0.8, 2.5, 2)) {
        // nudge it onto good ground, only a little (the loop's shape must stay gentle)
        for (let k = 1; k < 12; k++) {
          const q2 = at(15 + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.6, (k % 3 - 1) * 4);
          if (d.free(q2.x, q2.z, 0.8, 2.5, 2)) { q = q2; break; }
        }
      }
      // rings face along the qualifier's loop (round the garden's centre)
      const c0 = VC(0, 0), tang = Math.atan2(-(q.z - c0.z), q.x - c0.x);
      rings[RINGS.indexOf(rg)] = ring(d, q.x, q.z, tang, rg.ring, 10 + i);
      d.claim(q.x, q.z, 1.5);
    }
    // the chime-maker's workshop: a cottage, its awning, chimes hanging all round
    const V = riverFrame(isle, 106);
    let wq: V2 | null = null;
    for (const [a, b] of [[4, -12], [0, -13], [8, -11], [-4, -12], [6, 12], [0, 13]] as const) { const q = V(a, b); if (d.free(q.x, q.z, 2.6, 8, 1.8)) { wq = q; break; } }
    if (wq) {
      const lane = V(0, Math.sign(wq.z) * 3);
      const ws = roundCottage({ seed: 77, radius: 2.2, chimes: true, vane: true, shutter: '#5d84b4' });
      d.put(ws, wq.x, wq.z, d.face(wq.x, wq.z, lane.x, lane.z), -0.05);
      d.claim(wq.x, wq.z, 2.8);
      d.solid(ws, 2.3, 6);
      refs.workshop = ws;
      // posts of door chimes round the workshop
      for (let k = 0; k < 5; k++) {
        const a = ws.rotation.y + 0.9 + k * 0.42, R = 4.2;
        const x = wq.x + Math.sin(a) * R, z = wq.z + Math.cos(a) * R;
        if (!d.free(x, z, 0.3, 6, 1.2)) continue;
        const post = new THREE.Group();
        const pk = new Kit();
        pk.add(new THREE.CylinderGeometry(0.05, 0.07, 2.4, 6), 'wood', SAIL.weathered, T(0, 1.2, 0));
        pk.add(boxM(0.7, 0.07, 0.07, WOOD_TILE), 'wood', SAIL.weathered, T(0.3, 2.35, 0));
        pk.build(post, { inkWidth: 0.014 });
        const ch = doorChimes({ seed: 100 + k, metal: k % 2 ? 'brass' : 'silver', size: 1.1 });
        ch.position.set(0.55, 2.3, 0); post.add(ch);
        d.put(post, x, z, rnd() * 6);
        d.solid(post, 0.1, 2.4);
        d.claim(x, z, 0.5);
      }
    }
    // a garden of flower beds and low hedges round the rings
    const field = new FloraField();
    const keep = (x: number, z: number) => isle.inset(x, z) > 0.8 && d.river(x, z) > 7.5 && !d.placed.some(q => Math.hypot(q.x - x, q.z - z) < q.r);
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9 + 0.3, r = isle.def.r * (0.35 + (k % 3) * 0.12);
      const line: THREE.Vector3[] = [];
      for (let s = -0.25; s <= 0.25; s += 0.06) line.push(new THREE.Vector3(Math.cos(a + s) * r, 0, Math.sin(a + s) * r));
      flowerBed(field, { line, depth: 1.6, side: 1, height: 0.9, heightAt: d.ground, keep, seed: 200 + k, density: 10, mix: { lavender: 2, daisy: 2.5, cosmos: 1.5, coreopsis: 1.5, alyssum: 1 } });
    }
    d.flat.add(field.build(undefined, { fade: [18, 40] }));
    // a low stone wall along the river's bank
    for (let a = -10; a <= 10; a += 5) {
      const p0 = V(a, -7.2), p1 = V(a + 4, -7.2);
      if (isle.inset(p0.x, p0.z) < 1.5 || isle.inset(p1.x, p1.z) < 1.5) continue;
      const len = Math.hypot(p1.x - p0.x, p1.z - p0.z), y0 = d.ground(p0.x, p0.z);
      const wl = stoneWall(len, { seed: 300 + a, height: 0.6, heightAt: x => d.ground(p0.x + (p1.x - p0.x) * x / len, p0.z + (p1.z - p0.z) * x / len) - y0 });
      wl.position.set(p0.x, y0 - 0.05, p0.z); wl.rotation.y = Math.atan2(-(p1.z - p0.z), p1.x - p0.x);
      d.flat.add(wl);
    }
  }

  // ================================================================ the race rings on the other islands
  for (const [i, rg] of RINGS.filter(r => r.isle !== 'chime').entries()) {
    const d = dressers.find(x => x.isle.def.id === rg.isle) ?? D(rg.isle);
    let q = d.isle.at(rg.lat, rg.off);
    if (!d.free(q.x, q.z, 1.0, 7, 1.6)) {
      for (let k = 1; k < 40; k++) { const a = k * 2.4, r = 0.6 * k; const q2 = { x: q.x + Math.cos(a) * r, z: q.z + Math.sin(a) * r }; if (d.free(q2.x, q2.z, 1.0, 7, 1.6)) { q = q2; break; } }
    }
    const out = Math.atan2(q.z, q.x);
    rings[RINGS.indexOf(rg)] = ring(d, q.x, q.z, Math.atan2(-Math.sin(out), Math.cos(out)), rg.ring, 20 + i);
    d.claim(q.x, q.z, 1.5);
  }

  // ================================================================ Landing Isle: signpost, streamers, a cottage
  {
    const d = dressers.find(x => x.isle.def.id === 'landing') ?? D('landing');
    const isle = d.isle;
    const V = riverFrame(isle, 20);
    // the signpost by the arrival
    const sp = isle.at(SPOTS.signpost.lat, SPOTS.signpost.off);
    const sk = new Kit(), sr = skyRng(5);
    sk.add(boxM(0.14, 2.4, 0.14, WOOD_TILE, true), 'wood', SAIL.weathered, T(0, 1.2, 0));
    const boards: [number, number, string][] = [[2.0, 0.4, '#e9d2a6'], [1.65, -0.9, '#e2c896'], [1.3, 2.3, '#ecd8b0']];
    for (const [y, yaw, c] of boards) {
      sk.add(boxM(1.05, 0.22, 0.05, WOOD_TILE), 'wood', c, T(0.45 * Math.cos(yaw), y, -0.45 * Math.sin(yaw), 0, yaw, (sr() - 0.5) * 0.08));
      sk.add(new THREE.ConeGeometry(0.15, 0.24, 3).rotateZ(-Math.PI / 2), 'wood', c, T(0.98 * Math.cos(yaw), y, -0.98 * Math.sin(yaw), 0, yaw, 0));
    }
    const sign = new THREE.Group(); sign.name = 'signpost'; sk.build(sign, { inkWidth: 0.016 });
    d.put(sign, sp.x, sp.z, rnd() * 6);
    d.solid(sign, 0.15, 2.4);
    refs.signpost = sign;
    // streamers: poles along the bank and a swag of bunting between them
    const poles: THREE.Vector3[] = [];
    for (const [a, b] of [[-6, 7.6], [0, 8.2], [5, 7.6], [-12, 8], [10, 9]] as const) {
      const q = V(a, b);
      if (d.river(q.x, q.z) < 5.4 || isle.inset(q.x, q.z) < 1.5) continue;
      const h = 4.6;
      d.solid(d.put(pennantPole(130 + a, h), q.x, q.z, rnd() * 6), 0.12, h);
      poles.push(new THREE.Vector3(q.x, d.ground(q.x, q.z) + h - 0.3, q.z));
    }
    const bunt = new THREE.Group();
    for (let i = 0; i < poles.length - 1; i++) if (poles[i].distanceTo(poles[i + 1]) < 12) bunt.add(bunting([poles[i], poles[i + 1]], 140 + i));
    d.flat.add(bunt);
    // a cottage and a small windmill out on the far side (picture 1's left island)
    for (const [a, b] of [[-4, 15], [2, 16], [-10, 14], [6, 15]] as const) {
      const q = V(a, b);
      if (!d.free(q.x, q.z, 2.6, 8, 1.8)) continue;
      const c = roundCottage({ seed: 91, radius: 2.0, chimes: true, windows: 2, upperWindows: 1 });
      const tw = V(a, 5);
      d.put(c, q.x, q.z, d.face(q.x, q.z, tw.x, tw.z), -0.05);
      d.claim(q.x, q.z, 2.6); d.solid(c, 2.1, 6);
      kiteAt(d, q.x, d.ground(q.x, q.z) + 6.2, q.z, 11, 41);
      break;
    }
    for (const [a, b] of [[-14, -14], [-8, -16], [-2, -15], [4, -14]] as const) {
      const q = V(a, b);
      if (!d.free(q.x, q.z, 2.2, 8, 2.2)) continue;
      const m = windmill({ seed: 51, height: 8.5, gallery: false, speed: 0.6 });
      d.put(m, q.x, q.z, rnd() * 6, -0.05);
      d.claim(q.x, q.z, 2.2); d.solid(m, 1.8, 8);
      refs.landingMill = m;
      break;
    }
    clutter(d, [V(-1.5, 6.4), V(-2.2, 6.6), V(-1.9, 7.2)].map((q, i) => ({ ...q, kind: [0, 1, 0][i] })).filter(q => d.river(q.x, q.z) > 5.2), 18);
  }

  // ================================================================ Whale's Rest: the lookout over the south edge
  {
    const d = dressers.find(x => x.isle.def.id === 'whales') ?? D('whales');
    const isle = d.isle;
    const V = riverFrame(isle, 170);
    // a fence along the lip where the whales rise, on both sides of the river
    for (const s of [-1, 1]) {
      const pts: V2[] = [];
      for (let b = 6.5; b < 22; b += 1.6) {
        // walk out from the river along the south lip
        let best: V2 | null = null;
        for (let a = 2; a < 22; a += 0.4) { const q = V(a, s * b); if (isle.inset(q.x, q.z) < 1.4) { best = V(a - 1.2, s * b); break; } }
        if (best && isle.inset(best.x, best.z) > 0.6) pts.push(best);
      }
      fenceRun(d, pts.filter(q => d.river(q.x, q.z) > 6), 160 + s);
    }
    // benches to sit and watch the whales, streamers, a tree or two
    for (const [a, b] of [[4, 9], [3, -10]] as const) {
      const q = V(a, b);
      if (!d.free(q.x, q.z, 0.9, 6, 2)) continue;
      const bk = new Kit();
      bk.add(boxM(1.6, 0.08, 0.42, WOOD_TILE), 'wood', SAIL.plank, T(0, 0.46, 0));
      bk.add(boxM(1.6, 0.36, 0.06, WOOD_TILE), 'wood', SAIL.plank, T(0, 0.75, -0.2, -0.15, 0, 0));
      for (const x of [-0.65, 0.65]) bk.add(boxM(0.1, 0.46, 0.4, WOOD_TILE, true), 'wood', SAIL.weathered, T(x, 0.23, 0));
      const g = new THREE.Group(); bk.build(g, { inkWidth: 0.014 });
      const out = V(20, b);
      d.put(g, q.x, q.z, d.face(q.x, q.z, out.x, out.z));
      d.claim(q.x, q.z, 1);
    }
    for (const [a, b] of [[-2, 8], [-2, -8.5]] as const) {
      const q = V(a, b);
      if (!d.free(q.x, q.z, 0.3, 6, 1.5)) continue;
      const pp = d.put(pennantPole(170 + a + b, 5.2), q.x, q.z, rnd() * 6);
      d.solid(pp, 0.12, 5);
    }
    let n = 0;
    for (const [a, b] of [[-14, 14], [-8, -15], [-20, -10], [-22, 9]] as const) {
      const q = V(a, b);
      if (n >= 3 || !d.free(q.x, q.z, 1.4, 7, 2)) continue;
      const tr = islandTree(n % 2 ? 'round' : 'oak', skyRng(400 + n), 1.0);
      d.put(tr, q.x, q.z, rnd() * 6, -0.1);
      d.solid(tr, 0.4, 3); d.claim(q.x, q.z, 1.4); n++;
    }
    refs.whalesRest = d.put(new THREE.Object3D(), V(4, 4).x, V(4, 4).z);
  }

  for (const d of dressers) d.finish();
  for (const k of kites) k.update(0, 0);
  const camLocal = new THREE.Vector3();
  return {
    town, kites, refs,
    update(dt, t, camera) {
      // the animator compares world positions: the focus is the camera in world space
      camLocal.setFromMatrixPosition(camera.matrixWorld);
      town.focus.copy(camLocal);
      town.update(dt, t);
      for (const k of kites) k.update(dt, t);
    },
  };
}

/**
 * The windmill's climbing rope and the lookout balcony it hangs from (in the windmill's own frame: +X is the side
 * away from the sails). userData: ropeX (how far out the rope hangs), top (where the hands are at the top of the
 * climb), deckY (the balcony's planks), deckX0/deckX1 (its inner and outer ends), frame (where the kite frame waits).
 */
export function millRope(H: number, R: number): THREE.Group {
  const Rt = R * 0.7, rAt = (y: number) => R + (Rt - R) * (y / H);
  const yB = H - 1.7, x0 = rAt(yB) - 0.1, x1 = 3.7, ropeX = 3.45, w = 1.0;
  const k = new Kit(), r = skyRng(733);
  // the balcony: planks on three brackets, a rail round it with a gap at the outer end where the rope comes up
  for (let z = -w + 0.11; z < w; z += 0.25) k.add(boxM(x1 - x0, 0.07, 0.22, WOOD_TILE), 'wood', new THREE.Color(SAIL.plank).multiplyScalar(0.9 + r() * 0.15), T((x0 + x1) / 2, yB - 0.035, z, 0, (r() - 0.5) * 0.02, 0));
  k.add(boxM(x1 - x0, 0.12, 0.12, WOOD_TILE), 'wood', SAIL.timberDark, T((x0 + x1) / 2, yB - 0.12, -w + 0.06));
  k.add(boxM(x1 - x0, 0.12, 0.12, WOOD_TILE), 'wood', SAIL.timberDark, T((x0 + x1) / 2, yB - 0.12, w - 0.06));
  for (const z of [-w + 0.1, 0, w - 0.1]) {
    const a = new THREE.Vector3(rAt(yB - 1.6) + 0.02, yB - 1.6, z), b = new THREE.Vector3(x1 - 0.3, yB - 0.1, z);
    const dv = b.clone().sub(a), L = dv.length();
    k.add(boxM(0.11, 0.11, L, WOOD_TILE).translate(0, 0, L / 2), 'wood', SAIL.timberDark, new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dv.normalize()), new THREE.Vector3(1, 1, 1)));
  }
  const posts: [number, number][] = [[x0 + 0.15, -w + 0.05], [(x0 + x1) / 2, -w + 0.05], [x1 - 0.05, -w + 0.05], [x0 + 0.15, w - 0.05], [(x0 + x1) / 2, w - 0.05], [x1 - 0.05, w - 0.05], [x1 - 0.05, -0.42], [x1 - 0.05, 0.42]];
  for (const [x, z] of posts) k.add(boxM(0.08, 1.0, 0.08, WOOD_TILE, true), 'wood', SAIL.timber, T(x, yB + 0.5, z));
  for (const y of [0.55, 0.98]) {
    for (const s of [-1, 1]) k.add(boxM(x1 - x0 - 0.1, 0.06, 0.06, WOOD_TILE), 'wood', SAIL.timber, T((x0 + x1) / 2, yB + y, s * (w - 0.05)));
    for (const s of [-1, 1]) k.add(boxM(0.06, 0.06, w - 0.42, WOOD_TILE), 'wood', SAIL.timber, T(x1 - 0.05, yB + y, s * (w + 0.42) / 2));
  }
  // the davit the rope hangs from, braced back to the wall
  const dy = yB + 1.6;
  k.add(boxM(ropeX - rAt(dy) + 0.25, 0.14, 0.14, WOOD_TILE), 'wood', SAIL.timberDark, T((ropeX + rAt(dy)) / 2 + 0.05, dy, 0));
  {
    const a = new THREE.Vector3(rAt(yB + 0.6), yB + 0.6, 0), b = new THREE.Vector3(ropeX - 0.5, dy - 0.05, 0);
    const dv = b.clone().sub(a), L = dv.length();
    k.add(boxM(0.09, 0.09, L, WOOD_TILE).translate(0, 0, L / 2), 'wood', SAIL.timberDark, new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dv.normalize()), new THREE.Vector3(1, 1, 1)));
  }
  k.add(new THREE.TorusGeometry(0.09, 0.03, 5, 10), 'brass', SAIL.brass, T(ropeX, dy - 0.1, 0, 0, Math.PI / 2, 0));
  // the rope itself: three golden strands plaited into one thick braid, a knot every arm's length, and a ribbon
  // bow at the foot
  const top = dy - 0.15, foot = 0.35, n = Math.round((top - foot) / 0.08);
  const gold = new THREE.Color('#e8bc5a'), gold2 = new THREE.Color('#d6a246'), gold3 = new THREE.Color('#f2d27e');
  [gold, gold2, gold3].forEach((c, si) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const y = top - (top - foot) * i / n, a = i * 0.55 + si * Math.PI * 2 / 3;
      pts.push(new THREE.Vector3(ropeX + Math.cos(a) * 0.035, y, Math.sin(a) * 0.035));
    }
    k.add(ropeGeo(pts, 0.035, 5), 'plain', c, undefined);
  });
  for (let y = top - 0.9; y > foot + 0.3; y -= 0.75) k.add(new THREE.SphereGeometry(0.075, 7, 5).scale(1, 0.8, 1), 'plain', gold2, T(ropeX, y, 0));
  k.add(new THREE.SphereGeometry(0.1, 7, 5), 'plain', gold2, T(ropeX, foot, 0));
  for (const s of [-1, 1]) k.add(new THREE.ConeGeometry(0.09, 0.26, 4).rotateZ(s * Math.PI / 2), 'cloth', '#d94a3a', T(ropeX + s * 0.14, foot + 0.12, 0));
  const g = new THREE.Group(); g.name = 'millRope';
  k.build(g, { inkWidth: 0.016 });
  Object.assign(g.userData, { ropeX, top: top - 0.4, foot, deckY: yB, deckX0: x0, deckX1: x1, deckW: w * 2, frame: new THREE.Vector3(x0 + 0.35, yB + 0.62, 0.55) });
  return g;
}
