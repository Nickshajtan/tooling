import { join } from 'node:path';
import { packageRoot } from '../../src/shared/package-root.js';

/** Absolute path of a file under tests/fixtures, resolved from the package root (not from the compiled file). */
export function fixturePath(name: string): string {
    return join(packageRoot(), 'tests', 'fixtures', name);
}
