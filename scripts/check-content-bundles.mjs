// Fails if any built content script (as listed in dist/manifest.json) contains a
// top-level import/export. Content scripts are classic scripts, not ES modules, so
// such a statement is a syntax error at runtime. It appears when Rollup hoists a
// module shared by several entries into a separate chunk (see vite.config.ts).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'rollup/parseAst';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'));
const files = [...new Set((manifest.content_scripts ?? []).flatMap((cs) => cs.js ?? []))];
if (files.length === 0) {
  console.error('check-content-bundles: no content_scripts js files found in dist/manifest.json');
  process.exit(1);
}

const offenders = [];
for (const file of files) {
  const ast = parseAst(readFileSync(resolve(dist, file), 'utf8'));
  for (const node of ast.body) {
    if (/^(Import|Export)/.test(node.type)) offenders.push(`${file}: top-level ${node.type}`);
  }
}

if (offenders.length > 0) {
  console.error('check-content-bundles: content scripts must not contain import/export:');
  for (const o of offenders) console.error(`  - ${o}`);
  console.error('A module is probably shared between several entries; Rollup split it into a chunk.');
  process.exit(1);
}
console.log(`check-content-bundles: OK (${files.join(', ')})`);
