import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Directory holding this package's package.json. Walks up from this file so it is the same
 * whether the code runs from `src/`, `dist/` or the compiled test build.
 */
export function packageRoot(): string {
    let dir = dirname(fileURLToPath(import.meta.url));
    while (!existsSync(join(dir, 'package.json'))) {
        const parent = dirname(dir);
        if (parent === dir) {
            throw new Error('Cannot locate @hcc/site-scan-engine package.json');
        }
        dir = parent;
    }

    return dir;
}
