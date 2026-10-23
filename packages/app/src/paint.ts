/**
 * Canvas-painted textures for in-world paper: cards, tabs, captions. Brand
 * fonts (OFL, bundled via @fontsource) are rasterised into the canvas.
 */
import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/anonymous-pro/400.css';
import '@fontsource/anonymous-pro/700.css';
import { CanvasTexture, SRGBColorSpace } from '@iwsdk/core';
import type { Shape2D } from '@kazashi/core/silhouette';

export const COLORS = {
  sumi: '#0f0e0d',
  vermilion: '#b83a22',
  lamp: '#ffd08a',
  paper: '#f3ead7',
  paperShade: '#e4d7bb',
} as const;

export const FONT_DISPLAY = '"Bricolage Grotesque", system-ui, sans-serif';
export const FONT_MONO = '"Anonymous Pro", ui-monospace, monospace';

let fontsReady: Promise<void> | null = null;
export function loadFonts(): Promise<void> {
  fontsReady ??= Promise.all([
    document.fonts.load(`800 64px ${FONT_DISPLAY}`),
    document.fonts.load(`600 64px ${FONT_DISPLAY}`),
    document.fonts.load(`400 32px ${FONT_MONO}`),
    document.fonts.load(`700 32px ${FONT_MONO}`),
  ]).then(
    () => undefined,
    () => undefined, // fall back to system fonts rather than block the experience
  );
  return fontsReady;
}

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable');
  draw(ctx);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function redraw(tex: CanvasTexture, draw: (ctx: CanvasRenderingContext2D) => void): void {
  const c = tex.image as HTMLCanvasElement;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  draw(ctx);
  tex.needsUpdate = true;
}

/** Washi background with soft fibres (deterministic). */
export function paper(ctx: CanvasRenderingContext2D, w: number, h: number, base: string = COLORS.paper): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  let seed = 99;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = '#7a6440';
  ctx.lineWidth = 1;
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const a = rnd() * Math.PI;
    const l = 4 + rnd() * 18;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + rnd() * 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Fills a projected silhouette into a box (cx, cy, size) on a canvas. */
export function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  shape: Shape2D,
  box: { x: number; y: number; w: number; h: number },
  color: string,
): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let c = 0; c < shape.nCaps; c++) {
    for (let e = 0; e < 2; e++) {
      const o = c * 6 + e * 3;
      const r = shape.caps[o + 2];
      minX = Math.min(minX, shape.caps[o] - r);
      maxX = Math.max(maxX, shape.caps[o] + r);
      minY = Math.min(minY, shape.caps[o + 1] - r);
      maxY = Math.max(maxY, shape.caps[o + 1] + r);
    }
  }
  const s = Math.min(box.w / (maxX - minX), box.h / (maxY - minY));
  const ox = box.x + box.w / 2 - ((minX + maxX) / 2) * s;
  const oy = box.y + box.h / 2 + ((minY + maxY) / 2) * s;
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy - y * s;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let c = 0; c < shape.nCaps; c++) {
    const o = c * 6;
    const steps = 6;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const x = shape.caps[o] + (shape.caps[o + 3] - shape.caps[o]) * t;
      const y = shape.caps[o + 1] + (shape.caps[o + 4] - shape.caps[o + 1]) * t;
      const r = shape.caps[o + 2] + (shape.caps[o + 5] - shape.caps[o + 2]) * t;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), Math.max(0.5, r * s), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const n = shape.nPolys ? 7 : 0;
  for (let p = 0; p < shape.nPolys; p++) {
    ctx.beginPath();
    for (let v = 0; v < n; v++) {
      const x = shape.polys[(p * n + v) * 2];
      const y = shape.polys[(p * n + v) * 2 + 1];
      if (v === 0) ctx.moveTo(X(x), Y(y));
      else ctx.lineTo(X(x), Y(y));
    }
    ctx.closePath();
    ctx.fill();
  }
}

/** Simple stroked pictograms for the paper tabs and menu. */
export type Glyph = 'hint' | 'retry' | 'next' | 'prev' | 'play' | 'record' | 'minus' | 'plus' | 'hand1' | 'eye' | 'contrast' | 'exit' | 'book';

export function drawGlyph(ctx: CanvasRenderingContext2D, g: Glyph, cx: number, cy: number, r: number, color: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const arrow = (dir: number) => {
    ctx.beginPath();
    ctx.moveTo(-r * 0.6 * dir, 0);
    ctx.lineTo(r * 0.6 * dir, 0);
    ctx.moveTo(r * 0.2 * dir, -r * 0.4);
    ctx.lineTo(r * 0.6 * dir, 0);
    ctx.lineTo(r * 0.2 * dir, r * 0.4);
    ctx.stroke();
  };
  switch (g) {
    case 'hint': {
      // An open hand with a light ray: "show me the pose".
      ctx.beginPath();
      ctx.roundRect(-r * 0.42, -r * 0.05, r * 0.84, r * 0.7, r * 0.2);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.roundRect(-r * 0.42 + i * r * 0.22, -r * 0.62 + (i === 0 || i === 3 ? r * 0.12 : 0), r * 0.17, r * 0.65, r * 0.08);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.roundRect(r * 0.32, r * 0.0, r * 0.4, r * 0.17, r * 0.08);
      ctx.fill();
      break;
    }
    case 'retry':
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, Math.PI * 0.15, Math.PI * 1.75);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r * 0.55, -r * 0.45);
      ctx.lineTo(r * 0.62, r * 0.02);
      ctx.lineTo(r * 0.18, -r * 0.12);
      ctx.stroke();
      break;
    case 'next':
      arrow(1);
      break;
    case 'prev':
      arrow(-1);
      break;
    case 'play':
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, -r * 0.5);
      ctx.lineTo(r * 0.55, 0);
      ctx.lineTo(-r * 0.35, r * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'record':
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'minus':
    case 'plus':
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, 0);
      ctx.lineTo(r * 0.5, 0);
      if (g === 'plus') {
        ctx.moveTo(0, -r * 0.5);
        ctx.lineTo(0, r * 0.5);
      }
      ctx.stroke();
      break;
    case 'hand1':
      ctx.beginPath();
      ctx.roundRect(-r * 0.3, -r * 0.1, r * 0.6, r * 0.6, r * 0.15);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-r * 0.1, -r * 0.7, r * 0.2, r * 0.7, r * 0.1);
      ctx.fill();
      break;
    case 'eye':
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.65, r * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'contrast':
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      break;
    case 'exit':
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, -r * 0.45);
      ctx.lineTo(r * 0.45, r * 0.45);
      ctx.moveTo(r * 0.45, -r * 0.45);
      ctx.lineTo(-r * 0.45, r * 0.45);
      ctx.stroke();
      break;
    case 'book':
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.4);
      ctx.lineTo(-r * 0.6, -r * 0.5);
      ctx.lineTo(-r * 0.6, r * 0.45);
      ctx.lineTo(0, r * 0.55);
      ctx.lineTo(r * 0.6, r * 0.45);
      ctx.lineTo(r * 0.6, -r * 0.5);
      ctx.closePath();
      ctx.moveTo(0, -r * 0.4);
      ctx.lineTo(0, r * 0.55);
      ctx.stroke();
      break;
  }
  ctx.restore();
}
