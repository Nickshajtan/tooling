/**
 * Config layering with origin tracking. Every leaf key records which layer set it last, so an error can say
 * "scan.config.json → http.timeoutMs = -1" or "--concurrency 5" instead of just "invalid value".
 */

import { isRecord } from '../shared/is-record.js';
import { DEFAULTS } from './defaults.js';
import { mergeConfig } from './merge.js';
import type { PartialScanConfig, ScanConfig } from './types.js';

export const OriginKind = {
    DEFAULT: 'default',
    TOOL: 'tool',
    RUN: 'run.json',
} as const;

export const fileOrigin = (path: string): string => `file:${path}`;
export const flagOrigin = (flag: string): string => `flag:${flag}`;

/** Resolves the origin of one leaf path. A plain string covers the whole layer. */
export type OriginResolver = string | ((path: string) => string);

export interface ConfigLayer {
    readonly origin: OriginResolver;
    readonly config: PartialScanConfig | undefined;
}

export interface ResolvedConfig {
    readonly config: ScanConfig;
    /** Dotted leaf path → origin (`default`, `tool`, `file:<path>`, `flag:--x`, `run.json`). */
    readonly origins: Readonly<Record<string, string>>;
}

/** Dotted paths of the leaves of a value: scalars and arrays are leaves, objects are walked. `{}` is a leaf. */
export function leafPaths(value: unknown, prefix = ''): string[] {
    if (!isRecord(value) || Object.keys(value).length === 0) {
        return prefix === '' ? [] : [prefix];
    }

    return Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .flatMap(([key, child]) => leafPaths(child, prefix === '' ? key : `${prefix}.${key}`));
}

export function resolveConfig(layers: readonly ConfigLayer[]): ResolvedConfig {
    const origins: Record<string, string> = {};
    for (const path of leafPaths(DEFAULTS)) {
        origins[path] = OriginKind.DEFAULT;
    }
    for (const { origin, config } of layers) {
        for (const path of leafPaths(config)) {
            origins[path] = typeof origin === 'string' ? origin : origin(path);
        }
    }

    return { config: mergeConfig(...layers.map((layer) => layer.config)), origins };
}

/** The origin of `path`, or of its closest recorded parent (an option inside a plugin's bag). */
export function originOf(origins: Readonly<Record<string, string>>, path: string): string | undefined {
    for (let current = path; current !== ''; current = current.slice(0, Math.max(current.lastIndexOf('.'), 0))) {
        const found = origins[current];
        if (found !== undefined) {
            return found;
        }
    }

    return undefined;
}

/** Human wording of an origin for messages. */
export function describeOrigin(origin: string): string {
    if (origin.startsWith('file:')) {
        return origin.slice('file:'.length);
    }
    if (origin.startsWith('flag:')) {
        return origin.slice('flag:'.length);
    }

    return origin === OriginKind.DEFAULT ? 'engine default' : origin === OriginKind.TOOL ? 'tool default' : origin;
}
