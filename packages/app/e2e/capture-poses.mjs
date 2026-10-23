// Pose tool (emulator): plays IWER hand recipes and records the joints in the
// light frame. Usage: iwsdk browser run e2e/capture-poses.mjs
// Input:  ../core/targets/candidates.json and candidates-2.json
// Output: ../core/targets/captured.json (resumable across runs)
import fs from 'node:fs';
import path from 'node:path';

const L = [0, 1.1, -0.3]; // capture lantern position (XR origin); wall toward -Z

export default async function run({ frame, workspaceRoot }) {
  const recipesPaths = ['candidates.json', 'candidates-2.json'].map((f) => path.join(workspaceRoot, '../core/targets', f)).filter((f) => fs.existsSync(f));
  const outPath = path.join(workspaceRoot, '../core/targets/captured.json');
  const recipes = recipesPaths.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const call = (method, params) => frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  const status = await call('get_session_status', {});
  if (!status.sessionActive) throw new Error('No active XR session: run `iwsdk xr enter` first');
  await call('set_input_mode', { mode: 'hand' });
  // Resumable: each run (limited to ~110 s by the CLI) continues the last file.
  const out = fs.existsSync(outPath) && !process.env.KAZASHI_CAPTURE_FRESH ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};
  const t0 = Date.now();
  for (const r of recipes) {
    if (out[r.id]) continue;
    if (Date.now() - t0 > 95000) break;
    const hands = [];
    for (const h of r.hands) {
      const device = `hand-${h.hand}`;
      const pose = { device, poseId: h.poseId };
      if (h.fingers) pose.fingers = h.fingers;
      if (h.weight !== undefined) pose.weight = h.weight;
      await call('set_hand_pose', pose);
      await call('set_transform', {
        device,
        anchor: 'wrist',
        position: { x: L[0] + h.wrist[0], y: L[1] + h.wrist[1], z: L[2] + h.wrist[2] },
        orientation: { fingers: h.fingersDir, palm: h.palmDir },
      });
    }
    await new Promise((res) => setTimeout(res, 80));
    for (const h of r.hands) {
      const st = await call('get_hand_state', { device: `hand-${h.hand}`, joints: 'all' });
      const joints = {};
      for (const [name, j] of Object.entries(st.joints)) {
        joints[name] = [j.position.x - L[0], j.position.y - L[1], j.position.z - L[2]].map((v) => Math.round(v * 1e5) / 1e5);
      }
      hands.push({ hand: h.hand, joints });
    }
    out[r.id] = { recipe: r, hands };
  }
  fs.writeFileSync(outPath, JSON.stringify(out));
  return { captured: Object.keys(out).length, total: recipes.length, outPath };
}
