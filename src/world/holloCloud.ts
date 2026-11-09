import * as THREE from 'three';
import type { Hollo } from './hollo';
import type { Planet } from './planet';
import { clamp, smoothstep } from './noise';

/**
 * Hollo becomes the clouds. When he wakes he lets go of himself: every soft lump of his coat turns into a
 * painted cloud puff (the same soft three-tone cumulus as the sky's own clouds), swirls round the fire and
 * the people, drifts out over the river and settles into a ring of clouds above the peaks. One big cloud is
 * still him: it keeps his eyes a moment, winks, and then is only cloud. Afterwards the ring turns slowly
 * round the peaks for good.
 *
 * set(k) is a pure function of k (0..1), so the cutscene camera can follow it and a replay looks the same.
 */

interface Piece {
  /** The fur lump it was: it shrinks away as the cloud puff grows in its place. */
  m: THREE.Mesh;
  /** Where it was on him, and how big (world). */
  s0: THREE.Vector3; sc0: number; scv: THREE.Vector3;
  /** Where it ends up in the ring, how much it grows, and the cloud it belongs to. */
  t: THREE.Vector3; grow: number; cloud: number;
  /** When it lets go (0..0.25 of the sequence), and its swirl. */
  delay: number; phase: number; rad: number; lift: number;
  /** A point over the river it drifts past on the way up. */
  river: THREE.Vector3;
  bob: number; flat: number; yaw: number;
  /** Where it is now, and how big. */
  pos: THREE.Vector3; size: number;
}

export interface HolloCloudPlan {
  /** Where the swirl turns: between Hollo and the fire, on the ground. */
  swirl: THREE.Vector3;
  /** The axis the ring of clouds turns round (unit, from the planet center), and its height above the ground. */
  axis: THREE.Vector3;
  /** Where his own big cloud settles (unit direction). */
  home: THREE.Vector3;
  /** Points over the river the puffs drift past (world). */
  river: (r: () => number) => THREE.Vector3;
}

const ORBIT_PERIOD = 900; // seconds for the ring to go once round the peaks
const RING_ALT = 30; // how high over the planet's radius the ring floats
const RING_TILT = 0.4; // its radius, as an angle round the axis

