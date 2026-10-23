/**
 * Persistence. Progress (stars, cast, settings) lives in localStorage; takes
 * live in IndexedDB. Both fail soft: a private window still plays, it just
 * forgets.
 */
import { deserializeTake, MAX_TAKES, serializeTake, type Take, takesToEvict } from '@kazashi/core/take';

export interface Progress {
  stars: Record<string, number>;
  cast: string[];
  daily: Record<string, string>;
  onboarded: boolean;
  settings?: { tolerance: number; oneHand: boolean; highContrast: boolean; glasses: boolean };
}

const KEY = 'kazashi.progress.v1';

export function loadProgress(): Progress {
  const fresh: Progress = { stars: {}, cast: [], daily: {}, onboarded: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const p = JSON.parse(raw) as Partial<Progress>;
    return { ...fresh, ...p, stars: p.stars ?? {}, cast: p.cast ?? [], daily: p.daily ?? {} };
  } catch {
    return fresh;
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage unavailable (private mode / quota): keep playing without saving
  }
}

const DB = 'kazashi';
const STORE = 'takes';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

interface Row {
  id: string;
  createdAt: number;
  json: string;
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export async function listTakes(): Promise<Take[]> {
  const db = await openDb();
  try {
    const rows = (await tx(db, 'readonly', (s) => s.getAll())) as Row[];
    const takes: Take[] = [];
    for (const r of rows.sort((a, b) => b.createdAt - a.createdAt)) {
      try {
        takes.push(deserializeTake(r.json));
      } catch (e) {
        console.warn(`[kazashi] skipping unreadable take ${r.id}: ${(e as Error).message}`);
      }
    }
    return takes;
  } finally {
    db.close();
  }
}

/** Saves a take and evicts the oldest beyond MAX_TAKES. Returns the stored count. */
export async function saveTake(take: Take): Promise<number> {
  const db = await openDb();
  try {
    await tx(db, 'readwrite', (s) => s.put({ id: take.id, createdAt: take.createdAt, json: serializeTake(take) } satisfies Row));
    const rows = (await tx(db, 'readonly', (s) => s.getAll())) as Row[];
    const evict = takesToEvict(rows);
    for (const id of evict) await tx(db, 'readwrite', (s) => s.delete(id));
    return Math.min(rows.length, MAX_TAKES);
  } finally {
    db.close();
  }
}
