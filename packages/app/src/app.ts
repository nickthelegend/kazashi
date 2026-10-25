/**
 * Shared runtime state for Kazashi's systems: the room, the lantern's light
 * frame, live hands, the scorer, settings and progress. Systems own their
 * entities; this module only holds what several systems read.
 */
import { BESTIARY, type CreatureDef } from '@kazashi/core/bestiary';
import { type LightFrame, makeLightFrame, type Vec3 } from '@kazashi/core/lightframe';
import type { Surface } from '@kazashi/core/room';
import { SilhouetteScorer, type TargetSilhouette } from '@kazashi/core/silhouette';
import type { Object3D } from '@iwsdk/core';
import { HandReader } from './hand-input.js';
import { loadProgress, saveProgress, type Progress } from './storage.js';

export interface Settings {
  tolerance: number;
  oneHand: boolean;
  highContrast: boolean;
  glasses: boolean;
}

export type Listener<T> = (v: T) => void;

class Emitter<E extends Record<string, unknown>> {
  private map = new Map<keyof E, Set<Listener<never>>>();
  on<K extends keyof E>(k: K, fn: Listener<E[K]>): () => void {
    let s = this.map.get(k);
    if (!s) this.map.set(k, (s = new Set()));
    s.add(fn as Listener<never>);
    return () => s!.delete(fn as Listener<never>);
  }
  emit<K extends keyof E>(k: K, v: E[K]): void {
    this.map.get(k)?.forEach((fn) => (fn as Listener<E[K]>)(v));
  }
}

export interface Events extends Record<string, unknown> {
  /** A puzzle (or free shadow) inked: spawn its creature. */
  inked: { creatureId: string; center: Vec3; size: number; fromPuzzle: boolean };
  /** A paper button was pressed. */
  button: string;
  /** Room wall changed. */
  wall: Surface | null;
  settings: Settings;
  toast: string;
}

export const app = {
  events: new Emitter<Events>(),
  hands: new HandReader(),
  scorer: new SilhouetteScorer(),
  targets: new Map<string, TargetSilhouette>(),
  defs: new Map<string, CreatureDef>(BESTIARY.map((d) => [d.id, d])),
  surfaces: [] as Surface[],
  wall: null as Surface | null,
  /** Lantern light origin (world). */
  light: [0, 1, -0.5] as Vec3,
  frame: makeLightFrame([0, 1, -0.5], [0, 0, 1]) as LightFrame,
  /** Lantern → wall distance along the wall normal. */
  wallDistance: 0,
  lightReady: false,
  settings: { tolerance: 0.36, oneHand: false, highContrast: false, glasses: false } as Settings,
  progress: loadProgress() as Progress,
  /** Replay overrides live hands while a take plays. */
  replayHands: null as (Float32Array | null)[] | null,
  /** World joints the shadow uses this frame (live or replay). */
  shadowHands: [null, null] as (Float32Array | null)[],
  /** Light-frame joints for the scorer. */
  lightHands: [new Float32Array(75), new Float32Array(75)],
  elapsed: 0,
  /** The target card mesh (for the glasses field-of-view check). */
  card: null as Object3D | null,
  matchRing: null as Object3D | null,
};

export function setSettings(patch: Partial<Settings>): void {
  Object.assign(app.settings, patch);
  app.progress.settings = { ...app.settings };
  saveProgress(app.progress);
  app.events.emit('settings', app.settings);
}

export function recordStar(id: string, stars: number): void {
  const prev = app.progress.stars[id] ?? 0;
  if (stars > prev) app.progress.stars[id] = stars;
  if (!app.progress.cast.includes(id)) app.progress.cast.push(id);
  saveProgress(app.progress);
}
