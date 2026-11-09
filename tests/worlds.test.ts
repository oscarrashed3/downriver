import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/world/worlds';
import { CHAPTERS } from '../src/data/story';
import { SCRIPTS } from '../src/data/scripts';
import { riverHealth, createRiverState } from '../src/systems/riverState';
import { migrateSave, SAVE_VERSION } from '../src/systems/save';
import { createSnowpack } from '../src/systems/snowpack';
import { PIECES } from '../src/systems/mapView';
import { WORLD_TASKS } from '../src/data/story';

describe('The six worlds', () => {
  it('are the peaks, the sky isles, the garden, the sea, the desert and lantern town, in that order', () => {
    expect(WORLDS.map(w => w.id)).toEqual(['peaks', 'sky', 'garden', 'sea', 'desert', 'lantern']);
    expect(WORLDS.map(w => w.name)).toEqual(['The Spring Peaks', 'The Sky Isles', 'The Overgrown Garden', 'The Endless Sea', 'The Painted Desert', 'Lantern Town']);
  });
  it('read as one day: each world after the first keeps an hour, ending at sunset and then night', () => {
    expect(WORLDS[0].hour).toBeUndefined();
    const elev = WORLDS.slice(1).map(w => w.hour!.elev);
    expect(elev[0]).toBeGreaterThan(0.8); // midday in the Sky Isles
    expect(elev[3]).toBeGreaterThan(0); expect(elev[3]).toBeLessThan(0.25); // sunset in the desert
    expect(elev[4]).toBeLessThan(-0.3); // night in Lantern Town
  });
  it('each later world has a goal line and a map piece', () => {
    for (const w of WORLDS.slice(1)) {
      expect(WORLD_TASKS[w.id], w.id).toBeTruthy();
      expect(PIECES.some(p => p.world === w.id), w.id).toBe(true);
    }
  });
  it('have one chapter each, in the same order', () => {
    expect(CHAPTERS).toHaveLength(WORLDS.length);
    expect(CHAPTERS[0].title).toBe('Where the Water Begins');
    CHAPTERS.slice(1).forEach((c, i) => expect(c.title).toBe(WORLDS[i + 1].name));
  });
  it('hang one below the other, each lower than the last', () => {
    for (let i = 1; i < WORLDS.length; i++) expect(WORLDS[i].center.y).toBeLessThan(WORLDS[i - 1].center.y);
  });
  it('only the sea has an ocean', () => {
    expect(WORLDS.filter(w => w.ocean).map(w => w.id)).toEqual(['sea']);
  });
  it('nobody hands out a map of a world that no longer exists', () => {
    const ids = new Set(WORLDS.map(w => w.id));
    const gone = new Set(['map:deep', 'map:aquila', 'map:pines']);
    for (const s of Object.values(SCRIPTS)) {
      const walk = (nodes: any[]) => nodes.forEach(n => {
        if (n.type === 'give') (n.items as string[]).forEach(x => expect(gone.has(x), `${s.id} gives ${x}`).toBe(false));
        if (n.then) walk(n.then);
        if (n.else) walk(n.else);
      });
      walk(s.nodes as any[]);
    }
    expect(ids.has('deep') || ids.has('aquila') || ids.has('pines')).toBe(false);
    expect(SCRIPTS.cassian).toBeUndefined();
  });
  it('silt from World 2 (the Sky Isles) shows in the worlds below it', () => {
    const r = createRiverState(); r.sediment = 1;
    const clean = createRiverState(); clean.sediment = 0;
    expect(riverHealth(r, 1)).toBe(riverHealth(clean, 1));
    expect(riverHealth(r, 2)).toBeLessThan(riverHealth(clean, 2));
  });
  it('saves move from the four-world layout to the six', () => {
    expect(SAVE_VERSION).toBe(5);
    const v4 = { v: 4, flags: ['read-letter', 'visited:0', 'visited:1', 'visited:2', 'told-goback:1', 'map:pines', 'met:tamsin', 'map:sea', 'fox-joined'], moods: {}, river: createRiverState(), snow: createSnowpack(), world: 0, dir: [1, 0, 0], poles: [], journal: [], pins: { pines: [{ x: 0, y: 0 }], sea: [{ x: 1, y: 1 }] }, day: 0.4, flowers: 0, sigs: {}, bag: [], sketches: [], sent: {}, seen: { pines: '1', sea: '1' } };
    // old 0 peaks, 1 pines, 2 sea, 3 desert -> new 0 peaks, 1 sky, 3 sea, 4 desert
    const expected: Record<number, [number, boolean]> = { 0: [0, false], 1: [1, true], 2: [3, false], 3: [4, true] };
    for (const [old, [now, arrive]] of Object.entries(expected)) {
      const r = migrateSave(JSON.parse(JSON.stringify({ ...v4, world: +old })));
      expect(r.notice).toBeNull();
      expect(r.data?.v, `old ${old}`).toBe(5);
      expect(r.data?.world, `old ${old}`).toBe(now);
      expect(!!r.data?.arrive, `old ${old}`).toBe(arrive);
    }
    const r = migrateSave(JSON.parse(JSON.stringify({ ...v4, world: 2 })));
    const f = new Set(r.data!.flags);
    expect([...f].filter(x => x.startsWith('visited:')).sort()).toEqual(['visited:0', 'visited:1', 'visited:3']);
    expect(f.has('told-goback:1')).toBe(true);
    for (const gone of ['map:pines', 'met:tamsin']) expect(f.has(gone), gone).toBe(false);
    for (const kept of ['read-letter', 'map:sea', 'fox-joined']) expect(f.has(kept), kept).toBe(true);
    expect(Object.keys(r.data!.seen)).toEqual(['sea']);
    expect(Object.keys(r.data!.pins)).toEqual(['sea']);
  });
  it('a version 5 save stays as it is', () => {
    const v5 = { v: 5, flags: ['visited:5'], moods: {}, river: createRiverState(), snow: createSnowpack(), world: 5, dir: [0, -1, 0], poles: [], journal: [], pins: {}, day: 0.4, flowers: 0, sigs: {}, bag: [], sketches: [], sent: {}, seen: {} };
    const r = migrateSave(JSON.parse(JSON.stringify(v5)));
    expect(r.data?.world).toBe(5);
    expect(r.data?.flags).toEqual(['visited:5']);
    expect(r.data?.arrive).toBeUndefined();
  });
});
