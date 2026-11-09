import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp } from '../noise';
import { IslandShape, buildShell, buildLobe, meadowColor, makeRng, TAU, WaterfallSpec } from './islandShape';
import { islandRockMaterial, waterMaterial, toonMat } from './islandMaterials';
import { Sprig, sprigMesh, meadowTree, bush, vines, ivyPatches, roots, looseRocks, mergeByMaterial, rockChunk } from './islandDressing';
import { streamGeometry, fallGeometry, fallPuffs, puffMesh, rainbow, Puff } from './islandWater';
import { addOutlines } from '../../render/paint';

/**
 * The floating islands of the Sky Isles (World 2), after Oscar's pictures: tall cliffs of cream and pale-gold
 * limestone in horizontal strata, stepping in and out in ledges with moss and grass on them, ivy curtains and vines
 * hanging down the faces; a grassy lip that rolls over the edge with grass, flowers, bushes and round trees
 * spilling over it; an underside that tapers to a jagged hanging point (sometimes two or three) with roots poking
 * out and loose stones drifting beneath; and waterfalls that run across the meadow, pour off the lip and fall a
 * long way, breaking into spray and a cloud of mist with a faint rainbow in it.
 *
 * Built in local space with +Y up and the lip near y = 0, so the world can set many of them on a small planet.
 * The top is a height function, so it is walkable: topY(x, z) gives the ground under any local point.
 *
 * Cost (hero island, radius 16 with one waterfall): about 45k triangles in ~14 draws; a radius-7 island is about
 * a third of that. Grass and flower counts can be thinned at run time with setDetail().
 */
export interface FloatingIslandOpts {
  seed: number;
  radius: number;
  /** irregular outline wobble 0..1 */
  wobble?: number;
  /** top surface height at local (x, z); the default is a soft dome with low rolling swells */
  topHeight?: (x: number, z: number) => number;
  cliffDepth: number;
  /** how far the jagged underside reaches below the cliff base */
  underDepth: number;
  waterfalls?: WaterfallSpec[];
  /** trees on top (default from the radius) */
  trees?: number;
  /** flower clumps on top (default from the radius) */
  flowers?: number;
  /** a bare rock: limestone on top instead of meadow, no trees (used by floatingRock) */
  bare?: boolean;
  /** extra lobes hanging under the island (default: 0 to 2 from the seed) */
  lobes?: number;
}

export interface FloatingIsland {
  group: THREE.Group;
  /** top surface height at local (x, z), or null outside the island */
  topY(x: number, z: number): number | null;
  /** radius of the grassy lip at a local angle (atan2(z, x)) */
  edge(angle: number): number;
  /** loose stones drift; everything else animates in its shaders */
  update(dt: number, t: number): void;
  /** thin the grass and flowers (1 = all, 0.3 = a third) for lower quality settings or far islands */
  setDetail(frac: number): void;
  /** the shape, for placing things: outline, heights, the cliff */
  shape: IslandShape;
  /** triangle count and draw calls, for budgets */
  stats: { triangles: number; draws: number };
}

const FLOWER_COLS = ['#f4a3c0', '#ffd75a', '#fff7ec', '#c9a6ee', '#f6b9d2', '#ffe58a'].map(c => new THREE.Color(c));
const SPIKE_COLS = ['#b49ae6', '#9f86d8', '#e48fb8', '#f6f0ff'].map(c => new THREE.Color(c));

