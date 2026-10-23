import { describe, expect, it } from 'vitest';
import { dailyPick, utcDateKey } from '../src/daily.js';

const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

describe('daily silhouette', () => {
  it('is deterministic for a UTC date', () => {
    const d = new Date(Date.UTC(2026, 10, 3, 1, 0));
    expect(dailyPick(ids, d)).toEqual(dailyPick(ids, new Date(Date.UTC(2026, 10, 3, 23, 59))));
    expect(utcDateKey(d)).toBe('2026-11-03');
  });

  it('uses the UTC day, not local time', () => {
    // 23:30 UTC on Nov 3 is Nov 4 in India; both must pick the Nov 3 creature.
    const a = dailyPick(ids, new Date('2026-11-03T23:30:00Z'));
    expect(a.key).toBe('2026-11-03');
  });

  it('never repeats on consecutive days and covers every creature', () => {
    const seen = new Set<string>();
    let prev = '';
    for (let i = 0; i < 120; i++) {
      const p = dailyPick(ids, new Date(Date.UTC(2026, 9, 1) + i * 86_400_000));
      expect(p.id).not.toBe(prev);
      prev = p.id;
      seen.add(p.id);
    }
    expect(seen.size).toBe(ids.length);
  });
});
