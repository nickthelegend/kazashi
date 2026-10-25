// 600-frame pose sweep: hands cycle through every authored pose while moving,
// creatures run on the wall. Reports CPU frame time (ECS + render submit),
// draw calls and triangles from the app's own probe. Desktop numbers.
import path from 'node:path';
import { harness, watchConsole } from './lib.mjs';

export default async function run(ctx) {
  const h = harness(ctx);
  const con = watchConsole(ctx.page);
  await h.waitFor('app booted', () => ctx.frame.evaluate(() => !!window.__kazashi), 20000);
  await h.ensureSession('hand');
  await h.call('set_transform', { device: 'headset', position: { x: 0, y: 1.05, z: -1.45 }, orientation: { pitch: -8, yaw: 0, roll: 0 } });
  await h.waitFor('ready', () => h.k('k.ready'), 15000);
  const all = await h.k('k.poses()');
  await ctx.frame.evaluate(() => window.__kazashiPerf.start(600));
  let i = 0;
  const t0 = Date.now();
  while ((await ctx.frame.evaluate(() => window.__kazashiPerf.count)) < 600 && Date.now() - t0 < 60000) {
    const id = all[i++ % all.length];
    await h.poseCreature(id, { offset: [Math.sin(i) * 0.03, Math.cos(i * 1.3) * 0.03, 0] });
    await h.sleep(120);
  }
  const result = await ctx.frame.evaluate(() => window.__kazashiPerf.result());
  con.stop();
  const gates = {
    frames: result.frames === 600,
    poses: i >= all.length && all.length === 25,
    cpu: Number.isFinite(result.cpuP95) && result.cpuP95 <= 4,
    calls: Number.isFinite(result.callsMax) && result.callsMax <= 60,
    triangles: Number.isFinite(result.trianglesMax) && result.trianglesMax <= 100000,
    console: con.errors.length === 0,
  };
  const out = { recordedAt: new Date().toISOString(), result, posesUsed: Math.min(i, all.length), gates, errors: con.errors, pass: Object.values(gates).every(Boolean) };
  h.writeJson(path.join(ctx.workspaceRoot, '.tmp/e2e/perf.json'), out);
  return out;
}
