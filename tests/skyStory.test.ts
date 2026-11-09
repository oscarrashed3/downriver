import { describe, it, expect } from 'vitest';
import { skyStep, skyDetail, skyDots, skyPerson } from '../src/story/skyQuests';
import { LETTERS, letterLines, TRADES, ITEMS } from '../src/systems/backpack';

describe('Sky Isles story spine', () => {
  it('walks from the arrival to the whale, one goal line at a time', () => {
    const f = new Set<string>();
    expect(skyStep(f)).toBe(null);
    f.add('sky:arrived'); expect(skyStep(f)).toBe('larkTown'); expect(skyPerson(f)).toBe('lark');
    f.add('sky:quest-kite'); expect(skyDetail(f)).toMatch(/Windmill Isle.*\(0 of 3\)/);
    f.add('sky:part-frame'); expect(skyDetail(f)).toMatch(/sailcloth.*\(1 of 3\)/); expect(skyPerson(f)).toBe('mender');
    f.add('sky:part-cloth'); f.add('sky:part-string'); expect(skyStep(f)).toBe('build');
    f.add('sky:kite-built'); expect(skyStep(f)).toBe('qualify'); expect(skyDots(f)).toBe(1);
    f.add('sky:ribbon'); expect(skyStep(f)).toBe('race');
    f.add('sky:won'); expect(skyStep(f)).toBe('goodbye'); expect(skyDots(f)).toBe(3);
    f.add('sky:goodbye'); expect(skyStep(f)).toBe('whale');
    f.add('chapter2-complete'); expect(skyDetail(f)).toBe(null);
  });
  it('keeps every goal line short, verb first', () => {
    const states = [['sky:arrived'], ['sky:arrived', 'sky:quest-kite'], ['sky:arrived', 'sky:quest-kite', 'sky:kite-built']];
    for (const s of states) expect(skyDetail(new Set(s))!.replace(/\(.*\)/, '').trim().split(/\s+/).length).toBeLessThanOrEqual(12);
  });
  it("answers Nilo's reply in the second letter", () => {
    const l = LETTERS.find(x => x.id === 'letter:2')!;
    expect(letterLines(l, { 'letter:1': 'Hollo says hello.' })[0]).toMatch(/Hollo/);
    expect(letterLines(l, {})[0]).toMatch(/did not write back/);
  });
  it('has a festival swap chain with an item for each step', () => {
    for (const id of ['mender', 'chimer', 'granwren', 'lark']) {
      const t = TRADES.find(x => x.npc === id)!;
      expect(ITEMS[t.want] && ITEMS[t.give], id).toBeTruthy();
    }
  });
});
