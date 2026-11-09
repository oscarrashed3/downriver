// The first three minutes: the title over the cloud sea, waking by the spring, the letter, and the home light.
import * as THREE from 'three';
import type { Game } from '../game';
import type { Beat } from './sequencer';
import type { CamPose } from '../systems/skyView';
import { CHAPTERS, LETTER, OPENING } from '../data/story';
import { PK } from '../world/peaks';
import { LOOK_CAM } from '../world/skyIslands';
import { smoothstep } from '../world/noise';
import { stormPanel } from './paintedPanels';

export const LETTER_TEXT = LETTER;

/**
 * The title: standing in the open sky high above the first world, looking out level. All six worlds hang round
 * the words like moons: the first near and large on the left, the others smaller and paler, the last one low by
 * the cloud floor with the home light blinking on it. The sun is just off the right of the frame.
 */
export function setupTitleSky(g: Game) {
  const isl = g.islands, up = new THREE.Vector3(0, 1, 0);
  const sunH = g.day.sun.clone().projectOnPlane(up);
  if (sunH.lengthSq() < 1e-4) sunH.set(1, 0, 0);
  sunH.normalize();
  // face so the sun stands about sixty-five degrees to the right
  let fwd = sunH.clone().applyAxisAngle(up, 65 * Math.PI / 180);
  if (new THREE.Vector3().crossVectors(fwd, up).dot(sunH) < 0) fwd = sunH.clone().applyAxisAngle(up, -65 * Math.PI / 180);
  isl.configure('title');
  isl.setFrame(g.planets[0].center.clone().add(new THREE.Vector3(0, 1700, 0)), up, fwd, 1, g.day.sun);
}

export function titleCamera(g: Game, t: number): CamPose {
  const isl = g.islands;
  // a very slow drift, so the sky breathes
  const look = isl.origin.clone().addScaledVector(isl.skyDir(3 + Math.sin(t * 0.05) * 0.4, Math.sin(t * 0.03) * 1.2), 100);
  return { pos: isl.origin.clone(), look, up: isl.up.clone() };
}

function lerpPose(a: CamPose, b: CamPose, k: number): CamPose {
  return { pos: a.pos.clone().lerp(b.pos, k), look: a.look.clone().lerp(b.look, k), up: a.up.clone().lerp(b.up, k).normalize() };
}

/** The storm: three painted panels. A paper boat in the sky, the keeper in a lightning flash, the fall. */
export function stormBeats(g: Game): Beat[] {
  const panels = [0, 1, 2].map(i => stormPanel(i));
  return OPENING.storm.map((cap, i) => ({
    dur: i === 1 ? 5.5 : 4.8,
    enter: () => {
      g.hud.setFade(0, '#ffffff');
      g.hud.showPanel(panels[i], cap, 1);
      g.sound.sfxPlay(i === 1 ? 'whoosh' : 'soft');
    },
    tick: (k: number) => {
      // the lightning: two hard white flashes, and then the figure is just there
      if (i === 1) g.hud.setFade(Math.min(1, Math.max(0, 1 - Math.abs(k - 0.04) * 25) + Math.max(0, 1 - Math.abs(k - 0.14) * 30)), '#ffffff', true);
      const fr = panels[i].parentElement as HTMLElement | null;
      if (fr) fr.style.opacity = String(smoothstep(0, 0.12, k) * (1 - smoothstep(0.9, 1, k)));
    },
    exit: () => { if (i === 2) { g.hud.showPanel(null); g.hud.setFade(1, '#fff8ee', true); } },
  }));
}

