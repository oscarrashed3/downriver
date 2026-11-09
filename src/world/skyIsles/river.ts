// The Sky Isles' river surface: one strip down the whole river like every world's (planet.buildRiverGeometry),
// riding planet.bedAt, so it runs level across each island top, slopes down each cascade, and crosses the gaps in
// the aqueducts' channels. It never runs wider than an aqueduct's channel, however much the river swells.
import * as THREE from 'three';
import type { Planet } from '../planet';
import { AQ_CHANNEL } from './layout';

export function buildSkyRiver(p: Planet): THREE.BufferGeometry {
  const across = 7;
  const P = p.path;
  const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
  const tan = new THREE.Vector3(), side = new THREE.Vector3(), d = new THREE.Vector3();
  let along = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    tan.subVectors(b, a).normalize();
    side.crossVectors(P[i], tan).normalize();
    const t = i / (P.length - 1);
    const w = Math.min(AQ_CHANNEL - 0.25, p.cfg.riverWidth * p.flowWidth) * (t < 0.03 ? Math.max(0.15, t / 0.03) : 1);
    if (i > 0) along += P[i].distanceTo(P[i - 1]) * p.R;
    for (let j = 0; j < across; j++) {
      const s = j / (across - 1) * 2 - 1;
      d.copy(P[i]).addScaledVector(side, (s * w) / p.R).normalize();
      const r = p.R + p.bedAt(t) + p.cfg.waterDepth;
      verts.push(d.x * r, d.y * r, d.z * r);
      uvs.push(s, along);
    }
  }
  for (let i = 0; i < P.length - 1; i++) for (let j = 0; j < across - 1; j++) {
    const a = i * across + j, b = a + 1, c = a + across, e = c + 1;
    idx.push(a, c, b, b, c, e);
  }
  p.riverLength = along;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
