/**
 * Narration for a theatre take. The app summarises *what happened on stage*
 * (who entered when, which way they went, how far, how often they turned)
 * and sends only that summary to the Kazashi proxy, which asks Muse
 * (muse-spark-1.3) for 3–4 timed lines. Whatever comes back is checked here
 * before the theatre shows it: nothing is invented locally.
 */
import type { Take } from './take.js';

export const NARRATION_ROUTE = '/api/narrate';
export const NARRATION_MODEL = 'muse-spark-1.3';
export const MIN_LINES = 3;
export const MAX_LINES = 4;
export const MAX_LINE_CHARS = 110;

export interface CastSummary {
  id: string;
  name: string;
  /** Seconds from the start of the take. */
  enters: number;
  exits: number;
  /** Metres covered on the wall. */
  travel: number;
  /** Direction changes. */
  turns: number;
  /** Mostly heading left, right, or both ways. */
  heading: 'left' | 'right' | 'both';
  /** Where on the wall it spent its time. */
  height: 'low' | 'middle' | 'high';
}

export interface StagingSummary {
  title: string;
  /** Seconds. */
  duration: number;
  /** Seconds a hand was in the lantern light. */
  handSeconds: number;
  cast: CastSummary[];
}

export interface NarrationLine {
  text: string;
  /** Start, seconds from the start of the take. */
  at: number;
  /** How long the caption stays up (seconds). */
  dur: number;
}

export interface Narration {
  lines: NarrationLine[];
  model: string;
  createdAt: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function summarizeTake(take: Take, names: ReadonlyMap<string, string>): StagingSummary {
  const handFrames = take.frames.filter((f) => f.some((h) => h)).length;
  const cast: CastSummary[] = take.tracks
    .filter((tr) => tr.keys.length > 0)
    .map((tr) => {
      let travel = 0;
      let turns = 0;
      let right = 0;
      let left = 0;
      let vSum = 0;
      for (let i = 0; i < tr.keys.length; i++) {
        const k = tr.keys[i];
        vSum += k.v;
        if (k.facing > 0) right++;
        else left++;
        if (i > 0) {
          const p = tr.keys[i - 1];
          travel += Math.hypot(k.u - p.u, k.v - p.v);
          if (Math.sign(k.facing) !== Math.sign(p.facing)) turns++;
        }
      }
      const vMean = vSum / tr.keys.length;
      const heading: CastSummary['heading'] = right > left * 3 ? 'right' : left > right * 3 ? 'left' : 'both';
      return {
        id: tr.creatureId,
        name: names.get(tr.creatureId) ?? tr.creatureId,
        enters: r1(tr.keys[0].t),
        exits: r1(tr.keys[tr.keys.length - 1].t),
        travel: r1(travel),
        turns,
        heading,
        height: (vMean > 0.25 ? 'high' : vMean < -0.25 ? 'low' : 'middle') as CastSummary['height'],
      };
    })
    .sort((a, b) => a.enters - b.enters);
  return { title: take.title, duration: r1(take.duration), handSeconds: r1(handFrames / Math.max(1, take.rate)), cast };
}

/**
 * Checks and times the model's lines. Throws a readable error when the
 * output is unusable (wrong shape, too few lines, empty text); never pads.
 */
export function normalizeNarration(raw: unknown, duration: number): NarrationLine[] {
  const list = (raw as { lines?: unknown })?.lines;
  if (!Array.isArray(list)) throw new Error('narration has no lines');
  const lines = list
    .map((l) => l as { text?: unknown; at?: unknown })
    .filter((l) => typeof l.text === 'string' && l.text.trim().length > 0)
    .map((l) => ({
      text: (l.text as string).replace(/\s+/g, ' ').trim().slice(0, MAX_LINE_CHARS),
      at: typeof l.at === 'number' && Number.isFinite(l.at) ? l.at : NaN,
    }))
    .slice(0, MAX_LINES);
  if (lines.length < MIN_LINES) throw new Error(`narration has ${lines.length} usable lines; ${MIN_LINES} are needed`);
  const span = Math.max(duration, lines.length * 2.5);
  const even = span / lines.length;
  // Keep the model's timing when it is ordered, inside the take and ≥ 1.5 s apart; otherwise space evenly.
  const times = lines.map((l) => l.at);
  const ordered = times.every((t, i) => Number.isFinite(t) && t >= 0 && t < span && (i === 0 || t - times[i - 1] >= 1.5));
  const at = ordered ? times : lines.map((_, i) => i * even);
  return lines.map((l, i) => ({ text: l.text, at: r1(at[i]), dur: r1(Math.max(2, (i + 1 < at.length ? at[i + 1] : span) - at[i])) }));
}
