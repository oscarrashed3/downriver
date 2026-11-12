// World 2, Phase 7: the finish. Every chime on every island rings and streamers fly; then, in the golden late
// afternoon at Whale's Rest, the goodbyes (Zephy's grudging handshake, Gran Wren's tip, Lark's yellow scarf), and
// Nilo rides a whale down through the clouds to the Walking Town (a cream fade, never a black flash).
import * as THREE from 'three';
import type { Game } from '../game';
import type { Beat } from './sequencer';
import type { SkyChapter } from './skyChapter';
import type { Npc } from '../systems/npc';
import { SkyWhale } from '../world/skyIsles/whale';
import { SPOTS } from '../world/skyIsles/layout';
import { SKY_FINISH_WORDS as W } from '../data/skyStory';
import { safeSpot } from '../world/spots';
import { orientTo } from '../world/sphere';
import { smoothstep } from '../world/noise';
import { RING_SONG } from './skyRace';
import { fence } from '../world/skyIsles/sailtown';
import { FestivalKite } from '../world/skyIsles/kites';

const sm = (k: number) => k * k * (3 - 2 * k);

/** Whale's Rest, where the goodbyes happen: the isle's middle, and the open-sky side (west, away from its falls). */
const REST_ISLE = { lat: 159.1, off: 0, r: 24.5 };
const REST_SIDE: [number, number] = [159.1, -10];

export class SkyFinish {
  whale: SkyWhale;
  streamers: THREE.InstancedMesh;
  private spin: { axis: THREE.Vector3; w: number; s: number; pos: THREE.Vector3 }[];
  private sv: Float32Array;
  private streamT = -1;
  private atRest = false;
  /** The fence on the lip where Lark waves goodbye, and her red kite above it (built for the goodbye). */
  private lipProps: { fence: THREE.Object3D; kite: FestivalKite; frame: THREE.Group } | null = null;

