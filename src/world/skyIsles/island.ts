import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp } from '../noise';
import { IslandShape, buildShell, buildLobe, meadowColor, makeRng, rockBlock, TAU, WaterfallSpec } from './islandShape';
import { islandRockMaterial, waterMaterial, toonMat, fallDepthMaterial } from './islandMaterials';
import { Sprig, sprigMesh, hangingGrowth, roots, looseRocks, mergeByMaterial, rockChunk, hangingChunks, undersideDressing } from './islandDressing';
import { islandTree, islandBush, TreeKind, clump } from './islandFlora';
import { islandCottage } from './islandHouse';
import { streamGeometry, fallGeometry, fallPuffs, puffMesh, rainbow, Puff } from './islandWater';
import { addOutlines } from '../../render/paint';

/**
 * The floating islands of the Sky Isles (World 2), after Oscar's pictures: tall cliffs of limestone that run from
 * pale cream under the lip through gold to a cool tan-violet underside, beds alternating warm and cool, split by
 * vertical joints into rounded, bulging columns, with baked occlusion in every recess, joint and overhang and a
 * cool blue-violet shade; thick moss mantles poured over the top of the cliffs, curtains of ivy, moss pads and
 * bushes on the ledges; a turf lip whose soil skirt tucks into the rock (no seam); an underside broken by setbacks,
 * with two or three stepped lobes, a fringe of soil clods and roots, rubble and forking roots; a calm top of big
 * mixed trees clustered toward the rim, soft white-and-yellow flower drifts and a baked cottage; and heavy white
 * falls with a foaming lip roll, churned sides, a mist sheet behind and a big spray burst with a rainbow at the foot.
 *
 * Built in local space with +Y up and the lip near y = 0, so the world can set many of them on a small planet.
 * The top is a height function, so it is walkable: topY(x, z) gives the ground under any local point.
 *
 * Cost (the lab logs it): the hero island (radius 16, one fall, a cottage, 9 trees) is about 148k triangles in 19
 * draws, most triangles instanced grass and flowers that setDetail() can thin; a radius-8.5 island ~74k in 17
 * draws; a radius-6.5 one ~46k in 11; an islet ~1-2k in 3-4 draws.
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
  /** cottage-sized houses on top, for scale (default 0) */
  cottages?: number;
  /** how much the cliff narrows from the lip to its base, share of the radius (default 0.06) */
  taper?: number;
  /**
   * Places on the top to keep clear of grass, flowers, trees, bushes and stones (a river crossing the island, a
   * village): true when local (x, z) is within `pad` metres of somewhere that must stay clear.
   */
  avoid?: (x: number, z: number, pad: number) => boolean;
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
  /** Where the trees and cottages stand (local x, z on the top) and their trunk or wall radius, for collision. */
  solids: { x: number; z: number; r: number; h: number }[];
}

// soft, mostly white and butter-yellow drifts with a little pink, and the odd lilac of spikes: they read as soft
// patches in the meadow, never confetti
const FLOWER_COLS = ['#fffaf0', '#fff1c4', '#ffe08a', '#fbfaf4', '#f6cad8', '#fff4d6', '#ffe9a0'].map(c => new THREE.Color(c));
const ROOFS = ['#c0563a', '#d0703c', '#b84a3a', '#4f78a8'];
const SPIKE_COLS = ['#c2aee6', '#b6a3dc', '#d8b4dc'].map(c => new THREE.Color(c));
const MOSS_PAD = ['#6a9a40', '#77a646', '#5f8f3c', '#83ae4c'];

