import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runCli } from '../src/index.js';
import type { RunCliOptions } from '../src/index.js';
import { mockExtension } from './fixtures/mock-extension.js';
import { titleAdapter } from './fixtures/test-adapter.js';
import { fixturePath } from './support/fixture-path.js';
import { sink, type Sink } from './support/sink.js';
import { memoryStoreFactory } from './fixtures/memory-store.js';
import { fakeSource, listReporter, makeSite, throwingReporter } from './fixtures/test-plugins.js';

const sitesCsv = fixturePath('sites.csv');
const pages = {
    'https://a.test/': { html: '<title>A</title>' },
    'https://b.test/': { html: '<html></html>' },
};

interface RunResult {
    readonly code: number;
    readonly stdout: Sink;
    readonly stderr: Sink;
}

async function run(argv: string[], extra: Partial<RunCliOptions> = {}): Promise<RunResult> {
    const stdout = sink();
    const stderr = sink();
    const code = await runCli({
        name: 't', adapters: [titleAdapter], extensions: [mockExtension(pages)],
        config: { scan: { delayMs: 0, extensions: ['mock'] } }, argv, stdout, stderr, ...extra,
    });

    return { code, stdout, stderr };
}

interface RunMetaShape {
    readonly recordSchemaVersion?: number;
    readonly config: { sites: { options: unknown; siteIds: string[] }; scan: { concurrency: number; delayMs: number } };
}

const outDir = (): string => join(mkdtempSync(join(tmpdir(), 'sse-cli-')), 'run');

test('scan writes all files and respects filter', async () => {
    const out = outDir();
    const { code } = await run(['scan', '--sites', sitesCsv, '--out', out, '--filter', 'public']);
    assert.equal(code, 0);
    const results = readFileSync(join(out, 'results.csv'), 'utf8').trim().split('\n');
    assert.equal(results.length, 3); // sites 1 and 801 (5 is non-public, 9 archived)
    JSON.parse(readFileSync(join(out, 'run.json'), 'utf8'));
});

test('--fail-on error exits 2', async () => {
    const { code } = await run(['scan', '--sites', sitesCsv, '--out', outDir(), '--site-ids', '801', '--fail-on', 'error']);
    assert.equal(code, 2);
});

test('--from-run with --code selects sites, including engine.* codes', async () => {
    const first = outDir();
    await run(['scan', '--sites', sitesCsv, '--out', first, '--filter', 'all']);
    // 1 and 801 resolve in the fake fetcher (801 has no title), 5 and 9 fail to fetch.
    const out = outDir();
    await run(['scan', '--sites', sitesCsv, '--out', out, '--filter', 'all', '--from-run', first, '--code', 'title.missing']);
    const results = readFileSync(join(out, 'results.csv'), 'utf8').trim().split('\n');
    assert.equal(results.length, 2);
    assert.match(results[1] ?? '', /^"801"/);

    const failed = outDir();
    await run(['scan', '--sites', sitesCsv, '--out', failed, '--filter', 'all', '--from-run', first, '--code', 'engine.fetch_failed']);
    assert.equal(readFileSync(join(failed, 'results.csv'), 'utf8').trim().split('\n').length, 1 + 2);
});

test('--from-run without --code or --exclude-code is a usage error', async () => {
    const { code, stderr } = await run(['scan', '--sites', sitesCsv, '--out', outDir(), '--from-run', '/nope']);
    assert.equal(code, 1);
    assert.match(stderr.buf, /--from-run\n\s+Requires --code or --exclude-code\./);
});

