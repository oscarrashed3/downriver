/** A beat in a scripted scene. A beat lasts `dur` seconds, or until the player presses Space when it shows a line. */
export interface Beat {
  dur?: number;
  line?: { who?: string; text: string };
  enter?: () => void;
  /** k runs 0..1 over the beat. */
  tick?: (k: number, dt: number) => void;
  exit?: () => void;
}

export class Sequencer {
  private beats: Beat[] = [];
  private i = -1;
  private t = 0;
  private done: (() => void) | null = null;
  running = false;
  /** Multiplier for automated playtests. */
  speed = 1;
  constructor(private showLine: (who: string | null, text: string | null) => void) {}

  run(beats: Beat[], done?: () => void) {
    this.beats = beats; this.i = -1; this.t = 0; this.done = done ?? null; this.running = true;
    this.next();
  }

  private beatDur(b: Beat) {
    if (b.dur !== undefined) return b.dur;
    if (b.line) return 1.6 + b.line.text.length * 0.05;
    return 0;
  }

  private next() {
    const prev = this.beats[this.i];
    prev?.exit?.();
    this.i++; this.t = 0;
    if (this.i >= this.beats.length) {
      this.running = false; this.showLine(null, null);
      const d = this.done; this.done = null; d?.();
      return;
    }
    const b = this.beats[this.i];
    b.enter?.();
    this.showLine(b.line ? b.line.who ?? null : null, b.line ? b.line.text : null);
    if (this.beatDur(b) === 0 && !b.tick) this.next();
  }

  /** Returns true while the scene is still playing. */
  update(dt: number, skip: boolean): boolean {
    if (!this.running) return false;
    const b = this.beats[this.i];
    const dur = this.beatDur(b);
    this.t += dt * this.speed;
    const k = dur > 0 ? Math.min(1, this.t / dur) : 1;
    b.tick?.(k, dt);
    if (k >= 1 || (skip && b.line && this.t > 0.25)) this.next();
    return this.running;
  }
}
