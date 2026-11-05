import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { talkSpot, overShoulder, segmentClear, chooseShot, SHOT_VARIANTS, TALK_GAP } from '../src/systems/stage';
import type { Solid } from '../src/world/collide';

const up = new THREE.Vector3(0, 1, 0);
const center = new THREE.Vector3(0, -1000, 0);

describe('talkSpot', () => {
  it('stands 1.6 m in front, on the side Nilo comes from', () => {
    const p = talkSpot(new THREE.Vector3(0, 0, 0), up, new THREE.Vector3(5, 0, 0), () => true);
    expect(p.x).toBeCloseTo(TALK_GAP); expect(p.z).toBeCloseTo(0);
  });
  it('goes round to the nearest free spot when that side is blocked', () => {
    const p = talkSpot(new THREE.Vector3(0, 0, 0), up, new THREE.Vector3(5, 0, 0), q => q.x < 1.5);
    expect(p.distanceTo(new THREE.Vector3())).toBeCloseTo(TALK_GAP);
    expect(p.x).toBeLessThan(1.5);
    expect(p.x).toBeGreaterThan(0); // 60 degrees round, not the far side
  });
});

describe('overShoulder', () => {
  // Nilo is short (eyes at 1.15), a villager is taller (eyes at 1.6), 1.6 m apart
  const nilo = new THREE.Vector3(0, 1.15, 0), them = new THREE.Vector3(0, 1.6, -1.6);
  const cam = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 100);
  const frame = (shot: ReturnType<typeof overShoulder>) => {
    cam.position.copy(shot.pos); cam.up.copy(shot.up); cam.lookAt(shot.look); cam.updateMatrixWorld();
    return [nilo.clone().project(cam), them.clone().project(cam)];
  };
  for (const side of [1, -1]) {
    it(`frames both heads apart and on screen (shoulder ${side})`, () => {
      const [a, b] = frame(overShoulder(nilo, them, up, side));
      expect(Math.abs(b.x)).toBeLessThan(0.6);       // the speaker is well inside the frame
      expect(Math.abs(a.x)).toBeLessThan(1.0);       // Nilo's head is still in the shot
      expect(Math.abs(a.x - b.x)).toBeGreaterThan(0.35); // and the two faces do not overlap
      expect(Math.abs(b.y)).toBeLessThan(0.8);
      // both faces sit above the dialogue box, which covers the bottom 46% of the screen
      expect(a.y).toBeGreaterThan(0.15); expect(b.y).toBeGreaterThan(0.15);
    });
  }
  it('the reverse shot looks at Nilo over their shoulder', () => {
    const shot = overShoulder(them, nilo, up, -1);
    const [a] = frame(shot);
    expect(Math.abs(a.x)).toBeLessThan(0.6);
    expect(shot.pos.z).toBeLessThan(-1.6); // behind the villager
    expect(a.y).toBeGreaterThan(0.15);
  });
});

describe('segmentClear', () => {
  const house = new THREE.Object3D(); house.position.set(0, 0, -4); house.updateMatrixWorld();
  const solids: Solid[] = [{ obj: house, shape: { kind: 'box', hw: 2, hd: 1.5 }, h: 6 }];
  it('is clear when nothing is between the camera and Nilo', () => {
    expect(segmentClear(solids, new THREE.Vector3(0, 1.3, 0), new THREE.Vector3(0, 3, 6), center)).toBe(1);
  });
  it('reports where a wall cuts the line, so the camera can push in', () => {
    const k = segmentClear(solids, new THREE.Vector3(0, 1.3, 0), new THREE.Vector3(0, 3, -8), center);
    expect(k).toBeGreaterThan(0.2); expect(k).toBeLessThan(0.45);
  });
});

describe('chooseShot', () => {
  const nilo = new THREE.Vector3(0, 1.15, 0), them = new THREE.Vector3(0, 1.6, -1.6);
  it('takes the level shot on the right when nothing is in the way', () => {
    expect(chooseShot(nilo, them, up, () => 1)).toMatchObject({ side: 1, wide: 1, lift: 0 });
  });
  it('goes to the other side when a house stands on the right', () => {
    const house = new THREE.Object3D(); house.position.set(4, 0, -0.8); house.updateMatrixWorld();
    const solids: Solid[] = [{ obj: house, shape: { kind: 'box', hw: 1.5, hd: 3 }, h: 6 }];
    const pick = chooseShot(nilo, them, up, (a, b) => segmentClear(solids, a, b, center));
    expect(pick.side).toBe(-1); expect(pick.score).toBe(1);
  });
  it('every variant keeps both faces on screen and above the dialogue box', () => {
    const cam = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 100);
    for (const [wide, lift] of SHOT_VARIANTS) {
      const shot = overShoulder(nilo, them, up, 1, wide, lift);
      cam.position.copy(shot.pos); cam.up.copy(shot.up); cam.lookAt(shot.look); cam.updateMatrixWorld();
      const a = nilo.clone().project(cam), b = them.clone().project(cam);
      expect(Math.abs(a.x)).toBeLessThan(1); expect(Math.abs(b.x)).toBeLessThan(1);
      expect(a.y).toBeGreaterThan(0.1); expect(b.y).toBeGreaterThan(0.1); expect(a.y).toBeLessThan(0.95);
      expect(Math.abs(a.x - b.x)).toBeGreaterThan(0.25);
    }
  });
});
