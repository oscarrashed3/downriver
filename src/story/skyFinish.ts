// World 2, Phase 7: the finish. Every chime on every island rings and streamers fly; then, in the golden late
// afternoon at Whale's Rest, the goodbyes (Zephy's grudging handshake, Gran Wren's tip, Lark's yellow scarf), and
// Nilo rides a whale down through the clouds to the Overgrown Garden (a cream fade, never a black flash).
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

const sm = (k: number) => k * k * (3 - 2 * k);

/** Where the goodbyes happen on Whale's Rest (lat, off), and where the whale comes up beside the lip. */
const REST: Record<string, [number, number]> = { lark: [170.5, 16.5], zephy: [168.5, 14], granwren: [172.5, 13.5] };
const NILO_AT: [number, number] = [170, 21];
const WHALE_AT: [number, number] = [169, 33];

export class SkyFinish {
  whale: SkyWhale;
  streamers: THREE.Points;
  private sv: Float32Array;
  private streamT = -1;
  private atRest = false;

  constructor(private g: Game, private ch: SkyChapter) {
    this.whale = new SkyWhale({ length: 26, seed: 31, birds: 5, detail: 'high', flock: 3 });
    this.whale.swim = 0.5;
    this.whale.root.visible = false;
    ch.root.add(this.whale.root);
    // festival streamers: bright paper scraps thrown up all round the finish
    const n = 360;
    const geo = new THREE.BufferGeometry();
    this.sv = new Float32Array(n * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const col = new Float32Array(n * 3);
    const pal = ['#d94a3a', '#f2c24a', '#4a7cc8', '#f08a44', '#8cc46a', '#e8809a', '#a48ad4', '#5ab4b4'].map(c => new THREE.Color(c));
    for (let i = 0; i < n; i++) { const c = pal[i % pal.length]; col.set([c.r, c.g, c.b], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.streamers = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, depthWrite: false }));
    this.streamers.frustumCulled = false; this.streamers.visible = false;
    ch.root.add(this.streamers);
  }

  has(f: string) { return this.g.flags.has(f); }

