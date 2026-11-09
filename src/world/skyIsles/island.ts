import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp } from '../noise';
import { IslandShape, buildShell, buildLobe, rockBlock, meadowColor, makeRng, TAU, WaterfallSpec } from './islandShape';
import { islandRockMaterial, waterMaterial, toonMat } from './islandMaterials';
import { Sprig, sprigMesh, hangingGrowth, roots, looseRocks, mergeByMaterial, rockChunk } from './islandDressing';
import { islandTree, islandBush, TreeKind } from './islandFlora';
import { streamGeometry, fallGeometry, fallPuffs, puffMesh, rainbow, Puff } from './islandWater';
import { addOutlines } from '../../render/paint';

/**
 * The floating islands of the Sky Isles (World 2), after Oscar's pictures: tall cliffs of many thin beds of cream and
 * pale-gold limestone, stepping in and out in ledges with bright lit tops and dark undercuts, moss on every ledge
 * and green drips and curtains of vines hanging down the faces; a ragged grassy lip with flowers, bushes and trees
 * spilling over it; a broad, stepped underside with two or three hanging lobes that split into jagged points, broken
 * blocks and thick roots hanging from it and loose blocks drifting beneath; and wide white waterfalls that pour off
 * the lip, drop nearly plumb and dissolve into spray and mist with a faint rainbow in it.
 *
 * Built in local space with +Y up and the lip near y = 0, so the world can set many of them on a small planet.
 * The top is a height function, so it is walkable: topY(x, z) gives the ground under any local point.
 *
 * Cost: see stats (the lab logs them). A hero island (radius 16, one waterfall) is about 150k triangles in 14 draws,
 * most of it instanced grass and flowers that setDetail() can thin; a radius-7 island about a third of that.
 */
export interface FloatingIslandOpts {
  seed: number;
  radius: number;
  /** irregular outline wobble 0..1 (default 0.85) */
  wobble?: number;
  /** top surface height at local (x, z); the default is a soft dome with low rolling swells */
  topHeight?: (x: number, z: number) => number;
  cliffDepth: number;
  /** how far the jagged underside reaches below the cliff base */
  underDepth: number;
  waterfalls?: WaterfallSpec[];
  /** trees on top (default from the radius) */
  trees?: number;
  /** flower drifts on top (default from the radius) */
  flowers?: number;
  /** a bare rock: limestone on top instead of meadow, no trees */
  bare?: boolean;
  /** lobes hanging under the island (default 2 or 3; 1 or 2 on small rocks) */
  lobes?: number;
  /** bushes round the rim (default from the radius) */
  bushes?: number;
}

export interface FloatingIsland {
  group: THREE.Group;
  /** top surface height at local (x, z), or null outside the island */
  topY(x: number, z: number): number | null;
  /** radius of the grassy lip at a local angle (atan2(z, x)) */
  edge(angle: number): number;
  /** loose blocks drift; everything else animates in its shaders */
  update(dt: number, t: number): void;
  /** thin the grass and flowers (1 = all, 0.3 = a third) for lower quality settings or far islands */
  setDetail(frac: number): void;
  /** the shape, for placing things: outline, heights, the cliff */
  shape: IslandShape;
  /** triangle count and draw calls, for budgets */
  stats: { triangles: number; draws: number };
}

const FLOWER_COLS = ['#f7a8c6', '#ffd75a', '#fffaf0', '#fffaf0', '#f6b9d2', '#ffe070', '#ff9e8e'].map(c => new THREE.Color(c));
const SPIKE_COLS = ['#b49ae6', '#a48ae0', '#e48fb8', '#c6b2f2'].map(c => new THREE.Color(c));

