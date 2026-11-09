// World 2, The Sky Isles (bright midday, wind). Floating islands of meadow and pale rock above a soft cloud floor.
// The river runs along the tops of a chain of narrow islands and pours off each one onto the next (planet.ts
// SKY_STEPS). The fox joins here. Everything here is about wind: streamers, kites, balloons, chimes, a windmill spire.
// Sketch: a dock, the Chime Spire on its knoll, the round wind houses, islets to glide to; the builder refines.
import * as THREE from 'three';
import type { Planet } from './planet';
import { SKY_STEPS } from './planet';
import type { Kit, Flat } from './content';
import * as P from './props';
import * as Q from './props2';
import { addOutlines, paint, softRamp } from '../render/paint';

/** Where the fox waits (river lat, lon offset): on the first island, a little below the dock, in sight of it. */
export const FOX_SPOT = { lat: 27, lon: 8 } as const;
/** The Chime Spire, the landmark: a knoll on the second island with a windmill and a frame of wind chimes. */
export const SPIRE = { lat: 64, lon: 26 } as const;
/** The wind houses, on a green across the river from the dock. */
const GREEN = { lat: 27, lon: -22 } as const;

/** Pastel cloth for streamers, balloons and kites: the colours of a bright, windy noon. */
const CLOTH = ['#f49ab0', '#ffd36a', '#8fd0f4', '#b8a2f0', '#ffffff', '#ff9a6a'];

/** Double-sided cloth, one material per colour (the shared toon materials stay single-sided). */
const clothMats = new Map<string, THREE.MeshToonMaterial>();
function cloth(color: string) {
  let m = clothMats.get(color);
  if (!m) { m = paint(new THREE.MeshToonMaterial({ color, gradientMap: softRamp(), side: THREE.DoubleSide })); clothMats.set(color, m); }
  return m;
}

const ink = (g: THREE.Object3D, w = 0.03) => addOutlines(g, '#3b2a30', w);
const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; return o;
};

/** Height of the island top beside the river at a latitude (the river steps down island by island). */
const topAt = (p: Planet, lat: number) => p.bedAt(p.tAtLat(lat)) + p.cfg.waterDepth + 0.6;
const latOfT = (p: Planet, t: number) => p.cfg.riverStartLat + t * (179.5 - p.cfg.riverStartLat);
/** A lon offset (degrees) that is `metres` from the river at this latitude. */
const lonM = (p: Planet, lat: number, metres: number) => metres / (p.R * Math.PI / 180 * Math.sin(lat * Math.PI / 180));

/**
 * A wind house: a round white tower with a pastel dome, round windows, a little turning sail on top,
 * and a ribbon flying from the dome. The people of the islands live in these, not in cottages.
 */
export function windHouse(dome = '#8fc0ec', h = 3.2): THREE.Group {
  const g = new THREE.Group();
  const wall = P.toon('#f8f4ec'), trim = P.toon('#e6dccb');
  g.add(mk(new THREE.CylinderGeometry(1.5, 1.7, h, 16), wall, 0, h / 2, 0));
  g.add(mk(new THREE.CylinderGeometry(1.75, 1.75, 0.22, 16), trim, 0, h, 0));
  const d = mk(new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), P.toon(dome), 0, h + 0.1, 0); d.scale.y = 0.85; g.add(d);
  // round windows, warm inside, and a door
  const win = P.toon('#ffe2a0', '#ffcf70', 0.5);
  for (const a of [0.4, 2.2, 3.9]) {
    const w = mk(new THREE.CircleGeometry(0.32, 14), win, Math.sin(a) * 1.62, h * 0.62, Math.cos(a) * 1.62);
    w.lookAt(Math.sin(a) * 5, h * 0.62, Math.cos(a) * 5); w.userData.noOutline = true; g.add(w);
  }
  const door = mk(new THREE.BoxGeometry(0.75, 1.3, 0.12), P.toon('#7a8ec0'), 0, 0.65, 1.66); g.add(door);
  // the sail on the dome turns in the wind
  const hub = new THREE.Group(); hub.position.set(0, h + 1.65, 0.1); g.add(hub);
  hub.add(mk(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 5), P.toon('#6a5a50'), 0, -0.3, 0));
  const blades = new THREE.Group(); blades.position.z = 0.08; hub.add(blades);
  for (let i = 0; i < 4; i++) {
    const b = mk(new THREE.BoxGeometry(0.16, 0.85, 0.03), P.toon(i % 2 ? '#f49ab0' : '#ffd36a'), 0, 0.45, 0);
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; arm.add(b); blades.add(arm);
  }
  g.userData.blades = blades;
  ink(g);
  g.add(streamer(CLOTH[Math.floor(P.rand() * CLOTH.length)], 2.2, h + 1.2));
  return g;
}

