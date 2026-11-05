import type { Script } from '../systems/connection';

// All player-facing words live in data, so they can be translated later.
// Keep every line to two short lines on screen.

export const SCRIPTS: Record<string, Script> = {
  ysolde: {
    id: 'ysolde', name: 'Ysolde', title: 'who keeps the spring',
    start: { trust: 0.32, worry: 0.6, openness: 0.3 },
    hint: 'Ysolde speaks slowly. She seems to want someone who listens all the way through.',
    nodes: [
      { type: 'branch', ifFlag: 'peaks-healed', then: [
        { type: 'say', text: 'I had stopped carrying water up to the spring. This morning I carried a cup.' },
        { type: 'say', text: "Silly. It didn't need my cup anymore." },
        { type: 'silence', seconds: 2.2, reward: 'I think I did.' },
        { type: 'give', items: ['journal:stone-returns'] },
        { type: 'say', text: "Odo will want to see you. He's been folding paper all winter." },
      ], else: [
        { type: 'say', text: 'Another traveler. You came down from the spring?' },
        { type: 'say', text: 'Then you heard it. Barely a whisper now.' },
        { type: 'say', text: "I've kept that spring sixty years. I've stopped expecting it to wake." },
        { type: 'silence', seconds: 2.6, reward: 'My grandmother used to say the spring remembers everyone who drinks from it.' },
        { type: 'ask', cards: [
          { kind: 'open', text: 'Why is the river so thin?', reply: ["Snow is the mountain's water jar. Winter fills it.", "Summer pours it out slowly. That's our spring."] },
          { kind: 'leading', text: "It's because of the warming, isn't it?", reply: ['Maybe. You came with your answer already.', "I'd rather you came with your eyes."] },
          { kind: 'judging', text: "Why didn't anyone fix it?", reply: ['We tried. Then we got old and tired.', 'Tired is not the same as not caring.'] },
        ] },
        { type: 'say', text: 'Less snow, thinner spring. Thinner spring, thirstier river.' },
        { type: 'say', text: 'Now the wind steals the snow off the ridges and throws it into the sky.' },
        { type: 'silence', seconds: 2.2, reward: 'Everyone below drinks what we keep up here. All the way down to the sea.' },
        { type: 'ask', cards: [
          { kind: 'open', text: 'What would help the snow stay?', gives: ['flag:knows-fences'],
            reply: ['My husband built fences on the windy ridges. Snow drops behind them.', "Tor knows where the old posts are. He's afraid to go up there, though."] },
          { kind: 'open', text: 'How did people store water before?', gives: ['flag:knows-stupas'],
            reply: ['My grandmother froze winter water into tall cones of ice.', 'They melt slowly, right when the spring needs them most.'] },
          { kind: 'leading', text: "Can't we just make it snow more?", reply: ['Ha. If you find the lever, tell me.'] },
        ] },
        { type: 'gate', minTrust: 0.48, fail: ["The light's going, and so is my patience.", "Come back when you've learned to sit with someone."], pass: [
          { type: 'say', text: 'Here. Look up, and breathe slowly.' },
          { type: 'say', text: 'Watch how the air moves. The sky is always telling you something.' },
          { type: 'give', items: ['power:skyreading', 'map:valley', 'journal:snow-jar', 'flag:knows-fences', 'quest:snowpack'] },
          { type: 'say', text: "Go up to Kite Ridge, past Odo's bridge, and read the wind. You'll see where the snow goes." },
          { type: 'say', text: 'And if you build ice cones, ask Bram first. His goats drink that water.' },
        ] },
      ] },
    ],
    after: ['The spring remembers everyone who drinks from it.', "Kite Ridge is east, over Odo's bridge. Read the wind up there."],
  },

  bram: {
    id: 'bram', name: 'Bram', title: 'the goatherd',
    start: { trust: 0.42, worry: 0.7, openness: 0.35 },
    hint: 'Bram keeps glancing at the west cliffs. Maybe ask him what he needs.',
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
      { type: 'branch', ifFlag: 'goat-home', then: [
        { type: 'say', text: "Pebble's home. She bit me, so she's fine." },
        { type: 'say', text: "...Thank you. I don't say that much. The goats can confirm." },
      ], else: [
        { type: 'say', text: 'Careful, the goats bite. Only the brown one, really.' },
        { type: 'say', text: 'Outsiders come up here, take our water, take our pictures, and leave.' },
        { type: 'ask', cards: [
          { kind: 'open', text: 'What do you need most right now?', gives: ['quest:goat'],
            reply: ['My smallest goat ran off up the west cliffs.', "She won't come for me. Too stubborn. Like me."] },
          { kind: 'open', text: 'What does the meadow water do?', gives: ['flag:knows-meadow'],
            reply: ['Its winter water keeps the grass alive under the snow.', 'Without it, the goats go hungry by spring.'] },
          { kind: 'judging', text: "You don't like strangers much.", reply: ['I like strangers fine. From a distance.'] },
        ] },
      ] },
      { type: 'ask', cards: [
        { kind: 'open', text: 'Could some winter water go into ice towers for the spring?', requires: ['flag:knows-stupas'], hiddenIf: ['flag:asked-bram'], gives: ['flag:asked-bram'],
          reply: ['Take it from the high channel, not the low one.', "Ask first. That's all anyone wants."] },
        { kind: 'open', text: "Where's your runaway goat?", requires: ['quest:goat'], hiddenIf: ['goat-home'], reply: ['Up the west cliffs, past the dry meadow.', "Walk slow and speak soft. Don't chase her."] },
        { kind: 'neutral', text: 'Good luck with the goats.', reply: ['Luck is for people without goats.'] },
      ] },
      { type: 'branch', ifFlag: 'power:skyreading', then: [
        { type: 'say', text: 'You have the look of someone who reads the sky.' },
        { type: 'ask', cards: [
          { kind: 'neutral', text: 'Take the west road. The wind is loading the east slope.', hiddenIf: ['flag:route-chosen'], gives: ['flag:route-west', 'flag:route-chosen', 'journal:wind-loading'],
            reply: ['West it is. Long, but we all arrive.'] },
          { kind: 'neutral', text: 'The east road looks fine to me.', hiddenIf: ['flag:route-chosen'], gives: ['flag:route-east', 'flag:route-chosen'],
            reply: ['East, then. Quick as we can.'] },
          { kind: 'neutral', text: 'Nothing new to tell you.', reply: ['Then sit a while. The goats like company.'] },
        ] },
      ] },
    ],
    after: ['The goats send their regards. Mostly the brown one.', "Ask first. That's all anyone wants."],
  },

  nima: {
    id: 'nima', name: 'Nima', title: 'who names the clouds',
    start: { trust: 0.5, worry: 0.3, openness: 0.55 },
    hint: 'Nima went quiet. Maybe she wanted to be taken seriously.',
    nodes: [
      { type: 'branch', ifFlag: 'journal:cloud', then: [
        { type: 'say', text: 'You let it rain! On the dry meadow!' },
        { type: 'say', text: 'I named that cloud Pip. Pip did a good job.' },
      ], else: [
        { type: 'say', text: "Shh. Don't move. That one's called Mrs. Fluff." },
        { type: 'say', text: "Everyone thinks I'm just lying around. I'm working." },
        { type: 'silence', seconds: 2.6, reward: 'Clouds drop their snow where the wind slows down. Behind rocks. Behind fences.' },
        { type: 'ask', cards: [
          { kind: 'open', text: 'How do you know where they drop it?', gives: ['flag:knows-lee', 'item:bottle', 'quest:cloud'],
            reply: ['You watch! Nobody watches anymore.', 'Take this bottle. A baby cloud sleeps on the tall peak. Bring it to the dry meadow.'] },
          { kind: 'leading', text: 'Clouds are just water vapor, you know.', gives: ['item:bottle', 'quest:cloud'],
            reply: ["I KNOW. That's not the point.", "Fine. Take this bottle anyway. There's a little cloud on the tall peak."] },
        ] },
        { type: 'gate', minTrust: 0.45, fail: ['...'], pass: [{ type: 'give', items: ['map:chimes'] }] },
      ] },
    ],
    after: ['Nobody watches anymore. Except me. And now you.'],
  },

  tor: {
    id: 'tor', name: 'Tor', title: 'who builds kites',
    start: { trust: 0.5, worry: 0.45, openness: 0.5 },
    hint: 'Tor looks up at the ridge, then quickly away.',
    nodes: [
      { type: 'branch', ifFlag: 'kite-flown', then: [
        { type: 'say', text: 'Did you see it? It went higher than the clouds! Well. Almost.' },
        { type: 'say', text: 'You can see the whole world from up there. I forgot.' },
      ], else: [
        { type: 'branch', ifFlag: 'item:spar', then: [
          { type: 'say', text: "That's a willow branch! Straight as a ruler." },
          { type: 'say', text: 'There. Fixed. Grandpa would say it flies better than before.' },
          { type: 'silence', seconds: 2, reward: "...Will you come up the ridge with me? I don't want to go alone." },
          { type: 'give', items: ['flag:tor-follow'] },
        ], else: [
          { type: 'say', text: "Don't step on the string! ...Sorry. There's no string. It broke." },
          { type: 'say', text: 'This was Grandpa\'s kite. He built the snow fences on the ridges, too.' },
          { type: 'say', text: 'I fell off Kite Ridge last winter. Now I just fix things down here.' },
          { type: 'silence', seconds: 2.4, reward: 'I miss the top. You can see the whole world from there.' },
          { type: 'ask', cards: [
            { kind: 'open', text: 'What happened to the kite?', gives: ['quest:kite'],
              reply: ['The long spar snapped. I need a straight willow branch.', 'The old tree by the spring drops good ones.'] },
            { kind: 'open', text: "Tell me about your grandpa's fences.", gives: ['flag:tor-fences', 'quest:markers'],
              reply: ['His posts are still up there, on the windy side of the ridges.', 'Put up the rails and the snow piles up behind them. Easy. If you go up.'] },
            { kind: 'judging', text: "It's only a little ridge.", reply: ["Says you. You didn't fall off it."] },
          ] },
          { type: 'ask', cards: [
            { kind: 'open', text: "Tell me about your grandpa's fences.", hiddenIf: ['flag:tor-fences'], gives: ['flag:tor-fences', 'quest:markers'],
              reply: ['His posts are still up there, on the windy side of the ridges.', 'Put up the rails and the snow piles up behind them.'] },
            { kind: 'open', text: 'What happened to the kite?', hiddenIf: ['quest:kite'], gives: ['quest:kite'],
              reply: ['The long spar snapped. I need a straight willow branch.', 'The old tree by the spring drops good ones.'] },
            { kind: 'neutral', text: 'See you later, Tor.', reply: ['Mind the string. The invisible one.'] },
          ] },
          { type: 'give', items: ['map:poles'] },
        ] },
      ] },
    ],
    after: ["Grandpa's snow poles are still out there. He measured the snow for forty winters."],
  },

  odo: {
    id: 'odo', name: 'Odo', title: 'who keeps the old bridge',
    start: { trust: 0.55, worry: 0.3, openness: 0.6 },
    nodes: [
      { type: 'branch', ifFlag: 'boat-ready', then: [
        { type: 'say', text: 'Your boat is ready when you are. Say goodbye properly. It matters.' },
      ], else: [
        { type: 'branch', ifFlag: 'peaks-healed', then: [
          { type: 'branch', ifFlag: 'journal:stone-returns', then: [
            { type: 'say', text: "Hear that? The river's got its voice back." },
            { type: 'say', text: 'Now it can carry you. Let me see that boat of yours.' },
            { type: 'say', text: 'Mm. Good paper. Old ink. Hold still, little one.' },
            { type: 'silence', seconds: 2, reward: "There. Folded properly, she'll float to the end of the world." },
            { type: 'give', items: ['boat-ready', 'map:bridge'] },
            { type: 'say', text: 'Gather your friends at the bridge. Nobody leaves my valley without a goodbye.' },
          ], else: [
            { type: 'say', text: "The river's waking up! Have you told Ysolde? She's waited sixty years to hear it." },
          ] },
        ], else: [
          { type: 'say', text: "A traveler! On my bridge! I'd stopped putting the kettle on." },
          { type: 'say', text: 'Where are you headed?' },
          { type: 'ask', cards: [
            { kind: 'open', text: 'Home. I think it is down there, by the sea.', reply: ['Down the river, then. All the way.', "But the river's too thin to carry anything right now."] },
            { kind: 'neutral', text: "I don't know yet.", reply: ['Ah. The best kind of traveler.'] },
          ] },
          { type: 'say', text: 'Is that a paper boat in your satchel? May I?' },
          { type: 'silence', seconds: 2.4, reward: 'I know this fold. I taught it to one child only, long ago, on this very bridge.' },
          { type: 'ask', cards: [
            { kind: 'open', text: 'Who was the child?', gives: ['clue:odo', 'journal:the-fold'],
              reply: ["My memory isn't what it was.", 'But the child said they were writing a letter to the sea.'] },
            { kind: 'neutral', text: 'Just a boat I found.', gives: ['clue:odo'], reply: ['Nothing is just a boat.'] },
          ] },
          { type: 'say', text: "When the spring wakes up, come back. I'll fold her properly for you." },
        ] },
      ] },
    ],
    after: ['Nothing is just a boat.', "Come back when the river's strong. I'll be folding."],
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
