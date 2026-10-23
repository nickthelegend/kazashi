/**
 * Analytic shadow raster: project the hand's bone capsules and palm polygon
 * through the lantern (a pinhole), rasterise them into a 64×64 bit grid, and
 * score two shadows by IoU after normalising centroid and scale, with a ±10°
 * rotation tolerance. No GPU readback; the live path allocates nothing.
 */

import { BONES, JOINT_RADII, PALM_POLYGON, type HandJoints } from './hand.js';

export const GRID = 64;
const WORDS = (GRID * GRID) / 32;
/** Normalised silhouettes cover this many cells (≈10% of the grid). */
export const NORMALISED_SIDE = 20;
export const NORMALISED_AREA = NORMALISED_SIDE * NORMALISED_SIDE;
/** Joints closer to the light than this (metres, along the light axis) cast no usable shadow. */
export const MIN_DEPTH = 0.03;
export const ROTATIONS_DEG = [-10, -5, 0, 5, 10] as const;

const MAX_HANDS = 2;
const CAPS_PER_HAND = BONES.length;
const POLY_PER_HAND = PALM_POLYGON.length;

/** A projected shadow on the 1 m pinhole image. */
export class Shape2D {
  /** ax, ay, ar, bx, by, br per capsule. */
  readonly caps = new Float32Array(MAX_HANDS * CAPS_PER_HAND * 6);
  /** Finger group of each capsule (+6 for the second hand). */
  readonly capGroups = new Uint8Array(MAX_HANDS * CAPS_PER_HAND);
  /** xy pairs, one palm per hand. */
  readonly polys = new Float32Array(MAX_HANDS * POLY_PER_HAND * 2);
  nCaps = 0;
  nPolys = 0;

  clear(): void {
    this.nCaps = 0;
    this.nPolys = 0;
  }

  copyFrom(o: Shape2D): this {
    this.caps.set(o.caps);
    this.capGroups.set(o.capGroups);
    this.polys.set(o.polys);
    this.nCaps = o.nCaps;
    this.nPolys = o.nPolys;
    return this;
  }
}

/**
 * Projects light-frame hands. Returns false (and leaves the shape empty) when
 * a joint sits beside or behind the lantern, where it would cast no shadow.
 */
