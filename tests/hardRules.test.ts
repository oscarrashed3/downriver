import './canvasStub';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WORLDS } from '../src/world/worlds';
import { Planet, LANTERN_CANALS, LANTERN_HARBOUR_LAT, lanternCanalLon } from '../src/world/planet';
import { prepare, populate } from '../src/world/content';
import { laterArrivalDir, dockDir } from '../src/world/arrival';
import { dirLatLon } from '../src/world/sphere';
import { HOME_LIGHT } from '../src/world/w_lantern';
import { FOX_SPOT } from '../src/world/w_sky';
import { SKY_HOMES } from '../src/story/skyQuests';
import { safeSpot } from '../src/world/spots';
import { skyWalkable, isleAt, onIsle, skySpotProblem } from '../src/world/skyIsles/terrain';

// Oscar's hard rules, checked on the real terrain so overnight work cannot quietly break them.
const riverLon = Math.atan2(0.8, 0.5) * 180 / Math.PI; // as game.ts
const planets = WORLDS.map((w, i) => { const p = new Planet(w, i, riverLon); prepare(p); return p; });

/** The steepest single climb (metres of rise on ground steeper than walking, ~41 deg) along a line of ground heights. */
function worstClimb(h: number[], step: number): number {
  const steep = Math.tan(0.72);
  let worst = 0, run = 0, dir = 0;
  for (let i = 1; i < h.length; i++) {
    const dh = h[i] - h[i - 1];
    const s = Math.sign(dh);
    if (Math.abs(dh) / step > steep) {
      if (s !== dir) { run = 0; dir = s; }
      run += Math.abs(dh); worst = Math.max(worst, run);
    } else { run = 0; dir = 0; }
  }
  return worst;
}

/** Ground heights across the river at path parameter t, from bank to bank. */
function across(p: Planet, t: number, half: number, step = 0.25): number[] {
  const d = p.pathPoint(t), d2 = p.pathPoint(Math.min(1, t + 0.003));
  if (t + 0.003 > 1) d2.copy(p.pathPoint(t - 0.003)).sub(d).negate().add(d);
  const side = new THREE.Vector3().crossVectors(d, d2.clone().sub(d)).normalize();
  const at = (s: number) => d.clone().addScaledVector(side, s / p.R).normalize();
  const out: number[] = [];
  if (p.cfg.shape === 'sky') {
    // the Sky Isles: only the ground you can stand on, out from the river to an island's lip or the aqueduct's
    // edge (beyond is the drop to the cloud sea, not a wall)
    let lo = 0, hi = 0;
    while (lo - step >= -half && skyWalkable(p, at(lo - step))) lo -= step;
    while (hi + step <= half && skyWalkable(p, at(hi + step))) hi += step;
    for (let s = lo; s <= hi + 1e-6; s += step) out.push(p.height(at(s)));
    return out;
  }
  for (let s = -half; s <= half; s += step) out.push(p.height(at(s)));
  return out;
}

/**
 * A climb of up to this much rise is a short scramble (the slow 'climb' at 2.8 m/s, about a second of warmth);
 * anything taller would read as a wall between Nilo and the far bank.
 */
const MAX_CLIMB = 3.0;
/** The water is never deeper than this anywhere you can wade (Nilo walks on the bottom; there is no swimming). */
const MAX_DEPTH = 1.0;

