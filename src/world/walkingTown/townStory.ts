// World 3, the Walking Town: the people and the story so far.
//   - The arrival: the sky jump (section 5 of the brief). High over the meadow the sky whale from World 2 levels
//     out; Nilo, the fox beside him, looks down through a gap in the clouds at Amble far below, grins, scoops up
//     the fox and jumps; Fold opens into the paper umbrella; they fall through the clouds as the whale sings and
//     swims away, drift down past the circling birds and the windmill sails, and land softly in the moss in the
//     middle of the village. Then the wow shot: the camera pulls back to the whole of Amble standing still in
//     the golden meadow (picture 1). About 30 seconds, no controls; Esc skips it after the first time.
//   - Then Pip runs out to meet the stranger who fell from the sky, the Mossfolk come out of their houses to
//     stare, and Pip tells Nilo that Amble hasn't moved in weeks. That sets the task (three steps, the foot first).
//   - The Mossfolk: Pip, Old Bramwyn, the Miller, Tamsin the Ropewright and six others, standing about the village
//     in creature space (they ride the shell), with their lines in data/townScripts.ts.
//   - The goal line, the golden beam over the next place to go, and the fox walking on the shell beside Nilo.
import * as THREE from 'three';
import type { Game } from '../../game';
import type { Beat } from '../../story/sequencer';
import type { TownMove } from './townMove';
import type { Mossrest } from './mossrest';
import { groundAt, spot } from './mossrest';
import { shellPolar } from './ambleShell';
import { SHELL } from './ambleRig';
import { Npc } from '../../systems/npc';
import { SCRIPTS } from '../../data/scripts';
import { CHAPTERS } from '../../data/story';
import { SkyWhale } from '../skyIsles/whale';
import { MOSSFOLK, folkLook } from './mossfolk';
import { TOWN_GOALS, TOWN_LINES, TOWN_ROUTE } from '../../data/townWords';
import { TownTasks } from './townTasks';
import { FarValley } from './farValley';
import { TownGoodbye } from './townGoodbye';
import { TownExtras } from './townExtras';
import type { AmbleWalker } from './ambleWalk';
import { TOWN_MOVE } from '../../data/townWords';

/** Where Pip stands once Amble walks: up on the lookout at the front of the neck (the neck's riding frame). */
const PIP_LOOKOUT = new THREE.Vector3(0.8, 5.28, -0.2);

const sm = (k: number) => k * k * (3 - 2 * k);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const V = () => new THREE.Vector3();

/** Where someone stands: in the village's frame (creature space), or riding another frame of Amble's (the neck, the
 * head), in that frame's own coordinates. */
export interface Home { npc: Npc; pos: THREE.Vector3; face: THREE.Vector3; ride?: THREE.Object3D | null }

export class TownStory {
  active = false;
  private town: Mossrest;
  readonly homes: Home[] = [];
  readonly byId: Record<string, Home> = {};
  /** The three steps (the stone, the water, the vines). */
  tasks!: TownTasks;
  readonly root = new THREE.Group();
  private beam: THREE.Mesh;
  private whale: SkyWhale;
  private clouds: THREE.InstancedMesh;
  /** The painted distance behind the wow shot's long lens. */
  private far: FarValley;
  /** Creature space: where Nilo lands (open moss on the crown), and where Pip comes from. */
  readonly landing: THREE.Vector3;
  private arriving = false;
  private folkOut = 1;
  readonly walker: AmbleWalker;
  /** The goodbye on the beach. */
  readonly bye: TownGoodbye;
  /** The postman on his bird, the swaps, the hidden sketch spots. */
  readonly extras: TownExtras;

