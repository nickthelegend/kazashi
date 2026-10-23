/**
 * Theatre takes. A take records what made the play, not pixels: hand joint
 * keyframes (light frame, millimetres) and each creature's path on the wall.
 * Replaying a take drives the same shadow proxy and creature rigs live.
 *
 * Wire format (versioned JSON, joints as base64 Int16 millimetres):
 *   { v: 1, id, title, createdAt, duration, rate, cast: [...], hands: [b64|null per frame per hand], tracks: [...] }
 */

import { JOINT_COUNT } from './hand.js';

export const TAKE_VERSION = 1;
export const TAKE_MAX_SECONDS = 20;
export const TAKE_RATE = 15;
export const MAX_TAKES = 5;

export interface CreatureKey {
  /** Seconds from the take start. */
  t: number;
  /** Wall-plane coordinates (metres) or a world point when `surface` is -1. */
  u: number;
  v: number;
  /** Index into the take's surface list. */
  surface: number;
  /** Facing: +1 right, -1 left. */
  facing: number;
}

export interface CreatureTrack {
  creatureId: string;
  /** Size of the silhouette on the wall (sqrt of area, metres). */
  size: number;
  keys: CreatureKey[];
}

export interface Take {
  id: string;
  title: string;
  createdAt: number;
  duration: number;
  rate: number;
  /** Hand frames: frames[f][hand] = 75 floats (light frame, metres) or null. */
  frames: (Float32Array | null)[][];
  tracks: CreatureTrack[];
}

