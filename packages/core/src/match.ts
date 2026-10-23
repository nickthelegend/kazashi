/**
 * Hold-to-ink logic. Scores arrive at ~15 Hz. The tracker smooths over the
 * last 5 samples, requires the smoothed score to stay at or above the
 * threshold for `holdSeconds`, and tolerates dropouts (lost tracking or a dip
 * below the threshold) shorter than `dropoutSeconds`.
 */

export type MatchState = 'searching' | 'matching' | 'inked';

export interface MatchOptions {
  threshold: number;
  holdSeconds: number;
  dropoutSeconds: number;
  window: number;
}

export const DEFAULT_MATCH: MatchOptions = {
  threshold: 0.8,
  holdSeconds: 1.2,
  dropoutSeconds: 0.15,
  window: 5,
};

/** Tolerance slider: 0 = strict (0.88), 1 = relaxed (0.66). Default 0.36 → 0.80. */
export function thresholdForTolerance(tolerance: number): number {
  const t = Math.min(1, Math.max(0, tolerance));
  return Math.round((0.88 - 0.22 * t) * 1000) / 1000;
}

export class MatchTracker {
  readonly opts: MatchOptions;
  state: MatchState = 'searching';
  /** Seconds the match has been held. */
  held = 0;
  smoothed = 0;
  private readonly ring: Float32Array;
  private n = 0;
  private head = 0;
  private lastGood = -Infinity;
  private lastTime = -Infinity;

  constructor(opts: Partial<MatchOptions> = {}) {
    this.opts = { ...DEFAULT_MATCH, ...opts };
    this.ring = new Float32Array(this.opts.window);
  }

  setThreshold(threshold: number): void {
    this.opts.threshold = threshold;
  }

  /** 0..1 fill of the match ring. */
  get progress(): number {
    return this.state === 'inked' ? 1 : Math.min(1, this.held / this.opts.holdSeconds);
  }

  reset(): void {
    this.state = 'searching';
    this.held = 0;
    this.smoothed = 0;
    this.n = 0;
    this.head = 0;
    this.lastGood = -Infinity;
    this.lastTime = -Infinity;
  }

  /**
   * Feed one sample. `score` is null when no shadow exists this sample
   * (hands untracked). `time` is in seconds and must not go backwards.
   */
  push(score: number | null, time: number): MatchState {
    if (this.state === 'inked') return this.state;
    const dt = Number.isFinite(this.lastTime) ? Math.max(0, time - this.lastTime) : 0;
    this.lastTime = time;

    if (score !== null) {
      this.ring[this.head] = score;
      this.head = (this.head + 1) % this.ring.length;
      this.n = Math.min(this.n + 1, this.ring.length);
      let s = 0;
      for (let i = 0; i < this.n; i++) s += this.ring[i];
      this.smoothed = s / this.n;
    }

    const good = score !== null && this.smoothed >= this.opts.threshold;
    if (good) {
      if (this.state === 'matching') this.held += dt;
      this.state = 'matching';
      this.lastGood = time;
      if (this.held >= this.opts.holdSeconds) this.state = 'inked';
    } else if (this.state === 'matching') {
      if (time - this.lastGood > this.opts.dropoutSeconds) {
        this.state = 'searching';
        this.held = 0;
      }
    }
    if (score === null && time - this.lastGood > this.opts.dropoutSeconds) {
      this.n = 0;
      this.smoothed = 0;
    }
    return this.state;
  }
}
