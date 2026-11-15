// Film footage, Meta VR Glasses profile: the card and gaze buttons inside the
// narrow view; gaze + pinch turns the card; a shadow inks. Real app output.
import fs from 'node:fs';
import path from 'node:path';
import { harness, reloadApp, watchConsole } from './lib.mjs';
import { startRecording } from './record.mjs';

export default async function run(ctx) {
  const dir = path.join(ctx.workspaceRoot, '.tmp/film-glasses');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const frame = await reloadApp(ctx);
  const con = watchConsole(ctx.page);
  const h = harness({ ...ctx, frame });
  const marks = {};
  const out = { marks };
  await h.ensureSession('hand');
  await h.call('set_transform', { device: 'headset', position: { x: 0, y: 1.05, z: -1.45 }, orientation: { pitch: -12, yaw: 0, roll: 0 } });
  await h.waitFor('ready', () => h.k('k.ready'), 15000);
  await h.waitFor('glasses layout', async () => (await h.component('WristMenu')).glasses, 4000);
  await h.restHand('hand-left');
  await h.restHand('hand-right');
  await h.sleep(1500);
  const rec = await startRecording(ctx.cdp, path.join(dir, 'frames'));
  const mark = (k) => (marks[k] = Math.round(rec.elapsed() * 100) / 100);
  const audio = await h.k('k.audio.start()');
  const audioAt = rec.elapsed();
  try {
    mark('start');
    await h.sleep(2500);
    const targets = await h.call('list_targets', {});
    const t = (targets.targets ?? targets).find((x) => x.name === 'Glasses_next');
    const before = await h.component('Puzzle');
    await h.call('look_at', { device: 'gaze', target: t.center ?? t.position });
    await h.sleep(900);
    mark('gaze');
    await h.call('select', { device: 'hand-right' });
    await h.waitFor('next', async () => (await h.component('Puzzle')).targetId !== before.targetId, 3000);
    mark('next');
    await h.sleep(1800);
    const p = await h.component('Puzzle');
    const placed = await h.k(`k.recipe(${JSON.stringify(p.targetId)})`);
    for (const q of placed) await h.call('set_hand_pose', { device: q.device, poseId: q.poseId, fingers: q.fingers, duration: 0.8 });
    for (const q of placed) await h.call('animate_to', { device: q.device, anchor: 'wrist', position: q.position, orientation: q.orientation, duration: 1.4, easing: 'minimum-jerk' });
    await h.waitFor('inked', async () => (await h.component('Puzzle')).state === 'inked', 8000);
    mark('inked');
    await h.sleep(500);
    await h.restHand('hand-left');
    await h.restHand('hand-right');
    await h.sleep(4000);
    mark('end');
    out.target = p.targetId;
  } catch (e) {
    out.error = String(e.stack || e);
  } finally {
    out.recording = await rec.stop();
    if (audio) {
      const b64 = await h.k('k.audio.stop()').catch(() => '');
      if (b64) fs.writeFileSync(path.join(dir, 'audio.webm'), Buffer.from(b64, 'base64'));
      out.audio = { bytes: b64 ? Math.round((b64.length * 3) / 4) : 0, startsAt: Math.round(audioAt * 100) / 100 };
    }
    con.stop();
  }
  out.consoleErrors = con.errors;
  h.writeJson(path.join(dir, 'marks.json'), out);
  return out;
}
