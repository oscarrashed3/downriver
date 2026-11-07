// The words table: every short line the player reads outside of conversations, in one place.
// Goal lines: at most 12 words (not counting a counter like "(1 of 3)"), start with a verb,
// name only people and places the player has already heard of, and say which way to go.
// Conversations live in scripts.ts; story scenes in story.ts.

/** Where each person in world 1 can be found, as the player would say it. */
export const WHERE: Record<string, string> = {
  ysolde: 'at the spring',
  tor: 'at his workbench in the village',
  bram: 'at the west end of the village',
  nima: 'past Kite Ridge',
  odo: 'on his bridge',
};

/** The goal line, step by step. Functions take the person's name, or a description if not met yet. */
export const GOAL = {
  letter: 'Read the letter in your satchel. Press E.',
  meetYsolde: 'Talk to the old woman sitting by the giant on the spring.',
  findTor: (tor: string) => `Walk down the path to ${tor}'s workbench by the village fire.`,
  getBranch: 'Get a willow branch from the old tree by the spring.',
  bringBranch: (tor: string) => `Bring the willow branch to ${tor} at his workbench.`,
  walkRidge: (tor: string) => `Walk with ${tor} up to Kite Ridge, across the bridge.`,
  askBram: 'Ask Bram for fence wood, at the west end of the village.',
  findPebble: 'Find Pebble, the runaway goat, up on the west cliffs.',
  leadPebble: "Walk Pebble home to Bram. Don't run.",
  railsBram: 'Talk to Bram at the west end of the village about rails.',
  fences: (n: number) => `Build snow fences on the windy ridges. Press Q to see wind. (${n} of 3)`,
  stones: (n: number) => `Listen to the four old stones beside Hollo. (${n} of 4)`,
  stonesTune: "Play Hollo's tune back on the stones, in order.",
  odoFold: 'Talk to Odo on his bridge, just past the village.',
  lightEmber: "Light Fold's paper lantern at the village fire.",
  carryEmber: 'Carry the ember up to Hollo. Keep out of the wind.',
  invite: (who: string, where: string, n: number) => `Invite ${who}, ${where}, to the fire. (${n} of 5)`,
  sit: 'Sit by the fire beside Hollo and wait for the snow.',
  odo: 'Find Odo on his bridge, just past the village.',
  farewell: 'Say goodbye to everyone at the bridge.',
  home: 'Follow the river down to the edge of the world.',
};

/** Shown as a toast whenever the goal changes, before the goal line itself. */
export const NEW_GOAL = 'New goal';

/** Short notes that pop up in the corner. */
export const NOTE = {
  walkHint: '<b>W A S D</b> walk &nbsp; <b>X</b> run &nbsp; <b>C</b> roll &nbsp; <b>Mouse</b> look',
  willow: 'A straight willow branch. <i>Light, and it bends without breaking.</i>',
  pole: (i: number, now: number, old: number) => `Snow pole ${i}: <b>${now} m</b> today. Grandpa's oldest mark: <b>${old} m</b>.`,
  warm: 'Warm again.',
  notGathered: (n: number) => `Ysolde keeps the fire. Bring everyone here first. <i>(${n} of 5 invited)</i>`,
  holloHello: 'Hollo breathes frost on your hood. <i>That might be a hello.</i>',
  holloAsleep: (lit: number) => `Cold fur, slow breath, deep as the tide. <i>${lit} of 3 lanterns lit.</i>`,
  cloudCaught: 'The bottle fogs up, cold and heavy. <i>There is weather inside.</i>',
  bagFull: 'Your backpack is full.',
  flower: 'A mountain flower, into your backpack. <i>Someone might like one.</i>',
  pebbleFollows: "Pebble decides you are acceptable. <i>Walk her home to Bram. Don't run.</i>",
  pebbleStartles: "Pebble startles and trots off. <i>Walk, don't run.</i>",
  pebbleHome: 'Pebble trots straight to Bram and bites his sleeve. <i>He looks very happy.</i>',
  torFollows: 'Tor tucks the kite under his arm. <i>Walk to Kite Ridge together.</i>',
  windSeen: 'The wind drops its snow in the still air behind the ridge. <i>Fences on the windy side catch it.</i>',
  kiteWind: 'The kite showed you the wind. <b>Q</b> shows it any time.',
  fenceHums: 'The fence hums in the wind. Snow settles behind it.',
  fenceQuiet: 'The fence stands quietly. Hardly any snow drifts here.',
  allLit: "All three lanterns burn on Odo's bridge. <i>The river is running.</i>",
  riverStrong: 'The river is strong now. <i>Let it carry you to the edge of the world. You can always come back.</i>',
  avalanche: 'Far up the east road, the heavy slope lets go with a long, low roar.',
  sketch: 'A new page in your sketchbook. <i>K to look.</i>',
  notVisited: 'You have not been there yet. Follow the river.',
  needKite: 'You would need a kite to fly there.',
  stonesBegin: 'Ysolde: <i>"The old stones by Hollo sing, if you stand still and listen."</i>',
  stoneHeard: (n: number) => `The stone hums back. <i>${n} of 4 heard.</i>`,
  holloHums: 'Hollo hums in his sleep, the same four notes. <i>Play his tune back on the stones.</i>',
  stoneWrong: 'The stones go quiet. <i>Listen to Hollo again, then try once more.</i>',
  lantern2: "The second lantern lights on Odo's bridge. <i>Odo is waving from the bridge.</i>",
  emberLit: 'The ember settles inside Fold, warm and orange. <i>Walk, and keep out of the wind.</i>',
  emberLow: 'The flame shrinks in the wind. <i>Shelter by a wall, a rock or a tree.</i>',
  emberOut: 'The ember goes out. Fold shivers. <i>Light it again at the village fire.</i>',
  lantern3: 'The fire beside Hollo catches. The third lantern lights. <i>Someone is running up the path, shouting.</i>',
  gatheredAll: 'Everyone is coming. <i>Go to the fire beside Hollo.</i>',
  goBack: (w: string) => `You can come back to <b>${w}</b> any time. <i><b>Tab</b>, or Worlds in the menu.</i>`,
  unbuilt: (w: string) => `${w} is still being drawn. <i>Rest here a while, or press <b>Tab</b> to fly back to a world you know.</i>`,
  quality: (l: string) => `Picture quality: <b>${l}</b>`,
  qualityAuto: (l: string) => `Picture quality set to <b>${l}</b> to keep things smooth. <b>P</b> to change.`,
};

