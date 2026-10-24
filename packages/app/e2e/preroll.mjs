// Pre-roll for the whoa clip (not recorded): a cold start, then play act 1
// and the heron with emulated hands so the dog and the heron are in the cast,
// then switch to Free shadows from the wrist menu.
import { harness, reloadApp } from './lib.mjs';

export const SEAT = { position: { x: 0, y: 1.08, z: -1.32 }, orientation: { pitch: -16, yaw: 0, roll: 0 } };

export default async function run(ctx) {
  await ctx.frame.evaluate(async () => {
    localStorage.clear();
    await new Promise((r) => {
      const req = indexedDB.deleteDatabase('kazashi');
      req.onsuccess = req.onerror = req.onblocked = () => r();
    });
  });
  const frame = await reloadApp(ctx);
  const h = harness({ ...ctx, frame });
  await h.ensureSession('hand');
  await h.call('set_transform', { device: 'headset', ...SEAT });
  await h.waitFor('ready', () => h.k('k.ready'), 15000);
  const inked = [];
  for (let guard = 0; guard < 8; guard++) {
    const p = await h.component('Puzzle');
    if (p.act === 2 && p.targetId !== 'sagi') break;
    await h.poseCreature(p.targetId, {});
    await h.waitFor(`inked ${p.targetId}`, async () => (await h.component('Puzzle')).state === 'inked', 8000);
    inked.push(p.targetId);
    if (p.targetId === 'sagi') break;
    await h.waitFor('next card', async () => (await h.component('Puzzle')).targetId !== p.targetId, 8000);
  }
  // Free shadows from the wrist menu.
  const head = await h.call('get_transform', { device: 'headset' });
  const hp = head.position;
  await h.call('set_hand_pose', { device: 'hand-left', poseId: 'flat' });
  await h.call('set_transform', { device: 'hand-left', anchor: 'wrist', position: { x: hp.x - 0.12, y: hp.y - 0.35, z: hp.z - 0.3 }, orientation: { fingers: [0.2, 0, -1], palm: [0, 1, 0] } });
  await h.waitFor('menu', async () => (await h.component('WristMenu')).open, 3000);
  await h.call('run_sequence', { device: 'hand-right', idleHand: 'keep', steps: [{ label: 'free', target: 'Menu_free', press: {} }] });
  await h.waitFor('free mode', async () => (await h.component('Puzzle')).mode === 'free', 3000);
  await h.restHand('hand-left');
  await h.restHand('hand-right');
  await h.call('set_transform', { device: 'headset', ...SEAT });
  await h.sleep(2500);
  return { inked, cast: (await h.k('k.progress()')).cast };
}
