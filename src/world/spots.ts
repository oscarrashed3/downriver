// Where a person can stand: on dry, gentle ground, clear of the water, walls, rails and trees.
import * as THREE from 'three';
import type { Planet } from './planet';
import { skySpotProblem } from './skyIsles/terrain';

export interface Avoid { pos: THREE.Vector3; r: number }

/** The widest the river ever runs (it widens as the valley heals). */
const MAX_FLOW = 1.6;

/** Why a spot is no good, or null when someone can stand there. */
export function spotProblem(p: Planet, d: THREE.Vector3, avoid: Avoid[] = []): string | null {
  const w = p.surfacePoint(d);
  if (p.riverNearest(d).dist < p.cfg.riverWidth * MAX_FLOW + 1.0) return 'water';
  if (p.cfg.shape === 'sky') { const bad = skySpotProblem(p, d); if (bad) return bad; }
  if (p.slope(d) > 0.5) return 'steep';
  for (const s of p.solids) {
    const r = s.shape.kind === 'circle' ? s.shape.r : Math.hypot(s.shape.hw, s.shape.hd);
    if (s.obj.position.distanceTo(w) < r + 0.6) return 'solid';
  }
  for (const a of avoid) if (a.pos.distanceTo(w) < a.r) return 'avoid';
  return null;
}

/** The nearest good spot to d, searching outward in rings; d itself when it is already fine. */
export function safeSpot(p: Planet, d: THREE.Vector3, avoid: Avoid[] = [], maxM = 14): THREE.Vector3 {
  if (!spotProblem(p, d, avoid)) return d.clone();
  const t1 = new THREE.Vector3(0, 1, 0).cross(d); if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0).cross(d);
  t1.normalize(); const t2 = new THREE.Vector3().crossVectors(d, t1).normalize();
  for (let m = 0.5; m <= maxM; m += 0.5) {
    const n = Math.max(8, Math.round(m * 6));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const c = d.clone().addScaledVector(t1, Math.cos(a) * m / p.R).addScaledVector(t2, Math.sin(a) * m / p.R).normalize();
      if (!spotProblem(p, c, avoid)) return c;
    }
  }
  return d.clone();
}
