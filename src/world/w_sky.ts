// World 2, The Sky Isles (bright midday, wind). Floating islands of meadow and pale rock above a soft cloud floor.
// The river runs along the tops of a chain of islands and pours off each one onto the next (planet.ts SKY_STEPS).
// The fox joins here. Sketch: a dock, the Chime Spire on its knoll, a few cottages, kites and blossom; the builder refines.
import type * as THREE from 'three';
import type { Planet } from './planet';
import { SKY_STEPS } from './planet';
import type { Kit, Flat } from './content';
import * as P from './props';
import * as Q from './props2';

/** Where the fox waits (river lat, lon offset): on the first island, a little below the dock. Props keep clear of it. */
export const FOX_SPOT = { lat: 36, lon: 9 } as const;
/** The Chime Spire, the landmark: a knoll on the second island with a windmill and a frame of wind chimes. */
export const SPIRE = { lat: 64, lon: 26 } as const;

/** Height of the island top beside the river at a latitude (the river steps down island by island). */
const topAt = (p: Planet, lat: number) => p.bedAt(p.tAtLat(lat)) + p.cfg.waterDepth + 0.6;
const latOfT = (p: Planet, t: number) => p.cfg.riverStartLat + t * (179.5 - p.cfg.riverStartLat);

export function prepareSky(p: Planet, f: Flat) {
  // the edge pad, level with the last island
  f(176, 0, 9, topAt(p, 176) + 0.2, 6);
  // the spire's knoll stands a little above its island
  f(SPIRE.lat, SPIRE.lon, 7, topAt(p, SPIRE.lat) + 1.6, 6);
  // a cottage green on the first island, across the river from the dock
  f(28, -20, 7, topAt(p, 28) + 0.1, 6);
  // gaps in the first island down to the cloud, so the very first look shows an edge and the cloud sea below
  const m = (lat: number, metres: number) => metres / (p.R * Math.PI / 180 * Math.sin(lat * Math.PI / 180));
  f(24, m(24, 19), 7, 0.6, 3);
  f(44, m(44, 20), 8, 0.6, 3);
  f(48, -m(48, 21), 8, 0.6, 3);
}

export function populateSky(k: Kit) {
  const { p, c, put, npc, lm, scatter } = k;
  const ground = (lat: number, lon: number) => p.height(p.dirRiver(lat, lon));
  const fox = p.dirRiver(FOX_SPOT.lat, FOX_SPOT.lon);
  const clear = (lat: number, lon: number) => fox.angleTo(p.dirRiver(lat, lon)) * p.R > 6;
  const onIsland = (lat: number, lon: number) => ground(lat, lon) > 3 && clear(lat, lon);
  const onCloud = (lat: number, lon: number) => ground(lat, lon) < 1.4;

  // The Chime Spire: a white windmill turning in the high wind, a frame of chimes, streamers to the ground.
  const mill = put(Q.windmill(), SPIRE.lat, SPIRE.lon, 0, 'river');
  mill.scale.setScalar(1.5);
  put(P.chimes(), SPIRE.lat + 3, SPIRE.lon - 4, 0, 'river');
  c.animate.push((dt) => { (mill.userData.hub as THREE.Object3D).rotation.z += dt * 1.6; });
  lm('The Chime Spire', SPIRE.lat, SPIRE.lon, 'tower');

  // A few cottages for the people who keep the islands, across the river from the dock.
  put(Q.cottage({ wall: '#f4efe4', roof: '#6a9ac8', flowers: '#f2b8c8' }), 28, -22, 0, 'river');
  put(Q.cottage({ wall: '#f2e8d8', roof: '#e8a868', w: 3.2, d: 3 }), 33, -17, 0, 'river');
  put(Q.laundry(4), 25, -14, 0, 'river');
  lm('The shepherds of the wind', 29, -20, 'hut');

  // Kites on long strings over the islands, and wind chimes in the blossom.
  for (const [lat, lon] of [[48, -22], [92, 24], [128, -18]] as const) {
    if (ground(lat, lon) < 3) continue;
    const kite = Q.torKite(); kite.scale.setScalar(1.6);
    put(kite, lat, lon, 9 + Math.sin(lat) * 2);
    c.animate.push((dt, t) => { kite.rotation.z = Math.sin(t * 1.3 + lat) * 0.25; });
  }
  scatter(26, () => Q.blossomTree(3.6 + P.rand() * 1.6), [10, 170], 8, onIsland);
  scatter(5, () => Q.treeChimes(), [20, 160], 9, onIsland);
  scatter(40, () => P.cloudWisp(), [6, 174], 10, onCloud);

  // Where the river pours from one island onto the next, a bank of spray.
  for (const [ts] of SKY_STEPS) {
    const lat = latOfT(p, ts) + 1.2;
    for (const side of [-1, 1]) put(P.cloudWisp(), lat, side * 5, -0.6, 'river');
  }

  npc('tamsin', SPIRE.lat - 4, SPIRE.lon - 10);
  c.refs.spire = mill;
}
