// World 2, the Sky Isles, built on the real planet: the floating islands (island.ts, bent onto the sphere), the
// river's aqueducts and cascades, the cloud sea round the planet with its far cumulus, flocks and castle ruins,
// sky whales drifting in and out of the clouds far below, rope bridges, cloud pads and updrafts, and every
// island's dressing (town.ts). Everything is drawn from the Sky Isles' own random numbers (rand.ts).
//
// SkyWorld.root sits at the planet's centre (so everything in it is in planet-local space); the cloud sea lives at
// the scene root (it places itself in world space). frame() runs the animation, only while you are in World 2.
import * as THREE from 'three';
import type { Planet } from '../planet';
import { buildFloatingIsland, floatingRock } from './island';
import { sky, POOL_R, type Isle } from './terrain';
import { BRIDGES, PADS, UPDRAFTS } from './layout';
import { SKY_VIEWPOINTS } from '../../data/skyStory';
import { bendGroup, placeRigid } from './bend';
import { aqueduct } from './aqueduct';
import { ropeBridge, bridgeFootprint } from './ropeBridge';
import { updraftColumn } from './updraft';
import { CloudSea } from './cloudSea';
import { CloudPad } from './cloudPad';
import { SkyWhale } from './whale';
import { puffMesh, type Puff } from './islandWater';
import { SKY_STEPS, SKY_STEP_HALF } from '../planet';
import { skyRng } from './rand';
import { dressIsles, planZones, type Dressing } from './town';
import { FINISH_CLOUD_MASK } from '../../render/finish';

export interface SkyWhaleRun { whale: SkyWhale; axis: THREE.Vector3; start: THREE.Vector3; speed: number; r: number; bob: number; ph: number }

export class SkyWorld {
  /** Everything on the planet, in planet-local space (positioned at the planet's centre). */
  readonly root = new THREE.Group();
  /** World-space helpers the game adds to the scene: deck anchors. */
  readonly anchors = new THREE.Group();
  sea: CloudSea | null = null;
  readonly pads: CloudPad[] = [];
  readonly whales: SkyWhaleRun[] = [];
  readonly isles: Isle[];
  dressing!: Dressing;
  private active = false;

  constructor(readonly p: Planet, readonly scene: THREE.Scene) {
    this.root.name = 'skyWorld';
    this.root.position.copy(p.center);
    this.anchors.name = 'skyAnchors';
    const T = sky(p);
    this.isles = T.isles;
    planZones(this);
    this.planBridges();
    this.planViews();
    this.buildIsles();
    this.buildRiver();
    this.buildBridges();
    this.buildPads();
    this.buildUpdrafts();
    this.buildRocks();
    this.dressing = dressIsles(this);
    this.thinGrass();
    this.buildSea();
    this.buildWhales();
    scene.add(this.root, this.anchors);
    this.setActive(false);
  }

  // ---------------------------------------------------------------- islands

  private buildIsles() {
    const p = this.p;
    for (const isle of this.isles) {
      const def = isle.def;
      const river = def.river;
      const avoid = (x: number, z: number, pad: number) => {
        if (river) {
          const d = isle.dirAt(x, z);
          if (p.riverNearest(d).dist < p.cfg.riverWidth * 1.15 + 0.9 + pad) return true;
        }
        return this.keepClear(isle, x, z, pad);
      };
      const fi = buildFloatingIsland({
        ...isle.opts,
        trees: def.trees, flowers: def.flowers, bushes: def.bushes,
        lobes: def.islet ? 1 : undefined,
        avoid,
      });
      // thin the island's own tufts a little: the world's grass (game.ts) fills in round the player
      fi.setDetail(def.islet ? 1 : 0.7);
      const bent = bendGroup(fi.group, isle);
      bent.name = 'isle:' + def.id;
      this.root.add(bent);
      // the trees are solid: you walk round them, not through them
      for (const t of fi.solids) {
        const a = new THREE.Object3D();
        a.position.copy(isle.toPlanet(t.x, isle.shape.height(t.x, t.z), t.z)).add(p.center);
        a.quaternion.copy(isle.frameAt(t.x, t.z));
        this.anchors.add(a);
        p.solids.push({ obj: a, shape: { kind: 'circle', r: t.r }, h: t.h, id: 'sky' });
      }
    }
  }

