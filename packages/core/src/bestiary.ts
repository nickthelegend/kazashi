/**
 * The cast. Each creature is a hand shadow authored as joint poses in the
 * emulator (targets/targets.json, light frame) and run through the same
 * rasteriser as live hands, so every target is reachable by construction.
 *
 * Acts 1–3 hold the 15 puzzles; act 0 is the free-shadow bestiary (10).
 * Rig roles name what each finger group does when the creature comes alive.
 */
import { jointsFromRecord, type HandJoints } from './hand.js';
import { buildTargetSilhouette, projectHands, Shape2D, type TargetSilhouette } from './silhouette.js';
import targetsJson from '../targets/targets.json' with { type: 'json' };

export type Locomotion = 'trot' | 'hop' | 'fly' | 'slither' | 'swim' | 'scuttle' | 'stalk';
export type RigRole = 'ear' | 'jaw' | 'leg' | 'wing' | 'tail' | 'antenna' | 'neck' | 'fin' | 'claw';
/** Finger group keys: palm/thumb/index/middle/ring/pinky, `L.`/`R.` prefixed for two hands. */
export type RigMap = Record<string, RigRole>;

export interface CreatureDef {
  id: string;
  name: string;
  /** Japanese name (kana/kanji) shown on the card. */
  jp: string;
  act: 0 | 1 | 2 | 3;
  /** Order within the act. */
  order: number;
  hands: 1 | 2;
  locomotion: Locomotion;
  /** +1 when the silhouette's head points right on the wall. */
  facing: 1 | -1;
  rig: RigMap;
  /** Act 3: the shadow must be this tall on the wall (sqrt-area metres). */
  size?: { min: number; max: number };
  /** One short line on the card. */
  hint: string;
}

export interface TargetPose {
  id: string;
  /** IWER recipe the pose was captured from (light frame). */
  recipe: {
    hands: {
      hand: 'left' | 'right';
      poseId: string;
      fingers?: Record<string, string>;
      weight?: number;
      wrist: [number, number, number];
      fingersDir: [number, number, number];
      palmDir: [number, number, number];
    }[];
  };
  hands: { hand: 'left' | 'right'; joints: Record<string, number[]> }[];
}

export const BESTIARY: CreatureDef[] = [];

export const TARGET_POSES: Record<string, TargetPose> = targetsJson as unknown as Record<string, TargetPose>;

export function targetHands(id: string): HandJoints[] {
  const t = TARGET_POSES[id];
  if (!t) throw new Error(`no authored pose for creature "${id}"`);
  // Left hand first so group indices are stable (L = 0..5, R = 6..11).
  return [...t.hands].sort((a, b) => (a.hand === b.hand ? 0 : a.hand === 'left' ? -1 : 1)).map((h) => jointsFromRecord(h.joints));
}

export function targetShape(id: string): Shape2D {
  const s = new Shape2D();
  if (!projectHands(targetHands(id), s)) throw new Error(`authored pose "${id}" puts a joint beside the lantern`);
  return s;
}

export function buildTargets(ids: readonly string[] = BESTIARY.map((d) => d.id)): Map<string, TargetSilhouette> {
  return new Map(ids.map((id) => [id, buildTargetSilhouette(id, targetShape(id))]));
}

export function puzzles(act: 1 | 2 | 3): CreatureDef[] {
  return BESTIARY.filter((d) => d.act === act).sort((a, b) => a.order - b.order);
}

export const FREE_BESTIARY = (): CreatureDef[] => BESTIARY.filter((d) => d.act === 0);

/** Hand used for a group key: `L.thumb` → 0..5, `R.index` → 6..11; bare keys mean the only hand. */
export function groupIndex(key: string, hands: 1 | 2, soleHand: 'left' | 'right' = 'right'): number {
  const names = ['palm', 'thumb', 'index', 'middle', 'ring', 'pinky'];
  const [prefix, name] = key.includes('.') ? key.split('.') : [soleHand === 'left' ? 'L' : 'R', key];
  const g = names.indexOf(name);
  if (g < 0) throw new Error(`unknown finger group "${key}"`);
  if (hands === 1) return g;
  return (prefix === 'L' ? 0 : 6) + g;
}
