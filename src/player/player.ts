import * as THREE from 'three';
import type { Planet } from '../world/planet';
import { toon } from '../world/props';
import { Person, type PoseInput } from './person';
import { orientTo, anyTangent } from '../world/sphere';
import { clamp, lerp } from '../world/noise';

export type MoveMode = 'walk' | 'climb' | 'raft' | 'ride' | 'still';

/** Rill: a young traveler far from home, in a coat a little too big for him. */
export class Player {
  root = new THREE.Group();
  person: Person;
  lantern = new THREE.Group();
  lanternLight: THREE.PointLight;
  dropMesh: THREE.Mesh;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  up = new THREE.Vector3(0, 1, 0);
  facing = new THREE.Vector3(0, 0, 1);
  grounded = false;
  mode: MoveMode = 'walk';
  /** The drop's warmth, 0..1. Fades while climbing or in deep cold; returns when resting. */
  warmth = 1;
  hasDrop = false;
  dropGlow = 0.2;
  coyote = 0;
  jumpBuffer = 0;
  squash = 0;
  stepTimer = 0;
  raftT = 0;
  raftSide = 0;
  /** Gliding under the kite (after Tor's gift). */
  canGlide = false;
  gliding = false;
  /** Pose requests from the story and small joys. */
  pose: Partial<PoseInput> = {};
  lookAt: THREE.Vector3 | null = null;
  windLocal = new THREE.Vector3();
  satchelGlow = 0;
  onStep?: (surface: string) => void;
  onLand?: (impact: number) => void;
  onJump?: () => void;
  private lastSpeed = 0;
  private lastVUp = 0;
  private satchelMat: THREE.MeshToonMaterial;

