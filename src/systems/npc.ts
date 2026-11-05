import * as THREE from 'three';
import { orientTo } from '../world/sphere';
import type { Mood } from './connection';
import { lerp } from '../world/noise';
import { Person, type PersonLook, type IdleKind, type PoseInput } from '../player/person';

export interface NpcLook extends PersonLook { idle?: IdleKind; voice?: number }

/** A stranger. Their mood is hidden, but shows in how they stand, turn and glow. */
export class Npc {
  root = new THREE.Group();
  person: Person;
  aura: THREE.Mesh;
  mood: Mood;
  shown: Mood;
  up = new THREE.Vector3();
  homeForward = new THREE.Vector3();
  homePos = new THREE.Vector3();
  talking = false;
  /** Story overrides: where to stand, what pose to hold, who to watch. */
  pose: Partial<PoseInput> = {};
  lookAt: THREE.Vector3 | null = null;
  faceOverride: THREE.Vector3 | null = null;
  speedShown = 0;
  idle: IdleKind;
  voice: number;
  private t = Math.random() * 10;
  smileT = 0;

  constructor(public id: string, public look: NpcLook, mood: Mood) {
    this.mood = { ...mood }; this.shown = { ...mood };
    this.person = new Person(look);
    this.idle = look.idle ?? 'none';
    this.voice = look.voice ?? 1;
    this.root.add(this.person.root);
    this.aura = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.6, 32), new THREE.MeshBasicMaterial({ color: '#8fb8ff', transparent: true, opacity: 0.0, depthWrite: false }));
    this.aura.rotation.x = -Math.PI / 2; this.aura.position.y = 0.05;
    this.root.add(this.aura);
  }

  place(pos: THREE.Vector3, up: THREE.Vector3, forward: THREE.Vector3) {
    this.root.position.copy(pos); this.up.copy(up); this.homeForward.copy(forward); this.homePos.copy(pos);
    orientTo(this.root, up, forward);
  }

  update(dt: number, playerPos: THREE.Vector3 | null, windLocal?: THREE.Vector3) {
    this.t += dt;
    const k = 1 - Math.exp(-2.5 * dt);
    this.shown.trust = lerp(this.shown.trust, this.mood.trust, k);
    this.shown.worry = lerp(this.shown.worry, this.mood.worry, k);
    this.shown.openness = lerp(this.shown.openness, this.mood.openness, k);
    const s = this.shown;
    const near = !!playerPos && playerPos.distanceTo(this.root.position) < 9;
    // Turn toward the player as trust grows; turn partly away when trust is low.
    let fwd = this.homeForward.clone();
    if (this.faceOverride) fwd = this.faceOverride.clone().projectOnPlane(this.up);
    else if (playerPos && (this.talking || (near && !this.pose.lie && !this.pose.sit))) {
      const toP = playerPos.clone().sub(this.root.position).projectOnPlane(this.up).normalize();
      const away = (1 - s.trust) * 1.2;
      fwd = toP.clone().applyAxisAngle(this.up, this.talking ? away * 0.8 : away * 0.4);
    }
    const cur = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
    cur.lerp(fwd, 1 - Math.exp(-3 * dt));
    orientTo(this.root, this.up, cur);
    // Lean in with openness, shrink back with worry; head drops when worried.
    const p = this.person;
    const smile = this.smileT > 0 ? 1 : (this.talking && s.trust > 0.6 ? 1 : 0);
    this.smileT = Math.max(0, this.smileT - dt);
    p.animate(dt, {
      speed: this.speedShown, grounded: true, talking: this.talking, idle: this.talking ? 'none' : this.idle,
      smile, listen: 0,
      lookAt: this.lookAt ?? (playerPos && (near || this.talking) && !this.pose.lie ? playerPos.clone().addScaledVector(this.up, 1.4) : null),
      windLocal, ...this.pose,
    } as PoseInput);
    p.body.rotation.x += (s.openness - 0.45) * 0.25 - (s.worry - 0.5) * 0.12;
    p.head.rotation.x += (s.worry - 0.4) * 0.35;
    // Warmth around them: cold blue when guarded, amber when they trust you.
    const am = this.aura.material as THREE.MeshBasicMaterial;
    am.color.setRGB(lerp(0.55, 1.0, s.trust), lerp(0.7, 0.78, s.trust), lerp(1.0, 0.45, s.trust));
    am.opacity = this.talking ? 0.3 : (playerPos && playerPos.distanceTo(this.root.position) < 6 ? 0.14 : 0);
    this.aura.scale.setScalar(0.8 + s.trust * 0.6);
  }
}

