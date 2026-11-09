import * as THREE from 'three';
import { orientTo } from '../world/sphere';
import { lerp } from '../world/noise';
import { paint, softRamp } from '../render/paint';

/** Paper with a few fibers and a small ink drawing of a river on it. */
function paperTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f4ead2'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    x.strokeStyle = `rgba(150,120,80,${0.04 + Math.random() * 0.06})`; x.lineWidth = 1;
    const px = Math.random() * 256, py = Math.random() * 256;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random() - 0.5) * 18, py + (Math.random() - 0.5) * 18); x.stroke();
  }
  // faint handwriting lines: this paper was a letter once
  x.strokeStyle = 'rgba(70,60,90,0.16)'; x.lineWidth = 2;
  for (let l = 0; l < 7; l++) { x.beginPath(); let px = 20; const py = 30 + l * 26; x.moveTo(px, py); while (px < 230) { px += 6 + Math.random() * 8; x.lineTo(px, py + Math.sin(px * 0.3) * 2); } x.stroke(); }
  // the ink river and a small boat
  x.strokeStyle = 'rgba(40,70,120,0.7)'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(30, 220); x.bezierCurveTo(90, 150, 150, 240, 230, 170); x.stroke();
  x.fillStyle = 'rgba(40,40,60,0.75)'; x.beginPath(); x.moveTo(140, 190); x.lineTo(170, 190); x.lineTo(162, 200); x.lineTo(148, 200); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(155, 189); x.lineTo(155, 172); x.lineTo(166, 186); x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tri(pts: number[][], uv: number[][]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv.flat(), 2));
  g.computeVertexNormals();
  return g;
}

/** Fold: a living paper boat, folded from an old letter. Raft, kite and map case. Never speaks. */
export type FoldMood = 'calm' | 'happy' | 'curious' | 'sleepy' | 'scared' | 'cold';

/** Fold's shapes across the journey. Each world teaches one; the boat and the kite come first. */
export const FOLD_FORMS = [
  { id: 'boat', name: 'Boat', world: 'The Spring Peaks', flag: 'read-letter', text: 'Carries you down the river.' },
  { id: 'kite', name: 'Kite', world: 'The Spring Peaks', flag: 'power:kite', text: 'Opens while you fall, so you glide.' },
  { id: 'crane', name: 'Crane', world: 'The Sky Isles', flag: 'form:crane', text: 'Rides the wind ahead and shows the way between the islands.' },
  { id: 'seed', name: 'Seed', world: 'The Overgrown Garden', flag: 'form:seed', text: 'Spins down slowly from the tallest flowers.' },
  { id: 'sail', name: 'Sail', world: 'The Endless Sea', flag: 'form:sail', text: 'Catches the wind across open water.' },
  { id: 'fan', name: 'Fan', world: 'The Painted Desert', flag: 'form:fan', text: 'Cools you, and sweeps the sand off old signs.' },
  { id: 'lantern', name: 'Lantern', world: 'Lantern Town', flag: 'form:lantern', text: 'A small light of your own among all the others.' },
] as const;

/** How Fold feels, from what is happening around you. Pure, so it can be tested. */
export function foldMood(c: { night: number; cold: number; nearGiant: boolean; running: boolean; falling: boolean; justHappy: boolean }): FoldMood {
  if (c.justHappy) return 'happy';
  if (c.falling) return 'scared';
  if (c.cold > 0.6) return 'cold';
  if (c.nearGiant) return 'curious';
  if (c.night > 0.7 && !c.running) return 'sleepy';
  return 'calm';
}

export class Fold {
  mood: FoldMood = 'calm';
  private eyes: THREE.Mesh[] = [];
  private lookAtPoi: THREE.Vector3 | null = null;
  root = new THREE.Group();
  boat = new THREE.Group();
  kite = new THREE.Group();
  pos = new THREE.Vector3();
  t = 0;
  squash = 0;
  raft = false;
  happy = 0;
  kiteMode = false;
  kiteAmt = 0;
  tail: THREE.Mesh[] = [];
  string: THREE.Line;

