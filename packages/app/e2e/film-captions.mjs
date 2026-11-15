// Renders the film's lower-third captions and the emulator label as PNGs in
// the app page (brand fonts: Bricolage Grotesque, Anonymous Pro). Reads
// .tmp/film-captions/captions.json: { "id": "text", ... }.
import fs from 'node:fs';
import path from 'node:path';

export default async function run(ctx) {
  const dir = path.join(ctx.workspaceRoot, '.tmp/film-captions');
  const texts = JSON.parse(fs.readFileSync(path.join(dir, 'captions.json'), 'utf8'));
  const render = (text, kind) =>
    ctx.frame.evaluate(
      async ([t, k]) => {
        await document.fonts.load('800 46px "Bricolage Grotesque"');
        await document.fonts.load('400 24px "Anonymous Pro"');
        const c = document.createElement('canvas');
        const ctx2 = c.getContext('2d');
        if (k === 'label') {
          ctx2.font = '700 24px "Anonymous Pro"';
          c.width = Math.ceil(ctx2.measureText(t).width) + 40;
          c.height = 44;
          ctx2.fillStyle = 'rgba(15,14,13,0.72)';
          ctx2.fillRect(0, 0, c.width, c.height);
          ctx2.fillStyle = '#f3ead7';
          ctx2.font = '700 24px "Anonymous Pro"';
          ctx2.textBaseline = 'middle';
          ctx2.fillText(t, 20, 23);
        } else {
          ctx2.font = '800 46px "Bricolage Grotesque"';
          const w = Math.min(1728, Math.ceil(ctx2.measureText(t).width) + 74);
          c.width = w;
          c.height = 92;
          ctx2.fillStyle = 'rgba(243,234,215,0.96)';
          ctx2.fillRect(0, 0, w, 92);
          ctx2.fillStyle = '#b83a22';
          ctx2.fillRect(0, 0, 12, 92);
          ctx2.fillStyle = '#0f0e0d';
          ctx2.font = '800 46px "Bricolage Grotesque"';
          ctx2.textBaseline = 'middle';
          ctx2.fillText(t, 40, 48, w - 60);
        }
        return c.toDataURL('image/png');
      },
      [text, kind],
    );
  const out = [];
  for (const [id, text] of Object.entries(texts)) {
    const url = await render(text, id === 'label' ? 'label' : 'caption');
    fs.writeFileSync(path.join(dir, `${id}.png`), Buffer.from(url.split(',')[1], 'base64'));
    out.push(id);
  }
  return { rendered: out };
}
