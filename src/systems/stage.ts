// Staging for face-to-face moments: where Nilo stands to talk, where the camera goes, and keeping the camera out of walls.
import * as THREE from 'three';
import { pushOut2, type Solid } from '../world/collide';

/** How far apart two people stand to talk. */
export const TALK_GAP = 1.6;

/**
 * A spot TALK_GAP in front of someone, on the side Nilo is coming from if it is free,
 * otherwise the nearest free spot going round them.
 */
export function talkSpot(npcPos: THREE.Vector3, up: THREE.Vector3, from: THREE.Vector3, isFree: (p: THREE.Vector3) => boolean, gap = TALK_GAP): THREE.Vector3 {
  const dir = from.clone().sub(npcPos).projectOnPlane(up);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0).projectOnPlane(up);
  dir.normalize();
  for (const deg of [0, 30, -30, 60, -60, 90, -90, 125, -125, 180]) {
    const p = npcPos.clone().addScaledVector(dir.clone().applyAxisAngle(up, deg * Math.PI / 180), gap);
    if (isFree(p)) return p;
  }
  return npcPos.clone().addScaledVector(dir, gap);
}

export interface Shot { pos: THREE.Vector3; look: THREE.Vector3; up: THREE.Vector3 }

/**
 * A two-shot for a conversation, from just behind `near`'s shoulder and well out to one side (side +1 right, -1 left),
 * favouring the face of `far`. Both people stay in frame and apart, with their faces in the upper half of the
 * picture so the dialogue box never covers them. Swap near and far (and the side) when the other one speaks.
 */
export function overShoulder(near: THREE.Vector3, far: THREE.Vector3, up: THREE.Vector3, side = 1, wide = 1, lift = 0): Shot {
  const flat = far.clone().sub(near).projectOnPlane(up);
  const d = Math.max(0.8, flat.length());
  const across = flat.normalize();
  const right = new THREE.Vector3().crossVectors(across, up).normalize();
  const mid = near.clone().lerp(far, 0.5);
  const pos = mid.clone().addScaledVector(right, side * (2.9 + d * 0.7) * wide).addScaledVector(across, -(d * 0.5 + 0.45) * (lift > 0 ? 1.3 : 1)).addScaledVector(up, 0.75 + lift);
  const look = near.clone().lerp(far, 0.62).addScaledVector(up, -0.8 - lift * 0.5);
  return { pos, look, up: up.clone() };
}

/**
 * Walk along the line from `a` (what the camera looks at) to `b` (the camera) and return the clear fraction:
 * 1 when nothing solid stands in the way, less when a house, tree trunk or rock is in between.
 */
export function segmentClear(solids: Solid[], a: THREE.Vector3, b: THREE.Vector3, center: THREE.Vector3, steps = 20, pad = true): number {
  const near = solids.filter(s => {
    if ((s.on && !s.on()) || !s.obj.visible) return false;
    const r = (pad ? s.camPad ?? 0 : 0) + ((s.shape.kind === 'circle' ? s.shape.r : Math.hypot(s.shape.hw, s.shape.hd)) + (s.off ? Math.hypot(s.off[0], s.off[1]) : 0)) * s.obj.scale.x + 1;
    const d = distToSegment(s.obj.position, a, b);
    return d < r;
  });
  if (!near.length) return 1;
  const p = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(), ax = new THREE.Vector3(), az = new THREE.Vector3();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    p.lerpVectors(a, b, t);
    for (const s of near) {
      const o = s.obj;
      v.subVectors(p, o.position);
      up.subVectors(o.position, center).normalize();
      const h = v.dot(up);
      if (h < -0.5 || h > s.h * o.scale.y + 0.2) continue;
      ax.set(1, 0, 0).applyQuaternion(o.quaternion).projectOnPlane(up).normalize();
      az.set(0, 0, 1).applyQuaternion(o.quaternion).projectOnPlane(up).normalize();
      const k = o.scale.x;
      if (s.off) v.addScaledVector(ax, -s.off[0] * k).addScaledVector(az, -s.off[1] * k);
      const shape = s.shape.kind === 'circle' ? { kind: 'circle' as const, r: s.shape.r * k } : { kind: 'box' as const, hw: s.shape.hw * k, hd: s.shape.hd * o.scale.z };
      if (pushOut2(v.dot(ax), v.dot(az), 0.45 + (pad ? s.camPad ?? 0 : 0), shape)) return (i - 1) / steps;
    }
  }
  return 1;
}

function distToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq())));
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}

/** The ways a talk can be framed, best first: level and close, then higher and wider when something is in the way. */
export const SHOT_VARIANTS: [number, number][] = [[1, 0], [0.75, 1.3], [0.95, 2.4]];

/**
 * Pick the side and variant whose two shots (on them, and back on Nilo) see both faces with nothing solid in between.
 * Returns the first fully clear one, otherwise the clearest.
 */
export function chooseShot(niloEye: THREE.Vector3, npcEye: THREE.Vector3, up: THREE.Vector3, clear: (a: THREE.Vector3, b: THREE.Vector3) => number) {
  let best = { side: 1, wide: 1, lift: 0, score: -1 };
  for (const [wide, lift] of SHOT_VARIANTS) for (const side of [1, -1]) {
    const a = overShoulder(niloEye, npcEye, up, side, wide, lift), b = overShoulder(npcEye, niloEye, up, -side, wide, lift);
    const score = Math.min(clear(a.look, a.pos), clear(b.look, b.pos), clear(npcEye, a.pos), clear(niloEye, a.pos), clear(niloEye, b.pos), clear(npcEye, b.pos));
    if (score >= 0.999) return { side, wide, lift, score };
    if (score > best.score) best = { side, wide, lift, score };
  }
  return best;
}
