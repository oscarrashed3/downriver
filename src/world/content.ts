import { safeSpot, spotProblem, type Avoid } from './spots';
import * as THREE from 'three';
import type { Planet } from './planet';
import * as P from './props';
import { preparePeaks, populatePeaks } from './peaks';
import { orientTo } from './sphere';
import { prepareSky, populateSky } from './w_sky';
import { prepareTown, populateTown } from './walkingTown/w_town';
import { prepareDesert, populateDesert } from './w_desert';
import { prepareLantern, populateLantern } from './w_lantern';
import { Npc, LOOKS } from '../systems/npc';
import { SCRIPTS } from '../data/scripts';
import type { Landmark } from '../systems/mapView';
import { WORLDS } from './worlds';

/** Where the fox waits (the Sky Isles), and the home light (the lighthouse in Lantern Town, the last world). */
export { FOX_SPOT } from './w_sky';
export { HOME_LIGHT } from './w_lantern';

/** Where each later world's prop numbers start (the sea: as measured on the four-world build). */
const RAND_START: Record<string, number> = { sea: 776293943 };

export interface Interactable {
  id: string;
  world: number;
  pos: THREE.Vector3;
  radius: number;
  /** Prompt text, or null when there is nothing to do here right now. */
  label: () => string | null;
  act: () => void;
  /** Seconds E must be held (listening at an echo stone, calming a goat). */
  hold?: number;
  /** Walk up to it first: where to stand, what to face, and whether to kneel (things on the ground). */
  walkTo?: () => { spot: THREE.Vector3; face: THREE.Vector3; kneel?: boolean } | null;
}

export interface WorldContent {
  npcs: Npc[];
  /** Places no one should stand: the bridge, the spring basin. */
  avoid: Avoid[];
  interactables: Interactable[];
  animate: ((dt: number, t: number) => void)[];
  landmarks: Landmark[];
  refs: Record<string, any>;
}

/** Flatten a round pad of ground before the terrain is built: (lat, lon offset from the river, radius m, height m, blend m). */
export type Flat = (lat: number, lon: number, radius: number, height: number, blend?: number) => void;

/** Shape the land before the terrain mesh is built (village plateaus, a tall peak, and so on). */
export function prepare(p: Planet) {
  const f: Flat = (lat, lon, radius, height, blend = 8) =>
    p.flattens.push({ dir: p.dirRiver(lat, lon), radius, height, blend });
  switch (p.cfg.id) {
    case 'peaks': preparePeaks(p); break;
    case 'sky': prepareSky(p, f); break;
    case 'garden': prepareTown(p, f); break;
    // The edge pad stands above the ocean (1.6), so the lip where the river falls on stays dry.
    case 'sea': f(176, 0, 9, 3.0, 6); break;
    case 'desert': prepareDesert(p, f); break;
    case 'lantern': prepareLantern(p, f); break;
  }
}

/** What a world's builder gets to dress its world with. */
export interface Kit {
  p: Planet;
  scene: THREE.Scene;
  c: WorldContent;
  /** Stand an object on the ground at (lat, lon offset from the river), facing downriver, the river or a direction. */
  put: (obj: THREE.Object3D, lat: number, lon: number, offset?: number, face?: 'river' | THREE.Vector3, sink?: number) => THREE.Object3D;
  /** A person, on the nearest good dry spot to (lat, lon). */
  npc: (id: string, lat: number, lon: number) => Npc;
  /** A named place on the map. */
  lm: (name: string, lat: number, lon: number, icon: Landmark['icon']) => void;
  /** Scatter n objects between two latitudes, at least avoidRiver m from the water, where extra(lat, lon) allows. */
  scatter: (n: number, make: () => THREE.Object3D, latR: [number, number], avoidRiver?: number, extra?: (lat: number, lon: number) => boolean) => void;
}

export function populate(p: Planet, scene: THREE.Scene, index: number): WorldContent {
  const c: WorldContent = { npcs: [], avoid: [], interactables: [], animate: [], landmarks: [], refs: {} };
  const put = (obj: THREE.Object3D, lat: number, lon: number, offset = 0, face?: 'river' | THREE.Vector3, sink = 0.15) => {
    const d = p.dirRiver(lat, lon);
    p.surfacePoint(d, offset - sink, obj.position);
    let fwd: THREE.Vector3;
    obj.traverse(m => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true; });
    if (face === 'river') fwd = p.surfacePoint(p.dirRiver(lat, 0)).sub(obj.position);
    else if (face) fwd = face.clone();
    else fwd = p.surfacePoint(p.dirRiver(lat + 1, lon)).sub(obj.position);
    orientTo(obj, d, fwd);
    scene.add(obj);
    return obj;
  };
  const npc = (id: string, lat: number, lon: number) => {
    const n = new Npc(id, LOOKS[id], SCRIPTS[id].start);
    // stand on dry ground near the planned spot, never in the river or inside the bridge, a wall or a tree
    const d = safeSpot(p, p.dirRiver(lat, lon), c.avoid);
    const bad = spotProblem(p, d, c.avoid); if (bad) console.warn(`${id} has nowhere good to stand (${bad})`);
    const pos = p.surfacePoint(d, -0.05);
    const fwd = p.surfacePoint(p.dirRiver(lat, 0)).sub(pos);
    n.place(pos, d, fwd);
    scene.add(n.root);
    c.npcs.push(n);
    return n;
  };
  const lm = (name: string, lat: number, lon: number, icon: Landmark['icon']) => c.landmarks.push({ world: p.cfg.id, name, lat, lon, icon });
  const scatter = (n: number, make: () => THREE.Object3D, latR: [number, number], avoidRiver = 9, extra?: (lat: number, lon: number) => boolean) => {
    let placed = 0, tries = 0;
    while (placed < n && tries < n * 20) {
      tries++;
      const lat = latR[0] + P.rand() * (latR[1] - latR[0]);
      const lon = (P.rand() * 2 - 1) * 180;
      const d = p.dirRiver(lat, lon);
      if (p.riverNearest(d).dist < avoidRiver) continue;
      if (extra && !extra(lat, lon)) continue;
      if (p.cfg.ocean && p.height(d) < p.cfg.ocean + 0.3) continue;
      const o = make(); o.rotateY(P.rand() * 6);
      put(o, lat, lon, 0, undefined, 0.3);
      o.rotateY(P.rand() * 6);
      placed++;
    }
  };

  const kit: Kit = { p, scene, c, put, npc, lm, scatter };
  // Each later world draws its own run of prop numbers, so work on one world never reshuffles another.
  // The sea starts exactly where it did in the four-world build, so it looks just as it did.
  if (index > 0) P.setRandState(RAND_START[p.cfg.id] ?? p.cfg.seed * 7919 + 13);

  // Every world but the last: the edge where the river pours on to the next world.
  if (index < WORLDS.length - 1) { const a = put(P.edgeArch(p.cfg.palette.rock), 176.5, 0, 0, 'river'); c.refs.edge = a; lm('The edge', 176, 0, 'arch'); }

  switch (p.cfg.id) {
    case 'peaks': populatePeaks(p, scene, c, put, npc, lm); break;
    case 'sky': populateSky(kit); break;
    case 'garden': populateTown(kit); break;
    case 'desert': populateDesert(kit); break;
    case 'lantern': populateLantern(kit); break;
    case 'sea': {
      for (let i = 0; i < 10; i++) put(P.stiltHouse(), 70 + i * 6, (i % 2 ? 1 : -1) * (7 + P.rand() * 3), -0.5, 'river');
      scatter(50, () => P.mangrove(), [30, 165], 5, () => true);
      npc('maren', 101, 5);
      break;
    }
  }
  return c;
}
