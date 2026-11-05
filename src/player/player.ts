import * as THREE from 'three';
import type { Planet } from '../world/planet';
import { toon } from '../world/props';
import { orientTo, anyTangent } from '../world/sphere';
import { clamp, lerp } from '../world/noise';

export type MoveMode = 'walk' | 'climb' | 'raft' | 'ride' | 'still';

/** Rill: a small traveler in a hooded cloak, carrying the last drop of the spring. */
export class Player {
  root = new THREE.Group();
  body = new THREE.Group();
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
  onStep?: (surface: string) => void;
  onLand?: (impact: number) => void;
  onJump?: () => void;
  private bob = 0;
  private cloak: THREE.Mesh;

  constructor() {
    const cloakM = toon('#2f6f7a');
    this.cloak = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.25, 10), cloakM);
    this.cloak.position.y = 0.62;
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), cloakM);
    hood.position.y = 1.32;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), toon('#1d1a2a'));
    face.position.set(0, 1.3, 0.16);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 8), cloakM);
    tip.position.set(0, 1.62, -0.12); tip.rotation.x = -0.7;
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 14), toon('#e8b04a'));
    scarf.position.y = 1.08; scarf.rotation.x = Math.PI / 2;
    const eyes = new THREE.Group();
    for (const x of [-0.08, 0.08]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff4d8' }));
      e.position.set(x, 1.33, 0.39); eyes.add(e);
    }
    this.body.add(this.cloak, hood, face, tip, scarf, eyes);

    // Lantern with the drop.
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0.35 }));
    this.dropMesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: '#bfeeff' }));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 8), toon('#8a6a4a'));
    cap.position.y = 0.15;
    this.lantern.add(glass, this.dropMesh, cap);
    this.lantern.position.set(0.42, 0.78, 0.18);
    this.lanternLight = new THREE.PointLight('#bfefff', 0, 7, 2);
    this.lantern.add(this.lanternLight);
    this.body.add(this.lantern);
    this.root.add(this.body);
  }

  placeAt(planet: Planet, dir: THREE.Vector3) {
    this.up.copy(dir).normalize();
    planet.surfacePoint(this.up, 0.05, this.pos);
    this.vel.set(0, 0, 0);
    anyTangent(this.up, this.facing);
    this.sync();
  }

  /** Movement on a small round world: gravity points to the planet's center. */
  update(dt: number, planet: Planet, moveDir: THREE.Vector3, wantJump: boolean, run: boolean) {
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
    const sp = vTan.length();
    if (this.grounded && sp > 0.5) {
      this.stepTimer -= dt * sp * 0.42;
      if (this.stepTimer <= 0) { this.stepTimer = 1; this.onStep?.(planet.cfg.shape); }
    }
    this.bob += dt * sp * 1.6;
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
    const s = 1 - this.squash;
    this.body.scale.set(1 / Math.sqrt(Math.max(0.5, s)), s, 1 / Math.sqrt(Math.max(0.5, s)));
    const wob = Math.sin(this.bob * 2) * clamp(sp / 8) * 0.06;
    this.cloak.rotation.z = wob;
    this.body.position.y = Math.abs(Math.sin(this.bob * 2)) * clamp(sp / 8) * 0.08;
    this.body.rotation.x = climbing ? -0.35 : clamp(sp / 9) * 0.12;
    const t = performance.now() / 1000;
    this.lantern.position.y = 0.78 + Math.sin(t * 2 + this.bob) * 0.03;
    const glow = this.hasDrop ? (0.25 + this.dropGlow * 0.75) * (0.35 + 0.65 * this.warmth) : 0;
    this.lanternLight.intensity = glow * 3.2;
    (this.dropMesh.material as THREE.MeshBasicMaterial).color.setHSL(0.54, 0.9, 0.35 + glow * 0.55);
    this.dropMesh.visible = this.hasDrop;
  }

  sync() {
    this.root.position.copy(this.pos);
    orientTo(this.root, this.up, this.facing);
  }
}
