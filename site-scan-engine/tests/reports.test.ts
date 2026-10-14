import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { BUILTIN_REPORTERS, runReporters } from '../src/index.js';
import type { Finding, ReportSink, RunMeta, ScanRecord, Severity } from '../src/index.js';
import { ENGINE_VERSION } from '../src/shared/version.js';
import { FsRunStore } from '../src/storage/fs-store.js';
import { DEFAULTS } from '../src/config/index.js';
import { titleAdapter } from './fixtures/test-adapter.js';
import { listReporter, recordOf, SCHEMA_VERSION, streamReporter, throwingReporter } from './fixtures/test-plugins.js';

const f = (code: string, severity: Severity): Finding => ({ code, severity, message: 'm', detail: '' });
const withTitle = (siteId: string, path: string, findings: Finding[]): ScanRecord =>
    recordOf(siteId, path, { adapters: { title: { row: { title: `T${siteId}` }, findings } } });

const RUN: RunMeta = {
    tool: 't', adapterIds: ['title'], engineVersion: ENGINE_VERSION, recordSchemaVersion: SCHEMA_VERSION,
    startedAt: '2026-01-01T00:00:00.000Z', baseDir: '.', config: { ...DEFAULTS },
};

function fixtureDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'sse-'));
    const lines = [
        withTitle('801', '/', [f('title.a', 'error'), f('title.b', 'error')]),
        withTitle('2', '/', [f('title.a', 'warning')]),
        withTitle('2', '/x', []),
    ].map((r) => JSON.stringify(r));
    writeFileSync(join(dir, 'raw.jsonl'), `${lines.join('\n')}\n{"siteId":"tru`);

    return dir;
}

function memorySink(records: ScanRecord[]): ReportSink & { files: Map<string, string | Uint8Array> } {
    const files = new Map<string, string | Uint8Array>();

    return {
        files,
        async *records() { yield* records; },
        async writeArtifact(file) { files.set(file.name, file.content); return `mem:${file.name}`; },
    };
}

const base = (sink: ReportSink, reporters = BUILTIN_REPORTERS, extra: Record<string, unknown> = {}) => ({
    reporters, reporterOptions: extra, adapters: [titleAdapter], run: RUN, sink, onWarning: () => {},
});

const readAll = async (dir: string): Promise<ScanRecord[]> => {
    const out: ScanRecord[] = [];
    for await (const record of new FsRunStore(dir).records()) { out.push(record); }

    return out;
};

test('truncated last line is tolerated', async () => {
    assert.equal((await readAll(fixtureDir())).length, 3);
});

test('built-in reporters are sorted, deterministic and complete', async () => {
    const dir = fixtureDir();
    await runReporters(base(new FsRunStore(dir)));
    const names = ['results.csv', 'findings.csv', 'summary.md'];
    const first = names.map((n) => readFileSync(join(dir, n), 'utf8'));

    const reversed = (await readAll(dir)).reverse();
    await runReporters(base(memorySink(reversed)));
    await runReporters(base(new FsRunStore(dir)));
    assert.deepEqual(names.map((n) => readFileSync(join(dir, n), 'utf8')), first);

    const [results = '', findings = '', summary = ''] = first;
    const [header = '', second1 = '', , fourth = ''] = results.trim().split('\n');
    assert.match(header, /^"site_id"/);
    assert.match(header, /"title\.title"$/);
    assert.match(second1, /^"2",.*"\/"/);
    assert.match(fourth, /^"801"/);
    assert.equal(findings.trim().split('\n').length, 1 + 3);
    assert.match(summary, /title\.a \| 2/);
    assert.match(summary, /Recheck manually[\s\S]*801/);
});

test('findings-csv minSeverity and results-csv meta columns', async () => {
    const records = [recordOf('1', '/', { meta: { blogname: 'Alpha' }, adapters: { title: { row: { title: 'x' }, findings: [f('a', 'warning'), f('b', 'error')] } } })];
    const sink = memorySink(records);
    await runReporters(base(sink, BUILTIN_REPORTERS, { 'findings-csv': { minSeverity: 'error' }, 'results-csv': { meta: ['blogname'] } }));
    assert.equal(String(sink.files.get('findings.csv')).trim().split('\n').length, 2);
    assert.match(String(sink.files.get('results.csv')), /"meta\.blogname","title\.title"\n.*"Alpha","x"/);
});

test('summary-md recheckMinErrorCodes', async () => {
    const records = [withTitle('1', '/', [f('a', 'error')])];
    const sink = memorySink(records);
    await runReporters(base(sink, BUILTIN_REPORTERS, { 'summary-md': { recheckMinErrorCodes: 1 } }));
    assert.match(String(sink.files.get('summary.md')), /Recheck manually \(1\+ error codes\)[\s\S]*\| 1 \|/);
});

test('reporters: [] writes nothing', async () => {
    const sink = memorySink([recordOf('1', '/')]);
    const result = await runReporters(base(sink, []));
    assert.deepEqual(result.written, []);
    assert.equal(sink.files.size, 0);
});

test('unsafe and duplicate file names are rejected and name the reporter', async () => {
    const bad = (id: string, name: string) => ({ id, description: '', engine: '^0.2.0', render: () => [{ name, content: 'x' }] });
    const sink = memorySink([recordOf('1', '/')]);
    const result = await runReporters(base(sink, [
        bad('abs', '/etc/passwd'), bad('dots', '../x.csv'), bad('reserved', 'raw.jsonl'),
        listReporter('one', 'same.csv'), listReporter('two', 'same.csv'),
    ]));
    assert.deepEqual(result.failures.map((x) => x.reporterId).sort(), ['abs', 'dots', 'reserved', 'two']);
    assert.deepEqual([...sink.files.keys()], ['same.csv']);
});

test('a throwing reporter does not stop the others', async () => {
    const sink = memorySink([recordOf('1', '/')]);
    const warnings: string[] = [];
    const result = await runReporters({ ...base(sink, [throwingReporter('boom'), listReporter('ok', 'ok.txt')]), onWarning: (w) => warnings.push(w.source) });
    assert.deepEqual(result.failures.map((x) => x.reporterId), ['boom']);
    assert.ok(sink.files.has('ok.txt'));
    assert.deepEqual(warnings, ['boom']);
});

test('streaming: each record exactly once; mixed with render mode; 10k records stream line by line', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sse-big-'));
    const lines: string[] = [];
    for (let i = 1; i <= 10_000; i += 1) {
        lines.push(JSON.stringify(recordOf(String(i), '/')));
    }
    writeFileSync(join(dir, 'raw.jsonl'), `${lines.join('\n')}\n`);

    const log = { seen: [] as string[] };
    const result = await runReporters(base(new FsRunStore(dir), [streamReporter('stream', 'stream.txt', log), listReporter('list', 'list.txt')]));
    assert.equal(result.failures.length, 0);
    assert.equal(log.seen.length, 10_000);
    assert.equal(new Set(log.seen).size, 10_000);
    assert.equal(readFileSync(join(dir, 'list.txt'), 'utf8').split('\n').length, 10_000);

    assert.equal((await readAll(dir)).length, 10_000);
});
