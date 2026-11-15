// Cuts the film from continuous emulator recordings (real app output) using
// the marks the recorder wrote. Captions are separate PNG overlays (brand
// fonts, rendered by e2e/film-captions.mjs); frames are never edited.
//   node scripts/cut-film.mjs <plan.json> <out.mp4>
// plan.json: { sources: { quest: ".tmp/film", glasses: ".tmp/film-glasses" }, captions: ".tmp/film-captions",
//              segments: [{ src, from: "mark+0.5", to: "mark+3", caption: "caption-id" | null, label: bool }] }
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [planFile, outFile] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const base = path.dirname(path.resolve(planFile));
const work = path.join(path.dirname(path.resolve(outFile)), '.cut');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const FPS = 30;

// 1. Each source: constant 30 fps 1920×1080 video and its audio on the same clock.
const src = {};
for (const [name, rel] of Object.entries(plan.sources)) {
  const dir = path.resolve(base, rel);
  const marks = JSON.parse(fs.readFileSync(path.join(dir, 'marks.json'), 'utf8'));
  const video = path.join(work, `${name}.mp4`);
  ff(['-f', 'concat', '-safe', '0', '-i', path.join(dir, 'frames', 'frames.txt'), '-vf', `fps=${FPS},scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0f0e0d,format=yuv420p`, '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', video]);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString());
  const audio = path.join(work, `${name}.wav`);
  const webm = path.join(dir, 'audio.webm');
  if (fs.existsSync(webm) && marks.audio?.bytes) {
    const ms = Math.round((marks.audio.startsAt ?? 0) * 1000);
    ff(['-i', webm, '-af', `adelay=${ms}|${ms},apad,atrim=0:${dur}`, '-ar', '48000', '-ac', '2', audio]);
  } else ff(['-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`, '-t', String(dur), audio]);
  src[name] = { marks: marks.marks, video, audio, dur };
}

const at = (s, expr) => {
  const m = /^([A-Za-z0-9_]+)?([+-][\d.]+)?$/.exec(expr);
  if (!m) throw new Error(`bad time ${expr}`);
  const t0 = m[1] ? s.marks[m[1]] : 0;
  if (t0 === undefined) throw new Error(`unknown mark ${m[1]}`);
  return t0 + Number(m[2] ?? 0);
};

// 2. Segments with their captions.
const parts = [];
let total = 0;
const shots = [];
plan.segments.forEach((seg, i) => {
  const s = src[seg.src];
  const a = Math.max(0, at(s, seg.from));
  const b = Math.min(s.dur, at(s, seg.to));
  if (b - a < 0.5) throw new Error(`segment ${i} (${seg.from}..${seg.to}) is ${(b - a).toFixed(2)} s`);
  const d = b - a;
  const out = path.join(work, `seg${String(i).padStart(2, '0')}.mp4`);
  const inputs = ['-ss', a.toFixed(3), '-t', d.toFixed(3), '-i', s.video, '-ss', a.toFixed(3), '-t', d.toFixed(3), '-i', s.audio];
  const filters = [];
  let v = '[0:v]';
  let n = 2;
  for (const [key, file] of [['caption', seg.caption && path.resolve(base, plan.captions, `${seg.caption}.png`)], ['label', seg.label && path.resolve(base, plan.captions, 'label.png')]]) {
    if (!file) continue;
    inputs.push('-loop', '1', '-t', d.toFixed(3), '-i', file);
    const fade = key === 'caption' ? `,fade=t=in:st=0.15:d=0.35:alpha=1,fade=t=out:st=${Math.max(0.5, d - 0.5).toFixed(2)}:d=0.35:alpha=1` : '';
    filters.push(`[${n}:v]format=rgba${fade}[o${n}]`);
    const pos = key === 'caption' ? 'x=96:y=H-h-72' : 'x=32:y=28';
    filters.push(`${v}[o${n}]overlay=${pos}:shortest=1[v${n}]`);
    v = `[v${n}]`;
    n++;
  }
  // Short audio fades at cuts so plucks do not click.
  filters.push(`[1:a]afade=t=in:d=0.08,afade=t=out:st=${Math.max(0, d - 0.12).toFixed(3)}:d=0.12[a]`);
  const vmap = v === '[0:v]' ? '0:v' : v;
  ff([...inputs, '-filter_complex', filters.join(';'), '-map', vmap, '-map', '[a]', '-r', String(FPS), '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-t', d.toFixed(3), out]);
  parts.push(out);
  shots.push({ start: total, end: total + d, src: seg.src, from: a, to: b, caption: seg.caption ?? null, note: seg.note ?? '' });
  total += d;
});

// 3. Join, normalise loudness of the app's own sound.
const list = path.join(work, 'parts.txt');
fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'copy', '-af', 'loudnorm=I=-20:TP=-2:LRA=11', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outFile]);
fs.writeFileSync(outFile.replace(/\.mp4$/, '.shots.json'), JSON.stringify({ total, shots }, null, 2));
console.log(`${outFile}: ${total.toFixed(2)} s, ${parts.length} shots`);