export function buildFloatingIsland(opts: FloatingIslandOpts): FloatingIsland {
  const sh = new IslandShape(opts);
  const rng = makeRng(opts.seed * 3 + 1);
  const R = opts.radius, sc = sh.sc;
  const s4 = Math.max(0.4, sc);
  /** grass and flowers keep their real size on big islands */
  const gs = clamp(sc, 0.5, 1);
  const group = new THREE.Group();
  group.name = 'floatingIsland';
  const N = clamp(Math.round((TAU * R) / 0.6), 24, 200);
  const up = new THREE.Vector3(0, 1, 0);

  const fallAvoid = (opts.waterfalls ?? []).map(w => ({ a: w.angle, half: (w.width * 0.75) / sh.outline(w.angle) }));
  const nearFall = (a: number, k: number) => fallAvoid.some(v => Math.abs(Math.atan2(Math.sin(a - v.a), Math.cos(a - v.a))) < v.half * k);
  const nearWater = (x: number, z: number, pad: number) => sh.streams.some(st => { const q = sh.nearest(st, x, z); return q.d < q.w * 0.5 + pad; });
  /** a random point on the top, uniform by area */
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

  // ---- flower drifts are planned first, so the meadow under them takes their colour
  if (!opts.bare) {
    const nDrift = opts.flowers ?? Math.max(1, Math.round(R * 2.2));
    for (let c = 0; c < nDrift; c++) {
      // most drifts lie along the rim, as in the pictures, where they spill over the edge
      const q = rng() < 0.65 ? randomTop(0.72, 0.98) : randomTop(0.1, 0.85);
      if (nearWater(q.x, q.z, 0.5)) continue;
      const spike = rng() < 0.3;
      const col = spike ? SPIKE_COLS[Math.floor(rng() * SPIKE_COLS.length)] : FLOWER_COLS[Math.floor(rng() * FLOWER_COLS.length)];
      sh.drifts.push({ x: q.x, z: q.z, r: (0.9 + rng() * 1.6) * Math.max(0.5, gs), col, spike });
    }
  }

  // ---- the body: one shell, two or three lobes hanging under it, broken blocks stuck to the underside
  const shell = buildShell(sh, N, opts.bare);
  const bodyGeos = [shell.geo];
  const nLobes = opts.lobes ?? (R > 4 ? 2 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2));
  const lobeN = Math.max(9, Math.round(N * 0.4));
  {
    // the main lobe: under the shell's base, carrying the underside on down to its lowest point
    const b = shell.base;
    const a = rng() * TAU, d = b.r * (0.1 + rng() * 0.15);
    const len = sh.underDepth * (1 - sh.vEnd) + 0.6 * s4;
    bodyGeos.push(buildLobe(sh, b.c.x + Math.cos(a) * d, b.c.z + Math.sin(a) * d, b.c.y + 0.8 * s4, b.r * (0.6 + rng() * 0.12), len, lobeN, 1));
  }
  for (let i = 1; i < nLobes; i++) {
    // side lobes: hanging from higher up the underside, off to one side, shorter
    const a = rng() * TAU;
    const v = sh.vEnd * (0.3 + rng() * 0.35);
    const y0 = -sh.cliffDepth - sh.underDepth * v;
    const w = sh.wall(a, y0);
    const d = w.r * (0.5 + rng() * 0.12);
    const r0 = w.r * (0.3 + rng() * 0.1);
    const len = sh.underDepth * (0.35 + rng() * 0.3) + (sh.vEnd - v) * sh.underDepth * 0.5;
    bodyGeos.push(buildLobe(sh, w.cx + Math.cos(a) * d, w.cz + Math.sin(a) * d, y0 + 0.5 * s4, r0, len, lobeN, i + 1));
  }
  // broken blocks hanging from the underside's beds
  const nBlocks = opts.bare ? 1 : Math.round(2 + R * 0.35);
  for (let i = 0; i < nBlocks; i++) {
    const a = rng() * TAU;
    const y = -sh.cliffDepth - sh.underDepth * sh.vEnd * (0.15 + rng() * 0.75);
    const w = sh.wall(a, y);
    const bw = (0.5 + rng() * 0.9) * s4, bh = bw * (0.9 + rng() * 1.1);
    const g = rockBlock(rng, bw, bh, sh.band(sh.bandIndex(y)).col);
    g.rotateY(rng() * TAU);
    g.translate(w.cx + Math.cos(a) * (w.r - bw * 0.35), y - bh * 0.45, w.cz + Math.sin(a) * (w.r - bw * 0.35));
    bodyGeos.push(g);
  }
  const body = new THREE.Mesh(mergeGeometries(bodyGeos, false)!, islandRockMaterial());
  body.castShadow = true; body.receiveShadow = true;
  body.name = 'islandBody';
  group.add(body);

  // ---- grass: over the meadow, thick along the lip where it hangs over, and in tufts on the ledges
  const tufts: Sprig[] = [];
  const tmpC = new THREE.Color();
  if (!opts.bare) {
    const area = Math.PI * R * R;
    const nTop = Math.round(area * 1.3);
    for (let i = 0; i < nTop; i++) {
      const q = randomTop(0, 0.985);
      if (nearWater(q.x, q.z, 0.05)) continue;
      // fewer in the middle, more toward the rim, as the pictures do
      if (rng() > 0.4 + 0.6 * q.s) continue;
      const nrm = normalAt(q.x, q.z).lerp(up, 0.4).normalize();
      tufts.push({ p: new THREE.Vector3(q.x, q.y - 0.03, q.z), up: nrm, scale: (0.7 + rng() * 0.5) * (0.75 + 0.5 * q.s * q.s) * gs, col: meadowColor(sh, q.x, q.z, tmpC).clone() });
    }
    // the fringe: bushy clumps on the rolled lip, leaning out and down over the cliff
    for (const l of shell.lip) {
      if (nearFall(l.a, 1.0)) continue;
      for (let k = 0; k < 2; k++) {
        if (rng() < 0.15) continue;
        const p = l.p.clone().add(new THREE.Vector3((rng() - 0.5) * 0.5, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.5).multiplyScalar(s4));
        const out = new THREE.Vector3(Math.cos(l.a), 0, Math.sin(l.a));
        tufts.push({ p, up: out.clone().multiplyScalar(0.9).addScaledVector(up, 0.35 + rng() * 0.4).normalize(), scale: (0.8 + rng() * 0.6) * gs, col: tmpC.set('#9cc458').clone().offsetHSL(0, 0, (rng() - 0.5) * 0.06) });
      }
    }
    // tufts hanging under the turf edge, so it is never a clean line
    for (const l of shell.lipUnder) {
      if (nearFall(l.a, 1.0) || rng() < 0.4) continue;
      const out = new THREE.Vector3(Math.cos(l.a), 0, Math.sin(l.a));
      tufts.push({ p: l.p.clone().addScaledVector(out, 0.05), up: out.clone().addScaledVector(up, -0.7).normalize(), scale: (0.6 + rng() * 0.5) * gs, col: tmpC.set('#6f9e42').clone() });
    }
  }
  // moss and grass on the ledges
  for (const l of shell.ledges) {
    if (rng() > (opts.bare ? 0.15 : 0.35)) continue;
    tufts.push({ p: l.p.clone(), up: l.n.clone(), scale: (0.55 + rng() * 0.5) * gs, col: tmpC.set('#7aa846').clone() });
  }
  const grass = sprigMesh(tufts, 'tuft', opts.seed);
  if (grass) group.add(grass);

  // ---- flowers: dense in the drifts, and spilling over the lip
  const daisies: Sprig[] = [], spikes: Sprig[] = [];
  for (const d of sh.drifts) {
    const n = Math.round(d.r * d.r * 7);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, rr = Math.sqrt(rng()) * d.r;
      const x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr;
      if (!sh.inside(x, z) || nearWater(x, z, 0.2)) continue;
      const col = (rng() < 0.2 ? FLOWER_COLS[Math.floor(rng() * FLOWER_COLS.length)] : d.col).clone().offsetHSL(0, 0, (rng() - 0.5) * 0.06);
      const sp: Sprig = { p: new THREE.Vector3(x, sh.height(x, z) - 0.02, z), up: normalAt(x, z).lerp(up, 0.5).normalize(), scale: (1.0 + rng() * 0.6) * gs, col };
      (d.spike ? spikes : daisies).push(sp);
    }
  }
  if (!opts.bare) for (const l of shell.lip) {
    if (nearFall(l.a, 1.2) || rng() > 0.3) continue;
    const near = sh.drifts.find(d => Math.hypot(l.p.x - d.x, l.p.z - d.z) < d.r * 1.6);
    if (!near && rng() > 0.35) continue;
    const col = (near ? near.col : FLOWER_COLS[Math.floor(rng() * FLOWER_COLS.length)]).clone();
    const out = new THREE.Vector3(Math.cos(l.a), 0, Math.sin(l.a));
    (near?.spike ? spikes : daisies).push({ p: l.p.clone(), up: out.multiplyScalar(0.7).addScaledVector(up, 0.7).normalize(), scale: (1.0 + rng() * 0.5) * gs, col });
  }
  const fl1 = sprigMesh(daisies, 'daisy', opts.seed + 1), fl2 = sprigMesh(spikes, 'spike', opts.seed + 2);
  if (fl1) group.add(fl1);
  if (fl2) group.add(fl2);

  // ---- trees and bushes (merged per material: a handful of draws for all of them)
  if (!opts.bare) {
    const flora = new THREE.Group();
    const nTrees = opts.trees ?? Math.round(R / 3);
    const placed: THREE.Vector2[] = [];
    const kinds: TreeKind[] = ['oak', 'oak', 'round', 'round', 'poplar', 'blossom'];
    for (let i = 0, tries = 0; i < nTrees && tries < nTrees * 40; tries++) {
      // one or two lean out over the edge
      const edgeTree = i >= nTrees - Math.min(2, Math.floor(nTrees / 3)) && R > 6;
      const q = edgeTree ? randomTop(0.84, 0.9) : randomTop(0.05, 0.8);
      if (nearWater(q.x, q.z, 2.2) || nearFall(q.a, 1.6)) continue;
      const v = new THREE.Vector2(q.x, q.z);
      // trees stand in loose groups: near another one, but not on top of it
      if (placed.some(p => p.distanceTo(v) < 4.2)) continue;
      if (placed.length && rng() < 0.5 && !placed.some(p => p.distanceTo(v) < 9)) continue;
      placed.push(v);
      const kind = kinds[Math.floor(rng() * kinds.length)];
      const t = islandTree(kind, rng, (edgeTree ? 0.75 : 0.8 + rng() * 0.35) * Math.min(1, 0.5 + R / 20));
      t.position.set(q.x, q.y - 0.15, q.z);
      t.rotation.y = rng() * TAU;
      if (edgeTree) { const ax = new THREE.Vector3(-Math.sin(q.a), 0, Math.cos(q.a)); t.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, -0.2)); }
      flora.add(t);
      i++;
    }
    // bushes along the rim, under the trees, and spilling over the lip
    const nB = opts.bushes ?? Math.round((TAU * R) / 4);
    for (let i = 0; i < nB; i++) {
      const over = rng() < 0.4;
      const q = over ? null : randomTop(0.8, 0.97);
      const a = q ? q.a : rng() * TAU;
      if (nearFall(a, 1.5)) continue;
      const b = islandBush(rng, Math.min(1.1, 0.5 + R / 22) * (0.75 + rng() * 0.5) * (opts.bushes !== undefined ? 0.7 : 1));
      if (q) {
        if (nearWater(q.x, q.z, 1.2)) continue;
        b.position.set(q.x, q.y - 0.1, q.z);
      } else {
        const Rt = sh.outline(a) + 0.15 * sc;
        if (nearWater(Math.cos(a) * sh.outline(a), Math.sin(a) * sh.outline(a), 1.5)) continue;
        b.position.set(Math.cos(a) * Rt, sh.edgeY(a) - 0.4 * sc, Math.sin(a) * Rt);
        const ax = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
        b.quaternion.setFromAxisAngle(ax, -0.35);
      }
      b.rotateY(rng() * TAU);
      flora.add(b);
    }
    for (const p of placed) {
      // a bush or two at the foot of each tree
      for (let k = 0; k < 2; k++) {
        if (rng() < 0.4) continue;
        const a = rng() * TAU, d = 1.6 + rng() * 1.2;
        const x = p.x + Math.cos(a) * d, z = p.y + Math.sin(a) * d;
        if (!sh.inside(x * 1.05, z * 1.05) || nearWater(x, z, 1)) continue;
        const b = islandBush(rng, 0.7 + rng() * 0.3);
        b.position.set(x, sh.height(x, z) - 0.1, z);
        flora.add(b);
      }
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
    // ink the trunks and limbs (leaf crowns get their silhouettes from the screen ink)
    const bark = toonMat('#7d5c42', 0.6, 0.6);
    merged.children.forEach(c => { if ((c as THREE.Mesh).material === bark) addOutlines(c, '#3b2a30', 0.03); });
    group.add(merged);
    if (stones.children.length) group.add(mergeByMaterial(stones));
  }

  // ---- cliffs: hanging growth, roots, loose blocks
  const hang = hangingGrowth(sh, rng, opts.bare ? 0.25 : 1, shell.ledges, fallAvoid);
  if (hang) group.add(hang);
  const rootMesh = roots(sh, rng, Math.round(R * (opts.bare ? 0.2 : 0.8)));
  if (rootMesh) group.add(rootMesh);
  const debris = new THREE.Group();
  const loose = looseRocks(sh, rng, opts.bare || R < 3 ? 0 : Math.round(3 + R * 0.45));
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
    const fd = new THREE.Mesh(f.geo, waterMaterial('fallDepth'));
    fd.userData.noOutline = true;
    group.add(fd);
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
 * A small floating islet, 1 to 4 m across: a miniature island, with a grass cap (a bush or a few flowers on the
 * bigger ones), a few beds of the same limestone and a jagged underside with one or two hanging points.
 * Returns its group; drift it with group.position / rotation as you like.
 */
export function floatingRock(seed: number, size: number): THREE.Group {
  const rng = makeRng(seed * 5 + 2);
  const isl = buildFloatingIsland({
    seed, radius: size * 0.5, wobble: 0.9, cliffDepth: size * (0.22 + rng() * 0.18), underDepth: size * (0.75 + rng() * 0.5),
    trees: 0, flowers: size > 1.8 && rng() < 0.6 ? 1 : 0, bushes: size > 2.4 ? 1 : 0, lobes: 1 + Math.floor(rng() * 2),
    topHeight: (x, z) => 0.06 * size * (1 - (x * x + z * z) / (size * size * 0.25)),
  });
  isl.group.name = 'floatingRock';
  isl.group.userData.island = isl;
  return isl.group;
}
