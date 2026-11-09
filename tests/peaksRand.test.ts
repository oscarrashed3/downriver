import './canvasStub';
import { it, expect } from 'vitest';
import * as THREE from 'three';
import { WORLDS } from '../src/world/worlds';
import { Planet } from '../src/world/planet';
import { prepare, populate } from '../src/world/content';
import { randState, setRandState, skipRand } from '../src/world/props';

// The Spring Peaks objects built after the worlds (Life, the echo stones, Chapter One's props) share the prop
// generator. Game puts it back where the six-world journey left it, so World 1 looks exactly as before the cut.
it('World 1 draws the same prop numbers as in the six-world journey', () => {
  const scene = new THREE.Scene();
  const riverLon = Math.atan2(0.8, 0.5) * 180 / Math.PI;
  let afterPeaks = 0;
  WORLDS.forEach((w, i) => { const p = new Planet(w, i, riverLon); prepare(p); p.build(); populate(p, scene, i); if (i === 0) afterPeaks = randState(); });
  // Generator state after the Spring Peaks, and after all six worlds, measured on the six-world build.
  expect(afterPeaks).toBe(684644145);
  setRandState(afterPeaks); skipRand(4441);
  expect(randState()).toBe(84812527);
}, 120000);
