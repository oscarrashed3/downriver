// Nilo's backpack: eight slots of things, the skills he has learned, the letters, and the sketchbook.
// Pure data and rules up top (testable); the overlay that draws it lives in BackpackView below.
import { esc } from '../ui/hud';
import { FOLD_FORMS } from '../player/fold';
import { SKY_LETTER, SKY_TRADES } from '../data/skyStory';

export const SLOTS = 8;

export interface ItemDef { id: string; name: string; text: string; icon: string }

/** Few collectibles, each one with a reason to exist. Icons are drawn with emoji-free little SVG paths. */
export const ITEMS: Record<string, ItemDef> = {
  'item:spar': { id: 'item:spar', name: 'Willow branch', text: 'Straight as a ruler. Tor needs one for his kite.', icon: 'branch' },
  'item:bottle': { id: 'item:bottle', name: "Nima's bottle", text: 'Empty, and very clean. Clouds like clean bottles, Nima says.', icon: 'bottle' },
  'item:cloud': { id: 'item:cloud', name: 'A bottled cloud', text: 'Cold and heavy. There is weather inside.', icon: 'cloud' },
  'item:rails': { id: 'item:rails', name: 'Fence rails', text: "Old Tor's rails, from Bram's shed. Enough for three fences.", icon: 'rails' },
  'item:flower': { id: 'item:flower', name: 'Mountain flower', text: 'Someone might like one.', icon: 'flower' },
  'item:bell': { id: 'item:bell', name: 'Goat bell', text: "Bram's spare. So you can be found in fog, he says.", icon: 'bell' },
  'item:ribbon': { id: 'item:ribbon', name: 'Kite ribbon', text: "A red ribbon from Tor's kite tail. It still smells of wind.", icon: 'ribbon' },
  'item:cloudcard': { id: 'item:cloudcard', name: "Nima's cloud card", text: 'Forty cloud names in very small writing. Big Marguerite is underlined twice.', icon: 'card' },
  'item:pastry': { id: 'item:pastry', name: 'Honey pastry', text: 'Still warm. For luck, the baker said. Someone up here would love it.', icon: 'pastry' },
  'item:feather': { id: 'item:feather', name: 'Gull feather', text: "Old Fenn's best quill. Long and white and very soft.", icon: 'feather' },
  'item:chime': { id: 'item:chime', name: 'Little chime', text: "One of Pell's. It rings when you walk, very quietly.", icon: 'chime' },
  'item:streamer': { id: 'item:streamer', name: 'Festival streamer', text: "Gran Wren's, from the year she won. Faded, and still bright.", icon: 'streamer' },
  'item:racer-ribbon': { id: 'item:racer-ribbon', name: "Racer's ribbon", text: 'Blue and gold. It says you may race in the Sky Races. Zephy tied it on, scowling.', icon: 'ribbon' },
  'item:scarf': { id: 'item:scarf', name: "Lark's yellow scarf", text: 'It still smells of wind and honey pastry. Kept from the Sky Isles.', icon: 'scarf' },
  'item:kite': { id: 'item:kite', name: "Fold's kite frame", text: 'The light frame from the top of the big windmill. Fold folds round it into a paper glider whenever you jump off an edge and hold on. Kept from the Sky Isles.', icon: 'kite' },
  'item:frost': { id: 'item:frost', name: "Hollo's frost", text: 'A snowflake that does not melt. It fell from Hollo\'s cloud onto your hood. Kept from the Spring Peaks.', icon: 'frost' },
};

/** Swaps: give one thing, get another. Nobody sells anything in this valley. */
export interface Trade { npc: string; want: string; give: string; line: string }
export const TRADES: Trade[] = [
  { npc: 'bram', want: 'item:flower', give: 'item:bell', line: "A flower? For me? ...Take the spare bell. So you can be found in fog." },
  { npc: 'tor', want: 'item:bell', give: 'item:ribbon', line: 'A bell for the kite! Now I can hear it in the clouds. Have a ribbon, it is lucky.' },
  { npc: 'nima', want: 'item:ribbon', give: 'item:cloudcard', line: "Red ribbon! The clouds will see me now. Here, my cloud card. Don't lose it." },
  { npc: 'odo', want: 'item:cloudcard', give: 'item:flower', line: "Nima's card! I have wanted one for years. Have a flower from my window box." },
  ...SKY_TRADES,
];

/** What you keep from each world: one object, one skill, one friend. */
export const KEPT: { world: string; flag: string; object: string; skill: string; friend: string }[] = [
  { world: 'The Spring Peaks', flag: 'peaks-healed', object: "Hollo's frost", skill: 'Skyreading', friend: 'Hollo, the cloud over the peaks' },
  { world: 'The Sky Isles', flag: 'chapter2-complete', object: "Lark's yellow scarf and Fold's kite frame", skill: 'Gliding', friend: 'Lark, who flies the yellow kite' },
];

