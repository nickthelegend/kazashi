// Copies the latest emulator e2e results (packages/app/.tmp/e2e/*.json) into
// e2e-results/ so TESTING.md can cite committed evidence.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'packages/app/.tmp/e2e');
const dst = path.join(root, 'e2e-results');
const latest = JSON.parse(fs.readFileSync(path.join(dst, 'latest-run.json'), 'utf8'));
if (!latest.pass) throw new Error('Latest e2e run did not pass; historical evidence will not be overwritten.');
const suites = ['quest', 'perf', 'wallless', 'glasses-core', 'glasses', 'glasses-wallless'];
// Validate the entire set before copying anything.
for (const name of suites) {
  const data = JSON.parse(fs.readFileSync(path.join(src, `${name}.json`), 'utf8'));
  if (!data.pass || !(Date.parse(data.recordedAt) >= Date.parse(latest.startedAt))) {
    throw new Error(`${name}: failed or stale result`);
  }
}
const screenshot = path.join(root, 'packages/app/.tmp/glasses-fov.png');
if (!(fs.statSync(screenshot).mtimeMs >= Date.parse(latest.startedAt))) throw new Error('Glasses screenshot is stale.');
fs.mkdirSync(dst, { recursive: true });
for (const f of suites.map((name) => `${name}.json`)) {
  const data = JSON.parse(fs.readFileSync(path.join(src, f), 'utf8'));
  fs.writeFileSync(path.join(dst, f), JSON.stringify(data, null, 2) + '\n');
  const steps = data.steps ? Object.entries(data.steps).map(([k, v]) => `${k}:${v.ok ? 'PASS' : 'FAIL'}`).join(' ') : '';
  console.log(f, data.pass === undefined ? '' : data.pass ? 'PASS' : 'FAIL', steps);
}
fs.copyFileSync(screenshot, path.join(dst, 'glasses-fov.png'));
