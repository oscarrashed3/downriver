// World 2, the Sky Isles: how Nilo flies on Fold the paper glider. Pure (no scene), so it can be tested.
//
// Jump off any edge and hold jump: the wing opens near the top of the jump (or as soon as you press jump while
// falling). Steer with the movement keys; hold the dive key to put the nose down and gain speed. Out of a dive the
// speed turns into a short climb (the Porco Rosso pull-up). Gliding level, speed slowly bleeds off and the sink
// grows, so you lose height gently. Updrafts add lift; rings and gusts add a boost. Units: metres, seconds.
import * as THREE from 'three';

export interface GliderState {
  /** The wing is open (gliding). */
  open: boolean;
  /** Airspeed along the heading, m/s. */
  speed: number;
  /** Unit tangent the glider flies along. */
  heading: THREE.Vector3;
  /** Nose pitch in radians (- = nose down). */
  pitch: number;
  /** Bank in radians (+ = right wing down), smoothed. */
  bank: number;
  /** Extra speed from rings and gusts, decays over about a second. */
  boost: number;
  /** Seconds left of the pull-up after a dive. */
  pull: number;
  /** Seconds since leaving the ground. */
  airT: number;
  /** Seconds since the wing opened (for the opening flare). */
  openT: number;
  /** Was diving last step (to start the pull-up on release). */
  diving: boolean;
}

export const GLIDE = {
  /** Speed the wing settles towards when opened. */
  cruise: 9.5,
  /** Slowest it flies (it never stalls). */
  min: 5.2,
  /** Fastest dive. */
  max: 25,
  /** Sink at cruise and at the slowest. */
  sinkFast: 1.15,
  sinkSlow: 3.8,
  /** Bleed per second while gliding level. */
  bleed: 0.32,
  /** Turn rate, rad/s. */
  turn: 2.0,
  /** Nose-down pitch in a dive. */
  divePitch: -0.62,
  /** Height above the ground needed to open from a jump. */
  clearance: 1.6,
  /** Updraft lift at full strength, m/s up. */
  lift: 10,
};

export function newGlider(): GliderState {
  return { open: false, speed: GLIDE.cruise, heading: new THREE.Vector3(0, 0, 1), pitch: 0, bank: 0, boost: 0, pull: 0, airT: 0, openT: 0, diving: false };
}

export interface GlideInput {
  dt: number;
  up: THREE.Vector3;
  /** Camera-relative steering (length 0..1), or zero. */
  moveDir: THREE.Vector3;
  /** Jump held. */
  hold: boolean;
  /** Dive key held. */
  dive: boolean;
  grounded: boolean;
  /** Height above the ground below, metres. */
  clearance: number;
  /** Updraft strength 0..1 here. */
  lift: number;
  /** Open even without a jump (stepping into an updraft, the race). */
  forceOpen?: boolean;
  /** Facing, used as the heading if the glider opens from a standstill. */
  facing: THREE.Vector3;
}

const _t = new THREE.Vector3(), _c = new THREE.Vector3();
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const approach = (x: number, to: number, rate: number, dt: number) => x + (to - x) * (1 - Math.exp(-rate * dt));

/**
 * One step of flight. vTan (the tangential velocity) is changed in place; returns the new vertical speed.
 * When the wing is closed it changes nothing (the caller's walking and falling rules apply).
 */
export function stepGlide(g: GliderState, vU: number, vTan: THREE.Vector3, I: GlideInput): number {
  const dt = I.dt;
  g.airT = I.grounded ? 0 : g.airT + dt;
  if (I.grounded) { g.open = false; g.pull = 0; g.diving = false; g.boost = 0; return vU; }
  if (!g.open) {
    const want = I.forceOpen || (I.hold && I.clearance > GLIDE.clearance && (vU < 1.5 || g.airT > 0.3));
    if (!want) return vU;
    g.open = true; g.openT = 0; g.pull = 0; g.diving = false;
    const h = vTan.length();
    if (h > 0.5) g.heading.copy(vTan).divideScalar(h); else g.heading.copy(I.facing);
    g.heading.projectOnPlane(I.up).normalize();
    g.speed = clamp(Math.max(h, GLIDE.cruise * 0.85), GLIDE.min, GLIDE.max);
    g.pitch = 0;
  } else if (!I.hold && !I.forceOpen) {
    // let go: the wing folds and you drop
    g.open = false; g.diving = false; g.pull = 0;
    return vU;
  }
  g.openT += dt;
  g.heading.projectOnPlane(I.up).normalize();

  // steer: turn the heading toward the stick, banking into the turn
  let turnRate = 0;
  if (I.moveDir.lengthSq() > 0.01) {
    _t.copy(I.moveDir).projectOnPlane(I.up).normalize();
    const cross = _c.crossVectors(g.heading, _t).dot(I.up);
    const ang = Math.atan2(cross, g.heading.dot(_t));
    const rate = GLIDE.turn * (0.75 + 0.25 * Math.min(1, g.speed / 14)) * Math.min(1, I.moveDir.length());
    const step = clamp(ang, -rate * dt, rate * dt);
    g.heading.applyAxisAngle(I.up, step).normalize();
    turnRate = dt > 0 ? step / dt : 0;
  }
  // + bank = right wing down; turning right (clockwise seen from above) is a negative turn about up
  g.bank = approach(g.bank, clamp(-turnRate * 0.32, -0.6, 0.6), 5, dt);

  // pitch: nose down in a dive, nearly level gliding, a little up in the pull-out
  const wasDiving = g.diving;
  g.diving = I.dive;
  if (wasDiving && !I.dive && g.speed > GLIDE.cruise + 2) g.pull = 0.9;
  g.pull = Math.max(0, g.pull - dt);
  const pitchGoal = I.dive ? GLIDE.divePitch : g.pull > 0 ? 0.28 : -0.06;
  g.pitch = approach(g.pitch, pitchGoal, I.dive ? 3.2 : 2.6, dt);

  // speed: gravity along the path in a dive; a slow bleed gliding level; a climb trades speed for height
  const down = Math.max(0, -Math.sin(g.pitch));
  if (I.dive) g.speed += 15 * down * dt;
  else {
    g.speed -= GLIDE.bleed * dt;
    if (g.speed > 13) g.speed -= (g.speed - 13) * 0.22 * dt;
  }
  if (g.pull > 0) g.speed -= Math.max(0, g.speed - GLIDE.cruise) * 1.4 * dt;
  g.speed = clamp(g.speed, GLIDE.min, GLIDE.max);
  g.boost = Math.max(0, g.boost - g.boost * 1.2 * dt - 0.4 * dt);

  // vertical: sink grows as the speed bleeds; a dive drops along the nose; the pull-up climbs; updrafts lift
  const slow = clamp((10.5 - g.speed) / (10.5 - GLIDE.min), 0, 1);
  let goal = -(GLIDE.sinkFast + (GLIDE.sinkSlow - GLIDE.sinkFast) * slow);
  if (I.dive) goal = -g.speed * down * 1.05;
  if (g.pull > 0) goal = Math.min(6.5, (g.speed - GLIDE.cruise) * 0.75 + 1.5);
  goal += I.lift * GLIDE.lift;
  // opening from a fall flares gently instead of stopping dead; a dive bites quickly
  vU = approach(vU, goal, I.dive ? 4 : g.openT < 0.5 ? 3 : 4.5, dt);

  const h = (g.speed + g.boost) * Math.cos(g.pitch * 0.5);
  vTan.copy(g.heading).multiplyScalar(h);
  return vU;
}
