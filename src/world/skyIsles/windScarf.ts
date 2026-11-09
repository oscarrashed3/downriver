import * as THREE from 'three';
import { paint, softRamp, outlineMaterial } from '../../render/paint';

// The long scarves of the windfolk: cloth ribbons that always stream and ripple in the wind.
//
// Each scarf tail is a chain of points simulated in world space (Verlet): gravity pulls it down, and
// the air drags every point towards the wind's own velocity, so a still person's scarf flies out
// downwind, a running or gliding one's trails behind, and a gust lifts it. On top of the simulation a
// travelling ripple and a slow twist are added when the ribbon is drawn, so the cloth never looks stiff.
// The ribbon has a real (thin) thickness, so the shared ink outline and the toon ramp work on it.
// Cost: one small dynamic mesh (+ its outline) per tail, about 16 segments, 130 triangles.

/** The Sky Isles wind (world space, metres per second). Scarves use it unless told otherwise. */
export const SKY_WIND = new THREE.Vector3(5.2, 0.35, 1.8);

export interface ScarfSpec {
  /** Length and width in metres. */
  length: number;
  width: number;
  /** Main colour, then the colour of the stripes and the end band. */
  color: string;
  stripe?: string;
  /** Stripes across the ribbon, as [start, end] fractions of the length (0 = neck). */
  stripes?: [number, number][];
  segs?: number;
  /** How much gravity wins over the wind (0.2 flies flat, 0.6 droops). */
  droop?: number;
  /** Ripple strength (1 = normal). */
  flutter?: number;
  /** Tattered, swallow-tailed end (Zephy's old red scarf). */
  tatter?: boolean;
  seed?: number;
}

/** A sphere the cloth cannot pass into (torso, head), radius in the object's local units. */
export interface ScarfCollider { o: THREE.Object3D; r: number }