  constructor(private g: Game, private idx: number, private tm: TownMove) {
    this.town = tm.town;
    this.root.name = 'townFolk';
    g.scene.add(this.root);
    const T = this.town, find = this.find.bind(this);
    // the landing: open moss as near the middle of the village as there is
    this.landing = find(new THREE.Vector3(0, 0, SHELL.cz), 0.5, 9, 2.2, spot(0, 0.2));
    // the named Mossfolk
    const front = T.legLines.find(l => l.kind === 'rope' && l.leg[0] === 'F') ?? T.legLines[0];
    // (on the walk by the rope's beam: the rope's top hangs a little under a metre over the planks)
    const tamsinAt = front.top.clone().addScaledVector(front.out.clone().setY(0).normalize(), -2.0); tamsinAt.y = front.top.y - 0.93;
    const mill = spot(-1.2, 0.3);
    const homes: [string, THREE.Vector3, THREE.Vector3 | null][] = [
      ['pip', find(this.landing, 6, 10, 1.2, spot(1, 0.3)), null],
      ['ropewright', tamsinAt, front.out.clone().setY(0).normalize()],
      ['miller', find(mill, 4.5, 8, 1.0, spot(-1.0, 0.45)), null],
      ['bramwyn', find(spot(1.2, 0.3), 0, 6, 1.0, spot(1.2, 0.2)), null],
    ];
    // six more, out on their doorsteps (the houses nearest the landing)
    // (the lived-in houses' doorsteps, on the walks; the carpenter in the yard; anyone left over on the square)
    const doors = T.houses.filter(h => h.walkIn).map(h => ({ h, d: Math.hypot(h.door.x - this.landing.x, h.door.z - this.landing.z) })).sort((a, b) => a.d - b.d).slice(0, 5);
    doors.forEach(({ h }, i) => {
      const out = new THREE.Vector3(Math.sin(h.rot), 0, Math.cos(h.rot));
      const p = h.door.clone().addScaledVector(out, 1.3);
      const y = T.walkTop(p.x, p.z, h.door.y);
      if (y !== null) p.y = y;
      homes.push(['moss' + (i + 1), p, out]);
    });
    for (let i = doors.length; i < 6; i++) {
      const yard = T.yardAt.clone().add(new THREE.Vector3(0, 0, 0));
      homes.push(['moss' + (i + 1), i === 5 ? yard.addScaledVector(T.ring.outs[T.ring.near(0.3)], -0.9) : find(this.landing, 3, 8, 1.2, spot(i, 0.2)), null]);
    }
    for (const [id, pos, face] of homes) {
      const look = id in MOSSFOLK ? MOSSFOLK[id as keyof typeof MOSSFOLK] : folkLook(Number(id.slice(4)));
      const n = new Npc(id, look, SCRIPTS[id].start);
      // only the bigger pieces cast shadows (buttons, flowers and fingers would only cost draw calls)
      n.root.updateMatrixWorld(true);
      n.root.traverse(m => {
        const me = m as THREE.Mesh; if (!me.isMesh) return;
        me.geometry.computeBoundingSphere();
        me.castShadow = (me.geometry.boundingSphere?.radius ?? 0) * me.getWorldScale(V()).x > 0.14;
      });
      this.root.add(n.root);
      g.contents[idx].npcs.push(n);
      const f = face ?? this.landing.clone().sub(pos).setY(0).normalize();
      const h: Home = { npc: n, pos: pos.clone(), face: f.lengthSq() > 0 ? f : new THREE.Vector3(0, 0, 1) };
      this.homes.push(h); this.byId[id] = h;
    }
    this.sync(true);
    // the golden beam over the next place to go (as in World 1 and the Sky Isles)
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 140, 16, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; uniform float uT, uA; void main(){ float v = vUv.y; float a = pow(1.0 - v, 2.2) * (0.55 + 0.45 * sin(v * 40.0 - uT * 3.0)) * (0.6 + 0.4 * abs(sin(vUv.x * 6.283 * 3.0))); gl_FragColor = vec4(1.0, 0.82, 0.45, a * uA); }',
    }));
    this.beam.frustumCulled = false; this.beam.renderOrder = 5; this.beam.visible = false;
    this.root.add(this.beam);
    // the sky whale of World 2, exactly as it carried Nilo down (the same build), and a deck of cloud to fall through
    this.whale = new SkyWhale({ length: 26, seed: 31, birds: 5, detail: 'high', flock: 7 });
    this.whale.swim = 0.5; this.whale.root.visible = false;
    g.scene.add(this.whale.root);
    this.clouds = this.cloudDeck();
    g.scene.add(this.clouds);
    this.far = new FarValley();
    g.scene.add(this.far.root);
    tm.keepInSky.add(this.whale.root); tm.keepInSky.add(this.clouds); tm.keepInSky.add(this.root); tm.keepInSky.add(this.far.root);
    this.tasks = new TownTasks(g, idx, tm, this);
    this.walker = g.contents[idx].refs.walker as AmbleWalker;
    this.bye = new TownGoodbye(g, idx, tm, this, this.walker);
    this.extras = new TownExtras(g, idx, tm, this);
    // after the goodbye: wade out into the Sea, when he chooses (never on by itself)
    const me = this;
    g.contents[idx].interactables.push({
      id: 'townSea', world: idx, get pos() { return me.bye.site().S; }, radius: 4.5,
      label: () => (this.has('town:goodbye') && !this.has('chapter3-complete') && g.mode === 'play' ? TOWN_MOVE.sea : null),
      act: () => g.cut(this.bye.seaBeats()),
    });
  }

  /**
   * Open ground on the crown's paved square (the only shell ground anyone walks on) between r0 and r1 from `near`
   * with `clear` metres free all round (creature space); a little closer in or less clear if there is no such room.
   */
  find(near: THREE.Vector3, r0: number, r1: number, clear: number, fallback: THREE.Vector3) {
    const free = (x: number, z: number, r: number) => (this.town as unknown as { free(x: number, z: number, r: number): boolean }).free(x, z, r);
    for (const [cl, grow] of [[clear, 0], [clear * 0.6, 4], [0.4, 10]]) {
      let best: THREE.Vector3 | null = null, bd = 1e9;
      for (let a = 0; a < Math.PI * 2; a += 0.21) for (let r = Math.max(0, r0 - grow); r <= r1 + grow; r += 0.6) {
        const x = near.x + Math.cos(a) * r, z = near.z + Math.sin(a) * r;
        if (shellPolar(x, z).rho > 0.8 || !this.town.onPlaza(x, z, 0.6) || !free(x, z, cl)) continue;
        const d = Math.abs(r - (r0 + r1) / 2);
        if (d < bd) { bd = d; best = new THREE.Vector3(x, groundAt(x, z), z); }
      }
      if (best) return best;
    }
    return fallback;
  }
  private has(f: string) { return this.g.flags.has(f); }
  private w(v: THREE.Vector3, out = V()) { return this.tm.world(v, out); }
  private wDir(v: THREE.Vector3) { return v.clone().transformDirection(this.town.group.matrixWorld); }
  npc(id: string) { return this.byId[id].npc; }
  /**
   * A camera spot about `dist` from `look` (world) and `height` above it that no wall, roof or tree of the village
   * stands in front of: the clearest of sixteen ways round, nearest to `prefer`; pulled in if every way is blocked.
   */
  clearView(look: THREE.Vector3, up: THREE.Vector3, dist: number, height: number, prefer?: THREE.Vector3) {
    const e1 = (prefer ? prefer.clone() : new THREE.Vector3(1, 0, 0)).projectOnPlane(up);
    if (e1.lengthSq() < 1e-6) e1.set(0, 0, 1).projectOnPlane(up);
    e1.normalize();
    const e2 = new THREE.Vector3().crossVectors(up, e1);
    const ray = new THREE.Raycaster(), hits: THREE.Intersection[] = [];
    let best = look.clone().addScaledVector(up, height), bs = -1e9;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const to = e1.clone().multiplyScalar(Math.cos(a) * dist).addScaledVector(e2, Math.sin(a) * dist).addScaledVector(up, height);
      const L = to.length(); to.divideScalar(L);
      ray.set(look, to); ray.far = L; hits.length = 0;
      ray.intersectObject(this.town.group, true, hits);
      const hit = hits.find(h => (h.object as THREE.Mesh).isMesh && h.object.visible);
      const clear = hit ? hit.distance - 0.5 : L;
      const score = clear / L - (clear < L ? 0.5 : 0) + 0.15 * Math.cos(a);
      if (score > bs) { bs = score; best = look.clone().addScaledVector(to, Math.max(1.5, Math.min(L, clear))); }
    }
    return best;
  }
  /** The shell's top under a creature-space point. */
  groundY(x: number, z: number) { return groundAt(x, z); }

  /** Everyone stands where they live on the shell (it carries them as it moves). */
  private sync(force = false) {
    const p = this.g.planets[this.idx];
    for (const h of this.homes) {
      const n = h.npc;
      const at = h.ride ? h.ride.localToWorld(h.pos.clone()) : this.w(h.pos);
      const fw = h.ride ? h.face.clone().transformDirection(h.ride.matrixWorld) : this.wDir(h.face);
      const up = at.clone().sub(p.center).normalize();
      if (force) n.place(at, up, fw);
      else { n.root.position.copy(at); n.up.copy(up); n.homeForward.copy(fw); n.homePos.copy(at); }
    }
  }

  // ------------------------------------------------------------------ the goal line

  /** Which of the three steps (the foot, the water, the eyes) Nilo is on, 1..3 (0 before the task, 4 after). */
  step() { return !this.has('town:quest') ? 0 : !this.has('town:foot-done') ? 1 : !this.has('town:water-done') ? 2 : !this.has('town:eyes-done') ? 3 : 4; }

  goal(): string | null {
    const g = this.goalBase(), hint = this.tm.routeHint;
    return g && hint && this.g.mode === 'play' ? `${g} ${TOWN_ROUTE[hint]}` : g;
  }
  private goalBase(): string | null {
    if (!this.has('town:arrived')) return null;
    if (!this.has('town:quest')) return TOWN_GOALS.pip;
    if (this.step() === 1 && !this.has('town:met-tamsin')) return TOWN_GOALS.tamsin;
    if (this.step() === 4) return this.has('town:goodbye') ? TOWN_GOALS.sea : this.has('town:coast') ? TOWN_GOALS.toCoast : TOWN_GOALS.walk;
    return this.tasks.goal();
  }
  /** The three steps: ● for each done and the one in hand, ○ for those still ahead. */
  meter() { const s = this.step(); return s >= 1 && s <= 3 ? `Amble  ${'●'.repeat(s)}${'○'.repeat(3 - s)}` : ''; }

  guideTarget(): THREE.Vector3 | null {
    if (!this.has('town:arrived')) return null;
    if (!this.has('town:quest')) return this.npc('pip').root.position.clone();
    if (this.step() === 1 && !this.has('town:met-tamsin')) return this.npc('ropewright').root.position.clone();
    if (this.step() === 4) return this.has('town:goodbye') ? this.bye.site().S : this.has('town:coast') ? null : this.npc('pip').root.position.clone();
    return this.tasks.guideTarget();
  }

  /** For the map: Old Amble (and Mossrest on its back) where it is right now, and the coast it walks down to. */
  mapMarks() {
    const A = this.tm.amble.root.position.clone();
    const marks: { name: string; dir: THREE.Vector3; icon: 'amble' | 'shore'; big?: boolean }[] = [{ name: 'Old Amble and Mossrest, now', dir: A, icon: 'amble', big: true }];
    if (this.has('town:eyes-done')) marks.push({ name: 'The Sea', dir: this.bye.site().S.clone(), icon: 'shore' });
    return marks;
  }
  /** For the compass: Old Amble, when Nilo is off its back (down on the meadow or the beach). */
  compassMark(): THREE.Vector3 | null {
    if (this.tm.onAmble || this.tm.climb || this.tasks.high || !this.has('town:arrived')) return null;
    return this.tm.amble.root.position.clone();
  }

  // ------------------------------------------------------------------ each frame in World 3

  frame(dt: number) {
    const g = this.g, pl = g.player;
    this.active = true;
    this.skyPuffs(true);
    this.walking();
    this.sync();
    // the fox walks on the shell with him (at his height when he is on Amble, else on the meadow)
    g.fox.ground = (d, out) => {
      if (!this.tm.onAmble && !this.tm.climb && !this.tasks.high) return false;
      const p = g.planets[this.idx];
      out.copy(p.center).addScaledVector(d, pl.pos.distanceTo(p.center) - 0.02);
      return true;
    };
    // Esc skips the sky jump, once it has been seen
    if (this.arriving && g.seq.running && this.has('town:jump-seen') && g.input.hit('Escape')) {
      for (let i = 0; i < 400 && g.seq.running; i++) g.seq.update(1e4, true);
    }
    // the folk come out of their doors once he has landed
    this.folkOut = this.has('town:arrived') || !this.arriving ? 1 : 0;
    for (const id of ['pip', 'bramwyn', 'miller', 'ropewright']) this.npc(id).root.visible = true;
    for (let i = 1; i <= 6; i++) this.npc('moss' + i).root.visible = this.folkOut > 0 || this.has('town:arrived');
    // nobody is drawn from far off (a body is ninety-odd little pieces, and at sixty metres a few pixels)
    const cam = g.camera.position;
    const far = this.bye.playing ? 120 : 60;
    for (const h of this.homes) if (h.npc.root.visible && h.npc.root.position.distanceToSquared(cam) > far * far) h.npc.root.visible = false;
    // the beam
    // (along the walks: over the next stair, the neck walk or the rope down, not straight through the houses)
    const target = g.mode === 'play' ? this.tm.routeTo(this.guideTarget(), dt) : null;
    const u = (this.beam.material as THREE.ShaderMaterial).uniforms;
    u.uT.value += dt;
    const near = target ? target.distanceTo(pl.pos) : 0, d0 = this.tm.routeHint ? 3.5 : 9;
    const want = target && near > d0 ? clamp((near - d0) / 8) * 0.85 : 0;
    u.uA.value += (want - u.uA.value) * (1 - Math.exp(-3 * dt));
    this.beam.visible = u.uA.value > 0.01;
    if (target) {
      const up = target.clone().sub(g.planets[this.idx].center).normalize();
      this.beam.position.copy(target).addScaledVector(up, 68);
      this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    }
    this.tasks.frame(dt);
    this.extras.frame(dt);
    // never arrived (a save from before the scene, or the stream ride in): the scene plays now
    if (!this.has('town:arrived') && !this.arriving && g.mode === 'play' && !g.seq.running) this.play();
  }

  /**
   * Old Amble walking: its slow loop once its eyes are clear; down to the coast once Pip asks it to; the goodbye
   * when it gets there; and after, back to the loop. Pip waits up on the lookout at the front of the neck.
   */
  private walking() {
    const g = this.g, W = this.walker, h = (f: string) => this.has(f);
    const free = g.mode === 'play' || g.mode === 'talk';
    if (free && !this.bye.playing) {
      if (h('town:eyes-done') && !h('town:coast') && W.mode === 'stand') W.startLoop(0);
      if (h('town:coast') && !h('town:goodbye')) { if (W.mode === 'stand') W.atCoast(); else if (W.mode === 'loop') W.toCoast(); }
      if (h('town:goodbye') && W.mode === 'stand') W.startLoop(W.loop.nearest(-8, -6));
    }
    // Pip, up on the lookout (riding the neck), from the moment Amble walks
    const pip = this.byId.pip;
    if (h('town:eyes-done') && !this.bye.playing && !pip.npc.root.userData.byeHome) {
      if (pip.ride !== this.tm.amble.neckRide) { pip.ride = this.tm.amble.neckRide; pip.pos.copy(PIP_LOOKOUT); pip.face.set(0, 0, 1); }
      // (asked again every time, until Amble is sent off to the coast)
      if (!h('town:coast') && g.mode === 'play') delete g.sigs.pip;
    }
    // there: the goodbye on the beach
    if (W.mode === 'atCoast' && h('town:coast') && !h('town:goodbye') && g.mode === 'play' && !g.seq.running && !this.bye.playing) {
      this.bye.playing = true;
      g.cut(this.bye.beats(), () => { this.bye.playing = false; });
    }
    // the golden hour holds on the beach after the goodbye, until he goes
    this.bye.setGolden(this.bye.playing || h('town:goodbye') && !h('chapter3-complete'));
  }

  /** What a save keeps of World 3 beyond the flags: Nilo on Amble's back (creature space), Amble on its loop. */
  saveState() {
    const pl = this.g.player, q = pl.pos.clone().applyMatrix4(this.town.group.matrixWorld.clone().invert());
    return { on: this.tm.onAmble || !!this.tm.climb || this.tasks.high, local: [q.x, q.y + 0.05, q.z] as [number, number, number], s: this.walker.s, mode: this.walker.mode };
  }
  /** Continue: Amble back where it was (on its loop, at the coast), and Nilo on its back, or on the beach. */
  restore(t?: { on: boolean; local: [number, number, number]; s: number; mode: string }) {
    const g = this.g, pl = g.player, W = this.walker, p = g.planets[this.idx];
    if (!this.has('town:arrived')) return;
    const A = this.tm.amble.root;
    if (this.has('town:goodbye')) {
      // after the goodbye: on the sand by the water, Amble gone back to its loop
      W.resume(W.loop.nearest(-8, -6));
      const { S, toSea } = this.bye.site();
      this.tm.placed = true; this.tm.onAmble = false;
      pl.placeAt(p, S.clone().addScaledVector(toSea, -2.5).sub(p.center).normalize());
      pl.facing.copy(toSea).projectOnPlane(pl.up).normalize(); pl.sync();
      return;
    }
    if (this.has('town:coast')) W.atCoast();
    else if (this.has('town:eyes-done')) W.resume(t && t.mode === 'loop' ? t.s : 0);
    A.updateMatrixWorld(true);
    if (!t) return;
    this.tm.placed = true;
    if (t.on) {
      const at = this.w(new THREE.Vector3(...t.local));
      pl.pos.copy(at); pl.up.copy(at).sub(p.center).normalize(); pl.vel.set(0, 0, 0);
      pl.facing.projectOnPlane(pl.up).normalize(); pl.sync();
      this.tm.onAmble = true;
    }
  }

  /** Leaving World 3: the fox goes back to the ground she knows. */
  /** While Nilo is in this world, the shared sky's hard round puffs near it are put away (this world has its own
   * soft painted cumulus); they come back as they were when he leaves. */
  private hidSky: { i: number; m: THREE.Matrix4 }[] | null = null;
  private skyPuffs(hide: boolean) {
    const cl = this.g.sky.clouds;
    if (hide && !this.hidSky) {
      const c = this.g.planets[this.idx].center, M = new THREE.Matrix4(), P = new THREE.Vector3(), Z = new THREE.Matrix4().makeScale(0, 0, 0);
      this.hidSky = [];
      for (let i = 0; i < cl.count; i++) {
        cl.getMatrixAt(i, M); P.setFromMatrixPosition(M);
        if (Math.abs(P.y - c.y) < 260 && Math.hypot(P.x - c.x, P.z - c.z) < 700) { this.hidSky.push({ i, m: M.clone() }); cl.setMatrixAt(i, Z); }
      }
      cl.instanceMatrix.needsUpdate = true;
    } else if (!hide && this.hidSky) {
      for (const h of this.hidSky) cl.setMatrixAt(h.i, h.m);
      cl.instanceMatrix.needsUpdate = true; this.hidSky = null;
    }
  }
  off() { this.skyPuffs(false); if (this.active) { this.active = false; this.g.fox.ground = null; this.beam.visible = false; this.tasks.off(); this.extras.off(); this.bye.setGolden(false); } }

  // ------------------------------------------------------------------ the sky jump

  /** A deck of soft cloud over the meadow with a gap above the village (one instanced mesh). */
  private cloudDeck() {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    // mostly their own soft white light, so the low gold sun only warms them a little (never sandy)
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#e2e6f0', emissiveIntensity: 0.72 });
    const N = 170, m = new THREE.InstancedMesh(geo, mat, N);
    m.name = 'arrivalClouds'; m.visible = false; m.frustumCulled = false; m.userData.noOutline = true;
    return m;
  }
  private layClouds(Lw: THREE.Vector3, up: THREE.Vector3, D: THREE.Vector3, S: THREE.Vector3) {
    let s = 97; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up), sc = V(), p = V();
    let i = 0;
    // banks round a gap: clumps of three to six puffs, wide and flat
    while (i < this.clouds.count) {
      const a = r() * Math.PI * 2, rr = 22 + Math.pow(r(), 0.7) * 120, h = 44 + r() * 16;
      const c = Lw.clone().addScaledVector(up, h).addScaledVector(D, Math.cos(a) * rr).addScaledVector(S, Math.sin(a) * rr);
      const n = 3 + Math.floor(r() * 4);
      for (let j = 0; j < n && i < this.clouds.count; j++, i++) {
        const big = 5 + r() * 9;
        p.copy(c).addScaledVector(D, (r() - 0.5) * big * 1.8).addScaledVector(S, (r() - 0.5) * big * 1.8).addScaledVector(up, (r() - 0.3) * big * 0.5);
        M.compose(p, q, sc.set(big * 1.3, big * 0.62, big * 1.3));
        this.clouds.setMatrixAt(i, M);
      }
    }
    // and a few puffs right by the way down, so the fall goes through cloud
    for (let j = 0; j < 6; j++) {
      p.copy(Lw).addScaledVector(up, 47 + j * 2.2).addScaledVector(S, 9 + j * 1.5 - (j % 2) * 16).addScaledVector(D, -6 + j * 2);
      M.compose(p, q, sc.set(6, 3.2, 6)); this.clouds.setMatrixAt(j, M);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  /** From World 2's goodbye: Nilo is already on the whale's back high over the meadow; the scene follows on. */
  arm() {
    this.tm.placed = true;
    this.g.nextCut = { beats: this.beats() };
    this.arriving = true;
  }

  /** Play the arrival now (a save from before it, or any other way in). */
  play() {
    this.tm.placed = true;
    this.arriving = true;
    this.g.cut(this.beats());
  }

  private beats(): Beat[] {
    const g = this.g, pl = g.player, p = g.planets[this.idx], tm = this.tm, fox = g.fox;
    this.town.group.updateMatrixWorld(true);
    const Lw = this.w(this.landing);
    const up = Lw.clone().sub(p.center).normalize();
    // the whale swims along Amble's length, front to back, a little across it
    const D = this.wDir(new THREE.Vector3(0.35, 0, -1)).projectOnPlane(up).normalize();
    const S = new THREE.Vector3().crossVectors(up, D).normalize();
    this.layClouds(Lw, up, D, S);
    const H = 88, speed = 3.2, tJump = 9.5;
    const whaleAt = (t: number, level = 1) => {
      const w = this.whale;
      w.root.position.copy(Lw).addScaledVector(up, H + (1 - level) * 6).addScaledVector(D, speed * (t - tJump) - 6).addScaledVector(S, -4);
      const ahead = D.clone().addScaledVector(up, -0.22 * (1 - level)).normalize();
      w.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, ahead).normalize(), up, ahead));
      w.root.updateMatrixWorld(true);
      return w.rideAnchor.getWorldPosition(V());
    };
    let T = 0, last = 0;
    const clock = (dt: number) => { T += dt; return T; };
    const stand = (at: THREE.Vector3, face: THREE.Vector3, pose: typeof pl.pose = {}) => {
      pl.pos.copy(at); pl.up.copy(at).sub(p.center).normalize(); pl.facing.copy(face).projectOnPlane(pl.up).normalize();
      pl.grounded = true; pl.pose = pose; pl.vel.set(0, 0, 0); pl.sync();
    };
    const foxAt = (at: THREE.Vector3, face: THREE.Vector3, gesture: 'sit' | 'trot' | 'wary' = 'sit') => {
      fox.f.root.visible = true; fox.f.root.position.copy(at); fox.dir.copy(at).sub(p.center).normalize();
      fox.f.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(fox.dir, face).normalize(), fox.dir, face.clone().projectOnPlane(fox.dir).normalize()));
      fox.gesture = gesture; fox.t += 1 / 60; (fox as unknown as { pose(dt: number): void }).pose(1 / 60);
    };
    // Nilo carries the fox in his arms (from the scoop to the landing)
    // (held up a little and drawn a size larger, so he reads in Nilo's arms from the far angles of the jump and fall)
    const carried = () => { foxAt(pl.pos.clone().addScaledVector(pl.up, 0.95).addScaledVector(pl.facing, 0.42), pl.facing.clone(), 'wary'); fox.f.root.scale.setScalar(1.35); };
    // the way down: off the whale's side, under the umbrella, then a long soft drift to the landing
    let J0 = V(), J1 = V();
    const fall = new THREE.CubicBezierCurve3(V(), V(), V(), V());
    const along = (u: number, dt: number) => {
      const at = fall.getPoint(clamp(u));
      const sway = Math.sin(T * 1.3) * 0.5 * Math.sin(Math.PI * clamp(u));
      at.addScaledVector(S, sway);
      if (dt > 0) pl.vel.copy(at).sub(pl.pos).divideScalar(dt);
      pl.pos.copy(at); pl.up.copy(at).sub(p.center).normalize(); pl.grounded = false; pl.sync();
    };
    const cam = (pos: THREE.Vector3, look: THREE.Vector3) => { g.cutCam = { pos, look, up: up.clone() }; };
    const wow = { from: { pos: V(), look: V() } };
    // the landing is watched from wherever the houses leave a clear view of it (worked out now, in the fade)
    const landCam = this.clearView(Lw.clone().addScaledVector(up, 1.0), up, 9, 3.6, D.clone().multiplyScalar(11).addScaledVector(S, 7));
    const R = tm.amble.root;
    const AV = (x: number, y: number, z: number) => R.localToWorld(new THREE.Vector3(x, y, z));
    const AD = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).transformDirection(R.matrixWorld);
    const beats: Beat[] = [
      // 1. high over the meadow the whale levels out; Nilo and the fox on its back, the clouds below
      {
        dur: 3.5,
        enter: () => {
          T = 0; this.whale.root.visible = true; this.clouds.visible = true; this.whale.swim = 0.7;
          tm.onAmble = false; tm.umbrella.close(true);
          g.hud.setFade(1, '#fff8ee', true);
          g.sound.whaleSong();
        },
        tick: (k, dt) => {
          const t = clock(dt), a = whaleAt(t, sm(k));
          this.whale.update(dt, g.time);
          stand(a, D, { smile: 0 } as typeof pl.pose);
          foxAt(a.clone().addScaledVector(D, 0.9).addScaledVector(S, 0.6), D);
          g.hud.setFade(1 - sm(clamp(k * 2.2)), '#fff8ee');
          const wp = this.whale.root.position;
          cam(wp.clone().addScaledVector(S, 30 - k * 4).addScaledVector(up, -3 + k * 4).addScaledVector(D, -12 + k * 6), wp.clone().addScaledVector(up, 1.5 + k));
        },
      },
      // 2. he looks down through the gap in the clouds: Amble, far below, a tiny village on a mossy shell
      {
        dur: 3.5, line: { text: TOWN_LINES.below },
        tick: (k, dt) => {
          const t = clock(dt), a = whaleAt(t);
          this.whale.update(dt, g.time);
          const look = Lw.clone().sub(a).projectOnPlane(up).normalize();
          stand(a, D.clone().lerp(look, sm(k)).normalize(), { lookAt: Lw.clone() } as typeof pl.pose);
          pl.lookAt = Lw.clone();
          foxAt(a.clone().addScaledVector(D, 0.9).addScaledVector(S, 0.6), look);
          const back = a.clone().addScaledVector(D, -2.8).addScaledVector(up, 2.4 + k * 0.3).addScaledVector(S, -1.0);
          cam(back, a.clone().lerp(Lw, 0.18 + 0.1 * sm(k)));
        },
        exit: () => { pl.lookAt = null; },
      },
      // 3. a grin; he scoops up the fox
      {
        dur: 2.5,
        enter: () => { g.sound.sfxPlay('soft'); },
        tick: (k, dt) => {
          const t = clock(dt), a = whaleAt(t);
          this.whale.update(dt, g.time);
          stand(a, S, { smile: 1, touchChest: sm(clamp((k - 0.35) * 3)) } as typeof pl.pose);
          if (k < 0.4) foxAt(a.clone().addScaledVector(D, 0.9).addScaledVector(S, 0.6), a.clone().sub(a.clone().addScaledVector(D, 0.9)).normalize());
          else carried();
          cam(a.clone().addScaledVector(S, 2.7).addScaledVector(up, 1.55).addScaledVector(D, -0.9), a.clone().addScaledVector(up, 1.05));
        },
      },
      // 4. and jumps, off the whale's side and out into the air
      {
        dur: 2.0,
        enter: () => { J0 = whaleAt(T); J1 = J0.clone().addScaledVector(S, 5).addScaledVector(up, -4); g.sound.sfxPlay('whoosh'); },
        tick: (k, dt) => {
          const t = clock(dt); whaleAt(t);
          this.whale.update(dt, g.time);
          const at = J0.clone().lerp(J1, k).addScaledVector(up, Math.sin(Math.PI * Math.min(1, k * 1.4)) * 1.6);
          if (dt > 0) pl.vel.copy(at).sub(pl.pos).divideScalar(dt);
          pl.pos.copy(at); pl.up.copy(at).sub(p.center).normalize(); pl.facing.copy(S); pl.grounded = false;
          pl.pose = { tuck: sm(clamp(k * 2)) * 0.4, smile: 1, touchChest: 1 } as typeof pl.pose; pl.sync();
          carried();
          cam(J0.clone().addScaledVector(S, 6.2).addScaledVector(up, 0.9).addScaledVector(D, -2.4), at.clone().addScaledVector(up, 0.75));
        },
      },
      // 5. Fold opens over him into the paper umbrella
      {
        dur: 2.0,
        enter: () => {
          pl.pose = { smile: 1, touchChest: 1 } as typeof pl.pose;
          tm.umbrella.openAt(pl); g.fold.root.visible = false; g.sound.sfxPlay('paper');
          const L1 = J1.clone().addScaledVector(up, -3);
          fall.v0.copy(L1); fall.v1.copy(L1).addScaledVector(up, -30).addScaledVector(D, 4).addScaledVector(S, 44);
          fall.v2.copy(Lw).addScaledVector(up, 24).addScaledVector(S, 14); fall.v3.copy(Lw);
          last = 0;
        },
        tick: (k, dt) => {
          const t = clock(dt); whaleAt(t);
          this.whale.update(dt, g.time);
          const at = J1.clone().addScaledVector(up, -3 * sm(k));
          if (dt > 0) pl.vel.copy(at).sub(pl.pos).divideScalar(dt);
          pl.pos.copy(at); pl.up.copy(at).sub(p.center).normalize(); pl.sync();
          carried();
          cam(at.clone().addScaledVector(up, -2.6).addScaledVector(D, 3.2).addScaledVector(S, 2.2), at.clone().addScaledVector(up, 1.6));
        },
      },
      // 6. down through the clouds, the whale singing as it swims away
      {
        dur: 5.5, line: { text: TOWN_LINES.fall },
        enter: () => { g.sound.whaleSong(); this.whale.swim = 1; },
        exit: () => { g.camera.fov = 58; g.camera.updateProjectionMatrix(); },
        tick: (k, dt) => {
          const t = clock(dt); whaleAt(t * 1.4 - tJump * 0.4);
          this.whale.update(dt, g.time);
          const u = sm(k) * 0.72; along(u, dt); last = u;
          carried();
          const at = pl.pos;
          // close beside him first (the fox in his arms, the umbrella over them), then from above and behind his
          // shoulder, down through the gap in the clouds to Amble and the village far below
          if (k < 0.45) cam(at.clone().addScaledVector(D, 2.4).addScaledVector(S, 3.4).addScaledVector(up, -0.3 + k * 0.4), at.clone().addScaledVector(up, 0.75));
          else {
            // out beside him at the umbrella's height: Nilo, the fox and Fold up top, and through the gap in the
            // cloud, Amble and the village far below
            // (a wider lens for this one: he is high over the village, well out to the side of it)
            const c = at.clone().addScaledVector(S, 7).addScaledVector(D, 2).addScaledVector(up, -0.4);
            const toN = at.clone().addScaledVector(up, 1.1).sub(c).normalize(), toA = AV(0, 16, 4).sub(c).normalize();
            cam(c, c.clone().add(toN.multiplyScalar(0.6).addScaledVector(toA, 0.4)));
            if (g.camera.fov !== 76) { g.camera.fov = 76; g.camera.updateProjectionMatrix(); }
          }
        },
      },
      // 7. past the circling birds and the windmill sails, softly down into the moss in the middle of the village
      {
        dur: 4.5,
        tick: (k, dt) => {
          clock(dt);
          const u = last + (1 - last) * (1 - (1 - k) * (1 - k)); along(u, dt);
          carried();
          const at = pl.pos;
          cam(landCam.clone(), at.clone().addScaledVector(up, 0.6));
          if (k > 0.97 && tm.umbrella.open) {
            tm.umbrella.close(); g.sound.sfxPlay('soft');
            pl.landT = 0.12; pl.squash = 0.08;
          }
        },
        exit: () => {
          stand(Lw, D.clone().negate());
          tm.onAmble = true; tm.umbrella.close();
          this.whale.root.visible = false; this.clouds.visible = false;
          // the fox jumps down out of his arms
          fox.f.root.scale.setScalar(1);
          fox.place(p, pl.pos.clone().addScaledVector(pl.facing, 0.5).addScaledVector(S, 1.0).sub(p.center).normalize());
          wow.from.pos.copy(g.camera.position); wow.from.look.copy(pl.pos).addScaledVector(up, 0.6);
        },
      },
      // 8. the wow shot: back and back, to the whole of Amble standing still in the golden meadow
      {
        dur: 6.0,
        enter: () => {
          const c = CHAPTERS[this.idx]; g.hud.showChapter(c.n, c.title, '', 5.5); this.far.root.visible = true;
          // (the painted far valley has its own little town on a hill: the real one over the curve stays out of it)
          const ht = g.contents[this.idx].refs.hillTown as THREE.Object3D | undefined; if (ht) ht.visible = false;
        },
        tick: k => {
          const s = sm(k);
          // up and away, far out into the meadow off Amble's right, a little ahead, as the lens closes in to a long
          // one: Amble whole and huge on the golden rise, and beyond, the valley, the lake and the snowy mountains
          // (the lens stays upright to Amble, so it stands tall on the crest of its meadow as in the picture)
          const endPos = AV(-104, 5.5, 16), endLook = AV(0, 19, 7);
          const pos = wow.from.pos.clone().lerp(endPos, s).addScaledVector(up, Math.sin(Math.PI * s) * 16);
          const aUp = AD(0, 1, 0);
          g.cutCam = { pos, look: wow.from.look.clone().lerp(endLook, sm(clamp(k * 1.3))), up: up.clone().lerp(aUp, s).normalize() };
          const fov = 58 + (31 - 58) * sm(clamp((k - 0.1) / 0.8));
          if (Math.abs(g.camera.fov - fov) > 0.01) { g.camera.fov = fov; g.camera.updateProjectionMatrix(); }
          const dirH = endLook.clone().sub(endPos).projectOnPlane(aUp).normalize();
          this.far.place(pos, dirH, aUp, p.center, p.R + 3);
        },
        exit: () => {
          const ht = g.contents[this.idx].refs.hillTown as THREE.Object3D | undefined; if (ht) ht.visible = true;
          this.far.root.visible = false; g.camera.fov = 58; g.camera.updateProjectionMatrix(); g.give('town:arrived'); g.flags.add('town:jump-seen'); this.arriving = false; g.save(); },
      },
    ];
    // then Pip runs out to meet the stranger who fell from the sky, and the village comes out to stare
    beats.push(...this.meetBeats(up));
    return beats;
  }

  private meetBeats(up: THREE.Vector3): Beat[] {
    const g = this.g, pl = this.g.player, pip = this.byId.pip;
    const from = pip.pos.clone();
    const to = () => this.landing.clone().add(from.clone().sub(this.landing).setY(0).normalize().multiplyScalar(1.7));
    let dest = to();
    const midW = this.g.player.pos.clone(); // (Nilo has not landed when this is built: use the landing)
    this.w(this.landing, midW).lerp(this.w(dest), 0.5);
    const sideW = new THREE.Vector3().crossVectors(up, this.w(dest).sub(this.w(this.landing))).normalize();
    // over Nilo's shoulder (the landing is open moss, so nothing stands between them), Pip running up to him
    const Lw = this.w(this.landing), away = Lw.clone().sub(this.w(dest)).projectOnPlane(up).normalize();
    const meetCam = Lw.clone().addScaledVector(away, 2.6).addScaledVector(up, 1.75).addScaledVector(sideW, 0.9);
    void midW;
    return [{
      dur: 3.2, line: { who: 'Pip', text: TOWN_LINES.pipCalls },
      enter: () => { dest = to(); for (const h of this.homes) h.npc.lookAt = pl.pos.clone().addScaledVector(up, 1.2); },
      tick: k => {
        const q = from.clone().lerp(dest, sm(k)); q.y = groundAt(q.x, q.z);
        pip.pos.copy(q);
        pip.npc.speedShown = k < 0.92 ? 3.2 : 0;
        pip.face.copy(dest.clone().sub(from).setY(0).normalize());
        const mid = pl.pos.clone().lerp(this.w(q), 0.5);
        g.cutCam = { pos: meetCam.clone(), look: mid.lerp(this.w(q), 0.6).addScaledVector(up, 0.8), up: up.clone() };
      },
      exit: () => {
        pip.npc.speedShown = 0;
        pip.face.copy(this.landing.clone().sub(pip.pos).setY(0).normalize());
        for (const h of this.homes) h.npc.lookAt = null;
        // straight into the talk, as if he had walked up to Pip
        setTimeout(() => { if (this.g.mode === 'play') this.g.openTalk(pip.npc); }, 0);
      },
    }];
  }
}
