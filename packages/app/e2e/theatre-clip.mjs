// Clip: the theatre. Cast slides are pinched and projected onto the wall, the
// curtain gesture records a take while a hand performs, then the take replays.
import path from 'node:path';
import { harness } from './lib.mjs';
import { SEAT as BASE } from './preroll.mjs';

const SEAT = { ...BASE, orientation: { ...BASE.orientation, pitch: -9 } };
import { startRecording } from './record.mjs';

export default async function run(ctx) {
  const h = harness(ctx);
  const marks = {};
  await h.ensureSession('hand');
  await h.call('set_transform', { device: 'headset', ...SEAT });
  await h.waitFor('ready', () => h.k('k.ready'), 15000);
  const palmUp = async () => {
    const hp = (await h.call('get_transform', { device: 'headset' })).position;
    await h.call('set_hand_pose', { device: 'hand-left', poseId: 'flat' });
    await h.call('set_transform', { device: 'hand-left', anchor: 'wrist', position: { x: hp.x - 0.12, y: hp.y - 0.35, z: hp.z - 0.3 }, orientation: { fingers: [0.2, 0, -1], palm: [0, 1, 0] } });
    await h.waitFor('menu', async () => (await h.component('WristMenu')).open, 3000);
  };
  await h.restHand('hand-right');
  await palmUp();
  await h.call('run_sequence', { device: 'hand-right', idleHand: 'keep', steps: [{ label: 'theatre', target: 'Menu_theatre', press: {} }] });
  await h.waitFor('theatre', async () => (await h.component('Puzzle')).mode === 'theatre', 3000);
  await h.restHand('hand-left');
  await h.restHand('hand-right');
  await h.call('set_transform', { device: 'headset', ...SEAT });
  await h.sleep(1200);
  await h.call('set_transform', { device: 'headset', ...SEAT });
  const rec = await startRecording(ctx.cdp, path.join(ctx.workspaceRoot, '.tmp/rec-theatre'));
  const light = await h.k('k.light()');
  const wall = await h.k('k.wall()');
  const n = wall.normal;
  const drop = (dx, dy) => ({ x: light[0] - n[0] * 0.26 + dx, y: light[1] + 0.05 + dy, z: light[2] - n[2] * 0.26 });
  for (const [card, dx, dy] of [['CastCard_inu', -0.06, 0.0], ['CastCard_sagi', 0.07, 0.05]]) {
    await h.call('run_sequence', {
      device: 'hand-right',
      gaze: 'fixed',
      steps: [
        { label: `pinch ${card}`, target: card, pinch: { value: 1, at: 'arrival' } },
        { label: 'project', position: drop(dx, dy), duration: 0.9 },
        { label: 'let go', pinch: 0, duration: 0.2 },
        { label: 'away', position: { relativeTo: 'body', x: 0.25, y: 0.7, z: 0.1 }, duration: 0.6 },
      ],
    });
  }
  marks.onStage = rec.elapsed();
  const hp = (await h.call('get_transform', { device: 'headset' })).position;
  const curtain = async () => {
    for (const [d, x, palm] of [['hand-left', -0.32, [1, 0, 0]], ['hand-right', 0.32, [-1, 0, 0]]]) {
      await h.call('set_hand_pose', { device: d, poseId: 'flat' });
      await h.call('animate_to', { device: d, anchor: 'wrist', position: { x: hp.x + x, y: hp.y - 0.22, z: hp.z - 0.35 }, orientation: { fingers: [0, 1, -0.3], palm }, duration: 0.45 });
    }
    for (const [d, x, palm] of [['hand-left', -0.05, [1, 0, 0]], ['hand-right', 0.05, [-1, 0, 0]]]) {
      await h.call('animate_to', { device: d, anchor: 'wrist', position: { x: hp.x + x, y: hp.y - 0.22, z: hp.z - 0.35 }, orientation: { fingers: [0, 1, -0.3], palm }, duration: 0.35 });
    }
    await h.sleep(250);
  };
  await curtain();
  await h.waitFor('recording', async () => (await h.component('Theatre')).recording, 3000);
  marks.recording = rec.elapsed();
  await h.restHand('hand-left');
  // Perform: a rabbit hops in front of the cast, moving across the lantern light.
  const r1 = await h.k('k.recipe("usagi", [-0.06, 0, 0])');
  const r2 = await h.k('k.recipe("usagi", [0.08, 0.03, 0])');
  await h.call('set_hand_pose', { device: 'hand-right', poseId: r1[0].poseId });
  await h.call('animate_to', { device: 'hand-right', anchor: 'wrist', position: r1[0].position, orientation: r1[0].orientation, duration: 0.8 });
  await h.call('animate_to', { device: 'hand-right', anchor: 'wrist', position: r2[0].position, orientation: r2[0].orientation, duration: 2.2, easing: 'minimum-jerk' });
  await h.call('animate_to', { device: 'hand-right', anchor: 'wrist', position: r1[0].position, orientation: r1[0].orientation, duration: 1.8, easing: 'minimum-jerk' });
  await h.sleep(800);
  await curtain();
  await h.waitFor('saved', async () => {
    const t = await h.component('Theatre');
    return !t.recording && t.takes >= 1;
  }, 5000);
  marks.saved = rec.elapsed();
  await h.restHand('hand-right');
  await palmUp();
  await h.call('run_sequence', { device: 'hand-right', idleHand: 'keep', gaze: 'fixed', body: 'fixed', steps: [{ label: 'play', target: 'Menu_play', press: {} }] });
  await h.call('set_transform', { device: 'headset', ...SEAT });
  await h.restHand('hand-left');
  await h.restHand('hand-right');
  await h.waitFor('replaying', async () => (await h.component('Theatre')).replaying, 3000);
  marks.replay = rec.elapsed();
  await h.waitFor('replay done', async () => !(await h.component('Theatre')).replaying, 25000);
  marks.replayDone = rec.elapsed();
  await h.sleep(600);
  const r = await rec.stop();
  return { recording: r, marks, theatre: await h.component('Theatre') };
}
