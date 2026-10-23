// Largest mutually-distinct subset (max cross ≤ T) via randomised greedy restarts.
// Run: npx vite-node scripts/mis.ts 0.45 [mustInclude...]
import fs from 'node:fs';
import { jointsFromRecord } from '../src/hand.js';
import { mulberry32 } from '../src/daily.js';
import { buildTargetSilhouette, iou, projectHands, Shape2D, type TargetSilhouette } from '../src/silhouette.js';

const captured = JSON.parse(fs.readFileSync(new URL('../targets/captured.json', import.meta.url), 'utf8')) as Record<string, { hands: { joints: Record<string, number[]> }[] }>;
const T = Number(process.argv[2] ?? 0.45);
const must = process.argv.slice(3);
const ts: TargetSilhouette[] = [];
for (const [id, c] of Object.entries(captured)) {
  const s = new Shape2D();
  if (projectHands(c.hands.map((h) => jointsFromRecord(h.joints)), s)) ts.push(buildTargetSilhouette(id, s));
}
const n = ts.length;
const X = ts.map(() => new Float32Array(n));
for (let i = 0; i < n; i++)
  for (let j = i + 1; j < n; j++) {
    let b = 0;
    for (const m of ts[j].masks) b = Math.max(b, iou(ts[i].masks[2], m));
    for (const m of ts[i].masks) b = Math.max(b, iou(ts[j].masks[2], m));
    X[i][j] = X[j][i] = b;
  }
fs.writeFileSync(new URL('../targets/cross.json', import.meta.url), JSON.stringify({ ids: ts.map((t) => t.id), cross: X.map((r) => Array.from(r, (v) => +v.toFixed(3))) }));
const idx = (id: string) => ts.findIndex((t) => t.id === id);
const base = must.map(idx);
if (base.some((i) => i < 0)) throw new Error('unknown must id');
let best: number[] = [];
const rnd = mulberry32(7);
for (let it = 0; it < 6000; it++) {
  const set = [...base];
  const order = [...Array(n).keys()].sort(() => rnd() - 0.5);
  for (const i of order) if (!set.includes(i) && set.every((j) => X[i][j] <= T)) set.push(i);
  if (set.length > best.length) best = set;
}
console.log(`${best.length} at <= ${T}`);
const one = best.filter((i) => !ts[i].id.startsWith('2.'));
const two = best.filter((i) => ts[i].id.startsWith('2.'));
console.log('one-hand', one.length, one.map((i) => ts[i].id).join(' '));
console.log('two-hand', two.length, two.map((i) => ts[i].id).join(' '));
