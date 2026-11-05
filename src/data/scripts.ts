import type { Script } from '../systems/connection';

// All player-facing words live in data, so they can be translated later.
// Keep every line to two short lines on screen.

export const SCRIPTS: Record<string, Script> = {
  ysolde: {
    id: 'ysolde', name: 'Ysolde', title: 'the Ice Listener',
    start: { trust: 0.32, worry: 0.6, openness: 0.3 },
    hint: 'Ysolde speaks slowly. She seems to want someone who listens all the way through.',
    nodes: [
      { type: 'branch', ifFlag: 'peaks-healed', then: [
        { type: 'say', text: 'Did you see? This winter I carved my stone farther down the valley.' },
        { type: 'say', text: 'First time in my life the ice came back toward us.' },
        { type: 'silence', seconds: 2.2, reward: 'My mother would have laughed out loud. So I did it for her.' },
        { type: 'give', items: ['journal:stone-returns'] },
      ], else: [
        { type: 'say', text: 'Another traveler. They all climb up here for the view.' },
        { type: 'say', text: 'Never for the stones.' },
        { type: 'say', text: 'Every winter I carve one. Each marks where the ice ended that year.' },
        { type: 'silence', seconds: 2.6, reward: 'My mother carved the first one. Back then, the ice touched our door.' },
        { type: 'ask', cards: [
          { kind: 'open', text: 'What do the stones tell you?', reply: ['That the ice is walking away from us.', 'A little farther every year.'] },
          { kind: 'leading', text: 'So the ice melts because of people, right?', reply: ['You came with your answer already.', "Then you don't need my stones."] },
          { kind: 'judging', text: 'Why carve stones instead of doing something?', reply: ['Carving is how I remember.', 'Remembering is doing something.'] },
        ] },
        { type: 'say', text: "Snow is the mountain's water jar. Winter fills it." },
        { type: 'say', text: "Summer pours it out slowly. That's our spring." },
        { type: 'say', text: 'Less snow, thinner spring. Thinner spring, thirstier river.' },
        { type: 'silence', seconds: 2.2, reward: 'All the way down to the sea. Everyone below drinks what we keep up here.' },
        { type: 'ask', cards: [
          { kind: 'open', text: 'What would help the snow stay?', gives: ['flag:knows-fences'],
            reply: ['The wind steals it off the ridges and throws it into the sky.', "Herders used to build fences so it would drop. But you'd need to see the wind."] },
          { kind: 'open', text: 'How did people keep water here before?', gives: ['flag:knows-stupas'],
            reply: ['My grandmother froze winter water into tall cones of ice.', 'They melt slowly, right when the spring needs them most.'] },
          { kind: 'leading', text: "Can't we just make it snow more?", reply: ['Ha. If you find the lever, tell me.'] },
        ] },
        { type: 'gate', minTrust: 0.48, fail: ['The light is going.', "Come back when you've learned to sit with a stone."], pass: [
          { type: 'say', text: 'Here. Look up, and breathe slowly.' },
          { type: 'say', text: 'Watch how the air moves. The sky is always telling you something.' },
          { type: 'give', items: ['power:skyreading', 'map:valley', 'journal:snow-jar', 'flag:knows-fences', 'quest:snowpack'] },
          { type: 'say', text: 'If you build ice cones, ask Bram first. Winter water feeds his meadow.' },
        ] },
      ] },
    ],
    after: ['The stones are patient. So am I.', 'Watch the wind on the ridges. It shows you where snow wants to fall.'],
  },

  bram: {
    id: 'bram', name: 'Bram', title: 'the Goatherd',
    start: { trust: 0.45, worry: 0.7, openness: 0.4 },
    hint: 'Bram keeps glancing at his goats. Maybe ask him what worries him.',
    nodes: [
      { type: 'branch', ifFlag: 'stupa-without-asking', then: [
        { type: 'say', text: "You took my meadow's winter water for your ice towers." },
        { type: 'say', text: 'Nobody asked me. Nobody ever asks the goats either.' },
        { type: 'ask', cards: [
          { kind: 'apology', text: "I'm sorry. I should have asked you first.", gives: ['flag:bram-forgiven', 'flag:asked-bram'],
            reply: ['...Well. You asked now, in a way.', 'The spring needed it. Just leave the low channel to us.'] },
          { kind: 'neutral', text: 'The spring needed it more.', reply: ['Maybe. My goats needed it too.'] },
        ] },
      ] },
      { type: 'say', text: 'Careful, the goats bite. Only the brown one, really.' },
      { type: 'say', text: 'Soon I move them up to the summer pasture.' },
      { type: 'say', text: 'Two roads up. The east road is short and pretty. The west road is long.' },
      { type: 'ask', cards: [
        { kind: 'open', text: 'What worries you about the roads?', gives: ['quest:route'],
          reply: ['Some years snow piles up on the east slope.', 'When it gets heavy, the whole slope can let go.'] },
        { kind: 'open', text: 'What do the goats need the meadow for?', gives: ['flag:knows-meadow'],
          reply: ['Its winter water keeps the grass alive under the snow.', 'Without it, they go hungry by spring.'] },
        { kind: 'judging', text: 'Just take the short road, surely?', reply: ["Says someone who's never dug a goat out of the snow."] },
      ] },
      { type: 'ask', cards: [
        { kind: 'open', text: 'Could some winter water go into ice cones for the spring?', requires: ['flag:knows-stupas'], hiddenIf: ['flag:asked-bram'], gives: ['flag:asked-bram'],
          reply: ['Take it from the high channel, not the low one.', 'My goats can share, if the spring comes back stronger.'] },
        { kind: 'neutral', text: 'Good luck with the goats.', reply: ['Luck is for people without goats.'] },
      ] },
      { type: 'branch', ifFlag: 'power:skyreading', then: [
        { type: 'say', text: 'You have the look of someone who reads the sky.' },
        { type: 'ask', cards: [
          { kind: 'neutral', text: 'Take the west road. The wind is loading the east slope.', hiddenIf: ['flag:route-chosen'], gives: ['flag:route-west', 'flag:route-chosen', 'journal:wind-loading', 'map:pasture'],
            reply: ['West it is. Long, but we all arrive.', 'Here, my map of the pastures. Fair trade.'] },
          { kind: 'neutral', text: 'The east road looks fine to me.', hiddenIf: ['flag:route-chosen'], gives: ['flag:route-east', 'flag:route-chosen', 'map:pasture'],
            reply: ['East, then. Quick as we can.', 'Take my pasture map, in case we get separated.'] },
          { kind: 'neutral', text: 'Nothing new to tell you.', reply: ['Then sit a while. The goats like company.'] },
        ] },
      ], else: [{ type: 'say', text: 'If only I knew what the wind was doing up there.' }] },
    ],
    after: ['The goats send their regards. Mostly the brown one.'],
  },

  nima: {
    id: 'nima', name: 'Nima', title: 'who listens to the chimes',
    start: { trust: 0.55, worry: 0.3, openness: 0.6 },
    hint: 'Nima hushed you. Maybe stay quiet a little longer next time.',
    nodes: [
      { type: 'say', text: 'Shh. Listen to the chimes.' },
      { type: 'silence', seconds: 2.6, reward: 'They sound lower every year. Grandpa says the icicles are getting shorter.' },
      { type: 'ask', cards: [
        { kind: 'open', text: 'What do you think it means?', gives: ['item:bottle', 'quest:cloud'], reply: ['Less ice. Less cold. Less snow?', 'I want to catch a cloud and look inside one.'] },
        { kind: 'leading', text: "It means it's getting warmer, doesn't it?", gives: ['item:bottle', 'quest:cloud'], reply: ['Probably. You sound like the grown-ups.'] },
      ] },
      { type: 'say', text: 'Here, take a bottle. Clouds sleep on the tall peak, east of the river.' },
      { type: 'gate', minTrust: 0.4, fail: ['...'], pass: [{ type: 'give', items: ['map:chimes'] }] },
    ],
    after: ['Did you catch one? What does a cloud feel like?'],
  },

  tor: {
    id: 'tor', name: 'Tor', title: 'who measured the snow',
    start: { trust: 0.5, worry: 0.45, openness: 0.5 },
    nodes: [
      { type: 'say', text: 'For forty winters I measured the snow at the old poles.' },
      { type: 'say', text: 'My knees retired before I did.' },
      { type: 'ask', cards: [
        { kind: 'open', text: 'What did the poles show you?', gives: ['quest:markers'],
          reply: ['Go and read them yourself. Three poles, striped every half meter.', 'Numbers you find mean more than numbers you are told.'] },
        { kind: 'judging', text: 'Does measuring snow really matter?', gives: ['quest:markers'], reply: ['Ask the river in August.', 'There are three poles. Go and read them.'] },
      ] },
      { type: 'give', items: ['map:poles'] },
    ],
    after: ['Read all three poles? Write it down. Always write it down.'],
  },

  // ---- Journey sketch keepers ----
  tamsin: {
    id: 'tamsin', name: 'Tamsin', title: 'the Fire Watcher',
    start: { trust: 0.4, worry: 0.7, openness: 0.4 },
    nodes: [
      { type: 'branch', ifFlag: 'peaks-healed', then: [{ type: 'say', text: 'The river came down stronger this year. The pines can drink. Was that you?' }],
        else: [{ type: 'say', text: 'The river is thin this year. The pines are thirsty, and thirsty pines burn.' }] },
      { type: 'say', text: 'Fire took my house three summers ago. So now I watch.' },
      { type: 'say', text: 'The village wants every spark gone. But some pinecones only open in fire.' },
      { type: 'give', items: ['map:pines', 'met:tamsin'] },
    ],
    after: ['Walk on, little lantern. The forest will still be here when you come back to learn it.'],
  },
  oro: {
    id: 'oro', name: 'Oro', title: 'the Root Weaver',
    start: { trust: 0.5, worry: 0.6, openness: 0.5 },
    nodes: [
      { type: 'say', text: 'The terraces used to stay green all year.' },
      { type: 'say', text: 'Then we cut the forest to grow just one crop.' },
      { type: 'say', text: 'Now every rain washes the hills away. See the river? Brown as tea.' },
      { type: 'silence', seconds: 2, reward: 'Roots are hands holding the hill. We let go.' },
      { type: 'give', items: ['map:deep', 'met:oro'] },
    ],
    after: ['Come back with patient hands. Hills are slow to forgive.'],
  },
  sefa: {
    id: 'sefa', name: 'Sefa', title: 'the Sand Cartographer',
    start: { trust: 0.5, worry: 0.5, openness: 0.5 },
    nodes: [
      { type: 'say', text: "Don't trust my maps. The dunes move every night." },
      { type: 'say', text: 'Sahra moves too. Mirrors catch the sun by day, windmills the wind by night.' },
      { type: 'say', text: 'But when the wind sleeps, the lights go out. And the wells are drying.' },
      { type: 'give', items: ['map:desert', 'met:sefa'] },
    ],
    after: ['I drew you in the corner of a map. Small, with a lantern.'],
  },
  cassian: {
    id: 'cassian', name: 'Cassian', title: 'the last aqueduct engineer',
    start: { trust: 0.4, worry: 0.7, openness: 0.4 },
    nodes: [
      { type: 'say', text: 'Welcome to Aquila. Mind the canals, they flood.' },
      { type: 'say', text: 'I built half these aqueducts. Nobody remembers how they work.' },
      { type: 'say', text: "In the forum they argue about higher walls. Walls won't drink a flood." },
      { type: 'give', items: ['map:aquila', 'met:cassian'] },
    ],
    after: ['The marsh outside the walls used to drink the floods. Remember that.'],
  },
  maren: {
    id: 'maren', name: 'Maren', title: 'the Salt Keeper',
    start: { trust: 0.5, worry: 0.7, openness: 0.5 },
    nodes: [
      { type: 'say', text: 'You carried that drop all the way down?' },
      { type: 'say', text: 'The sea is rising. There is salt in our wells now.' },
      { type: 'say', text: 'My family has to choose: stay, or go. There is no right answer.' },
      { type: 'say', text: 'Go to the lighthouse at the end of the marsh. The sea has been waiting for you.' },
      { type: 'give', items: ['map:sea', 'met:maren'] },
    ],
    after: ['Go on. The lighthouse is at the very end of the river.'],
  },
};
