// World 3, the Walking Town: Old Amble walking. Once its eyes are clear it walks a slow loop round its part of the
// little world (out over the golden meadow, past the lake, up the long rise and back along the river by the ford),
// carrying Mossrest on its back; when Pip asks it to, it turns off the loop and walks down to the coast, and after
// the goodbye it turns and walks slowly back across the meadow.
//   - The legs walk (AmbleRig's slow lateral-sequence gait) and the root moves on at just the speed the planted
//     feet go back, so the feet stay put on the ground.
//   - The body rides the ground under its four feet: its height is theirs on average, it leans a little with the
//     slope, and each foot reaches down (or up) to its own ground.
//   - Each footfall: a deep thud, the ground shaking a little, and dust and petals kicked up round the foot.
// Paths are laid out in the meadow's map (metres forward and left of Amble's old standing place, see meadow.ts).
import * as THREE from 'three';
import type { Planet } from '../planet';
import type { Amble } from './amble';
import { FOOT_REST, LEGS, type Leg } from './ambleRig';
import { townDir } from './meadow';

/** The loop: out over the meadow to the right of the lake, up the long rise, round, and back along the river by
 * the ford to where Amble stood (it passes through its old place, heading the way it faced). */
export const LOOP: [number, number][] = [[0, 0], [32, -4], [62, -12], [88, -14], [106, -2], [102, 18], [80, 27], [50, 22], [22, 12], [-6, 4], [-30, -4], [-38, -20], [-20, -18]];
/** The coast: where Amble stands on the last rise over the beach (facing the Sea), and the beach below its head. */
export const COAST = { stand: [-30, -64] as [number, number], face: [-30, -120] as [number, number], beach: [-17, -104] as [number, number], shore: [-23, -111] as [number, number] };
/** The sandy cove the coast walk comes down into (levelled in prepareTown). */
export const COVE = { at: [-30, -80] as [number, number], radius: 18, height: 1.4, blend: 10 };
/** The low sandy ridge between the cove and the Sea, where the goodbye is: high enough that Amble's lowered head
 * comes right down to it (the little world curves away fast, so ground forty metres off lies well below Amble). */
export const RIDGE = { at: [-26, -105] as [number, number], radius: 6, height: 5.4, blend: 9 };

type Mode = 'stand' | 'loop' | 'coast' | 'atCoast' | 'away';

class Path2 {
  curve: THREE.CatmullRomCurve3;
  len: number;
  constructor(pts: [number, number][], closed: boolean) {
    this.curve = new THREE.CatmullRomCurve3(pts.map(([f, l]) => new THREE.Vector3(f, 0, l)), closed, 'centripetal');
    this.len = this.curve.getLength();
  }
  at(s: number) {
    const u = this.curve.closed ? (((s / this.len) % 1) + 1) % 1 : THREE.MathUtils.clamp(s / this.len, 0, 1);
    return { p: this.curve.getPointAt(u), t: this.curve.getTangentAt(u) };
  }
  /** Arclength of the point nearest (f, l). */
  nearest(f: number, l: number) {
    let best = 0, bd = 1e9;
    for (let s = 0; s < this.len; s += 1) { const q = this.at(s).p; const d = (q.x - f) ** 2 + (q.z - l) ** 2; if (d < bd) { bd = d; best = s; } }
    return best;
  }
}

