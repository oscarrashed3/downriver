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
import { TOWN_GOALS, TOWN_LINES } from '../../data/townWords';

const sm = (k: number) => k * k * (3 - 2 * k);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const V = () => new THREE.Vector3();

interface Home { npc: Npc; pos: THREE.Vector3; face: THREE.Vector3 }

export class TownStory {
  active = false;
  private town: Mossrest;
  private homes: Home[] = [];
  private byId: Record<string, Home> = {};
  readonly root = new THREE.Group();
  private beam: THREE.Mesh;
  private whale: SkyWhale;
  private clouds: THREE.InstancedMesh;
  /** Creature space: where Nilo lands (open moss on the crown), and where Pip comes from. */
  readonly landing: THREE.Vector3;
  private arriving = false;
  private folkOut = 1;

  constructor(private g: Game, private idx: number, private tm: TownMove) {
    this.town = tm.town;
    this.root.name = 'townFolk';
    g.scene.add(this.root);
    const T = this.town, free = (x: number, z: number, r: number) => (T as unknown as { free(x: number, z: number, r: number): boolean }).free(x, z, r);
    const find = (near: THREE.Vector3, r0: number, r1: number, clear: number, fallback: THREE.Vector3) => {
      let best: THREE.Vector3 | null = null, bd = 1e9;
      for (let a = 0; a < Math.PI * 2; a += 0.21) for (let r = r0; r <= r1; r += 0.6) {
        const x = near.x + Math.cos(a) * r, z = near.z + Math.sin(a) * r;
        if (shellPolar(x, z).rho > 0.8 || !free(x, z, clear)) continue;
        const d = Math.abs(r - (r0 + r1) / 2);
        if (d < bd) { bd = d; best = new THREE.Vector3(x, groundAt(x, z), z); }
      }
      return best ?? fallback;
    };
    // the landing: open moss as near the middle of the village as there is
    this.landing = find(new THREE.Vector3(0, 0, SHELL.cz), 0.5, 9, 2.2, spot(0, 0.2));
    // the named Mossfolk
    const front = T.legLines.find(l => l.kind === 'rope' && l.leg[0] === 'F') ?? T.legLines[0];
    const tamsinAt = front.top.clone().addScaledVector(front.out.clone().setY(0).normalize(), -1.0);
    const mill = spot(-1.2, 0.3);
    const homes: [string, THREE.Vector3, THREE.Vector3 | null][] = [
      ['pip', find(this.landing, 6, 10, 1.2, spot(1, 0.3)), null],
      ['ropewright', tamsinAt, front.out.clone().setY(0).normalize()],
      ['miller', find(mill, 4.5, 8, 1.0, spot(-1.0, 0.45)), null],
      ['bramwyn', find(spot(1.0, 0.5), 0, 6, 1.0, spot(1.0, 0.5)), null],
    ];
    // six more, out on their doorsteps (the houses nearest the landing)
    const doors = T.houses.map(h => ({ h, d: Math.hypot(h.door.x - this.landing.x, h.door.z - this.landing.z) })).sort((a, b) => a.d - b.d).slice(0, 6);
    doors.forEach(({ h }, i) => {
      const out = new THREE.Vector3(Math.sin(h.rot), 0, Math.cos(h.rot));
      const p = h.door.clone().addScaledVector(out, 1.1);
      homes.push(['moss' + (i + 1), p, out]);
    });
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
    tm.keepInSky.add(this.whale.root); tm.keepInSky.add(this.clouds); tm.keepInSky.add(this.root);
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
      const at = this.w(h.pos);
      const up = at.clone().sub(p.center).normalize();
      if (force) n.place(at, up, this.wDir(h.face));
      else { n.root.position.copy(at); n.up.copy(up); n.homeForward.copy(this.wDir(h.face)); n.homePos.copy(at); }
    }
  }

  // ------------------------------------------------------------------ the goal line

  /** Which of the three steps (the foot, the water, the eyes) Nilo is on, 1..3 (0 before the task, 4 after). */
  step() { return !this.has('town:quest') ? 0 : !this.has('town:foot-done') ? 1 : !this.has('town:water-done') ? 2 : !this.has('town:eyes-done') ? 3 : 4; }

  goal(): string | null {
    if (!this.has('town:arrived')) return null;
    if (!this.has('town:quest')) return TOWN_GOALS.pip;
    if (this.step() === 1) return this.has('town:met-tamsin') ? TOWN_GOALS.foot : TOWN_GOALS.tamsin;
    if (this.step() === 2) return TOWN_GOALS.water;
    if (this.step() === 3) return TOWN_GOALS.eyes;
    return TOWN_GOALS.walk;
  }
  /** The three steps: ● for each done and the one in hand, ○ for those still ahead. */
  meter() { const s = this.step(); return s >= 1 && s <= 3 ? `Amble  ${'●'.repeat(s)}${'○'.repeat(3 - s)}` : ''; }

  guideTarget(): THREE.Vector3 | null {
    if (!this.has('town:arrived')) return null;
    if (!this.has('town:quest')) return this.npc('pip').root.position.clone();
    if (this.step() === 1) {
      if (!this.has('town:met-tamsin')) return this.npc('ropewright').root.position.clone();
      const front = this.town.legLines.find(l => l.kind === 'rope' && l.leg[0] === 'F') ?? this.town.legLines[0];
      return this.w(front.pts[front.pts.length - 1]);
    }
    if (this.step() === 2) return this.npc('miller').root.position.clone();
    if (this.step() === 3) return this.npc('bramwyn').root.position.clone();
    return null;
  }

  // ------------------------------------------------------------------ each frame in World 3

  frame(dt: number) {
    const g = this.g, pl = g.player;
    this.active = true;
    this.sync();
    // the fox walks on the shell with him (at his height when he is on Amble, else on the meadow)
    g.fox.ground = (d, out) => {
      if (!this.tm.onAmble && !this.tm.climb) return false;
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
    for (const h of this.homes) if (h.npc.root.visible && h.npc.root.position.distanceToSquared(cam) > 60 * 60) h.npc.root.visible = false;
    // the beam
    const target = g.mode === 'play' ? this.guideTarget() : null;
    const u = (this.beam.material as THREE.ShaderMaterial).uniforms;
    u.uT.value += dt;
    const near = target ? target.distanceTo(pl.pos) : 0;
    const want = target && near > 9 ? clamp((near - 9) / 12) * 0.85 : 0;
    u.uA.value += (want - u.uA.value) * (1 - Math.exp(-3 * dt));
    this.beam.visible = u.uA.value > 0.01;
    if (target) {
      const up = target.clone().sub(g.planets[this.idx].center).normalize();
      this.beam.position.copy(target).addScaledVector(up, 68);
      this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    }
    // never arrived (a save from before the scene, or the stream ride in): the scene plays now
    if (!this.has('town:arrived') && !this.arriving && g.mode === 'play' && !g.seq.running) this.play();
  }

  /** Leaving World 3: the fox goes back to the ground she knows. */
  off() { if (this.active) { this.active = false; this.g.fox.ground = null; this.beam.visible = false; } }

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
    const carried = () => foxAt(pl.pos.clone().addScaledVector(pl.up, 0.95).addScaledVector(pl.facing, 0.32), pl.facing.clone(), 'wary');
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
          cam(J0.clone().addScaledVector(S, 9.5).addScaledVector(up, 0.6).addScaledVector(D, -4.5), at.clone().addScaledVector(up, 0.7));
        },
      },
      // 5. Fold opens over him into the paper umbrella
      {
        dur: 2.0,
        enter: () => {
          pl.pose = { smile: 1, touchChest: 1 } as typeof pl.pose;
          tm.umbrella.openAt(pl); g.fold.root.visible = false; g.sound.sfxPlay('paper');
          const L1 = J1.clone().addScaledVector(up, -3);
          fall.v0.copy(L1); fall.v1.copy(L1).addScaledVector(up, -30).addScaledVector(D, 4);
          fall.v2.copy(Lw).addScaledVector(up, 24).addScaledVector(S, 6); fall.v3.copy(Lw);
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
        tick: (k, dt) => {
          const t = clock(dt); whaleAt(t * 1.4 - tJump * 0.4);
          this.whale.update(dt, g.time);
          const u = sm(k) * 0.72; along(u, dt); last = u;
          carried();
          const at = pl.pos;
          cam(at.clone().addScaledVector(D, 6.5 - k * 1.5).addScaledVector(S, 3.8).addScaledVector(up, -0.8 + k * 0.6), at.clone().addScaledVector(up, 0.9 - k * 0.6));
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
          fox.place(p, pl.pos.clone().addScaledVector(pl.facing, 0.5).addScaledVector(S, 1.0).sub(p.center).normalize());
          wow.from.pos.copy(g.camera.position); wow.from.look.copy(pl.pos).addScaledVector(up, 0.6);
        },
      },
      // 8. the wow shot: back and back, to the whole of Amble standing still in the golden meadow
      {
        dur: 6.0,
        enter: () => { const c = CHAPTERS[this.idx]; g.hud.showChapter(c.n, c.title, '', 5.5); },
        tick: k => {
          const s = sm(k);
          const pos = wow.from.pos.clone().lerp(AV(-62, 8, 48), s).addScaledVector(up, Math.sin(Math.PI * s) * 18);
          cam(pos, wow.from.look.clone().lerp(AV(-1, 17, 4), sm(clamp(k * 1.4))));
        },
        exit: () => { g.give('town:arrived'); g.flags.add('town:jump-seen'); this.arriving = false; g.save(); },
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
