// Narration: the staging summary describes the take truthfully, the model's
// lines are checked and timed (never padded), and narration survives storage.
import { describe, expect, it } from 'vitest';
import { normalizeNarration, summarizeTake } from '../src/narration.js';
import { deserializeTake, serializeTake, type Take, TakeRecorder } from '../src/take.js';
import { synthHand } from './synth.js';

function recordTake(): Take {
  const rec = new TakeRecorder();
  rec.begin('t9', 'Take 1', 0, 1_700_000_000_000);
  for (let i = 0; i <= 150; i++) {
    const t = i / 15;
    const dogFacing = i < 75 ? 1 : -1;
    const samples = [{ key: 'a', creatureId: 'inu', size: 0.5, u: i < 75 ? i * 0.02 : 1.5 - (i - 75) * 0.02, v: -0.4, surface: 0, facing: dogFacing }];
    if (i >= 60) samples.push({ key: 'b', creatureId: 'sagi', size: 0.5, u: -0.5, v: 0.1 + (i - 60) * 0.01, surface: 0, facing: -1 });
    rec.tick(t, [i < 30 ? synthHand({}) : null, null], samples);
  }
  return rec.end()!;
}

const NAMES = new Map([
  ['inu', 'Dog'],
  ['sagi', 'Heron'],
]);

describe('staging summary', () => {
  it('lists the cast in order of entrance with their real movement', () => {
    const s = summarizeTake(recordTake(), NAMES);
    expect(s.title).toBe('Take 1');
    expect(s.duration).toBe(10);
    expect(s.handSeconds).toBeCloseTo(2, 0);
    expect(s.cast.map((c) => c.name)).toEqual(['Dog', 'Heron']);
    const dog = s.cast[0];
    expect(dog.enters).toBe(0);
    expect(dog.turns).toBe(1);
    expect(dog.heading).toBe('both');
    expect(dog.height).toBe('low');
    expect(dog.travel).toBeGreaterThan(2.5);
    const heron = s.cast[1];
    expect(heron.enters).toBe(4);
    expect(heron.heading).toBe('left');
    expect(heron.height).toBe('high');
  });

  it('describes a take with only hand shadows', () => {
    const rec = new TakeRecorder();
    rec.begin('h', 'Hands', 0, 0);
    for (let i = 0; i < 30; i++) rec.tick(i / 15, [synthHand({}), null], []);
    const s = summarizeTake(rec.end()!, NAMES);
    expect(s.cast).toEqual([]);
    expect(s.handSeconds).toBeGreaterThan(1.5);
  });
});

describe('narration lines', () => {
  it('keeps well-timed lines as written', () => {
    const lines = normalizeNarration(
      { lines: [{ text: 'A dog trots out.', at: 0 }, { text: 'A heron answers.', at: 4 }, { text: 'They bow.', at: 8 }] },
      10,
    );
    expect(lines.map((l) => l.at)).toEqual([0, 4, 8]);
    expect(lines.map((l) => l.dur)).toEqual([4, 4, 2]);
    expect(lines[0].text).toBe('A dog trots out.');
  });

  it('re-spaces lines whose timing is out of order or crowded', () => {
    const lines = normalizeNarration({ lines: [{ text: 'a', at: 5 }, { text: 'b', at: 1 }, { text: 'c', at: 1.2 }, { text: 'd' }] }, 12);
    expect(lines.map((l) => l.at)).toEqual([0, 3, 6, 9]);
  });

  it('trims long lines, drops empty ones and keeps at most four', () => {
    const long = 'x'.repeat(300);
    const lines = normalizeNarration({ lines: [{ text: long, at: 0 }, { text: '  ', at: 1 }, { text: 'b', at: 3 }, { text: 'c', at: 6 }, { text: 'd', at: 8 }, { text: 'e', at: 9 }] }, 10);
    expect(lines).toHaveLength(4);
    expect(lines[0].text.length).toBe(110);
    expect(lines.map((l) => l.text)).toEqual([long.slice(0, 110), 'b', 'c', 'd']);
  });

  it('refuses unusable output instead of inventing lines', () => {
    expect(() => normalizeNarration({ lines: [{ text: 'only one', at: 0 }] }, 10)).toThrow(/1 usable lines/);
    expect(() => normalizeNarration({ text: 'no list' }, 10)).toThrow(/no lines/);
    expect(() => normalizeNarration(null, 10)).toThrow(/no lines/);
  });

  it('round-trips a take with its narration', () => {
    const take = recordTake();
    take.narration = {
      lines: normalizeNarration({ lines: [{ text: 'One', at: 0 }, { text: 'Two', at: 3 }, { text: 'Three', at: 6 }] }, take.duration),
      model: 'muse-spark-1.3',
      createdAt: 1_700_000_001_000,
    };
    const back = deserializeTake(serializeTake(take));
    expect(back.narration).toEqual(take.narration);
    expect(deserializeTake(serializeTake({ ...take, narration: undefined })).narration).toBeUndefined();
  });
});