/** Dust and petals kicked up round a foot (one instanced draw). */
export class Kick {
  mesh: THREE.InstancedMesh;
  private N = 220;
  private p: { pos: THREE.Vector3; v: THREE.Vector3; age: number; life: number; size: number; spin: THREE.Vector3; petal: boolean }[] = [];
  private next = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private sc = new THREE.Vector3();
  constructor() {
    const g = new THREE.IcosahedronGeometry(1, 0);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#4a4030', emissiveIntensity: 0.4 }), this.N);
    this.mesh.frustumCulled = false; this.mesh.userData.noOutline = true; this.mesh.visible = false;
    for (let i = 0; i < this.N; i++) {
      this.p.push({ pos: new THREE.Vector3(), v: new THREE.Vector3(), age: 9, life: 1, size: 0, spin: new THREE.Vector3(), petal: false });
      this.mesh.setColorAt(i, new THREE.Color('#ffffff'));
      this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this.m);
    }
  }
  emit(at: THREE.Vector3, up: THREE.Vector3, wet: boolean, n = 22) {
    const t1 = new THREE.Vector3().crossVectors(up, Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize(), t2 = new THREE.Vector3().crossVectors(up, t1);
    const dust = [new THREE.Color('#d9c9a0'), new THREE.Color('#cbb88a'), new THREE.Color('#e4d8b4')];
    const petal = [new THREE.Color('#ffffff'), new THREE.Color('#f4f0e0'), new THREE.Color('#a68ad6'), new THREE.Color('#f2d55a'), new THREE.Color('#ffffff')];
    const water = [new THREE.Color('#e8f6ff'), new THREE.Color('#cfe8f6')];
    for (let k = 0; k < n; k++) {
      const P = this.p[this.next], i = this.next; this.next = (this.next + 1) % this.N;
      const a = Math.random() * Math.PI * 2, r = 2.2 + Math.random() * 1.6;
      P.petal = !wet && Math.random() < 0.45;
      P.pos.copy(at).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).addScaledVector(up, 0.2);
      const out = t1.clone().multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a));
      P.v.copy(out).multiplyScalar((P.petal ? 1.6 : 2.4) * (0.5 + Math.random())).addScaledVector(up, (P.petal ? 2.6 : wet ? 4.5 : 1.4) * (0.6 + Math.random() * 0.7));
      P.age = 0; P.life = P.petal ? 2.6 + Math.random() : wet ? 1.0 : 1.6 + Math.random() * 0.8;
      P.size = P.petal ? 0.07 + Math.random() * 0.04 : wet ? 0.1 + Math.random() * 0.08 : 0.25 + Math.random() * 0.25;
      P.spin.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const pal = wet ? water : P.petal ? petal : dust;
      this.mesh.setColorAt(i, pal[Math.floor(Math.random() * pal.length)]);
    }
    this.mesh.instanceColor!.needsUpdate = true;
    this.mesh.visible = true;
  }
  update(dt: number, center: THREE.Vector3) {
    if (!this.mesh.visible) return;
    let live = 0;
    for (let i = 0; i < this.N; i++) {
      const P = this.p[i];
      if (P.age >= P.life) continue;
      P.age += dt; live++;
      const down = center.clone().sub(P.pos).normalize();
      // dust hangs and drifts; petals flutter down slowly; spray falls
      P.v.addScaledVector(down, (P.petal ? 1.2 : P.size < 0.2 ? 9 : 0.4) * dt).multiplyScalar(1 - (P.petal ? 1.8 : P.size < 0.2 ? 0.5 : 2.4) * dt);
      if (P.petal) { P.v.x += Math.sin(P.age * 7 + i) * 0.04; P.v.z += Math.cos(P.age * 6 + i) * 0.04; }
      P.pos.addScaledVector(P.v, dt);
      const k = P.age / P.life;
      const s = P.petal ? P.size : P.size < 0.2 ? P.size * (1 - k) : P.size * (0.6 + k * 1.4) * (1 - k * k);
      this.e.set(P.spin.x * P.age, P.spin.y * P.age, P.spin.z * P.age);
      this.m.compose(P.pos, this.q.setFromEuler(this.e), this.sc.set(s, P.petal ? s * 0.25 : s * 0.8, s));
      if (P.age >= P.life) this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!live) this.mesh.visible = false;
  }
}

export class AmbleWalker {
  mode: Mode = 'stand';
  readonly loop: Path2;
  private path: Path2;
  /** The marks it is walking to, off the loop (map). */
  private steer: [number, number][] = [];
  /** Along the current path (metres of the map). */
  s = 0;
  /** Where Amble is on the meadow's map, and which way it is going. */
  f = 0; l = 0;
  private hx = 1; private hz = 0;
  private up = new THREE.Vector3();
  private height = 0;
  private have = false;
  readonly kick = new Kick();
  /** Called for each footfall, with where the foot came down (world) and whether it is in water. */
  onStep: ((leg: Leg, at: THREE.Vector3, wet: boolean) => void) | null = null;
  /** The walking pace (the rig's walk: strides a second). */
  pace = 0.25;

