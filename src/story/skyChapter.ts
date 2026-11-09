// World 2, the Sky Isles: the story frame (mirrors ChapterOne, which stays untouched). The arrival splash and the
// race-day parade, the windfolk and where they stand, the golden beam, the postman's balloon, the pastry stall
// and the swap chain, the sketch easels, and save/restore of what has happened here.
import * as THREE from 'three';
import type { Game } from '../game';
import type { Beat } from './sequencer';
import type { WorldContent } from '../world/content';
import type { Planet } from '../world/planet';
import type { SkyWorld } from '../world/skyIsles/world';
import type { CamPose } from '../systems/skyView';
import { Npc } from '../systems/npc';
import { SCRIPTS } from '../data/scripts';
import { NOTE } from '../data/words';
import { CHAPTERS } from '../data/story';
import { SKY_WOW, SKY_POSTMAN, SKY_NOTE, SKY_PROMPT, SKY_VIEWPOINTS, SKY_LETTER } from '../data/skyStory';
import { makeWindfolk, Crowd, type CrowdSpot } from '../world/skyIsles/windfolk';
import { KiteParade } from '../world/skyIsles/kites';
import { SkyWhale } from '../world/skyIsles/whale';
import { SPOTS, RINGS } from '../world/skyIsles/layout';
import { onIsle, skySpotProblem } from '../world/skyIsles/terrain';
import { safeSpot } from '../world/spots';
import { makePostman, type Postman } from '../world/postman';
import { letterPanel } from './panels';
import { makeSketch } from '../systems/sketch';
import { orientTo, anyTangent } from '../world/sphere';
import { clamp, lerp, smoothstep } from '../world/noise';
import * as Props from '../world/props';
import { skyStep, skyDetail, skyDots, nextPart, SKY_HOMES as HOMES } from './skyQuests';

type LatOff = readonly [number, number];



export class SkyChapter {
  p: Planet;
  c: WorldContent;
  S: SkyWorld;
  /** Everything this chapter adds to the scene, shown only in the Sky Isles. */
  root = new THREE.Group();
  home: Record<string, { pos: THREE.Vector3; up: THREE.Vector3; fwd: THREE.Vector3 }> = {};
  beam: THREE.Mesh;
  parade: KiteParade;
  whales: { w: SkyWhale; axis: THREE.Vector3; start: THREE.Vector3; a: number; a0: number; speed: number; r: number }[] = [];
  crowd: Crowd;
  postman: Postman & { balloon: THREE.Group };
  easels: THREE.Object3D[] = [];
  splash: THREE.Mesh;
  private active = false;
  private postmanDue = false;

  constructor(private g: Game, world: number) {
    this.p = g.planets[world];
    this.c = g.contents[world];
    this.S = this.c.refs.skyWorld as SkyWorld;
    const p = this.p;
    this.root.name = 'skyChapter';
    g.scene.add(this.root);
    this.S.root.updateMatrixWorld(true);

    // the windfolk: the same Person underneath as the World 1 villagers, with scarves that fly
    for (const [id, h] of Object.entries(HOMES)) {
      const person = makeWindfolk(h.kind);
      const n = new Npc(id, { idle: 'none', voice: h.voice } as Npc['look'], SCRIPTS[id].start, person);
      const d = safeSpot(p, this.dir(h.at), this.c.avoid, 6);
      const bad = skySpotProblem(p, d); if (bad) console.warn(`${id} has nowhere good to stand (${bad})`);
      const pos = p.surfacePoint(d, -0.05);
      n.place(pos, d, this.at(h.face).sub(pos));
      n.root.traverse(m => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true; });
      this.root.add(n.root);
      this.c.npcs.push(n);
      this.home[id] = { pos: pos.clone(), up: d.clone(), fwd: n.homeForward.clone() };
    }

    // the cheering crowd along the rail by the race gate
    this.crowd = this.makeCrowd();

