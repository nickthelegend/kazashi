// Writes targets/targets.json: the chosen cast's captured joint poses (light frame)
// and the IWER recipes they came from. Input: scripts/cast.json (creature id → candidate id).
import fs from 'node:fs';
const cast = JSON.parse(fs.readFileSync(new URL('./cast.json', import.meta.url), 'utf8'));
const captured = JSON.parse(fs.readFileSync(new URL('../targets/captured.json', import.meta.url), 'utf8'));
const out = {};
for (const [id, cand] of Object.entries(cast)) {
  const c = captured[cand];
  if (!c) throw new Error(`no capture for ${cand}`);
  out[id] = { id, source: cand, recipe: { hands: c.recipe.hands }, hands: c.hands };
}
fs.writeFileSync(new URL('../targets/targets.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, 'targets');
