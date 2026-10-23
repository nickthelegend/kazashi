import { describe, expect, it } from 'vitest';
import { deserializeTake, sampleTrack, serializeTake, TAKE_MAX_SECONDS, TakeRecorder, takesToEvict } from '../src/take.js';
import { synthHand } from './synth.js';

describe('takes', () => {
  it('round-trips a recorded take within a millimetre', () => {
    const rec = new TakeRecorder();
    rec.begin('t1', 'Fox and heron', 10, 1_700_000_000_000);
    for (let i = 0; i <= 90; i++) {
      const t = 10 + i / 30;
      rec.tick(t, [synthHand({ x: i * 0.001 }), null], [
        { key: 'k0', creatureId: 'inu', size: 0.4, u: i * 0.01, v: 0.5, surface: 0, facing: 1 },
      ]);
    }
    const take = rec.end()!;
    expect(take.frames.length).toBe(46); // 3 s at 15 Hz, inclusive
    const back = deserializeTake(serializeTake(take));
    expect(back.id).toBe('t1');
    expect(back.frames.length).toBe(take.frames.length);
    for (let f = 0; f < take.frames.length; f++) {
      expect(back.frames[f][1]).toBeNull();
      const a = take.frames[f][0]!;
      const b = back.frames[f][0]!;
      for (let k = 0; k < a.length; k++) expect(Math.abs(a[k] - b[k])).toBeLessThanOrEqual(0.0005);
    }
    expect(back.tracks[0].creatureId).toBe('inu');
    expect(back.tracks[0].keys.length).toBe(46);
    const s = sampleTrack(back.tracks[0], 1.5, { t: 0, u: 0, v: 0, surface: 0, facing: 1 });
    expect(s.u).toBeCloseTo(0.45, 2);
  });

  it('stops at the 20 s limit', () => {
    const rec = new TakeRecorder();
    rec.begin('t2', '', 0, 0);
    let stopped = false;
    for (let t = 0; t < 25 && !stopped; t += 0.05) stopped = rec.tick(t, [null], []);
    const take = rec.end()!;
    expect(stopped).toBe(true);
    expect(take.duration).toBeLessThanOrEqual(TAKE_MAX_SECONDS);
    expect(take.frames.length).toBe(TAKE_MAX_SECONDS * 15 + 1);
  });

  it('rejects corrupt or foreign takes', () => {
    expect(() => deserializeTake('{')).toThrow(/not valid JSON/);
    expect(() => deserializeTake('{"v":9}')).toThrow(/version/);
    expect(() => deserializeTake(JSON.stringify({ v: 1, id: 'x', hands: [['AAAA']], tracks: [] }))).toThrow(/bytes/);
  });

  it('keeps only the newest five', () => {
    const takes = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, createdAt: i }));
    expect(takesToEvict(takes).sort()).toEqual(['t0', 't1']);
  });
});