const resultIds = (out: string): string[] =>
    readFileSync(join(out, 'results.csv'), 'utf8').trim().split('\n').slice(1).map((line) => (line.match(/^"([^"]*)"/)?.[1] ?? '')).sort();

test('--from-run with --exclude-code alone skips sites that had the code', async () => {
    const first = outDir();
    await run(['scan', '--sites', sitesCsv, '--out', first, '--filter', 'all']);
    const out = outDir();
    const { code } = await run(['scan', '--sites', sitesCsv, '--out', out, '--filter', 'all', '--from-run', first, '--exclude-code', 'engine.fetch_failed,title.missing']);
    assert.equal(code, 0);
    assert.deepEqual(resultIds(out), ['1']);
});

test('--code and --exclude-code combine: had A and had none of X', async () => {
    const first = outDir();
    await run(['scan', '--sites', sitesCsv, '--out', first, '--filter', 'all']);
    const out = outDir();
    await run(['scan', '--sites', sitesCsv, '--out', out, '--filter', 'all', '--from-run', first, '--code', 'engine.fetch_failed', '--exclude-code', 'title.missing']);
    assert.deepEqual(resultIds(out), ['5', '9']);

    const same = outDir();
    await run(['scan', '--sites', sitesCsv, '--out', same, '--filter', 'all', '--from-run', first, '--code', 'title.missing', '--exclude-code', 'title.missing']);
    assert.deepEqual(resultIds(same), [], 'the same code in both selects nothing');
});

test('--exclude-code without --from-run is a usage error', async () => {
    const { code, stderr } = await run(['scan', '--sites', sitesCsv, '--out', outDir(), '--exclude-code', 'x']);
    assert.equal(code, 1);
    assert.match(stderr.buf, /--exclude-code\n\s+Requires --from-run\./);
});

test('a run selected with --exclude-code resumes onto the stored set, without the earlier run', async () => {
    const first = outDir();
    await run(['scan', '--sites', sitesCsv, '--out', first, '--filter', 'all']);
    const out = outDir();
    await run(['scan', '--sites', sitesCsv, '--out', out, '--filter', 'all', '--from-run', first, '--exclude-code', 'engine.fetch_failed']);
    const meta = JSON.parse(readFileSync(join(out, 'run.json'), 'utf8')) as RunMetaShape;
    assert.deepEqual([...meta.config.sites.siteIds].sort(), ['1', '801']);

    // Cut the run back to its first record and delete the run it was selected from.
    const raw = join(out, 'raw.jsonl');
    writeFileSync(raw, `${readFileSync(raw, 'utf8').split('\n')[0]}\n`);
    rmSync(first, { recursive: true });
    const { code, stderr } = await run(['scan', '--resume', out, '--filter', 'all']);
    assert.equal(code, 0);
    assert.match(stderr.buf, /Resuming\s+1 already done, 1 left/);
    assert.deepEqual(resultIds(out), ['1', '801']);
});

test('validate shows the site count left after --exclude-code', async () => {
    const first = outDir();
    await run(['scan', '--sites', sitesCsv, '--out', first, '--filter', 'all']);
    const { code, stderr } = await run(['validate', '--sites', sitesCsv, '--filter', 'all', '--from-run', first, '--exclude-code', 'engine.fetch_failed']);
    assert.equal(code, 0);
    assert.match(stderr.buf, /Pages\s+2 /);
    assert.match(stderr.buf, /2 by --exclude-code/);
});

test('report subcommand rebuilds without network', async () => {
    const out = outDir();
    await run(['scan', '--sites', sitesCsv, '--out', out]);
    const before = readFileSync(join(out, 'summary.md'), 'utf8');
    const { code } = await run(['report', out]);
    assert.equal(code, 0);
    assert.equal(readFileSync(join(out, 'summary.md'), 'utf8'), before);
});

test('resume fetches only remaining sites', async () => {
    const out = outDir();
    await run(['scan', '--sites', sitesCsv, '--out', out]);
    // Simulate an interruption after the first record (plus a half-written line).
    const raw = join(out, 'raw.jsonl');
    writeFileSync(raw, `${readFileSync(raw, 'utf8').split('\n')[0]}\n{"siteId":"tru`);
    const { stderr } = await run(['scan', '--resume', out, '--verbose']);
    assert.match(stderr.buf, /Resuming\s+1 already done, 2 left/);
    assert.equal((stderr.buf.match(/^\[\d+\/2\]/gm) ?? []).length, 2, 'only the 2 remaining active sites fetched');
    assert.equal(readFileSync(join(out, 'results.csv'), 'utf8').trim().split('\n').length, 1 + 3);
});

test('usage errors return 1; unknown --opt adapter rejected', async () => {
    assert.equal((await run(['scan'])).code, 1);
    assert.equal((await run(['scan', '--url', 'https://a.test/', '--opt', 'nope.x=1'])).code, 1);
    assert.equal((await run(['--help'])).code, 0);
});

test('report on a non-run directory fails and writes nothing', async () => {
    const dir = outDir();
    const { code, stderr } = await run(['report', dir]);
    assert.equal(code, 1);
    assert.match(stderr.buf, /No run at .*: not a scan run/);
    assert.equal(existsSync(dir), false);
});

test('report warns when adapters differ from the run', async () => {
    const out = outDir();
    await run(['scan', '--url', 'https://a.test/', '--out', out]);
    const other = { ...titleAdapter, id: 'other' };
    const stderr = sink();
    const code = await runCli({ name: 't', adapters: [other], argv: ['report', out], stdout: sink(), stderr });
    assert.equal(code, 0);
    assert.match(stderr.buf, /Warning: report: run used adapters \[title\], reporting with \[other\]/);
});

test('run.json engineVersion matches package.json', async () => {
    const out = outDir();
    await run(['scan', '--url', 'https://a.test/', '--out', out]);
    const pkg = JSON.parse(readFileSync(join(fixturePath('..'), '..', 'package.json'), 'utf8')) as { version: string };
    const meta = JSON.parse(readFileSync(join(out, 'run.json'), 'utf8')) as { engineVersion: string };
    assert.equal(meta.engineVersion, pkg.version);
});

test('--config file is applied, flags override it, paths resolve relative to the file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sse-cfg-'));
    writeFileSync(join(dir, 'sites.local.csv'), readFileSync(sitesCsv, 'utf8'));
    writeFileSync(join(dir, 'scan.config.json'), JSON.stringify({
        sites: { source: 'csv', options: { csv: { path: './sites.local.csv' } }, filter: 'public' },
        output: { dir: './out' },
        scan: { concurrency: 1 },
    }));
    const out = join(dir, 'out', 'r');
    const { code } = await run(['scan', '--config', join(dir, 'scan.config.json'), '--site-ids', '801', '--out', out]);
    assert.equal(code, 0);
    const meta = JSON.parse(readFileSync(join(out, 'run.json'), 'utf8')) as RunMetaShape;
    assert.deepEqual(meta.config.sites.options, { csv: { path: './sites.local.csv' } });
    assert.equal(meta.config.scan.concurrency, 1);
    assert.equal(meta.config.scan.delayMs, 0, 'tool config layer kept');
    assert.deepEqual(meta.config.sites.siteIds, ['801'], 'flag layered on top');
    assert.equal(readFileSync(join(out, 'results.csv'), 'utf8').trim().split('\n').length, 2);
});

