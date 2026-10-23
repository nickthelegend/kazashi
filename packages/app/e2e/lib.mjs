// Shared helpers for the emulator e2e scripts (run with `iwsdk browser run`).
// Everything goes through IWER's emulated devices and the app's real systems;
// the only page hook is the read-only window.__kazashi.
import fs from 'node:fs';
import path from 'node:path';

/** The app's frame inside the managed window (re-find it after a reload). */
export function appFrame(page) {
  return page.frames().find((f) => f.name() === 'workspace-runtime-frame') ?? page.mainFrame();
}

/** Reloads the app and waits for the new frame to boot. */
export async function reloadApp(ctx) {
  await ctx.frame.evaluate(() => window.IWER_MCP.dispatch('reload_page', {})).catch(() => {});
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 1500));
  while (Date.now() - t0 < 30000) {
    const f = appFrame(ctx.page);
    const ok = await f.evaluate(() => !!window.__kazashi && !!window.IWER_MCP).catch(() => false);
    if (ok) return f;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('app did not come back after reload');
}

export function harness({ frame, page }) {
  const call = (method, params = {}) => frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  const k = (expr) => frame.evaluate(`(() => { const k = window.__kazashi; return ${expr}; })()`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = [];
  const note = (msg) => {
    log.push(`${new Date().toISOString().slice(11, 23)} ${msg}`);
  };

  async function waitFor(label, fn, timeoutMs = 10000, every = 100) {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < timeoutMs) {
      last = await fn();
      if (last) return { value: last, ms: Date.now() - t0 };
      await sleep(every);
    }
    throw new Error(`timeout after ${timeoutMs} ms waiting for: ${label} (last: ${JSON.stringify(last)})`);
  }

  function unwrap(q, name) {
    // ecs_query_entity returns [{ componentId, values }] (or an object keyed by id).
    const list = Array.isArray(q) ? q : Array.isArray(q?.components) ? q.components : null;
    if (list) return list.find((c) => c.componentId === name)?.values ?? null;
    const comps = q?.components ?? q;
    return comps?.[name]?.values ?? comps?.[name] ?? null;
  }

  async function entities(name) {
    const found = await call('ecs_find_entities', { withComponents: [name], limit: 50 });
    const list = found.entities ?? found.results ?? found;
    return Array.isArray(list) ? list : [];
  }

  async function component(name) {
    const [first] = await entities(name);
    if (!first) return null;
    return unwrap(await call('ecs_query_entity', { entityIndex: first.entityIndex ?? first.index, components: [name] }), name);
  }

  async function components(name) {
    const out = [];
    for (const e of await entities(name)) out.push(unwrap(await call('ecs_query_entity', { entityIndex: e.entityIndex ?? e.index, components: [name] }), name));
    return out;
  }

  async function ensureSession(mode = 'hand') {
    const st = await call('get_session_status', {});
    if (!st.sessionActive) {
      await call('accept_session', {});
      await waitFor('XR session', async () => (await call('get_session_status', {})).sessionActive, 15000);
    }
    await call('set_input_mode', { mode });
  }

  /** Puts the hands into an authored pose relative to the live lantern (IWER pose + wrist anchor). */
  async function poseCreature(id, { offset = [0, 0, 0], animate = 0, keepOther = false } = {}) {
    const placed = await k(`k.recipe(${JSON.stringify(id)}, ${JSON.stringify(offset)})`);
    const used = new Set(placed.map((p) => p.device));
    for (const h of placed) {
      const pose = { device: h.device, poseId: h.poseId };
      if (h.fingers) pose.fingers = h.fingers;
      if (h.weight !== undefined) pose.weight = h.weight;
      if (animate) {
        await call('animate_to', { device: h.device, position: h.position, orientation: h.orientation, anchor: 'wrist', duration: animate, easing: 'minimum-jerk' });
        await call('set_hand_pose', { ...pose, duration: Math.min(0.6, animate) });
      } else {
        await call('set_hand_pose', pose);
        await call('set_transform', { device: h.device, position: h.position, orientation: h.orientation, anchor: 'wrist' });
      }
    }
    if (!keepOther) {
      for (const d of ['hand-left', 'hand-right']) if (!used.has(d)) await restHand(d);
    }
    return placed;
  }

  /** Lowers a hand to the lap, out of the lantern's light. */
  async function restHand(device) {
    const head = await call('get_transform', { device: 'headset' });
    const p = head.position ?? head;
    const side = device === 'hand-left' ? -1 : 1;
    await call('set_hand_pose', { device, poseId: 'default' });
    await call('set_transform', { device, anchor: 'wrist', position: { x: p.x + side * 0.22, y: p.y - 0.75, z: p.z + 0.05 }, orientation: { fingers: [0, -0.3, -1], palm: [side * -1, 0, 0] } });
  }

  function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  return { call, k, sleep, note, log, waitFor, component, components, ensureSession, poseCreature, restHand, writeJson, page, frame };
}

/** Collects console errors from the app frame for the whole script. */
export function watchConsole(page) {
  const errors = [];
  const onMsg = (m) => {
    if (m.type() === 'error') errors.push(m.text());
  };
  const onErr = (e) => errors.push(String(e));
  page.on('console', onMsg);
  page.on('pageerror', onErr);
  return { errors, stop: () => (page.off('console', onMsg), page.off('pageerror', onErr)) };
}
