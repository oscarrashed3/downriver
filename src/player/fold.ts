import * as THREE from 'three';
import { toon } from '../world/props';
import { orientTo } from '../world/sphere';
import { lerp } from '../world/noise';

/** Fold: a living origami boat made of old map paper. Raft, glider and map case. Never speaks. */
export class Fold {
  root = new THREE.Group();
  boat = new THREE.Group();
  pos = new THREE.Vector3();
  t = 0;
  squash = 0;
  raft = false;
  happy = 0;

  constructor() {
    const paper = toon('#efe2c4');
    const ink = toon('#c8b48a');
    // Hull: two folded triangles.
    const hull = new THREE.BufferGeometry();
    const v = new Float32Array([
      -0.6, 0, 0, 0.6, 0, 0, 0, -0.18, 0.22,
      -0.6, 0, 0, 0, -0.18, -0.22, 0.6, 0, 0,
      -0.6, 0, 0, 0, -0.18, 0.22, -0.75, 0.12, 0,
      0.6, 0, 0, 0.75, 0.12, 0, 0, -0.18, 0.22,
      -0.6, 0, 0, -0.75, 0.12, 0, 0, -0.18, -0.22,
      0.6, 0, 0, 0, -0.18, -0.22, 0.75, 0.12, 0,
    ]);
    hull.setAttribute('position', new THREE.BufferAttribute(v, 3));
    hull.computeVertexNormals();
    const h = new THREE.Mesh(hull, paper);
    (h.material as THREE.Material).side = THREE.DoubleSide;
    const sail = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 3), ink);
    sail.position.y = 0.28;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: '#2a2438' }));
    eye.position.set(0.42, 0.06, 0.1);
    this.boat.add(h, sail, eye);
    this.root.add(this.boat);
    this.root.scale.setScalar(0.8);
  }

  update(dt: number, playerPos: THREE.Vector3, up: THREE.Vector3, facing: THREE.Vector3, raftMode: boolean) {
    this.t += dt;
    this.raft = raftMode;
    const side = new THREE.Vector3().crossVectors(up, facing).normalize();
    const goal = raftMode
      ? playerPos.clone().addScaledVector(up, 0.12)
      : playerPos.clone().addScaledVector(up, 1.7 + Math.sin(this.t * 2.2) * 0.12).addScaledVector(side, -0.85).addScaledVector(facing, -0.3);
    this.pos.lerp(goal, 1 - Math.exp(-(raftMode ? 30 : 6) * dt));
    this.root.position.copy(this.pos);
    orientTo(this.root, up, side.clone().negate());
    const s = lerp(this.root.scale.x, raftMode ? 2.6 : 0.8, 1 - Math.exp(-8 * dt));
    this.squash = lerp(this.squash, 0, 1 - Math.exp(-8 * dt));
    this.root.scale.set(s * (1 + this.squash * 0.5), s * (1 - this.squash), s);
    this.boat.rotation.z = Math.sin(this.t * 1.7) * (raftMode ? 0.04 : 0.15);
    this.boat.rotation.x = Math.sin(this.t * 1.3) * 0.08 + this.happy * Math.sin(this.t * 14) * 0.2;
    this.happy = Math.max(0, this.happy - dt);
  }

  hop() { this.squash = 0.35; this.happy = 0.8; }
}
