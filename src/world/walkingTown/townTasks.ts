// World 3, the Walking Town: the three things that keep Old Amble standing still, in their locked order.
//   1. the foot: a sharp stone wedged between two toes of the front left foot. Amble holds the foot up and winces.
//      Nilo climbs down the rope by the leg, finds the stone, the fox digs round it, he ties a rope on; back up top
//      Tamsin's pulley is rigged on the walk and everyone pulls together until it pops out; a long sigh, foot down.
//   2. the water: Amble's head hangs, dry-mouthed. The Miller tells of the channel from the rain pools to the mouth.
//      Find the lost windmill sail in a garden and fit it (the mill turns again), carry three new channel pieces
//      from the carpenter's yard into the gaps, open the sluice: the water runs the whole way and Amble drinks.
//   3. the eyes: vines have grown down from the antlers over both eyes. Out along the neck with Old Bramwyn and the
//      fox, onto the head between the antlers, and trim the six clumps one by one.
// Then the big moment: the last vine falls, Amble blinks in the sun, turns its huge eye to Nilo, rumbles, and takes
// its first step in weeks; the village cheers, the mills spin, the birds lift off the antlers, the ground shakes.
// Every state lives in the save's flags, and everything here is rebuilt from them each frame.
import * as THREE from 'three';
import type { Game } from '../../game';
import type { Beat } from '../../story/sequencer';
import type { Deck, Solid } from '../collide';
import { deckUnder } from '../collide';
import type { TownMove } from './townMove';
import type { TownStory } from './townStory';
import type { Mossrest } from './mossrest';
import type { Amble } from './amble';
import { groundAt, spot } from './mossrest';
import { REST, BONE, SHELL, headPoint, headDir, type BoneName } from './ambleRig';
import { headRing, headSideX, headSurface, mouthY } from './ambleHead';
import { Kit } from '../skyIsles/sailtownKit';
import { rnd } from './mossrestKit';
import { stoneProp, pulleyProp, RopeSpan, sailArm, trough, trestle, pieceProp, waterMaterial, waterLength, waterTube, shearsProp, sluiceProp, vineClump, plankRun, stairRun, along } from './townProps';
import { TOWN_GOALS, TOWN_DO, TOWN_STEP } from '../../data/townWords';

const sm = (k: number) => k * k * (3 - 2 * k);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GAPS = [2, 6, 9];

/** A point of the channel or the walk, in the rest frame of the bone it rides (creature rest coordinates). */
interface RidePt { p: THREE.Vector3; bone: BoneName | 'shell' }
interface Seg { a: RidePt; b: RidePt; len: number; s0: number; water: THREE.Mesh }
interface WalkDeck { deck: Deck; i: number; y0: number; y1: number; prev: THREE.Matrix4; have: boolean }

export class TownTasks {
  private town: Mossrest;
  private amble: Amble;
  /** On the walk out to the head (or the head itself): the fox walks at his height. */
  high = false;
  private r = rnd(303);
  // the foot
  private stone: THREE.Group;
  private stoneFly: { v: THREE.Vector3; t: number } | null = null;
  private pulley: THREE.Group;
  private wheel: THREE.Vector3;
  /** The way the pull rope goes up the outside of the shell (creature space, from the foot up): beside the climbing rope. */
  private pullGuide: THREE.Vector3[] = [];
  private pullSpans: RopeSpan[] = [];
  private pullRope = new RopeSpan(0.14, '#d8902e');
  private pullLine: RopeSpan[] = [];
  private walkBase: THREE.Vector3;
  private o: THREE.Vector3; private side: THREE.Vector3;
  private pullers = ['ropewright', 'pip', 'moss1', 'miller'];
  private pull = 0;
  // the water
  private mill: number;
  private lostSail: THREE.Group;
  private sailSpot: THREE.Vector3;
  private fitSpot: THREE.Vector3;
  private segs: Seg[] = [];
  private flowLen = 0;
  private flow = -1;
  private waterMat = waterMaterial();
  private gapPieces: THREE.Group[] = [];
  private stack: THREE.Group[] = [];
  private yardSpot: THREE.Vector3;
  private carryPiece: THREE.Group;
  private sluice: { group: THREE.Group; gate: THREE.Group };
  private trickle!: THREE.Mesh;
  private splash!: THREE.InstancedMesh;
  private splashN = 16;
  private splashDir: THREE.Vector4[] = [];
  private splashAt = V();
  // the eyes
  private clumps: { g: THREE.Group; at: THREE.Vector3; fall: { v: THREE.Vector3; w: THREE.Vector3; t: number } | null }[] = [];
  private walk: RidePt[] = [];
  private walkDecks: WalkDeck[] = [];
  private headSolid!: { s: Solid; local: THREE.Matrix4 };
  private ride: WalkDeck | null = null;
  private bramS = 0;
  private bramOut = false;
  private shears: THREE.Group;
  private trimCam: THREE.Vector3 | null = null;
  private trimHold = 0;
  private trimIdx = 0;
  // the big moment
  private shake = 0;
  private cheerT = 0;

  constructor(private g: Game, private idx: number, private tm: TownMove, private story: TownStory) {
    this.town = tm.town; this.amble = tm.amble;
    const r = this.r, T = this.town, A = this.amble;
    // ---- 1. the stone and Tamsin's pulley
    this.stone = stoneProp(r);
    this.stone.rotation.set(0.3, 0.4, -0.5);
    this.stone.scale.setScalar(2.1);
    A.stoneSlot.add(this.stone);
    const front = T.legLines.find(l => l.kind === 'rope' && l.leg[0] === 'F') ?? T.legLines[0];
    this.o = front.out.clone().setY(0).normalize();
    this.side = V(-this.o.z, 0, this.o.x);
    this.walkBase = front.top.clone().addScaledVector(this.o, -1.36); this.walkBase.y = front.top.y - 0.93;
    const pu = pulleyProp(r);
    this.pulley = pu.group;
    this.pulley.position.copy(this.walkBase).addScaledVector(this.o, -0.4).addScaledVector(this.side, 1.7);
    this.pulley.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(this.side, V(0, 1, 0), this.side.clone().cross(V(0, 1, 0)).negate()));
    this.wheel = pu.wheel;
    T.group.add(this.pulley);
    {
      // (straight from the toes to the wheel the rope would run through the bulging shell: it goes up the outside,
      // beside the climbing rope, over a few chafing points on the plates)
      const c = new THREE.CatmullRomCurve3(front.pts);
      const side = V(-front.out.z, 0, front.out.x).normalize();
      for (const t of [0.42, 0.62, 0.8, 0.93]) this.pullGuide.push(c.getPointAt(t).addScaledVector(front.out, 0.35).addScaledVector(side, 0.55));
      if (this.pullGuide[0].y < this.pullGuide[this.pullGuide.length - 1].y === false) this.pullGuide.reverse();
      for (let i = 0; i < this.pullGuide.length; i++) { const s = new RopeSpan(0.14, '#d8902e'); g.scene.add(s.mesh); this.pullSpans.push(s); }
    }
    g.scene.add(this.pullRope.mesh);
    for (let i = 0; i < this.pullers.length + 1; i++) { const s = new RopeSpan(0.09, '#d8902e'); g.scene.add(s.mesh); this.pullLine.push(s); }

    // ---- 2. the sail, the channel, the pieces, the sluice
    this.mill = T.mills.findIndex(m => m.broken);
    const sails = T.sails[this.mill];
    const rot = sails.rotation.y, fwd = V(Math.sin(rot), 0, Math.cos(rot));
    const tower = sails.position.clone().addScaledVector(fwd, -(1.55 + 1.25) * 1.45);
    this.fitSpot = tower.clone().addScaledVector(fwd, (2.3 + 1.3) * 1.45); this.fitSpot.y = groundAt(this.fitSpot.x, this.fitSpot.z);
    this.lostSail = sailArm(r);
    this.lostSail.scale.setScalar(1.45);
    this.sailSpot = story.find(spot(2.6, 0.5), 0, 10, 2.4, spot(2.6, 0.5));
    T.group.add(this.lostSail);
    this.layLostSail();
    this.buildChannel();
    this.yardSpot = story.find(spot(4.48, 0.49), 1.5, 5, 1.0, spot(4.4, 0.5));
    for (let i = 0; i < 3; i++) {
      const pc = pieceProp(2.2, r);
      pc.position.copy(this.yardSpot).add(V(0, 0.04 + i * 0.4, 0));
      pc.rotation.y = 0.5 + i * 0.12;
      T.group.add(pc); this.stack.push(pc);
    }
    this.carryPiece = pieceProp(2.2, r);
    this.carryPiece.visible = false;
    g.player.root.add(this.carryPiece);
    this.carryPiece.position.set(0, 0.85, -0.6); // (local: carried in both arms across the chest, along the facing)
    // the sluice at the rain pools, across the first length of channel
    this.sluice = sluiceProp(r);
    const s0 = this.segs[0];
    const a0 = s0.a.p, b0 = s0.b.p;
    this.sluice.group.position.copy(a0).lerp(b0, 0.3).add(V(0, 0.05, 0));
    this.sluice.group.quaternion.setFromRotationMatrix(along(a0, b0).setPosition(0, 0, 0));
    T.group.add(this.sluice.group);

