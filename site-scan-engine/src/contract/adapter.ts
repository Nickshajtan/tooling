/**
 * Adapter contract shared by the engine and every scan tool.
 *
 * An adapter is a plain object that turns one fetched page into one report row
 * plus zero or more findings. The engine owns fetching, concurrency, resume and
 * reporting; adapters own only the checks. Adapters live in consumer tools, never here.
 */

import { isRecord } from '../shared/is-record.js';
import type { AdapterContext } from './adapter-context.js';
import { identityProblems, PluginKind, throwIfInvalid, type PluginIdentity } from './plugin.js';
import type { ScanRecord } from './record.js';
import { isSeverity, type Severity } from './severity.js';

export interface Finding {
    /** Stable machine id, prefixed with the adapter id (e.g. `seo.noindex`). */
    readonly code: string;
    readonly severity: Severity;
    /** Human-readable one-liner. */
    readonly message: string;
    /** Optional extra context (URL, counts, offending value). */
    readonly detail?: string | undefined;
}

export type RowValue = string | number | boolean;

export interface AdapterResult {
    /** Values keyed by the adapter's `columns`. */
    readonly row: Readonly<Record<string, RowValue>>;
    readonly findings: readonly Finding[];
}

export interface SummaryTable {
    readonly title: string;
    /** Label → count pairs. */
    readonly rows: readonly (readonly [string, number])[];
}

export interface Adapter extends PluginIdentity {
    /** `id` is the finding-code prefix and column namespace. */
    /** Adapter-specific CSV columns, in output order. */
    readonly columns: readonly string[];
    scan(context: AdapterContext): Promise<AdapterResult>;
    summarize?(records: readonly ScanRecord[]): readonly SummaryTable[];
}

/**
 * Validates an adapter definition at registration time so mistakes fail before a long run starts.
 */
export function defineAdapter(adapter: Adapter): Readonly<Adapter> {
    assertAdapter(adapter);

    return Object.freeze(adapter);
}

/**
 * Throws a TypeError describing every contract violation. Used by `defineAdapter` and by
 * `scan()`, so plain objects that skipped `defineAdapter` are still checked before a run.
 */
export function assertAdapter(adapter: unknown): asserts adapter is Adapter {
    const candidate = isRecord(adapter) ? adapter : {};
    const problems = identityProblems(PluginKind.ADAPTER, candidate);

    if (!Array.isArray(candidate.columns)) {
        problems.push('columns must be an array');
    }
    if (typeof candidate.scan !== 'function') {
        problems.push('scan must be a function');
    }
    if (candidate.summarize !== undefined && typeof candidate.summarize !== 'function') {
        problems.push('summarize must be a function when provided');
    }

    throwIfInvalid(PluginKind.ADAPTER, candidate, problems);
}

/**
 * Builds a finding and guards against typos in severity.
 */
export function finding(code: string, severity: Severity, message: string, detail = ''): Finding {
    if (!isSeverity(severity)) {
        throw new TypeError(`Unknown severity "${String(severity)}" for finding ${code}`);
    }

    return { code, severity, message, detail };
}
