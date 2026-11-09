import * as THREE from 'three';
import { Person, type PersonLook, type PoseInput } from '../../player/person';
import {
  Kit, Sway, cap, sph, cyl, box, tor, cone, lathe, folds, handGeo, face, neckHead, anchors, pivot,
  type V3, type FaceSpec,
} from '../../player/villagers';
import { toon } from '../props';
import { lerp } from '../noise';
import { WindScarf, SKY_WIND, type ScarfSpec, type ScarfCollider } from './windScarf';

export { Crowd, type CrowdSpot } from './windCrowd';
export { SKY_WIND } from './windScarf';

// The windfolk of the Sky Isles: light, long-limbed people whose long scarves always stream in the wind.
// They are built in exactly the same hand as the World 1 villagers (src/player/villagers.ts): small parts
// of one colour on one joint merged by the Kit, layered clothes with folds, hands with fingers, the same
// face, hair and cloth on Sway springs, and the shared Person joints, so the same walk (gait), idles and
// talking poses drive them. On top of that every windfolk has:
//   - WindScarf tails (src/world/skyIsles/windScarf.ts), simulated cloth ribbons that trail and ripple,
//   - three more poses: cheer (both arms up, hopping), reach (a big wave up and out, picture 4)
//     and glide (lying prone on a kite-wing, hands on the bar, legs trailing, head up).
//
//   const lark = makeWindfolk('lark');  scene.add(lark.root);
//   lark.animate(dt, { speed: 0, grounded: true, reach: 1 });
//
// Cost of one named character: about 14-20 draw calls (merged parts and their ink) and 9-13k triangles,
// like a World 1 villager. For a crowd use Crowd (windCrowd.ts): 60 people in 2 draw calls.

export type WindfolkKind = 'lark' | 'zephy' | 'wren' | 'mender' | 'chimer' | 'crowd';

/** Person's pose plus the windfolk's own. */
export interface WindPose extends PoseInput {
  /** Both arms up, cheering, a little hop (0..1). */
  cheer?: number;
  /** A big wave: one arm reaches up and out, the body leans after it (0..1). */
  reach?: number;
  /** Which arm reaches: 1 = the right (default), -1 = the left. */
  reachSide?: number;
  /** Lying prone on a kite-wing (0..1). At 1 the hips sit at the root's origin, the body along -z. */
  glide?: number;
  /** Roll of the wing while gliding (radians, + = right wing down). */
  bank?: number;
  /** The air's velocity in world space (m/s); defaults to SKY_WIND. Scarves, hair and cloth follow it. */
  air?: THREE.Vector3;
}

interface Built { scarves: { anchor: THREE.Object3D; spec: ScarfSpec }[]; colliders: ScarfCollider[]; cocky?: boolean; smile?: number }

/** A windfolk: a Person (use it exactly like a World 1 villager) with scarves and the extra poses. */
export class Windfolk extends Person {
  scarves: WindScarf[] = [];
  private sm2: Record<string, number> = {};
  private t2 = Math.random() * 10;
  private wl = new THREE.Vector3();
  private cocky: boolean;
  private smileDefault: number;

  constructor(public kind: WindfolkKind, look: PersonLook, built: Built) {
    super(look);
    for (const s of built.scarves) this.scarves.push(new WindScarf(s.anchor, this.root, s.spec, built.colliders));
    this.cocky = !!built.cocky;
    this.smileDefault = built.smile ?? 0;
  }

  private ease(key: string, target: number, dt: number, rate: number) {
    const v = this.sm2[key] ?? target;
    return (this.sm2[key] = lerp(v, target, 1 - Math.exp(-rate * dt)));
  }

  animate(dt: number, p: WindPose) {
    this.t2 += dt;
    const t = this.t2;
    const air = p.air ?? SKY_WIND;
    // the air in this person's own frame drives the springs (braids, apron, hat ribbons)
    if (!p.windLocal) {
      this.root.updateWorldMatrix(true, false);
      this.wl.copy(air).multiplyScalar(0.12).transformDirection(this.root.matrixWorld.clone().invert()).multiplyScalar(Math.min(1.2, air.length() * 0.15));
    }
    const smile = Math.max(p.smile ?? 0, this.smileDefault);
    super.animate(dt, { ...p, smile, windLocal: p.windLocal ?? this.wl });

    const cheer = this.ease('cheer', p.cheer ?? 0, dt, 6);
    const reach = this.ease('reach', p.reach ?? 0, dt, 5);
    const glide = this.ease('glide', p.glide ?? 0, dt, 5);
    const bank = this.ease('bank', p.bank ?? 0, dt, 4);
    const still = p.speed < 0.3 ? 1 : 0;

    // windfolk lean into the wind a little when they stand, and sway with the gusts
    this.torso.rotation.z += Math.sin(t * 0.8) * 0.02 * still;

    // ---- cheer: arms flung up in a V, fists pumping, small hops, head up, mouth open
    if (cheer > 0.001) {
      const pump = Math.sin(t * 7.5);
      for (let i = 0; i < 2; i++) {
        const A = this.arms[i], s = i === 0 ? -1 : 1;
        const ph = pump * (i ? 1 : -1);
        A.sh.rotation.x = lerp(A.sh.rotation.x, -0.35 + ph * 0.12, cheer);
        A.sh.rotation.z = lerp(A.sh.rotation.z, s * (2.55 + ph * 0.18), cheer);
        A.el.rotation.x = lerp(A.el.rotation.x, -0.45 - Math.max(0, ph) * 0.5, cheer);
      }
      const hop = Math.max(0, Math.sin(t * 5.2)) * 0.06;
      this.hips.position.y += hop * cheer;
      this.torso.rotation.x -= 0.12 * cheer;
      this.head.rotation.x = lerp(this.head.rotation.x, -0.3, cheer);
      if (cheer > 0.5 && !(p.surprise && p.surprise > 0.5)) { this.mouthO.visible = Math.sin(t * 2.1) > -0.2; this.mouthSmile.visible = !this.mouthO.visible; this.mouthFlat.visible = false; this.mouthO.scale.set(1.5, 2.2, 0.5); }
      else this.mouthO.scale.set(1, 1.3, 0.4);
    }

    // ---- reach: the big farewell wave of picture 4, right arm up and out, hand waving, body after it
    if (reach > 0.001) {
      const rs = (p.reachSide ?? 1) < 0 ? -1 : 1;
      const A = this.arms[rs > 0 ? 1 : 0], B = this.arms[rs > 0 ? 0 : 1];
      const wv = Math.sin(t * 6.5);
      A.sh.rotation.x = lerp(A.sh.rotation.x, -2.35, reach);
      A.sh.rotation.z = lerp(A.sh.rotation.z, rs * (0.55 + wv * 0.22), reach);
      A.el.rotation.x = lerp(A.el.rotation.x, -0.15 - Math.max(0, wv) * 0.35, reach);
      // the other arm swings back for balance
      B.sh.rotation.x = lerp(B.sh.rotation.x, 0.45, reach);
      B.sh.rotation.z = lerp(B.sh.rotation.z, -0.35 * rs, reach);
      B.el.rotation.x = lerp(B.el.rotation.x, -0.35, reach);
      this.torso.rotation.x += 0.1 * reach;
      this.torso.rotation.y = lerp(this.torso.rotation.y, -0.22 * rs, reach);
      this.torso.rotation.z = lerp(this.torso.rotation.z, 0.06 * rs, reach);
      this.head.rotation.x = lerp(this.head.rotation.x, -0.38, reach);
      this.head.rotation.y = lerp(this.head.rotation.y, 0.15 * rs, reach);
      if (reach > 0.5) { this.mouthSmile.visible = !this.mouthO.visible || (p.talking ?? false); this.mouthFlat.visible = false; }
    }

    // ---- glide: prone on the wing. Body turned face-down, hips at the root's origin, body along -z.
    if (glide > 0.001) {
      const H = this.H;
      this.body.rotation.x = lerp(this.body.rotation.x, Math.PI / 2, glide);
      this.body.rotation.z = lerp(this.body.rotation.z, -bank * 0.5, glide);
      this.body.position.set(0, lerp(this.body.position.y, 0.0, glide), lerp(this.body.position.z, -this.hipY * H, glide));
      this.hips.position.y = lerp(this.hips.position.y, this.hipY, glide);
      // a small arch: chest up a little, head lifted right up to see ahead
      this.torso.rotation.set(lerp(this.torso.rotation.x, -0.16, glide), lerp(this.torso.rotation.y, 0, glide), lerp(this.torso.rotation.z, bank * 0.3, glide));
      this.head.rotation.x = lerp(this.head.rotation.x, -0.95, glide);
      this.head.rotation.y = lerp(this.head.rotation.y, 0, glide);
      // hands on the bar out in front of the head, wide apart, elbows bent
      const flex = Math.sin(t * 1.6) * 0.04;
      for (let i = 0; i < 2; i++) {
        const A = this.arms[i], s = i === 0 ? -1 : 1;
        A.sh.rotation.set(lerp(A.sh.rotation.x, -2.75 + flex + bank * 0.15 * s, glide), 0, lerp(A.sh.rotation.z, s * 0.42, glide));
        A.el.rotation.x = lerp(A.el.rotation.x, -0.55, glide);
      }
      // legs trailing straight back, one knee a little bent, ankles crossed by the slipstream
      for (let i = 0; i < 2; i++) {
        const L = this.legs[i], s = i === 0 ? -1 : 1;
        L.thigh.rotation.x = lerp(L.thigh.rotation.x, 0.12 + (i ? 0.08 : 0) + Math.sin(t * 2.3 + i) * 0.03, glide);
        L.thigh.rotation.z = lerp(L.thigh.rotation.z, s * 0.07, glide);
        L.knee.rotation.x = lerp(L.knee.rotation.x, i ? 0.55 : 0.18, glide);
      }
      if (this.coat) this.coat.rotation.x = lerp(this.coat.rotation.x, 0.25, glide);
    }

    // Zephy's cocky look: one brow up, a lopsided grin
    if (this.cocky && !p.surprise) {
      this.brows[1].position.y += 0.014; this.brows[1].rotation.z += 0.18;
      this.mouthSmile.rotation.z = Math.PI + 0.18;
    }

    // the scarves last, once every joint is where it will be drawn
    if (this.scarves.length) {
      this.root.updateMatrixWorld(true);
      for (const s of this.scarves) s.update(dt, t, air);
    }
  }

