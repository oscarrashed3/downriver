import { describe, it, expect } from 'vitest';
import { MAIN_STEPS, currentStep, activeSideQuests, SIDE_QUESTS, lanternsLit, invitedCount, stepDetail, FRIENDS, type QuestCtx } from '../src/story/quests';
import { migrateSave, RESET_NOTICE, SAVE_VERSION } from '../src/systems/save';
import { Conversation } from '../src/systems/connection';
import { SCRIPTS } from '../src/data/scripts';
import { JOURNAL } from '../src/data/journal';
import * as STORY from '../src/data/story';
import { createSnowpack } from '../src/systems/snowpack';
import { createRiverState } from '../src/systems/riverState';

const ctx = (flags: string[], projected = 0.3, echoes = 0): QuestCtx => ({ flags: new Set(flags), projected, echoes });

/** Run a whole conversation, listening to every line, holding every silence, picking the given cards. */
function talk(id: string, flags: Set<string>, picks: number[] = []) {
  const conv = new Conversation(SCRIPTS[id], undefined, { flags, give: f => flags.add(f) });
  let p = 0;
  for (let guard = 0; guard < 400; guard++) {
    const s = conv.step();
    if (s.kind === 'end') break;
    if (s.kind === 'line') conv.finishLine();
    else if (s.kind === 'silence') { while (!conv.holdSilence(0.5, true)); }
    else if (s.kind === 'cards') conv.choose(picks[p++] ?? 0);
  }
  return conv;
}

describe('Chapter One main quest', () => {
  it('starts with the letter, then points to Ysolde and Hollo', () => {
    expect(currentStep(ctx([]))?.id).toBe('letter');
    expect(currentStep(ctx(['read-letter']))?.id).toBe('hollo');
  });
  it('walks through every step in order as the story flags arrive', () => {
    const order = ['read-letter', 'quest:hollo', 'kite-flown', 'fences-done', 'gathered', 'peaks-healed', 'boat-ready', 'chapter1-complete'];
    const flags: string[] = [];
    order.forEach((f, i) => { expect(currentStep(ctx(flags))?.id).toBe(MAIN_STEPS[i].id); flags.push(f); });
    expect(currentStep(ctx(flags))?.id).toBe('home');
    flags.push('loop-complete');
    expect(currentStep(ctx(flags))).toBeNull();
  });
  it('lights one lantern per stop', () => {
    expect(lanternsLit(ctx(['kite-flown']))).toBe(1);
    expect(lanternsLit(ctx(['kite-flown', 'fences-done', 'gathered']))).toBe(3);
    expect(lanternsLit(ctx(['peaks-healed']))).toBe(3);
  });
  it('the step detail counts fences and invitations', () => {
    expect(stepDetail({ ...ctx(['read-letter', 'quest:hollo', 'kite-flown', 'goat-home', 'flag:tor-fences']), fences: 2 })).toMatch(/2 of 3/);
    expect(stepDetail(ctx(['read-letter', 'quest:hollo', 'kite-flown', 'fences-done', 'invited:tor', 'invited:odo']))).toMatch(/2 of 5/);
  });
  it('every step has words, and every step id is unique', () => {
    expect(new Set(MAIN_STEPS.map(s => s.id)).size).toBe(MAIN_STEPS.length);
    MAIN_STEPS.forEach(s => expect(s.text.length).toBeGreaterThan(10));
  });
  it('Ysolde starts the Hollo quest for a patient listener', () => {
    const flags = new Set<string>();
    talk('ysolde', flags);
    expect(flags.has('quest:hollo')).toBe(true);
  });
  it('Bram trades fence rails for his goat', () => {
    const f = new Set<string>(); talk('bram', f);
    expect(f.has('quest:goat')).toBe(true);
    expect(f.has('flag:tor-fences')).toBe(false);
    const f2 = new Set<string>(['goat-home']); talk('bram', f2);
    expect(f2.has('flag:tor-fences')).toBe(true);
  });
  it('everyone accepts the invitation to the long night', () => {
    const flags = new Set<string>(['quest:night']);
    for (const id of FRIENDS) talk(id, flags);
    expect(invitedCount({ flags, projected: 0, echoes: 0 })).toBe(5);
  });
  it('Odo readies the boat once Hollo wakes', () => {
    const f2 = new Set<string>(['peaks-healed']);
    talk('odo', f2);
    expect(f2.has('boat-ready')).toBe(true);
  });
});

