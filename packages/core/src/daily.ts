/** The daily silhouette: one creature per UTC day, the same for everyone. */

export function utcDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** FNV-1a 32-bit. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks today's creature from `ids`. Consecutive days never repeat the same
 * creature (when there are at least two to choose from).
 */
export const DAILY_EPOCH = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;

export function dailyPick(ids: readonly string[], date: Date): { key: string; id: string; index: number } {
  const n = ids.length;
  if (n === 0) throw new Error('dailyPick needs at least one id');
  const key = utcDateKey(date);
  const rand = (dayMs: number) => mulberry32(hashString(`kazashi:${utcDateKey(new Date(dayMs))}`))();
  const today = Math.floor(date.getTime() / DAY) * DAY;
  if (n === 1 || today <= DAILY_EPOCH) {
    const index = Math.floor(rand(today) * n);
    return { key, id: ids[index], index };
  }
  // Walk forward from the epoch: each day steps 1..n-1 places from the day
  // before, so two consecutive days never show the same creature.
  let index = Math.floor(rand(DAILY_EPOCH) * n);
  for (let day = DAILY_EPOCH + DAY; day <= today; day += DAY) {
    index = (index + 1 + Math.floor(rand(day) * (n - 1))) % n;
  }
  return { key, id: ids[index], index };
}
