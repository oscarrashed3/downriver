import type { Mood } from './connection';
import type { RiverState } from './riverState';
import type { SnowpackState } from './snowpack';

export const SAVE_VERSION = 3;

export interface SaveData {
  v: 3;
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
}

const KEY = 'nilo-save-v3';
const OLD_KEYS = ['downriver-save-v2', 'downriver-save-v1'];

export const RESET_NOTICE = 'The story has grown since your last visit, so this journey starts fresh. Thank you for coming back.';

/**
 * Read any stored save and bring it up to the current version.
 * Saves from earlier versions (v1, v2) belong to a different story, so they are gently reset with a notice.
 */
export function migrateSave(raw: unknown): { data: SaveData | null; notice: string | null } {
  if (!raw || typeof raw !== 'object') return { data: null, notice: null };
  const r = raw as Omit<Partial<SaveData>, "v"> & { v?: number };
  if (r.v === 3 && Array.isArray(r.flags) && r.snow && r.river) {
    return {
      data: {
        ...(r as SaveData),
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
      },
      notice: null,
    };
  }
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