describe('Side quests', () => {
  it("the kite stop moves from branch, to Tor, to the ridge", () => {
    const q = (f: string[]) => stepDetail(ctx(['read-letter', 'quest:hollo', ...f]));
    expect(q(['quest:kite'])).toMatch(/willow/);
    expect(q(['quest:kite', 'item:spar'])).toMatch(/Tor/);
    expect(q(['quest:kite', 'item:spar', 'flag:tor-follow'])).toMatch(/Kite Ridge/);
  });
  it('echo stones count up and finish at five', () => {
    expect(activeSideQuests(ctx(['echo:any'], 0.3, 2))[0].text).toMatch(/2 of 5/);
    expect(activeSideQuests(ctx(['echo:any', 'echo:all'], 0.3, 5))).toHaveLength(0);
    expect(STORY.ECHOES).toHaveLength(5);
  });
  it('every side quest can start and end', () => SIDE_QUESTS.forEach(q => { expect(q.start).toBeTruthy(); expect(q.done).toBeTruthy(); }));
});

describe('The kite', () => {
  it('Tor asks you up the ridge once you bring the willow branch', () => {
    const flags = new Set<string>(['item:spar']);
    talk('tor', flags);
    expect(flags.has('flag:tor-follow')).toBe(true);
  });
  it('without the branch, Tor gives the kite quest', () => {
    const flags = new Set<string>();
    talk('tor', flags, [1, 0]);
    expect(flags.has('quest:kite')).toBe(true);
    expect(flags.has('flag:tor-follow')).toBe(false);
  });
  it('the kite journal entry and the farewell gift line exist', () => {
    expect(JOURNAL.kite).toBeTruthy();
    expect(STORY.KITE_GIFT.length).toBeGreaterThan(10);
    expect(STORY.KITE_FLIGHT.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Save migration', () => {
  const v3 = () => ({ v: 3, flags: ['read-letter'], moods: {}, river: createRiverState(), snow: createSnowpack(), world: 0, dir: [0, 1, 0], poles: [], journal: [], pins: {}, day: 0.4, flowers: 1, sigs: {}, bag: ['item:spar'], sketches: [], sent: {}, seen: {} });
  it('is on version 3', () => expect(SAVE_VERSION).toBe(3));
  it('keeps a version 3 save as it is', () => {
    const r = migrateSave(JSON.parse(JSON.stringify(v3())));
    expect(r.notice).toBeNull();
    expect(r.data?.flags).toEqual(['read-letter']);
    expect(r.data?.bag).toEqual(['item:spar']);
  });
  it('fills in fields an early version 3 save did not have', () => {
    const old: any = v3(); delete old.sigs; delete old.bag; delete old.seen;
    const r = migrateSave(old);
    expect(r.data?.sigs).toEqual({});
    expect(r.data?.bag).toEqual([]);
    expect(r.data?.seen).toEqual({});
  });
  it('gently resets saves from the old story, with a kind notice', () => {
    for (const v of [1, 2]) {
      const r = migrateSave({ v, flags: ['has-drop'], moods: {}, river: createRiverState(), snow: createSnowpack(), world: 2, dir: [0, 1, 0], poles: [], journal: [], pins: {} });
      expect(r.data).toBeNull();
      expect(r.notice).toBe(RESET_NOTICE);
    }
  });
  it('ignores garbage', () => {
    expect(migrateSave(null)).toEqual({ data: null, notice: null });
    expect(migrateSave('nope')).toEqual({ data: null, notice: null });
    expect(migrateSave({ v: 9 })).toEqual({ data: null, notice: null });
  });
});

describe('Story text', () => {
  it('keeps every line short enough for two lines on screen', () => {
    const lines: string[] = [STORY.LETTER, ...STORY.WINTER_LINES, STORY.KITE_GIFT, ...STORY.KITE_FLIGHT, ...STORY.ECHOES, ...STORY.DAWN_LINES, ...STORY.OPENING.storm, STORY.POSTMAN.arrive, STORY.POSTMAN.hand, STORY.POSTMAN.after,
      ...STORY.CAMPFIRE.map(l => l.text), ...STORY.FAREWELL.map(l => l.text), ...Object.values(STORY.NOT_YET), STORY.OPENING.homeLight];
    lines.forEach(l => expect(l.length, l).toBeLessThanOrEqual(110));
  });
  it('the farewell names only people who live in the valley', () => {
    STORY.FAREWELL.forEach(l => expect(SCRIPTS[l.who.toLowerCase()], l.who).toBeTruthy());
    STORY.CAMPFIRE.forEach(l => expect(SCRIPTS[l.who.toLowerCase()], l.who).toBeTruthy());
  });
});
