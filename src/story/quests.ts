// The story's spine: one main quest (go home) told as a chain of next steps, and a few side quests.
// Pure logic, so it can be tested without the game running.

export interface QuestCtx { flags: Set<string>; projected: number; echoes: number }

export interface Step { id: string; text: string; done: (c: QuestCtx) => boolean }

const has = (c: QuestCtx, f: string) => c.flags.has(f);

export const MAIN_STEPS: Step[] = [
  { id: 'letter', text: 'Read the letter in your satchel.', done: c => has(c, 'read-letter') },
  { id: 'why', text: 'The river is too thin to carry you. Find out why: follow the smoke down to the village.', done: c => has(c, 'talked:ysolde') },
  { id: 'trust', text: 'Ysolde wants someone who truly listens. Go back and sit with her.', done: c => has(c, 'power:skyreading') },
  { id: 'wind', text: 'Find out where the snow goes. Read the wind (Q) up on Kite Ridge, across the bridge.', done: c => has(c, 'saw-wind') },
  { id: 'keep', text: 'Help the valley keep its snow: fences on the windy ridges (ask Tor), or ice towers by the spring (ask Bram).', done: c => c.projected >= 0.7 - 1e-6 || has(c, 'peaks-healed') },
  { id: 'winter', text: 'The mountain is ready. Rest by the village campfire and let winter pass.', done: c => has(c, 'peaks-healed') },
  { id: 'tell', text: 'Spring is back. Tell Ysolde.', done: c => has(c, 'journal:stone-returns') },
  { id: 'odo', text: 'Find Odo at the old bridge. The river is strong enough now.', done: c => has(c, 'boat-ready') },
  { id: 'farewell', text: 'Say goodbye at the bridge.', done: c => has(c, 'chapter1-complete') },
  { id: 'home', text: 'Go home, to the light below the clouds. Follow the river.', done: c => has(c, 'loop-complete') },
];

export function currentStep(c: QuestCtx): Step | null {
  for (const s of MAIN_STEPS) if (!s.done(c)) return s;
  return null;
}

export interface SideQuest { id: string; title: string; start: string; done: string; text: (c: QuestCtx) => string }

export const SIDE_QUESTS: SideQuest[] = [
  {
    id: 'kite', title: "Tor's kite", start: 'quest:kite', done: 'kite-flown',
    text: c => has(c, 'flag:tor-follow') ? 'Walk up to Kite Ridge with Tor.' : has(c, 'item:spar') ? 'Bring the willow branch to Tor.' : 'Find a straight willow branch by the old tree at the spring.',
  },
  {
    id: 'cloud', title: "Nima's little cloud", start: 'quest:cloud', done: 'journal:cloud',
    text: c => has(c, 'cloud-caught') ? 'Let the cloud go over the dry meadow by the goat terraces.' : 'Catch the little cloud asleep on the tall peak, east of the river.',
  },
  {
    id: 'goat', title: "Bram's runaway goat", start: 'quest:goat', done: 'goat-home',
    text: c => has(c, 'goat-following') ? 'Lead the goat home to Bram. Walk, don\'t run.' : 'Find the little goat on the west cliffs and calm her down.',
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
