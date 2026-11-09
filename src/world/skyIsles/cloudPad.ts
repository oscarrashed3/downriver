import * as THREE from 'three';
import { PuffBuilder, PuffLayer, addHeap, puffGeometry, puffMaterial } from './cloudPuffs';
import { SKY_CLOUDS } from './cloudSea';

/**
 * A cloud pad: a small bouncy cumulus cushion (3-5 m across) that you can land on. It bobs gently, and when
 * something lands on it, squash(k) makes it give under the weight and spring back with a soft wobble.
 *
 *   const pad = new CloudPad({ size: 4 }); pad.root.position.copy(p); scene.add(pad.root);
 *   on landing: pad.squash(0.8); every frame: pad.update(dt, t); stand at pad.root.localToWorld((0, pad.topY, 0)).
 *
 * The pad shares the cloud sea's light (SKY_CLOUDS). Its puffs sort themselves for whichever camera draws them.
 * One draw call (plus one in the shadow pass), 14-18 puffs of 320 triangles.
 */
export class CloudPad {
  root = new THREE.Group();
  /** Bobs and squashes inside root. */
  readonly body = new THREE.Group();
  readonly size: number;
  /** Height of the walkable top above root, right now (it dips when squashed). */
  topY: number;
  private restTop: number;
  private x = 0; private v = 0;
  private phase: number;
  private layer: PuffLayer;
  private mat: THREE.ShaderMaterial;
  constructor(opts: { size?: number; seed?: number } = {}) {
    const size = this.size = opts.size ?? 4;
    let s = (opts.seed ?? 1) * 9301 + 49297;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this.phase = rnd() * 6.28;
    const b = new PuffBuilder();
    const up = new THREE.Vector3(0, 1, 0);
    const R = size / 2, H = size * 0.3;
    // the cushion: a low, wide heap with a flat-ish top
    addHeap(b, new THREE.Vector3(0, -H * 0.55, 0), up, R, H, rnd, { n: 13, flat: 0.68 });
    // a few wisps trailing underneath
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rnd();
      const pr = R * (0.2 + rnd() * 0.12);
      p.set(Math.cos(a) * R * 0.35, -H * 0.7 - pr * 0.4, Math.sin(a) * R * 0.35);
      sc.set(pr * 1.3, pr * 0.7, pr * 1.3);
      b.add(p, q, sc, new THREE.Vector3(0, -H * 0.55, 0), R, H, rnd() * 100);
    }
    // the walkable top: the highest cloud surface over the pad's middle
    let top = 0;
    for (let i = 0; i < b.count; i++) {
      const e = b.mats.slice(i * 16, i * 16 + 16);
      const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]);
      const d = Math.hypot(e[12], e[14]);
      if (d < sx * 0.8) top = Math.max(top, e[13] + sy * Math.sqrt(1 - (d / sx) ** 2));
    }
    this.restTop = this.topY = top * 0.92;
    this.mat = puffMaterial(SKY_CLOUDS, { flat: true, billow: 0.55, nearFade: 0.4 });
    this.layer = new PuffLayer(b, puffGeometry(3), this.mat);
    const mesh = this.layer.mesh;
    this.layer.showAll();
    mesh.renderOrder = 5;
    mesh.castShadow = true;
    // sort for whichever camera is about to draw the pad
    mesh.onBeforeRender = (_r, _s, camera) => {
      this.mat.uniforms.uFlatUp.value.set(0, 1, 0).transformDirection(this.root.matrixWorld);
      this.layer.refresh(camera);
    };
    this.body.add(mesh);
    this.root.add(this.body);
  }

  dispose() { this.layer.mesh.geometry.dispose(); this.mat.dispose(); }

  /** Something landed: k = 0 (a tap) .. 1 (a hard landing). */
  squash(k: number) { this.v += 3.6 * Math.max(0, k); }

  update(dt: number, t: number) {
    // a damped spring: x > 0 is squashed
    const K = 55, D = 5.5;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) { this.v += (-K * this.x - D * this.v) * h; this.x += this.v * h; }
    this.x = Math.max(-0.35, Math.min(0.8, this.x));
    const x = this.x;
    this.body.scale.set(1 + x * 0.28, 1 - x * 0.55, 1 + x * 0.28);
    const bob = Math.sin(t * 0.9 + this.phase) * 0.07;
    this.body.position.y = bob - x * 0.25;
    this.topY = this.restTop * (1 - x * 0.55) + this.body.position.y;
  }
}
