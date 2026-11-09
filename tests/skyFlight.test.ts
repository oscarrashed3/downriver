import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { newGlider, stepGlide, GLIDE } from '../src/world/skyIsles/flight';

const up = new THREE.Vector3(0, 1, 0);
const still = new THREE.Vector3();
function fly(seconds: number, o: { dive?: boolean; lift?: number; hold?: boolean; move?: THREE.Vector3 } = {}, g = newGlider(), vU0 = -2) {
  const vTan = new THREE.Vector3(0, 0, 9);
  let vU = vU0;
  let h = 0;
  for (let t = 0; t < seconds; t += 1 / 60) {
    vU = stepGlide(g, vU, vTan, { dt: 1 / 60, up, moveDir: o.move ?? still, hold: o.hold ?? true, dive: !!o.dive, grounded: false, clearance: 20, lift: o.lift ?? 0, facing: new THREE.Vector3(0, 0, 1) });
    h += vU / 60;
  }
  return { g, vU, vTan, h };
}

describe('Sky Isles glider', () => {
  it('opens when jump is held off an edge, and closes when it is let go', () => {
    const { g } = fly(0.5);
    expect(g.open).toBe(true);
    const r = fly(0.2, { hold: false }, g);
    expect(r.g.open).toBe(false);
  });
  it('does not open on a small hop over flat ground', () => {
    const g = newGlider(), vTan = new THREE.Vector3(0, 0, 5);
    stepGlide(g, -1, vTan, { dt: 1 / 60, up, moveDir: still, hold: true, dive: false, grounded: false, clearance: 0.8, lift: 0, facing: new THREE.Vector3(0, 0, 1) });
    expect(g.open).toBe(false);
  });
  it('bleeds speed slowly and sinks gently while gliding level', () => {
    const { g, vU } = fly(6);
    expect(g.speed).toBeLessThan(GLIDE.cruise);
    expect(g.speed).toBeGreaterThan(GLIDE.min);
    expect(vU).toBeLessThan(0);
    expect(vU).toBeGreaterThan(-4.5);
  });
  it('gains speed in a dive, and turns it into a climb on the pull-up', () => {
    const a = fly(2, { dive: true });
    expect(a.g.speed).toBeGreaterThan(15);
    expect(a.vU).toBeLessThan(-6);
    const b = fly(0.6, {}, a.g, a.vU);
    expect(b.vU).toBeGreaterThan(0);
  });
  it('climbs in an updraft', () => {
    const { h } = fly(3, { lift: 1 });
    expect(h).toBeGreaterThan(5);
  });
  it('turns toward the stick and banks into the turn', () => {
    const { g } = fly(0.4, { move: new THREE.Vector3(1, 0, 0) });
    expect(g.heading.x).toBeGreaterThan(0.3);
    expect(Math.abs(g.bank)).toBeGreaterThan(0.1);
  });
});
