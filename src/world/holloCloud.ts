import * as THREE from 'three';
import type { Hollo } from './hollo';
import type { Planet } from './planet';
import { clamp, smoothstep } from './noise';
import { toon } from './props';

/**
 * Hollo becomes the clouds. When he wakes he lets go of himself: every soft lump of his coat floats off,
 * swirls round the fire and the people, drifts out over the river and settles into a ring of clouds above
 * the peaks. One big cloud is still him: it keeps his eyes a moment, winks, and then is only cloud.
 * Afterwards the ring turns slowly round the peaks for good.
 *
 * set(k) is a pure function of k (0..1), so the cutscene camera can follow it and a replay looks the same.
 */

interface Piece {
  m: THREE.Mesh;
  /** Where it was on him, and how big (world). */
  s0: THREE.Vector3; sc0: THREE.Vector3;
  /** Where it ends up in the ring, how much it grows, and the cloud it belongs to. */
  t: THREE.Vector3; grow: number; cloud: number;
  /** When it lets go (0..0.25 of the sequence), and its swirl. */
  delay: number; phase: number; rad: number; lift: number;
  /** A point over the river it drifts past on the way up. */
  river: THREE.Vector3;
  bob: number;
}

export interface HolloCloudPlan {
  /** Where the swirl turns: between Hollo and the fire, on the ground. */
  swirl: THREE.Vector3;
  /** The axis the ring of clouds turns round (unit, from the planet center). */
  axis: THREE.Vector3;
  /** Where his own big cloud settles (unit direction). */
  home: THREE.Vector3;
  /** Points over the river the puffs drift past (world). */
  river: (r: () => number) => THREE.Vector3;
  /** Where the last wide shot looks from, so his eyes face it when they wink. */
  viewer: THREE.Vector3;
}

const ORBIT_PERIOD = 900; // seconds for the ring to go once round the peaks

export class HolloCloud {
  /** 'body': still Hollo. 'going': coming apart. 'sky': clouds. */
  state: 'body' | 'going' | 'sky' = 'body';
  private pieces: Piece[] = [];
  private eyes: THREE.Group | null = null;
  private eyeMats: THREE.Material[] = [];
  private glows: THREE.MeshToonMaterial[] = [];
  private eyeStart = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
  private eyeEnd = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
  private drift = 0;
  private k = 0;
  private pl!: HolloCloudPlan;
  private frame = { up: new THREE.Vector3(), t1: new THREE.Vector3(), t2: new THREE.Vector3() };
  /** Where his own big cloud is (world), for the camera and for looking up at him in play. */
  readonly bigCloud = new THREE.Vector3();
  /** Where his cloud settles, before any drift (world). */
  private bigLocal = new THREE.Vector3();

  constructor(private h: Hollo, private p: Planet, private scene: THREE.Scene, private plan: () => HolloCloudPlan) {}

