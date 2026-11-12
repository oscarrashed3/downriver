// World 3, the Walking Town: the keeper's letter (brought by the postman on a big white bird), the swap chain
// round the village, and the two hidden sketch spots.

/** The keeper's letter in the Walking Town: its first line answers what Nilo wrote back from the Sky Isles. */
export const TOWN_LETTER = {
  id: 'letter:3',
  from: "Brought by the postman, on a big white bird, to Old Amble's back",
  answers: {
    to: 'letter:2',
    by: {
      "I'm building a kite.": 'You built your kite. I saw it from here, a little speck over the clouds, and I clapped.',
      'Who needs a friend?': 'You found out who needed a friend. You usually do.',
      'I will fly anyway.': 'You flew anyway. Of course you did.',
      '': 'No letter back from the islands. The wind took it, I expect. It does that.',
    } as Record<string, string>,
  },
  lines: [
    'The town on the hill\'s back has been standing still a long time. Nobody there remembers how to hurry, and nobody needs to.',
    'When it walks again, walk with it. And when it shows you the Sea, go on. I am a little nearer now than I was.',
  ],
  sign: 'the one who keeps the light',
  replies: ['Old Amble walks again!', 'Pip says hello.', 'Are you near?'],
};

export const TOWN_POSTMAN = {
  arrive: "A great white bird comes gliding in over the meadow and lands on Old Amble's antlers. Someone very small in a green coat is riding on its back.",
  down: 'It drops off the antlers, wide wings and all, and glides down to Nilo.',
  hand: "Post! Hold tight, it's a bumpy road up here. Lovely moss, though.",
  after: 'He taps the bird twice. It lifts off, slow and wide, and is gone over the meadow.',
  got: 'A letter, in your bag. <b>B</b>, then <i>Letters</i>, to read it again and write back.',
};

/** The swap chain round the village: a loaf, a ball of wool, a jar of honey, a trowel, a posy, and round again. */
export const TOWN_TRADES: { npc: string; want: string; give: string; line: string }[] = [
  { npc: 'moss2', want: 'item:loaf', give: 'item:wool', line: 'A warm loaf! My hands are cold from the loom. Have a ball of wool. Moss-green, my best.' },
  { npc: 'moss1', want: 'item:wool', give: 'item:honey', line: 'Wool! My bees will have the warmest hive on the hill. Take a jar of their honey.' },
  { npc: 'moss5', want: 'item:honey', give: 'item:trowel', line: 'Honey, for my sore throat. Here, my old trowel. It has dug more moss than anyone.' },
  { npc: 'bramwyn', want: 'item:trowel', give: 'item:posy', line: 'My old trowel! I lent it out in the spring. Have a posy from the crown. Moss flowers, very rare.' },
  { npc: 'moss3', want: 'item:posy', give: 'item:loaf', line: 'Moss flowers! For the bakery window. Have another loaf, then. Mind, it is hot.' },
];

export const TOWN_SWAP = {
  prompt: 'Say hello at the bakery window',
  got: 'The baker leans out of the bakery window and gives you a warm loaf. <i>Someone up here is always hungry.</i>',
};

/**
 * The two hidden sketch spots on Old Amble: off every path, never on the compass or the goal line, each given away
 * only by a little easel. One high in the antlers, one at the tail end of the shell, looking back over the meadow.
 */
export const TOWN_VIEWPOINTS = [
  { id: 'vp-town-antlers', label: "From high in Old Amble's antlers: the long neck, the village on its back, and the meadow going on for ever." },
  { id: 'vp-town-tail', label: 'From the tail end of the shell, looking back over the golden meadow at the path Old Amble walks.' },
] as const;

export const TOWN_SKETCH = {
  prompt: 'Sit and sketch the view',
  again: 'Sit and sketch the view again',
  found: (n: number, of: number) => `A sketch for the sketchbook (<b>K</b>). <i>Hidden views of the Walking Town: ${n} of ${of}.</i>`,
  climbUp: 'Climb up into the antlers',
};