export function projectHands(hands: readonly HandJoints[], out: Shape2D): boolean {
  out.clear();
  if (hands.length > MAX_HANDS) throw new Error(`at most ${MAX_HANDS} hands`);
  for (let h = 0; h < hands.length; h++) {
    const j = hands[h];
    for (let i = 0; i < 25; i++) {
      if (-j[i * 3 + 2] < MIN_DEPTH) {
        out.clear();
        return false;
      }
    }
    for (let b = 0; b < BONES.length; b++) {
      const bone = BONES[b];
      const o = out.nCaps * 6;
      const za = -j[bone.a * 3 + 2];
      const zb = -j[bone.b * 3 + 2];
      out.caps[o] = j[bone.a * 3] / za;
      out.caps[o + 1] = j[bone.a * 3 + 1] / za;
      out.caps[o + 2] = JOINT_RADII[bone.a] / za;
      out.caps[o + 3] = j[bone.b * 3] / zb;
      out.caps[o + 4] = j[bone.b * 3 + 1] / zb;
      out.caps[o + 5] = JOINT_RADII[bone.b] / zb;
      out.capGroups[out.nCaps] = bone.group + h * 6;
      out.nCaps++;
    }
    const po = out.nPolys * POLY_PER_HAND * 2;
    for (let k = 0; k < POLY_PER_HAND; k++) {
      const ji = PALM_POLYGON[k];
      const z = -j[ji * 3 + 2];
      out.polys[po + k * 2] = j[ji * 3] / z;
      out.polys[po + k * 2 + 1] = j[ji * 3 + 1] / z;
    }
    out.nPolys++;
  }
  return true;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function shapeBounds(s: Shape2D, out: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let c = 0; c < s.nCaps; c++) {
    const o = c * 6;
    for (let e = 0; e < 2; e++) {
      const x = s.caps[o + e * 3];
      const y = s.caps[o + e * 3 + 1];
      const r = s.caps[o + e * 3 + 2];
      if (x - r < minX) minX = x - r;
      if (y - r < minY) minY = y - r;
      if (x + r > maxX) maxX = x + r;
      if (y + r > maxY) maxY = y + r;
    }
  }
  for (let i = 0; i < s.nPolys * POLY_PER_HAND; i++) {
    const x = s.polys[i * 2];
    const y = s.polys[i * 2 + 1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  out.minX = minX;
  out.minY = minY;
  out.maxX = maxX;
  out.maxY = maxY;
  return out;
}

/** A 64×64 bit mask. */
export class Mask {
  readonly bits = new Uint32Array(WORDS);

  clear(): void {
    this.bits.fill(0);
  }

  get(x: number, y: number): boolean {
    const i = y * GRID + x;
    return (this.bits[i >>> 5] & (1 << (i & 31))) !== 0;
  }

  set(x: number, y: number): void {
    const i = y * GRID + x;
    this.bits[i >>> 5] |= 1 << (i & 31);
  }

  count(): number {
    let n = 0;
    for (let w = 0; w < WORDS; w++) n += popcount(this.bits[w]);
    return n;
  }

  /** ASCII art, top row first (debugging and TESTING.md). */
  toAscii(): string {
    const rows: string[] = [];
    for (let y = GRID - 1; y >= 0; y--) {
      let r = '';
      for (let x = 0; x < GRID; x++) r += this.get(x, y) ? '#' : '.';
      rows.push(r);
    }
    return rows.join('\n');
  }
}

function popcount(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function iou(a: Mask, b: Mask): number {
  let inter = 0;
  let uni = 0;
  for (let w = 0; w < WORDS; w++) {
    inter += popcount(a.bits[w] & b.bits[w]);
    uni += popcount(a.bits[w] | b.bits[w]);
  }
  return uni === 0 ? 0 : inter / uni;
}

/** Grid placement: grid = R(θ)·(p − c)·s + GRID/2. */
export interface Placement {
  cx: number;
  cy: number;
  scale: number;
  angle: number;
}

// Scratch buffers for the transformed shape (grid space).
const tCaps = new Float32Array(MAX_HANDS * CAPS_PER_HAND * 6);
const tPolys = new Float32Array(MAX_HANDS * POLY_PER_HAND * 2);

export function rasterize(s: Shape2D, p: Placement, out: Mask): Mask {
  out.clear();
  const cos = Math.cos(p.angle);
  const sin = Math.sin(p.angle);
  const h = GRID / 2;
  const tx = (x: number, y: number) => ((x - p.cx) * cos - (y - p.cy) * sin) * p.scale + h;
  const ty = (x: number, y: number) => ((x - p.cx) * sin + (y - p.cy) * cos) * p.scale + h;

  for (let c = 0; c < s.nCaps; c++) {
    const o = c * 6;
    for (let e = 0; e < 2; e++) {
      const x = s.caps[o + e * 3];
      const y = s.caps[o + e * 3 + 1];
      tCaps[o + e * 3] = tx(x, y);
      tCaps[o + e * 3 + 1] = ty(x, y);
      tCaps[o + e * 3 + 2] = s.caps[o + e * 3 + 2] * p.scale;
    }
    fillCapsule(tCaps, o, out);
  }
  for (let k = 0; k < s.nPolys; k++) {
    const base = k * POLY_PER_HAND * 2;
    for (let v = 0; v < POLY_PER_HAND; v++) {
      const x = s.polys[base + v * 2];
      const y = s.polys[base + v * 2 + 1];
      tPolys[base + v * 2] = tx(x, y);
      tPolys[base + v * 2 + 1] = ty(x, y);
    }
    fillPolygon(tPolys, base, POLY_PER_HAND, out);
  }
  return out;
}

function clampCell(v: number): number {
  return v < 0 ? 0 : v > GRID - 1 ? GRID - 1 : v;
}

function fillCapsule(c: Float32Array, o: number, out: Mask): void {
  const ax = c[o];
  const ay = c[o + 1];
  const ar = c[o + 2];
  const bx = c[o + 3];
  const by = c[o + 4];
  const br = c[o + 5];
  const r = Math.max(ar, br);
  const x0 = clampCell(Math.floor(Math.min(ax, bx) - r));
  const x1 = clampCell(Math.ceil(Math.max(ax, bx) + r));
  const y0 = clampCell(Math.floor(Math.min(ay, by) - r));
  const y1 = clampCell(Math.ceil(Math.max(ay, by) + r));
  if (Math.min(ax, bx) - r > GRID || Math.max(ax, bx) + r < 0) return;
  if (Math.min(ay, by) - r > GRID || Math.max(ay, by) + r < 0) return;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      let t = len2 > 1e-12 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t - px;
      const qy = ay + dy * t - py;
      const rr = ar + (br - ar) * t;
      if (qx * qx + qy * qy <= rr * rr) out.set(x, y);
    }
  }
}

function fillPolygon(p: Float32Array, base: number, n: number, out: Mask): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let v = 0; v < n; v++) {
    const x = p[base + v * 2];
    const y = p[base + v * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0 || maxY < 0 || minX > GRID || minY > GRID) return;
  const x0 = clampCell(Math.floor(minX));
  const x1 = clampCell(Math.ceil(maxX));
  const y0 = clampCell(Math.floor(minY));
  const y1 = clampCell(Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = p[base + i * 2];
        const yi = p[base + i * 2 + 1];
        const xj = p[base + j * 2];
        const yj = p[base + j * 2 + 1];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) out.set(x, y);
    }
  }
}