  constructor(private p: Planet, private amble: Amble) {
    this.loop = new Path2(LOOP, true);
    this.path = this.loop;
  }

  /** On the loop at s (by default from where Amble stood). */
  startLoop(s = 0) { this.path = this.loop; this.s = s; this.mode = 'loop'; this.steer = []; }

  /** Back on the loop at s, where a save left it (placed at once). */
  resume(s: number) {
    this.startLoop(s);
    const { p: q, t } = this.path.at(s);
    this.f = q.x; this.l = q.z;
    const n = Math.hypot(t.x, t.z) || 1; this.hx = t.x / n; this.hz = t.z / n;
    this.place(true);
  }

  /** Off the loop and down to the coast: it turns, slow as it does everything, and makes for the last rise over
   * the beach, coming in square to the Sea. */
  toCoast() {
    const st = COAST.stand;
    this.steer = [[st[0], st[1] + 26], [st[0], st[1] + 9], st];
    this.mode = 'coast';
  }

  /** Standing at the coast (a save from there, or after the walk down). */
  atCoast() {
    const st = COAST.stand;
    this.f = st[0]; this.l = st[1];
    const d = Math.hypot(COAST.face[0] - st[0], COAST.face[1] - st[1]);
    this.hx = (COAST.face[0] - st[0]) / d; this.hz = (COAST.face[1] - st[1]) / d;
    this.steer = []; this.mode = 'atCoast';
    this.place(true);
  }

  /** After the goodbye: round (a slow, tight turn on the sand), and back across the meadow to the loop. */
  away() {
    const st = COAST.stand;
    this.steer = [[st[0] - 10, st[1] - 4], [st[0] - 12, st[1] + 10], [-30, -34], [-22, -18], [-10, -8]];
    this.mode = 'away';
  }

  /** Where the creature's head end would be now (map). */
  get heading() { return { x: this.hx, z: this.hz }; }

  /** Turn the heading toward (tx, tz) by at most rate * dt radians (Amble never turns in a hurry). */
  private turnTo(tx: number, tz: number, rate: number, dt: number) {
    const a = Math.atan2(tz, tx), b = Math.atan2(this.hz, this.hx);
    let d = a - b; d = Math.atan2(Math.sin(d), Math.cos(d));
    const n = b + THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
    this.hx = Math.cos(n); this.hz = Math.sin(n);
    return Math.abs(d);
  }

  update(dt: number) {
    const A = this.amble, P = A.pose;
    if (this.mode === 'stand') return;
    const moving = this.mode === 'loop' || this.mode === 'coast' || this.mode === 'away';
    // (the map stretches a little out here: metres of the world to metres of the map)
    const d0 = townDir(this.p, this.f, this.l), d1 = townDir(this.p, this.f + this.hx, this.l + this.hz);
    const stretch = Math.max(0.5, d0.angleTo(d1) * this.p.R);
    if (this.mode === 'loop') {
      P.walk = this.pace;
      // along the loop at the speed the planted feet go back, so they stay put on the ground
      this.s += (A.rig.groundSpeed * dt) / stretch;
      const { p: q, t } = this.path.at(this.s);
      this.f = q.x; this.l = q.z;
      if (!this.have) { const n = Math.hypot(t.x, t.z); this.hx = t.x / n; this.hz = t.z / n; }
      else this.turnTo(t.x, t.z, 0.25, dt);
    } else if (moving) {
      // making for the next mark, turning no faster than it can
      const [tf, tl] = this.steer[0];
      const dx = tf - this.f, dz = tl - this.l, dist = Math.hypot(dx, dz);
      const last = this.steer.length === 1;
      const off = this.turnTo(dx, dz, 0.16, dt);
      // (slower while it turns hard, and slowing to a stop at the very end)
      P.walk = this.pace * (off > 1.2 ? 0.6 : 1) * (last && this.mode === 'coast' ? Math.min(1, dist / 9 + 0.25) : 1);
      const step = (A.rig.groundSpeed * dt) / stretch;
      this.f += this.hx * step; this.l += this.hz * step;
      if (dist < (last ? 0.8 : 4)) {
        this.steer.shift();
        if (!this.steer.length) {
          if (this.mode === 'coast') this.mode = 'atCoast';
          else this.startLoop(this.loop.nearest(this.f, this.l));
        }
      }
    } else {
      // at the coast: turn the last little way to face the Sea, then stand
      const off = this.turnTo(COAST.face[0] - this.f, COAST.face[1] - this.l, 0.12, dt);
      P.walk = off > 0.03 ? this.pace * 0.4 : 0;
    }
    this.place(false, dt);
    // the footfalls
    for (const leg of A.rig.planted) {
      const foot = A.rig.bone(leg === 'FL' ? 'footFL' : leg === 'FR' ? 'footFR' : leg === 'BL' ? 'footBL' : 'footBR').getWorldPosition(new THREE.Vector3());
      const dir = foot.clone().sub(this.p.center).normalize();
      const wet = this.p.riverNearest(dir).dist < this.p.cfg.riverWidth + 1.2 || this.p.height(dir) < (this.p.cfg.ocean ?? -99) + 0.3;
      const g = this.p.surfacePoint(dir, 0);
      this.kick.emit(g, dir, wet, wet ? 26 : 22);
      this.onStep?.(leg, g, wet);
    }
    this.kick.update(dt, this.p.center);
  }

