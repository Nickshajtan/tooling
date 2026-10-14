/**
 * The ScanRecord: one line of raw.jsonl, and the only data shape shared by scan/, storage/ and report/.
 * Lives in contract/ so those three layers depend on it rather than on each other.
 */

import type { AdapterResult } from './adapter.js';

/** Bumped (with package semver) on any change to the ScanRecord / run.json shape. See docs/formats.md. */
export const RECORD_SCHEMA_VERSION = 1;

export interface HttpSummary {
    readonly status: number;
    readonly finalUrl: string;
    readonly redirects: number;
    readonly timingMs: number;
    readonly bytes: number;
    readonly error: string;
}

export interface ScanRecord {
    readonly siteId: string;
    readonly siteUrl: string;
    readonly path: string;
    readonly url: string;
    readonly isPublic: boolean;
    readonly isActive: boolean;
    /** Copied from `site.meta`. */
    readonly meta: Readonly<Record<string, string>>;
    readonly http: HttpSummary;
    /** Keyed by adapter id (+ `engine`). */
    readonly adapters: Readonly<Record<string, AdapterResult>>;
    /** ISO timestamp. */
    readonly scannedAt: string;
}

/** Identity of one scan target (site × path). Used for resume/skip. */
export function targetKey(siteId: string, path: string): string {
    return `${siteId}|${path}`;
}
