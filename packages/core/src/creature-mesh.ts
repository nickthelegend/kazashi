/**
 * Turns a target's projected shadow into a flat creature mesh: one triangle
 * fan per bone capsule plus the palm. Every vertex carries its finger group,
 * and each group has a pivot (the finger's root joint), so a vertex shader can
 * bend fingers into ears, jaws, legs and wings. The mesh is centred on the
 * shadow's centroid and scaled so sqrt(area) = 1.
 */

import { BONES, GROUP_PIVOT_JOINT, GROUPS_PER_HAND, PALM_POLYGON } from './hand.js';
import { measure, type Shape2D } from './silhouette.js';

export const MAX_GROUPS = GROUPS_PER_HAND * 2;
const ARC = 7;

export interface CreatureMeshData {
  /** xy per vertex, unit-area space. */
  positions: Float32Array;
  /** Group index per vertex (0..11). */
  groups: Float32Array;
  indices: Uint32Array;
  /** xy pivot per group (unit-area space). */
  pivots: Float32Array;
  /** Which groups exist. */
  groupMask: number;
  /** Bounds in unit-area space. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function buildCreatureMesh(shape: Shape2D): CreatureMeshData {
  const m = measure(shape);
  if (m.area <= 0) throw new Error('empty silhouette');
  const k = 1 / Math.sqrt(m.area);
  const tx = (x: number) => (x - m.cx) * k;
  const ty = (y: number) => (y - m.cy) * k;
  const pos: number[] = [];
  const grp: number[] = [];
  const idx: number[] = [];
  const pivots = new Float32Array(MAX_GROUPS * 2);
  let groupMask = 0;
  const bonesPerHand = BONES.length;

  const vert = (x: number, y: number, g: number) => {
    pos.push(x, y);
    grp.push(g);
    return grp.length - 1;
  };

  for (let c = 0; c < shape.nCaps; c++) {
    const o = c * 6;
    const g = shape.capGroups[c];
    groupMask |= 1 << g;
    const hand = Math.floor(c / bonesPerHand);
    const bone = BONES[c - hand * bonesPerHand];
    const ax = tx(shape.caps[o]);
    const ay = ty(shape.caps[o + 1]);
    const ar = shape.caps[o + 2] * k;
    const bx = tx(shape.caps[o + 3]);
    const by = ty(shape.caps[o + 4]);
    const br = shape.caps[o + 5] * k;
    const localGroup = g - hand * GROUPS_PER_HAND;
    if (localGroup !== 0 && bone.a === GROUP_PIVOT_JOINT[localGroup]) {
      pivots[g * 2] = ax;
      pivots[g * 2 + 1] = ay;
    }
    // Stadium: half circle around A facing away from B, then around B.
    let dx = bx - ax;
    let dy = by - ay;
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) {
      dx = 1;
      dy = 0;
    } else {
      dx /= l;
      dy /= l;
    }
    const base = Math.atan2(dy, dx);
    const centre = vert((ax + bx) / 2, (ay + by) / 2, g);
    const ring: number[] = [];
    for (let i = 0; i <= ARC; i++) {
      const t = base + Math.PI / 2 + (Math.PI * i) / ARC;
      ring.push(vert(ax + Math.cos(t) * ar, ay + Math.sin(t) * ar, g));
    }
    for (let i = 0; i <= ARC; i++) {
      const t = base - Math.PI / 2 + (Math.PI * i) / ARC;
      ring.push(vert(bx + Math.cos(t) * br, by + Math.sin(t) * br, g));
    }
    for (let i = 0; i < ring.length; i++) idx.push(centre, ring[i], ring[(i + 1) % ring.length]);
  }

  const n = PALM_POLYGON.length;
  for (let p = 0; p < shape.nPolys; p++) {
    const g = p * GROUPS_PER_HAND;
    groupMask |= 1 << g;
    let sx = 0;
    let sy = 0;
    const ids: number[] = [];
    for (let v = 0; v < n; v++) {
      const x = tx(shape.polys[(p * n + v) * 2]);
      const y = ty(shape.polys[(p * n + v) * 2 + 1]);
      sx += x;
      sy += y;
      ids.push(vert(x, y, g));
    }
    const c = vert(sx / n, sy / n, g);
    pivots[g * 2] = sx / n;
    pivots[g * 2 + 1] = sy / n;
    for (let v = 0; v < n; v++) idx.push(c, ids[v], ids[(v + 1) % n]);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.length; i += 2) {
    minX = Math.min(minX, pos[i]);
    maxX = Math.max(maxX, pos[i]);
    minY = Math.min(minY, pos[i + 1]);
    maxY = Math.max(maxY, pos[i + 1]);
  }
  return {
    positions: new Float32Array(pos),
    groups: new Float32Array(grp),
    indices: new Uint32Array(idx),
    pivots,
    groupMask,
    minX,
    minY,
    maxX,
    maxY,
  };
}
