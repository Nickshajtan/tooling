import { isRecord } from '../shared/is-record.js';
import { DEFAULTS } from './defaults.js';
import type { PartialScanConfig, ScanConfig } from './types.js';

function merge(base: unknown, over: unknown): unknown {
    if (!isRecord(over)) {
        return over === undefined ? base : structuredClone(over);
    }
    const out: Record<string, unknown> = isRecord(base) ? { ...base } : {};
    for (const [key, value] of Object.entries(over)) {
        out[key] = merge(out[key], value);
    }

    return out;
}

/** Header names are case-insensitive: lowercase them so layers override each other instead of coexisting. */
function lowercaseHeaderKeys(config: unknown): unknown {
    if (!isRecord(config) || !isRecord(config.http) || !isRecord(config.http.headers)) {
        return config;
    }
    const headers = Object.fromEntries(Object.entries(config.http.headers).map(([name, value]) => [name.toLowerCase(), value]));

    return { ...config, http: { ...config.http, headers } };
}

/**
 * Deep-merges config layers. Objects merge key-by-key; arrays and scalars replace. `undefined` is skipped,
 * so a layer only overrides what it actually sets. Shape and values are checked afterwards by `validateConfig`.
 */
export function mergeConfig(...layers: readonly (PartialScanConfig | undefined)[]): ScanConfig {
    const merged = lowercaseHeaderKeys(layers.reduce<unknown>(merge, structuredClone(DEFAULTS)));

    // Trust boundary: layers are user data; `validateConfig` is the runtime check for this cast.
    return merged as ScanConfig;
}
