// Copies the latest emulator e2e results (packages/app/.tmp/e2e/*.json) into
// e2e-results/ so TESTING.md can cite committed evidence.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'packages/app/.tmp/e2e');
const dst = path.join(root, 'e2e-results');
fs.mkdirSync(dst, { recursive: true });
for (const f of fs.existsSync(src) ? fs.readdirSync(src) : []) {
  if (!f.endsWith('.json')) continue;
  const data = JSON.parse(fs.readFileSync(path.join(src, f), 'utf8'));
  fs.writeFileSync(path.join(dst, f), JSON.stringify(data, null, 2) + '\n');
  const steps = data.steps ? Object.entries(data.steps).map(([k, v]) => `${k}:${v.ok ? 'PASS' : 'FAIL'}`).join(' ') : '';
  console.log(f, data.pass === undefined ? '' : data.pass ? 'PASS' : 'FAIL', steps);
}
