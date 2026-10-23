// A wider candidate sweep: one hand in 12 directions × 3 palm facings,
// two-hand arrangements of pose pairs. Appends to candidates-2.json.
import fs from 'node:fs';
import { mulberry32 } from './rng.mjs';

const n = (v) => { const l = Math.hypot(...v); return v.map((x) => +(x / l).toFixed(4)); };
const rnd = mulberry32(42);
const out = [];
const poses1 = ['open', 'flat', 'peace', 'rock', 'call', 'point', 'finger-gun', 'three', 'four', 'ok', 'claw', 'thumbs-up', 'cup', 'hook', 'tripod', 'pinch-pinky', 'key-pinch'];
for (const p of poses1) {
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    const f = [Math.cos(ang), Math.sin(ang), 0];
    for (const [pn, palm] of [['w', [0, 0, -1]], ['l', [0, 0, 1]], ['e', n([-Math.sin(ang), Math.cos(ang), 0])]]) {
      out.push({ id: `${p}.a${a * 30}${pn}`, hands: [{ hand: 'right', poseId: p, wrist: [0.04, 0.08, -0.3], fingersDir: n(f.map((v, i) => v + (i === 2 ? -0.15 : 0))), palmDir: palm }] });
    }
  }
}
const poses2 = ['open', 'flat', 'claw', 'point', 'fist', 'peace', 'rock', 'call', 'ok', 'cup', 'hook', 'four', 'thumbs-up', 'finger-gun'];
const arrangements = [
  // [left wrist, left fingers, right wrist, right fingers]
  ['side', [-0.08, 0.08, -0.3], [-0.3, 1, 0], [0.08, 0.08, -0.3], [0.3, 1, 0]],
  ['cross', [0.02, 0.08, -0.3], [-0.6, 0.8, 0], [-0.02, 0.08, -0.3], [0.6, 0.8, 0]],
  ['stack', [0.06, 0.15, -0.3], [-1, 0.1, 0], [0.06, 0.03, -0.3], [-1, -0.1, 0]],
  ['wings', [-0.06, 0.1, -0.3], [-1, 0.3, 0], [0.06, 0.1, -0.3], [1, 0.3, 0]],
  ['down', [-0.07, 0.15, -0.3], [-0.2, -1, 0], [0.07, 0.15, -0.3], [0.2, -1, 0]],
  ['head-body', [0.0, 0.2, -0.3], [-0.8, 0.5, 0], [0.08, 0.02, -0.3], [-1, 0, 0]],
  ['diag', [-0.08, 0.02, -0.3], [-0.7, -0.7, 0], [0.08, 0.16, -0.3], [0.7, 0.7, 0]],
];
const palms = [[0, 0, -1], [0, 0, 1]];
for (let k = 0; k < 420; k++) {
  const a = arrangements[Math.floor(rnd() * arrangements.length)];
  const pl = poses2[Math.floor(rnd() * poses2.length)];
  const pr = poses2[Math.floor(rnd() * poses2.length)];
  const plm = palms[Math.floor(rnd() * 2)];
  const prm = palms[Math.floor(rnd() * 2)];
  const id = `2x.${a[0]}.${pl}.${pr}.${plm[2] > 0 ? 'l' : 'w'}${prm[2] > 0 ? 'l' : 'w'}`;
  if (out.some((o) => o.id === id)) continue;
  // Left hand uses mirrored palm handedness: keep palm vectors as given.
  out.push({ id, hands: [
    { hand: 'left', poseId: pl, wrist: a[1], fingersDir: n(a[2]), palmDir: plm },
    { hand: 'right', poseId: pr, wrist: a[3], fingersDir: n(a[4]), palmDir: prm },
  ] });
}
fs.writeFileSync(new URL('../targets/candidates-2.json', import.meta.url), JSON.stringify(out));
console.log(out.length);
