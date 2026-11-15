// Creature bodies: every cast member becomes a real animal silhouette with a
// valid rig, walkers have jointed legs, and the walk cycle keeps a foot on the
// ground without sliding.
import { describe, expect, it } from 'vitest';
import { BESTIARY } from '../src/bestiary.js';
import { BodyAnimator, PLAN_SIZE, planArea, poseVertices, smoothPolygon, triangulate } from '../src/body.js';
import { BODY_IDS, bodyPlan } from '../src/creatures.js';

const grounded = (g: string) => g === 'walk' || g === 'scuttle' || g === 'slither' || g === 'hop';

describe('body plans', () => {
  it('gives every creature in the cast its own body', () => {
    expect(new Set(BODY_IDS)).toEqual(new Set(BESTIARY.map((d) => d.id)));
    expect(() => bodyPlan('nope')).toThrow(/no body plan/);
  });

  for (const id of BODY_IDS) {
    it(`${id}: a valid, normalised mesh and rig`, () => {
      const p = bodyPlan(id);
      const nv = p.vertexBones.length;
      expect(p.positions.length).toBe(nv * 2);
      expect(p.indices.length % 3).toBe(0);
      expect(p.indices.length).toBeGreaterThan(60);
      for (const i of p.indices) expect(i).toBeLessThan(nv);
      for (const b of p.vertexBones) expect(b).toBeLessThan(p.bones.length);
      p.bones.forEach((b, i) => expect(b.parent).toBeLessThan(i));
      expect(p.bones[0].parent).toBe(-1);
      const size = Math.max(p.maxX - p.minX, p.maxY - p.minY);
      expect(size).toBeCloseTo(PLAN_SIZE, 5);
      // Filled, not a stick figure.
      expect(planArea(p)).toBeGreaterThan(0.12);
      // Jointed legs: the knee hangs on the hip.
      for (const l of p.legs) expect(p.bones[l.knee].parent).toBe(l.hip);
    });
  }

  it('puts four jointed legs on every four-legged walker and six or more on arthropods', () => {
    for (const id of ['inu', 'kirin', 'rakuda', 'zou']) expect(bodyPlan(id).legs.length, id).toBe(4);
    for (const id of ['kani', 'kabuto']) expect(bodyPlan(id).legs.length, id).toBe(6);
    expect(bodyPlan('kumo').legs.length).toBe(8);
    expect(bodyPlan('niwatori').legs.length).toBe(2);
  });

  it('draws the eye on the head, toward the front', () => {
    for (const id of BODY_IDS) {
      const p = bodyPlan(id);
      if (p.eye.r === 0) continue; // the jellyfish has no eye
      expect(p.eye.x, id).toBeGreaterThan((p.minX + p.maxX) / 2 - 0.05);
    }
  });

  for (const id of BODY_IDS.filter((i) => grounded(bodyPlan(i).gait))) {
    it(`${id}: keeps its lowest foot on the ground line through the gait`, () => {
      const p = bodyPlan(id);
      const a = new BodyAnimator(p);
      const pos = new Float32Array(p.positions.length);
      for (let s = 0; s < 90; s++) {
        a.step(1 / 30, a.cycle / 30);
        if (a.airborne) continue;
        if (p.legs.length) {
          const low = Math.min(...a.feet().map((f) => f[1]));
          expect(low).toBeCloseTo(p.groundY, 6);
        } else {
          poseVertices(p, a.transforms, a.lift, pos);
          let low = Infinity;
          for (let i = 1; i < pos.length; i += 2) low = Math.min(low, pos[i]);
          expect(low).toBeCloseTo(p.groundY, 6);
        }
      }
    });
  }

  for (const id of ['inu', 'kirin', 'rakuda', 'zou', 'niwatori']) {
    it(`${id}: the planted foot does not slide while the body walks`, () => {
      const p = bodyPlan(id);
      const a = new BodyAnimator(p);
      for (let s = 0; s < 30; s++) a.step(1 / 30, a.cycle / 40); // reach full motion
      const step = a.cycle / 40;
      let travelled = 0;
      let slip = 0;
      for (let s = 0; s < 80; s++) {
        const before = a.feet();
        a.step(1 / 30, step);
        const after = a.feet();
        // A planted foot is on the ground line before and after the step. In
        // the world the body moved forward by `step`; the foot should not.
        before.forEach((f, i) => {
          if (Math.abs(f[1] - p.groundY) > 0.004 || Math.abs(after[i][1] - p.groundY) > 0.004) return;
          slip += Math.abs(after[i][0] + step - f[0]);
          travelled += step;
        });
      }
      expect(travelled).toBeGreaterThan(step * 40);
      // Planted feet slip less than a fifth of the distance walked.
      expect(slip / travelled).toBeLessThan(0.2);
    });
  }

  it('flaps wings for fliers and lifts nothing off a ground line', () => {
    const p = bodyPlan('sagi');
    expect(p.gait).toBe('fly');
    const a = new BodyAnimator(p);
    const wing = p.bones.findIndex((b) => b.name === 'wing');
    const seen: number[] = [];
    for (let s = 0; s < 40; s++) {
      a.step(1 / 30, 0.01);
      seen.push(a.angles[wing]);
    }
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.8);
  });

  it('settles a walker to rest when it stops', () => {
    const p = bodyPlan('inu');
    const a = new BodyAnimator(p);
    for (let s = 0; s < 30; s++) a.step(1 / 30, 0.03);
    for (let s = 0; s < 60; s++) a.step(1 / 30, 0);
    expect(a.motion).toBeLessThan(0.01);
    const hip = p.legs[0].hip;
    expect(Math.abs(a.angles[hip])).toBeLessThan(0.01);
  });
});

describe('polygon helpers', () => {
  it('triangulates a concave polygon to its exact area', () => {
    const L: [number, number][] = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];
    const t = triangulate(L);
    expect(t.length).toBe(12);
    let a = 0;
    for (let i = 0; i < t.length; i += 3) {
      const [p, q, r] = [L[t[i]], L[t[i + 1]], L[t[i + 2]]];
      a += Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1])) / 2;
    }
    expect(a).toBeCloseTo(3, 9);
  });

  it('keeps sharp points when smoothing', () => {
    const ring = smoothPolygon([[0, 0], [1, 0, 1], [1, 1], [0, 1]], 2);
    expect(ring.some(([x, y]) => x === 1 && y === 0)).toBe(true);
    expect(ring.length).toBeGreaterThan(8);
  });
});
