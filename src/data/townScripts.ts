// World 3, the Walking Town: what the Mossfolk of Mossrest say. Pip (the friend), Old Bramwyn the gardener, the
// Miller, Tamsin the Ropewright, and six Mossfolk with a theory each about why Old Amble stopped walking.
// Joined into SCRIPTS and RETURN_LINES by scripts.ts (the ids never clash with the other worlds').
import type { Script } from '../systems/connection';

interface Set_ { when?: string[]; not?: string[]; lines: string[] }

// the story's states, earliest to latest (the three steps are locked: the foot, then the water, then the eyes)
const LANDED = { when: ['town:arrived'], not: ['town:quest'] };
const FOOT = { when: ['town:quest'], not: ['town:foot-done'] };
const WATER = { when: ['town:foot-done'], not: ['town:water-done'] };
const EYES = { when: ['town:water-done'], not: ['town:eyes-done'] };
const WALKING = { when: ['town:eyes-done'] };

export const TOWN_SCRIPTS: Record<string, Script> = {
  pip: {
    id: 'pip', name: 'Pip', title: 'who knows every stair in Mossrest', stranger: 'the kid in the straw hat',
    start: { trust: 0.7, worry: 0.2, openness: 0.85 },
    nodes: [
      { type: 'branch', ifFlag: 'town:quest', then: [
        { type: 'branch', ifFlag: 'town:met-tamsin', then: [
          { type: 'say', text: "Tamsin's ropes go all the way down to the meadow. Hold on with both hands. I do. Mostly." },
        ], else: [
          { type: 'say', text: "Tamsin's up by the big rope on the front leg. She'll know what's wrong with the foot." },
          { type: 'say', text: 'She knows every knot on Amble. She says knots are just ropes holding hands.' },
        ] },
      ], else: [
        { type: 'say', text: 'You fell out of the SKY. Under a paper umbrella. With a FOX.' },
        { type: 'say', text: "I'm Pip. Nobody falls out of the sky here. Things fall off Amble, not onto it." },
        { type: 'ask', cards: [
          { kind: 'open', text: 'Where am I?', gives: [],
            reply: ["Mossrest! The village on Old Amble's back. Amble's the big one. Under us.", "Amble used to walk all the way round the world. Slow as moss, but always going."] },
          { kind: 'leading', text: 'Why is everyone staring?', gives: [],
            reply: ["Because you're new. Nobody's been new in weeks.", "Also because of the umbrella. Bramwyn wants to know where you got paper like that."] },
        ] },
        { type: 'say', text: "But Amble hasn't moved in weeks. Not one step. The windmills stopped. The rain pools are dry." },
        { type: 'silence', seconds: 2, reward: "Everyone has a theory. Old Hobb says it's sulking. I think it's hurting somewhere and can't say." },
        { type: 'say', text: "Tamsin the Ropewright says its front foot's sore. She's up by the big rope on the front leg." },
        { type: 'say', text: "If Amble walks again, it'll take you anywhere you want to go. That's what Amble does." },
        { type: 'give', items: ['town:quest'] },
      ] },
    ],
  },
  ropewright: {
    id: 'ropewright', name: 'Tamsin', title: 'the Ropewright', stranger: 'the woman with the coil of rope',
    start: { trust: 0.5, worry: 0.45, openness: 0.55 },
    nodes: [
      { type: 'branch', ifFlag: 'town:quest', then: [
        { type: 'say', text: "So you're the one who came down under a paper hat. Pip's told everyone twice." },
        { type: 'say', text: "Look at the front foot, down there. Amble holds it off the ground, then sets it down so gently. It's hurting." },
        { type: 'ask', cards: [
          { kind: 'open', text: 'What can I do?', gives: ['town:met-tamsin'],
            reply: ["Go down and look. You're small enough to get between the toes, and so's your fox.", 'This rope goes all the way to the grass. I made it myself. It holds a cart.'] },
          { kind: 'leading', text: 'Why not go yourself?', gives: ['town:met-tamsin'],
            reply: ["I've been down twice. Whatever's in there, my hands are too big to reach it.", "And Amble flinches when I come near that foot. It doesn't flinch at you. I watched."] },
        ] },
        { type: 'say', text: 'Hold on with both hands, and come back up by the same rope. I keep it greased with goose fat.' },
        { type: 'give', items: ['town:met-tamsin'] },
      ], else: [
        { type: 'say', text: "Mind the rope. That's three days of splicing." },
        { type: 'say', text: "Talk to Pip, new one. Pip talks to everyone first. It's a rule Pip made." },
      ] },
    ],
  },
  bramwyn: {
    id: 'bramwyn', name: 'Old Bramwyn', title: 'who keeps the moss', stranger: 'the old woman with the basket',
    start: { trust: 0.6, worry: 0.35, openness: 0.6 },
    nodes: [
      { type: 'say', text: "Hm. A child from the sky. Well, sit down before you fall over again." },
      { type: 'say', text: "I've kept Amble's moss since I was smaller than Pip. Seventy years of moss. It grows wherever it likes." },
      { type: 'ask', cards: [
        { kind: 'open', text: 'Is Amble ill?', gives: [],
          reply: ["Not ill. Stuck. There's a difference, though it looks the same from up here.", 'An ill thing turns away from you. Amble still turns its eye to me. I think.'] },
        { kind: 'leading', text: 'What do the vines do?', gives: [],
          reply: ['Keep the rain in, keep the shell cool, keep the birds happy. Mostly they just grow.', "Some days I think they grow faster than I can cut. Old hands, young vines."] },
      ] },
      { type: 'say', text: 'Go on, then. Help the others first. I always come last. Moss is patient.' },
    ],
  },
  miller: {
    id: 'miller', name: 'the Miller', title: 'who ran the two windmills', stranger: 'the big man with the mug',
    start: { trust: 0.55, worry: 0.4, openness: 0.5 },
    nodes: [
      { type: 'say', text: "Tea? No? More for me. Everything's stopped, but the kettle still works." },
      { type: 'say', text: 'Those two mills used to pump rain from the pools up top, down a wooden channel, all the way to Amble\'s mouth.' },
      { type: 'say', text: "A storm took a sail off the old mill and broke the channel. Now Amble's thirsty, and so are my flowers." },
      { type: 'silence', seconds: 2, reward: "I'd fix it myself. But I'm the size of a door, and the channel runs where only small people fit." },
      { type: 'say', text: 'One thing at a time, though. Tamsin says the foot. Start with the foot.' },
    ],
  },
  moss1: { id: 'moss1', name: 'a Mossfolk gardener', title: 'who thinks it is sulking', start: { trust: 0.5, worry: 0.3, openness: 0.6 },
    nodes: [{ type: 'say', text: "It's sulking, that's what. We forgot its birthday. Nobody knows when it is, mind." }, { type: 'say', text: 'Try singing to it. I did. It sulked harder.' }] },
  moss2: { id: 'moss2', name: 'a Mossfolk weaver', title: 'who thinks it is just old', start: { trust: 0.55, worry: 0.35, openness: 0.5 },
    nodes: [{ type: 'say', text: "It's just old. Old things sit down. My granny sat down for a whole winter once." }, { type: 'say', text: 'Then one morning she got up and made pancakes. So you never know.' }] },
  moss3: { id: 'moss3', name: 'a Mossfolk baker', title: 'who thinks it misses the sea', start: { trust: 0.6, worry: 0.4, openness: 0.55 },
    nodes: [{ type: 'say', text: 'It misses the sea. We used to walk to the coast every summer. It would stand in the shallows for days.' }, { type: 'say', text: "You can see the sea from the tail end, on a clear day. Amble looks that way a lot." }] },
  moss4: { id: 'moss4', name: 'a Mossfolk fisher', title: 'who thinks it is waiting', start: { trust: 0.45, worry: 0.3, openness: 0.5 },
    nodes: [{ type: 'say', text: "It's waiting. For what, I don't know. For someone. Maybe for you, fox and all." }, { type: 'say', text: "Don't let that go to your head. It also waited for a cloud once. Took a week." }] },
  moss5: { id: 'moss5', name: 'a Mossfolk potter', title: 'who thinks it is listening', start: { trust: 0.5, worry: 0.45, openness: 0.45 },
    nodes: [{ type: 'say', text: 'It heard something far away and stopped to listen. Hush a moment. There. Did you hear it?' }, { type: 'say', text: "No. Me neither. But Amble's ears are bigger than ours." }] },
  moss6: { id: 'moss6', name: 'a Mossfolk carpenter', title: 'who thinks it is tired of us', start: { trust: 0.4, worry: 0.5, openness: 0.4 },
    nodes: [{ type: 'say', text: "I think it's tired of carrying us. Forty houses, two windmills and Bramwyn's cabbages." }, { type: 'say', text: "I'd stop too. I've been building lighter chairs, just in case." }] },
};