  dispose() { for (const s of this.scarves) s.dispose(); }
}

// ================================================================ the body, long-limbed

/** The parts every windfolk shares: legs, torso, arms, neck and head with a face. */
interface BodySpec {
  B: number;            // width
  LL?: number;          // leg length (1 = World 1 villagers)
  AL?: number;          // arm length
  HS: number;           // head scale
  skin: string;
  thigh: string; shin: string; boot: string;
  bootH?: number; bootS?: number; bootCuff?: string;
  sleeve: string; fore?: string; rolled?: boolean; cuff?: string;
  glove?: string;       // hand colour if gloved
  puff?: number; hand?: number;
  face: Omit<FaceSpec, 'skin'>;
  neckR?: number;
}

function windBody(p: Person, k: Kit, sp: BodySpec) {
  const B = sp.B, LL = sp.LL ?? 1, AL = sp.AL ?? 1;
  // Long legs: the knee and the foot move down; the hip rises to match so the feet stay on the ground.
  p.hipY = 0.095 + 0.785 * LL;
  p.hips.position.y = p.hipY;
  const thighL = 0.4 * LL, shinL = 0.385 * LL;
  for (const s of [-1, 1]) {
    const thigh = new THREE.Group(); thigh.position.set(0.095 * s * B, -0.02, 0);
    k.add(thigh, cap(0.088 * B, thighL - 0.14), sp.thigh, 0, -thighL / 2, 0);
    const knee = new THREE.Group(); knee.position.y = -thighL;
    k.add(knee, cap(0.074 * B, shinL - 0.13), sp.shin, 0, -shinL / 2 + 0.01, 0);
    // soft boots: a rounded toe, a shaft, a dark sole, a turned-down cuff
    const f = -shinL, bs = sp.bootS ?? 1, bh = sp.bootH ?? 0.14;
    k.add(knee, sph(0.085, 12, 8), sp.boot, 0, f, 0.045, { s: [0.9 * bs, 0.7, 1.5 * bs] });
    k.add(knee, cyl(0.08 * bs, 0.079 * bs, bh, 10), sp.boot, 0, f + bh / 2 + 0.02, 0);
    k.add(knee, sph(0.087, 12, 6), '#2a1e18', 0, f - 0.04, 0.045, { s: [0.93 * bs, 0.22, 1.55 * bs], line: false });
    if (sp.bootCuff) k.add(knee, tor(0.083 * bs, 0.018, Math.PI * 2, 5, 12), sp.bootCuff, 0, f + bh + 0.02, 0, { r: [Math.PI / 2, 0, 0] });
    thigh.add(knee); p.hips.add(thigh); p.legs.push({ thigh, knee });
  }
  p.hips.add(p.torso);
  // arms
  const upL = 0.27 * AL, foL = 0.25 * AL;
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.205 * s * B, 0.42, 0);
    k.add(sh, cap(0.062 * B * (sp.puff ?? 1), upL - 0.1), sp.sleeve, 0, -upL / 2 + 0.005, 0);
    k.add(sh, sph(0.077 * B * (sp.puff ?? 1), 10, 8), sp.sleeve, 0, -0.02, 0);
    const el = new THREE.Group(); el.position.y = -upL;
    k.add(el, cap(0.053 * B, foL - 0.1), sp.rolled ? sp.skin : sp.fore ?? sp.sleeve, 0, -foL / 2 + 0.02, 0);
    if (sp.rolled) k.add(el, tor(0.06 * B, 0.026, Math.PI * 2, 6, 12), sp.sleeve, 0, -0.01, 0, { r: [Math.PI / 2, 0, 0] });
    else k.add(el, tor(0.057 * B, 0.02, Math.PI * 2, 6, 12), sp.cuff ?? sp.fore ?? sp.sleeve, 0, -foL + 0.06, 0, { r: [Math.PI / 2, 0, 0] });
    const hand = new THREE.Mesh(handGeo(s, sp.hand ?? 1), toon(sp.glove ?? sp.skin)); hand.position.set(0, -foL, 0.01); hand.castShadow = true;
    el.add(hand); sh.add(el); sh.rotation.z = 0.08 * s;
    p.torso.add(sh); p.arms.push({ sh, el, hand });
  }
  neckHead(p, k, sp.skin, sp.HS, sp.neckR ?? 0.048);
  face(p, k, p.look, { skin: sp.skin, ...sp.face });
}

/** Where the scarf tails leave the knot, and the spheres they slide over. */
function scarfRig(p: Person, B: number, HS: number): { anchors: THREE.Object3D[]; colliders: ScarfCollider[] } {
  const a1 = pivot(p.torso, -0.07 * B, 0.47, -0.12 * B);
  const a2 = pivot(p.torso, 0.06 * B, 0.44, -0.13 * B);
  const c1 = pivot(p.torso, 0, 0.26, 0), c2 = pivot(p.torso, 0, 0.1, 0), c3 = pivot(p.head, 0, 0.18, 0);
  return { anchors: [a1, a2], colliders: [{ o: c1, r: 0.2 * B }, { o: c2, r: 0.19 * B }, { o: c3, r: 0.2 * HS }] };
}

