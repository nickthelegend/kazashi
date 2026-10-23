// Prints 32x32 thumbnails of captured candidates side by side. Run: npx vite-node scripts/ascii.ts id1 id2 ...
import fs from 'node:fs';
import { jointsFromRecord } from '../src/hand.js';
import { buildTargetSilhouette, GRID, projectHands, Shape2D } from '../src/silhouette.js';
const captured = JSON.parse(fs.readFileSync(new URL('../targets/captured.json', import.meta.url), 'utf8'));
const ids = process.argv.slice(2);
const thumbs = ids.map((id) => {
  const s = new Shape2D();
  projectHands(captured[id].hands.map((h: { joints: Record<string, number[]> }) => jointsFromRecord(h.joints)), s);
  const m = buildTargetSilhouette(id, s).masks[2];
  const rows: string[] = [];
  for (let y = GRID - 2; y >= 0; y -= 2) {
    let r = '';
    for (let x = 0; x < GRID; x += 2) r += m.get(x, y) || m.get(x + 1, y) || m.get(x, y + 1) || m.get(x + 1, y + 1) ? '#' : '.';
    rows.push(r.slice(4, 28));
  }
  return { id, rows: rows.slice(4, 28) };
});
for (let i = 0; i < thumbs.length; i += 4) {
  const g = thumbs.slice(i, i + 4);
  console.log(g.map((t) => t.id.slice(0, 24).padEnd(25)).join(''));
  for (let r = 0; r < 24; r++) console.log(g.map((t) => t.rows[r] + ' ').join(''));
}
