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
    if (this.override) {
      this.camera.position.copy(this.override.pos);
      this.camera.up.copy(this.override.up);
      this.camera.lookAt(this.override.look);
      return;
    }
    this.camera.position.copy(this.pos);
    this.camera.up.copy(this.smoothUp);
    this.camera.lookAt(this.look);
  }

  snap() { this.init = false; }
}
