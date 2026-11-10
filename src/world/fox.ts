import * as THREE from 'three';
import { toon } from './props';
import { addOutlines } from '../render/paint';
import { orientTo } from './sphere';
import type { Planet } from './planet';

/**
 * The fox: an ordinary fox, no magic, who decides on her own to walk with Nilo from the Sky Isles on.
 * She never talks. She trots behind, sits when you stop, points her nose at things that matter,
 * flattens her ears near danger, and wags when she is pleased.
 */
export type FoxGesture = 'trot' | 'sit' | 'point' | 'wary' | 'wag' | 'sleep';

export interface FoxBody {
  root: THREE.Group; body: THREE.Group; head: THREE.Group; tail: THREE.Group; ears: THREE.Object3D[]; legs: THREE.Object3D[];
  /** The bushy tail's joints, root to tip (they sway one after another). */
  tailSegs: THREE.Group[];
  /** The kite string she is caught in (hidden once she is free). */
  tangle: THREE.Group;
}

/** A soft toon fox: orange coat, white bib, cheeks and tail tip, dark socks, big pointed ears and a friendly face. */
export function makeFox(): FoxBody {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const orange = '#ec7b2c', cream = '#fbf2e2', dark = '#3b2a2a', inner = '#f6d2b8';
  const mesh = (g: THREE.BufferGeometry, c: string, parent: THREE.Object3D, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, shadow = false) => {
    const m = new THREE.Mesh(g, toon(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = shadow; parent.add(m); return m;
  };
  const ball = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
  // a plump bean of a body, a white bib down the chest and a pale belly
  mesh(ball(0.2, 18, 12), orange, body, 0, 0.37, -0.03, 1, 0.92, 1.5, true);
  mesh(ball(0.15), cream, body, 0, 0.38, 0.19, 0.95, 1.12, 0.72);
  mesh(ball(0.13), cream, body, 0, 0.27, 0.0, 0.85, 0.55, 1.35);
  // legs: orange at the top, dark socks and little round paws (each pivots at the hip)
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.1, 0.17], [0.1, 0.17], [-0.1, -0.2], [0.1, -0.2]]) {
    const hip = new THREE.Group(); hip.position.set(x, 0.3, z); body.add(hip);
    mesh(new THREE.CapsuleGeometry(0.052, 0.08, 3, 8), orange, hip, 0, -0.05, 0);
    mesh(new THREE.CapsuleGeometry(0.044, 0.13, 3, 8), dark, hip, 0, -0.17, 0, 1, 1, 1, true);
    mesh(ball(0.052, 10, 8), dark, hip, 0, -0.265, 0.02, 1, 0.62, 1.3);
    legs.push(hip);
  }
  // the head: round, a little big (she is a young fox), white cheeks and muzzle, dark button nose
  const head = new THREE.Group(); head.position.set(0, 0.58, 0.3); body.add(head);
  mesh(ball(0.175, 18, 14), orange, head, 0, 0, 0, 1.06, 0.93, 0.96, true);
  for (const sd of [-1, 1]) mesh(ball(0.095, 12, 10), cream, head, 0.088 * sd, -0.08, 0.06, 1.05, 0.75, 0.95);
  mesh(ball(0.08, 12, 10), cream, head, 0, -0.05, 0.15, 0.85, 0.66, 1.4);
  mesh(ball(0.032, 10, 8), dark, head, 0, -0.025, 0.262, 1.3, 0.9, 1);
  // eyes: big, dark and glossy, a white glint in each; a small smile under the nose
  const glint = new THREE.MeshBasicMaterial({ color: '#ffffff' }), eyeM = new THREE.MeshBasicMaterial({ color: '#1d1420' });
  for (const sd of [-1, 1]) {
    const eye = new THREE.Mesh(ball(0.037, 12, 10), eyeM); eye.position.set(0.076 * sd, 0.045, 0.14); eye.scale.set(0.85, 1.15, 0.6); head.add(eye);
    const gl = new THREE.Mesh(ball(0.011, 8, 6), glint); gl.position.set(0.08 * sd + 0.008, 0.062, 0.168); head.add(gl);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 4, 12, Math.PI), toon(dark));
  smile.position.set(0, -0.07, 0.205); smile.rotation.set(-0.35, 0, Math.PI); head.add(smile);
  // big pointed ears: orange backs, pale insides, dark tips (each pivots at its base)
  const ears: THREE.Object3D[] = [];
  for (const sd of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(0.095 * sd, 0.12, -0.01); ear.rotation.set(0, 0, -0.32 * sd); head.add(ear);
    mesh(new THREE.ConeGeometry(0.078, 0.22, 4), orange, ear, 0, 0.1, 0, 1, 1, 0.45);
    mesh(new THREE.ConeGeometry(0.048, 0.14, 4), inner, ear, 0, 0.075, 0.022, 1, 1, 0.3);
    mesh(new THREE.ConeGeometry(0.034, 0.075, 4), dark, ear, 0, 0.182, 0, 1, 1, 0.5);
    ears.push(ear);
  }
  // the brush: three joints, getting fuller, with a white tip, lifted in a soft curve
  const tail = new THREE.Group(); tail.position.set(0, 0.4, -0.3); body.add(tail);
  const tailSegs: THREE.Group[] = [];
  let parent: THREE.Object3D = tail;
  const segs: [number, number, string, number][] = [[0.075, 0.17, orange, 0.6], [0.105, 0.2, orange, 0.15], [0.09, 0.13, cream, -0.3]];
  for (const [r, len, c, lift] of segs) {
    const j = new THREE.Group(); j.rotation.x = lift; parent.add(j);
    mesh(ball(r, 14, 10), c, j, 0, 0, -len * 0.55, 1, 1, (len / r) * 0.75, true);
    tailSegs.push(j);
    const next = new THREE.Group(); next.position.set(0, 0, -len); j.add(next); parent = next;
  }
  // the tangle of kite string round her middle and a hind leg, its loose end trailing off with a paper bow
  const tangle = new THREE.Group(); tangle.name = 'foxTangle'; body.add(tangle);
  const str = new THREE.MeshBasicMaterial({ color: '#f6ecd6' });
  const loop = (r: number, y: number, z: number, tx: number, tz: number) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 4, 28), str); m.position.set(0, y, z); m.rotation.set(Math.PI / 2 + tx, 0, tz); tangle.add(m);
  };
  loop(0.215, 0.37, 0.02, 0.35, 0.1); loop(0.205, 0.38, -0.12, -0.3, -0.15); loop(0.07, 0.15, -0.2, 0.2, 1.2);
  const trail = new THREE.CatmullRomCurve3([new THREE.Vector3(0.18, 0.33, -0.1), new THREE.Vector3(0.38, 0.12, -0.25), new THREE.Vector3(0.55, 0.02, -0.1), new THREE.Vector3(0.8, 0.01, -0.35)]);
  tangle.add(new THREE.Mesh(new THREE.TubeGeometry(trail, 24, 0.008, 4), str));
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 3), toon('#d8443a')); bow.position.set(0.8, 0.03, -0.35); bow.rotation.set(0, 0, Math.PI / 2); tangle.add(bow);
  root.userData.person = true;
  addOutlines(root, '#2e2230', 0.012);
  return { root, body, head, tail, ears, legs, tailSegs, tangle };
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

  /** A little hop for joy (when she is freed). */
  hop() { this.hopT = 0.001; }
  private hopT = 0;
  /** Cut free of the kite string. */
  free() { this.f.tangle.visible = false; this.hop(); }

  private pose(dt: number) {
    const { body, head, tail, ears, legs, tailSegs } = this.f, g = this.gesture, t = this.t;
    const k = 1 - Math.exp(-8 * dt);
    const trot = g === 'trot' ? 1 : 0;
    legs.forEach((l, i) => (l.rotation.x = trot * Math.sin(t * 14 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6));
    body.position.y = trot * Math.abs(Math.sin(t * 14)) * 0.03;
    const sit = g === 'sit' || g === 'wag' || g === 'point' ? 1 : 0;
    body.rotation.x += ((sit ? -0.45 : g === 'sleep' ? 0 : 0) - body.rotation.x) * k;
    body.position.y += g === 'sleep' ? -0.12 : 0;
    // sitting: the front paws stay on the ground (the body pitches up about them), the hind legs fold under her
    const pitch = Math.max(0, -Math.sin(body.rotation.x));
    body.position.y -= pitch * 0.19;
    const fold = pitch / 0.43;
    legs.forEach((l, i) => { l.rotation.x += i < 2 ? pitch * 1.05 : -fold * 0.95; });
    head.rotation.x += ((g === 'point' ? -0.25 : g === 'sleep' ? 0.5 : g === 'wary' ? 0.25 : sit ? 0.35 : 0) - head.rotation.x) * k;
    head.rotation.y = g === 'sit' ? Math.sin(t * 0.7) * 0.3 : 0;
    ears.forEach((e, i) => (e.rotation.x += ((g === 'wary' ? -0.9 : g === 'point' ? 0.2 : 0) - e.rotation.x) * k * (i ? 1 : 0.9)));
    tail.rotation.y = g === 'wag' ? Math.sin(t * 16) * 0.6 : g === 'trot' ? Math.sin(t * 7) * 0.15 : Math.sin(t * 1.2) * 0.1;
    tail.rotation.x = g === 'wary' ? -0.5 : g === 'sleep' ? -0.6 : 0;
    // the brush follows through, joint after joint, a lazy sway even sitting still
    tailSegs.forEach((j, i) => (j.rotation.y = Math.sin(t * (g === 'wag' ? 16 : 2.1) - i * 0.8) * (g === 'wag' ? 0.25 : 0.16) * (1 + i * 0.5)));
    // an ear flicks now and then (one, then the other)
    const flick = Math.max(0, Math.sin(t * 0.9) - 0.96) * 25, side = Math.sin(t * 0.45) > 0 ? 0 : 1;
    ears.forEach((e, i) => (e.rotation.y = i === side ? -flick * 0.5 * (i ? -1 : 1) : 0));
    // the hop
    if (this.hopT > 0) {
      this.hopT += dt;
      const h = Math.min(1, this.hopT / 0.55);
      body.position.y += Math.sin(Math.PI * h) * 0.32;
      body.rotation.x = -Math.sin(Math.PI * h) * 0.35;
      if (h >= 1) this.hopT = 0;
    }
  }
}
