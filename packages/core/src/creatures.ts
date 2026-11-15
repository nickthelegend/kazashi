/**
 * The cast's bodies: 25 procedural silhouettes in profile, one per creature,
 * written as small parametric builders per family (four-legged walkers,
 * birds, fish, arthropods, serpents, soft swimmers). Coordinates are authored
 * facing right with the ground at y = 0 and normalised by PlanBuilder.
 */
import { type BodyPlan, type Gait, PlanBuilder, type PolyPoint, type Vec2 } from './body.js';

type E = [number, number, number, number, number?]; // ellipse cx, cy, rx, ry, rot
type T = [number, number, number, number, number, number]; // taper ax, ay, ra, bx, by, rb

interface Quad {
  gait?: Gait;
  body: E[];
  neck: { pts: Vec2[]; r: number[] };
  head: E[];
  snout?: T[];
  jaw?: T;
  ears?: PolyPoint[][];
  earSwing?: number;
  eye: [number, number, number];
  tail?: { pts: Vec2[]; r: number[]; amp: number; speed: number; bias?: number; tuft?: E };
  legs: {
    front: number;
    back: number;
    hipY: number;
    kneeY: number;
    r: [number, number, number];
    hock?: number;
    spread?: number;
    paw?: [number, number];
    walk?: boolean;
    /** Foot height (swimmers keep their paws off the ground). */
    footY?: number;
  };
  extra?: (b: PlanBuilder, ids: { body: number; head: number; neck: number[] }) => void;
}

function quad(id: string, q: Quad): BodyPlan {
  const b = new PlanBuilder(id, q.gait ?? 'walk');
  const [bx, by] = q.body[0];
  const body = b.bone('body', -1, [bx, by]);
  const L = q.legs;
  const spread = L.spread ?? 0.05;
  const walk = !!L.walk;
  // Far legs first so they sit behind the body visually (same ink, it reads as depth).
  const ph = walk ? { fn: 0.25, hn: 0, ff: 0.75, hf: 0.5 } : { fn: 0, hn: 0.5, ff: 0.5, hf: 0 };
  const legSet: [string, number, number, number][] = [
    ['farFront', L.front + spread, ph.ff, 0],
    ['farHind', L.back + spread, ph.hf, L.hock ?? 0],
    ['front', L.front, ph.fn, 0],
    ['hind', L.back, ph.hn, L.hock ?? 0],
  ];
  for (const [name, x, phase, hock] of legSet) {
    const hind = name.toLowerCase().includes('hind');
    b.leg(name, body, [x, L.hipY], [x + (hind ? hock : 0.01), L.kneeY], [x - (hind ? 0.015 : 0), L.footY ?? L.r[2]], L.r, {
      phase,
      kneeSign: -1,
      paw: L.paw,
    });
  }
  for (const e of q.body) b.ellipse(body, e[0], e[1], e[2], e[3], e[4] ?? 0);
  const neck = b.chain('neck', body, q.neck.pts, q.neck.r);
  const neckEnd = neck[neck.length - 1] ?? body;
  const top = q.neck.pts[q.neck.pts.length - 1];
  const head = b.bone('head', neckEnd, top);
  for (const e of q.head) b.ellipse(head, e[0], e[1], e[2], e[3], e[4] ?? 0);
  for (const t of q.snout ?? []) b.taper(head, ...t);
  if (q.jaw) {
    const jaw = b.bone('jaw', head, [q.jaw[0], q.jaw[1]]);
    b.taper(jaw, ...q.jaw);
    b.swings.push({ bone: jaw, bias: 0, amp: 0.08, speed: 3.1 });
  }
  q.ears?.forEach((pts, i) => {
    const e = b.bone(`ear${i}`, head, [pts[0][0], pts[0][1]]);
    b.poly(e, pts);
    b.swings.push({ bone: e, bias: 0, amp: q.earSwing ?? 0.1, speed: 2.3 + i, offset: i });
  });
  b.setEye(head, ...q.eye);
  b.swings.push({ bone: head, bias: 0, amp: 0.05, speed: 1.7 });
  if (neck.length) b.waves.push({ bones: neck, amp: 0.03, lag: 0.4, speed: 1.3 });
  if (q.tail) {
    const tail = b.chain('tail', body, q.tail.pts, q.tail.r);
    if (q.tail.tuft) b.ellipse(tail[tail.length - 1], ...(q.tail.tuft as [number, number, number, number]));
    b.waves.push({ bones: tail, amp: q.tail.amp, lag: 0.6, speed: q.tail.speed, bias: q.tail.bias });
  }
  q.extra?.(b, { body, head, neck });
  return b.build();
}

interface Bird {
  gait: 'fly' | 'walk';
  body: E[];
  neck?: { pts: Vec2[]; r: number[] };
  head: E;
  beak: PolyPoint[];
  crest?: PolyPoint[][];
  eye: [number, number, number];
  tail: PolyPoint[];
  tailPivot: Vec2;
  wing?: { pivot: Vec2; pts: PolyPoint[]; bias: number; amp: number; speed: number };
  foldedWing?: E;
  legs?: { hips: Vec2[]; knee: Vec2; foot: Vec2; r: [number, number, number]; tuck: number };
  plumes?: { pts: Vec2[]; r: number[] }[];
}