/** Nilo wakes in the snow beside the sleeping Hollo. Five seconds of quiet, then a drop falls into the lantern. */
export function wakeBeats(g: Game): Beat[] {
  const p = g.planets[0], pl = g.player;
  let drop: THREE.Mesh | null = null;
  let from: CamPose | null = null;
  // Low and to the side, at his head: Nilo lying in the snow in the foreground, the sleeping Hollo beyond him.
  // k drifts the camera slowly in; it never looks straight down and never starts inside Hollo or the snow.
  const closeShot = (k: number): CamPose => {
    const up = pl.up, f = pl.facing, side = new THREE.Vector3().crossVectors(up, f).normalize();
    const head = pl.pos.clone().addScaledVector(f, -0.75).addScaledVector(up, 0.25);
    const hollo = (g.contents[0].refs.hollo as { root: THREE.Object3D }).root.position;
    const toH = hollo.clone().sub(head).projectOnPlane(up).normalize();
    // beside his face, a little toward his feet, so Hollo sits behind him in the frame instead of over him
    const look = head.clone().addScaledVector(toH, 0.5).addScaledVector(up, 0.25 + k * 0.3);
    const pos = head.clone().addScaledVector(side, -(1.9 - k * 0.5)).addScaledVector(toH, -1.1 + k * 0.2).addScaledVector(up, 0.75 + k * 0.35);
    return { pos, look, up: up.clone() };
  };
  return [
    ...stormBeats(g),
    {
      dur: 1.6,
      enter: () => {
        g.hud.setFade(1, '#fff8ee', true);
        const d = p.dirRiver(PK.wake[0], PK.wake[1]);
        // a few steps further from Hollo than the old spot, so the first shot is Nilo's face and not the giant's
        const hd = (g.contents[0].refs.hollo as { root: THREE.Object3D }).root.position.clone().sub(p.center).normalize();
        d.applyAxisAngle(new THREE.Vector3().crossVectors(hd, d).normalize(), 3.5 / p.R);
        pl.placeAt(p, d);
        pl.facing.copy(p.surfacePoint(p.dirRiver(PK.spring[0], PK.spring[1])).sub(pl.pos).projectOnPlane(pl.up).normalize().negate());
        pl.hasDrop = false;
        pl.pose = { lie: 1 };
        pl.sync();
        g.day.setLocal(pl.up, 0.3);
        g.rig.faceDir(pl.up, p.surfacePoint(p.dirRiver(PK.spring[0], PK.spring[1])).sub(pl.pos));
        g.rig.snap();
        g.cutCam = closeShot(0);
        (g.contents[0].refs.spring.userData.drop as THREE.Object3D).visible = false;
      },
      tick: k => g.hud.setFade(1 - smoothstep(0.1, 1, k), '#fff8ee'),
    },
    {
      // Five seconds. No words. Wind in the grass, the chimes in the old tree.
      dur: 5,
      enter: () => {
        drop = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: '#dff8ff' }));
        g.scene.add(drop);
      },
      tick: k => {
        g.cutCam = closeShot(smoothstep(0, 1, k) * 0.35);
        if (!drop) return;
        const target = pl.lantern.getWorldPosition(new THREE.Vector3());
        const f = smoothstep(0.5, 0.95, k);
        drop.visible = k > 0.5;
        drop.position.copy(target).addScaledVector(pl.up, (1 - f) * 14);
        drop.scale.setScalar(1 + Math.sin(k * 40) * 0.1);
      },
      exit: () => {
        if (drop) { g.scene.remove(drop); drop = null; }
        pl.hasDrop = true;
        g.flags.add('has-drop');
        g.sound.sfxPlay('chime');
        g.fold.hop();
      },
    },
    {
      dur: 2.6,
      enter: () => { from = closeShot(0.35); },
      tick: k => {
        pl.pose = { lie: 1 - smoothstep(0, 0.6, k), sit: smoothstep(0.2, 0.6, k) * (1 - smoothstep(0.75, 1, k)) };
        const goal: CamPose = { pos: g.rig.pos.clone(), look: g.rig.look.clone(), up: g.rig.smoothUp.clone() };
        g.cutCam = lerpPose(from!, goal, smoothstep(0.3, 1, k));
      },
      exit: () => { pl.pose = {}; pl.satchelGlow = 1; g.cutCam = null; },
    },
  ];
}

/**
 * After the letter: "Look up." Nilo turns toward an open stretch of sky and tips his head back. The camera starts
 * exactly where the follow camera was, moves round in over his shoulder and tilts slowly up past the top of his hood
 * into a luminous sky where the other three worlds rise out of the clouds like far moons; birds cross, the music
 * swells, and on the farthest one the home light blinks. Then he turns back and the camera eases down to exactly
 * the gameplay view, before the chapter title. The worlds stay in the sky, faintly, afterwards.
 */
