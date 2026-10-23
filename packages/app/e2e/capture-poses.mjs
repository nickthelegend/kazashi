// Pose tool (emulator): plays IWER hand recipes and records the joints in the
// light frame. Usage: iwsdk browser run e2e/capture-poses.mjs
// Input:  ../core/targets/candidates.json (or KAZASHI_RECIPES)
// Output: ../core/targets/captured.json  (or KAZASHI_CAPTURE_OUT)
import fs from 'node:fs';
import path from 'node:path';

const L = [0, 1.1, -0.3]; // capture lantern position (XR origin); wall toward -Z

export default async function run({ frame, workspaceRoot }) {
  const recipesPath = process.env.KAZASHI_RECIPES || path.join(workspaceRoot, '../core/targets/candidates.json');
  const outPath = process.env.KAZASHI_CAPTURE_OUT || path.join(workspaceRoot, '../core/targets/captured.json');
  const recipes = JSON.parse(fs.readFileSync(recipesPath, 'utf8'));
  const call = (method, params) => frame.evaluate(([m, p]) => window.IWER_MCP.dispatch(m, p), [method, params]);
  const status = await call('get_session_status', {});
  if (!status.sessionActive) throw new Error('No active XR session: run `iwsdk xr enter` first');
  await call('set_input_mode', { mode: 'hand' });
  const out = {};
  for (const r of recipes) {
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
  return { captured: Object.keys(out).length, outPath };
}
