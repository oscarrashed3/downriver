// The named areas of each world. Entering one for the first time shows its name.
// at: [lat from the north pole, longitude from the river], r: radius in meters.

export interface Area { id: string; world: number; name: string; sub: string; at: [number, number]; r: number }

export const AREAS: Area[] = [
  { id: 'spring', world: 0, name: "Hollo's Spring", sub: 'where the river begins, asleep', at: [16, 0], r: 13 },
  { id: 'village', world: 0, name: 'Hearth Village', sub: 'where the smoke goes up straight', at: [60.5, -17], r: 16 },
  { id: 'terraces', world: 0, name: 'Goat Terraces', sub: 'stone walls, and goats on top of them', at: [68.5, -33], r: 11 },
  { id: 'ridge', world: 0, name: 'Kite Ridge', sub: 'where the wind can be read', at: [50, 47], r: 13 },
  { id: 'meadow', world: 0, name: 'Cloud Meadow', sub: 'where the clouds come down to rest', at: [45, 70], r: 15 },
  { id: 'cliffs', world: 0, name: 'West Cliffs', sub: 'narrow ledges, and one runaway', at: [42, -62], r: 14 },
  { id: 'bridge', world: 0, name: "Odo's Bridge", sub: 'three lanterns over the water', at: [73.5, 3], r: 10 },
  { id: 'edge', world: 0, name: 'The Edge', sub: 'where the river falls into the clouds', at: [176, 0], r: 14 },
];
