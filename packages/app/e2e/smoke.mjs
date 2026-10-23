// Quick look: seated at the coffee table, one flat hand over the lantern.
import path from 'node:path';
import { harness, watchConsole } from './lib.mjs';

export default async function run(ctx) {
  const h = harness(ctx);
  const con = watchConsole(ctx.page);
  await h.waitFor('app booted', () => ctx.frame.evaluate(() => !!window.__kazashi), 20000);
  await h.ensureSession('hand');
  await h.call('set_transform', { device: 'headset', position: { x: 0, y: 1.05, z: -1.45 }, orientation: { pitch: -10, yaw: 0, roll: 0 } });
  const ready = await h.waitFor('ready', () => h.k('k.ready'), 15000).catch((e) => ({ error: e.message }));
  const surfaces = await h.k('k.surfaces()');
  const wall = await h.k('k.wall()');
  const light = await h.k('k.light()');
  const pl = await h.k('k.place([0.05, 0.1, -0.3], [-0.5, 0.85, 0], [0, 0, -1])');
  await h.call('set_hand_pose', { device: 'hand-right', poseId: 'open' });
  await h.call('set_transform', { device: 'hand-right', anchor: 'wrist', ...pl });
  await h.restHand('hand-left');
  await h.sleep(1500);
  const shadow = await h.k('k.shadow()');
  const room = await h.component('RoomState');
  const lantern = await h.component('Lantern');
  const shot = path.join(ctx.workspaceRoot, '.tmp/smoke.png');
  await ctx.page.screenshot({ path: shot });
  con.stop();
  return { ready, room, lantern, wall, light, surfaces: surfaces.map((s) => `${s.kind}:${s.origin.map((v) => v.toFixed(2))}`), shadow, errors: con.errors.slice(0, 10), shot };
}