    // ---- 3. the vines over the eyes, the walk out to the head
    this.buildVines();
    this.buildWalk();
    this.shears = shearsProp();
    this.shears.visible = false;
    g.player.person.arms[1].hand.add(this.shears);

    // ---- the things to do
    const it = g.contents[idx].interactables, me = this, pl = g.player;
    const w = (v: THREE.Vector3) => tm.world(v, V());
    it.push({
      id: 'townStone', world: idx, get pos() { return me.stone.getWorldPosition(V()); }, radius: 4.4,
      label: () => (this.has('town:met-tamsin') && !this.has('town:stone-roped') && !tm.onAmble && !tm.climb && pl.grounded ? TOWN_DO.foot : null),
      act: () => this.g.cut(this.stoneBeats()),
    });
    it.push({
      id: 'townPull', world: idx, get pos() { return w(me.walkBase.clone().addScaledVector(me.o, -0.55).addScaledVector(me.side, 2.1)); }, radius: 2.6, hold: 2.2,
      label: () => (this.has('town:stone-roped') && !this.has('town:foot-done') && tm.onAmble ? TOWN_DO.pull : null),
      act: () => this.g.cut(this.pullBeats()),
    });
    it.push({
      id: 'townSail', world: idx, get pos() { return me.lostSail.getWorldPosition(V()); }, radius: 4.0,
      label: () => (this.has('town:met-miller') && !this.has('town:sail-carry') && !this.has('town:sail-fitted') && !this.has('town:piece-carry') ? TOWN_DO.sail : null),
      act: () => { this.g.give('town:sail-carry'); this.g.sound.sfxPlay('paper'); this.g.save(); },
    });
    it.push({
      id: 'townFitSail', world: idx, get pos() { return w(me.fitSpot); }, radius: 3.6,
      label: () => (this.has('town:sail-carry') ? TOWN_DO.fitSail : null),
      act: () => this.g.cut(this.sailBeats()),
    });
    it.push({
      id: 'townPiece', world: idx, get pos() { return w(me.yardSpot); }, radius: 2.8,
      label: () => (this.has('town:met-miller') && !this.has('town:piece-carry') && !this.has('town:sail-carry') && this.placed() + 0 < 3 && this.stackLeft() > 0 ? TOWN_DO.piece : null),
      act: () => { this.g.give('town:piece-carry'); this.g.sound.sfxPlay('build'); this.g.save(); },
    });
    GAPS.forEach((gi, n) => {
      it.push({
        id: 'townGap' + n, world: idx, get pos() { const s = me.segs[gi]; return w(s.a.p.clone().lerp(s.b.p, 0.5)); }, radius: 2.6,
        label: () => (this.has('town:piece-carry') && !this.has('town:gap-' + n) ? TOWN_DO.setPiece : null),
        act: () => this.g.cut(this.pieceBeats(n)),
      });
    });
    it.push({
      id: 'townSluice', world: idx, get pos() { return w(me.sluice.group.position); }, radius: 2.6,
      label: () => (this.has('town:sail-fitted') && this.placed() === 3 && !this.has('town:water-done') ? TOWN_DO.sluice : null),
      act: () => this.g.cut(this.waterBeats()),
    });
    this.clumps.forEach((c, i) => {
      it.push({
        id: 'townVine' + i, world: idx, get pos() { return c.g.parent ? c.g.parent.localToWorld(c.at.clone()) : V(1e9, 0, 0); }, radius: 4.8, hold: 1.4,
        label: () => (this.has('town:met-bramwyn') && !this.has('town:vine-' + i) && this.high ? TOWN_DO.trim : null),
        act: () => this.trim(i),
      });
    });
  }

  private has(f: string) { return this.g.flags.has(f); }
  private placed() { return GAPS.filter((_, n) => this.has('town:gap-' + n)).length; }
  private stackLeft() { return 3 - this.placed() - (this.has('town:piece-carry') ? 1 : 0); }
  private trimmed() { let n = 0; for (let i = 0; i < 6; i++) if (this.has('town:vine-' + i)) n++; return n; }
  private bone(b: BoneName | 'shell') { return b === 'shell' ? this.town.group : this.amble.rig.bone(b); }
  /** A ride point to world. */
  private rw(q: RidePt, out = V()) {
    if (q.bone === 'shell') return this.tm.world(q.p, out);
    return this.amble.rig.bone(q.bone).localToWorld(out.copy(q.p).sub(REST[BONE[q.bone]]));
  }
  private upAt(p: THREE.Vector3) { return p.clone().sub(this.g.planets[this.idx].center).normalize(); }
  /** Amble's rest frame (root) to world: points and directions. */
  private AV(x: number, y: number, z: number) { return this.amble.root.localToWorld(V(x, y, z)); }
  private AD(x: number, y: number, z: number) { return V(x, y, z).transformDirection(this.amble.root.matrixWorld); }

  // ------------------------------------------------------------------ building

  private layLostSail() {
    // lying in the garden on its back, a little askew, as the storm dropped it (its root end to the mill)
    const s = this.lostSail, at = this.sailSpot;
    s.position.copy(at).add(V(0, 0.3, 0));
    s.rotation.set(-Math.PI / 2 + 0.06, 0.9, 0.12, 'YXZ');
    s.position.addScaledVector(V(Math.sin(0.9), 0, Math.cos(0.9)), -4.2);
  }

  /** The water channel: the rain pools, round the walk, down the neck and along the jaw to the corner of the mouth. */
  private buildChannel() {
    const T = this.town, A = this.amble, r = this.r;
    const front = SHELL.cz + SHELL.azFront - 1.0;
    const shellPts: RidePt[] = T.channelRoute.filter(p => p.z < front).map((p, i) => ({ p: p.clone().add(V(0, i < 6 ? 0.32 : 0, 0)), bone: 'shell' as const }));
    const last = shellPts[shellPts.length - 1].p;
    const sx = Math.sign(last.x) || 1;
    // down the neck, on its upper flank on that side, riding each neck bone in turn
    const nk = A.build.neck;
    const neckPts: RidePt[] = [];
    const bones: BoneName[] = ['neck0', 'neck1', 'neck2', 'neck3'];
    let lastZ = last.z + 1.2;
    for (let i = 0; i < nk.C.length; i++) {
      const C = nk.C[i];
      if (C.z < lastZ || C.z > REST[BONE.neck3].z + 1.6) continue;
      const ang = 1.0 * sx * Math.sign(nk.B[i].x || 1);
      const R = nk.R[i] * 0.97 + 0.22;
      const p = C.clone().addScaledVector(nk.N[i], Math.cos(ang) * R).addScaledVector(nk.B[i], Math.sin(ang) * R * 0.95);
      let bb: BoneName = 'neck0', bd = 1e9;
      for (const b of bones) { const d = Math.abs(REST[BONE[b]].z - C.z); if (d < bd) { bd = d; bb = b; } }
      neckPts.push({ p, bone: bb });
      lastZ = C.z + 1.7;
    }
    // along the side of the head under the eye, down to the corner of the mouth
    const headPts: RidePt[] = [];
    for (const [z, y] of [[-0.7, -0.15], [0.3, -0.55], [1.4, -0.82], [2.4, -0.98], [3.0, mouthY(3.0) + 0.12]] as const) {
      const x = sx * (headSideX(y, z) + 0.2);
      headPts.push({ p: headPoint(x, y, z), bone: 'head' });
    }
    const all = [...shellPts, ...neckPts, ...headPts];
    const kits = new Map<string, Kit>();
    const kitFor = (b: string) => { let k = kits.get(b); if (!k) { k = new Kit(); kits.set(b, k); } return k; };
    let s0 = 0;
    for (let i = 0; i < all.length - 1; i++) {
      const a = all[i], b = all[i + 1];
      // a segment rides the bone of its start (the shell's last one, across the gap to the neck, rides the shell)
      const ride = a.bone;
      const pa = a.p.clone().sub(ride === 'shell' ? V() : REST[BONE[ride as BoneName]]);
      // b in a's frame (at rest the frames agree, so this is just the offset)
      const pb = b.p.clone().sub(ride === 'shell' ? V() : REST[BONE[ride as BoneName]]);
      const len = pa.distanceTo(pb);
      const gap = GAPS.indexOf(i);
      if (gap < 0) trough(kitFor(ride), pa, pb, r, { straps: ride !== 'shell' });
      if (ride === 'shell') trestle(kitFor('shell'), pa, pb.clone().sub(pa).normalize(), groundAt(pa.x, pa.z), r);
      const water = new THREE.Mesh(waterLength(s0, len), this.waterMat);
      water.matrixAutoUpdate = false;
      water.matrix.copy(along(pa, pb)).multiply(new THREE.Matrix4().makeTranslation(0, 0.1, 0)).multiply(new THREE.Matrix4().makeScale(1, 1, len));
      water.userData.base = water.matrix.clone();
      water.userData.len = len;
      water.visible = false; water.frustumCulled = false;
      this.bone(ride).add(water);
      this.segs.push({ a: { p: a.p, bone: ride }, b: { p: b.p, bone: ride }, len, s0, water });
      s0 += len;
      if (gap >= 0) {
        const pc = pieceProp(len, r);
        pc.matrixAutoUpdate = false; pc.matrix.copy(along(pa, pb)); pc.visible = false;
        this.town.group.add(pc); this.gapPieces[gap] = pc;
      }
    }
    this.flowLen = s0;
    for (const [b, k] of kits) {
      const grp = k.build(new THREE.Group(), { outline: true });
      grp.name = 'waterChannel:' + b;
      this.bone(b as BoneName | 'shell').add(grp);
    }
    // the trickle from the spout into the corner of the mouth (riding the head)
    const end = headPts[headPts.length - 1].p.clone().sub(REST[BONE.head]);
    const lip = headPoint(sx * (headSideX(mouthY(3.3), 3.3) - 0.1), mouthY(3.3) - 0.05, 3.3).sub(REST[BONE.head]);
    const tube = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(end, end.clone().lerp(lip, 0.5).add(V(0, 0.25, 0)), lip), 10, 0.09, 6, false);
    this.trickle = new THREE.Mesh(waterTube(tube, s0, end.distanceTo(lip) * 1.15), this.waterMat);
    this.trickle.visible = false; this.trickle.frustumCulled = false;
    A.rig.bone('head').add(this.trickle);
    // the splash at the lip (riding the head too)
    this.splashAt.copy(lip);
    this.splash = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: '#e6f6ff', transparent: true, opacity: 0.85 }), this.splashN);
    this.splash.frustumCulled = false; this.splash.visible = false; this.splash.userData.noOutline = true;
    for (let i = 0; i < this.splashN; i++) {
      const a = (i / this.splashN) * Math.PI * 2;
      this.splashDir.push(new THREE.Vector4(sx * (0.5 + 0.5 * Math.abs(Math.cos(a))), 0.7 + 0.5 * Math.random(), Math.sin(a) * 0.8, Math.random()));
    }
    A.rig.bone('head').add(this.splash);
  }

  /** Six clumps of vine hanging from the antlers' brow tines over the eyes, three to each eye. */
  private buildVines() {
    const head = this.amble.rig.bone('head'), H = REST[BONE.head], r = this.r;
    for (const sd of [1, -1]) for (let c = 0; c < 3; c++) {
      const z0 = 0.55 + c * 0.42;
      const anchors: THREE.Vector3[] = [];
      for (let q = 0; q < 4; q++) {
        const z = z0 + (q - 1.5) * 0.12;
        const s = headSurface(z, sd * (0.62 + 0.08 * c + 0.03 * q));
        anchors.push(V(s.x, s.y + 0.08, z));
      }
      const path = (a: THREE.Vector3, t: number, i: number) => {
        // down the side of the head over the eye, a little out from it, swinging forward at the bottom
        const y = a.y - t * (a.y + 0.35 + 0.15 * (i % 2));
        const x = sd * (headSideX(Math.max(-0.4, y), a.z) + 0.16 + 0.12 * Math.sin(Math.PI * t));
        return headPoint(x, y, a.z + t * 0.12 * (i - 1.5)).sub(H);
      };
      const out = headDir(sd, 0.2, 0.25).normalize();
      const g = vineClump(r, anchors.map(a => a.clone()), (a, t, i) => path(a, t, i), out, 0.36);
      head.add(g);
      const mid = path(anchors[1], 0.15, 1);
      this.clumps.push({ g, at: mid, fall: null });
    }
  }

  /** The plank walk from the lookout's front, up the top of the neck, onto the head between the antlers. */
  private buildWalk() {
    const nk = this.amble.build.neck, r = this.r;
    const N1 = REST[BONE.neck1];
    const look = V(0, N1.y + 5.2, N1.z - 0.8);
    // from the lookout's floor, a short steep stair up over the base of the neck (which rises fast out of the
    // shell), then planks along the neck's top, a little clear of it, always going forward and gently up
    const pts: RidePt[] = [{ p: V(0, look.y - 0.06, look.z - 0.7), bone: 'neck1' }, { p: V(0, look.y + 1.58, look.z + 1.9), bone: 'neck1' }];
    // (each point rides the neck bone it sits over, so where two runs meet they meet on the same point)
    const neckBones: BoneName[] = ['neck1', 'neck2', 'neck3'];
    const headZ = REST[BONE.head].z;
    let y = pts[1].p.y;
    nk.C.forEach((c, i) => {
      if (c.z > headZ - 2.5) return;
      const t = c.clone().addScaledVector(nk.N[i], nk.R[i] * 0.97);
      if (t.z < pts[pts.length - 1].p.z + 1.4) return;
      y = Math.max(y, t.y + 0.4);
      let bone: BoneName = 'neck1';
      for (const b of neckBones) if (REST[BONE[b]].z <= c.z) bone = b;
      pts.push({ p: V(0, y, t.z), bone });
    });
    for (const z of [-0.8, 0.0, 0.75]) {
      const hr = headRing(z);
      const p = headPoint(0, hr.yc + hr.top + 0.28, z);
      p.y = Math.max(p.y, pts[pts.length - 1].p.y - 0.2);
      pts.push({ p, bone: 'head' });
    }
    this.walk = pts;
    const kits = new Map<string, Kit>();
    const kitFor = (b: string) => { let k = kits.get(b); if (!k) { k = new Kit(); kits.set(b, k); } return k; };
    const planet = this.g.planets[this.idx];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const ride = b.bone === 'head' && a.bone === 'head' ? 'head' : a.bone;
      const off = REST[BONE[ride as BoneName]];
      const pa = a.p.clone().sub(off), pb = b.p.clone().sub(off);
      const onHead = ride === 'head';
      const w = onHead ? 2.0 : 1.5;
      if (i === 0) stairRun(kitFor(ride), pa, pb, w, r);
      else plankRun(kitFor(ride), pa, pb, w, r, { startPost: i === 1 ? false : true });
      // the deck: span along the run (local x), across it local z
      const mid = pa.clone().lerp(pb, 0.5);
      const run = Math.hypot(pb.x - pa.x, pb.z - pa.z);
      const rot = Math.atan2(-(pb.z - pa.z), pb.x - pa.x);
      const y0 = pa.y - mid.y, y1 = pb.y - mid.y;
      void rot; void y0; void y1;
      // (placed every frame between its two end points, each carried by its own bone: one run's end is always the
      // next one's start, however the neck bends)
      const wd: WalkDeck = { deck: null as unknown as Deck, i, y0: 0, y1: 0, prev: new THREE.Matrix4(), have: false };
      wd.deck = { obj: new THREE.Object3D(), span: run + 0.25, width: w, top: (x: number) => wd.y0 + (wd.y1 - wd.y0) * (x / wd.deck.span + 0.5) + 0.035 };
      planet.decks.push(wd.deck);
      this.walkDecks.push(wd);
    }
    // a low rail of woven withies across the front of the head platform (nobody walks off the brow)
    const end = pts[pts.length - 1].p.clone().sub(REST[BONE.head]), prevP = pts[pts.length - 2].p.clone().sub(REST[BONE.head]);
    const dir = end.clone().sub(prevP).setY(0).normalize();
    const k = kitFor('head');
    plankRun(k, end.clone().addScaledVector(dir, 0.05).add(V(-0.9, 0, 0)), end.clone().addScaledVector(dir, 0.05).add(V(0.9, 0, 0)), 0.3, r);
    const s: Solid = { obj: new THREE.Object3D(), shape: { kind: 'box', hw: 1.1, hd: 0.2 }, h: 1.4 };
    planet.solids.push(s);
    this.headSolid = { s, local: new THREE.Matrix4().makeRotationY(Math.atan2(dir.x, dir.z)).setPosition(end.clone().addScaledVector(dir, 0.15).add(V(0, -0.3, 0))) };
    for (const [b, kk] of kits) {
      const grp = kk.build(new THREE.Group(), { outline: true });
      grp.name = 'headWalk:' + b;
      this.amble.rig.bone(b as BoneName).add(grp);
    }
  }

  // ------------------------------------------------------------------ the goal line

  goal(): string {
    const h = (f: string) => this.has(f);
    if (!h('town:foot-done')) return h('town:stone-roped') ? TOWN_GOALS.pull : TOWN_GOALS.foot;
    if (!h('town:water-done')) {
      if (!h('town:met-miller')) return TOWN_GOALS.miller;
      if (h('town:sail-carry')) return TOWN_GOALS.fitSail;
      if (h('town:piece-carry')) return TOWN_GOALS.setPiece(this.placed() + 1);
      if (!h('town:sail-fitted')) return TOWN_GOALS.sail;
      if (this.placed() < 3) return TOWN_GOALS.pieces(this.placed() + 1);
      return TOWN_GOALS.sluice;
    }
    if (!h('town:eyes-done')) {
      if (!h('town:met-bramwyn')) return TOWN_GOALS.bramwyn;
      if (!this.high && this.trimmed() === 0) return TOWN_GOALS.head;
      return TOWN_GOALS.trim(Math.min(6, this.trimmed() + 1));
    }
    return TOWN_GOALS.walk;
  }

  guideTarget(): THREE.Vector3 | null {
    const h = (f: string) => this.has(f), w = (v: THREE.Vector3) => this.tm.world(v, V());
    if (!h('town:foot-done')) {
      if (h('town:stone-roped')) return w(this.pulley.position);
      return this.stone.getWorldPosition(V());
    }
    if (!h('town:water-done')) {
      if (!h('town:met-miller')) return this.story.npc('miller').root.position.clone();
      if (h('town:sail-carry')) return w(this.fitSpot);
      if (h('town:piece-carry')) {
        const pl = this.g.player.pos;
        let best: THREE.Vector3 | null = null, bd = 1e9;
        GAPS.forEach((gi, n) => { if (h('town:gap-' + n)) return; const s = this.segs[gi]; const p = w(s.a.p.clone().lerp(s.b.p, 0.5)); const d = p.distanceTo(pl); if (d < bd) { bd = d; best = p; } });
        return best;
      }
      if (!h('town:sail-fitted')) return this.lostSail.getWorldPosition(V());
      if (this.placed() < 3) return w(this.yardSpot);
      return w(this.sluice.group.position);
    }
    if (!h('town:eyes-done')) {
      if (!h('town:met-bramwyn')) return this.story.npc('bramwyn').root.position.clone();
      if (!this.high && this.trimmed() === 0) return this.rw(this.walk[this.walk.length - 2]);
      const i = this.clumps.findIndex((_, n) => !h('town:vine-' + n));
      return i >= 0 ? this.clumps[i].g.parent!.localToWorld(this.clumps[i].at.clone()) : null;
    }
    return null;
  }

  // ------------------------------------------------------------------ each frame

  frame(dt: number) {
    const g = this.g, h = (f: string) => this.has(f), A = this.amble, pl = g.player;
    const P = A.rig.pose;
    // ---- Amble, as the story stands: the hurt foot held up (wincing now and then), the thirsty head hanging
    const t = g.time;
    const wince = Math.max(0, Math.sin(t * 0.83) * Math.sin(t * 0.31 + 1)) ** 6;
    if (g.mode !== 'cut') {
      P.footLift.FL = h('town:foot-done') ? 0 : 0.85 + 0.12 * wince;
      P.headLift = !h('town:foot-done') ? -0.2 - 0.15 * wince : !h('town:water-done') ? -0.6 : h('town:eyes-done') ? 0.2 : 0.1;
      P.pitch = !h('town:foot-done') ? 0.02 : 0;
    }
    // ---- the stone: in the toes, flying out, or lying in the grass where it fell
    if (this.stoneFly) {
      const f = this.stoneFly, p = this.g.planets[this.idx];
      f.t += dt;
      const up = this.upAt(this.stone.position);
      f.v.addScaledVector(up, -9.8 * dt);
      this.stone.position.addScaledVector(f.v, dt);
      this.stone.rotation.x += dt * 6; this.stone.rotation.z += dt * 4;
      const floor = p.surfaceRadius(up);
      if (this.stone.position.distanceTo(p.center) < floor + 0.3) { this.stone.position.copy(p.center).addScaledVector(up, floor + 0.3); this.stoneFly = null; g.sound.sfxPlay('bump'); }
    } else if (h('town:foot-done') && this.stone.parent === A.stoneSlot) {
      // (a save after the stone came out: it lies in the grass in front of the foot)
      const at = this.AV(14.5, 0, 17.5), p = this.g.planets[this.idx];
      g.scene.attach(this.stone);
      p.surfacePoint(at.sub(p.center).normalize(), 0.3, this.stone.position);
    }
    // ---- the rope from the stone up over the pulley and along to the pullers
    const roped = h('town:stone-roped') && !h('town:foot-done') && !this.stoneFly;
    const wheelW = this.pulley.localToWorld(this.wheel.clone());
    if (roped) {
      let a = this.stone.getWorldPosition(V());
      const guide = this.pullGuide.map(q => this.tm.world(q, V())).filter(q => q.distanceTo(a) > 1.5);
      const pts = [...guide, wheelW];
      this.pullRope.set(a, pts[0]);
      this.pullSpans.forEach((s, i) => { if (i + 1 < pts.length) s.set(pts[i], pts[i + 1]); else s.mesh.visible = false; });
      void a; a = pts[0];
    } else { this.pullRope.mesh.visible = false; for (const s of this.pullSpans) s.mesh.visible = false; }
    const showLine = roped && (g.mode === 'cut' || this.pull > 0);
    let prev = wheelW;
    this.pullers.forEach((id, i) => {
      const hand = this.story.npc(id).root.position.clone().addScaledVector(this.upAt(prev), 0.95);
      if (showLine) this.pullLine[i].set(prev, hand); else this.pullLine[i].mesh.visible = false;
      prev = hand;
    });
    this.pullLine[this.pullers.length].mesh.visible = false;
    // ---- the sail: lying in the garden, on his shoulder, or on the mill
    const sails = this.town.sails[this.mill];
    if (h('town:sail-fitted')) {
      if (this.lostSail.parent !== sails) this.fitSail(1);
    } else if (h('town:sail-carry')) {
      if (this.lostSail.parent !== pl.root) {
        pl.root.add(this.lostSail);
        // over his shoulder, the arm's long frame trailing out behind him
        this.lostSail.position.set(0.4, 1.5, -3.4);
        this.lostSail.rotation.set(Math.PI / 2 - 0.2, 0, 0);
        this.lostSail.scale.setScalar(1.45 * 0.999);
      }
    } else if (this.lostSail.parent !== this.town.group) { this.town.group.add(this.lostSail); this.layLostSail(); }
    this.town.mills[this.mill].broken = !h('town:sail-fitted');
    // ---- the channel pieces: in the yard, in his arms, set into the gaps
    const carrying = h('town:piece-carry');
    this.carryPiece.visible = carrying;
    this.carryPiece.rotation.set(0, Math.PI / 2, 0);
    this.carryPiece.position.set(-1.1, 0.95, 0.45);
    const left = this.stackLeft();
    this.stack.forEach((s, i) => (s.visible = i < left));
    GAPS.forEach((_, n) => { if (this.gapPieces[n]) this.gapPieces[n].visible = h('town:gap-' + n); });
    if (carrying || h('town:sail-carry')) { if (g.mode === 'play') pl.pose = { ...pl.pose, touchChest: 1 }; }
    else if (pl.pose.touchChest && g.mode === 'play') { const { touchChest: _t, ...rest } = pl.pose; void _t; pl.pose = rest; }
    // ---- the water: full and running once the sluice is open (the scene runs its front down the channel)
    this.waterMat.uniforms.uT.value += dt;
    const f = h('town:water-done') ? this.flowLen + 1 : this.flow;
    // (each length is whole; the shader shows the water only as far as its front, with a lip of foam there)
    this.waterMat.uniforms.uFront.value = f >= this.flowLen ? 1e9 : f;
    for (const s of this.segs) s.water.visible = f > s.s0 + 0.001;
    this.trickle.visible = f >= this.flowLen && (g.mode === 'cut' || !h('town:water-done'));
    // where it pours into the corner of the mouth: a little splash of drops, over and over
    this.splash.visible = this.trickle.visible;
    if (this.splash.visible) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(), p = V();
      for (let i = 0; i < this.splashN; i++) {
        const d = this.splashDir[i], tt = (g.time * 1.7 + i / this.splashN * 1.0 + d.w) % 1;
        p.copy(this.splashAt).addScaledVector(V(d.x, d.y, d.z), tt * 0.55).add(V(0, -1.4 * tt * tt, 0));
        m.compose(p, q, sc.setScalar(0.045 * (1 - tt) + 0.01));
        this.splash.setMatrixAt(i, m);
      }
      this.splash.instanceMatrix.needsUpdate = true;
    }
    this.sluice.gate.position.y = f >= 0 ? 0.55 : 0;
    // ---- the vines: hanging, falling, or gone
    this.clumps.forEach((c, i) => {
      if (c.fall) {
        c.fall.t += dt;
        c.fall.v.addScaledVector(this.upAt(c.g.position), -6 * dt);
        c.g.position.addScaledVector(c.fall.v, dt);
        c.g.rotateOnAxis(c.fall.w, dt * 1.4);
        const s = Math.max(0.01, 1 - Math.max(0, c.fall.t - 1.6) / 1.2);
        c.g.scale.setScalar(s);
        if (c.fall.t > 2.8) { c.g.visible = false; c.fall = null; }
      } else c.g.visible = !h('town:vine-' + i);
    });
    // ---- the walk out to the head: its decks follow the bones; standing on it, he is carried with them
    this.syncWalk(dt);
    // ---- Old Bramwyn goes up to the lookout, then out along the walk behind him
    this.moveBramwyn(dt);
    // ---- the vines: Bramwyn's shears in his hand up by the head, and while he snips the view swings out to the
    // side of the head (the clump over the eye and Nilo at it, the leaves by the lens melted away)
    this.shears.visible = h('town:met-bramwyn') && !h('town:eyes-done') && (this.high || g.mode === 'cut' && this.trimmed() >= 6);
    // (held a moment after E lets go or a clump comes away, so the view does not jump about between clumps)
    this.trimHold -= dt;
    const holding = g.mode === 'play' && this.high && (g.holdKey.startsWith('townVine') && g.holdT > 0.05 || this.trimHold > 0 && !!this.trimCam);
    if (holding) {
      if (g.holdKey.startsWith('townVine')) this.trimIdx = +g.holdKey.slice(8);
      const c = this.clumps[this.trimIdx];
      if (c && c.g.parent && !c.fall) {
        const head = A.rig.bone('head'), hd = (x: number, y: number, z: number) => headDir(x, y, z).transformDirection(head.matrixWorld);
        const cw = c.g.parent.localToWorld(c.at.clone());
        const sd = Math.sign(cw.clone().sub(head.getWorldPosition(V())).dot(hd(1, 0, 0))) || 1;
        // (over his shoulder from up on the middle of the head: Nilo kneeling at the edge with the shears in his
        // hand, the clump of vine hanging over the eye below him, the meadow far beyond; the antler roots and
        // their brow tines, which hide him from out in front or from the side, stand off to either side)
        const upN = pl.up, outC = cw.clone().sub(pl.pos).projectOnPlane(upN).normalize();
        const rightC = V().crossVectors(outC, upN).normalize();
        const want = pl.pos.clone().addScaledVector(outC, -2.6).addScaledVector(upN, 3.3).addScaledVector(rightC, 1.3 * sd);
        const look = pl.pos.clone().addScaledVector(upN, 0.3).lerp(cw, 0.62);
        void hd;
        if (!this.trimCam) this.trimCam = g.camera.position.distanceTo(want) > 12 ? want.clone() : g.camera.position.clone();
        this.trimHold = 0.35;
        this.trimCam.lerp(want, 1 - Math.exp(-3.5 * dt));
        g.rig.override = { pos: this.trimCam.clone(), look, up: this.upAt(look) };
        this.tm.cutMelt = 2.2;
        pl.pose = { ...pl.pose, kneel: 0.5, lookAt: cw };
        // (turned to the clump, the shears out to it)
        const toC = cw.clone().sub(pl.pos).projectOnPlane(pl.up);
        if (toC.lengthSq() > 0.01) { pl.facing.lerp(toC.normalize(), 1 - Math.exp(-6 * dt)).normalize(); pl.sync(); }
      }
    } else if (this.trimCam) {
      this.trimCam = null; g.rig.override = null; this.tm.cutMelt = 0; g.rig.easeFromHere(0.7);
      if (pl.pose.kneel) { const { kneel: _k, lookAt: _l, ...rest } = pl.pose; void _k; void _l; pl.pose = rest; }
    }
    // ---- Tamsin and the others at the pulley while the stone is roped
    this.placePullers();
    // ---- the big moment's shake, the cheering
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.cheerT > 0) {
      this.cheerT -= dt;
      for (const hm of this.story.homes) { hm.npc.pose = { wave: 1, smile: 1 }; hm.npc.smileT = 0.5; }
      if (this.cheerT <= 0) for (const hm of this.story.homes) hm.npc.pose = {};
    }
  }

  off() {
    this.pullRope.mesh.visible = false;
    for (const l of [...this.pullLine, ...this.pullSpans]) l.mesh.visible = false;
    this.high = false;
  }

  private syncWalk(dt: number) {
    const pl = this.g.player, M = new THREE.Matrix4(), planet = this.g.planets[this.idx];
    // which deck is he standing on (before they move this frame)?
    let on: WalkDeck | null = null;
    if (pl.grounded) for (const wd of this.walkDecks) {
      const u = deckUnder(wd.deck, pl.pos, planet.center);
      if (u && Math.abs(u.lift) < 0.35 && Math.abs(u.z) < wd.deck.width / 2 + 0.05) { on = wd; break; }
    }
    for (const wd of this.walkDecks) {
      {
        const a = this.rw(this.walk[wd.i]), b = this.rw(this.walk[wd.i + 1]);
        const mid = a.clone().lerp(b, 0.5), up = mid.clone().sub(planet.center).normalize();
        const hz = b.clone().sub(a).projectOnPlane(up), run = Math.max(0.05, hz.length());
        const ax = hz.divideScalar(run), az = new THREE.Vector3().crossVectors(ax, up);
        M.makeBasis(ax, up, az).setPosition(mid);
        wd.deck.span = run + 0.25; wd.y0 = a.sub(mid).dot(up); wd.y1 = b.sub(mid).dot(up);
      }
      if (wd === on && wd.have && this.g.mode === 'play') {
        const d = new THREE.Matrix4().copy(wd.prev).invert().premultiply(M);
        pl.pos.applyMatrix4(d); pl.sync();
      }
      M.decompose(wd.deck.obj.position, wd.deck.obj.quaternion, wd.deck.obj.scale);
      wd.prev.copy(M); wd.have = true;
    }
    M.multiplyMatrices(this.amble.rig.bone('head').matrixWorld, this.headSolid.local);
    M.decompose(this.headSolid.s.obj.position, this.headSolid.s.obj.quaternion, this.headSolid.s.obj.scale);
    this.ride = on;
    // "high": on the walk, or anywhere up by the head
    const head = this.rw(this.walk[this.walk.length - 1]);
    this.high = !!on || (pl.pos.distanceTo(head) < 14 && pl.pos.distanceTo(planet.center) > planet.surfaceRadius(this.upAt(pl.pos)) + 12 && !this.tm.onAmble);
    void dt;
  }

  /** Arclength along the walk of the point nearest p (world), and the point at arclength s. */
  private walkAt(s: number) {
    const W = this.walk.map(q => this.rw(q));
    let acc = 0;
    for (let i = 0; i < W.length - 1; i++) {
      const L = W[i].distanceTo(W[i + 1]);
      if (s <= acc + L || i === W.length - 2) { const k = clamp((s - acc) / L); return { p: W[i].clone().lerp(W[i + 1], k), dir: W[i + 1].clone().sub(W[i]).normalize(), seg: i }; }
      acc += L;
    }
    return { p: W[0], dir: V(0, 0, 1), seg: 0 };
  }
  private walkS(p: THREE.Vector3) {
    const W = this.walk.map(q => this.rw(q));
    let acc = 0, best = 0, bd = 1e9;
    for (let i = 0; i < W.length - 1; i++) {
      const a = W[i], b = W[i + 1], ab = b.clone().sub(a), L = ab.length();
      const k = clamp(p.clone().sub(a).dot(ab) / (L * L));
      const d = a.clone().addScaledVector(ab, k).distanceTo(p);
      if (d < bd) { bd = d; best = acc + k * L; }
      acc += L;
    }
    return { s: best, d: bd, total: acc };
  }

  private moveBramwyn(dt: number) {
    const hm = this.story.byId.bramwyn, g = this.g;
    if (this.story.bye?.playing || hm.npc.root.userData.byeHome) return;
    if (!this.has('town:met-bramwyn') || this.has('town:eyes-done') && !this.bramOut) { if (hm.ride) { hm.ride = null; hm.pos.copy(hm.npc.root.userData.home ?? hm.pos); } return; }
    if (!hm.npc.root.userData.home) hm.npc.root.userData.home = hm.pos.clone();
    if (!this.bramOut) {
      // she goes on ahead to the lookout once he has walked off (never in front of him)
      if (g.mode !== 'play' || g.player.pos.distanceTo(hm.npc.root.position) < 10) return;
      this.bramOut = true; this.bramS = 0.6;
    }
    if (g.mode !== 'cut') {
      const ws = this.walkS(g.player.pos);
      // (on the head she keeps a few steps back along the walk while he works at the vines, out of his way)
      const back = this.has('town:met-bramwyn') && this.trimmed() < 6 && ws.s > ws.total - 4 ? 4.2 : 1.7;
      const want = ws.d < 3 ? clamp(ws.s - back, 0.6, ws.total - 0.8) : 0.6;
      const step = clamp(want - this.bramS, -1.3 * dt, 1.3 * dt);
      this.bramS += step;
      hm.npc.speedShown = Math.abs(step) > 1e-3 ? 1.3 : 0;
    }
    const at = this.walkAt(this.bramS);
    const bone = this.walk[Math.min(this.walk.length - 1, at.seg + 1)].bone === 'head' && this.walk[at.seg].bone === 'head' ? 'head' : this.walk[at.seg].bone;
    const ride = this.amble.rig.bone(bone as BoneName);
    hm.ride = ride;
    hm.pos.copy(ride.worldToLocal(at.p.clone()));
    const face = hm.npc.speedShown > 0 ? at.dir : g.player.pos.clone().sub(at.p).normalize();
    const inv = new THREE.Matrix4().copy(ride.matrixWorld).invert();
    hm.face.copy(face).transformDirection(inv);
  }

  private placePullers() {
    const roped = this.has('town:stone-roped') && !this.has('town:foot-done');
    this.pullers.forEach((id, i) => {
      const hm = this.story.byId[id];
      const ud = hm.npc.root.userData;
      if (roped || this.pull > 0) {
        if (!ud.pullHome) ud.pullHome = [hm.pos.clone(), hm.face.clone()];
        const p = this.walkBase.clone().addScaledVector(this.o, -0.55).addScaledVector(this.side, 4.4 + i * 0.95 + this.pull * 0.35 * Math.max(0, Math.sin(this.g.time * 5)));
        hm.pos.copy(p); hm.face.copy(this.side).negate();
      } else if (ud.pullHome) { hm.pos.copy(ud.pullHome[0]); hm.face.copy(ud.pullHome[1]); delete ud.pullHome; }
    });
  }

  // ------------------------------------------------------------------ the scenes

  private fov(v: number) { const c = this.g.camera; if (c.fov !== v) { c.fov = v; c.updateProjectionMatrix(); } }
  private cam(pos: THREE.Vector3, look: THREE.Vector3) {
    const up = this.upAt(look);
    if (this.shake > 0) pos = pos.clone().add(V(Math.sin(this.g.time * 41), Math.sin(this.g.time * 37 + 1), Math.sin(this.g.time * 47 + 2)).multiplyScalar(0.12 * this.shake));
    this.g.cutCam = { pos, look, up };
  }
  private stand(at: THREE.Vector3, face: THREE.Vector3, pose: typeof this.g.player.pose = {}) {
    const pl = this.g.player;
    pl.pos.copy(at); pl.up.copy(this.upAt(at)); pl.facing.copy(face).projectOnPlane(pl.up).normalize();
    pl.vel.set(0, 0, 0); pl.grounded = true; pl.pose = pose; pl.sync();
  }
  private ground(p: THREE.Vector3) { const pl = this.g.planets[this.idx]; return pl.surfacePoint(p.clone().sub(pl.center).normalize()); }
  private foxAt(at: THREE.Vector3, face: THREE.Vector3, gesture: 'sit' | 'dig' | 'wag' | 'trot' = 'sit') {
    const fox = this.g.fox, up = this.upAt(at);
    fox.f.root.visible = true; fox.f.root.position.copy(at); fox.dir.copy(up);
    const f = face.clone().projectOnPlane(up).normalize();
    fox.f.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, f).normalize(), up, f));
    fox.gesture = gesture; fox.t += 1 / 60;
    (fox as unknown as { pose(dt: number): void }).pose(1 / 60);
  }

  /** Down at the foot: the stone, the fox digging, the rope tied on. */
  stoneBeats(): Beat[] {
    const g = this.g, A = this.amble, P = A.rig.pose;
    const st = () => this.stone.getWorldPosition(V());
    const out = () => this.AD(0.36, 0, 0.93);
    const at = () => this.ground(st().addScaledVector(out(), 1.35).addScaledVector(this.AD(1, 0, 0), 1.0));
    return [
      {
        dur: 3.2, line: { text: TOWN_STEP.stone },
        enter: () => { P.footLift.FL = 0.42; g.sound.sfxPlay('soft'); },
        tick: k => {
          const s = st();
          this.stand(at(), s.clone().sub(at()), { lookAt: s } as typeof g.player.pose);
          this.foxAt(this.ground(s.clone().addScaledVector(out(), 1.0).addScaledVector(this.AD(1, 0, 0), 0.9)), s.clone().sub(at()), 'sit');
          this.cam(s.clone().addScaledVector(out(), 3.4 - k * 0.6).addScaledVector(this.AD(1, 0, 0), 1.6).addScaledVector(this.upAt(s), 0.2), s);
        },
      },
      {
        dur: 3.4, line: { text: TOWN_STEP.dig },
        enter: () => g.sound.sfxPlay('paper'),
        tick: k => {
          const s = st();
          this.stand(at(), s.clone().sub(at()), { kneel: 0.6, lookAt: s } as typeof g.player.pose);
          const fp = this.ground(s.clone().addScaledVector(out(), 0.55).addScaledVector(this.AD(1, 0, 0), 0.25));
          this.foxAt(fp, s.clone().sub(fp), 'dig');
          this.cam(s.clone().addScaledVector(out(), 4.5).addScaledVector(this.AD(-1, 0, 0), 2.5).addScaledVector(this.upAt(s), 1.2 + k * 0.2), s.clone().lerp(fp, 0.4));
        },
      },
      {
        dur: 3.4, line: { text: TOWN_STEP.tie },
        enter: () => { g.give('town:stone-roped'); g.sound.sfxPlay('build'); },
        tick: k => {
          const s = st();
          this.stand(at(), s.clone().sub(at()), { touchChest: 1, lookAt: s } as typeof g.player.pose);
          this.foxAt(this.ground(s.clone().addScaledVector(out(), 1.3).addScaledVector(this.AD(1, 0, 0), 1.1)), s.clone().sub(at()), 'wag');
          // up the rope to the walk, where Tamsin is rigging her pulley
          const wheel = this.pulley.localToWorld(this.wheel.clone());
          this.cam(s.clone().addScaledVector(out(), 6 + k * 3).addScaledVector(this.upAt(s), 1.2 + k * 2), s.clone().lerp(wheel, 0.15 + 0.35 * sm(k)));
        },
        exit: () => { P.footLift.FL = 0.85; g.player.pose = {}; g.save(); },
      },
    ];
  }

  /** Up on the walk: all together on the rope; the stone pops out; a long sigh, and the foot comes down. */
  pullBeats(): Beat[] {
    const g = this.g, A = this.amble, P = A.rig.pose, w = (v: THREE.Vector3) => this.tm.world(v, V());
    const niloAt = () => w(this.walkBase.clone().addScaledVector(this.o, -0.55).addScaledVector(this.side, 2.1));
    let pullCam: THREE.Vector3 | null = null;
    return [
      {
        dur: 3.0, line: { who: 'Tamsin', text: TOWN_STEP.heave },
        enter: () => { this.pull = 1; g.sound.sfxPlay('soft'); },
        tick: k => {
          const n = niloAt(), sideW = this.tm.world(this.side.clone().add(this.walkBase), V()).sub(w(this.walkBase)).normalize();
          this.stand(n.clone().addScaledVector(sideW, 0.3 * Math.max(0, Math.sin(g.time * 5))), sideW.clone().negate(), { touchChest: 1, crouch: 0.35 } as typeof g.player.pose);
          for (const id of this.pullers) this.story.npc(id).pose = { touchChest: 1, crouch: 0.4 };
          const mid = w(this.walkBase.clone().addScaledVector(this.side, 3.0));
          const inW = this.tm.world(this.o.clone().negate().add(this.walkBase), V()).sub(w(this.walkBase)).normalize();
          const look = mid.clone().addScaledVector(this.upAt(mid), 0.9).addScaledVector(sideW, -0.8);
          // from out in the meadow air off the front of the shell (nothing of the village between): the rope from
          // the stone in the toes up over Tamsin's pulley on the walk, and everyone in a row along it, hauling
          const wheel = this.pulley.localToWorld(this.wheel.clone()), st = this.stone.getWorldPosition(V());
          // (out in front of the face and off to the left, low: the leg whole, the stone at its toes, the rope
          // straight up to the pulley and the row of pullers along the walk above it)
          // (now: out beside the front left foot, far enough off that the foot sits at the bottom of the frame, the
          // rope rises straight up the middle, and the row of pullers leans back along the walk at the top)
          // (framed so the pulley sits near the top and the stone about three quarters down, over the caption)
          const upR = this.upAt(st);
          const H = Math.max(8, wheel.clone().sub(st).dot(upR));
          const outF = this.AD(0.45, 0, 0.89).projectOnPlane(upR).normalize();
          if (!pullCam) pullCam = st.clone().addScaledVector(outF, H * 1.45).addScaledVector(upR, H * 0.5);
          this.cam(pullCam.clone().addScaledVector(outF, -k * 0.8), st.clone().addScaledVector(upR, H * 0.36).lerp(wheel.clone().addScaledVector(upR, -H * 0.64), 0.5));
          void look;
          void inW;
        },
      },
      {
        dur: 2.6, line: { text: TOWN_STEP.pop },
        enter: () => {
          // out it pops, in an arc off the foot and into the grass
          const s = this.stone.getWorldPosition(V());
          g.scene.attach(this.stone);
          this.stoneFly = { v: this.AD(0.4, 0, 1).multiplyScalar(5.0).addScaledVector(this.upAt(s), 6.5), t: 0 };
          g.sound.sfxPlay('bump'); g.sound.sfxPlay('whoosh');
          this.pull = 0;
          for (const id of this.pullers) this.story.npc(id).pose = { surprise: 1 };
        },
        tick: k => {
          const foot = A.stoneSlot.getWorldPosition(V());
          this.cam(foot.clone().addScaledVector(this.AD(0.5, 0, 1), 9).addScaledVector(this.AD(1, 0, 0), 4).addScaledVector(this.upAt(foot), 1.5 + k), foot.clone().lerp(this.stone.position, 0.5));
        },
      },
      {
        dur: 5.0, line: { text: TOWN_STEP.sigh },
        enter: () => { A.sigh(); g.sound.sfxPlay('rumble'); P.footLift.FL = 0; g.give('town:foot-done'); for (const id of this.pullers) this.story.npc(id).pose = {}; },
        tick: k => {
          P.footLift.FL = 0; P.headLift = -0.2 + 0.15 * Math.sin(Math.PI * k);
          this.shake = k > 0.55 && k < 0.7 ? 0.8 : this.shake;
          const c = this.AV(30, 9, 40), look = this.AV(8, 7 - k * 3, 8);
          this.cam(c.lerp(this.AV(32, 6, 34), sm(k)), look);
        },
        exit: () => { g.sound.sfxPlay('gift'); g.save(); },
      },
    ];
  }

  /** The sail goes up onto the stub, and the old mill turns again. */
  private fitSail(k: number) {
    const sails = this.town.sails[this.mill], m = this.town.mills[this.mill];
    if (this.lostSail.parent !== sails) sails.attach(this.lostSail);
    const ang = (m.lost / 4) * Math.PI * 2 + 0.35;
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, ang));
    if (k >= 1) { this.lostSail.position.set(0, 0, 0); this.lostSail.quaternion.copy(q1); this.lostSail.scale.setScalar(1); return; }
    this.lostSail.position.multiplyScalar(1 - k * 0.25);
    this.lostSail.quaternion.slerp(q1, k * 0.25);
    this.lostSail.scale.lerp(V(1, 1, 1), k * 0.25);
  }
  sailBeats(): Beat[] {
    const g = this.g, w = (v: THREE.Vector3) => this.tm.world(v, V());
    const sails = this.town.sails[this.mill];
    return [
      {
        dur: 3.6, line: { text: TOWN_STEP.sailOn },
        enter: () => { g.flags.delete('town:sail-carry'); g.give('town:sail-fitted'); this.town.mills[this.mill].broken = true; this.fitSail(0); g.sound.sfxPlay('whoosh'); },
        tick: (k) => {
          this.fitSail(k < 0.75 ? k / 0.75 * 0.999 : 1);
          if (k > 0.75) { this.town.mills[this.mill].broken = false; }
          const hub = sails.getWorldPosition(V()), f = w(this.fitSpot);
          const out = f.clone().sub(hub).projectOnPlane(this.upAt(hub)).normalize();
          this.cam(hub.clone().addScaledVector(out, 17).addScaledVector(this.upAt(hub), -3), hub.clone().addScaledVector(this.upAt(hub), -2.5));
          this.stand(f, hub.clone().sub(f), { smile: 1, lookAt: hub } as typeof g.player.pose);
        },
        exit: () => { this.fitSail(1); this.town.mills[this.mill].broken = false; g.sound.sfxPlay('build'); g.player.pose = {}; g.save(); },
      },
    ];
  }

  /** A channel piece set into its gap: it lowers in and clicks. */
  pieceBeats(n: number): Beat[] {
    const g = this.g, s = this.segs[GAPS[n]], w = (v: THREE.Vector3) => this.tm.world(v, V());
    const pc = this.gapPieces[n];
    const base = pc.matrix.clone();
    let cam: THREE.Vector3 | null = null;
    return [{
      dur: 2.0, line: { text: TOWN_STEP.click },
      enter: () => { g.flags.delete('town:piece-carry'); g.give('town:gap-' + n); },
      tick: k => {
        const drop = (1 - sm(clamp(k * 1.6))) * 0.9;
        pc.matrix.copy(new THREE.Matrix4().makeTranslation(0, drop, 0).multiply(base));
        const mid = w(s.a.p.clone().lerp(s.b.p, 0.5));
        const a = w(s.a.p), b = w(s.b.p);
        const across = new THREE.Vector3().crossVectors(this.upAt(mid), b.clone().sub(a)).normalize();
        this.stand(this.ground(mid.clone().addScaledVector(across, 1.1)).addScaledVector(this.upAt(mid), Math.max(0, mid.distanceTo(this.g.planets[this.idx].center) - this.ground(mid).distanceTo(this.g.planets[this.idx].center) - 0.3) * 0), across.clone().negate(), { kneel: 0.5 } as typeof g.player.pose);
        if (k > 0.62 && !pc.userData.clicked) { pc.userData.clicked = true; g.sound.sfxPlay('build'); }
        // (the lanes between the houses are tight here: it stays where his own camera was, and turns to the gap)
        if (!cam) cam = g.camera.position.clone().lerp(mid, 0.15);
        this.cam(cam, mid);
      },
      exit: () => { pc.matrix.copy(base); g.player.pose = {}; g.save(); },
    }];
  }

  /** The sluice opens: the water runs the whole channel (the camera follows it) and Amble drinks. */
  waterBeats(): Beat[] {
    const g = this.g, A = this.amble, P = A.rig.pose;
    const front = (f: number) => {
      const s = this.segs.find(q => f <= q.s0 + q.len) ?? this.segs[this.segs.length - 1];
      return this.rw(s.a).lerp(this.rw(s.b), clamp((f - s.s0) / s.len));
    };
    let camP = V();
    return [
      {
        dur: 1.6,
        enter: () => { this.flow = 0; g.sound.sfxPlay('build'); g.sound.sfxPlay('splash'); },
        tick: k => {
          const s = this.sluice.group.getWorldPosition(V());
          this.sluice.gate.position.y = 0.55 * sm(k);
          camP = s.clone().addScaledVector(this.upAt(s), 3).add(this.AD(0.3, 0, -1).multiplyScalar(4));
          this.cam(camP, s);
        },
      },
      {
        dur: 9.0, line: { text: TOWN_STEP.flow },
        tick: (k, dt) => {
          this.flow = this.flowLen * sm(k) * 0.999;
          P.headLift += (0 - P.headLift) * (1 - Math.exp(-0.5 * dt));
          const fr = front(this.flow), ahead = front(Math.min(this.flowLen, this.flow + 3));
          const up = this.upAt(fr);
          const along_ = ahead.clone().sub(fr).projectOnPlane(up).normalize();
          const sideOut = new THREE.Vector3().crossVectors(up, along_).normalize();
          // follows the front from behind and to the outside, staying well up so the houses do not get in the way
          // (down the neck it goes out beside the flank the channel is strapped to, in the open air, to see the
          // water itself running down the troughs)
          const q = this.amble.root.worldToLocal(fr.clone());
          const outSide = q.z > 21 ? Math.sign(sideOut.clone().transformDirection(new THREE.Matrix4().copy(this.amble.root.matrixWorld).invert()).x * q.x) || 1 : -1;
          // (down the neck: close behind the front and a little out and over it, running with the water, the
          // head and the mouth it is running to ahead)
          const mouth = A.mouth.getWorldPosition(V());
          const want = q.z > 21
            ? fr.clone().addScaledVector(along_, -6.0).addScaledVector(sideOut, outSide * 3.2).addScaledVector(up, 3.2)
            : fr.clone().addScaledVector(along_, -5).addScaledVector(sideOut, -4).addScaledVector(up, 4.5);
          camP.lerp(want, 1 - Math.exp(-2.6 * dt));
          this.tm.cutMelt = q.z > 21 ? 3.2 : 0;
          this.cam(camP.clone(), q.z > 21 ? fr.clone().lerp(mouth, 0.8) : fr.clone().lerp(ahead, 0.5).lerp(mouth, 0.15));
          if (Math.random() < dt * 1.5) g.sound.sfxPlay('splash');
        },
      },
      {
        dur: 5.5, line: { text: TOWN_STEP.drink },
        enter: () => { this.flow = this.flowLen + 0.5; g.sound.sfxPlay('splash'); },
        tick: (k, dt) => {
          // the head dips to the spout, drinks, and lifts a little
          P.headLift += ((k < 0.7 ? -0.05 : 0.15) - P.headLift) * (1 - Math.exp(-1.5 * dt));
          A.gaze = { x: 0, y: 0, blink: k > 0.2 && k < 0.65 ? 1 : 0, lid: 0.5, k: 1 };
          const m = A.mouth.getWorldPosition(V());
          const hs = this.AD(1, 0, 0), hf = this.AD(0, 0, 1);
          this.cam(m.clone().addScaledVector(hs, 9).addScaledVector(hf, 5).addScaledVector(this.upAt(m), 1.5), m.clone().addScaledVector(hf, -2.5));
          if (Math.random() < dt * 0.9) g.sound.sfxPlay('soft');
        },
        exit: () => { A.gaze = null; this.tm.cutMelt = 0; g.give('town:water-done'); A.sigh(); g.sound.sfxPlay('gift'); g.save(); },
      },
    ];
  }

  /** One clump of vine snipped away: Bramwyn's shears, and it drops. */
  private trim(i: number) {
    const c = this.clumps[i], g = this.g;
    g.give('town:vine-' + i);
    g.sound.sfxPlay('paper');
    g.hud.notify(TOWN_STEP.snip);
    // it falls free of the head (into the world, so it does not follow the head)
    g.scene.attach(c.g);
    const out = headDir(i < 3 ? 1 : -1, 0, 0.2).transformDirection(this.amble.rig.bone('head').matrixWorld);
    c.fall = { v: out.multiplyScalar(1.2), w: V(Math.random() - 0.5, 0.2, Math.random() - 0.5).normalize(), t: 0 };
    this.story.npc('bramwyn').smileT = 1.5;
    if (this.trimmed() >= 6) setTimeout(() => { if (g.mode === 'play') g.cut(this.wakeBeats()); }, 1200);
    else g.save();
  }

  /** The big moment. */
  wakeBeats(): Beat[] {
    const g = this.g, A = this.amble, P = A.rig.pose, head = A.rig.bone('head');
    const sd = 1;
    const eye = () => (sd > 0 ? A.eyeL : A.eyeR).getWorldPosition(V());
    const hd = (x: number, y: number, z: number) => headDir(x, y, z).transformDirection(head.matrixWorld);
    // Nilo kneels at the edge of the platform over the eye, looking down into it
    const peer = () => head.localToWorld(headPoint(sd * 0.85, headRing(0.4).yc + headRing(0.4).top + 0.28, 0.4).sub(REST[BONE.head]));
    // then he climbs down onto the brow, right over the eye (on the hide, a little in from its edge)
    const brow = () => { const z = 1.0, x = 1.42; const y = headSurface(z, Math.asin(Math.min(1, (x / headRing(z).w) ** (1 / headRing(z).e)))).y; return head.localToWorld(headPoint(sd * x, y + 0.02, z).sub(REST[BONE.head])); };
    const solveGaze = (target: THREE.Vector3) => {
      const eb = A.rig.bone(sd > 0 ? 'eyeL' : 'eyeR');
      const dl = head.worldToLocal(target.clone()).sub(eb.position).normalize();
      const g0 = headDir(sd, 0.12, 0.42).normalize();
      let best = { x: 0, y: 0 }, bd = -2;
      const e = new THREE.Euler(), q = new THREE.Quaternion();
      for (let ix = -16; ix <= 16; ix++) for (let iy = -16; iy <= 16; iy++) {
        const x = ix * 0.05, y = iy * 0.05;
        e.set(-y, x, 0, 'YXZ'); q.setFromEuler(e);
        const d = g0.clone().applyQuaternion(q).dot(dl);
        if (d > bd) { bd = d; best = { x, y }; }
      }
      return best;
    };
    let look = { x: 0, y: 0 };
    const wide = (k: number) => this.cam(this.AV(-38 + k * 4, 14 - k * 3, 62).lerp(this.AV(-50, 10, 58), sm(k)), this.AV(0, 18 - k * 2, 18));
    return [
      {
        dur: 3.4, line: { text: TOWN_STEP.blink },
        enter: () => { g.sound.sfxPlay('chime'); A.gaze = { x: 0, y: 0, blink: 1, lid: 0.9, k: 1 }; this.tm.cutMelt = 4.5; },
        tick: k => {
          const p = peer();
          this.stand(p, hd(sd, -0.3, 0.6), { kneel: 0.7, lookAt: eye() } as typeof g.player.pose);
          this.foxAt(p.clone().addScaledVector(hd(-sd, 0, 0), 0.8).addScaledVector(hd(0, 0, -1), 0.5), hd(sd, 0, 0.5), 'sit');
          // two slow blinks, the lids lifting a little higher each time, into the sunlight
          const b = k < 0.3 ? 1 - k / 0.3 : k < 0.5 ? (k - 0.3) / 0.2 : k < 0.7 ? 1 - (k - 0.5) / 0.2 : 0;
          A.gaze = { x: 0, y: 0, blink: sm(clamp(b)), lid: 0.22 - 0.12 * k, k: 1 };
          const e = eye();
          this.cam(e.clone().addScaledVector(hd(sd, 0.15, 0.6), 5.5 - k * 1.2), e);
        },
      },
      {
        dur: 4.0, line: { text: TOWN_STEP.look },
        enter: () => {
          // he is down on the brow, standing right over the eye, looking down into it
          this.stand(brow(), hd(sd, -0.2, 0.4), { lookAt: eye() } as typeof g.player.pose);
          look = solveGaze(g.player.pos.clone().addScaledVector(g.player.up, 1.2));
          // (the eye can only roll up so far under its lid: it opens wide instead)
          look.y = Math.min(look.y, 0.32);
          this.tm.cutMelt = 5.0; this.fov(42);
        },
        tick: k => {
          const s = sm(clamp(k * 1.4));
          A.gaze = { x: look.x * s, y: look.y * s, blink: 0, lid: 0.06 - 0.26 * s, k: 1 };
          this.stand(brow(), hd(sd, -0.2, 0.4), { lookAt: eye(), smile: k > 0.55 ? 1 : 0 } as typeof g.player.pose);
          this.foxAt(peer(), hd(sd, 0, 0.5), 'sit');
          const e = eye();
          // close, out in front of the face and to its side, level with the eye: the great wet eye big in the
          // frame, opening and turning up to Nilo, who stands on the brow just over it (the vines near the lens
          // melt away)
          this.cam(e.clone().addScaledVector(hd(sd * 0.85, -0.2, 0.6).normalize(), 4.9 - 0.3 * k), e.clone().addScaledVector(hd(0, 1, 0), 0.78));
        },
        exit: () => { this.fov(58); },
      },
      {
        dur: 3.2, line: { text: TOWN_STEP.rumble },
        enter: () => { g.sound.sfxPlay('rumble'); this.shake = 0.6; this.tm.cutMelt = 0; },
        tick: k => {
          A.gaze = { x: look.x, y: look.y, blink: 0, lid: 0.12, k: 1 - 0.6 * k };
          P.headLift = 0.1 + 0.25 * sm(k);
          const p = peer();
          this.stand(p, hd(sd, -0.3, 0.6), { smile: 1, lookAt: eye() } as typeof g.player.pose);
          this.cam(this.AV(-30, 26, 58), this.AV(0, 24, 34));
        },
      },
      {
        dur: 5.5, line: { text: TOWN_STEP.step },
        enter: () => {
          A.gaze = null; P.walk = 0.32;
          A.birds.scatter(); this.town.millSpeed = 5; this.cheerT = 7;
          g.sound.cheer(1, 3.5); g.sound.sfxPlay('rumble');
        },
        tick: k => {
          // one great step (the front feet lift and plant in turn), the ground shaking as each comes down
          P.walk = k < 0.6 ? 0.32 : 0.32 * (1 - (k - 0.6) / 0.4);
          this.shake = Math.max(this.shake, 0.5 * Math.abs(Math.sin(k * Math.PI * 3)));
          // low in the meadow off its right shoulder: the near front foot lifting and coming down, the head above
          this.cam(this.AV(-27 + k * 2, 4.5 + k, 33), this.AV(-6, 9 + k, 14));
        },
      },
      {
        dur: 5.0,
        enter: () => { g.give('town:eyes-done'); P.walk = 0; },
        tick: k => { P.walk = 0; wide(k); },
        exit: () => {
          this.town.millSpeed = 1.6; P.walk = 0; g.player.pose = {};
          const p = peer(); this.stand(p, hd(0, 0, 1), {});
          g.rig.faceDir(g.player.up, g.player.facing); g.rig.snap();
          g.sound.sfxPlay('power'); g.save();
        },
      },
    ];
  }
}