export const LOOKS: Record<string, NpcLook> = {
  ysolde: { skin: '#eccdb6', hair: '#f2f0ea', hairStyle: 'bun', top: '#8a86b8', coat: '#5d5a8a', coatLen: 1, dress: true, trousers: '#4a4466', boots: '#4a3a3a', shawl: '#c8a86a', height: 0.9, build: 1.05, hunch: 0.5, idle: 'weave', voice: 0.85 },
  tor: { skin: '#f0c6a0', hair: '#c0703a', hairStyle: 'messy', top: '#e8d8a8', coat: '#4f7a5a', coatLen: 0.45, trousers: '#5a4a3a', boots: '#6a4a30', height: 0.7, head: 1.2, build: 0.9, hat: 'cap', hatColor: '#3d6a8a', idle: 'tinker', voice: 1.45 },
  bram: { skin: '#d8a888', hair: '#5a3a28', hairStyle: 'short', top: '#c8b090', coat: '#7a5236', coatLen: 0.7, trousers: '#4a4038', boots: '#3a2a20', beard: '#6a4a32', height: 1.08, build: 1.35, hat: 'wide', hatColor: '#8a6a3a', idle: 'count', voice: 0.7 },
  nima: { skin: '#c99272', hair: '#2a1e1a', hairStyle: 'pigtails', top: '#f4e0b0', coat: '#d0584a', coatLen: 0.75, dress: true, trousers: '#5a3a3a', boots: '#7a4a2a', scarf: '#f2c84a', height: 0.62, head: 1.25, build: 0.85, idle: 'point', voice: 1.6 },
  odo: { skin: '#e0b898', hair: '#f2f0ea', hairStyle: 'bald', top: '#d8d0b8', coat: '#3f5a7a', coatLen: 0.95, trousers: '#3a3a48', boots: '#3a2e28', beard: '#f2f0ea', glasses: true, hat: 'paper', height: 0.95, build: 0.9, hunch: 0.35, idle: 'fold', voice: 0.95 },
  tamsin: { skin: '#d8b090', hair: '#2a2020', hairStyle: 'long', top: '#d8a070', coat: '#a8503a', coatLen: 0.7, trousers: '#3a3030', boots: '#2a2020', idle: 'none', voice: 1.1 },
  oro: { skin: '#8a5a40', hair: '#1a1410', hairStyle: 'short', top: '#c8a050', coat: '#3a7a50', coatLen: 0.6, trousers: '#4a3a28', boots: '#3a2a1a', hat: 'wide', hatColor: '#c8a050', height: 0.95, idle: 'none', voice: 0.9 },
  sefa: { skin: '#b07850', hair: '#1a1410', hairStyle: 'long', top: '#5a7ab0', coat: '#e8c8a0', coatLen: 1, dress: true, trousers: '#8a6a4a', boots: '#6a4a2a', scarf: '#5a7ab0', idle: 'none', voice: 1.2 },
  cassian: { skin: '#d8b090', hair: '#e8e4dc', hairStyle: 'short', top: '#f0e8d8', coat: '#f0e8d8', coatLen: 1, dress: true, trousers: '#c8b8a0', boots: '#6a4a2a', beard: '#e8e4dc', shawl: '#a83a3a', height: 1.05, idle: 'none', voice: 0.8 },
  maren: { skin: '#c89070', hair: '#3a2a20', hairStyle: 'bun', top: '#e8e0d0', coat: '#3a6a90', coatLen: 0.8, trousers: '#3a3a48', boots: '#3a2a20', idle: 'none', voice: 1.05 },
};
