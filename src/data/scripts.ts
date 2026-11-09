import type { Node, Script } from '../systems/connection';

// All player-facing words live in data, so they can be translated later.
// Keep every line to two short lines on screen.

/**
 * Carry the fire (the third lantern). Odo introduces Fold and asks for a paper lantern;
 * the quest itself is wired in the story code, which only needs to set these flags.
 *  open  - set when it is time for Odo to bring it up (he asks the next time you talk)
 *  quest - Odo has asked: carry an ember from the village fire to the frozen spring
 *  power - Fold can fold himself into a paper lantern
 *  lit   - the ember reached the spring (Odo then tells you there is more to Fold)
 *  more  - Odo has said so
 */
export const EMBER = {
  open: 'ember-open', quest: 'quest:ember', power: 'power:lantern', lit: 'ember-lit', more: 'fold:more',
} as const;

/** Odo on the long night. */
const ODO_NIGHT: Node[] = [
  { type: 'branch', ifFlag: 'invited:odo', then: [
    { type: 'say', text: "Kettle's packed. Go on, I'm right behind you. Slowly." },
  ], else: [
    { type: 'say', text: 'A fire on the spring, on the long night? Not in fifty years.' },
    { type: 'say', text: "I'll bring the kettle. Nobody sleeps through tea." },
    { type: 'give', items: ['invited:odo'] },
  ] },
];

/** The first time Nilo stops on the bridge: the three dark lanterns, and the boat Odo recognises. */
const ODO_FIRST_MEET: Node[] = [
  { type: 'say', text: "A traveler! On my bridge! I'd stopped putting the kettle on." },
  { type: 'say', text: 'See my three lanterns? All dark. They light when the mountain wakes.' },
  { type: 'ask', cards: [
    { kind: 'open', text: 'Home. I think it is down there, below the clouds.', reply: ['Down the river, then. All the way.', "But the river's too thin to carry anything now."] },
    { kind: 'neutral', text: "I don't know where I'm going yet.", reply: ['Ah. The best kind of traveler.'] },
  ] },
  { type: 'say', text: 'Is that a paper boat in your bag? May I?' },
  { type: 'silence', seconds: 2.4, reward: 'I know this fold. Only one person folded like this. Someone who kept a light.' },
  { type: 'ask', cards: [
    { kind: 'open', text: 'Who keeps a light?', gives: ['clue:odo', 'journal:the-fold'],
      reply: ['They crossed my bridge once, in a storm. Never stopped walking.', 'Always one valley ahead of the weather, they said.'] },
    { kind: 'neutral', text: 'Just a boat I found.', gives: ['clue:odo'], reply: ['Nothing is just a boat.'] },
  ] },
];

/** What Odo says on any other visit before Hollo wakes. */
const ODO_USUAL: Node[] = [
  { type: 'branch', ifFlag: 'quest:night', then: ODO_NIGHT, else: [
    ...ODO_FIRST_MEET,
    { type: 'say', text: "When Hollo wakes, come back. I'll fold her properly for you." },
  ] },
];

/** Odo introduces Fold to Nilo (and to the player), and asks him to carry the fire. */
const ODO_FOLD_INTRO: Node[] = [
  { type: 'say', text: 'Your little boat. Has anyone told you his name?' },
  { type: 'say', text: "Fold. Paper that remembers every shape it's ever been." },
  { type: 'silence', seconds: 2.4, reward: "A boat on water. A kite in the wind. He's only waiting to be asked." },
  { type: 'ask', cards: [
    { kind: 'open', text: 'What else can he be?',
      reply: ['Whatever the day needs. Today, a lantern.', 'Paper keeps a flame out of the wind, if it is folded right.'] },
    { kind: 'neutral', text: "He's only paper.",
      reply: ['So is a letter. Look what those can do.', 'Today, he could be a lantern.'] },
  ] },
  { type: 'say', text: "The spring won't let go of the cold. It needs a little warmth." },
  { type: 'say', text: 'The village fire has plenty. Carry one ember up to the frozen spring.' },
  { type: 'say', text: 'Ask Fold to be your lantern. Keep him out of the wind, or it goes out.' },
  { type: 'give', items: [EMBER.quest, EMBER.power] },
  { type: 'say', text: 'Walk slowly. A paper lantern hates a hurry more than a gust.' },
];

