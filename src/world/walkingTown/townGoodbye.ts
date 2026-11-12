// World 3, the Walking Town: the goodbye on the beach (section 8 of the brief).
//   - Old Amble has walked down to where the land meets the Sea, and stands on the last rise over the beach.
//   - A cream fade, and the light turns a little more golden (the hour is pinned for the scene, as in World 2's
//     goodbye). Pip, Old Bramwyn and Tamsin have come down onto the sand with Nilo and the fox.
//   - Bramwyn gives a tip; Tamsin gives a coil of her best rope; Pip gives a sprig of Amble's moss in a little
//     glass jar (the keepsake).
//   - Amble lowers its great head, and Nilo touches its nose.
//   - Nilo walks down to the water's edge with Fold and the fox. Amble turns, and walks slowly back across the
//     meadow, the whole village waving from its back.
// Then he is free on the beach: when he chooses, he wades out into the Sea (World 4). Nothing moves him on by itself.
import * as THREE from 'three';
import type { Game } from '../../game';
import type { Beat } from '../../story/sequencer';
import type { TownStory } from './townStory';
import type { TownMove } from './townMove';
import type { AmbleWalker } from './ambleWalk';
import { COAST } from './ambleWalk';
import { townDir } from './meadow';
import { REST, BONE, headPoint } from './ambleRig';
import { headRing, HEAD_Z1 } from './ambleHead';
import { TOWN_BYE } from '../../data/townWords';

const sm = (k: number) => k * k * (3 - 2 * k);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const CREAM = '#fff8ee';

/** A little glass jar with a sprig of moss in it and a cork (one small group, held in a hand). */
export function mossJar() {
  const g = new THREE.Group(); g.name = 'mossJar';
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.13, 14, 1, true), new THREE.MeshPhongMaterial({ color: '#dff2f0', transparent: true, opacity: 0.38, shininess: 120, specular: '#ffffff', side: THREE.DoubleSide, depthWrite: false }));
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.065, 14).rotateX(-Math.PI / 2), glass.material);
  bottom.position.y = -0.064;
  const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 1).scale(1, 0.7, 1), new THREE.MeshToonMaterial({ color: '#6f9a3e' }));
  moss.position.y = -0.03;
  const sprig = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 6), new THREE.MeshToonMaterial({ color: '#8cbf4a' }));
  sprig.position.set(0.012, 0.03, 0);
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.045, 12), new THREE.MeshToonMaterial({ color: '#b98a5a' }));
  cork.position.y = 0.083;
  glass.renderOrder = 3;
  g.add(moss, sprig, glass, bottom, cork);
  g.traverse(o => { o.userData.noOutline = true; });
  return g;
}

/** A coil of Tamsin's best rope. */
function ropeCoil() {
  const g = new THREE.Group(); g.name = 'ropeCoil';
  const mat = new THREE.MeshToonMaterial({ color: '#c9a56e' });
  for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.17 - i * 0.015, 0.035, 6, 18), mat); t.position.z = (i - 1) * 0.05; g.add(t); }
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.02, 5, 10), new THREE.MeshToonMaterial({ color: '#8a6a40' }));
  tie.position.set(0, 0.17, 0); tie.rotation.y = Math.PI / 2; g.add(tie);
  return g;
}

export class TownGoodbye {
  readonly jar = mossJar();
  private coil = ropeCoil();
  /** The world, as a frame to ride: a folk with ride = this stands at a world point. */
  private worldFrame = new THREE.Object3D();
  private golden = false;
  private savedPin: number | null = null;
  playing = false;

  constructor(private g: Game, private idx: number, private tm: TownMove, private story: TownStory, private walker: AmbleWalker) {
    this.jar.visible = false; this.coil.visible = false;
    g.scene.add(this.jar, this.coil);
    tm.keepInSky.add(this.jar); tm.keepInSky.add(this.coil);
  }