let ribbonMat: THREE.MeshToonMaterial | null = null;
/** One shared toon material for every ribbon: colours come from the vertices. */
function scarfMaterial() {
  if (!ribbonMat) {
    ribbonMat = paint(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: softRamp(), side: THREE.DoubleSide }), { variation: 0.6 });
  }
  return ribbonMat;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _right = new THREE.Vector3(), _inv = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _ws = new THREE.Vector3();

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

  /**
   * @param anchor where the tail leaves the knot at the neck (a joint of the body)
   * @param space  the object the mesh lives in (the person's root); the ribbon is drawn in its frame
   */
  constructor(public anchor: THREE.Object3D, public space: THREE.Object3D, public spec: ScarfSpec, public colliders: ScarfCollider[] = []) {
    this.n = (spec.segs ?? 16) + 1;
    this.seg = spec.length / (this.n - 1);
    this.seed = spec.seed ?? Math.random() * 10;
    for (let i = 0; i < this.n; i++) { this.x.push(new THREE.Vector3()); this.p.push(new THREE.Vector3()); this.sides.push(new THREE.Vector3()); }
    // 8 vertices a ring: top face, bottom face, and the two thin edges, each with its own normal
    const R = this.n * 8;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(R * 3), 3);
    this.nor = new THREE.BufferAttribute(new Float32Array(R * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage); this.nor.setUsage(THREE.DynamicDrawUsage);
    const col = new Float32Array(R * 3);
    const main = new THREE.Color(spec.color), str = new THREE.Color(spec.stripe ?? spec.color), c = new THREE.Color();
    for (let i = 0; i < this.n; i++) {
      const u = i / (this.n - 1);
      const inStripe = (spec.stripes ?? []).some(([a, b]) => u >= a - 1e-4 && u <= b + 1e-4);
      c.copy(inStripe ? str : main);
      // a faint shading towards the tip so the long ribbon reads as cloth catching light
      c.multiplyScalar(1 - u * 0.08);
      for (let j = 0; j < 8; j++) c.toArray(col, (i * 8 + j) * 3);
    }
    const idx: number[] = [];
    const quad = (a: number, b: number, c2: number, d: number) => idx.push(a, b, c2, b, d, c2);
    for (let i = 0; i < this.n - 1; i++) {
      const r0 = i * 8, r1 = r0 + 8;
      quad(r0 + 1, r0 + 0, r1 + 1, r1 + 0); // top (wound outwards, so the BackSide ink hull works)
      quad(r0 + 3, r0 + 2, r1 + 3, r1 + 2); // bottom
      quad(r0 + 4, r0 + 5, r1 + 4, r1 + 5); // left edge
      quad(r0 + 6, r0 + 7, r1 + 6, r1 + 7); // right edge
    }
    g.setIndex(idx);
    g.setAttribute('position', this.pos); g.setAttribute('normal', this.nor); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mesh = new THREE.Mesh(g, scarfMaterial());
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false; // it moves every frame; the person is culled as a whole anyway
    this.mesh.userData.noOutline = true;
    const ink = new THREE.Mesh(g, outlineMaterial('#3a2a2e', 0.006));
    ink.frustumCulled = false; ink.userData.isOutline = true; ink.userData.noOutline = true;
    this.mesh.add(ink);
    space.add(this.mesh);
  }

  /** Lay the scarf out straight downwind (on the first frame or after a teleport). */
  reset(air: THREE.Vector3) {
    this.anchor.getWorldPosition(_a);
    _d.copy(air).setY(air.y - 2).normalize();
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
    const drop = 9.8 * (this.spec.droop ?? 0.35) * 1.4;
    const cs = this.colliders.map(c => ({ c: c.o.getWorldPosition(new THREE.Vector3()), r: c.r * c.o.getWorldScale(_ws).x }));
    this.anchor.getWorldPosition(_a);
    const airLen = air.length();
    let steps = 0;
    while (this.acc >= H && steps < 8) {
      this.acc -= H; steps++;
      const tt = t - this.acc;
      this.x[0].copy(_a); this.p[0].copy(_a);
      for (let i = 1; i < this.n; i++) {
        const x = this.x[i], p = this.p[i];
        const u = i / (this.n - 1);
        // gusts: the wind's strength breathes, and swirls a little across and up/down along the ribbon
        const g = 1 + 0.32 * Math.sin(tt * 1.3 + this.seed) + 0.16 * Math.sin(tt * 3.7 - u * 3 + this.seed * 2);
        _b.copy(air).multiplyScalar(g);
        _b.y += airLen * 0.55 * Math.sin(tt * 5.1 - u * 6 + this.seed) * u;
        _b.x += airLen * 0.25 * Math.sin(tt * 4.3 - u * 5 + this.seed * 3) * u;
        _b.z += airLen * 0.35 * Math.cos(tt * 3.9 - u * 5 + this.seed) * u;
        // Verlet with air drag: velocity relaxes towards the air's own velocity
        _d.subVectors(x, p).divideScalar(H); // velocity
        _s.subVectors(_b, _d).multiplyScalar(5); // drag
        _s.y -= drop;
        p.copy(x);
        x.addScaledVector(_d, H * 0.995).addScaledVector(_s, H * H);
      }
      // keep the links their length (the neck end is pinned), and out of the body
      for (let k = 0; k < 3; k++) {
        for (let i = 1; i < this.n; i++) {
          const a = this.x[i - 1], b = this.x[i];
          _d.subVectors(b, a); const L = _d.length() || 1e-6;
          if (i === 1) b.copy(a).addScaledVector(_d, this.seg / L);
          else { const e = (L - this.seg) / L * 0.5; a.addScaledVector(_d, e); b.addScaledVector(_d, -e); }
        }
        for (let i = 1; i < this.n; i++) for (const c of cs) {
          _d.subVectors(this.x[i], c.c); const L = _d.length();
          if (L < c.r) this.x[i].addScaledVector(_d, (c.r - L) / Math.max(L, 1e-4));
        }
      }
    }
    this.draw(t);
  }

  /** Build the ribbon around the chain: a frame carried down its length, a twist and a travelling ripple. */
  private draw(t: number) {
    const sp = this.spec, n = this.n;
    this.space.updateWorldMatrix(true, false);
    _inv.copy(this.space.matrixWorld).invert();
    this.anchor.getWorldQuaternion(_q);
    _right.set(1, 0, 0).applyQuaternion(_q);
    const fl = sp.flutter ?? 1;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const a = this.x[Math.max(0, i - 1)], b = this.x[Math.min(n - 1, i + 1)];
      _d.subVectors(b, a).normalize();
      // side vector: at the knot it follows the body; down the tail it is carried along (parallel transport),
      // pulled a little towards upright so a streaming scarf shows its broad face, like a flag
      const s = this.sides[i];
      if (i === 0) {
        const vert = Math.abs(_d.dot(_up));
        s.copy(_up).multiplyScalar(1 - vert).addScaledVector(_right, vert * 1.2);
      } else s.copy(this.sides[i - 1]).lerp(_up, 0.06);
      s.addScaledVector(_d, -s.dot(_d)).normalize();
      // a slow twist that travels down the ribbon
      const tw = Math.sin(u * 4.2 - t * 2.3 + this.seed) * 0.8 * u * fl;
      _s.copy(s).applyAxisAngle(_d, tw);
      _n.crossVectors(_d, _s).normalize();
      // the ripple: a wave running from the neck to the tip, growing towards the free end
      const rip = (Math.sin(u * 8 - t * 10 + this.seed) * 0.65 + Math.sin(u * 15 - t * 17 + this.seed * 2) * 0.35) * 0.07 * fl * Math.min(1, u * 1.6);
      const c = _a.copy(this.x[i]).addScaledVector(_n, rip);
      // width: slightly wider just after the knot, gathered at the very end
      let w = sp.width * (u < 0.08 ? 0.6 + u * 5 : 1 - 0.12 * u);
      const th = 0.007;
      // swallow-tail: the end splits, the middle torn back
      if (sp.tatter && u > 0.86) w *= 1 + (u - 0.86) * 2;
      const ring = i * 8;
      // one vertex: across the width (sx = -1 / 1), through the thickness (ny = -1 / 1), and its normal
      const put = (k: number, sx: number, ny: number, nrm: THREE.Vector3, sign: number) => {
        _b.copy(c).addScaledVector(_s, sx * w * 0.5).addScaledVector(_n, ny * th).applyMatrix4(_inv);
        this.pos.setXYZ(ring + k, _b.x, _b.y, _b.z);
        _b.copy(nrm).multiplyScalar(sign).transformDirection(_inv);
        this.nor.setXYZ(ring + k, _b.x, _b.y, _b.z);
      };
      put(0, -1, 1, _n, 1); put(1, 1, 1, _n, 1);     // top face
      put(2, 1, -1, _n, -1); put(3, -1, -1, _n, -1); // bottom face
      put(4, -1, 1, _s, -1); put(5, -1, -1, _s, -1); // left edge
      put(6, 1, -1, _s, 1); put(7, 1, 1, _s, 1);     // right edge
      if (sp.tatter && i === n - 1) {
        // a torn, slanted end: pull one corner of the last ring back along the ribbon
        for (const k of [0, 3, 4, 5]) { _b.copy(c).addScaledVector(_d, -this.seg * 1.6).applyMatrix4(_inv); this.pos.setXYZ(ring + k, _b.x, _b.y, _b.z); }
      }
    }
    this.pos.needsUpdate = true; this.nor.needsUpdate = true;
  }

  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); }
}
