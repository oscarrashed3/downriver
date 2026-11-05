// Chapter One: Where the Water Begins. Everything that happens in the Spring Peaks lives here.
import * as THREE from 'three';
import type { Game } from '../game';
import type { Beat } from './sequencer';
import type { Npc } from '../systems/npc';
import type { WorldContent } from '../world/content';
import type { Planet } from '../world/planet';
import { PK } from '../world/peaks';
import * as Props from '../world/props';
import { orientTo, anyTangent } from '../world/sphere';
import { clamp, lerp, smoothstep } from '../world/noise';
import { SCRIPTS } from '../data/scripts';
import { NOTE, PROMPT, DOORS } from '../data/words';
import { CAMPFIRE, WINTER_LINES, DAWN_LINES, FAREWELL, KITE_GIFT, KITE_FLIGHT, POSTMAN, ECHOES, NOT_YET } from '../data/story';
import { passWinter, isHealed, projectedSnowpack } from '../systems/snowpack';
import { currentStep, invitedCount, lanternsLit, FRIENDS } from './quests';
import { letterPanel } from './panels';
import { makePostman, type Postman } from '../world/postman';
import { bagAdd, bagTake } from '../systems/backpack';
import { makeSketch } from '../systems/sketch';
import type { Hollo } from '../world/hollo';
import type { CamPose } from '../systems/skyView';

/** Viewpoints: sit, and the view draws itself into the sketchbook. */
export const VIEWPOINTS = [
  { id: 'vp-spring', at: [17.4, 12.6], look: [13.2, 0], label: 'Hollo, asleep on the spring' },
  { id: 'vp-ridge', at: [48.2, 41.5], look: [66, 0], label: 'From Kite Ridge, the whole valley' },
  { id: 'vp-bridge', at: [79.5, 8.5], look: [70, -12], label: "Odo's bridge, and the village behind it" },
];

const POLE_READINGS = [{ now: 1.1, old: 2.6 }, { now: 0.9, old: 2.3 }, { now: 0.8, old: 2.1 }];

interface Goat { obj: THREE.Object3D; home: THREE.Vector3; dir: THREE.Vector3; t: number; look: number }
interface Home { pos: THREE.Vector3; up: THREE.Vector3; fwd: THREE.Vector3 }

export class ChapterOne {
  p: Planet;
  c: WorldContent;
  R: Record<string, any>;
  home: Record<string, Home> = {};
  rainT = 0;
  avalancheT = -1;
  captionT = 0;
  kiteK = 0;
  kiteString: THREE.Line;
  pebbleDir = new THREE.Vector3();
  torAway = false;
  keepNoted = false;
  peopleAway = false;
  hollo: Hollo;
  postman: Postman;
  bridgeLamps: THREE.Mesh[] = [];
  vpMarkers: THREE.Object3D[] = [];
  beam: THREE.Mesh;
  frozenMat: THREE.Material;
  springMat: THREE.Material;
  /** Where Hollo stands once he is awake: up on the high shoulder above the spring. */
  static HOLLO_HOME = [25, 16];
  /** Nima running to find you with the snow news: 'wait' until you are free, then 'run'. */
  nimaRun: 'wait' | 'run' | null = null;
  nimaAway = false;
  sparGlow: THREE.Sprite;
  windPosts: Record<string, THREE.Mesh> = {};

