// The story's spine: one main quest (go home) told as a chain of next steps, and a few side quests.
// Pure logic, so it can be tested without the game running. The words come from data/words.ts.
import { GOAL, WHERE } from '../data/words';
import { SCRIPTS } from '../data/scripts';

export interface QuestCtx { flags: Set<string>; projected: number; echoes: number; fences?: number }

export interface Step { id: string; text: string; done: (c: QuestCtx) => boolean }

const has = (c: QuestCtx, f: string) => c.flags.has(f);

/** The three stops that wake Hollo. Each lights one lantern on Odo's bridge. */
export const LANTERNS = [
  { id: 'wind', flag: 'kite-flown', who: 'Tor', title: 'Read the wind' },
  { id: 'fences', flag: 'fences-done', who: 'Bram', title: 'Snow fences' },
  { id: 'night', flag: 'gathered', who: 'Everyone', title: 'The long night' },
] as const;

export const FRIENDS = ['ysolde', 'bram', 'nima', 'tor', 'odo'] as const;

export function lanternsLit(c: QuestCtx): number {
  return LANTERNS.filter(l => has(c, l.flag) || has(c, 'peaks-healed')).length;
}

export function invitedCount(c: QuestCtx): number {
  return FRIENDS.filter(f => has(c, 'invited:' + f)).length;
}

export const MAIN_STEPS: Step[] = [
  { id: 'letter', text: GOAL.letter, done: c => has(c, 'read-letter') },
  { id: 'hollo', text: GOAL.meetYsolde, done: c => has(c, 'quest:hollo') },
  { id: 'wind', text: GOAL.findTor('Tor'), done: c => has(c, 'kite-flown') },
  { id: 'fences', text: GOAL.askBram, done: c => has(c, 'fences-done') },
  { id: 'night', text: GOAL.invite('everyone', 'all over the valley', 0), done: c => has(c, 'gathered') },
  { id: 'sit', text: GOAL.sit, done: c => has(c, 'peaks-healed') },
  { id: 'odo', text: GOAL.odo, done: c => has(c, 'boat-ready') },
  { id: 'farewell', text: GOAL.farewell, done: c => has(c, 'chapter1-complete') },
  { id: 'home', text: GOAL.home, done: c => has(c, 'loop-complete') },
];

/** A person's name once the player has talked to them; before that, how the player would describe them. */
export function knownAs(c: QuestCtx, id: string): string {
  const s = SCRIPTS[id];
  const heard = has(c, 'talked:' + id) || (HEARD_AFTER[id] !== undefined && has(c, HEARD_AFTER[id]));
  return heard ? s.name : s.stranger ?? s.name;
}

/** Someone else says their name first: Ysolde names Tor and Odo's bridge, Tor names Bram after the kite. */
const HEARD_AFTER: Record<string, string> = { tor: 'quest:hollo', odo: 'quest:hollo', bram: 'kite-flown' };

/** The one goal line for right now: what to do, who with, and which way. */
export function stepDetail(c: QuestCtx): string | null {
  const s = currentStep(c);
  if (!s) return null;
  // Tor's name is heard from Ysolde, so he is "Tor" from the start.
  if (s.id === 'wind') {
    if (has(c, 'flag:tor-follow')) return GOAL.walkRidge('Tor');
    if (has(c, 'item:spar')) return GOAL.bringBranch('Tor');
    if (has(c, 'quest:kite')) return GOAL.getBranch;
    return GOAL.findTor('Tor');
  }
  if (s.id === 'fences') {
    if (!has(c, 'goat-home')) return has(c, 'goat-following') ? GOAL.leadPebble : has(c, 'quest:goat') ? GOAL.findPebble : GOAL.askBram;
    if (!has(c, 'flag:tor-fences')) return GOAL.railsBram;
    return GOAL.fences(c.fences ?? 0);
  }
  if (s.id === 'night') {
    const who = nextToInvite(c);
    return who ? GOAL.invite(knownAs(c, who), WHERE[who], invitedCount(c)) : GOAL.sit;
  }
  return s.text;
}

/** The next person to invite to the long night, in the order the beam visits them. */
export function nextToInvite(c: QuestCtx): string | null {
  return FRIENDS.find(f => !has(c, 'invited:' + f)) ?? null;
}

/** Who the player should go and see for the current step, or null when the step is not about a person. */
export function nextPerson(c: QuestCtx): string | null {
  const s = currentStep(c);
  if (!s || !has(c, 'read-letter')) return null;
  switch (s.id) {
    case 'hollo': return 'ysolde';
    case 'wind': return has(c, 'quest:kite') && !has(c, 'item:spar') && !has(c, 'flag:tor-follow') ? null : 'tor';
    case 'fences':
      if (!has(c, 'goat-home')) return has(c, 'quest:goat') && !has(c, 'goat-following') ? null : 'bram';
      return has(c, 'flag:tor-fences') ? null : 'bram';
    case 'night': return nextToInvite(c);
    case 'odo': return 'odo';
    default: return null;
  }
}

export function currentStep(c: QuestCtx): Step | null {
  for (const s of MAIN_STEPS) if (!s.done(c)) return s;
  return null;
}

export interface SideQuest { id: string; title: string; start: string; done: string; text: (c: QuestCtx) => string }

export const SIDE_QUESTS: SideQuest[] = [
  {
    id: 'cloud', title: "Nima's little cloud", start: 'quest:cloud', done: 'journal:cloud',
    text: c => has(c, 'cloud-caught') ? 'Let the cloud go over the dry meadow by the goat terraces.' : 'Catch the little cloud asleep on the tall peak, east of the river.',
  },
  {
    id: 'echo', title: 'Echo stones', start: 'echo:any', done: 'echo:all',
    text: c => `Sit and listen at the old standing stones (${c.echoes} of 5).`,
  },
  {
    id: 'poles', title: "Grandpa's snow poles", start: 'quest:markers', done: 'journal:poles',
    text: () => "Read the three striped snow poles Tor's grandfather left.",
  },
];

export function activeSideQuests(c: QuestCtx): { title: string; text: string }[] {
  return SIDE_QUESTS.filter(q => has(c, q.start) && !has(c, q.done)).map(q => ({ title: q.title, text: q.text(c) }));
}
