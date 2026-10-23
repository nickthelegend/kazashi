/**
 * The paper lantern (chōchin) on its wooden stand. Origin: bottom centre of the
 * stand, +Y up, the tabs face +Z (toward the player). Metres.
 *
 * Named parts: Stand, Foot, Body (paper), CapTop, CapBottom, Handle,
 * Tab_Hint, Tab_Retry, Tab_Next. LightOrigin marks where the flame sits.
 */
import {
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Shape,
  TorusGeometry,
  Vector2,
} from '@iwsdk/core';
import { createPaperMaterial } from '../paper-material.js';

export const LANTERN_LIGHT_Y = 0.135;
export const TAB_NAMES = ['Tab_Hint', 'Tab_Retry', 'Tab_Next'] as const;

function roundedRect(w: number, d: number, r: number): Shape {
  const s = new Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Lathe profile of the paper body: a softened barrel between two caps. */
function bodyProfile(): Vector2[] {
  const pts: Vector2[] = [];
  const n = 18;
  const h = 0.17;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = 0.03 + 0.042 * Math.pow(Math.sin(Math.PI * t), 0.7);
    pts.push(new Vector2(r, 0.05 + t * h));
  }
  return pts;
}

export function createLantern(): Object3D {
  const root = new Group();
  root.name = 'Lantern';

  const wood = new MeshStandardMaterial({ color: '#3b2216', roughness: 0.55, metalness: 0.0 });
  const woodLight = new MeshStandardMaterial({ color: '#6b4128', roughness: 0.6 });
  const tabPaper = new MeshStandardMaterial({ color: '#f3ead7', roughness: 0.9 });

  const standGeo = new ExtrudeGeometry(roundedRect(0.2, 0.13, 0.025), {
    depth: 0.018,
    bevelEnabled: true,
    bevelSize: 0.004,
    bevelThickness: 0.004,
    bevelSegments: 2,
    curveSegments: 6,
  });
  standGeo.rotateX(-Math.PI / 2);
  standGeo.translate(0, 0.004, 0);
  const stand = new Mesh(standGeo, wood);
  stand.name = 'Stand';
  root.add(stand);

  const foot = new Mesh(new CylinderGeometry(0.036, 0.042, 0.03, 20), woodLight);
  foot.name = 'Foot';
  foot.position.set(0, 0.04, -0.015);
  root.add(foot);

  const body = new Mesh(new LatheGeometry(bodyProfile(), 24), createPaperMaterial());
  body.name = 'Body';
  body.position.set(0, 0, -0.015);
  root.add(body);

  const capGeo = new CylinderGeometry(0.034, 0.034, 0.012, 20);
  const capBottom = new Mesh(capGeo, wood);
  capBottom.name = 'CapBottom';
  capBottom.position.set(0, 0.055, -0.015);
  root.add(capBottom);
  const capTop = new Mesh(capGeo, wood);
  capTop.name = 'CapTop';
  capTop.position.set(0, 0.222, -0.015);
  root.add(capTop);

  const handle = new Mesh(new TorusGeometry(0.026, 0.0035, 6, 16, Math.PI), wood);
  handle.name = 'Handle';
  handle.position.set(0, 0.228, -0.015);
  root.add(handle);

  // Paper tabs: poke targets on the front lip of the stand (4.4 × 3.6 cm).
  const tabGeo = new PlaneGeometry(0.044, 0.036);
  TAB_NAMES.forEach((name, i) => {
    const tab = new Mesh(tabGeo, tabPaper);
    tab.name = name;
    tab.position.set((i - 1) * 0.058, 0.04, 0.062);
    tab.rotation.x = -0.55;
    root.add(tab);
  });

  const lightOrigin = new Object3D();
  lightOrigin.name = 'LightOrigin';
  lightOrigin.position.set(0, LANTERN_LIGHT_Y, -0.015);
  root.add(lightOrigin);
  return root;
}
