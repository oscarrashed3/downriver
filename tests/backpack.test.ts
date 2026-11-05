import { describe, it, expect } from 'vitest';
import { SLOTS, ITEMS, TRADES, LETTERS, bagAdd, bagTake, tradeFor, doTrade } from '../src/systems/backpack';
import { foldMood, FOLD_FORMS } from '../src/player/fold';

describe('Backpack', () => {
  it('holds eight things, then says no', () => {
    const bag: string[] = [];
    for (let i = 0; i < SLOTS; i++) expect(bagAdd(bag, 'item:flower')).toBe(true);
    expect(bagAdd(bag, 'item:bell')).toBe(false);
    expect(bag).toHaveLength(SLOTS);
  });
  it('does not duplicate unique things', () => {
    const bag: string[] = [];
    bagAdd(bag, 'item:spar'); bagAdd(bag, 'item:spar');
    expect(bag).toEqual(['item:spar']);
    expect(bagTake(bag, 'item:spar')).toBe(true);
    expect(bagTake(bag, 'item:spar')).toBe(false);
  });
  it('the swap chain goes flower, bell, ribbon, card, and back to a flower', () => {
    const bag = ['item:flower'];
    for (const npc of ['bram', 'tor', 'nima', 'odo']) {
      const t = tradeFor(bag, npc);
      expect(t, npc).toBeTruthy();
      expect(doTrade(bag, t!)).toBe(true);
    }
    expect(bag).toEqual(['item:flower']);
  });
  it('every trade and item is defined, and every letter with replies has three', () => {
    TRADES.forEach(t => { expect(ITEMS[t.want]).toBeTruthy(); expect(ITEMS[t.give]).toBeTruthy(); });
    LETTERS.filter(l => l.replies.length).forEach(l => expect(l.replies).toHaveLength(3));
  });
});

describe('Fold', () => {
  const base = { night: 0, cold: 0, nearGiant: false, running: false, falling: false, justHappy: false };
  it('feels things from what is around', () => {
    expect(foldMood(base)).toBe('calm');
    expect(foldMood({ ...base, nearGiant: true })).toBe('curious');
    expect(foldMood({ ...base, night: 0.9 })).toBe('sleepy');
    expect(foldMood({ ...base, night: 0.9, running: true })).toBe('calm');
    expect(foldMood({ ...base, falling: true, nearGiant: true })).toBe('scared');
    expect(foldMood({ ...base, cold: 0.8 })).toBe('cold');
    expect(foldMood({ ...base, justHappy: true, falling: true })).toBe('happy');
  });
  it('has one shape per world before the sea, starting with the boat and the kite', () => {
    expect(FOLD_FORMS[0].id).toBe('boat');
    expect(FOLD_FORMS[1].id).toBe('kite');
    expect(new Set(FOLD_FORMS.map(f => f.id)).size).toBe(FOLD_FORMS.length);
  });
});
