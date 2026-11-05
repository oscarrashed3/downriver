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
      fwd = toP.clone().applyAxisAngle(this.up, this.talking ? away * 0.2 : away * 0.4);
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
  ysolde: { skin: '#eccdb6', hair: '#eeeae2', hairStyle: 'crown', top: '#4a4c78', coat: '#3f4570', coatLen: 1, dress: true, trousers: '#3a3a5a', boots: '#5a3a28', shawl: '#7a7068', apron: '#4a4f7e', height: 0.86, build: 1.0, hunch: 0.35, idle: 'lean', voice: 0.85, props: ['stick', 'tinCup', 'brooch'] },
  tor: { skin: '#f0c6a0', hair: '#5a3a26', hairStyle: 'fringe', top: '#e8d8b0', coat: '#b04a30', coatLen: 0.42, trousers: '#5a4a3a', boots: '#6a4428', height: 0.68, head: 1.22, build: 0.9, ears: 1.6, hat: 'cap', hatColor: '#8a5530', satchel: true, idle: 'tinker', voice: 1.45, props: ['goggles', 'kneePads', 'kiteString'] },
  bram: { skin: '#d8a080', hair: '#7a5a42', hairStyle: 'short', top: '#ece2cc', vest: '#9a7a52', trousers: '#4a4440', boots: '#4a3020', beard: '#9a7656', mustache: '#9a7656', height: 1.04, build: 1.45, rolledSleeves: true, hat: 'wide', hatColor: '#5a4232', idle: 'scratch', voice: 0.7, props: ['bell', 'lavender'] },
  nima: { skin: '#c99272', hair: '#241a18', hairStyle: 'curly', top: '#f0e2b8', coat: '#efdcae', coatLen: 0.42, trousers: '#6a7a48', boots: '#c99272', barefoot: true, height: 0.86, head: 1.1, build: 0.85, idle: 'point', voice: 1.6, props: ['notebook'] },
  odo: { skin: '#e8b898', hair: '#eeeae2', hairStyle: 'bald', top: '#d8d4c4', vest: undefined, coat: '#6a4a30', coatLen: 0.5, trousers: '#5a5a62', boots: '#5a3a26', mustache: '#eeeae2', glasses: true, height: 1.0, build: 0.82, hunch: 0.3, idle: 'polish', voice: 0.95, props: ['kettle', 'towel'] },
  tamsin: { skin: '#d8b090', hair: '#2a2020', hairStyle: 'long', top: '#d8a070', coat: '#a8503a', coatLen: 0.7, trousers: '#3a3030', boots: '#2a2020', idle: 'none', voice: 1.1 },
  oro: { skin: '#8a5a40', hair: '#1a1410', hairStyle: 'short', top: '#c8a050', coat: '#3a7a50', coatLen: 0.6, trousers: '#4a3a28', boots: '#3a2a1a', hat: 'wide', hatColor: '#c8a050', height: 0.95, idle: 'none', voice: 0.9 },
  sefa: { skin: '#b07850', hair: '#1a1410', hairStyle: 'long', top: '#5a7ab0', coat: '#e8c8a0', coatLen: 1, dress: true, trousers: '#8a6a4a', boots: '#6a4a2a', scarf: '#5a7ab0', idle: 'none', voice: 1.2 },
  cassian: { skin: '#d8b090', hair: '#e8e4dc', hairStyle: 'short', top: '#f0e8d8', coat: '#f0e8d8', coatLen: 1, dress: true, trousers: '#c8b8a0', boots: '#6a4a2a', beard: '#e8e4dc', shawl: '#a83a3a', height: 1.05, idle: 'none', voice: 0.8 },
  maren: { skin: '#c89070', hair: '#3a2a20', hairStyle: 'bun', top: '#e8e0d0', coat: '#3a6a90', coatLen: 0.8, trousers: '#3a3a48', boots: '#3a2a20', idle: 'none', voice: 1.05 },
};