  constructor() {
    const tex = paperTexture();
    const paper = paint(new THREE.MeshToonMaterial({ map: tex, gradientMap: softRamp(), side: THREE.DoubleSide, transparent: true, opacity: 0.96 }), { variation: 0.2 });
    // The classic paper boat: two sloped hull faces, two end triangles, and the tall middle sail.
    const L = 0.7, W = 0.24, Hh = 0.22, S = 0.42;
    const hull = tri([
      [-L, Hh, 0], [L, Hh, 0], [L * 0.55, 0, W], [-L, Hh, 0], [L * 0.55, 0, W], [-L * 0.55, 0, W],
      [-L, Hh, 0], [-L * 0.55, 0, -W], [L * 0.55, 0, -W], [-L, Hh, 0], [L * 0.55, 0, -W], [L, Hh, 0],
      [-L * 0.55, 0, W], [L * 0.55, 0, W], [L * 0.55, 0, -W], [-L * 0.55, 0, W], [L * 0.55, 0, -W], [-L * 0.55, 0, -W],
    ], [[0, 1], [1, 1], [0.8, 0.5], [0, 1], [0.8, 0.5], [0.2, 0.5], [0, 1], [0.2, 0.5], [0.8, 0.5], [0, 1], [0.8, 0.5], [1, 1], [0.2, 0.5], [0.8, 0.5], [0.8, 0], [0.2, 0.5], [0.8, 0], [0.2, 0]]);
    const sail = tri([
      [-L * 0.45, Hh, 0.02], [L * 0.45, Hh, 0.02], [0, Hh + S, 0], [-L * 0.45, Hh, -0.02], [0, Hh + S, 0], [L * 0.45, Hh, -0.02],
    ], [[0.1, 0.2], [0.9, 0.2], [0.5, 0.95], [0.1, 0.2], [0.5, 0.95], [0.9, 0.2]]);
    const hm = new THREE.Mesh(hull, paper), sm = new THREE.Mesh(sail, paper);
    hm.castShadow = sm.castShadow = true;
    const crease = new THREE.LineSegments(new THREE.EdgesGeometry(hull, 20), new THREE.LineBasicMaterial({ color: '#8a7a5a', transparent: true, opacity: 0.55 }));
    const crease2 = new THREE.LineSegments(new THREE.EdgesGeometry(sail, 20), new THREE.LineBasicMaterial({ color: '#8a7a5a', transparent: true, opacity: 0.55 }));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: '#2a2438' }));
    eye.position.set(0.5, 0.15, 0.12);
    const eye2 = eye.clone(); eye2.position.z = -0.12;
    this.eyes = [eye, eye2];
    this.boat.add(hm, sm, crease, crease2, eye, eye2);
    this.root.add(this.boat);

    // Kite: a paper diamond with two spars and a ribbon tail.
    const kp = tri([[0, 0.9, 0], [0.55, 0.2, 0], [0, -0.7, 0], [0, 0.9, 0], [0, -0.7, 0], [-0.55, 0.2, 0]], [[0.5, 1], [1, 0.6], [0.5, 0], [0.5, 1], [0.5, 0], [0, 0.6]]);
    const km = new THREE.Mesh(kp, paper);
    const spar = new THREE.MeshBasicMaterial({ color: '#6a4a30' });
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.6, 0.02), spar); s1.position.y = 0.1;
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.02), spar); s2.position.y = 0.2;
    this.kite.add(km, s1, s2);
    const ribbon = new THREE.MeshBasicMaterial({ color: '#3f86b8', side: THREE.DoubleSide });
    let parent: THREE.Object3D = this.kite;
    for (let i = 0; i < 6; i++) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.28), ribbon);
      r.position.y = i === 0 ? -0.85 : -0.3;
      parent.add(r); parent = r; this.tail.push(r);
    }
    this.kite.visible = false;
    this.root.add(this.kite);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    this.string = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: '#f4ead2', transparent: true, opacity: 0.7 }));
    this.string.frustumCulled = false;
    this.string.visible = false;
    this.root.scale.setScalar(0.8);
  }

  /** A spot to settle on for a while (his satchel, during the "Look up." shot), instead of hovering at his shoulder. */
  perch: THREE.Vector3 | null = null;

  update(dt: number, playerPos: THREE.Vector3, up: THREE.Vector3, facing: THREE.Vector3, raftMode: boolean) {
    this.t += dt;
    this.raft = raftMode;
    this.kiteAmt = lerp(this.kiteAmt, this.kiteMode ? 1 : 0, 1 - Math.exp(-6 * dt));
    const side = new THREE.Vector3().crossVectors(up, facing).normalize();
    const kiteGoal = playerPos.clone().addScaledVector(up, 3.2 + Math.sin(this.t * 1.3) * 0.2).addScaledVector(facing, 0.6);
    const goal = raftMode
      ? playerPos.clone().addScaledVector(up, 0.12)
      : playerPos.clone().addScaledVector(up, 1.75 + Math.sin(this.t * 2.2) * 0.12).addScaledVector(side, -0.85).addScaledVector(facing, -0.3);
    goal.lerp(kiteGoal, this.kiteAmt);
    if (this.perch) goal.copy(this.perch);
    this.pos.lerp(goal, 1 - Math.exp(-(raftMode ? 30 : 6 + this.kiteAmt * 10) * dt));
    this.root.position.copy(this.pos);
    orientTo(this.root, up, side.clone().negate());
    const target = raftMode ? 2.6 : 0.8 + this.kiteAmt * 1.2;
    const s = lerp(this.root.scale.x, target, 1 - Math.exp(-8 * dt));
    this.squash = lerp(this.squash, 0, 1 - Math.exp(-8 * dt));
    this.root.scale.set(s * (1 + this.squash * 0.5), s * (1 - this.squash), s);
    this.boat.visible = this.kiteAmt < 0.5;
    this.kite.visible = this.kiteAmt >= 0.5;
    this.boat.rotation.z = Math.sin(this.t * 1.7) * (raftMode ? 0.04 : 0.15);
    this.boat.rotation.x = Math.sin(this.t * 1.3) * 0.08 + this.happy * Math.sin(this.t * 14) * 0.2;
    if (this.kite.visible) {
      this.kite.rotation.set(-0.5 + Math.sin(this.t * 2) * 0.1, Math.PI / 2, Math.sin(this.t * 1.4) * 0.15);
      this.tail.forEach((r, i) => (r.rotation.x = Math.sin(this.t * 6 - i * 0.8) * 0.35));
    }
    this.happy = Math.max(0, this.happy - dt);
    // mood gestures: paper has no words, only posture
    const m = this.mood;
    const eyeY = m === 'sleepy' ? 0.25 : m === 'curious' ? 1.5 : m === 'scared' ? 1.35 : 1;
    for (const e of this.eyes) e.scale.set(1, lerp(e.scale.y, eyeY, 1 - Math.exp(-8 * dt)), 1);
    if (m === 'cold' || m === 'scared') this.boat.rotation.z += Math.sin(this.t * 40) * 0.05;
    if (m === 'sleepy') { this.boat.rotation.z = lerp(this.boat.rotation.z, 0.35, 0.5); this.root.position.addScaledVector(up, -0.25); }
    if (m === 'curious' && this.lookAtPoi) {
      const to = this.lookAtPoi.clone().sub(this.root.position).projectOnPlane(up);
      if (to.lengthSq() > 1e-4) orientTo(this.root, up, to.normalize().cross(up).negate());
      this.boat.rotation.x += Math.sin(this.t * 3) * 0.1;
    }
    if (m === 'happy') this.root.position.addScaledVector(up, Math.abs(Math.sin(this.t * 9)) * 0.25);
  }

  /** Tell Fold what is going on; it decides how it feels. */
  feel(mood: FoldMood, poi: THREE.Vector3 | null = null) { this.mood = mood; this.lookAtPoi = poi; }

  /** The kite string from the traveler's hand to the kite (in world space). */
  updateString(hand: THREE.Vector3) {
    this.string.visible = this.kite.visible;
    if (!this.string.visible) return;
    const a = this.string.geometry.attributes.position as THREE.BufferAttribute;
    a.setXYZ(0, hand.x, hand.y, hand.z); a.setXYZ(1, this.pos.x, this.pos.y, this.pos.z); a.needsUpdate = true;
  }

  hop() { this.squash = 0.35; this.happy = 0.8; }
}