interface TakeWire {
  v: number;
  id: string;
  title: string;
  createdAt: number;
  duration: number;
  rate: number;
  hands: (string | null)[][];
  tracks: { c: string; s: number; k: number[] }[];
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const VALUES = JOINT_COUNT * 3;

function encodeJoints(j: Float32Array): string {
  const q = new Int16Array(VALUES);
  for (let i = 0; i < VALUES; i++) {
    const mm = Math.round(j[i] * 1000);
    if (mm > 32767 || mm < -32768) throw new Error('joint outside ±32 m of the lantern');
    q[i] = mm;
  }
  return toBase64(new Uint8Array(q.buffer));
}

function decodeJoints(b64: string): Float32Array {
  const bytes = fromBase64(b64);
  if (bytes.length !== VALUES * 2) throw new Error(`hand frame has ${bytes.length} bytes, expected ${VALUES * 2}`);
  const q = new Int16Array(bytes.buffer, bytes.byteOffset, VALUES);
  const out = new Float32Array(VALUES);
  for (let i = 0; i < VALUES; i++) out[i] = q[i] / 1000;
  return out;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function serializeTake(take: Take): string {
  if (take.duration > TAKE_MAX_SECONDS + 1e-6) throw new Error(`take is ${take.duration}s; the limit is ${TAKE_MAX_SECONDS}s`);
  const wire: TakeWire = {
    v: TAKE_VERSION,
    id: take.id,
    title: take.title,
    createdAt: take.createdAt,
    duration: r3(take.duration),
    rate: take.rate,
    hands: take.frames.map((f) => f.map((h) => (h ? encodeJoints(h) : null))),
    tracks: take.tracks.map((tr) => ({
      c: tr.creatureId,
      s: r3(tr.size),
      k: tr.keys.flatMap((k) => [r3(k.t), r3(k.u), r3(k.v), k.surface, k.facing]),
    })),
  };
  return JSON.stringify(wire);
}

export function deserializeTake(json: string): Take {
  let wire: TakeWire;
  try {
    wire = JSON.parse(json) as TakeWire;
  } catch (e) {
    throw new Error(`take is not valid JSON: ${(e as Error).message}`);
  }
  if (wire.v !== TAKE_VERSION) throw new Error(`unsupported take version ${wire.v}`);
  if (typeof wire.id !== 'string' || !Array.isArray(wire.hands) || !Array.isArray(wire.tracks)) {
    throw new Error('take is missing id, hands or tracks');
  }
  if (wire.duration > TAKE_MAX_SECONDS + 1e-6) throw new Error('take is longer than the limit');
  return {
    id: wire.id,
    title: wire.title,
    createdAt: wire.createdAt,
    duration: wire.duration,
    rate: wire.rate,
    frames: wire.hands.map((f) => f.map((h) => (h ? decodeJoints(h) : null))),
    tracks: wire.tracks.map((tr) => {
      if (tr.k.length % 5 !== 0) throw new Error('creature track has a partial key');
      const keys: CreatureKey[] = [];
      for (let i = 0; i < tr.k.length; i += 5) {
        keys.push({ t: tr.k[i], u: tr.k[i + 1], v: tr.k[i + 2], surface: tr.k[i + 3], facing: tr.k[i + 4] });
      }
      return { creatureId: tr.c, size: tr.s, keys };
    }),
  };
}

export interface CreatureSample {
  /** Stable per-instance key (two dogs on stage are two tracks). */
  key: string;
  creatureId: string;
  size: number;
  u: number;
  v: number;
  surface: number;
  facing: number;
}

/** Records frames at a fixed rate from irregular render ticks. */
export class TakeRecorder {
  private take: Take | null = null;
  private tracks = new Map<string, CreatureTrack>();
  private start = 0;
  private nextFrame = 0;

  get recording(): boolean {
    return this.take !== null;
  }

  get elapsed(): number {
    return this.take ? this.take.duration : 0;
  }

  begin(id: string, title: string, time: number, createdAt: number): void {
    this.take = { id, title, createdAt, duration: 0, rate: TAKE_RATE, frames: [], tracks: [] };
    this.tracks.clear();
    this.start = time;
    this.nextFrame = 0;
  }

  /** Returns true when the take reached the length limit. */
  tick(time: number, hands: (Float32Array | null)[], creatures: readonly CreatureSample[]): boolean {
    const take = this.take;
    if (!take) return false;
    const t = Math.min(time - this.start, TAKE_MAX_SECONDS);
    while (this.nextFrame / take.rate <= t + 1e-9) {
      const ft = this.nextFrame / take.rate;
      take.frames.push(hands.map((h) => (h ? Float32Array.from(h) : null)));
      for (const c of creatures) {
        let tr = this.tracks.get(c.key);
        if (!tr) {
          tr = { creatureId: c.creatureId, size: c.size, keys: [] };
          this.tracks.set(c.key, tr);
          take.tracks.push(tr);
        }
        tr.keys.push({ t: ft, u: c.u, v: c.v, surface: c.surface, facing: c.facing });
      }
      this.nextFrame++;
    }
    take.duration = t;
    return time - this.start >= TAKE_MAX_SECONDS;
  }

  end(): Take | null {
    const take = this.take;
    this.take = null;
    return take;
  }
}

/** Sample a creature track at time t (linear between keys, holds the ends). */
export function sampleTrack(track: CreatureTrack, t: number, out: CreatureKey): CreatureKey {
  const k = track.keys;
  if (k.length === 0) throw new Error('empty creature track');
  if (t <= k[0].t) return Object.assign(out, k[0]);
  const last = k[k.length - 1];
  if (t >= last.t) return Object.assign(out, last);
  let lo = 0;
  let hi = k.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (k[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = k[lo];
  const b = k[hi];
  const f = (t - a.t) / (b.t - a.t);
  out.t = t;
  if (a.surface !== b.surface) {
    Object.assign(out, f < 0.5 ? a : b);
    out.t = t;
    return out;
  }
  out.u = a.u + (b.u - a.u) * f;
  out.v = a.v + (b.v - a.v) * f;
  out.surface = a.surface;
  out.facing = f < 0.5 ? a.facing : b.facing;
  return out;
}

/** Keeps the newest `MAX_TAKES`; returns the ids to delete. */
export function takesToEvict(takes: readonly { id: string; createdAt: number }[]): string[] {
  return [...takes].sort((a, b) => b.createdAt - a.createdAt).slice(MAX_TAKES).map((t) => t.id);
}
