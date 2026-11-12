import * as THREE from 'three';
import type { Planet } from '../planet';
import { smoothstep } from '../noise';
import { townFrame } from './meadow';

// World 3's long grass: thick and golden in the meadow round Old Amble, thinning out over the far hills (the
// planet is big here, and the grass is only needed where you walk). Daisies and lupins all through it.

/** Grass density per terrain vertex: the planet's own weights, fading out beyond ~110 m from Amble. */
export function townGrassWeights(p: Planet): Float32Array {
  const w = p.grassW!.slice();
  const { A } = townFrame(p);
  const pos = (p.terrain.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
  const d = new THREE.Vector3();
  const ocean = p.cfg.ocean ?? 0;
  const h = (p.terrain.geometry as THREE.BufferGeometry).userData.heights as Float32Array;
  for (let i = 0; i < w.length; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const dist = Math.acos(Math.min(1, d.dot(A))) * p.R;
    w[i] *= smoothstep(150, 95, dist) * smoothstep(ocean + 0.2, ocean + 0.8, h[i]);
  }
  return w;
}

/** Flower density: daisies and lupins all over the meadow, thickest in drifts. */
export function townFlowers(p: Planet, d: THREE.Vector3) {
  const n = p.noise.n3(d.x * 14 + 3, d.y * 14, d.z * 14);
  return 0.35 + 0.65 * smoothstep(-0.1, 0.5, n);
}

/** White daisies (most), lupin blues and purples, a few buttercups. */
export const TOWN_FLOWERS = [[1, 1, 0.96], [1, 1, 0.96], [1, 1, 0.94], [0.62, 0.56, 0.95], [0.5, 0.56, 1.0], [0.72, 0.5, 0.9], [1, 0.88, 0.36]];
