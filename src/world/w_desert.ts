// World 5, The Painted Desert (sunset). Not plain yellow dunes: striped dunes and mesas in pink, coral, lilac, violet
// and turquoise bands (planet.ts DESERT_BANDS), a white salt flat that mirrors the sky, glassy crystals, long warm dusk.
// Sketch: a dock, Sahra the wandering town, the salt mirror (the landmark), crystals and arches; the builder refines.
import * as THREE from 'three';
import type { Planet } from './planet';
import type { Kit, Flat } from './content';
import * as P from './props';
import { addOutlines } from '../render/paint';

/** The salt flat: (lat, lon offset), radius in metres, and its height. */
export const SALT = { lat: 37, lon: -31, r: 12, h: 1.5 } as const;
/** Sahra, the wandering town on wheels, on the other bank. */
export const SAHRA = { lat: 96, lon: 26 } as const;

const CRYSTAL = ['#c8a2f0', '#7fe0d8', '#f6a8c8', '#a8c8ff'];

/** A cluster of glassy crystals leaning out of the sand. */
export function crystals(): THREE.Group {
  const g = new THREE.Group();
  const col = CRYSTAL[Math.floor(P.rand() * CRYSTAL.length)];
  const mat = P.toon(col, col, 0.35);
  const n = 3 + Math.floor(P.rand() * 4);
  for (let i = 0; i < n; i++) {
    const h = 0.8 + P.rand() * 2.2;
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mat);
    c.scale.set(0.35 + P.rand() * 0.2, h, 0.35 + P.rand() * 0.2);
    c.position.set((P.rand() - 0.5) * 1.4, h * 0.6, (P.rand() - 0.5) * 1.4);
    c.rotation.set((P.rand() - 0.5) * 0.7, P.rand() * 3, (P.rand() - 0.5) * 0.7);
    c.castShadow = true;
    g.add(c);
  }
  addOutlines(g, '#3b2a30', 0.03);
  return g;
}

/** A painted sandstone arch, banded like the mesas. */
export function paintedArch(): THREE.Group {
  const g = new THREE.Group();
  const bands = ['#f08c78', '#f6b8b0', '#c8a2e0'];
  for (const x of [-4, 4]) for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.7, 2), P.toon(bands[i])); b.position.set(x, 1.35 + i * 2.7, 0); g.add(b);
  }
  const top = new THREE.Mesh(new THREE.TorusGeometry(4, 0.95, 6, 16, Math.PI), P.toon('#8a6ac0')); top.position.y = 8; g.add(top);
  addOutlines(g, '#3b2a30', 0.05);
  return g;
}

export function prepareDesert(p: Planet, f: Flat) {
  f(176, 0, 9, 1.5, 6);
  f(SALT.lat, SALT.lon, SALT.r, SALT.h, 10);
  f(SAHRA.lat, SAHRA.lon, 12, 1.6, 8);
  // the salt is white, whatever band it lies in
  p.tints.push({ dir: p.dirRiver(SALT.lat, SALT.lon), r: SALT.r - 1, color: new THREE.Color('#fbf6f2'), k: 1 });
}

export function populateDesert(k: Kit) {
  const { p, c, put, npc, lm, scatter } = k;
  // The salt mirror: a thin glaze over the flat that holds the sky's colours.
  const dir = p.dirRiver(SALT.lat, SALT.lon);
  const ang = (SALT.r - 2) / p.R;
  const glaze = new THREE.Mesh(
    new THREE.SphereGeometry(p.R + SALT.h + 0.04, 48, 4, 0, Math.PI * 2, 0, ang),
    new THREE.MeshBasicMaterial({ color: p.cfg.palette.skyHorizon, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  glaze.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  glaze.renderOrder = 1;
  p.group.add(glaze);
  c.refs.saltMirror = glaze;
  lm('The salt mirror', SALT.lat, SALT.lon, 'spring');

  const town = put(P.windTown(), SAHRA.lat, SAHRA.lon, 0, 'river'); c.refs.town = town;
  c.animate.push((dt) => (town.userData.blades as THREE.Group[]).forEach(b => (b.rotation.z += dt * 1.2)));
  lm('Sahra, the wandering town', SAHRA.lat, SAHRA.lon, 'hut');

  const away = (lat: number, lon: number) => p.dirRiver(lat, lon).angleTo(dir) * p.R > SALT.r + 3;
  scatter(30, () => crystals(), [10, 172], 7, away);
  scatter(8, () => paintedArch(), [20, 160], 14, away);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const dLat = (SALT.r + 2) / (p.R * Math.PI / 180);
    put(crystals(), SALT.lat + Math.cos(a) * dLat, SALT.lon + Math.sin(a) * dLat / Math.sin(SALT.lat * Math.PI / 180), 0);
  }

  // Crystals by the landing, so the first look already glitters.
  for (const [lat, m] of [[24, 8.5], [29, -6.5], [33, 9]] as const) {
    put(crystals(), lat, m / (p.R * Math.PI / 180 * Math.sin(lat * Math.PI / 180)), 0);
  }

  npc('sefa', SAHRA.lat - 6, SAHRA.lon - 12);
}