    // race day: dozens of kites over Landing Isle and Sailtown, tails like ribbons of paint
    const pc = this.dir([34, 4]);
    this.parade = new KiteParade({ count: 42, center: new THREE.Vector3(), radius: 30, height: [12, 30], size: [1.4, 3.2], seed: 9, strings: false });
    this.parade.root.position.copy(pc).multiplyScalar(p.R + 24).add(p.center);
    this.parade.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pc);
    this.root.add(this.parade.root);

    // and slow as clouds, two whales swimming high over the islands with birds on their backs
    const land = this.dir([20, 0]);
    [[30, 5, 44, 0.018, -0.3], [24, 9, 52, 0.015, -0.45]].forEach(([len, seed, r, speed, a0], i) => {
      const w = new SkyWhale({ length: len, seed, birds: 6, detail: i ? 'low' : 'high', flock: i ? 0 : 4 });
      w.swim = 0.6;
      // a great circle that passes right over Landing Isle, each at its own slant
      const t = anyTangent(land).applyAxisAngle(land, 0.6 + i * 0.9);
      const axis = new THREE.Vector3().crossVectors(land, t).normalize();
      this.whales.push({ w, axis, start: land.clone(), a: a0, a0, speed, r });
      this.root.add(w.root);
    });

    // one golden beam that stands over the next place to go
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 140, 16, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; uniform float uT, uA; void main(){ float v = vUv.y; float a = pow(1.0 - v, 2.2) * (0.55 + 0.45 * sin(v * 40.0 - uT * 3.0)) * (0.6 + 0.4 * abs(sin(vUv.x * 6.283 * 3.0))); gl_FragColor = vec4(1.0, 0.82, 0.45, a * uA); }',
    }));
    this.beam.frustumCulled = false; this.beam.renderOrder = 5;
    this.root.add(this.beam);

    // the sketch easels
    for (const vp of SKY_VIEWPOINTS) {
      const e = easel();
      const d = this.dir(vp.at);
      if (!onIsle(p, d, 1)) console.warn(`easel ${vp.id} is off the island`);
      p.surfacePoint(d, -0.05, e.position);
      orientTo(e, d, this.at([vp.look[1], vp.look[2]]).sub(e.position).negate());
      this.root.add(e);
      this.easels.push(e);
    }

    // the splash ring on the pool
    this.splash = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.splash.visible = false;
    this.root.add(this.splash);

    // the postman comes by balloon up here
    const pm = makePostman();
    pm.umbrella.visible = false;
    const balloon = makeBalloon();
    pm.root.add(balloon);
    pm.root.visible = false;
    this.root.add(pm.root);
    this.postman = Object.assign(pm, { balloon });

    this.register();
    this.setActive(false);
  }

  // ------------------------------------------------------------------ places
  /** Planet direction at (lat, off) with off in metres from the river, as in skyIsles/layout.ts. */
  dir(ll: LatOff | number[]) {
    const [lat, off] = ll;
    return this.p.dirRiver(lat, off / (this.p.R * Math.PI / 180 * Math.max(0.05, Math.sin(lat * Math.PI / 180))));
  }
  at(ll: LatOff | number[], h = 0) { return this.p.surfacePoint(this.dir(ll), h); }
  npc(id: string): Npc { return this.c.npcs.find(n => n.id === id)!; }
  has(f: string) { return this.g.flags.has(f); }
  ref(id: string) { return (this.c.refs[id] as THREE.Object3D).getWorldPosition(new THREE.Vector3()); }

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    this.root.visible = on;
  }

  sendHome(n: Npc) {
    const h = this.home[n.id];
    n.place(h.pos, h.up, h.fwd);
    n.pose = {}; n.faceOverride = null; n.speedShown = 0; n.lookAt = null;
  }

  private makeCrowd(): Crowd {
    const p = this.p, c = this.dir([69.5, 19.5]);
    const look = this.at([66, 13]);
    const center = p.surfacePoint(c, -0.05);
    const root = new THREE.Group();
    root.position.copy(center);
    orientTo(root, c, look.clone().sub(center));
    root.updateMatrixWorld(true);
    const spots: CrowdSpot[] = [];
    const t1 = anyTangent(c), t2 = new THREE.Vector3().crossVectors(c, t1);
    for (let i = 0; spots.length < 16 && i < 80; i++) {
      const a = i * 2.39996, r = 1.2 + Math.sqrt(i) * 1.15;
      const d = c.clone().addScaledVector(t1, Math.cos(a) * r / p.R).addScaledVector(t2, Math.sin(a) * r / p.R).normalize();
      if (!onIsle(p, d, 1.8) || p.riverNearest(d).dist < p.cfg.riverWidth * 1.6 + 1.2) continue;
      if (p.solids.some(s => s.obj.position.distanceTo(p.surfacePoint(d)) < (s.shape.kind === 'circle' ? s.shape.r : Math.hypot(s.shape.hw, s.shape.hd)) + 0.5)) continue;
      const w = p.surfacePoint(d, -0.03);
      const lp = root.worldToLocal(w.clone());
      const lf = root.worldToLocal(look.clone()).sub(lp).setY(0).normalize();
      spots.push({ pos: lp, facing: lf });
    }
    const crowd = new Crowd(spots, 11);
    root.add(crowd.root);
    this.root.add(root);
    return crowd;
  }

  // ------------------------------------------------------------------ interactables
  register() {
    const g = this.g, add = (it: WorldContent['interactables'][number]) => this.c.interactables.push(it);
    const world = g.planets.indexOf(this.p);
    // the pastry stall: the baker gives you something for luck (the start of the swap chain)
    const stall = this.ref('stall');
    add({
      id: 'skyStall', world, pos: stall, radius: 3.6,
      label: () => (this.has('sky:arrived') && !this.has('sky:stall') ? SKY_PROMPT.stall : null),
      act: () => { g.flags.add('sky:stall'); g.hud.notify(SKY_NOTE.stall); g.give('item:pastry'); g.save(); },
    });
    SKY_VIEWPOINTS.forEach((vp, i) => add({
      id: vp.id, world, pos: this.easels[i].position.clone(), radius: 3.2,
      walkTo: () => ({ spot: this.at(vp.at), face: this.at([vp.look[1], vp.look[2]]) }),
      label: () => (g.sketches.some(sk => sk.id === vp.id) ? SKY_PROMPT.sketchAgain : SKY_PROMPT.sketch),
      act: () => g.cut(this.sketchBeats(vp)),
    }));
  }

  restore() {
    for (const n of Object.keys(HOMES)) this.sendHome(this.npc(n));
    this.postman.root.visible = false;
  }

  afterTalk(_id: string) {}

  // ------------------------------------------------------------------ the goal line
  goal(): string | null { return skyDetail(this.g.flags); }
  meter(): string {
    const f = this.g.flags;
    if (!f.has('sky:quest-kite') || f.has('sky:won')) return '';
    const n = skyDots(f);
    return `Sky Races  ${'●'.repeat(n)}${'○'.repeat(3 - n)}`;
  }

  guideTarget(): THREE.Vector3 | null {
    const f = this.g.flags, npcAt = (id: string) => this.npc(id).root.position.clone();
    switch (skyStep(f)) {
      case 'larkTown': case 'build': return npcAt('lark');
      case 'parts': {
        const part = nextPart(f)!;
        if (part.id === 'frame') return this.at([SPOTS.windmillTop.lat, SPOTS.windmillTop.off]);
        return npcAt(part.id === 'cloth' ? 'mender' : 'chimer');
      }
      case 'qualify': { const r = RINGS[0]; return this.at([r.lat, r.off]); }
      case 'race': return npcAt('zephy');
      case 'goodbye': case 'whale': return this.at([SPOTS.whalesRest.lat, SPOTS.whalesRest.off]);
      default: return null;
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    const g = this.g, pl = g.player, t = g.time;
    this.parade.update(dt, t);
    this.updateWhales(dt, t);
    const nearGate = this.npc('zephy').root.position.distanceTo(pl.pos) < 16;
    this.crowd.update(dt, t, nearGate ? 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.9)) : 0.15 + 0.2 * Math.max(0, Math.sin(t * 0.4)));
    // the beam
    const target = g.mode === 'play' ? this.guideTarget() : null;
    const u = (this.beam.material as THREE.ShaderMaterial).uniforms;
    u.uT.value += dt;
    const near = target ? target.distanceTo(pl.pos) : 0;
    const want = target && near > 9 ? clamp((near - 9) / 12) * 0.85 : 0;
    u.uA.value = lerp(u.uA.value, want, 1 - Math.exp(-3 * dt));
    this.beam.visible = u.uA.value > 0.01;
    if (target) {
      const up = target.clone().sub(this.p.center).normalize();
      this.beam.position.copy(target).addScaledVector(up, 68);
      this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    }
    // the postman's balloon: the first time you come into Sailtown square after Lark's news
    if (this.has('sky:quest-kite') && !this.has('letter:2') && g.mode === 'play' && pl.grounded) {
      if (pl.pos.distanceTo(this.home.lark.pos) < 12) this.postmanDue = true;
      if (this.postmanDue) { this.postmanDue = false; g.cut(this.postmanBeats()); }
    }
  }

  private updateWhales(dt: number, t: number) {
    const R = this.p.R, c = this.p.center;
    for (const W of this.whales) {
      W.a += W.speed * dt;
      const d = W.start.clone().applyAxisAngle(W.axis, W.a);
      const ahead = W.start.clone().applyAxisAngle(W.axis, W.a + 0.01).sub(d).normalize();
      W.w.root.position.copy(d).multiplyScalar(R + W.r + Math.sin(t * 0.21 + W.r) * 1.2).add(c);
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(d, ahead).normalize(), d, ahead);
      W.w.root.quaternion.setFromRotationMatrix(m);
      W.w.update(dt, t);
    }
  }

  // ------------------------------------------------------------------ scenes
  orbit(center: THREE.Vector3, r: number, h: number, a: number): CamPose {
    const up = center.clone().sub(this.p.center).normalize();
    const t1 = anyTangent(up), t2 = new THREE.Vector3().crossVectors(up, t1);
    return { pos: center.clone().addScaledVector(up, h).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r), look: center.clone().addScaledVector(up, 1.1), up };
  }

  /** The arrival: start the scene (called once the stream has set Nilo down in the Sky Isles). */
  arrive() { this.g.cut(this.arrivalBeats(), () => { this.g.give('sky:arrived'); this.g.save(); }); }

  /**
   * Down through the cloud and SPLASH into the pool on Landing Isle; the camera tilts up from the water to the
   * kites and the whales of the race-day parade, then pulls back over the islands; Lark comes running with the news.
   */
  arrivalBeats(): Beat[] {
    const g = this.g, pl = g.player, p = this.p, lark = this.npc('lark');
    const poolD = this.dir([SPOTS.pool.lat + 0.5, 0]);
    const poolT = p.riverNearest(poolD).t;
    const water = () => poolD.clone().multiplyScalar(p.waterLevelRadius(poolT)).add(p.center);
    const surf = water();
    const up = poolD.clone();
    const towardTown = this.at([40, 4]).sub(surf).projectOnPlane(up).normalize();
    const side = new THREE.Vector3().crossVectors(up, towardTown).normalize();
    const standD = safeSpot(p, this.dir([SPOTS.pool.lat + 5.2, 3.2]), [], 6);
    const stand = p.surfacePoint(standD, 0);
    const larkFrom = this.dir([16, 6.5]), larkTo = safeSpot(p, this.dir([SPOTS.pool.lat + 6.4, 5.4]), [], 6);
    const kites = this.parade.root.position.clone();
    const whaleAt = () => this.whales[0].w.root.position.clone();
    const sm = (k: number) => k * k * (3 - 2 * k);
    const ringAt = (k: number) => {
      const m = this.splash.material as THREE.MeshBasicMaterial;
      this.splash.visible = k < 1;
      this.splash.position.copy(surf).addScaledVector(up, 0.08);
      this.splash.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
      this.splash.scale.setScalar(0.5 + k * 3.4);
      m.opacity = (1 - k) * 0.85;
    };
    const larkStand = (k: number) => {
      const d = larkFrom.clone().lerp(larkTo, sm(k)).normalize();
      const pos = p.surfacePoint(d, -0.05);
      lark.place(pos, d, k < 1 ? larkTo.clone().sub(larkFrom) : pl.pos.clone().sub(pos));
      lark.speedShown = k < 1 ? 5 : 0;
    };
    return [
      {
        // white cloud, then the pool rushing up: Nilo falls in feet first
        dur: 2.4, line: { text: SKY_WOW.splash },
        enter: () => {
          g.hud.setFade(1, '#fff8ee', true);
          pl.up.copy(up); pl.facing.copy(towardTown); pl.grounded = false; pl.pose = {};
          lark.root.visible = false;
        },
        tick: k => {
          g.hud.setFade(1 - smoothstep(0, 0.35, k), '#fff8ee');
          const f = 1 - sm(Math.min(1, k * 1.15));
          pl.pos.copy(surf).addScaledVector(up, 0.2 + f * f * 22);
          g.cutCam = { pos: surf.clone().addScaledVector(side, 5.5).addScaledVector(towardTown, 3).addScaledVector(up, 1.4), look: pl.pos.clone().addScaledVector(up, 0.8), up };
          if (k >= 0.86 && !this.splash.visible) { g.sound.sfxPlay('splash'); ringAt(0); pl.squash = 0.35; }
          if (this.splash.visible) ringAt(clamp((k - 0.86) / 0.6));
        },
      },
      {
        // he bobs up, laughing, and wades out onto the grass
        dur: 1.8,
        tick: k => {
          ringAt(clamp(0.23 + k * 0.6));
          const d = poolD.clone().lerp(standD, sm(k)).normalize();
          pl.pos.copy(p.surfacePoint(d, 0)).lerp(surf, 1 - sm(k)); pl.up.copy(d); pl.grounded = true;
          g.cutCam = { pos: surf.clone().addScaledVector(side, 5.5).addScaledVector(towardTown, 3).addScaledVector(up, 1.4), look: pl.pos.clone().addScaledVector(up, 0.9), up };
        },
        exit: () => { this.splash.visible = false; pl.placeAt(p, standD); pl.facing.copy(towardTown); pl.sync(); },
      },
      {
        // the camera tilts up from him to the sky: kites, dozens and dozens
        dur: 5.5, line: { text: SKY_WOW.look },
        enter: () => { for (const W of this.whales) W.a = W.a0 - 0.06; },
        tick: k => {
          const s = sm(k);
          const eye = stand.clone().addScaledVector(up, 1.7).addScaledVector(towardTown, -3.4).addScaledVector(side, 1.2);
          const look = stand.clone().addScaledVector(up, 1.3).lerp(kites.clone().addScaledVector(up, 10), s);
          g.cutCam = { pos: eye, look, up };
          pl.lookAt = kites.clone().addScaledVector(up, 14);
        },
      },
      {
        // and under them, slow as clouds, whales
        dur: 6, line: { text: SKY_WOW.whales },
        tick: k => {
          const eye = stand.clone().addScaledVector(up, 1.0).addScaledVector(towardTown, -2.2).addScaledVector(side, -1.6);
          g.cutCam = { pos: eye, look: eye.clone().lerp(whaleAt(), 0.5 + k * 0.1), up };
          pl.lookAt = whaleAt();
        },
      },
      {
        // pull back and up: a whole sky of islands
        dur: 6.5, line: { text: SKY_WOW.wide },
        tick: k => {
          const s = sm(k);
          const pos = stand.clone().addScaledVector(towardTown, -6 - s * 30).addScaledVector(up, 3 + s * 13).addScaledVector(side, 3 + s * 9);
          g.cutCam = { pos, look: stand.clone().lerp(this.at([56, 6]), 0.25 + s * 0.5).addScaledVector(up, 4 + s * 9), up };
        },
      },
      {
        // Lark comes running down from the bridge
        dur: 2.2,
        enter: () => { lark.root.visible = true; pl.lookAt = null; },
        tick: k => {
          larkStand(k);
          pl.lookAt = lark.root.position.clone().addScaledVector(up, 1.3);
          g.cutCam = this.orbit(stand.clone().lerp(lark.root.position, 0.5), 6.5, 2.4, 2.2 + k * 0.25);
        },
        exit: () => larkStand(1),
      },
      ...[SKY_WOW.lark1, SKY_WOW.lark2, SKY_WOW.lark3].map((text, i): Beat => ({
        line: { who: 'The girl in the yellow scarf', text },
        enter: () => { lark.talking = true; lark.smileT = 4; lark.pose = i === 1 ? { reach: 1 } as Npc['pose'] : {}; },
        tick: k => { g.cutCam = this.orbit(stand.clone().lerp(lark.root.position, 0.5), 5, 1.9, 2.5 + (i + k) * 0.12); },
        exit: () => { lark.pose = {}; },
      })),
      {
        line: { text: SKY_WOW.fold },
        enter: () => { g.fold.hop(); pl.lookAt = g.fold.root.position.clone(); },
        tick: k => { g.cutCam = this.orbit(stand, 3.4, 1.4, 1.2 + k * 0.2); g.cutCam.look = stand.clone().addScaledVector(up, 0.7); },
      },
      {
        line: { who: 'Lark', text: SKY_WOW.name },
        enter: () => { lark.pose = { wave: 1 }; pl.lookAt = lark.root.position.clone().addScaledVector(up, 1.3); },
        tick: k => { g.cutCam = this.orbit(stand.clone().lerp(lark.root.position, 0.5), 5.4, 2, 2.9 + k * 0.15); },
      },
      {
        // she runs off over the bridge; the chapter card
        dur: 3,
        enter: () => { lark.talking = false; lark.pose = {}; g.hud.showChapter(CHAPTERS[1].n, CHAPTERS[1].title, '', 5); },
        tick: k => {
          const d = larkTo.clone().lerp(this.dir([24, 8]), sm(k)).normalize();
          const pos = p.surfacePoint(d, -0.05);
          lark.place(pos, d, this.dir([30, 8]).sub(larkTo)); lark.speedShown = 5.5;
          g.cutCam = this.orbit(stand, 6, 2.6, 3.1 + k * 0.2); g.cutCam.look = lark.root.position.clone().addScaledVector(up, 1);
        },
        exit: () => { this.sendHome(lark); pl.lookAt = null; },
      },
    ];
  }

  /** A little striped balloon comes bobbing over the roofs; the postman leans out and hands down the letter. */
  postmanBeats(): Beat[] {
    const g = this.g, pl = g.player, pm = this.postman, p = this.p;
    const ans = SKY_LETTER.answers, sent = g.sent[ans.to] ?? '';
    const panel = letterPanel([ans.by[sent] ?? ans.by[''], ...SKY_LETTER.lines], SKY_LETTER.sign);
    const up = pl.up.clone();
    const toSq = this.home.lark.pos.clone().sub(pl.pos).projectOnPlane(up);
    const fwd = (toSq.lengthSq() > 1 ? toSq : pl.facing.clone()).normalize();
    const hover = pl.pos.clone().addScaledVector(fwd, 2.4).addScaledVector(up, 1.0);
    const from = hover.clone().addScaledVector(fwd, 30).addScaledVector(up, 16);
    const away = hover.clone().addScaledVector(fwd, -10).addScaledVector(new THREE.Vector3().crossVectors(up, fwd), 30).addScaledVector(up, 24);
    const place = (pos: THREE.Vector3, sway: number) => {
      const d = pos.clone().sub(p.center).normalize();
      pm.root.position.copy(pos);
      orientTo(pm.root, d, pl.pos.clone().sub(pos).projectOnPlane(d));
      pm.root.rotateZ(sway);
    };
    const anim = (dt: number, o: Partial<Parameters<typeof pm.person.animate>[1]> = {}) => pm.person.animate(dt, { speed: 0, grounded: true, ...o });
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const cam = (k: number): CamPose => ({ pos: pl.pos.clone().addScaledVector(fwd, -4.2).addScaledVector(right, 2.2).addScaledVector(up, 1.6 + k), look: pm.root.position.clone().addScaledVector(up, 1.4), up });
    return [
      {
        line: { text: SKY_POSTMAN.arrive }, dur: 6,
        enter: () => { pm.root.visible = true; pm.letter.visible = false; g.sound.sfxPlay('whoosh'); pl.facing.copy(fwd); },
        tick: (k, dt) => {
          const s = smoothstep(0, 1, k);
          place(from.clone().lerp(hover, s).addScaledVector(up, Math.sin(k * 9) * 0.3 * (1 - s)), Math.sin(g.time * 1.3) * 0.05);
          anim(dt, { wave: 1 - smoothstep(0.5, 0.9, k) });
          pl.lookAt = pm.root.position.clone().addScaledVector(up, 1);
          g.cutCam = cam(1.5 * (1 - s));
        },
      },
      {
        line: { who: 'The postman', text: SKY_POSTMAN.hand }, dur: 4.5,
        enter: () => { pm.letter.visible = true; g.sound.sfxPlay('paper'); },
        tick: (k, dt) => { place(hover.clone().addScaledVector(up, Math.sin(g.time * 1.7) * 0.08), Math.sin(g.time * 1.3) * 0.04); anim(dt, { wave: smoothstep(0, 0.3, k) * (1 - smoothstep(0.6, 1, k)) }); g.cutCam = cam(0); },
        exit: () => { pm.letter.visible = false; },
      },
      { dur: 1.2, tick: k => g.hud.setFade(smoothstep(0, 1, k) * 0.9, '#2a2436') },
      {
        dur: 11,
        enter: () => g.hud.showPanel(panel, '', 0),
        tick: k => g.hud.showPanel(panel, '', smoothstep(0, 0.08, k) * (1 - smoothstep(0.93, 1, k))),
        exit: () => { g.hud.showPanel(null); g.give('letter:2'); g.hud.notify('A letter, in your bag. <b>B</b>, then <i>Letters</i>, to read it again and write back.'); },
      },
      {
        line: { text: SKY_POSTMAN.after }, dur: 5,
        enter: () => { pl.pose = { touchChest: 1 }; },
        tick: (k, dt) => {
          g.hud.setFade((1 - smoothstep(0, 0.3, k)) * 0.9, '#2a2436');
          place(hover.clone().lerp(away, smoothstep(0.25, 1, k)), Math.sin(g.time * 1.3) * 0.06); anim(dt);
          g.cutCam = { pos: pl.pos.clone().addScaledVector(fwd, -6).addScaledVector(up, 2.4 + k * 3), look: pm.root.position.clone(), up };
        },
        exit: () => { pm.root.visible = false; pl.pose = {}; pl.lookAt = null; g.save(); },
      },
    ];
  }

  /** Sit at an easel: the camera settles on the view, and the sketch draws itself (as in World 1). */
  sketchBeats(vp: typeof SKY_VIEWPOINTS[number]): Beat[] {
    const g = this.g, pl = g.player;
    const from = this.at(vp.at), up = from.clone().sub(this.p.center).normalize();
    const target = this.at([vp.look[1], vp.look[2]]);
    const dir = target.clone().sub(from).projectOnPlane(up).normalize();
    const cam = { pos: from.clone().addScaledVector(up, 2.4).addScaledVector(dir, 0.6), look: target.clone().addScaledVector(up, 3), up };
    const right = new THREE.Vector3().crossVectors(up, dir).normalize();
    const settle = (k: number) => ({ pos: from.clone().addScaledVector(dir, -3.6 + k * 0.9).addScaledVector(right, 1.5).addScaledVector(up, 2.3 + k * 0.5),
      look: from.clone().lerp(target, 0.35 + k * 0.1).addScaledVector(up, 2.2), up });
    let sk: ReturnType<typeof makeSketch> | null = null;
    let view: HTMLElement | null = null;
    const already = g.sketches.some(s => s.id === vp.id);
    return [
      {
        dur: 3.4,
        enter: () => {
          pl.placeAt(this.p, this.dir(vp.at));
          pl.facing.copy(dir); pl.pose = { sit: 1 }; pl.sync();
          g.cutCam = settle(0);
          g.hud.setGoal(null);
        },
        tick: k => { g.cutCam = settle(k * k * (3 - 2 * k)); },
      },
      {
        dur: 7, line: { text: vp.label },
        enter: () => {
          pl.root.visible = false; g.fold.root.visible = false;
          g.cutCam = cam; g.camera.position.copy(cam.pos); g.camera.up.copy(cam.up); g.camera.lookAt(cam.look);
          g.composer.render();
          const c = g.renderer.domElement;
          sk = makeSketch(c, c.width, c.height);
          view = document.createElement('div'); view.className = 'sketchview';
          view.append(sk.canvas);
          document.getElementById('ui')!.append(view);
          g.sound.sfxPlay('paper');
        },
        tick: k => sk?.draw(Math.min(1, k * 1.25)),
        exit: () => {
          if (sk && !already) { g.sketches.push({ id: vp.id, label: vp.label, img: sk.jpeg() }); g.hud.notify(NOTE.sketch); }
          view?.remove(); view = null;
          pl.pose = {}; pl.root.visible = true; g.fold.root.visible = true;
          g.save();
        },
      },
    ];
  }
}