/** The sky's painted cumulus, for clouds that sit on a round world: shaded by the local up, not by world y. */
function cloudMaterial() {
  return new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uTop: { value: new THREE.Color('#fff7ea') },
      uBelly: { value: new THREE.Color('#9eb0d2') },
      uDay: { value: 1 },
      uDusk: { value: new THREE.Color('#ffb29a') },
      uDuskAmt: { value: 0 },
      uSky: { value: new THREE.Color('#b4def2') },
      uCenter: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */ `
      uniform vec3 uCenter;
      varying vec3 vN; varying vec3 vW; varying vec3 vUp; varying float vSeed;
      void main(){
        vec3 lp = position; lp.y = max(lp.y, -0.62);
        vec4 wp = modelMatrix * instanceMatrix * vec4(lp, 1.0);
        vW = wp.xyz;
        vec3 nn = position.y < -0.61 ? vec3(0.0, -1.0, 0.0) : normal;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * nn);
        vUp = normalize(instanceMatrix[3].xyz - uCenter);
        vSeed = fract(instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uTop, uBelly, uDusk, uSky; uniform float uDay, uDuskAmt;
      varying vec3 vN; varying vec3 vW; varying vec3 vUp; varying float vSeed;
      float h3(vec3 p){ p = fract(p * 0.3183 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vec3 N0 = normalize(vN), N = N0;
        vec3 q = vW * 0.8;
        N = normalize(N + (vec3(n3(q), n3(q + 7.1), n3(q + 13.7)) - 0.5) * 0.5);
        vec3 V = normalize(cameraPosition - vW);
        float lit = dot(N, uSun) * 0.5 + 0.5;
        float ny = dot(N, vUp);
        float k = smoothstep(-0.5, 0.7, ny) * 0.55 + lit * 0.45;
        vec3 shade = mix(uBelly, uTop, 0.3), body = mix(uBelly, uTop, 0.75), crown = uTop * 1.05;
        vec3 col = k < 0.5 ? mix(shade, body, smoothstep(0.3, 0.5, k)) : mix(body, crown, smoothstep(0.58, 0.72, k));
        col = mix(col, col * mix(vec3(1.0), uDusk * 1.12, 0.4), uDuskAmt * (0.3 + lit * 0.7));
        col *= mix(0.3, 1.0, uDay);
        // soft edges and bellies melt into the air behind them: no hard rim
        float edge = pow(1.0 - abs(dot(N0, V)), 1.5);
        float belly = smoothstep(0.1, -0.8, dot(N0, vUp));
        col = mix(col, uSky * mix(0.35, 1.0, uDay), clamp(edge * 0.6 + belly * 0.3, 0.0, 0.8));
        col *= 0.97 + vSeed * 0.06;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export class HolloCloud {
  /** 'body': still Hollo. 'going': coming apart. 'sky': clouds. */
  state: 'body' | 'going' | 'sky' = 'body';
  private pieces: Piece[] = [];
  private puffs: THREE.InstancedMesh | null = null;
  private mat = cloudMaterial();
  private eyes: THREE.Group | null = null;
  private eyeMats: THREE.Material[] = [];
  private eyeBase: THREE.Vector3[] = [];
  private eyeStart = new THREE.Vector3();
  private eyeScale0 = 1;
  private drift = 0;
  private k = 0;
  private pl!: HolloCloudPlan;
  private frame = { up: new THREE.Vector3(), t1: new THREE.Vector3(), t2: new THREE.Vector3() };
  private bigW = 6.5; private bigH = 3.2;
  /** Where his own big cloud is (world), for the camera and for looking up at him in play. */
  readonly bigCloud = new THREE.Vector3();
  /** Where his cloud settles, before any drift (world). */
  private bigLocal = new THREE.Vector3();
  /** The middle of the ring, high over the peaks (world). */
  readonly ringCenter = new THREE.Vector3();

  constructor(private h: Hollo, private p: Planet, private scene: THREE.Scene, private plan: () => HolloCloudPlan,
    private sky: () => THREE.ShaderMaterial | undefined) {}

  /** He lets go: his coat lumps start their flight from exactly where they are. */
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
    this.ringCenter.copy(ax).multiplyScalar(this.p.R + RING_ALT).add(C);
    const a1 = plan.home.clone().projectOnPlane(ax).normalize(), a2 = new THREE.Vector3().crossVectors(ax, a1);
    const clouds: { c: THREE.Vector3; w: number; hgt: number }[] = [];
    const ringAt = (ang: number, alt: number) => ax.clone().multiplyScalar(Math.cos(RING_TILT)).addScaledVector(a1, Math.sin(RING_TILT) * Math.cos(ang))
      .addScaledVector(a2, Math.sin(RING_TILT) * Math.sin(ang)).normalize().multiplyScalar(this.p.R + alt).add(C);
    clouds.push({ c: ringAt(0, RING_ALT), w: this.bigW, hgt: this.bigH });
    for (let i = 0; i < 7; i++) clouds.push({ c: ringAt((i + 1) / 8 * Math.PI * 2 + (r() - 0.5) * 0.25, RING_ALT + (r() - 0.5) * 4), w: 4 + r() * 1.4, hgt: 2 + r() * 0.7 });
    this.bigLocal.copy(clouds[0].c);
    // a third of him stays together as his own cloud; the rest is shared round the ring
    const ws = new THREE.Vector3(), sc = new THREE.Vector3();
    h.puffs.forEach((m, i) => {
      m.getWorldPosition(ws);
      const s0 = ws.clone();
      m.getWorldScale(sc);
      const cloud = r() < 0.34 ? 0 : 1 + (i % 7);
      const cl = clouds[cloud], cu = cl.c.clone().sub(C).normalize();
      const c1 = new THREE.Vector3(0, 0, 1).projectOnPlane(cu).normalize(), c2 = new THREE.Vector3().crossVectors(cu, c1);
      // a cumulus: wide and flat-bottomed, heaped up in the middle
      const a = r() * Math.PI * 2, rr = Math.sqrt(r());
      const x = Math.cos(a) * rr * cl.w, z = Math.sin(a) * rr * cl.w * 0.6;
      const y = (1 - rr * rr) * cl.hgt * (0.4 + r() * 0.6);
      const t = cl.c.clone().addScaledVector(c1, x).addScaledVector(c2, z).addScaledVector(cu, y);
      const rel = s0.clone().sub(plan.swirl);
      const top = clamp((s0.clone().sub(h.root.position).dot(up)) / 9); // the top of his back lets go first
      const size0 = (sc.x + sc.y + sc.z) / 3;
      this.pieces.push({
        m, s0, sc0: size0, scv: sc.clone(), t, cloud,
        grow: Math.max(1.3, (cloud === 0 ? 2.4 : 2.0) * (1.25 - rr * 0.45) * (0.9 + r() * 0.3) * Math.min(1.6, 1 / Math.max(0.5, size0))),
        delay: ((1 - top) * 0.16 + r() * 0.08) * (cloud === 0 ? 0.6 : 1),
        phase: Math.atan2(rel.dot(t2), rel.dot(t1)) + (r() - 0.5) * Math.PI * 1.6, rad: 5 + r() * 4, lift: 2 + r() * 4,
        river: plan.river(r), bob: r() * Math.PI * 2, flat: 0.8 + r() * 0.12, yaw: r() * Math.PI * 2,
        pos: s0.clone(), size: 0,
      });
      m.castShadow = false;
    });
    // the soft puffs themselves: one instanced draw, painted like the sky's own cumulus
    const geo = new THREE.IcosahedronGeometry(1, 3);
    this.puffs = new THREE.InstancedMesh(geo, this.mat, this.pieces.length);
    this.puffs.frustumCulled = false;
    this.puffs.userData.noOutline = true;
    this.puffs.renderOrder = 2;
    this.mat.uniforms.uCenter.value.copy(C);
    this.scene.add(this.puffs);
    // his eyes come too, on a little rig whose origin is right between them
    const rig = new THREE.Group(), inner = new THREE.Group();
    h.head.updateWorldMatrix(true, false);
    const hp = new THREE.Vector3(), hq = new THREE.Quaternion(), hs = new THREE.Vector3();
    h.head.matrixWorld.decompose(hp, hq, hs);
    inner.position.set(0, -0.22, -1.18);
    rig.add(inner);
    for (const e of h.eyes) {
      const c = e.clone(true);
      let ro = 30;
      c.traverse(o => {
        const mm = o as THREE.Mesh;
        if (!mm.isMesh) return;
        const mat = (mm.material as THREE.Material).clone();
        mat.transparent = true; mat.depthWrite = false;
        mm.material = mat; mm.renderOrder = ro++; this.eyeMats.push(mat);
      });
      c.visible = true;
      inner.add(c);
      this.eyeBase.push(c.scale.clone());
      e.visible = false; e.scale.setScalar(1e-4);
    }
    for (const l of h.lids) l.scale.setScalar(1e-4);
    this.eyeStart.set(0, 0.22, 1.18).multiplyScalar(hs.x).applyQuaternion(hq).add(hp);
    this.eyeScale0 = hs.x;
    rig.position.copy(this.eyeStart); rig.quaternion.copy(hq); rig.scale.setScalar(hs.x);
    this.scene.add(rig);
    this.eyes = rig;
    this.state = 'going';
    this.k = 0;
    this.set(0);
  }

  /** Where one piece is at sequence time k. */
  private at(pc: Piece, k: number, out: THREE.Vector3) {
    const plan = this.pl, { up, t1, t2 } = this.frame;
    const s = clamp((k - pc.delay) / 0.62);
    // 1. round and round over the fire and the people, climbing
    const sw = (u: number) => {
      const th = pc.phase + u * Math.PI * 2.2;
      const rad = pc.rad * (0.45 + smoothstep(0, 0.35, u) * 0.65);
      return plan.swirl.clone().addScaledVector(up, 3 + pc.lift * smoothstep(0, 0.5, u) + u * 5).addScaledVector(t1, Math.cos(th) * rad).addScaledVector(t2, Math.sin(th) * rad);
    };
    const leave = smoothstep(0, 0.16, s);
    out.copy(pc.s0).lerp(sw(s), leave);
    // 2. out over the river, and up into the ring
    const e = smoothstep(0.32, 1, s);
    if (e > 0) {
      const w1 = sw(0.42);
      const u = e, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      const bez = w1.multiplyScalar(a).addScaledVector(pc.river, b).addScaledVector(pc.t, c);
      out.lerp(bez, smoothstep(0.32, 0.6, s));
    }
    return s;
  }

  /** Sequence time k (0..1): coming apart, the swirl, the ring, the wink. */
  set(k: number) {
    if (this.state === 'body') return;
    this.k = k;
    const h = this.h;
    // what is left of the body sinks softly into itself as the coat leaves it
    h.body.scale.setScalar(Math.max(1e-4, 1 - smoothstep(0.04, 0.4, k)));
    for (const pc of this.pieces) {
      const s = this.at(pc, k, pc.pos);
      // the fur lump melts away as the cloud puff swells in its place
      const swap = smoothstep(0.0, 0.12, s);
      pc.m.position.copy(pc.pos);
      h.root.worldToLocal(pc.m.position);
      if (pc.m.parent !== h.root) { pc.m.parent?.remove(pc.m); h.root.add(pc.m); }
      pc.m.scale.copy(pc.scv).multiplyScalar(Math.max(1e-4, (1 - swap) / h.root.scale.x));
      pc.m.visible = swap < 0.999;
      pc.size = pc.sc0 * (0.2 + swap * 0.95) * smoothstep(0, 0.06, s) * (1 + (pc.grow - 1) * smoothstep(0.62, 1, s));
    }
    this.writePuffs(0);
    if (this.eyes) {
      const rig = this.eyes, s = clamp((k - 0.04) / 0.72);
      const mid = this.pl.swirl.clone().addScaledVector(this.frame.up, 10);
      const end = this.bigLocal.clone().addScaledVector(this.bigLocal.clone().sub(this.p.center).normalize(), this.bigH * 0.55);
      const u = smoothstep(0, 1, s), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      rig.position.copy(this.eyeStart).multiplyScalar(a).addScaledVector(mid, b).addScaledVector(end, c);
      rig.scale.setScalar(this.eyeScale0 + (5.5 - this.eyeScale0) * u);
      // the wink: one eye, slowly; both the same until then
      const wink = Math.sin(clamp((k - 0.79) / 0.08) * Math.PI);
      const inner = rig.children[0];
      inner.children.forEach((e, i) => e.scale.copy(this.eyeBase[i]).multiply(new THREE.Vector3(1, i === 1 ? 1 - wink * 0.9 : 1, 1)));
      // they ride inside the swarm (hidden by it) until they come out on the front of his cloud
      const fade = smoothstep(0.0, 0.03, 0.12 - k) + smoothstep(0.6, 0.68, k) - smoothstep(0.88, 0.96, k);
      for (const m of this.eyeMats) { m.opacity = clamp(fade); m.depthTest = k < 0.55; }
      rig.visible = fade > 0.01;
    }
    if (k >= 1) this.finish();
  }

  /** Turn the eyes to look at the camera, sitting on the near side of his cloud. Call after the camera is set. */
  eyesFace(cam: THREE.Vector3) {
    if (!this.eyes) return;
    const rig = this.eyes, up = rig.position.clone().sub(this.p.center).normalize();
    const to = cam.clone().sub(rig.position).normalize();
    // out to the front of the cloud once they are on it
    const front = smoothstep(0.55, 0.72, this.k) * (this.bigW * 0.75);
    rig.position.addScaledVector(to, front);
    const m = new THREE.Matrix4().lookAt(cam, rig.position, up);
    rig.quaternion.setFromRotationMatrix(m);
  }

  private writePuffs(t: number) {
    const inst = this.puffs; if (!inst) return;
    const C = this.p.center, m = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), up = new THREE.Vector3();
    this.pieces.forEach((pc, i) => {
      up.copy(pc.pos).sub(C).normalize();
      q.setFromUnitVectors(Y, up).multiply(qy.setFromAxisAngle(Y, pc.yaw));
      const b = 1 + Math.sin(t * 0.4 + pc.bob) * 0.03;
      s.set(pc.size * b, pc.size * pc.flat * b, pc.size * b);
      m.compose(pc.pos, q, s);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    // the same light as the sky's own clouds, every frame
    const sk = this.sky(), U = this.mat.uniforms;
    if (sk) for (const n of ['uSun', 'uTop', 'uBelly', 'uDay', 'uDusk', 'uDuskAmt', 'uSky']) {
      const v = sk.uniforms[n]?.value;
      if (v === undefined) continue;
      if (typeof v === 'number') U[n].value = v; else U[n].value.copy(v);
    }
  }

  /** The middle of the moving swarm, for the camera to follow. */
  centroid(out = new THREE.Vector3()) {
    out.set(0, 0, 0); let n = 0;
    for (let i = 0; i < this.pieces.length; i += 3) { out.add(this.pieces[i].pos); n++; }
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
    for (const pc of this.pieces) { pc.t.copy(pc.pos); pc.m.visible = false; }
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
    const q = new THREE.Quaternion().setFromAxisAngle(this.pl.axis.clone().normalize(), this.drift);
    const v = new THREE.Vector3();
    for (const pc of this.pieces) {
      v.copy(pc.t).sub(C).applyQuaternion(q);
      pc.pos.copy(C).add(v).addScaledVector(v.normalize(), Math.sin(t * 0.25 + pc.bob) * 0.25);
    }
    this.writePuffs(t);
    this.bigCloud.copy(this.bigLocal).sub(C).applyQuaternion(q).add(C);
  }
}
