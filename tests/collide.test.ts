import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { pushOut2, resolveSolids, deckUnder, type Solid, type Deck } from '../src/world/collide';

describe('pushOut2', () => {
  it('leaves a body alone when it is clear of a circle', () => {
    expect(pushOut2(3, 0, 0.4, { kind: 'circle', r: 1 })).toBeNull();
  });
  it('pushes a body out of a circle along the line from its center', () => {
    const p = pushOut2(1, 0, 0.4, { kind: 'circle', r: 1 })!;
    expect(p[0]).toBeCloseTo(0.4); expect(p[1]).toBeCloseTo(0);
  });
  it('pushes out of a box through the nearest face', () => {
    const p = pushOut2(0, 1.2, 0.4, { kind: 'box', hw: 2, hd: 1 })!;
    expect(p[0]).toBeCloseTo(0); expect(p[1]).toBeCloseTo(0.2);
    const q = pushOut2(1.9, 0.1, 0.4, { kind: 'box', hw: 2, hd: 1 })!; // center inside, nearest is the x face
    expect(q[0]).toBeCloseTo(0.5); expect(q[1]).toBeCloseTo(0);
  });
});

/** A flat patch of a big planet: the surface is y = 0 near the origin. */
const center = new THREE.Vector3(0, -1000, 0);

describe('resolveSolids', () => {
  const house = new THREE.Object3D();
  const solids: Solid[] = [{ obj: house, shape: { kind: 'box', hw: 2, hd: 1.5 }, h: 6 }];

  it('keeps a walker outside a house wall, sliding along it', () => {
    const pos = new THREE.Vector3(0.5, 0, 1.6); // walked into the +z wall
    expect(resolveSolids(solids, pos, center, 0.38)).toBe(true);
    expect(pos.z).toBeCloseTo(1.88);
    expect(pos.x).toBeCloseTo(0.5); // sideways movement is kept: it slides
  });
  it('follows the house when it is turned', () => {
    house.rotation.y = Math.PI / 2; house.updateMatrixWorld();
    const pos = new THREE.Vector3(1.6, 0, 0.5); // now the long side faces x
    resolveSolids(solids, pos, center, 0.38);
    expect(pos.x).toBeCloseTo(1.88);
    house.rotation.y = 0;
  });
  it('lets you stand on top of something low, but not tall', () => {
    const wall: Solid[] = [{ obj: new THREE.Object3D(), shape: { kind: 'box', hw: 2.6, hd: 0.32 }, h: 0.62 }];
    const above = new THREE.Vector3(0, 0.8, 0.1);
    expect(resolveSolids(wall, above, center)).toBe(false);
    const beside = new THREE.Vector3(0, 0.1, 0.3);
    expect(resolveSolids(wall, beside, center)).toBe(true);
  });
  it('skips solids that are switched off or hidden', () => {
    const fire = new THREE.Object3D();
    const s: Solid[] = [{ obj: fire, shape: { kind: 'circle', r: 1 }, h: 1, on: () => false }];
    expect(resolveSolids(s, new THREE.Vector3(0.2, 0, 0), center)).toBe(false);
    s[0].on = undefined; fire.visible = false;
    expect(resolveSolids(s, new THREE.Vector3(0.2, 0, 0), center)).toBe(false);
  });
});

describe('deckUnder (the bridge)', () => {
  const br = new THREE.Object3D();
  const deck: Deck = { obj: br, span: 10, width: 2.4, top: x => 0.96 + Math.sin((x / 10 + 0.5) * Math.PI) * 1.1 };
  it('is highest in the middle of the arch', () => {
    const mid = deckUnder(deck, new THREE.Vector3(0, 0, 0), center)!;
    const end = deckUnder(deck, new THREE.Vector3(4.9, 0, 0), center)!;
    expect(mid.lift).toBeCloseTo(2.06);
    expect(end.lift).toBeLessThan(1.05);
  });
  it('is not under you past the ends or well off the sides', () => {
    expect(deckUnder(deck, new THREE.Vector3(5.5, 0, 0), center)).toBeNull();
    expect(deckUnder(deck, new THREE.Vector3(0, 0, 2.2), center)).toBeNull();
  });
});