export function buildFloatingIsland(opts: FloatingIslandOpts): FloatingIsland {
  const sh = new IslandShape(opts);
  const rng = makeRng(opts.seed * 3 + 1);
  const solids: { x: number; z: number; r: number; h: number }[] = [];
  const R = opts.radius, sc = sh.sc;
  const s4 = Math.max(0.4, sc);
  /** grass and flowers keep their real size on big islands */
  const gs = clamp(sc, 0.5, 1);
  const group = new THREE.Group();
  group.name = 'floatingIsland';
  const N = clamp(Math.round((TAU * R) / 0.45), 28, 240);
  const up = new THREE.Vector3(0, 1, 0);

  const fallAvoid = (opts.waterfalls ?? []).map(w => ({ a: w.angle, half: (w.width * 0.75) / sh.outline(w.angle) }));
  const nearFall = (a: number, k: number) => fallAvoid.some(v => Math.abs(Math.atan2(Math.sin(a - v.a), Math.cos(a - v.a))) < v.half * k);
  const nearWater = (x: number, z: number, pad: number) => sh.streams.some(st => { const q = sh.nearest(st, x, z); return q.d < q.w * 0.5 + pad; }) || (opts.avoid?.(x, z, pad) ?? false);
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
    const nDrift = opts.flowers ?? Math.max(1, Math.round(R * 0.5));
    for (let c = 0; c < nDrift; c++) {
      // most drifts lie along the rim, as in the pictures, where they spill over the edge
      const q = rng() < 0.65 ? randomTop(0.72, 0.98) : randomTop(0.1, 0.85);
      if (nearWater(q.x, q.z, 0.5)) continue;
      const spike = rng() < 0.15;
      const col = spike ? SPIKE_COLS[Math.floor(rng() * SPIKE_COLS.length)] : FLOWER_COLS[Math.floor(rng() * FLOWER_COLS.length)];
      // fewer, broader drifts
      sh.drifts.push({ x: q.x, z: q.z, r: (2.4 + rng() * 2.8) * Math.max(0.4, gs), col, spike });
    }
  }

  // ---- the body: one shell, two or three lobes hanging under it, broken blocks stuck to the underside
  const shell = buildShell(sh, N, opts.bare);
  const bodyGeos = [shell.geo];
  // one or two heavy broken lobes (the second hangs from higher up, off to one side, shorter)
  const nLobes = opts.lobes ?? (R > 9 ? 3 : R > 4 ? 2 : 1);
  const lobeN = 0;
  {
    // the main lobe: under the shell's base, carrying the underside on down to its lowest point
    const b = shell.base;
    const a = rng() * TAU, d = b.r * (0.08 + rng() * 0.12);
    const len = sh.underDepth * (1 - sh.vEnd) + 0.8 * s4;
    const x = b.c.x + Math.cos(a) * d, z = b.c.z + Math.sin(a) * d;
    bodyGeos.push(buildLobe(sh, x, z, b.c.y + 1.2 * s4, b.r * (0.78 + rng() * 0.1), len, lobeN, 1));
  }
  // the side lobes hang from higher up, spread round the island (never two on one side), each its own length
  const lobeA0 = rng() * TAU;
  for (let i = 1; i < nLobes; i++) {
    const a = lobeA0 + (i / nLobes) * TAU * (0.8 + rng() * 0.3);
    const v = sh.vEnd * (0.35 + rng() * 0.3);
    const y0 = -sh.cliffDepth - sh.underDepth * v;
    const w = sh.wall(a, y0);
    const d = w.r * (0.45 + rng() * 0.1);
    const r0 = w.r * (0.38 + rng() * 0.1);
    const len = sh.underDepth * (0.35 + rng() * 0.25) + (sh.vEnd - v) * sh.underDepth * 0.4;
    bodyGeos.push(buildLobe(sh, w.cx + Math.cos(a) * d, w.cz + Math.sin(a) * d, y0 + 0.8 * s4, r0, len, lobeN, i + 1));
  }
  // 3-5 rough chunks of rock hanging from the underside in nets of roots (the roots are merged with the others)
  const chunkRoots: THREE.BufferGeometry[] = [];
  const nChunks = opts.bare || R < 3 ? 0 : 1 + Math.floor(rng() * 2);
  bodyGeos.push(...hangingChunks(sh, rng, nChunks, chunkRoots));
  // a fringe of soil and roots under the cliff base, and rubble lodged on the underside
  if (R > 2.5) bodyGeos.push(...undersideDressing(sh, rng, chunkRoots, fallAvoid));
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
      // soft and low: the bushes do the overflowing, these only break the line of the lip
      if (rng() < 0.35) continue;
      const p = l.p.clone().add(new THREE.Vector3((rng() - 0.5) * 0.5, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.5).multiplyScalar(s4));
      const out = new THREE.Vector3(Math.cos(l.a), 0, Math.sin(l.a));
      if (opts.avoid?.(l.p.x, l.p.z, 0.3)) continue;
      tufts.push({ p, up: out.clone().multiplyScalar(0.6).addScaledVector(up, 0.6 + rng() * 0.4).normalize(), scale: (0.7 + rng() * 0.4) * gs, col: tmpC.set('#94bc54').clone().offsetHSL(0, 0, (rng() - 0.5) * 0.04) });
    }
    // tufts hanging under the turf edge, so it is never a clean line
    for (const l of shell.lipUnder) {
      if (nearFall(l.a, 1.0) || rng() < 0.85 || opts.avoid?.(l.p.x, l.p.z, 0.3)) continue;
      const out = new THREE.Vector3(Math.cos(l.a), 0, Math.sin(l.a));
      tufts.push({ p: l.p.clone().addScaledVector(out, 0.05), up: out.clone().addScaledVector(up, -0.7).normalize(), scale: (0.6 + rng() * 0.5) * gs, col: tmpC.set('#6f9e42').clone() });
    }
  }
  // (the ledges get moss pads and bushes, below, not rows of tufts)
  const grass = sprigMesh(tufts, 'tuft', opts.seed);
  if (grass) group.add(grass);

  // ---- flowers: dense in the drifts, and spilling over the lip
  const daisies: Sprig[] = [], spikes: Sprig[] = [];
  for (const d of sh.drifts) {
    const n = Math.round(d.r * d.r * 4);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, rr = Math.sqrt(rng()) * d.r;
      const x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr;
      if (!sh.inside(x, z) || nearWater(x, z, 0.2)) continue;
      // thinning out toward the drift's edge, with white mixed in all through
      if (rr > d.r * 0.55 && rng() < (rr / d.r - 0.55) * 1.6) continue;
      const col = (rng() < 0.3 ? FLOWER_COLS[rng() < 0.5 ? 0 : 3] : d.col).clone().offsetHSL(0, 0, (rng() - 0.5) * 0.06);
      const sp: Sprig = { p: new THREE.Vector3(x, sh.height(x, z) - 0.02, z), up: normalAt(x, z).lerp(up, 0.5).normalize(), scale: (1.3 + rng() * 0.7) * gs, col };
      (d.spike ? spikes : daisies).push(sp);
    }
  }
  if (!opts.bare) for (const l of shell.lip) {
    if (nearFall(l.a, 1.2) || rng() > 0.3) continue;
    const near = sh.drifts.find(d => Math.hypot(l.p.x - d.x, l.p.z - d.z) < d.r * 1.6);
    if (!near && rng() > 0.35) continue;
    const col = (near ? near.col : FLOWER_COLS[Math.floor(rng() * FLOWER_COLS.length)]).clone();
    if (opts.avoid?.(l.p.x, l.p.z, 0.3)) continue;
    const out = new THREE.Vector3(Math.cos(l.a), 0, Math.sin(l.a));
    (near?.spike ? spikes : daisies).push({ p: l.p.clone(), up: out.multiplyScalar(0.7).addScaledVector(up, 0.7).normalize(), scale: (1.0 + rng() * 0.5) * gs, col });
  }
  const fl1 = sprigMesh(daisies, 'daisy', opts.seed + 1), fl2 = sprigMesh(spikes, 'spike', opts.seed + 2);
  if (fl1) group.add(fl1);
  if (fl2) group.add(fl2);

  // ---- trees, bushes and cottages (merged per material: a handful of draws for all of them)
  if (!opts.bare) {
    const flora = new THREE.Group();
    const nTrees = opts.trees ?? Math.round(R / 2.2);
    const placed: { v: THREE.Vector2; r: number }[] = [];
    const free = (x: number, z: number, r: number) => !placed.some(p => p.v.distanceTo(new THREE.Vector2(x, z)) < (p.r + r) * 0.8);
    // trees in scale with the island: an oak's crown is about a third of the cliff's height (capped for tall cliffs)
    const tScale = clamp(Math.min(opts.cliffDepth, R * 1.1) / 9.5, 0.5, 1.5);
    // fewer, bigger trees of mixed kinds: broad oaks most of all, round trees, the odd blossom (no lone poplar)
    const kinds: TreeKind[] = ['oak', 'oak', 'oak', 'oak', 'oak', 'round', 'round', 'round', 'round', 'blossom'];
    // cottages first (they need the flattest ground), set back from the rim and turned to face out
    const houses: THREE.Vector2[] = [];
    for (let i = 0, tries = 0; i < (opts.cottages ?? 0) && tries < 60; tries++) {
      const q = randomTop(0.25, 0.7);
      if (nearWater(q.x, q.z, 4) || !free(q.x, q.z, 4.5)) continue;
      const e = 2.2;
      const slope = Math.abs(sh.height(q.x + e, q.z) - sh.height(q.x - e, q.z)) + Math.abs(sh.height(q.x, q.z + e) - sh.height(q.x, q.z - e));
      if (slope > 0.9) continue;
      const c = islandCottage(ROOFS[Math.floor(rng() * ROOFS.length)]);
      c.scale.setScalar(0.85);
      c.position.set(q.x, q.y - 0.3, q.z);
      c.rotation.y = -q.a + Math.PI / 2 + (rng() - 0.5) * 0.6;
      flora.add(c);
      placed.push({ v: new THREE.Vector2(q.x, q.z), r: 4.5 });
      houses.push(new THREE.Vector2(q.x, q.z));
      solids.push({ x: q.x, z: q.z, r: 2.2, h: 5 });
      i++;
    }
    // copses of three to five trees near the rim (one or two leaning out over it), and the odd tree inland
    const addTree = (x: number, z: number, a: number, k: number, lean: number) => {
      const kind = kinds[Math.floor(rng() * kinds.length)];
      const t = islandTree(kind, rng, tScale * k);
      t.position.set(x, sh.height(x, z) - 0.15, z);
      t.rotation.y = rng() * TAU;
      if (lean) { const ax = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)); t.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, -lean)); }
      flora.add(t);
      placed.push({ v: new THREE.Vector2(x, z), r: 2.4 * tScale * k });
      solids.push({ x, z, r: 0.4 * tScale * k, h: 3 });
    };
    let grown = 0;
    for (let tries = 0; grown < nTrees && tries < 30; tries++) {
      const inland = rng() < 0.2;
      const q = inland ? randomTop(0.15, 0.6) : randomTop(0.7, 0.86);
      if (nearWater(q.x, q.z, 3) || nearFall(q.a, 2.5) || !free(q.x, q.z, 3 * tScale)) continue;
      const n = inland ? 1 : Math.min(nTrees - grown, 3 + Math.floor(rng() * 3));
      for (let i = 0, t2 = 0; i < n && t2 < 20; t2++) {
        const a = q.a + ((rng() - 0.5) * 7 * tScale) / sh.outline(q.a);
        const s = Math.min(0.9, q.s + (rng() - 0.5) * 0.12 + (i === 0 && !inland ? 0.04 : 0));
        const r = sh.outline(a) * s;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        // sizes vary a lot: one big tree in a copse, the rest smaller
      const k = i === 0 ? 1.1 + rng() * 0.3 : 0.65 + rng() * 0.4;
        if (!sh.inside(x * 1.08, z * 1.08) || nearWater(x, z, 2.5) || nearFall(a, 2.5) || !free(x, z, 2.4 * tScale * k)) continue;
        addTree(x, z, a, k, s > 0.85 ? 0.15 + rng() * 0.12 : 0);
        i++; grown++;
      }
    }
    // bushes: soft round masses heaped along the rim and spilling over the lip, under the trees and by the houses
    const nB = opts.bushes ?? Math.round((TAU * R) / 2.6);
    const bScale = clamp(R / 12, 0.45, 1.25);
    for (let i = 0; i < nB; i++) {
      const over = rng() < 0.55;
      const a = rng() * TAU;
      if (nearFall(a, 1.6)) continue;
      const Ra = sh.outline(a);
      if (nearWater(Math.cos(a) * Ra, Math.sin(a) * Ra, 2)) continue;
      const k = (0.85 + rng() * 0.6) * bScale * (opts.bushes !== undefined ? 0.7 : 1);
      const b = islandBush(rng, k);
      if (over) {
        // half over the edge, tipped out and down, so the mass rolls over the lip
        const Rt = Ra - 0.15 * k;
        b.position.set(Math.cos(a) * Rt, sh.edgeY(a) - 0.45 * k, Math.sin(a) * Rt);
        const ax = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
        b.quaternion.setFromAxisAngle(ax, -(0.4 + rng() * 0.35));
      } else {
        const r = Ra * (0.86 + rng() * 0.1);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!free(x, z, 0.6) || nearWater(x, z, 0.8)) continue;
        b.position.set(x, sh.height(x, z) - 0.1, z);
      }
      b.rotateY(rng() * TAU);
      flora.add(b);
    }
    for (const p of [...placed.map(p => p.v), ...houses]) {
      for (let k = 0; k < 2; k++) {
        if (rng() < 0.35) continue;
        const a = rng() * TAU, d = (2 + rng() * 1.5) * tScale;
        const x = p.x + Math.cos(a) * d, z = p.y + Math.sin(a) * d;
        if (!sh.inside(x * 1.05, z * 1.05) || nearWater(x, z, 1.2)) continue;
        const b = islandBush(rng, (0.7 + rng() * 0.35) * bScale);
        b.position.set(x, sh.height(x, z) - 0.1, z);
        flora.add(b);
      }
    }
    // moss pads on the ledges (soft low cushions in irregular groups) and bushes clinging to some of them
    const ledgeSpots = shell.ledges.filter(l => !nearFall(l.a, 1.3));
    const nPads = Math.min(ledgeSpots.length, Math.round(R * 1.4));
    for (let i = 0; i < nPads; i++) {
      const l = ledgeSpots[Math.floor(rng() * ledgeSpots.length)];
      const out = new THREE.Vector3(Math.cos(l.a), 0, Math.sin(l.a));
      const side = new THREE.Vector3(-out.z, 0, out.x);
      const n = 2 + Math.floor(rng() * 3);
      const col = MOSS_PAD[Math.floor(rng() * MOSS_PAD.length)];
      for (let k = 0; k < n; k++) {
        const r = (0.3 + rng() * 0.35) * s4 * Math.min(1.4, 0.6 + l.w);
        const c = clump(r, col, Math.floor(rng() * 99999), 0.42);
        c.position.copy(l.p).addScaledVector(side, (k - n / 2) * r * 1.2 + (rng() - 0.5) * 0.3).addScaledVector(out, -r * 0.2).add(new THREE.Vector3(0, r * 0.1, 0));
        flora.add(c);
      }
    }
    const nLedgeBush = Math.min(ledgeSpots.length, Math.round(R / 2.5));
    for (let i = 0; i < nLedgeBush; i++) {
      const l = ledgeSpots[Math.floor(rng() * ledgeSpots.length)];
      if (l.w < 0.35 * s4) continue;
      const b = islandBush(rng, (0.5 + rng() * 0.35) * bScale, false);
      const out = new THREE.Vector3(Math.cos(l.a), 0, Math.sin(l.a));
      b.position.copy(l.p).addScaledVector(out, -0.15 * s4);
      // leaning out over the edge of the ledge
      b.quaternion.setFromAxisAngle(new THREE.Vector3(-out.z, 0, out.x), -0.3);
      b.rotateY(rng() * TAU);
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
    // ink the trunks and limbs (leaf crowns get their silhouettes from the screen ink)
    const bark = toonMat('#7d5c42', 0.6, 0.6);
    merged.children.forEach(c => { if ((c as THREE.Mesh).material === bark) addOutlines(c, '#3b2a30', 0.03); });
    group.add(merged);
    if (stones.children.length) group.add(mergeByMaterial(stones));
  }

  // ---- cliffs: hanging growth, roots, loose blocks
  const hang = hangingGrowth(sh, rng, opts.bare ? 0.25 : 1, shell.ledges, fallAvoid);
  if (hang) group.add(hang);
  // root tangles out of the soil layer under the lip, roots from the underside, and the chunks' root nets
  const rootMesh = roots(sh, rng, Math.round(R * (opts.bare ? 0.15 : 0.45)), chunkRoots, fallAvoid);
  if (rootMesh) group.add(rootMesh);
  const debris = new THREE.Group();
  const loose = looseRocks(sh, rng, opts.bare || R < 3 ? 0 : Math.round(3 + R * 0.45));
  if (loose) debris.add(loose);
  group.add(debris);

  // ---- water
  const puffs: Puff[] = [], banks: Puff[] = [];
  for (const st of sh.streams) {
    const s = new THREE.Mesh(streamGeometry(sh, st), waterMaterial('stream'));
    s.renderOrder = 1; s.userData.noOutline = true; s.receiveShadow = false;
    group.add(s);
    const f = fallGeometry(sh, st);
    const fm = new THREE.Mesh(f.geo, waterMaterial('fall'));
    fm.renderOrder = 2; fm.userData.noOutline = true;
    group.add(fm);
    // the opaque core's depth, so the screen ink of the cliff behind never draws over the water
    const fd = new THREE.Mesh(f.geo, fallDepthMaterial());
    fd.userData.noOutline = true; fd.castShadow = false; fd.receiveShadow = false;
    group.add(fd);
    const bowAt = fallPuffs(f, rng, puffs, banks);
    group.add(rainbow(f, bowAt));
  }
  const mist = puffMesh(puffs, opts.seed);
  if (mist) group.add(mist);
  const bank = puffMesh(banks, opts.seed + 1, true);
  if (bank) group.add(bank);

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
    group, shape: sh, stats: { triangles: Math.round(triangles), draws }, solids,
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
 * A small floating islet, 1 to 4 m across: a broken block of the same limestone (big angular faces, a flat top, a
 * rough point underneath) with one or two smaller chunks fused to its sides, never a turned cone. Most carry a
 * mossy top with a tuft of grass; the bigger ones a few flowers or a bush. One rock draw, one or two sprig draws.
 * Returns its group; drift and tilt it with group.position / rotation as you like.
 */
