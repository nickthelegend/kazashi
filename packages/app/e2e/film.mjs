// Film footage, Quest 3 profile, in parts (the managed runner allows 110 s per
// script); each part continues the same app session. Every part records a
// continuous screencast of the real app (emulated hands, synthetic living
// room) and the app's own sound from its master bus, and writes marks
// (seconds into its recording) for the edit. Nothing inside a frame is edited.
//   film-1  first launch, onboarding: bird, the dog (the whoa), rabbit
//   film-2  the rest of act I, the heron onto the ceiling, act III: lantern + giant spider
//   film-3  theatre: slides, curtain, a take, Muse's narration, replay with captions
//   film-4  wrist-menu settings, free shadows, the wall-less shoji fallback
import fs from 'node:fs';
import path from 'node:path';
import { harness, reloadApp, watchConsole } from './lib.mjs';
import { SEAT } from './preroll.mjs';
import { startRecording } from './record.mjs';

export async function filmPart(ctx, part) {
  const dir = path.join(ctx.workspaceRoot, `.tmp/film-${part}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let frame = ctx.frame;
  if (part === 1) {
    await ctx.frame.evaluate(async () => {
      localStorage.clear();
      await new Promise((r) => {
        const req = indexedDB.deleteDatabase('kazashi');
        req.onsuccess = req.onerror = req.onblocked = () => r();
      });
    });
    await ctx.frame.evaluate(() => window.IWER_MCP.dispatch('end_session', {})).catch(() => {});
    frame = await reloadApp(ctx);
  }
  if (part === 4) {
    // Self-contained: back to the living room with a fresh page (progress is kept).
    await ctx.frame.evaluate(() => window.IWER_MCP.dispatch('end_session', {})).catch(() => {});
    frame = await reloadApp(ctx);
    await frame.evaluate(() => window.IWER_DEVICE.sem.loadDefaultEnvironment('sunlit_living_room'));
  }
  const con = watchConsole(ctx.page);
  const h = harness({ ...ctx, frame });
  const marks = {};
  const out = { part, marks };
  const head = (o, duration) => h.call('animate_to', { device: 'headset', position: SEAT.position, orientation: { ...SEAT.orientation, ...o }, duration, easing: 'minimum-jerk' });
  const rest = async () => {
    await h.restHand('hand-left');
    await h.restHand('hand-right');
  };
  const palmUp = async () => {
    const hp = (await h.call('get_transform', { device: 'headset' })).position;
    await h.call('set_hand_pose', { device: 'hand-left', poseId: 'flat' });
    await h.call('animate_to', { device: 'hand-left', anchor: 'wrist', position: { x: hp.x - 0.12, y: hp.y - 0.35, z: hp.z - 0.3 }, orientation: { fingers: [0.2, 0, -1], palm: [0, 1, 0] }, duration: 0.6 });
    await h.waitFor('menu', async () => (await h.component('WristMenu')).open, 3000);
  };
  const press = (target) => h.call('run_sequence', { device: 'hand-right', idleHand: 'keep', gaze: 'fixed', body: 'fixed', steps: [{ label: target, target, press: {} }] });
  /** Raise the authored pose from the lap over `dur` seconds (the fingers shape on the way). */
  const perform = async (id, dur = 1.6, offset = [0, 0, 0]) => {
    const placed = await h.k(`k.recipe(${JSON.stringify(id)}, ${JSON.stringify(offset)})`);
    for (const p of placed) await h.call('set_hand_pose', { device: p.device, poseId: p.poseId, fingers: p.fingers, duration: Math.min(0.8, dur) });
    for (const p of placed) await h.call('animate_to', { device: p.device, anchor: 'wrist', position: p.position, orientation: p.orientation, duration: dur, easing: 'minimum-jerk' });
    const used = new Set(placed.map((p) => p.device));
    for (const d of ['hand-left', 'hand-right']) if (!used.has(d)) await h.restHand(d);
  };
  const inked = (id, ms = 9000) => h.waitFor(`inked ${id}`, async () => (await h.components('Creature')).some((c) => c.creatureId === id), ms);
  const card = (id, ms = 12000) => h.waitFor(`${id} card`, async () => (await h.component('Puzzle')).targetId === id, ms);

  if (part !== 1) {
    await h.ensureSession('hand');
    await h.call('set_transform', { device: 'headset', ...SEAT });
    await rest();
  }
  const rec = await startRecording(ctx.cdp, path.join(dir, 'frames'));
  const mark = (k) => (marks[k] = Math.round(rec.elapsed() * 100) / 100);
  let audio = false;
  let audioAt = 0;
  const startAudio = async () => {
    audio = await h.k('k.audio.start()');
    audioAt = rec.elapsed();
  };
  if (part !== 1) await startAudio();
  try {
    if (part === 1) {
      // First launch: the 2D intro, then the session; the room dims and the lantern lands.
      await h.sleep(1500);
      mark('intro');
      await h.sleep(3000);
      await h.call('accept_session', {});
      await h.waitFor('XR session', async () => (await h.call('get_session_status', {})).sessionActive, 15000);
      await h.call('set_input_mode', { mode: 'hand' });
      await h.call('set_transform', { device: 'headset', ...SEAT });
      await rest();
      mark('session');
      await h.waitFor('ready', () => h.k('k.ready'), 15000);
      mark('lantern');
      await startAudio();
      await h.sleep(2200);
      // Onboarding: the ghost hand shows the bird; an open hand inks it; it flies.
      mark('ghost');
      await h.sleep(1500);
      await perform('tori', 1.6);
      await inked('tori');
      mark('toriInked');
      await h.sleep(500);
      await rest();
      await h.sleep(3000);
      await card('inu');
      await h.sleep(600);
      // The whoa: the dog shadow, the ring, the ink, the dog, the corner.
      mark('dogStart');
      await perform('inu', 2.0);
      await inked('inu');
      mark('dogInked');
      await h.sleep(700);
      await h.restHand('hand-right');
      await h.sleep(1600);
      void head({ yaw: 47 }, 2.6);
      await h.waitFor('dog jumped', async () => (await h.components('Creature')).some((c) => c.creatureId === 'inu' && c.jumps > 0), 14000);
      mark('dogJumped');
      await h.sleep(2000);
      await head({}, 1.2);
      await card('usagi');
      mark('rabbit');
      await perform('usagi', 1.4);
      await inked('usagi');
      mark('rabbitInked');
      await h.sleep(500);
      await rest();
      await h.sleep(3500);
      mark('end');
    } else if (part === 2) {
      for (const id of ['hebi', 'kirin']) {
        await card(id);
        mark(id);
        await perform(id, 1.2);
        await inked(id);
        mark(`${id}Inked`);
        await h.sleep(400);
        await rest();
        await h.sleep(2800);
      }
      // Act II opens with the heron: two hands; it flies up onto the ceiling.
      await card('sagi');
      await h.sleep(600);
      mark('heron');
      await perform('sagi', 1.4);
      await inked('sagi');
      mark('heronInked');
      await h.sleep(600);
      await rest();
      void head({ pitch: 26 }, 3.0);
      await h.waitFor('heron on the ceiling', async () => (await h.components('Creature')).some((c) => c.creatureId === 'sagi' && c.jumps > 0), 12000).catch(() => null);
      mark('heronCeiling');
      await h.sleep(1500);
      await head({}, 1.0);
      // Act III from the wrist menu: carry the lantern; hands near it make a giant spider.
      await palmUp();
      mark('menu');
      await h.sleep(900);
      await press('Menu_act3');
      await h.waitFor('act 3', async () => (await h.component('Puzzle')).act === 3, 3000);
      await rest();
      await h.sleep(1200);
      mark('act3');
      const light = await h.k('k.light()');
      const n = (await h.k('k.wall()')).normal;
      await h.call('run_sequence', {
        device: 'hand-left',
        idleHand: 'keep',
        gaze: 'fixed',
        body: 'fixed',
        steps: [
          { label: 'grab', position: { x: light[0], y: light[1], z: light[2] }, pinch: { value: 1, at: 'arrival' } },
          { label: 'carry back', position: { x: light[0] + n[0] * 0.14, y: light[1], z: light[2] + n[2] * 0.14 }, duration: 1.2 },
          { label: 'release', pinch: 0, duration: 0.2 },
          { label: 'away', position: { relativeTo: 'body', x: -0.25, y: 0.7, z: 0.1 } },
        ],
      });
      await h.call('set_transform', { device: 'headset', ...SEAT });
      mark('lanternMoved');
      await perform('kumo', 1.6, [0, 0, 0.1]); // hands near the lantern: a giant
      await inked('kumo', 9000).catch(() => null);
      mark('kumoInked');
      await h.sleep(600);
      await rest();
      await h.sleep(4000);
      mark('end');
    } else if (part === 3) {
      // Let the act's creatures finish their run before the theatre opens.
      await h.waitFor('stage clear', async () => (await h.components('Creature')).length === 0, 15000).catch(() => null);
      await palmUp();
      await press('Menu_theatre');
      await h.waitFor('theatre', async () => (await h.component('Puzzle')).mode === 'theatre', 3000);
      await rest();
      await h.call('animate_to', { device: 'headset', position: SEAT.position, orientation: { ...SEAT.orientation, pitch: -12 }, duration: 0.8 });
      await h.sleep(1000);
      mark('theatre');
      const light = await h.k('k.light()');
      const n = (await h.k('k.wall()')).normal;
      const drop = (dx, dy) => ({ x: light[0] - n[0] * 0.26 + dx, y: light[1] + 0.05 + dy, z: light[2] - n[2] * 0.26 });
      for (const [slide, dx, dy] of [['CastCard_inu', -0.08, 0.0], ['CastCard_sagi', 0.08, 0.06]]) {
        await h.call('run_sequence', {
          device: 'hand-right',
          gaze: 'fixed',
          steps: [
            { label: `pinch ${slide}`, target: slide, pinch: { value: 1, at: 'arrival' } },
            { label: 'project', position: drop(dx, dy), duration: 1.0 },
            { label: 'let go', pinch: 0, duration: 0.2 },
            { label: 'away', position: { relativeTo: 'body', x: 0.25, y: 0.7, z: 0.1 }, duration: 0.6 },
          ],
        });
        mark(`dropped_${slide}`);
      }
      await h.call('animate_to', { device: 'headset', position: SEAT.position, orientation: { ...SEAT.orientation, pitch: -2 }, duration: 1.0 });
      await h.sleep(1200);
      const hp = (await h.call('get_transform', { device: 'headset' })).position;
      const curtain = async () => {
        for (const [d, x, palm] of [['hand-left', -0.32, [1, 0, 0]], ['hand-right', 0.32, [-1, 0, 0]]]) {
          await h.call('set_hand_pose', { device: d, poseId: 'flat' });
          await h.call('animate_to', { device: d, anchor: 'wrist', position: { x: hp.x + x, y: hp.y - 0.22, z: hp.z - 0.35 }, orientation: { fingers: [0, 1, -0.3], palm }, duration: 0.5 });
        }
        for (const [d, x, palm] of [['hand-left', -0.05, [1, 0, 0]], ['hand-right', 0.05, [-1, 0, 0]]]) {
          await h.call('animate_to', { device: d, anchor: 'wrist', position: { x: hp.x + x, y: hp.y - 0.22, z: hp.z - 0.35 }, orientation: { fingers: [0, 1, -0.3], palm }, duration: 0.4 });
        }
        await h.sleep(250);
      };
      mark('curtainOpen');
      await curtain();
      await h.waitFor('recording', async () => (await h.component('Theatre')).recording, 3000);
      mark('recording');
      await h.restHand('hand-left');
      const r1 = await h.k('k.recipe("usagi", [-0.06, 0, 0])');
      const r2 = await h.k('k.recipe("usagi", [0.08, 0.03, 0])');
      await h.call('set_hand_pose', { device: 'hand-right', poseId: r1[0].poseId, fingers: r1[0].fingers });
      await h.call('animate_to', { device: 'hand-right', anchor: 'wrist', position: r1[0].position, orientation: r1[0].orientation, duration: 0.8 });
      await h.call('animate_to', { device: 'hand-right', anchor: 'wrist', position: r2[0].position, orientation: r2[0].orientation, duration: 2.2, easing: 'minimum-jerk' });
      await h.call('animate_to', { device: 'hand-right', anchor: 'wrist', position: r1[0].position, orientation: r1[0].orientation, duration: 1.8, easing: 'minimum-jerk' });
      await h.sleep(800);
      await curtain();
      await h.waitFor('saved', async () => (await h.component('Theatre')).takes >= 1, 5000);
      mark('saved');
      await rest();
      const narr = await h.waitFor('narration', async () => {
        const t = await h.component('Theatre');
        return t.narration === 'ready' || t.narration === 'unavailable' ? t : null;
      }, 40000, 250);
      mark('narration');
      out.narration = narr.value;
      await h.sleep(2200);
      await palmUp();
      await press('Menu_play');
      await rest();
      await h.call('set_transform', { device: 'headset', ...SEAT, orientation: { ...SEAT.orientation, pitch: 4 } });
      await h.waitFor('replaying', async () => (await h.component('Theatre')).replaying, 3000);
      mark('replay');
      await h.waitFor('replay done', async () => !(await h.component('Theatre')).replaying, 30000).catch(() => null);
      mark('replayDone');
      await h.sleep(800);
      out.take = await h.frame.evaluate(async () => {
        const db = await new Promise((r, j) => {
          const q = indexedDB.open('kazashi');
          q.onsuccess = () => r(q.result);
          q.onerror = () => j(q.error);
        });
        const rows = await new Promise((r) => {
          const tx = db.transaction(db.objectStoreNames[0], 'readonly');
          const q = tx.objectStore(db.objectStoreNames[0]).getAll();
          q.onsuccess = () => r(q.result);
        });
        return rows.map((x) => JSON.parse(x.json).n ?? null);
      });
      mark('end');
    } else if (part === 4) {
      await h.call('set_transform', { device: 'headset', ...SEAT });
      await palmUp();
      mark('settings');
      await h.sleep(900);
      await press('Menu_contrast');
      mark('contrast');
      await h.sleep(900);
      await press('Menu_onehand');
      mark('onehand');
      await h.sleep(900);
      await press('Menu_free');
      await h.waitFor('free', async () => (await h.component('Puzzle')).mode === 'free', 3000);
      await rest();
      await h.sleep(900);
      mark('free');
      await perform('kawauso', 1.4);
      await inked('kawauso', 8000).catch(() => null);
      mark('freeInked');
      await h.sleep(500);
      await rest();
      await h.sleep(3500);
      await palmUp();
      await press('Menu_contrast');
      await h.sleep(300);
      await press('Menu_onehand');
      await rest();
      mark('settingsOff');
      // No wall: the engawa room; the shoji screen follows the view; one pinch stands it.
      await h.call('end_session', {});
      mark('engawa');
      await frame.evaluate(async (src) => {
        const sem = window.IWER_DEVICE.sem;
        const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        if (!sem.environments.includes('kazashi_engawa')) sem.addEnvironment('kazashi_engawa', url);
        await sem.loadDefaultEnvironment('kazashi_engawa');
      }, fs.readFileSync(path.join(ctx.workspaceRoot, 'e2e/rooms/engawa.glts.js'), 'utf8'));
      await h.call('accept_session', {});
      await h.waitFor('XR session', async () => (await h.call('get_session_status', {})).sessionActive, 15000);
      await h.call('set_input_mode', { mode: 'hand' });
      await h.call('set_transform', { device: 'headset', position: { x: 0, y: 0.95, z: 0.05 }, orientation: { pitch: -10, yaw: 0, roll: 0 } });
      await rest();
      await h.waitFor('shoji offered', async () => (await h.component('RoomState')).mode === 'shoji-ghost', 9000);
      mark('shojiOffered');
      await h.sleep(1200);
      await h.call('run_sequence', { device: 'hand-right', idleHand: 'keep', steps: [{ label: 'pinch', pinch: 1, duration: 0.25 }, { label: 'release', pinch: 0, duration: 0.2 }] });
      await h.waitFor('shoji placed', async () => (await h.component('RoomState')).mode === 'shoji', 5000);
      mark('shojiPlaced');
      await h.waitFor('ready', () => h.k('k.ready'), 10000);
      await h.sleep(1500);
      // Still in free shadows: an open hand answers with the bird.
      await perform('tori', 1.4);
      await inked('tori', 8000).catch(() => null);
      mark('shojiInked');
      await h.sleep(500);
      await rest();
      await h.sleep(4000);
      mark('end');
    }
  } catch (e) {
    out.error = String(e.stack || e);
  } finally {
    out.recording = await rec.stop();
    if (audio) {
      const b64 = await h.k('k.audio.stop()').catch(() => '');
      if (b64) fs.writeFileSync(path.join(dir, 'audio.webm'), Buffer.from(b64, 'base64'));
      out.audio = { bytes: b64 ? Math.round((b64.length * 3) / 4) : 0, startsAt: Math.round(audioAt * 100) / 100 };
    } else out.audio = { bytes: 0, state: await h.k('k.audio.state()').catch(() => 'unknown') };
    con.stop();
  }
  out.consoleErrors = con.errors;
  h.writeJson(path.join(dir, 'marks.json'), out);
  return out;
}
