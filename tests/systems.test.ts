import { describe, it, expect } from 'vitest';
import { createSnowpack, passWinter, isHealed, projectedSnowpack, springFlowFrom } from '../src/systems/snowpack';
import { Conversation, type Script } from '../src/systems/connection';
import { createRiverState, flowArrivingAt, riverWidthFor } from '../src/systems/riverState';
import { SCRIPTS } from '../src/data/scripts';
import { JOURNAL } from '../src/data/journal';

const build = (ids: string[]) => { const s = createSnowpack(); s.sites.forEach(x => (x.built = ids.includes(x.id))); return s; };

describe('Spring Peaks snowpack puzzle', () => {
  it('starts thin and nothing changes if nothing is built', () => {
    const s = createSnowpack();
    passWinter(s);
    expect(isHealed(s)).toBe(false);
  });
  it('solution A: fences on the three windward ridges heal the spring', () => {
    const s = build(['fence-north-ridge', 'fence-saddle', 'fence-east-shoulder']);
    passWinter(s);
    expect(isHealed(s)).toBe(true);
  });
  it('solution B: two ice towers heal the spring', () => {
    const s = build(['stupa-west', 'stupa-east']);
    passWinter(s);
    expect(isHealed(s)).toBe(true);
  });
  it('a mix of one tower and two fences also works', () => {
    const s = build(['stupa-west', 'fence-north-ridge', 'fence-saddle']);
    expect(projectedSnowpack(s)).toBeGreaterThanOrEqual(0.7);
  });
  it('fences in sheltered hollows barely help: where you build matters', () => {
    const s = build(['fence-lee-hollow', 'fence-south-bowl']);
    passWinter(s);
    expect(isHealed(s)).toBe(false);
    expect(s.snowpack).toBeLessThan(0.36);
  });
  it('more snowpack sends more water downstream', () => {
    expect(springFlowFrom(0.8)).toBeGreaterThan(springFlowFrom(0.3));
  });
});

describe('ripple system', () => {
  it('a stronger spring widens the river in every world below', () => {
    const r = createRiverState();
    r.flow = 0.35; const thin = [0, 1, 2, 3].map(i => riverWidthFor(flowArrivingAt(r, i)));
    r.flow = 0.95; const full = [0, 1, 2, 3].map(i => riverWidthFor(flowArrivingAt(r, i)));
    full.forEach((w, i) => expect(w).toBeGreaterThan(thin[i]));
  });
});

describe('connection system', () => {
  const script: Script = {
    id: 't', name: 'T', title: '', start: { trust: 0.4, worry: 0.5, openness: 0.4 },
    nodes: [
      { type: 'say', text: 'Hello.' },
      { type: 'silence', seconds: 1, reward: 'A secret.' },
      { type: 'ask', cards: [
        { kind: 'open', text: 'Open?', reply: ['Yes.'] },
        { kind: 'judging', text: 'Judge?', reply: ['No.'] },
      ] },
      { type: 'gate', minTrust: 0.5, pass: [{ type: 'give', items: ['map:x'] }], fail: ['Later.'] },
    ],
  };
  const run = (listen: boolean, keepSilence: boolean, card: number) => {
    const flags = new Set<string>(); const got: string[] = [];
    const c = new Conversation(script, undefined, { flags, give: i => { flags.add(i); got.push(i); } });
    for (let guard = 0; guard < 50; guard++) {
      const s = c.step();
      if (s.kind === 'end') break;
      if (s.kind === 'line') { if (!listen) c.interrupt(); c.finishLine(); }
      else if (s.kind === 'silence') { while (!c.holdSilence(0.3, keepSilence)); }
      else if (s.kind === 'cards') c.choose(card);
    }
    return { c, got };
  };
  it('listening, staying through silence and asking openly earns trust and the map', () => {
    const { c, got } = run(true, true, 0);
    expect(got).toContain('map:x');
    expect(c.log).toContain('A secret.');
    expect(c.mood.trust).toBeGreaterThan(0.5);
  });
  it('interrupting and judging closes the person off', () => {
    const { c, got } = run(false, false, 1);
    expect(got).not.toContain('map:x');
    expect(c.mood.trust).toBeLessThan(0.4);
  });
  it('every script line fits on two short lines', () => {
    const lines: string[] = [];
    const walk = (nodes: any[]) => nodes.forEach(n => {
      if (n.type === 'say') lines.push(n.text);
      if (n.type === 'silence') lines.push(n.reward);
      if (n.type === 'ask') n.cards.forEach((c: any) => lines.push(...c.reply));
      if (n.type === 'gate') { walk(n.pass); lines.push(...n.fail); }
      if (n.type === 'branch') { walk(n.then); walk(n.else ?? []); }
    });
    Object.values(SCRIPTS).forEach(s => walk(s.nodes));
    lines.forEach(l => expect(l.length, l).toBeLessThanOrEqual(110));
  });
  it('every journal reward in scripts exists', () => {
    const items: string[] = [];
    const walk = (nodes: any[]) => nodes.forEach(n => {
      if (n.type === 'give') items.push(...n.items);
      if (n.type === 'ask') n.cards.forEach((c: any) => items.push(...(c.gives ?? [])));
      if (n.type === 'gate') walk(n.pass);
      if (n.type === 'branch') { walk(n.then); walk(n.else ?? []); }
    });
    Object.values(SCRIPTS).forEach(s => walk(s.nodes));
    items.filter(i => i.startsWith('journal:')).forEach(i => expect(JOURNAL[i.slice(8)], i).toBeTruthy());
  });
});
