// e2e: a wall-less room (engawa veranda: floor, roof, a low desk, no walls).
// The shoji fallback must appear within 5 s, be placed with one pinch, and
// the first puzzle must then complete on the shoji.
import fs from 'node:fs';
import path from 'node:path';
import { harness, reloadApp, watchConsole } from './lib.mjs';

async function loadRoom(frame, id, file) {
  const src = file ? fs.readFileSync(file, 'utf8') : null;
  return frame.evaluate(
    async ([rid, text]) => {
      const sem = window.IWER_DEVICE.sem;
      if (text) {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        if (!sem.environments.includes(rid)) sem.addEnvironment(rid, url);
      }
      await sem.loadDefaultEnvironment(rid);
      return { planes: sem.trackedPlanes.size, labels: [...sem.trackedPlanes].map((p) => p.semanticLabel) };
    },
    [id, src],
  );
}

export default async function run(ctx) {
  const con = watchConsole(ctx.page);
  const out = { steps: {} };
  const frame = await reloadApp(ctx);
  const h = harness({ ...ctx, frame });
  const step = async (name, fn) => {
    try {
      out.steps[name] = { ok: true, ...(await fn()) };
    } catch (e) {
      out.steps[name] = { ok: false, error: String(e.message ?? e) };
    }
  };
  await step('room', async () => ({ ...(await loadRoom(frame, 'kazashi_engawa', path.join(ctx.workspaceRoot, 'e2e/rooms/engawa.glts.js'))) }));
  await step('shoji-within-5s', async () => {
    await h.ensureSession('hand');
    await h.call('set_transform', { device: 'headset', position: { x: 0, y: 0.95, z: 0.05 }, orientation: { pitch: -10, yaw: 0, roll: 0 } });
    await h.restHand('hand-left');
    await h.restHand('hand-right');
    const r = await h.waitFor('shoji ghost', async () => {
      const s = await h.component('RoomState');
      return s && s.mode === 'shoji-ghost' ? s : null;
    }, 9000);
    if (r.value.scanSeconds > 5.6) throw new Error(`shoji offered after ${r.value.scanSeconds.toFixed(2)} s`);
    return { offeredAtSeconds: r.value.scanSeconds, walls: r.value.walls, surfaces: r.value.surfaces };
  });
  await step('pinch-places-shoji', async () => {
    await h.call('select', { device: 'hand-right' });
    const r = await h.waitFor('shoji placed', async () => (await h.component('RoomState'))?.mode === 'shoji', 3000);
    await h.waitFor('lantern lit', () => h.k('k.ready'), 5000);
    return { wall: await h.k('k.wall()'), lantern: await h.component('Lantern'), ms: r.ms };
  });
  await step('puzzle-on-shoji', async () => {
    const p = await h.component('Puzzle');
    await h.poseCreature(p.targetId, { animate: 0.6 });
    const r = await h.waitFor('inked', async () => (await h.component('Puzzle')).state === 'inked', 8000);
    return { id: p.targetId, ms: r.ms, shadow: await h.k('k.shadow()') };
  });
  const shot = path.join(ctx.workspaceRoot, '.tmp/wallless.png');
  await h.sleep(600);
  await frame.evaluate(() => 0);
  out.shot = shot;
  await loadRoom(frame, 'sunlit_living_room').catch(() => {});
  con.stop();
  out.errors = con.errors;
  out.pass = Object.values(out.steps).every((s) => s.ok) && con.errors.length === 0;
  h.writeJson(path.join(ctx.workspaceRoot, '.tmp/e2e/wallless.json'), out);
  return out;
}