  private get p() { return this.g.planets[this.idx]; }
  private dirAt(f: number, l: number) { return townDir(this.p, f, l); }
  private ground(d: THREE.Vector3, lift = 0) { return this.p.surfacePoint(d.clone().normalize(), lift); }
  private upAt(v: THREE.Vector3) { return v.clone().sub(this.p.center).normalize(); }
  /** The tip of Amble's nose (world). */
  nose() {
    const head = this.tm.amble.rig.bone('head');
    return head.localToWorld(headPoint(0, headRing(HEAD_Z1).yc - 0.15, HEAD_Z1 - 0.05).sub(REST[BONE.head]));
  }
  /** The beach and the way out to the Sea, from where Amble stands. */
  private siteC: { B: THREE.Vector3; S: THREE.Vector3; up: THREE.Vector3; toSea: THREE.Vector3; side: THREE.Vector3 } | null = null;
  site() {
    if (this.siteC) return this.siteC;
    const B = this.ground(this.dirAt(...COAST.beach));
    const up = this.upAt(B);
    // toward the Sea: the way Amble faces at the coast
    const toSea = this.dirAt(...COAST.face).sub(this.dirAt(...COAST.stand)).projectOnPlane(up).normalize();
    const side = new THREE.Vector3().crossVectors(up, toSea).normalize();
    // the water's edge: on from the beach until the sand goes under
    const ocean = this.p.cfg.ocean ?? 0;
    let S = B.clone();
    for (let s = 1; s < 30; s += 0.5) {
      const q = this.ground(B.clone().addScaledVector(toSea, s).sub(this.p.center));
      if (q.distanceTo(this.p.center) - this.p.R < ocean + 0.25) break;
      S = q;
    }
    this.siteC = { B, S, up, toSea, side };
    return this.siteC;
  }

  /** The low golden light of the goodbye: the hour pinned low, the sun out over the Sea and off to one side. */
  setGolden(on: boolean) {
    const g = this.g;
    if (on) {
      if (!this.golden) { this.golden = true; this.savedPin = g.day.pin; }
      const { up, toSea, side } = this.site();
      g.day.pin = 0.2;
      g.day.sun.copy(up).multiplyScalar(0.2).addScaledVector(toSea, 0.62).addScaledVector(side, 0.76).normalize();
    } else if (this.golden) {
      this.golden = false; g.day.pin = this.savedPin;
    }
  }

  /** Who stands where on the sand (world), facing a world point. */
  private standAt(id: string, at: THREE.Vector3, look: THREE.Vector3) {
    const h = this.story.byId[id];
    if (!h.npc.root.userData.byeHome) h.npc.root.userData.byeHome = { ride: h.ride ?? null, pos: h.pos.clone(), face: h.face.clone() };
    const up = this.upAt(at);
    h.ride = this.worldFrame; h.pos.copy(at);
    h.face.copy(look.clone().sub(at).projectOnPlane(up).normalize());
    h.npc.place(at, up, h.face);
  }
  /** Back home on the shell. */
  sendHome(id: string) {
    const h = this.story.byId[id], b = h.npc.root.userData.byeHome as { ride: THREE.Object3D | null; pos: THREE.Vector3; face: THREE.Vector3 } | undefined;
    if (!b) return;
    h.ride = b.ride; h.pos.copy(b.pos); h.face.copy(b.face);
    h.npc.root.userData.byeHome = undefined;
    h.npc.pose = {};
  }

