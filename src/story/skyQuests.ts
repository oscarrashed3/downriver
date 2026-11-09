// World 2's story spine: win the Sky Races to ride the whale down. Pure logic (testable), like quests.ts.
//   arrive -> find Lark -> three kite parts -> build -> qualifier ribbon -> race -> goodbye -> the whale
import { SKY_GOAL } from '../data/skyStory';

const has = (f: Set<string>, k: string) => f.has(k);

/** The three kite parts, in the order the goal line asks for them. */
export const SKY_PARTS = [
  { id: 'frame', flag: 'sky:part-frame', goal: SKY_GOAL.frame },
  { id: 'cloth', flag: 'sky:part-cloth', goal: SKY_GOAL.cloth },
  { id: 'string', flag: 'sky:part-string', goal: SKY_GOAL.string },
] as const;

export type SkyStepId = 'larkTown' | 'parts' | 'build' | 'qualify' | 'race' | 'goodbye' | 'whale';

export function partsHeld(f: Set<string>): number { return SKY_PARTS.filter(p => has(f, p.flag)).length; }

/** Where the Sky Isles story is, or null before the arrival and after the whale. */
export function skyStep(f: Set<string>): SkyStepId | null {
  if (!has(f, 'sky:arrived') || has(f, 'chapter2-complete')) return null;
  if (!has(f, 'sky:quest-kite')) return 'larkTown';
  if (!has(f, 'sky:kite-built')) return partsHeld(f) < 3 ? 'parts' : 'build';
  if (!has(f, 'sky:ribbon')) return 'qualify';
  if (!has(f, 'sky:won')) return 'race';
  if (!has(f, 'sky:goodbye')) return 'goodbye';
  return 'whale';
}

/** The next part to fetch (the first one not yet in hand). */
export function nextPart(f: Set<string>) { return SKY_PARTS.find(p => !has(f, p.flag)) ?? null; }

/** The one goal line for right now. */
export function skyDetail(f: Set<string>): string | null {
  const s = skyStep(f);
  switch (s) {
    case null: return null;
    case 'larkTown': return SKY_GOAL.larkTown;
    case 'parts': return `${nextPart(f)!.goal} (${partsHeld(f)} of 3)`;
    default: return SKY_GOAL[s];
  }
}

/** The Sky Races meter: kite built, ribbon won, race won. */
export function skyDots(f: Set<string>): number {
  return ['sky:kite-built', 'sky:ribbon', 'sky:won'].filter(k => has(f, k)).length;
}

/** Who the goal line is about (for the goal page's "next" card), or null. */
export function skyPerson(f: Set<string>): string | null {
  switch (skyStep(f)) {
    case 'larkTown': case 'build': return 'lark';
    case 'parts': { const p = nextPart(f)!; return p.id === 'cloth' ? 'mender' : p.id === 'string' ? 'chimer' : null; }
    case 'race': return 'zephy';
    default: return null;
  }
}

export const SKY_WHERE: Record<string, string> = {
  lark: 'in Sailtown square',
  zephy: 'by the race gate',
  granwren: 'in Sailtown',
  mender: "on the sail-mender's isle",
  chimer: 'in the Chime Garden',
};

/** Where each of the windfolk lives (lat, off in metres from the river), what they look towards, and their voice. */
export const SKY_HOMES: Record<string, { kind: 'lark' | 'zephy' | 'wren' | 'mender' | 'chimer'; at: readonly [number, number]; face: readonly [number, number]; voice: number }> = {
  lark: { kind: 'lark', at: [56.5, 9.5], face: [57, 0], voice: 1.25 },
  zephy: { kind: 'zephy', at: [65, 12.5], face: [67, 17], voice: 1.12 },
  granwren: { kind: 'wren', at: [58.5, 14], face: [56, 9], voice: 0.85 },
  mender: { kind: 'mender', at: [101.5, 26.5], face: [103, 20], voice: 0.8 },
  chimer: { kind: 'chimer', at: [109.5, -6.5], face: [108, 0], voice: 1.0 },
};
