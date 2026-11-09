import * as THREE from 'three';
import { PuffBuilder, PuffLayer, addCumulus, puffMaterial } from './cloudPuffs';
import { SKY_CLOUDS } from './cloudSea';

/**
 * A cloud pad: a small bouncy cumulus cushion (3-5 m across) that you can land on. A round, fluffy top of small
 * crown billows sits on a soft, wispy underside. It bobs gently, and when something lands on it, squash(k) makes
 * it give under the weight (wide and flat), spring back up past rest (tall and narrow) and settle with a wobble.
 *
 *   const pad = new CloudPad({ size: 4 }); pad.root.position.copy(p); scene.add(pad.root);
 *   on landing: pad.squash(0.8); every frame: pad.update(dt, t); stand at pad.root.localToWorld((0, pad.topY, 0)).
 *
 * The pad shares the cloud sea's light (SKY_CLOUDS) and sorts its puffs for whichever camera draws it.
 * One draw call of ~60 impostor puffs (two triangles each), plus an invisible low-poly proxy (80 triangles per
 * puff, drawn without colour or depth) that casts its shadow.
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
  private proxy: THREE.InstancedMesh;
  constructor(opts: { size?: number; seed?: number } = {}) {
    const size = this.size = opts.size ?? 4;
    let s = (opts.seed ?? 1) * 9301 + 49297;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this.phase = rnd() * 6.28;
    const b = new PuffBuilder();
    const up = new THREE.Vector3(0, 1, 0);
    const R = size / 2, H = size * 0.44;
    // the whole pad is lit as one rounded mass, from its wispy underside to its crown (no band between them)
    const mass = { base: new THREE.Vector3(0, -H * 0.9, 0), R: R * 1.05, H: H * 1.55 };
    // the cushion: a rounded heap with small crown billows
    addCumulus(b, new THREE.Vector3(0, -H * 0.42, 0), up, R, H, rnd, { detail: 1, skirt: 0, billows: 2.4, flat: 0.9, lean: 0.06, mass, puff: 0.6 });
    // a ring of rounded side billows, so the cushion is round and fluffy all the way down to its underside
    const ps = new THREE.Vector3();
    const nR = 9;
    for (let i = 0; i < nR; i++) {
      const a = (i / nR) * Math.PI * 2 + rnd() * 0.4;
      ps.set(Math.cos(a) * R * 0.72, -H * 0.42, Math.sin(a) * R * 0.72);
      const pr = R * (0.32 + rnd() * 0.1);
      b.add(ps, new THREE.Quaternion().setFromAxisAngle(up, rnd() * 6.28), new THREE.Vector3(pr, pr * 0.8, pr), mass.base, mass.R, mass.H, rnd() * 100, 1, 0.8);
    }
    // the underside: soft flat wisps trailing below, smaller toward the bottom
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd() * 0.6;
      const low = i % 3;
      const pr = R * (0.3 - low * 0.06) * (0.85 + rnd() * 0.3);
      const d = R * (0.5 - low * 0.16) * (0.7 + rnd() * 0.4);
      p.set(Math.cos(a) * d, -H * (0.62 + low * 0.14) - pr * 0.1, Math.sin(a) * d);
      q.setFromAxisAngle(up, rnd() * 6.28);
      sc.set(pr * 1.25, pr * 0.42, pr);
      b.add(p, q, sc, mass.base, mass.R, mass.H, rnd() * 100, 1, 0.75 - low * 0.12);
    }
    // the walkable top: the highest cloud surface over the pad's middle
    let top = 0;
    for (let i = 0; i < b.count; i++) {
      const e = b.mats.slice(i * 16, i * 16 + 16);
      const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]);
      const d = Math.hypot(e[12], e[14]);
      if (d < sx * 0.8) top = Math.max(top, e[13] + sy * Math.sqrt(1 - (d / sx) ** 2));
    }
    this.restTop = this.topY = top * 0.8;
    this.mat = puffMaterial(SKY_CLOUDS, { flat: true, billow: 0.8, nearFade: 0.3, depth: true, erode: 0.18 });
    this.layer = new PuffLayer(b, this.mat);
    const mesh = this.layer.mesh;
    this.layer.showAll();
    mesh.renderOrder = 5;
    // sort for whichever camera is about to draw the pad
    mesh.onBeforeRender = (_r, _s, camera) => {
      this.mat.uniforms.uFlatUp.value.set(0, 1, 0).transformDirection(this.root.matrixWorld);
      this.layer.refresh(camera);
    };
    // the shadow: low-poly spheres at the same places, drawn only into the shadow map
    const proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.proxy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.85, 1), proxyMat, b.count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < b.count; i++) { m.fromArray(b.mats, i * 16); this.proxy.setMatrixAt(i, m); }
    this.proxy.castShadow = true;
    this.proxy.userData.noOutline = true;
    this.body.add(mesh, this.proxy);
    this.root.add(this.body);
  }

  dispose() { this.layer.mesh.geometry.dispose(); this.mat.dispose(); this.proxy.geometry.dispose(); (this.proxy.material as THREE.Material).dispose(); }

  /** Something landed: k = 0 (a tap) .. 1 (a hard landing). */
  squash(k: number) { this.v += 5.2 * Math.max(0, k); }

  update(dt: number, t: number) {
    // a soft damped spring: x > 0 is squashed, x < 0 stretched
    const K = 36, D = 4.0;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) { this.v += (-K * this.x - D * this.v) * h; this.x += this.v * h; }
    this.x = Math.max(-0.45, Math.min(0.85, this.x));
    const x = this.x;
    // keep the volume, roughly: flatter means wider
    const sy = 1 - x * 0.6, sxz = 1 / Math.sqrt(Math.max(0.3, sy));
    this.body.scale.set(sxz, sy, sxz);
    const bob = Math.sin(t * 0.9 + this.phase) * 0.08;
    this.body.position.y = bob - x * 0.3;
    this.topY = this.restTop * sy + this.body.position.y;
  }
}
