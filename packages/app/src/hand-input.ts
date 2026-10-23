/**
 * Reads WebXR hand joints (25 per hand) into world-space arrays every frame.
 * No allocation per frame. Also derives palm centre and palm normal for the
 * wrist menu and the curtain gesture.
 */
import { JOINT_NAMES } from '@kazashi/core/hand';
import { Matrix4, Vector3 } from '@iwsdk/core';

export type Side = 'left' | 'right';
export const SIDES: readonly Side[] = ['left', 'right'];

export class HandFrame {
  readonly joints = new Float32Array(75);
  tracked = false;
  /** Seconds since tracking was last seen. */
  lostFor = 0;
  readonly palm = new Vector3();
  /** Unit normal out of the palm. */
  readonly palmNormal = new Vector3();
  /** Unit direction from wrist to middle knuckle. */
  readonly fingerDir = new Vector3();
  readonly indexTip = new Vector3();
  readonly thumbTip = new Vector3();
}

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();

export function jointVec(j: Float32Array, i: number, out: Vector3): Vector3 {
  return out.set(j[i * 3], j[i * 3 + 1], j[i * 3 + 2]);
}

/** Palm centre, normal (out of the palm) and finger direction from joints. */
export function derivePalm(h: HandFrame, side: Side): void {
  const j = h.joints;
  const wrist = jointVec(j, 0, tmpA);
  const index = jointVec(j, 6, tmpB);
  const pinky = jointVec(j, 21, tmpC);
  h.palm.set(0, 0, 0);
  for (const i of [0, 6, 11, 16, 21]) h.palm.x += j[i * 3] / 5, h.palm.y += j[i * 3 + 1] / 5, h.palm.z += j[i * 3 + 2] / 5;
  h.fingerDir.set(j[33] - wrist.x, j[34] - wrist.y, j[35] - wrist.z).normalize();
  const across = index.sub(pinky); // pinky → index
  // For a right hand, fingers × (pinky→index) points out of the back of the hand.
  h.palmNormal.crossVectors(h.fingerDir, across).normalize();
  if (side === 'right') h.palmNormal.negate();
  jointVec(j, 9, h.indexTip);
  jointVec(j, 4, h.thumbTip);
}

export class HandReader {
  readonly hands: Record<Side, HandFrame> = { left: new HandFrame(), right: new HandFrame() };
  private readonly m = new Matrix4();
  private readonly v = new Vector3();

  update(frame: XRFrame | undefined, ref: XRReferenceSpace | null, originMatrix: Matrix4, delta: number): void {
    const seen: Record<Side, boolean> = { left: false, right: false };
    const session = frame?.session;
    if (frame && ref && session) {
      for (const src of session.inputSources) {
        const hand = src.hand;
        const side = src.handedness as Side;
        if (!hand || (side !== 'left' && side !== 'right')) continue;
        const out = this.hands[side];
        let ok = true;
        for (let i = 0; i < 25; i++) {
          const space = hand.get(JOINT_NAMES[i] as XRHandJoint);
          const pose = space ? frame.getJointPose?.(space, ref) : undefined;
          if (!pose) {
            ok = false;
            break;
          }
          const p = pose.transform.position;
          this.v.set(p.x, p.y, p.z).applyMatrix4(originMatrix);
          out.joints[i * 3] = this.v.x;
          out.joints[i * 3 + 1] = this.v.y;
          out.joints[i * 3 + 2] = this.v.z;
        }
        if (ok) {
          seen[side] = true;
          derivePalm(out, side);
        }
      }
    }
    for (const side of SIDES) {
      const h = this.hands[side];
      h.tracked = seen[side];
      h.lostFor = seen[side] ? 0 : h.lostFor + delta;
    }
    void this.m;
  }
}
