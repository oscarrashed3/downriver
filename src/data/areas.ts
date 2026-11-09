// The named areas of each world. Entering one for the first time shows its name; only then is it on the map.
// at: [lat from the north pole, longitude from the river], r: radius in meters.
// ground: a tint painted into the terrain; light: a tint on the sunlight while you stand there;
// sound: what you hear more of there.

export type AreaSound = 'chimes' | 'fire' | 'goats' | 'wind' | 'birds' | 'river' | 'falls';

export interface Area {
  id: string; world: number; name: string; sub: string; at: [number, number]; r: number;
  ground: string; light: string; sound: AreaSound;
}

export const AREAS: Area[] = [
  { id: 'spring', world: 0, name: "Hollo's Spring", sub: 'where the river begins', at: [16, 0], r: 13, ground: '#d6e6ee', light: '#cfe4ff', sound: 'chimes' },
  { id: 'village', world: 0, name: 'Hearth Village', sub: 'where the smoke goes up straight', at: [60.5, -17], r: 16, ground: '#a8c45a', light: '#ffd9a0', sound: 'fire' },
  { id: 'terraces', world: 0, name: 'Goat Terraces', sub: 'stone walls, and goats on top of them', at: [68.5, -33], r: 11, ground: '#c8b46a', light: '#ffe6b0', sound: 'goats' },
  { id: 'ridge', world: 0, name: 'Kite Ridge', sub: 'where the wind can be read', at: [50, 47], r: 13, ground: '#9ab070', light: '#e8f0ff', sound: 'wind' },
  { id: 'meadow', world: 0, name: 'Cloud Meadow', sub: 'where the clouds come down to rest', at: [45, 70], r: 15, ground: '#b8d870', light: '#fff0f4', sound: 'birds' },
  { id: 'cliffs', world: 0, name: 'West Cliffs', sub: 'narrow ledges, and one runaway', at: [42, -62], r: 14, ground: '#9a948a', light: '#d8dcff', sound: 'wind' },
  { id: 'bridge', world: 0, name: "Odo's Bridge", sub: 'three lanterns over the water', at: [73.5, 3], r: 10, ground: '#8ab86a', light: '#ffe4b8', sound: 'river' },
  { id: 'edge', world: 0, name: 'The Edge', sub: 'where the river falls into the clouds', at: [176, 0], r: 14, ground: '#b0d0c8', light: '#f0f4ff', sound: 'falls' },
];

/** The areas of a world the player has walked into, in the order they are listed. */
export function discoveredAreas(world: number, flags: Set<string>): Area[] {
  return AREAS.filter(a => a.world === world && flags.has('area:' + a.id));
}

/** Areas name themselves again after this long away (seconds). */
export const AREA_AGAIN = 600;
