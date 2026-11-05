import type { Mood } from './connection';
import type { RiverState } from './riverState';
import type { SnowpackState } from './snowpack';

export interface SaveData {
  v: 1;
  flags: string[];
  moods: Record<string, Mood>;
  river: RiverState;
  snow: SnowpackState;
  world: number;
  dir: [number, number, number];
  poles: number[];
  journal: string[];
  pins: Record<string, { x: number; y: number }[]>;
}

const KEY = 'downriver-save-v1';
export function loadSave(): SaveData | null {
  try { const s = localStorage.getItem(KEY); return s ? (JSON.parse(s) as SaveData) : null; } catch { return null; }
}
export function writeSave(d: SaveData) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode */ } }
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
