import './canvasStub';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Course, throughGate, type Gate } from '../src/story/skyRace';
import { skyDetail } from '../src/story/skyQuests';

const C = new THREE.Vector3();
const on = (lat: number, lon: number, r: number) => new THREE.Vector3().setFromSphericalCoords(r, lat * Math.PI / 180, lon * Math.PI / 180);
const gate = (lat: number): Gate => {
  const center = on(lat, 0, 90), normal = on(lat + 1, 0, 90).sub(center).normalize();
  return { center, normal, radius: 2, obj: null, note: 72 };
};

describe('Sky race course', () => {
  it('threads every gate in order and keeps its height between them', () => {
    const gates = [gate(40), gate(70), gate(100)];
    const c = new Course(C, gates, on(20, 0, 90));
    expect(c.length).toBeGreaterThan(110);
    expect(c.gateS[0]).toBeLessThan(c.gateS[1]);
    expect(c.gateS[1]).toBeLessThan(c.gateS[2]);
    for (const p of c.pts) expect(Math.abs(p.length() - 90)).toBeLessThan(1.5);
    gates.forEach((g, i) => expect(c.at(c.gateS[i]).distanceTo(g.center)).toBeLessThan(1));
  });
  it('counts a gate only when you fly through the ring', () => {
    const g = gate(50), a = on(49.5, 0, 90), b = on(50.5, 0, 90);
    expect(throughGate(g, a, b)).toBe(true);
    expect(throughGate(g, on(49.5, 0, 96), on(50.5, 0, 96))).toBe(false);
    expect(throughGate(g, a, on(49.8, 0, 90))).toBe(false);
  });
  it('walks the parts errands one sub-step at a time', () => {
    const f = new Set(['sky:arrived', 'sky:quest-kite', 'sky:quest-cloth']);
    expect(skyDetail(f)).toMatch(/laundry/);
    f.add('sky:laundry'); expect(skyDetail(f)).toMatch(/Old Fenn/);
    f.add('sky:part-cloth'); f.add('sky:quest-string'); expect(skyDetail(f)).toMatch(/sour chime/);
    f.add('sky:chime-tuned'); expect(skyDetail(f)).toMatch(/Tell Pell/);
  });
});
