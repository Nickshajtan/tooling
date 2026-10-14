import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RunStats } from '../src/cli/run-stats.js';
import { finding, Severity } from '../src/index.js';
import type { ScanRecord } from '../src/index.js';

function record(status: number, error: string, code: string, severity: Severity): ScanRecord {
    return {
        siteId: '1', siteUrl: 'https://a.test/', path: '/', url: 'https://a.test/', isPublic: true, isActive: true, meta: {},
        http: { status, finalUrl: 'https://a.test/', redirects: 0, timingMs: 1, bytes: 0, error },
        adapters: { engine: { row: {}, findings: [finding(code, severity, 'm', 'd')] } },
        scannedAt: '2026-01-01T00:00:00.000Z',
    };
}

test('an engine.http_status page is not a fetch failure; a transport error is', () => {
    const stats = new RunStats(() => 0);
    stats.add(record(403, '', 'engine.http_status', Severity.WARNING));
    assert.equal(stats.fetchFailures, 0);
    stats.add(record(0, 'dns', 'engine.fetch_failed', Severity.ERROR));
    assert.equal(stats.fetchFailures, 1);
    assert.deepEqual(stats.progress().warnings, 1);
});
