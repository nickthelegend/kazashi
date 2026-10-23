import { describe, expect, it } from 'vitest';
import { buildTargetSilhouette, GRID, iou, Mask, measure, projectHands, rasterize, Shape2D, SilhouetteScorer } from '../src/silhouette.js';
import { synthHand } from './synth.js';

function oneCapsule(r: number): Shape2D {
  const s = new Shape2D();
  s.caps.set([-0.5, 0, r, 0.5, 0, r], 0);
  s.nCaps = 1;
  return s;
}

describe('rasteriser', () => {
  it('fills a capsule with its analytic area (within 4%)', () => {
    const s = oneCapsule(0.2);
    const m = new Mask();
    rasterize(s, { cx: 0, cy: 0, scale: 30, angle: 0 }, m);
    const expected = (1 * 0.4 + Math.PI * 0.04) * 900;
    expect(Math.abs(m.count() - expected) / expected).toBeLessThan(0.04);
  });

  it('measures area and centroid', () => {
    const s = oneCapsule(0.2);
    for (let i = 0; i < 6; i += 3) s.caps[i] += 2; // move to x = 2
    const r = measure(s);
    expect(r.cx).toBeCloseTo(2, 1);
    expect(r.cy).toBeCloseTo(0, 1);
    expect(r.area).toBeCloseTo(0.4 + Math.PI * 0.04, 1);
  });

  it('IoU is 1 for identical masks and 0 for disjoint ones', () => {
    const a = new Mask();
    const b = new Mask();
    a.set(1, 1);
    a.set(2, 2);
    b.set(1, 1);
    b.set(2, 2);
    expect(iou(a, b)).toBe(1);
    const c = new Mask();
    c.set(5, 5);
    expect(iou(a, c)).toBe(0);
  });

  it('keeps the grid size at 64', () => expect(GRID).toBe(64));
});

describe('normalisation', () => {
  const target = (() => {
    const s = new Shape2D();
    projectHands([synthHand({ curl: [0, 0, 1.2, 1.2, 0] })], s);
    return buildTargetSilhouette('t', s);
  })();

  it('scores a hand against itself as 1', () => {
    const sc = new SilhouetteScorer();
    sc.update([synthHand({ curl: [0, 0, 1.2, 1.2, 0] })]);
    expect(sc.score(target)).toBeGreaterThan(0.99);
  });

  it('is invariant to sliding the hand across the light and to its distance', () => {
    const sc = new SilhouetteScorer();
    sc.update([synthHand({ x: 0.1, y: -0.05, z: -0.45, curl: [0, 0, 1.2, 1.2, 0] })]);
    expect(sc.score(target)).toBeGreaterThan(0.9);
  });

  it('tolerates ±10° of roll but not 40°', () => {
    const sc = new SilhouetteScorer();
    sc.update([synthHand({ angle: (8 * Math.PI) / 180, curl: [0, 0, 1.2, 1.2, 0] })]);
    expect(sc.score(target)).toBeGreaterThan(0.85);
    sc.update([synthHand({ angle: (40 * Math.PI) / 180, curl: [0, 0, 1.2, 1.2, 0] })]);
    expect(sc.score(target)).toBeLessThan(0.75);
  });

  it('separates a different finger shape', () => {
    const sc = new SilhouetteScorer();
    sc.update([synthHand({ curl: [1.4, 1.4, 0, 0, 1.4] })]);
    expect(sc.score(target)).toBeLessThan(0.7);
  });

  it('reports no shadow for a hand beside or behind the lantern', () => {
    const sc = new SilhouetteScorer();
    expect(sc.update([synthHand({ z: 0.05 })])).toBe(false);
    expect(sc.score(target)).toBe(0);
    expect(sc.update([])).toBe(false);
  });
});
