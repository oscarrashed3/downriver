// World 2, the Sky Isles: what the windfolk say. Lark (the friend), Zephy (the rival), Gran Wren (the old
// champion), the sail-mender and the chime-maker. Joined into SCRIPTS and RETURN_LINES by scripts.ts.
import type { Script } from '../systems/connection';

/** Return-line sets (same shape as scripts.ts ReturnSet). */
interface Set_ { when?: string[]; not?: string[]; lines: string[] }

// the story's states, earliest to latest
const PARTS = { not: ['sky:kite-built'] };
const KITE = { when: ['sky:kite-built'], not: ['sky:ribbon'] };
const QUAL = { when: ['sky:ribbon'], not: ['sky:won'] };
const WON = { when: ['sky:won'], not: ['chapter2-complete'] };
const BACK = { when: ['chapter2-complete'] };

export const SKY_SCRIPTS: Record<string, Script> = {
  lark: {
    id: 'lark', name: 'Lark', title: 'who flies the yellow kite', stranger: 'the girl in the yellow scarf',
    start: { trust: 0.62, worry: 0.2, openness: 0.8 },
    nodes: [
      { type: 'branch', ifFlag: 'chapter2-complete', then: [
        { type: 'say', text: "You came back! The scarf suits you better than me anyway. Don't tell Zephy I said so." },
      ], else: [
        { type: 'branch', ifFlag: 'sky:won', then: [
          { type: 'say', text: 'You beat ZEPHY. Nobody beats Zephy! His face! I will remember his face forever.' },
          { type: 'say', text: "The whale is coming up at Whale's Rest. Everyone's going down to see you off." },
        ], else: [
          { type: 'branch', ifFlag: 'sky:ribbon', then: [
            { type: 'say', text: 'A racer\'s ribbon! We\'re racing each other now. I won\'t go easy on you.' },
            { type: 'say', text: 'The race starts at the gate here in Sailtown. One loop, all six islands.' },
            { type: 'say', text: 'Gran Wren says the waterfall is a shortcut. Gran Wren also says she\'s twenty.' },
          ], else: [
            { type: 'branch', ifFlag: 'sky:kite-built', then: [
              { type: 'say', text: 'Now you need a ribbon, or they won\'t let you race. The qualifier is in the Chime Garden.' },
              { type: 'say', text: 'Fly through the golden rings. Every one plays a note. Zephy will be showing off there.' },
            ], else: [
              { type: 'branch', ifFlag: 'sky:parts-all', then: [
                { type: 'say', text: 'The frame! The cloth! The string! You found them all!' },
                { type: 'say', text: 'GRAN WREN! Come quick! We are building a kite!' },
              ], else: [
              { type: 'branch', ifFlag: 'sky:quest-kite', then: [
                { type: 'say', text: 'The frame is up on Windmill Isle. Sailcloth from the sail-mender. String from the chime-maker.' },
                { type: 'say', text: 'Bring all three here, and Gran Wren and I will help you put it together.' },
              ], else: [
                { type: 'say', text: 'There you are! The one who fell into the pool! I\'m Lark.' },
                { type: 'ask', cards: [
                  { kind: 'open', text: 'How do I ride the whale down?', gives: ['sky:quest-kite'],
                    reply: ['You win the race. And to race, you need a kite.', 'Nobody lends a stranger a kite on race day. Not even me. Sorry.'] },
                  { kind: 'leading', text: 'Can I borrow your kite?', gives: ['sky:quest-kite'],
                    reply: ['Ha! No. Nobody lends a kite on race day. It\'s bad luck.', 'But you could build one. I\'ll help.'] },
                ] },
                { type: 'say', text: 'A kite needs three things. A frame, sailcloth, and string.' },
                { type: 'silence', seconds: 2, reward: 'And a bit of nerve. You have that. You fell out of the sky and laughed.' },
                { type: 'say', text: 'The frame is on top of Windmill Isle. Climb the windmill, or ride a sail up.' },
                { type: 'say', text: 'Old Fenn the sail-mender has sailcloth. Pell, in the Chime Garden, has string.' },
                { type: 'give', items: ['sky:quest-kite', 'map:sky'] },
              ] },
            ] },
          ] },
        ] },
      ] },
      ] },
    ],
    after: ['See you up there!'],
  },

  zephy: {
    id: 'zephy', name: 'Zephy', title: 'who has won three years running', stranger: 'the boy in the red scarf',
    start: { trust: 0.42, worry: 0.15, openness: 0.55 },
    hint: 'Zephy pretends not to watch you. He is watching you.',
    nodes: [
      { type: 'branch', ifFlag: 'sky:won', then: [
        { type: 'say', text: '...The waterfall. You went through the waterfall. Nobody goes through the waterfall.' },
        { type: 'silence', seconds: 2.2, reward: 'Fine. Good race. A really good race, actually. Don\'t let it go to your head.' },
      ], else: [
        { type: 'branch', ifFlag: 'sky:kite-built', then: [
          { type: 'say', text: 'You actually built one. Out of a paper boat. Huh.' },
          { type: 'say', text: 'The qualifier is in the Chime Garden. Watch me do it first. Learn something.' },
          { type: 'branch', ifFlag: 'sky:ribbon', then: [
            { type: 'say', text: 'So you got a ribbon. Good. I like winning against someone.' },
          ] },
        ], else: [
          { type: 'say', text: 'New face. You\'re not racing, are you? You don\'t even have a kite.' },
          { type: 'say', text: 'I\'m Zephy. Three years running. Ask anyone. Ask the whales.' },
          { type: 'ask', cards: [
            { kind: 'open', text: 'I\'m going to build one.', reply: ['Out of what? Wishes?', '...Fine. Build one, and I\'ll race you. Don\'t cry when you lose.'] },
            { kind: 'judging', text: 'Three years? Maybe they let you win.', reply: ['Let me WIN?', 'Nobody lets anybody win up here. You\'ll see.'] },
          ] },
        ] },
      ] },
    ],
    after: ['Red scarf. First across the line. Remember it.'],
  },

  granwren: {
    id: 'granwren', name: 'Gran Wren', title: 'who won the races long ago', stranger: 'the old woman with the cane',
    start: { trust: 0.6, worry: 0.2, openness: 0.7 },
    nodes: [
      { type: 'branch', ifFlag: 'sky:won', then: [
        { type: 'say', text: 'Through the waterfall and up the last gust. I couldn\'t have flown it better at your age.' },
        { type: 'say', text: 'Well. I could. But only just.' },
      ], else: [
        { type: 'branch', ifFlag: 'sky:ribbon', then: [
          { type: 'say', text: 'A tip, for the race: the big waterfall off Sailtown hides the short way round.' },
          { type: 'say', text: 'And the last gust before the line always comes from below. Be low when it comes.' },
        ], else: [
          { type: 'branch', ifFlag: 'sky:kite-built', then: [
            { type: 'say', text: 'Read the updrafts: where the petals rise, the air rises. Fly into them and let go.' },
            { type: 'say', text: 'Dive to gain speed. Then pull up, and the speed turns back into height.' },
          ], else: [
            { type: 'say', text: 'A new flyer! I can always tell. You look at the sky like it owes you money.' },
            { type: 'say', text: 'I won the races eleven times. Now I race for the fun of losing to children.' },
            { type: 'silence', seconds: 2, reward: 'Build your kite, little one. I\'ll show you how to tie it, when you have the parts.' },
          ] },
        ] },
      ] },
    ],
    after: ['Wind under you, and nothing in the way.'],
  },

  mender: {
    id: 'mender', name: 'Old Fenn', title: 'who mends the sails', stranger: 'the old man with the needle',
    start: { trust: 0.5, worry: 0.35, openness: 0.5 },
    nodes: [
      { type: 'branch', ifFlag: 'sky:part-cloth', then: [
        { type: 'say', text: 'That cloth will hold. I sewed it twice. I sew everything twice.' },
      ], else: [
        { type: 'branch', ifFlag: 'sky:laundry', then: [
          { type: 'say', text: 'My shirt! My sock! My good sheet! Not a speck of cloud on any of it.' },
          { type: 'say', text: 'A bargain is a bargain. My best sailcloth. Sewn twice round the edges.' },
          { type: 'give', items: ['sky:part-cloth'] },
        ], else: [
        { type: 'branch', ifFlag: 'sky:quest-cloth', then: [
          { type: 'say', text: 'My washing is still blowing about. Catch it before it reaches the clouds.' },
        ], else: [
          { type: 'say', text: 'Mind the sails. Wet paint. Well. Wet cloth. Same thing up here.' },
          { type: 'say', text: 'Sailcloth? For a kite? On race day? Everyone wants sailcloth on race day.' },
          { type: 'silence', seconds: 2, reward: 'Hmph. The wind took my washing off the line again this morning.' },
          { type: 'say', text: 'Catch my laundry before it blows off the island, and the best cloth I have is yours.' },
          { type: 'give', items: ['sky:quest-cloth'] },
        ] },
      ] },
      ] },
    ],
    after: ['Twice. Always sew it twice.'],
  },

  chimer: {
    id: 'chimer', name: 'Pell', title: 'the chime-maker', stranger: 'the chime-maker in the spectacles',
    start: { trust: 0.5, worry: 0.4, openness: 0.6 },
    nodes: [
      { type: 'branch', ifFlag: 'sky:part-string', then: [
        { type: 'say', text: 'Listen. Every ring in the garden in tune. That\'s you, that is.' },
      ], else: [
        { type: 'branch', ifFlag: 'sky:chime-tuned', then: [
          { type: 'say', text: 'I heard it from inside! True as a bird. You have good ears, little one.' },
          { type: 'say', text: 'A whole spool, as promised. Waxed, three-ply. It will never snap.' },
          { type: 'give', items: ['sky:part-string'] },
        ], else: [
        { type: 'branch', ifFlag: 'sky:quest-string', then: [
          { type: 'say', text: 'The sour chime hangs by the workshop door. Turn the weight until it sings true.' },
        ], else: [
          { type: 'say', text: 'Shh. Listen. Hear that? One of them is flat. It has been flat all week.' },
          { type: 'say', text: 'String, you say? I have the best string on the isles. Waxed, three-ply, never snaps.' },
          { type: 'say', text: 'Retune my sour chime for me, and you can have a whole spool.' },
          { type: 'give', items: ['sky:quest-string'] },
        ] },
      ] },
      ] },
    ],
    after: ['Every chime has one true note. Most people only have one, too.'],
  },
};

