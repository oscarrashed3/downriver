import * as THREE from 'three';
import { PuffBuilder, PuffLayer, puffMaterial, setCloudMask } from './cloudPuffs';
import { SKY_CLOUDS } from './cloudSea';

/**
 * A cloud pad: a small bouncy cumulus cushion (3-5 m across) that you can land on. It is one round, lumpy mass:
 * a large core, a ring of medium billows round its waist, a second smaller ring and one big billow on top, a few
 * soft wisps under it and small detail only on its silhouette. It bobs gently, and when something lands on it,
 * squash(k) makes the whole cushion give as one: it flattens onto its base and bulges outward at the rim, the top
 * first and the lower billows a moment later (a soft per-puff lag, done in the vertex shader), then springs back
 * up past rest and settles with a wobble.
 *
 *   const pad = new CloudPad({ size: 4 }); pad.root.position.copy(p); scene.add(pad.root);
 *   on landing: pad.squash(0.8); every frame: pad.update(dt, t); stand at pad.root.localToWorld((0, pad.topY, 0)).
 *
 * The pad shares the cloud sea's light (SKY_CLOUDS) and sorts its puffs for whichever camera draws it.
 * One draw call of ~30 impostor puffs (two triangles each), plus an invisible low-poly proxy (80 triangles per
 * puff, drawn into the shadow map only) that casts its shadow.
 */