/** What the E prompt says. */
export const PROMPT = {
  fireSeat: 'Sit on a log by the fire',
  stoneListen: 'Listen to the old stone',
  stonePlay: "Play this stone's note",
  holloHum: 'Listen to Hollo hum',
  lightLantern: "Light Fold's lantern from the fire",
  setEmber: 'Set the ember in the fire ring',
  talk: (who: string) => `Talk to ${who}`,
  letter: 'Read the letter in your satchel',
  raft: 'Unfold Fold into a raft',
  willow: 'Pick up a straight willow branch',
  pole: 'Read the snow pole',
  warm: 'Warm your hands by the fire',
  hollo: 'Put a hand on the sleeping giant',
  holloAwake: 'Hollo watches the valley',
  catchCloud: "Catch the little cloud in Nima's bottle",
  releaseCloud: 'Let the cloud go over the dry meadow',
  sketch: 'Sit down and sketch the view',
  sketchAgain: 'Look at the view again',
  bench: 'Sit on the bench',
  stone: 'Listen to the old stone',
  flower: 'Pick a mountain flower',
  petGoat: 'Pet the goat',
  petPebble: 'Pet Pebble',
  pebble: 'Speak softly to the little goat',
  pebbleLost: 'A little goat, far from the others',
  goodbye: 'Say goodbye, and let the river carry you',
  ride: 'Ride the falling stream down to the Ember Pines',
  edge: 'Look over the edge',
  fencePosts: "Old fence posts. <i>Somebody's rails used to hang here.</i>",
  fence: 'Rail the old posts into a snow fence',
  fenceQ: 'Rail the old posts into a snow fence <i>(Q to read the wind first)</i>',
  fenceWindy: 'Rail the old posts into a snow fence. <i>The wind drops its snow here.</i>',
  fenceCalm: 'Rail the old posts into a snow fence. <i>The wind barely touches this hollow.</i>',
  sitFire: 'Sit by the fire beside Hollo, and wait for the snow',
  door: (who: string) => `Open ${who} door`,
  doorLocked: (who: string) => `Try ${who} door`,
  stepOut: 'Step back outside',
};

/** Doors in the village: whose house it is, what you find inside, or why it is shut. */
export const DOORS = {
  tor: { whose: "Tor's", inside: "Tor's house. <i>Kite ribs are drying over the table, and there is string everywhere.</i>" },
  ysolde: { whose: "Ysolde's", inside: "Ysolde's house. <i>A stone for every year the ice went back, all in a row on the shelf.</i>" },
  nima: { whose: "Nima's", inside: "Nima's house. <i>Every cloud she ever named is pinned to the wall.</i>" },
  bram: { whose: "Bram's", locked: "Bram's door is locked. <i>He's with the goats.</i>", inside: "Bram's house. <i>It smells of hay and goat, and there is a bell on every hook.</i>" },
  empty: { whose: 'the blue', locked: 'Nobody is home. <i>The window is dark, and the step is swept.</i>' },
  odo: { whose: "Odo's", locked: "Odo's door is shut. <i>He's down at the bridge, watching the water.</i>" },
} as const;


/** Count the words of a goal line, leaving out a trailing "(n of m)" counter. */
export function goalWords(line: string): number {
  return line.replace(/\(\d+ of \d+\)\s*$/, '').trim().split(/\s+/).filter(Boolean).length;
}