export interface SkillDef { flag: string; name: string; key: string; text: string }
export const SKILLS: SkillDef[] = [
  { flag: 'power:skyreading', name: 'Skyreading', key: 'Q', text: 'See where the wind goes, and where it drops its snow.' },
  { flag: 'power:glide', name: 'Gliding', key: 'Hold Space', text: 'Off an edge, Fold opens into a paper wing. Hold C to dive, let go to land.' },
  { flag: 'power:kite', name: 'Fold the kite', key: 'Hold Space', text: 'While falling, Fold opens into a kite and you glide.' },
  { flag: 'read-letter', name: 'Whistle', key: 'F', text: 'Animals look up. Fold hops.' },
];

/** The keeper's letters, and the replies Nilo can send back with the postman. */
export interface LetterDef {
  id: string; from: string; lines: string[]; replies: string[];
  /** The first line answers what Nilo wrote back to an earlier letter (by reply; '' = no reply). */
  answers?: { to: string; by: Record<string, string> };
  sign?: string;
}
export const LETTERS: LetterDef[] = [
  { id: 'letter:0', from: 'Found in your bag after the storm', lines: ['Nilo. Follow the water. It always finds its way home. But someone up here needs you first.'], replies: [] },
  {
    id: 'letter:1', from: 'Brought by the postman, at the bridge',
    lines: ['You woke him. I knew you would.', 'The water goes down now, and so do you. The islands below are windy. Someone there is waiting.', 'I am always one valley ahead. Do not try to catch me. Just follow the water.'],
    replies: ['Who are you?', 'Hollo says hello.', 'I will follow the water.'],
  },
  { id: SKY_LETTER.id, from: SKY_LETTER.from, lines: SKY_LETTER.lines, answers: SKY_LETTER.answers, sign: SKY_LETTER.sign,
    replies: ["I'm building a kite.", 'Who needs a friend?', 'I will fly anyway.'] },
];

/** A letter's lines as Nilo reads them: the answer to his reply first, when it has one. */
export function letterLines(l: LetterDef, sent: Record<string, string>): string[] {
  if (!l.answers) return l.lines;
  const by = l.answers.by;
  return [by[sent[l.answers.to] ?? ''] ?? by[''], ...l.lines];
}

/** Add to the first empty slot. Returns false when the bag is full. */
export function bagAdd(bag: string[], id: string): boolean {
  if (bag.includes(id) && id !== 'item:flower') return true;
  if (bag.length >= SLOTS) return false;
  bag.push(id);
  return true;
}
export function bagTake(bag: string[], id: string): boolean {
  const i = bag.indexOf(id);
  if (i < 0) return false;
  bag.splice(i, 1);
  return true;
}
/** The swap this person would make with what you carry right now. */
export function tradeFor(bag: string[], npc: string): Trade | null {
  return TRADES.find(t => t.npc === npc && bag.includes(t.want)) ?? null;
}
export function doTrade(bag: string[], t: Trade): boolean {
  if (!bagTake(bag, t.want)) return false;
  bag.push(t.give);
  return true;
}

// ------------------------------------------------------------------ the overlay

export type BagTab = 'bag' | 'letters' | 'sketches';

export interface BagCtx {
  bag: string[];
  flags: Set<string>;
  sketches: { id: string; label: string; img: string }[];
  sent: Record<string, string>;
  /** Someone nearby you could swap with. */
  near: { id: string; name: string } | null;
  onTrade: (t: Trade) => void;
  onReply: (letter: string, reply: string) => void;
}