test('invalid config fails before any fetch', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sse-bad-'));
    writeFileSync(join(dir, 'c.json'), JSON.stringify({ http: { concurency: 2 }, sites: { urls: ['https://a.test/'] } }));
    const out = outDir();
    const { code, stderr } = await run(['scan', '--config', join(dir, 'c.json'), '--out', out]);
    assert.equal(code, 1);
    assert.match(stderr.buf, /http\.concurency\n\s+Unknown config key\./);
    assert.match(stderr.buf, /sites\.urls\n\s+This config key was removed\.\n\s+Use sites\.source="url" \+ sites\.options\.url\.urls\./);
    assert.equal(existsSync(out), false);
});

test('resume reuses stored config and warns about ignored flags', async () => {
    const out = outDir();
    await run(['scan', '--sites', sitesCsv, '--out', out, '--filter', 'public', '--limit', '1']);
    const { stderr } = await run(['scan', '--resume', out, '--filter', 'all']);
    assert.match(stderr.buf, /ignoring --filter/);
    // stored limit=1 + filter=public → nothing left to do; filter=all was NOT applied.
    assert.equal(readFileSync(join(out, 'results.csv'), 'utf8').trim().split('\n').length, 2);
});

test('run.json records recordSchemaVersion and report/resume refuse an unknown one', async () => {
    const out = outDir();
    await run(['scan', '--url', 'https://a.test/', '--out', out]);
    const file = join(out, 'run.json');
    const meta = JSON.parse(readFileSync(file, 'utf8')) as RunMetaShape;
    assert.equal(meta.recordSchemaVersion, 1);
    writeFileSync(file, JSON.stringify({ ...meta, recordSchemaVersion: 2 }));
    for (const argv of [['report', out], ['scan', '--resume', out]]) {
        const { code, stderr } = await run(argv);
        assert.equal(code, 1);
        assert.match(stderr.buf, /record schema 2/);
    }
});

