import { describeOrigin, leafPaths, originOf } from '../config/origins.js';
import { DEFAULTS } from '../config/defaults.js';
import type { ScanConfig } from '../config/types.js';
import { didYouMean } from '../shared/did-you-mean.js';
import { valueAt } from '../shared/value-at.js';
import { CliError, ErrorCode, type Problem } from './errors.js';

/** Every config key path the engine knows (sections and leaves), for "did you mean". */
export const KNOWN_CONFIG_KEYS: readonly string[] = [
    ...Object.keys(DEFAULTS),
    ...leafPaths(DEFAULTS),
    'sites.options', 'scan.options', 'output.options',
];

/** The dotted config path a validator message starts with (`http.timeoutMs must be…` → `http.timeoutMs`). */
function pathOf(message: string): string | null {
    return /^([A-Za-z][\w-]*(?:\.[\w-]+)*)(?=[ :])/.exec(message)?.[1] ?? null;
}

function sentence(text: string): string {
    const trimmed = text.trim();
    const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);

    return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

const UNKNOWN_KEY = /^unknown config key "(?<path>[^"]+)"$/;
const REMOVED_KEY = /^config key "(?<path>[^"]+)" was removed: (?<hint>.+)$/;

/**
 * Turns the plain strings of `validateConfig` into Problems that say where the bad value came from
 * (`--concurrency 5`, `scan.config.json → http.timeoutMs = -1`, `tool default`).
 */
export function configProblems(messages: readonly string[], config: ScanConfig, origins: Readonly<Record<string, string>>): Problem[] {
    return messages.map((message): Problem => {
        const unknown = UNKNOWN_KEY.exec(message)?.groups?.path;
        if (unknown !== undefined) {
            const suggestion = didYouMean(unknown, KNOWN_CONFIG_KEYS);

            return { what: 'Unknown config key.', where: unknown, ...(suggestion ? { didYouMean: suggestion } : {}) };
        }
        const removed = REMOVED_KEY.exec(message)?.groups;
        if (removed?.path !== undefined && removed.hint !== undefined) {
            return { what: 'This config key was removed.', where: removed.path, hint: sentence(removed.hint) };
        }

        const path = pathOf(message);
        const origin = path ? originOf(origins, path) : undefined;
        if (path === null || origin === undefined) {
            return { what: sentence(message) };
        }
        const value = valueAt(config, path);
        const shown = Array.isArray(value) ? value.join(',') : typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value);
        const where = origin.startsWith('flag:') ? `${describeOrigin(origin)} ${shown}` : `${describeOrigin(origin)} → ${path} = ${JSON.stringify(value)}`;

        return { what: sentence(message.slice(path.length).replace(/^:/, '')), where };
    });
}

export function configError(messages: readonly string[], config: ScanConfig, origins: Readonly<Record<string, string>>): CliError {
    return new CliError(ErrorCode.ConfigInvalid, configProblems(messages, config, origins));
}
