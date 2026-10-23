// Picks a mutually distinct set of silhouettes from captured candidates.
// Run: npx vite-node scripts/select.ts [maxCross] [preferred ids...]
import fs from 'node:fs';
import { jointsFromRecord } from '../src/hand.js';
import { buildTargetSilhouette, iou, Shape2D, projectHands, type TargetSilhouette } from '../src/silhouette.js';

const captured = JSON.parse(fs.readFileSync(new URL('../targets/captured.json', import.meta.url), 'utf8')) as Record<
  string,
  { hands: { hand: string; joints: Record<string, number[]> }[] }
>;
const maxCross = Number(process.argv[2] ?? 0.45);
const preferred = process.argv.slice(3);

const targets: TargetSilhouette[] = [];
for (const [id, c] of Object.entries(captured)) {
  const shape = new Shape2D();
  if (!projectHands(c.hands.map((h) => jointsFromRecord(h.joints)), shape)) {
    console.log('skip (behind light)', id);
    continue;
  }
  targets.push(buildTargetSilhouette(id, shape));
}
const byId = new Map(targets.map((t) => [t.id, t]));
const cross = (a: TargetSilhouette, b: TargetSilhouette) => {
  let best = 0;
  for (const m of b.masks) best = Math.max(best, iou(a.masks[2], m));
  for (const m of a.masks) best = Math.max(best, iou(b.masks[2], m));
  return best;
};

// Greedy: preferred first, then candidates that keep the max cross score lowest.
const chosen: TargetSilhouette[] = [];
for (const id of preferred) {
  const t = byId.get(id);
  if (!t) throw new Error(`unknown id ${id}`);
  const worst = Math.max(0, ...chosen.map((c) => cross(c, t)));
  console.log(`preferred ${id}: worst cross ${worst.toFixed(3)}`);
  chosen.push(t);
}
const pool = targets.filter((t) => !chosen.includes(t));
for (;;) {
  let pick: TargetSilhouette | null = null;
  let pickWorst = Infinity;
  for (const t of pool) {
    if (chosen.includes(t)) continue;
    const worst = Math.max(0, ...chosen.map((c) => cross(c, t)));
    if (worst < pickWorst) {
      pickWorst = worst;
      pick = t;
    }
  }
  if (!pick || pickWorst > maxCross) break;
  chosen.push(pick);
}
console.log(`\n${chosen.length} distinct at <= ${maxCross}:`);
console.log(chosen.map((c) => c.id).join(' '));
if (process.env.ASCII) {
  for (const id of process.env.ASCII.split(',')) {
    const t = byId.get(id);
    if (!t) continue;
    console.log(`\n== ${id}`);
    console.log(
      t.masks[2]
        .toAscii()
        .split('\n')
        .filter((r) => r.includes('#'))
        .map((r) => r.slice(8, 56))
        .join('\n'),
    );
  }
}
if (process.env.PAIRS) {
  const ids = process.env.PAIRS.split(',');
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) console.log(ids[i], ids[j], cross(byId.get(ids[i])!, byId.get(ids[j])!).toFixed(3));
}
