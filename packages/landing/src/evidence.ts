import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/anonymous-pro/400.css';
import '@fontsource/anonymous-pro/700.css';
import './style.css';
import { BESTIARY, type CreatureDef, FREE_BESTIARY, puzzles, targetShape } from '@kazashi/core/bestiary';
import type { Shape2D } from '@kazashi/core/silhouette';
import { bodyPlan } from '@kazashi/core/creatures';

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

/** The animal a shadow becomes (rest pose), as one SVG path, with its eye cut out. */
function bodySvg(id: string, label: string, aspect = 4 / 3): SVGSVGElement {
  const p = bodyPlan(id);
  const w = p.maxX - p.minX;
  const h = p.maxY - p.minY;
  const size = Math.max(w, h * aspect) * 1.1;
  const vbW = size;
  const vbH = size / aspect;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `${(p.minX + p.maxX) / 2 - vbW / 2} ${-(p.minY + p.maxY) / 2 - vbH / 2} ${vbW} ${vbH}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${label}: the animal its shadow becomes`);
  const P = p.positions;
  const I = p.indices;
  let d = '';
  const f = (v: number) => v.toFixed(3);
  for (let i = 0; i < I.length; i += 3) d += `M${f(P[I[i] * 2])} ${f(-P[I[i] * 2 + 1])}L${f(P[I[i + 1] * 2])} ${f(-P[I[i + 1] * 2 + 1])}L${f(P[I[i + 2] * 2])} ${f(-P[I[i + 2] * 2 + 1])}Z`;
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#0f0e0d');
  path.setAttribute('stroke', '#0f0e0d');
  path.setAttribute('stroke-width', String(size * 0.002));
  svg.appendChild(path);
  if (p.eye.r > 0) {
    const eye = document.createElementNS(SVG, 'circle');
    eye.setAttribute('cx', String(p.eye.x));
    eye.setAttribute('cy', String(-p.eye.y));
    eye.setAttribute('r', String(p.eye.r));
    eye.setAttribute('fill', '#f3ead7');
    svg.appendChild(eye);
  }
  return svg;
}

const ACTS: { act: string; title: string; text: string; list: () => CreatureDef[] }[] = [
  { act: 'Act I', title: 'One hand', text: 'A flat hand is a bird: success in seconds. Then a dog, a rabbit and two more.', list: () => puzzles(1) },
  { act: 'Act II', title: 'Two hands', text: 'Thumbs link into wings, palms stack into jaws. Shapes avoid heavy overlap.', list: () => puzzles(2) },
  { act: 'Act III', title: 'The lantern moves', text: 'Pinch-grab the lantern: closer makes giants, farther makes small things.', list: () => puzzles(3) },
  { act: 'Free', title: 'Free shadows', text: 'Make anything. Kazashi finds the nearest of ten more creatures.', list: () => FREE_BESTIARY() },
];

function renderActs(): void {
  const host = document.getElementById('act-cards');
  if (!host) return;
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
  const host = document.getElementById('slides');
  if (!host) return;
  for (const d of BESTIARY) {
    const fig = document.createElement('figure');
    fig.className = 'slide';
    fig.appendChild(bodySvg(d.id, d.name, 3 / 4));
    const hand = silhouetteSvg(targetShape(d.id), d.name);
    hand.classList.add('slide-hand');
    fig.appendChild(hand);
    const cap = document.createElement('figcaption');
    cap.innerHTML = `${d.name} <span>· ${d.hands === 2 ? 'two hands' : 'one hand'}</span>`;
    fig.appendChild(cap);
    host.appendChild(fig);
  }
}

renderActs();
renderSlides();
