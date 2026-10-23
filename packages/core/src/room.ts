/**
 * Room reading. Detected planes carry no labels on Quest, so every surface is
 * classified from its orientation, height and size alone. Surfaces are
 * rectangles (centre, normal, in-plane axes, half extents) in world metres.
 */

import type { Vec3 } from './lightframe.js';

export type SurfaceKind = 'floor' | 'ceiling' | 'wall' | 'desk' | 'shelf' | 'panel' | 'slanted' | 'shoji';

export interface Surface {
  id: string;
  kind: SurfaceKind;
  /** Rectangle centre. */
  origin: Vec3;
  /** Unit normal, facing into the room. */
  normal: Vec3;
  /** In-plane axes. For vertical surfaces u is horizontal (right when facing the surface) and v is up. */
  u: Vec3;
  v: Vec3;
  halfU: number;
  halfV: number;
}

/** A detected plane: its pose basis and polygon points in world space. */
export interface PlaneInput {
  id: string;
  normal: Vec3;
  /** Polygon vertices in world space. */
  points: Vec3[];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => scale(a, 1 / (len(a) || 1));

export const WALL_MIN_WIDTH = 1.0;
export const WALL_MIN_HEIGHT = 1.0;
export const DESK_MIN_HEIGHT = 0.3;
export const DESK_MAX_HEIGHT = 1.25;
export const CEILING_MIN_HEIGHT = 1.9;

/** In-plane axes for a surface normal. Vertical surfaces get (right, up). */
export function surfaceAxes(normal: Vec3): { u: Vec3; v: Vec3 } {
  const n = norm(normal);
  if (Math.abs(n[1]) < 0.9) {
    const u = norm(cross([0, 1, 0], n));
    return { u, v: cross(n, u) };
  }
  // Horizontal: u = world +X, v completes a right-handed basis with n.
  const u = norm(sub([1, 0, 0], scale(n, n[0])));
  return { u, v: cross(n, u) };
}

/** Fits a rectangle to a planar polygon. */
export function fitSurface(p: PlaneInput, kind: SurfaceKind): Surface {
  if (p.points.length < 3) throw new Error(`plane ${p.id} has fewer than 3 points`);
  const n = norm(p.normal);
  const { u, v } = surfaceAxes(n);
  const c0 = p.points.reduce((acc, q) => add(acc, q), [0, 0, 0] as Vec3);
  const centroid = scale(c0, 1 / p.points.length);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const q of p.points) {
    const d = sub(q, centroid);
    const a = dot(d, u);
    const b = dot(d, v);
    minU = Math.min(minU, a);
    maxU = Math.max(maxU, a);
    minV = Math.min(minV, b);
    maxV = Math.max(maxV, b);
  }
  const origin = add(centroid, add(scale(u, (minU + maxU) / 2), scale(v, (minV + maxV) / 2)));
  return { id: p.id, kind, origin, normal: n, u, v, halfU: (maxU - minU) / 2, halfV: (maxV - minV) / 2 };
}

/**
 * Classifies planes by orientation, height above the floor and size.
 * The floor is the lowest upward-facing plane (y = 0 when there is none).
 */
export function classifyPlanes(planes: readonly PlaneInput[]): Surface[] {
  const ups = planes.filter((p) => norm(p.normal)[1] > 0.9);
  const meanY = (p: PlaneInput) => p.points.reduce((s, q) => s + q[1], 0) / p.points.length;
  const floorY = ups.length ? Math.min(...ups.map(meanY)) : 0;
  return planes.map((p) => {
    const n = norm(p.normal);
    const h = meanY(p) - floorY;
    let kind: SurfaceKind;
    if (n[1] > 0.9) {
      kind = h < 0.15 ? 'floor' : h >= DESK_MIN_HEIGHT && h <= DESK_MAX_HEIGHT ? 'desk' : 'shelf';
    } else if (n[1] < -0.9) {
      kind = h >= CEILING_MIN_HEIGHT ? 'ceiling' : 'shelf';
    } else if (Math.abs(n[1]) < 0.25) {
      const s = fitSurface(p, 'panel');
      kind = s.halfU * 2 >= WALL_MIN_WIDTH && s.halfV * 2 >= WALL_MIN_HEIGHT ? 'wall' : 'panel';
    } else {
      kind = 'slanted';
    }
    return fitSurface(p, kind);
  });
}

/** Surface-local coordinates of a world point. */
export function toSurface(s: Surface, p: Vec3): { a: number; b: number; h: number } {
  const d = sub(p, s.origin);
  return { a: dot(d, s.u), b: dot(d, s.v), h: dot(d, s.normal) };
}

export function fromSurface(s: Surface, a: number, b: number, h = 0): Vec3 {
  return add(s.origin, add(scale(s.u, a), add(scale(s.v, b), scale(s.normal, h))));
}

export function containsPoint(s: Surface, a: number, b: number, margin = 0): boolean {
  return Math.abs(a) <= s.halfU + margin && Math.abs(b) <= s.halfV + margin;
}

