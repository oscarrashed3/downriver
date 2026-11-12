import type { Mood } from './connection';
import type { RiverState } from './riverState';
import type { SnowpackState } from './snowpack';

export const SAVE_VERSION = 5;

export interface SaveData {
  v: 5;
  flags: string[];
  moods: Record<string, Mood>;
  river: RiverState;
  snow: SnowpackState;
  world: number;
  dir: [number, number, number];
  poles: number[];
  journal: string[];
  pins: Record<string, { x: number; y: number }[]>;
  /** Time of day, 0..1. */
  day: number;
  flowers: number;
  /** Signature of what each person knew last time you spoke, so they only repeat themselves when nothing changed. */
  sigs: Record<string, string>;
  /** The backpack: item ids in slot order (8 slots). */
  bag: string[];
  /** Viewpoint sketches: small JPEG data URLs. */
  sketches: { id: string; label: string; img: string }[];
  /** Letters Nilo wrote back: letter id to the reply chosen. */
  sent: Record<string, string>;
  /** The map's fog: visited cells per world, as strings of 0/1. */
  seen: Record<string, string>;
  /** Set when the saved spot no longer fits the world (it was redrawn): start at its arrival point instead of dir. */
  arrive?: boolean;
  /** World 3: whether Nilo was on Old Amble's back and where (creature space), and where Amble was on its loop. */
  town?: { on: boolean; local: [number, number, number]; s: number; mode: string };
}

const KEY = 'nilo-save-v5';
const OLD_KEYS = ['nilo-save-v4', 'nilo-save-v3', 'downriver-save-v2', 'downriver-save-v1'];

export const RESET_NOTICE = 'The story has grown since your last visit, so this journey starts fresh. Thank you for coming back.';

/**
 * Version 3 saves came from the six-world layout (peaks, pines, deep, desert, aquila, sea).
 * Version 4 has four (peaks, pines, sea, desert). Old world indices map to the world that took their place.
 * The desert used to come before the sea and is now the last world, so an old desert save (and its
 * visited mark) moves to the sea's arrival point: the journey order holds and no world is skipped.
 */
export const V3_WORLD_MAP: Record<number, number> = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 2 };
/** Old worlds whose ground still exists at the same place in the journey, so a saved spot on them is still good. */
const V3_SAME_GROUND = new Set([0, 1, 5]);
/** Pieces of the six-world journey that no longer exist. */
const V3_GONE_FLAGS = new Set(['map:deep', 'map:aquila', 'met:cassian']);
const V3_GONE_WORLDS = new Set(['deep', 'aquila']);

/** A save in the four-world layout (version 4), before it is carried on to six worlds. */
type V4 = Omit<SaveData, 'v'> & { v: 4 };

function fromV3(r: Omit<Partial<SaveData>, 'v'>): V4 {
  const oldWorld = typeof r.world === 'number' ? r.world : 0;
  const world = V3_WORLD_MAP[oldWorld] ?? 0;
  const flags = new Set<string>();
  for (const f of r.flags ?? []) {
    if (V3_GONE_FLAGS.has(f)) continue;
    const m = /^(visited|told-goback):(\d+)$/.exec(f);
    if (m) { const n = V3_WORLD_MAP[+m[2]]; if (n !== undefined) flags.add(`${m[1]}:${n}`); continue; }
    flags.add(f);
  }
  const keep = <T>(o: Record<string, T> | undefined) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !V3_GONE_WORLDS.has(k)));
  const data = withDefaults({ ...(r as SaveData), world, flags: [...flags], pins: keep(r.pins), seen: keep(r.seen) });
  if (!V3_SAME_GROUND.has(oldWorld)) data.arrive = true;
  return { ...data, v: 4 };
}

/**
 * Version 5 has six worlds: peaks, sky, garden, sea, desert, lantern. Version 4 had four: peaks, pines, sea, desert.
 * The forest is gone and the Sky Isles take its place in the journey; the sea and the desert move down two places.
 * The sea is the same ground, so a saved spot there still holds; the Sky Isles and the repainted desert start at
 * their arrival point.
 */
