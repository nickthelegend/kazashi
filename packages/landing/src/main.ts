import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/anonymous-pro/400.css';
import '@fontsource/anonymous-pro/700.css';
import './style.css';
import { BESTIARY, type CreatureDef, FREE_BESTIARY, puzzles, targetShape } from '@kazashi/core/bestiary';
import type { Shape2D } from '@kazashi/core/silhouette';

const SVG = 'http://www.w3.org/2000/svg';

/** Draws a projected silhouette as SVG: tapered capsules (as circle chains) and the palm. */
function silhouetteSvg(shape: Shape2D, label: string, aspect = 1): SVGSVGElement {
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
  const w = maxX - minX;
  const h = maxY - minY;
  const size = Math.max(w, h * aspect) * 1.12;
  const vbW = size;
  const vbH = size / aspect;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `${(minX + maxX) / 2 - vbW / 2} ${-(minY + maxY) / 2 - vbH / 2} ${vbW} ${vbH}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${label} silhouette`);
  const g = document.createElementNS(SVG, 'g');
  g.setAttribute('fill', '#0f0e0d');
  for (let c = 0; c < shape.nCaps; c++) {
    const o = c * 6;
    const steps = 5;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const circle = document.createElementNS(SVG, 'circle');
      circle.setAttribute('cx', String(shape.caps[o] + (shape.caps[o + 3] - shape.caps[o]) * t));
      circle.setAttribute('cy', String(-(shape.caps[o + 1] + (shape.caps[o + 4] - shape.caps[o + 1]) * t)));
      circle.setAttribute('r', String(shape.caps[o + 2] + (shape.caps[o + 5] - shape.caps[o + 2]) * t));
      g.appendChild(circle);
    }
  }
  for (let p = 0; p < shape.nPolys; p++) {
    const pts: string[] = [];
    for (let v = 0; v < 7; v++) pts.push(`${shape.polys[(p * 7 + v) * 2]},${-shape.polys[(p * 7 + v) * 2 + 1]}`);
    const poly = document.createElementNS(SVG, 'polygon');
    poly.setAttribute('points', pts.join(' '));
    g.appendChild(poly);
  }
  svg.appendChild(g);
  return svg;
}

const ACTS: { act: string; title: string; text: string; list: () => CreatureDef[] }[] = [
  { act: 'Act I', title: 'One hand', text: 'A flat hand is a bird: success in seconds. Then a dog, a rabbit and two more.', list: () => puzzles(1) },
  { act: 'Act II', title: 'Two hands', text: 'Thumbs link into wings, palms stack into jaws. Shapes avoid heavy overlap.', list: () => puzzles(2) },
  { act: 'Act III', title: 'The lantern moves', text: 'Pinch-grab the lantern: closer makes giants, farther makes small things.', list: () => puzzles(3) },
  { act: 'Free', title: 'Free shadows', text: 'Make anything. Kazashi finds the nearest of ten more creatures.', list: () => FREE_BESTIARY() },
];

function renderActs(): void {
  const host = document.getElementById('act-cards')!;
  for (const a of ACTS) {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `<p class="act">${a.act}</p><h3>${a.title}</h3><p>${a.text}</p>`;
    const row = document.createElement('div');
    row.className = 'sil-row';
    for (const d of a.list().slice(0, 5)) {
      const fig = document.createElement('figure');
      fig.appendChild(silhouetteSvg(targetShape(d.id), d.name));
      const cap = document.createElement('figcaption');
      cap.textContent = d.name;
      fig.appendChild(cap);
      row.appendChild(fig);
    }
    card.appendChild(row);
    host.appendChild(card);
  }
}

function renderSlides(): void {
  const host = document.getElementById('slides')!;
  for (const d of BESTIARY) {
    const fig = document.createElement('figure');
    fig.className = 'slide';
    fig.appendChild(silhouetteSvg(targetShape(d.id), d.name, 3 / 4));
    const cap = document.createElement('figcaption');
    cap.innerHTML = `${d.name} <span>· ${d.hands === 2 ? 'two hands' : 'one hand'}</span>`;
    fig.appendChild(cap);
    host.appendChild(fig);
  }
}

function hero(): void {
  const video = document.getElementById('clip') as HTMLVideoElement;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Static under reduced motion: a still frame with controls, no autoplay.
    video.controls = true;
    return;
  }
  video.play().catch(() => {
    video.controls = true;
  });
}

renderActs();
renderSlides();
hero();
