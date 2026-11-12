// World 3, the Walking Town: the words of moving about on Old Amble (prompts and first-time hints).
export const TOWN_MOVE = {
  ropeUp: 'Climb the rope up to the walk',
  ladderUp: 'Climb the rope ladder up to the walk',
  ropeDown: 'Climb down the rope to the meadow',
  ladderDown: 'Climb down the rope ladder to the meadow',
  ropeHint: 'Hold <b>W</b> to climb, <b>S</b> to go down. Let go to hang on and rest.',
  umbrellaHint: 'Fold opens into a paper umbrella, and you float down into the long grass.',
  noExit: 'Not this way. Old Amble is walking: ride along, and see where it takes you.',
  sea: 'Wade out into the Sea',
};

// the goal line, step by step (Pip first, then the three things that keep Amble standing still)
export const TOWN_GOALS = {
  pip: 'Talk to Pip, the kid in the straw hat.',
  tamsin: 'Find Tamsin the Ropewright, by the big rope on the front leg.',
  foot: "Climb down the rope to Amble's sore front foot.",
  pull: 'Climb back up. Pull the stone out with Tamsin and the others.',
  miller: 'Ask the Miller why Amble is so thirsty.',
  sail: "Find the windmill's lost sail. The wind blew it into a garden.",
  fitSail: 'Carry the sail back to the broken windmill.',
  pieces: (n: number) => `Carry channel pieces from the carpenter's yard to the gaps (${n} of 3)`,
  setPiece: (n: number) => `Set the piece into a gap in the channel (${n} of 3)`,
  sluice: 'Open the sluice at the rain pools.',
  bramwyn: "Find Old Bramwyn. The vines have grown over Amble's eyes.",
  head: 'Go out along the neck to Amble\'s head, between the antlers.',
  trim: (n: number) => `Trim the vines from Amble's eyes (${n} of 6)`,
  walk: 'Old Amble is walking again. Ride along, and find Pip up at the lookout.',
  toCoast: 'Old Amble is walking down to the coast. Hold on.',
  sea: 'Wade out into the Sea, when you are ready.',
};

// what you can do, step by step (the prompts by the things themselves)
export const TOWN_DO = {
  foot: "Look at Amble's sore foot",
  pull: 'Pull, all together',
  sail: 'Pick up the lost sail',
  fitSail: 'Fit the sail to the windmill',
  piece: 'Pick up a channel piece',
  setPiece: 'Set the piece into the gap',
  sluice: 'Open the sluice',
  trim: 'Trim the vines',
};

// the lines of the three steps' scenes
export const TOWN_STEP = {
  stone: 'A big, sharp stone, wedged hard between two toes.',
  dig: 'The fox squeezes in beside it and digs, and digs.',
  tie: 'A rope round it, tied tight. Now it wants pulling, from up top.',
  heave: 'Together now. Heave!',
  pop: 'Out it comes!',
  sigh: 'A long, low sigh. The foot comes down, soft as moss.',
  sailOn: 'The sail drops into place. Creak, creak... and the windmill turns.',
  click: 'It clicks right in.',
  flow: 'The water runs, down the channel, round the walk, down the long neck...',
  drink: 'Old Amble drinks, long and deep.',
  bramwynCome: "Come on, then. I'll meet you on the lookout. Bring the fox.",
  snip: 'Snip.',
  blink: 'Old Amble blinks in the sunlight.',
  look: 'And looks right at Nilo.',
  rumble: 'A low, warm rumble, from deep inside.',
  step: 'And then, for the first time in weeks, a step.',
};

// the arrival scene's lines
export const TOWN_LINES = {
  below: 'Far below, through a gap in the clouds: a hill with a village on its back. A hill with legs.',
  fall: 'Fold opens wide. Down through the cloud, slow as a seed.',
  pipCalls: 'Hey! HEY! You came out of the sky!',
};

// the goodbye on the beach
export const TOWN_BYE = {
  arrive: 'Down the last long slope, onto the sand. Old Amble stops where the meadow meets the Sea.',
  bram1: 'A tip, from an old gardener. Moss grows best where nobody hurries it.',
  bram2: 'Wherever you go, look at the faces of things. I waited seventy years to look at one.',
  tamsin1: 'You climbed every rope on this creature, and never once fell off. Well. Once. With an umbrella.',
  tamsin2: 'My best rope. Three days of splicing. It holds a cart, so it will hold a boy.',
  pip1: "I said I'd wave until you were a dot. I still will. But first...",
  pip2: "A sprig of Amble's moss, in a jar. It grows anywhere. So you'll never be far from us.",
  kept: 'Nilo holds the little jar up to the light. The moss inside is warm and green.',
  nose: 'Old Amble lowers its great head, all the way down to him. Nilo touches its nose.',
  shore: 'Down to the water, with Fold and the fox. The waves are small and gold.',
  away: 'And Old Amble turns, slow as moss, and walks back across the meadow. The whole village waves.',
  wade: 'Nilo wades out into the warm shallows. The Sea goes on and on.',
};
