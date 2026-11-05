import { describe, it, expect } from 'vitest';
import { AREAS, discoveredAreas } from '../src/data/areas';

describe('Areas and the map', () => {
  it('world 1 has the eight areas from the plan, each named once', () => {
    const names = AREAS.filter(a => a.world === 0).map(a => a.name);
    expect(names).toEqual(["Hollo's Spring", 'Hearth Village', 'Goat Terraces', 'Kite Ridge', 'Cloud Meadow', 'West Cliffs', "Odo's Bridge", 'The Edge']);
    expect(new Set(AREAS.map(a => a.id)).size).toBe(AREAS.length);
  });

  it('a fresh start shows no named places; after visiting three, exactly those three', () => {
    const flags = new Set<string>(['read-letter', 'map:valley', 'map:start']);
    expect(discoveredAreas(0, flags)).toEqual([]);
    ['area:spring', 'area:village', 'area:ridge'].forEach(f => flags.add(f));
    expect(discoveredAreas(0, flags).map(a => a.name)).toEqual(["Hollo's Spring", 'Hearth Village', 'Kite Ridge']);
  });

  it('every area has its own look: a ground color, a light tint and a sound', () => {
    for (const a of AREAS) { expect(a.ground, a.id).toMatch(/^#[0-9a-f]{6}$/); expect(a.light, a.id).toMatch(/^#[0-9a-f]{6}$/); expect(a.sound, a.id).toBeTruthy(); }
  });
});
