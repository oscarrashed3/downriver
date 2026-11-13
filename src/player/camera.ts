import * as THREE from 'three';
import type { Planet } from '../world/planet';
import { anyTangent } from '../world/sphere';
import { clamp } from '../world/noise';

function savedPref(key: string, def: number, lo: number, hi: number) {
  try { const v = localStorage.getItem(key); const n = Number(v); if (v !== null && isFinite(n)) return clamp(n, lo, hi); } catch { /* private mode */ }
  return def;
}
function savePref(key: string, v: number) { try { localStorage.setItem(key, String(Math.round(v * 100) / 100)); } catch { /* private mode */ } }

/** Third-person camera that orbits the traveler relative to their local "up" on a round world. */
export class CameraRig {
  yaw = 0;
  pitch = 0.32;
  dist = savedPref('downriver-camdist', 8.5, 4, 14);
  ref = new THREE.Vector3(1, 0, 0);
  smoothUp = new THREE.Vector3(0, 1, 0);
  pos = new THREE.Vector3();
  look = new THREE.Vector3();
  override: null | { pos: THREE.Vector3; look: THREE.Vector3; up: THREE.Vector3 } = null;
  /** Something between the look point and the camera: returns the clear fraction (1 = nothing in the way). */
  block: ((look: THREE.Vector3, pos: THREE.Vector3) => number) | null = null;
  /** Also push in the current override shot (talks); hand-placed cutscene shots are left alone. */
  blockOverride = false;
  /** Sky Isles: ease the push-in (in fast, out slowly) instead of jumping; off elsewhere. */
  smoothBlock = false;
  private blockK = 1;
  /**
   * Sky Isles: the ground under a camera at distance r from the centre (a camera under an island sees the cloud
   * floor, not the top above it). Null elsewhere: the terrain's surface.
   */
  floor: ((dir: THREE.Vector3, r: number) => number) | null = null;
  /** Sky Isles: while gliding, a heading the camera swings in behind once the mouse has been still a moment. */
  follow: THREE.Vector3 | null = null;
  /** How strongly to follow (0..1). */
  followK = 0;
  private stillT = 0;
  /**
   * The Walking Town: a lowest pitch the camera eases up to (so it never looks up from under the walks Nilo stands
   * on), a cap on the follow distance (inside a house), a pitch it eases to, how fast it chases its goal, and how
   * many metres a second the distance may change. The defaults leave every other world exactly as it was.
   */
  pitchMin = -0.25;
  distCap: number | null = null;
  pitchGoal: number | null = null;
  posRate = 9;
  distSpeed = Infinity;
  /**
   * Sky Isles: true while Nilo drops off a lip below the ground the camera stands over. The camera stops following
   * him down (it would go into the island's rock) and drifts out over him, watching from above. Null elsewhere.
   */
  watch: (() => boolean) | null = null;
  private watchK = 0;
  private watchAt: THREE.Vector3 | null = null;
  /** Blend from an earlier shot into whatever the camera is doing now. */
  private ease: { pos: THREE.Vector3; look: THREE.Vector3; up: THREE.Vector3; t: number; dur: number } | null = null;
  private shown = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
  private init = false;

  constructor(public camera: THREE.PerspectiveCamera) {}

  /** Mouse wheel: ease the follow distance between 4 and 14 m. Remembered between visits. */
  zoomBy(steps: number) { this.setDistance(this.distGoal * (1 + steps * 0.12)); }
  distGoal = this.dist;
  private distSave = 0;
  /** Remembered between visits; written a moment after the last change, so a smooth wheel scroll is one write, not dozens. */
  setDistance(d: number) {
    this.distGoal = clamp(d, 4, 14);
    clearTimeout(this.distSave);
    this.distSave = setTimeout(() => savePref('downriver-camdist', this.distGoal), 400) as unknown as number;
  }
  /** Mouse-look speed, 1 = normal (Settings). Remembered between visits. */
  sens = savedPref('downriver-sens', 1, 0.3, 2.5);
  setSensitivity(s: number) { this.sens = clamp(s, 0.3, 2.5); savePref('downriver-sens', this.sens); }

  forward(up: THREE.Vector3): THREE.Vector3 {
    return this.ref.clone().applyAxisAngle(up, this.yaw).normalize();
  }

  /** Movement basis from the camera: forward and right along the ground. */
  basis(up: THREE.Vector3) {
    const f = this.forward(up);
    const r = new THREE.Vector3().crossVectors(f, up).normalize();
    return { f, r };
  }

  /** Point the camera so the traveler faces `dir` (used on arrival). */
  faceDir(up: THREE.Vector3, dir: THREE.Vector3) {
    this.ref.copy(dir).projectOnPlane(up).normalize();
    this.yaw = 0;
  }

