import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { test } from 'node:test';
import { BUILTIN_REPORTERS, runReporters } from '../src/index.js';
import type { Finding, ReportSink, RunMeta, ScanRecord, Severity } from '../src/index.js';
import { DEFAULTS } from '../src/config/index.js';
import { ENGINE_VERSION } from '../src/shared/version.js';
import { titleAdapter } from './fixtures/test-adapter.js';
import { recordOf, SCHEMA_VERSION } from './fixtures/test-plugins.js';
import { fixturePath } from './support/fixture-path.js';

/**
 * Freezes the built-in report output for a fixed run. A format change must show up here as a deliberate edit:
 * regenerate with `UPDATE_GOLDEN=1 npm test` and review the diff of tests/fixtures/golden/.
 */

const f = (code: string, severity: Severity): Finding => ({ code, severity, message: `msg ${code}`, detail: 'd' });
const withTitle = (siteId: string, path: string, findings: Finding[]): ScanRecord =>
    recordOf(siteId, path, { meta: { blogname: `Blog ${siteId}` }, adapters: { title: { row: { title: `T${siteId}` }, findings } } });

const RUN: RunMeta = {
    tool: 'golden', adapterIds: ['title'], engineVersion: ENGINE_VERSION, recordSchemaVersion: SCHEMA_VERSION,
    startedAt: '2026-01-01T00:00:00.000Z', baseDir: '.', config: { ...DEFAULTS },
};

const RECORDS: ScanRecord[] = [
    withTitle('801', '/', [f('title.a', 'error'), f('title.b', 'error')]),
    withTitle('2', '/', [f('title.a', 'warning')]),
    withTitle('2', '/x', []),
    withTitle('10', '/', [f('title.c', 'warning')]),
];

test('built-in reporter output matches the frozen golden files', async () => {
    const files = new Map<string, string>();
    const sink: ReportSink = {
        async *records() { yield* RECORDS; },
        async writeArtifact(file) { files.set(file.name, String(file.content)); return file.name; },
    };
    await runReporters({
        reporters: BUILTIN_REPORTERS, reporterOptions: { 'results-csv': { meta: ['blogname'] } },
        adapters: [titleAdapter], run: RUN, sink, onWarning: () => {},
    });

    assert.deepEqual([...files.keys()].sort(), ['findings.csv', 'results.csv', 'summary.md']);
    for (const [name, content] of files) {
        const golden = fixturePath(`golden/${name}`);
        if (process.env['UPDATE_GOLDEN'] === '1') {
            mkdirSync(dirname(golden), { recursive: true });
            writeFileSync(golden, content);
        }
        assert.equal(content, readFileSync(golden, 'utf8'), `${name} differs from tests/fixtures/golden/${name}`);
    }
});
