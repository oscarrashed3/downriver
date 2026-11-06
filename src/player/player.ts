import * as THREE from 'three';
import type { Planet } from '../world/planet';
import { toon } from '../world/props';
import { Person, type PoseInput } from './person';
import { orientTo, anyTangent } from '../world/sphere';
import { clamp, lerp } from '../world/noise';
import { resolveSolids, deckUnder } from '../world/collide';
import { Motion } from './motion';

export type MoveMode = 'walk' | 'climb' | 'raft' | 'ride' | 'still';

/** Nilo: a young traveler far from home, in a coat a little too big for him. */
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
  /** Standing on the bridge (or another deck). */
  onDeck = false;
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
  /** Time left in a forward roll (C while moving), and its direction. */
  rollT = 0;
  rollDir = new THREE.Vector3();
  /** Time into a running front flip (jumping at full run). */
  flipT = 0;
  /** Crouch left from a hard landing. */
  landT = 0;
  private landAmt = 0;
  onRoll?: () => void;
  /** Feet, legs, weight and cloth (see motion.ts). */
  motion: Motion;
  /** Caps the speed (for tests and slow walks). */
  maxSpeed: number | null = null;
  /** Skidding to a stop before turning round at a run. */
  skidT = 0;
  private skidDir = new THREE.Vector3();
  private planet: Planet | null = null;
  private lastMove = new THREE.Vector3();
  private running = false;
  private lastBusy = 0;
  private tumble = 0;
  private lastSpeed = 0;
  private lastVUp = 0;
  private satchelMat: THREE.MeshToonMaterial;

  constructor() {
    this.person = new Person({
      wanderer: true,
      skin: '#7a5038', hair: '#2e1e18', hairStyle: 'messy', top: '#2a3048', coat: '#c49a6c', facets: true,
      trousers: '#3e2a24', boots: '#7a4a2c', scarf: '#2e3456', satchel: true, hood: '#c49a6c', glowEyes: '#ffc24a',
      props: ['boatPeek'],
    });
    this.root.add(this.person.root);
    // Lantern with the drop, hanging from the satchel strap at his right hip.
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffe6a8', transparent: true, opacity: 0.45 }));
    this.dropMesh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: '#bfeeff' }));
    const lcap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.04, 6), toon('#b88a3a'));
    for (let i = 0; i < 4; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.15, 0.008), toon('#8a6428')); const a = i * Math.PI / 2 + Math.PI / 4; bar.position.set(Math.cos(a) * 0.06, 0.0, Math.sin(a) * 0.06); this.lantern.add(bar); }
    const lbase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.025, 6), toon('#b88a3a')); lbase.position.y = -0.075; this.lantern.add(lbase);
    lcap.position.y = 0.08;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 4, 8), toon('#b88a3a')); ring.position.y = 0.11;
    this.lantern.add(glass, this.dropMesh, lcap, ring);
    this.lantern.position.set(0, -0.1, 0.03);
    this.lantern.scale.setScalar(1.15);
    this.lanternLight = new THREE.PointLight('#ffd690', 0, 7, 2);
    this.lanternLight.position.z = 0.18;
    this.lantern.add(this.lanternLight);
    this.person.strapPoint.add(this.lantern);
    this.motion = new Motion(this.person, this.lantern);
    this.motion.onPlant = (_i, sp) => { if (sp > 0.6) this.onStep?.(this.planet?.cfg.shape ?? 'peaks'); };
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
  update(dt: number, planet: Planet, moveDir: THREE.Vector3, wantJump: boolean, run: boolean, wantGlide = false, wantRoll = false) {
    const toC = this.pos.clone().sub(planet.center);
    this.up.copy(toC).normalize();
    const surfR = planet.surfaceRadius(this.up);
    const r = toC.length();
    const slope = planet.slope(this.up);
    const steep = slope > 0.72 && !this.onDeck;

    // Velocity split into vertical (along up) and tangential.
    const vUp = this.vel.dot(this.up);
    const vTan = this.vel.clone().addScaledVector(this.up, -vUp);

    this.jumpBuffer = wantJump ? 0.15 : Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);

    const climbing = steep && this.grounded && moveDir.lengthSq() > 0.01 && this.warmth > 0.02;
    this.mode = climbing ? 'climb' : 'walk';
    let speed = run ? 9.5 : 5.5;
    if (climbing) speed = 2.8;
    if (this.maxSpeed != null) speed = Math.min(speed, this.maxSpeed);
    this.planet = planet; this.lastMove.copy(moveDir); this.running = run;
    // a sharp reversal at a run skids first (Mario 64): brake hard, feet dug in, then pivot and push off
    const vNow = vTan.length();
    if (this.skidT <= 0 && this.grounded && vNow > 7 && moveDir.lengthSq() > 0.01 && vTan.dot(moveDir) / vNow < -0.5 && this.rollT <= 0) {
      this.skidT = 0.34; this.skidDir.copy(vTan).normalize(); this.motion.inertialize();
    }
    if (this.skidT > 0) {
      this.skidT = Math.max(0, this.skidT - dt);
      vTan.multiplyScalar(Math.exp(-9 * dt));
      this.facing.copy(this.skidDir);
      if (this.skidT <= 0) { this.facing.copy(moveDir.lengthSq() > 0.01 ? moveDir : this.skidDir.clone().negate()).projectOnPlane(this.up).normalize(); this.motion.inertialize(); }
    }
    const target = moveDir.clone().multiplyScalar(this.skidT > 0 ? 0 : speed);
    const accel = this.grounded ? 14 : 3.5;
    vTan.lerp(target, 1 - Math.exp(-accel * dt));

    // A forward roll: a quick tumble along the ground, a burst of speed that eases off.
    if (wantRoll && this.grounded && this.rollT <= 0 && !climbing && this.mode === 'walk') {
      this.rollT = Player.ROLL;
      this.rollDir.copy(moveDir.lengthSq() > 0.01 ? moveDir : this.facing).projectOnPlane(this.up).normalize();
      this.squash = 0.18; this.onRoll?.();
    }
    if (this.rollT > 0) {
      this.rollT = Math.max(0, this.rollT - dt);
      const k = this.rollT / Player.ROLL;
      this.rollDir.projectOnPlane(this.up).normalize();
      // a little steering, like a real roll
      if (moveDir.lengthSq() > 0.01) this.rollDir.lerp(moveDir.clone().normalize(), dt * 3).normalize();
      vTan.copy(this.rollDir).multiplyScalar(5 + 7.5 * Math.sin(Math.PI * Math.min(1, (1 - k) * 1.4 + 0.15)));
      this.facing.copy(this.rollDir);
    }

    // Too steep with no warmth left: slide back down gently.
    if (steep && this.warmth <= 0.02) {
      const downhill = this.downhill(planet);
      vTan.addScaledVector(downhill, 6 * dt * 4);
    }

    let vU = vUp - 22 * dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      vU = 8.2; this.jumpBuffer = 0; this.coyote = 0; this.grounded = false;
      this.squash = -0.25; this.onJump?.();
      // jumping at a full run (or out of a roll) turns into a front flip
      if (vTan.length() > 8 || this.rollT > 0) { this.flipT = 0.001; this.rollT = 0; }
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
      if (!this.grounded && vU < -4) {
        this.squash = Math.min(0.35, -vU * 0.025); this.onLand?.(-vU);
        // knees take the landing in proportion to how hard it was; a big fall at speed turns into a roll
        this.landAmt = clamp((-vU - 4) / 12); this.landT = 0.18 + this.landAmt * 0.3;
        if (-vU > 15 && vTan.length() > 3 && this.rollT <= 0) { this.rollT = Player.ROLL; this.rollDir.copy(vTan).projectOnPlane(nUp).normalize(); this.onRoll?.(); }
      }
      if (!this.grounded) this.flipT = 0;
      this.pos.copy(nUp).multiplyScalar(ground).add(planet.center);
      const vu2 = this.vel.dot(nUp);
      if (vu2 < 0) this.vel.addScaledVector(nUp, -vu2);
      this.grounded = true;
    } else if (nr > ground + 0.35) {
      this.grounded = false;
    }
    void surfR; void r;

    // Walkable decks (the bridge): step up onto the arch, and the railings keep you on it.
    this.onDeck = false;
    for (const d of planet.decks) {
      const u = deckUnder(d, this.pos, planet.center);
      if (!u || Math.abs(u.z) > d.width / 2 + 0.05) continue;
      const vu3 = this.vel.dot(u.up);
      // from below the planks you can step up a little; from above you land on them
      const stepUp = this.grounded ? 0.8 : 0.35;
      if (u.lift > -0.15 && u.lift < stepUp && vu3 <= 0.5) {
        this.pos.addScaledVector(u.up, u.lift);
        if (vu3 < 0) this.vel.addScaledVector(u.up, -vu3);
        this.grounded = true; this.onDeck = true;
        const lim = d.width / 2 - 0.35;
        if (Math.abs(u.z) > lim) {
          this.pos.addScaledVector(u.side, Math.sign(u.z) * lim - u.z);
          const vs = this.vel.dot(u.side);
          if (vs * u.z > 0) this.vel.addScaledVector(u.side, -vs);
        }
      }
    }

    // Solid things: houses, trees, rocks, Hollo. Slide along them.
    resolveSolids(planet.solids, this.pos, planet.center, 0.38);

    // Warmth: climbing costs warmth, standing still or walking returns it slowly.
    if (this.hasDrop) {
      if (climbing) this.warmth = Math.max(0, this.warmth - dt * 0.09);
      else this.warmth = Math.min(1, this.warmth + dt * (moveDir.lengthSq() < 0.01 ? 0.35 : 0.12));
    } else this.warmth = 1;

    if (moveDir.lengthSq() > 0.01 && this.skidT <= 0) this.facing.lerp(moveDir.clone().normalize(), 1 - Math.exp(-10 * dt));
    this.facing.projectOnPlane(this.up).normalize();
    const sp = vTan.length();
    void this.stepTimer;
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
    // Tumbling: a forward roll on the ground, or a front flip in the air, turning about the middle of the body.
    let tuck = 0;
    if (this.rollT > 0) {
      const p = 1 - this.rollT / Player.ROLL;
      this.tumble = Math.PI * 2 * (p * p * (3 - 2 * p));
      tuck = Math.min(1, Math.sin(Math.PI * p) * 2.2);
    } else if (this.flipT > 0) {
      this.flipT += dt;
      const p = Math.min(1, this.flipT / 0.62);
      this.tumble = Math.PI * 2 * (p * p * (3 - 2 * p));
      tuck = Math.min(1, Math.sin(Math.PI * p) * 2);
      if (p >= 1) this.flipT = 0;
    } else this.tumble = 0;
    const c = 0.48;
    // curled into a ball: shorter and rounder
    this.person.root.scale.y *= 1 - tuck * 0.2; this.person.root.scale.x *= 1 + tuck * 0.08; this.person.root.scale.z *= 1 + tuck * 0.12;
    this.person.root.rotation.x = this.tumble;
    this.person.root.position.set(0, c - c * Math.cos(this.tumble) - (tuck * 0.18), -c * Math.sin(this.tumble));
    this.landT = Math.max(0, this.landT - dt);
    const crouch = this.landT > 0 ? Math.min(1, this.landT / 0.12) * this.landAmt : 0;
    this.lastSpeed = sp;
    const cold = this.hasDrop && this.warmth < 0.45 ? clamp((0.45 - this.warmth) / 0.35) : 0;
    this.person.animate(dt, {
      speed: sp, grounded: this.grounded, climbing, vUp: this.lastVUp,
      shiver: Math.max(cold, this.pose.shiver ?? 0),
      lookAt: this.lookAt, windLocal: this.windLocal,
      tuck, crouch,
      ...this.pose,
    } as PoseInput);
    const t = performance.now() / 1000;
    this.lantern.rotation.z = Math.sin(t * 2.2) * 0.05;
    // the body in motion: feet, legs, weight, lean, and cloth on springs
    if (this.planet) {
      const P = this.planet;
      const near = this.onDeck || this.pos.distanceTo(P.center) - P.surfaceRadius(this.pos.clone().sub(P.center).normalize()) < 0.4;
      const pz = this.pose;
      const busy = clamp(Math.max(pz.sit ?? 0, pz.kneel ?? 0, pz.lie ?? 0, tuck * 1.5, this.rollT > 0 || this.flipT > 0 ? 1 : 0, climbing ? 1 : 0, this.mode === 'climb' ? 1 : 0));
      // a change of action snaps to the new pose and lets the old one fade out (inertialization)
      if ((busy > 0.5) !== (this.lastBusy > 0.5)) this.motion.inertialize();
      this.lastBusy = busy;
      this.motion.update(dt, {
        planet: P, pos: this.pos, up: this.up, facing: this.facing, moveDir: this.lastMove,
        grounded: this.grounded && near, onDeck: this.onDeck, vUp: this.lastVUp, busy, crouch,
        skid: this.skidT > 0 ? Math.min(1, this.skidT / 0.08) : 0, wind: this.windLocal, running: this.running, gliding: this.gliding,
      });
      this.lastMove.set(0, 0, 0);
    }
    const glow = this.hasDrop ? (0.25 + this.dropGlow * 0.75) * (0.35 + 0.65 * this.warmth) : 0;
    this.lanternLight.intensity = glow * 1.1;
    (this.dropMesh.material as THREE.MeshBasicMaterial).color.setHSL(0.11, 0.95, 0.4 + glow * 0.5);
    this.dropMesh.visible = this.hasDrop;
    this.satchelMat.emissive.set('#ffd890');
    this.satchelMat.emissiveIntensity = this.satchelGlow * (0.55 + 0.45 * Math.sin(t * 3));
  }

  static ROLL = 0.55;

  sync() {
    this.root.position.copy(this.pos);
    orientTo(this.root, this.up, this.facing);
  }
}
