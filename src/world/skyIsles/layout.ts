// World 2, the Sky Isles: where everything is. One table of floating islands over the cloud sea, the named places
// on them, the rope bridges, the cloud pads, the updrafts and the race rings.
//
// Coordinates: lat = degrees from the north pole (the river runs from lat 4 to 179.5); off = METRES from the
// river's centre line at that latitude (+ = the +lon side, the sunny side where Sailtown's village stands).
// Heights are metres above the planet's radius R (58). The cloud sea lies at about 0; the island tops at 13-27.
//
// The river (planet.ts bedAt) steps down island by island: it crosses each top in a channel, tumbles down a short
// cascade a few metres before the island's downstream lip, and runs on across the gap in a stone aqueduct to the
// next, lower island. SKY_STEPS in planet.ts holds the cascades; RIVER_TOPS below the levels between them.

/** Height of the cloud sea's walkable floor (the soft fall lands here). */
export const CLOUD_H = 0.6;

/** The river's island levels, top to bottom: the meadow beside the water on each river island. */
export const RIVER_TOPS = [24, 20.5, 17, 13.5] as const;

/** Half-width of the aqueducts' water channel, and of the whole deck (to the outside of the parapets). */
export const AQ_CHANNEL = 3.2;
export const AQ_DECK = 5.4;
/** The low kerb wall along each aqueduct's outer edge (a soft wall: you walk the parapet, not off it). */
export const AQ_KERB = 0.35;

export interface FallDef {
  /** Where it goes over: toward this point (lat, off) from the island's centre. */
  lat: number;
  off: number;
  width: number;
  length: number;
}

/** Raised ground: at (lat, off), radius r (metres on the top), h metres high. */
export interface KnollDef { lat: number; off: number; r: number; h: number }

export interface IsleDef {
  id: string;
  name: string;
  lat: number;
  off: number;
  /** Radius of the top, metres (the outline wobbles round it). */
  r: number;
  /** Meadow height, metres above R. */
  top: number;
  seed: number;
  cliff: number;
  under: number;
  /** Carries the river across its top. */
  river?: boolean;
  wobble?: number;
  /** How much the meadow rolls (metres). */
  relief?: number;
  knolls?: KnollDef[];
  falls?: FallDef[];
  trees?: number;
  flowers?: number;
  bushes?: number;
  /** Small stepping islets: a bare-ish block of rock with a cap of grass. */
  islet?: boolean;
  taper?: number;
  /** Turns the island's outline about its centre (degrees), so a long axis lies along the river. */
  spin?: number;
}

/**
 * The islands. The four river islands come first, in order down the river. Each river island's top beside the
 * water is RIVER_TOPS[k]; the cascade near its downstream lip drops to the next level.
 */
export const ISLES: IsleDef[] = [
  {
    id: 'landing', name: 'Landing Isle', lat: 13.8, off: 1.5, r: 19.2, spin: 200, top: RIVER_TOPS[0], seed: 3, cliff: 10, under: 9, river: true, wobble: 0.5, relief: 0.8,
    knolls: [{ lat: 10, off: -9, r: 6, h: 1.2 }],
    falls: [{ lat: 14, off: 30, width: 2.0, length: 30 }], trees: 6, flowers: 7,
  },
  {
    id: 'sailtown', name: 'Sailtown', lat: 56.1, off: 3.5, r: 24.9, spin: 190, top: RIVER_TOPS[1], seed: 13, cliff: 11, under: 12, river: true, wobble: 0.45, relief: 0.7,
    // the rise behind the village where the windmills stand, and the green by the rope bridge to Windmill Isle
    knolls: [{ lat: 48, off: 15, r: 8, h: 1.8 }, { lat: 52, off: -12, r: 6, h: 1.4 }],
    falls: [{ lat: 62, off: 40, width: 2.6, length: 34 }], trees: 7, flowers: 8,
  },
  {
    id: 'chime', name: 'The Chime Garden', lat: 101.7, off: -1.5, r: 21.5, spin: 110, top: RIVER_TOPS[2], seed: 25, cliff: 9, under: 10, river: true, wobble: 0.45, relief: 0.6,
    falls: [{ lat: 104, off: -40, width: 1.8, length: 26 }], trees: 6, flowers: 9,
  },
  {
    id: 'whales', name: "Whale's Rest", lat: 159.1, off: 0, r: 24.5, spin: 270, top: RIVER_TOPS[3], seed: 33, cliff: 10, under: 11, river: true, wobble: 0.4, relief: 0.6,
    knolls: [{ lat: 152, off: -10, r: 6, h: 1.0 }],
    falls: [{ lat: 160, off: 40, width: 2.2, length: 24 }], trees: 7, flowers: 8,
  },
  // ---- off the river
  {
    id: 'windmill', name: 'Windmill Isle', lat: 54, off: -27.4, r: 9, top: 23.5, seed: 41, cliff: 12, under: 10, wobble: 0.5, relief: 0.5,
    knolls: [{ lat: 54, off: -27.4, r: 4.5, h: 0.8 }], trees: 3, flowers: 4,
  },
  {
    id: 'mender', name: "Sail-mender's Isle", lat: 103, off: 29.1, r: 8.5, top: 18.5, seed: 47, cliff: 9, under: 9, wobble: 0.5, relief: 0.4,
    falls: [{ lat: 96, off: 50, width: 1.4, length: 20 }], trees: 3, flowers: 4,
  },
  { id: 'drift', name: 'The drifting islet', lat: 34, off: 17, r: 3.6, top: 22.5, seed: 53, cliff: 4, under: 5, wobble: 0.5, relief: 0.2, trees: 1, flowers: 2, bushes: 5 },
  // stepping islets: Landing Isle to Windmill Isle, the Chime Garden to Whale's Rest, and a couple to look at
  { id: 'step1', name: 'stepping islet', lat: 27, off: -14.5, r: 2.8, top: 23.5, seed: 61, cliff: 3, under: 3.5, islet: true, relief: 0.1, trees: 0, flowers: 1, bushes: 2 },
  { id: 'step2', name: 'stepping islet', lat: 38, off: -22, r: 2.6, top: 24.5, seed: 67, cliff: 3, under: 3.5, islet: true, relief: 0.1, trees: 0, flowers: 1, bushes: 2 },
  { id: 'step3', name: 'stepping islet', lat: 128, off: -12, r: 2.6, top: 15.5, seed: 71, cliff: 3, under: 3, islet: true, relief: 0.1, trees: 0, flowers: 1, bushes: 2 },
  { id: 'step4', name: 'stepping islet', lat: 81, off: 18, r: 2.4, top: 19.5, seed: 73, cliff: 3, under: 3, islet: true, relief: 0.1, trees: 0, flowers: 1, bushes: 2 },
];

