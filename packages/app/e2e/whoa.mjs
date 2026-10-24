// The 20-second whoa, recorded from the managed browser (real app output):
// a hand rises over the lantern, its shadow shapes a dog and inks; the dog
// trots along the wall and leaps the corner; two hands make a heron that flies
// up the wall onto the ceiling. Run after preroll.mjs.
import path from 'node:path';
import { harness } from './lib.mjs';
import { SEAT } from './preroll.mjs';
import { captionPng, startRecording } from './record.mjs';

export default async function run(ctx) {
  const h = harness(ctx);
  const dir = path.join(ctx.workspaceRoot, '.tmp/rec-whoa');
  const marks = {};
  const head = (o, duration) => h.call('animate_to', { device: 'headset', position: SEAT.position, orientation: { ...SEAT.orientation, ...o }, duration, easing: 'minimum-jerk' });
  const rest = await h.call('get_hand_state', { device: 'hand-right' });
  await h.call('set_transform', { device: 'headset', ...SEAT });
  await h.restHand('hand-left');
  await h.restHand('hand-right');
  await h.sleep(800);
  const rec = await startRecording(ctx.cdp, dir);
  const at = async (t) => {
    const wait = t - rec.elapsed();
    if (wait > 0) await h.sleep(wait * 1000);
  };
  // 0–3 s: the hand rises into the lantern light.
  await at(0.6);
  const dog = await h.k('k.recipe("inu")');
  const near = await h.k('k.place([0.06, 0.02, -0.3], [-0.6, 0.6, 0], [0, 0, 1])');
  await h.call('set_hand_pose', { device: 'hand-right', poseId: 'default' });
  await h.call('animate_to', { device: 'hand-right', anchor: 'wrist', ...near, duration: 2.2, easing: 'minimum-jerk' });
  marks.handUp = rec.elapsed();
  // 3–9 s: fingers curl into a dog; the ring fills; the shadow inks.
  await at(2.9);
  const d = dog[0];
  await h.call('set_hand_pose', { device: 'hand-right', poseId: d.poseId, fingers: d.fingers, duration: 1.2 });
  await h.call('animate_to', { device: 'hand-right', anchor: 'wrist', position: d.position, orientation: d.orientation, duration: 0.8, easing: 'minimum-jerk' });
  await h.waitFor('dog inked', async () => (await h.component('Puzzle')).state === 'inked', 6000);
  marks.dogInked = rec.elapsed();
  // The hand drops away; the dog peels off and trots toward the corner. Follow it.
  await h.sleep(700);
  void h.call('animate_to', { device: 'hand-right', anchor: 'wrist', position: rest.anchors.wrist, duration: 1.4, easing: 'minimum-jerk' });
  await at(marks.dogInked + 1.6);
  void head({ yaw: 47 }, 2.4);
  await h.waitFor('dog jumped', async () => (await h.components('Creature')).some((c) => c.creatureId === 'inu' && c.jumps > 0), 9000).catch(() => null);
  marks.dogJumped = rec.elapsed();
  // 15–20 s: two hands make a heron; it flies up the wall onto the ceiling.
  await h.sleep(300);
  void head({ yaw: 0 }, 1.3);
  const heron = await h.k('k.recipe("sagi")');
  // IWER runs device commands one after another: shape both hands while they
  // are still in the lap (out of the light), then raise the wing, then the beak.
  for (const p of heron) await h.call('set_hand_pose', { device: p.device, poseId: p.poseId, fingers: p.fingers });
  for (const p of heron) await h.call('animate_to', { device: p.device, anchor: 'wrist', position: p.position, orientation: p.orientation, duration: 0.9, easing: 'minimum-jerk' });
  await h.waitFor('heron inked', async () => (await h.components('Creature')).some((c) => c.creatureId === 'sagi'), 6000);
  marks.heronInked = rec.elapsed();
  await h.sleep(600);
  void h.restHand('hand-left');
  void h.restHand('hand-right');
  void head({ pitch: 24 }, 3.2);
  await h.waitFor('heron on the ceiling', async () => (await h.components('Creature')).some((c) => c.creatureId === 'sagi' && c.jumps > 0), 9000).catch(() => null);
  marks.heronCeiling = rec.elapsed();
  await h.sleep(1800);
  const r = await rec.stop();
  const caps = path.join(dir, 'captions');
  (await import('node:fs')).mkdirSync(caps, { recursive: true });
  await captionPng(ctx.frame, 'Kazashi · IWER emulator, Quest 3 profile, synthetic living room · real app output, emulated hands', path.join(caps, 'top.png'), { width: 800, height: 40, sub: true });
  await captionPng(ctx.frame, 'your hands, your wall', path.join(caps, 'end.png'), { width: 520, height: 70 });
  const creatures = await h.components('Creature');
  return { recording: r, marks, creatures };
}
