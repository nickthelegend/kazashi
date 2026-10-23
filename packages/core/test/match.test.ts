import { describe, expect, it } from 'vitest';
import { MatchTracker, thresholdForTolerance } from '../src/match.js';

const run = (tr: MatchTracker, samples: (number | null)[], dt = 1 / 15, t0 = 0) => {
  let t = t0;
  for (const s of samples) {
    tr.push(s, t);
    t += dt;
  }
  return t;
};

describe('MatchTracker', () => {
  it('inks after holding a match for 1.2 s', () => {
    const tr = new MatchTracker();
    run(tr, Array(18).fill(0.9));
    expect(tr.state).toBe('matching');
    run(tr, Array(3).fill(0.9), 1 / 15, 18 / 15);
    expect(tr.state).toBe('inked');
  });

  it('smooths over 5 samples', () => {
    const tr = new MatchTracker();
    run(tr, [0.9, 0.9, 0.9, 0.9, 0.5]);
    expect(tr.smoothed).toBeCloseTo(0.82, 5);
    expect(tr.state).toBe('matching');
  });

  it('survives a 100 ms tracking dropout but resets after 200 ms', () => {
    const a = new MatchTracker();
    let t = run(a, Array(10).fill(0.95));
    t = run(a, [null], 0.1, t);
    run(a, Array(10).fill(0.95), 1 / 15, t);
    expect(a.state).toBe('inked');

    const b = new MatchTracker();
    t = run(b, Array(10).fill(0.95));
    t = run(b, [null, null, null, null], 1 / 15, t); // ~267 ms
    expect(b.state).toBe('searching');
    expect(b.held).toBe(0);
  });

  it('drops below the threshold resets the hold', () => {
    const tr = new MatchTracker();
    let t = run(tr, Array(12).fill(0.95));
    t = run(tr, Array(12).fill(0.1), 1 / 15, t);
    expect(tr.state).toBe('searching');
  });

  it('maps the tolerance slider to thresholds', () => {
    expect(thresholdForTolerance(0)).toBe(0.88);
    expect(thresholdForTolerance(1)).toBe(0.66);
    expect(thresholdForTolerance(0.36)).toBeCloseTo(0.8, 2);
  });
});
