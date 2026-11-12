// World 3, the Walking Town: the smaller things round the story.
//   - The postman: he comes on a big white bird that glides in over the meadow and lands on Old Amble's antlers,
//     drops down to Nilo and hands over the keeper's letter (its first line answers what Nilo wrote back from the
//     Sky Isles). Once Amble walks: after a while of riding along, or on the beach after the goodbye.
//   - The swap chain: the bakery window gives a warm loaf, and round the village it goes (a ball of wool, a jar of
//     honey, a trowel, a posy, and a loaf again); the swaps themselves are made from the backpack.
//   - The two hidden sketch spots: one high in the antlers (an easel on the head platform gives it away, and he
//     climbs up into the fork of the left antler), one at the tail end of the shell looking back over the meadow.
//     Both ride Amble, so the seat and the framed shot are worked out every frame from the bones they sit on.
import * as THREE from 'three';
import type { Game } from '../../game';
import type { Beat } from '../../story/sequencer';
import type { CamPose } from '../../systems/skyView';
import type { TownMove } from './townMove';
import type { TownStory } from './townStory';
import { REST, BONE, SHELL, headPoint } from './ambleRig';
import { headRing } from './ambleHead';
import { makePostman, type Postman } from '../postman';
import { toon } from '../props';
import { addOutlines } from '../../render/paint';
import { letterPanel } from '../../story/panels';
import { makeSketch } from '../../systems/sketch';
import { TOWN_LETTER, TOWN_POSTMAN, TOWN_SWAP, TOWN_VIEWPOINTS, TOWN_SKETCH } from '../../data/townLetter';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const sm = (k: number) => { const c = Math.min(1, Math.max(0, k)); return c * c * (3 - 2 * c); };
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// -------------------------------------------------------------------------------------------- the big bird

/** The postman's bird: a great white stork-ish bird, long neck and long legs, black-tipped wings, a red saddle
 * cloth on its back. Local: +z forward, +y up, the feet at y = 0 when standing. About 2.6 m long, 6 m across. */