/** The knot: a thick wrap round the neck, with a loop and the start of each tail. */
function scarfKnot(k: Kit, T: THREE.Object3D, B: number, c: string, c2: string) {
  k.add(T, tor(0.1 * B, 0.042, Math.PI * 2, 8, 16), c, 0, 0.47, 0.0, { r: [Math.PI / 2 + 0.12, 0, 0.06] });
  k.add(T, tor(0.105 * B, 0.036, Math.PI * 2, 8, 16), c, 0, 0.515, -0.01, { r: [Math.PI / 2 - 0.1, 0, -0.08] });
  k.add(T, tor(0.107 * B, 0.008, Math.PI * 2, 4, 16), c2, 0, 0.49, 0.0, { r: [Math.PI / 2, 0, 0], line: false });
  k.add(T, sph(0.05, 10, 8), c, -0.06 * B, 0.46, -0.1 * B, { s: [1.1, 0.9, 0.8] });
}

/** A straw hat: woven brim with a gentle droop, a rounded crown, a band, and a loose ribbon tail. */
function strawHat(k: Kit, parent: THREE.Object3D, sway: Sway, o: { r: number; crown: number; straw?: string; band: string; tilt?: V3; y?: number; ribbon?: boolean }) {
  const straw = o.straw ?? '#e8c46e', dark = '#c89c4a', R = o.r;
  const g = pivot(parent, 0, o.y ?? 0.29, -0.01); g.rotation.set(...(o.tilt ?? [-0.1, 0, 0.04]));
  k.add(g, lathe([[0.0, 0.0], [0.15, 0.0], [R * 0.85, -0.03], [R, -0.06], [R * 0.99, -0.07], [0.15, -0.018], [0.0, -0.018]], 28), straw, 0, 0, 0, { dbl: true });
  for (let i = 0; i < 3; i++) k.add(g, tor(0.19 + i * (R - 0.2) / 3, 0.004, Math.PI * 2, 3, 28), dark, 0, -0.012 - i * 0.012, 0, { r: [Math.PI / 2, 0, 0], line: false });
  k.add(g, tor(R * 0.995, 0.012, Math.PI * 2, 4, 28), dark, 0, -0.066, 0, { r: [Math.PI / 2, 0, 0] });
  k.add(g, cyl(0.135, 0.15, o.crown, 18), straw, 0, o.crown / 2, 0);
  k.add(g, sph(0.135, 16, 6), straw, 0, o.crown, 0, { s: [1, 0.35, 1] });
  for (let i = 0; i < 3; i++) k.add(g, tor(0.138 + i * 0.004, 0.003, Math.PI * 2, 3, 20), dark, 0, o.crown * (0.55 + i * 0.15), 0, { r: [Math.PI / 2, 0, 0], line: false });
  k.add(g, cyl(0.152, 0.153, 0.04, 18, true), o.band, 0, 0.025, 0, { dbl: true });
  if (o.ribbon !== false) {
    const rb = pivot(g, -0.1, 0.03, -0.11); rb.rotation.set(0.5, 0, 0.3);
    k.add(rb, box(0.035, 0.16, 0.006), o.band, 0, -0.08, 0, { r: [0, 0, 0] });
    sway.add(rb, { freq: 2.2, damp: 0.25, gain: 0.04, wind: 0.9, bob: 0.1, limit: 1.1 });
    const rb2 = pivot(g, -0.085, 0.03, -0.12); rb2.rotation.set(0.5, 0, 0.1);
    k.add(rb2, box(0.03, 0.12, 0.006), o.band, 0, -0.06, 0);
    sway.add(rb2, { freq: 2.6, damp: 0.25, gain: 0.04, wind: 0.8, bob: 0.1, limit: 1.1 });
  }
  return g;
}

/** A tunic or long shirt with folds, flaring to the hem. len: 0.3 hips .. 0.8 knees. */
function tunic(k: Kit, T: THREE.Object3D, B: number, c: string, len: number, flare = 1, seed = 0) {
  const y1 = -len;
  const prof: [number, number][] = [[0.1, 0.52], [0.16 * B, 0.5], [0.2 * B, 0.42], [0.195 * B, 0.2], [0.2 * B, 0.02], [(0.22 + 0.05 * flare) * B, y1 * 0.5], [(0.24 + 0.08 * flare) * B, y1], [(0.23 + 0.08 * flare) * B, y1 - 0.01]];
  const g = new THREE.Group(); T.add(g);
  k.add(g, folds(lathe(prof, 20), 7, 0.06, 0.1, y1, seed), c, 0, 0, 0, { s: [1, 1, 0.86], dbl: true });
  return g;
}

/** A leather belt with a brass buckle. */
function belt(k: Kit, T: THREE.Object3D, B: number, y: number, c = '#6e4528', buckle = '#d2a650', r = 0.205) {
  k.add(T, tor(r * B, 0.02, Math.PI * 2, 4, 20), c, 0, y, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.86, 1] });
  k.add(T, box(0.05, 0.04, 0.012), buckle, 0, y, r * B * 0.86 + 0.012, { line: false });
  k.add(T, box(0.03, 0.022, 0.014), c, 0, y, r * B * 0.86 + 0.014, { line: false });
}

/** A strap from one shoulder across the body to the other hip (front and back). */
function crossStrap(k: Kit, T: THREE.Object3D, B: number, c: string, side = 1, w = 0.035) {
  for (const z of [1, -1]) k.add(T, box(w, 0.56, 0.012), c, 0.0, 0.25, 0.165 * B * z + 0.01 * z, { r: [0, 0, 0.72 * side] });
}

const SKIN = { fair: '#f3d2b8', light: '#efc4a0', warm: '#dfa77f', tan: '#c88e66', brown: '#a26a4a', deep: '#7a4e36' };

// ================================================================ Lark

