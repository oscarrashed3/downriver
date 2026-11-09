// The first three minutes: the title over the cloud sea, waking by the spring, the letter, and the home light.
import * as THREE from 'three';
import type { Game } from '../game';
import type { Beat } from './sequencer';
import type { CamPose } from '../systems/skyView';
import { CHAPTERS, LETTER, OPENING } from '../data/story';
import { PK } from '../world/peaks';
import { WORLDS } from '../world/worlds';
import { smoothstep } from '../world/noise';
import { stormPanel } from './paintedPanels';

export const LETTER_TEXT = LETTER;

/** The sky while Nilo looks up: a soft cornflower overhead and a warm, pearly band low down. */
const DREAM_TOP = new THREE.Color('#78a4e4');
const DREAM_HORIZON = new THREE.Color('#ffe2cc');

/**
 * The title: from just above the first world, looking down the long spiral of worlds into the glowing cloud sea.
 * The first world is close and large at the edge of the frame, the others sink one by one into the warm haze,
 * and far down under the title the home light blinks. A very slow drift keeps it alive.
 */
const TITLE_POSE = [-0.5, 950, -60, 0.5, -460];
export function titleCamera(g: Game, t: number): CamPose {
  const P = g.planets, top = P[0].center, deep = P[P.length - 1].center;
  // where round the column we stand, how far out, how high above the first world, how far down we look, and how far
  // the look is pushed sideways (so the spiral of worlds runs down the left of the frame, clear of the words)
  const [a0, r, h, lookK, side] = (g as unknown as { titleTune?: number[] }).titleTune ?? TITLE_POSE;
  const a = a0 + Math.sin(t * 0.03) * 0.05 + t * 0.002;
  const pos = top.clone().add(new THREE.Vector3(Math.cos(a) * r, h + Math.sin(t * 0.07) * 8, Math.sin(a) * r));
  const look = top.clone().lerp(deep, lookK).add(new THREE.Vector3(Math.cos(a + 1.57) * side, 0, Math.sin(a + 1.57) * side));
  return { pos, look, up: new THREE.Vector3(0, 1, 0) };
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
 * After the letter: "Look up." Nilo turns and tips his head back; the camera sinks low behind him and tilts up
 * into the sky, where the other three worlds hang beyond the clouds like far moons, and on the farthest one the home
 * light blinks. Then the clouds drift over them, and the camera comes back down behind him.
 */
export function lookUpBeats(g: Game): Beat[] {
  const pl = g.player, isl = g.islands;
  // time marks of the whole shot, in seconds from "Look up."
  const A = 2.8, B = 5.5, C = 5.3, D = 2.8;
  let from: CamPose | null = null;
  let face0 = new THREE.Vector3(), turn = 0, swelled = 0, rigYaw = 0, rigPitch = 0;
  const up = () => pl.up.clone();
  const fwdNow = (T: number) => face0.clone().applyAxisAngle(pl.up, turn * smoothstep(0.15, 2.2, T));
  // over his shoulder, then low behind him looking up past his hood into the sky
  const behind = (): CamPose => {
    const f = isl.fwd, r = isl.right, u = up();
    return { pos: pl.pos.clone().addScaledVector(f, -3.0).addScaledVector(u, 1.6).addScaledVector(r, 0.8 * g.lookSide), look: pl.pos.clone().addScaledVector(u, 1.5).addScaledVector(f, 3), up: u };
  };
  const low = (T: number): CamPose => {
    const f = isl.fwd, r = isl.right, u = up();
    const drift = smoothstep(A + 2, A + B + C, T);
    const pos = pl.pos.clone().addScaledVector(f, -1.8 + drift * 0.25).addScaledVector(u, 0.3).addScaledVector(r, (0.7 - drift * 0.15) * g.lookSide);
    // first the sky over the nearer worlds, then, as the light comes on, drift up toward the farthest one
    const near = isl.skyDir(37, -4 * isl.flip), home = isl.homeDir();
    const dir = near.lerp(home, smoothstep(A + B - 0.5, A + B + C - 0.3, T) * 0.55).normalize();
    return { pos, look: pos.clone().addScaledVector(dir, 60), up: u };
  };
  /** Swing round Nilo's head rather than straight through him. */
  const orbit = (a: CamPose, b: CamPose, k: number): CamPose => {
    const c = pl.pos.clone().addScaledVector(pl.up, 1.2);
    const va = a.pos.clone().sub(c), vb = b.pos.clone().sub(c);
    const la = va.length(), lb = vb.length();
    const q = new THREE.Quaternion().setFromUnitVectors(va.normalize(), vb.normalize());
    const v = va.applyQuaternion(new THREE.Quaternion().slerp(q, k)).multiplyScalar(la + (lb - la) * k);
    const pose = lerpPose(a, b, k);
    pose.pos.copy(c).add(v);
    return pose;
  };
  const sky = (T: number) => {
    const reveal = smoothstep(A + 0.6, A + B + 1.2, T);
    const light = smoothstep(A + B + 0.2, A + B + 1.6, T);
    const veil = smoothstep(A + B + C - 0.2, A + B + C + D * 0.8, T);
    const show = 1 - smoothstep(A + B + C + D * 0.5, A + B + C + D, T);
    isl.update(g.camera, T, show, reveal, light, veil);
    // a softer, dreamier blue overhead while we look up, warming toward the sun
    const pal = WORLDS[0].palette, dream = show * smoothstep(A * 0.3, A + 1.5, T);
    (g.sky.mat.uniforms.uTop.value as THREE.Color).set(pal.skyTop).lerp(DREAM_TOP, dream * 0.7);
    (g.sky.mat.uniforms.uHorizon.value as THREE.Color).set(pal.skyHorizon).lerp(DREAM_HORIZON, dream * 0.45);
    if (swelled === 0 && T > A + 0.2) { swelled = 1; g.sound.swell(0); }
    if (swelled === 1 && T > A + B + 0.3) { swelled = 2; g.sound.swell(1); }
  };
  return [
    {
      line: { text: OPENING.lookUp }, dur: A,
      enter: () => {
        from = { pos: g.camera.position.clone(), look: g.rig.look.clone(), up: g.camera.up.clone() };
        rigYaw = g.rig.yaw; rigPitch = g.rig.pitch;
        const fwd = g.planLookUp();
        g.bakeIslands();
        isl.clearSky(g.sky.clouds);
        const u = pl.up;
        face0 = pl.facing.clone().projectOnPlane(u).normalize();
        turn = Math.atan2(new THREE.Vector3().crossVectors(face0, fwd).dot(u), face0.dot(fwd));
        pl.lookAt = pl.pos.clone().addScaledVector(isl.skyDir(45, 0), 60);
      },
      tick: k => {
        const T = k * A;
        pl.facing.copy(fwdNow(T));
        pl.pose = { listen: smoothstep(0, 0.6, k) * 0.5 };
        g.cutCam = orbit(from!, behind(), smoothstep(0.05, 1, k));
        sky(T);
      },
      exit: () => { pl.facing.copy(isl.fwd); g.rig.faceDir(pl.up, isl.fwd); },
    },
    {
      line: { text: OPENING.worlds }, dur: B,
      // Fold settles on his satchel to look up with him, out of the way of the sky
      enter: () => { g.fold.perch = pl.pos.clone().addScaledVector(pl.up, 0.8).addScaledVector(isl.right, -0.3 * g.lookSide).addScaledVector(isl.fwd, -0.12); },
      tick: k => {
        const T = A + k * B;
        g.cutCam = lerpPose(behind(), low(T), smoothstep(0, 0.75, k));
        sky(T);
      },
    },
    {
      line: { text: OPENING.homeLight }, dur: C,
      // the follow camera goes back to just where it was, so the shot lands on the view it started from
      exit: () => { g.rig.yaw = rigYaw; g.rig.pitch = rigPitch; },
      tick: k => {
        const T = A + B + k * C;
        g.cutCam = low(T);
        sky(T);
      },
    },
    {
      dur: D,
      enter: () => { from = low(A + B + C); },
      tick: k => {
        const T = A + B + C + k * D;
        const back: CamPose = { pos: g.rig.pos.clone(), look: g.rig.look.clone(), up: g.rig.smoothUp.clone() };
        g.cutCam = orbit(from!, back, smoothstep(0.1, 1, k));
        pl.pose = { touchChest: smoothstep(0.4, 1, k) };
        // and he turns back to the spring, where the old woman is waiting
        pl.facing.copy(isl.fwd).applyAxisAngle(pl.up, -turn * smoothstep(0.3, 0.9, k));
        if (k > 0.3) { pl.lookAt = null; g.fold.perch = null; }
        sky(T);
      },
      exit: () => { g.cutCam = null; pl.lookAt = null; g.fold.perch = null; isl.update(g.camera, 0, 0, 0, 0); isl.restoreSky(g.sky.clouds); g.sky.setPalette(WORLDS[0].palette.skyTop, WORLDS[0].palette.skyHorizon); },
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