  /** Spots on each island (local x, z, radius) kept clear for the bridges' landings: no trees, bushes, flowers or props. */
  readonly bridgeSpots = new Map<string, { x: number; z: number; r: number }[]>();
  private planBridges() {
    const T = sky(this.p);
    for (const b of BRIDGES) {
      for (const f of bridgeFootprint(T.isle(b.a), T.isle(b.b))) {
        const id = f.isle.def.id;
        const list = this.bridgeSpots.get(id) ?? [];
        for (const q of f.pts) list.push({ x: q.x, z: q.z, r: b.width / 2 + 1.6 });
        this.bridgeSpots.set(id, list);
        const cz = this.clearZones.get(id) ?? [];
        for (const q of f.pts) cz.push({ x: q.x, z: q.z, r: b.width / 2 + 1.6 });
        this.clearZones.set(id, cz);
        // and the meadow's tall grass stays short there
        for (const q of f.pts) {
          const r = b.width / 2 + 1.0;
          this.bareGrass.push({ dir: f.isle.dirAt(q.x, q.z), cosIn: Math.cos(r / f.isle.Rt), cosOut: Math.cos((r + 1.2) / f.isle.Rt) });
        }
      }
    }
  }

  /**
   * The hidden sketch spots: nothing tall grows or stands there (no tree, house or prop between Nilo and his view),
   * and the grass stays short where he sits.
   */
  private planViews() {
    const T = sky(this.p);
    for (const vp of SKY_VIEWPOINTS) {
      const isle = T.isle(vp.isle), id = vp.isle;
      const q = viewSpot(isle, vp.ang, vp.inset);
      const pts = [q, { x: q.x * 0.82, z: q.z * 0.82 }];
      const list = this.bridgeSpots.get(id) ?? [];
      for (const p of pts) list.push({ x: p.x, z: p.z, r: 4.2 });
      this.bridgeSpots.set(id, list);
      const cz = this.clearZones.get(id) ?? [];
      for (const p of pts) cz.push({ x: p.x, z: p.z, r: 5.5 });
      this.clearZones.set(id, cz);
      this.bareGrass.push({ dir: isle.dirAt(q.x, q.z), cosIn: Math.cos(1.6 / isle.Rt), cosOut: Math.cos(3 / isle.Rt) });
    }
  }

  /** Areas the island builder keeps free of trees and bushes (villages, gardens); filled in by town.ts. */
  clearZones = new Map<string, { x: number; z: number; r: number }[]>();
  private keepClear(isle: Isle, x: number, z: number, pad: number) {
    const zs = this.clearZones.get(isle.def.id);
    if (!zs) return false;
    for (const c of zs) if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
    return false;
  }

  // ---------------------------------------------------------------- the river: aqueducts, cascades, the pool

  /** Path parameter ranges of the gaps between river islands, [leave, arrive]. */
  readonly gaps: [number, number][] = [];