  /** Set Amble's root from the path: on the ground under its feet, leaning a little with the slope. */
  private place(snap: boolean, dt = 0) {
    const p = this.p, A = this.amble;
    const dir = townDir(p, this.f, this.l);
    const F = townDir(p, this.f + this.hx * 0.5, this.l + this.hz * 0.5).sub(dir).projectOnPlane(dir).normalize();
    const L = new THREE.Vector3().crossVectors(dir, F).normalize();
    // the ground under the four feet (planted places)
    const ground: Record<Leg, number> = { FL: 0, FR: 0, BL: 0, BR: 0 };
    const gp: Record<Leg, THREE.Vector3> = {} as Record<Leg, THREE.Vector3>;
    const base = dir.clone().multiplyScalar(p.surfaceRadius(dir)).add(p.center);
    for (const l of LEGS) {
      const fr = FOOT_REST[l];
      const w = base.clone().addScaledVector(L, fr.x).addScaledVector(F, fr.z);
      const fd = w.sub(p.center).normalize();
      gp[l] = fd.clone().multiplyScalar(p.surfaceRadius(fd)).add(p.center);
      ground[l] = gp[l].clone().sub(base).dot(dir);
    }
    const yF = (ground.FL + ground.FR) / 2, yB = (ground.BL + ground.BR) / 2, yL = (ground.FL + ground.BL) / 2, yR = (ground.FR + ground.BR) / 2;
    const zSpan = FOOT_REST.FL.z - FOOT_REST.BL.z, xSpan = FOOT_REST.FL.x - FOOT_REST.FR.x;
    // lean with the slope, a little (the legs take up the rest)
    const ap = THREE.MathUtils.clamp(Math.atan((yF - yB) / zSpan) * 0.6, -0.12, 0.12);
    const ar = THREE.MathUtils.clamp(Math.atan((yL - yR) / xSpan) * 0.6, -0.1, 0.1);
    const up = dir.clone().addScaledVector(F, -Math.tan(ap)).addScaledVector(L, -Math.tan(ar)).normalize();
    const h = (ground.FL + ground.FR + ground.BL + ground.BR) / 4 - 0.05;
    if (snap || !this.have) { this.up.copy(up); this.height = h; this.have = true; }
    else {
      this.up.lerp(up, 1 - Math.exp(-1.6 * dt)).normalize();
      this.height += (h - this.height) * (1 - Math.exp(-2.2 * dt));
    }
    const root = A.root;
    root.position.copy(base).addScaledVector(dir, this.height);
    const Fz = F.clone().projectOnPlane(this.up).normalize(), Lx = new THREE.Vector3().crossVectors(this.up, Fz).normalize();
    root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(Lx, this.up, Fz));
    root.updateMatrixWorld(true);
    // each foot reaches to its own ground
    for (const l of LEGS) A.setGround(l, THREE.MathUtils.clamp(gp[l].clone().sub(root.position).dot(this.up), -3.2, 3.2));
  }
}
