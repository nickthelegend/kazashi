// Test room: an engawa (veranda) with a low desk, a cushion and a tea tray,
// open to the garden: a floor and a roof but no walls. Kazashi must fall back
// to its shoji screen here. Loaded into IWER's synthetic environment module.
import * as THREE from 'three';
import { scene } from '@drawcall/glts';

const wood = new THREE.MeshStandardMaterial({ color: '#7a5636', roughness: 0.7 });
const dark = new THREE.MeshStandardMaterial({ color: '#3b2216', roughness: 0.6 });
const cloth = new THREE.MeshStandardMaterial({ color: '#41506b', roughness: 0.95 });
const paper = new THREE.MeshStandardMaterial({ color: '#efe4cc', roughness: 0.9 });
const leaf = new THREE.MeshStandardMaterial({ color: '#3d5a2f', roughness: 1 });

function box(w, h, d, mat, x, y, z, tag) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (tag?.plane) m.userData.xrPlane = tag.plane;
  if (tag?.mesh) m.userData.xrMesh = tag.mesh;
  scene.add(m);
  return m;
}

// Veranda boards (floor plane) and roof (ceiling plane).
box(6, 0.04, 5, wood, 0, -0.02, -1.2, { plane: 'floor' });
box(6, 0.04, 5, dark, 0, 2.62, -1.2, { plane: 'ceiling' });
for (let i = -2; i <= 2; i++) box(0.012, 0.005, 5, dark, i * 0.6, 0.002, -1.2);
// Posts at the far corners (thin: no wall planes).
for (const x of [-2.9, 2.9]) box(0.12, 2.6, 0.12, dark, x, 1.3, -3.6);
// Low writing desk (labelled furniture) with a tea tray and a brush stand.
box(1.0, 0.035, 0.56, wood, 0, 0.7, -0.62, { plane: 'table' });
for (const [x, z] of [[-0.45, -0.38], [0.45, -0.38], [-0.45, -0.86], [0.45, -0.86]]) box(0.04, 0.68, 0.04, dark, x, 0.34, z);
box(0.3, 0.02, 0.2, dark, 0.32, 0.728, -0.7, { mesh: 'tray' });
box(0.05, 0.12, 0.05, paper, -0.36, 0.78, -0.78, { mesh: 'brush stand' });
// Floor cushion (zabuton) to sit on.
box(0.6, 0.08, 0.6, cloth, 0, 0.04, 0.05, { mesh: 'cushion' });
// Garden: shrubs and a stone lantern beyond the edge (meshes, not planes).
for (const [x, z, s] of [[-2.2, -4.4, 0.9], [1.8, -4.8, 1.2], [0.2, -5.2, 0.7]]) {
  const shrub = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 8), leaf);
  shrub.position.set(x, s * 0.6, z);
  shrub.userData.xrGlobalMesh = false;
  scene.add(shrub);
}
box(0.3, 0.9, 0.3, new THREE.MeshStandardMaterial({ color: '#8d8a83', roughness: 1 }), -1.2, 0.45, -4.2, { mesh: 'stone lantern' });

scene.background = new THREE.Color('#9fb3c8');
const sky = new THREE.HemisphereLight('#dfe8f2', '#5b4a36', 1.6);
const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
sun.position.set(3, 6, 2);
sun.castShadow = true;
scene.add(sky, sun);
