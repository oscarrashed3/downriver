// Story text for the opening and Chapter One. All player-facing words live in data files.
// Keep every line under 110 characters, and never more than two lines on screen at once.

export const LETTER = 'Follow the water. It always finds its way home.';

export const CHAPTERS = [
  { n: 'Chapter One', title: 'Where the Water Begins' },
  { n: 'Chapter Two', title: 'The Ember Pines' },
  { n: 'Chapter Three', title: 'The Green Deep' },
  { n: 'Chapter Four', title: 'The Glass Desert' },
  { n: 'Chapter Five', title: 'Aquila' },
  { n: 'Chapter Six', title: 'The Endless Sea' },
];

export const MAIN_QUEST = 'Go home, to the light below the clouds.';

export const OPENING = {
  lookDown: 'Look down.',
  homeLight: 'Far below the clouds, one small light is blinking. Somehow, you know it is home.',
  firstStep: 'The river is too thin to carry you. Find out why.',
  walkHint: '<b>W A S D</b> walk &nbsp; <b>Shift</b> run &nbsp; <b>Mouse</b> look',
};

export const CAMPFIRE: { who: string; text: string }[] = [
  { who: 'Ysolde', text: 'When I was a girl, the snow reached our windows. We tunneled to school like moles.' },
  { who: 'Bram', text: 'My father talked to goats more than people. I thought he was strange. Now I understand.' },
  { who: 'Nima', text: 'Once a cloud came down so low I walked right into it. It smelled like rain and pennies.' },
  { who: 'Tor', text: "Grandpa said kites aren't about flying. They're about holding on and letting go at once." },
  { who: 'Odo', text: 'Everyone who crosses my bridge leaves something behind. A song, a story, a bad joke.' },
];

export const WINTER_LINES = [
  'Winter comes. The wind howls over the ridges, and this time the snow stays.',
  'Spring comes. The spring wakes, cold and bright, and the river finds its voice.',
];

export const FAREWELL: { who: string; text: string }[] = [
  { who: 'Ysolde', text: 'Go on, then. The spring remembers everyone who drinks from it.' },
  { who: 'Bram', text: "Don't take any wrong roads. And if you're not sure, ask first." },
  { who: 'Nima', text: "I'll name a cloud after you. A big one, with a lantern." },
  { who: 'Tor', text: "You'll come back, right? Rivers always come back. As rain." },
  { who: 'Odo', text: 'Hold on tight. The edge is the best part.' },
];

export const KITE_GIFT = "Wait! Your boat can be a kite too. If you ever need to come back up, ride the warm air.";

export const KITE_FLIGHT = [
  'Okay. Okay okay okay.',
  'Hold the bottom. When I say now, let go.',
  'Now!',
  "It's flying. It's really flying!",
  "I'm not scared. Well, a bit. But I'm up here.",
];

/** The keepsake flashback: four painted panels, about five seconds each. */
export const KEEPSAKE = {
  title: 'A memory comes back',
  panels: [
    'A stream behind a house, the summer you were small.',
    '"Hold it gently," your grandmother says. "Cut away from you."',
    'It floats. The little wooden boat actually floats.',
    '"Let it go," she laughs. "It knows the way."',
  ],
  after: 'In your satchel, where nothing was before, there is a small carved wooden boat.',
};

export const ECHOES = [
  'Someone is humming beside a stream. You know the tune before it ends.',
  '"Every river is in a hurry to get home," a voice laughs. "Even when home moves."',
  'Small hands, wet sleeves. A paper boat, folded badly, sinking. Someone helps you fold it again.',
  '"You\'ll go far one day," the voice says. It doesn\'t sound sad. It sounds proud.',
  'Ink on a thumb. A letter, folded into a boat, pushed gently out onto the water.',
];

export const NOT_YET = {
  thinRiver: 'The river is too thin to carry Fold. It scrapes along the stones.',
  edgeEarly: 'Far below, the home light blinks. But the river is too thin to carry you yet.',
  winterEarly: "Not yet. The wind would still strip the ridges bare. Help the snow stay first.",
};
