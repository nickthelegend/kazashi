/**
 * Kazashi ECS components. System-free: systems import these, never the reverse.
 * These hold the real app state that tests query with `ecs query`.
 */
import { createComponent, defineComponents, Types } from '@iwsdk/core';

export const PuzzleStates = { searching: 'searching', matching: 'matching', inked: 'inked', idle: 'idle' } as const;
export const Modes = { onboarding: 'onboarding', act: 'act', free: 'free', theatre: 'theatre', daily: 'daily' } as const;
export const RoomModes = { scanning: 'scanning', wall: 'wall', shojiGhost: 'shoji-ghost', shoji: 'shoji' } as const;

/** The current shadow puzzle (one entity). */
export const Puzzle = createComponent('Puzzle', {
  mode: { type: Types.Enum, enum: Modes, default: Modes.onboarding },
  state: { type: Types.Enum, enum: PuzzleStates, default: PuzzleStates.idle },
  targetId: { type: Types.String, default: '' },
  act: { type: Types.Int8, default: 1 },
  index: { type: Types.Int8, default: 0 },
  score: { type: Types.Float32, default: 0 },
  progress: { type: Types.Float32, default: 0 },
  threshold: { type: Types.Float32, default: 0.8 },
  sizeOk: { type: Types.Boolean, default: true },
  hintShown: { type: Types.Boolean, default: false },
  inkedCount: { type: Types.Int16, default: 0 },
});

/** The live shadow on the wall (one entity). */
export const ShadowScale = createComponent('ShadowScale', {
  valid: { type: Types.Boolean, default: false },
  /** sqrt(shadow area) on the wall, metres. */
  size: { type: Types.Float32, default: 0 },
  /** Shadow height on the wall, metres. */
  height: { type: Types.Float32, default: 0 },
  /** Lantern-to-wall distance, metres. */
  wallDistance: { type: Types.Float32, default: 0 },
  hands: { type: Types.Int8, default: 0 },
});

/** The lantern (on its entity). */
export const Lantern = createComponent('Lantern', {
  placed: { type: Types.Boolean, default: false },
  onDesk: { type: Types.Boolean, default: false },
});

/** Room reading (one entity). */
export const RoomState = createComponent('RoomState', {
  mode: { type: Types.Enum, enum: RoomModes, default: RoomModes.scanning },
  wallId: { type: Types.String, default: '' },
  walls: { type: Types.Int8, default: 0 },
  surfaces: { type: Types.Int8, default: 0 },
  scanSeconds: { type: Types.Float32, default: 0 },
});

/** A creature on the wall. */
export const Creature = createComponent('Creature', {
  creatureId: { type: Types.String, default: '' },
  surfaceId: { type: Types.String, default: '' },
  jumps: { type: Types.Int16, default: 0 },
  surfacesVisited: { type: Types.String, default: '' },
  replay: { type: Types.Boolean, default: false },
});

/** Theatre (one entity). */
export const Theatre = createComponent('Theatre', {
  recording: { type: Types.Boolean, default: false },
  elapsed: { type: Types.Float32, default: 0 },
  takes: { type: Types.Int8, default: 0 },
  lastTakeId: { type: Types.String, default: '' },
  onStage: { type: Types.Int8, default: 0 },
  replaying: { type: Types.Boolean, default: false },
  castPage: { type: Types.Int8, default: 0 },
  castPages: { type: Types.Int8, default: 1 },
});

/** The palm-up wrist menu (one entity). */
export const WristMenu = createComponent('WristMenu', {
  open: { type: Types.Boolean, default: false },
  tolerance: { type: Types.Float32, default: 0.36 },
  oneHand: { type: Types.Boolean, default: false },
  highContrast: { type: Types.Boolean, default: false },
  glasses: { type: Types.Boolean, default: false },
});

/** A pokeable paper button. `action` names what it does. */
export const PaperButton = createComponent('PaperButton', {
  action: { type: Types.String, default: '' },
  presses: { type: Types.Int16, default: 0 },
});

/** A theatre cast card (glass slide) that can be pinched and dropped. */
export const CastCard = createComponent('CastCard', {
  creatureId: { type: Types.String, default: '' },
  slot: { type: Types.Int8, default: 0 },
});

export default defineComponents([Puzzle, ShadowScale, Lantern, RoomState, Creature, Theatre, WristMenu, PaperButton, CastCard]);
