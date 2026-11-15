/**
 * Creature bodies: the animal a shadow becomes once it inks.
 *
 * A hand shadow makes a good puzzle and a poor animal (the old dog read as a
 * stool on stick legs). Each cast member therefore has its own procedural
 * body plan: a 2D silhouette in profile (head, ears or beak, body, tail,
 * jointed legs, wings, fins), built from tapered capsules, ellipses and
 * smoothed polygons that hang on a small bone hierarchy. Plans face +x, stand
 * on y = 0 and are normalised so the larger side of the bounding box is
 * `PLAN_SIZE`; the app scales them to the shadow's size.
 *
 * Posing is forward kinematics on the CPU (a few hundred vertices per
 * creature), so the walk cycle can put the stance foot exactly on the ground
 * line and tests can check it.
 */

export type Vec2 = [number, number];
/** A polygon point; a third element of 1 keeps the corner sharp when smoothing. */
export type PolyPoint = [number, number] | [number, number, 1];

export type Gait = 'walk' | 'scuttle' | 'hop' | 'fly' | 'slither' | 'swim';

export interface Bone {
  name: string;
  /** Parent bone index, or -1 for the root. Parents always come first. */
  parent: number;
  /** Rest-space pivot the bone rotates about. */
  pivot: Vec2;
}

export interface LegRig {
  /** Upper bone (rotates at the hip). */
  hip: number;
  /** Lower bone (rotates at the knee); its tip is the foot. */
  knee: number;
  /** Rest-space foot point (the lowest point of the leg). */
  foot: Vec2;
  /** Gait phase offset, 0..1. */
  phase: number;
  /** Knee flex direction during the swing: −1 folds the foot back, +1 forward. */
  kneeSign: 1 | -1;
  /** Hip-to-foot length (rest). */
  length: number;
  /** Hip height above the foot (rest): sets how far one stance sweep carries the body. */
  drop: number;
}

export interface Wave {
  /** A chain of bones (tail, neck, tentacle, serpent body), root first. */
  bones: number[];
  /** Amplitude per segment (rad). */
  amp: number;
  /** Phase lag per segment (rad). */
  lag: number;
  /** Angular speed (rad/s) when it runs on time, or 0 to follow the gait. */
  speed: number;
  /** Phase offset (rad). */
  offset?: number;
  /** Constant bend per segment (rad), e.g. a curled tail. */
  bias?: number;
}

export interface Swing {
  bone: number;
  /** Centre angle (rad). */
  bias: number;
  amp: number;
  /** rad/s, or 0 to follow the gait phase (wings, paddles). */
  speed: number;
  offset?: number;
}

export interface BodyPlan {
  id: string;
  gait: Gait;
  bones: Bone[];
  /** Rest xy per vertex. */
  positions: Float32Array;
  /** Bone index per vertex. */
  vertexBones: Uint16Array;
  indices: Uint32Array;
  legs: LegRig[];
  waves: Wave[];
  /** Wings (fliers), paddles (swimmers) and small idle motions (ears, jaw, head). */
  swings: Swing[];
  /** Folded leg angles for fliers (hip bone → angle). */
  tuck: { bone: number; angle: number }[];
  /** The eye: rest-space centre and radius, drawn as a hole in the head bone. */
  eye: { x: number; y: number; r: number; bone: number };
  /** Rest-space ground line (feet of walkers). */
  groundY: number;
  /** Rest-space bounds. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const PLAN_SIZE = 1.6;
const ARC = 8;

export class PlanBuilder {
  readonly bones: Bone[] = [];
  private readonly pos: number[] = [];
  private readonly vb: number[] = [];
  private readonly idx: number[] = [];
  readonly legs: LegRig[] = [];
  readonly waves: Wave[] = [];
  readonly swings: Swing[] = [];
  readonly tuck: { bone: number; angle: number }[] = [];
  eye = { x: 0, y: 0, r: 0, bone: 0 };

  constructor(readonly id: string, readonly gait: Gait) {}

  bone(name: string, parent: number, pivot: Vec2): number {
    if (parent >= this.bones.length) throw new Error(`${this.id}: bone ${name} has an unknown parent`);
    this.bones.push({ name, parent, pivot: [pivot[0], pivot[1]] });
    return this.bones.length - 1;
  }

  find(name: string): number {
    const i = this.bones.findIndex((b) => b.name === name);
    if (i < 0) throw new Error(`${this.id}: no bone ${name}`);
    return i;
  }

  private v(x: number, y: number, b: number): number {
    this.pos.push(x, y);
    this.vb.push(b);
    return this.vb.length - 1;
  }

  ellipse(b: number, cx: number, cy: number, rx: number, ry: number, rot = 0, seg = 28): this {
    const c = this.v(cx, cy, b);
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const ring: number[] = [];
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      const x = Math.cos(t) * rx;
      const y = Math.sin(t) * ry;
      ring.push(this.v(cx + x * cr - y * sr, cy + x * sr + y * cr, b));
    }
    for (let i = 0; i < seg; i++) this.idx.push(c, ring[i], ring[(i + 1) % seg]);
    return this;
  }

  /** A tapered capsule from (ax, ay) radius ra to (bx, by) radius rb. */
  taper(b: number, ax: number, ay: number, ra: number, bx: number, by: number, rb: number): this {
    let dx = bx - ax;
    let dy = by - ay;
    const l = Math.hypot(dx, dy);
    if (l < 1e-9) return this.ellipse(b, ax, ay, Math.max(ra, rb), Math.max(ra, rb));
    dx /= l;
    dy /= l;
    const base = Math.atan2(dy, dx);
    const c = this.v((ax + bx) / 2, (ay + by) / 2, b);
    const ring: number[] = [];
    for (let i = 0; i <= ARC; i++) {
      const t = base + Math.PI / 2 + (Math.PI * i) / ARC;
      ring.push(this.v(ax + Math.cos(t) * ra, ay + Math.sin(t) * ra, b));
    }
    for (let i = 0; i <= ARC; i++) {
      const t = base - Math.PI / 2 + (Math.PI * i) / ARC;
      ring.push(this.v(bx + Math.cos(t) * rb, by + Math.sin(t) * rb, b));
    }
    for (let i = 0; i < ring.length; i++) this.idx.push(c, ring[i], ring[(i + 1) % ring.length]);
    return this;
  }

