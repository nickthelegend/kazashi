// The authored cast: every target is reachable (scores itself ≥ 0.8 even with
// tracking-like jitter) and distinct (scores ≤ 0.45 against every other).
// Writes the full confusion matrix to reports/confusion.md for TESTING.md.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BESTIARY, buildTargets, puzzles, FREE_BESTIARY, targetHands, TARGET_POSES } from '../src/bestiary.js';
import { mulberry32 } from '../src/daily.js';
import { SilhouetteScorer, scoreAgainst } from '../src/silhouette.js';

const targets = buildTargets();
const ids = BESTIARY.map((d) => d.id);
const JITTER_M = 0.002; // σ = 2 mm per joint: the gate
const JITTER_WIDE_M = 0.003; // σ = 3 mm: reported, not gated
const TRIALS = 12;

function gauss(rnd: () => number): number {
  return Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
}

function jittered(id: string, seed: number, sigma = JITTER_M): Float32Array[] {
  const rnd = mulberry32(seed);
  return targetHands(id).map((h) => {
    const out = Float32Array.from(h);
    for (let i = 0; i < out.length; i++) out[i] += gauss(rnd) * sigma;
    return out;
  });
}

describe('cast', () => {
  it('keeps every chapter playable with only one hand, including chapter II', () => {
    for (const act of [1, 2, 3] as const) {
      const solo = puzzles(act, true);
      expect(solo.length).toBeGreaterThan(0);
      expect(solo.every((d) => d.hands === 1)).toBe(true);
      for (const d of solo) expect(targetHands(d.id)).toHaveLength(1);
    }
    expect(puzzles(2, true)).toHaveLength(4);
    expect(puzzles(3, true).every((d) => d.size)).toBe(true);
  });

  it('has 15 puzzles in three acts of five and a 10-creature free bestiary', () => {
    expect(puzzles(1)).toHaveLength(5);
    expect(puzzles(2)).toHaveLength(5);
    expect(puzzles(3)).toHaveLength(5);
    expect(FREE_BESTIARY()).toHaveLength(10);
    expect(puzzles(1).every((d) => d.hands === 1)).toBe(true);
    expect(puzzles(2).every((d) => d.hands === 2)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(TARGET_POSES[id], id).toBeDefined();
  });

  const scorer = new SilhouetteScorer();
  const matrix: number[][] = ids.map(() => ids.map(() => 0));
  const selfMin: Record<string, number> = {};
  const selfMinWide: Record<string, number> = {};
  for (let i = 0; i < ids.length; i++) {
    let min = 1;
    let minWide = 1;
    for (let t = 0; t < TRIALS; t++) {
      scorer.update(jittered(ids[i], 1000 + i * 31 + t));
      min = Math.min(min, scorer.score(targets.get(ids[i])!));
      scorer.update(jittered(ids[i], 5000 + i * 31 + t, JITTER_WIDE_M));
      minWide = Math.min(minWide, scorer.score(targets.get(ids[i])!));
    }
    selfMin[ids[i]] = min;
    selfMinWide[ids[i]] = minWide;
    scorer.update(targetHands(ids[i]));
    for (let j = 0; j < ids.length; j++) matrix[i][j] = scoreAgainst(scorer.mask, targets.get(ids[j])!);
  }

  it.each(ids)('%s scores itself ≥ 0.8 with σ = 2 mm joint jitter', (id) => {
    expect(selfMin[id]).toBeGreaterThanOrEqual(0.8);
  });

  it.each(ids)('%s scores ≤ 0.45 against every other creature', (id) => {
    const i = ids.indexOf(id);
    const worst = Math.max(...matrix[i].filter((_, j) => j !== i));
    expect(worst).toBeLessThanOrEqual(0.45);
  });

  it('writes the confusion matrix report', () => {
    const short = (id: string) => id.slice(0, 5);
    const lines = [
      `# Confusion matrix (${ids.length} × ${ids.length})`,
      '',
      'Row: the authored pose run through the live scorer. Column: the target it is scored against (IoU after centroid/area normalisation, best of ±10° roll). Diagonal: exact pose. "σ2" / "σ3" are the lowest self-scores over 12 trials with 2 mm / 3 mm Gaussian noise on every joint (σ2 is gated at ≥ 0.80; σ3 is reported only).',
      '',
      `| pose \\ target | ${ids.map(short).join(' | ')} | σ2 | σ3 |`,
      `|---|${ids.map(() => '---:').join('|')}|---:|---:|`,
      ...ids.map((id, i) => `| ${id} | ${matrix[i].map((v) => v.toFixed(2)).join(' | ')} | ${selfMin[id].toFixed(2)} | ${selfMinWide[id].toFixed(2)} |`),
      '',
      `Max off-diagonal: ${Math.max(...matrix.flatMap((r, i) => r.filter((_, j) => j !== i))).toFixed(3)}. Min self-score at σ = 2 mm: ${Math.min(...Object.values(selfMin)).toFixed(3)}; at σ = 3 mm: ${Math.min(...Object.values(selfMinWide)).toFixed(3)}.`,
      '',
    ];
    fs.mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
    fs.writeFileSync(new URL('../reports/confusion.md', import.meta.url), lines.join('\n'));
    expect(lines.length).toBeGreaterThan(ids.length);
  });
});
