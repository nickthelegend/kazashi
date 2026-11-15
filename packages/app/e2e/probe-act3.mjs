// Probe: which light-frame offset makes the Act III giant spider big enough.
import { harness, reloadApp } from './lib.mjs';
import { SEAT } from './preroll.mjs';

export default async function run(ctx) {
  const frame = await reloadApp(ctx);
  const h = harness({ ...ctx, frame });
  await h.ensureSession('hand');
  await h.call('set_transform', { device: 'headset', ...SEAT });
  await h.waitFor('ready', () => h.k('k.ready'), 15000);
  const hp = (await h.call('get_transform', { device: 'headset' })).position;
  await h.call('set_hand_pose', { device: 'hand-left', poseId: 'flat' });
  await h.call('set_transform', { device: 'hand-left', anchor: 'wrist', position: { x: hp.x - 0.12, y: hp.y - 0.35, z: hp.z - 0.3 }, orientation: { fingers: [0.2, 0, -1], palm: [0, 1, 0] } });
  await h.waitFor('menu', async () => (await h.component('WristMenu')).open, 3000);
  await h.call('run_sequence', { device: 'hand-right', idleHand: 'keep', steps: [{ label: 'act3', target: 'Menu_act3', press: {} }] });
  await h.waitFor('act3', async () => (await h.component('Puzzle')).act === 3, 3000);
  const out = { target: (await h.component('Puzzle')).targetId, tries: [] };
  for (const z of [-0.12, -0.09, -0.06, 0, 0.06]) {
    await h.poseCreature('kumo', { offset: [0, 0, z] });
    await h.sleep(500);
    const p = await h.component('Puzzle');
    const s = await h.component('ShadowScale');
    out.tries.push({ z, score: p.score, sizeOk: p.sizeOk, state: p.state, size: s.size });
    if (p.state === 'inked') break;
  }
  return out;
}
