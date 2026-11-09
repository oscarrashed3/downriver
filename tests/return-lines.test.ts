import { describe, it, expect } from 'vitest';
import { RETURN_LINES, SCRIPTS, EMBER, pickReturnLine } from '../src/data/scripts';
import { Conversation } from '../src/systems/connection';

const PEOPLE = ['ysolde', 'bram', 'nima', 'tor', 'odo', 'postman'];
const all = (id: string) => RETURN_LINES[id].flatMap(s => s.lines);

describe('Return lines', () => {
  it('gives every villager and the postman 15 to 25 lines, short and all different', () => {
    for (const id of PEOPLE) {
      const lines = all(id);
      expect(lines.length, id).toBeGreaterThanOrEqual(15);
      expect(lines.length, id).toBeLessThanOrEqual(25);
      expect(new Set(lines).size, id).toBe(lines.length);
      lines.forEach(l => expect(l.length, `${id}: ${l}`).toBeLessThanOrEqual(80));
    }
  });

  it('never repeats a line until the person has run out, and never twice in a row', () => {
    const flags = new Set(['quest:hollo', 'kite-flown']);
    const fit = RETURN_LINES.tor.filter(s => (s.when ?? []).every(f => flags.has(f)) && !(s.not ?? []).some(f => flags.has(f))).flatMap(s => s.lines);
    const heard = Array.from({ length: fit.length }, () => pickReturnLine('tor', flags)!);
    expect(new Set(heard).size).toBe(fit.length);
    let prev = heard[heard.length - 1];
    for (let i = 0; i < 40; i++) { const l = pickReturnLine('tor', flags)!; expect(l).not.toBe(prev); prev = l; }
  });

  it('says lines for where the story is first, and none from other times', () => {
    const flags = new Set(['quest:hollo', 'quest:night', 'invited:bram']);
    expect(RETURN_LINES.bram[4].lines).toContain(pickReturnLine('bram', flags, () => 0));
    const healed = new Set(['quest:hollo', 'peaks-healed']);
    const night = RETURN_LINES.bram[4].lines;
    for (let i = 0; i < 30; i++) expect(night).not.toContain(pickReturnLine('bram', healed));
  });
});

describe('Odo introduces Fold', () => {
  const talk = (flags: Set<string>) => {
    const conv = new Conversation(SCRIPTS.odo, { trust: 0.6, worry: 0.3, openness: 0.6 }, { flags, give: f => flags.add(f) });
    const heard: string[] = [];
    for (let g = 0; g < 200; g++) {
      const s = conv.step();
      if (s.kind === 'end') break;
      if (s.kind === 'line') { heard.push(s.text); conv.finishLine(); }
      else if (s.kind === 'silence') { while (!conv.holdSilence(0.5, true)); }
      else if (s.kind === 'cards') { heard.push(...s.cards[0].reply); conv.choose(0); }
    }
    return heard.join(' ');
  };
  it('asks for the ember once it is time, then says there is more to Fold after', () => {
    const flags = new Set(['quest:hollo', 'clue:odo', EMBER.open]);
    expect(talk(flags)).toContain('Fold');
    expect(flags.has(EMBER.quest)).toBe(true);
    expect(talk(flags)).toContain('ember');
    flags.add(EMBER.lit);
    expect(talk(flags)).toContain('There is more');
    expect(flags.has(EMBER.more)).toBe(true);
  });
  it('still meets you first if you have not met him yet', () => {
    const flags = new Set(['quest:hollo', EMBER.open]);
    const said = talk(flags);
    expect(said).toContain('A traveler!');
    expect(said).toContain('lantern');
  });
  it('is unchanged until the ember quest opens', () => {
    const flags = new Set(['quest:hollo']);
    expect(talk(flags)).toContain("When Hollo wakes");
    expect(flags.has(EMBER.quest)).toBe(false);
  });
});

describe('Sky Isles people', () => {
  const SKY = ['lark', 'zephy', 'granwren', 'mender', 'chimer'];
  it('each have 15 to 25 short, different return lines and a script', () => {
    for (const id of SKY) {
      expect(SCRIPTS[id], id).toBeTruthy();
      expect(SCRIPTS[id].stranger, id).toBeTruthy();
      const lines = all(id);
      expect(lines.length, id).toBeGreaterThanOrEqual(15);
      expect(lines.length, id).toBeLessThanOrEqual(25);
      expect(new Set(lines).size, id).toBe(lines.length);
      lines.forEach(l => expect(l.length, `${id}: ${l}`).toBeLessThanOrEqual(80));
    }
  });
  it('has lines that fit every part of the sky story', () => {
    const states = [[], ['sky:kite-built'], ['sky:kite-built', 'sky:ribbon'], ['sky:ribbon', 'sky:won'], ['sky:won', 'chapter2-complete']];
    for (const id of SKY) for (const st of states) expect(pickReturnLine(id, new Set(st)), `${id} ${st}`).toBeTruthy();
  });
});
