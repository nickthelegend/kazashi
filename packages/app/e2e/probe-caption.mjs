// Probe: replay the latest take and measure the narration caption and the card.
import { harness } from './lib.mjs';
import { SEAT } from './preroll.mjs';
export default async function run(ctx) {
  const h = harness(ctx);
  await ctx.frame.evaluate(() => window.IWER_MCP.dispatch('reload_page', {})).catch(() => {});
  await h.sleep(4000);
  const { appFrame } = await import('./lib.mjs');
  const f = appFrame(ctx.page);
  const hh = harness({ ...ctx, frame: f });
  await hh.waitFor('hook', () => f.evaluate(() => !!window.__kazashi), 20000);
  await hh.ensureSession('hand');
  await hh.call('set_transform', { device: 'headset', ...SEAT, orientation: { ...SEAT.orientation, pitch: 4 } });
  await hh.waitFor('ready', () => hh.k('k.ready'), 15000);
  const card = await hh.k('k.inspect("TargetCard")');
  const hp = (await hh.call('get_transform', { device: 'headset' })).position;
  await hh.call('set_hand_pose', { device: 'hand-left', poseId: 'flat' });
  await hh.call('set_transform', { device: 'hand-left', anchor: 'wrist', position: { x: hp.x - 0.12, y: hp.y - 0.35, z: hp.z - 0.3 }, orientation: { fingers: [0.2, 0, -1], palm: [0, 1, 0] } });
  await hh.waitFor('menu', async () => (await hh.component('WristMenu')).open, 3000);
  const menu = await hh.k('k.inspect("Menu_act1")');
  await hh.call('run_sequence', { device: 'hand-right', idleHand: 'keep', steps: [{ label: 'play', target: 'Menu_play', press: {} }] });
  await hh.restHand('hand-left');
  await hh.restHand('hand-right');
  await hh.waitFor('caption', async () => (await hh.component('Theatre')).captionLine >= 0, 6000).catch(() => null);
  await hh.sleep(300);
  const caption = await hh.k('k.inspect("NarrationCaption")');
  const { data } = await ctx.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  (await import('node:fs')).writeFileSync(ctx.workspaceRoot + '/.tmp/probe-caption.jpg', Buffer.from(data, 'base64'));
  return { card, menu, caption, theatre: await hh.component('Theatre'), wall: await hh.k('k.wall()') };
}
