import { defineReporter, defineSource, RECORD_SCHEMA_VERSION } from '../../src/index.js';
import type { Reporter, ScanRecord, Site, SiteSource } from '../../src/index.js';

export const ENGINE_RANGE = '^0.2.0';

export function makeSite(siteId: string, url: string, overrides: Partial<Site> = {}): Site {
    return { siteId, url, isActive: true, isPublic: true, meta: {}, ...overrides };
}

/** A source that returns exactly what it is given — including invalid values — and ignores all filtering. */
export function fakeSource(id: string, sites: readonly unknown[]): SiteSource {
    return defineSource({ id, description: 'test source', engine: ENGINE_RANGE, load: async () => sites as readonly Site[] });
}

/** Render-mode reporter writing one file listing "<siteId>|<path>" per record, in the order received. */
export function listReporter(id: string, fileName: string): Reporter {
    return defineReporter({
        id,
        description: 'test render reporter',
        engine: ENGINE_RANGE,
        render: (records) => [{ name: fileName, content: records.map((r) => `${r.siteId}|${r.path}`).join('\n') }],
    });
}

export interface StreamLog {
    readonly seen: string[];
}

/** Streaming reporter that records every record it sees exactly as delivered. */
export function streamReporter(id: string, fileName: string, log: StreamLog = { seen: [] }): Reporter {
    return defineReporter({
        id,
        description: 'test streaming reporter',
        engine: ENGINE_RANGE,
        open: () => ({
            write(record: ScanRecord) {
                log.seen.push(`${record.siteId}|${record.path}`);
            },
            close: () => [{ name: fileName, content: log.seen.join('\n') }],
        }),
    });
}

export function throwingReporter(id: string): Reporter {
    return defineReporter({
        id,
        description: 'always throws',
        engine: ENGINE_RANGE,
        render: () => {
            throw new Error('reporter exploded');
        },
    });
}

export function recordOf(siteId: string, path: string, overrides: Partial<ScanRecord> = {}): ScanRecord {
    return {
        siteId,
        siteUrl: `https://s${siteId}.test/`,
        path,
        url: `https://s${siteId}.test${path}`,
        isPublic: true,
        isActive: true,
        meta: {},
        http: { status: 200, finalUrl: '', redirects: 0, timingMs: 1, bytes: 1, error: '' },
        adapters: {},
        scannedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

export const SCHEMA_VERSION = RECORD_SCHEMA_VERSION;
