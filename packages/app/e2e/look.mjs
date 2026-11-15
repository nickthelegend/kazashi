// Visual pass (Quest 3 profile): a cold start through the first creatures,
// the wrist menu, the theatre slides, a recorded take, Muse's narration and
// the replay captions. Saves a JPEG of the eye view at each moment to
// .tmp/look/ and returns the state seen there. Real app output, emulated hands.
import fs from 'node:fs';
import path from 'node:path';
import { harness, reloadApp, watchConsole } from './lib.mjs';
import { SEAT } from './preroll.mjs';

export default async function run(ctx) {
  const dir = path.join(ctx.workspaceRoot, '.tmp/look');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const shots = [];
  const snap = async (name) => {
    const { data } = await ctx.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    fs.writeFileSync(path.join(dir, `${String(shots.length).padStart(2, '0')}-${name}.jpg`), Buffer.from(data, 'base64'));
    shots.push(name);
  };
  await ctx.frame.evaluate(async () => {
    localStorage.clear();
    await new Promise((r) => {
      const req = indexedDB.deleteDatabase('kazashi');
      req.onsuccess = req.onerror = req.onblocked = () => r();
    });
  });
  const frame = await reloadApp(ctx);
  const console_ = watchConsole(ctx.page);
  const h = harness({ ...ctx, frame });
  const out = { steps: {} };
  try {
    await h.ensureSession('hand');
    await h.call('set_transform', { device: 'headset', ...SEAT });
    await h.waitFor('ready', () => h.k('k.ready'), 15000);
    await h.sleep(1500);
    await snap('start-card');
    for (const id of ['tori', 'inu', 'usagi']) {
      const p = await h.component('Puzzle');
      await h.poseCreature(p.targetId, {});
      await h.sleep(500);
      if (id === 'inu') await snap('inu-matching');
      await h.waitFor(`inked ${p.targetId}`, async () => (await h.component('Puzzle')).state === 'inked', 8000);
      await h.sleep(350);
      if (id !== 'tori') await snap(`${id}-blot`);
      await h.restHand('hand-left');
      await h.restHand('hand-right');
      await h.sleep(700);
      await snap(`${id}-morph`);
      await h.sleep(1600);
      await snap(`${id}-alive`);
      await h.sleep(1200);
      await snap(`${id}-walk`);
      out.steps[id] = await h.components('Creature');
      await h.waitFor('next card', async () => (await h.component('Puzzle')).targetId !== p.targetId, 8000);
    }
    // Wrist menu.
    const hp = (await h.call('get_transform', { device: 'headset' })).position;
    const palmUp = async () => {
      await h.call('set_hand_pose', { device: 'hand-left', poseId: 'flat' });
      await h.call('set_transform', { device: 'hand-left', anchor: 'wrist', position: { x: hp.x - 0.12, y: hp.y - 0.35, z: hp.z - 0.3 }, orientation: { fingers: [0.2, 0, -1], palm: [0, 1, 0] } });
      await h.waitFor('menu', async () => (await h.component('WristMenu')).open, 3000);
    };
    await palmUp();
    await h.sleep(400);
    await snap('menu');
    await h.call('run_sequence', { device: 'hand-right', idleHand: 'keep', steps: [{ label: 'theatre', target: 'Menu_theatre', press: {} }] });
    await h.waitFor('theatre', async () => (await h.component('Puzzle')).mode === 'theatre', 3000);
    await h.restHand('hand-left');
    await h.restHand('hand-right');
    await h.call('set_transform', { device: 'headset', ...SEAT, orientation: { ...SEAT.orientation, pitch: -12 } });
    await h.sleep(1200);
    await snap('theatre-slides');
    const light = await h.k('k.light()');
    const wall = await h.k('k.wall()');
    const n = wall.normal;
    const drop = (dx, dy) => ({ x: light[0] - n[0] * 0.26 + dx, y: light[1] + 0.05 + dy, z: light[2] - n[2] * 0.26 });
    for (const [card, dx, dy] of [['CastCard_inu', -0.06, 0.0], ['CastCard_tori', 0.07, 0.06]]) {
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
    await h.sleep(1500);
    await snap('theatre-stage');
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
    await h.restHand('hand-left');
    await h.restHand('hand-right');
    await h.sleep(6000);
    await curtain();
    await h.waitFor('saved', async () => (await h.component('Theatre')).takes >= 1, 5000);
    await h.restHand('hand-left');
    await h.restHand('hand-right');
    const t0 = Date.now();
    const narr = await h.waitFor('narration settled', async () => {
      const t = await h.component('Theatre');
      return t.narration === 'ready' || t.narration === 'unavailable' ? t : null;
    }, 45000, 300);
    out.narration = { ...narr.value, ms: Date.now() - t0 };
    await snap('narration-toast');
    await palmUp();
    await h.call('run_sequence', { device: 'hand-right', idleHand: 'keep', gaze: 'fixed', body: 'fixed', steps: [{ label: 'play', target: 'Menu_play', press: {} }] });
    await h.restHand('hand-left');
    await h.restHand('hand-right');
    await h.call('set_transform', { device: 'headset', ...SEAT, orientation: { ...SEAT.orientation, pitch: -2 } });
    await h.waitFor('replaying', async () => (await h.component('Theatre')).replaying, 3000);
    await h.waitFor('caption', async () => (await h.component('Theatre')).captionLine >= 0, 5000).catch(() => null);
    await h.sleep(500);
    await snap('replay-caption');
    out.theatre = await h.component('Theatre');
    out.voice = await h.frame.evaluate(() => ({ synth: 'speechSynthesis' in window, voices: 'speechSynthesis' in window ? speechSynthesis.getVoices().length : 0 }));
    // Cap height of the card's hint font, measured in this browser.
    out.capRatio = await h.frame.evaluate(async () => {
      await document.fonts.ready;
      const c = document.createElement('canvas').getContext('2d');
      const m = (font) => {
        c.font = font;
        return c.measureText('H').actualBoundingBoxAscent;
      };
      return { mono44: m('400 44px "Anonymous Pro"') / 44, display62: m('800 62px "Bricolage Grotesque"') / 62, display30: m('800 30px "Bricolage Grotesque"') / 30, display44: m('800 44px "Bricolage Grotesque"') / 44 };
    });
  } catch (e) {
    out.error = String(e.stack || e);
    await snap('error').catch(() => {});
  } finally {
    console_.stop();
  }
  out.consoleErrors = console_.errors;
  out.shots = shots;
  h.writeJson(path.join(dir, 'look.json'), out);
  return out;
}