  beats(): Beat[] {
    const g = this.g, pl = g.player, fox = g.fox, A = this.tm.amble, P = A.rig.pose;
    let site = this.site();
    // out: from the line Amble's nose comes down on, across to where the friends stand (the head behind them)
    let out = V();
    const setOut = () => { const n = this.ground(this.dirAt(COAST.stand[0], COAST.beach[1])); out = site.B.clone().sub(n).projectOnPlane(site.up).normalize(); };
    setOut();
    const nilo = () => { const { B, toSea } = site; return this.ground(B.clone().addScaledVector(out, -2.5).addScaledVector(toSea, 0.4).sub(this.p.center)); };
    const spot = (s: number, t: number) => this.ground(site.B.clone().addScaledVector(site.side, s).addScaledVector(site.toSea, t).sub(this.p.center));
    const stand = (at: THREE.Vector3, face: THREE.Vector3, pose: typeof pl.pose = {}) => {
      pl.pos.copy(at); pl.up.copy(this.upAt(at)); pl.facing.copy(face).projectOnPlane(pl.up).normalize();
      pl.vel.set(0, 0, 0); pl.grounded = true; pl.pose = pose; pl.sync();
      this.tm.onAmble = false;
    };
    const foxAt = (at: THREE.Vector3, face: THREE.Vector3, gesture: 'sit' | 'wag' | 'trot' = 'sit', dt = 1 / 60) => {
      const up = this.upAt(at);
      fox.f.root.visible = true; fox.f.root.position.copy(at); fox.dir.copy(up);
      const f = face.clone().projectOnPlane(up).normalize();
      fox.f.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, f).normalize(), up, f));
      fox.gesture = gesture; fox.t += dt;
      (fox as unknown as { pose(dt: number): void }).pose(dt);
    };
    const cam = (pos: THREE.Vector3, look: THREE.Vector3) => { g.cutCam = { pos, look, up: this.upAt(look) }; };
    const head = (y = 1.15) => pl.pos.clone().addScaledVector(pl.up, y);
    const npcAt = (id: string) => this.story.npc(id).root.position;
    const folk = ['pip', 'bramwyn', 'ropewright'];
    const hold = (obj: THREE.Object3D, hand: THREE.Object3D) => { hand.add(obj); obj.position.set(0, -0.09, 0.05); obj.rotation.set(0, 0, 0); obj.scale.setScalar(1 / Math.max(1e-3, hand.getWorldScale(V()).x)); obj.visible = true; };
    // two people side by side, from the sea side and a little along the beach (Amble's head beyond them)
    const pair = (other: THREE.Vector3, r: number, k: number) => {
      const mid = pl.pos.clone().lerp(other, 0.5), up = this.upAt(mid);
      const across = other.clone().sub(pl.pos).projectOnPlane(up).normalize();
      // (from out past them, so Amble's great head is behind)
      const side = out.clone().projectOnPlane(across).normalize();
      return { pos: mid.clone().addScaledVector(side, r - k * 0.3).addScaledVector(site.toSea, 0.8).addScaledVector(up, 1.25), look: mid.clone().addScaledVector(up, 1.05) };
    };
    const say = (id: string, who: string, text: string, pose: typeof pl.pose = {}, after?: () => void, r = 3.6): Beat => ({
      line: { who, text },
      enter: () => { const n = this.story.npc(id); n.pose = pose; n.smileT = 4; pl.lookAt = n.root.position.clone().addScaledVector(n.up, 1.3); },
      tick: k => { this.setGolden(true); P.headLift = -1; const c = pair(npcAt(id), r, k); cam(c.pos, c.look); },
      exit: () => { this.story.npc(id).pose = {}; after?.(); },
    });
    const W = TOWN_BYE;
    const beats: Beat[] = [
      { dur: 0.8, tick: k => g.hud.setFade(sm(k), CREAM) },
      // on the sand: Amble on the rise above, the three of them come down with him
      {
        dur: 4.2, line: { text: W.arrive },
        enter: () => {
          g.hud.setFade(1, CREAM, true);
          this.walker.atCoast();
          A.root.updateMatrixWorld(true);
          site = this.site(); setOut();
          this.setGolden(true);
          P.walk = 0; P.headLift = -0.3;
          this.tm.climb = null; this.tm.umbrella.close(true); g.fold.root.visible = true;
          const n = nilo();
          stand(n, site.toSea.clone().negate());
          foxAt(spot(0.9, 0.9), site.toSea.clone().negate());
          this.standAt('pip', spot(1.3, -1.2), n);
          this.standAt('bramwyn', spot(-1.5, -1.0), n);
          this.standAt('ropewright', spot(-0.2, -2.1), n);
          for (const id of folk) this.story.npc(id).lookAt = head(1.2);
        },
        tick: k => {
          this.setGolden(true);
          g.hud.setFade(1 - sm(clamp(k * 2.5)), CREAM);
          P.headLift = -0.3 - 0.4 * sm(k);
          // low on the sand by the water: the little group, and Old Amble whole on the rise beyond, gold in the low sun
          const { B, up, toSea, side } = site;
          void side; cam(B.clone().addScaledVector(toSea, 9 - k * 1.2).addScaledVector(out, 5).addScaledVector(up, 2.4), B.clone().addScaledVector(toSea, -12).addScaledVector(up, 7 + k * 1.5));
        },
      },
      say('bramwyn', 'Old Bramwyn', W.bram1),
      say('bramwyn', 'Old Bramwyn', W.bram2),
      say('ropewright', 'Tamsin', W.tamsin1, { touchChest: 1 }, undefined, 3.8),
      {
        line: { who: 'Tamsin', text: W.tamsin2 },
        enter: () => { const n = this.story.npc('ropewright'); n.pose = { touchChest: 1 }; hold(this.coil, n.person.arms[1].hand); },
        tick: k => {
          this.setGolden(true); P.headLift = -1;
          const c = pair(npcAt('ropewright'), 3.4, k); cam(c.pos, c.look);
          if (k > 0.55 && this.coil.parent !== pl.person.arms[1].hand) { hold(this.coil, pl.person.arms[1].hand); this.story.npc('ropewright').pose = {}; pl.pose = { touchChest: 1 }; }
        },
        exit: () => { g.give('item:rope'); g.sound.sfxPlay('gift'); this.coil.visible = false; this.coil.removeFromParent(); g.scene.add(this.coil); pl.pose = {}; },
      },
      say('pip', 'Pip', W.pip1, {}, undefined, 3.2),
      // the keepsake: a sprig of Amble's moss in a little glass jar
      {
        line: { who: 'Pip', text: W.pip2 },
        enter: () => {
          const n = this.story.npc('pip'); n.pose = { touchChest: 1 }; n.smileT = 6;
          hold(this.jar, n.person.arms[1].hand);
          pl.lookAt = null;
        },
        tick: k => {
          this.setGolden(true); P.headLift = -1;
          const pip = npcAt('pip');
          if (k > 0.5 && this.jar.parent !== pl.person.arms[1].hand) { hold(this.jar, pl.person.arms[1].hand); this.story.npc('pip').pose = {}; pl.pose = { touchChest: 1, smile: 1 }; }
          // close on the two of them and the little jar between, Amble's great head low in the gold beyond
          const mid = pl.pos.clone().lerp(pip, 0.5), up = this.upAt(mid);
          const across = pip.clone().sub(pl.pos).projectOnPlane(up).normalize();
          const o2 = out.clone().projectOnPlane(across).normalize();
          cam(mid.clone().addScaledVector(o2, 2.3 - 0.25 * k).addScaledVector(up, 0.95).addScaledVector(site.toSea, 0.5), mid.clone().addScaledVector(up, 0.95).addScaledVector(o2, -0.4));
        },
        exit: () => { g.give('item:moss-jar'); g.give('friend:pip'); g.sound.sfxPlay('gift'); },
      },
      {
        line: { text: W.kept }, dur: 4,
        enter: () => { pl.pose = { touchChest: 1, smile: 1 }; },
        tick: k => { this.setGolden(true); P.headLift = -1; cam(pl.pos.clone().addScaledVector(site.toSea, 2.6 - k * 0.3).addScaledVector(site.side, 0.9).addScaledVector(pl.up, 1.4), head(1.0)); },
        exit: () => { this.jar.visible = false; this.jar.removeFromParent(); g.scene.add(this.jar); pl.pose = {}; },
      },
      // Amble lowers its head, all the way down to him; he reaches up and touches its nose
      {
        dur: 7, line: { text: W.nose },
        enter: () => { P.headLift = -1; for (const id of folk) this.story.npc(id).lookAt = this.nose(); },
        tick: (k, dt) => {
          this.setGolden(true); P.headLift = -1;
          // (it bows, a little at a time, until its nose is just over his head)
          {
            const nz0 = this.nose(), g0 = this.ground(nz0.clone().sub(this.p.center));
            const hh = nz0.clone().sub(g0).dot(site.up);
            P.pitch = clamp(P.pitch + (hh - 1.95) * 0.04 * dt, 0, 0.16);
          }
          const nz = this.nose(), up = site.up;
          // he steps up under the nose, and reaches
          const under = this.ground(nz.clone().addScaledVector(site.toSea, 0.9).sub(this.p.center));
          const from = nilo();
          const at = from.clone().lerp(under, sm(clamp(k * 2.0)));
          stand(at, nz.clone().sub(at), { holdUp: sm(clamp((k - 0.45) * 3)) * 0.85, smile: 1 });
          pl.lookAt = nz;
          pl.animate(dt, k < 0.48 ? 1.6 : 0, false);
          foxAt(spot(1.1, 0.2), nz.clone().sub(spot(1.1, 0.2)), 'wag', dt);
          A.gaze = { x: 0, y: -0.3, blink: 0, lid: 0.25 + 0.25 * sm(clamp((k - 0.55) * 3)), k: 1 };
          // from the side: the great face low over the sand, and the small boy's hand on its nose
          const c = at.clone().addScaledVector(out, 6.5 - k * 0.6).addScaledVector(site.toSea, 2.6).addScaledVector(up, 2.0);
          cam(c, at.clone().addScaledVector(up, 1.2).lerp(nz, 0.5));
        },
        exit: () => { A.gaze = null; pl.lookAt = null; pl.pose = {}; },
      },
      // and so, down to the water with Fold and the fox; the three go back up the rope to the village
      {
        dur: 5, line: { text: W.shore },
        enter: () => {
          P.headLift = 0.1; P.pitch = 0;
          for (const id of folk) this.sendHome(id);
          for (const h of this.story.homes) { h.npc.pose = { wave: 1 }; h.npc.lookAt = null; }
        },
        tick: (k, dt) => {
          this.setGolden(true);
          const from = this.ground(this.nose().addScaledVector(site.toSea, 0.9).sub(this.p.center));
          const to = this.ground(site.S.clone().addScaledVector(site.toSea, -1.2).sub(this.p.center));
          const at = from.clone().lerp(to, sm(clamp(k * 1.15)));
          stand(at, site.toSea);
          pl.animate(dt, k < 0.85 ? 1.6 : 0, false);
          foxAt(at.clone().addScaledVector(site.side, 0.8).addScaledVector(site.toSea, -0.4), site.toSea, k < 0.85 ? 'trot' : 'sit', dt);
          // from behind, up the beach: Nilo and the fox walking down to the shining Sea
          cam(at.clone().addScaledVector(site.toSea, -5.5).addScaledVector(site.side, 1.6).addScaledVector(site.up, 2.1), at.clone().addScaledVector(site.toSea, 6).addScaledVector(site.up, 0.6));
        },
        exit: () => { this.walker.away(); g.sound.sfxPlay('rumble'); },
      },
      // Old Amble turns and walks slowly back across the meadow, the village waving
      {
        dur: 12, line: { text: W.away },
        enter: () => { g.camera.fov = 45; g.camera.updateProjectionMatrix(); },
        tick: (k, dt) => {
          this.setGolden(true);
          const to = this.ground(site.S.clone().addScaledVector(site.toSea, -1.2).sub(this.p.center));
          stand(to, site.toSea.clone().negate(), { wave: k > 0.15 ? 1 : 0, smile: 1 });
          pl.animate(dt, 0, false);
          foxAt(to.clone().addScaledVector(site.side, 0.8), site.toSea.clone().negate(), 'sit', dt);
          for (const h of this.story.homes) h.npc.pose = { wave: 1 };
          // from the water's edge, low, past Nilo waving: Amble going away up the rise and over the meadow
          const ar = A.root.position;
          cam(to.clone().addScaledVector(site.toSea, 8).addScaledVector(out, 5).addScaledVector(site.up, 3.6), to.clone().lerp(ar, 0.8).addScaledVector(site.up, 11));
        },
        exit: () => {
          g.camera.fov = 58; g.camera.updateProjectionMatrix();
          for (const h of this.story.homes) h.npc.pose = {};
          g.give('town:goodbye');
          pl.pose = {};
          g.rig.faceDir(pl.up, site.toSea); g.rig.snap();
          g.save();
        },
      },
    ];
    return beats;
  }

  /** Into the Sea: under the cream fade, on to World 4. */
  seaBeats(): Beat[] {
    const g = this.g, pl = g.player;
    const site = this.site();
    const from = pl.pos.clone();
    return [
      {
        dur: 2.6, line: { text: TOWN_BYE.wade },
        tick: (k, dt) => {
          this.setGolden(true);
          const at = this.ground(from.clone().lerp(site.S.clone().addScaledVector(site.toSea, 3), sm(k)).sub(this.p.center), -0.2 * k);
          pl.pos.copy(at); pl.up.copy(this.upAt(at)); pl.facing.copy(site.toSea); pl.grounded = true; pl.sync(); pl.animate(dt, 1.4, false);
          g.cutCam = { pos: from.clone().addScaledVector(site.toSea, -4).addScaledVector(site.up, 2), look: at.clone().addScaledVector(site.up, 0.8), up: site.up };
          g.hud.setFade(sm(clamp((k - 0.55) / 0.45)), CREAM);
        },
      },
      {
        dur: 0.6,
        enter: () => {
          g.hud.setFade(1, CREAM, true);
          pl.pose = {};
          g.flags.add('chapter3-complete'); g.give('journal:walking-town');
          this.setGolden(false);
          g.leaveTown();
        },
      },
      { dur: 1.6, tick: k => g.hud.setFade(1 - sm(k), CREAM) },
    ];
  }
}