const ICONS: Record<string, string> = {
  branch: '<path d="M8 40 L40 8" stroke="#7a5a34" stroke-width="4" stroke-linecap="round"/><path d="M26 22 l8 2 M18 30 l-2 -8" stroke="#6a8a3a" stroke-width="3" stroke-linecap="round"/>',
  bottle: '<rect x="16" y="16" width="16" height="24" rx="5" fill="#d8eef4" stroke="#2e2230" stroke-width="2"/><rect x="20" y="8" width="8" height="9" fill="#a88a5a" stroke="#2e2230" stroke-width="2"/>',
  cloud: '<rect x="16" y="16" width="16" height="24" rx="5" fill="#d8eef4" stroke="#2e2230" stroke-width="2"/><circle cx="22" cy="29" r="4" fill="#fff"/><circle cx="27" cy="27" r="5" fill="#fff"/><rect x="20" y="8" width="8" height="9" fill="#a88a5a" stroke="#2e2230" stroke-width="2"/>',
  rails: '<path d="M8 18 H40 M8 30 H40" stroke="#8a6a44" stroke-width="5"/><path d="M14 12 V38 M34 12 V38" stroke="#5a3a24" stroke-width="4"/>',
  flower: '<path d="M24 26 V42" stroke="#4a8a3a" stroke-width="3"/><circle cx="24" cy="20" r="5" fill="#f2c94a"/><g fill="#e87aa0"><circle cx="24" cy="11" r="5"/><circle cx="32" cy="18" r="5"/><circle cx="29" cy="27" r="5"/><circle cx="19" cy="27" r="5"/><circle cx="16" cy="18" r="5"/></g><circle cx="24" cy="20" r="4" fill="#f2c94a"/>',
  bell: '<path d="M14 34 Q14 14 24 12 Q34 14 34 34 Z" fill="#d8a84a" stroke="#2e2230" stroke-width="2"/><circle cx="24" cy="37" r="3" fill="#2e2230"/>',
  ribbon: '<path d="M10 14 Q22 20 18 30 Q14 40 30 38 Q40 36 38 44" fill="none" stroke="#c8443a" stroke-width="5" stroke-linecap="round"/>',
  card: '<rect x="10" y="12" width="28" height="24" rx="2" fill="#f4ead2" stroke="#2e2230" stroke-width="2"/><path d="M14 19 H32 M14 24 H30 M14 29 H26" stroke="#7a7aa8" stroke-width="2"/>',
  scarf: '<path d="M10 14 Q24 8 38 14 L36 22 Q24 17 12 22 Z" fill="#f2c24a" stroke="#2e2230" stroke-width="2"/><path d="M30 20 L34 42 L28 41 L25 21 M20 21 L18 40 L13 38 L16 21" fill="#f2c24a" stroke="#2e2230" stroke-width="2"/>',
  pastry: '<path d="M8 32 Q12 16 24 14 Q36 16 40 32 Z" fill="#e8b45a" stroke="#2e2230" stroke-width="2"/><path d="M14 28 Q18 20 22 26 M24 26 Q28 18 32 26" fill="none" stroke="#b8783a" stroke-width="2"/><path d="M8 32 H40" stroke="#2e2230" stroke-width="2"/>',
  feather: '<path d="M12 40 Q14 18 36 8 Q34 30 12 40 Z" fill="#f4f2ec" stroke="#2e2230" stroke-width="2"/><path d="M12 40 L32 14" stroke="#9a948a" stroke-width="2"/>',
  chime: '<path d="M24 6 V12" stroke="#2e2230" stroke-width="2"/><rect x="18" y="12" width="12" height="4" rx="1" fill="#c8a050" stroke="#2e2230" stroke-width="2"/><path d="M20 16 V36 M24 16 V40 M28 16 V34" stroke="#d8b860" stroke-width="3" stroke-linecap="round"/>',
  streamer: '<path d="M10 10 V42" stroke="#7a5a34" stroke-width="3" stroke-linecap="round"/><path d="M11 12 Q24 8 26 16 Q28 24 40 20" fill="none" stroke="#f2c24a" stroke-width="4" stroke-linecap="round"/><path d="M11 20 Q22 18 24 26 Q26 34 38 32" fill="none" stroke="#4a7cc8" stroke-width="4" stroke-linecap="round"/>',
  kite: '<path d="M24 6 L38 20 L24 40 L10 20 Z" fill="#f6efe0" stroke="#2e2230" stroke-width="2" stroke-linejoin="round"/><path d="M24 6 V40 M10 20 H38" stroke="#a8784a" stroke-width="2"/><path d="M24 40 Q20 44 26 46 Q32 47 28 42" fill="none" stroke="#c8443a" stroke-width="2.5" stroke-linecap="round"/>',
  frost: '<g stroke="#7ac8f0" stroke-width="3" stroke-linecap="round"><path d="M24 8 V40 M10 16 L38 32 M10 32 L38 16"/></g><circle cx="24" cy="24" r="4" fill="#e8f8ff" stroke="#7ac8f0" stroke-width="2"/>',
};
const icon = (k: string) => `<svg viewBox="0 0 48 48" width="48" height="48">${ICONS[k] ?? ''}</svg>`;