/** A little easel with a blank page (the same as World 1's). */
function easel(): THREE.Group {
  const e = new THREE.Group();
  const legM = Props.toon('#7a5a34');
  for (const [x, z, r] of [[-0.25, 0.1, 0.18], [0.25, 0.1, -0.18], [0, -0.25, 0]] as const) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.3, 5), legM); l.position.set(x, 0.62, z); l.rotation.z = r; l.rotation.x = z < 0 ? -0.25 : 0.12; e.add(l); }
  const page = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.46, 0.03), Props.toon('#f4ead2')); page.position.set(0, 1.05, 0.12); page.rotation.x = -0.18; e.add(page);
  return e;
}

/** The postman's little striped balloon and wicker basket (he stands in the basket, the envelope over him). */
function makeBalloon(): THREE.Group {
  const g = new THREE.Group();
  const cols = ['#e8584a', '#f6ecd4'];
  const lunes = 10;
  for (let i = 0; i < lunes; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.25, 4, 14, (i / lunes) * Math.PI * 2, (Math.PI * 2) / lunes, 0, Math.PI * 0.82), Props.toon(cols[i % 2]));
    m.position.y = 3.0; m.scale.y = 1.15;
    g.add(m);
  }
  // the neck and the ropes down to the basket
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.22, 0.5, 10, 1, true), Props.toon('#e8584a'));
  (neck.material as THREE.Material).side = THREE.DoubleSide;
  neck.position.y = 1.72; g.add(neck);
  const rope = Props.toon('#6a5038');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.25, 4), rope);
    const top = new THREE.Vector3(Math.cos(a) * 0.24, 1.5, Math.sin(a) * 0.24), bot = new THREE.Vector3(Math.cos(a) * 0.36, 0.42, Math.sin(a) * 0.36);
    r.position.copy(top).add(bot).multiplyScalar(0.5);
    r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
    g.add(r);
  }
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.33, 0.46, 10), Props.toon('#b8864a'));
  basket.position.y = 0.2; g.add(basket);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 5, 14), Props.toon('#7a5530'));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.43; g.add(rim);
  // a sandbag on a hook, and a little pennant
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), Props.toon('#c8b48a'));
  bag.position.set(0.44, 0.2, 0); g.add(bag);
  return g;
}
