// World 3, the Walking Town: the words of moving about on Old Amble (prompts and first-time hints).
export const TOWN_MOVE = {
  ropeUp: 'Climb the rope up to the walk',
  ladderUp: 'Climb the rope ladder up to the walk',
  ropeDown: 'Climb down the rope to the meadow',
  ladderDown: 'Climb down the rope ladder to the meadow',
  ropeHint: 'Hold <b>W</b> to climb, <b>S</b> to go down. Let go to hang on and rest.',
  umbrellaHint: 'Fold opens into a paper umbrella, and you float down into the long grass.',
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
  walk: 'Old Amble is walking again. Ride along.',
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