export class BackpackView {
  el: HTMLElement;
  tab: BagTab = 'bag';
  private ctx: BagCtx | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'overlay hidden';
    document.getElementById('ui')!.append(this.el);
    this.el.addEventListener('click', e => {
      const t = (e.target as HTMLElement).closest('[data-tab],[data-trade],[data-reply]') as HTMLElement | null;
      if (!t || !this.ctx) return;
      if (t.dataset.tab) { this.tab = t.dataset.tab as BagTab; this.render(this.ctx); }
      else if (t.dataset.trade) { const tr = TRADES[Number(t.dataset.trade)]; this.ctx.onTrade(tr); this.render(this.ctx); }
      else if (t.dataset.reply) { const [l, r] = t.dataset.reply.split('|'); this.ctx.onReply(l, r); this.render(this.ctx); }
    });
  }

  show(on: boolean) { this.el.classList.toggle('hidden', !on); }

  render(c: BagCtx) {
    this.ctx = c;
    const tabs = (['bag', 'letters', 'sketches'] as BagTab[]).map(t => `<button class="tab${t === this.tab ? ' on' : ''}" data-tab="${t}">${t === 'bag' ? 'Backpack' : t === 'letters' ? 'Letters' : 'Sketchbook'}</button>`).join('');
    let body = '';
    if (this.tab === 'bag') {
      const trade = c.near ? tradeFor(c.bag, c.near.id) : null;
      const slots = Array.from({ length: SLOTS }, (_, i) => {
        const id = c.bag[i];
        if (!id) return '<div class="slot empty"></div>';
        const it = ITEMS[id];
        const swap = trade && trade.want === id ? `<button class="swap" data-trade="${TRADES.indexOf(trade)}">Swap with ${esc(c.near!.name)} for: ${esc(ITEMS[trade.give].name)}</button>` : '';
        return `<div class="slot${swap ? ' wanted' : ''}">${icon(it?.icon ?? '')}<div class="sn">${esc(it?.name ?? id)}</div><div class="st">${esc(it?.text ?? '')}</div>${swap}</div>`;
      }).join('');
      const skills = SKILLS.filter(s => c.flags.has(s.flag)).map(s => `<li><b>${esc(s.key)}</b> ${esc(s.name)}: <i>${esc(s.text)}</i></li>`).join('') || '<li class="dim">Nothing yet. People here know things worth learning.</li>';
      const kept = KEPT.filter(k => c.flags.has(k.flag)).map(k => `<div class="kept"><div class="kw">${esc(k.world)}</div><div>Object: <b>${esc(k.object)}</b> &middot; Skill: <b>${esc(k.skill)}</b> &middot; Friend: <b>${esc(k.friend)}</b></div></div>`).join('');
      body = `<div class="slots">${slots}</div>
        <div class="sub">${c.near ? (trade ? `${esc(c.near.name)} is eyeing something in your bag.` : `${esc(c.near.name)} doesn't need anything you carry.`) : 'Stand near someone to swap things.'}</div>
        <h3>What I know how to do</h3><ul class="skills">${skills}</ul>
        <h3>Fold's shapes</h3><div class="forms">${FOLD_FORMS.map(f => c.flags.has(f.flag) ? `<span class="form on" title="${esc(f.text)}">${esc(f.name)}</span>` : `<span class="form" title="${esc(f.world)}">?</span>`).join('')}</div>
        ${kept ? `<h3>Kept from the journey</h3>${kept}` : ''}`;
    } else if (this.tab === 'letters') {
      const mine = LETTERS.filter(l => c.flags.has(l.id) || (l.id === 'letter:0' && c.flags.has('read-letter')));
      body = mine.length ? mine.map(l => {
        const sent = c.sent[l.id];
        const reply = l.replies.length ? (sent ? `<div class="reply">You wrote back: <i>${esc(sent)}</i> <span class="dim">The postman will carry it.</span></div>`
          : `<div class="reply">Write back:${l.replies.map(r => `<button class="card" data-reply="${l.id}|${esc(r)}">${esc(r)}</button>`).join('')}</div>`) : '';
        return `<div class="letterc"><div class="lf">${esc(l.from)}</div>${letterLines(l, c.sent).map(x => `<p>${esc(x)}</p>`).join('')}${l.id !== 'letter:0' ? `<p class="sig">${esc(l.sign ?? 'the one who keeps the light')}</p>` : ''}${reply}</div>`;
      }).join('') : '<p class="dim">No letters yet.</p>';
    } else {
      body = c.sketches.length ? `<div class="sketches">${c.sketches.map(s => `<figure><img src="${s.img}" alt=""/><figcaption>${esc(s.label)}</figcaption></figure>`).join('')}</div>`
        : '<p class="dim">Find a viewpoint, sit down, and the view will draw itself here.</p>';
    }
    this.el.innerHTML = `<div class="sheet bagsheet"><div class="tabs">${tabs}</div><h2>${this.tab === 'bag' ? 'Backpack' : this.tab === 'letters' ? 'Letters' : 'Sketchbook'}</h2>${body}</div>`;
  }
}