export const isleDef = (id: string) => ISLES.find(i => i.id === id)!;

/** Rope bridges between islands: plank decks you walk on, from lip to lip along the line between the two centres. */
export interface BridgeDef { a: string; b: string; width: number; sag: number }
export const BRIDGES: BridgeDef[] = [
  // the first rope bridge, off Landing Isle by stepping islets to Windmill Isle (broad decks: an easy walk)
  { a: 'landing', b: 'step1', width: 2.4, sag: 0.3 },
  { a: 'step1', b: 'step2', width: 2.4, sag: 0.4 },
  { a: 'step2', b: 'windmill', width: 2.4, sag: 0.45 },
  // the long bridge from Sailtown's green to Windmill Isle
  { a: 'sailtown', b: 'windmill', width: 2.4, sag: 0.45 },
  { a: 'chime', b: 'mender', width: 2.4, sag: 0.4 },
];

/**
 * Cloud pads (bouncing comes later), each a share k of the way from island a's lip to island b's, dh metres above
 * the straight line between their tops: Landing Isle to the drifting islet and on to Sailtown, and the race's.
 */
export const PADS: { a: string; b: string; k: number; dh: number; size: number }[] = [
  { a: 'landing', b: 'drift', k: 0.3, dh: -0.4, size: 3.6 },
  { a: 'landing', b: 'drift', k: 0.68, dh: -0.6, size: 3.2 },
  { a: 'drift', b: 'sailtown', k: 0.5, dh: -0.5, size: 3.4 },
  { a: 'sailtown', b: 'step4', k: 0.5, dh: 0.2, size: 3.0 },
  { a: 'step4', b: 'chime', k: 0.5, dh: 0.0, size: 3.4 },
  { a: 'chime', b: 'step3', k: 0.5, dh: -0.3, size: 3.2 },
  { a: 'step3', b: 'whales', k: 0.5, dh: -0.4, size: 3.6 },
];

/** Columns of rising air (wind ribbons and petals), near the big lips and along the race course: lat, off, height. */
export const UPDRAFTS: { lat: number; off: number; h: number }[] = [
  { lat: 32, off: -4, h: 38 }, { lat: 86, off: 8, h: 34 }, { lat: 130, off: 5, h: 30 }, { lat: 70, off: 30, h: 34 }, { lat: 115, off: -24, h: 30 },
];

/** Named places (lat, off): where people stand, where the beam points, where the story happens. */
export const SPOTS = {
  pool: { lat: 4, off: 0 },
  dock: { lat: 18, off: 3.8 },
  arrival: { lat: 20, off: 5.6 },
  signpost: { lat: 21.5, off: 7.5 },
  /** The fox, tangled in a kite string on the drifting islet. */
  fox: { lat: 34, off: 17 },
  sailSquare: { lat: 56, off: 11 },
  raceGate: { lat: 66, off: 15.5 },
  windmillTop: { lat: 54, off: -27.4 },
  menderHut: { lat: 103, off: 29.1 },
  workshop: { lat: 112, off: -9 },
  whalesRest: { lat: 172, off: 4 },
} as const;

/**
 * Race rings: golden ring chimes on tall poles. The first ones are the Chime Garden's qualifier rings; all of them
 * mark the race course, one loop round the six islands. isle: the island the pole stands on; ring: height of the
 * ring's centre above the ground there.
 */
export const RINGS: { isle: string; lat: number; off: number; ring: number; qualifier?: boolean }[] = [
  { isle: 'chime', lat: 98, off: 6, ring: 7, qualifier: true },
  { isle: 'chime', lat: 104, off: -9, ring: 8.5, qualifier: true },
  { isle: 'chime', lat: 113, off: -11, ring: 7.5, qualifier: true },
  { isle: 'chime', lat: 119, off: 2, ring: 9, qualifier: true },
  { isle: 'chime', lat: 111, off: 9.5, ring: 8, qualifier: true },
  { isle: 'sailtown', lat: 72, off: 15, ring: 9 },
  { isle: 'windmill', lat: 58, off: -40, ring: 8 },
  { isle: 'landing', lat: 9, off: -8, ring: 8 },
  { isle: 'mender', lat: 99, off: 32, ring: 8 },
  { isle: 'whales', lat: 150, off: -12, ring: 9 },
  { isle: 'whales', lat: 165, off: 13, ring: 8 },
];