export class CloudPad {
  root = new THREE.Group();
  /** Bobs inside root. */
  readonly body = new THREE.Group();
  readonly size: number;
  /** Height of the walkable top above root, right now (it dips when squashed). */
  topY: number;
  private restTop: number;
  private baseY: number;
  private x = 0; private v = 0;
  /** The squash, lagged twice (the lower billows follow the top a moment later). */
  private x1 = 0; private x2 = 0;
  private phase: number;
  private layer: PuffLayer;
  private mat: THREE.ShaderMaterial;
  private proxy: THREE.InstancedMesh;
  private shadow = new THREE.Group();
  constructor(opts: { size?: number; seed?: number } = {}) {
    const size = this.size = opts.size ?? 4;
    let s = (opts.seed ?? 1) * 9301 + 49297;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this.phase = rnd() * 6.28;
    const b = new PuffBuilder();
    const R = size / 2, H = size * 0.5;
    this.baseY = -H * 0.95;
    // the whole pad is lit as one rounded mass, from its soft underside to its crown
    const massC = new THREE.Vector3(0, -H * 1.05, 0), mR = R * 1.05, mH = H * 1.25;
    const Y = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const put = (x: number, y: number, z: number, sx: number, sy: number, sz: number, open = 1, wisp = 0) => {
      p.set(x, y, z); q.setFromAxisAngle(Y, rnd() * 6.28); sc.set(sx, sy, sz);
      b.add(p, q, sc, massC, mR, mH, rnd() * 100, 1, open, wisp);
    };
    // the core
    put(0, -H * 0.45, 0, R * 0.8, H * 0.52, R * 0.8, 0.85);
    // medium billows round the waist, uneven in size
    const nW = 7, aW = rnd() * 6.28;
    for (let i = 0; i < nW; i++) {
      const a = aW + ((i + (rnd() - 0.5) * 0.5) / nW) * Math.PI * 2, r = R * (0.34 + rnd() * 0.14);
      const d = R - r * 0.78;
      put(Math.cos(a) * d, -H * (0.48 + (rnd() - 0.5) * 0.12), Math.sin(a) * d, r, r * 0.86, r * (0.9 + rnd() * 0.2), 0.9);
    }
    // a smaller ring of billows on the shoulders
    const nS = 5, aS = rnd() * 6.28;
    for (let i = 0; i < nS; i++) {
      const a = aS + ((i + (rnd() - 0.5) * 0.5) / nS) * Math.PI * 2, r = R * (0.3 + rnd() * 0.1);
      const d = R * 0.5;
      put(Math.cos(a) * d, -H * 0.18 - r * 0.2, Math.sin(a) * d, r, r * 0.82, r, 1);
    }
    // one big billow on top, a little off centre, and a smaller one beside it
    const ta = rnd() * 6.28;
    put(Math.cos(ta) * R * 0.08, -H * 0.12, Math.sin(ta) * R * 0.08, R * 0.46, R * 0.34, R * 0.44, 1);
    put(Math.cos(ta + 2.6) * R * 0.3, -H * 0.12, Math.sin(ta + 2.6) * R * 0.3, R * 0.26, R * 0.2, R * 0.26, 1);
    // soft wisps under it
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rnd() * 0.8, r = R * (0.32 + rnd() * 0.1), d = R * 0.35;
      put(Math.cos(a) * d, -H * 0.86, Math.sin(a) * d, r * 1.2, r * 0.45, r, 0.7, 0.8);
    }
    // small detail on the silhouette only
    for (let i = 0; i < 8; i++) {
      const a = rnd() * 6.28, f = rnd();
      const y = -H * (0.2 + f * 0.45), d = R * (0.86 - f * 0.05) + R * 0.08;
      const r = R * (0.08 + rnd() * 0.05);
      put(Math.cos(a) * d, y, Math.sin(a) * d, r, r * 0.85, r, 1, 0.3);
    }
    b.bakeOcclusion(1, Y);
    // the walkable top: the highest cloud surface over the pad's middle
    let top = -1e9;
    for (let i = 0; i < b.count; i++) {
      const e = b.mats.slice(i * 16, i * 16 + 16);
      const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]);
      const d = Math.hypot(e[12], e[14]);
      if (d < sx * 0.8) top = Math.max(top, e[13] + sy * Math.sqrt(1 - (d / sx) ** 2));
    }
    this.restTop = this.topY = top * 0.92;
    this.mat = puffMaterial(SKY_CLOUDS, { flat: true, billow: 0.7, nearFade: 0.3, depth: true, erode: 0.17, squash: true });
    this.mat.uniforms.uSqH.value.set(top, top - this.baseY, R, this.baseY);
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
    this.shadow.add(this.proxy);
    this.body.add(mesh, this.shadow);
    this.root.add(this.body);
  }

  dispose() { this.layer.mesh.geometry.dispose(); this.mat.dispose(); this.proxy.geometry.dispose(); (this.proxy.material as THREE.Material).dispose(); }

  /** Whether the pad writes the finish pass's cloud ink mask into alpha (see CloudSea.setInkMask). */
  setInkMask(on: boolean) { setCloudMask(this.mat, on); }

  /** Something landed: k = 0 (a tap) .. 1 (a hard landing). */
  squash(k: number) { this.v += 5.2 * Math.max(0, k); }

  update(dt: number, t: number) {
    // a soft damped spring: x > 0 is squashed, x < 0 stretched
    const K = 36, D = 4.0;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.v += (-K * this.x - D * this.v) * h; this.x += this.v * h;
      // two lagging followers (about 0.06 s each): the lower billows give a moment after the top
      const k = 1 - Math.exp(-h / 0.06);
      this.x1 += (this.x - this.x1) * k; this.x2 += (this.x1 - this.x2) * k;
    }
    this.x = Math.max(-0.45, Math.min(0.85, this.x));
    this.mat.uniforms.uSq.value.set(this.x, this.x1, this.x2);
    // the walkable top flattens onto the base with the squash (as in the shader)
    const sy = 1 - this.x * 0.55, sxz = 1 / Math.sqrt(Math.max(0.3, sy));
    const bob = Math.sin(t * 0.9 + this.phase) * 0.08;
    this.body.position.y = bob;
    this.topY = this.baseY + (this.restTop - this.baseY) * sy + bob;
    this.shadow.scale.set(sxz, sy, sxz);
    this.shadow.position.y = this.baseY * (1 - sy);
  }
}