describe('Hard rules', () => {
  for (const p of planets) {
    it(`${p.cfg.id}: the river can be crossed on foot all the way down`, () => {
      const half = p.cfg.riverWidth + p.cfg.bankWidth + 1;
      for (let t = 0.03; t <= 0.97; t += 0.01) {
        const h = across(p, t, half);
        expect(worstClimb(h, 0.25), `${p.cfg.id} t=${t.toFixed(2)}`).toBeLessThan(MAX_CLIMB);
        const water = p.bedAt(t) + p.cfg.waterDepth;
        // (in the Sky Isles only the river's own channel: an island's side streams run lower, at their own level)
        const wade = p.cfg.shape === 'sky' ? across(p, t, p.cfg.riverWidth * 1.25) : h;
        if (p.cfg.shape !== 'sea') expect(water - Math.min(...wade), `${p.cfg.id} depth at t=${t.toFixed(2)}`).toBeLessThan(MAX_DEPTH);
      }
    });
  }

  it('lantern: the canals can be crossed and climbed out of', () => {
    const p = planets[WORLDS.findIndex(w => w.id === 'lantern')];
    const water = p.bedAt(1) + p.cfg.waterDepth;
    for (let lat = 114; lat <= LANTERN_HARBOUR_LAT; lat += 2) {
      for (const off of LANTERN_CANALS) {
        const c = lanternCanalLon(off, lat);
        const h: number[] = [];
        const mPerDeg = p.R * Math.PI / 180 * Math.sin(lat * Math.PI / 180);
        for (let m = -7; m <= 7; m += 0.25) h.push(p.height(p.dirRiver(lat, c + m / mPerDeg)));
        expect(worstClimb(h, 0.25), `canal ${off} lat ${lat}`).toBeLessThan(MAX_CLIMB);
        expect(water - Math.min(...h), `canal ${off} depth at lat ${lat}`).toBeLessThan(MAX_DEPTH);
      }
    }
  });

  it('lantern: you can wade across the harbour and walk out of it on every side', () => {
    const p = planets[WORLDS.findIndex(w => w.id === 'lantern')];
    const water = p.bedAt(1) + p.cfg.waterDepth;
    for (let lon = 0; lon < 360; lon += 15) {
      const h: number[] = [];
      for (let lat = LANTERN_HARBOUR_LAT - 10; lat <= 180; lat += 0.25) h.push(p.height(dirLatLon(lat, lon)));
      const step = p.R * Math.PI / 180 * 0.25;
      expect(worstClimb(h, step), `harbour edge at lon ${lon}`).toBeLessThan(MAX_CLIMB);
      expect(water - Math.min(...h), `harbour depth at lon ${lon}`).toBeLessThan(MAX_DEPTH);
    }
  });

  it('the home light stands on dry ground, clear of the canals and the harbour', () => {
    const i = WORLDS.findIndex(w => w.id === 'lantern'), p = planets[i];
    const water = p.bedAt(1) + p.cfg.waterDepth;
    const c = p.dirRiver(HOME_LIGHT.lat, HOME_LIGHT.lon);
    const side = new THREE.Vector3(0, 1, 0).cross(c).normalize(), fw = c.clone().cross(side).normalize();
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) for (const r of [0, 1, 2]) {
      const d = c.clone().addScaledVector(side, Math.cos(a) * r / p.R).addScaledVector(fw, Math.sin(a) * r / p.R).normalize();
      expect(p.height(d) - water, `lighthouse footing a=${a.toFixed(2)} r=${r}`).toBeGreaterThan(0.6);
    }
  });

  for (let i = 1; i < WORLDS.length; i++) {
    it(`${WORLDS[i].id}: you arrive on dry bank, and the dock stands by the water`, () => {
      const p = planets[i];
      const a = laterArrivalDir(p);
      const rn = p.riverNearest(a);
      expect(p.height(a) - (p.bedAt(rn.t) + p.cfg.waterDepth), 'arrival above water').toBeGreaterThan(0.2);
      // and not on a cliff: a few steps around the arrival are walkable
      expect(p.slope(a), 'arrival slope').toBeLessThan(0.6);
      const d = dockDir(p);
      expect(p.riverNearest(d).dist).toBeLessThan(p.cfg.riverWidth + 2.5);
    });
  }

  it('sky: the river is walkable all the way down, on the islands and the aqueducts', () => {
    const p = planets[WORLDS.findIndex(w => w.id === 'sky')];
    for (let t = 0.012; t <= 0.995; t += 0.0025) {
      const d = p.pathPoint(t);
      expect(skyWalkable(p, d), `river at t=${t.toFixed(4)}`).toBe(true);
      // and at least a stride of bank or parapet beside it on one side
      const d2 = p.pathPoint(Math.min(1, t + 0.003));
      const side = new THREE.Vector3().crossVectors(d, d2.sub(d)).normalize();
      const off = (m: number) => d.clone().addScaledVector(side, m / p.R).normalize();
      expect(skyWalkable(p, off(3.6)) || skyWalkable(p, off(-3.6)), `bank at t=${t.toFixed(4)}`).toBe(true);
    }
  });

  it('sky: you arrive on Landing Isle, and the fox waits on the drifting islet', () => {
    const p = planets[WORLDS.findIndex(w => w.id === 'sky')];
    const a = laterArrivalDir(p);
    expect(isleAt(p, a)?.def.id).toBe('landing');
    expect(onIsle(p, a, 1.6), 'arrival well in from the lip').toBe(true);
    expect(onIsle(p, dockDir(p)), 'dock on the island').toBe(true);
    const fox = p.dirRiver(FOX_SPOT.lat, FOX_SPOT.lon);
    expect(isleAt(p, fox)?.def.id).toBe('drift');
  });

  it('sky: the people and the edge stand on islands', () => {
    const i = WORLDS.findIndex(w => w.id === 'sky'), p = planets[i];
    p.build();
    const c = populate(p, new THREE.Scene(), i);
    // the windfolk are placed by story/skyChapter.ts, from SKY_HOMES, through safeSpot
    for (const [id, h] of Object.entries(SKY_HOMES)) {
      const lon = h.at[1] / (p.R * Math.PI / 180 * Math.max(0.05, Math.sin(h.at[0] * Math.PI / 180)));
      const d = safeSpot(p, p.dirRiver(h.at[0], lon), c.avoid, 6);
      expect(skySpotProblem(p, d), `npc ${id}`).toBe(null);
    }
    const edge = (c.refs.edge as THREE.Object3D).position.clone().sub(p.center).normalize();
    expect(onIsle(p, edge, 1.5), 'the edge arch').toBe(true);
  }, 120000);

  it('the Endless Sea is laid out exactly as before the move to six worlds', () => {
    const i = WORLDS.findIndex(w => w.id === 'sea'), p = planets[i];
    p.build();
    const scene = new THREE.Scene();
    populate(p, scene, i);
    let s = 0, n = 0;
    for (const o of scene.children) o.traverse(x => {
      n++;
      const q = x === o ? x.position.clone().sub(p.center) : x.position;
      s += (q.x * 1.3 + q.y * 1.7 + q.z * 1.9 + x.quaternion.x * 2.1 + x.quaternion.w * 0.7) * ((n % 7) + 1);
    });
    // measured on main (the four-world build), where the sea was World 3
    expect(`${n}:${s.toFixed(2)}`).toBe('517:12861.26');
  }, 60000);
});
