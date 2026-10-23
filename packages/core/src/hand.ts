/**
 * WebXR hand topology: the 25 joints in `XRHand` order, the bones we turn into
 * shadow capsules, and the palm polygon. Shared by the live matcher, the
 * authored targets and the GPU shadow proxy so all three cast the same shape.
 */

export const JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  'index-finger-metacarpal',
  'index-finger-phalanx-proximal',
  'index-finger-phalanx-intermediate',
  'index-finger-phalanx-distal',
  'index-finger-tip',
  'middle-finger-metacarpal',
  'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-distal',
  'middle-finger-tip',
  'ring-finger-metacarpal',
  'ring-finger-phalanx-proximal',
  'ring-finger-phalanx-intermediate',
  'ring-finger-phalanx-distal',
  'ring-finger-tip',
  'pinky-finger-metacarpal',
  'pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-intermediate',
  'pinky-finger-phalanx-distal',
  'pinky-finger-tip',
] as const;

export type JointName = (typeof JOINT_NAMES)[number];
export const JOINT_COUNT = 25;

/** Finger groups, used by the creature rig. 0 = palm. */
export const GROUP = { palm: 0, thumb: 1, index: 2, middle: 3, ring: 4, pinky: 5 } as const;
export type GroupName = keyof typeof GROUP;
export const GROUPS_PER_HAND = 6;

/** A bone: two joint indices and the finger group it belongs to. */
export interface Bone {
  a: number;
  b: number;
  group: number;
}

/** A finger chain. Its first bone (inside the palm) belongs to the palm group, so the rig bends the finger, not the palm. */
function chain(indices: number[], group: number): Bone[] {
  const out: Bone[] = [];
  for (let i = 0; i + 1 < indices.length; i++) out.push({ a: indices[i], b: indices[i + 1], group: i === 0 ? GROUP.palm : group });
  return out;
}

/**
 * Capsules: every finger segment plus the thumb's root and the metacarpals
 * (which give the palm thickness when the hand is edge-on to the light).
 */
export const BONES: readonly Bone[] = [
  ...chain([0, 1, 2, 3, 4], GROUP.thumb),
  ...chain([5, 6, 7, 8, 9], GROUP.index),
  ...chain([10, 11, 12, 13, 14], GROUP.middle),
  ...chain([15, 16, 17, 18, 19], GROUP.ring),
  ...chain([20, 21, 22, 23, 24], GROUP.pinky),
  { a: 0, b: 5, group: GROUP.palm },
  { a: 0, b: 20, group: GROUP.palm },
];

/** Palm outline, walked around the hand. */
export const PALM_POLYGON: readonly number[] = [0, 1, 6, 11, 16, 21, 20];

/** The joint at the root of each finger group: the rig's pivot. */
export const GROUP_PIVOT_JOINT: readonly number[] = [0, 1, 6, 11, 16, 21];

/**
 * Joint radii (metres) used by the matcher and the shadow proxy. Real runtimes
 * report per-user radii; using one fixed table keeps live and authored shapes
 * comparable (scale is normalised away anyway). Values follow the emulator's
 * default hand.
 */
export const JOINT_RADII = new Float32Array([
  0.0215, 0.0194, 0.0123, 0.0098, 0.0088, 0.0212, 0.0103, 0.0085, 0.0076, 0.0068,
  0.0212, 0.0107, 0.0088, 0.0078, 0.0070, 0.0196, 0.0102, 0.0084, 0.0074, 0.0066,
  0.0186, 0.0090, 0.0075, 0.0066, 0.0060,
]);

/** One tracked hand: 25 joint positions, xyz interleaved. */
export type HandJoints = Float32Array;

export function createHandJoints(): HandJoints {
  return new Float32Array(JOINT_COUNT * 3);
}

export function jointsFromRecord(rec: Record<string, readonly number[]>): HandJoints {
  const out = createHandJoints();
  JOINT_NAMES.forEach((name, i) => {
    const p = rec[name];
    if (!p || p.length < 3) throw new Error(`hand pose is missing joint "${name}"`);
    out[i * 3] = p[0];
    out[i * 3 + 1] = p[1];
    out[i * 3 + 2] = p[2];
  });
  return out;
}

export function jointsToRecord(j: HandJoints, digits = 4): Record<string, number[]> {
  const rec: Record<string, number[]> = {};
  const f = 10 ** digits;
  JOINT_NAMES.forEach((name, i) => {
    rec[name] = [
      Math.round(j[i * 3] * f) / f,
      Math.round(j[i * 3 + 1] * f) / f,
      Math.round(j[i * 3 + 2] * f) / f,
    ];
  });
  return rec;
}