  constructor(private g: Game, private ch: SkyChapter) {
    this.whale = new SkyWhale({ length: 26, seed: 31, birds: 5, detail: 'high', flock: 7 });
    this.whale.swim = 0.5;
    this.whale.root.visible = false;
    ch.root.add(this.whale.root);
    // festival streamers: curled paper ribbons and confetti thrown up all round the finish, each one tumbling and
    // fluttering as it falls
    const n = 260;
    const rib = new THREE.PlaneGeometry(0.07, 0.42, 1, 8);
    const rp = rib.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < rp.count; i++) { const y = rp.getY(i); rp.setZ(i, Math.sin(y * 14) * 0.05); rp.setX(i, rp.getX(i) + Math.sin(y * 9) * 0.02); }
    rib.computeVertexNormals();
    this.streamers = new THREE.InstancedMesh(rib, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, fog: true }), n);
    this.sv = new Float32Array(n * 3);
    this.spin = Array.from({ length: n }, () => ({ axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), w: 4 + Math.random() * 8, s: 0.6 + Math.random() * 0.7, pos: new THREE.Vector3() }));
    const pal = ['#d94a3a', '#f2c24a', '#4a7cc8', '#f08a44', '#8cc46a', '#e8809a', '#a48ad4', '#5ab4b4', '#fff6e4'].map(c => new THREE.Color(c));
    for (let i = 0; i < n; i++) this.streamers.setColorAt(i, pal[i % pal.length]);
    this.streamers.frustumCulled = false; this.streamers.visible = false;
    this.streamers.userData.noOutline = true;
    ch.root.add(this.streamers);
  }

  has(f: string) { return this.g.flags.has(f); }

  private siteC: { nilo: THREE.Vector3; friends: Record<string, THREE.Vector3>; whaleDir: THREE.Vector3; whaleR: number; lip: THREE.Vector3 } | null = null;
  /** Where everyone stands at Whale's Rest (directions from the planet's centre), and where the whale comes up. */
  site() {
    if (this.siteC) return this.siteC;
    const ch = this.ch, p = ch.p, C = ch.at([REST_ISLE.lat, REST_ISLE.off]);
    const up = C.clone().sub(p.center).normalize();
    const t1 = ch.at(REST_SIDE).sub(C).projectOnPlane(up).normalize(), t2 = new THREE.Vector3().crossVectors(up, t1).normalize();
    const d = (a: number, b: number, r = 3) => safeSpot(p, C.clone().addScaledVector(t1, a).addScaledVector(t2, b).sub(p.center).normalize(), [], r);
    const nilo = d(15, 0);
    this.siteC = {
      nilo,
      friends: { lark: d(10.5, 2.4), zephy: d(10, -2.6), granwren: d(8.5, 0.4) },
      whaleDir: C.clone().addScaledVector(t1, REST_ISLE.r + 7).sub(p.center).normalize(),
      whaleR: p.surfacePoint(nilo).distanceTo(p.center) - 0.5,
      // the fence at the lip, a little to Lark's side, where she waves him off
      lip: d(REST_ISLE.r - 3.2, 2.6, 1.2),
    };
    return this.siteC;
  }

  /** Throw streamers up round a point. */
  throwStreamers(at: THREE.Vector3) {
    const up = at.clone().sub(this.ch.p.center).normalize();
    const t1 = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 0, 1)).normalize(), t2 = new THREE.Vector3().crossVectors(up, t1);
    for (let i = 0; i < this.spin.length; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 7;
      this.spin[i].pos.copy(at).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).addScaledVector(up, Math.random() * 2);
      const v = up.clone().multiplyScalar(5 + Math.random() * 6).addScaledVector(t1, (Math.random() - 0.5) * 5).addScaledVector(t2, (Math.random() - 0.5) * 5);
      this.sv.set([v.x, v.y, v.z], i * 3);
    }
    this.streamers.visible = true; this.streamT = 0;
  }

  update(dt: number) {
    const g = this.g;
    if (this.streamT >= 0) {
      this.streamT += dt;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), down = new THREE.Vector3(), sc = new THREE.Vector3();
      for (let i = 0; i < this.spin.length; i++) {
        const S = this.spin[i], p = S.pos;
        v.set(this.sv[i * 3], this.sv[i * 3 + 1], this.sv[i * 3 + 2]);
        down.copy(this.ch.p.center).sub(p).normalize();
        // paper falls slowly: strong drag, a light pull down, and a sideways flutter
        v.addScaledVector(down, 4.5 * dt).multiplyScalar(1 - 1.6 * dt);
        v.x += Math.sin(this.streamT * 5 + i) * 0.12; v.z += Math.cos(this.streamT * 4 + i * 1.7) * 0.12;
        p.addScaledVector(v, dt);
        this.sv.set([v.x, v.y, v.z], i * 3);
        q.setFromAxisAngle(S.axis, this.streamT * S.w + i);
        const fade = 1 - smoothstep(6, 9, this.streamT);
        m.compose(p, q, sc.setScalar(S.s * Math.max(0.001, fade)));
        this.streamers.setMatrixAt(i, m);
      }
      this.streamers.instanceMatrix.needsUpdate = true;
      if (this.streamT > 9) { this.streamT = -1; this.streamers.visible = false; }
    }
    if (this.whale.root.visible) this.whale.update(dt, g.time);
    this.lipProps?.kite.update(dt, g.time);
    // after the race the friends wait at Whale's Rest; walk up to them for the goodbye
    if (this.has('sky:won') && !this.has('sky:goodbye')) {
      if (!this.atRest && g.mode === 'play') this.gatherAtRest();
      if (g.mode === 'play' && g.player.grounded && g.player.pos.distanceTo(this.ch.p.surfacePoint(this.site().nilo)) < 9) g.cut(this.goodbyeBeats());
    }
  }

  /** Lark, Zephy and Gran Wren go ahead to Whale's Rest. */
  gatherAtRest() {
    this.atRest = true;
    const ch = this.ch, S = this.site(), look = ch.p.surfacePoint(S.nilo);
    for (const [id, d] of Object.entries(S.friends)) {
      const n = ch.npc(id), pos = ch.p.surfacePoint(d, -0.05);
      n.place(pos, d, look.clone().sub(pos));
      ch.home[id] = { pos: pos.clone(), up: d.clone(), fwd: n.homeForward.clone() };
    }
  }

  restore() {
    this.atRest = false;
    if (this.has('sky:won') && !this.has('chapter2-complete')) this.gatherAtRest();
    // (a save from before the kite frame was kept: it is his all the same)
    if (this.has('sky:won') && !this.has('item:kite')) this.g.give('item:kite');
  }

  /** Over the line: every chime on every island rings, streamers fly, the crowd roars. */
  finishBeats(): Beat[] {
    const g = this.g, ch = this.ch, pl = g.player, zephy = ch.npc('zephy');
    const gate = ch.home.zephy.pos.clone();
    return [
      {
        line: { text: W.chimes }, dur: 5,
        enter: () => {
          g.flags.add('sky:won');
          // the kite frame (and the glide) are his to keep: in the backpack and the journal from now on
          g.give('item:kite');
          ch.land(ch.dir([66.5, 10.5])); pl.facing.copy(gate.clone().sub(pl.pos).projectOnPlane(pl.up).normalize()); pl.sync();
          pl.pose = { wave: 1 };
          this.throwStreamers(gate);
          for (const o of (ch.c.refs.rings ?? []) as THREE.Object3D[]) (o?.userData.chime as { ring?: (k?: number) => void } | undefined)?.ring?.(1);
          RING_SONG.concat([84, 88, 91]).forEach((m, i) => g.sound.tone(m, i * 0.22, 'bells', 0.55));
          g.sound.sfxPlay('power'); g.sound.cheer(1, 4);
        },
        tick: k => {
          // Nilo and Zephy in front, the cheering crowd and the streamers behind them
          const mid = pl.pos.clone().lerp(zephy.root.position, 0.5), up = mid.clone().sub(ch.p.center).normalize();
          const crowd = ch.at([69.5, 19.5]), away = mid.clone().sub(crowd).projectOnPlane(up).normalize();
          g.cutCam = { pos: mid.clone().addScaledVector(away, 5 + k * 1.5).addScaledVector(up, 2.4 + k * 1.2), look: mid.clone().lerp(crowd, 0.35).addScaledVector(up, 1.4), up };
        },
      },
      { line: { who: 'Zephy', text: W.zephyLost }, enter: () => { pl.pose = {}; zephy.lookAt = pl.pos.clone().addScaledVector(pl.up, 1.2); }, tick: k => { g.cutCam = ch.race.twoShot(zephy.root.position, 4.4 - k * 0.3, 1.8); } },
      { line: { who: 'Lark', text: W.larkWon }, exit: () => { zephy.lookAt = null; this.gatherAtRest(); g.hud.notify(W.toRest); } },
    ];
  }

  /** The golden late afternoon at Whale's Rest: the goodbyes, the keepsake, the whale. */
  goodbyeBeats(): Beat[] {
    const g = this.g, ch = this.ch, pl = g.player, p = ch.p;
    const lark = ch.npc('lark'), zephy = ch.npc('zephy'), wren = ch.npc('granwren');
    const S = this.site();
    const meet = p.surfacePoint(S.nilo).lerp(p.surfacePoint(S.friends.granwren), 0.4);
    const up = meet.clone().sub(p.center).normalize();
    const whaleBase = S.whaleDir.clone().multiplyScalar(S.whaleR).add(p.center);
    const toWhale = whaleBase.clone().sub(meet).projectOnPlane(up).normalize();
    const along = new THREE.Vector3().crossVectors(up, toWhale).normalize();
    let goldenSet = false, savedPin: number | null = null;
    // the golden late afternoon (picture 4): the world's hour is pinned, so pin a low sun for this scene, off beyond
    // the whale to one side (the whale and Lark rim-lit gold), with peach clouds and a warm haze; put back after
    const golden = () => {
      if (goldenSet) return;
      goldenSet = true; savedPin = g.day.pin;
      g.day.pin = 0.12;
      g.day.sun.copy(toWhale).multiplyScalar(0.8).addScaledVector(along, -0.6).normalize();
      g.skyWorld?.sea?.setGolden(1); g.skyWorld?.sea?.setHaze('#f6d8b8', 0.0012);
    };
    const unGolden = () => {
      if (!goldenSet) return;
      goldenSet = false; g.day.pin = savedPin;
      g.skyWorld?.sea?.setGolden(0); g.skyWorld?.sea?.setHaze('#cfe6fa', 0.0011);
    };
    // the fence on the lip and Lark's red kite flying over it
    const lipAt = p.surfacePoint(S.lip), lipUp = S.lip.clone();
    const lipZ = new THREE.Vector3().crossVectors(along, lipUp).normalize();
    if (!this.lipProps) {
      const frame = new THREE.Group();
      frame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, lipUp, lipZ));
      frame.position.copy(lipAt).addScaledVector(lipUp, -0.05);
      const f = fence(4.6, { seed: 7, height: 0.95 }); f.position.set(-2.3, 0, 0.5);
      // (the wind blows out over the lip, toward the whale)
      const wl = new THREE.Vector3(toWhale.dot(along), 0, toWhale.dot(lipZ)).normalize();
      const kite = new FestivalKite({ anchor: new THREE.Vector3(0.3, 1.1, 0), height: 9, colors: ['#d8402e', '#f08a32', '#f2c53d'], seed: 5, size: 1.5, streamers: 3, wind: wl });
      frame.add(f, kite.root);
      this.ch.root.add(frame);
      this.lipProps = { fence: f, kite, frame };
    }
    const larkAtFence = () => {
      const lp = lipAt.clone().addScaledVector(toWhale, -0.2).addScaledVector(along, 0.3);
      lark.place(p.surfacePoint(lp.clone().sub(p.center).normalize(), -0.05), lipUp, toWhale.clone());
      lark.pose = { wave: 1 };
    };
    const faceN = (n: Npc) => { n.lookAt = pl.pos.clone().addScaledVector(pl.up, 1.2); };
    const placeWhale = (rise: number, dive = 0) => {
      const w = this.whale;
      w.root.position.copy(whaleBase).addScaledVector(up, -14 + rise * 14 - dive * 30).addScaledVector(toWhale, dive * 12).addScaledVector(along, dive * 26);
      const ahead = along.clone().addScaledVector(up, -dive * 0.6).normalize();
      const wu = up.clone().addScaledVector(toWhale, dive * 0.2).normalize();
      w.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(wu, ahead).normalize(), wu, ahead));
    };
    // the whale coming up, seen from along the lip (whichever side has no trees in the way), Nilo in the corner
    let riseSide = 0, waveSide = 0;
    const riseCam = (k: number) => {
      const nilo = p.surfacePoint(S.nilo), at = (s: number) => nilo.clone().addScaledVector(toWhale, 2).addScaledVector(along, s * 8).addScaledVector(up, 3.4);
      if (!riseSide) riseSide = ch.sightGap(at(1), whaleBase) >= ch.sightGap(at(-1), whaleBase) ? 1 : -1;
      return { pos: at(riseSide), look: this.whale.root.position.clone().addScaledVector(up, 1 + 2 * k), up };
    };
    const ride = () => { const a = this.whale.rideAnchor.getWorldPosition(new THREE.Vector3()); pl.pos.copy(a); pl.up.copy(a.clone().sub(p.center).normalize()); pl.facing.copy(along); pl.grounded = true; pl.pose = { sit: 1 }; };
    const beats: Beat[] = [
      { dur: 0.8, tick: k => { g.hud.setFade(smoothstep(0, 1, k), '#fff8ee'); } },
      {
        dur: 1.6,
        enter: () => {
          g.hud.setFade(1, '#fff8ee', true);
          golden();
          ch.land(S.nilo, toWhale.clone().negate());
          for (const n of [lark, zephy, wren]) faceN(n);
        },
        tick: k => { golden(); g.hud.setFade(1 - smoothstep(0.2, 1, k), '#fff8ee'); g.cutCam = ch.orbit(meet, 9, 3.6, 0.6 + k * 0.1); },
      },
      // the whale comes up beside the lip, slow as a cloud
      {
        line: { text: W.whaleRises }, dur: 6,
        enter: () => { this.whale.root.visible = true; placeWhale(0); g.sound.sfxPlay('whoosh'); g.sound.whaleSong(); },
        tick: k => { golden(); placeWhale(sm(Math.min(1, k * 1.4))); for (const n of [lark, zephy, wren]) n.lookAt = this.whale.root.position.clone(); pl.lookAt = this.whale.root.position.clone(); g.cutCam = riseCam(k); },
        exit: () => { for (const n of [lark, zephy, wren]) faceN(n); pl.lookAt = null; },
      },
    ];
    // two people side by side, seen from the island's middle (never from out over the edge, in the clouds)
    const isleC = ch.at([REST_ISLE.lat, REST_ISLE.off]);
    const sideCam = (other: THREE.Vector3, r: number) => {
      const mid = pl.pos.clone().lerp(other, 0.5), side = new THREE.Vector3().crossVectors(up, other.clone().sub(pl.pos)).normalize();
      if (mid.clone().addScaledVector(side, r).distanceTo(isleC) > mid.clone().addScaledVector(side, -r).distanceTo(isleC)) side.negate();
      return { pos: mid.clone().addScaledVector(side, r).addScaledVector(up, 1.3 + r * 0.2), look: mid.clone().addScaledVector(up, 1.0), up };
    };
    const say = (n: Npc, who: string, text: string, pose: Npc['pose'] = {}, after?: () => void, r = 4.4): Beat => ({
      line: { who, text },
      enter: () => { n.pose = pose; n.smileT = 3; pl.lookAt = n.root.position.clone().addScaledVector(n.up, 1.3); },
      tick: k => { golden(); placeWhale(1); g.cutCam = sideCam(n.root.position, r - k * 0.3); },
      exit: () => { n.pose = {}; after?.(); },
    });
    beats.push(
      say(zephy, 'Zephy', W.zephy1, { reach: 0.6 } as Npc['pose']),
      say(zephy, 'Zephy', W.zephy2, {}, () => { zephy.smileT = 4; }),
      say(wren, 'Gran Wren', W.wren1),
      say(wren, 'Gran Wren', W.wren2),
      say(lark, 'Lark', W.lark1, {}, undefined, 3.4),
      say(lark, 'Lark', W.lark2, { reach: 1 } as Npc['pose'], () => { g.give('item:scarf'); g.give('friend:lark'); }, 3.3),
      {
        line: { text: W.kept }, dur: 5,
        enter: () => { pl.pose = { touchChest: 1 }; g.sound.sfxPlay('gift'); },
        tick: k => { golden(); placeWhale(1); g.cutCam = { pos: pl.pos.clone().addScaledVector(toWhale, -3.4 + k * 0.4).addScaledVector(along, 1.2).addScaledVector(up, 1.5), look: pl.pos.clone().addScaledVector(up, 1.15), up }; },
        exit: () => { pl.pose = {}; g.flags.add('sky:goodbye'); },
      },
      // up onto the whale's back
      {
        dur: 3,
        enter: () => { for (const n of [zephy, wren]) n.pose = { wave: 1 }; larkAtFence(); },
        tick: (k, dt) => {
          golden(); placeWhale(1); this.whale.update(dt, g.time);
          const a = this.whale.rideAnchor.getWorldPosition(new THREE.Vector3());
          const from = p.surfacePoint(S.nilo, 0);
          pl.pos.copy(from).lerp(a, sm(k)).addScaledVector(up, Math.sin(k * Math.PI) * 2.5);
          pl.grounded = k > 0.95;
          g.cutCam = { pos: meet.clone().addScaledVector(toWhale, -6).addScaledVector(up, 3).addScaledVector(along, 5), look: pl.pos.clone(), up };
        },
        exit: () => ride(),
      },
      {
        line: { text: W.wave }, dur: 4,
        tick: (k, dt) => {
          golden(); placeWhale(1); this.whale.update(dt, g.time); ride(); pl.pose = { sit: 1, wave: 1 };
          // picture 4: from behind Lark at the fence, the whale whole beyond the lip with Nilo waving on its back,
          // her red kite overhead
          const lp = lark.root.position, ra = this.whale.rideAnchor.getWorldPosition(new THREE.Vector3());
          const at = (sd: number) => lp.clone().addScaledVector(toWhale, -5.6 + k * 0.5).addScaledVector(along, sd * 3.4).addScaledVector(up, 3.4);
          if (!waveSide) waveSide = ch.sightGap(at(1), ra) >= ch.sightGap(at(-1), ra) ? 1 : -1;
          g.cutCam = { pos: at(waveSide), look: lp.clone().lerp(ra, 0.5).addScaledVector(up, 2.2), up };
        },
      },
      // and down, through the clouds, to the green lands below
      {
        line: { text: W.dive }, dur: 6,
        enter: () => { this.whale.swim = 1; g.sound.sfxPlay('whoosh'); g.sound.whaleSong(); },
        tick: (k, dt) => {
          golden(); placeWhale(1, sm(k)); this.whale.update(dt, g.time); ride();
          // from beside and above, out over the cloud sea: the whole whale, Nilo on its back, the glowing clouds
          // below (the camera sinks half as fast as the whale, so it looks down on it more and more)
          const wp = this.whale.root.position, s = sm(k);
          g.cutCam = { pos: wp.clone().addScaledVector(up, 7 + s * 9).addScaledVector(toWhale, 27 - s * 3).addScaledVector(along, -4 - s * 8), look: wp.clone().addScaledVector(up, 1.5), up };
          g.hud.setFade(smoothstep(0.72, 1, k), '#fff8ee');
        },
      },
      {
        dur: 0.6,
        enter: () => {
          g.hud.setFade(1, '#fff8ee', true);
          this.whale.root.visible = false;
          pl.pose = {};
          g.flags.add('chapter2-complete'); g.give('journal:sky-isles');
          unGolden(); ch.sendHome(lark);
          g.leaveSky();
        },
      },
      { dur: 1.6, tick: k => g.hud.setFade(1 - smoothstep(0, 1, k), '#fff8ee') },
    );
    return beats;
  }
}

void SPOTS; void orientTo;
