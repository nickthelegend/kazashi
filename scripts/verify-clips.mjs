// Check the actual delivered files, including a full decode (not only headers).
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const directory = process.argv[2] ?? path.resolve(root, '../../videos/kazashi');
const report = { verifiedAt: new Date().toISOString(), source: 'Existing Oct 24 IWER captures; verified without rerecording', clips: [], pass: true };
for (const name of ['whoa', 'theatre', 'shoji']) {
  const file = path.join(directory, `kazashi-${name}.mp4`);
  try {
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate', '-of', 'json', file]);
    const info = JSON.parse(stdout);
    await exec('ffmpeg', ['-v', 'error', '-xerror', '-threads', '1', '-i', file, '-f', 'null', '-'], { timeout: 60000 });
    const data = await fs.readFile(file);
    const sha256 = createHash('sha256').update(data).digest('hex');
    const duration = Number(info.format.duration);
    const clip = { file, duration, bytes: Number(info.format.size), sha256, streams: info.streams, fullDecode: true, pass: duration >= 20 && duration <= 40 };
    if (name === 'whoa') {
      const landing = await fs.readFile(path.join(root, 'packages/landing/public/media/whoa.mp4'));
      clip.matchesLanding = data.equals(landing);
      clip.pass &&= clip.matchesLanding;
    }
    report.clips.push(clip);
    report.pass &&= clip.pass;
  } catch (e) {
    report.pass = false;
    report.clips.push({ file, pass: false, error: String(e.message) });
  }
}
await fs.writeFile(path.join(root, 'e2e-results/clips.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