export const V4_WORLD_MAP: Record<number, number> = { 0: 0, 1: 1, 2: 3, 3: 4 };
const V4_SAME_GROUND = new Set([0, 2]);
/** Pieces of the four-world journey that no longer exist: the forest's map, and the forest people (Tamsin and Oro now live elsewhere and have not met you). */
const V4_GONE_FLAGS = new Set(['map:pines', 'met:tamsin', 'met:oro', 'talked:tamsin', 'talked:oro',
  // The home light has moved from the desert to Lantern Town, which nobody has reached yet: knock again there.
  'loop-complete']);
/**
 * Arrival and leaving flags of the old worlds whose ground is new: the forest (old 1) became the Sky Isles and the
 * Glass Desert (old 3) was repainted, so their first-arrival card, intro and notes should play again.
 */
const V4_NEW_GROUND = new Set([1, 3]);
const V4_GONE_WORLDS = new Set(['pines']);

function fromV4(r: Omit<Partial<SaveData>, 'v'> & { arrive?: boolean }): SaveData {
  const oldWorld = typeof r.world === 'number' ? r.world : 0;
  const world = V4_WORLD_MAP[oldWorld] ?? 0;
  const flags = new Set<string>();
  for (const f of r.flags ?? []) {
    if (V4_GONE_FLAGS.has(f)) continue;
    const m = /^(visited|told-goback):(\d+)$/.exec(f);
    if (m) { const n = V4_WORLD_MAP[+m[2]]; if (n !== undefined && !V4_NEW_GROUND.has(+m[2])) flags.add(`${m[1]}:${n}`); continue; }
    flags.add(f);
  }
  const keep = <T>(o: Record<string, T> | undefined) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !V4_GONE_WORLDS.has(k)));
  const river = r.river ? { ...r.river, loopComplete: false } : r.river;
  const data = withDefaults({ ...(r as SaveData), v: 5 as const, world, flags: [...flags], pins: keep(r.pins), seen: keep(r.seen), river: river as SaveData['river'] });
  if (!V4_SAME_GROUND.has(oldWorld)) data.arrive = true;
  return data;
}

function withDefaults<T extends Omit<SaveData, 'v'>>(r: T): T {
  return {
    ...r,
    day: typeof r.day === 'number' ? r.day : 0.1,
    flowers: r.flowers ?? 0,
    sigs: r.sigs ?? {},
    pins: r.pins ?? {},
    poles: r.poles ?? [],
    journal: r.journal ?? [],
    moods: r.moods ?? {},
    bag: r.bag ?? [],
    sketches: r.sketches ?? [],
    sent: r.sent ?? {},
    seen: r.seen ?? {},
  };
}

/**
 * Read any stored save and bring it up to the current version.
 * Version 4 saves (four worlds) are carried over to the six-world layout, and version 3 saves (the first six-world
 * layout) through version 4 first; World 1 progress is untouched.
 * Saves from earlier versions (v1, v2) belong to a different story, so they are gently reset with a notice.
 */
export function migrateSave(raw: unknown): { data: SaveData | null; notice: string | null } {
  if (!raw || typeof raw !== 'object') return { data: null, notice: null };
  const r = raw as Omit<Partial<SaveData>, "v"> & { v?: number };
  const whole = Array.isArray(r.flags) && r.snow && r.river;
  if (r.v === 5 && whole) return { data: withDefaults(r as SaveData), notice: null };
  if (r.v === 4 && whole) return { data: fromV4(r), notice: null };
  if (r.v === 3 && whole) return { data: fromV4(fromV3(r)), notice: null };
  if (r.v === 1 || r.v === 2) return { data: null, notice: RESET_NOTICE };
  return { data: null, notice: null };
}

export function loadSave(): { data: SaveData | null; notice: string | null } {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return migrateSave(JSON.parse(s));
    for (const k of OLD_KEYS) {
      const o = localStorage.getItem(k);
      if (o) return migrateSave(JSON.parse(o));
    }
  } catch { /* unreadable: start fresh */ }
  return { data: null, notice: null };
}
export function writeSave(d: SaveData) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode */ } }
export function clearSave() { try { localStorage.removeItem(KEY); OLD_KEYS.forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ } }
