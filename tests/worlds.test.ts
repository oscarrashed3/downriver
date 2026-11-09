import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/world/worlds';
import { CHAPTERS } from '../src/data/story';
import { SCRIPTS } from '../src/data/scripts';
import { riverHealth, createRiverState } from '../src/systems/riverState';

describe('The four worlds', () => {
  it('are the peaks, the forest, the sea and the desert, in that order', () => {
    expect(WORLDS.map(w => w.id)).toEqual(['peaks', 'pines', 'sea', 'desert']);
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
    const gone = new Set(['map:deep', 'map:aquila']);
    for (const s of Object.values(SCRIPTS)) {
      const walk = (nodes: any[]) => nodes.forEach(n => {
        if (n.type === 'give') (n.items as string[]).forEach(x => expect(gone.has(x), `${s.id} gives ${x}`).toBe(false));
        if (n.then) walk(n.then);
        if (n.else) walk(n.else);
      });
      walk(s.nodes as any[]);
    }
    expect(ids.has('deep') || ids.has('aquila')).toBe(false);
    expect(SCRIPTS.cassian).toBeUndefined();
  });
  it('mud from the forest shows in the worlds below it', () => {
    const r = createRiverState(); r.sediment = 1;
    const clean = createRiverState(); clean.sediment = 0;
    expect(riverHealth(r, 1)).toBe(riverHealth(clean, 1));
    expect(riverHealth(r, 2)).toBeLessThan(riverHealth(clean, 2));
  });
});