function lark(p: Person, k: Kit, L: PersonLook, sway: Sway, out: Built) {
  const B = 0.8, HS = 1.24, skin = L.skin, tunicC = '#f3ead6', hair = '#6b4024', yellow = '#f4c534', stripe = '#fff4c8';
  windBody(p, k, {
    B, LL: 1.28, AL: 1.14, HS, skin, thigh: '#cdb48c', shin: '#cdb48c', boot: '#8a5a36', bootH: 0.16, bootCuff: '#a8744a',
    sleeve: tunicC, cuff: '#e3d6b8', face: { brow: hair, browW: 0.92, browT: 1.15, browTilt: -0.12, nose: 'button', noseC: '#e7a585', lids: 0.92, lashes: true, freckles: true, blush: '#f29684' },
  });
  const T = p.torso;
  k.add(T, cap(0.16 * B, 0.22), tunicC, 0, 0.27, 0, { s: [1, 1, 0.82] });
  p.coat = tunic(k, T, B, tunicC, 0.4, 1.0, 1.3);
  // the tunic's hem band and a little stitched yoke
  k.add(p.coat, tor(0.31 * B, 0.011, Math.PI * 2, 4, 24), '#d8c7a2', 0, -0.405, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.86, 1], line: false });
  k.add(T, box(0.085, 0.13, 0.01), '#e6d9bc', 0, 0.39, 0.142 * B, { r: [-0.15, 0, 0] });
  for (let i = 0; i < 3; i++) k.add(T, sph(0.009, 6, 4), '#a8744a', 0, 0.43 - i * 0.04, 0.15 * B, { line: false });
  belt(k, T, B, 0.07, '#7a4a2a', '#d8ae52', 0.215);
  // satchel on a strap over the right shoulder, the bag on her left hip
  crossStrap(k, T, B, '#7a4a2a', -1);
  const bag = pivot(T, -0.21 * B, 0.02, 0.06);
  k.add(bag, box(0.075, 0.16, 0.2), '#a8703e', 0, -0.07, 0);
  k.add(bag, box(0.08, 0.08, 0.205), '#8a5a30', 0.003, -0.01, 0, { r: [0, 0, 0] });
  k.add(bag, box(0.02, 0.03, 0.03), '#d8ae52', -0.04, -0.04, 0, { line: false });
  k.add(bag, sph(0.035, 8, 6), '#c8d870', -0.01, 0.03, 0.06, { s: [1, 0.6, 1] }); // a sprig poking out
  sway.add(bag, { freq: 1.8, damp: 0.3, gain: 0.04, wind: 0.08, bob: 0.25, limit: 0.5 });
  // scarf
  scarfKnot(k, T, B, yellow, stripe);
  // hair: a centre part, side-swept bangs, the bulk gathered back into two braids
  const h = p.hair;
  k.add(h, sph(0.172, 16, 12), hair, 0, 0.232, -0.03, { s: [1.06, 0.84, 1.07] });
  k.add(h, sph(0.168, 14, 10), hair, 0, 0.18, -0.06, { s: [1.05, 0.95, 0.95] });
  // side-swept bangs falling from the part, and locks framing the face
  for (const [x, y, z, rz, sx] of [[-0.075, 0.29, 0.12, 0.55, 1.25], [0.0, 0.3, 0.135, -0.35, 1.1], [0.075, 0.285, 0.125, -0.7, 0.9]] as [number, number, number, number, number][])
    k.add(h, sph(0.06, 10, 8), hair, x, y, z, { s: [sx, 0.62, 0.55], r: [0.35, 0, rz] });
  for (const s of [-1, 1]) k.add(h, sph(0.05, 8, 6), hair, 0.152 * s, 0.17, 0.05, { s: [0.5, 1.35, 0.9], r: [0, 0, 0.1 * s] });
  for (const s of [-1, 1]) {
    let par: THREE.Object3D = pivot(h, 0.13 * s, 0.13, -0.09); par.rotation.set(0.3, 0, 0.1 * s);
    k.add(par, sph(0.052, 10, 8), hair, 0, 0, 0);
    for (let i = 0; i < 5; i++) {
      const seg = pivot(par, 0, i === 0 ? -0.035 : -0.078, 0);
      const r = 0.037 - i * 0.002;
      k.add(seg, sph(r, 8, 6), hair, 0.01, -0.03, 0, { s: [0.95, 1.15, 0.85], r: [0, 0, 0.5] });
      k.add(seg, sph(r, 8, 6), hair, -0.01, -0.066, 0, { s: [0.95, 1.25, 0.85], r: [0, 0, -0.5] });
      sway.add(seg, { freq: 1.7 + i * 0.12, damp: 0.35, gain: 0.015, wind: 0.09, bob: 0.03, limit: 0.4 });
      par = seg;
    }
    k.add(par, tor(0.02, 0.009, Math.PI * 2, 4, 10), yellow, 0, -0.085, 0, { r: [Math.PI / 2, 0, 0], line: false });
    k.add(par, cone(0.03, 0.065, 6), hair, 0, -0.125, 0, { r: [Math.PI, 0, 0] });
  }
  const rig = scarfRig(p, B, HS);
  out.colliders = rig.colliders;
  out.scarves.push(
    { anchor: rig.anchors[0], spec: { length: 1.25, width: 0.13, color: yellow, stripe, stripes: [[0.05, 0.08], [0.84, 0.87], [0.93, 1]], droop: 0.3, seed: 1 } },
    { anchor: rig.anchors[1], spec: { length: 0.8, width: 0.115, color: yellow, stripe, stripes: [[0.85, 0.88], [0.93, 1]], droop: 0.42, seed: 4, segs: 12 } },
  );
  out.smile = 0.6;
}

// ================================================================ Zephy

function zephy(p: Person, k: Kit, L: PersonLook, sway: Sway, out: Built) {
  const B = 0.84, HS = 1.22, skin = L.skin, shirt = '#f0e6d0', hair = '#2e221c', red = '#d8452e', leather = '#7a4a2a', brass = '#d0a24a';
  windBody(p, k, {
    B, LL: 1.3, AL: 1.14, HS, skin, thigh: '#6c5440', shin: '#6c5440', boot: '#5a3a24', bootH: 0.2, bootS: 1.08, bootCuff: '#7a5034',
    sleeve: shirt, cuff: '#e0d4ba', glove: '#8a5432', face: { brow: hair, browW: 1.05, browT: 1.45, browTilt: 0.08, nose: 'button', noseC: '#cf9070', blush: '#e48c78' },
  });
  const T = p.torso;
  k.add(T, cap(0.165 * B, 0.22), shirt, 0, 0.27, 0, { s: [1, 1, 0.82] });
  p.coat = tunic(k, T, B, shirt, 0.18, 0.4, 2.1);
  k.add(T, sph(0.15 * B, 10, 8), '#6c5440', 0, 0.0, 0, { s: [1.08, 0.75, 0.88] });
  // open collar
  for (const s of [-1, 1]) k.add(T, box(0.07, 0.05, 0.012), shirt, 0.045 * s, 0.455, 0.135 * B, { r: [-0.35, 0, 0.5 * s] });
  // the flying harness: shoulder straps down front and back, a chest strap, a broad belt with D-rings, leg loops
  for (const s of [-1, 1]) for (const z of [1, -1]) k.add(T, box(0.04, 0.46, 0.014), leather, 0.085 * s, 0.25, 0.155 * B * z + 0.008 * z, { r: [0.08 * z, 0, -0.1 * s] });
  for (const s of [-1, 1]) k.add(T, tor(0.07, 0.018, Math.PI, 4, 8), leather, 0.085 * s, 0.48, 0, { r: [0, Math.PI / 2, 0] });
  k.add(T, box(0.21 * B, 0.035, 0.014), leather, 0, 0.32, 0.16 * B);
  k.add(T, box(0.04, 0.045, 0.016), brass, 0, 0.32, 0.17 * B, { line: false });
  belt(k, T, B, 0.06, leather, brass, 0.22);
  k.add(T, tor(0.225 * B, 0.03, Math.PI * 2, 4, 20), leather, 0, 0.06, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.86, 1] });
  for (const s of [-1, 1]) {
    k.add(T, tor(0.022, 0.006, Math.PI * 2, 3, 8), brass, 0.15 * s * B, 0.03, 0.15 * B, { r: [0, 0.6 * s, 0], line: false });
    k.add(p.legs[s < 0 ? 0 : 1].thigh, tor(0.094 * B, 0.016, Math.PI * 2, 4, 12), leather, 0, -0.05, 0, { r: [Math.PI / 2 + 0.25, 0, 0] });
  }
  // a pouch on the hip
  const pouch = pivot(T, 0.21 * B, 0.04, 0.03);
  k.add(pouch, box(0.06, 0.1, 0.12), '#8a5a34', 0, -0.06, 0);
  k.add(pouch, box(0.065, 0.04, 0.125), leather, 0, -0.015, 0);
  sway.add(pouch, { freq: 2, damp: 0.3, gain: 0.03, wind: 0.05, bob: 0.2, limit: 0.4 });
  scarfKnot(k, T, B, red, '#f08a5a');
  // tousled dark hair: a cap of hair and tufts pointing every way, a fringe over the brow
  const h = p.hair;
  k.add(h, sph(0.172, 16, 12), hair, 0, 0.235, -0.03, { s: [1.07, 0.84, 1.08] });
  k.add(h, sph(0.168, 14, 10), hair, 0, 0.18, -0.06, { s: [1.06, 0.95, 0.97] });
  const tufts: [number, number, number, number, number][] = [
    [-0.11, 0.34, 0.07, 0.6, 0.5], [-0.03, 0.37, 0.09, 0.8, -0.1], [0.06, 0.36, 0.08, 0.7, -0.5], [0.13, 0.31, 0.05, 0.4, -0.9],
    [-0.15, 0.3, -0.02, 0.0, 1.1], [0.15, 0.3, -0.04, -0.2, -1.2], [-0.06, 0.38, -0.06, -0.5, 0.4], [0.06, 0.37, -0.1, -0.7, -0.3],
    [0.0, 0.33, -0.16, -1.2, 0.1], [-0.1, 0.27, -0.15, -1.4, 0.6], [0.1, 0.25, -0.16, -1.5, -0.5],
  ];
  for (const [x, y, z, rx, rz] of tufts) k.add(h, cone(0.05, 0.13, 6), hair, x, y, z, { r: [rx, 0, rz], s: [1, 1, 0.7] });
  for (let i = 0; i < 5; i++) k.add(h, cone(0.035, 0.1, 5), hair, -0.09 + i * 0.045, 0.285 - Math.abs(i - 1.5) * 0.008, 0.135, { r: [2.5, 0, (i - 2) * 0.25 + 0.3], s: [1, 1, 0.6] });
  for (const s of [-1, 1]) k.add(h, cone(0.04, 0.1, 5), hair, 0.158 * s, 0.17, 0.0, { r: [Math.PI, 0, -0.15 * s], s: [0.6, 1, 1] });
  // goggles pushed up on his head: a leather strap all round, brass rims, glassy lenses
  const gog = pivot(p.head, 0, 0.27, 0.0); gog.rotation.x = -0.32;
  k.add(gog, tor(0.178, 0.016, Math.PI * 2, 4, 24), '#5a3820', 0, 0, -0.01, { r: [Math.PI / 2, 0, 0], s: [1.03, 1.06, 1] });
  for (const s of [-1, 1]) {
    k.add(gog, cyl(0.045, 0.04, 0.035, 14), brass, 0.06 * s, 0.0, 0.168, { r: [Math.PI / 2 - 0.15, 0, 0] });
    k.add(gog, sph(0.04, 12, 8), '#9fd0de', 0.06 * s, 0.002, 0.186, { s: [1, 1, 0.35], line: false });
    k.add(gog, sph(0.011, 6, 4), '#ffffff', 0.06 * s + 0.014, 0.014, 0.199, { line: false });
  }
  k.add(gog, box(0.03, 0.016, 0.02), brass, 0, 0.0, 0.176, { line: false });
  const rig = scarfRig(p, B, HS);
  out.colliders = rig.colliders;
  out.scarves.push(
    { anchor: rig.anchors[0], spec: { length: 1.35, width: 0.14, color: red, stripe: '#b8352a', stripes: [[0.9, 1]], droop: 0.26, tatter: true, seed: 2 } },
    { anchor: rig.anchors[1], spec: { length: 0.95, width: 0.12, color: red, stripe: '#b8352a', stripes: [[0.9, 1]], droop: 0.38, tatter: true, seed: 7, segs: 13 } },
  );
  out.cocky = true; out.smile = 1;
}