export function floatingRock(seed: number, size: number): THREE.Group {
  const rng = makeRng(seed * 5 + 2);
  const group = new THREE.Group();
  group.name = 'floatingRock';
  const cols = ['#e4cc9e', '#e8d5ae', '#dfc28e', '#e6d0a6'].map(c => new THREE.Color(c));
  const w = size * 0.5, h = size * (0.75 + rng() * 0.45);
  const grassy = rng() < 0.85;
  const main = rockBlock(rng, w, h, cols[Math.floor(rng() * cols.length)], grassy ? 0.95 : 0.3);
  main.computeBoundingBox();
  const topY = main.boundingBox!.max.y;
  const geos = [main];
  for (let k = 0; k < 1 + Math.floor(rng() * 2); k++) {
    const a = rng() * TAU;
    const g = rockBlock(rng, w * (0.42 + rng() * 0.2), h * (0.5 + rng() * 0.3), cols[Math.floor(rng() * cols.length)], 0.5);
    g.rotateY(rng() * TAU);
    g.translate(Math.cos(a) * w * 0.6, -h * (0.12 + rng() * 0.3), Math.sin(a) * w * 0.6);
    geos.push(g);
  }
  const body = new THREE.Mesh(mergeGeometries(geos, false)!, islandRockMaterial());
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);
  if (grassy) {
    // a cap of grass on the flat top, thickest in the middle
    const tufts: Sprig[] = [], flowers: Sprig[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const n = Math.round(5 + size * size * 3.5);
    const fc = FLOWER_COLS[Math.floor(rng() * FLOWER_COLS.length)];
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * w * 0.55;
      const p = new THREE.Vector3(Math.cos(a) * r, topY - 0.04, Math.sin(a) * r);
      const sc = Math.max(0.6, Math.min(1.2, size / 2.2)) * (0.8 + rng() * 0.5);
      tufts.push({ p, up: up.clone().addScaledVector(p, 0.3 / Math.max(0.3, w)).normalize(), scale: sc, col: new THREE.Color('#8cb850').offsetHSL(0, 0, (rng() - 0.5) * 0.05) });
      if (size > 1.8 && rng() < 0.25) flowers.push({ p: p.clone(), up, scale: sc * 1.2, col: fc });
    }
    const gm = sprigMesh(tufts, 'tuft', seed);
    if (gm) group.add(gm);
    const fm = sprigMesh(flowers, 'daisy', seed + 1);
    if (fm) group.add(fm);
    // a low mound or two of leafy growth on top, so the cap reads green from across the gap
    const nb = size > 2.6 ? 2 : 1;
    const bushes = new THREE.Group();
    for (let i = 0; i < nb; i++) {
      const b = islandBush(rng, Math.min(0.85, size * 0.2), i === 0 && size > 2 && rng() < 0.5);
      b.scale.y = 0.7;
      b.position.set((rng() - 0.5) * w * 0.5, topY - 0.08, (rng() - 0.5) * w * 0.5);
      bushes.add(b);
    }
    group.add(mergeByMaterial(bushes));
  }
  return group;
}
