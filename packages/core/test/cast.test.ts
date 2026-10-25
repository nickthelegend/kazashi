import { expect, it } from 'vitest';
import { castPage } from '../src/cast.js';

it('makes every collected creature reachable in six-slide pages without changing collection order', () => {
  const cast = Array.from({ length: 25 }, (_, i) => `creature-${i}`);
  const before = [...cast];
  const seen = Array.from({ length: 5 }, (_, i) => castPage(cast, i).ids).flat();
  expect(seen).toEqual([...cast].reverse());
  expect(cast).toEqual(before);
});

it('wraps forward and backward at the ends of the cast book', () => {
  const cast = Array.from({ length: 8 }, (_, i) => String(i));
  expect(castPage(cast, 2)).toEqual(castPage(cast, 0));
  expect(castPage(cast, -1)).toEqual(castPage(cast, 1));
});

it('keeps an empty cast book on a valid empty page', () => {
  expect(castPage([], -1)).toEqual({ ids: [], page: 0, pages: 1 });
});