// ================================================================ Gran Wren

function wren(p: Person, k: Kit, L: PersonLook, sway: Sway, out: Built) {
  const B = 0.78, HS = 1.14, skin = L.skin, jacket = '#8e5a34', dark = '#6e4224', fleece = '#f1e6cc', blue = '#3f72b8', hair = '#f3f0ea';
  windBody(p, k, {
    B, LL: 1.12, AL: 1.12, HS, skin, thigh: '#6a6250', shin: '#6a6250', boot: '#4a3020', bootH: 0.2, bootCuff: '#6a4a30',
    sleeve: jacket, cuff: fleece, puff: 1.05, face: { brow: '#d8d2c6', browW: 1.1, browT: 1.2, browTilt: 0.18, nose: 'long', noseC: '#dba88c', wrinkles: true, lids: 0.8, blush: '#e89a8a', skull: [0.98, 1.02, 0.98] },
  });
  const T = p.torso;
  k.add(T, cap(0.16 * B, 0.22), '#d8cdb4', 0, 0.27, 0, { s: [1, 1, 0.82] });
  k.add(T, sph(0.15 * B, 10, 8), '#6a6250', 0, 0.02, 0, { s: [1.08, 0.75, 0.88] });
  // the old flying jacket: short, open at the front, a fleece collar, patched elbows, a winner's pin
  const jk = new THREE.Group(); T.add(jk); p.coat = jk;
  k.add(jk, folds(lathe([[0.1, 0.52], [0.17 * B, 0.5], [0.215 * B, 0.42], [0.215 * B, 0.2], [0.225 * B, 0.0], [0.235 * B, -0.1], [0.225 * B, -0.11]], 18, 0.35, Math.PI * 2 - 0.7), 5, 0.04, 0.1, -0.11), jacket, 0, 0, 0, { s: [1, 1, 0.88], dbl: true });
  k.add(jk, tor(0.232 * B, 0.022, Math.PI * 2 - 0.7, 4, 20), dark, 0, -0.1, 0, { r: [Math.PI / 2, 0, Math.PI / 2 + 0.35], s: [1, 0.88, 1] });
  for (let i = 0; i < 11; i++) { const a = (i / 10) * Math.PI * 1.6 - 0.8 * Math.PI + Math.PI; k.add(T, sph(0.05, 8, 6), fleece, Math.sin(a) * 0.15 * B, 0.48 + Math.cos(a) * 0.01, Math.cos(a) * 0.13 * B, { s: [1, 0.8, 1] }); }
  for (const s of [-1, 1]) k.add(T, box(0.08, 0.14, 0.02), fleece, 0.07 * s, 0.4, 0.15 * B, { r: [-0.2, 0.35 * s, 0.4 * s] });
  for (const s of [-1, 1]) k.add(jk, box(0.07, 0.04, 0.02), dark, 0.13 * s, 0.05, 0.185 * B, { r: [0, 0.45 * s, 0] });
  k.add(T, cyl(0.02, 0.02, 0.008, 10), '#e8c050', -0.12, 0.33, 0.165 * B, { r: [Math.PI / 2, 0.4, 0], line: false });
  k.add(T, cone(0.01, 0.03, 3), '#c8402a', -0.12, 0.305, 0.168 * B, { r: [Math.PI, 0, 0], line: false });
  for (const a of p.arms) k.add(a.el, sph(0.05, 8, 6), '#6e4a2e', 0, 0.0, -0.03, { s: [1, 1, 0.6] });
  scarfKnot(k, T, B, blue, '#e8eef8');
  // white hair pulled back into a tight bun; a pair of old goggles round her neck
  const h = p.hair;
  k.add(h, sph(0.17, 16, 12), hair, 0, 0.235, -0.03, { s: [1.04, 0.8, 1.05] });
  k.add(h, sph(0.166, 14, 10), hair, 0, 0.18, -0.06, { s: [1.04, 0.9, 0.95] });
  for (const s of [-1, 1]) k.add(h, sph(0.06, 8, 6), hair, 0.12 * s, 0.25, 0.08, { s: [0.85, 0.6, 1.2], r: [0, 0, 0.35 * s] });
  for (let i = 0; i < 6; i++) k.add(h, tor(0.15 - Math.abs(i - 2.5) * 0.005, 0.004, Math.PI * 1.2, 3, 12), '#d8d2c6', 0, 0.3, -0.02, { r: [0.4 + i * 0.12, Math.PI / 2, 0], line: false });
  k.add(h, sph(0.085, 12, 10), hair, 0, 0.33, -0.14, { s: [1, 0.9, 1] });
  k.add(h, tor(0.06, 0.012, Math.PI * 2, 4, 14), '#d8d2c6', 0, 0.33, -0.14, { r: [0.5, 0, 0], line: false });
  k.add(h, tor(0.07, 0.008, Math.PI * 2, 3, 14), blue, 0, 0.29, -0.11, { r: [0.9, 0, 0], line: false });
  for (const s of [-1, 1]) {
    k.add(T, cyl(0.04, 0.036, 0.03, 12), '#b0904a', 0.05 * s, 0.4, 0.17 * B, { r: [Math.PI / 2 - 0.4, 0, 0] });
    k.add(T, sph(0.035, 10, 6), '#8ab8c8', 0.05 * s, 0.395, 0.185 * B, { s: [1, 1, 0.3], line: false });
  }
  const rig = scarfRig(p, B, HS);
  out.colliders = rig.colliders;
  out.scarves.push(
    { anchor: rig.anchors[0], spec: { length: 1.15, width: 0.11, color: blue, stripe: '#e8eef8', stripes: [[0.8, 0.82], [0.86, 0.88], [0.93, 1]], droop: 0.32, seed: 3 } },
    { anchor: rig.anchors[1], spec: { length: 0.7, width: 0.1, color: blue, stripe: '#e8eef8', stripes: [[0.88, 1]], droop: 0.45, seed: 9, segs: 12 } },
  );
}

