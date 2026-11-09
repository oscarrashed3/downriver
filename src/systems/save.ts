import type { Mood } from './connection';
import type { RiverState } from './riverState';
import type { SnowpackState } from './snowpack';

export const SAVE_VERSION = 4;

export interface SaveData {
  v: 4;
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
}

const KEY = 'nilo-save-v4';
const OLD_KEYS = ['nilo-save-v3', 'downriver-save-v2', 'downriver-save-v1'];

export const RESET_NOTICE = 'The story has grown since your last visit, so this journey starts fresh. Thank you for coming back.';

/**
 * Version 3 saves came from the six-world layout (peaks, pines, deep, desert, aquila, sea).
 * Version 4 has four (peaks, pines, sea, desert). Old world indices map to the world that took their place.
 */
export const V3_WORLD_MAP: Record<number, number> = { 0: 0, 1: 1, 2: 1, 3: 3, 4: 2, 5: 2 };
/** Old worlds whose ground still exists in the new layout, so a saved spot on them is still good. */
const V3_SAME_GROUND = new Set([0, 1, 3, 5]);
/** Pieces of the six-world journey that no longer exist. */
const V3_GONE_FLAGS = new Set(['map:deep', 'map:aquila', 'met:cassian']);
const V3_GONE_WORLDS = new Set(['deep', 'aquila']);

function fromV3(r: Omit<Partial<SaveData>, 'v'>): SaveData {
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
  const data = withDefaults({ ...(r as SaveData), v: 4, world, flags: [...flags], pins: keep(r.pins), seen: keep(r.seen) });
  if (!V3_SAME_GROUND.has(oldWorld)) data.arrive = true;
  return data;
}

function withDefaults(r: SaveData): SaveData {
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
 * Version 3 saves (six worlds) are carried over to the four-world layout; World 1 progress is untouched.
 * Saves from earlier versions (v1, v2) belong to a different story, so they are gently reset with a notice.
 */
export function migrateSave(raw: unknown): { data: SaveData | null; notice: string | null } {
  if (!raw || typeof raw !== 'object') return { data: null, notice: null };
  const r = raw as Omit<Partial<SaveData>, "v"> & { v?: number };
  const whole = Array.isArray(r.flags) && r.snow && r.river;
  if (r.v === 4 && whole) return { data: withDefaults(r as SaveData), notice: null };
  if (r.v === 3 && whole) return { data: fromV3(r), notice: null };
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
