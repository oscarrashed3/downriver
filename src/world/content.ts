import * as THREE from 'three';
import type { Planet } from './planet';
import * as P from './props';
import { preparePeaks, populatePeaks } from './peaks';
import { orientTo } from './sphere';
import { Npc, LOOKS } from '../systems/npc';
import { SCRIPTS } from '../data/scripts';
import type { Landmark } from '../systems/mapView';

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
}

export interface WorldContent {
  npcs: Npc[];
  interactables: Interactable[];
  animate: ((dt: number, t: number) => void)[];
  landmarks: Landmark[];
  refs: Record<string, any>;
}

/** Shape the land before the terrain mesh is built (village plateaus, a tall peak, and so on). */
export function prepare(p: Planet) {
  const f = (lat: number, lon: number, radius: number, height: number, blend = 8) =>
    p.flattens.push({ dir: p.dirRiver(lat, lon), radius, height, blend });
  switch (p.cfg.id) {
    case 'peaks': preparePeaks(p); break;
    case 'pines': f(70, 22, 6, 3, 6); f(92, -18, 10, 2.5, 8); f(176, 0, 9, 1.5, 6); break;
    case 'deep': f(86, 16, 7, 3, 6); f(176, 0, 9, 1.5, 6); break;
    case 'desert': f(86, -26, 14, 1.6, 8); f(176, 0, 9, 1.2, 6); break;
    case 'aquila': f(85, 0, 34, 1.4, 10); f(176, 0, 9, 1.2, 6); break;
    case 'sea': f(172, 0, 7, 3.2, 6); break;
  }
}

export function populate(p: Planet, scene: THREE.Scene, index: number): WorldContent {
  const c: WorldContent = { npcs: [], interactables: [], animate: [], landmarks: [], refs: {} };
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
    const d = p.dirRiver(lat, lon);
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

  // Every world: the edge where the river pours on to the next world.
  if (p.cfg.id !== 'sea') { const a = put(P.edgeArch(p.cfg.palette.rock), 176.5, 0, 0, 'river'); c.refs.edge = a; lm('The edge', 176, 0, 'arch'); }

  switch (p.cfg.id) {
    case 'peaks': populatePeaks(p, scene, c, put, npc, lm); break;
    case 'pines': {
      scatter(160, () => P.pine(6 + P.rand() * 6, P.rand() < 0.25), [8, 170], 8);
      scatter(60, () => P.sprout(), [20, 160], 6);
      put(P.tower(), 70, 22, 0); lm('Fire tower', 70, 22, 'tower');
      put(P.hut('#8a6a50', '#a8503a'), 92, -22, 0, 'river'); put(P.hut('#9a7a60', '#8a4030'), 95, -14, 0, 'river');
      npc('tamsin', 73, 18);
      break;
    }
    case 'deep': {
      scatter(36, () => P.giantTree(), [10, 170], 14);
      scatter(80, () => P.fungus(), [10, 170], 6);
      scatter(40, () => P.pine(4, false), [20, 160], 8);
      npc('oro', 86, 15);
      put(P.hut('#a88a60', '#3a7a50'), 88, 20, 0, 'river');
      lm('Terraces', 80, 30, 'hut');
      break;
    }
    case 'desert': {
      const town = put(P.windTown(), 86, -27, 0, 'river'); c.refs.town = town;
      c.animate.push((dt) => (town.userData.blades as THREE.Group[]).forEach(b => (b.rotation.z += dt * 1.2)));
      scatter(14, () => P.arch(), [20, 160], 14);
      npc('sefa', 84, -14);
      lm('Sahra, the wandering town', 86, -27, 'hut');
      break;
    }
    case 'aquila': {
      put(P.temple(), 74, 22, 0, 'river'); lm('Temple', 74, 22, 'arch');
      put(P.amphitheater(), 98, -26, 0, 'river'); lm('Amphitheater', 98, -26, 'arch');
      for (let i = 0; i < 26; i++) { const la = 72 + P.rand() * 28, lo = (P.rand() > 0.5 ? 1 : -1) * (9 + P.rand() * 22); put(P.cityHouse(), la, lo, 0, 'river'); }
      for (let i = 0; i < 6; i++) put(P.column(7), 84 + i * 1.6, 8, 0);
      const aq = P.aqueduct(10); put(aq, 118, -30, 0, new THREE.Vector3(0, 0, 1)); lm('Aqueduct', 118, -30, 'arch');
      scatter(40, () => P.olive(), [20, 160], 10, (la) => la < 65 || la > 110);
      npc('cassian', 86, 5);
      break;
    }
    case 'sea': {
      for (let i = 0; i < 10; i++) put(P.stiltHouse(), 70 + i * 6, (i % 2 ? 1 : -1) * (7 + P.rand() * 3), -0.5, 'river');
      scatter(50, () => P.mangrove(), [30, 165], 5, () => true);
      put(P.lighthouse(), 172, 3, 0); c.refs.lighthouse = true; lm('The lighthouse', 172, 3, 'tower');
      npc('maren', 101, 5);
      break;
    }
  }
  void index;
  return c;
}
