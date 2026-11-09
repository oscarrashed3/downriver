import * as THREE from 'three';
import { paint, softRamp, outlineMaterial } from '../../render/paint';

// The long scarves of the windfolk: cloth ribbons that hang in soft S-curves and stream out in the gusts.
//
// Each tail is a chain of points simulated in world space (Verlet): gravity pulls it down and the air drags
// every point towards the wind's own velocity, so a still person's scarf hangs and lifts downwind, a running
// or gliding one's trails behind. The wind breathes in slow gusts, so the tails swing between a soft droop
// and a long stream. When the ribbon is drawn it is shaped like cloth, not a plank:
//   - it narrows from the knot to the tip (to about 60%),
//   - it cups and curls across its width (the cross-section bends, the bend travels down the tail),
//   - the edges flutter with fast, small ripples, and a slow twist runs along it,
//   - the end is cut: a fringe of notches, or Zephy's torn swallow-tail with ragged strips.
// The top is the scarf's own colour, the underside a shade darker; no fading at the tip.
// Cost: one small dynamic mesh (+ its ink) per tail, 18 segments x 5 across, about 400 triangles.

/** The Sky Isles wind (world space, metres per second). Scarves use it unless told otherwise. */
export const SKY_WIND = new THREE.Vector3(5.2, 0.35, 1.8);

export interface ScarfSpec {
  /** Length and width in metres (width at the knot). */
  length: number;
  width: number;
  /** Main colour, then the colour of the stripes and the end band. */
  color: string;
  stripe?: string;
  /** Stripes across the ribbon, as [start, end] fractions of the length (0 = neck). */
  stripes?: [number, number][];
  segs?: number;
  /** How heavy the cloth is: 1 = normal (hangs at about 40 degrees in the usual wind), 1.5 droops, 0.6 flies. */
  droop?: number;
  /** Ripple strength (1 = normal). */
  flutter?: number;
  /** Tattered, swallow-tailed, torn end (Zephy's old red scarf). */
  tatter?: boolean;
  /** A fringed end (notches across the tip). Default true unless tattered. */
  fringe?: boolean;
  seed?: number;
}

/** A sphere the cloth cannot pass into (torso, head), radius in the object's local units. */
export interface ScarfCollider { o: THREE.Object3D; r: number }

let ribbonMat: THREE.MeshToonMaterial | null = null;
/** One shared toon material for every ribbon: colours come from the vertices. */
function scarfMaterial() {
  if (!ribbonMat) ribbonMat = paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp(), side: THREE.DoubleSide }), { variation: 0.5 });
  return ribbonMat;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _right = new THREE.Vector3(), _inv = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _ws = new THREE.Vector3(), _c = new THREE.Vector3();

const M = 5; // vertices across the width

export class WindScarf {
  mesh: THREE.Mesh;
  private n: number;
  private seg: number;
  private x: THREE.Vector3[] = [];
  private p: THREE.Vector3[] = [];
  private sides: THREE.Vector3[] = [];
  private has = false;
  private acc = 0;
  private pos: THREE.BufferAttribute;
  private nor: THREE.BufferAttribute;
  private seed: number;
  /** Per vertex across each ring: how far it is cut back (in segments), for the fringe or the tatters. */
  private cut: number[][] = [];
  private cs: { c: THREE.Vector3; r: number }[] = [];