/** Ray–surface hit: distance along the (unit) direction, or null. */
export function raySurface(s: Surface, origin: Vec3, dir: Vec3, margin = 0): number | null {
  const d = norm(dir);
  const den = dot(s.normal, d);
  if (den > -1e-4) return null; // parallel or hitting the back
  const t = dot(s.normal, sub(s.origin, origin)) / den;
  if (t <= 0) return null;
  const hit = add(origin, scale(d, t));
  const { a, b } = toSurface(s, hit);
  return containsPoint(s, a, b, margin) ? t : null;
}

export const WALL_SEARCH_RANGE = 5;

/**
 * The wall the lantern lights: the wall hit by the aim ray (within range),
 * else the nearest wall that faces the lantern and lies ahead of it.
 */
export function pickWall(surfaces: readonly Surface[], light: Vec3, aim: Vec3): Surface | null {
  const walls = surfaces.filter((s) => s.kind === 'wall' || s.kind === 'shoji');
  let best: Surface | null = null;
  let bestT = Infinity;
  for (const w of walls) {
    const t = raySurface(w, light, aim, 0.1);
    if (t !== null && t <= WALL_SEARCH_RANGE && t < bestT) {
      best = w;
      bestT = t;
    }
  }
  if (best) return best;
  const flatAim = norm([aim[0], 0, aim[2]]);
  let bestScore = -Infinity;
  for (const w of walls) {
    const dist = dot(w.normal, sub(light, w.origin));
    if (dist <= 0.2 || dist > WALL_SEARCH_RANGE) continue;
    const facing = -dot(w.normal, flatAim);
    if (facing < 0.5) continue;
    const score = facing * 2 - dist * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = w;
    }
  }
  return best;
}

/**
 * Where the lantern goes: on a desk within reach in front of the viewer,
 * near `reach` metres ahead. Null when no desk qualifies.
 */
export function pickLanternSpot(
  surfaces: readonly Surface[],
  head: Vec3,
  forward: Vec3,
  reach = 0.5,
  maxDistance = 1.1,
): { surface: Surface; point: Vec3 } | null {
  const f = norm([forward[0], 0, forward[2]]);
  const want: Vec3 = [head[0] + f[0] * reach, 0, head[2] + f[2] * reach];
  let best: { surface: Surface; point: Vec3 } | null = null;
  let bestD = Infinity;
  for (const s of surfaces) {
    if (s.kind !== 'desk') continue;
    const inset = 0.08;
    const w: Vec3 = [want[0], s.origin[1], want[2]];
    const { a, b } = toSurface(s, w);
    const ca = Math.max(-s.halfU + inset, Math.min(s.halfU - inset, a));
    const cb = Math.max(-s.halfV + inset, Math.min(s.halfV - inset, b));
    const p = fromSurface(s, ca, cb, 0);
    const horiz = Math.hypot(p[0] - head[0], p[2] - head[2]);
    const ahead = (p[0] - head[0]) * f[0] + (p[2] - head[2]) * f[2];
    if (horiz > maxDistance || ahead < 0.15) continue;
    const d = Math.hypot(p[0] - want[0], p[2] - want[2]);
    if (d < bestD) {
      bestD = d;
      best = { surface: s, point: p };
    }
  }
  return best;
}

/** Closest point of a surface's rectangle to a world point. */
export function closestOnSurface(s: Surface, p: Vec3, inset = 0): { a: number; b: number; point: Vec3; distance: number } {
  const { a, b } = toSurface(s, p);
  const ca = Math.max(-s.halfU + inset, Math.min(s.halfU - inset, a));
  const cb = Math.max(-s.halfV + inset, Math.min(s.halfV - inset, b));
  const point = fromSurface(s, ca, cb, 0);
  return { a: ca, b: cb, point, distance: len(sub(point, p)) };
}

export const MAX_JUMP_GAP = 0.8;

/**
 * A creature leaving `from` at world point `exit` looks for the nearest other
 * surface of an allowed kind within `MAX_JUMP_GAP` to jump onto.
 */
export function findJump(
  surfaces: readonly Surface[],
  from: Surface,
  exit: Vec3,
  kinds: readonly SurfaceKind[],
  inset = 0.2,
): { surface: Surface; a: number; b: number; point: Vec3; gap: number } | null {
  let best: { surface: Surface; a: number; b: number; point: Vec3; gap: number } | null = null;
  for (const s of surfaces) {
    if (s === from || s.id === from.id || !kinds.includes(s.kind)) continue;
    // Coplanar neighbours (a gap in the same wall) and corners both count.
    const edge = closestOnSurface(s, exit, 0);
    if (edge.distance > MAX_JUMP_GAP) continue;
    const land = closestOnSurface(s, exit, Math.min(inset, s.halfU * 0.5, s.halfV * 0.5));
    if (!best || edge.distance < best.gap) best = { surface: s, a: land.a, b: land.b, point: land.point, gap: edge.distance };
  }
  return best;
}

/** A shoji screen placed where no wall was found. */
export function shojiSurface(center: Vec3, facing: Vec3, width = 1.6, height = 1.8): Surface {
  const n = norm([facing[0], 0, facing[2]]);
  const { u, v } = surfaceAxes(n);
  return { id: 'shoji', kind: 'shoji', origin: center, normal: n, u, v, halfU: width / 2, halfV: height / 2 };
}
