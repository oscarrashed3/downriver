// Story text for the opening and Chapter One. All player-facing words live in data files.
// Keep every line under 110 characters, and never more than two lines on screen at once.

export const LETTER = 'Nilo. Follow the water. It always finds its way home. But someone up here needs you first.';

export const CHAPTERS = [
  { n: 'Chapter One', title: 'Where the Water Begins' },
  { n: 'Chapter Two', title: 'The Ember Pines' },
  { n: 'Chapter Three', title: 'The Green Deep' },
  { n: 'Chapter Four', title: 'The Glass Desert' },
  { n: 'Chapter Five', title: 'Aquila' },
  { n: 'Chapter Six', title: 'The Endless Sea' },
];

export const MAIN_QUEST = 'Go home, to the light below the clouds.';

export const TITLE = 'The Light Below the Clouds';

export const OPENING = {
  storm: [
    'The storm came out of nowhere.',
    'Somewhere in the lightning, someone with a lantern was watching.',
    'Then the wind took you, and the sky turned over.',
  ],
  lookDown: 'Look down.',
  homeLight: 'Far below the clouds, one small light is blinking. Somehow, you know it is home.',
  firstStep: 'The river is too thin to carry you. Find out why.',
  walkHint: '<b>W A S D</b> walk &nbsp; <b>X</b> run &nbsp; <b>Mouse</b> look',
};

export const CAMPFIRE: { who: string; text: string }[] = [
  { who: 'Ysolde', text: 'When I was a girl, the snow reached our windows, and Hollo walked up the valley every spring.' },
  { who: 'Bram', text: 'My father slept beside him once. He said Hollo snores like a bear with a cold.' },
  { who: 'Nima', text: "Big Marguerite is right above us now. Don't look. She's shy." },
  { who: 'Tor', text: "Grandpa said kites aren't about flying. They're about holding on and letting go at once." },
  { who: 'Odo', text: 'Tea. Nobody sleeps through tea. Not even a mountain.' },
];

export const WINTER_LINES = [
  'The snow comes. It piles behind the fences on every ridge, and this time it stays.',
  'The night is long. Nobody leaves. Hollo breathes a little faster.',
];

export const DAWN_LINES = [
  'At first light, something very big opens its eyes.',
  'Hollo looks at you for a long moment. Then he stands, shakes off the night, and walks home to the peaks.',
  'Under him, the spring wakes, cold and bright. The river finds its voice.',
];

export const FAREWELL: { who: string; text: string }[] = [
  { who: 'Ysolde', text: 'Go on, then. The spring remembers everyone who drinks from it.' },
  { who: 'Bram', text: "Don't take any wrong roads. And if you're not sure, ask first." },
  { who: 'Nima', text: "I'll name a cloud after you. A big one, with a lantern." },
  { who: 'Tor', text: "You'll come back, right? Rivers always come back. As rain." },
  { who: 'Odo', text: 'Hold on tight. The edge is the best part.' },
];

/** The send-off: the boat pushes away from the bridge, and everyone lets a paper lantern go. */
export const SENDOFF = {
  push: 'Odo unties the rope. The river takes the boat gently, as if it had been waiting.',
  lanterns: 'Along the bank, one by one, they light paper lanterns and let them go.',
  hollo: 'Far up the valley, Hollo hums. The lanterns rise on his breath.',
};

/** The postman drops out of the sky with the first letter from the light keeper. */
export const POSTMAN = {
  arrive: 'Something green comes tumbling down the sky. An umbrella. Under it, a very small postman.',
  hand: 'He bows, hands you a letter, and checks your name against nothing at all.',
  letter: [
    'You woke him. I knew you would.',
    'The water goes down now, and so do you. The pines below are thirsty, and they are afraid of fire.',
    'I am always one valley ahead. Do not try to catch me. Just follow the water.',
  ],
  sign: '— the one who keeps the light',
  after: 'The postman opens his umbrella, steps off the bridge, and floats away. He will be back.',
};

export const KITE_GIFT = "Wait! Your boat can be a kite too. If you ever need to come back up, ride the warm air.";

export const KITE_FLIGHT = [
  'Okay. Okay okay okay.',
  'Hold the bottom. When I say now, let go.',
  'Now!',
  "It's flying. It's really flying!",
  "I'm not scared. Well, a bit. But I'm up here.",
  "Now the snow. Bram, the goat man, has Grandpa's rails. West end of the village.",
];

export const ECHOES = [
  'The stone hums a tune somebody whistled here, long ago, waiting for the snow.',
  '"Every river is in a hurry to get home," a voice laughs. "Even when home moves."',
  'Rain, and a lantern swinging. Footsteps that never stop, always one valley ahead.',
  'Two children and a kite, a very long time ago. One of them is Tor\'s grandfather.',
  'Ink on a thumb. A letter, folded into a boat, pushed gently out onto the water.',
];

export const NOT_YET = {
  thinRiver: 'The river is too thin to carry Fold. It scrapes along the stones.',
  edgeEarly: 'Far below, the home light blinks. But the river is too thin to carry you yet.',
  winterEarly: 'Not yet. Light the three lanterns first: the wind, the fences, and the long night.',
  notGathered: 'Ysolde keeps the fire. Bring everyone here before the snow comes.',
};
