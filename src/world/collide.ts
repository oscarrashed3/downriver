// Solid things in the world: Nilo slides along them instead of walking through.
// Each solid stands on the planet surface; collisions are worked out in the flat ground plane under it.
import * as THREE from 'three';

/** A solid seen from above, in its own flat frame: a circle of radius r, or a box hw x hd (half sizes). */
export type Shape2 = { kind: 'circle'; r: number } | { kind: 'box'; hw: number; hd: number };

/**
 * Push a round body (radius rad) at (x, y) out of a shape centered at the origin.
 * Returns the push to apply, or null when they do not touch.
 */
export function pushOut2(x: number, y: number, rad: number, s: Shape2): [number, number] | null {
  if (s.kind === 'circle') {
    const d = Math.hypot(x, y), min = s.r + rad;
    if (d >= min) return null;
    if (d < 1e-6) return [min, 0];
    return [x / d * (min - d), y / d * (min - d)];
  }
  const cx = Math.max(-s.hw, Math.min(s.hw, x)), cy = Math.max(-s.hd, Math.min(s.hd, y));
  const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
  if (d > 1e-6) return d >= rad ? null : [dx / d * (rad - d), dy / d * (rad - d)];
  // the center is inside the box: out through the nearest side
  const ex = s.hw - Math.abs(x) + rad, ey = s.hd - Math.abs(y) + rad;
  return ex < ey ? [Math.sign(x || 1) * ex, 0] : [0, Math.sign(y || 1) * ey];
}

export interface Solid {
  /** The object it belongs to; its position and turn are read live, so things that move (Hollo) stay solid. */
  obj: THREE.Object3D;
  shape: Shape2;
  /** How tall it is: you can jump onto anything lower than your feet. */
  h: number;
  /** Off for things that come and go (the long-night fire), on otherwise. */
  on?: () => boolean;
  id?: string;
  /** Where the shape sits in the object's own ground plane, if not at its origin (x, z; scaled with the object). */
  off?: [number, number];
  /** Only stops the camera, not Nilo (the bridge, which you walk on). */
  camOnly?: boolean;
  /** Extra room the camera keeps from it (Hollo's fur reaches well past where he is solid). */
  camPad?: number;
}

/** A walkable deck, like the bridge: an arch along the object's local x axis. */
export interface Deck { obj: THREE.Object3D; span: number; width: number; top: (x: number) => number }

const v = new THREE.Vector3(), ax = new THREE.Vector3(), az = new THREE.Vector3(), up = new THREE.Vector3();

/** Move pos out of every solid near it. center: the planet center. Returns true if anything pushed. */
export function resolveSolids(solids: Solid[], pos: THREE.Vector3, center: THREE.Vector3, rad = 0.38): boolean {
  let hit = false;
  for (const s of solids) {
    if (s.camOnly || (s.on && !s.on())) continue;
    const o = s.obj;
    if (!o.visible) continue;
    v.subVectors(pos, o.position);
    const reach = ((s.shape.kind === 'circle' ? s.shape.r : Math.hypot(s.shape.hw, s.shape.hd)) + (s.off ? Math.hypot(s.off[0], s.off[1]) : 0)) * o.scale.x + rad + 0.5;
    if (v.lengthSq() > reach * reach + 9) continue;
    up.subVectors(o.position, center).normalize();
    const height = v.dot(up);
    if (height > s.h * o.scale.y || height < -2) continue;
    ax.set(1, 0, 0).applyQuaternion(o.quaternion).projectOnPlane(up).normalize();
    az.set(0, 0, 1).applyQuaternion(o.quaternion).projectOnPlane(up).normalize();
    const k = o.scale.x;
    if (s.off) v.addScaledVector(ax, -s.off[0] * k).addScaledVector(az, -s.off[1] * k);
    const sh: Shape2 = s.shape.kind === 'circle' ? { kind: 'circle', r: s.shape.r * k } : { kind: 'box', hw: s.shape.hw * k, hd: s.shape.hd * o.scale.z };
    const p = pushOut2(v.dot(ax), v.dot(az), rad, sh);
    if (!p) continue;
    pos.addScaledVector(ax, p[0]).addScaledVector(az, p[1]);
    hit = true;
  }
  return hit;
}

/** If pos is on (or just below the edge of) a deck, where its top is: the height above pos to lift by, and its sideways limit. */
export function deckUnder(d: Deck, pos: THREE.Vector3, center: THREE.Vector3): { lift: number; x: number; z: number; up: THREE.Vector3; side: THREE.Vector3 } | null {
  const o = d.obj;
  v.subVectors(pos, o.position);
  up.subVectors(o.position, center).normalize();
  ax.set(1, 0, 0).applyQuaternion(o.quaternion).projectOnPlane(up).normalize();
  az.set(0, 0, 1).applyQuaternion(o.quaternion).projectOnPlane(up).normalize();
  const x = v.dot(ax), z = v.dot(az);
  if (Math.abs(x) > d.span / 2 || Math.abs(z) > d.width / 2 + 0.6) return null;
  return { lift: d.top(x) - v.dot(up), x, z, up: up.clone(), side: az.clone() };
}
