import * as THREE from 'three';
import { toon } from '../world/props';
import { orientTo } from '../world/sphere';
import type { Mood } from './connection';
import { lerp } from '../world/noise';

export interface NpcLook { robe: string; skin: string; accent: string; hat?: 'hood' | 'wide' | 'band' | 'none'; height?: number; beard?: boolean }

/** A stranger. Their mood is hidden, but shows in how they stand, turn and glow. */
export class Npc {
  root = new THREE.Group();
  body = new THREE.Group();
  head = new THREE.Group();
  aura: THREE.Mesh;
  mood: Mood;
  shown: Mood;
  up = new THREE.Vector3();
  homeForward = new THREE.Vector3();
  talking = false;
  private t = Math.random() * 10;

  constructor(public id: string, look: NpcLook, mood: Mood) {
    this.mood = { ...mood }; this.shown = { ...mood };
    const h = look.height ?? 1;
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.62 * h, 1.5 * h, 10), toon(look.robe));
    robe.position.y = 0.75 * h;
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.42 * h, 10, 8), toon(look.robe));
    shoulders.position.y = 1.35 * h; shoulders.scale.set(1, 0.6, 0.85);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.3 * h, 12, 10), toon(look.skin));
    face.position.y = 0.0;
    this.head.add(face);
    for (const x of [-0.1, 0.1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.035 * h, 6, 4), toon('#2a2438'));
      e.position.set(x * h, 0.03 * h, 0.27 * h); this.head.add(e);
    }
    if (look.beard) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.2 * h, 0.4 * h, 7), toon('#e8e4dc'));
      b.position.set(0, -0.22 * h, 0.17 * h); b.rotation.x = Math.PI; this.head.add(b);
    }
    const acc = toon(look.accent);
    switch (look.hat ?? 'hood') {
      case 'hood': { const hd = new THREE.Mesh(new THREE.SphereGeometry(0.36 * h, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), acc); hd.position.set(0, 0.05 * h, -0.05 * h); hd.rotation.x = -0.35; this.head.add(hd); break; }
      case 'wide': { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.62 * h, 0.62 * h, 0.06 * h, 16), acc); br.position.y = 0.2 * h; const cr = new THREE.Mesh(new THREE.ConeGeometry(0.3 * h, 0.4 * h, 12), acc); cr.position.y = 0.4 * h; this.head.add(br, cr); break; }
      case 'band': { const bd = new THREE.Mesh(new THREE.TorusGeometry(0.29 * h, 0.05 * h, 6, 16), acc); bd.rotation.x = Math.PI / 2; bd.position.y = 0.12 * h; this.head.add(bd); break; }
    }
    this.head.position.y = 1.72 * h;
    this.body.add(robe, shoulders, this.head);
    this.root.add(this.body);
    this.aura = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.6, 32), new THREE.MeshBasicMaterial({ color: '#8fb8ff', transparent: true, opacity: 0.0, depthWrite: false }));
    this.aura.rotation.x = -Math.PI / 2; this.aura.position.y = 0.05;
    this.root.add(this.aura);
  }

  place(pos: THREE.Vector3, up: THREE.Vector3, forward: THREE.Vector3) {
    this.root.position.copy(pos); this.up.copy(up); this.homeForward.copy(forward);
    orientTo(this.root, up, forward);
  }

  update(dt: number, playerPos: THREE.Vector3 | null) {
    this.t += dt;
    const k = 1 - Math.exp(-2.5 * dt);
    this.shown.trust = lerp(this.shown.trust, this.mood.trust, k);
    this.shown.worry = lerp(this.shown.worry, this.mood.worry, k);
    this.shown.openness = lerp(this.shown.openness, this.mood.openness, k);
    const s = this.shown;
    // Turn toward the player as trust grows; turn partly away when trust is low.
    let fwd = this.homeForward.clone();
    if (playerPos && (this.talking || playerPos.distanceTo(this.root.position) < 9)) {
      const toP = playerPos.clone().sub(this.root.position).projectOnPlane(this.up).normalize();
      const side = new THREE.Vector3().crossVectors(this.up, toP);
      const away = (1 - s.trust) * 1.2; // radians turned away
      fwd = toP.clone().applyAxisAngle(this.up, this.talking ? away * 0.8 : away * 0.4);
      void side;
    }
    const cur = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
    cur.lerp(fwd, 1 - Math.exp(-3 * dt));
    orientTo(this.root, this.up, cur);
    // Lean in with openness, shrink back with worry; head drops when worried.
    this.body.rotation.x = (s.openness - 0.45) * 0.35 - (s.worry - 0.5) * 0.15;
    this.head.rotation.x = (s.worry - 0.4) * 0.5;
    this.head.rotation.z = Math.sin(this.t * 0.7) * 0.04 + (this.talking ? Math.sin(this.t * 3) * 0.04 : 0);
    const breath = 1 + Math.sin(this.t * 1.6) * 0.015;
    this.body.scale.set(1, breath * (0.94 + s.trust * 0.08), 1);
    // Warmth around them: cold blue when guarded, amber when they trust you.
    const am = this.aura.material as THREE.MeshBasicMaterial;
    am.color.setRGB(lerp(0.55, 1.0, s.trust), lerp(0.7, 0.78, s.trust), lerp(1.0, 0.45, s.trust));
    am.opacity = this.talking ? 0.35 : (playerPos && playerPos.distanceTo(this.root.position) < 6 ? 0.18 : 0);
    this.aura.scale.setScalar(0.8 + s.trust * 0.6);
  }
}

export const LOOKS: Record<string, NpcLook> = {
  ysolde: { robe: '#5d5a8a', skin: '#e8cdb8', accent: '#cfd6f0', hat: 'hood', height: 1.05 },
  bram: { robe: '#8a5a3a', skin: '#d8a888', accent: '#c8a04a', hat: 'wide', height: 1.1, beard: true },
  nima: { robe: '#d86a5a', skin: '#c89070', accent: '#f4d06a', hat: 'band', height: 0.72 },
  tor: { robe: '#4a6a7a', skin: '#e0c0a8', accent: '#9ab0c0', hat: 'none', height: 1.0, beard: true },
  tamsin: { robe: '#a8503a', skin: '#d8b090', accent: '#3a3030', hat: 'band', height: 1.05 },
  oro: { robe: '#3a7a50', skin: '#8a5a40', accent: '#c8a050', hat: 'wide', height: 0.95 },
  sefa: { robe: '#e8c8a0', skin: '#b07850', accent: '#5a7ab0', hat: 'hood', height: 1.0 },
  cassian: { robe: '#f0e8d8', skin: '#d8b090', accent: '#a83a3a', hat: 'none', height: 1.08, beard: true },
  maren: { robe: '#3a6a90', skin: '#c89070', accent: '#e8e0d0', hat: 'band', height: 1.0 },
};