test('--reporters limits the scan output; report --reporters overrides without touching run.json', async () => {
    const out = outDir();
    await run(['scan', '--sites', sitesCsv, '--out', out, '--reporters', 'results-csv']);
    assert.equal(existsSync(join(out, 'results.csv')), true);
    assert.equal(existsSync(join(out, 'summary.md')), false);

    const before = readFileSync(join(out, 'run.json'), 'utf8');
    const { code } = await run(['report', out, '--reporters', 'summary-md']);
    assert.equal(code, 0);
    assert.equal(existsSync(join(out, 'summary.md')), true);
    assert.equal(readFileSync(join(out, 'run.json'), 'utf8'), before);
});

test('unknown reporter and source ids are config errors that list the known ids', async () => {
    const a = await run(['scan', '--url', 'https://a.test/', '--out', outDir(), '--reporters', 'nope']);
    assert.equal(a.code, 1);
    assert.match(a.stderr.buf, /--reporters nope\n\s+No such reporter "nope" \(known: results-csv, findings-csv, summary-md\)/);
    const b = await run(['scan', '--source', 'nope', '--out', outDir()]);
    assert.equal(b.code, 1);
    assert.match(b.stderr.buf, /--source nope\n\s+No such source "nope" \(known: csv, url\)/);
});

test('--source-opt coerces like --opt and a mapped csv source feeds meta columns', async () => {
    const out = outDir();
    const { code } = await run([
        'scan', '--sites', fixturePath('sites-renamed.csv'), '--out', out, '--filter', 'all',
        '--source-opt', 'columns={}',
    ]);
    assert.equal(code, 1, 'columns must be an object, not a string');

    const dir = mkdtempSync(join(tmpdir(), 'sse-map-'));
    writeFileSync(join(dir, 'c.json'), JSON.stringify({
        sites: { options: { csv: { path: fixturePath('sites-renamed.csv'), columns: { siteId: 'id', url: 'address', public: 'visible' }, meta: ['region', 'blogname'] } } },
        output: { options: { 'results-csv': { meta: ['region', 'blogname'] } } },
    }));
    const mapped = outDir();
    const result = await run(['scan', '--config', join(dir, 'c.json'), '--out', mapped]);
    assert.equal(result.code, 0);
    const rows = readFileSync(join(mapped, 'results.csv'), 'utf8').trim().split('\n');
    assert.match(rows[0] ?? '', /"meta\.region","meta\.blogname"/);
    assert.match(rows[1] ?? '', /^"1",.*"emea","Alpha"/);
});

test('end to end with a tool-provided source and reporter', async () => {
    const out = outDir();
    const { code } = await run(['scan', '--source', 'inline', '--out', out, '--reporters', 'list'], {
        sources: [fakeSource('inline', [makeSite('1', 'https://a.test/'), makeSite('801', 'https://b.test/'), { siteId: '', url: 'nope' }])],
        reporters: [listReporter('list', 'list.txt')],
    });
    assert.equal(code, 0);
    assert.equal(readFileSync(join(out, 'list.txt'), 'utf8'), '1|/\n801|/');
});

test('a failing reporter does not stop the others and the exit code is 1', async () => {
    const out = outDir();
    const { code, stderr } = await run(['scan', '--url', 'https://a.test/', '--out', out, '--reporters', 'boom,results-csv'], {
        reporters: [throwingReporter('boom')],
    });
    assert.equal(code, 1);
    assert.match(stderr.buf, /boom: reporter failed: reporter exploded/);
    assert.equal(existsSync(join(out, 'results.csv')), true);
});