export interface BigBird { root: THREE.Group; wings: THREE.Group[]; tips: THREE.Group[]; legs: THREE.Group; neck: THREE.Group; saddle: THREE.Object3D }
export function bigBird(): BigBird {
  const root = new THREE.Group(); root.name = 'postBird';
  const white = toon('#f6f2ea'), grey = toon('#d9d4ca'), black = toon('#2e2a2e'), beakC = toon('#e8963a'), red = toon('#c4524a'), gold = toon('#e8c060');
  const body = new THREE.Group(); body.position.y = 1.55; root.add(body);
  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12).scale(0.62, 0.55, 1.15), white); body.add(torso);
  // tail: a fan of long feathers
  for (let i = -2; i <= 2; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 5).rotateX(-Math.PI / 2), i === 0 ? grey : white);
    f.position.set(i * 0.12, 0.08, -1.35); f.rotation.y = i * 0.18; body.add(f);
  }
  // the neck: an S of spheres, and the head with its long beak
  const neck = new THREE.Group(); neck.position.set(0, 0.25, 0.95); body.add(neck);
  const nc = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, 0.45, 0.3), V(0, 0.95, 0.2), V(0, 1.3, 0.45)]);
  neck.add(new THREE.Mesh(new THREE.TubeGeometry(nc, 10, 0.17, 8), white));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 9).scale(0.9, 0.9, 1.2), white); head.position.set(0, 1.36, 0.5); neck.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.85, 8).rotateX(Math.PI / 2), beakC); beak.position.set(0, 1.32, 1.08); neck.add(beak);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), black); e.position.set(s * 0.17, 1.42, 0.62); neck.add(e); }
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6).scale(1, 0.5, 1.2), red); cap.position.set(0, 1.55, 0.48); neck.add(cap);
  // wings: an inner and an outer panel each, the outer with black feather tips, hinged at the shoulder and elbow
  const wings: THREE.Group[] = [], tips: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.45, 0.25, 0.2); body.add(w);
    const inner = new THREE.Shape(); inner.moveTo(0, 0.35); inner.lineTo(1.45, 0.3); inner.lineTo(1.45, -0.75); inner.quadraticCurveTo(0.6, -0.95, 0, -0.55); inner.lineTo(0, 0.35);
    const ig = new THREE.ShapeGeometry(inner).rotateX(-Math.PI / 2);
    if (s < 0) ig.scale(-1, 1, 1);
    const im = new THREE.Mesh(ig, white); (im.material as THREE.Material).side = THREE.DoubleSide; w.add(im);
    const tip = new THREE.Group(); tip.position.set(s * 1.42, 0, 0); w.add(tip);
    const outer = new THREE.Shape(); outer.moveTo(0, 0.3); outer.lineTo(1.25, 0.1); outer.lineTo(1.55, -0.2);
    for (let k = 0; k < 5; k++) { const x = 1.55 - k * 0.3; outer.lineTo(x - 0.1, -0.75 + k * 0.02); outer.lineTo(x - 0.2, -0.5); }
    outer.lineTo(0, -0.75); outer.lineTo(0, 0.3);
    const og = new THREE.ShapeGeometry(outer).rotateX(-Math.PI / 2);
    if (s < 0) og.scale(-1, 1, 1);
    const om = new THREE.Mesh(og, white); (om.material as THREE.Material).side = THREE.DoubleSide; tip.add(om);
    const black2 = new THREE.Shape(); black2.moveTo(0.85, -0.25); black2.lineTo(1.55, -0.2);
    for (let k = 0; k < 5; k++) { const x = 1.55 - k * 0.3; black2.lineTo(x - 0.1, -0.75 + k * 0.02); black2.lineTo(x - 0.2, -0.5); }
    black2.lineTo(0.85, -0.6);
    const bg = new THREE.ShapeGeometry(black2).rotateX(-Math.PI / 2).translate(0, 0.012, 0);
    if (s < 0) bg.scale(-1, 1, 1);
    const bm = new THREE.Mesh(bg, black); (bm.material as THREE.Material).side = THREE.DoubleSide; tip.add(bm);
    wings.push(w); tips.push(tip);
  }
  // legs: long and thin, orange, with three-toed feet
  const legs = new THREE.Group(); root.add(legs);
  for (const s of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 1.2, 5), beakC); l.position.set(s * 0.18, 0.75, 0); legs.add(l);
    for (const a of [-0.5, 0, 0.5]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4).rotateX(Math.PI / 2), beakC); t.position.set(s * 0.18 + Math.sin(a) * 0.13, 0.03, Math.cos(a) * 0.13); t.rotation.y = a; legs.add(t); }
  }
  // the saddle cloth on its back, with a gold edge (the postman sits here)
  const sad = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, 0.55).scale(0.5, 0.6, 0.62), red); sad.position.set(0, -0.02, 0.05); body.add(sad);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 4, 16).rotateX(Math.PI / 2).scale(1, 1, 1.25), gold); edge.position.set(0, 0.45, 0.05); body.add(edge);
  const saddle = new THREE.Object3D(); saddle.position.set(0, 0.55, 0.05); body.add(saddle);
  addOutlines(root, '#2e2230', 0.025);
  return { root, wings, tips, legs, neck, saddle };
}

/** Wing beat: a (-1 down .. 1 up) at the shoulder; fold 0..1 tucks the wings in along the body. */
function wingPose(b: BigBird, a: number, fold: number) {
  b.wings.forEach((w, i) => {
    const s = i === 0 ? -1 : 1;
    w.rotation.set(0, s * 1.25 * fold, s * (a * 0.75 * (1 - fold) + 0.9 * fold));
    b.tips[i].rotation.set(0, -s * 2.4 * fold, s * (a * 0.35 * (1 - fold) - 0.15 * fold));
  });
}

