// World 2, Phase 4: the three kite parts and what goes with them. The frame at the top of Windmill Isle (a sail
// ride, then Fold unfolds into a paper wing and teaches gliding), Old Fenn's blown laundry for the sailcloth,
// Pell's sour chime for the string, the fox tangled in kite string on the drifting islet, and the kite put
// together in Sailtown square with Lark and Gran Wren.
import * as THREE from 'three';
import type { Game } from '../game';
import type { Beat } from './sequencer';
import type { SkyChapter } from './skyChapter';
import { SKY_PARTS_WORDS as W } from '../data/skyStory';
import { SKY_HOMES } from './skyQuests';
import { SPOTS } from '../world/skyIsles/layout';
import { KiteWing } from '../world/skyIsles/kiteWing';
import { newGlider } from '../world/skyIsles/flight';
import { onIsle, isleAt } from '../world/skyIsles/terrain';
import { safeSpot } from '../world/spots';
import { orientTo } from '../world/sphere';
import { clamp, smoothstep } from '../world/noise';
import * as Props from '../world/props';

const sm = (k: number) => k * k * (3 - 2 * k);

interface Laundry { obj: THREE.Group; cloth: THREE.Mesh; base: THREE.Vector3; up: THREE.Vector3; t1: THREE.Vector3; t2: THREE.Vector3; r: number; h: number; a: number; speed: number; caught: number; name: string }

/** The sour chime's notches: how far flat it rings (semitones) as its weight is turned; the last one is true. */
export const CHIME_NOTCHES = [-1.6, -1.1, -0.6, 0];
const CHIME_NOTE = 76;

