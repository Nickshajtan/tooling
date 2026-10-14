import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { errorMessage } from '../shared/error-message.js';
import { isRecord } from '../shared/is-record.js';
import type { PartialScanConfig } from './types.js';

export interface LoadedConfigFile {
    readonly config: PartialScanConfig;
    /** Absolute path of the file, for messages and config origins. */
    readonly path: string;
    /** The config file's directory; relative paths in plugin options resolve against it. */
    readonly baseDir: string;
}

/**
 * Reads a JSON config file. Only `output.dir` is made absolute here (it is the engine's own path);
 * relative paths inside plugin options stay as written and plugins resolve them against `baseDir`.
 */
export function loadConfigFile(file: string): LoadedConfigFile {
    const path = resolve(file);
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
        throw new Error(`Cannot read config ${path}: ${errorMessage(err)}`, { cause: err });
    }
    if (!isRecord(parsed)) {
        throw new Error(`Config ${path} must contain a JSON object`);
    }

    const baseDir = dirname(path);
    const { output } = parsed;
    if (isRecord(output) && typeof output.dir === 'string') {
        output.dir = resolve(baseDir, output.dir);
    }

    // Trust boundary: the file is user data; `validateConfig` checks the merged result.
    return { config: parsed as PartialScanConfig, path, baseDir };
}
