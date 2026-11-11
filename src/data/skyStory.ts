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
  frame: "Climb the rope up the big windmill for the frame",
  cloth: "Ask the sail-mender on his island for sailcloth",
  laundry: "Catch Old Fenn's laundry before it blows away",
  laundryBack: 'Bring the washing back to Old Fenn',
  string: 'Ask the chime-maker in the Chime Garden for string',
  chime: "Turn the sour chime's weight until it sings true",
  chimeBack: 'Tell Pell the chime sings true',
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
  /** A hidden sketch spot found (n of all of them). */
  sketchFound: (n: number, of: number) => `A sketch for the sketchbook (<b>K</b>). <i>Hidden views of the Sky Isles: ${n} of ${of}.</i>`,
};

export const SKY_PROMPT = {
  stall: 'Say hello at the pastry stall',
  sketch: 'Sit and sketch the view',
  sketchAgain: 'Sit and sketch the view again',
};

/**
 * The two hidden sketch spots: off every path, never on the compass or the goal line, each by a little easel at an
 * island's lip with a view worth sitting down for. Place: on island `isle`, `ang` radians round its outline (its own
 * frame), `inset` metres in from the lip. The view: toward island `look`'s centre, `lookY` metres above its top;
 * `side` puts Nilo on the left (1) or right (-1) third of the frame.
 */
