// World 2, the Sky Isles: the story's words (scenes, goal lines, notes, letters). People's talk is in skyScripts.ts.

/** The arrival: the splash into the pool on Landing Isle, the race-day parade overhead, Lark's news. */
export const SKY_WOW = {
  splash: 'Down through the cloud, and SPLASH, into a pool of cold, bright water.',
  look: 'Overhead: kites. Dozens and dozens of kites, with tails like ribbons of paint.',
  whales: 'And under them, slow as clouds, whales. Swimming through the sky, with birds on their backs.',
  wide: 'Islands. A whole sky of islands, and windmills, and bunting on every rope.',
  lark1: 'You fell out of the sky! Into the pool! Are you all right?',
  lark2: "It's race day! The Sky Races! Everyone flies, all the way round the six islands!",
  lark3: 'And the winner rides a sky whale, down through the clouds, to the green lands below.',
  fold: 'Fold rustles. Down through the clouds. Down is where the water goes.',
  name: "I'm Lark! Come and find me in Sailtown, over the bridge.",
};

/** The postman, who comes by a little balloon here. */
export const SKY_POSTMAN = {
  arrive: 'A little striped balloon comes bobbing over the roofs. The postman is leaning out of the basket, waving.',
  hand: 'Post! Mind the gap, mind the gap. Windy up here, isn\'t it?',
  after: 'He tips his cap, drops a sandbag, and floats away over the chimes.',
};

/** Where to go: one line, a verb first, at most twelve words. */
export const SKY_GOAL = {
  lark: 'Talk to the girl in the yellow scarf by the pool.',
  larkTown: 'Find Lark in Sailtown, across the aqueduct.',
  frame: 'Climb to the top of Windmill Isle for the kite frame',
  cloth: "Ask the sail-mender on his island for sailcloth",
  string: 'Ask the chime-maker in the Chime Garden for string',
  build: 'Bring the three kite parts to Lark in Sailtown.',
  qualify: 'Fly the qualifier through the golden rings of the Chime Garden.',
  race: 'Meet the racers at the gate in Sailtown, and win.',
  goodbye: "Say goodbye at Whale's Rest.",
  whale: 'Ride the whale down to the Overgrown Garden.',
};

/** The three steps of the Sky Races, for the goal meter. */
export const SKY_METER = 'Sky Races';

/** Small notes. */
export const SKY_NOTE = {
  stall: 'The baker at the striped stall presses a warm honey pastry into your hands. <i>For luck!</i>',
  sketch: 'A new page in your sketchbook. <b>B</b>',
};

export const SKY_PROMPT = {
  stall: 'Say hello at the pastry stall',
  sketch: 'Sit and sketch the view',
  sketchAgain: 'Sit and sketch the view again',
};

/** Viewpoints with an easel: where Nilo sits and sketches (lat, off in metres on the islands). */
export const SKY_VIEWPOINTS = [
  { id: 'vp-sky-parade', isle: 'landing', at: [22, 9], look: ['sailtown', 52, 6], label: 'Race day. Kites over every roof in Sailtown.' },
  { id: 'vp-sky-chimes', isle: 'chime', at: [96, 8], look: ['chime', 110, -4], label: 'The golden rings of the Chime Garden, humming in the wind.' },
  { id: 'vp-sky-whale', isle: 'whales', at: [168, 6], look: ['whales', 178, 18], label: "Whale's Rest, where the whales come up to watch." },
] as const;

/** The keeper's letter in the Sky Isles: its first line answers what Nilo wrote back from the Spring Peaks. */
export const SKY_LETTER = {
  id: 'letter:2',
  from: 'Brought by the postman, by balloon, in Sailtown',
  answers: {
    to: 'letter:1',
    by: {
      'Who are you?': 'Who am I? Someone who used to fly kites, a long time ago. Ask me again when you are nearer.',
      'Hollo says hello.': 'Tell Hollo hello back. I could hear the snow melting from here.',
      'I will follow the water.': 'Good. The water is never in a hurry, and it never gets lost.',
      '': 'You did not write back. That is all right. Letters are slow up here.',
    } as Record<string, string>,
  },
  lines: [
    'The islands are proud and windy and kind. They will not lend you a kite, but they will help you make one.',
    'Win if you can. And if you can\'t, fly anyway. Someone up here needs a friend more than a race.',
  ],
  sign: 'the one who keeps the light',
};

/** The swap chain of race day: a pastry, a feather, a chime, a streamer, and round again. */
export const SKY_TRADES: { npc: string; want: string; give: string; line: string }[] = [
  { npc: 'mender', want: 'item:pastry', give: 'item:feather', line: "Honey pastry! My favourite. Take this gull feather. Best quill there is." },
  { npc: 'chimer', want: 'item:feather', give: 'item:chime', line: 'A gull feather! Perfect for dusting chimes. Here, a little one of my own.' },
  { npc: 'granwren', want: 'item:chime', give: 'item:streamer', line: 'A chime for my cane! Now they will hear me coming. Have my old streamer.' },
  { npc: 'lark', want: 'item:streamer', give: 'item:pastry', line: "Gran Wren's streamer? From when she won? I'll swap you my pastry for it!" },
];