export function buildFloatingIsland(opts: FloatingIslandOpts): FloatingIsland {
  const sh = new IslandShape(opts);
  const rng = makeRng(opts.seed * 3 + 1);
  const R = opts.radius, sc = sh.sc;
  /** grass and flowers keep their real size on big islands */
  const gs = clamp(sc, 0.5, 1);
  const group = new THREE.Group();
  group.name = 'floatingIsland';
  const N = clamp(Math.round((TAU * R) / 0.55), 28, 240);

  // ---- the body: one shell, plus lobes hanging under it
  const shell = buildShell(sh, N, opts.bare);
  const bodyGeos = [shell.geo];
  const nLobes = opts.lobes ?? (R > 9 ? 1 + Math.floor(rng() * 2) : R > 4 ? Math.floor(rng() * 2.2) : 0);
  for (let i = 0; i < nLobes; i++) {
    const a = rng() * TAU;
    const y0 = -sh.cliffDepth - sh.underDepth * (0.12 + rng() * 0.12);
    const w = sh.wall(a, y0);
    const d = w.r * (0.45 + rng() * 0.15);
    const r0 = w.r * (0.28 + rng() * 0.12);
    const len = sh.underDepth * (0.45 + rng() * 0.35);
    bodyGeos.push(buildLobe(sh, w.cx + Math.cos(a) * d, w.cz + Math.sin(a) * d, y0, r0, len, Math.max(12, Math.round(N * 0.35)), i + 1));
  }
  const body = new THREE.Mesh(bodyGeos.length > 1 ? mergeGeometries(bodyGeos, false)! : shell.geo, islandRockMaterial());
  body.castShadow = true; body.receiveShadow = true;
  body.name = 'islandBody';
  group.add(body);

  const fallAvoid = (opts.waterfalls ?? []).map(w => ({ a: w.angle, half: (w.width * 0.9) / sh.outline(w.angle) }));
  const nearWater = (x: number, z: number, pad: number) => sh.streams.some(st => { const q = sh.nearest(st, x, z); return q.d < q.w * 0.5 + pad; });
  /** a random point on the top, uniform by area, with its normal */
  const randomTop = (sMin = 0, sMax = 1) => {
    const a = rng() * TAU, s = Math.sqrt(sMin * sMin + rng() * (sMax * sMax - sMin * sMin));
    const r = sh.outline(a) * s;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    return { x, z, y: sh.height(x, z), a, s };
  };
  const normalAt = (x: number, z: number) => {
    const e = 0.3;
    return new THREE.Vector3(sh.height(x - e, z) - sh.height(x + e, z), 2 * e, sh.height(x, z - e) - sh.height(x, z + e)).normalize();
  };

  // ---- grass: over the meadow, thick along the lip where it hangs over, and in tufts on the ledges
  const tufts: Sprig[] = [];
  const tmpC = new THREE.Color();
  if (!opts.bare) {
    const area = Math.PI * R * R;
    const nTop = Math.round(area * 1.5);
    for (let i = 0; i < nTop; i++) {
      const q = randomTop(0, 0.985);
      if (nearWater(q.x, q.z, 0.05)) continue;
      // fewer in the middle, more toward the rim, as the pictures do
      if (rng() > 0.45 + 0.55 * q.s) continue;
      const up = normalAt(q.x, q.z).lerp(new THREE.Vector3(0, 1, 0), 0.4).normalize();
      tufts.push({ p: new THREE.Vector3(q.x, q.y - 0.03, q.z), up, scale: (0.5 + rng() * 0.4) * (0.7 + 0.6 * q.s * q.s), col: meadowColor(sh, q.x, q.z, tmpC).clone() });
    }
    // the fringe: long blades on the rolled lip, bowing down over the cliff
    for (const l of shell.lip) {
      if (fallAvoid.some(v => Math.abs(Math.atan2(Math.sin(l.a - v.a), Math.cos(l.a - v.a))) < v.half * 0.7)) continue;
      if (rng() < 0.2) continue;
      const p = l.p.clone().add(new THREE.Vector3((rng() - 0.5) * 0.4, (rng() - 0.5) * 0.2, (rng() - 0.5) * 0.4).multiplyScalar(Math.max(0.5, sc)));
      tufts.push({ p, up: l.n.clone().lerp(new THREE.Vector3(0, 1, 0), 0.3).normalize(), scale: (0.6 + rng() * 0.45) * gs, col: tmpC.set('#7aa848').clone() });
    }
  }
  for (const l of shell.ledges) {
    if (rng() > (opts.bare ? 0.25 : 0.55)) continue;
    tufts.push({ p: l.p.clone(), up: l.n.clone(), scale: (0.5 + rng() * 0.5) * gs, col: tmpC.set('#6f9a44').clone() });
  }
  const grass = sprigMesh(tufts, 'tuft', opts.seed);
  if (grass) group.add(grass);

  // ---- flowers: clumps in drifts, more of them toward the edges
  const daisies: Sprig[] = [], spikes: Sprig[] = [];
  if (!opts.bare) {
    const nClumps = opts.flowers ?? Math.round(R * 1.4);
    for (let c = 0; c < nClumps; c++) {
      const q = rng() < 0.6 ? randomTop(0.62, 0.97) : randomTop(0.1, 0.9);
      if (nearWater(q.x, q.z, 0.3)) continue;
      const spike = rng() < 0.3;
      const col = spike ? SPIKE_COLS[Math.floor(rng() * SPIKE_COLS.length)] : FLOWER_COLS[Math.floor(rng() * FLOWER_COLS.length)];
      const n = 5 + Math.floor(rng() * 10), rad = 0.5 + rng() * 1.1;
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, d = Math.sqrt(rng()) * rad;
        const x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d;
        if (!sh.inside(x * 1.02, z * 1.02) || nearWater(x, z, 0.2)) continue;
        const sp: Sprig = { p: new THREE.Vector3(x, sh.height(x, z) - 0.02, z), up: normalAt(x, z).lerp(new THREE.Vector3(0, 1, 0), 0.5).normalize(), scale: 1.0 + rng() * 0.5, col: col.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.06) };
        (spike ? spikes : daisies).push(sp);
      }
    }
  }
  const fl1 = sprigMesh(daisies, 'daisy', opts.seed + 1), fl2 = sprigMesh(spikes, 'spike', opts.seed + 2);
  if (fl1) group.add(fl1);
  if (fl2) group.add(fl2);

  // ---- trees and bushes (merged per material)
  if (!opts.bare) {
    const flora = new THREE.Group();
    const nTrees = opts.trees ?? Math.round(R / 3.5);
    const placed: THREE.Vector2[] = [];
    for (let i = 0, tries = 0; i < nTrees && tries < nTrees * 30; tries++) {
      // the last one or two lean out over the edge
      const edgeTree = i >= nTrees - Math.min(2, Math.floor(nTrees / 3)) && R > 6;
      const q = edgeTree ? randomTop(0.86, 0.92) : randomTop(0.1, 0.8);
      if (nearWater(q.x, q.z, 2.2)) continue;
      const v = new THREE.Vector2(q.x, q.z);
      if (placed.some(p => p.distanceTo(v) < 5.5)) continue;
      placed.push(v);
      const t = meadowTree(rng, (edgeTree ? 0.75 : 0.85 + rng() * 0.35) * Math.min(1, 0.55 + R / 20));
      t.position.set(q.x, q.y - 0.15, q.z);
      t.rotation.y = rng() * TAU;
      if (edgeTree) { const ax = new THREE.Vector3(-Math.sin(q.a), 0, Math.cos(q.a)); t.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, -0.22)); }
      flora.add(t);
      i++;
    }
    // bushes along the rim, some right on the lip
    const nB = Math.round((TAU * R) / 5.5);
    for (let i = 0; i < nB; i++) {
      const q = randomTop(0.88, 1.0);
      if (nearWater(q.x, q.z, 1.2) || fallAvoid.some(v => Math.abs(Math.atan2(Math.sin(q.a - v.a), Math.cos(q.a - v.a))) < v.half * 1.4)) continue;
      const b = bush(rng, Math.min(1.1, 0.6 + R / 25) * (0.8 + rng() * 0.5));
      b.position.set(q.x, q.y - 0.1, q.z);
      flora.add(b);
    }
    // a few pale boulders half sunk in the grass
    const stones = new THREE.Group();
    for (let i = 0; i < Math.round(R / 3); i++) {
      const q = randomTop(0.2, 0.95);
      if (nearWater(q.x, q.z, 0.8)) continue;
      const s = 0.3 + rng() * 0.5;
      const m = new THREE.Mesh(rockChunk(rng, s, sh.band(0).col, true), islandRockMaterial());
      m.position.set(q.x, q.y - s * 0.15, q.z); m.rotation.y = rng() * TAU;
      stones.add(m);
    }
    const merged = mergeByMaterial(flora);
    // ink the trunks and limbs (leaf cards keep their soft edges; the screen ink draws their silhouettes)
    const bark = toonMat('#7a5a40', 0.6, 0.6);
    merged.children.forEach(c => { if ((c as THREE.Mesh).material === bark) addOutlines(c, '#3b2a30', 0.03); });
    group.add(merged);
    if (stones.children.length) { const ms = mergeByMaterial(stones); addOutlines(ms, '#3b2a30', 0.02); group.add(ms); }
  }

  // ---- cliffs: vines and ivy, roots under the island, loose stones
  const vineMesh = vines(sh, rng, opts.bare ? 0.25 : 1, fallAvoid);
  if (vineMesh) group.add(vineMesh);
  const ivy = ivyPatches(sh, rng, Math.round(R * (opts.bare ? 0.3 : 1.6)), fallAvoid);
  if (ivy) group.add(ivy);
  const rootMesh = roots(sh, rng, Math.round(R * (opts.bare ? 0.3 : 1.0)));
  if (rootMesh) group.add(rootMesh);
  const debris = new THREE.Group();
  const loose = looseRocks(sh, rng, opts.bare ? 0 : Math.round(3 + R * 0.5));
  if (loose) debris.add(loose);
  group.add(debris);

  // ---- water
  const puffs: Puff[] = [];
  for (const st of sh.streams) {
    const s = new THREE.Mesh(streamGeometry(sh, st), waterMaterial('stream'));
    s.renderOrder = 1; s.userData.noOutline = true; s.receiveShadow = false;
    group.add(s);
    const f = fallGeometry(sh, st);
    const fm = new THREE.Mesh(f.geo, waterMaterial('fall'));
    fm.renderOrder = 2; fm.userData.noOutline = true;
    group.add(fm);
    fallPuffs(f, rng, puffs);
    group.add(rainbow(f));
  }
  const mist = puffMesh(puffs, opts.seed);
  if (mist) group.add(mist);

  // ---- budgets
  let triangles = 0, draws = 0;
  group.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    draws++;
    const g = m.geometry as THREE.BufferGeometry & { instanceCount?: number };
    const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    triangles += (g as THREE.InstancedBufferGeometry).isInstancedBufferGeometry ? t * (g.instanceCount ?? 1) : t;
  });

  const sprigs = [grass, fl1, fl2].filter(Boolean) as THREE.Mesh[];
  const debrisPhase = rng() * TAU;
  return {
    group, shape: sh, stats: { triangles: Math.round(triangles), draws },
    topY(x, z) { return sh.inside(x, z) ? sh.height(x, z) : null; },
    edge(a) { return sh.outline(a); },
    update(_dt, t) {
      debris.position.y = Math.sin(t * 0.4 + debrisPhase) * 0.25 * Math.max(0.5, sc);
      debris.rotation.y = Math.sin(t * 0.13 + debrisPhase) * 0.03;
    },
    setDetail(frac) {
      for (const m of sprigs) (m.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.max(1, Math.floor(m.userData.instances * clamp(frac)));
    },
  };
}

/**
 * A small floating islet, 1 to 4 m across: a chunk of the same limestone with a jagged underside, sometimes a cap
 * of turf with a tuft of grass. Returns its group; drift it with group.position / rotation as you like.
 */
export function floatingRock(seed: number, size: number): THREE.Group {
  const rng = makeRng(seed * 5 + 2);
  const grassy = size > 1.4 && rng() < 0.7;
  const isl = buildFloatingIsland({
    seed, radius: size * 0.5, wobble: 0.9, cliffDepth: size * (0.25 + rng() * 0.2), underDepth: size * (0.6 + rng() * 0.5),
    bare: !grassy, trees: 0, flowers: grassy && rng() < 0.5 ? 1 : 0, lobes: 0,
    topHeight: (x, z) => 0.06 * size * (1 - (x * x + z * z) / (size * size * 0.25)),
  });
  isl.group.name = 'floatingRock';
  isl.group.userData.island = isl;
  return isl.group;
}

