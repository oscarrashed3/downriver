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
import { CAMPFIRE, WINTER_LINES, FAREWELL, KITE_GIFT, KITE_FLIGHT, KEEPSAKE, ECHOES, NOT_YET } from '../data/story';
import { passWinter, isHealed, projectedSnowpack } from '../systems/snowpack';
import { currentStep } from './quests';
import { keepsakePanel } from './keepsake';
import type { CamPose } from '../systems/skyView';

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

    // The willow branch by the old tree, for Tor's kite.
    add({
      id: 'spar', world: 0, pos: pos(R.spar), radius: 3.2,
      label: () => (this.has('item:spar') || this.has('kite-flown') ? null : 'Pick up a straight willow branch'),
      act: () => { g.give('item:spar'); (R.spar as THREE.Object3D).visible = false; g.sound.sfxPlay('soft'); g.hud.notify('A straight willow branch. <i>Light, and it bends without breaking.</i>'); g.save(); },
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
            if (!this.has('flag:knows-fences') && !this.has('flag:tor-fences')) return null;
            if (!this.has('flag:tor-fences')) return "Grandpa's old fence posts. <i>Tor would know how to rail them.</i>";
            if (g.skyread.active) return s.windExposure > 0.5 ? 'Rail the old posts into a snow fence. <i>The wind drops its snow here.</i>' : 'Rail the old posts into a snow fence. <i>The wind barely touches this hollow.</i>';
            return this.has('power:skyreading') ? 'Rail the old posts into a snow fence <i>(Q to read the wind first)</i>' : 'Rail the old posts into a snow fence';
          }
          if (!this.has('flag:knows-stupas')) return null;
          return 'Build an ice tower to keep winter water';
        },
        act: () => { if (site.kind === 'fence' && !this.has('flag:tor-fences')) return; this.buildSite(site.id); },
      });
    }

    // Grandpa's snow poles
    (R.poles as { obj: THREE.Object3D }[]).forEach((pole, i) => add({
      id: 'pole' + i, world: 0, pos: pos(pole.obj), radius: 4,
      label: () => 'Read the snow pole',
      act: () => {
        const r = POLE_READINGS[i];
        g.hud.notify(`Pole ${i + 1}: snow today <b>${r.now} m</b>. Grandpa's oldest paint mark: <b>${r.old} m</b>.`);
        g.sound.sfxPlay('soft');
        g.polesRead.add(i);
        if (g.polesRead.size === 3) g.give('journal:poles');
        g.save();
      },
    }));

    // The campfire: warm hands, or the long night when the mountain is ready
    add({
      id: 'fire', world: 0, pos: pos(R.fire), radius: 4.5,
      label: () => {
        const step = currentStep(g.questCtx());
        if (step?.id === 'winter') return 'Sit by the campfire and let winter pass';
        if (this.has('quest:snowpack') && !this.has('peaks-healed')) return 'Sit by the campfire';
        return 'Warm your hands by the fire';
      },
      act: () => {
        const step = currentStep(g.questCtx());
        if (step?.id === 'winter') { g.cut(this.campfireNight()); return; }
        g.player.warmth = 1;
        if (this.has('quest:snowpack') && !this.has('peaks-healed')) g.hud.notify(NOT_YET.winterEarly);
        else g.hud.notify('Warm again.');
      },
    });

    // Nima's little cloud
    add({
      id: 'wisp', world: 0, pos: pos(R.wisp), radius: 9,
      label: () => (this.has('item:bottle') && !this.has('cloud-caught') ? "Catch the little cloud in Nima's bottle" : null),
      act: () => {
        g.give('cloud-caught'); g.sound.sfxPlay('chime');
        (R.wisp as THREE.Group).scale.setScalar(0.35);
        g.hud.notify('The bottle fogs up, cold and heavy. <i>There is weather inside.</i>');
        g.save();
      },
    });
    add({
      id: 'meadow', world: 0, pos: this.at(PK.dryMeadow), radius: 8,
      label: () => (this.has('cloud-caught') && !this.has('journal:cloud') ? 'Let the cloud go over the dry meadow' : null),
      act: () => { this.rainT = 7; g.sound.sfxPlay('splash'); this.greenMeadow(); g.give('journal:cloud'); g.save(); },
    });

    // Benches: sit and watch the day go by
    (R.benches as THREE.Object3D[]).forEach((b, i) => add({
      id: 'bench' + i, world: 0, pos: pos(b), radius: 2.4,
      label: () => (g.npcsNear(b.position, 1.5) ? null : 'Sit on the bench'),
      act: () => g.sit(b),
    }));

    // Echo stones: hold still and listen
    (R.echoes as THREE.Object3D[]).forEach((e, i) => add({
      id: 'echo' + i, world: 0, pos: pos(e), radius: 3.2, hold: 3,
      label: () => (this.has('echo:' + i) ? null : 'Listen to the old stone'),
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
      id: 'flower' + i, world: 0, pos: this.at(ll), radius: 4,
      label: () => (g.flowers >= 3 ? null : 'Pick a mountain flower'),
      act: () => { g.flowers++; g.sound.sfxPlay('soft'); g.hud.notify(`A mountain flower (${g.flowers} of 3). <i>Someone might like one.</i>`); },
    }));

    // Goats to pet, and Pebble the runaway
    (R.goats as Goat[]).forEach((gt, i) => add({
      id: 'goat' + i, world: 0, get pos() { return gt.obj.position; }, radius: 2.4,
      label: () => 'Pet the goat',
      act: () => { gt.look = 2.5; g.sound.sfxPlay('bleat'); g.fold.hop(); },
    } as any));
    const pebble = R.pebble as THREE.Object3D;
    add({
      id: 'pebble', world: 0, get pos() { return pebble.position; }, radius: 3, hold: 2.5,
      label: () => (this.has('goat-home') ? 'Pet Pebble' : this.has('goat-following') ? null : this.has('quest:goat') ? 'Speak softly to the little goat' : 'A little goat, far from the others. <i>She looks lost.</i>'),
      act: () => {
        if (this.has('goat-home')) { g.sound.sfxPlay('bleat'); return; }
        if (!this.has('quest:goat')) return;
        g.flags.add('goat-following'); g.sound.sfxPlay('bleat');
        g.hud.notify('Pebble decides you are acceptable. <i>Lead her home to Bram. Walk, don\'t run.</i>');
      },
    } as any);

    // The bridge: goodbyes
    add({
      id: 'farewell', world: 0, pos: pos(R.bridge), radius: 6,
      label: () => (this.has('boat-ready') && !this.has('chapter1-complete') ? 'Say goodbye, and let the river carry you' : null),
      act: () => g.cut(this.farewell()),
    });
    // The dock below the bridge
    add({
      id: 'dock0', world: 0, pos: this.at(PK.dock), radius: 3.5,
      label: () => 'Unfold Fold into a raft',
      act: () => { if (this.has('peaks-healed')) g.boardRaft(); else g.hud.notify(NOT_YET.thinRiver); },
    });
    // The edge of the world
    add({
      id: 'edge0', world: 0, pos: pos(R.edge), radius: 10,
      label: () => (this.has('chapter1-complete') ? 'Ride the falling stream down to The Ember Pines' : 'Look over the edge'),
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
      g.hud.notify(s.windExposure > 0.5 ? 'The fence hums in the wind. Snow begins to settle behind it.' : 'The fence stands quietly. Hardly any snow drifts here.');
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
  }

  pebbleHome() {
    this.pebbleDir.copy(this.p.dirRiver(PK.pen[0] + 0.5, PK.pen[1] - 2));
    const pb = this.R.pebble as THREE.Object3D;
    this.p.surfacePoint(this.pebbleDir, -0.05, pb.position);
    orientTo(pb, this.pebbleDir);
  }

  afterTalk(id: string) {
    const g = this.g;
    if (id === 'tor' && this.has('flag:tor-follow') && !this.has('kite-flown')) {
      g.flags.add('flag:tor-follow-active');
      g.hud.notify('Tor tucks the kite under his arm. <i>Walk up to Kite Ridge together, across the bridge and east.</i>');
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
        g.hud.notify("Pebble startles and trots off. <i>Walk, don't run.</i>");
      } else {
        const behind = pl.pos.clone().addScaledVector(pl.facing, -1.8);
        const goal = behind.sub(p.center).normalize();
        if (pb.position.distanceTo(pl.pos) > 2.2) this.pebbleDir.lerp(goal, 1 - Math.exp(-2.5 * dt)).normalize();
        const prev = pb.position.clone();
        p.surfacePoint(this.pebbleDir, -0.05, pb.position);
        const mv = pb.position.clone().sub(prev);
        if (mv.lengthSq() > 1e-6) orientTo(pb, this.pebbleDir, mv);
        pb.position.addScaledVector(this.pebbleDir, Math.abs(Math.sin(g.time * 10)) * 0.04 * clamp(mv.length() * 30));
        if (pb.position.distanceTo(this.npc('bram').root.position) < 7) {
          g.flags.delete('goat-following');
          g.give('goat-home'); g.give('map:pasture');
          g.sound.sfxPlay('bleat');
          g.hud.notify('Pebble trots straight to Bram and bites his sleeve. <i>He looks very happy about it.</i>');
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
    if (this.peopleAway && g.mode !== 'cut' && g.player.pos.distanceTo(this.at(PK.bridge)) > 45) {
      this.peopleAway = false;
      for (const n of this.c.npcs) this.sendHome(n);
    }
    // Departure: friends wave from the bank until the raft is far away
    if (g.departure) for (const n of this.c.npcs) n.pose = { wave: n.root.position.distanceTo(pl.pos) < 40 ? 1 : 0 };

    // Reading the wind on Kite Ridge
    if (g.skyread.active && !this.has('saw-wind') && pl.pos.distanceTo(this.at(PK.ridge)) < 18) {
      g.give('saw-wind'); g.give('journal:where-snow-goes');
      g.hud.notify('The wind pours over the ridge and drops its snow in the still air behind it. <i>Fences on the windy side would catch it.</i>');
      g.save();
    }
    if (!this.keepNoted && projectedSnowpack(g.snow) >= 0.7 - 1e-6 && !this.has('peaks-healed')) {
      this.keepNoted = true;
      setTimeout(() => g.hud.notify('Ysolde would say the mountain can hold its snow now. <i>Sit by the village campfire and let winter come.</i>'), 3000);
    }
    if (this.has('flag:route-east') && !this.has('avalanche')) { g.flags.add('avalanche'); this.avalancheT = 0; }
    this.updateAvalanche(dt);
    this.updateCairns();
  }

  updateCairns() {
    const g = this.g;
    for (const s of g.snow.sites) {
      const ring = (this.R.cairns[s.id] as THREE.Object3D).userData.ring as THREE.Mesh | undefined;
      if (!ring) continue;
      const m = ring.material as THREE.MeshBasicMaterial;
      let target = 0;
      if (!s.built && s.kind === 'fence' && this.has('flag:tor-fences')) target = g.skyread.active ? (s.windExposure > 0.5 ? 0.9 : 0.15) : 0.25;
      m.opacity = lerp(m.opacity, target, 0.08);
      ring.scale.setScalar(1 + Math.sin(g.time * 2 + s.windExposure * 5) * 0.06);
    }
    const cor = this.R.cornice as THREE.Mesh;
    (cor.material as THREE.MeshToonMaterial).emissive?.set(g.skyread.active && !this.has('avalanche') ? '#ff9a7a' : '#000000');
  }

  updateAvalanche(dt: number) {
    if (this.avalancheT < 0) return;
    this.avalancheT += dt;
    const cor = this.R.cornice as THREE.Mesh;
    if (this.avalancheT < 0.05) { this.g.hud.notify('Far up the east road, the heavy slope lets go with a long, low roar.'); this.g.sound.sfxPlay('whoosh'); }
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
        g.save();
      },
    });
    return beats;
  }

  /** The long night: stories round the fire, winter in a few breaths, and spring. */
  campfireNight(): Beat[] {
    const g = this.g, fire = (this.R.fire as THREE.Object3D).position.clone(), pl = g.player;
    const order = ['ysolde', 'bram', 'nima', 'tor', 'odo'];
    let lastStep = -1;
    const setWinter = (w: number) => {
      g.winter = w;
      g.grass.snow = w;
      const step = Math.round(w * 4);
      if (step !== lastStep) { lastStep = step; g.applySnow(); }
    };
    const seat = (i: number) => { const a = i / 6 * Math.PI * 2 + 0.3; return [PK.fire[0] + Math.cos(a) * 2.2, PK.fire[1] + Math.sin(a) * 2.6]; };
    let before = 0;
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
        g.cutCam = this.orbit(fire, 5.2, 3.4, 0);
        this.peopleAway = true;
      },
      tick: k => g.hud.setFade(1 - smoothstep(0.3, 1, k), '#1a1830'),
    }];
    CAMPFIRE.forEach((l, i) => beats.push({
      line: l,
      enter: () => { const n = this.npc(order[i]); n.smileT = 2.5; n.pose = { sit: 1, talking: true } as Npc['pose']; },
      tick: k => { g.cutCam = this.orbit(fire, 5.2, 3.2, 0.3 + (i + k) * 0.5); },
      exit: () => { this.npc(order[i]).pose = { sit: 1 }; },
    }));
    beats.push({
      line: { text: WINTER_LINES[0] }, dur: 8,
      enter: () => { g.day.frozen = false; before = g.snow.snowpack; },
      tick: (k, dt) => {
        setWinter(smoothstep(0, 0.6, k));
        g.day.t = (g.day.t + dt * 0.35 * g.seq.speed) % 1;
        g.cutCam = this.orbit(fire, 5.2 + k * 14, 3.4 + k * 14, 2.8 + k * 0.6);
      },
      exit: () => {
        passWinter(g.snow);
        if (g.snow.snowpack > before + 0.01) this.placeNewStone(g.snow.snowpack);
        if (isHealed(g.snow)) {
          g.give('peaks-healed');
          if (this.has('built-fence')) g.give('journal:fences');
          if (this.has('built-stupa')) g.give('journal:stupas');
        }
        g.applyRiver();
      },
    });
    beats.push({
      line: { text: WINTER_LINES[1] }, dur: 7,
      enter: () => { g.day.setLocal(pl.up, -0.05); },
      tick: (k, dt) => {
        setWinter(1 - smoothstep(0, 0.7, k));
        g.grass.lush = lerp(0.62, 1, smoothstep(0.2, 1, k));
        g.grass.bloom = smoothstep(0.3, 1, k);
        g.day.t = (g.day.t + dt * 0.012 * g.seq.speed) % 1;
        g.cutCam = this.orbit(fire, 19 - k * 12, 17 - k * 12, 3.4 + k * 0.5);
      },
    });
    beats.push({
      dur: 1.2,
      exit: () => {
        setWinter(0);
        g.day.frozen = false;
        g.day.setLocal(pl.up, 0.35);
        pl.pose = {};
        for (const n of this.c.npcs) this.sendHome(n);
        this.peopleAway = false;
        g.applyRiver();
        g.save();
      },
    });
    return beats;
  }

  /** Goodbyes at the bridge, the keepsake memory, and the river carrying you away. */
  farewell(): Beat[] {
    const g = this.g, pl = g.player;
    const spots: Record<string, number[]> = { ysolde: [74.0, -5.6], bram: [75.4, -6.4], nima: [74.8, -4.6], tor: [76.0, -4.8], odo: [73.6, 4.8] };
    const meet = this.at([74.4, -3.2]);
    const panels = KEEPSAKE.panels.map((_, i) => keepsakePanel(i));
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
    beats.push({ dur: 2, tick: k => g.hud.setFade(smoothstep(0, 1, k) * 0.94, '#fff3dc') });
    KEEPSAKE.panels.forEach((cap, i) => beats.push({
      dur: 5,
      enter: () => g.hud.showPanel(panels[i], cap, 1),
      tick: k => g.hud.showPanel(panels[i], cap, smoothstep(0, 0.15, k) * (1 - smoothstep(0.88, 1, k))),
    }));
    beats.push({
      line: { text: KEEPSAKE.after }, dur: 5,
      enter: () => { g.hud.showPanel(null); g.give('journal:keepsake-boat'); pl.pose = { touchChest: 1 }; },
      tick: k => g.hud.setFade((1 - smoothstep(0, 0.4, k)) * 0.94, '#fff3dc'),
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
        g.hud.notify('The river is strong now. <i>Let it carry you to the edge of the world.</i>');
      },
    });
    return beats;
  }
}
