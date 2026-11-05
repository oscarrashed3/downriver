import type { Script } from '../systems/connection';

// All player-facing words live in data, so they can be translated later.
// Keep every line to two short lines on screen.

export const SCRIPTS: Record<string, Script> = {
  ysolde: {
    id: 'ysolde', name: 'Ysolde', title: 'who keeps the spring',
    start: { trust: 0.4, worry: 0.6, openness: 0.35 },
    hint: 'Ysolde speaks slowly. She seems to want someone who listens all the way through.',
    nodes: [
      { type: 'branch', ifFlag: 'peaks-healed', then: [
        { type: 'say', text: 'Sixty winters I carried this cup up here. This morning the spring filled it for me.' },
        { type: 'silence', seconds: 2.2, reward: 'He looked at you, you know. Before he went up. Hollo never looks at anyone.' },
        { type: 'give', items: ['journal:stone-returns'] },
        { type: 'say', text: "Go and see Odo. He's been folding paper all winter, waiting for this." },
      ], else: [
        { type: 'branch', ifFlag: 'quest:night', then: [
          { type: 'branch', ifFlag: 'invited:ysolde', then: [
            { type: 'say', text: "The fire is lit. I'll keep it until the others come." },
          ], else: [
            { type: 'say', text: 'Snow tonight. I can smell it too.' },
            { type: 'say', text: "I'll light the fire beside him. Go and fetch the others. All of them." },
            { type: 'give', items: ['invited:ysolde'] },
          ] },
        ], else: [
          { type: 'branch', ifFlag: 'quest:hollo', then: [
            { type: 'say', text: 'He still breathes. Slow, like the tide.' },
            { type: 'say', text: 'Start with the wind. Tor has his grandfather\'s kite, in the village below.' },
          ], else: [
            { type: 'say', text: "Shh. Not so loud. You'll wake him. ...No. You won't. Nothing does anymore." },
            { type: 'say', text: 'This is Hollo. Every spring he climbs back up to the peaks, and the water follows him.' },
            { type: 'say', text: 'This year he lay down on the spring and never got up.' },
            { type: 'silence', seconds: 2.6, reward: 'While he sleeps, the spring stays frozen under him. And the river stays thin.' },
            { type: 'ask', cards: [
              { kind: 'open', text: 'Why did he stop waking?', reply: ['Too little snow. He sleeps until the mountain feels full again.', 'Snow is the mountain\'s water jar. Winter forgot to fill it.'] },
              { kind: 'leading', text: "Can't we just push him off?", reply: ['Ha. Try. I tried in October.', 'He sighed and rolled over onto my cup.'] },
              { kind: 'judging', text: "Why didn't anyone help him?", reply: ['We tried. Then we got old and tired.', 'Tired is not the same as not caring.'] },
            ] },
            { type: 'say', text: 'My grandmother said three things wake him.' },
            { type: 'say', text: 'The wind read right. The snow held on the ridges. And the whole valley beside him on the long night.' },
            { type: 'gate', minTrust: 0.46, fail: ["The cold's in my knees. Come back when you've learned to sit with someone."], pass: [
              { type: 'ask', cards: [
                { kind: 'open', text: 'Then I will do all three.', gives: ['quest:hollo', 'journal:snow-jar', 'map:valley'],
                  reply: ['All three. A traveler who listens. Well.', 'Each one will light a lantern on Odo\'s bridge. Light all three.'] },
                { kind: 'neutral', text: "I only want to go home.", gives: ['quest:hollo', 'journal:snow-jar', 'map:valley'],
                  reply: ['Then you need the river. And the river needs him.', 'Each thing you do lights a lantern on Odo\'s bridge. Light all three.'] },
              ] },
              { type: 'say', text: "Start with the wind. Tor has his grandfather's kite, in the village below." },
            ] },
          ] },
        ] },
      ] },
    ],
    after: ['The spring remembers everyone who drinks from it.', 'He breathes slower when you stand close. I think he likes you.'],
  },

  bram: {
    id: 'bram', name: 'Bram', title: 'the goatherd',
    start: { trust: 0.42, worry: 0.7, openness: 0.35 },
    hint: 'Bram keeps glancing at the west cliffs. Maybe ask him what he needs.',
    nodes: [
      { type: 'branch', ifFlag: 'quest:night', then: [
        { type: 'branch', ifFlag: 'invited:bram', then: [
          { type: 'say', text: "I'm coming. I'm putting on my second coat. And my third." },
        ], else: [
          { type: 'say', text: 'Sleep out in the snow? Beside a beast the size of my barn?' },
          { type: 'silence', seconds: 2, reward: "...My father did it once, when I was small. He said it was the warmest night of his life." },
          { type: 'say', text: "Fine. I'll come. The goats stay home. Pebble comes." },
          { type: 'give', items: ['invited:bram'] },
        ] },
      ], else: [
        { type: 'branch', ifFlag: 'goat-home', then: [
          { type: 'say', text: "Pebble's home. She bit me, so she's fine." },
          { type: 'branch', ifFlag: 'flag:tor-fences', then: [
            { type: 'say', text: 'The rails are on the ridges now? Good. Snow will thank you.' },
          ], else: [
            { type: 'say', text: "...Thank you. I don't say that much. The goats can confirm." },
            { type: 'say', text: "You want to help Hollo? Old Tor built snow fences on the windy ridges. The posts still stand." },
            { type: 'say', text: 'His rails are in my shed. Take them. Three fences, on the side the wind hits.' },
            { type: 'give', items: ['flag:tor-fences', 'quest:markers'] },
            { type: 'say', text: "Wrong side and the snow blows straight past. Read the wind first." },
          ] },
        ], else: [
          { type: 'say', text: 'Careful, the goats bite. Only the brown one, really.' },
          { type: 'say', text: 'Outsiders come up here, take our water, take our pictures, and leave.' },
          { type: 'ask', cards: [
            { kind: 'open', text: 'What do you need most right now?', gives: ['quest:goat'],
              reply: ['My smallest goat ran off up the west cliffs.', "She won't come for me. Too stubborn. Like me."] },
            { kind: 'open', text: 'I need wood for snow fences.', gives: ['quest:goat'],
              reply: ["Everyone needs something. I need my goat back.", 'The little one ran up the west cliffs. Bring her home and the wood is yours.'] },
            { kind: 'judging', text: "You don't like strangers much.", reply: ['I like strangers fine. From a distance.'] },
          ] },
        ] },
      ] },
      { type: 'ask', cards: [
        { kind: 'open', text: "Where's your runaway goat?", requires: ['quest:goat'], hiddenIf: ['goat-home'], reply: ['Up the west cliffs, past the dry meadow.', "Walk slow and speak soft. Don't chase her."] },
        { kind: 'neutral', text: 'Good luck with the goats.', reply: ['Luck is for people without goats.'] },
      ] },
      { type: 'branch', ifFlag: 'power:skyreading', then: [
        { type: 'ask', cards: [
          { kind: 'neutral', text: 'Take the west road. The wind is loading the east slope.', hiddenIf: ['flag:route-chosen'], gives: ['flag:route-west', 'flag:route-chosen', 'journal:wind-loading'],
            reply: ['West it is. Long, but we all arrive.'] },
          { kind: 'neutral', text: 'The east road looks fine to me.', hiddenIf: ['flag:route-chosen'], gives: ['flag:route-east', 'flag:route-chosen'],
            reply: ['East, then. Quick as we can.'] },
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
      { type: 'branch', ifFlag: 'quest:night', then: [
        { type: 'branch', ifFlag: 'invited:nima', then: [
          { type: 'say', text: "I'm bringing a blanket and a list of cloud names. A long list." },
        ], else: [
          { type: 'say', text: "See that one coming over the ridge? Heavy and grey? That's Big Marguerite." },
          { type: 'say', text: 'She carries snow. Lots. Tonight.' },
          { type: 'say', text: 'A fire beside Hollo? Under Big Marguerite? Yes. Yes yes yes.' },
          { type: 'give', items: ['invited:nima'] },
        ] },
      ], else: [
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
      ] },
    ],
    after: ['Nobody watches anymore. Except me. And now you.'],
  },

  tor: {
    id: 'tor', name: 'Tor', title: 'who builds kites',
    start: { trust: 0.5, worry: 0.45, openness: 0.5 },
    hint: 'Tor looks up at the ridge, then quickly away.',
    nodes: [
      { type: 'branch', ifFlag: 'quest:night', then: [
        { type: 'branch', ifFlag: 'invited:tor', then: [
          { type: 'say', text: "I'm bringing the kite. Not to fly. Just to hold." },
        ], else: [
          { type: 'say', text: 'A whole night out? Next to Hollo? Grandpa did that, every year he was little.' },
          { type: 'silence', seconds: 2, reward: "I'm not scared. Well. A bit. But I'll be there." },
          { type: 'give', items: ['invited:tor'] },
        ] },
      ], else: [
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
            { type: 'say', text: "This was Grandpa's kite. He flew it from Kite Ridge to read the wind for Hollo." },
            { type: 'say', text: 'I fell off Kite Ridge last winter. Now I just fix things down here.' },
            { type: 'silence', seconds: 2.4, reward: 'I miss the top. You can see the whole world from there.' },
            { type: 'ask', cards: [
              { kind: 'open', text: 'What happened to the kite?', gives: ['quest:kite'],
                reply: ['The long spar snapped. I need a straight willow branch.', 'The old tree by the spring drops good ones.'] },
              { kind: 'open', text: 'Why does the wind matter to Hollo?', gives: ['quest:kite'],
                reply: ['The wind decides where the snow lands. Grandpa said you have to see it first.', 'But the kite is broken. I need a straight willow branch, from the old tree by the spring.'] },
              { kind: 'judging', text: "It's only a little ridge.", reply: ["Says you. You didn't fall off it."] },
            ] },
            { type: 'ask', cards: [
              { kind: 'open', text: 'What happened to the kite?', hiddenIf: ['quest:kite'], gives: ['quest:kite'],
                reply: ['The long spar snapped. I need a straight willow branch.', 'The old tree by the spring drops good ones.'] },
              { kind: 'neutral', text: 'See you later, Tor.', reply: ['Mind the string. The invisible one.'] },
            ] },
            { type: 'give', items: ['map:poles'] },
          ] },
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
          { type: 'say', text: "Hear that? The river's got its voice back. And all three lanterns lit!" },
          { type: 'say', text: 'Now it can carry you. Let me see that boat of yours.' },
          { type: 'say', text: 'Mm. Good paper. Old ink. Hold still, little one.' },
          { type: 'silence', seconds: 2, reward: "There. Folded properly, she'll float to the end of the world." },
          { type: 'give', items: ['boat-ready', 'map:bridge'] },
          { type: 'say', text: 'Gather your friends at the bridge. Nobody leaves my valley without a goodbye.' },
        ], else: [
          { type: 'branch', ifFlag: 'quest:night', then: [
            { type: 'branch', ifFlag: 'invited:odo', then: [
              { type: 'say', text: "Kettle's packed. Go on, I'm right behind you. Slowly." },
            ], else: [
              { type: 'say', text: 'A fire on the spring, on the long night? I have not done that in fifty years.' },
              { type: 'say', text: "I'll bring the kettle. Nobody sleeps through tea." },
              { type: 'give', items: ['invited:odo'] },
            ] },
          ], else: [
            { type: 'say', text: "A traveler! On my bridge! I'd stopped putting the kettle on." },
            { type: 'say', text: 'See my three lanterns? Dark, all of them. They light when the mountain wakes.' },
            { type: 'ask', cards: [
              { kind: 'open', text: 'Home. I think it is down there, below the clouds.', reply: ['Down the river, then. All the way.', "But the river's too thin to carry anything right now."] },
              { kind: 'neutral', text: "I don't know where I'm going yet.", reply: ['Ah. The best kind of traveler.'] },
            ] },
            { type: 'say', text: 'Is that a paper boat peeking out of your bag? May I?' },
            { type: 'silence', seconds: 2.4, reward: 'I know this fold. Only one person ever folded like this. Someone who kept a light, far away.' },
            { type: 'ask', cards: [
              { kind: 'open', text: 'Who keeps a light?', gives: ['clue:odo', 'journal:the-fold'],
                reply: ['They passed over my bridge once, years ago, in a storm. Never stopped walking.', 'Always one valley ahead of the weather, they said.'] },
              { kind: 'neutral', text: 'Just a boat I found.', gives: ['clue:odo'], reply: ['Nothing is just a boat.'] },
            ] },
            { type: 'say', text: "When Hollo wakes and the river's strong, come back. I'll fold her properly for you." },
          ] },
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
