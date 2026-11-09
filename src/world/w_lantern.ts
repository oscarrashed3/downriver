// World 6, Lantern Town (night). The last world: a festival town where the river ends in canals and a harbour.
// Canals and little bridges, stacked houses, paper lanterns strung everywhere, lantern boats on the water, warm windows,
// and the home light (the lighthouse seen blinking far below the clouds in the opening) at the harbour mouth.
// Sketch: a dock, the canals and harbour (planet.ts lanternGround), houses, lantern strings and boats; the builder refines.
import * as THREE from 'three';
import type { Planet } from './planet';
import { LANTERN_CANALS, LANTERN_HARBOUR_LAT, lanternCanalLon } from './planet';
import type { Kit, Flat } from './content';
import { makeWaterMaterial } from './water';
import * as P from './props';
import * as Q from './props2';
import { addOutlines } from '../render/paint';

/** The home light: the lighthouse on the harbour's rim, at the river's very end (river lat, lon offset). */
export const HOME_LIGHT = { lat: 159, lon: 52 } as const;
/** The canals and harbour fill with water from this latitude down to the south pole. */
const WATER_FROM = 106;

const PAPER = ['#ffb060', '#ff8a6a', '#ffd27a', '#f6a0b8'];
/** One glowing paper material per colour, shared by every lantern in town. */
const glowMats = new Map<string, THREE.MeshToonMaterial>();
const glow = (c: string) => { let m = glowMats.get(c); if (!m) { m = P.toon(c, c, 1.6); glowMats.set(c, m); } return m; };

/** A soft pool of warm light on the ground under a lamp (no real light: it is painted on, so it costs nothing). */
const poolMat = new THREE.MeshBasicMaterial({ color: '#ffb860', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
const poolGeo = (() => {
  // brighter in the middle: a disc whose vertex colours fade to black at the rim (additive, so black adds nothing)
  const g = new THREE.CircleGeometry(1, 24);
  const col: number[] = [];
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); const k = Math.pow(1 - Math.min(1, r), 1.6); col.push(k, k, k); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.rotateX(-Math.PI / 2);
  return g;
})();
poolMat.vertexColors = true;
export function lightPool(r = 3): THREE.Mesh {
  const m = new THREE.Mesh(poolGeo, poolMat);
  m.scale.set(r, 1, r); m.position.y = 0.2; m.renderOrder = 2; m.userData.noOutline = true;
  return m;
}

/** A welcome gate at the landing: two red posts, a curved beam, and lanterns hanging from it. */
export function lanternGate(w = 4.2): THREE.Group {
  const g = new THREE.Group();
  const red = P.toon('#b8443a'), dark = P.toon('#3a2a30');
  for (const x of [-w / 2, w / 2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.6, 8), red); post.position.set(x, 1.8, 0); g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 0.3, 0.4), dark); beam.position.y = 3.75; g.add(beam);
  const beam2 = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.22, 0.3), red); beam2.position.y = 3.2; g.add(beam2);
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), glow(PAPER[i % PAPER.length]));
    l.scale.y = 1.25; l.position.set((i - 1) * w * 0.33, 2.75, 0); l.userData.noOutline = true; g.add(l);
  }
  addOutlines(g, '#2a2030', 0.03);
  g.add(lightPool(3.2));
  return g;
}

/** A string of paper lanterns hung between two poles. */
export function lanternString(len = 6, n = 7): THREE.Group {
  const g = new THREE.Group();
  const wood = P.toon('#4a3a34');
  for (const x of [-len / 2, len / 2]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 6), wood); pole.position.set(x, 1.8, 0); g.add(pole);
  }
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(-len / 2 + t * len, 3.5 - Math.sin(t * Math.PI) * 0.7, 0)); }
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.02, 4), wood); g.add(rope);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), glow(PAPER[i % PAPER.length]));
    l.scale.y = 1.25; l.position.set(-len / 2 + t * len, 3.5 - Math.sin(t * Math.PI) * 0.7 - 0.32, 0);
    l.userData.noOutline = true; g.add(l);
  }
  addOutlines(g, '#2a2030', 0.025);
  return g;
}

/** A little boat with a paper lantern on a pole, for the harbour and the canals. */
export function lanternBoat(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), P.toon('#8a5a44'));
  hull.scale.set(0.7, 0.45, 1.6); g.add(hull);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 5), P.toon('#4a3a34')); mast.position.y = 0.7; g.add(mast);
  const l = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), glow(PAPER[Math.floor(P.rand() * PAPER.length)]));
  l.position.y = 1.45; l.scale.y = 1.25; l.userData.noOutline = true; g.add(l);
  addOutlines(g, '#2a2030', 0.025);
  return g;
}

export function prepareLantern(p: Planet, f: Flat) {
  f(HOME_LIGHT.lat, HOME_LIGHT.lon, 5, 2.4, 4);
}

