// One heavy slot, two managed profiles, no deployment. Run from any directory.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = path.join(root, 'packages/app');
const slot = path.resolve(root, '../../tools/heavy-slot.sh');
const configFile = path.join(app, 'iwsdk.config.json');
const config = await fs.readFile(configFile, 'utf8');
const report = { startedAt: new Date().toISOString(), pass: false, suites: {} };
let acquired = false;
let started = false;
let changedConfig = false;

async function cli(args, timeout = 60000) {
  const { stdout } = await exec(path.join(app, 'node_modules/.bin/iwsdk'), args, { cwd: app, timeout, maxBuffer: 8 * 1024 * 1024 });
  const data = JSON.parse(stdout);
  if (!data.ok) throw new Error(JSON.stringify(data.error));
  return data.data;
}

try {
  // Status cannot launch a browser; refuse to take over someone else's session.
  const status = await cli(['dev', 'status']);
  if (status.state.running || status.state.starting) throw new Error('An existing runtime is active; stop it before running the suite.');
  await exec(slot, ['acquire', 'kazashi'], { timeout: 60 * 60 * 1000 });
  acquired = true;
  await fs.rm(path.join(app, '.tmp/e2e'), { recursive: true, force: true });
  for (const [profile, suites] of [
    ['metaQuest3', ['quest', 'perf', 'wallless']],
    ['metaVRGlasses', ['glasses', 'glasses-wallless']],
  ]) {
    const next = JSON.parse(config);
    next.dev.emulator.device = profile;
    changedConfig = true;
    await fs.writeFile(configFile, JSON.stringify(next, null, 2) + '\n');
    started = true; // also clean up a partially successful launch
    await cli(['dev', 'up', '--ai-mode', 'agent', '--headless', '--allow-browser-automation', '--timeout', '45000']);
    for (const suite of suites) {
      console.log(`Running ${profile}: ${suite}`);
      await cli(['browser', 'run', `e2e/${suite}.mjs`, '--timeout', '180000'], 195000);
      const result = JSON.parse(await fs.readFile(path.join(app, `.tmp/e2e/${suite}.json`), 'utf8'));
      report.suites[suite] = result;
      if (result.pass !== true) throw new Error(`${suite} failed: ${JSON.stringify(result)}`);
    }
    await cli(['dev', 'down']);
    started = false;
  }
  report.pass = true;
} catch (e) {
  report.error = String(e.stderr || e.message || e);
  try {
    const envelope = JSON.parse(e.stderr || e.stdout || e.message);
    const logPath = envelope.error?.details?.logPath;
    if (logPath) report.runtimeLog = (await fs.readFile(logPath, 'utf8')).slice(-6000);
  } catch { /* command errors need not contain a runtime log */ }
  process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  if (started) {
    try { await cli(['dev', 'down']); }
    catch (e) { cleanupErrors.push(`runtime: ${e.message}`); }
  }
  // A failed config restore must not skip releasing the shared machine slot.
  try { if (changedConfig) await fs.writeFile(configFile, config); }
  catch (e) { cleanupErrors.push(`config: ${e.message}`); }
  try { if (acquired) await exec(slot, ['release', 'kazashi']); }
  catch (e) { cleanupErrors.push(`slot: ${e.message}`); }
  report.cleanup = { attempted: true, errors: cleanupErrors };
  if (cleanupErrors.length) { report.pass = false; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  await fs.mkdir(path.join(root, 'e2e-results'), { recursive: true });
  await fs.writeFile(path.join(root, 'e2e-results/latest-run.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
