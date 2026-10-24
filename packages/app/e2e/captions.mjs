// Renders caption strips (brand fonts, in the app page) for the clips.
import fs from 'node:fs';
import path from 'node:path';
import { captionPng } from './record.mjs';

const CAPS = {
  'top.png': ['Kazashi · IWER emulator · Quest 3 profile · synthetic room · real app output', 800, 40, true],
  'top-glasses.png': ['Kazashi · IWER emulator · Meta VR Glasses profile · real app output', 800, 40, true],
  'end.png': ['your hands, your wall', 520, 70, false],
  'theatre.png': ['Theatre: cast slides, curtain gesture records a take, replay', 640, 44, false],
  'shoji.png': ['No wall in this room: pinch once to stand a shoji screen', 640, 44, false],
};

export default async function run({ frame, workspaceRoot }) {
  const dir = path.join(workspaceRoot, '.tmp/captions');
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, [text, w, h, sub]] of Object.entries(CAPS)) await captionPng(frame, text, path.join(dir, f), { width: w, height: h, sub });
  return fs.readdirSync(dir);
}