/** After the ember reaches the spring: there is more to Fold than anyone has seen. */
const ODO_FOLD_MORE: Node[] = [
  { type: 'say', text: 'You carried fire all that way? In paper? Through that wind?' },
  { type: 'say', text: "Then Fold trusts you. Paper doesn't hold a flame for just anyone." },
  { type: 'silence', seconds: 2.6, reward: "A boat, a kite, a lantern. That's all I've ever seen. There is more." },
  { type: 'ask', cards: [
    { kind: 'open', text: 'How will I know what he can be?',
      reply: ["You won't. He will. Watch him when you're stuck.", 'Paper always knows its next fold before we do.'] },
    { kind: 'neutral', text: 'Thank you, Odo.', reply: ['Thank him. I only talk.'] },
  ] },
  { type: 'say', text: 'Every valley downriver will ask him something new. Let him answer.' },
  { type: 'give', items: [EMBER.more] },
  { type: 'branch', ifFlag: 'quest:night', then: ODO_NIGHT },
];

export const SCRIPTS: Record<string, Script> = {
  ysolde: {
    id: 'ysolde', name: 'Ysolde', title: 'who keeps the spring', stranger: 'the old woman',
    start: { trust: 0.4, worry: 0.6, openness: 0.35 },
    hint: 'Ysolde speaks slowly. She wants someone who listens all the way through.',
    nodes: [
      { type: 'branch', ifFlag: 'peaks-healed', then: [
        { type: 'say', text: 'Sixty winters I carried this cup up here. Today the spring filled it.' },
        { type: 'silence', seconds: 2.2, reward: 'He looked at you before he went up. Hollo never looks at anyone.' },
        { type: 'give', items: ['journal:stone-returns'] },
        { type: 'say', text: 'Go and find Odo on his bridge. He has waited all winter for this.' },
      ], else: [
        { type: 'branch', ifFlag: 'quest:night', then: [
          { type: 'branch', ifFlag: 'invited:ysolde', then: [
            { type: 'say', text: "The fire is lit. I'll keep it until the others come." },
          ], else: [
            { type: 'say', text: 'Snow tonight. I can smell it too.' },
            { type: 'say', text: "I'll light the fire beside him. You fetch the others. All of them." },
            { type: 'give', items: ['invited:ysolde'] },
          ] },
        ], else: [
          { type: 'branch', ifFlag: 'quest:hollo', then: [
            { type: 'say', text: 'He still breathes. Slow, like the tide.' },
            { type: 'say', text: 'Walk down the path to the village. Tor is at his workbench by the fire.' },
          ], else: [
            { type: 'say', text: "Shh. You'll wake him. ...No. You won't. Nothing does anymore." },
            { type: 'say', text: 'This is Hollo. Each spring he climbs to the peaks, and the water follows.' },
            { type: 'say', text: 'This year he lay down on the spring and never got up.' },
            { type: 'silence', seconds: 2.6, reward: 'While he sleeps, the spring stays frozen. And the river stays thin.' },
            { type: 'ask', cards: [
              { kind: 'open', text: 'Why did he stop waking?', reply: ['Too little snow. He sleeps until the mountain feels full.', "Snow is the mountain's water jar. Winter forgot to fill it."] },
              { kind: 'leading', text: "Can't we just push him off?", reply: ['Ha. I tried in October.', 'He sighed and rolled onto my cup.'] },
              { kind: 'judging', text: "Why didn't anyone help him?", reply: ['We tried. Then we got old and tired.', 'Tired is not the same as not caring.'] },
            ] },
            { type: 'say', text: 'Three things wake him. The wind read right. Snow held on the ridges.' },
            { type: 'say', text: 'And the whole valley beside him on the long night.' },
            { type: 'gate', minTrust: 0.46, fail: ["The cold's in my knees. Come back and sit with me a while."], pass: [
              { type: 'ask', cards: [
                { kind: 'open', text: 'Then I will do all three.', gives: ['quest:hollo', 'journal:snow-jar', 'map:valley'],
                  reply: ['All three. A traveler who listens. Well.', "Each one lights a lantern on Odo's bridge."] },
                { kind: 'neutral', text: 'I only want to go home.', gives: ['quest:hollo', 'journal:snow-jar', 'map:valley'],
                  reply: ['Then you need the river. And the river needs him.', "Each thing you do lights a lantern on Odo's bridge."] },
              ] },
              { type: 'say', text: "Start with the wind. Tor has his grandfather's kite." },
              { type: 'say', text: 'Walk down the path to the village. Tor is at his workbench by the fire.' },
            ] },
          ] },
        ] },
      ] },
    ],
    after: ['The spring remembers everyone who drinks from it.', 'He breathes slower when you stand close. I think he likes you.'],
  },

  bram: {
    id: 'bram', name: 'Bram', title: 'the goatherd', stranger: 'the goatherd',
    start: { trust: 0.42, worry: 0.7, openness: 0.35 },
    hint: 'Bram keeps glancing at the west cliffs. Ask him what he needs.',
    nodes: [
      { type: 'branch', ifFlag: 'quest:night', then: [
        { type: 'branch', ifFlag: 'invited:bram', then: [
          { type: 'say', text: "I'm coming. I'm putting on my second coat. And my third." },
        ], else: [
          { type: 'say', text: 'Sleep out in the snow? Beside a beast the size of my barn?' },
          { type: 'silence', seconds: 2, reward: 'My father did it once. He said it was the warmest night of his life.' },
          { type: 'say', text: "Fine. I'll come. The goats stay home. Pebble comes." },
          { type: 'give', items: ['invited:bram'] },
        ] },
      ], else: [
        { type: 'branch', ifFlag: 'goat-home', then: [
          { type: 'say', text: "Pebble's home. She bit me, so she's fine." },
          { type: 'branch', ifFlag: 'flag:tor-fences', then: [
            { type: 'say', text: 'Rails on the ridges yet? The snow will thank you.' },
          ], else: [
            { type: 'say', text: "...Thank you. I don't say that much. The goats can confirm." },
            { type: 'say', text: "Old Tor's fence posts still stand on the windy ridges." },
            { type: 'say', text: 'Take his rails. Build three fences on the side the wind hits.' },
            { type: 'give', items: ['flag:tor-fences', 'quest:markers'] },
            { type: 'say', text: 'Wrong side, and the snow blows straight past. Read the wind first.' },
          ] },
        ], else: [
          { type: 'say', text: 'Careful, the goats bite. Only the brown one, really.' },
          { type: 'say', text: 'Outsiders come up here, take our water, and leave.' },
          { type: 'ask', cards: [
            { kind: 'open', text: 'What do you need most right now?', gives: ['quest:goat'],
              reply: ['My smallest goat, Pebble, ran up the west cliffs.', 'Find Pebble on the west cliffs, behind the village. Walk her home.'] },
            { kind: 'open', text: 'I need wood for snow fences.', gives: ['quest:goat'],
              reply: ['And I need my goat back. Pebble ran up the west cliffs.', 'Find Pebble on the west cliffs, behind the village. Then the wood is yours.'] },
            { kind: 'judging', text: "You don't like strangers much.", reply: ['I like strangers fine. From a distance.'] },
          ] },
        ] },
      ] },
      { type: 'ask', cards: [
        { kind: 'open', text: "Where's Pebble?", requires: ['quest:goat'], hiddenIf: ['goat-home'], reply: ['Up the west cliffs, behind the village.', "Walk slow and speak soft. Don't chase her."] },
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
    id: 'nima', name: 'Nima', title: 'who names the clouds', stranger: 'the cloud girl',
    start: { trust: 0.5, worry: 0.3, openness: 0.55 },
    hint: 'Nima went quiet. Maybe she wanted to be taken seriously.',
    nodes: [
      { type: 'branch', ifFlag: 'quest:night', then: [
        { type: 'branch', ifFlag: 'invited:nima', then: [
          { type: 'say', text: "I'm bringing a blanket and a list of cloud names. A long list." },
        ], else: [
          { type: 'say', text: "Snow! Snow's coming! See the heavy grey one? That's Big Marguerite." },
          { type: 'say', text: 'She carries snow. Lots. Tonight.' },
          { type: 'say', text: 'Hollo needs everyone beside him tonight. I ran all the way to tell you.' },
          { type: 'say', text: "I'm coming. Go and ask the others. I'll bring blankets." },
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
              reply: ['You watch! Nobody watches anymore.', 'Take this bottle. A baby cloud sleeps on the tall peak.'] },
            { kind: 'leading', text: 'Clouds are just water vapor, you know.', gives: ['item:bottle', 'quest:cloud'],
              reply: ["I KNOW. That's not the point.", 'Take this bottle anyway. A baby cloud sleeps on the tall peak.'] },
          ] },
          { type: 'say', text: 'Bring the little cloud to the dry meadow. It needs rain.' },
          { type: 'gate', minTrust: 0.45, fail: ['...'], pass: [{ type: 'give', items: ['map:chimes'] }] },
        ] },
      ] },
    ],
    after: ['Nobody watches anymore. Except me. And now you.'],
  },

  tor: {
    id: 'tor', name: 'Tor', title: 'who builds kites', stranger: 'the boy at the workbench',
    start: { trust: 0.5, worry: 0.45, openness: 0.5 },
    hint: 'Tor looks up at the ridge, then quickly away.',
    nodes: [
      { type: 'branch', ifFlag: 'quest:night', then: [
        { type: 'branch', ifFlag: 'invited:tor', then: [
          { type: 'say', text: "I'm bringing the kite. Not to fly. Just to hold." },
        ], else: [
          { type: 'say', text: 'A whole night out, next to Hollo? Grandpa did that every year.' },
          { type: 'silence', seconds: 2, reward: "I'm not scared. Well. A bit. But I'll be there." },
          { type: 'give', items: ['invited:tor'] },
        ] },
      ], else: [
        { type: 'branch', ifFlag: 'kite-flown', then: [
          { type: 'say', text: 'Did you see it? It went higher than the clouds! Well. Almost.' },
          { type: 'say', text: 'Bram, the goat man, lives at the west end of the village.' },
          { type: 'say', text: "Ask him for fence wood. He has Grandpa's old rails." },
        ], else: [
          { type: 'branch', ifFlag: 'item:spar', then: [
            { type: 'say', text: "A willow branch! Straight as a ruler." },
            { type: 'say', text: 'There. Fixed. Grandpa would say it flies better than before.' },
            { type: 'silence', seconds: 2, reward: "...Will you come up Kite Ridge with me? I don't want to go alone." },
            { type: 'say', text: "It's across the bridge, up the path. Walk with me." },
            { type: 'give', items: ['flag:tor-follow'] },
          ], else: [
            { type: 'say', text: "Don't step on the string! ...Sorry. There's no string. It broke." },
            { type: 'say', text: "This was Grandpa's kite. He flew it from Kite Ridge to read the wind." },
            { type: 'say', text: 'I fell off Kite Ridge last winter. Now I just fix things down here.' },
            { type: 'silence', seconds: 2.4, reward: 'I miss the top. You can see the whole world from there.' },
            { type: 'ask', cards: [
              { kind: 'open', text: 'What happened to the kite?', gives: ['quest:kite'],
                reply: ['The long spar snapped. I need a straight willow branch.'] },
              { kind: 'open', text: 'Why does the wind matter to Hollo?', gives: ['quest:kite'],
                reply: ['The wind decides where the snow lands. You have to see it first.', 'But the spar snapped. I need a straight willow branch.'] },
              { kind: 'judging', text: "It's only a little ridge.", reply: ["Says you. You didn't fall off it."] },
            ] },
            { type: 'ask', cards: [
              { kind: 'open', text: 'What happened to the kite?', hiddenIf: ['quest:kite'], gives: ['quest:kite'],
                reply: ['The long spar snapped. I need a straight willow branch.'] },
              { kind: 'neutral', text: 'See you later, Tor.', hiddenIf: ['quest:kite'], reply: ['Mind the string. The invisible one.'] },
            ] },
            { type: 'branch', ifFlag: 'quest:kite', then: [
              { type: 'say', text: 'Get one from the old tree. The big one you passed by the spring.' },
            ] },
            { type: 'give', items: ['map:poles'] },
          ] },
        ] },
      ] },
    ],
    after: ["Grandpa's snow poles are still out there. He measured snow for forty winters."],
  },

  odo: {
    id: 'odo', name: 'Odo', title: 'who keeps the old bridge', stranger: 'the bridge keeper',
    start: { trust: 0.55, worry: 0.3, openness: 0.6 },
    nodes: [
      { type: 'branch', ifFlag: 'boat-ready', then: [
        { type: 'say', text: 'Your boat is ready when you are. Say goodbye properly. It matters.' },
      ], else: [
        { type: 'branch', ifFlag: 'peaks-healed', then: [
          { type: 'say', text: "Hear that? The river has its voice back. All three lanterns lit!" },
          { type: 'say', text: 'Now it can carry you. Let me see that boat of yours.' },
          { type: 'say', text: 'Mm. Good paper. Old ink. Hold still, little one.' },
          { type: 'silence', seconds: 2, reward: "There. Folded properly, she'll float to the end of the world." },
          { type: 'give', items: ['boat-ready', 'map:bridge'] },
          { type: 'say', text: "Say goodbye to everyone here at the bridge. Nobody leaves without one." },
        ], else: [
          // Carry the fire: Odo is the one who introduces Fold, and comes back to it once the ember is home.
          { type: 'branch', ifFlag: EMBER.lit, then: [
            { type: 'branch', ifFlag: EMBER.more, then: ODO_USUAL, else: ODO_FOLD_MORE },
          ], else: [
            { type: 'branch', ifFlag: EMBER.open, then: [
              { type: 'branch', ifFlag: EMBER.quest, then: [
                { type: 'say', text: 'The ember goes from the village fire up to the frozen spring.' },
                { type: 'say', text: 'Keep your back to the wind. Fold will do the rest.' },
                { type: 'branch', ifFlag: 'quest:night', then: ODO_NIGHT },
              ], else: [
                { type: 'branch', ifFlag: 'clue:odo', then: [], else: ODO_FIRST_MEET },
                ...ODO_FOLD_INTRO,
              ] },
            ], else: ODO_USUAL },
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
      { type: 'say', text: 'These slopes were all old trees once. Then we cut them, all at once.' },
      { type: 'say', text: 'Now the young ones are growing back. Slowly. Too slowly for the rain.' },
      { type: 'say', text: 'Every storm washes a little hill away. See the river? Brown as tea.' },
      { type: 'silence', seconds: 2, reward: 'Roots are hands holding the hill. We let go.' },
      { type: 'give', items: ['met:oro'] },
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
  maren: {
    id: 'maren', name: 'Maren', title: 'the Salt Keeper',
    start: { trust: 0.5, worry: 0.7, openness: 0.5 },
    nodes: [
      { type: 'say', text: 'You carried that drop all the way down?' },
      { type: 'say', text: 'The sea is rising. There is salt in our wells now.' },
      { type: 'say', text: 'My family has to choose: stay, or go. There is no right answer.' },
      { type: 'say', text: 'The river does not end here. It crosses the sea, and goes on down to the sand.' },
      { type: 'give', items: ['map:sea', 'met:maren'] },
    ],
    after: ['Go on. The river rests where the sand begins. There is a light there.'],
  },
};

// ---------------------------------------------------------------- return lines
// What a person says when you come back and nothing has changed for them.
// Each set applies while all `when` flags are set and none of the `not` flags are.
// Sets are listed from earliest to latest in the story: the picker says the latest
// matching set's fresh lines first, and never repeats a line until that person has run out.

export interface ReturnSet { when?: string[]; not?: string[]; lines: string[] }

const BEFORE_END = ['chapter1-complete'];
const NIGHT = { when: ['quest:night'], not: ['gathered', 'peaks-healed'] };
const HEALED = { when: ['peaks-healed'], not: BEFORE_END };
const CAME_BACK = { when: ['chapter1-complete'] };

export const RETURN_LINES: Record<string, ReturnSet[]> = {
  ysolde: [
    { lines: [
      'The spring remembers everyone who drinks from it.',
      'Sit, if you like. The stone is cold, but it is honest.',
      'My mother kept this spring. Her mother too. Women with cold hands.',
      'You listen like a river. All the way to the end.',
      "Don't rush me. Old words come out slowly, like sap.",
      'I talk to the water every morning. Lately it has stopped answering.',
    ] },
    { not: ['quest:hollo', 'peaks-healed'], lines: [
      'He breathes slower when you stand close. I think he likes you.',
      'Sixty winters on this mountain. I have never heard it this quiet.',
    ] },
    { when: ['quest:hollo'], not: ['peaks-healed'], lines: [
      'Touch his fur. Warm underneath. He is only waiting.',
      'Each lantern on the bridge is a promise. Keep yours.',
      'Snow on the ridges is water in summer. Remember that.',
    ] },
    { when: ['kite-flown'], not: ['peaks-healed'], lines: [
      "I saw the kite from here. Tor has his grandfather's arms.",
    ] },
    { ...NIGHT, lines: [
      "The fire is lit. I'll keep it until the others come.",
      'Bring them all. Even Bram. Especially Bram.',
    ] },
    { ...HEALED, lines: [
      'Listen. The spring is talking again. Rude, cheerful thing.',
      'Hollo looked back at you. He never looks back at anyone.',
      'My cup is full. Sixty winters, and today it is full.',
    ] },
    { ...CAME_BACK, lines: [
      'You came back. The spring said you would. It gurgled.',
      "Hollo climbs a little higher every week. As if he's looking for you.",
      'The river you rode is still singing. Almost your name.',
    ] },
  ],

  bram: [
    { lines: [
      'The goats send their regards. Mostly the brown one.',
      "Ask first. That's all anyone wants.",
      "Don't pet that one. Or that one. Actually, don't pet goats.",
      'Goats eat anything. Last week, my left boot. Only the left one.',
      'I talk to goats more than people. The goats listen less.',
      'Strangers. Still not sure about them. You are half a stranger now.',
    ] },
    { not: ['goat-home'], lines: [
      'Pebble has never come down a cliff the easy way. Not once.',
      'If you see a small goat looking pleased with herself, that is Pebble.',
    ] },
    { when: ['quest:goat'], not: ['goat-home'], lines: [
      "Walk slow near her. She can smell a hurry.",
    ] },
    { when: ['goat-home'], not: ['fences-done', 'peaks-healed'], lines: [
      "Pebble's followed me all day. I think she's sorry. She isn't.",
      'Fences go on the side the wind hits. Not the side that looks nice.',
      "Tor's grandfather built those rails to last. Like everything back then.",
    ] },
    { ...NIGHT, lines: [
      'Three coats on. Pebble is wearing my scarf. We are ready.',
      'A whole night on the snow. My knees have filed a complaint.',
    ] },
    { ...HEALED, lines: [
      'Water in the troughs again. The goats are unbearable about it.',
      "Fine. Thank you. That's twice now. Don't tell anyone.",
      'The snow held on the ridges. Your fences did that. Our fences.',
    ] },
    { ...CAME_BACK, lines: [
      'Pebble waited by the bridge for days. Then she ate the bridge rope.',
      'The goats have opinions about where you went. Mostly bad ones.',
      'Back again. Good. The goats were getting bored of me.',
    ] },
  ],

  nima: [
    { lines: [
      'Nobody watches anymore. Except me. And now you.',
      "That one's Sir Puffington. He's very old. Very slow.",
      'Lie down here. The sky is better from the ground.',
      "I've named two hundred clouds. I keep a list. It's long.",
      "Clouds never say goodbye. They just get thinner.",
      'If you squint, every cloud is an animal. That one is you.',
    ] },
    { when: ['quest:cloud'], not: ['journal:cloud'], lines: [
      'The baby cloud sleeps on the tall peak. Be gentle with the bottle.',
      "Don't shake the bottle! Clouds get travel sick.",
    ] },
    { when: ['journal:cloud'], not: ['peaks-healed'], lines: [
      'Pip went home to his mum. She is the grey one over the ridge.',
      'The meadow is green where Pip rained. I go and look at it every day.',
    ] },
    { ...NIGHT, lines: [
      "Big Marguerite is almost here. She's huge. She's perfect.",
      "I'm bringing blankets. You can help me name the stars.",
    ] },
    { ...HEALED, lines: [
      'Snow on every ridge! The clouds landed right where we said.',
      'I named a new cloud after you. It is small and keeps walking off.',
      'When Hollo stood up he looked like a cloud. A big sleepy one.',
    ] },
    { ...CAME_BACK, lines: [
      'You came back! I saw a cloud shaped like a boat and I just knew.',
      'Did the clouds downriver have names? Tell me all of them.',
      'Mrs. Fluff came back too. Everyone comes back, sooner or later.',
    ] },
  ],

  tor: [
    { lines: [
      "Grandpa's snow poles are still out there. Forty winters of snow.",
      'Mind the string. The invisible one.',
      "I'm fixing a cart wheel. Well. I'm looking at it very hard.",
      'Grandpa said wind is just air in a hurry.',
      'Everything breaks. That is why there are people who fix things.',
      "You walk like someone who's been somewhere far. I'd like that one day.",
    ] },
    { when: ['quest:kite'], not: ['kite-flown'], lines: [
      'The old willow is by the spring. Its branches grow dead straight.',
      'I keep looking at the ridge. Then I look at my shoes.',
    ] },
    { when: ['kite-flown'], not: ['peaks-healed'], lines: [
      'My legs are still shaking from the top. Good shaking.',
      "Fold flew better than Grandpa's kite. Don't tell anyone I said that.",
      'Warm air climbs up every falling stream. Ride it, if you dare.',
    ] },
    { ...NIGHT, lines: [
      "I'm bringing the kite. Just to hold. It helps.",
      "Is it very cold, a whole night out? Never mind. I'm coming.",
    ] },
    { ...HEALED, lines: [
      "Next winter I'll measure the snow, like Grandpa. Forty winters, from now.",
      'I went up Kite Ridge alone this morning. Just to see if I could.',
      "The wind's different now. Lighter. Like it's pleased with itself.",
    ] },
    { ...CAME_BACK, lines: [
      "You came back! I built a new kite. It's mostly string. Still flies.",
      'Did you ride the warm air back up? Tell me everything. Slowly.',
      "I wrote down every wind since you left. It's mostly 'west'.",
    ] },
  ],

  odo: [
    { lines: [
      'Nothing is just a boat.',
      'Tea? No? Then the kettle and I will drink it ourselves.',
      'Fifty years on this bridge. Everyone crosses it twice, sooner or later.',
      'Bridges are for stopping in the middle of. Nobody knows that anymore.',
      'I fold a paper bird every morning. The river takes them, one by one.',
      'The water under here has seen every valley below the clouds.',
    ] },
    { not: ['peaks-healed'], lines: [
      "Come back when the river's strong. I'll be folding.",
      'One lantern is a start. Two is a habit. Three is a river.',
    ] },
    { when: [EMBER.quest], not: [EMBER.lit], lines: [
      'Back to the wind, ember to your chest. Like carrying a sparrow.',
      'If the flame goes out, the fire will give you another. Fires are kind.',
      'Fold knows how to hold it. Trust the paper. It trusts you.',
    ] },
    { when: [EMBER.more], lines: [
      'A boat, a kite, a lantern. And I hear him rustling for a fourth.',
      'Every valley will ask him something new. Let him answer.',
    ] },
    { ...NIGHT, lines: [
      "Kettle's packed. Go on, I'm right behind you. Slowly.",
    ] },
    { ...HEALED, lines: [
      'Hear that? The river has its voice back.',
      'Say goodbye properly. It matters more than the leaving.',
    ] },
    { ...CAME_BACK, lines: [
      'Back on my bridge! I left the kettle on, just in case.',
      'The river brought you back upstream. It does that, for the right people.',
      'Tell me what Fold became down there. I want every shape.',
    ] },
  ],

  // The postman is met at the bridge at the end of each world; he has his own lines for when he can be talked to.
  postman: [
    { lines: [
      'Letters for you. No. Wait. That one is for a goose.',
      'Wind from the west today. Good for umbrellas. Bad for hats.',
      'Every valley gets mail. Most of them twice. One of them by accident.',
      "Rain doesn't bother me. I have the umbrella. It bothers the umbrella.",
      'Stamps? No stamps. The sky does not charge.',
      'Very small postman, very big sky. We get along.',
      'I never read the letters. I only weigh them. Yours are heavy.',
      'Is your paper boat watching me? It looks like it wants to be a letter.',
    ] },
    { when: ['letter:1'], lines: [
      'Your writer is always one valley ahead. I would know. I chase them.',
      'Write back, if you like. I carry replies. No charge. No hurry.',
      'Lovely handwriting, your writer. Slanted, like they never stop walking.',
    ] },
    { when: ['visited:1'], lines: ['The pines down there smell of smoke. Mind your paper friend.', 'Forest mud. Lovely. I lost a boot there last spring.'] },
    { when: ['visited:2'], lines: ['The sea. Every letter gets wet there. Nobody minds.'] },
    { when: ['visited:3'], lines: ['Desert mail is the worst. The sand reads everything first.', 'The dunes. The end of my route. Or the start. I forget which.'] },
  ],
};

/** A short, stable key for a line, so edits elsewhere in a list don't change which lines count as said. */
function lineKey(who: string, text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return `said:${who}:${h.toString(36)}`;
}

/**
 * The line a person says when you come back. Fresh lines from the latest matching set come first,
 * then fresh lines from any other set that fits the state. Once all of them have been said, the
 * person starts over (but never says the same line twice in a row). Said lines are kept as flags,
 * so they survive a save.
 */
export function pickReturnLine(who: string, flags: Set<string>, rand: () => number = Math.random): string | null {
  const sets = (RETURN_LINES[who] ?? []).filter(s =>
    (s.when ?? []).every(f => flags.has(f)) && !(s.not ?? []).some(f => flags.has(f)));
  if (!sets.length) return null;
  const fresh = (lines: string[]) => lines.filter(l => !flags.has(lineKey(who, l)));
  const lastPrefix = `said-last:${who}:`;
  const lastFlag = [...flags].find(f => f.startsWith(lastPrefix));
  const lastKey = lastFlag ? `said:${who}:${lastFlag.slice(lastPrefix.length)}` : null;
  if (!sets.some(s => fresh(s.lines).length)) {
    // run out: start over, except the line just said, so it isn't heard twice in a row
    for (const s of sets) for (const l of s.lines) { const k = lineKey(who, l); if (k !== lastKey) flags.delete(k); }
  }
  const pool = [...sets].reverse().map(s => fresh(s.lines)).find(p => p.length)
    ?? sets.flatMap(s => s.lines); // only one line fits right now: say it again
  const line = pool[Math.floor(rand() * pool.length) % pool.length];
  const key = lineKey(who, line);
  flags.add(key);
  if (lastFlag) flags.delete(lastFlag);
  flags.add(lastPrefix + key.slice(`said:${who}:`.length));
  return line;
}
