import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const en = JSON.parse(fs.readFileSync('src/i18n/en.json', 'utf8'));
function inTree(d, key) {
  let c = d;
  for (const p of key.split('.')) {
    if (c == null || typeof c !== 'object') return false;
    c = c[p];
  }
  return typeof c === 'string';
}
for (const f of ['src/pages/patient/Home.tsx', 'src/pages/patient/PatientHeader.tsx']) {
  const src = fs.readFileSync(f, 'utf8');
  const missing = [];
  for (const m of src.matchAll(/\bt\(\s*['`"]?([A-Za-z0-9_.]+)['`"]?\s*\)/g)) {
    if (!inTree(en, m[1])) missing.push(m[1]);
  }
  console.log(f, 'missing (tree check):', missing.length, missing);
}
// Also dump the exact regex the test uses and a few literal matches from the source.
const testRe = /\bt\(\s*['`"]?([A-Za-z0-9_.]+)['`"]?\s*\)/g;
console.log('\n--- test regex matches in Home.tsx ---');
const src = fs.readFileSync('src/pages/patient/Home.tsx', 'utf8');
for (const m of src.matchAll(testRe)) {
  console.log(m[0], '->', m[1], 'in EN?', inTree(en, m[1]));
  if (m.index > 2000) break;
}