/** A long cloth ribbon that flaps in the wind, hung from (0, y, 0). Animated by flapStreamers(). */
export function streamer(color: string, len = 3, y = 3): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(len, 0.22, 12, 1);
  geo.translate(len / 2, 0, 0);
  const mat = cloth(color);
  const r = new THREE.Mesh(geo, mat);
  r.position.y = y;
  r.userData.noOutline = true;
  r.userData.streamer = { base: Float32Array.from(geo.attributes.position.array as Float32Array), len, ph: P.rand() * 9 };
  return r;
}

/** A tall pole with streamers in every colour, the islands' way of showing where the wind is going. */
export function streamerPole(h = 5): THREE.Group {
  const g = new THREE.Group();
  g.add(mk(new THREE.CylinderGeometry(0.06, 0.09, h, 6), P.toon('#efe6d4'), 0, h / 2, 0));
  g.add(mk(new THREE.SphereGeometry(0.16, 8, 6), P.toon('#ffd36a'), 0, h + 0.1, 0));
  ink(g);
  for (let i = 0; i < 3; i++) g.add(streamer(CLOTH[(i * 2 + Math.floor(P.rand() * 6)) % CLOTH.length], 2.4 + i * 0.7, h - 0.2 - i * 0.45));
  return g;
}

/** A small striped hot-air balloon with a basket, drifting over the cloud sea. */
export function balloon(): THREE.Group {
  const g = new THREE.Group();
  const a = CLOTH[Math.floor(P.rand() * 4)], b = '#fff8ee';
  for (let i = 0; i < 8; i++) {
    const seg = mk(new THREE.SphereGeometry(1.6, 6, 12, (i / 8) * Math.PI * 2, Math.PI * 2 / 8), P.toon(i % 2 ? a : b), 0, 3.4, 0);
    seg.scale.y = 1.15; seg.castShadow = false; g.add(seg);
  }
  g.add(mk(new THREE.CylinderGeometry(0.42, 0.32, 0.45, 10), P.toon('#a8784a'), 0, 0.9, 0));
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
    const rope = mk(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 3), P.toon('#6a5a50'), x * 1.4, 1.75, z * 1.4); g.add(rope);
  }
  ink(g, 0.04);
  return g;
}

/** A thin fall of water off an island's edge, down into the cloud, with spray where it lands. */
export function edgeFall(h: number, w = 1.1): THREE.Group {
  const g = new THREE.Group();
  const water = new THREE.MeshToonMaterial({ color: '#bfeaf8', transparent: true, opacity: 0.85 });
  const f = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.8, h, 10, 1, true), water);
  f.scale.z = 0.35; f.position.y = -h / 2; f.userData.noOutline = true; g.add(f);
  const lines = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 });
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, h * (0.4 + i * 0.15), 0.02), lines);
    l.position.set((i - 1) * w * 0.32, -h * (0.35 + i * 0.1), w * 0.3); l.userData.noOutline = true; g.add(l);
  }
  const spray = P.cloudWisp(); spray.position.y = -h - 0.3; spray.scale.setScalar(1.3); g.add(spray);
  return g;
}

