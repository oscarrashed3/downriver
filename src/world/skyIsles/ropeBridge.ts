// Rope bridges between the Sky Isles: a broad walk of weathered planks hung from two hand ropes, with a lower rope
// and hangers. Each end runs on past the lip as a landing of planks laid on the meadow, over a stone sill sunk into
// the cliff and between two stout posts set deep in the ground, so the walk onto it is flat, with no gap and no
// step. Walkable: it comes with a Deck (collide.ts) whose top follows the planks exactly, and whose rails (the
// hand ropes over the gap) keep you on it; on the landings you can step off sideways onto the grass.
import * as THREE from 'three';
import type { Planet } from '../planet';
import type { Deck } from '../collide';
import type { Isle } from './terrain';
import { Kit, T, ropeGeo, boxM, WOOD_TILE, STONE_TILE } from './sailtownKit';
import { SAIL } from './sailtown';
import { skyRng } from './rand';

export interface RopeBridge {
  /** The bridge in planet-local space (add under the world's root, which sits at the planet's centre). */
  group: THREE.Group;
  /** The walkable deck; its obj is in world space (add it to the scene). */
  deck: Deck;
  /** Planet-local ends (the far ends of the landings), on each island's top. */
  ends: [THREE.Vector3, THREE.Vector3];
  /** Planet-local points where the bridge leaves each lip. */
  lips: [THREE.Vector3, THREE.Vector3];
}

/** The point on island a's lip on the line toward island b (planet-local, at the ground). */
export function lipToward(p: Planet, a: Isle, b: Isle, inset = 0) {
  const l = a.toLocal(b.up);
  const ang = Math.atan2(l.z, l.x);
  const r = a.shape.outline(ang) - inset;
  const d = a.dirAt(Math.cos(ang) * r, Math.sin(ang) * r);
  return d.multiplyScalar(p.R + p.height(d));
}

/** Local (x, z) on each island of a bridge's lip and landing, for keeping trees and flowers off them. */
export function bridgeFootprint(a: Isle, b: Isle, landing = 2.6): { isle: Isle; pts: { x: number; z: number }[] }[] {
  const out: { isle: Isle; pts: { x: number; z: number }[] }[] = [];
  for (const [i, j] of [[a, b], [b, a]] as const) {
    const l = i.toLocal(j.up);
    const ang = Math.atan2(l.z, l.x), rim = i.shape.outline(ang);
    const pts: { x: number; z: number }[] = [];
    for (let k = -1; k <= Math.min(landing + 2.5, rim * 0.8); k += 0.8) pts.push({ x: Math.cos(ang) * (rim - k), z: Math.sin(ang) * (rim - k) });
    out.push({ isle: i, pts });
  }
  return out;
}

