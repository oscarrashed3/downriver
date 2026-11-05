import * as THREE from 'three';
import type { Planet } from './planet';
import * as P from './props';
import { glacierEdgeLat } from './planet';
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
    case 'peaks':
      f(13.5, 0, 6, p.cfg.riverBed + 0.5, 6);        // the spring
      f(60, -17, 12, 4.2, 10);                        // the village shelf
      f(78, 21, 6, 4.5, 8);                           // Tor's hut
      f(38, 14, 5, 6.5, 8);                           // Ysolde's seat by the stones
      f(40, 80, 2.5, p.cfg.amplitude * 1.45, 16);     // the tall peak where clouds sleep
      f(176, 0, 9, p.cfg.riverBed + 1.2, 8);          // the edge
      break;
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
    case 'peaks': {
      const spring = put(P.spring(), 13.2, 0, 0); c.refs.spring = spring;
      lm('The spring', 13, 0, 'spring');
      // Ysolde's valley of stones. Older generations of stones sit higher, nearer where the ice once reached.
      c.refs.stones = [] as THREE.Object3D[];
      for (let i = 0; i < 9; i++) put(P.stone(1.6 + P.rand() * 0.6, false), 27 + i * 0.8, 18 + (P.rand() - 0.5) * 5, 0);
      const hist = [0.62, 0.55, 0.49, 0.42, 0.36, 0.3];
      hist.forEach((v, i) => c.refs.stones.push(put(P.stone(2.2, true), glacierEdgeLat(v) + 1, 16 + (i % 2) * 2.5, 0)));
      lm("Ysolde's stones", 22, 17, 'stone');
      npc('ysolde', 38.5, 12.5);
      // Village
      put(P.hut(), 58, -24, 0, 'river'); put(P.hut('#c8b0a0', '#5a6a9a'), 63.5, -13, 0, 'river'); put(P.hut('#b0a8b8'), 55, -12.5, 0, 'river');
      const fire = put(P.campfire(), 60.2, -17.5, 0); c.refs.fire = fire;
      c.animate.push((_dt, t) => { fire.userData.flame.scale.y = 1 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7.3) * 0.08; fire.userData.light.intensity = 26 + Math.sin(t * 17) * 4; });
      lm('The village', 60, -17, 'hut');
      const ch = put(P.chimes(), 56.5, -20, 0, 'river'); c.refs.chimes = ch;
      c.animate.push((_dt, t) => (ch.userData.icicles as THREE.Mesh[]).forEach((ic, i) => (ic.rotation.z = Math.sin(t * 1.3 + i) * 0.08)));
      npc('nima', 57.5, -22.5);
      npc('bram', 64.5, -24);
      for (let i = 0; i < 5; i++) put(P.goat(), 66 + P.rand() * 4, -26 - P.rand() * 8, 0, undefined, 0.05);
      // Tor
      put(P.hut('#a8b0b8', '#3a5a6a'), 79.5, 23.5, 0, 'river');
      npc('tor', 77, 18.5);
      lm("Tor's hut", 78, 21, 'hut');
      // Snow poles
      c.refs.poles = [[46, -38], [72, 40], [98, -28]].map(([la, lo], i) => { lm(`Pole ${i + 1}`, la, lo, 'pole'); return { obj: put(P.pole(), la, lo, 0), lat: la, lon: lo }; });
      // Fence sites (cairns) and stupa sites
      const fenceSpots: Record<string, [number, number]> = {
        'fence-north-ridge': [30, -40], 'fence-saddle': [44, 52], 'fence-east-shoulder': [60, 44],
        'fence-lee-hollow': [52, -58], 'fence-south-bowl': [86, -48], 'stupa-west': [18, -11], 'stupa-east': [18, 11],
      };
      c.refs.siteSpots = fenceSpots;
      c.refs.cairns = {} as Record<string, THREE.Object3D>;
      for (const [id, [la, lo]] of Object.entries(fenceSpots)) c.refs.cairns[id] = put(P.cairn(id.startsWith('stupa') ? '#9fdcff' : '#ffd27a'), la, lo, 0);
      // The tall peak with a sleeping cloud
      const wisp = put(P.cloudWisp(), 40, 80, 3.5); c.refs.wisp = wisp;
      c.animate.push((_dt, t) => { wisp.children.forEach((ch2, i) => (ch2.position.y += Math.sin(t * 0.8 + i) * 0.003)); });
      lm('The tall peak', 40, 80, 'cloud');
      // Dry meadow by the village
      c.refs.meadow = [] as THREE.Mesh[];
      for (let i = 0; i < 26; i++) { const g = P.sprout(); (g.material as THREE.MeshToonMaterial) = P.toon('#c8b06a'); put(g, 66 + P.rand() * 6, -36 - P.rand() * 10, 0, undefined, 0.05); c.refs.meadow.push(g); }
      lm('Dry meadow', 69, -41, 'hut');
      // The wind-loaded east slope of the pasture road
      const cornice = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), P.toon('#ffffff'));
      cornice.scale.set(1.4, 0.5, 0.8);
      c.refs.cornice = put(cornice, 42, -92, 0.3);
      lm('East road', 44, -90, 'peak'); lm('West road', 50, -112, 'peak');
      break;
    }
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