  constructor() {
    this.person = new Person({
      skin: '#f2c8a2', hair: '#3b2a22', hairStyle: 'messy', top: '#efe4cc', coat: '#c4693a', coatLen: 0.78,
      trousers: '#46506e', boots: '#5a3a28', scarf: '#3f86b8', satchel: true,
    });
    this.root.add(this.person.root);
    // Lantern with the drop, hanging from the satchel strap at his right hip.
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0.35 }));
    this.dropMesh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: '#bfeeff' }));
    const lcap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.035, 8), toon('#8a6a4a'));
    lcap.position.y = 0.08;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 4, 8), toon('#8a6a4a')); ring.position.y = 0.11;
    this.lantern.add(glass, this.dropMesh, lcap, ring);
    this.lantern.position.set(0.02, -0.1, 0.02);
    this.lanternLight = new THREE.PointLight('#bfefff', 0, 7, 2);
    this.lantern.add(this.lanternLight);
    this.person.hipR.add(this.lantern);
    this.satchelMat = toon('#8a5a34').clone();
    this.person.satchel?.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.isOutline && (m.material as THREE.MeshToonMaterial).color?.getHexString() === '8a5a34') m.material = this.satchelMat; });
  }

  placeAt(planet: Planet, dir: THREE.Vector3) {
    this.up.copy(dir).normalize();
    planet.surfacePoint(this.up, 0.05, this.pos);
    this.vel.set(0, 0, 0);
    anyTangent(this.up, this.facing);
    this.sync();
  }

  /** Movement on a small round world: gravity points to the planet's center. */
  update(dt: number, planet: Planet, moveDir: THREE.Vector3, wantJump: boolean, run: boolean, wantGlide = false) {
    const toC = this.pos.clone().sub(planet.center);
    this.up.copy(toC).normalize();
    const surfR = planet.surfaceRadius(this.up);
    const r = toC.length();
    const slope = planet.slope(this.up);
    const steep = slope > 0.72;

    // Velocity split into vertical (along up) and tangential.
    const vUp = this.vel.dot(this.up);
    const vTan = this.vel.clone().addScaledVector(this.up, -vUp);

    this.jumpBuffer = wantJump ? 0.15 : Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);

    const climbing = steep && this.grounded && moveDir.lengthSq() > 0.01 && this.warmth > 0.02;
    this.mode = climbing ? 'climb' : 'walk';
    let speed = run ? 9.5 : 5.5;
    if (climbing) speed = 2.8;
    const target = moveDir.clone().multiplyScalar(speed);
    const accel = this.grounded ? 14 : 3.5;
    vTan.lerp(target, 1 - Math.exp(-accel * dt));

    // Too steep with no warmth left: slide back down gently.
    if (steep && this.warmth <= 0.02) {
      const downhill = this.downhill(planet);
      vTan.addScaledVector(downhill, 6 * dt * 4);
    }

    let vU = vUp - 22 * dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      vU = 8.2; this.jumpBuffer = 0; this.coyote = 0; this.grounded = false;
      this.squash = -0.25; this.onJump?.();
    }

    // Gliding under the kite: hold Space while falling from a height.
    this.gliding = this.canGlide && !this.grounded && wantGlide && vU < 0;
    if (this.gliding) {
      vU = Math.max(vU, -2.2);
      if (moveDir.lengthSq() > 0.01) vTan.lerp(moveDir.clone().normalize().multiplyScalar(7.5), 1 - Math.exp(-2 * dt));
    }
    this.lastVUp = vU;
    this.vel.copy(vTan).addScaledVector(this.up, vU);
    this.pos.addScaledVector(this.vel, dt);

    // Collide with the ground.
    const nUp = this.pos.clone().sub(planet.center).normalize();
    const ground = planet.surfaceRadius(nUp);
    const nr = this.pos.distanceTo(planet.center);
    if (nr <= ground + 0.02) {
      if (!this.grounded && vU < -4) { this.squash = Math.min(0.35, -vU * 0.025); this.onLand?.(-vU); }
      this.pos.copy(nUp).multiplyScalar(ground).add(planet.center);
      const vu2 = this.vel.dot(nUp);
      if (vu2 < 0) this.vel.addScaledVector(nUp, -vu2);
      this.grounded = true;
    } else if (nr > ground + 0.35) {
      this.grounded = false;
    }
    void surfR; void r;

    // Warmth: climbing costs warmth, standing still or walking returns it slowly.
    if (this.hasDrop) {
      if (climbing) this.warmth = Math.max(0, this.warmth - dt * 0.09);
      else this.warmth = Math.min(1, this.warmth + dt * (moveDir.lengthSq() < 0.01 ? 0.35 : 0.12));
    } else this.warmth = 1;

    if (moveDir.lengthSq() > 0.01) this.facing.lerp(moveDir.clone().normalize(), 1 - Math.exp(-10 * dt));
    this.facing.projectOnPlane(this.up).normalize();
    const sp = vTan.length();
    if (this.grounded && sp > 0.5) {
      this.stepTimer -= dt * sp * 0.42;
      if (this.stepTimer <= 0) { this.stepTimer = 1; this.onStep?.(planet.cfg.shape); }
    }
    this.animate(dt, sp, climbing);
    this.sync();
  }

  downhill(planet: Planet): THREE.Vector3 {
    const e = 1 / planet.R;
    const t1 = anyTangent(this.up), t2 = new THREE.Vector3().crossVectors(this.up, t1);
    const h0 = planet.height(this.up);
    const h1 = planet.height(this.up.clone().addScaledVector(t1, e).normalize());
    const h2 = planet.height(this.up.clone().addScaledVector(t2, e).normalize());
    return t1.multiplyScalar(h0 - h1).add(t2.multiplyScalar(h0 - h2)).normalize();
  }

  animate(dt: number, sp: number, climbing: boolean) {
    this.squash = lerp(this.squash, 0, 1 - Math.exp(-9 * dt));
    const sq = 1 - this.squash;
    this.person.root.scale.set(1 / Math.sqrt(Math.max(0.5, sq)), sq, 1 / Math.sqrt(Math.max(0.5, sq)));
    this.lastSpeed = sp;
    const cold = this.hasDrop && this.warmth < 0.45 ? clamp((0.45 - this.warmth) / 0.35) : 0;
    this.person.animate(dt, {
      speed: sp, grounded: this.grounded, climbing, vUp: this.lastVUp,
      shiver: Math.max(cold, this.pose.shiver ?? 0),
      lookAt: this.lookAt, windLocal: this.windLocal,
      ...this.pose,
    } as PoseInput);
    const t = performance.now() / 1000;
    this.lantern.rotation.z = Math.sin(t * 2.2) * 0.12 + clamp(sp / 9) * Math.sin(t * 9) * 0.15;
    const glow = this.hasDrop ? (0.25 + this.dropGlow * 0.75) * (0.35 + 0.65 * this.warmth) : 0;
    this.lanternLight.intensity = glow * 2.2;
    (this.dropMesh.material as THREE.MeshBasicMaterial).color.setHSL(0.54, 0.9, 0.35 + glow * 0.55);
    this.dropMesh.visible = this.hasDrop;
    this.satchelMat.emissive.set('#ffd890');
    this.satchelMat.emissiveIntensity = this.satchelGlow * (0.55 + 0.45 * Math.sin(t * 3));
  }

  sync() {
    this.root.position.copy(this.pos);
    orientTo(this.root, this.up, this.facing);
  }
}