export function populateLantern(k: Kit) {
  const { p, c, put, npc, lm } = k;

  // Water in the canals and the harbour: one sheet over the south of the world, showing wherever the ground is lower.
  const wr = p.waterLevelRadius() - 0.02;
  const mat = makeWaterMaterial(p.cfg.palette.water, p.cfg.palette.waterDeep, true);
  const sheet = new THREE.Mesh(new THREE.SphereGeometry(wr, 96, 24, 0, Math.PI * 2, WATER_FROM * Math.PI / 180, (180 - WATER_FROM) * Math.PI / 180), mat);
  sheet.renderOrder = 1;
  p.group.add(sheet);
  c.refs.harbourWater = sheet;
  c.animate.push((_dt, t) => { mat.uniforms.uTime.value = t; });

  // The home light at the harbour mouth.
  put(P.lighthouse(), HOME_LIGHT.lat, HOME_LIGHT.lon, 0); c.refs.lighthouse = true;
  lm('The lighthouse', HOME_LIGHT.lat, HOME_LIGHT.lon, 'tower');
  lm('The harbour', 174, 0, 'spring');

  // Houses stacked along both banks and the canals, a lamp at every door.
  const houseCols: [string, string][] = [['#f2e2c8', '#a8443a'], ['#e8d2b8', '#3f5a8a'], ['#f6eadc', '#7a4a6a'], ['#e2c8a8', '#4a6a5a']];
  let n = 0;
  for (let lat = 92; lat <= 156; lat += 7) for (const side of [-1, 1]) for (const ring of [0, 1]) {
    const off = ring === 0 ? side * 12 : side * (Math.abs(lanternCanalLon(LANTERN_CANALS[0], lat)) + 12);
    if (ring === 1 && lat < 116) continue;
    const [wall, roof] = houseCols[n++ % houseCols.length];
    const h = put(Q.cottage({ wall, roof, w: 3 + (n % 3) * 0.4, d: 3 }), lat, off, 0, 'river');
    if (n % 3 === 0) h.scale.y = 1.35; // a taller, stacked house now and then
    put(Q.lanternPost(), lat + 2.2, off - side * 3, 0, 'river').add(lightPool(2.6));
  }
  lm('The canal houses', 128, 14, 'hut');

  // Lantern strings across the lanes, bridges over the canals and the river.
  for (let lat = 96; lat <= 152; lat += 9) for (const side of [-1, 1]) put(lanternString(6), lat + 3, side * 7, 0, 'river');
  for (const lat of [100, 140]) put(Q.bridge(10, 2.2), lat, 0, -0.2);
  for (const off of LANTERN_CANALS) for (const lat of [128, 150]) put(Q.bridge(6, 1.8), lat, lanternCanalLon(off, lat), 0);

  // Lantern boats rocking on the harbour.
  const boats: { o: THREE.Object3D; ph: number; base: THREE.Vector3; up: THREE.Vector3 }[] = [];
  for (let i = 0; i < 9; i++) {
    const lat = LANTERN_HARBOUR_LAT + 4 + (i % 3) * 4, lon = -150 + i * 38;
    const d = p.dirRiver(lat, lon);
    if (p.surfaceRadius(d) > wr - 0.2) continue; // only on open water
    const o = put(lanternBoat(), lat, lon, wr - p.surfaceRadius(d) + 0.15, undefined, 0);
    boats.push({ o, ph: i * 1.7, base: o.position.clone(), up: d });
  }
  c.animate.push((_dt, t) => boats.forEach(b => b.o.position.copy(b.base).addScaledVector(b.up, Math.sin(t * 1.4 + b.ph) * 0.06)));

  // A lamplit landing at the dock, and lamps every few steps down the bank, so the first look is warm
  // and the way into town is lit.
  const metres = (lat: number, m: number) => m / (p.R * Math.PI / 180 * Math.sin(lat * Math.PI / 180));
  put(lanternString(5), 24, metres(24, 7.5), 0, 'river').add(lightPool(3.2));
  put(lanternString(5), 24, -metres(24, 7.5), 0, 'river').add(lightPool(3.2));
  for (let lat = 28; lat <= 88; lat += 6) put(Q.lanternPost(), lat, (lat % 12 ? 1 : -1) * metres(lat, 6.5), 0, 'river').add(lightPool(2.6));
  // a lamp on the dock itself, and a red gate to walk through into town
  put(Q.lanternPost(), 17, metres(17, 4.6), 0, 'river').add(lightPool(3));
  put(lanternGate(), 25, metres(25, 6.2), 0);
  // The first houses of the town, right at the landing: a little row across the river with lit windows,
  // one on this bank, and a humped bridge over to them.
  const dockRow: [number, number, string, string, number][] = [
    [22, -9.5, '#f2e2c8', '#a8443a', 1], [27, -10, '#e8d2b8', '#3f5a8a', 1.35], [32, -9.5, '#f6eadc', '#7a4a6a', 1],
    [31, 10.5, '#e2c8a8', '#4a6a5a', 1.2],
  ];
  for (const [lat, m, wall, roof, tall] of dockRow) {
    const h = put(Q.cottage({ wall, roof, w: 3.2, d: 3 }), lat, metres(lat, m), 0, 'river');
    h.scale.y = tall;
    put(Q.lanternPost(), lat - 2, metres(lat - 2, m + (m < 0 ? 2.8 : -2.8)), 0, 'river').add(lightPool(2.6));
  }
  for (const lat of [25.5, 30]) put(lanternString(6), lat, -metres(lat, 7), 0, 'river');
  put(Q.bridge(8, 2), 26, 0, -0.2);
  lm('The landing', 22, 0, 'hut');
  for (const lat of [30, 52, 74]) {
    const d = p.dirRiver(lat, 0);
    const o = put(lanternBoat(), lat, 0, p.waterLevelRadius() - p.surfaceRadius(d) + 0.1, undefined, 0);
    boats.push({ o, ph: lat, base: o.position.clone(), up: d });
  }

  npc('wren', 122, 8);
}
