// Generates candidate IWER hand recipes (light frame: lantern at the origin,
// wall toward -Z, +Y up). The capture script plays each one in the emulator
// and records the joints; scripts/confusion.ts then picks a distinct set.
import fs from 'node:fs';

const n = (v) => { const l = Math.hypot(...v); return v.map((x) => +(x / l).toFixed(4)); };
const WALL = [0, 0, -1];
const LIGHT = [0, 0, 1];
const DOWN = [0, -1, 0];
const UP = [0, 1, 0];
// Right-hand wrist ~30 cm in front of the lantern, a little up.
const WR = [0.05, 0.1, -0.3];
const orients = {
  up: { fingers: UP, palm: WALL },
  left: { fingers: [-1, 0, 0], palm: WALL },
  leftlit: { fingers: [-1, 0, 0], palm: LIGHT },
  diag: { fingers: n([-0.6, 0.8, 0]), palm: WALL },
  diaglit: { fingers: n([-0.6, 0.8, 0]), palm: LIGHT },
  down: { fingers: n([-0.3, -1, 0]), palm: WALL },
  edge: { fingers: [-1, 0, 0], palm: DOWN },
  edgeup: { fingers: n([-0.7, 0.7, 0]), palm: n([-0.7, -0.7, 0]) },
};
const poses = ['open', 'flat', 'peace', 'rock', 'call', 'point', 'finger-gun', 'three', 'four', 'ok', 'claw', 'thumbs-up', 'pinch', 'cup', 'hook', 'tripod', 'fist'];
const out = [];
for (const p of poses) {
  for (const [o, d] of Object.entries(orients)) {
    out.push({ id: `${p}.${o}`, hands: [{ hand: 'right', poseId: p, wrist: WR, fingersDir: d.fingers, palmDir: d.palm }] });
  }
}
// Finger mixes that read as classic shadow animals.
const mixes = {
  'dogjaw': { poseId: 'flat', fingers: { pinky: 'call', thumb: 'call' } },
  'dogear': { poseId: 'flat', fingers: { thumb: 'thumbs-up' } },
  'wolf': { poseId: 'four', fingers: { thumb: 'call', pinky: 'fist' } },
  'snail': { poseId: 'fist', fingers: { index: 'peace', middle: 'peace' } },
  'deer1': { poseId: 'open', fingers: { thumb: 'fist' } },
  'gooseneck': { poseId: 'pinch', fingers: { middle: 'fist', ring: 'fist', pinky: 'fist' } },
  'crabclaw': { poseId: 'claw' },
  'owl1': { poseId: 'ok', fingers: { middle: 'fist', ring: 'fist', pinky: 'fist' } },
  'catears': { poseId: 'rock', fingers: { thumb: 'pinch' } },
  'horn': { poseId: 'point', fingers: { pinky: 'rock' } },
};
for (const [name, m] of Object.entries(mixes)) {
  for (const o of ['up', 'left', 'leftlit', 'diag']) {
    const d = orients[o];
    out.push({ id: `${name}.${o}`, hands: [{ hand: 'right', ...m, wrist: WR, fingersDir: d.fingers, palmDir: d.palm }] });
  }
}
// Two hands. The left hand mirrors x.
const mir = (v) => [-v[0], v[1], v[2]];
const two = (id, a, b) => out.push({ id, hands: [{ hand: 'left', ...b }, { hand: 'right', ...a }] });
const R = (poseId, wrist, f, p, extra = {}) => ({ poseId, wrist, fingersDir: n(f), palmDir: n(p), ...extra });
// Butterfly: thumbs crossed, palms to the wall, fingers up and out.
two('2.butterfly', R('open', [0.03, 0.08, -0.3], [0.5, 0.85, 0], WALL), R('open', [-0.03, 0.08, -0.3], [-0.5, 0.85, 0], WALL));
// Eagle: flat hands, thumbs linked, fingers out sideways.
two('2.eagle', R('flat', [0.06, 0.1, -0.3], [1, 0.25, 0], LIGHT), R('flat', [-0.06, 0.1, -0.3], [-1, 0.25, 0], LIGHT));
// Deer: open hands up beside each other (antlers).
two('2.deer', R('open', [0.08, 0.1, -0.32], [0.3, 1, 0], WALL), R('open', [-0.08, 0.1, -0.32], [-0.3, 1, 0], WALL));
// Crab: claws facing down, side by side.
two('2.crab', R('claw', [0.1, 0.12, -0.3], [0.2, -1, 0], WALL), R('claw', [-0.1, 0.12, -0.3], [-0.2, -1, 0], WALL));
// Crocodile: flat hands stacked, fingers left, a gap between = jaws.
two('2.croc', R('flat', [0.08, 0.16, -0.3], [-1, 0.15, 0], DOWN), R('flat', [0.08, 0.06, -0.3], [-1, -0.15, 0], [0, 1, 0]));
// Heron: one hand a pinched beak raised high, the other flat as a wing below.
two('2.heron', R('pinch', [0.04, 0.2, -0.3], [-0.9, 0.3, 0], WALL), R('flat', [0.06, 0.02, -0.3], [-0.95, -0.3, 0], WALL));
// Owl: two ok circles side by side (eyes).
two('2.owl', R('ok', [0.07, 0.1, -0.3], [0.2, 1, 0], WALL), R('ok', [-0.07, 0.1, -0.3], [-0.2, 1, 0], WALL));
// Spider: claws fingers down, crossed at wrists.
two('2.spider', R('open', [0.02, 0.12, -0.3], [0.6, -0.8, 0], WALL), R('open', [-0.02, 0.12, -0.3], [-0.6, -0.8, 0], WALL));
// Bull: two rock hands, horns out.
two('2.bull', R('rock', [0.07, 0.08, -0.3], [0.5, 0.85, 0], WALL), R('rock', [-0.07, 0.08, -0.3], [-0.5, 0.85, 0], WALL));
// Camel: fist on top of a flat hand.
two('2.camel', R('fist', [0.06, 0.16, -0.3], [-0.4, 0.9, 0], WALL), R('flat', [0.06, 0.04, -0.3], [-1, 0, 0], LIGHT));
// Swan: a hooked hand high with a flat body below.
two('2.swan', R('hook', [0.02, 0.2, -0.3], [-0.8, 0.6, 0], LIGHT), R('four', [0.06, 0.0, -0.3], [-1, 0.1, 0], LIGHT));
// Elephant: point down as trunk, open hand as ear.
two('2.elephant', R('point', [0.0, 0.12, -0.3], [-0.3, -1, 0], WALL), R('open', [0.09, 0.12, -0.3], [-0.2, 1, 0], WALL));
// Moth: peace signs crossed.
two('2.moth', R('peace', [0.03, 0.1, -0.3], [0.6, 0.8, 0], WALL), R('peace', [-0.03, 0.1, -0.3], [-0.6, 0.8, 0], WALL));
// Bat: claws with fingers out, palms to the light.
two('2.bat', R('claw', [0.07, 0.1, -0.3], [1, 0.1, 0], LIGHT), R('claw', [-0.07, 0.1, -0.3], [-1, 0.1, 0], LIGHT));
// Tortoise: cup over a fist.
two('2.tortoise', R('cup', [0.05, 0.12, -0.3], [-1, 0, 0], DOWN), R('point', [0.08, 0.06, -0.3], [-1, 0, 0], WALL));
// Rooster: three on top of a fist.
two('2.rooster', R('three', [0.05, 0.16, -0.3], [-0.3, 1, 0], WALL), R('fist', [0.05, 0.03, -0.3], [-1, 0, 0], WALL));
// Dragon (two flat hands chained in line).
two('2.dragon', R('call', [0.12, 0.08, -0.3], [-1, 0.1, 0], LIGHT), R('rock', [-0.02, 0.1, -0.3], [-1, 0.2, 0], LIGHT));
// Octopus: two open hands fingers down.
two('2.octopus', R('open', [0.06, 0.14, -0.3], [0.2, -1, 0], WALL), R('open', [-0.06, 0.14, -0.3], [-0.2, -1, 0], WALL));
// Fish: two flat hands as a tail fork.
two('2.fish', R('flat', [0.1, 0.1, -0.3], [-1, 0.35, 0], LIGHT), R('flat', [0.1, 0.1, -0.3], [-1, -0.35, 0], WALL));
// Duck: flat beak plus fist head.
two('2.duck', R('flat', [0.1, 0.16, -0.3], [-1, 0, 0], DOWN), R('fist', [0.12, 0.06, -0.3], [-0.6, 0.8, 0], WALL));
const rounded = JSON.parse(JSON.stringify(out, (k, v) => (typeof v === 'number' ? +v.toFixed(4) : v)));
fs.writeFileSync(new URL('../targets/candidates.json', import.meta.url), JSON.stringify(rounded, null, 1));
console.log(out.length, 'candidates');
