import * as THREE from 'three';
import type { Planet } from '../planet';

// World 3's map, around Old Amble: where Amble stands and which way it faces, and where the lake, the far hill
// town, the snowy mountains and the Sea lie from there (metres forward and to Amble's left, over the curve).

/** Amble's pad: latitude and longitude offset from the river; Amble faces downriver (south). */
export const AMBLE_AT = { lat: 34, lon: 22 } as const;

/** Amble's frame on the planet: up, forward (downriver) and left (creature +X). */
export function townFrame(p: Planet) {
  const A = p.dirRiver(AMBLE_AT.lat, AMBLE_AT.lon);
  const F = p.dirRiver(AMBLE_AT.lat + 1, AMBLE_AT.lon).sub(A).projectOnPlane(A).normalize();
  const L = new THREE.Vector3().crossVectors(A, F).normalize();
  return { A, F, L };
}

/** The direction fwd metres ahead of Amble and left metres to its left, walking over the curve of the world. */
export function townDir(p: Planet, fwd: number, left: number, out = new THREE.Vector3()) {
  const { A, F, L } = townFrame(p);
  const t = F.multiplyScalar(fwd).addScaledVector(L, left);
  const a = t.length() / p.R;
  if (a < 1e-6) return out.copy(A);
  return out.copy(A).multiplyScalar(Math.cos(a)).addScaledVector(t.normalize(), Math.sin(a)).normalize();
}

/** The places of the meadow world (metres forward, metres left of Amble). The river runs past ~26 m to the left,
 * from behind to ahead-left; the hill town and the mountains lie across it, ahead and to the left (so from the
 * meadow off Amble's right they stand past its head, as in Oscar's picture), the lake on the near side of the
 * river ahead, and the Sea far behind on the right. */
export const PLACES = {
  lake: [80, -62], hill: [40, 85], mts: [24, 148], sea: [-60, -180], ford: [-19, 18],
} as const;
