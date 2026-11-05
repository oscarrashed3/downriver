import { describe, it, expect } from 'vitest';
import { MAIN_STEPS, currentStep, activeSideQuests, SIDE_QUESTS, type QuestCtx } from '../src/story/quests';
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
  it('starts with the letter, then points to the village', () => {
    expect(currentStep(ctx([]))?.id).toBe('letter');
    expect(currentStep(ctx(['read-letter']))?.id).toBe('why');
  });
  it('walks through every step in order as the story flags arrive', () => {
    const order = ['read-letter', 'talked:ysolde', 'power:skyreading', 'saw-wind'];
    const flags: string[] = [];
    expect(currentStep(ctx(flags))?.id).toBe('letter');
    order.forEach((f, i) => { flags.push(f); expect(currentStep(ctx(flags))?.id).toBe(MAIN_STEPS[i + 1].id); });
    expect(currentStep(ctx(flags, 0.5))?.id).toBe('keep');
    expect(currentStep(ctx(flags, 0.74))?.id).toBe('winter');
    flags.push('peaks-healed');
    expect(currentStep(ctx(flags))?.id).toBe('tell');
    flags.push('journal:stone-returns');
    expect(currentStep(ctx(flags))?.id).toBe('odo');
    flags.push('boat-ready');
    expect(currentStep(ctx(flags))?.id).toBe('farewell');
    flags.push('chapter1-complete');
    expect(currentStep(ctx(flags))?.id).toBe('home');
    flags.push('loop-complete');
    expect(currentStep(ctx(flags))).toBeNull();
  });
  it('lets winter come only once the snow can stay (projected snowpack at least 0.7)', () => {
    const f = ['read-letter', 'talked:ysolde', 'power:skyreading', 'saw-wind'];
    expect(currentStep(ctx(f, 0.69))?.id).toBe('keep');
    expect(currentStep(ctx(f, 0.7))?.id).toBe('winter');
  });
  it('every step has words, and every step id is unique', () => {
    expect(new Set(MAIN_STEPS.map(s => s.id)).size).toBe(MAIN_STEPS.length);
    MAIN_STEPS.forEach(s => expect(s.text.length).toBeGreaterThan(10));
  });
  it('the story flags the quest waits on are actually given by people', () => {
    const flags = new Set<string>(['peaks-healed']);
    talk('ysolde', flags);
    expect(flags.has('journal:stone-returns')).toBe(true);
    const f2 = new Set<string>(['peaks-healed', 'journal:stone-returns']);
    talk('odo', f2);
    expect(f2.has('boat-ready')).toBe(true);
  });
});

describe('Side quests', () => {
  it("Tor's kite moves from branch, to Tor, to the ridge", () => {
    const q = (f: string[]) => activeSideQuests(ctx(f)).find(s => s.title === "Tor's kite")?.text;
    expect(q(['quest:kite'])).toMatch(/willow/);
    expect(q(['quest:kite', 'item:spar'])).toMatch(/Tor/);
    expect(q(['quest:kite', 'item:spar', 'flag:tor-follow'])).toMatch(/Kite Ridge/);
    expect(q(['quest:kite', 'kite-flown'])).toBeUndefined();
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
  it('without the branch, Tor gives the kite quest and the fence know-how', () => {
    const flags = new Set<string>();
    talk('tor', flags, [1, 0]);
    expect(flags.has('flag:tor-fences')).toBe(true);
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
  const v2 = () => ({ v: 2, flags: ['read-letter'], moods: {}, river: createRiverState(), snow: createSnowpack(), world: 0, dir: [0, 1, 0], poles: [], journal: [], pins: {}, day: 0.4, flowers: 1, sigs: {} });
  it('is on version 2', () => expect(SAVE_VERSION).toBe(2));
  it('keeps a version 2 save as it is', () => {
    const r = migrateSave(JSON.parse(JSON.stringify(v2())));
    expect(r.notice).toBeNull();
    expect(r.data?.flags).toEqual(['read-letter']);
    expect(r.data?.day).toBe(0.4);
  });
  it('fills in fields an early version 2 save did not have', () => {
    const old: any = v2(); delete old.sigs; delete old.flowers; delete old.day;
    const r = migrateSave(old);
    expect(r.data?.sigs).toEqual({});
    expect(r.data?.flowers).toBe(0);
    expect(typeof r.data?.day).toBe('number');
  });
  it('gently resets a Milestone 1 save, with a kind notice', () => {
    const r = migrateSave({ v: 1, flags: ['has-drop'], moods: {}, river: createRiverState(), snow: createSnowpack(), world: 2, dir: [0, 1, 0], poles: [], journal: [], pins: {} });
    expect(r.data).toBeNull();
    expect(r.notice).toBe(RESET_NOTICE);
  });
  it('ignores garbage', () => {
    expect(migrateSave(null)).toEqual({ data: null, notice: null });
    expect(migrateSave('nope')).toEqual({ data: null, notice: null });
    expect(migrateSave({ v: 9 })).toEqual({ data: null, notice: null });
  });
});

describe('Story text', () => {
  it('keeps every line short enough for two lines on screen', () => {
    const lines: string[] = [STORY.LETTER, ...STORY.WINTER_LINES, STORY.KITE_GIFT, ...STORY.KITE_FLIGHT, ...STORY.ECHOES, ...STORY.KEEPSAKE.panels, STORY.KEEPSAKE.after,
      ...STORY.CAMPFIRE.map(l => l.text), ...STORY.FAREWELL.map(l => l.text), ...Object.values(STORY.NOT_YET), STORY.OPENING.homeLight];
    lines.forEach(l => expect(l.length, l).toBeLessThanOrEqual(110));
  });
  it('the farewell names only people who live in the valley', () => {
    STORY.FAREWELL.forEach(l => expect(SCRIPTS[l.who.toLowerCase()], l.who).toBeTruthy());
    STORY.CAMPFIRE.forEach(l => expect(SCRIPTS[l.who.toLowerCase()], l.who).toBeTruthy());
  });
});