test('invalid sites are dropped with a warning; duplicates are an error', async () => {
    const { code, stderr } = await run(['scan', '--source', 'inline', '--out', outDir(), '--reporters', ''], {
        sources: [fakeSource('inline', [makeSite('1', 'https://a.test/'), makeSite('2', 'not a url'), makeSite('3', 'https://b.test/', { meta: { 'Bad Key': 'x' } })])],
    });
    assert.equal(code, 0);
    assert.equal((stderr.buf.match(/dropped site/g) ?? []).length, 2);

    const dup = await run(['scan', '--source', 'inline', '--out', outDir()], {
        sources: [fakeSource('inline', [makeSite('1', 'https://a.test/'), makeSite('1', 'https://b.test/')])],
    });
    assert.equal(dup.code, 1);
    assert.match(dup.stderr.buf, /duplicate siteId "1"/);
});

test('engine applies filter, siteIds and limit after any source', async () => {
    const sites = [
        makeSite('1', 'https://a.test/'), makeSite('2', 'https://b.test/', { isPublic: false }),
        makeSite('3', 'https://c.test/', { isActive: false, isPublic: false }), makeSite('4', 'https://d.test/'),
    ];
    const ids = async (extra: string[]): Promise<string[]> => {
        const out = outDir();
        await run(['scan', '--source', 'inline', '--out', out, '--reporters', 'list', ...extra], { sources: [fakeSource('inline', sites)], reporters: [listReporter('list', 'list.txt')] });

        return readFileSync(join(out, 'list.txt'), 'utf8').split('\n').map((l) => l.split('|')[0] ?? '');
    };
    assert.deepEqual(await ids(['--filter', 'all']), ['1', '2', '3', '4']);
    assert.deepEqual(await ids(['--filter', 'active']), ['1', '2', '4']);
    assert.deepEqual(await ids(['--filter', 'public']), ['1', '4']);
    assert.deepEqual(await ids(['--filter', 'all', '--site-ids', '2,4']), ['2', '4']);
    assert.deepEqual(await ids(['--filter', 'all', '--limit', '2']), ['1', '2']);
});

test('scan, resume, report and --from-run all work against a non-fs store (no hidden fs coupling)', async () => {
    const memory = memoryStoreFactory();
    const extra = { stores: [memory] };
    const base = ['--store', 'memory'];

    const first = await run(['scan', '--sites', sitesCsv, '--filter', 'all', '--out', 'run-1', ...base, '--reporters', 'results-csv'], extra);
    assert.equal(first.code, 0);
    const store = memory.runs.get('run-1');
    assert.ok(store?.meta, 'run.json equivalent stored');
    assert.equal(store.lines.length, 4);
    assert.ok(store.artifacts.has('results.csv'));
    assert.match(first.stdout.buf, /memory:run-1\/results\.csv\nrun-1\n$/);

    // Interrupt: keep one record plus a half-written one, then resume.
    store.lines.splice(1, store.lines.length, '{"siteId":"tru');
    const resumed = await run(['scan', '--resume', 'run-1', ...base], extra);
    assert.equal(resumed.code, 0);
    assert.match(resumed.stderr.buf, /Resuming\s+1 already done, 3 left/);

    const report = await run(['report', 'run-1', ...base, '--reporters', 'summary-md'], extra);
    assert.equal(report.code, 0);
    assert.ok(store.artifacts.has('summary.md'));

    const second = await run(['scan', '--sites', sitesCsv, '--filter', 'all', '--out', 'run-2', ...base, '--from-run', 'run-1', '--code', 'engine.fetch_failed', '--reporters', ''], extra);
    assert.equal(second.code, 0);
    assert.equal(memory.runs.get('run-2')?.lines.length, 2, 'the two sites that failed to fetch');
});

test('create over an existing run is a usage error naming --resume', async () => {
    const out = outDir();
    await run(['scan', '--url', 'https://a.test/', '--out', out]);
    const again = await run(['scan', '--url', 'https://a.test/', '--out', out]);
    assert.equal(again.code, 1);
    assert.match(again.stderr.buf, /A run already exists at .*--resume/);
});

test('unknown --store lists the known stores', async () => {
    const { code, stderr } = await run(['scan', '--url', 'https://a.test/', '--store', 'nope']);
    assert.equal(code, 1);
    assert.match(stderr.buf, /Unknown store "nope" \(known: fs\)/);
});
