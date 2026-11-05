import * as THREE from 'three';
import { toon } from './props';
import { addOutlines } from '../render/paint';
import { orientTo } from './sphere';
import type { Planet } from './planet';

/**
 * The fox: an ordinary fox, no magic, who decides on her own to walk with Nilo from the Green Deep on.
 * She never talks. She trots behind, sits when you stop, points her nose at things that matter,
 * flattens her ears near danger, and wags when she is pleased.
 */
export type FoxGesture = 'trot' | 'sit' | 'point' | 'wary' | 'wag' | 'sleep';

export interface FoxBody { root: THREE.Group; body: THREE.Group; head: THREE.Group; tail: THREE.Group; ears: THREE.Mesh[]; legs: THREE.Mesh[] }

export function makeFox(): FoxBody {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const orange = '#d8742e', cream = '#f4e6cc', dark = '#3a2a24';
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 4, 10), toon(orange)); torso.rotation.x = Math.PI / 2; torso.position.y = 0.36; torso.castShadow = true; body.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), toon(cream)); chest.position.set(0, 0.32, 0.22); chest.scale.set(0.9, 1, 0.8); body.add(chest);
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.09, 0.2], [0.09, 0.2], [-0.09, -0.2], [0.09, -0.2]]) {
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.22, 3, 6), toon(dark)); l.position.set(x, 0.15, z); l.castShadow = true; body.add(l); legs.push(l);
  }
  const head = new THREE.Group(); head.position.set(0, 0.52, 0.32); body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), toon(orange)); skull.scale.set(1, 0.9, 1); head.add(skull);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 8), toon(cream)); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.03, 0.17); head.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), toon(dark)); nose.position.set(0, -0.02, 0.27); head.add(nose);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), new THREE.MeshBasicMaterial({ color: '#1a1420' })); eye.position.set(0.06 * s, 0.03, 0.11); head.add(eye);
  }
  const ears: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.15, 4), toon(orange)); ear.position.set(0.08 * s, 0.14, -0.01); ear.rotation.z = -0.25 * s; head.add(ear); ears.push(ear);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 4), toon(dark)); tip.position.y = 0.05; ear.add(tip);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.42, -0.28); body.add(tail);
  const brush = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.32, 4, 8), toon(orange)); brush.position.set(0, 0, -0.2); brush.rotation.x = -1.1; brush.castShadow = true; tail.add(brush);
  const tipT = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), toon(cream)); tipT.position.set(0, 0.16, -0.36); tail.add(tipT);
  addOutlines(root, '#2e2230', 0.012);
  return { root, body, head, tail, ears, legs };
}

/** The companion: follows, and speaks only with her body. */
export class Fox {
  f: FoxBody;
  dir = new THREE.Vector3(0, 1, 0);
  gesture: FoxGesture = 'sit';
  t = 0;
  speed = 0;
  stillT = 0;
  /** A place she is pointing her nose at, if any. */
  poi: THREE.Vector3 | null = null;
  constructor() { this.f = makeFox(); this.f.root.scale.setScalar(1.35); }

  place(p: Planet, d: THREE.Vector3) { this.dir.copy(d).normalize(); p.surfacePoint(this.dir, -0.02, this.f.root.position); orientTo(this.f.root, this.dir); }

  /** Trot to a spot a little behind and beside the player, then sit. Gestures come from what is around. */
  update(dt: number, p: Planet, playerPos: THREE.Vector3, playerFacing: THREE.Vector3, opts: { danger?: boolean; happy?: boolean; poi?: THREE.Vector3 | null }) {
    this.t += dt;
    const up = this.dir;
    const side = new THREE.Vector3().crossVectors(up, playerFacing).normalize();
    const goalPos = playerPos.clone().addScaledVector(playerFacing, -1.6).addScaledVector(side, -1.1);
    const goal = goalPos.sub(p.center).normalize();
    const gap = this.f.root.position.distanceTo(playerPos);
    const prev = this.dir.clone();
    if (gap > 2.4) this.dir.lerp(goal, 1 - Math.exp(-(gap > 10 ? 5 : 2.2) * dt)).normalize();
    p.surfacePoint(this.dir, -0.02, this.f.root.position);
    const mv = this.dir.clone().sub(prev).multiplyScalar(p.R);
    this.speed = mv.length() / Math.max(dt, 1e-3);
    this.stillT = this.speed < 0.3 ? this.stillT + dt : 0;
    this.poi = opts.poi ?? null;
    this.gesture = opts.danger ? 'wary' : this.speed > 0.4 ? 'trot' : opts.happy ? 'wag' : this.poi && this.stillT > 1.5 ? 'point' : this.stillT > 25 ? 'sleep' : 'sit';
    const face = this.gesture === 'point' && this.poi ? this.poi.clone().sub(this.f.root.position) : mv.lengthSq() > 1e-8 ? mv : playerPos.clone().sub(this.f.root.position);
    if (face.projectOnPlane(this.dir).lengthSq() > 1e-6) orientTo(this.f.root, this.dir, face);
    this.pose(dt);
  }

  private pose(dt: number) {
    const { body, head, tail, ears, legs } = this.f, g = this.gesture, t = this.t;
    const k = 1 - Math.exp(-8 * dt);
    const trot = g === 'trot' ? 1 : 0;
    legs.forEach((l, i) => (l.rotation.x = trot * Math.sin(t * 14 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6));
    body.position.y = trot * Math.abs(Math.sin(t * 14)) * 0.03;
    const sit = g === 'sit' || g === 'wag' || g === 'point' ? 1 : 0;
    body.rotation.x += ((sit ? -0.45 : g === 'sleep' ? 0 : 0) - body.rotation.x) * k;
    body.position.y += g === 'sleep' ? -0.12 : 0;
    head.rotation.x += ((g === 'point' ? -0.25 : g === 'sleep' ? 0.5 : g === 'wary' ? 0.25 : sit ? 0.35 : 0) - head.rotation.x) * k;
    head.rotation.y = g === 'sit' ? Math.sin(t * 0.7) * 0.3 : 0;
    ears.forEach((e, i) => (e.rotation.x += ((g === 'wary' ? -0.9 : g === 'point' ? 0.2 : 0) - e.rotation.x) * k * (i ? 1 : 0.9)));
    tail.rotation.y = g === 'wag' ? Math.sin(t * 16) * 0.6 : g === 'trot' ? Math.sin(t * 7) * 0.15 : Math.sin(t * 1.2) * 0.1;
    tail.rotation.x = g === 'wary' ? 0.6 : g === 'sleep' ? 0.9 : 0;
  }
}