// ------------------------------------------------------------------------------------------------ extras

export class TownExtras {
  readonly bird = bigBird();
  readonly pm: Postman;
  private walkT = 0;
  playing = false;
  private easels: { g: THREE.Group; bone: THREE.Object3D; local: THREE.Vector3 }[] = [];

  constructor(private g: Game, private idx: number, private tm: TownMove, private story: TownStory) {
    this.pm = makePostman();
    this.pm.umbrella.visible = false;
    this.bird.saddle.add(this.pm.root);
    this.pm.root.position.set(0, 0, -0.05);
    this.bird.root.visible = false;
    g.scene.add(this.bird.root);
    tm.keepInSky.add(this.bird.root);
    this.perchLocal = this._perchLocal(); this.forkLocal = this._forkLocal(); this.tailLocal = this._tailLocal(); this.platLocal = this._platLocal();
    this.buildEasels();
    this.register();
  }

  private get p() { return this.g.planets[this.idx]; }
  private has(f: string) { return this.g.flags.has(f); }
  private upAt(v: THREE.Vector3) { return v.clone().sub(this.p.center).normalize(); }
  private get head() { return this.tm.amble.rig.bone('head'); }
  private get shellBone() { return this.tm.amble.rig.bone('shell'); }

  // ---------------------------------------------------------------------------- the perch and the seats

  /** The bird's perch: the highest upward tip of the left antler (head-local), and the antler fork Nilo sits in. */
  private perchLocal!: ReturnType<TownExtras['_perchLocal']>;
  private _perchLocal() {
    const tips = this.tm.amble.build.antlerTips.filter(t => t.up && t.p.x > 0).sort((a, b) => b.p.y - a.p.y);
    const t = tips[Math.min(2, tips.length - 1)]?.p ?? V(4, 33, 30);
    return t.clone().sub(REST[BONE.head]).add(V(0, 0.08, 0));
  }
  private forkLocal!: ReturnType<TownExtras['_forkLocal']>;
  private _forkLocal() {
    const beam = this.tm.amble.build.antlerBranches[0].pts;
    const q = beam[3].clone();
    return q.sub(REST[BONE.head]).add(V(0, 0.62, 0));
  }
  /** The tail-end seat: on the walk at the very back of the shell, by the railing (creature space, shell bone). */
  private tailLocal!: ReturnType<TownExtras['_tailLocal']>;
  private _tailLocal() {
    const ring = this.tm.town.ring;
    let best = 0, bd = 9;
    ring.ths.forEach((t, i) => { const d = Math.abs(Math.atan2(Math.sin(t + Math.PI / 2), Math.cos(t + Math.PI / 2))); if (d < bd) { bd = d; best = i; } });
    const seat = ring.P(best, 0.78), easel = ring.P(best + 1, 0.55);
    return { seat, easel, out: ring.outs[best].clone().setY(0).normalize() };
  }
  /** The head platform, where the antler spot's easel stands (head-local). */
  private platLocal!: ReturnType<TownExtras['_platLocal']>;
  private _platLocal() {
    const z = -0.4, hr = headRing(z);
    return headPoint(0.75, hr.yc + hr.top + 0.3, z).sub(REST[BONE.head]);
  }

  private buildEasels() {
    const add = (bone: THREE.Object3D, local: THREE.Vector3, yaw: number) => {
      const e = easel(); e.position.copy(local); e.rotation.y = yaw; bone.add(e);
      this.easels.push({ g: e, bone, local });
    };
    add(this.head, this.platLocal.clone().add(V(0, -0.02, 0)), Math.PI * 0.75);
    const tl = this.tailLocal;
    add(this.shellBone, tl.easel.clone().sub(REST[BONE.shell]).add(V(0, 0.02, 0)), Math.atan2(tl.out.x, tl.out.z) + Math.PI);
  }

