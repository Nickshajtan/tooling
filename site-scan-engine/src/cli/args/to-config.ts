/**
 * ParsedFlags → a PartialScanConfig layer, generated from the flag table: every flag with a `config` path is mapped
 * generically. Only the four flags whose meaning depends on other flags (`--sites`, `--url`, `--source-opt`,
 * `--opt`) need code here.
 */

import { resolve } from 'node:path';
import type { PartialScanConfig } from '../../config/types.js';
import { flagOrigin } from '../../config/origins.js';
import { isRecord } from '../../shared/is-record.js';
import { coerce } from './coerce-value.js';
import { FLAGS } from './flags.js';
import type { ParsedFlags } from './parsed-flags.js';

export const CSV_SOURCE_ID = 'csv';
export const URL_SOURCE_ID = 'url';

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    let node = target;
    for (const key of keys.slice(0, -1)) {
        const child = node[key];
        if (isRecord(child)) {
            node = child;
        } else {
            const created: Record<string, unknown> = {};
            node[key] = created;
            node = created;
        }
    }
    node[keys[keys.length - 1] ?? path] = value;
}

function keyValues(entries: readonly string[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const entry of entries) {
        const at = entry.indexOf('=');
        out[entry.slice(0, at)] = coerce(entry.slice(at + 1));
    }

    return out;
}

/** The source id the flags select: `--source`, else implied by `--sites` (csv) / `--url` (url). */
export function sourceFromFlags(flags: ParsedFlags): string | undefined {
    return flags.string('source') ?? (flags.has('sites') ? CSV_SOURCE_ID : flags.has('url') ? URL_SOURCE_ID : undefined);
}

export function configFromFlags(flags: ParsedFlags, fallbackSource: string, cwd: string): PartialScanConfig {
    const layer: Record<string, unknown> = {};

    for (const spec of FLAGS) {
        if (spec.config === undefined || !flags.has(spec.name)) {
            continue;
        }
        const value = flags.strings(spec.name) ?? flags.integer(spec.name) ?? flags.string(spec.name);
        setPath(layer, spec.config, value);
    }

    const source = sourceFromFlags(flags);
    if (source !== undefined) {
        setPath(layer, 'sites.source', source);
    }
    const sites = flags.string('sites');
    if (sites !== undefined) {
        setPath(layer, `sites.options.${CSV_SOURCE_ID}.path`, resolve(cwd, sites));
    }
    const urls = flags.strings('url');
    if (urls !== undefined) {
        setPath(layer, `sites.options.${URL_SOURCE_ID}.urls`, urls);
    }
    for (const [key, value] of Object.entries(keyValues(flags.strings('source-opt') ?? []))) {
        setPath(layer, `sites.options.${source ?? fallbackSource}.${key}`, value);
    }
    for (const [entry, value] of Object.entries(keyValues(flags.strings('opt') ?? []))) {
        setPath(layer, `adapters.${entry}`, value);
    }

    // Trust boundary: every value above was coerced by the flag table; validateConfig is the runtime check.
    return layer as PartialScanConfig;
}

/** Origin of a config path set by flags: the flag that owns it. */
export function flagOriginOf(path: string): string {
    const direct = FLAGS.find((flag) => flag.config === path);
    if (direct) {
        return flagOrigin(`--${direct.name}`);
    }
    if (path === 'sites.source') {
        return flagOrigin('--source');
    }
    if (path.startsWith('sites.options.')) {
        return flagOrigin(path.endsWith('.path') ? '--sites' : path.endsWith('.urls') ? '--url' : '--source-opt');
    }

    return path.startsWith('adapters.') ? flagOrigin('--opt') : 'flag';
}
