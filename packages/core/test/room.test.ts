import { describe, expect, it } from 'vitest';
import { classifyPlanes, findJump, pickLanternSpot, pickWall, shojiSurface, type PlaneInput } from '../src/room.js';
import type { Vec3 } from '../src/lightframe.js';

// Planes as the emulator's sunlit_living_room reports them (labels dropped).
function rect(id: string, c: Vec3, n: Vec3, w: number, h: number): PlaneInput {
  const horizontal = Math.abs(n[1]) > 0.9;
  const pts: Vec3[] = [];
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    if (horizontal) pts.push([c[0] + (a * w) / 2, c[1], c[2] + (b * h) / 2]);
    else if (Math.abs(n[0]) > 0.9) pts.push([c[0], c[1] + (b * h) / 2, c[2] + (a * w) / 2]);
    else pts.push([c[0] + (a * w) / 2, c[1] + (b * h) / 2, c[2]]);
  }
  return { id, normal: n, points: pts };
}

const living: PlaneInput[] = [
  rect('couch', [0, 0.45, -2.78], [0, 1, 0], 1.9, 0.66),
  rect('art', [0, 1.62, -3.38], [0, 0, 1], 1.22, 0.82),
  rect('table', [0, 0.42, -1.95], [0, 1, 0], 1.15, 0.6),
  rect('dining', [-0.95, 0.74, 1.35], [0, 1, 0], 0.9, 0.9),
  rect('door', [1.45, 1.03, 2.38], [0, 0, -1], 0.85, 2.06),
  rect('floor', [0, 0, -0.5], [0, 1, 0], 5, 5.8),
  rect('ceiling', [0, 2.7, -0.5], [0, -1, 0], 5, 5.8),
  rect('wallL', [-2.5, 1.35, -0.5], [1, 0, 0], 5.8, 2.7),
  rect('wallR', [2.5, 1.35, -0.5], [-1, 0, 0], 5.8, 2.7),
  rect('wallB', [0, 1.35, -3.4], [0, 0, 1], 5, 2.7),
  rect('wallF', [0, 1.35, 2.4], [0, 0, -1], 5, 2.7),
];

describe('room reading', () => {
  const s = classifyPlanes(living);
  const kind = (id: string) => s.find((x) => x.id === id)!.kind;

  it('classifies unlabelled planes by orientation, height and size', () => {
    expect(kind('floor')).toBe('floor');
    expect(kind('ceiling')).toBe('ceiling');
    expect(kind('wallB')).toBe('wall');
    expect(kind('art')).toBe('panel');
    expect(kind('table')).toBe('desk');
    expect(kind('couch')).toBe('desk'); // a seat at desk height is still a surface
    expect(kind('door')).toBe('panel'); // 0.85 m wide: too narrow to stage a play on
  });

  it('picks the wall in front of the lantern', () => {
    const w = pickWall(s, [0, 0.5, -1.8], [0, 0.4, -1]);
    expect(w?.id).toBe('wallB');
    expect(w?.u[0]).toBeCloseTo(1);
    expect(w?.v[1]).toBeCloseTo(1);
  });

  it('puts the lantern on the desk within reach', () => {
    const spot = pickLanternSpot(s, [0, 1.1, -1.2], [0, 0, -1]);
    expect(spot?.surface.id).toBe('table');
    expect(spot!.point[2]).toBeGreaterThan(-2.25);
    expect(spot!.point[2]).toBeLessThan(-1.6);
  });

  it('finds no desk from the middle of the room', () => {
    expect(pickLanternSpot(s, [0, 1.6, 0], [0, 0, -1])).toBeNull();
  });

  it('lets a creature jump the corner onto the next wall or up to the ceiling', () => {
    const back = s.find((x) => x.id === 'wallB')!;
    const j = findJump(s, back, [-2.5, 1.2, -3.4], ['wall']);
    expect(j?.surface.id).toBe('wallL');
    const up = findJump(s, back, [0.5, 2.7, -3.4], ['ceiling']);
    expect(up?.surface.id).toBe('ceiling');
  });

  it('returns no wall in a wall-less room, and a shoji works as one', () => {
    const open = classifyPlanes([rect('floor', [0, 0, 0], [0, 1, 0], 4, 4), rect('desk', [0, 0.7, -0.6], [0, 1, 0], 1, 0.6)]);
    expect(pickWall(open, [0, 0.8, -0.5], [0, 0.3, -1])).toBeNull();
    const shoji = shojiSurface([0, 1.2, -1.6], [0, 0, 1]);
    expect(pickWall([...open, shoji], [0, 0.8, -0.5], [0, 0.3, -1])?.kind).toBe('shoji');
  });
});
