import { describe, it, expect } from 'vitest';
import { MENU_TABS } from '../src/ui/menu';
import { nextPerson } from '../src/story/quests';

const ctx = (...f: string[]) => ({ flags: new Set(['read-letter', ...f]), projected: 0, echoes: 0 });

describe('Menu', () => {
  it('has the tabs in the agreed order, each key used once', () => {
    expect(MENU_TABS.map(t => t.label)).toEqual(['Goal', 'Map', 'Backpack', 'Letters', 'Sketchbook', 'Journal', 'Controls', 'Settings']);
    const keys = MENU_TABS.map(t => t.key).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(['W', 'A', 'S', 'D', 'E', 'Q', 'F', 'G', 'P', 'N']).not.toContain(k);
  });

  it('names who to see next, and nobody when the step is a place', () => {
    expect(nextPerson(ctx())).toBe('ysolde');
    expect(nextPerson(ctx('quest:hollo'))).toBe('tor');
    expect(nextPerson(ctx('quest:hollo', 'quest:kite'))).toBeNull(); // the willow branch
    expect(nextPerson(ctx('quest:hollo', 'quest:kite', 'item:spar'))).toBe('tor');
    expect(nextPerson(ctx('quest:hollo', 'kite-flown'))).toBe('bram');
    expect(nextPerson(ctx('quest:hollo', 'kite-flown', 'quest:goat'))).toBeNull(); // find Pebble
    expect(nextPerson(ctx('quest:hollo', 'kite-flown', 'fences-done', 'invited:ysolde'))).toBe('bram');
    expect(nextPerson({ flags: new Set<string>(), projected: 0, echoes: 0 })).toBeNull();
  });
});
