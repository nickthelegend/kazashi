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
  /**
   * Act 3: shadow size relative to the authored pose (hand 30 cm from the
   * lantern). Above 1 means closer to the lantern, below 1 means farther.
   */
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

export const BESTIARY: CreatureDef[] = [
  // Act 1 — one hand. The first three are the onboarding: bird, dog, rabbit.
  { id: 'tori', name: 'Bird', jp: '鳥', act: 1, order: 1, hands: 1, locomotion: 'fly', facing: 1, rig: { index: 'wing', middle: 'wing', ring: 'wing', pinky: 'wing', thumb: 'tail' }, hint: 'Open hand, fingers up, palm to the wall.' },
  { id: 'inu', name: 'Dog', jp: '犬', act: 1, order: 2, hands: 1, locomotion: 'trot', facing: -1, rig: { thumb: 'ear', pinky: 'jaw' }, hint: 'Fingers point left, thumb up for the ear, little finger drops for the jaw.' },
  { id: 'usagi', name: 'Rabbit', jp: '兎', act: 1, order: 3, hands: 1, locomotion: 'hop', facing: -1, rig: { index: 'ear', middle: 'ear' }, hint: 'Peace sign pointing up, hand side-on to the wall.' },
  { id: 'hebi', name: 'Snake', jp: '蛇', act: 1, order: 4, hands: 1, locomotion: 'slither', facing: 1, rig: { index: 'jaw', middle: 'jaw' }, hint: 'Peace sign pointing right, hand side-on.' },
  { id: 'kirin', name: 'Giraffe', jp: '麒麟', act: 1, order: 5, hands: 1, locomotion: 'stalk', facing: 1, rig: { index: 'neck', middle: 'neck', ring: 'neck' }, hint: 'Three fingers up and to the right, hand side-on.' },
  // Act 2 — two hands, without heavy finger overlap.
  { id: 'sagi', name: 'Heron', jp: '鷺', act: 2, order: 1, hands: 2, locomotion: 'fly', facing: -1, rig: { 'R.index': 'jaw', 'R.thumb': 'jaw', 'L.index': 'wing', 'L.middle': 'wing', 'L.ring': 'wing', 'L.pinky': 'wing' }, hint: 'Right hand pinched high as the beak, left hand flat below as the wing.' },
  { id: 'kani', name: 'Crab', jp: '蟹', act: 2, order: 2, hands: 2, locomotion: 'scuttle', facing: 1, rig: { 'L.index': 'leg', 'L.middle': 'leg', 'L.ring': 'leg', 'R.index': 'leg', 'R.middle': 'leg', 'R.ring': 'leg', 'L.thumb': 'claw', 'R.thumb': 'claw' }, hint: 'Both hands clawed, fingers down, side by side.' },
  { id: 'ga', name: 'Moth', jp: '蛾', act: 2, order: 3, hands: 2, locomotion: 'fly', facing: 1, rig: { 'L.index': 'wing', 'L.middle': 'wing', 'R.index': 'wing', 'R.middle': 'wing' }, hint: 'Two peace signs crossed at the wrists, palms to the wall.' },
  { id: 'rakuda', name: 'Camel', jp: '駱駝', act: 2, order: 4, hands: 2, locomotion: 'stalk', facing: -1, rig: { 'L.index': 'leg', 'L.ring': 'leg', 'R.thumb': 'ear' }, hint: 'A fist on top of a flat hand that points left.' },
  { id: 'zou', name: 'Elephant', jp: '象', act: 2, order: 5, hands: 2, locomotion: 'stalk', facing: -1, rig: { 'L.index': 'tail', 'R.index': 'ear', 'R.middle': 'ear', 'R.ring': 'ear', 'R.pinky': 'ear' }, hint: 'Left index points down as the trunk, right hand open as the ear.' },
  // Act 3 — the lantern moves: the shadow has to be big (hands near the lantern) or small (far from it).
  { id: 'kumo', name: 'Giant spider', jp: '大蜘蛛', act: 3, order: 1, hands: 2, locomotion: 'scuttle', facing: 1, size: { min: 1.3, max: 9 }, rig: { 'L.index': 'leg', 'L.middle': 'leg', 'L.ring': 'leg', 'L.pinky': 'leg', 'R.index': 'leg', 'R.middle': 'leg', 'R.ring': 'leg', 'R.pinky': 'leg' }, hint: 'Open hands crossed, fingers down. Make it huge: lantern close.' },
  { id: 'kurage', name: 'Tiny jellyfish', jp: '水母', act: 3, order: 2, hands: 1, locomotion: 'swim', facing: 1, size: { min: 0, max: 0.8 }, rig: { index: 'tail', middle: 'tail', ring: 'tail', pinky: 'tail' }, hint: 'Open hand, fingers down. Make it small: lantern back.' },
  { id: 'washi', name: 'Great eagle', jp: '大鷲', act: 3, order: 3, hands: 2, locomotion: 'fly', facing: 1, size: { min: 1.3, max: 9 }, rig: { 'L.index': 'wing', 'L.middle': 'wing', 'L.ring': 'wing', 'L.pinky': 'wing', 'R.index': 'wing', 'R.middle': 'wing', 'R.ring': 'wing', 'R.pinky': 'wing' }, hint: 'Both hands open, spread out like wings. Make it huge.' },
  { id: 'koi', name: 'Little koi', jp: '鯉', act: 3, order: 4, hands: 1, locomotion: 'swim', facing: 1, size: { min: 0, max: 0.8 }, rig: { index: 'fin', middle: 'fin', ring: 'fin', pinky: 'fin', thumb: 'fin' }, hint: 'Open hand side-on, fingers down to the right. Make it small.' },
  { id: 'tsubame', name: 'Little swallow', jp: '燕', act: 3, order: 5, hands: 1, locomotion: 'fly', facing: -1, size: { min: 0, max: 0.8 }, rig: { index: 'wing', middle: 'wing', ring: 'wing' }, hint: 'Three fingers down to the left, hand side-on. Make it small.' },
  // Free-shadow bestiary: make anything and the nearest one answers.
  { id: 'tako', name: 'Octopus', jp: '蛸', act: 0, order: 1, hands: 1, locomotion: 'swim', facing: 1, rig: { index: 'tail', middle: 'tail', ring: 'tail', pinky: 'tail', thumb: 'tail' }, hint: 'Open hand, fingers down to the right, palm to the lantern.' },
  { id: 'niwatori', name: 'Rooster', jp: '鶏', act: 0, order: 2, hands: 2, locomotion: 'stalk', facing: -1, rig: { 'R.index': 'ear', 'R.middle': 'ear', 'R.ring': 'ear' }, hint: 'Three fingers up over a fist.' },
  { id: 'kamome', name: 'Gull', jp: '鴎', act: 0, order: 3, hands: 2, locomotion: 'fly', facing: 1, rig: { 'L.index': 'wing', 'L.middle': 'wing', 'R.index': 'wing', 'R.middle': 'wing', 'R.ring': 'wing' }, hint: 'A cupped hand and a flat hand, out like wings.' },
  { id: 'tonbo', name: 'Dragonfly', jp: '蜻蛉', act: 0, order: 4, hands: 1, locomotion: 'fly', facing: 1, rig: { index: 'wing', middle: 'wing', ring: 'wing', pinky: 'wing' }, hint: 'Four fingers up and to the right, side-on.' },
  { id: 'kawauso', name: 'Otter', jp: '獺', act: 0, order: 5, hands: 1, locomotion: 'swim', facing: -1, rig: { index: 'tail', middle: 'tail' }, hint: 'Peace sign up and to the left, side-on.' },
  { id: 'ryu', name: 'Dragon', jp: '竜', act: 0, order: 6, hands: 2, locomotion: 'fly', facing: 1, rig: { 'L.index': 'jaw', 'L.thumb': 'jaw', 'R.index': 'wing', 'R.middle': 'wing', 'R.ring': 'wing', 'R.pinky': 'wing' }, hint: 'An ok sign and a flat hand on a diagonal.' },
  { id: 'kaeru', name: 'Frog', jp: '蛙', act: 0, order: 7, hands: 2, locomotion: 'hop', facing: 1, rig: { 'L.index': 'leg', 'R.index': 'leg', 'R.middle': 'leg' }, hint: 'A pointing hand beside a cupped hand.' },
  { id: 'kabuto', name: 'Beetle', jp: '兜虫', act: 0, order: 8, hands: 2, locomotion: 'scuttle', facing: 1, rig: { 'L.index': 'antenna', 'L.pinky': 'antenna', 'R.index': 'antenna', 'R.pinky': 'antenna' }, hint: 'Two rock signs out sideways like wings.' },
  { id: 'fukurou', name: 'Owl', jp: '梟', act: 0, order: 9, hands: 2, locomotion: 'fly', facing: 1, rig: { 'L.index': 'ear', 'R.index': 'ear', 'L.middle': 'wing', 'R.middle': 'wing' }, hint: 'Both hands clawed, fingers down, a little apart: two round eyes.' },
  { id: 'sakana', name: 'Fish', jp: '魚', act: 0, order: 10, hands: 1, locomotion: 'swim', facing: -1, rig: { index: 'fin', pinky: 'fin', thumb: 'fin' }, hint: 'Open hand side-on, fingers down to the left.' },
];

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
