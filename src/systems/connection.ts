// Connection system: conversation as gentle gameplay, not a menu of right answers.
// Each stranger has hidden trust / worry / openness, shown only through body language.
//  - Listen: hold to stay present while they talk. Releasing mid-line is interrupting.
//  - Silence: sometimes they pause. Staying present through it lets them say more.
//  - Ask: question cards. Open questions open people up; leading or judging ones close them.
//  - Apologize: appears only when something you did hurt this person.

export type CardKind = 'open' | 'leading' | 'judging' | 'apology' | 'neutral';

export interface Card {
  text: string;
  kind: CardKind;
  reply: string[];
  /** Effects applied when chosen (flags, items, powers, quests). */
  gives?: string[];
  /** Only show this card if all these flags are set. */
  requires?: string[];
  /** Hide this card if any of these flags are set. */
  hiddenIf?: string[];
}

export type Node =
  | { type: 'say'; text: string }
  | { type: 'silence'; seconds: number; reward: string }
  | { type: 'ask'; cards: Card[] }
  | { type: 'gate'; minTrust: number; pass: Node[]; fail: string[] }
  | { type: 'give'; items: string[] }
  | { type: 'branch'; ifFlag: string; then: Node[]; else?: Node[] };

export interface Mood { trust: number; worry: number; openness: number }

export interface Script {
  id: string;
  name: string;
  title: string;
  /** What the player calls them before they have met ("the old woman"). */
  stranger?: string;
  start: Mood;
  /** Chosen script by the game state when the player talks; first match wins. */
  nodes: Node[];
  /** What they say when the player returns after the conversation ended. */
  after?: string[];
  /** Hint line if a conversation went badly; the world nudges toward what they needed. */
  hint?: string;
}

export interface Ctx {
  flags: Set<string>;
  give(item: string): void;
}

export const EFFECT = {
  listenedLine: { trust: 0.05, openness: 0.02 },
  interrupted: { trust: -0.09, openness: -0.06 },
  silenceKept: { trust: 0.1, openness: 0.08 },
  card: {
    open: { trust: 0.06, openness: 0.14, worry: -0.04 },
    leading: { trust: -0.05, openness: -0.12, worry: 0.02 },
    judging: { trust: -0.14, openness: -0.08, worry: 0.08 },
    apology: { trust: 0.22, openness: 0.1, worry: -0.1 },
    neutral: { trust: 0, openness: 0, worry: 0 },
  } as Record<CardKind, Partial<Mood>>,
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export type Step =
  | { kind: 'line'; text: string; silenceReward?: false }
  | { kind: 'silence'; seconds: number }
  | { kind: 'cards'; cards: Card[] }
  | { kind: 'end' };

/** Runs one conversation. The UI drives timing; the runner owns the rules. */
export class Conversation {
  mood: Mood;
  private queue: Node[];
  private pendingLines: string[] = [];
  private current: Step | null = null;
  private interruptedThisLine = false;
  private silenceHeld = 0;
  private silenceNode: { seconds: number; reward: string } | null = null;
  log: string[] = [];

  constructor(public script: Script, mood: Mood | undefined, private ctx: Ctx) {
    this.mood = mood ? { ...mood } : { ...script.start };
    this.queue = [...script.nodes];
  }

  apply(d: Partial<Mood>) {
    this.mood.trust = clamp01(this.mood.trust + (d.trust ?? 0));
    this.mood.worry = clamp01(this.mood.worry + (d.worry ?? 0));
    this.mood.openness = clamp01(this.mood.openness + (d.openness ?? 0));
  }

  step(): Step {
    if (!this.current) this.current = this.next();
    return this.current;
  }

  private next(): Step {
    if (this.pendingLines.length) {
      this.interruptedThisLine = false;
      return { kind: 'line', text: this.pendingLines.shift()! };
    }
    while (this.queue.length) {
      const n = this.queue.shift()!;
      switch (n.type) {
        case 'say':
          this.interruptedThisLine = false;
          return { kind: 'line', text: n.text };
        case 'silence':
          this.silenceNode = n; this.silenceHeld = 0;
          return { kind: 'silence', seconds: n.seconds };
        case 'ask': {
          const cards = n.cards.filter(c =>
            (!c.requires || c.requires.every(f => this.ctx.flags.has(f))) &&
            (!c.hiddenIf || !c.hiddenIf.some(f => this.ctx.flags.has(f))));
          if (cards.length) return { kind: 'cards', cards };
          break;
        }
        case 'gate':
          if (this.mood.trust >= n.minTrust) this.queue.unshift(...n.pass);
          else { this.pendingLines.push(...n.fail); this.queue = []; this.ctx.flags.add(`closed:${this.script.id}`); }
          break;
        case 'give':
          n.items.forEach(i => this.ctx.give(i));
          break;
        case 'branch':
          this.queue.unshift(...(this.ctx.flags.has(n.ifFlag) ? n.then : (n.else ?? [])));
          break;
      }
      if (this.pendingLines.length) return this.next();
    }
    return { kind: 'end' };
  }

  /** The player let go of Listen while a line was still being spoken. */
  interrupt() {
    if (this.current?.kind !== 'line' || this.interruptedThisLine) return;
    this.interruptedThisLine = true;
    this.apply(EFFECT.interrupted);
  }

  /** A line was heard to the end. */
  finishLine() {
    if (this.current?.kind !== 'line') return;
    if (!this.interruptedThisLine) this.apply(EFFECT.listenedLine);
    this.log.push(this.current.text);
    this.current = null;
  }

  /** Called every frame during a silence. Returns true when the silence resolves. */
  holdSilence(dt: number, holding: boolean): boolean {
    if (this.current?.kind !== 'silence' || !this.silenceNode) return true;
    if (!holding) { // the moment passes, no penalty, but the reward is missed
      this.silenceNode = null; this.current = null; return true;
    }
    this.silenceHeld += dt;
    if (this.silenceHeld >= this.silenceNode.seconds) {
      this.apply(EFFECT.silenceKept);
      this.pendingLines.push(this.silenceNode.reward);
      this.silenceNode = null; this.current = null;
      return true;
    }
    return false;
  }

  choose(i: number) {
    if (this.current?.kind !== 'cards') return;
    const card = this.current.cards[i];
    if (!card) return;
    this.apply(EFFECT.card[card.kind]);
    card.gives?.forEach(g => this.ctx.give(g));
    this.pendingLines.push(...card.reply);
    this.current = null;
  }
}
