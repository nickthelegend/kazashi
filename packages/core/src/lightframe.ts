/**
 * The light frame: a pinhole camera at the lantern looking at the wall.
 *
 *   z = wall normal (points from the wall back toward the light)
 *   y = world up, made perpendicular to z
 *   x = y × z (right, as seen from the lantern facing the wall)
 *
 * A shadow is the pinhole image of the hand in this frame: a point at local
 * (x, y, z) with z < 0 lands at (x / -z, y / -z) on a wall one metre away.
 * Projecting onto a wall D metres away only scales that image by D, so the
 * shape depends on the hand's pose relative to the lantern and the wall's
 * orientation, never on the wall distance. That is what lets one authored
 * target work in every room.
 */

export type Vec3 = [number, number, number];

export interface LightFrame {
  origin: Vec3;
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (l < 1e-9) throw new Error('cannot normalise a zero vector');
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Builds the frame from the lantern position and the wall normal. A wall
 * normal that is nearly vertical (a ceiling) falls back to `fallbackUp`.
 */
export function makeLightFrame(
  light: Vec3,
  wallNormal: Vec3,
  up: Vec3 = [0, 1, 0],
  fallbackUp: Vec3 = [0, 0, -1],
): LightFrame {
  const z = normalize(wallNormal);
  let u = up;
  if (Math.abs(dot(u, z)) > 0.95) u = fallbackUp;
  const k = dot(u, z);
  const y = normalize([u[0] - z[0] * k, u[1] - z[1] * k, u[2] - z[2] * k]);
  const x = cross(y, z);
  return { origin: [light[0], light[1], light[2]], x, y, z };
}

/** World joints (xyz interleaved) → light-frame joints, written into `out`. */
export function toLightFrame(frame: LightFrame, world: ArrayLike<number>, out: Float32Array): Float32Array {
  const [ox, oy, oz] = frame.origin;
  for (let i = 0; i + 2 < world.length; i += 3) {
    const dx = world[i] - ox;
    const dy = world[i + 1] - oy;
    const dz = world[i + 2] - oz;
    out[i] = dx * frame.x[0] + dy * frame.x[1] + dz * frame.x[2];
    out[i + 1] = dx * frame.y[0] + dy * frame.y[1] + dz * frame.y[2];
    out[i + 2] = dx * frame.z[0] + dy * frame.z[1] + dz * frame.z[2];
  }
  return out;
}

/** Light-frame point → world point. */
export function fromLightFrame(frame: LightFrame, p: ArrayLike<number>, out: Vec3 = [0, 0, 0]): Vec3 {
  for (let k = 0; k < 3; k++) {
    out[k] = frame.origin[k] + frame.x[k] * p[0] + frame.y[k] * p[1] + frame.z[k] * p[2];
  }
  return out;
}

/** Light-frame direction → world direction. */
export function dirFromLightFrame(frame: LightFrame, d: ArrayLike<number>, out: Vec3 = [0, 0, 0]): Vec3 {
  for (let k = 0; k < 3; k++) out[k] = frame.x[k] * d[0] + frame.y[k] * d[1] + frame.z[k] * d[2];
  return out;
}

/** Perpendicular distance from the light to the wall plane (positive when the light faces the wall). */
export function wallDistance(light: Vec3, wallPoint: Vec3, wallNormal: Vec3): number {
  const n = normalize(wallNormal);
  return (light[0] - wallPoint[0]) * n[0] + (light[1] - wallPoint[1]) * n[1] + (light[2] - wallPoint[2]) * n[2];
}

/**
 * Pinhole image (1 m wall) → world point on a wall `distance` metres from the light.
 */
export function imageToWall(frame: LightFrame, distance: number, ix: number, iy: number, out: Vec3 = [0, 0, 0]): Vec3 {
  return fromLightFrame(frame, [ix * distance, iy * distance, -distance], out);
}
