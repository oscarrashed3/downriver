import { describe, it, expect } from 'vitest';
import { stepDetail, type QuestCtx } from '../src/story/quests';
import { Conversation, type Node } from '../src/systems/connection';
import { SCRIPTS } from '../src/data/scripts';
import { KITE_FLIGHT } from '../src/data/story';
import { GOAL, goalWords } from '../src/data/words';

const WORLD1 = ['ysolde', 'bram', 'nima', 'tor', 'odo'];
/** Proper names a goal line may use. Each must have been heard before it shows up. */
const NAMES = ['Ysolde', 'Tor', 'Bram', 'Pebble', 'Nima', 'Odo', 'Hollo', 'Kite Ridge'];
const VERBS = ['Read', 'Talk', 'Find', 'Get', 'Bring', 'Walk', 'Ask', 'Build', 'Invite', 'Sit', 'Say', 'Follow', 'Listen', 'Play', 'Light', 'Carry'];

/** A fresh playthrough of world 1: real conversations, recording every line heard and every goal line shown. */
function playthrough() {
  const flags = new Set<string>();
  const heard: string[] = [];
  const goals: { goal: string; unheard: string[] }[] = [];
  const ctx = (): QuestCtx => ({ flags, projected: 0.3, echoes: 0, fences: [...flags].filter(f => f.startsWith('fence:')).length });
  const look = () => {
    const goal = stepDetail(ctx());
    if (!goal || goals[goals.length - 1]?.goal === goal) return;
    const text = heard.join(' ');
    goals.push({ goal, unheard: NAMES.filter(n => goal.includes(n) && !text.includes(n)) });
  };
  const talk = (id: string, picks: number[] = []) => {
    heard.push(SCRIPTS[id].name); // the dialogue box shows their name
    const conv = new Conversation(SCRIPTS[id], { trust: 0.6, worry: 0.3, openness: 0.6 }, { flags, give: f => flags.add(f) });
    let p = 0;
    for (let guard = 0; guard < 400; guard++) {
      const s = conv.step();
      if (s.kind === 'end') break;
      if (s.kind === 'line') { heard.push(s.text); conv.finishLine(); }
      else if (s.kind === 'silence') { while (!conv.holdSilence(0.5, true)); }
      else if (s.kind === 'cards') { const c = s.cards[picks[p++] ?? 0]; heard.push(c.text, ...c.reply); conv.choose(picks[p - 1] ?? 0); }
    }
    flags.add('talked:' + id);
    look();
  };
  const set = (...f: string[]) => { f.forEach(x => flags.add(x)); look(); };
  look();
  set('read-letter');
  talk('ysolde');
  talk('tor');
  set('item:spar');
  talk('tor');
  heard.push(...KITE_FLIGHT); set('kite-flown', 'power:skyreading');
  set('stone-heard:0'); set('stone-heard:1'); set('stone-heard:2'); set('stone-heard:3');
  set('stones-done');
  set('talked:odo', 'quest:ember'); // Odo shows Nilo who Fold is
  set('ember-carry');
  set('ember-delivered', 'quest:night');
  talk('nima'); // she runs to you with the news
  for (const id of WORLD1) if (id !== 'nima') talk(id);
  set('gathered');
  set('peaks-healed');
  talk('ysolde');
  talk('odo');
  set('chapter1-complete');
  return goals;
}

describe('Goal lines', () => {
  const goals = playthrough();

  it('walks the whole of world 1 in order', () => {
    expect(goals.map(g => g.goal)).toMatchSnapshot();
    expect(goals.length).toBeGreaterThan(15);
  });

  it('are at most 12 words and start with a verb', () => {
    for (const { goal } of goals) {
      expect(goalWords(goal), goal).toBeLessThanOrEqual(12);
      expect(VERBS, goal).toContain(goal.split(' ')[0]);
    }
  });

  it('only name people and places the player has already heard of', () => {
    for (const g of goals) expect(g.unheard, g.goal).toEqual([]);
  });

  it('describe people the player has not met yet', () => {
    expect(GOAL.meetYsolde).not.toContain('Ysolde');
    const before = stepDetail({ flags: new Set(['read-letter', 'quest:hollo', 'kite-flown', 'stones-done', 'ember-delivered', 'quest:night', 'invited:ysolde', 'invited:bram']), projected: 0, echoes: 0 });
    expect(before).toContain('the cloud girl');
  });
});

describe('Dialogue', () => {
  const lines = (nodes: Node[]): string[] => nodes.flatMap(n =>
    n.type === 'say' ? [n.text] : n.type === 'silence' ? [n.reward] : n.type === 'ask' ? n.cards.flatMap(c => [c.text, ...c.reply])
      : n.type === 'gate' ? [...n.fail, ...lines(n.pass)] : n.type === 'branch' ? [...lines(n.then), ...lines(n.else ?? [])] : []);

  it('keeps every world 1 line short enough for two lines on screen', () => {
    for (const id of WORLD1) for (const l of [...lines(SCRIPTS[id].nodes), ...(SCRIPTS[id].after ?? [])]) expect(l.length, `${id}: ${l}`).toBeLessThanOrEqual(80);
  });

  it('gives every world 1 person a way to be described before you meet them', () => {
    for (const id of WORLD1) expect(SCRIPTS[id].stranger, id).toBeTruthy();
  });
});