/** Centroid and area of a projected shadow, measured on a fitted 64×64 raster. */
export interface Measure {
  /** Image-plane area (1 m wall), m². */
  area: number;
  cx: number;
  cy: number;
  /** Image-plane bounds. */
  bounds: Bounds;
}

const measureMask = new Mask();
const measureBounds: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

export function measure(s: Shape2D, out: Measure = { area: 0, cx: 0, cy: 0, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }): Measure {
  const b = shapeBounds(s, measureBounds);
  const side = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1e-6) * 1.04;
  const scale = GRID / side;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  rasterize(s, { cx, cy, scale, angle: 0 }, measureMask);
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (measureMask.get(x, y)) {
        n++;
        sx += x + 0.5;
        sy += y + 0.5;
      }
    }
  }
  out.area = n / (scale * scale);
  out.cx = n ? (sx / n - GRID / 2) / scale + cx : cx;
  out.cy = n ? (sy / n - GRID / 2) / scale + cy : cy;
  out.bounds.minX = b.minX;
  out.bounds.minY = b.minY;
  out.bounds.maxX = b.maxX;
  out.bounds.maxY = b.maxY;
  return out;
}

/** Rasterises a shape normalised for centroid and area, rotated by `angle`. */
export function normalisedMask(s: Shape2D, m: Measure, angle: number, out: Mask): Mask {
  const scale = m.area > 0 ? NORMALISED_SIDE / Math.sqrt(m.area) : 1;
  return rasterize(s, { cx: m.cx, cy: m.cy, scale, angle }, out);
}

/** A target's normalised masks at each tolerated rotation. */
export interface TargetSilhouette {
  id: string;
  masks: Mask[];
  /** Aspect of the target (height / width) on the image plane, for UI. */
  measure: Measure;
}

export function buildTargetSilhouette(id: string, shape: Shape2D): TargetSilhouette {
  const m = measure(shape);
  const masks = ROTATIONS_DEG.map((deg) => normalisedMask(shape, m, (deg * Math.PI) / 180, new Mask()));
  return { id, masks, measure: { ...m, bounds: { ...m.bounds } } };
}

/** Best IoU of a live normalised mask against a target over the tolerated rotations. */
export function scoreAgainst(live: Mask, target: TargetSilhouette): number {
  let best = 0;
  for (const mk of target.masks) {
    const v = iou(live, mk);
    if (v > best) best = v;
  }
  return best;
}

/**
 * The live scorer: project, measure, normalise, then score against targets.
 * One instance per app; it reuses its buffers.
 */
export class SilhouetteScorer {
  readonly shape = new Shape2D();
  readonly mask = new Mask();
  readonly measure: Measure = { area: 0, cx: 0, cy: 0, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  valid = false;

  /** Returns false when no usable shadow exists (no hands or a hand beside the lantern). */
  update(hands: readonly HandJoints[]): boolean {
    this.valid = hands.length > 0 && projectHands(hands, this.shape);
    if (!this.valid) {
      this.mask.clear();
      return false;
    }
    measure(this.shape, this.measure);
    normalisedMask(this.shape, this.measure, 0, this.mask);
    return true;
  }

  score(target: TargetSilhouette): number {
    return this.valid ? scoreAgainst(this.mask, target) : 0;
  }

  /** Index and score of the nearest target. */
  nearest(targets: readonly TargetSilhouette[]): { index: number; score: number } {
    let index = -1;
    let score = 0;
    if (!this.valid) return { index, score };
    for (let i = 0; i < targets.length; i++) {
      const v = scoreAgainst(this.mask, targets[i]);
      if (v > score) {
        score = v;
        index = i;
      }
    }
    return { index, score };
  }
}