// ================================================================ the Sail-mender

function mender(p: Person, k: Kit, L: PersonLook, sway: Sway, out: Built) {
  const B = 1.32, HS = 1.08, skin = L.skin, shirt = '#9fbfd6', canvas = '#dccfae', green = '#5e9a52', beard = '#3a2c26';
  windBody(p, k, {
    B, LL: 1.1, AL: 1.1, HS, skin, thigh: '#5e5444', shin: '#5e5444', boot: '#4a3020', bootS: 1.15, bootH: 0.15,
    sleeve: shirt, rolled: true, hand: 1.15, puff: 1.05, neckR: 0.065,
    face: { brow: beard, browW: 1.25, browT: 1.7, browTilt: -0.15, nose: 'round', noseC: '#a26a50', blush: '#c8806a', lids: 0.85, skull: [1.04, 1.02, 1.0] },
  });
  const T = p.torso;
  // a broad barrel chest and belly
  k.add(T, sph(0.24 * B * 0.82, 16, 12), shirt, 0, 0.24, 0, { s: [1, 1.12, 0.86] });
  k.add(T, sph(0.16 * B, 12, 8), '#5e5444', 0, 0.02, 0, { s: [1.1, 0.75, 0.9] });
  for (let i = 0; i < 3; i++) k.add(T, sph(0.01, 6, 4), '#e8e0cc', 0, 0.45 - i * 0.06, 0.168 * B, { line: false });
  for (const s of [-1, 1]) k.add(T, box(0.08, 0.05, 0.012), shirt, 0.05 * s, 0.47, 0.13 * B, { r: [-0.4, 0, 0.5 * s] });
  // the canvas apron: a bib with stitched patches, a skirt to the knee on a spring, pockets full of the trade
  k.add(T, box(0.26 * B * 0.8, 0.26, 0.02), canvas, 0, 0.3, 0.2 * B * 0.82 + 0.012, { r: [-0.08, 0, 0] });
  for (const s of [-1, 1]) for (const z of [1, -1]) k.add(T, box(0.035, 0.32, 0.012), '#b8a882', 0.1 * s * B, 0.36, (0.16 * B * z) + 0.0, { r: [0.12 * z, 0, 0], line: false });
  k.add(T, box(0.08, 0.07, 0.008), '#c45a3a', 0.06, 0.3, 0.2 * B * 0.82 + 0.024, { r: [-0.08, 0, 0.1] });
  for (let i = 0; i < 4; i++) k.add(T, box(0.014, 0.003, 0.004), '#f2ead6', 0.04 + i * 0.016, 0.338, 0.2 * B * 0.82 + 0.03, { r: [-0.08, 0, 0.1], line: false });
  belt(k, T, B * 0.86, 0.1, '#8a6a40', '#b8b8b0', 0.24);
  const ap = pivot(T, 0, 0.1, 0); p.coat = ap;
  k.add(ap, folds(new THREE.CylinderGeometry(0.22 * B, 0.28 * B, 0.62, 14, 1, true, -1.1, 2.2), 4, 0.05, 0.3, -0.3), canvas, 0, -0.31, 0, { s: [1, 1, 0.84], dbl: true });
  k.add(ap, box(0.36 * B * 0.85, 0.022, 0.012), '#b8a882', 0, -0.6, 0.24 * B, { line: false });
  k.add(ap, box(0.2 * B, 0.12, 0.02), '#cdbf9a', 0, -0.22, 0.215 * B);
  k.add(ap, box(0.002, 0.12, 0.024), '#a8987a', 0, -0.22, 0.217 * B, { line: false });
  k.add(ap, cyl(0.004, 0.004, 0.13, 4), '#d8d8d0', -0.07, -0.13, 0.215 * B, { r: [0, 0, 0.2], line: false }); // needles in the pocket
  k.add(ap, cyl(0.004, 0.004, 0.12, 4), '#d8d8d0', -0.055, -0.135, 0.215 * B, { r: [0, 0, -0.1], line: false });
  k.add(ap, cyl(0.022, 0.022, 0.05, 10), '#c84a3a', 0.07, -0.15, 0.218 * B, { r: [0, 0, 0] });
  sway.add(ap, { freq: 1.8, damp: 0.35, gain: 0.025, wind: 0.3, bob: 0.06, limit: 0.45 });
  // a thimble and a coil of waxed twine on the belt
  k.add(T, tor(0.05, 0.02, Math.PI * 2, 6, 12), '#e8d8a8', -0.22 * B * 0.86, 0.06, 0.08, { r: [0, Math.PI / 2, 0] });
  scarfKnot(k, T, B * 0.92, green, '#e8d070');
  // short dark hair under the hat, a full short beard
  const h = p.hair;
  k.add(h, sph(0.168, 14, 10), beard, 0, 0.21, -0.04, { s: [1.04, 0.85, 1.04] });
  for (let i = 0; i < 11; i++) { const a = -1.4 + (i / 10) * 2.8; k.add(p.head, sph(0.05, 8, 6), beard, Math.sin(a) * 0.13, 0.075 + Math.abs(a) * 0.045, Math.cos(a) * 0.105 + 0.02, { s: [1, 0.95, 0.8] }); }
  k.add(p.head, sph(0.06, 8, 6), beard, 0, 0.03, 0.11, { s: [1.3, 1, 0.85] });
  for (const s of [-1, 1]) k.add(p.head, sph(0.042, 8, 6), beard, 0.04 * s, 0.12, 0.152, { s: [1.4, 0.5, 0.6], r: [0, 0, 0.3 * s] });
  strawHat(k, p.head, sway, { r: 0.38, crown: 0.14, band: '#c84a3a', y: 0.3 });
  // a great curved sail needle in the right hand, the thread running back to a spool in the left
  const nd = new THREE.Group(); nd.position.set(0.0, -0.06, 0.05); nd.rotation.set(0.5, 0, 0.25); p.arms[1].hand.add(nd); p.held.push(nd);
  k.add(nd, tor(0.09, 0.006, Math.PI * 0.6, 4, 10), '#e0e0e8', 0, 0.05, 0, { r: [0, 0, 0.6] });
  k.add(nd, cone(0.008, 0.03, 5), '#e0e0e8', -0.005, 0.14, 0, { line: false });
  k.add(nd, cyl(0.002, 0.002, 0.3, 3), '#f0e4c0', 0.02, -0.09, 0.02, { r: [0.3, 0, 0.5], line: false });
  const sp = new THREE.Group(); sp.position.set(0, -0.07, 0.05); p.arms[0].hand.add(sp); p.held.push(sp);
  k.add(sp, cyl(0.04, 0.04, 0.09, 12), '#f0e4c0', 0, 0, 0, { r: [0, 0, Math.PI / 2] });
  for (const s of [-1, 1]) k.add(sp, cyl(0.05, 0.05, 0.012, 12), '#8a6440', 0.05 * s, 0, 0, { r: [0, 0, Math.PI / 2] });
  const rig = scarfRig(p, B * 0.95, HS);
  out.colliders = rig.colliders;
  out.scarves.push(
    { anchor: rig.anchors[0], spec: { length: 1.0, width: 0.13, color: green, stripe: '#e8d070', stripes: [[0.12, 0.15], [0.88, 1]], droop: 0.36, seed: 5 } },
  );
  out.smile = 0.8;
}

