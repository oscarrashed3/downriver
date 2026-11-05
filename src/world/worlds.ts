import { PEAKS } from '../render/palette';
import * as THREE from 'three';

export type Shape = 'peaks' | 'pines' | 'jungle' | 'desert' | 'city' | 'sea';

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
  };
  music: 'bells' | 'woodwind' | 'marimba' | 'pluck' | 'lyre' | 'strings';
}

/** Worlds hang in the cloud sea in a slow descending spiral. Each south pole pours into the next north pole. */
function placeAt(i: number): THREE.Vector3 {
  const a = i * 1.15;
  return new THREE.Vector3(Math.cos(a) * 240, -i * 340, Math.sin(a) * 240);
}

export const WORLDS: WorldConfig[] = [
  {
    id: 'peaks', name: 'The Spring Peaks', subtitle: 'where the river begins', shape: 'peaks',
    center: placeAt(0), radius: 62, seed: 11, detail: 70, amplitude: 17, valleyWidth: 20,
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
    id: 'pines', name: 'The Ember Pines', subtitle: 'a forest learning to burn well', shape: 'pines',
    center: placeAt(1), radius: 56, seed: 23, detail: 56, amplitude: 9,
    riverStartLat: 4, meander: 22, meanderWaves: 2.5, riverWidth: 2.8, riverBed: 0.6, bankWidth: 4, waterDepth: 0.55,
    palette: {
      low: '#5f8a48', mid: '#7a8448', high: '#4a4034', rock: '#5a4a40', bank: '#a8935e',
      water: '#9ad7d6', waterDeep: '#2f6b74',
      light: '#ffc28a', ambient: '#8a6a6a', fog: '#e7b48c', skyTop: '#6a5a9a', skyHorizon: '#ffb070',
    },
    music: 'woodwind',
  },
  {
    id: 'deep', name: 'The Green Deep', subtitle: 'terraces in the mist', shape: 'jungle',
    center: placeAt(2), radius: 64, seed: 37, detail: 56, amplitude: 13,
    riverStartLat: 4, meander: 26, meanderWaves: 3, riverWidth: 3.2, riverBed: 0.6, bankWidth: 4, waterDepth: 0.6,
    palette: {
      low: '#3f8a5a', mid: '#5fa860', high: '#2d6a45', rock: '#4d5a40', bank: '#8a7a50',
      water: '#b9a46a', waterDeep: '#6a5530',
      light: '#fff0c8', ambient: '#5a8a7a', fog: '#cfe3d4', skyTop: '#4f8a9a', skyHorizon: '#f6ead0',
    },
    music: 'marimba',
  },
  {
    id: 'desert', name: 'The Glass Desert', subtitle: 'dunes that never stay still', shape: 'desert',
    center: placeAt(3), radius: 60, seed: 41, detail: 56, amplitude: 8,
    riverStartLat: 4, meander: 30, meanderWaves: 2, riverWidth: 2.2, riverBed: 0.5, bankWidth: 3, waterDepth: 0.55,
    palette: {
      low: '#f1dcc0', mid: '#e8b98a', high: '#d99a7a', rock: '#c48a6a', bank: '#efe8df',
      water: '#8fd0e0', waterDeep: '#3d8aa0',
      light: '#ffd9a8', ambient: '#b48a9a', fog: '#f4d2c0', skyTop: '#6a6ab0', skyHorizon: '#ffc8a0',
    },
    music: 'pluck',
  },
  {
    id: 'aquila', name: 'Aquila', subtitle: 'the marble city on the flood plain', shape: 'city',
    center: placeAt(4), radius: 70, seed: 53, detail: 56, amplitude: 5,
    riverStartLat: 4, meander: 14, meanderWaves: 2, riverWidth: 3.6, riverBed: 0.4, bankWidth: 4, waterDepth: 0.6,
    palette: {
      low: '#9aa86a', mid: '#b8b07a', high: '#8a9a5a', rock: '#c8b89a', bank: '#d8ccb0',
      water: '#8fc8d8', waterDeep: '#3a7a90',
      light: '#fff0d8', ambient: '#9a9ab0', fog: '#efe0cc', skyTop: '#5a7ac0', skyHorizon: '#ffe0b8',
    },
    music: 'lyre',
  },
  {
    id: 'sea', name: 'The Endless Sea', subtitle: 'where the river is remembered', shape: 'sea',
    center: placeAt(5), radius: 76, seed: 67, detail: 50, amplitude: 6, ocean: 1.6,
    riverStartLat: 4, meander: 10, meanderWaves: 2, riverWidth: 3.0, riverBed: 1.2, bankWidth: 3, waterDepth: 0.6,
    palette: {
      low: '#e9dcc0', mid: '#cfe0a8', high: '#7fae7a', rock: '#c8a890', bank: '#f2e6cc',
      water: '#7fe0e0', waterDeep: '#1f7a9a',
      light: '#ffe6cc', ambient: '#7aa0c0', fog: '#cfe8ee', skyTop: '#4a7ab8', skyHorizon: '#ffd8c0',
    },
    music: 'strings',
  },
];
