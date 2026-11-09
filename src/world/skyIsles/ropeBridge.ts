// Rope bridges between the Sky Isles: a sagging walk of weathered planks hung from two hand ropes, with a lower
// rope and hangers, and stout posts at each lip. Walkable: it comes with a Deck (collide.ts) whose top follows
// the planks exactly.
import * as THREE from 'three';
import type { Planet } from '../planet';
import type { Deck } from '../collide';
import type { Isle } from './terrain';
import { Kit, T, ropeGeo, boxM, WOOD_TILE } from './sailtownKit';
import { SAIL } from './sailtown';
import { skyRng } from './rand';

export interface RopeBridge {
  /** The bridge in planet-local space (add under the world's root, which sits at the planet's centre). */
  group: THREE.Group;
  /** The walkable deck; its obj is in world space (add it to the scene). */
  deck: Deck;
  /** Planet-local ends, on each island's top. */
  ends: [THREE.Vector3, THREE.Vector3];
}

/** A point `inset` metres in from island a's lip, on the line toward island b; and the ground there. */
function lipToward(p: Planet, a: Isle, b: Isle, inset: number) {
  const l = a.toLocal(b.up);
  const ang = Math.atan2(l.z, l.x);
  const r = a.shape.outline(ang) - inset;
  const d = a.dirAt(Math.cos(ang) * r, Math.sin(ang) * r);
  return d.multiplyScalar(p.R + p.height(d));
}

export function ropeBridge(p: Planet, a: Isle, b: Isle, width: number, sag: number, seed: number): RopeBridge {
  const rnd = skyRng(seed);
  const PA = lipToward(p, a, b, 1.1), PB = lipToward(p, b, a, 1.1);
  const up = PA.clone().add(PB).normalize();
  const xAxis = PB.clone().sub(PA).projectOnPlane(up).normalize();
  const zAxis = new THREE.Vector3().crossVectors(xAxis, up).normalize();
  const pos = up.clone().multiplyScalar((PA.length() + PB.length()) / 2);
  // centre it between the ends along the span
  const xa0 = PA.clone().sub(pos).dot(xAxis), xb0 = PB.clone().sub(pos).dot(xAxis);
  pos.addScaledVector(xAxis, (xa0 + xb0) / 2);
  const loc = (P: THREE.Vector3) => { const v = P.clone().sub(pos); return { x: v.dot(xAxis), y: v.dot(up) }; };
  const A = loc(PA), B = loc(PB);
  const span = B.x - A.x;
  const top = (x: number) => {
    const k = (x - A.x) / span;
    return A.y + (B.y - A.y) * k - sag * (1 - Math.pow(2 * k - 1, 2));
  };
  const kit = new Kit();
  const W = width;
  // planks, each a little crooked and its own shade
  const wood = new THREE.Color(SAIL.plank), dark = new THREE.Color(SAIL.weathered);
  for (let x = A.x + 0.2; x < B.x - 0.1; x += 0.34) {
    const y = top(x), y2 = top(x + 0.1);
    const c = wood.clone().lerp(dark, rnd() * 0.6).multiplyScalar(0.85 + rnd() * 0.25);
    kit.add(boxM(0.27, 0.07, W + (rnd() - 0.5) * 0.08, WOOD_TILE), 'wood', c, T(x, y - 0.035, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.06, Math.atan2(y2 - y, 0.1)));
  }
  // two stringers under the planks
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) { const x = A.x + span * i / 24; pts.push(new THREE.Vector3(x, top(x) - 0.08, s * (W / 2 - 0.12))); }
    kit.add(ropeGeo(pts, 0.05, 5), 'wood', dark, undefined);
  }
  // hand ropes and lower ropes, with hangers down to the deck
  const rope = new THREE.Color('#c2a272');
  const hand = (x: number) => top(x) + 1.0 + 0.35 * (1 - Math.pow(2 * ((x - A.x) / span) - 1, 2)) * 0.4;
  for (const s of [-1, 1]) {
    for (const [hy, rad] of [[0, 0.034], [-0.5, 0.024]] as const) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 28; i++) { const x = A.x - 0.25 + (span + 0.5) * i / 28; pts.push(new THREE.Vector3(x, hand(x) + hy, s * (W / 2 + 0.04))); }
      kit.add(ropeGeo(pts, rad, 5), 'plain', rope, undefined);
    }
    for (let x = A.x + 0.6; x < B.x - 0.4; x += 0.68) {
      kit.add(ropeGeo([new THREE.Vector3(x, top(x), s * (W / 2 + 0.03)), new THREE.Vector3(x, hand(x), s * (W / 2 + 0.04))], 0.014, 3), 'plain', rope, undefined);
    }
    // the posts at each end, sunk into the ground
    for (const [x, y] of [[A.x - 0.25, A.y], [B.x + 0.25, B.y]]) {
      kit.add(boxM(0.16, 1.9, 0.16, WOOD_TILE, true), 'wood', dark, T(x, y + 0.55, s * (W / 2 + 0.05), (rnd() - 0.5) * 0.06, rnd(), (rnd() - 0.5) * 0.06));
      kit.add(new THREE.SphereGeometry(0.1, 6, 4), 'wood', dark, T(x, y + 1.52, s * (W / 2 + 0.05)));
    }
  }
  const g = new THREE.Group(); g.name = 'ropeBridge';
  kit.build(g, { inkWidth: 0.018 });
  g.position.copy(pos);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, up, zAxis));
  const obj = new THREE.Object3D();
  obj.position.copy(pos).add(p.center);
  obj.quaternion.copy(g.quaternion);
  const deck: Deck = { obj, span: span + 0.4, width: W, top: (x: number) => top(Math.max(A.x, Math.min(B.x, x))) };
  return { group: g, deck, ends: [PA, PB] };
}