// ================================================================ the Chime-maker

function chimer(p: Person, k: Kit, L: PersonLook, sway: Sway, out: Built) {
  const B = 0.74, HS = 1.08, skin = L.skin, coat = '#5f8f8c', coatD = '#4a7472', hair = '#b8b4b0', lav = '#a98fd8', brass = '#d4a84a', silver = '#d8dce0';
  windBody(p, k, {
    B, LL: 1.24, AL: 1.16, HS, skin, thigh: coat, shin: '#4e4a5a', boot: '#5a3a2a', bootH: 0.12,
    sleeve: coat, cuff: '#e8dcc8', hand: 0.92,
    face: { brow: '#8a8480', browW: 1.0, browT: 0.95, browTilt: -0.2, nose: 'long', noseC: '#d8a48c', wrinkles: true, lids: 0.82, lashes: true, blush: '#e09a8e', skull: [0.94, 1.08, 0.98] },
  });
  const T = p.torso;
  k.add(T, cap(0.155 * B, 0.24), coat, 0, 0.28, 0, { s: [1, 1, 0.82] });
  // a long coat-dress with a darker underskirt, cream collar
  const dr = new THREE.Group(); T.add(dr); p.coat = dr;
  k.add(dr, folds(lathe([[0.1, 0.52], [0.16 * B, 0.5], [0.2 * B, 0.42], [0.19 * B, 0.2], [0.2 * B, 0.02], [0.27 * B, -0.4], [0.33 * B, -0.78], [0.32 * B, -0.79]], 20), 8, 0.07, 0.05, -0.79, 0.5), coat, 0, 0, 0, { s: [1, 1, 0.86], dbl: true });
  k.add(dr, tor(0.325 * B, 0.012, Math.PI * 2, 4, 24), coatD, 0, -0.77, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.86, 1], line: false });
  k.add(dr, box(0.012, 0.95, 0.01), coatD, 0.03, -0.1, 0.2 * B, { r: [-0.1, 0, 0], line: false });
  for (let i = 0; i < 5; i++) k.add(T, sph(0.012, 6, 4), brass, 0.045, 0.42 - i * 0.075, 0.15 * B + (i > 2 ? 0.01 : 0), { line: false });
  for (const s of [-1, 1]) k.add(T, tri3(k), '#efe4d0', 0, 0, 0, { dbl: true, r: [0, 0, 0], s: [s, 1, 1] });
  // the tool belt: little hammers and tuning forks swinging, a pouch, and a tiny chime that rings as she walks
  belt(k, T, B, 0.05, '#7a5030', brass, 0.225);
  const tools: [number, number, number][] = [[-0.9, 0.11, 0], [-0.55, 0.12, 1], [0.6, 0.1, 2], [1.0, 0.11, 0], [-1.4, 0.1, 1], [1.5, 0.1, 2]];
  for (const [a, len, type] of tools) {
    const r = 0.225 * B;
    const pv = pivot(T, Math.sin(a) * r * 1.05, 0.03, Math.cos(a) * r * 0.9);
    if (type === 0 || type === 2) {
      k.add(pv, cyl(0.007, 0.007, len, 5), '#a8784a', 0, -len / 2, 0);
      k.add(pv, box(type === 2 ? 0.05 : 0.04, 0.018, 0.018), type === 2 ? brass : '#8a8a90', 0, -len, 0, { r: [0, a, 0] });
    } else {
      k.add(pv, cyl(0.005, 0.005, 0.04, 4), silver, 0, -0.02, 0, { line: false });
      for (const s of [-1, 1]) k.add(pv, box(0.006, 0.07, 0.006), silver, 0.008 * s, -0.075, 0, { r: [0, a, 0], line: false });
    }
    sway.add(pv, { freq: 2.4 + type * 0.3, damp: 0.25, gain: 0.05, wind: 0.15, bob: 0.35, limit: 0.6 });
  }
  const chime = pivot(T, -0.18 * B, 0.03, 0.14 * B);
  k.add(chime, cyl(0.003, 0.003, 0.05, 3), '#7a5030', 0, -0.025, 0, { line: false });
  k.add(chime, cyl(0.03, 0.03, 0.008, 10), brass, 0, -0.05, 0);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; k.add(chime, cyl(0.006, 0.006, 0.06 + i * 0.012, 6), silver, Math.sin(a) * 0.02, -0.09 - i * 0.006, Math.cos(a) * 0.02); }
  sway.add(chime, { freq: 1.9, damp: 0.2, gain: 0.06, wind: 0.3, bob: 0.4, limit: 0.7 });
  scarfKnot(k, T, B, lav, '#f0e8ff');
  // grey hair in a high knot with a pencil through it; spectacles on her long nose
  const h = p.hair;
  k.add(h, sph(0.17, 16, 12), hair, 0, 0.235, -0.03, { s: [1.04, 0.84, 1.05] });
  k.add(h, sph(0.166, 14, 10), hair, 0, 0.18, -0.06, { s: [1.04, 0.92, 0.95] });
  for (const s of [-1, 1]) k.add(h, sph(0.06, 8, 6), hair, 0.115 * s, 0.26, 0.085, { s: [0.9, 0.6, 1.2], r: [0, 0, 0.4 * s] });
  k.add(h, sph(0.08, 12, 10), hair, 0, 0.4, -0.05, { s: [1, 0.85, 1] });
  k.add(h, tor(0.06, 0.012, Math.PI * 2, 4, 14), '#9a9690', 0, 0.37, -0.05, { r: [Math.PI / 2 - 0.2, 0, 0], line: false });
  k.add(h, cyl(0.008, 0.008, 0.24, 6), '#e8c040', 0, 0.42, -0.05, { r: [0.3, 0, 1.3] });
  k.add(h, cone(0.008, 0.02, 6), '#3a3030', -0.12, 0.45, -0.05, { r: [0, 0, 1.3 + Math.PI / 2], line: false });
  for (let i = 0; i < 3; i++) k.add(h, sph(0.03, 6, 5), hair, 0.08 - i * 0.02, 0.33 - i * 0.03, 0.04 + i * 0.03, { s: [0.6, 1.4, 0.6], r: [0.2, 0, 0.3], line: false });
  for (const s of [-1, 1]) {
    k.add(p.head, tor(0.033, 0.005, Math.PI * 2, 4, 14), '#8a6a3a', 0.06 * s, 0.175, 0.168, { line: false });
    k.add(p.head, sph(0.033, 10, 6), '#e2f0f4', 0.06 * s, 0.175, 0.164, { s: [1, 1, 0.12], line: false });
    k.add(p.head, box(0.06, 0.004, 0.004), '#8a6a3a', 0.12 * s, 0.18, 0.11, { r: [0, 0.9 * s, 0], line: false });
  }
  k.add(p.head, box(0.026, 0.005, 0.005), '#8a6a3a', 0, 0.18, 0.172, { line: false });
  // a little hammer in her hand
  const hm = new THREE.Group(); hm.position.set(0, -0.06, 0.04); hm.rotation.set(0.6, 0, 0.1); p.arms[1].hand.add(hm); p.held.push(hm);
  k.add(hm, cyl(0.008, 0.008, 0.18, 6), '#a8784a', 0, 0.05, 0);
  k.add(hm, box(0.06, 0.022, 0.022), brass, 0, 0.14, 0);
  const rig = scarfRig(p, B, HS);
  out.colliders = rig.colliders;
  out.scarves.push(
    { anchor: rig.anchors[0], spec: { length: 1.2, width: 0.1, color: lav, stripe: '#f0e8ff', stripes: [[0.3, 0.32], [0.6, 0.62], [0.9, 1]], droop: 0.3, seed: 6 } },
    { anchor: rig.anchors[1], spec: { length: 0.85, width: 0.09, color: lav, stripe: '#f0e8ff', stripes: [[0.9, 1]], droop: 0.4, seed: 11, segs: 12 } },
  );
}
/** The chime-maker's pointed collar (one side; mirrored by scale). */
function tri3(_k: Kit) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0.02, 0.5, 0.125, 0.12, 0.47, 0.1, 0.06, 0.39, 0.135], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  g.computeVertexNormals();
  return g;
}

