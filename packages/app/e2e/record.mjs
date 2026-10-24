// Screencast recorder for emulator clips: CDP frames from the managed browser,
// timestamped, written as JPEGs with a concat list for ffmpeg. Frames are the
// app's real output; captions are added later as separate overlay images.
import fs from 'node:fs';
import path from 'node:path';

export async function startRecording(cdp, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const frames = [];
  let pending = Promise.resolve();
  const onFrame = (e) => {
    const i = frames.length;
    const file = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`);
    frames.push({ file, ts: e.metadata.timestamp });
    pending = pending.then(() => fs.promises.writeFile(file, Buffer.from(e.data, 'base64')));
    cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 1 });
  const t0 = Date.now();
  return {
    elapsed: () => (Date.now() - t0) / 1000,
    async stop() {
      await cdp.send('Page.stopScreencast');
      cdp.off('Page.screencastFrame', onFrame);
      await pending;
      // ffmpeg concat list with real frame durations.
      const lines = [];
      for (let i = 0; i < frames.length; i++) {
        const dur = i + 1 < frames.length ? frames[i + 1].ts - frames[i].ts : 1 / 30;
        lines.push(`file '${path.basename(frames[i].file)}'`, `duration ${Math.max(0.001, dur).toFixed(4)}`);
      }
      if (frames.length) lines.push(`file '${path.basename(frames[frames.length - 1].file)}'`);
      fs.writeFileSync(path.join(dir, 'frames.txt'), lines.join('\n'));
      const span = frames.length > 1 ? frames[frames.length - 1].ts - frames[0].ts : 0;
      return { frames: frames.length, seconds: span, fps: frames.length / Math.max(span, 1e-3), list: path.join(dir, 'frames.txt') };
    },
  };
}

/** Draws a caption strip in the app page (brand fonts) and saves it as a PNG. */
export async function captionPng(frame, text, file, { width = 800, height = 64, sub = false } = {}) {
  const dataUrl = await frame.evaluate(
    ([t, w, h, s]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = s ? '#0f0e0d' : 'rgba(243,234,215,0.96)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#b83a22';
      ctx.fillRect(0, 0, 8, h);
      ctx.fillStyle = s ? '#f3ead7' : '#0f0e0d';
      ctx.font = s ? `400 ${Math.round(h * 0.42)}px "Anonymous Pro", monospace` : `800 ${Math.round(h * 0.5)}px "Bricolage Grotesque", sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(t, 22, h / 2 + 1, w - 40);
      return c.toDataURL('image/png');
    },
    [text, width, height, sub],
  );
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return file;
}
