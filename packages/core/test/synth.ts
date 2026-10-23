// A tiny synthetic hand for unit tests: straight fingers fanned in the XY
// plane, in front of the light (z < 0). Not used for authored targets.
import { createHandJoints, type HandJoints } from '../src/hand.js';

export function synthHand(opts: { x?: number; y?: number; z?: number; spread?: number; curl?: number[]; angle?: number } = {}): HandJoints {
  const { x = 0, y = 0, z = -0.3, spread = 0.18, curl = [0, 0, 0, 0, 0], angle = 0 } = opts;
  const j = createHandJoints();
  const set = (i: number, px: number, py: number) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    j[i * 3] = x + px * c - py * s;
    j[i * 3 + 1] = y + px * s + py * c;
    j[i * 3 + 2] = z;
  };
  set(0, 0, 0);
  const lengths = [0.03, 0.035, 0.025, 0.02];
  for (let f = 0; f < 5; f++) {
    const base = f === 0 ? 1 : f * 5;
    const dir = (f - 2) * spread + Math.PI / 2;
    let px = Math.cos(dir) * 0.04;
    let py = Math.sin(dir) * 0.04;
    const count = f === 0 ? 4 : 5;
    let a = dir;
    for (let k = 0; k < count; k++) {
      set(base + k, px, py);
      if (k > 0) a += curl[f];
      px += Math.cos(a) * lengths[Math.min(k, 3)];
      py += Math.sin(a) * lengths[Math.min(k, 3)];
    }
  }
  return j;
}