// ================================================================ a windfolk of the crowd

/** Small seeded random numbers, so a seed always makes the same person. */
export function mulberry(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length) % a.length];

/** The festival palette of the Sky Isles. */
export const WIND_COLORS = {
  skins: [SKIN.fair, SKIN.light, SKIN.warm, SKIN.tan, SKIN.brown, SKIN.deep],
  hairs: ['#2e221c', '#5a3a24', '#8a5a30', '#c89a5a', '#e8e2d8', '#3a2a28', '#a0522d'],
  shirts: ['#f2ead6', '#efe4cc', '#e8eef4', '#f4e2c8', '#d8e6d0', '#f0d8d0'],
  vests: ['#c8402e', '#e8a33a', '#3f72b8', '#e2783a', '#5e9a52', '#8a5aa8', '#d85a7a', '#2f8a8a'],
  scarves: ['#d8452e', '#f4c534', '#3f72b8', '#e2783a', '#5e9a52', '#a98fd8', '#e86a8a', '#2fa0a0', '#f2ead6'],
  trousers: ['#6c5440', '#5e5444', '#4e566a', '#7a6a50', '#8a7a5a', '#5a4a3e'],
  bands: ['#c84a3a', '#3f72b8', '#e8a33a', '#5e9a52', '#8a5aa8', '#2a2a3a'],
};

function crowdOne(p: Person, k: Kit, L: PersonLook, sway: Sway, out: Built, seed: number) {
  const r = mulberry(seed);
  const C = WIND_COLORS;
  const B = 0.8 + r() * 0.45, HS = 1.06 + r() * 0.16, skin = pick(r, C.skins), hair = pick(r, C.hairs);
  const shirt = pick(r, C.shirts), vest = pick(r, C.vests), sc = pick(r, C.scarves), tr = pick(r, C.trousers);
  const dress = r() < 0.4, hat = r() < 0.7;
  windBody(p, k, {
    B, LL: 1.08 + r() * 0.18, AL: 1.06 + r() * 0.1, HS, skin, thigh: dress ? '#4e4a5a' : tr, shin: dress ? '#4e4a5a' : tr, boot: pick(r, ['#5a3a24', '#4a3020', '#7a5034']),
    sleeve: shirt, rolled: r() < 0.4, face: { brow: hair, nose: pick(r, ['button', 'round', 'long'] as const), noseC: skin, wrinkles: r() < 0.25, lashes: dress, blush: '#e8907e' },
  });
  const T = p.torso;
  k.add(T, cap(0.16 * B, 0.22), shirt, 0, 0.27, 0, { s: [1, 1, 0.82] });
  p.coat = tunic(k, T, B, dress ? vest : shirt, dress ? 0.75 : 0.25, dress ? 1.2 : 0.4, seed);
  if (!dress) {
    k.add(T, sph(0.15 * B, 10, 8), tr, 0, 0.02, 0, { s: [1.08, 0.75, 0.88] });
    k.add(T, folds(lathe([[0.1, 0.5], [0.16 * B, 0.49], [0.2 * B, 0.42], [0.205 * B, 0.2], [0.21 * B, 0.02], [0.215 * B, -0.04]], 16, 0.32, Math.PI * 2 - 0.64), 6, 0.03, 0.3, -0.04), vest, 0, 0, 0, { s: [1, 1, 0.86], dbl: true });
  } else k.add(T, box(0.2 * B, 0.3, 0.02), shirt, 0, -0.05, 0.2 * B, { r: [-0.1, 0, 0] });
  belt(k, T, B, 0.07);
  scarfKnot(k, T, B, sc, '#f2ead6');
  const h = p.hair;
  k.add(h, sph(0.17, 14, 10), hair, 0, 0.23, -0.03, { s: [1.05, 0.82, 1.05] });
  k.add(h, sph(0.165, 12, 9), hair, 0, 0.18, -0.06, { s: [1.04, 0.95, 0.95] });
  if (dress) k.add(h, sph(0.075, 10, 8), hair, 0, 0.3, -0.15);
  if (hat) strawHat(k, p.head, sway, { r: 0.28 + r() * 0.1, crown: 0.1 + r() * 0.06, band: pick(r, C.bands), y: 0.3, ribbon: r() < 0.6 });
  const rig = scarfRig(p, B, HS);
  out.colliders = rig.colliders;
  out.scarves.push({ anchor: rig.anchors[0], spec: { length: 0.75 + r() * 0.4, width: 0.1, color: sc, stripe: '#f2ead6', stripes: [[0.9, 1]], droop: 0.35, seed } });
  out.smile = r() < 0.6 ? 1 : 0;
}

// ================================================================ the cast

type Builder = (p: Person, k: Kit, L: PersonLook, sway: Sway, out: Built) => void;
const CAST: Record<Exclude<WindfolkKind, 'crowd'>, { build: Builder; look: Partial<PersonLook> }> = {
  lark: { build: lark, look: { skin: SKIN.light, height: 0.62, gait: { rate: 1.2, stride: 1.05, bounce: 1.8, arm: 1.2 } } },
  zephy: { build: zephy, look: { skin: SKIN.warm, height: 0.63, gait: { rate: 1.15, stride: 1.15, bounce: 1.4, arm: 1.3, waddle: 0.02 } } },
  wren: { build: wren, look: { skin: SKIN.fair, height: 0.78, hunch: 0.3, gait: { rate: 1.1, stride: 0.8, bounce: 0.6, arm: 0.8 } } },
  mender: { build: mender, look: { skin: SKIN.brown, height: 1.02, gait: { rate: 0.75, stride: 0.9, bounce: 0.6, arm: 0.6, waddle: 0.06 } } },
  chimer: { build: chimer, look: { skin: SKIN.light, height: 0.92, gait: { rate: 0.9, stride: 1.0, bounce: 0.5, arm: 0.5 } } },
};

/**
 * Make one of the windfolk. Named characters ignore the seed; 'crowd' makes a different person per seed
 * (colours, build, hat, dress, scarf), full detail, for the ones who walk about or talk.
 */
export function makeWindfolk(kind: WindfolkKind, seed = 1): Windfolk {
  const out: Built = { scarves: [], colliders: [] };
  let look: PersonLook;
  const base: PersonLook = { skin: SKIN.light, hair: '#5a3a24', hairStyle: 'short', top: '#f2ead6', trousers: '#6c5440', boots: '#5a3a24' };
  if (kind === 'crowd') {
    const r = mulberry(seed + 77);
    look = { ...base, height: 0.85 + r() * 0.3, gait: { rate: 0.9 + r() * 0.3, stride: 0.9 + r() * 0.3, bounce: 0.6 + r(), arm: 0.8 + r() * 0.4 } };
    look.custom = (p, L) => { const k = new Kit(), sway = new Sway(); crowdOne(p, k, L, sway, out, seed); finish(p, k, sway); };
  } else {
    const c = CAST[kind];
    look = { ...base, ...c.look } as PersonLook;
    look.custom = (p, L) => { const k = new Kit(), sway = new Sway(); c.build(p, k, L, sway, out); finish(p, k, sway); };
  }
  return new Windfolk(kind, look, out);
}

function finish(p: Person, k: Kit, sway: Sway) {
  anchors(p);
  k.bake();
  sway.ref = p.root;
  p.sway = sway;
  if (p.look.hunch) p.torso.rotation.x = p.look.hunch * 0.3;
}