  private buildRiver() {
    const p = this.p;
    const rivers = this.isles.filter(i => i.def.river);
    // where the river leaves each island and reaches the next
    const onIsle = (is: Isle, t: number) => is.heightAt(p.pathPoint(t)) !== null;
    for (let k = 0; k < rivers.length - 1; k++) {
      let t = 0;
      while (t < 1 && !(onIsle(rivers[k], t) && !onIsle(rivers[k], t + 0.001))) t += 0.0005;
      const a = t;
      while (t < 1 && !onIsle(rivers[k + 1], t)) t += 0.0005;
      this.gaps.push([a, t]);
    }
    this.gaps.forEach(([a, b], k) => {
      const g = aqueduct(p, a - 0.004, b + 0.004, 7 + k);
      this.root.add(g);
    });
    // white water at the foot of each cascade, and spray where the aqueducts' water meets the next island
    const puffs: Puff[] = [];
    const rnd = skyRng(5);
    const at = (t: number, s: number, h: number) => {
      const d = p.pathPoint(t), d2 = p.pathPoint(Math.min(1, t + 0.003));
      const side = new THREE.Vector3().crossVectors(d, d2.sub(d)).normalize();
      return d.clone().addScaledVector(side, s / p.R).normalize().multiplyScalar(p.R + p.bedAt(t) + p.cfg.waterDepth + h);
    };
    for (const [ts] of SKY_STEPS) {
      const foot = ts + SKY_STEP_HALF * 0.9;
      for (let i = 0; i < 7; i++) puffs.push({ p: at(foot + (rnd() - 0.3) * 0.006, (rnd() - 0.5) * 4.5, 0.3 + rnd() * 0.6), size: 1.4 + rnd() * 1.3, alpha: 0.75 });
      for (let i = 0; i < 4; i++) puffs.push({ p: at(ts + (rnd() - 0.5) * SKY_STEP_HALF * 1.6, (rnd() - 0.5) * 4, 0.4 + rnd() * 0.5), size: 1.0 + rnd() * 0.8, alpha: 0.45 });
    }
    // the pool where the stream from the Spring Peaks lands: spray over it
    for (let i = 0; i < 6; i++) puffs.push({ p: at(0.004 + rnd() * 0.01, (rnd() - 0.5) * 3, 0.6 + rnd() * 1.2), size: 1.6 + rnd() * 1.4, alpha: 0.6 });
    const mist = puffMesh(puffs, 77);
    if (mist) this.root.add(mist);
    // the pool's water
    const pool = new THREE.CircleGeometry(1, 40);
    const c0 = p.path[0];
    const e1 = new THREE.Vector3(0, 1, 0).cross(c0); if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0); e1.normalize();
    const e2 = new THREE.Vector3().crossVectors(c0, e1);
    const pa = pool.attributes.position as THREE.BufferAttribute;
    const uv = new Float32Array(pa.count * 2);
    const rr = p.R + p.bedAt(0) + p.cfg.waterDepth + 0.01;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i) * POOL_R, y = pa.getY(i) * POOL_R;
      const d = c0.clone().addScaledVector(e1, x / p.R).addScaledVector(e2, y / p.R).normalize().multiplyScalar(rr);
      pa.setXYZ(i, d.x, d.y, d.z);
      uv[i * 2] = x / POOL_R; uv[i * 2 + 1] = y;
    }
    pool.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    pool.computeVertexNormals();
    const pm = new THREE.Mesh(pool, p.waterMat);
    pm.renderOrder = 2;
    this.root.add(pm);
  }

  // ---------------------------------------------------------------- bridges, pads, updrafts, rocks

  private buildBridges() {
    const T = sky(this.p);
    BRIDGES.forEach((b, i) => {
      const rb = ropeBridge(this.p, T.isle(b.a), T.isle(b.b), b.width, b.sag, 31 + i * 7);
      this.root.add(rb.group);
      this.anchors.add(rb.deck.obj);
      this.p.decks.push(rb.deck);
    });
  }

  private buildPads() {
    const p = this.p, T = sky(p);
    PADS.forEach((d, i) => {
      const a = T.isle(d.a), b = T.isle(d.b);
      // from lip to lip along the line between the two islands
      const la = a.toLocal(b.up), lb = b.toLocal(a.up);
      const aa = Math.atan2(la.z, la.x), ab = Math.atan2(lb.z, lb.x);
      const ea = a.toPlanet(Math.cos(aa) * a.shape.outline(aa), a.shape.edgeY(aa), Math.sin(aa) * a.shape.outline(aa));
      const eb = b.toPlanet(Math.cos(ab) * b.shape.outline(ab), b.shape.edgeY(ab), Math.sin(ab) * b.shape.outline(ab));
      const pos = ea.clone().lerp(eb, d.k);
      const up = pos.clone().normalize();
      pos.addScaledVector(up, d.dh);
      const pad = new CloudPad({ size: d.size, seed: 11 + i * 5 });
      pad.root.position.copy(pos);
      pad.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      this.root.add(pad.root);
      this.pads.push(pad);
    });
  }

  private buildUpdrafts() {
    const p = this.p;
    UPDRAFTS.forEach((u, i) => {
      const d = p.dirRiver(u.lat, u.off / (p.R * Math.PI / 180 * Math.sin(u.lat * Math.PI / 180)));
      const col = updraftColumn(u.h, 2.6, 3 + i);
      // from just above the cloud sea, up past the island tops
      col.position.copy(d).multiplyScalar(p.R + 4);
      col.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      this.root.add(col);
    });
  }

  /** Small rocks drifting near the big islands, and the rock the long aqueduct rests a pier on. */
  private buildRocks() {
    const rnd = skyRng(91);
    const rocks = new THREE.Group(); rocks.name = 'floatingRocks';
    for (const isle of this.isles) {
      if (isle.def.islet || isle.def.r < 5) continue;
      const n = Math.round(isle.def.r / 5) + 1;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, out = isle.shape.outline(a) + 3 + rnd() * 6;
        const y = -2 - rnd() * (isle.def.cliff + 4);
        const r = floatingRock(Math.floor(rnd() * 1e5), 1.2 + rnd() * 2.4);
        placeRigid(r, isle, Math.cos(a) * out, y, Math.sin(a) * out, rnd() * 6);
        r.userData.bob = { base: r.position.clone(), ph: rnd() * 6.28, amp: 0.25 + rnd() * 0.35 };
        rocks.add(r);
      }
    }
    this.root.add(rocks);
    this.rocks = rocks;
  }
  private rocks!: THREE.Group;

  // ---------------------------------------------------------------- the cloud sea and the whales

  private buildSea() {
    const p = this.p;
    // under every island the sea stays low, so the undersides hang free over it
    const clear = this.isles.filter(i => !i.def.islet).map(i => ({ at: i.up.clone().multiplyScalar(p.R).add(p.center), r: i.maxR * 0.8 }));
    const sea = new CloudSea({
      center: p.center, radius: p.R - 9, seed: 4, density: 1.6, castle: { azimuth: 2.2, distance: 1000, height: 46 },
      towers: 12, flocks: 4, clear,
    });
    sea.setGolden(0);
    sea.setHaze('#cfe6fa', 0.0011);
    this.sea = sea;
    this.scene.add(sea.group);
  }

  private buildWhales() {
    const p = this.p;
    const rnd = skyRng(17);
    const runs: [number, number, number, number, number][] = [
      // length, seed, orbit radius above R, speed (rad/s), birds
      [34, 3, -1.5, 0.006, 6], [28, 11, -4, 0.008, 4], [40, 21, -2.5, 0.005, 7],
    ];
    runs.forEach(([len, seed, r, speed, birds], i) => {
      const w = new SkyWhale({ length: len, seed, birds, detail: i === 2 ? 'low' : 'high', flock: i === 0 ? 5 : 0 });
      w.swim = 0.5;
      // a great circle round the planet, tilted its own way
      const axis = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      const start = new THREE.Vector3(0, 1, 0).cross(axis).normalize();
      this.whales.push({ whale: w, axis, start, speed, r, bob: 1.5 + rnd() * 2, ph: rnd() * 6.28 });
      this.root.add(w.root);
    });
    void p;
  }

  /** Spots the meadow grass keeps off (lanes, houses, props), filled in by the dressing. */
  readonly bareGrass: { dir: THREE.Vector3; cosIn: number; cosOut: number }[] = [];
  /** Clear the grass weights (p.grassW, read when the game builds the sky meadow) off the lanes and from under props. */
  private thinGrass() {
    const p = this.p, gw = p.grassW;
    if (!gw) return;
    const pos = (p.terrain.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    const d = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      if (gw[i] <= 0) continue;
      d.fromBufferAttribute(pos, i).normalize();
      let k = 0.8;
      for (const b of this.bareGrass) {
        const c = d.dot(b.dir);
        if (c > b.cosOut) k = Math.min(k, 0.8 * (1 - THREE.MathUtils.smoothstep(c, b.cosOut, b.cosIn)));
      }
      gw[i] *= k;
    }
  }

  // ---------------------------------------------------------------- per frame

  /** Show or hide everything (only World 2 draws it). */
  setActive(on: boolean) {
    this.active = on;
    this.root.visible = on;
    if (this.sea) this.sea.group.visible = on;
    FINISH_CLOUD_MASK.value = on ? 1 : 0;
  }
  get isActive() { return this.active; }
  /** For the moon bake at the title: show the islands and the near cloud sea, not the far horizon dressing. */
  bakeView(on: boolean) {
    if (on) {
      this.root.visible = true;
      if (this.sea) { this.sea.group.visible = true; this.sea.far.visible = false; }
    } else {
      if (this.sea) this.sea.far.visible = true;
      this.setActive(this.active);
    }
  }

  private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private v2 = new THREE.Vector3();
  frame(dt: number, t: number, camera: THREE.Camera) {
    if (!this.active) return;
    this.sea?.update(dt, t, camera);
    for (const pad of this.pads) pad.update(dt, t);
    this.dressing.update(dt, t, camera);
    for (const r of this.rocks.children) {
      const b = r.userData.bob as { base: THREE.Vector3; ph: number; amp: number };
      r.position.copy(b.base).addScaledVector(this.v.copy(b.base).normalize(), Math.sin(t * 0.35 + b.ph) * b.amp);
    }
    const R = this.p.R;
    for (const w of this.whales) {
      const a = w.ph + t * w.speed;
      const pos = this.v.copy(w.start).applyAxisAngle(w.axis, a);
      const up = pos.clone();
      const ahead = this.v2.copy(w.start).applyAxisAngle(w.axis, a + 0.01).sub(pos).normalize();
      // they rise and sink slowly through the cloud tops
      const rr = R + w.r + Math.sin(t * 0.07 + w.ph) * w.bob;
      w.whale.root.position.copy(pos).multiplyScalar(rr);
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, ahead).normalize(), up, ahead);
      w.whale.root.quaternion.setFromRotationMatrix(m);
      w.whale.update(dt, t);
    }
  }
}

/** Where a sketch spot sits on its island (local x, z): `ang` round the outline, `inset` metres in from the lip. */
export function viewSpot(isle: Isle, ang: number, inset: number) {
  const r = isle.shape.outline(ang) - inset;
  return { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
}
