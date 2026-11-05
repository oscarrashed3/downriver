// The story's spine: one main quest (go home) told as a chain of next steps, and a few side quests.
// Pure logic, so it can be tested without the game running.

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
  { id: 'letter', text: 'Read the letter in your satchel.', done: c => has(c, 'read-letter') },
  { id: 'hollo', text: 'Something huge is asleep on the spring. Ask the old woman with the tin cup what it is.', done: c => has(c, 'quest:hollo') },
  { id: 'wind', text: "Lantern 1 of 3. Help Tor fly his grandfather's kite from Kite Ridge. His house is in the village.", done: c => has(c, 'kite-flown') },
  { id: 'fences', text: 'Lantern 2 of 3. Bring Bram his lost goat, then build three snow fences where the wind blows hardest.', done: c => has(c, 'fences-done') },
  { id: 'night', text: 'Lantern 3 of 3. Snow is coming tonight. Invite everyone to the fire beside Hollo.', done: c => has(c, 'gathered') },
  { id: 'sit', text: 'Everyone is gathered beside Hollo. Sit by the fire and let winter pass.', done: c => has(c, 'peaks-healed') },
  { id: 'odo', text: 'The river is running. Find Odo at the bridge so he can ready Fold.', done: c => has(c, 'boat-ready') },
  { id: 'farewell', text: 'Say goodbye at the bridge.', done: c => has(c, 'chapter1-complete') },
  { id: 'home', text: 'Go home, to the light below the clouds. Follow the river.', done: c => has(c, 'loop-complete') },
];

/** The journal's one line for the current stop, with the detail that matters right now. */
export function stepDetail(c: QuestCtx): string | null {
  const s = currentStep(c);
  if (!s) return null;
  if (s.id === 'wind') {
    if (has(c, 'flag:tor-follow')) return 'Walk up to Kite Ridge with Tor: over the bridge, then east.';
    if (has(c, 'item:spar')) return 'Bring the willow branch to Tor in the village.';
    if (has(c, 'quest:kite')) return "Find a straight willow branch under the old tree by the spring.";
  }
  if (s.id === 'fences') {
    if (!has(c, 'goat-home')) return has(c, 'goat-following') ? "Lead Pebble home to Bram. Walk, don't run." : has(c, 'quest:goat') ? 'Pebble is on the west cliffs. Speak softly, then lead her home.' : 'Ask Bram, the goatherd, for fence wood.';
    return `Build snow fences on the windy ridges (${c.fences ?? 0} of 3). Press Q to see where the wind blows.`;
  }
  if (s.id === 'night') return `Invite everyone to the fire beside Hollo (${invitedCount(c)} of 5).`;
  return s.text;
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
