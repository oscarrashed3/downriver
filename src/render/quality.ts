export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityPreset { grass: number; pixelRatio: number; bloom: boolean; shadows: boolean; shadowSize: number; brush: number }

export const PRESETS: Record<QualityLevel, QualityPreset> = {
  low: { grass: 0.3, pixelRatio: 1, bloom: false, shadows: false, shadowSize: 1024, brush: 0 },
  medium: { grass: 0.65, pixelRatio: 1.25, bloom: true, shadows: true, shadowSize: 1024, brush: 0 },
  high: { grass: 1, pixelRatio: 1.75, bloom: true, shadows: true, shadowSize: 2048, brush: 0 },
};

const KEY = 'downriver-quality';

/**
 * Picks a quality level from the first seconds of frame times, then steps down if the game
 * cannot hold a smooth frame rate. A level the player picks by hand is remembered and never changed.
 */
export class QualityAuto {
  level: QualityLevel;
  manual: boolean;
  private samples: number[] = [];
  private settled = false;
  private checks = 0;

  constructor() {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
    this.manual = saved === 'low' || saved === 'medium' || saved === 'high';
    this.level = this.manual ? (saved as QualityLevel) : 'high';
  }

  get preset() { return PRESETS[this.level]; }

  cycle(): QualityLevel {
    this.level = this.level === 'high' ? 'low' : this.level === 'low' ? 'medium' : 'high';
    this.manual = true;
    try { localStorage.setItem(KEY, this.level); } catch { /* ignore */ }
    return this.level;
  }

  /** Feed frame times while playing. Returns a new level when it should change. */
  sample(dt: number): QualityLevel | null {
    if (this.manual || this.settled) return null;
    this.samples.push(dt);
    if (this.samples.length < 150) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.samples = [];
    this.checks++;
    if (median > 1 / 42 && this.level !== 'low') {
      this.level = this.level === 'high' ? 'medium' : 'low';
      return this.level;
    }
    if (this.checks >= 3) this.settled = true;
    return null;
  }
}
