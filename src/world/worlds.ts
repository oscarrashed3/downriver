import { PEAKS } from '../render/palette';
import * as THREE from 'three';

export type Shape = 'peaks' | 'sky' | 'garden' | 'sea' | 'desert' | 'lantern';

export interface WorldConfig {
  id: string;
  name: string;
  subtitle: string;
  shape: Shape;
  center: THREE.Vector3;
  radius: number;
  seed: number;
  detail: number;
  amplitude: number;
  riverStartLat: number;
  meander: number;
  meanderWaves: number;
  riverWidth: number;
  riverBed: number;
  bankWidth: number;
  waterDepth: number;
  ocean?: number;
  valleyWidth?: number;
  palette: {
    low: string; mid: string; high: string; rock: string; bank?: string; moss?: string; dab?: string; path?: string;
    snow?: string; ice?: string; water: string; waterDeep: string;
    light: string; ambient: string; fog: string; skyTop: string; skyHorizon: string;
    /** Only for a world that keeps the night (Lantern Town): its own moonlit ambient, fog and moon strength. */
    night?: { ambient: string; fog: string; moon: number };
  };
  music: 'bells' | 'woodwind' | 'marimba' | 'pluck' | 'lyre' | 'strings';
  /**
   * The hour this world keeps (every world but the first). The journey reads as one day: morning in the
   * Spring Peaks, then midday, afternoon, open day, sunset and night. `elev` is the sun's height above
   * Nilo's own horizon (-1..1); it stays there wherever he walks on this small world.
   */
  hour?: { elev: number };
}

/** Six worlds hang in the cloud sea in a slow descending spiral. Each south pole pours into the next north pole. */
function placeAt(i: number): THREE.Vector3 {
  const a = i * 1.15;
  return new THREE.Vector3(Math.cos(a) * 240, -i * 340, Math.sin(a) * 240);
}