  /** A sketch spot in world space now: where he sits, which way he looks, the framed shot, where he stands after. */
  private view(i: number) {
    const A = this.tm.amble;
    if (i === 0) {
      const head = this.head;
      const seat = head.localToWorld(this.forkLocal.clone());
      const up = this.upAt(seat);
      // looking back along the neck at the village on its back
      const shell = A.rig.bone('shell').localToWorld(V(0, SHELL.yTop - 2, SHELL.cz).sub(REST[BONE.shell]));
      const dir = shell.clone().sub(seat).projectOnPlane(up).normalize();
      const right = V().crossVectors(dir, up).normalize();
      const shot: CamPose = {
        pos: seat.clone().addScaledVector(dir, -1.2).addScaledVector(up, 6.5).addScaledVector(right, -0.6),
        look: seat.clone().addScaledVector(dir, 30).addScaledVector(up, -9).addScaledVector(right, 2),
        up,
      };
      const back = head.localToWorld(this.platLocal.clone().add(V(-0.5, 0.05, 0.4)));
      return { seat, up, dir, shot, back };
    }
    const tl = this.tailLocal, sb = this.shellBone;
    const seat = sb.localToWorld(tl.seat.clone().sub(REST[BONE.shell]).add(V(0, 0.02, 0)));
    const up = this.upAt(seat);
    const dir = tl.out.clone().transformDirection(sb.matrixWorld).projectOnPlane(up).normalize();
    const right = V().crossVectors(dir, up).normalize();
    const shot: CamPose = {
      pos: seat.clone().addScaledVector(dir, -5.5).addScaledVector(up, 3.4).addScaledVector(right, 3.2),
      look: seat.clone().addScaledVector(dir, 40).addScaledVector(up, -9).addScaledVector(right, -9),
      up,
    };
    const back = sb.localToWorld(tl.easel.clone().sub(REST[BONE.shell]).addScaledVector(tl.out, -0.9).add(V(0, 0.05, 0)));
    return { seat, up, dir, shot, back };
  }

  private register() {
    const g = this.g, me = this, world = this.idx;
    const add = g.contents[this.idx].interactables;
    TOWN_VIEWPOINTS.forEach((vp, i) => add.push({
      id: vp.id, world, get pos() { return me.easels[i].g.getWorldPosition(V()); }, radius: 2.6,
      label: () => (g.mode !== 'play' || me.playing || !me.has('town:arrived') || (i === 0 && !me.has('town:eyes-done')) ? null : g.sketches.some(s => s.id === vp.id) ? TOWN_SKETCH.again : i === 0 ? TOWN_SKETCH.climbUp : TOWN_SKETCH.prompt),
      act: () => { me.playing = true; g.cut(me.sketchBeats(i), () => { me.playing = false; }); },
    }));
    // the bakery window: a warm loaf, to start the swaps round the village
    const bakery = this.tm.town.houses.find(h => h.name === 'the bakery');
    if (bakery) add.push({
      id: 'townBakery', world, get pos() { return me.tm.world(bakery.door, V()); }, radius: 3.2,
      label: () => (me.has('town:arrived') && !me.has('town:loaf') && g.mode === 'play' ? TOWN_SWAP.prompt : null),
      act: () => { g.flags.add('town:loaf'); g.hud.notify(TOWN_SWAP.got); g.give('item:loaf'); g.save(); },
    });
  }

  // ------------------------------------------------------------------------------------------- each frame

  frame(dt: number) {
    const g = this.g, h = (f: string) => this.has(f);
    // the postman: once Amble walks, after a while of riding along; or on the beach after the goodbye
    const walking = this.story.walker.mode !== 'stand' && this.story.walker.mode !== 'atCoast';
    if (walking && this.tm.onAmble && g.mode === 'play') this.walkT += dt;
    if (h('town:eyes-done') && !h('letter:3') && !this.playing && g.mode === 'play' && !g.seq.running && !this.story.bye.playing && g.player.grounded
      && ((this.walkT > 30 && this.tm.onAmble) || h('town:goodbye') && !h('chapter3-complete'))) {
      this.playing = true;
      g.cut(this.postBeats(), () => { this.playing = false; });
    }
  }

