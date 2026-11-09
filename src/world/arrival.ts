import * as THREE from 'three';
import type { Planet } from './planet';

/**
 * A point at the given latitude about `metres` from the river's centre line.
 * A longitude offset shrinks by sin(lat), so convert with that, then step outward
 * until the real distance to the (meandering) river is at least `metres`.
 */
export function besideRiver(p: Planet, lat: number, metres: number): THREE.Vector3 {
  const degPerM = 1 / (p.R * Math.PI / 180 * Math.max(0.05, Math.sin(lat * Math.PI / 180)));
  let off = metres * degPerM;
  const d = p.dirRiver(lat, off);
  for (let i = 0; i < 40 && p.riverNearest(d).dist < metres; i++) { off += 0.25 * degPerM; p.dirRiver(lat, off, d); }
  return d;
}

/** Where the dock stands in every world after the first. */
export const DOCK_LAT = 18;

/** A safe place to arrive in a world after the first: on the bank beside the dock, out of the water. */
export function laterArrivalDir(p: Planet): THREE.Vector3 {
  // Far enough from the channel to stand on dry bank, not in the water.
  const w = p.cfg.riverWidth * 1.15 + 0.6;
  return besideRiver(p, 20, Math.max(p.cfg.riverWidth + 3.2, w + 1.6));
}

/** Where the dock stands: on the bank at DOCK_LAT, its end over the water. */
export function dockDir(p: Planet): THREE.Vector3 {
  return besideRiver(p, DOCK_LAT, p.cfg.riverWidth + 1.4);
}