export const WORLDS: WorldConfig[] = [
  {
    id: 'peaks', name: 'The Spring Peaks', subtitle: 'where the river begins', shape: 'peaks',
    center: placeAt(0), radius: 59, seed: 11, detail: 70, amplitude: 17, valleyWidth: 20,
    riverStartLat: 14, meander: 16, meanderWaves: 3, riverWidth: 2.4, riverBed: 1.0, bankWidth: 5, waterDepth: 0.55,
    palette: {
      low: PEAKS.meadowLow, mid: PEAKS.meadowMid, high: PEAKS.heights, rock: PEAKS.rock, bank: PEAKS.bank,
      moss: PEAKS.moss, dab: PEAKS.dab, path: PEAKS.path,
      snow: PEAKS.snow, ice: PEAKS.ice, water: PEAKS.water, waterDeep: PEAKS.waterDeep,
      light: PEAKS.sunlight, ambient: PEAKS.skyAmbient, fog: PEAKS.haze, skyTop: PEAKS.skyTop, skyHorizon: PEAKS.skyHorizon,
    },
    music: 'bells',
  },
  {
    id: 'sky', name: 'The Sky Isles', subtitle: 'where the river learns to fly', shape: 'sky',
    center: placeAt(1), radius: 58, seed: 29, detail: 60, amplitude: 10,
    riverStartLat: 4, meander: 18, meanderWaves: 2, riverWidth: 2.4, riverBed: 1.0, bankWidth: 3, waterDepth: 0.5,
    palette: {
      low: '#f6f3fa', mid: '#a9d98a', high: '#d2eaa0', rock: '#ece2d2', bank: '#e9e2c8', dab: '#c4ec96', path: '#efe6cc',
      water: '#a8e6f4', waterDeep: '#4fa3c8',
      // pastel blue all the way down to the horizon (a white horizon washed World 2 out to grey)
      light: '#fff4d6', ambient: '#a8c8ee', fog: '#cfe6fa', skyTop: '#5f9ee8', skyHorizon: '#b8dcf8',
    },
    music: 'lyre', hour: { elev: 0.93 },
  },
  {
    // (the id stays 'garden' so saves from before keep their place; the world itself is the Walking Town)
    id: 'garden', name: 'Walking Town', subtitle: 'where the village walks', shape: 'garden',
    center: placeAt(2), radius: 120, seed: 37, detail: 120, amplitude: 9, ocean: 0.45, valleyWidth: 20,
    riverStartLat: 4, meander: 14, meanderWaves: 2, riverWidth: 2.8, riverBed: 0.8, bankWidth: 4.5, waterDepth: 0.5,
    palette: {
      // a golden meadow on green rolling hills, blue rock and snow on the far mountains (planet.ts)
      low: '#d6b84e', mid: '#b4b450', high: '#7fa456', rock: '#8e98ae', bank: '#d9cc96', dab: '#e6cc62', path: '#e0cf9c',
      snow: '#f4f6fb', water: '#8ccbe0', waterDeep: '#3f7fa8',
      light: '#ffeac4', ambient: '#a6bcd8', fog: '#d6e4f0', skyTop: '#5c9ae6', skyHorizon: '#cfe4f6',
    },
    music: 'marimba', hour: { elev: 0.62 },
  },
  {
    id: 'sea', name: 'The Endless Sea', subtitle: 'many shores, one river', shape: 'sea',
    center: placeAt(3), radius: 76, seed: 67, detail: 50, amplitude: 6, ocean: 1.6,
    riverStartLat: 4, meander: 10, meanderWaves: 2, riverWidth: 3.0, riverBed: 1.2, bankWidth: 3, waterDepth: 0.6,
    palette: {
      low: '#e9dcc0', mid: '#cfe0a8', high: '#7fae7a', rock: '#c8a890', bank: '#f2e6cc',
      water: '#7fe0e0', waterDeep: '#1f7a9a',
      light: '#ffe6cc', ambient: '#7aa0c0', fog: '#cfe8ee', skyTop: '#4a7ab8', skyHorizon: '#ffd8c0',
    },
    music: 'strings', hour: { elev: 0.78 },
  },
  {
    id: 'desert', name: 'The Painted Desert', subtitle: 'where the colours lie down to rest', shape: 'desert',
    center: placeAt(4), radius: 60, seed: 41, detail: 60, amplitude: 9,
    riverStartLat: 4, meander: 30, meanderWaves: 2, riverWidth: 2.2, riverBed: 0.5, bankWidth: 3, waterDepth: 0.5,
    palette: {
      // the dunes and mesas are banded by height (planet.ts DESERT_BANDS); these colour the flats and the banks
      low: '#f8d6cc', mid: '#f4b4a0', high: '#c8b0e8', rock: '#d8a0b0', bank: '#f8ece6', path: '#faf0ea',
      water: '#9fe0e0', waterDeep: '#3f8aa8',
      light: '#ffd2b0', ambient: '#a8a8e0', fog: '#f0c0c0', skyTop: '#5a5aa8', skyHorizon: '#ffb08a',
    },
    music: 'pluck', hour: { elev: 0.16 },
  },
  {
    id: 'lantern', name: 'Lantern Town', subtitle: 'where the river comes home', shape: 'lantern',
    center: placeAt(5), radius: 58, seed: 53, detail: 60, amplitude: 3,
    riverStartLat: 4, meander: 20, meanderWaves: 2, riverWidth: 2.6, riverBed: 0.6, bankWidth: 3, waterDepth: 0.55,
    palette: {
      // warm old cobbles, so the moonlit town never reads as snow
      low: '#a08a78', mid: '#a8927e', high: '#b09a84', rock: '#8a7a88', bank: '#b49c80', path: '#c8aa88',
      water: '#5a8ab8', waterDeep: '#1a2f5a',
      light: '#ffd8a0', ambient: '#5a6aa8', fog: '#2a3060', skyTop: '#141a44', skyHorizon: '#4a3a6a',
      // a festival night: a bright moon, lilac-blue shadows, a warm haze from all the lanterns
      night: { ambient: '#6a78c8', fog: '#4a4a80', moon: 1.5 },
    },
    music: 'woodwind', hour: { elev: -0.6 },
  },
];