function bird(id: string, o: Bird): BodyPlan {
  const b = new PlanBuilder(id, o.gait);
  const body = b.bone('body', -1, [o.body[0][0], o.body[0][1]]);
  const wingBones: number[] = [];
  // Far wing behind the body, a beat later than the near one.
  if (o.wing) {
    const far = b.bone('farWing', body, o.wing.pivot);
    b.poly(far, o.wing.pts.map((p) => [p[0] + 0.05, p[1] + 0.02, ...(p.length === 3 ? [1] : [])] as PolyPoint));
    b.swings.push({ bone: far, bias: o.wing.bias + 0.1, amp: o.wing.amp * 0.85, speed: o.wing.speed, offset: -0.5 });
    wingBones.push(far);
  }
  if (o.legs) {
    o.legs.hips.forEach((hip, i) => {
      const dx = hip[0] - o.legs!.hips[0][0];
      const l = b.leg(`leg${i}`, body, hip, [o.legs!.knee[0] + dx, o.legs!.knee[1]], [o.legs!.foot[0] + dx, o.legs!.foot[1]], o.legs!.r, {
        phase: i * 0.5,
        kneeSign: 1,
        toes: true,
      });
      if (o.gait === 'fly') b.tuck.push({ bone: l.hip, angle: o.legs!.tuck });
    });
  }
  const tail = b.bone('tail', body, o.tailPivot);
  b.poly(tail, o.tail);
  b.swings.push({ bone: tail, bias: 0, amp: 0.08, speed: 2.2 });
  for (const p of o.plumes ?? []) {
    const ch = b.chain('plume', tail, p.pts, p.r);
    b.waves.push({ bones: ch, amp: 0.06, lag: 0.5, speed: 2.4 });
  }
  for (const e of o.body) b.ellipse(body, e[0], e[1], e[2], e[3], e[4] ?? 0);
  if (o.foldedWing) b.ellipse(body, ...(o.foldedWing as [number, number, number, number, number]));
  let neckEnd = body;
  if (o.neck) {
    const n = b.chain('neck', body, o.neck.pts, o.neck.r);
    neckEnd = n[n.length - 1];
    b.waves.push({ bones: n, amp: 0.04, lag: 0.5, speed: 1.6 });
  }
  const head = b.bone('head', neckEnd, [o.head[0], o.head[1]]);
  b.ellipse(head, o.head[0], o.head[1], o.head[2], o.head[3], o.head[4] ?? 0);
  b.poly(head, o.beak, 1);
  for (const c of o.crest ?? []) b.poly(head, c);
  b.setEye(head, ...o.eye);
  b.swings.push({ bone: head, bias: 0, amp: 0.07, speed: 2.1 });
  if (o.wing) {
    const near = b.bone('wing', body, o.wing.pivot);
    b.poly(near, o.wing.pts);
    b.swings.push({ bone: near, bias: o.wing.bias, amp: o.wing.amp, speed: o.wing.speed });
    wingBones.push(near);
  }
  return b.build();
}

/** Fish-like swimmer: three body sections that bend, fins and a tail fin. */
function fish(
  id: string,
  o: {
    front: PolyPoint[];
    mid: PolyPoint[];
    rear: PolyPoint[];
    joints: [Vec2, Vec2];
    tailFin: PolyPoint[];
    dorsal?: PolyPoint[];
    pectoral?: PolyPoint[];
    pectoralPivot?: Vec2;
    extra?: (b: PlanBuilder, ids: { body: number; mid: number; rear: number }) => void;
    eye: [number, number, number];
  },
): BodyPlan {
  const b = new PlanBuilder(id, 'swim');
  const body = b.bone('body', -1, o.joints[0]);
  b.poly(body, o.front);
  const mid = b.bone('mid', body, o.joints[0]);
  b.poly(mid, o.mid);
  const rear = b.bone('rear', mid, o.joints[1]);
  b.poly(rear, o.rear);
  b.poly(rear, o.tailFin);
  if (o.dorsal) b.poly(mid, o.dorsal);
  if (o.pectoral) {
    const fin = b.bone('fin', body, o.pectoralPivot ?? [0, 0]);
    b.poly(fin, o.pectoral);
    b.swings.push({ bone: fin, bias: 0, amp: 0.35, speed: 0, offset: 1 });
  }
  b.waves.push({ bones: [mid, rear], amp: 0.22, lag: 1.1, speed: 0 });
  b.setEye(body, ...o.eye);
  o.extra?.(b, { body, mid, rear });
  return b.build();
}

/** Arthropod legs: hip on the body, knee up and out, foot on the ground. */
function bugLegs(b: PlanBuilder, body: number, legs: { hip: Vec2; knee: Vec2; foot: Vec2; phase: number }[], r: [number, number, number]): void {
  for (const [i, l] of legs.entries()) b.leg(`leg${i}`, body, l.hip, l.knee, l.foot, r, { phase: l.phase, kneeSign: l.foot[0] < l.hip[0] ? 1 : -1 });
}