export function lookUpBeats(g: Game): Beat[] {
  const pl = g.player, isl = g.islands;
  // time marks of the whole shot, in seconds from "Look up."
  const A = 3.4, B = 4.6, C = 4.4, D = 3.4;
  const END = A + B + C + D;
  let face0 = new THREE.Vector3(), turn = 0, swelled = 0;
  let start: CamPose | null = null;
  const deg = Math.PI / 180;
  const fwdAt = (T: number) => face0.clone().applyAxisAngle(pl.up, turn * smoothstep(0.2, 2.8, T));
  /** Low over his shoulder, looking along f, tilted up by `pitch` degrees and turned by `yaw` degrees. */
  const shoulder = (f: THREE.Vector3, pitch: number, back: number, yaw = 0): CamPose => {
    const u = pl.up.clone(), r = new THREE.Vector3().crossVectors(f, u).normalize();
    const pos = pl.pos.clone().addScaledVector(f, -back).addScaledVector(u, LOOK_CAM.high).addScaledVector(r, LOOK_CAM.side * g.lookSide);
    const d = f.clone().applyAxisAngle(u, -yaw * deg);
    const dir = d.multiplyScalar(Math.cos(pitch * deg)).addScaledVector(u, Math.sin(pitch * deg));
    return { pos, look: pos.clone().addScaledVector(dir, 40), up: u };
  };
  /**
   * From pose a to pose b: swung round him on a level circle (never through him or under the ground), height and
   * distance eased separately, the view direction turned smoothly.
   */
  const blend = (a: CamPose, b: CamPose, k: number): CamPose => {
    const u = pl.up, c = pl.pos.clone().addScaledVector(u, 1.1);
    const va = a.pos.clone().sub(c), vb = b.pos.clone().sub(c);
    const ha = va.dot(u), hb = vb.dot(u);
    const fa = va.clone().addScaledVector(u, -ha), fb = vb.clone().addScaledVector(u, -hb);
    const ra = fa.length(), rb = fb.length();
    const ang = Math.atan2(new THREE.Vector3().crossVectors(fa, fb).dot(u), fa.dot(fb));
    const pos = c.clone().add(fa.normalize().applyAxisAngle(u, ang * k).multiplyScalar(ra + (rb - ra) * k)).addScaledVector(u, ha + (hb - ha) * k);
    const da = a.look.clone().sub(a.pos).normalize(), db = b.look.clone().sub(b.pos).normalize();
    const qd = new THREE.Quaternion().setFromUnitVectors(da, db);
    const dir = da.applyQuaternion(new THREE.Quaternion().slerp(qd, k));
    const dist = THREE.MathUtils.lerp(a.look.distanceTo(a.pos), b.look.distanceTo(b.pos), k);
    return { pos, look: pos.clone().addScaledVector(dir, dist), up: a.up.clone().lerp(b.up, k).normalize() };
  };
  /** A soft bump from 0 up to 1 and back over [a, b]. */
  const glare = (t: number, a: number, b: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, (t - a) / (b - a)))) ** 2;
  const followPose = (): CamPose => ({ pos: g.rig.pos.clone(), look: g.rig.look.clone(), up: g.rig.smoothUp.clone() });
  // how far up the camera looks through the shot, and a slow drift toward the farthest world as its light comes on
  const pitchAt = (T: number) => 14 + (LOOK_CAM.pitch - 14) * smoothstep(0.6, A + B * 0.75, T) + 4 * smoothstep(A + B, A + B + C, T);
  const yawAt = (T: number) => 5 * isl.flip * smoothstep(A + B, A + B + C, T);
  const backAt = (T: number) => LOOK_CAM.back + 0.9 * (1 - smoothstep(0, A + 1, T)) - 0.25 * smoothstep(A, A + B + C, T);
  const sky = (T: number) => {
    g.moonShot = {
      t: T, show: 1,
      reveal: smoothstep(A - 1.2, A + B - 0.5, T),
      light: smoothstep(A + B + 0.2, A + B + 1.6, T),
      veil: 0,
      dream: smoothstep(0.3, A, T) * (1 - smoothstep(A + B + C + D * 0.15, END, T)),
    };
    if (swelled === 0 && T > A - 0.4) { swelled = 1; g.sound.swell(0); }
    if (swelled === 1 && T > A + B + 0.3) { swelled = 2; g.sound.swell(1); }
  };
  return [
    {
      line: { text: OPENING.lookUp }, dur: A,
      enter: () => {
        // the follow camera stays put the whole shot, so the shot can come back to exactly it
        start = followPose();
        const fwd = g.planLookUp();
        g.bakeIslands();
        g.prepareLookSwap(shoulder(fwd, LOOK_CAM.pitch, LOOK_CAM.back));
        const u = pl.up;
        face0 = pl.facing.clone().projectOnPlane(u).normalize();
        turn = Math.atan2(new THREE.Vector3().crossVectors(face0, fwd).dot(u), face0.dot(fwd));
        pl.lookAt = pl.pos.clone().addScaledVector(isl.skyDir(50, 0), 60);
      },
      tick: k => {
        const T = k * A;
        const f = fwdAt(T);
        pl.facing.copy(f);
        pl.pose = { listen: smoothstep(0, 0.6, k) * 0.5 };
        g.cutCam = blend(start!, shoulder(f, pitchAt(T), backAt(T)), smoothstep(0.02, 0.85, k));
        // as the camera tips up past the sun it flares warm for a moment, and under it the trees and props right
        // round him that would stand across the sky are put away
        g.hud.setFade(0.6 * glare(T, 2.0, 3.1), '#fff2dc');
        g.forceNear = T > 2.5;
        sky(T);
      },
    },
    {
      line: { text: OPENING.worlds }, dur: B,
      // Fold settles on his satchel to look up with him, out of the way of the sky
      enter: () => {
        const f = fwdAt(A), r = new THREE.Vector3().crossVectors(f, pl.up).normalize();
        g.fold.perch = pl.pos.clone().addScaledVector(pl.up, 0.8).addScaledVector(r, -0.3 * g.lookSide).addScaledVector(f, -0.12);
      },
      tick: k => {
        const T = A + k * B;
        g.cutCam = shoulder(fwdAt(T), pitchAt(T), backAt(T), yawAt(T));
        sky(T);
      },
    },
    {
      line: { text: OPENING.homeLight }, dur: C,
      tick: k => {
        const T = A + B + k * C;
        g.cutCam = shoulder(fwdAt(T), pitchAt(T), backAt(T), yawAt(T));
        sky(T);
      },
    },
    {
      dur: D,
      enter: () => { g.forceNear = false; g.endLookSwap(); },
      tick: k => {
        const T = A + B + C + k * D;
        // he turns back to the spring, where the old woman is waiting, and the camera comes down behind him
        const back = smoothstep(0, 0.5, k);
        const f = face0.clone().applyAxisAngle(pl.up, turn * (1 - back));
        pl.facing.copy(f);
        // the camera comes round behind him the way the follow camera looks, so it lands on it exactly
        const rf = g.rig.forward(g.rig.smoothUp).projectOnPlane(pl.up).normalize();
        const cf = fwdAt(A).clone().applyAxisAngle(pl.up, Math.atan2(new THREE.Vector3().crossVectors(fwdAt(A), rf).dot(pl.up), fwdAt(A).dot(rf)) * back);
        pl.pose = { touchChest: smoothstep(0.3, 0.9, k) * (1 - smoothstep(0.9, 1, k)) };
        const p = THREE.MathUtils.lerp(pitchAt(T), 12, smoothstep(0, 0.6, k));
        g.cutCam = blend(shoulder(cf, p, backAt(T), yawAt(T) * (1 - back)), followPose(), smoothstep(0.4, 1, k));
        if (k > 0.3) { pl.lookAt = null; g.fold.perch = null; }
        // a second warm flare as the clouds close and the camera comes down; under it everything comes back
        g.hud.setFade(0.5 * glare(k, 0.25, 0.6), '#fff2dc');
        g.forceNear = k > 0.42;
        sky(T);
      },
      exit: () => {
        g.hud.setFade(0, '#fff2dc');
        g.cutCam = null; pl.lookAt = null; g.fold.perch = null; g.moonShot = null; g.forceNear = false;
        pl.facing.copy(face0);
      },
    },
    {
      dur: 4.6,
      enter: () => { g.hud.showChapter(CHAPTERS[0].n, CHAPTERS[0].title, '', 4.4); g.sound.sfxPlay('power'); },
      exit: () => { pl.pose = {}; },
    },
    {
      dur: 4.2,
      enter: () => g.showJournal(true),
      exit: () => g.showJournal(false),
    },
  ];
}