export const TOWN_RETURN_LINES: Record<string, Set_[]> = {
  pip: [
    { lines: [
      'Want to see the top of the windmill? You can see three hills and a lake. And the sea, if you squint.',
      "My hat used to be my mum's. The moss on it is older than me.",
      "I know every stair in Mossrest. There are two hundred and eleven. I counted twice and got two numbers.",
    ] },
    { ...LANDED, lines: [
      'Everyone wants to meet you. Well. Everyone wants to look at you. Same thing.',
      "Does your umbrella talk? It looked at me. I'm sure it looked at me.",
    ] },
    { ...FOOT, lines: [
      "Tamsin's up by the front leg. Big rope, you can't miss it. Well, you can. But don't.",
      "Your fox can fit places I can't. I tried to fit in a teapot once. It didn't go well.",
      "When Amble lifts that foot, the whole village tips a little. Mum's soup slides to one side of the pot.",
      'If you fall off, open the umbrella. Oh. It opens itself. Lucky.',
    ] },
    { ...WATER, lines: [
      'Amble put its foot down! The whole street shook! Mrs Hobb dropped her pie and laughed.',
      "The Miller says it's thirsty now. I'd be thirsty too, after weeks of standing about.",
      "The broken windmill lost a sail in the storm. It blew into somebody's garden. Ask around.",
    ] },
    { ...EYES, lines: [
      "Water's running again! I put my whole face in the channel. Don't tell Bramwyn.",
      "Bramwyn's been staring at Amble's head all morning. She's thinking. You can tell by the frown.",
      "It still won't walk. Maybe it's shy now, with everyone watching.",
    ] },
    { ...WALKING, lines: [
      'WE ARE WALKING. I keep saying it. We are walking!',
      "I've lived here my whole life and I've never been this happy that the floor is moving.",
      "When you go, I'm going to wave until you're a dot. Then I'll wave at the dot.",
    ] },
  ],
  ropewright: [
    { lines: [
      "A rope's only as good as the last person who checked it. That's me. Every morning.",
      'Goose fat, beeswax, and patience. That\'s the whole secret of a good rope.',
      'Twelve ropes and four ladders down the legs. I know each one by its creak.',
    ] },
    { ...LANDED, lines: [
      "Pip first. Then me. That's how it goes here. Go on, Pip's bursting.",
    ] },
    { ...FOOT, lines: [
      "Both hands on the rope, feet together. Let the rope do the work, not your arms.",
      "Something's wedged in that foot. I'd bet my best splice on it.",
      "When you find it, shout. I'll rig a pulley up here. Everyone in Mossrest will pull if I ask.",
      'Watch Amble\'s toes. It twitches them when it hurts. Like you would.',
      "The front leg's rope is the thickest one. I made it for my father. He was not a small man.",
    ] },
    { ...WATER, lines: [
      'A stone the size of a bread oven. In a foot. And Amble never complained once.',
      "Best pull I've ever been part of. My arms are still singing.",
      "I'm keeping that stone. I'll put it by my door and tell the story to anyone who trips on it.",
    ] },
    { ...EYES, lines: [
      'The ropes are holding fine. Better than fine. Amble stands easier now.',
      "Bramwyn wants a line up to the antlers. I've tied her one. Don't tell her it's my second best.",
    ] },
    { ...WALKING, lines: [
      "Every rope singing at once. Hear that? That's Amble walking.",
      "I'll have to check all of them twice a day now. I don't mind. I'd check them ten times for this.",
      'Come back one day and I\'ll teach you a knot nobody else knows. Not even Pip.',
    ] },
  ],
  bramwyn: [
    { lines: [
      'Moss on the north side, ferns on the south, and cabbages wherever I can sneak them in.',
      "My knees creak like Amble's. We're about the same age, give or take a century.",
      "I talk to the vines. They don't listen, but they grow straighter for it.",
    ] },
    { ...LANDED, lines: [
      "Where did you get that paper? It's finer than anything on this shell. I'd plant seeds in a sheet like that.",
      'Pip will have told you everything already, and some things twice. Pip is a good child.',
    ] },
    { ...FOOT, lines: [
      'The foot first, Tamsin says. Tamsin is usually right. Don\'t tell her I said so.',
      "Mind the vines on the ropes. Some are stronger than the ropes. Some are not.",
      "I've grown moss on every stone of this village. Except the one in Amble's foot, apparently.",
    ] },
    { ...WATER, lines: [
      'The foot is down. Good. Now the poor thing needs a drink. Ask the Miller, he talks about water all day.',
      "Thirsty moss goes grey at the tips. Look at the shell. Grey everywhere.",
      'The lost sail? Blown into a garden, I heard. Not mine. Mine would have eaten it.',
    ] },
    { ...EYES, lines: [
      "It drinks, it stands, and still it won't go. Hm. Let me look at it properly.",
      'Seventy years I have trimmed this shell. Seventy years, and never once looked at its face.',
      "Bring the fox. Foxes are good at telling you where you haven't looked.",
    ] },
    { ...WALKING, lines: [
      "It could see. That's all it was. It just couldn't see where to go.",
      'Seventy years of moss, and the most important trimming I ever did was the last one.',
      "Take a jar of the moss with you. It'll grow anywhere. So will you.",
    ] },
  ],
  miller: [
    { lines: [
      'Tea. The answer is always tea. The question can wait.',
      "My grandfather built the first mill. I built the second. My hands still smell of flour from both.",
      "When the sails turn, you can hear them from the tail end. A sort of whoosh, whoosh. I miss it.",
    ] },
    { ...LANDED, lines: [
      "New face! Pip found you first, did they? Pip always finds the new ones first.",
      'Fell from the sky, I heard. Sit down, have some tea, tell me what clouds taste like.',
    ] },
    { ...FOOT, lines: [
      "The foot comes first. I can't fix water for something that won't stand on its own feet.",
      "Tamsin's ropes are good ropes. Strong enough for me, even. I've never tested that. I'd like not to.",
      "My mug's been cold for an hour. I forget to drink it, watching Amble's foot.",
    ] },
    { ...WATER, lines: [
      'Now we talk water. The old mill needs its sail back, and the channel needs mending, piece by piece.',
      'The sail blew off in the storm and came down in somebody\'s garden. A big thing, white linen, a wooden frame.',
      "The carpenter's yard has channel pieces stacked up. Carry them down, set them in the gaps. They click in.",
      "When it all runs, open the sluice at the top. And then stand back. Water's quicker than you think.",
    ] },
    { ...EYES, lines: [
      'Listen to that. Whoosh, whoosh. I could cry. I might, a bit.',
      "Amble drank for an hour. I timed it. With my tea.",
      'Head up a little now, see? Not all the way. Something else is still wrong.',
    ] },
    { ...WALKING, lines: [
      'Both mills turning and the whole village walking. I never thought I\'d see it again.',
      "I've put the kettle on for the whole street. It's going to take a while.",
      "Come back hungry one day. I'll have flour again, now the wheat fields come to us.",
    ] },
  ],
  moss1: [{ lines: ["Sulking. Definitely sulking. Look at the way it holds its head.", "We could bake it a cake. A very big cake.", "It sighed this morning. Sulkers sigh."] }],
  moss2: [{ lines: ["Old, I tell you. Old as the hills. Older. The hills were young when Amble was born.", "My knees know how Amble feels.", "Give it a nap, it'll be right as rain."] }],
  moss3: [{ lines: ['Salt in the air, on a south wind. Amble lifts its nose when it comes.', "I bake sea-biscuits every summer for the trip. Nobody's eaten them this year.", 'One day we will walk to the coast again. I have my bucket ready.'] }],
  moss4: [{ lines: ['Waiting is a thing big creatures are good at.', 'Some say it waited a hundred years for the first villagers to climb up.', 'If it was waiting for you, it is still waiting. So. Do something.'] }],
  moss5: [{ lines: ['Shh. There. No. Maybe.', 'I hear it humming at night. Low, like a cello.', "Its ear turns to the east sometimes. Nothing's ever there."] }],
  moss6: [{ lines: ['Lighter chairs. Lighter tables. Lighter everything.', "I've stopped eating bread. Every bit helps.", "If it ever walks again, I'll put the heavy chairs back. Promise."] }],
};