const PLANS: Record<string, () => BodyPlan> = {
  // ── Act 1 ────────────────────────────────────────────────────────────────
  tori: () =>
    bird('tori', {
      gait: 'fly',
      body: [[0, 0.5, 0.26, 0.17, 0.1], [0.14, 0.52, 0.15, 0.14]],
      head: [0.32, 0.64, 0.12, 0.11],
      beak: [[0.42, 0.68], [0.56, 0.63, 1], [0.42, 0.6]],
      eye: [0.35, 0.67, 0.025],
      tailPivot: [-0.2, 0.52],
      tail: [[-0.18, 0.56], [-0.5, 0.62, 1], [-0.46, 0.54, 1], [-0.52, 0.46, 1], [-0.18, 0.45]],
      wing: { pivot: [0.05, 0.6], pts: [[-0.02, 0.6], [0.12, 0.62], [0.06, 0.9], [-0.1, 1.12, 1], [-0.16, 1.0, 1], [-0.24, 0.98, 1], [-0.22, 0.86, 1], [-0.3, 0.82, 1], [-0.12, 0.62]], bias: 0, amp: 0.85, speed: 0 },
      legs: { hips: [[0.04, 0.38]], knee: [0.02, 0.26], foot: [-0.02, 0.16], r: [0.03, 0.018, 0.012], tuck: -1.1 },
    }),
  inu: () =>
    quad('inu', {
      body: [[0, 0.56, 0.4, 0.17, 0.04], [0.24, 0.57, 0.2, 0.2], [-0.28, 0.58, 0.18, 0.18]],
      neck: { pts: [[0.3, 0.64], [0.46, 0.82]], r: [0.15, 0.12] },
      head: [[0.53, 0.86, 0.14, 0.12]],
      snout: [[0.6, 0.84, 0.085, 0.8, 0.8, 0.05]],
      jaw: [0.58, 0.78, 0.06, 0.76, 0.75, 0.035],
      ears: [[[0.46, 0.93], [0.47, 1.12, 1], [0.57, 0.96]]],
      eye: [0.57, 0.9, 0.024],
      tail: { pts: [[-0.4, 0.64], [-0.53, 0.76], [-0.58, 0.9], [-0.55, 1.0]], r: [0.055, 0.045, 0.03, 0.014], amp: 0.22, speed: 9 },
      legs: { front: 0.27, back: -0.28, hipY: 0.52, kneeY: 0.27, r: [0.085, 0.05, 0.04], hock: 0.07, paw: [0.05, 0.024] },
      extra: (b, { head }) => b.ellipse(head, 0.81, 0.82, 0.032, 0.03),
    }),
  usagi: () => {
    const b = new PlanBuilder('usagi', 'hop');
    const body = b.bone('body', -1, [0, 0.36]);
    b.leg('front', body, [0.2, 0.3], [0.24, 0.14], [0.26, 0.03], [0.05, 0.032, 0.026], { phase: 0.5, kneeSign: -1, paw: [0.05, 0.022] });
    b.leg('hind', body, [-0.16, 0.3], [0.02, 0.12], [-0.12, 0.03], [0.14, 0.06, 0.035], { phase: 0, kneeSign: 1, paw: [0.11, 0.03] });
    b.ellipse(body, -0.02, 0.36, 0.28, 0.24, 0.12);
    b.ellipse(body, -0.14, 0.26, 0.17, 0.16);
    b.ellipse(body, -0.3, 0.44, 0.07, 0.07);
    const head = b.bone('head', body, [0.22, 0.52]);
    b.ellipse(head, 0.3, 0.6, 0.14, 0.12, -0.2);
    b.ellipse(head, 0.4, 0.55, 0.07, 0.06);
    for (const [i, dx] of [0, 0.07].entries()) {
      const e = b.bone(`ear${i}`, head, [0.24 + dx, 0.7]);
      b.poly(e, [[0.2 + dx, 0.7], [0.12 + dx, 0.98], [0.16 + dx, 1.08], [0.22 + dx, 1.0], [0.3 + dx, 0.72]]);
      b.swings.push({ bone: e, bias: -0.15 * i, amp: 0.12, speed: 2.5 + i, offset: i });
    }
    b.setEye(head, 0.33, 0.63, 0.025);
    b.swings.push({ bone: head, bias: 0, amp: 0.05, speed: 2 });
    return b.build();
  },
  hebi: () => {
    const b = new PlanBuilder('hebi', 'slither');
    const body = b.bone('body', -1, [0, 0.06]);
    b.ellipse(body, 0, 0.07, 0.11, 0.065);
    const fwd = b.chain('neck', body, [[0, 0.07], [0.18, 0.08], [0.36, 0.1], [0.5, 0.18], [0.58, 0.32], [0.62, 0.44]], [0.065, 0.065, 0.06, 0.055, 0.05, 0.05]);
    const back = b.chain('tail', body, [[0, 0.07], [-0.18, 0.07], [-0.36, 0.07], [-0.54, 0.07], [-0.7, 0.07], [-0.84, 0.08], [-0.96, 0.1]], [0.065, 0.062, 0.056, 0.048, 0.036, 0.022, 0.006]);
    const head = b.bone('head', fwd[fwd.length - 1], [0.62, 0.44]);
    b.poly(head, [[0.58, 0.42], [0.62, 0.52], [0.74, 0.54], [0.84, 0.5], [0.86, 0.46], [0.76, 0.42], [0.64, 0.4]]);
    const tongue = b.bone('tongue', head, [0.85, 0.47]);
    b.poly(tongue, [[0.85, 0.475], [0.96, 0.48], [1.02, 0.51, 1], [0.975, 0.475, 1], [1.02, 0.44, 1], [0.96, 0.465], [0.85, 0.465]], 0);
    b.swings.push({ bone: tongue, bias: 0, amp: 0.25, speed: 14 });
    b.setEye(head, 0.72, 0.49, 0.02);
    b.waves.push({ bones: fwd.slice(0, 3), amp: 0.16, lag: 0.9, speed: 0 });
    b.waves.push({ bones: back, amp: 0.2, lag: 0.9, speed: 0, offset: Math.PI });
    return b.build();
  },
  kirin: () =>
    quad('kirin', {
      body: [[0, 0.98, 0.34, 0.15, 0.18], [0.2, 1.02, 0.16, 0.17], [-0.24, 0.92, 0.13, 0.14]],
      neck: { pts: [[0.24, 1.08], [0.36, 1.36], [0.46, 1.66], [0.54, 1.9]], r: [0.11, 0.075, 0.06, 0.05] },
      head: [[0.6, 1.94, 0.09, 0.06, -0.3]],
      snout: [[0.62, 1.92, 0.055, 0.76, 1.86, 0.035]],
      ears: [[[0.54, 1.98], [0.44, 2.04, 1], [0.52, 1.95]]],
      eye: [0.61, 1.95, 0.016],
      tail: { pts: [[-0.34, 0.98], [-0.4, 0.82], [-0.42, 0.66]], r: [0.022, 0.016, 0.012], amp: 0.15, speed: 3, tuft: [-0.42, 0.62, 0.025, 0.05] },
      legs: { front: 0.22, back: -0.22, hipY: 0.96, kneeY: 0.48, r: [0.07, 0.038, 0.03], hock: 0.06, paw: [0.032, 0.02], walk: true },
      extra: (b, { head }) => {
        b.taper(head, 0.56, 1.98, 0.014, 0.55, 2.1, 0.01).ellipse(head, 0.55, 2.11, 0.022, 0.02);
        b.taper(head, 0.59, 1.99, 0.014, 0.6, 2.1, 0.01).ellipse(head, 0.6, 2.11, 0.022, 0.02);
      },
    }),
  // ── Act 2 ────────────────────────────────────────────────────────────────
  sagi: () =>
    bird('sagi', {
      gait: 'fly',
      body: [[0, 0.6, 0.3, 0.12, 0.05]],
      neck: { pts: [[0.24, 0.64], [0.32, 0.74], [0.26, 0.84], [0.34, 0.9]], r: [0.07, 0.05, 0.045, 0.045] },
      head: [0.4, 0.92, 0.06, 0.05],
      beak: [[0.44, 0.94], [0.72, 0.9, 1], [0.44, 0.89]],
      crest: [[[0.36, 0.95], [0.18, 0.99, 1], [0.34, 0.92]]],
      eye: [0.41, 0.93, 0.014],
      tailPivot: [-0.26, 0.6],
      tail: [[-0.24, 0.64], [-0.44, 0.62, 1], [-0.24, 0.56]],
      wing: { pivot: [0.04, 0.66], pts: [[-0.06, 0.66], [0.16, 0.68], [0.12, 0.9], [-0.06, 1.18, 1], [-0.14, 1.12, 1], [-0.22, 1.1, 1], [-0.24, 1.0, 1], [-0.34, 0.96, 1], [-0.3, 0.86, 1], [-0.36, 0.8, 1], [-0.16, 0.66]], bias: -0.1, amp: 0.7, speed: 0 },
      legs: { hips: [[-0.12, 0.54], [-0.08, 0.54]], knee: [-0.2, 0.32], foot: [-0.14, 0.06], r: [0.025, 0.015, 0.012], tuck: -1.35 },
    }),
  kani: () => {
    const b = new PlanBuilder('kani', 'scuttle');
    const body = b.bone('body', -1, [0, 0.36]);
    const legs = [0, 1, 2].flatMap((i) => [
      { hip: [-0.2 - i * 0.06, 0.32] as Vec2, knee: [-0.42 - i * 0.07, 0.46 - i * 0.03] as Vec2, foot: [-0.5 - i * 0.08, 0.02] as Vec2, phase: i % 2 ? 0.5 : 0 },
      { hip: [0.2 + i * 0.06, 0.32] as Vec2, knee: [0.42 + i * 0.07, 0.46 - i * 0.03] as Vec2, foot: [0.5 + i * 0.08, 0.02] as Vec2, phase: i % 2 ? 0 : 0.5 },
    ]);
    bugLegs(b, body, legs, [0.04, 0.03, 0.012]);
    b.ellipse(body, 0, 0.38, 0.34, 0.2);
    b.poly(body, [[-0.34, 0.4], [-0.3, 0.56], [0, 0.6], [0.3, 0.56], [0.34, 0.4]]);
    for (const s of [-1, 1]) {
      const arm = b.chain(s < 0 ? 'armL' : 'armR', body, [[0.22 * s, 0.48], [0.4 * s, 0.66], [0.38 * s, 0.84]], [0.05, 0.045, 0.05]);
      const end = arm[arm.length - 1];
      b.ellipse(end, 0.38 * s, 0.9, 0.09, 0.065, 0.4 * s);
      const pincer = b.bone(s < 0 ? 'pincerL' : 'pincerR', end, [0.36 * s, 0.94]);
      b.poly(pincer, [[0.34 * s, 0.92], [0.3 * s, 1.08, 1], [0.4 * s, 0.98]]);
      b.poly(end, [[0.42 * s, 0.92], [0.48 * s, 1.06, 1], [0.48 * s, 0.9]]);
      b.swings.push({ bone: pincer, bias: 0.1 * s, amp: 0.25, speed: 5, offset: s });
      b.waves.push({ bones: arm, amp: 0.08, lag: 0.5, speed: 2, offset: s });
    }
    for (const s of [-1, 1]) b.taper(body, 0.08 * s, 0.56, 0.018, 0.1 * s, 0.7, 0.014).ellipse(body, 0.1 * s, 0.72, 0.035, 0.035);
    b.setEye(body, 0.1, 0.72, 0.018);
    return b.build();
  },
  ga: () =>
    bird('ga', {
      gait: 'fly',
      body: [[0, 0.5, 0.22, 0.095, 0.08], [0.14, 0.53, 0.1, 0.09]],
      head: [0.24, 0.55, 0.055, 0.05],
      beak: [[0.27, 0.56], [0.3, 0.54, 1], [0.27, 0.52]],
      crest: [
        [[0.24, 0.58], [0.34, 0.74, 1], [0.38, 0.76, 1], [0.27, 0.58]],
        [[0.22, 0.58], [0.2, 0.76, 1], [0.24, 0.78, 1], [0.25, 0.58]],
      ],
      eye: [0.255, 0.56, 0.016],
      tailPivot: [-0.18, 0.5],
      tail: [[-0.16, 0.53], [-0.3, 0.48, 1], [-0.16, 0.46]],
      wing: { pivot: [0.04, 0.56], pts: [[0.0, 0.56], [0.1, 0.6], [0.16, 0.76], [0.1, 0.86], [-0.04, 0.86], [-0.1, 0.74], [-0.2, 0.7], [-0.26, 0.6], [-0.18, 0.56]], bias: 0.1, amp: 0.75, speed: 0 },
      foldedWing: [-0.1, 0.46, 0.17, 0.08, -0.25],
    }),
  rakuda: () =>
    quad('rakuda', {
      body: [[0, 0.86, 0.36, 0.15, 0], [-0.04, 0.98, 0.17, 0.17], [0.24, 0.84, 0.13, 0.13]],
      neck: { pts: [[0.32, 0.86], [0.46, 0.8], [0.56, 0.9], [0.6, 1.1]], r: [0.09, 0.07, 0.06, 0.055] },
      head: [[0.66, 1.14, 0.09, 0.065, -0.1]],
      snout: [[0.7, 1.12, 0.055, 0.82, 1.09, 0.04]],
      ears: [[[0.6, 1.18], [0.57, 1.26, 1], [0.63, 1.19]]],
      eye: [0.67, 1.16, 0.016],
      tail: { pts: [[-0.36, 0.9], [-0.42, 0.76], [-0.42, 0.66]], r: [0.025, 0.018, 0.012], amp: 0.12, speed: 2.4, tuft: [-0.42, 0.63, 0.02, 0.04] },
      legs: { front: 0.24, back: -0.24, hipY: 0.82, kneeY: 0.42, r: [0.08, 0.045, 0.038], hock: 0.05, paw: [0.05, 0.022], walk: true },
      extra: (b, { body }) => {
        b.poly(body, [[-0.24, 0.98], [-0.14, 1.2], [-0.02, 1.26], [0.1, 1.16], [0.18, 0.96]]);
        for (const x of [0.24, 0.29]) b.ellipse(b.find(x === 0.24 ? 'frontKnee' : 'farFrontKnee'), x + 0.01, 0.42, 0.035, 0.035);
      },
    }),
  zou: () =>
    quad('zou', {
      body: [[0, 0.78, 0.44, 0.3, 0.02], [0.24, 0.84, 0.24, 0.28], [-0.3, 0.76, 0.2, 0.26]],
      neck: { pts: [[0.42, 0.9], [0.5, 0.96]], r: [0.2, 0.19] },
      head: [[0.58, 0.98, 0.2, 0.19]],
      ears: [[[0.48, 1.08], [0.36, 1.14], [0.3, 0.96], [0.34, 0.74], [0.44, 0.7], [0.52, 0.86]]],
      earSwing: 0.18,
      eye: [0.66, 1.03, 0.022],
      tail: { pts: [[-0.48, 0.86], [-0.56, 0.7], [-0.58, 0.56]], r: [0.025, 0.018, 0.012], amp: 0.2, speed: 4, tuft: [-0.58, 0.52, 0.02, 0.04] },
      legs: { front: 0.28, back: -0.28, hipY: 0.66, kneeY: 0.34, r: [0.11, 0.09, 0.085], hock: 0.02, spread: 0.07, paw: [0.06, 0.03], walk: true },
      extra: (b, { head }) => {
        const trunk = b.chain('trunk', head, [[0.72, 0.94], [0.8, 0.78], [0.82, 0.6], [0.8, 0.44], [0.86, 0.34]], [0.08, 0.065, 0.05, 0.04, 0.035]);
        b.waves.push({ bones: trunk, amp: 0.12, lag: 0.5, speed: 1.8, bias: 0.04 });
        b.taper(head, 0.7, 0.88, 0.025, 0.86, 0.8, 0.008);
      },
    }),
  // ── Act 3 ────────────────────────────────────────────────────────────────
  kumo: () => {
    const b = new PlanBuilder('kumo', 'scuttle');
    const body = b.bone('body', -1, [0, 0.4]);
    const legs: { hip: Vec2; knee: Vec2; foot: Vec2; phase: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const f = i - 1.5;
      legs.push({ hip: [0.12 + f * 0.04, 0.4], knee: [0.26 + f * 0.24, 0.78 - Math.abs(f) * 0.06], foot: [0.3 + f * 0.42, 0.02], phase: i % 2 ? 0 : 0.5 });
      legs.push({ hip: [0.1 + f * 0.04, 0.4], knee: [0.2 + f * 0.24, 0.72 - Math.abs(f) * 0.06], foot: [0.22 + f * 0.42, 0.02], phase: i % 2 ? 0.5 : 0 });
    }
    bugLegs(b, body, legs, [0.03, 0.022, 0.01]);
    b.ellipse(body, -0.18, 0.46, 0.24, 0.2, 0.2);
    b.ellipse(body, 0.14, 0.4, 0.13, 0.1);
    b.ellipse(body, 0.26, 0.38, 0.06, 0.05);
    for (const dx of [0, 0.03]) b.taper(body, 0.28 + dx, 0.36, 0.015, 0.33 + dx, 0.3, 0.008);
    b.setEye(body, 0.24, 0.42, 0.018);
    return b.build();
  },
  kurage: () => {
    const b = new PlanBuilder('kurage', 'swim');
    const body = b.bone('body', -1, [0, 0.8]);
    b.poly(body, [[-0.36, 0.7], [-0.34, 0.84], [-0.22, 0.98], [0, 1.04], [0.22, 0.98], [0.34, 0.84], [0.36, 0.7], [0.28, 0.66], [0.2, 0.7], [0.1, 0.66], [0, 0.7], [-0.1, 0.66], [-0.2, 0.7], [-0.28, 0.66]]);
    const xs = [-0.28, -0.14, 0, 0.14, 0.28];
    xs.forEach((x, i) => {
      const pts: Vec2[] = Array.from({ length: 7 }, (_, k) => [x + Math.sin(k * 0.9 + i) * 0.03, 0.68 - k * 0.1]);
      const ch = b.chain(`t${i}`, body, pts, pts.map((_, k) => 0.016 - k * 0.0018));
      b.waves.push({ bones: ch, amp: 0.18, lag: 0.7, speed: 2.6, offset: i * 1.3 });
    });
    for (const [i, x] of [-0.07, 0.07].entries()) {
      const pts: Vec2[] = Array.from({ length: 5 }, (_, k) => [x + (i ? 0.03 : -0.03) * k, 0.7 - k * 0.1]);
      const ch = b.chain(`arm${i}`, body, pts, [0.05, 0.045, 0.04, 0.03, 0.015]);
      b.waves.push({ bones: ch, amp: 0.12, lag: 0.6, speed: 1.9, offset: i * 2 });
    }
    b.setEye(body, 0, 0.0, 0);
    b.swings.push({ bone: body, bias: 0, amp: 0.06, speed: 1.4 });
    return b.build();
  },
  washi: () =>
    bird('washi', {
      gait: 'fly',
      body: [[0, 0.6, 0.3, 0.13, 0.04]],
      head: [0.32, 0.68, 0.1, 0.085],
      beak: [[0.38, 0.72], [0.48, 0.71], [0.52, 0.64, 1], [0.47, 0.66], [0.4, 0.64]],
      eye: [0.34, 0.71, 0.018],
      tailPivot: [-0.26, 0.6],
      tail: [[-0.24, 0.66], [-0.52, 0.72, 1], [-0.56, 0.62], [-0.52, 0.52, 1], [-0.24, 0.56]],
      wing: {
        pivot: [0.04, 0.68],
        pts: [[-0.12, 0.68], [0.18, 0.7], [0.2, 0.92], [0.12, 1.22], [0.06, 1.34, 1], [0.02, 1.24], [-0.04, 1.34, 1], [-0.07, 1.22], [-0.14, 1.3, 1], [-0.15, 1.18], [-0.24, 1.22, 1], [-0.22, 1.08], [-0.34, 1.04, 1], [-0.3, 0.9], [-0.38, 0.82, 1], [-0.24, 0.7]],
        bias: -0.05,
        amp: 0.55,
        speed: 0,
      },
      legs: { hips: [[0.0, 0.5]], knee: [-0.06, 0.4], foot: [-0.02, 0.32], r: [0.04, 0.025, 0.02], tuck: -0.9 },
    }),
  koi: () =>
    fish('koi', {
      front: [[0.2, 0.5], [0.36, 0.56], [0.44, 0.5], [0.36, 0.43], [0.2, 0.4]],
      mid: [[0.24, 0.6], [0.0, 0.64], [-0.2, 0.58], [-0.2, 0.42], [0.0, 0.37], [0.24, 0.4]],
      rear: [[-0.16, 0.58], [-0.36, 0.53], [-0.4, 0.47], [-0.36, 0.45], [-0.16, 0.42]],
      joints: [[0.12, 0.5], [-0.18, 0.5]],
      tailFin: [[-0.36, 0.5], [-0.6, 0.66], [-0.72, 0.6, 1], [-0.58, 0.5], [-0.74, 0.34, 1], [-0.6, 0.32], [-0.36, 0.48]],
      dorsal: [[0.18, 0.6], [0.0, 0.74], [-0.2, 0.68, 1], [-0.2, 0.58]],
      pectoral: [[0.16, 0.42], [0.06, 0.28, 1], [0.0, 0.32], [0.08, 0.42]],
      pectoralPivot: [0.14, 0.42],
      eye: [0.33, 0.52, 0.02],
      extra: (b, { body }) => {
        for (const [dy, r] of [[0.0, 0.1], [0.02, 0.06]] as const) {
          const w = b.chain(`barbel${dy}`, body, [[0.43, 0.46 + dy], [0.5, 0.4 + dy], [0.52, 0.34 + dy - r * 0.2]], [0.01, 0.008, 0.004]);
          b.waves.push({ bones: w, amp: 0.2, lag: 0.6, speed: 3, offset: dy * 40 });
        }
      },
    }),
  tsubame: () =>
    bird('tsubame', {
      gait: 'fly',
      body: [[0, 0.5, 0.22, 0.08, 0.06]],
      head: [0.22, 0.55, 0.075, 0.07],
      beak: [[0.28, 0.57], [0.34, 0.54, 1], [0.28, 0.52]],
      eye: [0.24, 0.57, 0.016],
      tailPivot: [-0.18, 0.5],
      tail: [[-0.16, 0.54], [-0.36, 0.56], [-0.62, 0.66, 1], [-0.4, 0.52], [-0.64, 0.4, 1], [-0.36, 0.46], [-0.16, 0.46]],
      wing: { pivot: [0.04, 0.55], pts: [[-0.04, 0.55], [0.1, 0.57], [0.06, 0.72], [-0.12, 0.96], [-0.38, 1.16, 1], [-0.22, 0.86], [-0.14, 0.58]], bias: 0, amp: 0.8, speed: 0 },
    }),
  // ── Free shadows ─────────────────────────────────────────────────────────
  tako: () => {
    const b = new PlanBuilder('tako', 'swim');
    const body = b.bone('body', -1, [0, 0.7]);
    b.ellipse(body, -0.08, 0.92, 0.22, 0.26, 0.35);
    b.ellipse(body, 0.1, 0.68, 0.17, 0.13);
    for (let i = 0; i < 6; i++) {
      const a = -2.4 + i * 0.38;
      const pts: Vec2[] = Array.from({ length: 7 }, (_, k) => {
        const r = 0.08 + k * 0.1;
        const curl = k * 0.12 * (i % 2 ? 1 : -1);
        return [0.1 + Math.cos(a + curl) * r, 0.62 + Math.sin(a + curl) * r * 0.9];
      });
      const ch = b.chain(`arm${i}`, body, pts, pts.map((_, k) => 0.055 - k * 0.0075));
      b.waves.push({ bones: ch, amp: 0.2, lag: 0.7, speed: 2.4, offset: i * 1.1 });
    }
    b.setEye(body, 0.14, 0.74, 0.026);
    b.swings.push({ bone: body, bias: 0, amp: 0.05, speed: 1.2 });
    return b.build();
  },
  niwatori: () =>
    bird('niwatori', {
      gait: 'walk',
      body: [[0, 0.58, 0.24, 0.2, 0.25], [0.14, 0.66, 0.13, 0.14]],
      neck: { pts: [[0.16, 0.7], [0.22, 0.86]], r: [0.1, 0.07] },
      head: [0.26, 0.92, 0.075, 0.07],
      beak: [[0.32, 0.94], [0.4, 0.9, 1], [0.32, 0.87]],
      crest: [
        [[0.18, 0.96], [0.2, 1.06], [0.24, 1.02], [0.27, 1.1], [0.3, 1.03], [0.34, 1.08], [0.34, 0.97]],
        [[0.3, 0.87], [0.3, 0.78], [0.34, 0.76], [0.35, 0.87]],
      ],
      eye: [0.28, 0.94, 0.016],
      tailPivot: [-0.2, 0.66],
      tail: [[-0.16, 0.7], [-0.28, 0.88], [-0.22, 0.6]],
      plumes: [
        { pts: [[-0.2, 0.7], [-0.3, 0.92], [-0.44, 0.98], [-0.54, 0.86], [-0.54, 0.72]], r: [0.05, 0.04, 0.03, 0.02, 0.008] },
        { pts: [[-0.2, 0.68], [-0.36, 0.84], [-0.48, 0.8], [-0.52, 0.62]], r: [0.04, 0.03, 0.02, 0.006] },
      ],
      foldedWing: [-0.02, 0.6, 0.18, 0.11, 0.2],
      legs: { hips: [[0.0, 0.42], [0.05, 0.42]], knee: [-0.03, 0.22], foot: [0.01, 0.04], r: [0.04, 0.018, 0.014], tuck: 0 },
    }),
  kamome: () =>
    bird('kamome', {
      gait: 'fly',
      body: [[0, 0.5, 0.26, 0.09, 0.03]],
      head: [0.27, 0.55, 0.08, 0.072],
      beak: [[0.33, 0.57], [0.46, 0.55, 1], [0.44, 0.52], [0.33, 0.52]],
      eye: [0.29, 0.57, 0.015],
      tailPivot: [-0.22, 0.5],
      tail: [[-0.2, 0.54], [-0.4, 0.55, 1], [-0.4, 0.46, 1], [-0.2, 0.46]],
      wing: { pivot: [0.04, 0.56], pts: [[-0.06, 0.56], [0.12, 0.58], [0.14, 0.72], [0.02, 0.9], [-0.18, 1.18, 1], [-0.2, 1.0], [-0.12, 0.84], [-0.14, 0.6]], bias: 0, amp: 0.65, speed: 0 },
    }),
  tonbo: () => {
    const b = new PlanBuilder('tonbo', 'fly');
    const body = b.bone('body', -1, [0.1, 0.5]);
    for (const [i, x] of [0.14, 0.04].entries()) {
      for (const [j, dir] of [1, -1].entries()) {
        const w = b.bone(`wing${i}${j}`, body, [x, 0.53]);
        const s = dir;
        b.poly(w, [[x - 0.02, 0.53], [x + 0.04 * s, 0.6], [x - 0.02 + 0.06 * s, 0.94], [x - 0.08 + 0.02 * s, 0.98], [x - 0.06, 0.6]]);
        b.swings.push({ bone: w, bias: 0.2 * s, amp: 0.45, speed: 0, offset: i * 1.4 + j * 0.3 });
      }
    }
    b.ellipse(body, 0.1, 0.5, 0.09, 0.06);
    const tail = b.chain('tail', body, [[0.02, 0.5], [-0.14, 0.49], [-0.3, 0.48], [-0.46, 0.47], [-0.6, 0.46]], [0.035, 0.028, 0.024, 0.022, 0.018]);
    b.waves.push({ bones: tail, amp: 0.05, lag: 0.5, speed: 2 });
    const head = b.bone('head', body, [0.2, 0.5]);
    b.ellipse(head, 0.24, 0.51, 0.06, 0.055);
    b.setEye(head, 0.26, 0.53, 0.022);
    return b.build();
  },
  kawauso: () =>
    quad('kawauso', {
      gait: 'swim',
      body: [[0, 0.5, 0.36, 0.11, 0], [0.24, 0.52, 0.12, 0.1], [-0.22, 0.5, 0.13, 0.11]],
      neck: { pts: [[0.3, 0.52], [0.42, 0.56]], r: [0.1, 0.085] },
      head: [[0.48, 0.58, 0.1, 0.08]],
      snout: [[0.52, 0.57, 0.06, 0.6, 0.55, 0.04]],
      ears: [[[0.43, 0.65], [0.44, 0.7], [0.48, 0.66]]],
      eye: [0.51, 0.61, 0.016],
      tail: { pts: [[-0.34, 0.52], [-0.5, 0.5], [-0.66, 0.46], [-0.8, 0.42]], r: [0.07, 0.05, 0.03, 0.01], amp: 0.18, speed: 3 },
      legs: { front: 0.22, back: -0.24, hipY: 0.46, kneeY: 0.38, r: [0.05, 0.035, 0.03], hock: 0.04, paw: [0.04, 0.02], footY: 0.32 },
      extra: (b, { head }) => {
        for (const dy of [0, 0.02]) b.taper(head, 0.6, 0.56 + dy, 0.004, 0.68, 0.58 + dy * 2, 0.002);
        for (const name of ['front', 'farFront', 'hind', 'farHind']) b.swings.push({ bone: b.find(`${name}Hip`), bias: name.includes('ind') ? -0.9 : 0.5, amp: 0.45, speed: 0, offset: name.startsWith('far') ? Math.PI : 0 });
      },
    }),
  ryu: () => {
    const b = new PlanBuilder('ryu', 'fly');
    const body = b.bone('body', -1, [0, 0.6]);
    const farWing = b.bone('farWing', body, [0.04, 0.66]);
    const wingPts: PolyPoint[] = [[-0.04, 0.66], [0.08, 0.7], [0.0, 1.1, 1], [-0.12, 0.92], [-0.22, 1.02, 1], [-0.28, 0.86], [-0.4, 0.9, 1], [-0.36, 0.74], [-0.16, 0.66]];
    b.poly(farWing, wingPts.map((p) => [p[0] + 0.06, p[1] + 0.03, ...(p.length === 3 ? [1] : [])] as PolyPoint), 1);
    b.swings.push({ bone: farWing, bias: 0.1, amp: 0.5, speed: 0, offset: -0.6 });
    b.ellipse(body, 0, 0.6, 0.2, 0.09);
    const neck = b.chain('neck', body, [[0.16, 0.62], [0.3, 0.7], [0.38, 0.82], [0.48, 0.86]], [0.08, 0.065, 0.055, 0.05]);
    const tail = b.chain('tail', body, [[-0.16, 0.6], [-0.34, 0.54], [-0.52, 0.56], [-0.68, 0.62], [-0.84, 0.6], [-0.98, 0.56]], [0.08, 0.065, 0.05, 0.036, 0.022, 0.008]);
    b.poly(tail[tail.length - 1], [[-0.92, 0.57], [-1.06, 0.68, 1], [-1.04, 0.56], [-1.08, 0.46, 1], [-0.94, 0.54]], 0);
    for (const ch of [neck, tail]) b.waves.push({ bones: ch, amp: 0.1, lag: 0.7, speed: 0 });
    const head = b.bone('head', neck[neck.length - 1], [0.48, 0.86]);
    b.poly(head, [[0.46, 0.8], [0.46, 0.92], [0.56, 0.95], [0.68, 0.9], [0.72, 0.86], [0.6, 0.83]]);
    b.taper(head, 0.5, 0.92, 0.02, 0.4, 1.04, 0.006).taper(head, 0.54, 0.93, 0.018, 0.48, 1.06, 0.005);
    const jaw = b.bone('jaw', head, [0.52, 0.82]);
    b.poly(jaw, [[0.5, 0.83], [0.68, 0.84, 1], [0.6, 0.78], [0.5, 0.79]], 0);
    b.swings.push({ bone: jaw, bias: -0.08, amp: 0.1, speed: 3 });
    const whisker = b.chain('whisker', head, [[0.66, 0.88], [0.74, 0.8], [0.76, 0.7], [0.72, 0.62]], [0.008, 0.006, 0.004, 0.002]);
    b.waves.push({ bones: whisker, amp: 0.2, lag: 0.6, speed: 2.4 });
    b.setEye(head, 0.58, 0.9, 0.016);
    for (const [i, x] of [0.1, -0.08].entries()) {
      const l = b.leg(`leg${i}`, body, [x, 0.56], [x + 0.06, 0.44], [x + 0.02, 0.36], [0.04, 0.03, 0.025], { phase: i * 0.5, kneeSign: -1 });
      b.tuck.push({ bone: l.hip, angle: -0.5 });
    }
    const wing = b.bone('wing', body, [0.04, 0.66]);
    b.poly(wing, wingPts, 1);
    b.swings.push({ bone: wing, bias: 0, amp: 0.55, speed: 0 });
    return b.build();
  },
  kaeru: () => {
    const b = new PlanBuilder('kaeru', 'hop');
    const body = b.bone('body', -1, [0, 0.24]);
    b.leg('hind', body, [-0.18, 0.22], [0.08, 0.16], [-0.16, 0.04], [0.09, 0.05, 0.03], { phase: 0, kneeSign: 1, paw: [0.12, 0.025] });
    b.leg('front', body, [0.16, 0.2], [0.2, 0.1], [0.22, 0.03], [0.035, 0.025, 0.02], { phase: 0.5, kneeSign: -1, paw: [0.06, 0.02] });
    b.poly(body, [[-0.3, 0.2], [-0.24, 0.32], [0.02, 0.38], [0.2, 0.4], [0.3, 0.36], [0.32, 0.28], [0.22, 0.2], [0.0, 0.12], [-0.2, 0.12]]);
    const head = b.bone('head', body, [0.16, 0.34]);
    b.ellipse(head, 0.16, 0.42, 0.07, 0.065);
    b.taper(head, 0.2, 0.28, 0.006, 0.33, 0.31, 0.004);
    b.setEye(head, 0.17, 0.43, 0.03);
    b.swings.push({ bone: head, bias: 0, amp: 0.04, speed: 2.5 });
    return b.build();
  },
  kabuto: () => {
    const b = new PlanBuilder('kabuto', 'scuttle');
    const body = b.bone('body', -1, [0, 0.34]);
    const legs: { hip: Vec2; knee: Vec2; foot: Vec2; phase: number }[] = [];
    [0.16, 0.0, -0.16].forEach((x, i) => {
      legs.push({ hip: [x + 0.03, 0.26], knee: [x + 0.1 + i * -0.08, 0.2], foot: [x + 0.16 - i * 0.16, 0.02], phase: i % 2 ? 0 : 0.5 });
      legs.push({ hip: [x, 0.26], knee: [x + 0.07 - i * 0.08, 0.18], foot: [x + 0.12 - i * 0.16, 0.02], phase: i % 2 ? 0.5 : 0 });
    });
    bugLegs(b, body, legs, [0.03, 0.022, 0.012]);
    b.poly(body, [[-0.38, 0.26], [-0.34, 0.42], [-0.16, 0.52], [0.08, 0.52], [0.18, 0.44], [0.2, 0.28], [0.0, 0.22], [-0.28, 0.22]]);
    b.ellipse(body, 0.24, 0.36, 0.1, 0.09);
    const head = b.bone('head', body, [0.3, 0.32]);
    b.ellipse(head, 0.34, 0.3, 0.06, 0.05);
    b.poly(head, [[0.34, 0.34], [0.46, 0.42], [0.54, 0.56], [0.52, 0.62, 1], [0.5, 0.56], [0.58, 0.58, 1], [0.48, 0.46], [0.4, 0.3]]);
    b.poly(body, [[0.22, 0.44], [0.32, 0.54], [0.36, 0.56, 1], [0.3, 0.46], [0.26, 0.42]], 0);
    const ant = b.chain('antenna', head, [[0.38, 0.28], [0.46, 0.26], [0.5, 0.3]], [0.008, 0.006, 0.004]);
    b.waves.push({ bones: ant, amp: 0.15, lag: 0.5, speed: 3 });
    b.setEye(head, 0.36, 0.31, 0.014);
    b.swings.push({ bone: head, bias: 0, amp: 0.05, speed: 1.6 });
    return b.build();
  },
  fukurou: () =>
    bird('fukurou', {
      gait: 'fly',
      body: [[0, 0.56, 0.2, 0.17, 0.3], [0.08, 0.6, 0.16, 0.15]],
      head: [0.2, 0.78, 0.15, 0.13],
      beak: [[0.32, 0.78], [0.36, 0.72, 1], [0.31, 0.71]],
      crest: [[[0.12, 0.86], [0.08, 0.98, 1], [0.18, 0.9]], [[0.22, 0.9], [0.26, 1.0, 1], [0.28, 0.88]]],
      eye: [0.27, 0.8, 0.035],
      tailPivot: [-0.16, 0.48],
      tail: [[-0.14, 0.52], [-0.32, 0.4, 1], [-0.12, 0.42]],
      wing: { pivot: [0.0, 0.64], pts: [[-0.1, 0.64], [0.12, 0.66], [0.12, 0.86], [0.0, 1.06], [-0.1, 1.12, 1], [-0.18, 1.04], [-0.28, 1.02, 1], [-0.32, 0.88], [-0.36, 0.78, 1], [-0.22, 0.66]], bias: 0, amp: 0.55, speed: 0 },
      legs: { hips: [[0.04, 0.42]], knee: [0.06, 0.34], foot: [0.04, 0.28], r: [0.045, 0.03, 0.02], tuck: -0.4 },
    }),
  sakana: () =>
    fish('sakana', {
      front: [[0.14, 0.62], [0.36, 0.6], [0.46, 0.52], [0.38, 0.44], [0.14, 0.42]],
      mid: [[0.2, 0.66], [0.0, 0.68], [-0.18, 0.62], [-0.18, 0.42], [0.0, 0.38], [0.2, 0.4]],
      rear: [[-0.14, 0.6], [-0.32, 0.55], [-0.36, 0.5], [-0.32, 0.46], [-0.14, 0.44]],
      joints: [[0.1, 0.52], [-0.16, 0.52]],
      tailFin: [[-0.32, 0.52], [-0.54, 0.72, 1], [-0.46, 0.52], [-0.54, 0.32, 1], [-0.32, 0.5]],
      dorsal: [[0.12, 0.64], [0.02, 0.8, 1], [-0.12, 0.62]],
      pectoral: [[0.18, 0.46], [0.08, 0.36, 1], [0.06, 0.44]],
      pectoralPivot: [0.16, 0.46],
      eye: [0.34, 0.54, 0.024],
    }),
};

export const BODY_IDS = Object.keys(PLANS);

const cache = new Map<string, BodyPlan>();

/** The animal a creature becomes (cached). */
export function bodyPlan(id: string): BodyPlan {
  let p = cache.get(id);
  if (!p) {
    const make = PLANS[id];
    if (!make) throw new Error(`no body plan for creature "${id}"`);
    p = make();
    cache.set(id, p);
  }
  return p;
}