export function prepareSky(p: Planet, f: Flat) {
  // the edge pad, level with the last island
  f(176, 0, 9, topAt(p, 176) + 0.2, 6);
  // the spire's knoll stands a little above its island
  f(SPIRE.lat, SPIRE.lon, 7, topAt(p, SPIRE.lat) + 1.6, 6);
  // the wind houses' green, across the river from the dock
  f(GREEN.lat, GREEN.lon, 6, topAt(p, GREEN.lat) + 0.1, 5);
  // islets just off the first island, in plain sight of the dock, each a short glide lower than the last
  const top = topAt(p, 22);
  f(24, lonM(p, 24, 15), 2.6, top - 0.4, 1.4);
  f(31, lonM(p, 31, 17), 3.0, top - 1.0, 1.6);
  f(40, lonM(p, 40, 16), 3.4, top - 1.6, 1.8);
}

export function populateSky(k: Kit) {
  const { p, c, put, npc, lm, scatter } = k;
  const firstChild = k.scene.children.length;
  const ground = (lat: number, lon: number) => p.height(p.dirRiver(lat, lon));
  const fox = p.dirRiver(FOX_SPOT.lat, FOX_SPOT.lon);
  const clear = (lat: number, lon: number) => fox.angleTo(p.dirRiver(lat, lon)) * p.R > 6;
  const rel = (lat: number, lon: number) => ground(lat, lon) - p.skyCloud(lat);
  const onIsland = (lat: number, lon: number) => rel(lat, lon) > 2 && clear(lat, lon);
  const onCloud = (lat: number, lon: number) => rel(lat, lon) < 1.0;

  // The Chime Spire: a white windmill turning in the high wind, a frame of chimes, streamers to the ground.
  const mill = put(Q.windmill(), SPIRE.lat, SPIRE.lon, 0, 'river');
  mill.scale.setScalar(1.5);
  put(P.chimes(), SPIRE.lat + 3, SPIRE.lon - 4, 0, 'river');
  put(streamerPole(6), SPIRE.lat - 3, SPIRE.lon + 4, 0, 'river');
  c.animate.push((dt) => { (mill.userData.hub as THREE.Object3D).rotation.z += dt * 1.6; });
  lm('The Chime Spire', SPIRE.lat, SPIRE.lon, 'tower');

  // The wind houses of the people who keep the islands, across the river from the dock.
  const houses = [
    put(windHouse('#8fc0ec', 3.4), GREEN.lat + 1.5, GREEN.lon - 2, 0, 'river'),
    put(windHouse('#f4a8c0', 2.6), GREEN.lat - 3, GREEN.lon + 3, 0, 'river'),
    put(windHouse('#b8a2f0', 3.0), GREEN.lat + 5, GREEN.lon + 4, 0, 'river'),
  ];
  c.animate.push((dt) => houses.forEach((h, i) => { (h.userData.blades as THREE.Object3D).rotation.z += dt * (2.2 + i * 0.4); }));
  put(Q.laundry(4), GREEN.lat - 1, GREEN.lon + 9, 0, 'river');
  lm('The wind houses', GREEN.lat, GREEN.lon, 'hut');

  // Streamers by the dock and down the bank, so the wind shows from the very first look.
  for (const [lat, m] of [[22, -6.5], [26, 6.8], [33, -6.2], [38, 7], [50, 6.5], [58, -6.8]] as const) put(streamerPole(4.2 + (lat % 3) * 0.5), lat, lonM(p, lat, m), 0, 'river');
  // and on each islet off the first island, a pole to aim for
  for (const [lat, m] of [[24, 15], [31, 17], [40, 16]] as const) put(streamerPole(3.4), lat, lonM(p, lat, m), 0, 'river');

  // Water spills off the island edges into the clouds: search outward from the river for where the ground falls away.
  const edgeAt = (lat: number, side: number) => {
    for (let mtr = 6; mtr < 16; mtr += 0.25) if (ground(lat, side * lonM(p, lat, mtr)) < topAt(p, lat) - 1.2) return mtr - 0.5;
    return 0;
  };
  for (const [lat, side] of [[29, 1], [46, -1], [72, 1], [100, -1], [124, 1], [150, -1]] as const) {
    const e = edgeAt(lat, side); if (!e) continue;
    const top = topAt(p, lat), h = top - p.skyCloud(lat) + 0.2;
    put(edgeFall(h, 1 + (lat % 2) * 0.3), lat, side * lonM(p, lat, e), top - 0.05 - ground(lat, side * lonM(p, lat, e)), 'river');
  }

  // Kites on long strings over the islands, and balloons drifting over the cloud sea.
  for (const [lat, lon] of [[44, -16], [92, 24], [128, -18]] as const) {
    if (rel(lat, lon) < 2) continue;
    const kite = Q.torKite(); kite.scale.setScalar(1.6);
    put(kite, lat, lon, 9 + Math.sin(lat) * 2);
    c.animate.push((dt, t) => { kite.rotation.z = Math.sin(t * 1.3 + lat) * 0.25; });
  }
  const balloons: { o: THREE.Object3D; base: THREE.Vector3; up: THREE.Vector3; ph: number }[] = [];
  for (const [lat, lon, hgt] of [[34, 40, 9], [22, -48, 12], [60, -36, 10], [86, 46, 13], [120, -40, 11], [150, 36, 12]] as const) {
    const o = put(balloon(), lat, lon, hgt, undefined, 0);
    balloons.push({ o, base: o.position.clone(), up: p.dirRiver(lat, lon), ph: lat });
  }
  c.animate.push((_dt, t) => balloons.forEach(b => b.o.position.copy(b.base).addScaledVector(b.up, Math.sin(t * 0.5 + b.ph) * 0.6)));

  scatter(14, () => Q.blossomTree(3.2 + P.rand() * 1.4), [10, 170], 7, onIsland);
  scatter(6, () => Q.treeChimes(), [20, 160], 7, onIsland);
  scatter(10, () => streamerPole(3.6 + P.rand() * 1.5), [40, 170], 6, onIsland);
  scatter(70, () => P.cloudWisp(), [6, 174], 8, onCloud);
  // big soft banks of cloud just off the first island, piled against its cliffs, so the landing feels high up
  for (const [lat, m, s] of [[19, -15, 1.8], [24, -13, 1.4], [30, 13, 1.6], [36, -12, 1.5], [44, 12, 1.7]] as const) {
    const w = put(P.cloudWisp(), lat, lonM(p, lat, m), 0.4, undefined, 0);
    w.scale.setScalar(s);
  }

  // Where the river pours from one island onto the next, a bank of spray.
  for (const [ts] of SKY_STEPS) {
    const lat = latOfT(p, ts) + 1.0;
    for (const side of [-1, 1]) put(P.cloudWisp(), lat, side * lonM(p, lat, 3.2), -0.8, 'river');
  }

  // Every streamer in the world flaps in the same wind.
  const flags: THREE.Mesh[] = [];
  for (const o of k.scene.children.slice(firstChild)) o.traverse(x => { if (x.userData.streamer) flags.push(x as THREE.Mesh); });
  c.animate.push((_dt, t) => {
    for (const f of flags) {
      const s = f.userData.streamer as { base: Float32Array; len: number; ph: number };
      const a = f.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        const x = s.base[i * 3], u = x / s.len;
        a.setY(i, s.base[i * 3 + 1] - u * 0.35 + Math.sin(t * 6 + s.ph - u * 5) * 0.16 * u);
        a.setZ(i, Math.sin(t * 4.3 + s.ph - u * 4) * 0.22 * u);
      }
      a.needsUpdate = true;
    }
  });

  npc('tamsin', SPIRE.lat - 4, SPIRE.lon - 10);
  c.refs.spire = mill;
}