  /** A filled polygon, rounded by Chaikin smoothing except at sharp points. */
  poly(b: number, pts: PolyPoint[], smooth = 2): this {
    const ring = smoothPolygon(pts, smooth);
    const ids = ring.map(([x, y]) => this.v(x, y, b));
    const tris = triangulate(ring);
    for (const t of tris) this.idx.push(ids[t]);
    return this;
  }

  /**
   * A chain of bones along `pts` (tail, neck, tentacle). Segment i rotates
   * about pts[i]; the first one hangs on `parent`. Returns the bone indices.
   */
  chain(name: string, parent: number, pts: Vec2[], radii: number[]): number[] {
    const out: number[] = [];
    let p = parent;
    for (let i = 0; i < pts.length - 1; i++) {
      const b = this.bone(`${name}${i}`, p, pts[i]);
      this.taper(b, pts[i][0], pts[i][1], radii[i], pts[i + 1][0], pts[i + 1][1], radii[i + 1]);
      out.push(b);
      p = b;
    }
    return out;
  }

  /**
   * A jointed two-segment leg: hip → knee → foot, with a paw/foot shape at
   * the end. Registers the leg for the gait.
   */
  leg(
    name: string,
    parent: number,
    hip: Vec2,
    knee: Vec2,
    foot: Vec2,
    r: [number, number, number],
    opts: { phase: number; kneeSign?: 1 | -1; paw?: [number, number]; toes?: boolean } = { phase: 0 },
  ): { hip: number; knee: number } {
    const h = this.bone(`${name}Hip`, parent, hip);
    this.taper(h, hip[0], hip[1], r[0], knee[0], knee[1], r[1]);
    const k = this.bone(`${name}Knee`, h, knee);
    this.taper(k, knee[0], knee[1], r[1], foot[0], foot[1], r[2]);
    let low = foot[1] - r[2];
    if (opts.paw) {
      this.ellipse(k, foot[0] + opts.paw[0] * 0.45, foot[1] - r[2] + opts.paw[1], opts.paw[0], opts.paw[1]);
      low = Math.min(low, foot[1] - r[2]);
    }
    if (opts.toes) {
      // Bird feet: three thin toes.
      for (const a of [-0.5, 0.15, 0.7]) {
        const len = r[2] * 5;
        this.taper(k, foot[0], foot[1], r[2] * 0.7, foot[0] + Math.cos(a) * len, foot[1] - Math.abs(Math.sin(a)) * len * 0.15 - r[2] * 0.4, r[2] * 0.35);
      }
    }
    this.legs.push({
      hip: h,
      knee: k,
      foot: [foot[0], low],
      phase: opts.phase,
      kneeSign: opts.kneeSign ?? -1,
      length: Math.hypot(hip[0] - foot[0], hip[1] - low),
      drop: hip[1] - low,
    });
    return { hip: h, knee: k };
  }

