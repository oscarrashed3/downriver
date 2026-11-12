import * as THREE from 'three';
import { Kit } from '../skyIsles/sailtownKit';
import type { Solid, Deck } from '../collide';
import { SHELL, REST, BONE, FOOT_REST, type Leg } from './ambleRig';
import { outlinePoint, shellPolar, shellTopY, shellProfile, ledges } from './ambleShell';
import {
  PAL, pk, rnd, type R, barrel, vegTub, bench, crate, lantern, posy, card, ropeLadder, rope, laundry, bunting, tree,
  FC, STONE_TILE, WOOD_TILE, T, boxM, taperTube, slab,
} from './mossrestKit';
import { house, windmill, type Box2, type DeckSpec, type MillOut, type HouseOut } from './mossrestHouse';

// Mossrest, the village on Old Amble's back (picture 1 for the whole stack, picture 3 close up).
//
// Built in creature space (Amble's rest pose), then hung under Amble's `shellTop` frame (and the lookout under its
// `neckRide` frame), so it breathes, sways and walks with the shell.
//
//   the lower ring   wide plank walkways with chunky railings right round the shell's shoulder (open over the
//                    neck), on posts that come down onto the plates and are braced to them; two stretches are
//                    rope bridges; ropes and rope ladders hang from it down beside each leg to the meadow
//   the middle       timber-and-stone cottages on the middle terrace and the shoulder (five of them walk-in and
//                    lived in, one of them the bakery), a carpenter's yard
//   the top          the big old house on the crown, two windmills (one broken, a sail lost), trees growing out of
//                    the shell, a well and rain pools
//   between          wide stairs up the ledges, sturdy ladders
//   everywhere       laundry and bunting criss-crossing, flower boxes, tubs of vegetables, barrels, benches
//   the neck         a lookout platform strapped onto the top of the neck
//
// The step-2 water channel has a clear route kept for it (`channelRoute`): the rain pools on the crown, past the
// windmills, down to the walkways and round them to the front, then down the neck to the mouth.
//
// Collision: boxes for the walls, houses, mills, trees and railings and decks for the walkways, stairs, floors
// and the lookout, all in creature space (`solidSpecs`, `deckSpecs`); `colliders()` turns them into the game's
// Solid and Deck objects (world-space proxies, updated by `syncColliders` each frame as Amble moves).

export interface Spot { th: number; rho: number }
const TAU = Math.PI * 2;

/** The shell's top surface height at a creature-space point (the dome, or the shoulder past its edge). */
export function groundAt(x: number, z: number) {
  const y = shellTopY(x, z);
  if (y !== null) return y;
  const { th } = shellPolar(x, z);
  return shellProfile(th).yJ;
}
/** The creature-space point at angle th and outline fraction rho, on the ground. */
export function spot(th: number, rho: number) {
  const E = outlinePoint(th);
  const x = E.x * rho, z = SHELL.cz + E.z * rho;
  return new THREE.Vector3(x, groundAt(x, z), z);
}
/** The outward (horizontal) normal of the outline at th. */
function outward(th: number) {
  const a = outlinePoint(th - 0.002), b = outlinePoint(th + 0.002);
  return new THREE.Vector3(b.z - a.z, 0, -(b.x - a.x)).normalize();
}

/** One placed solid or deck in creature space (y0: the base height of the solid or the deck's frame). */
interface SolidSpec extends Box2 { y0: number }
interface PlacedDeck extends DeckSpec { y: number }

export class Mossrest {
  /** The village, in creature-space coordinates: add under Amble's shellTop with `attach`. */
  group = new THREE.Group();
  /** The lookout on the neck (creature space): add under Amble's neckRide. */
  neck = new THREE.Group();
  solidSpecs: SolidSpec[] = [];
  deckSpecs: PlacedDeck[] = [];
  /** The neck lookout's colliders (creature space, riding the neck). */
  neckSolids: SolidSpec[] = [];
  neckDecks: PlacedDeck[] = [];
  mills: MillOut[] = [];
  houses: (HouseOut & { at: THREE.Vector3; rot: number; walkIn: boolean; name: string; w: number; d: number; doorLocal: THREE.Vector3 })[] = [];
  /** Where the step-2 wooden water channel will run (creature space, from the rain pools to the mouth). */
  channelRoute: THREE.Vector3[] = [];
  /** Points where birds may land (creature space): windmill caps, ridge ends, chimneys. */
  perches: THREE.Vector3[] = [];
  stats = { triangles: 0, meshes: 0 };
  private kit = new Kit();
  private nk = new Kit();
  private r: R;
  private sails: THREE.Group[] = [];
  /** Keep-out discs (x, z, radius) so dressing never lands on a path, a house or the channel's route. */
  private taken: [number, number, number][] = [];

