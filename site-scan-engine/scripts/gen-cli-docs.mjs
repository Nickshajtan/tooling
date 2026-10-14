// Rewrites the generated flag tables in docs/cli.md from the built flag table. Run after `npm run build`.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FLAG_DOCS_BEGIN, FLAG_DOCS_END, renderFlagDocs } from '../dist/cli/args/flag-docs.js';

const file = fileURLToPath(new URL('../docs/cli.md', import.meta.url));
const current = readFileSync(file, 'utf8');
const begin = current.indexOf(FLAG_DOCS_BEGIN);
const end = current.indexOf(FLAG_DOCS_END);
if (begin === -1 || end === -1) {
    throw new Error(`docs/cli.md is missing the ${FLAG_DOCS_BEGIN} / ${FLAG_DOCS_END} markers`);
}
const next = `${current.slice(0, begin)}${renderFlagDocs()}${current.slice(end + FLAG_DOCS_END.length)}`;
if (next !== current) {
    writeFileSync(file, next);
    console.log('docs/cli.md updated');
} else {
    console.log('docs/cli.md already up to date');
}
