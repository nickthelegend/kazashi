// e2e, Quest 3 hands profile, sunlit_living_room. Cold load → act 1 complete
// with hands only, lantern move rescales the shadow, poke hint, palm-up menu,
// theatre (drop a cast slide, curtain-record a take), reload → take restored.
// Run: iwsdk browser run e2e/quest.mjs --timeout 600000
import path from 'node:path';
import { harness, reloadApp, watchConsole } from './lib.mjs';

export default async function run(ctx) {
  const h = harness(ctx);
  const { call, note } = h;
  const con = watchConsole(ctx.page);
  const out = { steps: {}, handActions: 0, errors: [] };
  const step = async (name, fn) => {
    const t0 = Date.now();
    try {
      out.steps[name] = { ok: true, ...(await fn()), ms: Date.now() - t0 };
    } catch (e) {
      out.steps[name] = { ok: false, error: String(e.message ?? e), ms: Date.now() - t0 };
    }
    note(`${name}: ${out.steps[name].ok ? 'PASS' : 'FAIL ' + out.steps[name].error}`);
  };

  // Cold load: forget progress and takes, reload.
  await ctx.frame.evaluate(async () => {
    localStorage.clear();
    await new Promise((r) => {
      const req = indexedDB.deleteDatabase('kazashi');
      req.onsuccess = req.onerror = req.onblocked = () => r();
    });
  });
  const frame = await reloadApp(ctx);
  const hh = harness({ ...ctx, frame });
  const coldStart = Date.now();

  await step('enter', async () => {
    await hh.waitFor('app booted', () => hh.frame.evaluate(() => !!window.__kazashi), 20000);
    await hh.ensureSession('hand');
    await hh.call('set_transform', { device: 'headset', position: { x: 0, y: 1.05, z: -1.45 }, orientation: { pitch: -8, yaw: 0, roll: 0 } });
    const r = await hh.waitFor('lantern lit + wall', () => hh.k('k.ready'), 15000);
    const wall = await hh.k('k.wall()');
    const lantern = await hh.component('Lantern');
    return { wall, lantern, readyMs: r.ms };
  });

  await step('act1', async () => {
    const inked = [];
    for (let guard = 0; guard < 8; guard++) {
      const p = await hh.component('Puzzle');
      if (p.act !== 1 && p.mode !== 'onboarding') break;
      if (p.mode === 'act' && p.act === 1 && p.index >= 5) break;
      const id = p.targetId;
      const t0 = Date.now();
      await hh.poseCreature(id, { animate: 0.6 });
      out.handActions++;
      await hh.waitFor(`inked ${id}`, async () => (await hh.component('Puzzle')).state === 'inked', 8000);
      inked.push({ id, ms: Date.now() - t0 });
      // Auto-advance to the next card (no input needed).
      await hh.waitFor('next card', async () => {
        const q = await hh.component('Puzzle');
        return q.targetId !== id || q.act !== 1;
      }, 8000);
    }
    const p = await hh.component('Puzzle');
    if (p.act !== 2) throw new Error(`expected act 2 after act 1, got act ${p.act} (${p.mode})`);
    return { inked, seconds: (Date.now() - coldStart) / 1000, handActions: out.handActions };
  });

  await step('lantern-move', async () => {
    // Hold a one-hand pose so there is a shadow to measure.
    const p = await hh.component('Puzzle');
    await hh.poseCreature('inu', {});
    await hh.sleep(400);
    const before = await hh.component('ShadowScale');
    const light = await hh.k('k.light()');
    const wall = await hh.k('k.wall()');
    // Pinch-grab the lantern body and carry it 20 cm toward the wall.
    const n = wall.normal;
    const to = { x: light[0] - n[0] * 0.2, y: light[1], z: light[2] - n[2] * 0.2 };
    const seq = await hh.call('run_sequence', {
      device: 'hand-left',
      idleHand: 'keep',
      steps: [
        { label: 'grab', position: { x: light[0], y: light[1], z: light[2] }, pinch: { value: 1, at: 'arrival' } },
        { label: 'carry', position: to, duration: 0.8 },
        { label: 'release', pinch: 0, duration: 0.2 },
        { label: 'away', position: { relativeTo: 'body', x: -0.25, y: 0.7, z: 0.1 } },
      ],
    });
    out.handActions += 1;
    await hh.poseCreature('inu', {});
    await hh.sleep(500);
    const after = await hh.component('ShadowScale');
    const light2 = await hh.k('k.light()');
    const moved = Math.hypot(light2[0] - light[0], light2[2] - light[2]);
    if (moved < 0.1) throw new Error(`lantern moved only ${moved.toFixed(3)} m (grab events: ${JSON.stringify(seq.events ?? seq.selectEvents ?? []).slice(0, 200)})`);
    if (Math.abs(after.size - before.size) < 0.02) throw new Error(`shadow size unchanged: ${before.size} → ${after.size}`);
    return { before: before.size, after: after.size, wallDistance: [before.wallDistance, after.wallDistance], moved, puzzle: p.targetId };
  });

  await step('hint-poke', async () => {
    const before = (await hh.component('Puzzle')).hintShown;
    await hh.call('run_sequence', { device: 'hand-right', steps: [{ label: 'poke hint', target: 'Tab_Hint', press: {} }, { label: 'back', position: { relativeTo: 'body', x: 0.25, y: 0.75, z: 0.05 } }] });
    out.handActions++;
    const after = await hh.waitFor('hint toggled', async () => (await hh.component('Puzzle')).hintShown !== before, 3000);
    return { before, after: !before, ms: after.ms };
  });

  await step('palm-up-menu', async () => {
    const head = await hh.call('get_transform', { device: 'headset' });
    const hp = head.position ?? head;
    await hh.call('set_hand_pose', { device: 'hand-left', poseId: 'flat' });
    await hh.call('set_transform', { device: 'hand-left', anchor: 'wrist', position: { x: hp.x - 0.12, y: hp.y - 0.35, z: hp.z - 0.3 }, orientation: { fingers: [0.2, 0, -1], palm: [0, 1, 0] } });
    out.handActions++;
    const r = await hh.waitFor('menu open', async () => (await hh.component('WristMenu')).open, 3000);
    return { ms: r.ms };
  });

  await step('theatre', async () => {
    // Menu is open: poke the theatre tab with the right index finger.
    await hh.call('run_sequence', { device: 'hand-right', idleHand: 'keep', steps: [{ label: 'theatre', target: 'Menu_theatre', press: {} }] });
    out.handActions++;
    await hh.waitFor('theatre mode', async () => (await hh.component('Puzzle')).mode === 'theatre', 3000);
    await hh.restHand('hand-left');
    await hh.waitFor('menu closed', async () => !(await hh.component('WristMenu')).open, 3000);
    // Carry a cast slide in front of the lantern and let go: it lands on the wall.
    const light = await hh.k('k.light()');
    const wall = await hh.k('k.wall()');
    const n = wall.normal;
    const drop = { x: light[0] - n[0] * 0.25, y: light[1] + 0.12, z: light[2] - n[2] * 0.25 };
    const cards = await hh.call('list_targets', {});
    const card = (cards.targets ?? cards).find((t) => String(t.name).startsWith('CastCard_'));
    if (!card) throw new Error('no cast card target');
    await hh.call('run_sequence', {
      device: 'hand-right',
      steps: [
        { label: 'pinch slide', target: card.name, pinch: { value: 1, at: 'arrival' } },
        { label: 'carry', position: drop, duration: 0.8 },
        { label: 'drop', pinch: 0, duration: 0.2 },
        { label: 'away', position: { relativeTo: 'body', x: 0.25, y: 0.7, z: 0.1 } },
      ],
    });
    out.handActions++;
    await hh.waitFor('creature on stage', async () => (await hh.component('Theatre')).onStage >= 1, 4000);
    // Curtain: hands apart (palms facing), then together.
    const head = await hh.call('get_transform', { device: 'headset' });
    const hp = head.position ?? head;
    const curtain = async () => {
      for (const [d, x, palm] of [['hand-left', -0.32, [1, 0, 0]], ['hand-right', 0.32, [-1, 0, 0]]]) {
        await hh.call('set_hand_pose', { device: d, poseId: 'flat' });
        await hh.call('set_transform', { device: d, anchor: 'wrist', position: { x: hp.x + x, y: hp.y - 0.25, z: hp.z - 0.35 }, orientation: { fingers: [0, 1, -0.3], palm } });
      }
      await hh.sleep(250);
      await Promise.all(
        [['hand-left', -0.05, [1, 0, 0]], ['hand-right', 0.05, [-1, 0, 0]]].map(([d, x, palm]) =>
          hh.call('animate_to', { device: d, anchor: 'wrist', position: { x: hp.x + x, y: hp.y - 0.25, z: hp.z - 0.35 }, orientation: { fingers: [0, 1, -0.3], palm }, duration: 0.5 }),
        ),
      );
      await hh.sleep(300);
    };
    await curtain();
    out.handActions++;
    await hh.waitFor('recording', async () => (await hh.component('Theatre')).recording, 3000);
    await hh.poseCreature('inu', { animate: 0.8 });
    await hh.sleep(2500);
    await hh.sleep(1300); // gesture cooldown
    await curtain();
    out.handActions++;
    const t = await hh.waitFor('take saved', async () => {
      const th = await hh.component('Theatre');
      return !th.recording && th.takes >= 1 ? th : null;
    }, 5000);
    return { theatre: t.value };
  });

  await step('reload-restores-take', async () => {
    const before = await hh.component('Theatre');
    const f2 = await reloadApp({ ...ctx, frame: hh.frame });
    const h2 = harness({ ...ctx, frame: f2 });
    await h2.ensureSession('hand');
    const after = await h2.waitFor('takes listed', async () => {
      const th = await h2.component('Theatre');
      return th && th.takes >= 1 ? th : null;
    }, 8000);
    if (after.value.lastTakeId !== before.lastTakeId) throw new Error(`take id ${after.value.lastTakeId} != ${before.lastTakeId}`);
    return { takes: after.value.takes, lastTakeId: after.value.lastTakeId };
  });

  con.stop();
  out.errors = con.errors;
  out.log = h.log.concat(hh.log);
  out.pass = Object.values(out.steps).every((s) => s.ok) && con.errors.length === 0;
  h.writeJson(path.join(ctx.workspaceRoot, '.tmp/e2e/quest.json'), out);
  return out;
}
