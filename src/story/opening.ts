// The first three minutes: the title over the cloud sea, waking by the spring, the letter, and the home light.
import * as THREE from 'three';
import type { Game } from '../game';
import type { Beat } from './sequencer';
import type { CamPose } from '../systems/skyView';
import { CHAPTERS, LETTER, OPENING } from '../data/story';
import { PK } from '../world/peaks';
import { smoothstep } from '../world/noise';
import { stormPanel } from './panels';

export const LETTER_TEXT = LETTER;

/** A slow drift over the cloud sea: all six worlds hang below, and far down one light blinks. */
export function titleCamera(g: Game, t: number): CamPose {
  const c = g.skyView.center;
  const a = 0.6 + t * 0.012;
  const pos = c.clone().add(new THREE.Vector3(Math.cos(a) * 980, 380 + Math.sin(t * 0.05) * 30, Math.sin(a) * 980));
  return { pos, look: c.clone().add(new THREE.Vector3(0, -140, 0)), up: new THREE.Vector3(0, 1, 0) };
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

/** After the letter: "Look down." The camera swings out past the edge of the world to the home light far below. */
export function lookDownBeats(g: Game): Beat[] {
  const p0 = g.planets[0], sea = g.planets[5], pl = g.player;
  const dirH = sea.center.clone().sub(p0.center).setY(0).normalize();
  const out: CamPose = {
    pos: p0.center.clone().addScaledVector(dirH, p0.R + 125).add(new THREE.Vector3(0, 30, 0)),
    look: g.beaconPos.clone(), up: new THREE.Vector3(0, 1, 0),
  };
  let from: CamPose | null = null;
  return [
    {
      line: { text: OPENING.lookDown }, dur: 2.4,
      enter: () => { pl.lookAt = g.beaconPos.clone(); },
      tick: k => { pl.pose = { listen: smoothstep(0, 1, k) }; },
    },
    {
      line: { text: OPENING.homeLight }, dur: 7.5,
      enter: () => { from = { pos: g.camera.position.clone(), look: g.rig.look.clone(), up: g.camera.up.clone() }; },
      tick: k => {
        const e = smoothstep(0, 0.45, k);
        const pose = lerpPose(from!, out, e);
        pose.pos.addScaledVector(from!.up, Math.sin(e * Math.PI) * 40);
        g.cutCam = pose;
        g.fogK = e;
        g.beacon.scale.setScalar(0.018 + 0.02 * smoothstep(0.35, 0.6, k));
      },
    },
    {
      dur: 2.4,
      tick: k => {
        const back: CamPose = { pos: g.rig.pos.clone(), look: g.rig.look.clone(), up: g.rig.smoothUp.clone() };
        g.cutCam = lerpPose(out, back, smoothstep(0, 1, k));
        g.fogK = 1 - smoothstep(0, 0.8, k);
        pl.pose = { touchChest: smoothstep(0.5, 1, k) };
      },
      exit: () => { g.cutCam = null; g.fogK = 0; pl.lookAt = null; },
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