  setEye(bone: number, x: number, y: number, r: number): this {
    this.eye = { x, y, r, bone };
    return this;
  }

  build(): BodyPlan {
    if (!this.idx.length) throw new Error(`${this.id}: empty body`);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < this.pos.length; i += 2) {
      minX = Math.min(minX, this.pos[i]);
      maxX = Math.max(maxX, this.pos[i]);
      minY = Math.min(minY, this.pos[i + 1]);
      maxY = Math.max(maxY, this.pos[i + 1]);
    }
    // Normalise: centre the bounding box on the origin and scale its larger side to PLAN_SIZE.
    const k = PLAN_SIZE / Math.max(maxX - minX, maxY - minY);
    const ox = (minX + maxX) / 2;
    const oy = (minY + maxY) / 2;
    const X = (x: number) => (x - ox) * k;
    const Y = (y: number) => (y - oy) * k;
    const positions = new Float32Array(this.pos.length);
    for (let i = 0; i < this.pos.length; i += 2) {
      positions[i] = X(this.pos[i]);
      positions[i + 1] = Y(this.pos[i + 1]);
    }
    const bones = this.bones.map((b) => ({ ...b, pivot: [X(b.pivot[0]), Y(b.pivot[1])] as Vec2 }));
    const legs = this.legs.map((l) => ({ ...l, foot: [X(l.foot[0]), Y(l.foot[1])] as Vec2, length: l.length * k, drop: l.drop * k }));
    return {
      id: this.id,
      gait: this.gait,
      bones,
      positions,
      vertexBones: Uint16Array.from(this.vb),
      indices: Uint32Array.from(this.idx),
      legs,
      waves: this.waves.map((w) => ({ ...w, bones: [...w.bones] })),
      swings: this.swings.map((s) => ({ ...s })),
      tuck: this.tuck.map((t) => ({ ...t })),
      eye: { x: X(this.eye.x), y: Y(this.eye.y), r: this.eye.r * k, bone: this.eye.bone },
      groundY: legs.length ? Math.min(...legs.map((l) => l.foot[1])) : Y(minY),
      minX: X(minX),
      minY: Y(minY),
      maxX: X(maxX),
      maxY: Y(maxY),
    };
  }
}

/** Chaikin corner cutting that keeps points flagged sharp. */
export function smoothPolygon(pts: PolyPoint[], iterations: number): Vec2[] {
  let ring: { x: number; y: number; sharp: boolean }[] = pts.map((p) => ({ x: p[0], y: p[1], sharp: p.length === 3 }));
  for (let it = 0; it < iterations; it++) {
    const next: typeof ring = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (a.sharp) next.push(a);
      else next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25, sharp: false });
      if (!b.sharp) next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75, sharp: false });
    }
    ring = next;
  }
  return ring.map((p) => [p.x, p.y]);
}