export function ropeBridge(p: Planet, a: Isle, b: Isle, width: number, sag: number, seed: number): RopeBridge {
  const rnd = skyRng(seed);
  const LA = lipToward(p, a, b), LB = lipToward(p, b, a);
  const up = LA.clone().add(LB).normalize();
  const xAxis = new THREE.Vector3(), zAxis = new THREE.Vector3();
  const base = new THREE.Vector3();
  const frame = () => {
    xAxis.copy(LB).sub(LA).projectOnPlane(up).normalize();
    zAxis.crossVectors(xAxis, up).normalize();
    base.copy(up).multiplyScalar((LA.length() + LB.length()) / 2);
  };
  frame();
  const _d = new THREE.Vector3(), _g = new THREE.Vector3();
  const flatX = (P: THREE.Vector3) => P.clone().sub(base).dot(xAxis);
  /** The ground of island `is` under the bridge's line at x (in the flat frame), or null off its top. */
  const groundY = (is: Isle, x: number, z = 0) => {
    _d.copy(base).addScaledVector(xAxis, x).addScaledVector(zAxis, z).normalize();
    const h = is.heightAt(_d);
    if (h === null) return null;
    _g.copy(_d).multiplyScalar(p.R + h);
    return _g.sub(base).dot(up);
  };
  // where the line really leaves each top (the outline sampled along the chord), and how long each landing can be
  const lipX = (is: Isle, x0: number, dir: number) => {
    let x = x0 + dir * 1.5;
    for (let k = 0; k < 120 && groundY(is, x) === null; k++) x -= dir * 0.05;
    return x;
  };
  const land = (is: Isle) => Math.min(2.6, is.def.r * 0.55);
  let xa = 0, xb = 0, x0 = 0, x1 = 0;
  // twice: the second time with the frame centred on the whole walk, so the deck's own up is the frame's up
  for (let pass = 0; pass < 2; pass++) {
    xa = lipX(a, flatX(LA), 1); xb = lipX(b, flatX(LB), -1);
    x0 = xa - land(a); x1 = xb + land(b);
    if (pass === 0) { up.copy(base).addScaledVector(xAxis, (x0 + x1) / 2).normalize(); frame(); }
  }
  // the deck: planks on the meadow over each landing, then hung between the lips with a gentle sag
  const step = 0.2;
  const xs: number[] = [], ys: number[] = [];
  const yA = (groundY(a, xa - 0.5) ?? 0) + 0.05, yB = (groundY(b, xb + 0.5) ?? 0) + 0.05;
  const hung = (x: number) => {
    const k = (x - (xa - 0.5)) / ((xb + 0.5) - (xa - 0.5));
    return yA + (yB - yA) * k - sag * 4 * k * (1 - k);
  };
  /** The highest ground under the plank's whole width (so the meadow never pokes up through a landing). */
  const under = (is: Isle, x: number, dflt: number) => {
    let m = -Infinity;
    for (const z of [-width / 2, -width / 4, 0, width / 4, width / 2]) { const y = groundY(is, x, z); if (y !== null) m = Math.max(m, y); }
    return m === -Infinity ? dflt : m;
  };
  for (let x = x0; x <= x1 + 1e-6; x += step) {
    let y: number;
    if (x < xa - 0.5) y = under(a, x, yA) + 0.05;
    else if (x > xb + 0.5) y = under(b, x, yB) + 0.05;
    else y = hung(x);
    xs.push(x); ys.push(y);
  }
  // soften the landings (a plank walk does not follow every ripple of the meadow)
  for (let pass = 0; pass < 2; pass++) for (let i = 1; i < ys.length - 1; i++) if (xs[i] < xa - 0.5 || xs[i] > xb + 0.5) ys[i] = (ys[i - 1] + ys[i] * 2 + ys[i + 1]) / 4;
  const top = (x: number) => {
    const f = Math.max(0, Math.min(xs.length - 1.0001, (x - x0) / step));
    const i = Math.floor(f), k = f - i;
    return ys[i] + (ys[Math.min(ys.length - 1, i + 1)] - ys[i]) * k;
  };
  const W = width;
  const kit = new Kit();
  // planks across the whole walk, each a little crooked and its own shade
  const wood = new THREE.Color(SAIL.plank), dark = new THREE.Color(SAIL.weathered);
  for (let x = x0 + 0.17; x < x1 - 0.1; x += 0.34) {
    const y = top(x), y2 = top(x + 0.1);
    const c = wood.clone().lerp(dark, rnd() * 0.6).multiplyScalar(0.85 + rnd() * 0.25);
    kit.add(boxM(0.28, 0.08, W + (rnd() - 0.5) * 0.08, WOOD_TILE), 'wood', c, T(x, y - 0.04, (rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.04, Math.atan2(y2 - y, 0.1)));
  }
  // three stringers under the planks, end to end
  for (const s of [-1, 0, 1]) {
    const pts: THREE.Vector3[] = [];
    const n = Math.max(8, Math.round((x1 - x0) / 0.6));
    for (let i = 0; i <= n; i++) { const x = x0 + 0.1 + (x1 - x0 - 0.2) * i / n; pts.push(new THREE.Vector3(x, top(x) - 0.1, s * (W / 2 - 0.15))); }
    kit.add(ropeGeo(pts, 0.055, 5), 'wood', dark, undefined);
  }
  // at each lip: a stone sill sunk into the cliff under the planks, and two stout posts deep in the ground
  const stone = new THREE.Color('#e6d6b4');
  for (const [xl, is, dir] of [[xa, a, -1], [xb, b, 1]] as const) {
    const yl = top(xl);
    // the sill: from just past the lip back under the landing, down into the rock
    const sx = xl + dir * 0.55;
    kit.add(boxM(1.9, 1.6, W + 0.5, STONE_TILE), 'stone', stone.clone().multiplyScalar(0.95 + rnd() * 0.08), T(sx, yl - 0.9, 0, 0, 0, (rnd() - 0.5) * 0.03));
    kit.add(boxM(1.2, 1.2, W + 0.2, STONE_TILE), 'stone', stone.clone().multiplyScalar(0.88), T(xl - dir * 0.2, yl - 1.9, 0, 0, 0, 0.05 * dir));
    // a timber beam across the sill under the plank ends
    kit.add(boxM(0.26, 0.22, W + 0.7, WOOD_TILE), 'wood', dark, T(xl, yl - 0.18, 0));
    for (const s of [-1, 1]) {
      const px = xl + dir * 0.35, pz = s * (W / 2 + 0.12);
      const gy = groundY(is, px) ?? yl;
      const foot = Math.min(gy, yl) - 0.7, head = yl + 1.4;
      kit.add(boxM(0.2, head - foot, 0.2, WOOD_TILE, true), 'wood', dark, T(px, (head + foot) / 2, pz, (rnd() - 0.5) * 0.04, rnd() * 0.3, (rnd() - 0.5) * 0.04));
      kit.add(new THREE.SphereGeometry(0.13, 7, 5), 'wood', dark, T(px, head + 0.05, pz));
      // a short brace from the post down to the ground on the landing side
      const bx = px + dir * 0.7, by = (groundY(is, bx) ?? gy) - 0.15;
      const dv = new THREE.Vector3(px - bx, yl + 0.6 - by, 0), len = dv.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dv.normalize());
      kit.add(boxM(0.12, 0.12, len, WOOD_TILE).translate(0, 0, len / 2), 'wood', dark, new THREE.Matrix4().compose(new THREE.Vector3(bx, by, pz), q, new THREE.Vector3(1, 1, 1)));
    }
  }
  // hand ropes and lower ropes between the posts, with hangers down to the deck
  const rope = new THREE.Color('#c2a272');
  const ra = xa - 0.35, rb = xb + 0.35;
  const hand = (x: number) => top(x) + 1.1 + 0.12 * Math.sin(Math.PI * (x - ra) / (rb - ra));
  for (const s of [-1, 1]) {
    for (const [hy, rad] of [[0, 0.04], [-0.55, 0.028]] as const) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 28; i++) { const x = ra + (rb - ra) * i / 28; pts.push(new THREE.Vector3(x, hand(x) + hy, s * (W / 2 + 0.1))); }
      kit.add(ropeGeo(pts, rad, 5), 'plain', rope, undefined);
    }
    for (let x = xa + 0.4; x < xb - 0.3; x += 0.7) {
      kit.add(ropeGeo([new THREE.Vector3(x, top(x), s * (W / 2 + 0.05)), new THREE.Vector3(x, hand(x), s * (W / 2 + 0.1))], 0.016, 3), 'plain', rope, undefined);
    }
  }
  const pos = base.clone().addScaledVector(xAxis, (x0 + x1) / 2);
  const mid = (x0 + x1) / 2;
  const g = new THREE.Group(); g.name = 'ropeBridge';
  kit.build(g, { inkWidth: 0.02 });
  // the kit was built about `base`: shift it so the group sits at the deck's middle
  for (const c of g.children) c.position.x -= mid;
  g.position.copy(pos);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, up, zAxis));
  const obj = new THREE.Object3D();
  obj.position.copy(pos).add(p.center);
  obj.quaternion.copy(g.quaternion);
  const deck: Deck = { obj, span: x1 - x0, width: W, top: (x: number) => top(x + mid), rail: [ra - mid, rb - mid] };
  const at = (x: number) => base.clone().addScaledVector(xAxis, x).addScaledVector(up, top(x));
  return { group: g, deck, ends: [at(x0), at(x1)], lips: [at(xa), at(xb)] };
}