export class SkyParts {
  laundry: Laundry[] = [];
  chime: { root: THREE.Group; weight: THREE.Object3D; tubes: THREE.Object3D[]; notch: number; swing: number; glow: THREE.Mesh };
  frameObj: THREE.Group;
  wing: KiteWing;
  private foxCheck = 0;
  /** Seconds the sour chime has been ringing out (for the swing). */
  constructor(private g: Game, private ch: SkyChapter) {
    const p = ch.p;
    // ---- Old Fenn's washing, blown about round his island: low over the grass, by the lip, and out over the cloud
    const mi = isleAt(p, ch.dir([SPOTS.menderHut.lat, SPOTS.menderHut.off]))!;
    const up = mi.up.clone();
    const t1 = mi.e1.clone(), t2 = mi.e2.clone();
    const top = p.R + 18.5;
    const pieces: [string, string, number, number, number][] = [
      // name, colour, orbit radius, height over the top, angular speed
      ["Old Fenn's shirt", '#e8eef4', 3.4, 1.5, 0.35],
      ["Old Fenn's red sock", '#c8443a', 6.2, 2.2, -0.28],
      ["Old Fenn's sheet", '#f4ead2', 11.5, 0.6, 0.22],
    ];
    pieces.forEach(([name, col, r, h, speed], i) => {
      const obj = new THREE.Group();
      const geo = i === 1 ? new THREE.PlaneGeometry(0.45, 0.85, 2, 4) : i === 2 ? new THREE.PlaneGeometry(1.9, 1.35, 6, 4) : new THREE.PlaneGeometry(1.0, 1.1, 4, 4);
      const cloth = new THREE.Mesh(geo, Props.toon(col));
      (cloth.material as THREE.Material).side = THREE.DoubleSide;
      cloth.userData.rest = (geo.attributes.position.array as Float32Array).slice();
      obj.add(cloth);
      // a glint so it can be found from the air
      const glint = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 24), new THREE.MeshBasicMaterial({ color: '#ffe8a8', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
      glint.userData.glint = true; obj.add(glint);
      obj.visible = false;
      ch.root.add(obj);
      this.laundry.push({ obj, cloth, base: up.clone().multiplyScalar(top).add(p.center), up, t1, t2, r, h, a: i * 2.1, speed, caught: 0, name });
    });

    // ---- the sour chime, on its own post by the workshop door
    // by the workshop door (the workshop may not have found room: then by Pell's spot)
    const ws = ch.c.refs.workshop ? ch.ref('workshop') : ch.at([SPOTS.workshop.lat, SPOTS.workshop.off]);
    const wsUp = ws.clone().sub(p.center).normalize();
    const lane = ch.at([111, -2]).sub(ws).projectOnPlane(wsUp).normalize();
    // on firm ground and well clear of Pell, so standing at the chime asks to turn it rather than to talk
    const pell = ch.at(SKY_HOMES.chimer.at);
    const cd = safeSpot(p, ws.clone().addScaledVector(lane, 3.4).sub(p.center).normalize(), [{ pos: pell, r: 6 }, { pos: ws, r: 2.5 }], 12);
    const root = new THREE.Group();
    p.surfacePoint(cd, -0.05, root.position);
    orientTo(root, cd, lane);
    const wood = Props.toon('#7a5a34');
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6), wood); post.position.y = 1.3; root.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.07), wood); arm.position.set(0.4, 2.55, 0); root.add(arm);
    const hang = new THREE.Group(); hang.position.set(0.7, 2.5, 0); root.add(hang);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12), Props.toon('#c8a050')); cap.position.y = -0.12; hang.add(cap);
    const tubes: THREE.Object3D[] = [];
    [[-0.12, 0.9], [0, 1.15], [0.12, 0.75]].forEach(([x, L], i) => {
      const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, L, 8), Props.toon(i === 1 ? '#a8b0b8' : '#d8c070'));
      const pv = new THREE.Group(); pv.position.set(x, -0.16, i === 1 ? 0.08 : -0.05); tb.position.y = -L / 2; pv.add(tb); hang.add(pv); tubes.push(pv);
    });
    // the weight on its thread below the middle tube, which you turn
    const weight = new THREE.Group(); weight.position.set(0, -1.55, 0.08); hang.add(weight);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 6), Props.toon('#5a4a6a')); weight.add(disc);
    const nub = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.14), Props.toon('#f2c24a')); nub.position.z = 0.1; weight.add(nub);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffd88a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(0, -0.8, 0); hang.add(glow);
    root.scale.setScalar(1.35);
    ch.root.add(root);
    p.solids.push({ obj: root, shape: { kind: 'circle', r: 0.25 }, h: 2.6 } as any);
    this.chime = { root, weight, tubes, notch: 0, swing: 0, glow };

    // ---- the kite frame, tied to the windmill's cap on Windmill Isle
    const mill = ch.c.refs.windmill as THREE.Object3D;
    this.frameObj = kiteFrame();
    this.frameObj.position.set(0, 14.4, -1.3);
    this.frameObj.rotation.x = -0.35;
    mill.add(this.frameObj);

    // ---- the wing Lark and Gran Wren help put together (laid out in the square for the scene)
    this.wing = new KiteWing({ pattern: 'nilo', span: 3.7, windLines: false });
    this.wing.root.visible = false;
    ch.root.add(this.wing.root);

    this.register();
  }

  has(f: string) { return this.g.flags.has(f); }

  register() {
    const g = this.g, ch = this.ch, world = g.planets.indexOf(ch.p);
    ch.c.interactables.push({
      id: 'skyChime', world, pos: this.chime.root.position.clone(), radius: 3,
      label: () => (this.has('sky:quest-string') && !this.has('sky:chime-tuned') ? W.chimePrompt : null),
      act: () => this.turnChime(),
    });
  }

  restore() {
    this.frameObj.visible = !this.has('sky:part-frame');
    this.chime.notch = this.has('sky:chime-tuned') ? CHIME_NOTCHES.length - 1 : 0;
    this.chime.weight.rotation.y = this.chime.notch * 1.2;
    for (const l of this.laundry) l.caught = this.has('sky:laundry') ? 1 : 0;
  }

  // ------------------------------------------------------------------ the sour chime
  turnChime() {
    const g = this.g, c = this.chime;
    c.notch = Math.min(CHIME_NOTCHES.length - 1, c.notch + 1);
    c.swing = 1;
    const off = CHIME_NOTCHES[c.notch];
    // the chime, then the golden ring beside the garden gate giving the true note to listen against
    g.sound.tone(CHIME_NOTE + off, 0, 'bells', 0.7);
    if (off !== 0) {
      g.sound.tone(CHIME_NOTE, 0.7, 'bells', 0.4);
      g.hud.notify(W.chimeSour[Math.min(W.chimeSour.length - 1, c.notch - 1)]);
    } else {
      g.sound.tone(CHIME_NOTE, 0.02, 'bells', 0.5);
      [CHIME_NOTE + 4, CHIME_NOTE + 7, CHIME_NOTE + 12].forEach((m, i) => g.sound.tone(m, 0.5 + i * 0.22, 'bells', 0.45));
      g.flags.add('sky:chime-tuned');
      g.hud.notify(W.chimeTrue);
      g.fold.hop();
      g.save();
    }
  }

  // ------------------------------------------------------------------ the frame, and Fold's wing
  /** The sail ride let go at the top: the frame comes free, and (the first time) Fold becomes a wing. */
  onSailTop() {
    const g = this.g;
    if (this.has('sky:part-frame')) return;
    g.flags.add('sky:part-frame');
    this.frameObj.visible = false;
    g.sound.sfxPlay('gift');
    this.partNote();
    if (!this.has('form:glider')) g.cut(this.gliderIntro());
  }

  /** At the top of the sail: Fold unfolds into a paper wing. Then the wind takes over, and you glide. */
  gliderIntro(): Beat[] {
    const g = this.g, pl = g.player;
    const up = pl.up.clone(), side = new THREE.Vector3().crossVectors(up, pl.facing).normalize();
    const vel = pl.vel.clone();
    const cam = (k: number) => ({ pos: pl.pos.clone().addScaledVector(side, 3.8 - k).addScaledVector(pl.facing, 2.6 + k).addScaledVector(up, 1.6 + k * 0.6), look: pl.pos.clone().addScaledVector(up, 0.2), up });
    return [
      { line: { text: W.frameGot }, dur: 3.2, enter: () => { pl.vel.set(0, 0, 0); }, tick: k => { pl.grounded = true; g.cutCam = cam(k * 0.3); } },
      {
        line: { text: W.foldWing }, dur: 4,
        enter: () => {
          g.fold.hop(); g.sound.sfxPlay('power');
          // Fold opens under him: the wing is shown (skyMove draws it whenever the glider is open)
          g.flags.add('form:glider');
          pl.glider ??= newGlider();
          Object.assign(pl.glider, { open: true, speed: 10, openT: 1, airT: 1 });
          pl.glider.heading.copy(pl.facing); pl.grounded = false;
        },
        tick: k => { g.cutCam = cam(0.3 + k * 0.5); },
        exit: () => {
          g.give('power:glide');
          pl.vel.copy(vel); pl.forceOpen = true;
          g.hud.notify(W.glideTeach);
        },
      },
    ];
  }

  /** A part in hand: say which, and what is left. */
  partNote() {
    const n = ['sky:part-frame', 'sky:part-cloth', 'sky:part-string'].filter(f => this.has(f)).length;
    if (n >= 3) this.g.flags.add('sky:parts-all');
    this.g.hud.notify(W.partGot(n));
  }

  // ------------------------------------------------------------------ the fox
  foxBeats(): Beat[] {
    const g = this.g, ch = this.ch, pl = g.player, lark = ch.npc('lark');
    const fox = g.fox.f.root.position.clone();
    const up = pl.up.clone();
    const toFox = fox.clone().sub(pl.pos).projectOnPlane(up).normalize();
    const side = new THREE.Vector3().crossVectors(up, toFox).normalize();
    const larkD = safeSpot(ch.p, pl.pos.clone().addScaledVector(side, 1.3).addScaledVector(toFox, -0.6).sub(ch.p.center).normalize(), [], 4);
    return [
      {
        line: { who: 'Lark', text: W.fox1 },
        enter: () => {
          const pos = ch.p.surfacePoint(larkD, -0.05);
          lark.place(pos, larkD, toFox); lark.pose = { reach: 1 } as typeof lark.pose; lark.smileT = 4;
          pl.facing.copy(toFox); pl.lookAt = fox.clone();
        },
        tick: k => { g.cutCam = { pos: pl.pos.clone().addScaledVector(toFox, -3.2 - k * 0.6).addScaledVector(side, -0.9).addScaledVector(up, 3.2), look: pl.pos.clone().lerp(fox, 0.85).addScaledVector(up, 0.4), up }; },
      },
      {
        line: { who: 'Lark', text: W.fox2 },
        enter: () => { lark.pose = {}; },
        tick: k => { g.cutCam = { pos: fox.clone().addScaledVector(toFox, -3).addScaledVector(side, 2).addScaledVector(up, 1.6 + k * 0.4), look: fox.clone().addScaledVector(up, 0.3), up }; },
        exit: () => { pl.lookAt = null; g.flags.add('sky:fox-seen'); },
      },
    ];
  }

  // ------------------------------------------------------------------ the kite, put together
  afterTalk(id: string) {
    if (id === 'mender' && this.has('sky:laundry') && this.has('sky:part-cloth') && !this.has('told:cloth')) { this.g.flags.add('told:cloth'); this.partNote(); }
    if (id === 'chimer' && this.has('sky:chime-tuned') && this.has('sky:part-string') && !this.has('told:string')) { this.g.flags.add('told:string'); this.partNote(); }
    if (id === 'lark' && this.has('sky:parts-all') && !this.has('sky:kite-built')) this.g.cut(this.assemblyBeats(), () => this.g.save());
  }

  assemblyBeats(): Beat[] {
    const g = this.g, ch = this.ch, pl = g.player, p = ch.p;
    const lark = ch.npc('lark'), wren = ch.npc('granwren');
    const sq = ch.home.lark.pos.clone();
    const d0 = safeSpot(p, sq.clone().sub(p.center).normalize(), [], 5);
    const mid = p.surfacePoint(d0, 0);
    const up = d0.clone();
    const fwd = ch.at([57, 0]).sub(mid).projectOnPlane(up).normalize();
    const side = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const spot = (dx: number, dz: number) => safeSpot(p, mid.clone().addScaledVector(side, dx).addScaledVector(fwd, dz).sub(p.center).normalize(), [], 2);
    const orbitAt = (a: number, r = 5.2, h = 2.2) => ({ pos: mid.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(fwd, Math.sin(a) * r).addScaledVector(up, h), look: mid.clone().addScaledVector(up, 0.6), up });
    // the sweep turned, if need be, so no house stands between the camera and the kite
    const turn = ch.clearTurn(t => [-2.1, -1.4, -0.7, -0.3].map(a => orbitAt(a + t, a > -0.5 ? 6 : 5.2)));
    const orbit = (a: number, r = 5.2, h = 2.2) => orbitAt(a + turn, r, h);
    const wingState = { speed: 0, bank: 0, pitch: 0, dive: 0, upright: 0, run: 0 };
    const placeWing = (lift: number, dt: number) => {
      const w = this.wing;
      w.root.position.copy(mid).addScaledVector(up, 0.35 + lift);
      orientTo(w.root, up, fwd);
      w.update(dt, g.time, wingState);
    };
    return [
      { dur: 0.7, tick: k => g.hud.setFade(smoothstep(0, 1, k), '#fff8ee') },
      {
        dur: 1.4,
        enter: () => {
          g.hud.setFade(1, '#fff8ee', true);
          const lp = spot(-1.6, 0.6), wp = spot(1.6, 0.6), np = spot(0, -1.7);
          lark.place(p.surfacePoint(lp, -0.05), lp, mid.clone().sub(p.surfacePoint(lp)));
          wren.place(p.surfacePoint(wp, -0.05), wp, mid.clone().sub(p.surfacePoint(wp)));
          pl.placeAt(p, np); pl.facing.copy(fwd); pl.sync();
          lark.pose = { kneel: 1 } as typeof lark.pose; wren.pose = {};
          this.wing.root.visible = true; this.wing.fold(1);
          g.fold.root.visible = false;
        },
        tick: (k, dt) => { g.hud.setFade(1 - smoothstep(0.2, 1, k), '#fff8ee'); placeWing(0, dt); g.cutCam = orbit(-2.1); },
      },
      ...W.build.map((l, i): Beat => ({
        line: l,
        enter: () => { const who = l.who === 'Lark' ? lark : wren; who.smileT = 3; g.sound.sfxPlay(i < 2 ? 'build' : 'paper'); },
        tick: (k, dt) => { this.wing.fold(1 - clamp((i + k) / W.build.length) ); placeWing(0, dt); g.cutCam = orbit(-2.1 + (i + k) * 0.35); },
      })),
      {
        line: { text: W.built }, dur: 5,
        enter: () => { lark.pose = { cheer: 1 } as typeof lark.pose; wren.pose = {}; g.sound.sfxPlay('power'); g.fold.hop(); },
        tick: (k, dt) => { this.wing.fold(0); placeWing(sm(k) * 1.6, dt); g.cutCam = orbit(-0.6 + k * 0.3, 6, 2.6); },
        exit: () => {
          this.wing.root.visible = false; g.fold.root.visible = true;
          lark.pose = {}; ch.sendHome(lark); ch.sendHome(wren);
          g.flags.add('sky:kite-built');
        },
      },
    ];
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    const g = this.g, pl = g.player, t = g.time;
    // the laundry blows round Fenn's island until it is caught
    const show = this.has('sky:quest-cloth') && !this.has('sky:laundry');
    let left = 0;
    for (const l of this.laundry) {
      const vis = show && l.caught < 1;
      l.obj.visible = vis || (l.caught > 0 && l.caught < 1);
      if (!l.obj.visible) continue;
      l.a += l.speed * dt;
      const pos = l.base.clone().addScaledVector(l.t1, Math.cos(l.a) * l.r).addScaledVector(l.t2, Math.sin(l.a) * l.r).addScaledVector(l.up, l.h + Math.sin(t * 1.3 + l.r) * 0.4);
      if (l.caught > 0) {
        // caught: it flutters into Nilo's arms and is tucked away
        l.caught = Math.min(1, l.caught + dt * 1.8);
        pos.lerp(pl.pos.clone().addScaledVector(pl.up, 1), sm(l.caught));
        l.obj.scale.setScalar(1 - sm(l.caught) * 0.8);
      } else left++;
      l.obj.position.copy(pos);
      const d = pos.clone().sub(this.ch.p.center).normalize();
      orientTo(l.obj, d, l.t1.clone().multiplyScalar(-Math.sin(l.a)).addScaledVector(l.t2, Math.cos(l.a)));
      flutter(l.cloth, t + l.r);
      for (const c of l.obj.children) if (c.userData.glint) { c.lookAt(g.camera.position); ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.3 * Math.sin(t * 4 + l.r); }
      if (l.caught === 0 && pos.distanceTo(pl.pos.clone().addScaledVector(pl.up, 0.9)) < 1.5 && g.mode === 'play') {
        l.caught = 0.001;
        left--;
        g.sound.sfxPlay('gift'); g.fold.hop();
        const n = this.laundry.filter(x => x.caught > 0).length;
        g.hud.notify(W.caught(l.name, n));
        if (n === this.laundry.length) { g.flags.add('sky:laundry'); g.hud.notify(W.laundryDone); g.save(); }
      }
    }
    void left;
    // the sour chime swings when turned, and glows once it sings true
    const c = this.chime;
    c.swing = Math.max(0, c.swing - dt * 0.6);
    c.tubes.forEach((tb, i) => { tb.rotation.z = Math.sin(t * 9 + i * 2) * 0.18 * c.swing; });
    c.weight.rotation.y += (c.notch * 1.2 - c.weight.rotation.y) * (1 - Math.exp(-6 * dt));
    const gm = c.glow.material as THREE.MeshBasicMaterial;
    gm.opacity = this.has('sky:chime-tuned') ? 0.18 + 0.12 * Math.sin(t * 2) : this.has('sky:quest-string') ? 0.08 * c.swing : 0;
    // the frame on the windmill glints until it is taken
    this.frameObj.visible = !this.has('sky:part-frame');
    // the first glide: Fold stays open until Nilo is down
    if (pl.forceOpen && pl.grounded) pl.forceOpen = false;
    // the fox: the first time you see her from Landing Isle, Lark comes to help
    if ((this.foxCheck -= dt) < 0) {
      this.foxCheck = 0.4;
      if (this.has('sky:quest-kite') && !this.has('sky:fox-seen') && !this.has('fox-joined') && g.mode === 'play' && pl.grounded
        && isleAt(this.ch.p, pl.up)?.def.id === 'landing' && pl.pos.distanceTo(g.fox.f.root.position) < 26) g.cut(this.foxBeats());
    }
    if (this.has('sky:fox-seen') && g.mode === 'play' && !this.ch.npc('lark').root.position.equals(this.ch.home.lark.pos)
      && this.ch.npc('lark').root.position.distanceTo(pl.pos) > 40) this.ch.sendHome(this.ch.npc('lark'));
    void onIsle;
  }
}

/** Wave a cloth's vertices like washing in the wind. */
function flutter(m: THREE.Mesh, t: number) {
  const pos = m.geometry.attributes.position as THREE.BufferAttribute, rest = m.userData.rest as Float32Array;
  for (let i = 0; i < pos.count; i++) {
    const x = rest[i * 3], y = rest[i * 3 + 1];
    pos.setZ(i, Math.sin(t * 6 + x * 4 + y * 2) * 0.12 * (0.5 + Math.abs(x)));
  }
  pos.needsUpdate = true;
}

/** Two crossed sticks, bound in the middle with red twine: a kite frame. */
function kiteFrame(): THREE.Group {
  const g = new THREE.Group();
  const wood = Props.toon('#b88a54');
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 5), wood); g.add(spine);
  const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5), wood); spar.rotation.z = Math.PI / 2; spar.position.y = 0.25; g.add(spar);
  const tie = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), Props.toon('#c8443a')); tie.position.y = 0.25; g.add(tie);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd88a', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  glint.position.y = 0.2; g.add(glint);
  return g;
}