  constructor(private g: Game) {
    this.p = g.planets[0];
    this.c = g.contents[0];
    this.R = this.c.refs;
    for (const n of this.c.npcs) this.home[n.id] = { pos: n.root.position.clone(), up: n.up.clone(), fwd: n.homeForward.clone() };
    this.pebbleDir.copy((this.R.pebble as THREE.Object3D).position).sub(this.p.center).normalize();
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    this.kiteString = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: '#f4ead2', transparent: true, opacity: 0.8 }));
    this.kiteString.frustumCulled = false; this.kiteString.visible = false;
    g.scene.add(this.kiteString);
    this.hollo = this.R.hollo as Hollo;
    // the spring is ice while Hollo sleeps on it
    const water = this.R.spring.userData.water as THREE.Mesh;
    this.springMat = water.material as THREE.Material;
    this.frozenMat = Props.toon('#e6f0f8', '#c8dcec', 0.1);
    water.material = this.frozenMat;
    // stupa sites are not part of this story: hide their cairns
    for (const s of g.snow.sites) if (s.kind !== 'fence') (this.R.cairns[s.id] as THREE.Object3D).visible = false;
    // three lanterns on Odo's bridge, one for each thing that wakes Hollo
    const bridge = this.at(PK.bridge);
    const bup = bridge.clone().sub(this.p.center).normalize();
    [-1, 0, 1].forEach(k => {
      const post = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), Props.toon('#5a3a24')); pole.position.y = 1.1; post.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), Props.toon('#5a3a24')); arm.position.set(0.22, 2.15, 0); post.add(arm);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: '#4a4058' }));
      lamp.position.set(0.44, 1.9, 0); lamp.scale.y = 1.25; post.add(lamp);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 6), Props.toon('#3a2a20')); cap.position.set(0.44, 2.18, 0); post.add(cap);
      const d = this.p.dirRiver(PK.bridge[0] + k * 1.6, PK.bridge[1] + 3.2);
      this.p.surfacePoint(d, 0.1, post.position);
      orientTo(post, d, bridge.clone().sub(post.position));
      g.scene.add(post); this.bridgeLamps.push(lamp);
    });
    void bup;
    // one golden beam that stands over the next place to go
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 140, 16, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; uniform float uT, uA; void main(){ float v = vUv.y; float a = pow(1.0 - v, 2.2) * (0.55 + 0.45 * sin(v * 40.0 - uT * 3.0)) * (0.6 + 0.4 * abs(sin(vUv.x * 6.283 * 3.0))); gl_FragColor = vec4(1.0, 0.82, 0.45, a * uA); }',
    }));
    this.beam.frustumCulled = false; this.beam.renderOrder = 5;
    g.scene.add(this.beam);
    // viewpoint markers: a little easel with a blank page
    for (const vp of VIEWPOINTS) {
      const e = new THREE.Group();
      const legM = Props.toon('#7a5a34');
      for (const [x, z, r] of [[-0.25, 0.1, 0.18], [0.25, 0.1, -0.18], [0, -0.25, 0]] as const) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.3, 5), legM); l.position.set(x, 0.62, z); l.rotation.z = r; l.rotation.x = z < 0 ? -0.25 : 0.12; e.add(l); }
      const page = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.46, 0.03), Props.toon('#f4ead2')); page.position.set(0, 1.05, 0.12); page.rotation.x = -0.18; e.add(page);
      const d = this.p.dirRiver(vp.at[0], vp.at[1]);
      this.p.surfacePoint(d, -0.05, e.position);
      orientTo(e, d, this.at(vp.look).sub(e.position).negate());
      g.scene.add(e);
      this.vpMarkers.push(e);
    }
    // a soft glow on the willow branch once Tor has asked for it
    this.sparGlow = glowSprite('rgba(255,214,110,1)');
    this.sparGlow.position.copy((this.R.spar as THREE.Object3D).position).addScaledVector((this.R.spar as THREE.Object3D).position.clone().sub(this.p.center).normalize(), 0.3);
    this.sparGlow.scale.setScalar(3.2);
    g.scene.add(this.sparGlow);
    this.postman = makePostman();
    this.postman.root.visible = false;
    g.scene.add(this.postman.root);
    this.register();
  }

  npc(id: string): Npc { return this.c.npcs.find(n => n.id === id)!; }
  ll(lat: number, lon: number) { return this.p.dirRiver(lat, lon); }
  at(ll: number[], off = 0) { return this.p.surfacePoint(this.p.dirRiver(ll[0], ll[1]), off); }
  has(f: string) { return this.g.flags.has(f); }

  /** Stand a person somewhere for a scene, facing a point. */
  stand(n: Npc, ll: number[], face: THREE.Vector3, pose: Npc['pose'] = {}) {
    const d = this.p.dirRiver(ll[0], ll[1]);
    const pos = this.p.surfacePoint(d, -0.05);
    n.place(pos, d, face.clone().sub(pos));
    n.pose = pose;
  }
  sendHome(n: Npc) {
    const h = this.home[n.id];
    n.place(h.pos, h.up, h.fwd);
    n.pose = {}; n.faceOverride = null; n.speedShown = 0; n.lookAt = null;
  }

  // ------------------------------------------------------------------ interactables
  register() {
    const g = this.g, R = this.R, add = (it: WorldContent['interactables'][number]) => this.c.interactables.push(it);
    const pos = (o: THREE.Object3D) => o.position.clone();
    // things on the ground: Nilo walks up to arm's length, kneels and reaches
    const pickup = (at: () => THREE.Vector3) => () => {
      const p = at(), pl = g.player, d = pl.pos.clone().sub(p).projectOnPlane(pl.up);
      if (d.lengthSq() < 1e-4) d.copy(pl.facing).negate();
      return { spot: p.clone().addScaledVector(d.normalize(), 0.75), face: p, kneel: true };
    };
    // seats: stand just in front, facing the way the seat faces, then sit back onto it
    const seatAt = (o: THREE.Object3D) => () => {
      const up = o.position.clone().sub(this.p.center).normalize();
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion).projectOnPlane(up).normalize();
      const spot = o.position.clone().addScaledVector(fwd, 0.75);
      return { spot, face: spot.clone().addScaledVector(fwd, 3) };
    };

    // The willow branch by the old tree, for Tor's kite.
    add({
      id: 'spar', world: 0, pos: pos(R.spar), radius: 3.2, walkTo: pickup(() => pos(R.spar)),
      label: () => (this.has('item:spar') || this.has('kite-flown') ? null : PROMPT.willow),
      act: () => { g.give('item:spar'); (R.spar as THREE.Object3D).visible = false; g.sound.sfxPlay('soft'); g.hud.notify(NOTE.willow); g.save(); },
    });

    // Fence and ice tower sites
    for (const site of g.snow.sites) {
      const cairn = R.cairns[site.id] as THREE.Object3D;
      add({
        id: site.id, world: 0, pos: pos(cairn), radius: 5,
        label: () => {
          const s = g.snow.sites.find(x => x.id === site.id)!;
          if (s.built) return null;
          if (s.kind === 'fence') {
            if (!this.has('flag:tor-fences')) return this.has('quest:hollo') ? PROMPT.fencePosts : null;
            if (g.skyread.active) return s.windExposure > 0.5 ? PROMPT.fenceWindy : PROMPT.fenceCalm;
            return this.has('power:skyreading') ? PROMPT.fenceQ : PROMPT.fence;
          }
          return null;
        },
        act: () => { if (site.kind !== 'fence' || !this.has('flag:tor-fences')) return; this.buildSite(site.id); },
      });
    }

    // Grandpa's snow poles
    (R.poles as { obj: THREE.Object3D }[]).forEach((pole, i) => add({
      id: 'pole' + i, world: 0, pos: pos(pole.obj), radius: 4,
      label: () => PROMPT.pole,
      act: () => {
        const r = POLE_READINGS[i];
        g.hud.notify(NOTE.pole(i + 1, r.now, r.old));
        g.sound.sfxPlay('soft');
        g.polesRead.add(i);
        if (g.polesRead.size === 3) g.give('journal:poles');
        g.save();
      },
    }));

    // The campfire: warm hands, or the long night when the mountain is ready
    add({
      id: 'fire', world: 0, pos: pos(R.fire), radius: 4.5,
      label: () => PROMPT.warm,
      act: () => { g.player.warmth = 1; g.hud.notify(NOTE.warm); },
    });
    add({
      id: 'hollofire', world: 0, pos: pos(R.holloFire), radius: 4.5,
      // when everyone is gathered, Nilo walks to his seat by the fire before the long night begins
      walkTo: () => (this.has('gathered') && !this.has('peaks-healed') ? { spot: this.at([PK.holloFire[0] + Math.cos(0.3) * 2.2, PK.holloFire[1] + Math.sin(0.3) * 2.6]), face: pos(R.holloFire) } : null),
      label: () => {
        if (!(R.holloFire as THREE.Object3D).visible || this.has('peaks-healed')) return null;
        return this.has('gathered') ? PROMPT.sitFire : PROMPT.warm;
      },
      act: () => {
        if (this.has('gathered') && !this.has('peaks-healed')) { g.cut(this.campfireNight()); return; }
        g.player.warmth = 1;
        g.hud.notify(NOTE.notGathered(invitedCount(g.questCtx())));
      },
    });
    // Hollo himself: you can't wake him, but you can sit with him
    add({
      id: 'hollo', world: 0, get pos() { return R.hollo.root.position; }, radius: 7,
      label: () => (this.has('peaks-healed') ? PROMPT.holloAwake : PROMPT.hollo),
      act: () => {
        g.sound.sfxPlay('soft'); g.fold.hop();
        g.hud.notify(this.has('peaks-healed') ? NOTE.holloHello : NOTE.holloAsleep(lanternsLit(g.questCtx())));
      },
    } as any);

    // Nima's little cloud
    add({
      id: 'wisp', world: 0, pos: pos(R.wisp), radius: 9,
      label: () => (this.has('item:bottle') && !this.has('cloud-caught') ? PROMPT.catchCloud : null),
      act: () => {
        g.give('cloud-caught'); g.sound.sfxPlay('chime');
        bagTake(g.bag, 'item:bottle'); g.give('item:cloud');
        (R.wisp as THREE.Group).scale.setScalar(0.35);
        g.hud.notify(NOTE.cloudCaught);
        g.save();
      },
    });
    add({
      id: 'meadow', world: 0, pos: this.at(PK.dryMeadow), radius: 8,
      label: () => (this.has('cloud-caught') && !this.has('journal:cloud') ? PROMPT.releaseCloud : null),
      act: () => { this.rainT = 7; g.sound.sfxPlay('splash'); this.greenMeadow(); bagTake(g.bag, 'item:cloud'); g.give('journal:cloud'); g.save(); },
    });

    // Viewpoints
    VIEWPOINTS.forEach((vp, i) => add({
      id: vp.id, world: 0, pos: this.vpMarkers[i].position.clone(), radius: 3.2,
      walkTo: () => { const at = this.at(vp.at); return { spot: at, face: this.at(vp.look) }; },
      label: () => (g.sketches.some(sk => sk.id === vp.id) ? PROMPT.sketchAgain : PROMPT.sketch),
      act: () => g.cut(this.sketchBeats(vp)),
    }));

    // Benches: sit and watch the day go by
    (R.benches as THREE.Object3D[]).forEach((b, i) => add({
      id: 'bench' + i, world: 0, pos: pos(b), radius: 2.4, walkTo: seatAt(b),
      label: () => (g.npcsNear(b.position, 1.5) ? null : PROMPT.bench),
      act: () => g.sit(b),
    }));

    // Echo stones: hold still and listen
    (R.echoes as THREE.Object3D[]).forEach((e, i) => add({
      id: 'echo' + i, world: 0, pos: pos(e), radius: 3.2, hold: 3,
      label: () => (this.has('echo:' + i) ? null : PROMPT.stone),
      act: () => {
        g.give('echo:' + i); g.give('echo:any');
        e.userData.heard = true; (e.userData.glow as THREE.MeshBasicMaterial).opacity = 0.85;
        g.hud.showCaption(null, `<i>${ECHOES[i]}</i>`); this.captionT = 7;
        g.sound.melody([74, 0, 78, 81, 0, 78, 74], 0.3);
        if ([0, 1, 2, 3, 4].every(k => this.has('echo:' + k))) { g.give('echo:all'); g.give('journal:echoes'); }
        g.save();
      },
    }));

    // Mountain flowers to give away
    PK.flowers.forEach((ll, i) => add({
      id: 'flower' + i, world: 0, pos: this.at(ll), radius: 4, walkTo: pickup(() => this.at(ll)),
      label: () => (this.has('picked:' + i) || g.bag.filter(b => b === 'item:flower').length >= 2 ? null : PROMPT.flower),
      act: () => {
        if (!bagAdd(g.bag, 'item:flower')) { g.hud.notify(NOTE.bagFull); return; }
        g.flags.add('picked:' + i); g.sound.sfxPlay('soft');
        g.hud.notify(NOTE.flower);
      },
    }));

    // Goats to pet, and Pebble the runaway
    (R.goats as Goat[]).forEach((gt, i) => add({
      id: 'goat' + i, world: 0, get pos() { return gt.obj.position; }, radius: 2.4,
      label: () => PROMPT.petGoat,
      act: () => { gt.look = 2.5; g.sound.sfxPlay('bleat'); g.fold.hop(); },
    } as any));
    const pebble = R.pebble as THREE.Object3D;
    add({
      id: 'pebble', world: 0, get pos() { return pebble.position; }, radius: 3, hold: 2.5,
      label: () => (this.has('goat-home') ? PROMPT.petPebble : this.has('goat-following') ? null : this.has('quest:goat') ? PROMPT.pebble : PROMPT.pebbleLost),
      act: () => {
        if (this.has('goat-home')) { g.sound.sfxPlay('bleat'); return; }
        if (!this.has('quest:goat')) return;
        g.flags.add('goat-following'); g.sound.sfxPlay('bleat');
        g.hud.notify(NOTE.pebbleFollows);
      },
    } as any);

    // Doors in the village: walk up and press E. Some open onto a small room, some are shut for now.
    const doors: [keyof typeof DOORS, THREE.Object3D][] = [
      ['tor', R.houses.tor], ['ysolde', R.houses.ysolde], ['nima', R.houses.nima], ['bram', R.houses.bram], ['empty', R.houses.empty], ['odo', R.boathouse],
    ];
    for (const [who, h] of doors) {
      const d = DOORS[who] as { whose: string; inside?: string; locked?: string };
      const at = h.localToWorld((h.userData.doorAt as THREE.Vector3).clone());
      const open = () => !!d.inside && (!d.locked || (who === 'bram' && this.has('goat-home')));
      add({
        id: 'door:' + who, world: 0, pos: at, radius: 1.7,
        label: () => (open() ? PROMPT.door(d.whose) : PROMPT.doorLocked(d.whose)),
        act: () => {
          if (!open()) { g.sound.sfxPlay('soft'); g.hud.notify(d.locked!); return; }
          g.enterRoom(who as 'tor' | 'ysolde' | 'nima' | 'bram', (h.userData.wall as string) ?? '#f1e6d2', d.inside!);
        },
      });
    }

    // The bridge: goodbyes
    add({
      id: 'farewell', world: 0, pos: pos(R.bridge), radius: 6,
      label: () => (this.has('boat-ready') && !this.has('chapter1-complete') ? PROMPT.goodbye : null),
      act: () => g.cut(this.farewell()),
    });
    // The dock below the bridge
    add({
      id: 'dock0', world: 0, pos: this.at(PK.dock), radius: 3.5,
      label: () => PROMPT.raft,
      act: () => { if (this.has('peaks-healed')) g.boardRaft(); else g.hud.notify(NOT_YET.thinRiver); },
    });
    // The edge of the world
    add({
      id: 'edge0', world: 0, pos: pos(R.edge), radius: 10,
      label: () => (this.has('chapter1-complete') ? PROMPT.ride : PROMPT.edge),
      act: () => { if (this.has('chapter1-complete')) g.startRide(0, 1); else g.hud.notify(NOT_YET.edgeEarly); },
    });
  }

  greenMeadow() { (this.R.meadow as THREE.Mesh[]).forEach(m => (m.material = Props.toon('#8ad04a', '#6ab03a', 0.25))); }

  buildSite(id: string) {
    const g = this.g;
    const s = g.snow.sites.find(x => x.id === id)!;
    if (s.built) return;
    s.built = true;
    this.placeBuilt(id);
    g.sound.sfxPlay('build'); g.fold.hop();
    if (s.kind === 'stupa') {
      g.give('built-stupa');
      if (!this.has('flag:asked-bram')) {
        g.flags.add('stupa-without-asking');
        const m = g.moods.bram ?? { ...SCRIPTS.bram.start };
        m.trust = Math.max(0, m.trust - 0.2); g.moods.bram = m;
        g.hud.notify('The ice tower rises. Down by the village, the meadow channel runs dry.');
      } else g.hud.notify('The ice tower rises, fed from the high channel Bram offered.');
    } else {
      g.give('built-fence');
      g.hud.notify(s.windExposure > 0.5 ? NOTE.fenceHums : NOTE.fenceQuiet);
    }
    g.save();
  }

  placeBuilt(id: string) {
    const spots = this.R.siteSpots as Record<string, [number, number]>;
    const [la, lo] = spots[id];
    const p = this.p;
    const obj = id.startsWith('stupa') ? Props.stupa() : Props.fence();
    obj.traverse(m => { (m as THREE.Mesh).castShadow = true; });
    const d = p.dirRiver(la, lo);
    p.surfacePoint(d, -0.2, obj.position);
    orientTo(obj, d, p.surfacePoint(p.dirRiver(la, lo + 3)).sub(obj.position));
    this.g.scene.add(obj);
    (this.R.cairns[id] as THREE.Object3D).visible = false;
  }

  placeNewStone(v: number) {
    const p = this.p;
    const obj = Props.stone(2.4, true);
    const lat = 4 + v * 35 + 1;
    const d = p.dirRiver(lat, 17.5);
    p.surfacePoint(d, -0.15, obj.position);
    orientTo(obj, d);
    this.g.scene.add(obj);
    this.c.landmarks.push({ world: 'peaks', name: 'The newest stone', lat, lon: 17.5, icon: 'stone' });
  }

  /** Bring the world in line with a loaded save. */
  restore() {
    const g = this.g, R = this.R;
    if (this.has('item:spar') || this.has('kite-flown')) (R.spar as THREE.Object3D).visible = false;
    for (const s of g.snow.sites) if (s.built) this.placeBuilt(s.id);
    if (this.has('cloud-caught')) (R.wisp as THREE.Object3D).scale.setScalar(0.35);
    if (this.has('journal:cloud')) this.greenMeadow();
    if (g.snow.winters > 0) this.placeNewStone(g.snow.snowpack);
    (R.echoes as THREE.Object3D[]).forEach((e, i) => { if (this.has('echo:' + i)) { e.userData.heard = true; (e.userData.glow as THREE.MeshBasicMaterial).opacity = 0.85; } });
    g.flags.delete('goat-following');
    if (this.has('goat-home')) this.pebbleHome();
    g.flags.delete('flag:tor-follow-active');
    (R.spring.userData.drop as THREE.Object3D).visible = false;
    if (this.has('peaks-healed')) this.holloAwake();
    if (this.has('quest:night') && !this.has('peaks-healed')) (R.holloFire as THREE.Object3D).visible = true;
    if (this.has('quest:night') && !this.has('invited:nima')) this.nimaRun = 'wait';
  }

  /** Hollo up on the high shoulder, standing, eyes open; the spring free and running. */
  holloAwake() {
    const h = this.hollo, [la, lo] = ChapterOne.HOLLO_HOME;
    h.rise = 1; h.eyeOpen = 1;
    const d = this.p.dirRiver(la, lo);
    this.p.surfacePoint(d, 0.2, h.root.position);
    orientTo(h.root, d, this.at(PK.bridge).sub(h.root.position));
    (this.R.spring.userData.water as THREE.Mesh).material = this.springMat;
    (this.R.holloFire as THREE.Object3D).visible = false;
  }

  pebbleHome() {
    this.pebbleDir.copy(this.p.dirRiver(PK.pen[0] + 0.5, PK.pen[1] - 2));
    const pb = this.R.pebble as THREE.Object3D;
    this.p.surfacePoint(this.pebbleDir, -0.05, pb.position);
    orientTo(pb, this.pebbleDir);
  }

  afterTalk(id: string) {
    const g = this.g;
    if (id === 'tor' && this.has('flag:tor-follow')) bagTake(g.bag, 'item:spar');
    if (id === 'bram' && this.has('flag:tor-fences') && !this.has('got-rails')) { g.flags.add('got-rails'); g.give('item:rails'); }
    if (id === 'nima' && this.has('invited:nima') && this.has('quest:night')) this.nimaAway = true;
    if (id === 'tor' && this.has('flag:tor-follow') && !this.has('kite-flown')) {
      g.flags.add('flag:tor-follow-active');
      g.hud.notify(NOTE.torFollows);
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number, whistled: boolean) {
    const g = this.g, pl = g.player, p = this.p;
    if (this.captionT > 0) { this.captionT -= dt; if (this.captionT <= 0 && g.mode === 'play') g.hud.showCaption(null, null); }
    if (this.rainT > 0) this.rainT -= dt;

    // Night lanterns
    const night = 1 - g.day.day;
    for (const l of this.R.lanterns as THREE.Object3D[]) ((l.userData.lamp as THREE.Mesh).material as THREE.MeshToonMaterial).emissiveIntensity = 0.3 + night * 2.2;

    // Ambient sound by place
    const dist = (o: THREE.Object3D) => o.position.distanceTo(pl.pos);
    g.sound.amb.fire = clamp(1 - dist(this.R.fire) / 14);
    g.sound.amb.chimes = clamp(1 - dist(this.R.tree) / 20);
    g.sound.amb.birds = g.day.day;

    // Goats wander a little around home, and look up when petted or whistled at
    for (const gt of this.R.goats as Goat[]) {
      gt.t += dt;
      if (whistled && dist(gt.obj) < 20) gt.look = 1.5;
      gt.look = Math.max(0, gt.look - dt);
      const ta = anyTangent(gt.home), tb = new THREE.Vector3().crossVectors(gt.home, ta);
      const k = gt.look > 0 ? 0 : 1;
      const goal = gt.home.clone().addScaledVector(ta, Math.sin(gt.t * 0.07) * 2.2 / p.R).addScaledVector(tb, Math.cos(gt.t * 0.05 + 1) * 2.2 / p.R).normalize();
      const prev = gt.dir.clone();
      gt.dir.lerp(goal, 1 - Math.exp(-0.6 * dt * k)).normalize();
      p.surfacePoint(gt.dir, -0.05, gt.obj.position);
      const mv = gt.dir.clone().sub(prev);
      const face = gt.look > 0 ? pl.pos.clone().sub(gt.obj.position) : mv.lengthSq() > 1e-12 ? mv : new THREE.Vector3(0, 0, 1).applyQuaternion(gt.obj.quaternion);
      orientTo(gt.obj, gt.dir, face.projectOnPlane(gt.dir).lengthSq() > 1e-8 ? face : ta);
      if (gt.look > 2) gt.obj.position.addScaledVector(gt.dir, Math.abs(Math.sin(gt.look * 12)) * 0.12);
    }

    // Pebble follows you home, if you walk
    const pb = this.R.pebble as THREE.Object3D;
    if (this.has('goat-following')) {
      const speed = pl.vel.clone().projectOnPlane(pl.up).length();
      if (speed > 7.5) {
        g.flags.delete('goat-following'); g.sound.sfxPlay('bleat');
        g.hud.notify(NOTE.pebbleStartles);
      } else {
        const behind = pl.pos.clone().addScaledVector(pl.facing, -1.8);
        const goal = behind.sub(p.center).normalize();
        if (pb.position.distanceTo(pl.pos) > 2.2) this.pebbleDir.lerp(goal, 1 - Math.exp(-2.5 * dt)).normalize();
        const prev = pb.position.clone();
        p.surfacePoint(this.pebbleDir, -0.05, pb.position);
        const mv = pb.position.clone().sub(prev);
        if (mv.lengthSq() > 1e-6) orientTo(pb, this.pebbleDir, mv);
        pb.position.addScaledVector(this.pebbleDir, Math.abs(Math.sin(g.time * 10)) * 0.04 * clamp(mv.length() * 30));
        if (g.mode === 'play' && pb.position.distanceTo(this.npc('bram').root.position) < 7) {
          g.flags.delete('goat-following');
          g.give('goat-home'); g.give('map:pasture');
          g.sound.sfxPlay('bleat');
          g.hud.notify(NOTE.pebbleHome);
          this.npc('bram').smileT = 4;
          this.pebbleHome();
          g.save();
        }
      }
    }

    // Tor walks with you to the ridge
    const tor = this.npc('tor');
    if (this.has('flag:tor-follow-active') && g.mode === 'play') {
      const goal = pl.pos.clone().addScaledVector(pl.facing, -2.2).addScaledVector(new THREE.Vector3().crossVectors(pl.up, pl.facing), 1.2);
      const gd = goal.sub(p.center).normalize();
      const td = tor.root.position.clone().sub(p.center).normalize();
      const gap = tor.root.position.distanceTo(pl.pos);
      const prev = td.clone();
      if (gap > 2.6) td.lerp(gd, 1 - Math.exp(-(gap > 12 ? 4 : 1.8) * dt)).normalize();
      tor.up.copy(td);
      p.surfacePoint(td, -0.05, tor.root.position);
      const mv = td.clone().sub(prev);
      tor.speedShown = lerp(tor.speedShown, clamp(mv.length() * p.R / Math.max(dt, 1e-3), 0, 9), 0.2);
      tor.faceOverride = mv.lengthSq() > 1e-10 ? mv.multiplyScalar(1e3) : null;
      if (tor.root.position.distanceTo(this.at(PK.ridge)) < 11 && pl.pos.distanceTo(this.at(PK.ridge)) < 12) {
        g.flags.delete('flag:tor-follow-active');
        tor.speedShown = 0; tor.faceOverride = null;
        g.cut(this.kiteFlight());
      }
    }
    if (this.has('kite-flown') && !this.torAway && g.mode === 'play' && tor.root.position.distanceTo(pl.pos) > 45) this.sendHome(tor);
    this.updateNima(dt);
    if (this.nimaAway && g.mode === 'play' && this.npc('nima').root.position.distanceTo(pl.pos) > 45) { this.nimaAway = false; this.sendHome(this.npc('nima')); }
    // the broken kite waits on the bench; the willow branch glows once Tor needs it
    (this.R.benchKite as THREE.Object3D).visible = !this.has('flag:tor-follow') && !this.has('kite-flown');
    const sparWanted = this.has('quest:kite') && !this.has('item:spar') && !this.has('kite-flown');
    (this.sparGlow.material as THREE.SpriteMaterial).opacity = sparWanted ? 0.8 + Math.sin(g.time * 2.4) * 0.2 : 0;
    this.sparGlow.visible = sparWanted;
    if (this.peopleAway && g.mode !== 'cut' && g.player.pos.distanceTo(this.at(PK.bridge)) > 45) {
      this.peopleAway = false;
      for (const n of this.c.npcs) this.sendHome(n);
    }
    // Departure: friends wave from the bank until the raft is far away
    if (g.departure) for (const n of this.c.npcs) n.pose = { wave: n.root.position.distanceTo(pl.pos) < 40 ? 1 : 0 };

    // Reading the wind on Kite Ridge
    if (g.skyread.active && !this.has('saw-wind') && pl.pos.distanceTo(this.at(PK.ridge)) < 18) {
      g.give('saw-wind'); g.give('journal:where-snow-goes');
      g.hud.notify(NOTE.windSeen);
      g.save();
    }
    if (!this.has('fences-done') && this.has('flag:tor-fences') && projectedSnowpack(g.snow) >= 0.7 - 1e-6) {
      g.give('fences-done'); g.give('journal:fences'); bagTake(g.bag, 'item:rails');
      setTimeout(() => {
        g.give('quest:night');
        (this.R.holloFire as THREE.Object3D).visible = true;
        g.sound.sfxPlay('chime');
        g.hud.notify(NOTE.lantern2);
        this.nimaRun = 'wait';
        g.save();
      }, 2500);
      g.save();
    }
    if (this.has('quest:night') && !this.has('gathered') && FRIENDS.every(f => this.has('invited:' + f))) {
      g.give('gathered'); g.sound.sfxPlay('chime');
      g.hud.notify(NOTE.lantern3);
      g.save();
    }
    this.updateGuides(dt);
    if (this.has('flag:route-east') && !this.has('avalanche')) { g.flags.add('avalanche'); this.avalancheT = 0; }
    this.updateAvalanche(dt);
    this.updateCairns();
  }

  /** Once the fences are done, Nima comes running with the news. She finds you; you don't have to find her. */
  updateNima(dt: number) {
    const g = this.g, pl = g.player, p = this.p, nima = this.npc('nima');
    if (!this.nimaRun || this.has('invited:nima')) { this.nimaRun = null; return; }
    if (g.mode !== 'play') return;
    if (this.nimaRun === 'wait') {
      // she appears out of sight up the path behind you, about 26 m away, and runs in
      const back = pl.facing.clone().negate().projectOnPlane(pl.up).normalize();
      const d = pl.up.clone().applyAxisAngle(new THREE.Vector3().crossVectors(pl.up, back).normalize(), 26 / p.R);
      const pos = p.surfacePoint(d, -0.05);
      nima.place(pos, d, pl.pos.clone().sub(pos));
      nima.pose = {};
      this.nimaRun = 'run';
    }
    const td = nima.root.position.clone().sub(p.center).normalize();
    const gap = nima.root.position.distanceTo(pl.pos);
    if (gap < 2.4) {
      this.nimaRun = null; nima.speedShown = 0; nima.faceOverride = null;
      g.startTalk(nima);
      return;
    }
    const gd = pl.pos.clone().sub(p.center).normalize();
    const ang = td.angleTo(gd), step = Math.min(1, (6 * dt / p.R) / Math.max(ang, 1e-6));
    const prev = td.clone();
    td.lerp(gd, step).normalize();
    nima.up.copy(td);
    p.surfacePoint(td, -0.05, nima.root.position);
    nima.speedShown = 6;
    nima.faceOverride = td.clone().sub(prev).multiplyScalar(1e3);
  }

  /** The bridge lanterns, and the golden beam over the next place to go. */
  updateGuides(dt: number) {
    const g = this.g, c = g.questCtx(), lit = lanternsLit(c);
    this.bridgeLamps.forEach((l, i) => (l.material as THREE.MeshBasicMaterial).color.set(i < lit ? '#ffd27a' : '#4a4058'));
    const target = this.guideTarget();
    const u = (this.beam.material as THREE.ShaderMaterial).uniforms;
    u.uT.value += dt;
    const near = target ? target.distanceTo(g.player.pos) : 0;
    const want = target && g.mode === 'play' && near > 9 ? clamp((near - 9) / 12) * (0.5 + 0.5 * (1 - g.day.day * 0.4)) : 0;
    u.uA.value = lerp(u.uA.value, want, 1 - Math.exp(-3 * dt));
    this.beam.visible = u.uA.value > 0.01;
    if (target) {
      const up = target.clone().sub(this.p.center).normalize();
      this.beam.position.copy(target).addScaledVector(up, 68);
      this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    }
  }

  guideTarget(): THREE.Vector3 | null {
    const g = this.g, c = g.questCtx(), s = currentStep(c);
    if (!s || !this.has('read-letter')) return null;
    const npcAt = (id: string) => this.npc(id).root.position.clone();
    switch (s.id) {
      case 'hollo': return npcAt('ysolde');
      case 'wind':
        if (this.has('flag:tor-follow')) return this.at(PK.ridge);
        if (this.has('item:spar')) return npcAt('tor');
        if (this.has('quest:kite')) return (this.R.spar as THREE.Object3D).position.clone();
        return npcAt('tor');
      case 'fences': {
        if (!this.has('goat-home')) return this.has('goat-following') ? npcAt('bram') : this.has('quest:goat') ? (this.R.pebble as THREE.Object3D).position.clone() : npcAt('bram');
        if (!this.has('flag:tor-fences')) return npcAt('bram');
        const next = g.snow.sites.filter(x => x.kind === 'fence' && !x.built).sort((a, b) => b.windExposure - a.windExposure)[0];
        return next ? (this.R.cairns[next.id] as THREE.Object3D).position.clone() : null;
      }
      case 'night': {
        if (this.nimaRun) return npcAt('nima');
        const who = FRIENDS.find(f => !this.has('invited:' + f));
        return who ? npcAt(who) : (this.R.holloFire as THREE.Object3D).position.clone();
      }
      case 'sit': return (this.R.holloFire as THREE.Object3D).position.clone();
      case 'odo': return npcAt('odo');
      case 'farewell': return this.at(PK.bridge);
      default: return null;
    }
  }

  updateCairns() {
    const g = this.g;
    for (const s of g.snow.sites) {
      const ring = (this.R.cairns[s.id] as THREE.Object3D).userData.ring as THREE.Mesh | undefined;
      if (!ring) continue;
      const m = ring.material as THREE.MeshBasicMaterial;
      let target = 0;
      if (!s.built && s.kind === 'fence' && this.has('flag:tor-fences')) target = g.skyread.active ? (s.windExposure > 0.5 ? 0.9 : 0.15) : 0.25;
      if (s.kind !== 'fence') target = 0;
      m.opacity = lerp(m.opacity, target, 0.08);
      ring.scale.setScalar(1 + Math.sin(g.time * 2 + s.windExposure * 5) * 0.06);
    }
    // Skyreading shows each windward spot as a tall glowing post
    for (const s of g.snow.sites) {
      if (s.kind !== 'fence' || s.windExposure < 0.5) continue;
      let post = this.windPosts[s.id];
      if (!post) {
        const at = (this.R.cairns[s.id] as THREE.Object3D).position, up = at.clone().sub(this.p.center).normalize();
        post = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 14, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        post.position.copy(at).addScaledVector(up, 7);
        post.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        g.scene.add(post); this.windPosts[s.id] = post;
      }
      const m = post.material as THREE.MeshBasicMaterial;
      const want = g.skyread.active && !s.built && this.has('flag:tor-fences') ? 0.8 + Math.sin(g.time * 3 + s.windExposure * 4) * 0.2 : 0;
      m.opacity = lerp(m.opacity, want, 0.1);
      post.visible = m.opacity > 0.01;
    }
    const cor = this.R.cornice as THREE.Mesh;
    (cor.material as THREE.MeshToonMaterial).emissive?.set(g.skyread.active && !this.has('avalanche') ? '#ff9a7a' : '#000000');
  }

  updateAvalanche(dt: number) {
    if (this.avalancheT < 0) return;
    this.avalancheT += dt;
    const cor = this.R.cornice as THREE.Mesh;
    if (this.avalancheT < 0.05) { this.g.hud.notify(NOTE.avalanche); this.g.sound.sfxPlay('whoosh'); }
    const k = smoothstep(0, 5, this.avalancheT);
    this.p.surfacePoint(this.p.dirRiver(lerp(42, 50, k), lerp(-92, -88, k)), 0.2 - k * 1.5, cor.position);
    cor.scale.set(1.4 + k, 0.5 - k * 0.3, 0.8 + k * 1.5);
    if (this.avalancheT > 6) this.avalancheT = -1;
  }

  // ------------------------------------------------------------------ scenes
  /** Orbiting shot around a point, low and close. */
  orbit(center: THREE.Vector3, r: number, h: number, a: number): CamPose {
    const up = center.clone().sub(this.p.center).normalize();
    const t1 = anyTangent(up), t2 = new THREE.Vector3().crossVectors(up, t1);
    return { pos: center.clone().addScaledVector(up, h).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r), look: center.clone().addScaledVector(up, 1.1), up };
  }

  /** Sit at a viewpoint: the camera settles on the view, and the sketch draws itself. */
  sketchBeats(vp: typeof VIEWPOINTS[number]): Beat[] {
    const g = this.g, pl = g.player;
    const from = this.at(vp.at), up = from.clone().sub(this.p.center).normalize();
    const target = this.at(vp.look);
    const dir = target.clone().sub(from).projectOnPlane(up).normalize();
    const cam = { pos: from.clone().addScaledVector(up, 2.4).addScaledVector(dir, 0.6), look: target.clone().addScaledVector(up, 3), up };
    let sk: ReturnType<typeof makeSketch> | null = null;
    let view: HTMLElement | null = null;
    const already = g.sketches.some(s => s.id === vp.id);
    return [
      {
        dur: 2.2,
        enter: () => {
          pl.placeAt(this.p, this.p.dirRiver(vp.at[0], vp.at[1]));
          pl.facing.copy(dir); pl.pose = { sit: 1 }; pl.sync();
          pl.root.visible = false; g.fold.root.visible = false;
          g.cutCam = cam;
          g.hud.setGoal(null);
        },
      },
      {
        dur: 7, line: { text: vp.label },
        enter: () => {
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

  /** A shot from the far side of a fire, looking back across it at Hollo, so the giant fills the background. */
  fireCam(fire: THREE.Vector3, hollo: THREE.Vector3, r: number, h: number, swing: number): CamPose {
    const up = fire.clone().sub(this.p.center).normalize();
    const away = fire.clone().sub(hollo).projectOnPlane(up).normalize().applyAxisAngle(up, swing);
    const pos = fire.clone().addScaledVector(away, r).addScaledVector(up, h);
    const look = fire.clone().lerp(hollo, 0.35).addScaledVector(up, 1.6);
    return { pos, look, up };
  }

  kiteFlight(): Beat[] {
    const g = this.g, tor = this.npc('tor'), pl = g.player, kite = this.R.torKite as THREE.Group;
    const ridge = this.at(PK.ridge);
    const place = () => {
      const up = tor.root.position.clone().sub(this.p.center).normalize();
      const east = new THREE.Vector3(-up.z, 0, up.x).normalize();
      const hand = tor.person.arms[1].hand.getWorldPosition(new THREE.Vector3());
      kite.position.copy(tor.root.position).addScaledVector(up, 1.6 + this.kiteK * 11).addScaledVector(east, 1 + this.kiteK * 7);
      orientTo(kite, east.clone().negate(), up);
      kite.rotation.z += Math.sin(g.time * 2) * 0.12;
      const a = this.kiteString.geometry.attributes.position as THREE.BufferAttribute;
      a.setXYZ(0, hand.x, hand.y, hand.z); a.setXYZ(1, kite.position.x, kite.position.y, kite.position.z); a.needsUpdate = true;
      ((kite.userData.tail ?? []) as THREE.Object3D[]).forEach((t, i) => (t.rotation.x = Math.sin(g.time * 6 - i) * 0.4));
    };
    const shot = (a: number): CamPose => this.orbit(ridge, 8, 3.2, a);
    const beats: Beat[] = [{
      dur: 1.2,
      enter: () => {
        this.kiteK = 0;
        this.stand(tor, [PK.ridge[0] + 0.6, PK.ridge[1] + 1], this.at([PK.ridge[0], PK.ridge[1] + 12]));
        pl.lookAt = null;
        kite.visible = true; this.kiteString.visible = true;
        g.cutCam = shot(0.4);
      },
      tick: () => place(),
    }];
    KITE_FLIGHT.forEach((text, i) => beats.push({
      line: { who: 'Tor', text },
      enter: () => { if (i === 2) { g.sound.sfxPlay('whoosh'); tor.pose = { wave: 1 }; } if (i === 3) { tor.smileT = 6; g.sound.sfxPlay('chime'); } },
      tick: (_k, dt) => {
        if (i >= 2) this.kiteK = Math.min(1, this.kiteK + dt * 0.2 * g.seq.speed);
        place();
        g.cutCam = shot(0.4 + (i + _k) * 0.25);
        tor.lookAt = kite.position.clone();
        pl.lookAt = kite.position.clone();
      },
      exit: () => { tor.pose = {}; },
    }));
    beats.push({
      dur: 1.5,
      tick: () => place(),
      exit: () => {
        kite.visible = false; this.kiteString.visible = false;
        tor.lookAt = null; pl.lookAt = null;
        g.give('kite-flown'); g.give('journal:kite'); g.give('map:ridge'); g.give('power:kite');
        g.give('power:skyreading'); g.give('saw-wind'); g.give('journal:where-snow-goes');
        g.hud.notify(NOTE.kiteWind);
        g.save();
      },
    });
    return beats;
  }

  /** The long night beside Hollo: stories round the fire, the snow coming, and at dawn the giant wakes. */
  campfireNight(): Beat[] {
    const g = this.g, R = this.R, pl = g.player, h = this.hollo;
    const fire = (R.holloFire as THREE.Object3D).position.clone();
    const holloAt = h.root.position.clone();
    const order = ['ysolde', 'bram', 'nima', 'tor', 'odo'];
    let lastStep = -1;
    const setWinter = (w: number) => {
      g.winter = w;
      g.grass.snow = w;
      const step = Math.round(w * 4);
      if (step !== lastStep) { lastStep = step; g.applySnow(); }
    };
    const F = PK.holloFire;
    const seat = (i: number) => { const a = i / 6 * Math.PI * 2 + 0.3; return [F[0] + Math.cos(a) * 2.2, F[1] + Math.sin(a) * 2.6]; };
    let before = 0;
    const [hl, ho] = ChapterOne.HOLLO_HOME;
    const startDir = holloAt.clone().sub(this.p.center).normalize();
    const endDir = this.p.dirRiver(hl, ho);
    const beats: Beat[] = [{
      dur: 1.8,
      enter: () => {
        g.hud.setFade(1, '#1a1830');
        order.forEach((id, i) => this.stand(this.npc(id), seat(i + 1), fire, { sit: 1 }));
        const d = this.p.dirRiver(seat(0)[0], seat(0)[1]);
        pl.placeAt(this.p, d);
        pl.facing.copy(fire.clone().sub(pl.pos).projectOnPlane(pl.up).normalize());
        pl.pose = { sit: 1 }; pl.sync();
        g.day.frozen = true;
        g.day.setLocal(pl.up, -0.3, false);
        g.cutCam = this.fireCam(fire, holloAt, 6, 2.6, -0.5);
        this.peopleAway = true;
      },
      tick: k => g.hud.setFade(1 - smoothstep(0.3, 1, k), '#1a1830'),
    }];
    CAMPFIRE.forEach((l, i) => beats.push({
      line: l,
      enter: () => { const n = this.npc(order[i]); n.smileT = 2.5; n.pose = { sit: 1, talking: true } as Npc['pose']; },
      tick: k => { g.cutCam = this.fireCam(fire, holloAt, 5.5, 2.2, -0.6 + (i + k) * 0.25); },
      exit: () => { this.npc(order[i]).pose = { sit: 1 }; },
    }));
    beats.push({
      line: { text: WINTER_LINES[0] }, dur: 7,
      enter: () => { g.day.frozen = false; before = g.snow.snowpack; },
      tick: (k, dt) => {
        setWinter(smoothstep(0, 0.7, k));
        g.day.t = (g.day.t + dt * 0.2 * g.seq.speed) % 1;
        g.cutCam = this.fireCam(fire, holloAt, 8 + k * 14, 3 + k * 12, 0.4 - k * 0.3);
      },
    });
    beats.push({
      line: { text: WINTER_LINES[1] }, dur: 6,
      tick: (k, dt) => {
        g.day.t = (g.day.t + dt * 0.15 * g.seq.speed) % 1;
        g.cutCam = this.fireCam(fire, holloAt, 22 - k * 10, 15 - k * 9, 0.1 - k * 0.3);
      },
      exit: () => {
        passWinter(g.snow);
        if (g.snow.snowpack > before + 0.01) this.placeNewStone(g.snow.snowpack);
        g.day.setLocal(pl.up, -0.06);
      },
    });
    // Dawn: the eyes open
    beats.push({
      line: { text: DAWN_LINES[0] }, dur: 6,
      tick: (k, dt) => {
        g.day.t = (g.day.t + dt * 0.01 * g.seq.speed) % 1;
        const face = h.head.getWorldPosition(new THREE.Vector3());
        const up = face.clone().sub(this.p.center).normalize();
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(h.root.quaternion).projectOnPlane(up).normalize();
        g.cutCam = { pos: face.clone().addScaledVector(fwd, 6.5 - k * 2).addScaledVector(up, 0.6), look: face, up };
        h.eyeOpen = k > 0.55 ? 1 : 0;
        for (const id of order) this.npc(id).lookAt = face;
        pl.lookAt = face;
      },
      exit: () => { g.sound.sfxPlay('power'); },
    });
    beats.push({
      line: { text: DAWN_LINES[1] }, dur: 11,
      tick: k => {
        h.rise = smoothstep(0, 0.3, k);
        const w = smoothstep(0.3, 1, k);
        const d = startDir.clone().lerp(endDir, w).normalize();
        const prev = h.root.position.clone();
        this.p.surfacePoint(d, 0.2, h.root.position);
        const mv = h.root.position.clone().sub(prev);
        if (w > 0 && mv.lengthSq() > 1e-8) { orientTo(h.root, d, mv); h.walk += mv.length() * 0.9; }
        else if (k > 0.15) orientTo(h.root, d, this.at([hl, ho]).sub(h.root.position));
        setWinter(1 - smoothstep(0.2, 1, k) * 0.5);
        g.cutCam = this.fireCam(fire, h.root.position, 14 + k * 8, 4 + k * 5, -0.3 + k * 0.4);
        const face = h.head.getWorldPosition(new THREE.Vector3());
        for (const id of order) this.npc(id).lookAt = face;
        pl.lookAt = face;
      },
      exit: () => {
        (R.spring.userData.water as THREE.Mesh).material = this.springMat;
        if (isHealed(g.snow) || this.has('gathered')) {
          g.give('peaks-healed'); g.give('journal:hollo'); g.give('item:frost');
          if (this.has('built-fence')) g.give('journal:fences');
        }
        g.applyRiver();
      },
    });
    beats.push({
      line: { text: DAWN_LINES[2] }, dur: 7,
      enter: () => { g.day.setLocal(pl.up, 0.1); g.sound.sfxPlay('splash'); },
      tick: (k, dt) => {
        setWinter(0.5 - smoothstep(0, 0.7, k) * 0.5);
        g.grass.lush = lerp(0.62, 1, smoothstep(0.2, 1, k));
        g.grass.bloom = smoothstep(0.3, 1, k);
        g.day.t = (g.day.t + dt * 0.012 * g.seq.speed) % 1;
        const spring = this.at(PK.spring);
        g.cutCam = this.fireCam(spring, h.root.position, 9 - k * 2, 3.5 - k, 0.5 + k * 0.4);
      },
    });
    beats.push({
      dur: 1.2,
      exit: () => {
        setWinter(0);
        g.day.frozen = false;
        g.day.setLocal(pl.up, 0.35);
        pl.pose = {}; pl.lookAt = null;
        for (const n of this.c.npcs) this.sendHome(n);
        this.peopleAway = false;
        this.holloAwake();
        g.applyRiver();
        g.hud.notify(NOTE.allLit);
        g.save();
      },
    });
    return beats;
  }

  /** Goodbyes at the bridge, the postman's first letter, and the river carrying you away. */
  farewell(): Beat[] {
    const g = this.g, pl = g.player, pm = this.postman;
    const spots: Record<string, number[]> = { ysolde: [74.0, -5.6], bram: [75.4, -6.4], nima: [74.8, -4.6], tor: [76.0, -4.8], odo: [73.6, 4.8] };
    const meet = this.at([74.4, -3.2]);
    const panel = letterPanel(POSTMAN.letter, POSTMAN.sign);
    const land = this.p.dirRiver(75.4, -3.6);
    const landPos = this.p.surfacePoint(land, -0.05);
    const pmPlace = (h: number, spin: number) => {
      pm.root.position.copy(landPos).addScaledVector(land, h);
      orientTo(pm.root, land, pl.pos.clone().sub(landPos).applyAxisAngle(land, spin));
    };
    const pmAnim = (dt: number, p: Partial<Parameters<typeof pm.person.animate>[1]> = {}) => pm.person.animate(dt, { speed: 0, grounded: true, ...p });
    const beats: Beat[] = [{
      dur: 1.6,
      enter: () => {
        g.hud.setFade(1, '#fff8ee');
        for (const [id, ll] of Object.entries(spots)) this.stand(this.npc(id), ll, meet);
        pl.placeAt(this.p, this.p.dirRiver(74.6, -2.8));
        pl.facing.copy(this.at([75, -6]).sub(pl.pos).projectOnPlane(pl.up).normalize()); pl.sync();
        this.peopleAway = true;
        g.cutCam = this.orbit(meet, 7, 3.4, 2.2);
      },
      tick: k => g.hud.setFade(1 - smoothstep(0.2, 1, k), '#fff8ee'),
    }];
    FAREWELL.forEach((l, i) => {
      const id = l.who.toLowerCase();
      beats.push({
        line: l,
        enter: () => { const n = this.npc(id); n.pose = { wave: 1 }; n.smileT = 3; pl.lookAt = n.root.position.clone().addScaledVector(n.up, 1.3); },
        tick: k => { g.cutCam = this.orbit(meet, 7, 3.2, 2.2 + (i + k) * 0.22); },
        exit: () => { this.npc(id).pose = {}; },
      });
    });
    if (!this.has('power:kite')) beats.push({
      line: { who: 'Tor', text: KITE_GIFT },
      enter: () => { this.npc('tor').pose = { wave: 1 }; },
      exit: () => { this.npc('tor').pose = {}; g.give('power:kite'); },
    });
    // The postman drops out of the sky
    beats.push({
      line: { text: POSTMAN.arrive }, dur: 6,
      enter: () => { pm.root.visible = true; pm.letter.visible = false; g.sound.sfxPlay('whoosh'); },
      tick: (k, dt) => {
        const f = 1 - smoothstep(0, 0.85, k);
        pmPlace(f * f * 26, f * 3.5);
        pm.umbrella.rotation.z = Math.sin(k * 14) * 0.2 * f;
        pmAnim(dt);
        const pmHead = pm.root.position.clone().addScaledVector(land, 1);
        pl.lookAt = pmHead;
        for (const n of this.c.npcs) n.lookAt = pmHead;
        g.cutCam = this.orbit(landPos, 6.5, 2.4 + f * 6, 1.2);
        g.cutCam.look = pmHead;
      },
    });
    beats.push({
      line: { text: POSTMAN.hand }, dur: 4.5,
      enter: () => { pm.letter.visible = true; g.sound.sfxPlay('paper'); },
      tick: (k, dt) => { pmPlace(0, 0); pmAnim(dt, { wave: smoothstep(0, 0.3, k) * (1 - smoothstep(0.6, 1, k)) }); g.cutCam = this.orbit(landPos, 4.2, 1.8, 1.6); },
      exit: () => { pm.letter.visible = false; },
    });
    beats.push({ dur: 1.2, tick: k => g.hud.setFade(smoothstep(0, 1, k) * 0.9, '#2a2436') });
    beats.push({
      dur: 11,
      enter: () => g.hud.showPanel(panel, '', 0),
      tick: k => g.hud.showPanel(panel, '', smoothstep(0, 0.08, k) * (1 - smoothstep(0.93, 1, k))),
      exit: () => { g.hud.showPanel(null); g.give('journal:first-letter'); g.give('letter:1'); },
    });
    beats.push({
      line: { text: POSTMAN.after }, dur: 5,
      enter: () => { pl.pose = { touchChest: 1 }; },
      tick: (k, dt) => {
        g.hud.setFade((1 - smoothstep(0, 0.3, k)) * 0.9, '#2a2436');
        pmPlace(smoothstep(0.3, 1, k) * 30, 0); pmAnim(dt);
        g.cutCam = this.orbit(landPos, 9, 3 + k * 6, 1.8);
        g.cutCam.look = pm.root.position.clone();
      },
      exit: () => { pm.root.visible = false; for (const n of this.c.npcs) n.lookAt = null; },
    });
    beats.push({
      dur: 4.6,
      enter: () => { g.hud.showChapter('Chapter One', 'Where the Water Begins', 'complete', 4.4); g.sound.melody([62, 66, 69, 74, 0, 73, 69, 66, 0, 64, 66, 62], 0.42); },
      exit: () => {
        pl.pose = {}; pl.lookAt = null;
        g.give('chapter1-complete');
        g.save();
        pl.placeAt(this.p, this.p.dirRiver(PK.bridge[0] + 0.5, 0));
        g.boardRaft();
        g.departure = true;
        g.hud.notify(NOTE.riverStrong);
      },
    });
    return beats;
  }
}

/** A soft round glow that always faces the camera. */
function glowSprite(color: string): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!, gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(255,220,140,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
}
