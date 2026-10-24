// Clip: a room with no wall (engawa veranda). The shoji screen is offered
// after 5 s, placed with a pinch, and the first shadow inks on it.
import fs from 'node:fs';
import path from 'node:path';
import { harness, reloadApp } from './lib.mjs';
import { startRecording } from './record.mjs';

export default async function run(ctx) {
  const frame = await reloadApp(ctx);
  const h = harness({ ...ctx, frame });
  const src = fs.readFileSync(path.join(ctx.workspaceRoot, 'e2e/rooms/engawa.glts.js'), 'utf8');
  await frame.evaluate(async (text) => {
    const sem = window.IWER_DEVICE.sem;
    if (!sem.environments.includes('kazashi_engawa')) sem.addEnvironment('kazashi_engawa', URL.createObjectURL(new Blob([text], { type: 'text/javascript' })));
    await sem.loadDefaultEnvironment('kazashi_engawa');
  }, src);
  await h.ensureSession('hand');
  const seat = { position: { x: 0, y: 0.95, z: 0.05 }, orientation: { pitch: -6, yaw: 0, roll: 0 } };
  await h.call('set_transform', { device: 'headset', ...seat });
  await h.restHand('hand-left');
  await h.restHand('hand-right');
  const rec = await startRecording(ctx.cdp, path.join(ctx.workspaceRoot, '.tmp/rec-shoji'));
  const marks = {};
  const g = await h.waitFor('shoji ghost', async () => (await h.component('RoomState'))?.mode === 'shoji-ghost', 9000);
  marks.ghost = rec.elapsed();
  await h.sleep(1600);
  await h.call('select', { device: 'hand-right' });
  await h.waitFor('shoji', async () => (await h.component('RoomState'))?.mode === 'shoji', 3000);
  marks.placed = rec.elapsed();
  await h.waitFor('lit', () => h.k('k.ready'), 5000);
  await h.sleep(1200);
  const p = await h.component('Puzzle');
  const r = await h.k(`k.recipe(${JSON.stringify(p.targetId)})`);
  await h.call('set_hand_pose', { device: 'hand-right', poseId: r[0].poseId, fingers: r[0].fingers });
  await h.call('animate_to', { device: 'hand-right', anchor: 'wrist', position: r[0].position, orientation: r[0].orientation, duration: 1.4, easing: 'minimum-jerk' });
  await h.waitFor('inked', async () => (await h.component('Puzzle')).state === 'inked', 8000);
  marks.inked = rec.elapsed();
  await h.sleep(700);
  await h.restHand('hand-right');
  await h.sleep(9500);
  const out = await rec.stop();
  await frame.evaluate(() => window.IWER_DEVICE.sem.loadDefaultEnvironment('sunlit_living_room')).catch(() => {});
  return { recording: out, marks, target: p.targetId, ghostAfterMs: g.ms };
}