  constructor(seed = 11) {
    this.r = rnd(seed);
    this.group.name = 'Mossrest';
    this.neck.name = 'Mossrest lookout';
    this.route();
    this.walkways();
    this.top();
    this.middle();
    this.between();
    this.dressing();
    this.legRopes();
    this.lookout();
    this.kit.build(this.group, { outline: false });
    this.nk.build(this.neck, { outline: false });
    for (const s of this.sails) this.group.add(s);
    this.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { this.stats.meshes++; this.stats.triangles += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } });
    this.neck.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { this.stats.meshes++; this.stats.triangles += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } });
  }

  /** Hang the village and the lookout on Amble's frames. */
  attach(shellTop: THREE.Object3D, neckRide: THREE.Object3D) {
    this.group.position.set(0, -SHELL.yTop, -SHELL.cz);
    shellTop.add(this.group);
    this.neck.position.copy(REST[BONE.neck1]).negate();
    neckRide.add(this.neck);
  }

  update(_dt: number, t: number) {
    // the working mill turns slowly; the broken one creaks a little in the gusts, but cannot turn
    this.mills.forEach((m, i) => {
      const s = this.sails[i];
      if (!m.broken) s.rotation.z = -t * 0.55;
      else s.rotation.z = 0.04 * Math.sin(t * 0.7) * Math.sin(t * 0.23);
    });
  }

  private free(x: number, z: number, rad: number) { return !this.taken.some(([a, b, c]) => (a - x) ** 2 + (b - z) ** 2 < (c + rad) ** 2); }
  private take(x: number, z: number, rad: number) { this.taken.push([x, z, rad]); }
  private solid(b: Box2, at: THREE.Vector3, rot: number, list = this.solidSpecs) {
    const c = Math.cos(rot), s = Math.sin(rot);
    list.push({ ...b, x: at.x + b.x * c + b.z * s, z: at.z - b.x * s + b.z * c, rot: rot + b.rot, y0: at.y + (b.y0 ?? 0) });
  }
  private deck(d: DeckSpec, at: THREE.Vector3, rot: number, list = this.deckSpecs) {
    const c = Math.cos(rot), s = Math.sin(rot);
    list.push({ ...d, x: at.x + d.x * c + d.z * s, z: at.z - d.x * s + d.z * c, rot: rot + d.rot, y: at.y });
  }

  // ---------------------------------------------------------------------------------------- the water's route

  private route() {
    const pts: THREE.Vector3[] = [];
    // from the rain pools on the crown, past the mills, down the back of the dome to the walkway, round the
    // walkway on the left side to the front, then over the neck root and along the top of the neck to the mouth
    for (const [th, rho] of [[0.95, 0.12], [0.4, 0.2], [-0.4, 0.26], [-0.9, 0.42], [-0.7, 0.62], [-0.5, 0.78]] as const) pts.push(spot(th, rho));
    for (let th = -0.5; th <= 0.95; th += 0.25) pts.push(spot(th, 0.87).add(new THREE.Vector3(0, 0.9, 0)));
    pts.push(spot(Math.PI / 2 - 0.25, 0.86).add(new THREE.Vector3(0, 0.6, 0)));
    pts.push(new THREE.Vector3(0, 20.2, 19.5), new THREE.Vector3(0, 21.8, 24), new THREE.Vector3(0, 24.2, 29), new THREE.Vector3(0, 26.4, 33.2));
    this.channelRoute = pts;
    for (const p of pts) this.take(p.x, p.z, 1.3);
  }

  // ---------------------------------------------------------------------------------------- the lower ring

  /** The ring of walkways round the shoulder. */
  private walkways() {
    const k = this.kit, r = this.r;
    const TH0 = 2.08, TH1 = TAU + 0.98;
    const W = 2.6, RHO_IN = 0.815;
    // samples round the ring, about 2.4 m apart on the inner edge
    const ths: number[] = [];
    for (let th = TH0; th <= TH1 + 1e-6;) { ths.push(th); const R = outlinePoint(th).length(); th += 2.4 / (R * RHO_IN); }
    const inner = ths.map(th => spot(th, RHO_IN)), outs = ths.map(th => outward(th));
    // the deck's height: a little above the shoulder, smoothed so it runs evenly
    const raw = ths.map((th, i) => Math.max(inner[i].y, groundAt(inner[i].x + outs[i].x * 0.8, inner[i].z + outs[i].z * 0.8)) + 0.45);
    const yd = raw.map((_, i) => { let s = 0, n = 0; for (let j = -2; j <= 2; j++) { const q = raw[Math.min(raw.length - 1, Math.max(0, i + j))]; s += q; n++; } return Math.max(raw[i], s / n); });
    const P = (i: number, f: number) => inner[i].clone().addScaledVector(outs[i], f * W).setY(yd[i]);
    // two stretches are rope bridges over a dip in the shoulder, with no posts under them
    const bridges = [[6, 9], [24, 27]].filter(([a, b]) => b < ths.length - 1);
    const inBridge = (i: number) => bridges.some(([a, b]) => i > a && i < b);
    const plankC = () => new THREE.Color(pk(r, PAL.timber)).multiplyScalar(0.88 + r() * 0.2);
    for (let i = 0; i < ths.length - 1; i++) {
      const a = P(i, 0.5), b = P(i + 1, 0.5);
      const dir = b.clone().sub(a); const len = Math.hypot(dir.x, dir.z);
      const yaw = Math.atan2(-dir.z, dir.x);
      const br = bridges.find(([s, e]) => i >= s && i < e);
      const sag = br ? 0.45 : 0;
      const n = Math.ceil((len + 0.15) / 0.3);
      // planks across the walk, the bridges' with gaps between them
      for (let q = 0; q < n; q++) {
        const t = (q + 0.5) / n;
        let tt = t;
        if (br) tt = ((i - br[0]) + t) / (br[1] - br[0]);
        const y = a.y + (b.y - a.y) * t - (br ? 4 * sag * tt * (1 - tt) : 0);
        const c = a.clone().lerp(b, t);
        if (br && q % 4 === 3) continue;
        k.add(boxM(br ? 0.24 : 0.29, 0.07, W + (br ? -0.6 : 0.2), WOOD_TILE), 'wood', plankC(), T(c.x, y - 0.035, c.z, (r() - 0.5) * 0.02, yaw, (r() - 0.5) * 0.02));
      }
      const mk = (f: number, t: number) => { const c = P(i, f).lerp(P(i + 1, f), t); let tt = t; if (br) tt = ((i - br[0]) + t) / (br[1] - br[0]); c.y -= br ? 4 * sag * tt * (1 - tt) : 0; return c; };
      if (!br) {
        // stringers under the planks, along both edges
        for (const f of [0.05, 0.5, 0.95]) {
          const p0 = mk(f, 0), p1 = mk(f, 1);
          k.add(boxM(p0.distanceTo(p1) + 0.3, 0.22, 0.18, WOOD_TILE), 'wood', pk(r, PAL.timberDark), T((p0.x + p1.x) / 2, (p0.y + p1.y) / 2 - 0.18, (p0.z + p1.z) / 2, 0, yaw, Math.atan2(p1.y - p0.y, p0.distanceTo(p1))));
        }
        // the railing: chunky posts, a top rail and a middle rail along the outer edge
        const o0 = mk(0.97, 0), o1 = mk(0.97, 1);
        for (const [hgt, th] of [[1.02, 0.15], [0.55, 0.1]] as const) k.add(boxM(o0.distanceTo(o1) + 0.12, th, th, WOOD_TILE), 'wood', pk(r, PAL.timber), T((o0.x + o1.x) / 2, (o0.y + o1.y) / 2 + hgt, (o0.z + o1.z) / 2, 0, yaw, Math.atan2(o1.y - o0.y, o0.distanceTo(o1))));
        this.solidSpecs.push({ x: (o0.x + o1.x) / 2, z: (o0.z + o1.z) / 2, hw: o0.distanceTo(o1) / 2 + 0.05, hd: 0.1, h: 1.1, rot: yaw, y0: Math.min(o0.y, o1.y) });
      } else {
        // the bridge's hand ropes on both sides and the hangers down to the planks
        for (const f of [0.05, 0.95]) {
          const pts = [0, 0.25, 0.5, 0.75, 1].map(t => mk(f, t).add(new THREE.Vector3(0, 1.0 + (br ? 0.25 * Math.sin(Math.PI * (((i - br[0]) + t) / (br[1] - br[0]))) : 0), 0)));
          rope(k, pts, 0.055);
          for (const t of [0, 0.5]) { const p = mk(f, t); rope(k, [p, p.clone().add(new THREE.Vector3(0, 1.05, 0))], 0.025); }
          const lo = [0, 0.5, 1].map(t => mk(f, t).add(new THREE.Vector3(0, -0.06, 0)));
          rope(k, lo, 0.04);
        }
      }
      this.deckSpecs.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, rot: yaw, span: len + 0.1, width: W, y0: a.y - (br ? 4 * sag * (((i - br[0])) / (br[1] - br[0])) * (1 - ((i - br[0])) / (br[1] - br[0])) : 0), y1: b.y - (br ? 4 * sag * (((i + 1 - br[0])) / (br[1] - br[0])) * (1 - ((i + 1 - br[0])) / (br[1] - br[0])) : 0), y: 0 });
    }
    // posts at each joint (not under the bridges): down to the plates on the outer edge, short ones inside,
    // braced, with the railing posts above
    for (let i = 0; i < ths.length; i++) {
      if (inBridge(i)) continue;
      const th = ths[i];
      const o = P(i, 0.97), m = P(i, 0.5);
      const pr = shellProfile(th);
      const rhoO = shellPolar(o.x, o.z).rho;
      // the flank is under this post where it bulges out to the post's radius
      let yb = o.y - 1.0;
      for (let q = pr.face[0]; q <= pr.face[1]; q++) if (pr.rho[q] >= rhoO - 0.004) { yb = pr.y[q] - 0.35; break; }
      yb = Math.min(yb, o.y - 0.5);
      k.add(slab(0.28, o.y - yb, 0.28, WOOD_TILE, true), 'wood', pk(r, PAL.timberDark), T(o.x, yb, o.z, (r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.03));
      // a big flat stone where the post meets the plates
      k.add(new THREE.DodecahedronGeometry(0.42, 0).scale(1, 0.45, 1), 'rough', pk(r, PAL.stone), T(o.x, yb + 0.12, o.z));
      // the railing post
      k.add(slab(0.2, 1.22, 0.2, WOOD_TILE, true), 'wood', pk(r, PAL.timber), T(o.x, o.y - 0.05, o.z));
      k.add(new THREE.ConeGeometry(0.15, 0.16, 4), 'wood', pk(r, PAL.timberDark), T(o.x, o.y + 1.25, o.z, 0, Math.PI / 4, 0));
      // a brace from the post up under the middle of the deck
      if (o.y - yb > 1.6) k.add(taperTube([new THREE.Vector3(o.x, yb + (o.y - yb) * 0.45, o.z), new THREE.Vector3(m.x, m.y - 0.25, m.z)], 0.09, 0.09, 4, 2), 'wood', pk(r, PAL.timberDark));
      // the inner edge sits on short posts on the shell
      const ii = P(i, 0.04), gi = groundAt(ii.x, ii.z);
      if (ii.y - gi > 0.2) k.add(slab(0.24, ii.y - gi + 0.3, 0.24, WOOD_TILE, true), 'wood', pk(r, PAL.timberDark), T(ii.x, gi - 0.3, ii.z));
      // dressing on the walk now and then: a barrel, a tub, a bench, a lantern on the railing post
      const q = r();
      const d = P(i, 0.78);
      if (i > 0 && q < 0.12) barrel(k, T(d.x, d.y, d.z), r);
      else if (q < 0.2) vegTub(k, T(d.x, d.y, d.z), r, 0.45);
      else if (q < 0.27) bench(k, T(P(i, 0.82).x, d.y, P(i, 0.82).z, 0, Math.atan2(outs[i].x, outs[i].z) + Math.PI, 0), r, 1.4);
      if (i % 3 === 1) lantern(k, T(o.x - outs[i].x * 0.25, o.y + 1.15, o.z - outs[i].z * 0.25));
      for (let f = 0; f < 3; f++) if (r() < 0.25) posy(k, T(P(i, 0.98).x, o.y, P(i, 0.98).z, 0, r() * 3, 0), 0.4, r);
    }
    // landings at both ends: steps down onto the front of the dome
    for (const [i, sgn] of [[0, -1], [ths.length - 1, 1]] as const) {
      const p = P(i, 0.5), tg = P(Math.min(ths.length - 1, i + (sgn < 0 ? 1 : 0)), 0.5).sub(P(Math.max(0, i - (sgn > 0 ? 1 : 0)), 0.5)).setY(0).normalize().multiplyScalar(sgn);
      const end = p.clone().addScaledVector(tg, 2.4); end.y = groundAt(end.x, end.z);
      this.stairs(p, end, 2.2, false);
    }
    this.ring = { ths, inner, outs, yd, W, P };
    for (let i = 0; i < ths.length; i++) { const c = P(i, 0.5); this.take(c.x, c.z, 1.5); }
  }
  ring!: { ths: number[]; inner: THREE.Vector3[]; outs: THREE.Vector3[]; yd: number[]; W: number; P: (i: number, f: number) => THREE.Vector3 };

  /** A straight flight of wide timber stairs from a (bottom) to b (top), with stringers, posts and a handrail. */
  private stairs(a0: THREE.Vector3, b0: THREE.Vector3, width: number, rail = true) {
    const k = this.kit, r = this.r;
    const lowFirst = a0.y <= b0.y;
    const a = lowFirst ? a0 : b0, b = lowFirst ? b0 : a0;
    const run = Math.hypot(b.x - a.x, b.z - a.z), rise = b.y - a.y;
    const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
    const n = Math.max(2, Math.round(rise / 0.21));
    const c = pk(r, PAL.timber);
    for (let q = 0; q < n; q++) {
      const t = (q + 0.5) / n;
      const p = a.clone().lerp(b, t);
      const ty = a.y + rise * ((q + 1) / n);
      k.add(boxM(run / n + 0.08, 0.08, width, WOOD_TILE), 'wood', new THREE.Color(c).multiplyScalar(0.88 + r() * 0.2), T(p.x, ty - 0.04, p.z, 0, yaw, 0));
      k.add(boxM(0.04, rise / n, width - 0.1, WOOD_TILE), 'wood', pk(r, PAL.timberDark), T(p.x - (b.x - a.x) / n * 0.5, ty - rise / n / 2, p.z - (b.z - a.z) / n * 0.5, 0, yaw, 0));
    }
    const side = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const L = a.distanceTo(b);
    for (const sd of [-1, 1]) {
      const s0 = a.clone().addScaledVector(side, sd * (width / 2 - 0.06)), s1 = b.clone().addScaledVector(side, sd * (width / 2 - 0.06));
      k.add(boxM(L + 0.2, 0.3, 0.12, WOOD_TILE), 'wood', pk(r, PAL.timberDark), T((s0.x + s1.x) / 2, (s0.y + s1.y) / 2 + 0.02, (s0.z + s1.z) / 2, 0, yaw, Math.atan2(rise, run)));
      // posts down to the shell under the stringers
      for (const t of [0.0, 0.5, 1.0]) {
        const p = s0.clone().lerp(s1, t), g = groundAt(p.x, p.z);
        if (p.y - g > 0.25) k.add(slab(0.18, p.y - g + 0.3, 0.18, WOOD_TILE, true), 'wood', pk(r, PAL.timberDark), T(p.x, g - 0.3, p.z));
        if (rail && (sd > 0 || width > 2.4)) k.add(slab(0.14, 1.05, 0.14, WOOD_TILE, true), 'wood', pk(r, PAL.timber), T(p.x, p.y, p.z));
      }
      if (rail && (sd > 0 || width > 2.4)) k.add(boxM(L + 0.15, 0.12, 0.12, WOOD_TILE), 'wood', pk(r, PAL.timber), T((s0.x + s1.x) / 2, (s0.y + s1.y) / 2 + 1.02, (s0.z + s1.z) / 2, 0, yaw, Math.atan2(rise, run)));
    }
    this.deckSpecs.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, rot: yaw, span: run + 0.1, width, y0: a.y, y1: b.y, y: 0 });
    for (let t = 0; t <= 1; t += 0.25) { const p = a.clone().lerp(b, t); this.take(p.x, p.z, width / 2 + 0.3); }
  }

  /** A sturdy wooden ladder from a (bottom) leaning up to b (top). */
  private ladder(a: THREE.Vector3, b: THREE.Vector3) {
    const k = this.kit, r = this.r;
    const d = b.clone().sub(a), L = d.length();
    const yaw = Math.atan2(d.x, d.z);
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    for (const sd of [-1, 1]) {
      const p0 = a.clone().addScaledVector(side, sd * 0.36), p1 = b.clone().addScaledVector(side, sd * 0.36).add(new THREE.Vector3(0, 0.9, 0));
      k.add(taperTube([p0, p1], 0.08, 0.07, 5, 2), 'wood', pk(r, PAL.timber));
    }
    const n = Math.floor(L / 0.32);
    for (let q = 1; q <= n; q++) { const p = a.clone().lerp(b, q / (n + 0.5)); k.add(new THREE.CylinderGeometry(0.045, 0.045, 0.78, 5), 'wood', pk(r, PAL.timberDark), T(p.x, p.y, p.z, 0, yaw, Math.PI / 2)); }
    this.take(a.x, a.z, 0.8); this.take(b.x, b.z, 0.8);
  }

  // ---------------------------------------------------------------------------------------- the top

  private placeHouse(name: string, th: number, rho: number, opts: { w: number; d: number; floors: number; walkIn: boolean; kind?: 'cottage' | 'bakery' | 'big'; balcony?: boolean; face?: number; seed: number }) {
    const c = spot(th, rho);
    // the door looks outward (down the slope), or as asked
    const o = outward(th);
    const rot = opts.face ?? Math.atan2(o.x, o.z);
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const L = (lx: number, lz: number) => new THREE.Vector3(c.x + lx * cs + lz * sn, 0, c.z - lx * sn + lz * cs);
    let gMax = -1e9, gMin = 1e9;
    for (const [fx, fz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, 0], [0, -0.5], [0, 0.5], [-0.5, 0], [0.5, 0]]) {
      const p = L(fx * opts.w, fz * opts.d); const g = groundAt(p.x, p.z); gMax = Math.max(gMax, g); gMin = Math.min(gMin, g);
    }
    const floorY = gMax + 0.18;
    const dp = L(0, opts.d / 2 + 1.0);
    const doorDrop = Math.max(0.2, floorY - groundAt(dp.x, dp.z));
    const at = new THREE.Vector3(c.x, floorY, c.z);
    this.kit.push(T(at.x, at.y, at.z, 0, rot, 0));
    const out = house(this.kit, { ...opts, plinth: floorY - gMin + 0.5, doorDrop: Math.min(doorDrop, 2.4) });
    this.kit.pop();
    for (const s of out.solids) this.solid(s, at, rot);
    for (const d of out.decks) this.deck(d, at, rot);
    const world = (v: THREE.Vector3) => { const q = L(v.x, v.z); q.y = at.y + v.y; return q; };
    for (const p of [...out.chimney, ...out.ridge]) this.perches.push(world(p));
    this.houses.push({ ...out, at, rot, walkIn: opts.walkIn, name, w: opts.w, d: opts.d, doorLocal: out.door.clone(), door: world(out.door), chimney: out.chimney.map(world), ridge: out.ridge.map(world) });
    this.take(c.x, c.z, Math.hypot(opts.w, opts.d) / 2 + 0.6);
    const fr = world(new THREE.Vector3(out.door.x, 0, out.door.z + 1.2));
    this.take(fr.x, fr.z, 1.2);
    return this.houses[this.houses.length - 1];
  }

  private top() {
    const k = this.kit, r = this.r;
    // the big old house on the crown, its door to the open lawn at the front
    this.placeHouse('the big old house', -2.6, 0.12, { w: 7.6, d: 6.0, floors: 3, walkIn: true, kind: 'big', balcony: true, face: 0.25, seed: 101 });
    // the windmills at the back of the crown: the working one, and the broken one with a sail gone
    for (const [th, rho, broken, seed] of [[-1.05, 0.3, false, 7], [-2.15, 0.28, true, 9]] as const) {
      const c = spot(th, rho);
      let gMin = 1e9, gMax = -1e9;
      for (let a = 0; a < TAU; a += TAU / 8) { const g = groundAt(c.x + Math.cos(a) * 2.6, c.z + Math.sin(a) * 2.6); gMin = Math.min(gMin, g); gMax = Math.max(gMax, g); }
      const o = outward(th);
      const rot = Math.atan2(o.x, o.z) + (broken ? 0.3 : -0.25);
      const at = new THREE.Vector3(c.x, gMax - 0.1, c.z);
      k.push(T(at.x, at.y, at.z, 0, rot, 0));
      const m = windmill(k, seed, broken, gMax - gMin + 0.3);
      k.pop();
      m.sails.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(at);
      m.sails.rotation.set(-0.12, rot, 0, 'YXZ');
      this.sails.push(m.sails);
      this.mills.push(m);
      this.solid(m.solid, at, rot);
      this.perches.push(m.top.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(at));
      this.take(c.x, c.z, 3.6);
    }
    // trees growing out of the shell
    for (const [th, rho, h, sp] of [[2.05, 0.22, 9.5, 1.2], [0.15, 0.3, 7.5, 1.0], [3.55, 0.7, 6.0, 0.9], [-0.25, 0.52, 6.5, 1.0], [1.25, 0.56, 5.0, 0.9], [-1.65, 0.62, 5.5, 0.9]] as const) {
      const c = spot(th, rho);
      if (!this.free(c.x, c.z, 0.8)) continue;
      tree(k, T(c.x, c.y, c.z, 0, r() * TAU, 0), r, h, sp);
      this.solidSpecs.push({ x: c.x, z: c.z, hw: 0.5, hd: 0.5, h: h, rot: 0, y0: c.y });
      this.take(c.x, c.z, 1.4);
    }
    // the well on the crown: a stone ring, a little shingled roof on posts, the windlass and its bucket
    {
      const c = spot(1.3, 0.2);
      k.push(T(c.x, c.y - 0.2, c.z, 0, 0.4, 0));
      const g = new THREE.CylinderGeometry(1.0, 1.08, 1.1, 18, 1, true);
      k.add(g, 'stone', pk(r, PAL.stone), T(0, 0.55, 0));
      k.add(new THREE.CylinderGeometry(0.82, 0.82, 1.0, 18, 1, true), 'rough', pk(r, PAL.stone), T(0, 0.55, 0));
      k.add(new THREE.TorusGeometry(0.93, 0.15, 6, 20), 'rough', pk(r, PAL.stone), T(0, 1.12, 0, Math.PI / 2));
      k.add(new THREE.CircleGeometry(0.82, 16).rotateX(-Math.PI / 2), 'glass', '#4f7380', T(0, 0.5, 0));
      for (const sx of [-1, 1]) k.add(slab(0.16, 2.6, 0.16, WOOD_TILE, true), 'wood', pk(r, PAL.timberDark), T(sx * 0.95, 0.6, 0));
      k.add(new THREE.CylinderGeometry(0.11, 0.11, 2.1, 8), 'wood', pk(r, PAL.timber), T(0, 2.1, 0, 0, 0, Math.PI / 2));
      for (const sd of [-1, 1]) k.add(boxM(2.6, 0.06, 1.0, WOOD_TILE), 'wood', pk(r, PAL.shingle), T(0, 3.25 - 0.22, sd * 0.42, sd * 0.55, 0, 0));
      rope(k, [new THREE.Vector3(0.2, 2.1, 0), new THREE.Vector3(0.2, 1.5, 0)], 0.02);
      k.add(new THREE.CylinderGeometry(0.17, 0.14, 0.3, 10), 'wood', pk(r, PAL.timber), T(0.2, 1.35, 0));
      bench(k, T(0, 0, 1.9, 0, Math.PI, 0), r, 1.6);
      k.pop();
      this.solidSpecs.push({ x: c.x, z: c.z, hw: 1.1, hd: 1.1, h: 1.1, rot: 0, y0: c.y });
      this.take(c.x, c.z, 2.0);
    }
    // the rain pools: shallow basins with rims of mossy stones, where the channel will start
    for (const [th, rho, rad] of [[0.95, 0.12, 1.7], [2.75, 0.17, 1.3]] as const) {
      const c = spot(th, rho);
      k.add(new THREE.CircleGeometry(rad, 20).rotateX(-Math.PI / 2), 'glass', '#86b4c4', T(c.x, c.y + 0.12, c.z));
      k.add(new THREE.CircleGeometry(rad + 0.15, 20).rotateX(-Math.PI / 2), 'rough', '#7d7560', T(c.x, c.y + 0.02, c.z));
      const n = Math.round(rad * 9);
      for (let q = 0; q < n; q++) {
        const a = (q / n) * TAU + r() * 0.2, rr = rad + 0.15 + r() * 0.1;
        const p = new THREE.Vector3(c.x + Math.cos(a) * rr, 0, c.z + Math.sin(a) * rr); p.y = groundAt(p.x, p.z);
        k.add(new THREE.DodecahedronGeometry(0.28 + r() * 0.18, 0).scale(1.2, 0.55, 1), 'rough', pk(r, PAL.stone), T(p.x, p.y + 0.1, p.z, r(), r() * 3, r()));
        if (r() < 0.3) posy(k, T(p.x, p.y + 0.15, p.z, 0, r() * 3, 0), 0.4, r);
      }
      this.take(c.x, c.z, rad + 0.5);
    }
  }

  // ---------------------------------------------------------------------------------------- the middle

  private middle() {
    // the middle terrace: a ring of cottages, five of them walk-in (one the bakery), and the carpenter's yard
    const mid: [string, number, number, number, number, boolean, ('cottage' | 'bakery')?][] = [
      // name, th, rho, w, d, walk-in, kind
      ['Bramble Cottage', 2.45, 0.47, 5.0, 4.4, true],
      ['the bakery', 3.12, 0.47, 5.4, 4.6, true, 'bakery'],
      ['Thimble House', 3.8, 0.48, 4.6, 4.2, false],
      ['Fern Cottage', 5.15, 0.47, 5.0, 4.4, true],
      ['Lantern House', 5.85, 0.47, 4.8, 4.2, false],
      ['Old Wren\'s', 0.4, 0.48, 5.0, 4.3, true],
      ['Hollyhock', 1.1, 0.5, 4.6, 4.2, false],
    ];
    mid.forEach(([name, th, rho, w, d, walkIn, kind], i) => this.placeHouse(name, th, rho, { w, d, floors: walkIn ? 2 : 2 + (i % 2), walkIn, kind, balcony: i % 3 === 1, seed: 200 + i * 17 }));
    // smaller cottages on the shoulder, perched over the walkways
    const sh: [string, number, number, number, number][] = [['Moss End', 2.95, 0.7, 4.2, 3.6], ['Tumble', 3.95, 0.71, 4.0, 3.6], ['Rookery', 5.5, 0.7, 4.2, 3.6], ['Pip\'s', 0.05, 0.71, 4.0, 3.6]];
    sh.forEach(([name, th, rho, w, d], i) => this.placeHouse(name, th, rho, { w, d, floors: 1 + (i % 2), walkIn: false, seed: 400 + i * 13 }));
    this.yard(spot(4.48, 0.49), 4.48);
  }

  /** The carpenter's yard: stacks of planks, a log pile, a sawhorse, a workbench, and a new sail frame in the making. */
  private yard(c: THREE.Vector3, th: number) {
    const k = this.kit, r = this.r;
    const o = outward(th);
    const rot = Math.atan2(o.x, o.z);
    k.push(T(c.x, c.y, c.z, 0, rot, 0));
    k.add(new THREE.CircleGeometry(3.0, 18).rotateX(-Math.PI / 2), 'plain', '#d9c49a', T(0, 0.05, 0));
    // plank stacks on bearers
    for (const [x, z, n] of [[-1.6, -0.8, 7], [-1.6, 0.6, 5]] as const) {
      for (const bz of [-1.2, 0, 1.2]) k.add(slab(0.2, 0.15, 0.2), 'wood', pk(r, PAL.timberDark), T(x + 0.0, 0, z + bz * 0.4, 0, 0, 0));
      for (let q = 0; q < n; q++) k.add(slab(0.28, 0.06, 3.0), 'wood', pk(r, PAL.timberPale), T(x + (q % 3 - 1) * 0.3, 0.15 + Math.floor(q / 3) * 0.07, z * 0.2 + (r() - 0.5) * 0.1, 0, Math.PI / 2 + (r() - 0.5) * 0.04, 0));
    }
    // a log pile
    for (let q = 0; q < 6; q++) { const row = q < 3 ? 0 : q < 5 ? 1 : 2; k.add(new THREE.CylinderGeometry(0.22, 0.24, 2.2, 8).rotateX(Math.PI / 2), 'wood', pk(r, ['#8a7356', '#7c6850']), T(1.6 + (q - (row === 0 ? 1 : row === 1 ? 3.5 : 5)) * 0.45, 0.24 + row * 0.38, -1.1)); }
    // the sawhorse with a plank on it, and the workbench with tools
    for (const sx of [-0.5, 0.5]) for (const sz of [-1, 1]) k.add(slab(0.08, 0.85, 0.08, WOOD_TILE, true), 'wood', pk(r, PAL.timberDark), T(0.6 + sx, 0, 1.0 + sz * 0.22, sz * 0.25, 0, 0));
    k.add(boxM(1.2, 0.12, 0.12, WOOD_TILE), 'wood', pk(r, PAL.timber), T(0.6, 0.82, 1.0));
    k.add(boxM(0.28, 0.06, 2.4, WOOD_TILE), 'wood', pk(r, PAL.timberPale), T(0.6, 0.92, 1.0, 0, Math.PI / 2 - 0.1, 0));
    k.push(T(0.2, 0, -0.3, 0, 0.1, 0));
    k.add(slab(1.8, 0.1, 0.7), 'wood', pk(r, PAL.timber), T(0, 0.82, 0));
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.28, 0.28]) k.add(slab(0.1, 0.82, 0.1), 'wood', pk(r, PAL.timberDark), T(sx, 0, sz));
    k.add(slab(0.5, 0.04, 0.12), 'plain', '#b9b6ae', T(-0.4, 0.92, 0.1, 0, 0.3, 0));
    k.add(slab(0.12, 0.08, 0.3), 'wood', pk(r, PAL.timberDark), T(0.3, 0.92, -0.1));
    k.add(slab(0.06, 0.25, 0.06), 'wood', pk(r, PAL.timberDark), T(0.6, 0.92, 0.15, 0, 0, 1.2));
    k.pop();
    // the new sail frame for the broken mill, half made, leaning on the bench
    k.push(T(-0.2, 0.1, -1.6, -1.25, 0.15, 0));
    k.add(slab(0.18, 4.6, 0.16), 'wood', pk(r, PAL.timberPale), T(0, 0, 0));
    k.add(slab(0.07, 3.8, 0.07), 'wood', pk(r, PAL.timberPale), T(1.2, 0.6, 0));
    for (let b = 0; b < 6; b++) k.add(boxM(1.3, 0.05, 0.05, WOOD_TILE), 'wood', pk(r, PAL.timberPale), T(0.6, 0.7 + b * 0.62, 0));
    k.pop();
    // sawdust curls and a few offcuts, a crate of pegs
    for (let q = 0; q < 5; q++) k.add(slab(0.1 + r() * 0.2, 0.05, 0.1), 'wood', pk(r, PAL.timberPale), T((r() - 0.5) * 3, 0.05, (r() - 0.5) * 3, 0, r() * 3, 0));
    crate(k, T(-0.9, 0, 1.6, 0, 0.4, 0), r, 0.55);
    k.pop();
    this.solidSpecs.push({ x: c.x, z: c.z, hw: 1.0, hd: 1.0, h: 1.0, rot, y0: c.y });
    this.take(c.x, c.z, 3.0);
  }

  // ---------------------------------------------------------------------------------------- between the levels

  private between() {
    const ring = this.ring;
    // wide stairs from the walkway up the first ledge onto the shoulder, and on up to the middle terrace and the crown
    const stair = (th: number, dth: number, r0: number, r1: number, width: number, lift0 = 0) => {
      const a = spot(th, r0), b = spot(th + dth, r1);
      a.y += lift0;
      this.stairs(a, b, width);
    };
    // walkway (inner edge) up to the shoulder: from the deck at its sample nearest th
    const fromRing = (th: number, dth: number, r1: number, width: number) => {
      let bi = 0; ring.ths.forEach((t, i) => { if (Math.abs(Math.atan2(Math.sin(t - th), Math.cos(t - th))) < Math.abs(Math.atan2(Math.sin(ring.ths[bi] - th), Math.cos(ring.ths[bi] - th)))) bi = i; });
      const a = ring.P(bi, 0.0);
      const b = spot(ring.ths[bi] + dth, r1);
      this.stairs(a, b, width);
    };
    fromRing(2.7, 0.16, 0.72, 2.2);
    fromRing(4.95, 0.15, 0.72, 2.2);
    fromRing(0.62, -0.15, 0.72, 2.0);
    stair(2.78, 0.2, 0.72, 0.555, 2.4);
    stair(4.42, -0.2, 0.71, 0.56, 2.2);
    stair(0.78, -0.18, 0.72, 0.56, 2.0);
    stair(3.46, 0.18, 0.56, 0.31, 2.6);
    stair(5.52, -0.2, 0.56, 0.31, 2.2);
    stair(1.55, -0.12, 0.57, 0.31, 2.4);
    // sturdy ladders: walkway to the shoulder, and up the middle ledge
    for (const [th, r0, r1] of [[3.45, 0.81, 0.745], [5.95, 0.81, 0.745], [4.75, 0.66, 0.585], [2.15, 0.655, 0.585], [-0.45, 0.4, 0.335]] as const) {
      const a = spot(th, r0), b = spot(th, r1);
      if (r0 > 0.8) a.y += 0.45;
      this.ladder(a.addScaledVector(outward(th), 0.3), b.add(new THREE.Vector3(0, -0.2, 0)));
    }
  }

  // ---------------------------------------------------------------------------------------- dressing

  private dressing() {
    const k = this.kit, r = this.r;
    // laundry between neighbouring houses at about their eaves, and on poles on the crown
    const H = this.houses;
    const eaveAt = (h: typeof H[number], side: number) => {
      const p = h.at.clone(); const c = Math.cos(h.rot), s = Math.sin(h.rot);
      const lx = side * 2.2, lz = 1.6;
      return new THREE.Vector3(p.x + lx * c + lz * s, p.y + Math.min(h.eave, 4.6) - 0.3, p.z - lx * s + lz * c);
    };
    const pairs: [number, number, 'l' | 'b'][] = [[0, 1, 'l'], [1, 2, 'b'], [3, 4, 'l'], [4, 5, 'b'], [5, 6, 'l'], [2, 3, 'b'], [7, 8, 'l'], [0, 6, 'b'], [9, 10, 'l']];
    for (const [i, j, kind] of pairs) {
      if (!H[i] || !H[j]) continue;
      const a = eaveAt(H[i], 1), b = eaveAt(H[j], -1);
      if (a.distanceTo(b) > 16 || a.distanceTo(b) < 2) continue;
      if (kind === 'l') laundry(k, a, b, r, 0.3 + a.distanceTo(b) * 0.02); else bunting(k, a.add(new THREE.Vector3(0, 0.9, 0)), b.add(new THREE.Vector3(0, 0.9, 0)), r, 0.5);
    }
    // bunting from the big house's ridge to the mills, and across the crown
    const big = H[0];
    for (const m of this.perches.slice(0, 0)) void m;
    if (big) {
      for (const mi of [0, 1]) {
        const mill = this.mills[mi];
        if (!mill) continue;
        const sp = this.sails[mi].position.clone();
        const a = big.ridge[mi].clone().add(new THREE.Vector3(0, -0.4, 0));
        const b = sp.clone().add(new THREE.Vector3(0, -4.2, 0));
        bunting(k, a, b, r, 0.8);
      }
      bunting(k, big.ridge[0].clone().add(new THREE.Vector3(0, -0.3, 0)), H[1] ? H[1].ridge[1].clone() : big.ridge[1], r, 1.0);
      bunting(k, big.ridge[1].clone().add(new THREE.Vector3(0, -0.3, 0)), H[6] ? H[6].ridge[0].clone() : big.ridge[0], r, 1.0);
    }
    // washing poles on the lawn behind the well
    {
      const a = spot(1.75, 0.3), b = spot(2.3, 0.33);
      for (const p of [a, b]) k.add(slab(0.12, 2.4, 0.12, WOOD_TILE, true), 'wood', pk(r, PAL.timberDark), T(p.x, p.y - 0.2, p.z));
      laundry(k, a.clone().add(new THREE.Vector3(0, 2.1, 0)), b.clone().add(new THREE.Vector3(0, 2.1, 0)), r, 0.25);
      this.take((a.x + b.x) / 2, (a.z + b.z) / 2, 1.5);
    }
    // tubs of vegetables, barrels, benches, crates and flowers on the free ground of the terraces
    let placed = 0;
    for (let q = 0; q < 900 && placed < 70; q++) {
      const th = r() * TAU, rho = 0.12 + r() * 0.66;
      const L = ledges(th);
      if (L.some(l => Math.abs(rho - l.e) < l.w * 1.6)) continue;
      const p = spot(th, rho);
      if (!this.free(p.x, p.z, 0.7)) continue;
      const w = r();
      if (w < 0.32) vegTub(k, T(p.x, p.y - 0.05, p.z), r, 0.45 + r() * 0.2);
      else if (w < 0.45) barrel(k, T(p.x, p.y - 0.05, p.z), r);
      else if (w < 0.55) crate(k, T(p.x, p.y - 0.05, p.z, 0, r() * 3, 0), r);
      else if (w < 0.65) bench(k, T(p.x, p.y - 0.05, p.z, 0, Math.atan2(outward(th).x, outward(th).z), 0), r, 1.5);
      else { for (let f = 0; f < 4; f++) posy(k, T(p.x + (r() - 0.5) * 1.2, p.y - 0.05, p.z + (r() - 0.5) * 1.2, 0, r() * 3, 0), 0.5, r); }
      if (w < 0.65) this.solidSpecs.push({ x: p.x, z: p.z, hw: 0.45, hd: 0.45, h: 0.9, rot: 0, y0: p.y });
      this.take(p.x, p.z, 0.8);
      placed++;
    }
    // lanterns on posts along the crown paths
    for (const [th, rho] of [[1.95, 0.42], [3.4, 0.33], [0.35, 0.33], [5.4, 0.36]] as const) {
      const p = spot(th, rho);
      if (!this.free(p.x, p.z, 0.3)) continue;
      k.add(slab(0.12, 2.4, 0.12, WOOD_TILE, true), 'wood', pk(r, PAL.timberDark), T(p.x, p.y - 0.2, p.z));
      k.add(boxM(0.5, 0.08, 0.08, 1), 'wood', pk(r, PAL.timberDark), T(p.x + 0.2, p.y + 2.1, p.z));
      lantern(k, T(p.x + 0.4, p.y + 2.06, p.z));
    }
  }

  // ---------------------------------------------------------------------------------------- ropes down the legs

  private legRopes() {
    const k = this.kit, r = this.r, ring = this.ring;
    for (const l of ['FL', 'FR', 'BL', 'BR'] as Leg[]) {
      const F = FOOT_REST[l];
      const legTh = shellPolar(F.x, F.z).th;
      for (const [dth, kind] of [[0.13, 'ladder'], [-0.12, 'rope'], [0.2, 'rope']] as const) {
        const th = legTh + dth * (l === 'FL' || l === 'BR' ? 1 : -1);
        // the ring sample nearest th
        let bi = -1, bd = 1e9;
        ring.ths.forEach((t, i) => { const d = Math.abs(Math.atan2(Math.sin(t - th), Math.cos(t - th))); if (d < bd) { bd = d; bi = i; } });
        if (bi < 0 || bd > 0.12) continue;
        const o = ring.outs[bi];
        const top = ring.P(bi, 0.99).add(new THREE.Vector3(0, 0.6, 0));
        // down over the plates, a hand's breadth off them, then free past the lip to the meadow
        const pr = shellProfile(ring.ths[bi]);
        const E = pr.E, R = Math.hypot(E.x, E.z);
        const pts: THREE.Vector3[] = [top.clone().addScaledVector(o, 0.2)];
        let maxOut = shellPolar(top.x, top.z).rho;
        for (let q = pr.face[0]; q <= pr.face[1]; q += 4) {
          if (pr.y[q] > top.y - 0.6) continue;
          maxOut = Math.max(maxOut, pr.rho[q] + 0.6 / R);
          pts.push(new THREE.Vector3(E.x * maxOut, pr.y[q], SHELL.cz + E.z * maxOut));
        }
        const last = pts[pts.length - 1];
        pts.push(new THREE.Vector3(last.x, 4.5, last.z), new THREE.Vector3(last.x + (r() - 0.5) * 0.3, 0.35, last.z + (r() - 0.5) * 0.3));
        if (kind === 'ladder') ropeLadder(k, pts, o, 0.32, r);
        else {
          rope(k, pts, 0.07);
          // knots to climb by
          const c = new THREE.CatmullRomCurve3(pts);
          for (let t = 0.45; t < 0.98; t += 0.06) k.add(new THREE.SphereGeometry(0.13, 6, 4), 'plain', '#a88d60', T(...c.getPointAt(t).toArray()));
        }
        // tied off round the railing post
        k.add(new THREE.TorusGeometry(0.2, 0.06, 4, 10), 'plain', '#b39668', T(top.x, top.y - 0.1, top.z, Math.PI / 2));
      }
    }
  }

  // ---------------------------------------------------------------------------------------- the lookout on the neck

  private lookout() {
    const k = this.nk, r = this.r;
    const N1 = REST[BONE.neck1];
    // on the top of the neck, a little before the second neck bone; the neck there is ~5.4 m across
    const c = new THREE.Vector3(0, N1.y + 5.2, N1.z - 0.8);
    const rad = 2.4;
    k.push(T(c.x, c.y, c.z));
    // the deck: a round platform of planks on a frame
    for (let q = 0; q < 16; q++) {
      const x = -rad + (q + 0.5) * (rad * 2 / 16);
      const len = 2 * Math.sqrt(Math.max(0.1, rad * rad - x * x));
      k.add(boxM(0.28, 0.08, len, WOOD_TILE), 'wood', new THREE.Color(pk(r, PAL.timber)).multiplyScalar(0.9 + r() * 0.2), T(x, 0, 0));
    }
    k.add(new THREE.TorusGeometry(rad, 0.1, 5, 28), 'wood', pk(r, PAL.timberDark), T(0, -0.05, 0, Math.PI / 2));
    // legs straddling the neck, strapped down with ropes round it
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const top = new THREE.Vector3(sx * rad * 0.62, -0.05, sz * rad * 0.62);
      const foot = new THREE.Vector3(sx * 2.9, -2.6, sz * rad * 0.55);
      k.add(taperTube([top, foot], 0.13, 0.12, 6, 2), 'wood', pk(r, PAL.timberDark));
    }
    for (const sz of [-0.9, 0.9]) {
      const pts: THREE.Vector3[] = [];
      for (let a = -2.4; a <= 2.4; a += 0.3) pts.push(new THREE.Vector3(Math.sin(a) * 3.3, -5.4 + Math.cos(a) * 3.3, sz * 1.4));
      k.add(taperTube(pts, 0.07, 0.07, 5, 24), 'plain', '#b39668');
    }
    // the railing, a bench, a spyglass on a stand, a flagpole with a long pennant
    for (let q = 0; q < 14; q++) {
      const a = (q / 14) * TAU;
      k.add(slab(0.13, 1.05, 0.13, WOOD_TILE, true), 'wood', pk(r, PAL.timber), T(Math.cos(a) * (rad - 0.1), 0, Math.sin(a) * (rad - 0.1)));
    }
    k.add(new THREE.TorusGeometry(rad - 0.1, 0.07, 5, 28), 'wood', pk(r, PAL.timber), T(0, 1.05, 0, Math.PI / 2));
    k.add(new THREE.TorusGeometry(rad - 0.1, 0.05, 5, 28), 'wood', pk(r, PAL.timber), T(0, 0.55, 0, Math.PI / 2));
    bench(k, T(-0.9, 0.04, -1.2, 0, 0.6, 0), r, 1.3);
    k.add(slab(0.08, 1.1, 0.08), 'wood', pk(r, PAL.timberDark), T(1.0, 0.04, 0.9));
    k.add(new THREE.CylinderGeometry(0.06, 0.08, 0.7, 8), 'brass', '#c9a05a', T(1.0, 1.2, 1.0, 1.25, 0.3, 0));
    k.add(slab(0.1, 4.2, 0.1), 'wood', pk(r, PAL.timberDark), T(-1.4, 0.04, 1.3));
    {
      const g = new THREE.PlaneGeometry(1.0, 1.6);
      void g;
    }
    k.pop();
    this.neckDecks.push({ x: c.x, z: c.z, rot: 0, span: rad * 2 - 0.3, width: rad * 1.6, y0: 0, y1: 0, y: c.y });
    // a plank walk along the top of the neck from the shell's front to the lookout, on chocks
    const a = new THREE.Vector3(0, REST[BONE.neck0].y + 5.7, REST[BONE.neck0].z + 0.5), b = new THREE.Vector3(0, c.y - 0.05, c.z - rad + 0.2);
    const run = Math.hypot(b.z - a.z, b.x - a.x);
    const n = Math.ceil(run / 0.3);
    for (let q = 0; q < n; q++) {
      const t = (q + 0.5) / n, p = a.clone().lerp(b, t);
      k.add(boxM(1.6, 0.07, 0.28, WOOD_TILE), 'wood', new THREE.Color(pk(r, PAL.timber)).multiplyScalar(0.9 + r() * 0.2), T(p.x, p.y, p.z, -Math.atan2(b.y - a.y, run), 0, 0));
    }
    for (const sx of [-0.8, 0.8]) k.add(boxM(0.14, 0.18, run, WOOD_TILE), 'wood', pk(r, PAL.timberDark), T(sx, (a.y + b.y) / 2 - 0.12, (a.z + b.z) / 2, -Math.atan2(b.y - a.y, run), 0, 0));
    this.neckDecks.push({ x: 0, z: (a.z + b.z) / 2, rot: -Math.PI / 2, span: run, width: 1.6, y0: a.y, y1: b.y, y: 0 });
  }

  // ---------------------------------------------------------------------------------------- collision for the game

  /**
   * The game's colliders: one proxy object per solid and deck, placed in world space by `syncColliders` from the
   * frames they ride (shellTop's and neckRide's world matrices, with the village's offsets).
   */
  colliders() {
    const solids: Solid[] = [], decks: Deck[] = [];
    const proxies: { o: THREE.Object3D; local: THREE.Matrix4; neck: boolean }[] = [];
    const mk = (x: number, y: number, z: number, rot: number, neck: boolean) => {
      const o = new THREE.Object3D();
      proxies.push({ o, local: new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z), neck });
      return o;
    };
    for (const [list, neck] of [[this.solidSpecs, false], [this.neckSolids, true]] as const) for (const s of list) {
      solids.push({ obj: mk(s.x, s.y0, s.z, s.rot, neck), shape: { kind: 'box', hw: s.hw, hd: s.hd }, h: s.h });
    }
    for (const [list, neck] of [[this.deckSpecs, false], [this.neckDecks, true]] as const) for (const d of list) {
      const base = d.y + (d.y0 + d.y1) / 2;
      const y0 = d.y + d.y0 - base, y1 = d.y + d.y1 - base;
      decks.push({ obj: mk(d.x, base, d.z, d.rot, neck), span: d.span, width: d.width, top: (x: number) => y0 + (y1 - y0) * (x / d.span + 0.5), rail: [0, 0] });
    }
    const m = new THREE.Matrix4(), off = new THREE.Matrix4();
    const sync = (shellTopWorld: THREE.Matrix4, neckWorld: THREE.Matrix4) => {
      for (const p of proxies) {
        off.copy(p.neck ? neckWorld : shellTopWorld).multiply(p.neck ? this.neck.matrix : this.group.matrix);
        m.multiplyMatrices(off, p.local);
        m.decompose(p.o.position, p.o.quaternion, p.o.scale);
      }
    };
    return { solids, decks, sync };
  }
}
