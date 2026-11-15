// Rasterises every body plan (rest pose and two moments of its gait) into one
// PNG contact sheet, so silhouettes can be judged without a browser:
//   npx vite-node scripts/preview-bodies.ts -- out.png
import fs from 'node:fs';
import zlib from 'node:zlib';
import { BodyAnimator, poseVertices } from '../src/body.js';
import { BODY_IDS, bodyPlan } from '../src/creatures.js';

const CELL = 220;
const COLS = 3;
const out = process.argv.at(-1)!.endsWith('.png') ? process.argv.at(-1)! : 'bodies.png';
const ids = BODY_IDS;
const W = CELL * COLS * 3;
const rowsPerPage = Math.ceil(ids.length / COLS);
const H = CELL * rowsPerPage;
const img = new Uint8Array(W * H * 3).fill(236);

function tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, col: number) {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
  const e = (x0: number, y0: number, x1: number, y1: number, x: number, y: number) => (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0);
  const area = e(ax, ay, bx, by, cx, cy);
  if (Math.abs(area) < 1e-9) return;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = e(bx, by, cx, cy, px, py) / area;
      const w1 = e(cx, cy, ax, ay, px, py) / area;
      const w2 = e(ax, ay, bx, by, px, py) / area;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) img.fill(col, (y * W + x) * 3, (y * W + x) * 3 + 3);
    }
}

ids.forEach((id, n) => {
  const plan = bodyPlan(id);
  const anim = new BodyAnimator(plan);
  const pos = new Float32Array(plan.positions.length);
  for (let k = 0; k < 3; k++) {
    // k = 0 rest, then two moments a quarter cycle apart while moving.
    if (k > 0) for (let s = 0; s < 12 + k * 6; s++) anim.step(1 / 30, anim.cycle / 24);
    const tr = k === 0 ? new BodyAnimator(plan).step(0, 0) : anim.transforms;
    poseVertices(plan, tr, k === 0 ? 0 : anim.lift, pos);
    const cx = ((n % COLS) * 3 + k) * CELL + CELL / 2;
    const cy = Math.floor(n / COLS) * CELL + CELL / 2;
    const s = CELL / 2.1;
    const X = (x: number) => cx + x * s;
    const Y = (y: number) => cy - y * s;
    // ground line
    const gy = Math.round(Y(plan.groundY));
    if (plan.gait !== 'fly' && plan.gait !== 'swim') for (let x = cx - CELL / 2 + 6; x < cx + CELL / 2 - 6; x++) img.fill(170, (gy * W + x) * 3, (gy * W + x) * 3 + 3);
    const I = plan.indices;
    for (let i = 0; i < I.length; i += 3) tri(X(pos[I[i] * 2]), Y(pos[I[i] * 2 + 1]), X(pos[I[i + 1] * 2]), Y(pos[I[i + 1] * 2 + 1]), X(pos[I[i + 2] * 2]), Y(pos[I[i + 2] * 2 + 1]), 18);
    // eye hole
    const e = plan.eye;
    if (e.r > 0) {
      const [ex, ey] = [e.x, e.y];
      const t = tr;
      const o = e.bone * 6;
      const wx = t[o] * ex + t[o + 1] * ey + t[o + 2];
      const wy = t[o + 3] * ex + t[o + 4] * ey + t[o + 5] + (k === 0 ? 0 : anim.lift);
      const r = e.r * s;
      for (let y = Math.floor(Y(wy) - r); y <= Y(wy) + r; y++)
        for (let x = Math.floor(X(wx) - r); x <= X(wx) + r; x++) if ((x - X(wx)) ** 2 + (y - Y(wy)) ** 2 <= r * r) img.fill(236, (y * W + x) * 3, (y * W + x) * 3 + 3);
    }
  }
});

// Minimal PNG (RGB, no filter).
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${ids.length} plans → ${out} (${W}×${H})`);
