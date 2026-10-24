// e2e, Meta VR Glasses profile (gaze + hands, narrow FoV). Requires
// dev.emulator.device = "metaVRGlasses". Completes the first act-1 puzzle with
// emulated hands, presses lantern tabs with gaze + pinch, turns on the
// glasses layout from the wrist menu with gaze + pinch, then checks that the
// target card and the match ring sit inside the glasses' view.
import path from 'node:path';
import { harness, watchConsole } from './lib.mjs';

const H = 37; // degrees left/right
const UP = 25;
const DOWN = 43;

function angles(head, q, p) {
  // Headset-relative angles of world point p (q: headset quaternion).
  const d = { x: p.x - head.x, y: p.y - head.y, z: p.z - head.z };
  // Rotate d by inverse quaternion.
  const { x, y, z, w } = q;
  const ix = w * d.x - y * d.z + z * d.y;
  const iy = w * d.y - z * d.x + x * d.z;
  const iz = w * d.z - x * d.y + y * d.x;
  const iw = x * d.x + y * d.y + z * d.z;
  const rx = ix * w + iw * x - iy * z + iz * y;
  const ry = iy * w + iw * y - iz * x + ix * z;
  const rz = iz * w + iw * z - ix * y + iy * x;
  return { h: (Math.atan2(rx, -rz) * 180) / Math.PI, v: (Math.atan2(ry, -rz) * 180) / Math.PI };
}

export default async function run(ctx) {
  const h = harness(ctx);
  const con = watchConsole(ctx.page);
  const out = { steps: {} };
  const step = async (name, fn) => {
    try {
      out.steps[name] = { ok: true, ...(await fn()) };
    } catch (e) {
      out.steps[name] = { ok: false, error: String(e.message ?? e) };
    }
  };
  await step('profile', async () => {
    await h.waitFor('app booted', () => ctx.frame.evaluate(() => !!window.__kazashi), 20000);
    await h.ensureSession('hand');
    const st = await h.call('get_session_status', {});
    const dev = await h.call('get_device_state', {});
    if (!String(st.deviceName ?? dev.deviceName ?? '').includes('Glasses')) throw new Error(`device is ${st.deviceName}`);
    await h.call('set_transform', { device: 'headset', position: { x: 0, y: 1.05, z: -1.45 }, orientation: { pitch: -12, yaw: 0, roll: 0 } });
    await h.waitFor('lantern lit + wall', () => h.k('k.ready'), 15000);
    return { device: st.deviceName, features: st.enabledFeatures, gaze: !!dev.gaze };
  });
  await step('glasses-layout-auto', async () => {
    const m = await h.waitFor('glasses layout', async () => (await h.component('WristMenu')).glasses, 3000);
    return { ms: m.ms };
  });
  const gazeSelect = async (name) => {
    const targets = await h.call('list_targets', {});
    const t = (targets.targets ?? targets).find((x) => x.name === name);
    if (!t) throw new Error(`${name} not listed`);
    await h.call('look_at', { device: 'gaze', target: t.center ?? t.position });
    await h.sleep(250);
    const hovered = await h.call('ecs_find_entities', { withComponents: ['Hovered'] });
    await h.call('select', { device: 'hand-right' });
    return { target: name, hovered: hovered.total ?? (hovered.entities ?? []).length };
  };
  await step('gaze-pinch-next', async () => {
    await h.restHand('hand-right');
    await h.restHand('hand-left');
    const before = await h.component('Puzzle');
    const g = await gazeSelect('Glasses_next');
    const r = await h.waitFor('next pressed', async () => {
      const q = await h.component('Puzzle');
      return q.targetId !== before.targetId ? q : null;
    }, 3000);
    return { ...g, from: before.targetId, to: r.value.targetId };
  });
  await step('menu-via-gaze', async () => {
    const head = await h.call('get_transform', { device: 'headset' });
    const hp = head.position ?? head;
    await h.call('set_hand_pose', { device: 'hand-left', poseId: 'flat' });
    await h.call('set_transform', { device: 'hand-left', anchor: 'wrist', position: { x: hp.x - 0.3, y: hp.y - 0.5, z: hp.z - 0.15 }, orientation: { fingers: [0.2, 0, -1], palm: [0, 1, 0] } });
    await h.waitFor('menu open', async () => (await h.component('WristMenu')).open, 3000);
    await h.sleep(200);
    const g = await gazeSelect('Menu_contrast');
    out.menuGaze = g;
    const r = await h.waitFor('high contrast on', async () => (await h.component('WristMenu')).highContrast, 3000);
    await gazeSelect('Menu_contrast');
    await h.restHand('hand-left');
    return { ...g, ms: r.ms };
  });
  await step('complete-puzzle', async () => {
    const p = await h.component('Puzzle');
    await h.poseCreature(p.targetId, { animate: 0.6 });
    await h.waitFor('inked', async () => (await h.component('Puzzle')).state === 'inked', 8000);
    return { id: p.targetId };
  });
  await step('fov', async () => {
    await h.sleep(4500); // next card
    const p = await h.component('Puzzle');
    await h.poseCreature(p.targetId, {});
    await h.sleep(600);
    const head = await h.call('get_transform', { device: 'headset' });
    const pos = head.position;
    const q = head.orientation ?? head.quaternion;
    const shadow = await h.k('k.shadow()');
    const items = { ring: { x: shadow.center[0], y: shadow.center[1], z: shadow.center[2] } };
    const cardPos = await h.k('k.cardPosition()');
    if (cardPos) items.card = cardPos;
    const bar = await h.call('list_targets', {});
    for (const t of (bar.targets ?? bar).filter((x) => String(x.name).startsWith('Glasses_'))) items[t.name] = t.center ?? t.position;
    const res = {};
    for (const [name, p3] of Object.entries(items)) {
      const a = angles(pos, q, p3);
      res[name] = { ...a, inside: Math.abs(a.h) <= H - 2 && a.v <= UP - 2 && a.v >= -DOWN + 2 };
    }
    const shot = path.join(ctx.workspaceRoot, '.tmp/glasses-fov.png');
    await ctx.page.screenshot({ path: shot });
    if (!Object.values(res).every((r) => r.inside)) throw new Error(`outside the glasses view: ${JSON.stringify(res)}`);
    return { res, shot };
  });
  con.stop();
  out.errors = con.errors;
  out.pass = Object.values(out.steps).every((s) => s.ok) && con.errors.length === 0;
  h.writeJson(path.join(ctx.workspaceRoot, '.tmp/e2e/glasses.json'), out);
  return out;
}