  /** He lets go: his coat lumps leave his body (keeping exactly where they are) and start their flight. */
  begin() {
    if (this.state !== 'body') return;
    const h = this.h, C = this.p.center, plan = (this.pl = this.plan());
    let sd = 41; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    h.root.updateWorldMatrix(true, true);
    const up = plan.swirl.clone().sub(C).normalize();
    const t1 = new THREE.Vector3(1, 0, 0).projectOnPlane(up).normalize(), t2 = new THREE.Vector3().crossVectors(up, t1);
    this.frame = { up, t1, t2 };
    // the clouds: his own big one, and seven smaller ones in a ring round the peaks
    const ax = plan.axis.clone().normalize();
    const a1 = new THREE.Vector3(0, 1, 0).projectOnPlane(ax).normalize(), a2 = new THREE.Vector3().crossVectors(ax, a1);
    const homeAng = Math.atan2(plan.home.dot(a2), plan.home.dot(a1));
    const clouds: { c: THREE.Vector3; w: number; hgt: number }[] = [];
    clouds.push({ c: plan.home.clone().normalize().multiplyScalar(this.p.R + 27).add(C), w: 6.5, hgt: 3.2 });
    for (let i = 0; i < 7; i++) {
      const ang = homeAng + (i + 1) / 8 * Math.PI * 2 + (r() - 0.5) * 0.3;
      const tilt = 0.36 + (r() - 0.5) * 0.08;
      const d = ax.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(a1, Math.sin(tilt) * Math.cos(ang)).addScaledVector(a2, Math.sin(tilt) * Math.sin(ang)).normalize();
      clouds.push({ c: d.multiplyScalar(this.p.R + 31 + r() * 8).add(C), w: 3.6 + r() * 1.6, hgt: 1.8 + r() * 0.8 });
    }
    this.bigLocal.copy(clouds[0].c);
    // a third of him stays together as his own cloud; the rest is shared round the ring
    const ws = new THREE.Vector3();
    h.puffs.forEach((m, i) => {
      m.getWorldPosition(ws);
      const s0 = ws.clone();
      const sc0 = m.getWorldScale(new THREE.Vector3());
      const cloud = r() < 0.34 ? 0 : 1 + (i % 7);
      const cl = clouds[cloud], cu = cl.c.clone().sub(C).normalize();
      const c1 = new THREE.Vector3(0, 0, 1).projectOnPlane(cu).normalize(), c2 = new THREE.Vector3().crossVectors(cu, c1);
      // a cumulus: wide and flat-bottomed, heaped up in the middle
      const a = r() * Math.PI * 2, rr = Math.sqrt(r());
      const x = Math.cos(a) * rr * cl.w, z = Math.sin(a) * rr * cl.w * 0.7;
      const y = (1 - rr * rr) * cl.hgt * (0.4 + r() * 0.6);
      const t = cl.c.clone().addScaledVector(c1, x).addScaledVector(c2, z).addScaledVector(cu, y);
      const rel = s0.clone().sub(plan.swirl);
      const top = clamp(rel.dot(up) / 6); // the top of his back lets go first
      this.pieces.push({
        m, s0, sc0, t, cloud,
        grow: (cloud === 0 ? 1.9 : 1.5) * (1.25 - rr * 0.45) * (0.9 + r() * 0.3),
        delay: ((1 - top) * 0.16 + r() * 0.09) * (cloud === 0 ? 0.6 : 1),
        phase: Math.atan2(rel.dot(t2), rel.dot(t1)), rad: 4 + r() * 5, lift: 2 + r() * 5,
        river: plan.river(r), bob: r() * Math.PI * 2,
      });
      this.scene.attach(m);
      m.castShadow = false;
      // the same colour, but able to glow a little: up in the sun a cloud is whiter than fur
      const mat = m.material as THREE.MeshToonMaterial;
      const glow = toon('#' + mat.color.getHexString(), '#fff6ec', 0);
      m.material = glow;
      if (!this.glows.includes(glow)) this.glows.push(glow);
    });
    // his eyes come too, on a little rig that rides with his own cloud
    const rig = new THREE.Group();
    h.head.updateWorldMatrix(true, false);
    h.head.matrixWorld.decompose(rig.position, rig.quaternion, rig.scale);
    for (const e of h.eyes) {
      const c = e.clone(true);
      c.traverse(o => { const mm = o as THREE.Mesh; if (mm.isMesh) { const mat = (mm.material as THREE.Material).clone(); mat.transparent = true; mm.material = mat; this.eyeMats.push(mat); } });
      c.visible = true;
      rig.add(c);
      e.scale.setScalar(1e-4);
    }
    this.eyeStart.p.copy(rig.position); this.eyeStart.q.copy(rig.quaternion); this.eyeStart.s = rig.scale.x;
    // they end on the front of his cloud, looking at the valley
    const bigUp = this.bigLocal.clone().sub(C).normalize();
    const toView = plan.viewer.clone().sub(this.bigLocal).normalize();
    this.eyeEnd.s = 9;
    // the rig's origin is the middle of his old head: the eyes sit 1.18 in front of it
    this.eyeEnd.p.copy(this.bigLocal).addScaledVector(toView, clouds[0].w * 0.62 + 2 - 1.18 * this.eyeEnd.s).addScaledVector(bigUp, clouds[0].hgt * 0.45);
    this.eyeEnd.q.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), toView.clone().negate(), bigUp));
    rig.scale.setScalar(this.eyeStart.s);
    this.scene.add(rig);
    this.eyes = rig;
    this.state = 'going';
    this.k = 0;
    this.set(0);
  }

  /** Where one piece is at sequence time k. */
  private at(pc: Piece, k: number, out: THREE.Vector3) {
    const plan = this.pl, { up, t1, t2 } = this.frame;
    const s = clamp((k - pc.delay) / 0.6);
    // 1. round and round the fire, climbing
    const sw = (u: number) => {
      const th = pc.phase + u * Math.PI * 2.4;
      const rad = pc.rad * (0.5 + smoothstep(0, 0.4, u) * 0.6);
      return plan.swirl.clone().addScaledVector(up, 2.5 + pc.lift * smoothstep(0, 0.5, u) + u * 6).addScaledVector(t1, Math.cos(th) * rad).addScaledVector(t2, Math.sin(th) * rad);
    };
    const leave = smoothstep(0, 0.14, s);
    out.copy(pc.s0).lerp(sw(s), leave);
    // 2. out over the river, and up into the ring
    const e = smoothstep(0.3, 1, s);
    if (e > 0) {
      const w1 = sw(0.42);
      const u = e, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      const bez = w1.multiplyScalar(a).addScaledVector(pc.river, b).addScaledVector(pc.t, c);
      out.lerp(bez, smoothstep(0.3, 0.6, s));
    }
    return s;
  }

  /** Sequence time k (0..1): coming apart, the swirl, the ring, the wink. */
  set(k: number) {
    if (this.state === 'body') return;
    this.k = k;
    const h = this.h, v = new THREE.Vector3();
    // what is left of the body sinks into itself as the coat leaves it
    h.body.scale.setScalar(Math.max(1e-4, 1 - smoothstep(0.02, 0.36, k)));
    for (const pc of this.pieces) {
      const s = this.at(pc, k, v);
      pc.m.position.copy(v);
      pc.m.scale.copy(pc.sc0).multiplyScalar(1 + (pc.grow - 1) * smoothstep(0.45, 1, s));
    }
    for (const m of this.glows) m.emissiveIntensity = 0.4 * smoothstep(0.3, 0.9, k);
    if (this.eyes) {
      const rig = this.eyes, s = clamp((k - 0.04) / 0.74);
      const mid = this.pl.swirl.clone().addScaledVector(this.frame.up, 9);
      const u = smoothstep(0, 1, s), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      rig.position.copy(this.eyeStart.p).multiplyScalar(a).addScaledVector(mid, b).addScaledVector(this.eyeEnd.p, c);
      rig.quaternion.copy(this.eyeStart.q).slerp(this.eyeEnd.q, smoothstep(0.1, 0.9, s));
      rig.scale.setScalar(this.eyeStart.s + (this.eyeEnd.s - this.eyeStart.s) * u);
      // the wink: one eye, slowly
      const wink = Math.sin(clamp((k - 0.78) / 0.08) * Math.PI);
      const right = rig.children[1];
      if (right) right.scale.y = 1.15 * (1 - wink * 0.9);
      const fade = 1 - smoothstep(0.88, 0.97, k);
      for (const m of this.eyeMats) m.opacity = fade;
      rig.visible = fade > 0.01;
    }
    if (k >= 1) this.finish();
  }

  /** The middle of the moving swarm, for the camera to follow. */
  centroid(out = new THREE.Vector3()) {
    out.set(0, 0, 0); let n = 0;
    for (let i = 0; i < this.pieces.length; i += 5) { out.add(this.pieces[i].m.position); n++; }
    return n ? out.multiplyScalar(1 / n) : out.copy(this.h.root.position);
  }

  /** The eyes, while they last. */
  eyesAt(out = new THREE.Vector3()) { return this.eyes ? out.copy(this.eyes.position) : out.copy(this.bigCloud); }

  /** Where his cloud ends up, before it starts drifting (world). */
  homeCloud(out = new THREE.Vector3()) { return out.copy(this.bigLocal); }

  private finish() {
    this.state = 'sky';
    this.h.root.visible = false;
    if (this.eyes) { this.scene.remove(this.eyes); this.eyes = null; for (const m of this.eyeMats) m.dispose(); this.eyeMats = []; }
    for (const pc of this.pieces) { pc.t.copy(pc.m.position); }
    this.bigCloud.copy(this.bigLocal);
  }

  /** Straight to the end: he is clouds (a loaded save). */
  settle() {
    if (this.state === 'body') this.begin();
    if (this.state === 'going') this.set(1);
  }

  /** In play: the ring turns slowly round the peaks, and every puff breathes a little. */
  update(dt: number, t: number) {
    if (this.state !== 'sky') return;
    this.drift += dt * Math.PI * 2 / ORBIT_PERIOD;
    const C = this.p.center;
    const q = new THREE.Quaternion().setFromAxisAngle(this.pl.axis, this.drift);
    const v = new THREE.Vector3();
    for (const pc of this.pieces) {
      v.copy(pc.t).sub(C).applyQuaternion(q);
      const up = v.clone().normalize();
      pc.m.position.copy(C).add(v).addScaledVector(up, Math.sin(t * 0.25 + pc.bob) * 0.25);
    }
    this.bigCloud.copy(this.bigLocal).sub(C).applyQuaternion(q).add(C);
  }
}