  // ---------------------------------------------------------------------------------------------- scenes

  /** The postman on his big white bird: in over the meadow, onto the antlers, down to Nilo, the letter, away. */
  postBeats(): Beat[] {
    const g = this.g, pl = g.player, b = this.bird, pm = this.pm, A = this.tm.amble;
    const ans = TOWN_LETTER.answers, sent = g.sent[ans.to] ?? '';
    const panel = letterPanel([ans.by[sent] ?? ans.by[''], ...TOWN_LETTER.lines], TOWN_LETTER.sign);
    const perch = () => this.head.localToWorld(this.perchLocal.clone());
    // where Amble's head looks and its side (world), for the approach and the first shot
    const aFwd = () => V(0, 0, 1).transformDirection(A.root.matrixWorld);
    const aSide = () => V(1, 0, 0).transformDirection(A.root.matrixWorld);
    // Nilo's spot by the bird, kept in the village's frame while he is on Amble (it walks on), else in the world
    const onA = this.tm.onAmble;
    const inv = new THREE.Matrix4();
    const keep = (w: THREE.Vector3) => onA ? w.clone().applyMatrix4(inv.copy(this.tm.town.group.matrixWorld).invert()) : w.clone();
    const back = (q: THREE.Vector3) => onA ? this.tm.world(q, V()) : q.clone();
    let landL = V(), niloL = V(), start = V(), ctrl = V(), from = V(), away = V(), camL = V();
    // a camera spot clear of the houses, found once at a beat's start and kept in the village's frame
    const clearCam = (look: THREE.Vector3, dist: number, h: number, prefer: THREE.Vector3) => { camL = keep(this.story.clearView(look, this.upAt(look), dist, h, prefer)); };
    let t = 0;
    const flap = (dt: number, rate: number, amp: number, fold = 0) => { t += dt * rate; wingPose(b, Math.sin(t) * amp, fold); };
    const pose = (pos: THREE.Vector3, fwd: THREE.Vector3, bank = 0, pitch = 0) => {
      const up = this.upAt(pos);
      b.root.position.copy(pos);
      const f = fwd.clone().projectOnPlane(up); if (f.lengthSq() < 1e-6) f.copy(aFwd()); f.normalize();
      b.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V().crossVectors(up, f).normalize(), up, f));
      b.root.rotateZ(bank); b.root.rotateX(-pitch);
    };
    const anim = (dt: number, o: Record<string, unknown> = {}) => pm.person.animate(dt, { speed: 0, grounded: true, sit: 0.6, ...o });
    const bez = (a: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, k: number) => a.clone().multiplyScalar((1 - k) * (1 - k)).addScaledVector(c, 2 * k * (1 - k)).addScaledVector(d, k * k);
    const dBez = (a: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, k: number) => c.clone().sub(a).multiplyScalar(2 * (1 - k)).addScaledVector(d.clone().sub(c), 2 * k);
    const cam = (pos: THREE.Vector3, look: THREE.Vector3) => { g.cutCam = { pos, look, up: this.upAt(look) }; };
    return [
      {
        // in over the meadow, wide wings, and down onto the antlers
        dur: 7, line: { text: TOWN_POSTMAN.arrive },
        enter: () => {
          const pc = perch(), up = this.upAt(pc);
          start = pc.clone().addScaledVector(aFwd(), 70).addScaledVector(aSide(), -55).addScaledVector(up, 26);
          ctrl = pc.clone().addScaledVector(aFwd(), 18).addScaledVector(aSide(), -14).addScaledVector(up, 9);
          b.root.visible = true; pm.letter.visible = false; t = 0;
          g.sound.sfxPlay('whoosh');
          const nilo = pl.pos.clone(); niloL = keep(nilo);
          pl.lookAt = pc;
        },
        tick: (k, dt) => {
          const pc = perch(), up = this.upAt(pc);
          const s = sm(k / 0.82);
          const pos = k < 0.82 ? bez(start, ctrl, pc, s) : pc;
          const v = k < 0.82 ? dBez(start, ctrl, pc, Math.max(0.02, s)) : aFwd();
          pose(pos, v, k < 0.6 ? Math.sin(k * 6) * 0.2 : 0, k > 0.7 && k < 0.85 ? -0.35 : 0);
          // (flapping, then a long glide, then the wings thrown up to land and folded)
          if (k < 0.45) flap(dt, 5.5, 1); else if (k < 0.78) flap(dt, 1.5, 0.25); else if (k < 0.86) flap(dt, 9, 0.9); else flap(dt, 2, 0.05, sm((k - 0.86) / 0.14));
          b.legs.visible = k > 0.65;
          anim(dt, { wave: k > 0.88 ? 1 : 0 });
          pl.lookAt = b.root.position.clone();
          // from beside the head, a little below the antlers: the bird coming in over the meadow and landing
          const head = this.head.getWorldPosition(V());
          cam(head.clone().addScaledVector(aSide(), -15).addScaledVector(aFwd(), 7).addScaledVector(up, 1.5), pos.clone().lerp(pc, 0.55).addScaledVector(up, 0.5));
        },
      },
      {
        // off the antlers and down to Nilo
        dur: 4.2, line: { text: TOWN_POSTMAN.down },
        enter: () => {
          const nilo = back(niloL); const up = this.upAt(nilo);
          const toN = nilo.clone().sub(perch()).projectOnPlane(up).normalize();
          const right = V().crossVectors(up, toN).normalize();
          landL = keep(nilo.clone().addScaledVector(toN, 0.6).addScaledVector(right, 2.2));
          from = perch(); t = 0;
          clearCam(nilo.clone().addScaledVector(up, 1.0), 4.8, 1.8, toN.clone().multiplyScalar(-1).addScaledVector(right, -0.4));
          g.sound.sfxPlay('whoosh');
        },
        tick: (k, dt) => {
          const land = back(landL), up = this.upAt(land);
          const top = from.clone().lerp(land, 0.5).addScaledVector(up, 6);
          const s = sm(k / 0.85), pos = k < 0.85 ? bez(from, top, land, s) : land;
          const dir = land.clone().sub(from).projectOnPlane(up);
          pose(pos, k < 0.85 ? dBez(from, top, land, Math.max(0.02, s)) : dir, 0, k > 0.7 && k < 0.9 ? -0.4 : 0);
          if (k < 0.15) flap(dt, 6, 0.9); else if (k < 0.7) flap(dt, 1.2, 0.2); else if (k < 0.88) flap(dt, 10, 0.9); else flap(dt, 2, 0.05, sm((k - 0.88) / 0.12));
          b.legs.visible = true;
          anim(dt);
          const nilo = back(niloL);
          const toB = pos.clone().sub(nilo).projectOnPlane(up).normalize();
          pl.facing.lerp(toB, 0.1).projectOnPlane(pl.up).normalize(); pl.lookAt = pos.clone(); pl.sync();
          cam(back(camL), nilo.clone().lerp(pos, 0.6).addScaledVector(up, 1.0));
        },
      },
      {
        line: { who: 'The postman', text: TOWN_POSTMAN.hand }, dur: 4.6,
        enter: () => {
          pm.letter.visible = true; g.sound.sfxPlay('paper');
          const land = back(landL), up = this.upAt(land), nilo = back(niloL);
          const toN = nilo.clone().sub(land).projectOnPlane(up).normalize(), across = V().crossVectors(up, toN).normalize();
          clearCam(nilo.clone().lerp(land, 0.5).addScaledVector(up, 1.25), 4.2, 3.6, across.clone().addScaledVector(toN, 0.25));
        },
        tick: (k, dt) => {
          const land = back(landL), up = this.upAt(land), nilo = back(niloL);
          const toN = nilo.clone().sub(land).projectOnPlane(up).normalize();
          pose(land, toN.clone().applyAxisAngle(up, 0.5));
          flap(dt, 2, 0.03, 1);
          anim(dt, { sit: 0.3, wave: sm(k * 3) * (1 - sm((k - 0.6) * 3)) });
          pl.lookAt = pm.person.head.getWorldPosition(V());
          cam(back(camL), nilo.clone().lerp(land, 0.5).addScaledVector(up, 0.9));
        },
        exit: () => { pm.letter.visible = false; },
      },
      { dur: 1.2, tick: k => g.hud.setFade(sm(k) * 0.9, '#2a2436') },
      {
        dur: 11,
        enter: () => g.hud.showPanel(panel, '', 0),
        tick: k => {
          const a = sm(k / 0.08) * (1 - sm((k - 0.93) / 0.07));
          // (the panel has its own dark ground: lift the dusk off the letter while it is up, so it reads clearly)
          g.hud.showPanel(panel, '', a); g.hud.setFade(0.9 * (1 - a), '#2a2436', true);
        },
        exit: () => { g.hud.showPanel(null); g.give('letter:3'); g.hud.notify(TOWN_POSTMAN.got); },
      },
      {
        line: { text: TOWN_POSTMAN.after }, dur: 5,
        enter: () => {
          pl.pose = { touchChest: 1 }; t = 0;
          const land = back(landL), up = this.upAt(land);
          away = land.clone().addScaledVector(aSide(), 60).addScaledVector(aFwd(), -30).addScaledVector(up, 30);
          const nilo = back(niloL);
          clearCam(nilo.clone().addScaledVector(up, 1.4), 5, 1.6, away.clone().sub(nilo).projectOnPlane(up).multiplyScalar(-1));
          g.sound.sfxPlay('whoosh');
        },
        tick: (k, dt) => {
          g.hud.setFade((1 - sm(k / 0.3)) * 0.9, '#2a2436');
          const land = back(landL), up = this.upAt(land);
          const s = sm(clamp((k - 0.15) / 0.85));
          const ctl = land.clone().lerp(away, 0.3).addScaledVector(up, 3);
          const pos = bez(land, ctl, away, s);
          pose(pos, dBez(land, ctl, away, Math.max(0.02, s)), Math.sin(k * 5) * 0.15, s > 0 ? 0.25 : 0);
          if (k < 0.15) flap(dt, 2, 0.05, 1 - sm(k / 0.15)); else flap(dt, 6, 1);
          b.legs.visible = k < 0.5;
          anim(dt, { wave: 1 });
          cam(back(camL).addScaledVector(up, k * 1.5), pos);
          pl.lookAt = pos.clone();
        },
        exit: () => { b.root.visible = false; pl.pose = {}; pl.lookAt = null; g.save(); },
      },
    ];
  }

  /** Sit at a hidden easel: he sits, the camera glides to a composed view, the sketch draws itself, back again. */
  sketchBeats(i: number): Beat[] {
    const g = this.g, pl = g.player, vp = TOWN_VIEWPOINTS[i];
    let sk: ReturnType<typeof makeSketch> | null = null;
    let sheet: HTMLElement | null = null;
    let from: CamPose | null = null;
    const already = g.sketches.some(s => s.id === vp.id);
    const ease = (k: number) => k * k * k * (k * (k * 6 - 15) + 10);
    const sit = () => {
      const v = this.view(i);
      pl.pos.copy(v.seat); pl.up.copy(v.up); pl.facing.copy(v.dir); pl.vel.set(0, 0, 0); pl.grounded = true;
      pl.pose = { sit: 1 }; pl.sync();
      return v;
    };
    const foxWas = g.fox.f.root.visible;
    return [
      {
        dur: 2.6,
        enter: () => {
          const cp = g.camera.position.clone();
          from = { pos: cp, look: cp.clone().add(g.camera.getWorldDirection(V()).multiplyScalar(12)), up: g.camera.up.clone() };
          g.hud.setGoal(null);
          this.easels[i].g.visible = false;
          g.fold.root.visible = false;
          if (i === 0) g.hud.setFade(1, '#fff8ee');
        },
        tick: k => {
          const v = sit(), e = ease(clamp(k));
          // (up into the antlers he climbs under a quick fade)
          if (i === 0) g.hud.setFade(k < 0.5 ? 1 : 1 - sm((k - 0.5) * 2), '#fff8ee');
          const f = i === 0 ? v.shot : null;
          g.cutCam = f ?? { pos: from!.pos.clone().lerp(v.shot.pos, e), look: from!.look.clone().lerp(v.shot.look, e), up: from!.up.clone().lerp(v.up, e).normalize() };
        },
      },
      {
        dur: 7.5, line: { text: vp.label },
        enter: () => {
          const v = sit();
          g.cutCam = v.shot;
          g.camera.position.copy(v.shot.pos); g.camera.up.copy(v.shot.up); g.camera.lookAt(v.shot.look);
          g.composer.render();
          const c = g.renderer.domElement;
          sk = makeSketch(c, c.width, c.height);
          sheet = document.createElement('div'); sheet.className = 'sketchview';
          sheet.append(sk.canvas);
          document.getElementById('ui')!.append(sheet);
          g.sound.sfxPlay('paper');
        },
        tick: k => { const v = sit(); g.cutCam = v.shot; sk?.draw(Math.min(1, k * 1.25)); },
        exit: () => {
          if (sk && !already) {
            g.sketches.push({ id: vp.id, label: vp.label, img: sk.jpeg() });
            const n = g.sketches.filter(s => s.id.startsWith('vp-town-')).length;
            g.hud.notify(TOWN_SKETCH.found(n, TOWN_VIEWPOINTS.length));
          }
          sheet?.remove(); sheet = null;
        },
      },
      {
        // he gets up (and climbs back down to the platform), and the camera comes back behind him
        dur: 1.4,
        enter: () => {
          const v = this.view(i);
          pl.pose = {};
          if (i === 0) { pl.pos.copy(v.back); pl.up.copy(this.upAt(v.back)); pl.vel.set(0, 0, 0); pl.sync(); g.hud.setFade(1, '#fff8ee', true); }
          this.easels[i].g.visible = true;
          g.fold.root.visible = true; g.fox.f.root.visible = foxWas;
          g.rig.faceDir(pl.up, pl.facing); g.rig.snap(); g.cutCam = null; g.rig.override = null; g.rig.easeFromHere(1.4);
          g.save();
        },
        tick: k => { if (i === 0) g.hud.setFade(1 - sm(k * 1.6), '#fff8ee'); },
      },
    ];
  }

  off() { this.bird.root.visible = false; }
}

/** A little easel with a blank page (as in the other worlds), for a hidden sketch spot. */
function easel(): THREE.Group {
  const e = new THREE.Group();
  const legM = toon('#7a5a34');
  for (const [x, z, r] of [[-0.25, 0.1, 0.18], [0.25, 0.1, -0.18], [0, -0.25, 0]] as const) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.3, 5), legM); l.position.set(x, 0.62, z); l.rotation.z = r; l.rotation.x = z < 0 ? -0.25 : 0.12; e.add(l); }
  const page = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.46, 0.03), toon('#f4ead2')); page.position.set(0, 1.05, 0.12); page.rotation.x = -0.18; e.add(page);
  addOutlines(e, '#2e2230', 0.015);
  return e;
}