export const SKY_RETURN_LINES: Record<string, Set_[]> = {
  lark: [
    { lines: [
      'My braids are lucky. I re-tie them every race day. Three knots each.',
      'I\'ve fallen off every island at least once. Clouds are soft. Mostly.',
      'Have you seen the whales up close? Their eyes are as big as you.',
      'When I was little I thought the wind lived in the windmills.',
      'Mum says I was born in a gust. That explains a lot, she says.',
      'Zephy\'s not mean. He\'s just been winning too long.',
    ] },
    { ...PARTS, lines: [
      'Windmill Isle is the tall one. You can see it from everywhere.',
      'Old Fenn grumbles, but he gives the best cloth on the isles.',
      'Pell hears notes nobody else can hear. Be patient with Pell.',
    ] },
    { ...KITE, lines: [
      'Your kite looks like nobody else\'s. That\'s good. That\'s the best kind.',
      'In the qualifier, don\'t chase the rings. Let them come to you.',
      'If you miss a ring you only lose its note. Nobody minds a wrong note.',
    ] },
    { ...QUAL, lines: [
      'I\'m going to beat you. Probably. Maybe. Let\'s see.',
      'Stay low on the last stretch. Everyone forgets the last stretch.',
    ] },
    { ...WON, lines: [
      'You really won. I keep saying it out loud so it stays true.',
      'Don\'t go yet. Well. Go. But not yet.',
    ] },
    { ...BACK, lines: [
      'You came back to visit! Nobody ever comes back. It\'s windy, I suppose.',
      'I\'m teaching Zephy the waterfall. He hates it. He\'s getting good.',
    ] },
  ],
  zephy: [
    { lines: [
      'I could fly before I could walk. Ask my mum. Actually, don\'t.',
      'Red is the fastest colour. That\'s just science.',
      'The whales like me. One winked at me once. I\'m almost sure.',
      'I don\'t practise. I just fly. Okay. I practise a bit.',
      'Lark talks too much. Don\'t tell her I said that.',
      'Gran Wren still beats me sometimes. On purpose, I think.',
    ] },
    { ...PARTS, lines: [
      'Still no kite? The race won\'t wait for you, you know.',
      'A paper boat is not a kite. I\'m just saying.',
      'Windmill Isle? You\'ll never get up there. ...You might, actually.',
    ] },
    { ...KITE, lines: [
      'Your wing is crooked. No, it isn\'t. I was testing you.',
      'Watch my qualifier. Watch it twice. Then you\'ll know how.',
    ] },
    { ...QUAL, lines: [
      'See you at the gate. Bring a hanky.',
      'Nobody passes me on the last gust. Nobody.',
      'Don\'t even think about the waterfall. It\'s a bad idea. For you.',
    ] },
    { ...WON, lines: [
      'Next year. Next year I\'m taking the waterfall.',
      'You were lucky. And good. Mostly lucky. Fine, mostly good.',
    ] },
    { ...BACK, lines: [
      'You came back? To lose to me this time, I hope.',
      'I tried the waterfall. I got so wet. Don\'t laugh.',
    ] },
  ],
  granwren: [
    { lines: [
      'I flew my first race on a bedsheet and two broom handles.',
      'The cane is for show. Mostly. My knees disagree.',
      'Whales are slow because they\'re in no hurry. Learn from whales.',
      'The wind always comes back. Like an old cat.',
      'Lark has her mother\'s nerve. Zephy has his grandfather\'s mouth.',
      'Eleven wins. I keep the ribbons in a teapot.',
    ] },
    { ...PARTS, lines: [
      'A kite is just a promise between some sticks and the wind.',
      'Three parts, one wing. Then the sky does the rest.',
      'When you have all three, bring them. My fingers still know the knots.',
    ] },
    { ...KITE, lines: [
      'Petals rising? That\'s an updraft. Glide in and sit on it.',
      'Dive when you need speed. Climb when you need time.',
    ] },
    { ...QUAL, lines: [
      'Bounce off the cloud pads. They don\'t mind. They like it.',
      'The narrow gap between the islands: go through it flat, not banked.',
      'Low on the last stretch, little one. The last gust comes from below.',
    ] },
    { ...WON, lines: [
      'I cheered so hard I lost my hat. Worth it.',
      'Go well. Fly low over the hard parts.',
    ] },
    { ...BACK, lines: [
      'Back again! You have the look of someone who has seen a garden.',
      'Twelve wins, if you count yours. I\'m counting yours.',
    ] },
  ],
  mender: [
    { lines: [
      'Every sail on these isles has passed through my hands. Twice.',
      'Salt from the clouds gets in everything. Even the needles.',
      'I don\'t fly. Somebody has to stay down and mend.',
      'Wind is a terrible guest. It takes everything off the line.',
      'My hut leans because the wind leans on it. We\'ve agreed to disagree.',
      'Hold the cloth up to the sun. Good cloth glows.',
    ] },
    { ...PARTS, lines: [
      'Washing all over the island, again. Every race day. Every one.',
      'Cloth for a kite should be light, and stubborn. Like you.',
      'If it blows off the edge it\'s gone. The clouds keep everything.',
    ] },
    { ...KITE, lines: [
      'How is my cloth holding up? Of course it\'s holding. I sewed it.',
      'Mind the stitches on the left. No, the other left.',
    ] },
    { ...QUAL, lines: [
      'Racing! On my cloth! Don\'t tear it. Well. Tear it a little. For luck.',
      'I\'ll watch from here. I can see the whole course from my steps.',
    ] },
    { ...WON, lines: [
      'My cloth won the race. And you, I suppose. You helped.',
    ] },
    { ...BACK, lines: [
      'You again! Need anything mended? Everything needs mending.',
      'The washing\'s still on the line. Miracles happen.',
    ] },
  ],
  chimer: [
    { lines: [
      'Every chime has one true note. My job is to find it.',
      'Brass for the high notes, bell-bronze for the low ones.',
      'The wind plays them all day. I only fix its mistakes.',
      'When all the chimes ring at once, someone has done something wonderful.',
      'I can tell the weather by the chimes. Today they say: race day.',
      'Hum with me. No? Nobody hums anymore.',
    ] },
    { ...PARTS, lines: [
      'The sour one is driving me to distraction. Ting. Tonk. Ting. Tonk.',
      'A spool of my string will hold a whale. A small whale.',
      'Turn a chime\'s weight slowly. Listen while you turn.',
    ] },
    { ...KITE, lines: [
      'The rings in the garden are chimes too. Fly through and they sing.',
      'Fly a clean run and you\'ll hear the old festival song.',
    ] },
    { ...QUAL, lines: [
      'Every ring on the race course is tuned. Listen for your own tune.',
      'I tuned the finish chimes this morning. They\'re waiting for you.',
    ] },
    { ...WON, lines: [
      'Every chime on every island rang for you. I\'ve never heard that.',
    ] },
    { ...BACK, lines: [
      'You came back! The chimes noticed before I did.',
      'I wrote a new tune. It goes like a whale diving. Listen.',
    ] },
  ],
};
