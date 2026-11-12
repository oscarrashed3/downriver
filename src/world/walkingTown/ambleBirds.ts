import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint, softRamp } from '../../render/paint';
import { townRng } from './rand';

// The white birds that live on Old Amble: they sit on the antler tips (and wherever the game adds a perch), now
// and then lift off, wheel round the head and the shell a few times and glide back in to land, flaring their
// wings. One instanced draw; the wings flap and fold in the vertex shader, the CPU only steers five birds.

export interface Perch { bone: THREE.Object3D; local: THREE.Vector3; yaw: number }

type V3 = [number, number, number];
function part(g: THREE.BufferGeometry, c: string, p: V3, s: V3, wing = 0, r: V3 = [0, 0, 0]) {
  const q = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(q.attributes)) if (k !== 'position') q.deleteAttribute(k);
  q.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s)));
  const n = q.attributes.position.count, cc = new THREE.Color(c);
  const ca = new Float32Array(n * 3), wa = new Float32Array(n);
  for (let i = 0; i < n; i++) { ca.set([cc.r, cc.g, cc.b], i * 3); wa[i] = wing; }
  q.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  q.setAttribute('aWingW', new THREE.BufferAttribute(wa, 1));
  return q;
}

/** A white bird about 0.75 m long (faces +Z): plump body, round head, yellow bill, grey-tipped wings. */
function birdGeometry() {
  const parts: THREE.BufferGeometry[] = [
    part(new THREE.SphereGeometry(1, 12, 8), '#fbf8f0', [0, 0, 0], [0.13, 0.12, 0.3]),
    part(new THREE.SphereGeometry(1, 10, 8), '#fffdf6', [0, 0.1, 0.27], [0.09, 0.09, 0.1]),
    part(new THREE.ConeGeometry(0.03, 0.14, 6), '#efc35a', [0, 0.09, 0.4], [1, 1, 1], 0, [Math.PI / 2, 0, 0]),
    part(new THREE.SphereGeometry(0.018, 6, 4), '#222226', [0.06, 0.13, 0.33], [1, 1, 1]),
    part(new THREE.SphereGeometry(0.018, 6, 4), '#222226', [-0.06, 0.13, 0.33], [1, 1, 1]),
    part(new THREE.ConeGeometry(0.11, 0.3, 4), '#f2f0ea', [0, 0.02, -0.36], [1, 0.3, 1], 0, [-Math.PI / 2, 0, 0]),
  ];
  // wings: a broad inner wing and a swept hand, as flat double-sided blades; aWingW = distance out (for the flap)
  for (const s of [1, -1]) {
    const P = [
      [s * 0.08, 0.06, 0.12], [s * 0.42, 0.06, 0.1], [s * 0.4, 0.06, -0.12], [s * 0.08, 0.06, -0.14],
      [s * 0.42, 0.06, 0.1], [s * 0.75, 0.06, 0.02], [s * 0.72, 0.06, -0.12], [s * 0.4, 0.06, -0.12],
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
    g.setIndex(s > 0 ? [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7] : [0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6]);
    const q = g.toNonIndexed();
    const n = q.attributes.position.count, ca = new Float32Array(n * 3), wa = new Float32Array(n);
    const tip = new THREE.Color('#8f97a8'), wh = new THREE.Color('#f7f5ee');
    for (let i = 0; i < n; i++) {
      const x = Math.abs(q.attributes.position.getX(i));
      const c = wh.clone().lerp(tip, x > 0.6 ? 0.8 : 0);
      ca.set([c.r, c.g, c.b], i * 3); wa[i] = x;
    }
    q.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    q.setAttribute('aWingW', new THREE.BufferAttribute(wa, 1));
    parts.push(q);
  }
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  return g;
}

let birdMat: THREE.MeshToonMaterial | null = null;
function birdMaterial() {
  if (birdMat) return birdMat;
  const m = paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp(), side: THREE.DoubleSide }), { variation: 0, rim: 1.2 });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWingW; attribute vec2 aBird;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (aWingW > 0.0) {
          float sd = sign(transformed.x);
          float ax = abs(transformed.x);
          // flying: the wing swings about the body (the hand a beat behind, so it bends like a real wing)
          float a1 = aBird.x, a2 = aBird.x * 1.35;
          float inner = min(ax, 0.42), outer = max(ax - 0.42, 0.0);
          vec3 fly = vec3(sd * (inner * cos(a1) + outer * cos(a2)), transformed.y + inner * sin(a1) + outer * sin(a2), transformed.z);
          // folded: tucked back along the flanks
          vec3 fold = vec3(sd * (0.12 + ax * 0.04), transformed.y + 0.02 - ax * 0.03, transformed.z - ax * 0.5 + 0.06);
          transformed = mix(fly, fold, aBird.y);
        }`);
  };
  m.customProgramCacheKey = () => 'ambleBird1';
  birdMat = m;
  return m;
}

type State = 'sit' | 'off' | 'fly' | 'in';
interface Bird {
  perch: number; state: State; t: number; dur: number;
  pos: THREE.Vector3; vel: THREE.Vector3;
  /** flight: circle centre (space-local), radius, angular speed, height */
  cc: THREE.Vector3; cr: number; cw: number; ang: number;
  flap: number; fold: number; from: THREE.Vector3; fromV: THREE.Vector3;
}

export class AmbleBirds {
  mesh: THREE.InstancedMesh;
  private birds: Bird[] = [];
  private perches: Perch[];
  private attr: THREE.InstancedBufferAttribute;
  private space: THREE.Object3D;
  private rng: () => number;
  private taken = new Set<number>();
  /** Where the birds wheel (space-local): set by Amble to about its head and shell. */
  centres: THREE.Vector3[] = [];
  constructor(space: THREE.Object3D, perches: Perch[], count = 5, seed = 8) {
    this.space = space; this.perches = perches; this.rng = townRng(seed);
    const geo = birdGeometry();
    this.attr = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
    geo.setAttribute('aBird', this.attr);
    this.mesh = new THREE.InstancedMesh(geo, birdMaterial(), count);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.userData.noOutline = true;
    space.add(this.mesh);
    for (let i = 0; i < count; i++) {
      const p = this.freePerch(i);
      this.birds.push({ perch: p, state: 'sit', t: 0, dur: 2 + this.rng() * 12, pos: new THREE.Vector3(), vel: new THREE.Vector3(), cc: new THREE.Vector3(), cr: 10, cw: 0.3, ang: 0, flap: 0, fold: 1, from: new THREE.Vector3(), fromV: new THREE.Vector3() });
    }
  }
  private freePerch(pref: number) {
    for (let k = 0; k < this.perches.length; k++) { const i = (pref + k * 3) % this.perches.length; if (!this.taken.has(i)) { this.taken.add(i); return i; } }
    return pref % this.perches.length;
  }
  private perchPos(i: number, out: THREE.Vector3) {
    const P = this.perches[i];
    out.copy(P.local).applyMatrix4(P.bone.matrixWorld);
    return this.space.worldToLocal(out);
  }
  private _m = new THREE.Matrix4(); private _q = new THREE.Quaternion(); private _s = new THREE.Vector3(1, 1, 1);
  private _f = new THREE.Vector3(); private _x = new THREE.Vector3(); private _y = new THREE.Vector3();
  update(dt: number, t: number) {
    const r = this.rng;
    const up = new THREE.Vector3(0, 1, 0);
    this.birds.forEach((b, i) => {
      b.t += dt;
      const target = this.perchPos(b.perch, new THREE.Vector3());
      let flapping = 0;
      if (b.state === 'sit') {
        b.pos.copy(target); b.vel.set(0, 0, 0);
        b.fold = Math.min(1, b.fold + dt * 2);
        if (b.t > b.dur) {
          b.state = 'off'; b.t = 0; b.dur = 1.4;
          this.taken.delete(b.perch);
          const c = this.centres.length ? this.centres[Math.floor(r() * this.centres.length)] : target.clone().add(new THREE.Vector3(0, 6, 0));
          b.cc.copy(c); b.cr = 8 + r() * 9; b.cw = (r() < 0.5 ? -1 : 1) * (0.32 + r() * 0.2);
          b.ang = Math.atan2(target.z - c.z, target.x - c.x);
          b.from.copy(target);
        }
      } else if (b.state === 'off') {
        // spring up and out towards the circle
        const k = b.t / b.dur;
        const circ = new THREE.Vector3(b.cc.x + Math.cos(b.ang) * b.cr, b.cc.y, b.cc.z + Math.sin(b.ang) * b.cr);
        const np = b.from.clone().lerp(circ, k * k * (3 - 2 * k)); np.y += Math.sin(Math.PI * k) * 1.5;
        b.vel.copy(np).sub(b.pos).divideScalar(Math.max(dt, 1e-3)); b.pos.copy(np);
        b.fold = Math.max(0, b.fold - dt * 4); flapping = 1;
        if (k >= 1) { b.state = 'fly'; b.t = 0; b.dur = 7 + r() * 12; }
      } else if (b.state === 'fly') {
        b.ang += b.cw * dt;
        const np = new THREE.Vector3(b.cc.x + Math.cos(b.ang) * b.cr, b.cc.y + Math.sin(t * 0.4 + i) * 1.2, b.cc.z + Math.sin(b.ang) * b.cr);
        b.vel.copy(np).sub(b.pos).divideScalar(Math.max(dt, 1e-3)); b.pos.copy(np);
        flapping = 0.5 + 0.5 * Math.sin(t * 0.7 + i * 2);
        if (b.t > b.dur) {
          b.state = 'in'; b.t = 0; b.dur = 3.2;
          b.perch = this.freePerch(Math.floor(r() * this.perches.length));
          b.from.copy(b.pos); b.fromV.copy(b.vel);
        }
      } else {
        // glide in on a curve (Hermite from the flight to the perch), flare and flap at the end
        const k = Math.min(1, b.t / b.dur);
        const h00 = 2 * k ** 3 - 3 * k ** 2 + 1, h10 = k ** 3 - 2 * k ** 2 + k, h01 = -2 * k ** 3 + 3 * k ** 2;
        const np = b.from.clone().multiplyScalar(h00).addScaledVector(b.fromV, h10 * b.dur * 0.6).addScaledVector(target, h01);
        np.y += Math.sin(Math.PI * k) * 1.2;
        b.vel.copy(np).sub(b.pos).divideScalar(Math.max(dt, 1e-3)); b.pos.copy(np);
        flapping = k > 0.7 ? 1 : 0.15;
        if (k >= 1) { b.state = 'sit'; b.t = 0; b.dur = 6 + r() * 14; b.fold = 0.2; }
      }
      // wing beat: deep beats when flapping, a gentle glide hold otherwise
      b.flap += dt * (7 + 5 * flapping);
      const ang = b.state === 'sit' ? 0 : 0.25 + Math.sin(b.flap) * (0.15 + 0.75 * flapping);
      this.attr.setXY(i, ang, b.state === 'sit' ? b.fold : 0);
      // orientation: along the flight, banking into turns; sitting, facing the perch's way
      if (b.state === 'sit' || b.vel.lengthSq() < 0.01) {
        const yaw = this.perches[b.perch].yaw;
        this._q.setFromAxisAngle(up, yaw + 0.3 * Math.sin(t * 0.3 + i));
      } else {
        this._f.copy(b.vel).normalize();
        this._x.crossVectors(up, this._f).normalize();
        this._y.crossVectors(this._f, this._x);
        const bank = b.state === 'fly' ? -Math.sign(b.cw) * 0.35 : 0;
        this._m.makeBasis(this._x, this._y, this._f);
        this._q.setFromRotationMatrix(this._m).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bank));
      }
      this._m.compose(b.pos, this._q, this._s.setScalar(1.6));
      this.mesh.setMatrixAt(i, this._m);
    });
    this.attr.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