  /** Throw streamers up round a point. */
  throwStreamers(at: THREE.Vector3) {
    const pos = this.streamers.geometry.attributes.position as THREE.BufferAttribute;
    const up = at.clone().sub(this.ch.p.center).normalize();
    const t1 = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 0, 1)).normalize(), t2 = new THREE.Vector3().crossVectors(up, t1);
    for (let i = 0; i < pos.count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 7;
      const p = at.clone().addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).addScaledVector(up, Math.random() * 2);
      pos.setXYZ(i, p.x, p.y, p.z);
      const v = up.clone().multiplyScalar(5 + Math.random() * 6).addScaledVector(t1, (Math.random() - 0.5) * 5).addScaledVector(t2, (Math.random() - 0.5) * 5);
      this.sv.set([v.x, v.y, v.z], i * 3);
    }
    pos.needsUpdate = true;
    this.streamers.visible = true; this.streamT = 0;
  }

  update(dt: number) {
    const g = this.g;
    if (this.streamT >= 0) {
      this.streamT += dt;
      const pos = this.streamers.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)), v = new THREE.Vector3(this.sv[i * 3], this.sv[i * 3 + 1], this.sv[i * 3 + 2]);
        const down = this.ch.p.center.clone().sub(p).normalize();
        v.addScaledVector(down, 6 * dt).multiplyScalar(1 - 1.2 * dt);
        v.x += Math.sin(this.streamT * 5 + i) * 0.08; v.z += Math.cos(this.streamT * 4 + i) * 0.08;
        p.addScaledVector(v, dt);
        pos.setXYZ(i, p.x, p.y, p.z); this.sv.set([v.x, v.y, v.z], i * 3);
      }
      pos.needsUpdate = true;
      (this.streamers.material as THREE.PointsMaterial).opacity = 1 - smoothstep(6, 9, this.streamT);
      if (this.streamT > 9) { this.streamT = -1; this.streamers.visible = false; }
    }
    if (this.whale.root.visible) this.whale.update(dt, g.time);
    // after the race the friends wait at Whale's Rest; walk up to them for the goodbye
    if (this.has('sky:won') && !this.has('sky:goodbye')) {
      if (!this.atRest) this.gatherAtRest();
      if (g.mode === 'play' && g.player.grounded && g.player.pos.distanceTo(this.ch.at(NILO_AT)) < 9) g.cut(this.goodbyeBeats());
    }
  }

  /** Lark, Zephy and Gran Wren go ahead to Whale's Rest. */
  gatherAtRest() {
    this.atRest = true;
    const ch = this.ch, look = ch.at(WHALE_AT);
    for (const [id, ll] of Object.entries(REST)) {
      const n = ch.npc(id), d = safeSpot(ch.p, ch.dir(ll), [], 4), pos = ch.p.surfacePoint(d, -0.05);
      n.place(pos, d, look.clone().sub(pos));
      ch.home[id] = { pos: pos.clone(), up: d.clone(), fwd: n.homeForward.clone() };
    }
  }

  restore() { this.atRest = false; if (this.has('sky:won') && !this.has('chapter2-complete')) this.gatherAtRest(); }

  /** Over the line: every chime on every island rings, streamers fly, the crowd roars. */
  finishBeats(): Beat[] {
    const g = this.g, ch = this.ch, pl = g.player, zephy = ch.npc('zephy');
    const gate = ch.home.zephy.pos.clone();
    return [
      {
        line: { text: W.chimes }, dur: 5,
        enter: () => {
          g.flags.add('sky:won');
          pl.placeAt(ch.p, ch.dir([66.5, 10.5])); pl.facing.copy(gate.clone().sub(pl.pos).projectOnPlane(pl.up).normalize()); pl.sync();
          pl.pose = { wave: 1 };
          this.throwStreamers(gate);
          for (const o of (ch.c.refs.rings ?? []) as THREE.Object3D[]) (o?.userData.chime as { ring?: (k?: number) => void } | undefined)?.ring?.(1);
          RING_SONG.concat([84, 88, 91]).forEach((m, i) => g.sound.tone(m, i * 0.22, 'bells', 0.55));
          g.sound.sfxPlay('power');
        },
        tick: k => { g.cutCam = ch.orbit(pl.pos, 6 + k * 2, 2 + k * 2, 1.4 + k * 0.6); },
      },
      { line: { who: 'Zephy', text: W.zephyLost }, enter: () => { pl.pose = {}; zephy.lookAt = pl.pos.clone().addScaledVector(pl.up, 1.2); }, tick: () => { g.cutCam = ch.orbit(pl.pos.clone().lerp(zephy.root.position, 0.5), 4.6, 1.8, 2.2); } },
      { line: { who: 'Lark', text: W.larkWon }, exit: () => { zephy.lookAt = null; this.gatherAtRest(); g.hud.notify(W.toRest); } },
    ];
  }

  /** The golden late afternoon at Whale's Rest: the goodbyes, the keepsake, the whale. */
  goodbyeBeats(): Beat[] {
    const g = this.g, ch = this.ch, pl = g.player, p = ch.p;
    const lark = ch.npc('lark'), zephy = ch.npc('zephy'), wren = ch.npc('granwren');
    const meet = ch.at([170, 16]);
    const up = meet.clone().sub(p.center).normalize();
    const whaleBase = ch.at(WHALE_AT, -6);
    const toWhale = whaleBase.clone().sub(meet).projectOnPlane(up).normalize();
    const along = new THREE.Vector3().crossVectors(up, toWhale).normalize();
    const golden = () => g.day.setLocal(pl.up, 0.71);
    const faceN = (n: Npc) => { n.lookAt = pl.pos.clone().addScaledVector(pl.up, 1.2); };
    const placeWhale = (rise: number, dive = 0) => {
      const w = this.whale;
      w.root.position.copy(whaleBase).addScaledVector(up, -14 + rise * 14 - dive * 30).addScaledVector(toWhale, dive * 12).addScaledVector(along, dive * 26);
      const ahead = along.clone().addScaledVector(up, -dive * 0.6).normalize();
      const wu = up.clone().addScaledVector(toWhale, dive * 0.2).normalize();
      w.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(wu, ahead).normalize(), wu, ahead));
    };
    const ride = () => { const a = this.whale.rideAnchor.getWorldPosition(new THREE.Vector3()); pl.pos.copy(a); pl.up.copy(a.clone().sub(p.center).normalize()); pl.facing.copy(along); pl.grounded = true; pl.pose = { sit: 1 }; };
    const beats: Beat[] = [
      { dur: 0.8, tick: k => { g.hud.setFade(smoothstep(0, 1, k), '#fff8ee'); } },
      {
        dur: 1.6,
        enter: () => {
          g.hud.setFade(1, '#fff8ee', true);
          golden();
          pl.placeAt(p, safeSpot(p, ch.dir(NILO_AT), [], 3)); pl.facing.copy(toWhale.clone().negate()); pl.sync();
          for (const n of [lark, zephy, wren]) faceN(n);
        },
        tick: k => { golden(); g.hud.setFade(1 - smoothstep(0.2, 1, k), '#fff8ee'); g.cutCam = ch.orbit(meet, 9, 3.6, 0.6 + k * 0.1); },
      },
      // the whale comes up beside the lip, slow as a cloud
      {
        line: { text: W.whaleRises }, dur: 6,
        enter: () => { this.whale.root.visible = true; placeWhale(0); g.sound.sfxPlay('whoosh'); },
        tick: k => { golden(); placeWhale(sm(k)); for (const n of [lark, zephy, wren]) n.lookAt = this.whale.root.position.clone(); pl.lookAt = this.whale.root.position.clone(); g.cutCam = { pos: meet.clone().addScaledVector(toWhale, -7).addScaledVector(up, 2.2).addScaledVector(along, -4), look: this.whale.root.position.clone().addScaledVector(up, 2 * k), up }; },
        exit: () => { for (const n of [lark, zephy, wren]) faceN(n); pl.lookAt = null; },
      },
    ];
    const say = (n: Npc, who: string, text: string, pose: Npc['pose'] = {}, after?: () => void): Beat => ({
      line: { who, text },
      enter: () => { n.pose = pose; n.smileT = 3; pl.lookAt = n.root.position.clone().addScaledVector(n.up, 1.3); },
      tick: k => { golden(); placeWhale(1); g.cutCam = ch.orbit(pl.pos.clone().lerp(n.root.position, 0.5), 4.4, 1.7, 2.0 + k * 0.15); },
      exit: () => { n.pose = {}; after?.(); },
    });
    beats.push(
      say(zephy, 'Zephy', W.zephy1, { reach: 0.6 } as Npc['pose']),
      say(zephy, 'Zephy', W.zephy2, {}, () => { zephy.smileT = 4; }),
      say(wren, 'Gran Wren', W.wren1),
      say(wren, 'Gran Wren', W.wren2),
      say(lark, 'Lark', W.lark1),
      say(lark, 'Lark', W.lark2, { reach: 1 } as Npc['pose'], () => { g.give('item:scarf'); g.give('friend:lark'); }),
      {
        line: { text: W.kept }, dur: 5,
        enter: () => { pl.pose = { touchChest: 1 }; g.sound.sfxPlay('gift'); },
        tick: k => { golden(); placeWhale(1); g.cutCam = ch.orbit(pl.pos, 3.4, 1.5, 1.2 + k * 0.2); },
        exit: () => { pl.pose = {}; g.flags.add('sky:goodbye'); },
      },
      // up onto the whale's back
      {
        dur: 3,
        enter: () => { for (const n of [lark, zephy, wren]) n.pose = { wave: 1 }; },
        tick: (k, dt) => {
          golden(); placeWhale(1); this.whale.update(dt, g.time);
          const a = this.whale.rideAnchor.getWorldPosition(new THREE.Vector3());
          const from = p.surfacePoint(ch.dir(NILO_AT), 0);
          pl.pos.copy(from).lerp(a, sm(k)).addScaledVector(up, Math.sin(k * Math.PI) * 2.5);
          pl.grounded = k > 0.95;
          g.cutCam = { pos: meet.clone().addScaledVector(toWhale, -6).addScaledVector(up, 3).addScaledVector(along, 5), look: pl.pos.clone(), up };
        },
        exit: () => ride(),
      },
      {
        line: { text: W.wave }, dur: 4,
        tick: (k, dt) => { golden(); placeWhale(1); this.whale.update(dt, g.time); ride(); pl.pose = { sit: 1, wave: 1 }; g.cutCam = { pos: meet.clone().addScaledVector(up, 2).addScaledVector(toWhale, -3), look: pl.pos.clone(), up }; void k; },
      },
      // and down, through the clouds, to the green lands below
      {
        line: { text: W.dive }, dur: 6,
        enter: () => { this.whale.swim = 1; g.sound.sfxPlay('whoosh'); },
        tick: (k, dt) => {
          golden(); placeWhale(1, sm(k)); this.whale.update(dt, g.time); ride();
          const wp = this.whale.root.position;
          g.cutCam = { pos: wp.clone().addScaledVector(up, 8 - k * 4).addScaledVector(along, -18).addScaledVector(toWhale, -6), look: wp.clone(), up };
          g.hud.setFade(smoothstep(0.55, 1, k), '#fff8ee');
        },
      },
      {
        dur: 0.6,
        enter: () => {
          g.hud.setFade(1, '#fff8ee', true);
          this.whale.root.visible = false;
          pl.pose = {};
          g.flags.add('chapter2-complete'); g.give('journal:sky-isles');
          g.leaveSky();
        },
      },
      { dur: 1.6, tick: k => g.hud.setFade(1 - smoothstep(0, 1, k), '#fff8ee') },
    );
    return beats;
  }
}

void SPOTS; void orientTo;
