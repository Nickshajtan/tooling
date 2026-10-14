import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from './is-record.js';
import { packageRoot } from './package-root.js';

function readVersion(): string {
    const pkg: unknown = JSON.parse(readFileSync(join(packageRoot(), 'package.json'), 'utf8'));
    if (!isRecord(pkg) || typeof pkg.version !== 'string') {
        throw new Error('package.json has no "version"');
    }

    return pkg.version;
}

export const ENGINE_VERSION: string = readVersion();

/** `engine` range declared by the plugins this package ships. */
export const BUILTIN_ENGINE_RANGE = `^${ENGINE_VERSION}`;
