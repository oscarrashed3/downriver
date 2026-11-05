import * as THREE from 'three';
import type { Planet } from '../world/planet';
import { anyTangent } from '../world/sphere';
import { clamp } from '../world/noise';

/** Third-person camera that orbits the traveler relative to their local "up" on a round world. */
export class CameraRig {
  yaw = 0;
  pitch = 0.32;
  dist = 8.5;
  ref = new THREE.Vector3(1, 0, 0);
  smoothUp = new THREE.Vector3(0, 1, 0);
  pos = new THREE.Vector3();
  look = new THREE.Vector3();
  override: null | { pos: THREE.Vector3; look: THREE.Vector3; up: THREE.Vector3 } = null;
  /** Something between the look point and the camera: returns the clear fraction (1 = nothing in the way). */
  block: ((look: THREE.Vector3, pos: THREE.Vector3) => number) | null = null;
  /** Also push in the current override shot (talks); hand-placed cutscene shots are left alone. */
  blockOverride = false;
  /** Blend from an earlier shot into whatever the camera is doing now. */
  private ease: { pos: THREE.Vector3; look: THREE.Vector3; up: THREE.Vector3; t: number; dur: number } | null = null;
  private shown = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
  private init = false;

  constructor(public camera: THREE.PerspectiveCamera) {}

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
    this.yaw -= mdx * 0.0032 + keyYaw * dt * 2.2;
    this.pitch = clamp(this.pitch + mdy * 0.0026, -0.25, 1.25);
    this.smoothUp.lerp(up, 1 - Math.exp(-6 * dt)).normalize();
    const f = this.forward(this.smoothUp);
    const goal = target.clone()
      .addScaledVector(this.smoothUp, 1.5 + Math.sin(this.pitch) * this.dist)
      .addScaledVector(f, -Math.cos(this.pitch) * this.dist);
    // Keep the camera above the ground.
    const cdir = goal.clone().sub(planet.center).normalize();
    const minR = planet.surfaceRadius(cdir) + 1.1;
    const gr = goal.distanceTo(planet.center);
    if (gr < minR) goal.copy(cdir.multiplyScalar(minR).add(planet.center));
    const lookGoal = target.clone().addScaledVector(this.smoothUp, 1.3);
    if (!this.init) { this.pos.copy(goal); this.look.copy(lookGoal); this.init = true; }
    this.pos.lerp(goal, 1 - Math.exp(-9 * dt));
    this.look.lerp(lookGoal, 1 - Math.exp(-14 * dt));
    let pos: THREE.Vector3, look: THREE.Vector3, up2: THREE.Vector3;
    if (this.override) { pos = this.override.pos.clone(); look = this.override.look; up2 = this.override.up; }
    else { pos = this.pos.clone(); look = this.look; up2 = this.smoothUp; }
    // never inside a house or a rock: push in toward the look point
    if (this.block && (!this.override || this.blockOverride)) {
      const k = this.block(look, pos);
      // a talk shot may come right in; the follow camera never closer than about 3 m
      if (k < 1) pos.lerpVectors(look, pos, Math.max(this.override ? 0.12 : 0.35, k - 0.06));
    }
    if (this.ease) {
      this.ease.t += dt;
      const e = clamp(this.ease.t / this.ease.dur), k = e * e * (3 - 2 * e);
      pos.lerpVectors(this.ease.pos, pos, k);
      look = this.ease.look.clone().lerp(look, k);
      up2 = this.ease.up.clone().lerp(up2, k).normalize();
      if (e >= 1) this.ease = null;
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

  snap() { this.init = false; }
}