/** Ear-clipping triangulation of a simple polygon; returns indices into `pts`. */
export function triangulate(pts: Vec2[]): number[] {
  const n = pts.length;
  if (n < 3) return [];
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % n];
    area += x0 * y1 - x1 * y0;
  }
  const V = [...Array(n).keys()];
  if (area < 0) V.reverse();
  const out: number[] = [];
  const cross = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p: Vec2, a: Vec2, b: Vec2, c: Vec2) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (V.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < V.length; i++) {
      const ia = V[(i + V.length - 1) % V.length];
      const ib = V[i];
      const ic = V[(i + 1) % V.length];
      const a = pts[ia];
      const b = pts[ib];
      const c = pts[ic];
      if (cross(a, b, c) <= 1e-12) continue;
      let blocked = false;
      for (const j of V) {
        if (j === ia || j === ib || j === ic) continue;
        if (inside(pts[j], a, b, c)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      out.push(ia, ib, ic);
      V.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (V.length === 3) out.push(V[0], V[1], V[2]);
  else for (let i = 1; i + 1 < V.length; i++) out.push(V[0], V[i], V[i + 1]); // degenerate leftovers
  return out;
}

/** Bone transforms (2×3 affine) from angles, parents first. */
export function boneTransforms(plan: BodyPlan, angles: ArrayLike<number>, out: Float32Array = new Float32Array(plan.bones.length * 6)): Float32Array {
  plan.bones.forEach((b, i) => {
    const t = angles[i] ?? 0;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const [px, py] = b.pivot;
    // Local: rotate about the pivot.
    const la = c;
    const lb = -s;
    const lc = s;
    const ld = c;
    const ltx = px - c * px + s * py;
    const lty = py - s * px - c * py;
    const o = i * 6;
    if (b.parent < 0) {
      out[o] = la;
      out[o + 1] = lb;
      out[o + 2] = ltx;
      out[o + 3] = lc;
      out[o + 4] = ld;
      out[o + 5] = lty;
    } else {
      const p = b.parent * 6;
      const [pa, pb, ptx, pc, pd, pty] = [out[p], out[p + 1], out[p + 2], out[p + 3], out[p + 4], out[p + 5]];
      out[o] = pa * la + pb * lc;
      out[o + 1] = pa * lb + pb * ld;
      out[o + 2] = pa * ltx + pb * lty + ptx;
      out[o + 3] = pc * la + pd * lc;
      out[o + 4] = pc * lb + pd * ld;
      out[o + 5] = pc * ltx + pd * lty + pty;
    }
  });
  return out;
}

export function applyTransform(tr: Float32Array, bone: number, x: number, y: number): Vec2 {
  const o = bone * 6;
  return [tr[o] * x + tr[o + 1] * y + tr[o + 2], tr[o + 3] * x + tr[o + 4] * y + tr[o + 5]];
}

/** Writes posed xy into `out` (2 floats per vertex), shifted up by `lift`. */
export function poseVertices(plan: BodyPlan, tr: Float32Array, lift: number, out: Float32Array, stride = 2): Float32Array {
  const P = plan.positions;
  const B = plan.vertexBones;
  for (let i = 0, n = B.length; i < n; i++) {
    const o = B[i] * 6;
    const x = P[i * 2];
    const y = P[i * 2 + 1];
    out[i * stride] = tr[o] * x + tr[o + 1] * y + tr[o + 2];
    out[i * stride + 1] = tr[o + 3] * x + tr[o + 4] * y + tr[o + 5] + lift;
  }
  return out;
}

const TAU = Math.PI * 2;
/** Share of a gait cycle a foot spends in the air (the rest is stance: overlap keeps bipeds supported). */
const SWING = 0.4;

/**
 * Drives a plan: gait phase from the distance travelled (so stance feet do
 * not slide), wings and fins from time, and the lift that keeps the lowest
 * foot on the ground line.
 */
export class BodyAnimator {
  readonly angles: Float32Array<ArrayBuffer>;
  readonly transforms: Float32Array<ArrayBuffer>;
  /** Gait cycles completed (fractional). */
  phase = 0;
  time = 0;
  /** Vertical offset applied this frame (plan units). */
  lift = 0;
  /** 0..1, how much the creature is moving (eases in and out). */
  motion = 0;
  /** Hop: true while airborne. */
  airborne = false;
  /** Swing amplitude of the hips (rad). */
  readonly stride: number;
  /** Distance covered per gait cycle (plan units). */
  readonly cycle: number;

  constructor(readonly plan: BodyPlan, readonly seed = 0) {
    this.angles = new Float32Array(plan.bones.length);
    this.transforms = new Float32Array(plan.bones.length * 6);
    this.stride = plan.gait === 'scuttle' ? 0.32 : plan.gait === 'hop' ? 0.9 : 0.42;
    const legLen = plan.legs.length ? plan.legs.reduce((s, l) => s + Math.abs(l.drop), 0) / plan.legs.length : 0.5;
    this.cycle = plan.gait === 'hop' ? (plan.maxX - plan.minX) * 0.9 : plan.gait === 'slither' ? 0.9 : (2 * legLen * Math.sin(this.stride)) / (1 - SWING);
    this.time = seed;
  }

  /**
   * Advance by `dt` seconds having moved `distance` plan units along the
   * ground (or through the air). Returns the bone transforms.
   */
  step(dt: number, distance: number): Float32Array {
    const plan = this.plan;
    const A = this.angles;
    A.fill(0);
    this.time += dt;
    const moving = Math.abs(distance) > 1e-6 && dt > 0;
    const target = moving ? 1 : 0;
    this.motion += (target - this.motion) * Math.min(1, dt * 6);
    if (plan.gait === 'fly' || plan.gait === 'swim') this.phase += dt * (plan.gait === 'fly' ? 1.6 : 0.9) * (0.6 + 0.4 * this.motion);
    else this.phase += Math.abs(distance) / this.cycle;
    const t = this.time;
    const ph = this.phase * TAU;

    for (const w of plan.waves) {
      const base = w.speed > 0 ? t * w.speed : ph;
      w.bones.forEach((b, i) => {
        A[b] += (w.bias ?? 0) + w.amp * Math.sin(base - i * w.lag + (w.offset ?? 0)) * (w.speed > 0 ? 1 : 0.35 + 0.65 * this.motion);
      });
    }
    for (const s of plan.swings) {
      const base = s.speed > 0 ? t * s.speed : ph;
      A[s.bone] += s.bias + s.amp * Math.sin(base + (s.offset ?? 0));
    }
    let lift = 0;
    if (plan.gait === 'fly') {
      for (const k of plan.tuck) A[k.bone] += k.angle;
      lift = -Math.cos(ph) * 0.035;
      this.airborne = true;
    } else if (plan.gait === 'swim') {
      for (const k of plan.tuck) A[k.bone] += k.angle;
      lift = Math.sin(ph * 0.5) * 0.04;
      this.airborne = true;
    } else if (plan.gait === 'hop') {
      lift = this.hop(A);
    } else {
      const m = this.motion;
      for (const leg of plan.legs) {
        // Swing: the foot lifts and eases forward. Stance: the hip sweeps back linearly, so the planted foot keeps pace
        // with the ground instead of skating.
        const u = (((this.phase + leg.phase) % 1) + 1) % 1;
        const S = this.stride;
        let hip: number;
        let knee = 0;
        if (u < SWING) {
          const w = u / SWING;
          hip = -S * Math.cos(Math.PI * w);
          const lift = Math.sin(Math.PI * w);
          knee = leg.kneeSign * S * 1.5 * lift * lift; // eased: the foot touches down at rest
        } else hip = S - (2 * S * (u - SWING)) / (1 - SWING);
        A[leg.hip] += hip * m;
        A[leg.knee] += knee * m;
      }
    }
    boneTransforms(plan, A, this.transforms);
    if (plan.gait !== 'fly' && plan.gait !== 'swim') lift += this.groundLift();
    this.lift = lift;
    return this.transforms;
  }

  /** Hop: a parabola per cycle; hind legs push off, then tuck; feet land. */
  private hop(A: Float32Array): number {
    const plan = this.plan;
    const m = this.motion;
    const p = this.phase % 1;
    const air = 0.62;
    this.airborne = m > 0.2 && p < air;
    const k = this.airborne ? p / air : 0;
    const height = this.airborne ? Math.sin(Math.PI * k) * (plan.maxY - plan.minY) * 0.32 * m : 0;
    // Pitch the body up at take-off and down on landing.
    A[0] += this.airborne ? Math.cos(Math.PI * k) * 0.22 * m : 0;
    for (const leg of plan.legs) {
      const hind = leg.phase === 0;
      if (this.airborne) {
        const push = 1 - k;
        A[leg.hip] += hind ? -0.8 * push * m : 0.6 * (1 - push) * m;
        A[leg.knee] += hind ? 0.5 * push * m : -0.4 * m;
      } else {
        const crouch = Math.sin(Math.PI * ((p - air) / (1 - air))) * m;
        A[leg.hip] += hind ? 0.25 * crouch : -0.1 * crouch;
        A[leg.knee] += hind ? -0.35 * crouch : 0.15 * crouch;
      }
    }
    return height;
  }

  /** How far to raise the posed body so its lowest contact point sits on the ground line. */
  private groundLift(): number {
    const plan = this.plan;
    const tr = this.transforms;
    let low = Infinity;
    if (plan.legs.length) {
      for (const leg of plan.legs) low = Math.min(low, applyTransform(tr, leg.knee, leg.foot[0], leg.foot[1])[1]);
    } else {
      // Legless (serpent): the lowest posed vertex.
      const P = plan.positions;
      const B = plan.vertexBones;
      for (let i = 0; i < B.length; i++) {
        const o = B[i] * 6;
        const y = tr[o + 3] * P[i * 2] + tr[o + 4] * P[i * 2 + 1] + tr[o + 5];
        if (y < low) low = y;
      }
    }
    return Number.isFinite(low) ? plan.groundY - low : 0;
  }

  /** Posed foot positions this frame (after lift). */
  feet(): Vec2[] {
    return this.plan.legs.map((l) => {
      const [x, y] = applyTransform(this.transforms, l.knee, l.foot[0], l.foot[1]);
      return [x, y + this.lift];
    });
  }
}

/** Rest-pose area (sum of triangle areas, overlaps counted twice). */
export function planArea(plan: BodyPlan): number {
  let a = 0;
  const P = plan.positions;
  const I = plan.indices;
  for (let i = 0; i < I.length; i += 3) {
    const [x0, y0, x1, y1, x2, y2] = [P[I[i] * 2], P[I[i] * 2 + 1], P[I[i + 1] * 2], P[I[i + 1] * 2 + 1], P[I[i + 2] * 2], P[I[i + 2] * 2 + 1]];
    a += Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)) / 2;
  }
  return a;
}