  /**
   * @param anchor where the tail leaves the knot at the neck (a joint of the body)
   * @param space  the object the mesh lives in (the person's root); the ribbon is drawn in its frame
   */
  constructor(public anchor: THREE.Object3D, public space: THREE.Object3D, public spec: ScarfSpec, public colliders: ScarfCollider[] = []) {
    this.n = (spec.segs ?? 18) + 1;
    this.seg = spec.length / (this.n - 1);
    this.seed = spec.seed ?? Math.random() * 10;
    for (let i = 0; i < this.n; i++) { this.x.push(new THREE.Vector3()); this.p.push(new THREE.Vector3()); this.sides.push(new THREE.Vector3()); }
    for (let i = 0; i < colliders.length; i++) this.cs.push({ c: new THREE.Vector3(), r: 0 });
    // the cut end: a fringe of notches, or a torn swallow-tail with ragged strips
    let r = Math.floor(this.seed * 1000) % 233280;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < this.n; i++) {
      const row: number[] = [];
      const fromEnd = this.n - 1 - i;
      for (let j = 0; j < M; j++) {
        let c = 0;
        if (spec.tatter) {
          // the middle torn back deep, the strips either side ragged
          if (fromEnd === 0) c = j === 2 ? 2.6 : j === 1 || j === 3 ? 0.9 + rnd() * 1.2 : rnd() * 0.5;
          if (fromEnd === 1 && j === 2) c = 1.4;
          if (fromEnd === 2 && j === 2) c = 0.4;
        } else if (spec.fringe !== false && fromEnd === 0) c = j % 2 ? 0.55 : 0;
        row.push(c);
      }
      this.cut.push(row);
    }
    // per ring: M on the top face, M on the underside, then 2 x 2 for the edges (their own normals)
    const R = M * 2 + 4, V = this.n * R;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(V * 3), 3);
    this.nor = new THREE.BufferAttribute(new Float32Array(V * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage); this.nor.setUsage(THREE.DynamicDrawUsage);
    const col = new Float32Array(V * 3);
    const main = new THREE.Color(spec.color), str = new THREE.Color(spec.stripe ?? spec.color), c = new THREE.Color();
    for (let i = 0; i < this.n; i++) {
      const u = i / (this.n - 1);
      const inStripe = (spec.stripes ?? []).some(([a, b]) => u >= a - 1e-4 && u <= b + 1e-4);
      for (let k = 0; k < R; k++) {
        c.copy(inStripe ? str : main);
        if (k >= M && k < 2 * M) c.multiplyScalar(0.74); // the underside, a shade darker
        if (k >= 2 * M) c.multiplyScalar(0.82);            // the thin edges
        c.toArray(col, (i * R + k) * 3);
      }
    }
    const idx: number[] = [];
    const quad = (a: number, b: number, c2: number, d: number) => idx.push(a, b, c2, b, d, c2);
    for (let i = 0; i < this.n - 1; i++) {
      const r0 = i * R, r1 = r0 + R;
      for (let j = 0; j < M - 1; j++) {
        quad(r0 + j + 1, r0 + j, r1 + j + 1, r1 + j);                 // top (wound outwards)
        quad(r0 + M + j, r0 + M + j + 1, r1 + M + j, r1 + M + j + 1); // underside
      }
      const e = 2 * M;
      quad(r0 + e, r0 + e + 1, r1 + e, r1 + e + 1);         // left edge
      quad(r0 + e + 3, r0 + e + 2, r1 + e + 3, r1 + e + 2); // right edge
    }
    g.setIndex(idx);
    g.setAttribute('position', this.pos); g.setAttribute('normal', this.nor); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mesh = new THREE.Mesh(g, scarfMaterial());
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false; // it moves every frame; the person is culled as a whole anyway
    this.mesh.userData.noOutline = true;
    const ink = new THREE.Mesh(g, outlineMaterial('#3a2a2e', 0.0075));
    ink.frustumCulled = false; ink.userData.isOutline = true; ink.userData.noOutline = true;
    this.mesh.add(ink);
    space.add(this.mesh);
  }

  /** Lay the scarf out hanging downwind (on the first frame or after a teleport). */
  reset(air: THREE.Vector3) {
    this.anchor.getWorldPosition(_a);
    _d.copy(air).multiplyScalar(0.15).setY(-1).normalize();
    for (let i = 0; i < this.n; i++) { this.x[i].copy(_a).addScaledVector(_d, i * this.seg); this.p[i].copy(this.x[i]); }
    this.has = true;
  }

  /**
   * Step the cloth. `air` is the wind's velocity in world space (m/s). World matrices of the anchor,
   * colliders and space must be current (call updateMatrixWorld after posing the body).
   */
  update(dt: number, t: number, air: THREE.Vector3) {
    if (!this.has) this.reset(air);
    dt = Math.min(dt, 0.05);
    const H = 1 / 120;
    this.acc += dt;
    const grav = 9.8 * 0.8 * (this.spec.droop ?? 1);
    const drag = 2.3;
    this.colliders.forEach((c, i) => { c.o.getWorldPosition(this.cs[i].c); this.cs[i].r = c.r * c.o.getWorldScale(_ws).x; });
    this.anchor.getWorldPosition(_a);
    const airLen = air.length();
    let steps = 0;
    while (this.acc >= H && steps < 8) {
      this.acc -= H; steps++;
      const tt = t - this.acc;
      // gusts: slow and strong (the tails swing between a droop and a stream), with a quicker flutter on top
      const gust = Math.max(0.25, 1 + 0.5 * Math.sin(tt * 0.62 + this.seed) + 0.22 * Math.sin(tt * 1.7 + this.seed * 2.1));
      this.x[0].copy(_a); this.p[0].copy(_a);
      for (let i = 1; i < this.n; i++) {
        const x = this.x[i], p = this.p[i];
        const u = i / (this.n - 1);
        _b.copy(air).multiplyScalar(gust);
        // swirls travelling down the ribbon make the S-curves
        _b.y += airLen * 0.42 * Math.sin(tt * 3.1 - u * 5.5 + this.seed) * u;
        _b.x += airLen * 0.2 * Math.sin(tt * 2.7 - u * 4.5 + this.seed * 3) * u;
        _b.z += airLen * 0.28 * Math.cos(tt * 2.3 - u * 4.8 + this.seed) * u;
        // Verlet with air drag: velocity relaxes towards the air's own velocity
        _d.subVectors(x, p).divideScalar(H);
        _s.subVectors(_b, _d).multiplyScalar(drag);
        _s.y -= grav;
        p.copy(x);
        x.addScaledVector(_d, H * 0.996).addScaledVector(_s, H * H);
      }
      // keep the links their length (the neck end is pinned), and out of the body
      for (let k = 0; k < 3; k++) {
        for (let i = 1; i < this.n; i++) {
          const a = this.x[i - 1], b = this.x[i];
          _d.subVectors(b, a); const L = _d.length() || 1e-6;
          if (i === 1) b.copy(a).addScaledVector(_d, this.seg / L);
          else { const e = (L - this.seg) / L * 0.5; a.addScaledVector(_d, e); b.addScaledVector(_d, -e); }
        }
        for (let i = 1; i < this.n; i++) for (const c of this.cs) {
          _d.subVectors(this.x[i], c.c); const L = _d.length();
          if (L < c.r) this.x[i].addScaledVector(_d, (c.r - L) / Math.max(L, 1e-4));
        }
      }
    }
    this.draw(t);
  }

  /** Build the ribbon around the chain: a carried frame, a twist, a cupped cross-section, edge flutter. */
  private draw(t: number) {
    const sp = this.spec, n = this.n, R = M * 2 + 4;
    this.space.updateWorldMatrix(true, false);
    _inv.copy(this.space.matrixWorld).invert();
    this.anchor.getWorldQuaternion(_q);
    _right.set(1, 0, 0).applyQuaternion(_q);
    const fl = sp.flutter ?? 1, th = 0.0045, sd = this.seed;
    const across = new Float32Array(M), lift = new Float32Array(M);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const a = this.x[Math.max(0, i - 1)], b = this.x[Math.min(n - 1, i + 1)];
      _d.subVectors(b, a).normalize();
      // side vector: at the knot it follows the body; down the tail it is carried along (parallel transport)
      const s = this.sides[i];
      if (i === 0) {
        const vert = Math.abs(_d.dot(_up));
        s.copy(_up).multiplyScalar(1 - vert).addScaledVector(_right, vert * 1.2);
      } else s.copy(this.sides[i - 1]).lerp(_up, 0.03);
      s.addScaledVector(_d, -s.dot(_d)).normalize();
      // a slow twist that travels down the ribbon
      const tw = Math.sin(u * 4.0 - t * 1.9 + sd) * 0.75 * u * fl + Math.sin(u * 9 - t * 3.3 + sd * 2) * 0.18 * u;
      _s.copy(s).applyAxisAngle(_d, tw);
      _n.crossVectors(_d, _s).normalize();
      // a ripple running from the knot to the tip, growing towards the free end
      const rip = (Math.sin(u * 8 - t * 8 + sd) * 0.6 + Math.sin(u * 15 - t * 13 + sd * 2) * 0.4) * 0.06 * fl * Math.min(1, u * 1.8);
      const c = _c.copy(this.x[i]).addScaledVector(_n, rip);
      // width: gathered at the knot, then narrowing to about 60% at the tip
      const w = sp.width * (u < 0.07 ? 0.62 + u * 5.4 : 1 - 0.4 * ((u - 0.07) / 0.93));
      // the cross-section cups and curls; the bend changes sign as it travels, so the cloth rolls
      const cup = (0.3 + 0.7 * Math.sin(u * 3.4 - t * 1.4 + sd * 1.3)) * Math.min(1, u * 3 + 0.25) * fl;
      for (let j = 0; j < M; j++) {
        const xj = (j / (M - 1)) * 2 - 1; // -1 .. 1 across
        across[j] = xj * w * 0.5;
        let l = cup * xj * xj * w * 0.55;
        // the edges flutter: quick, small, out of phase on the two sides
        if (j === 0 || j === M - 1) l += (Math.sin(u * 37 - t * 27 + sd + xj * 2) * 0.6 + Math.sin(u * 61 - t * 39 + sd * 3 - xj) * 0.4) * 0.016 * fl * Math.min(1, u * 2.5);
        lift[j] = l;
      }
      const ring = i * R;
      const cutRow = this.cut[i];
      const put = (k: number, j: number, ny: number, nrm: THREE.Vector3, sign: number) => {
        const back = cutRow[j] * this.seg;
        _b.copy(c).addScaledVector(_s, across[j]).addScaledVector(_n, lift[j] + ny * th).addScaledVector(_d, -back).applyMatrix4(_inv);
        this.pos.setXYZ(ring + k, _b.x, _b.y, _b.z);
        _b.copy(nrm).multiplyScalar(sign).transformDirection(_inv);
        this.nor.setXYZ(ring + k, _b.x, _b.y, _b.z);
      };
      // normals across the cup tilt with the bend's slope
      for (let j = 0; j < M; j++) {
        const xj = (j / (M - 1)) * 2 - 1;
        const slope = 2 * cup * xj * 0.55;
        _a.copy(_n).addScaledVector(_s, -slope).normalize();
        put(j, j, 1, _a, 1);
        put(M + j, j, -1, _a, -1);
      }
      put(2 * M, 0, 1, _s, -1); put(2 * M + 1, 0, -1, _s, -1);
      put(2 * M + 2, M - 1, 1, _s, 1); put(2 * M + 3, M - 1, -1, _s, 1);
    }
    this.pos.needsUpdate = true; this.nor.needsUpdate = true;
  }

  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); }
}