export const SKY_VIEWPOINTS = [
  { id: 'vp-sky-mill', isle: 'sailtown', ang: 0.9, inset: 2.6, look: 'windmill', lookY: 5, side: 1,
    label: 'The big windmill on its own little island, and the rope bridges stepping home across the clouds.' },
  { id: 'vp-sky-rings', isle: 'mender', ang: -0.3, inset: 1.9, look: 'chime', lookY: 3, side: -1,
    label: "The Chime Garden's golden rings, and a castle far out on the cloud sea." },
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

/** Phase 4: the kite parts (frame, sailcloth, string), Fold's wing, the fox, the kite put together. */
export const SKY_PARTS_WORDS = {
  frameGot: 'At the very top of the windmill, tied to the balcony rail: a kite frame! Nilo unties it.',
  foldWing: 'Fold watches the kites. Then he folds himself, crease by crease, into a paper glider. A wing just big enough for one.',
  foldHow: 'Now Nilo can glide. Jump off somewhere high, and hold Space: Fold opens under him and carries him.',
  glideTeach: 'You can glide now. Climb back down the rope, or jump off and glide.',
  glideCard: '<b>Gliding</b> &nbsp; Jump off an edge and <b>hold Space</b> &nbsp;&middot;&nbsp; <b>Left / Right</b> to turn &nbsp;&middot;&nbsp; <b>Up / Down</b> to rise and sink &nbsp;&middot;&nbsp; let go of Space to land',
  partGot: (n: number) => n >= 3 ? 'All three kite parts! <i>Take them to Lark in Sailtown.</i>' : `A kite part, ${n} of 3.`,
  caught: (name: string, n: number) => `Caught: <b>${name}</b>. <i>${n} of 3.</i>`,
  laundryDone: "That's all of Old Fenn's washing. <i>Take it back to him.</i>",
  chimePrompt: "Turn the sour chime's weight",
  chimeSour: [
    'The chime rings, a little sour. The golden ring answers, true. <i>Closer.</i>',
    'Closer. The two notes almost hum together.',
  ],
  chimeTrue: 'The chime and the ring sing the same note, and the whole garden hums. <i>Tell Pell.</i>',
  fox1: 'Look, on the little island! A fox, all tangled in somebody\'s kite string!',
  fox2: "Bounce across on the cloud pads. Be gentle with her. I'll watch from here.",
  build: [
    { who: 'Gran Wren', text: 'Frame first. Spine straight, spar square. Good.' },
    { who: 'Lark', text: "Now the cloth. Pull it tight as a drum. Fenn's cloth never tears." },
    { who: 'Lark', text: "And Pell's string, with three knots. One for luck, two for luck, three for luck." },
    { who: 'Gran Wren', text: "There. Not a toy, little one. A wing. Fly it like you mean it." },
  ],
  built: 'Fold slips into the new frame, and the kite is Fold, and Fold is the kite.',
};

/** Phases 5 and 6: the qualifier rings and the Sky Race. */
export const SKY_RACE_WORDS = {
  qualTitle: 'Qualifier',
  raceTitle: 'Sky Race',
  qualPrompt: 'Fly the qualifier',
  racePrompt: 'Line up for the Sky Race',
  missed: 'A ring flown past. <i>That note is lost, but keep going.</i>',
  qualAgain: (n: number, of: number) => `${n} of ${of} rings so far. <i>They stay rung: fly again for the rest.</i>`,
  qualClean: 'Six rings, six notes: the whole festival song, ringing round the garden.',
  qualDone: (n: number) => `${n} rings. Enough for a racer's ribbon!`,
  qualCard: "<b>Qualifier</b> &nbsp; Fly through all six rings, in order &nbsp;&middot;&nbsp; follow the <b>glowing</b> one &nbsp;&middot;&nbsp; <b>Left / Right</b> to turn &nbsp;&middot;&nbsp; <b>Up / Down</b> to rise and sink",
  ringGot: (n: number, of: number) => n < of ? `Ring ${n}! <i>Now ring ${n + 1}: follow the glow.</i>` : `Ring ${n}! That's all of them!`,
  ringNext: (n: number, of: number) => `next: ring ${n} of ${of}`,
  turnBack: (n: number) => `Ring ${n} is behind you. <i>Turn round for it: it waits for you.</i>`,
  ribbonZephy: "Not bad. For a beginner. Here, a racer's ribbon. See you at the gate.",
  showoff1: "Watch. This is how a champion does it. Don't blink.",
  showoff2: 'Six rings, in order, round the garden. Your turn. Follow the glowing one.',
  start1: 'Racers! One loop, all six islands, every ring on the way. The gate is the finish.',
  start2: "Good luck, beginner. You'll need all of it.",
  go: 'Three... two... one... FLY!',
  shortcut: 'Through the waterfall! The spray throws you forward.',
  gust: 'The last gust, from below! It lifts you and flings you on.',
  lost: "Zephy's red scarf crosses the line first. Again.",
  wren1: "Ha! You were close, little one. Closer than anyone's been in three years.",
  wren2: 'The waterfall, remember. And be low when the last gust comes. Again!',
  again: 'Line up at the gate to race again, whenever you like.',
};

/** Phase 7: the finish, the goodbye at Whale's Rest, and the whale ride down. */
export const SKY_FINISH_WORDS = {
  chimes: 'Every chime on every island rings at once. Streamers fly from every roof.',
  zephyLost: "...You beat me. Nobody beats me. ...Fine. That was a good race.",
  larkWon: "You WON! The whale is coming up at Whale's Rest. Come on!",
  toRest: "<i>Go to Whale's Rest. Everyone is waiting.</i>",
  whaleRises: 'Beside the lip of the island, slow as a cloud, a whale comes up out of the white.',
  zephy1: 'Here. Shake. ...Champion.',
  zephy2: "Next year I'm winning. But that was the best race I ever lost.",
  wren1: 'One tip for the road, little one. When you fall, fall forward.',
  wren2: 'And come back to see an old woman. The races are always on.',
  lark1: "I'll miss you. You and Fold and the fox. And how you laugh when you fall.",
  lark2: 'Take my scarf. So you remember the wind up here. Wave when you fly past!',
  kept: "Kept from the Sky Isles: Lark's yellow scarf, the skill of gliding, and a friend.",
  wave: 'Everyone on the island is waving. Lark waves with both arms.',
  dive: 'The whale dives, down through the clouds, toward the green lands below.',
};