  update(dt: number, target: THREE.Vector3, up: THREE.Vector3, planet: Planet, mdx: number, mdy: number, keyYaw: number) {
    // Parallel-transport the reference tangent as we walk around the sphere.
    this.ref.projectOnPlane(up);
    if (this.ref.lengthSq() < 1e-4) anyTangent(up, this.ref);
    this.ref.normalize();
    this.yaw -= mdx * 0.0032 * this.sens + keyYaw * dt * 2.2;
    if (this.follow) {
      this.stillT = mdx !== 0 || keyYaw !== 0 ? 0 : this.stillT + dt;
      const h = this.follow.clone().projectOnPlane(up);
      if (h.lengthSq() > 1e-6 && this.stillT > 0.6) {
        h.normalize();
        const want = Math.atan2(new THREE.Vector3().crossVectors(this.ref, h).dot(up), this.ref.dot(h));
        let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * (1 - Math.exp(-1.6 * this.followK * Math.min(1, (this.stillT - 0.6) * 2) * dt));
      }
    }
    this.pitch = clamp(this.pitch + mdy * 0.0026 * this.sens, -0.25, 1.25);
    if (this.pitch < this.pitchMin) this.pitch += (this.pitchMin - this.pitch) * (1 - Math.exp(-4 * dt));
    if (this.pitchGoal !== null) this.pitch += (this.pitchGoal - this.pitch) * (1 - Math.exp(-2 * dt));
    {
      const want = this.distCap !== null ? Math.min(this.distGoal, this.distCap) : this.distGoal;
      let step = (want - this.dist) * (1 - Math.exp(-8 * dt));
      if (Math.abs(step) > this.distSpeed * dt) step = Math.sign(step) * this.distSpeed * dt;
      this.dist += step;
    }
    this.smoothUp.lerp(up, 1 - Math.exp(-6 * dt)).normalize();
    const f = this.forward(this.smoothUp);
    const goal = target.clone()
      .addScaledVector(this.smoothUp, 1.5 + Math.sin(this.pitch) * this.dist)
      .addScaledVector(f, -Math.cos(this.pitch) * this.dist);
    // Keep the camera above the ground.
    const cdir = goal.clone().sub(planet.center).normalize();
    const gr = goal.distanceTo(planet.center);
    const minR = (this.floor ? this.floor(cdir, gr) : planet.surfaceRadius(cdir)) + 1.1;
    if (gr < minR) goal.copy(cdir.multiplyScalar(minR).add(planet.center));
    if (this.watch) {
      const on = this.watch();
      if (on && !this.watchAt) this.watchAt = this.pos.clone();
      this.watchK += ((on ? 1 : 0) - this.watchK) * (1 - Math.exp(-(on ? 10 : 2.5) * dt));
      if (this.watchAt) {
        if (on) {
          // out over where he is falling, a little behind him, held up at the height of the lip he fell from (lower,
          // and it would meet the cliff), looking down as the clouds catch him
          const c = planet.center, hr = this.watchAt.distanceTo(c), pr = target.distanceTo(c);
          const w = target.clone().sub(c).normalize().multiplyScalar(Math.max(hr, pr + 4)).add(c).addScaledVector(f, -2.5);
          this.watchAt.lerp(w, 1 - Math.exp(-2.2 * dt));
        }
        goal.lerp(this.watchAt, this.watchK);
        if (!on && this.watchK < 0.01) { this.watchAt = null; this.watchK = 0; }
      }
    }
    const lookGoal = target.clone().addScaledVector(this.smoothUp, 1.3);
    if (!this.init) { this.pos.copy(goal); this.look.copy(lookGoal); this.init = true; }
    this.pos.lerp(goal, 1 - Math.exp(-this.posRate * dt));
    this.look.lerp(lookGoal, 1 - Math.exp(-14 * dt));
    let pos: THREE.Vector3, look: THREE.Vector3, up2: THREE.Vector3;
    if (this.override) { pos = this.override.pos.clone(); look = this.override.look; up2 = this.override.up; }
    else { pos = this.pos.clone(); look = this.look; up2 = this.smoothUp; }
    // never inside a house or a rock: push in toward the look point
    if (this.block && (!this.override || this.blockOverride)) {
      let k = this.block(look, pos);
      // (smoothed for a talk shot too: its push-in must not flicker frame to frame)
      if (this.smoothBlock) {
        this.blockK += (k - this.blockK) * (1 - Math.exp(-(k < this.blockK ? 14 : 2.5) * dt));
        k = Math.min(1, this.blockK + 0.06);
      }
      // a talk shot may come right in; the follow camera never closer than about 3 m
      if (k < 1) pos.lerpVectors(look, pos, Math.max(this.override ? 0.5 : 0.35, k - 0.06));
    }
    if (this.ease) {
      this.ease.t += dt;
      const e = clamp(this.ease.t / this.ease.dur), k = e * e * (3 - 2 * e);
      pos.lerpVectors(this.ease.pos, pos, k);
      look = this.ease.look.clone().lerp(look, k);
      up2 = this.ease.up.clone().lerp(up2, k).normalize();
      if (e >= 1) this.ease = null;
    }
    // every shot, scripted or not, stays above the ground and the water: a camera under them shows a dark frame
    {
      const cd = pos.clone().sub(planet.center); const r = cd.length(); cd.divideScalar(r);
      const floor = Math.max(this.floor ? this.floor(cd, r) : planet.surfaceRadius(cd), planet.waterLevelRadius()) + 0.45;
      if (r < floor && r > floor - 40) pos.copy(cd.multiplyScalar(floor).add(planet.center));
    }
    this.camera.position.copy(pos);
    this.camera.up.copy(up2);
    this.camera.lookAt(look);
    this.shown.pos.copy(pos); this.shown.look.copy(look); this.shown.up.copy(up2);
  }

  /** Start a smooth move from what is on screen now to the next shot (or back behind Nilo). */
  easeFromHere(dur = 0.8) {
    this.ease = { pos: this.shown.pos.clone(), look: this.shown.look.clone(), up: this.shown.up.clone(), t: 0, dur };
  }
  get easing() { return !!this.ease; }

  snap() { this.init = false; this.watchAt = null; this.watchK = 0; }
}
