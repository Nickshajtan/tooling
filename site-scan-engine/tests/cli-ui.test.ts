import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { defineExtension, ErrorCode } from '../src/index.js';
import { PeriodicGate, RedrawGate, renderProgress } from '../src/cli/ui/progress.js';
import { createTheme } from '../src/cli/ui/theme.js';
import { resolveColor } from '../src/cli/ui/terminal.js';
import { etaMs, formatDuration, formatEstimate, formatPercent, plural, progressBar } from '../src/cli/ui/format.js';
import { fakeResponse, mockExtension } from './fixtures/mock-extension.js';
import { throwingAdapter } from './fixtures/test-adapter.js';
import { ANSI, cli, FakeSignals, PAGES } from './support/cli-harness.js';
import { fixturePath } from './support/fixture-path.js';

const sitesCsv = fixturePath('sites.csv');
const runDir = (): string => join(mkdtempSync(join(tmpdir(), 'sse-ui-')), 'run');

test('format helpers', () => {
    assert.equal(formatDuration(45), '45 ms');
    assert.equal(formatDuration(3200), '3.2 s');
    assert.equal(formatDuration(42_000), '42 s');
    assert.equal(formatDuration(245_000), '4m 05s');
    assert.equal(formatDuration(3_780_000), '1h 03m');
    assert.equal(formatEstimate(30_000), '< 1 min');
    assert.equal(formatEstimate(45 * 60_000), '~45 min');
    assert.equal(formatEstimate(3 * 3_600_000), '~3 h');
    assert.equal(formatPercent(1, 4), '25%');
    assert.equal(formatPercent(0, 0), '100%');
    assert.equal(plural(1, 'page'), '1 page');
    assert.equal(plural(2413, 'page'), '2,413 pages');
    assert.equal(etaMs(0, 10, 100), null);
    assert.equal(etaMs(5, 10, 1000), 1000);
    assert.equal(progressBar(5, 10, 10), '▕█████░░░░░▏');
});

test('color: NO_COLOR and --no-color win, FORCE_COLOR forces, otherwise a TTY decides', () => {
    assert.equal(resolveColor({}, true, false), true);
    assert.equal(resolveColor({}, false, false), false);
    assert.equal(resolveColor({ NO_COLOR: '1' }, true, false), false);
    assert.equal(resolveColor({}, true, true), false);
    assert.equal(resolveColor({ FORCE_COLOR: '1' }, false, false), true);
    assert.equal(resolveColor({ FORCE_COLOR: '1', NO_COLOR: '1' }, true, false), false);
    assert.equal(createTheme(false).error('x'), 'x');
    assert.match(createTheme(true).error('x'), ANSI);
});

test('NO_COLOR and --no-color produce no ANSI codes even on a TTY; a TTY gets color otherwise', async () => {
    const plain = await cli(['scan', '--url', 'https://a.test/', '--out', runDir()], { tty: true, env: { NO_COLOR: '1' } });
    assert.doesNotMatch(plain.stderr.buf, ANSI);
    const flagged = await cli(['scan', '--url', 'https://a.test/', '--out', runDir(), '--no-color'], { tty: true });
    assert.doesNotMatch(flagged.stderr.buf, ANSI);
    const colored = await cli(['scan', '--url', 'https://a.test/', '--out', runDir()], { tty: true });
    assert.match(colored.stderr.buf, ANSI);
    const piped = await cli(['scan', '--url', 'https://a.test/', '--out', runDir()]);
    assert.doesNotMatch(piped.stderr.buf, ANSI);
});

test('plan: numbers and wording — filter breakdown, page count, checks, output, estimate', async () => {
    const { stderr, code } = await cli(['scan', '--sites', sitesCsv, '--filter', 'public', '--paths', '/,/x/', '--out', runDir(), '--dry-run']);
    assert.equal(code, 0);
    assert.match(stderr.buf, /^t · engine 0\.2\.0\n/);
    assert.match(stderr.buf, /Sites\s+4 from sites\.csv {2}→ {2}2 after filter "public" {2}\(2 skipped: 1 private, 1 inactive\)/);
    assert.match(stderr.buf, /Pages\s+4 {2}\(2 paths: \/, \/x\/\)/);
    assert.match(stderr.buf, /Checks\s+title/);
    assert.match(stderr.buf, /Fetching\s+3 in parallel · 0 ms pause · 15 s timeout/);
    assert.match(stderr.buf, /Output\s+.*→ {2}results-csv, findings-csv, summary-md/);
    assert.match(stderr.buf, /Estimate\s+< 1 min/);
    assert.match(stderr.buf, /Configuration is valid\. No requests were made\./);
});

test('plan shows retry from the default extensions and any other active extension', async () => {
    const config = { scan: { delayMs: 0, extensions: ['retry', 'host-map', 'mock'], options: { 'host-map': { map: { 'a.test': 'b.test' } } } } };
    const { stderr } = await cli(['scan', '--url', 'https://a.test/', '--out', runDir(), '--dry-run'], { config });
    assert.match(stderr.buf, /retry ×2/);
    assert.match(stderr.buf, /Extensions\s+host-map, mock/);
});

test('--dry-run and validate fetch nothing and write no run', async () => {
    const calls: string[] = [];
    const spy = defineExtension({
        id: 'spy', description: '', engine: '^0.2.0',
        setup(api) { api.use('fetch', async (c) => { calls.push(c.request.url); throw new Error('network must not be touched'); }); },
    });
    const out = runDir();
    const config = { scan: { delayMs: 0, extensions: ['spy'] } };
    for (const argv of [['scan', '--url', 'https://a.test/', '--out', out, '--dry-run'], ['validate', '--url', 'https://a.test/', '--out', out]]) {
        const { code } = await cli(argv, { extensions: [spy], config });
        assert.equal(code, 0, argv.join(' '));
    }
    assert.deepEqual(calls, []);
    const { existsSync } = await import('node:fs');
    assert.equal(existsSync(out), false, 'no run directory was created');
});

test('validate fails on the same problems scan would, before any request', async () => {
    const { code, stderr } = await cli(['validate', '--url', 'https://a.test/', '--reporters', 'nope']);
    assert.equal(code, 1);
    assert.match(stderr.buf, /No such reporter "nope"/);
});

test('validate --verbose prints every effective value with where it came from; schemaless plugins warn', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sse-val-'));
    writeFileSync(join(dir, 'scan.config.json'), JSON.stringify({ http: { timeoutMs: 9000 } }));
    const { stderr, code } = await cli(['validate', '--config', join(dir, 'scan.config.json'), '--url', 'https://a.test/', '--concurrency', '2', '--verbose']);
    assert.equal(code, 0);
    assert.match(stderr.buf, /http\.timeoutMs += 9000 +\(.*scan\.config\.json\)/);
    assert.match(stderr.buf, /scan\.concurrency += 2 +\(--concurrency\)/);
    assert.match(stderr.buf, /scan\.delayMs += 0 +\(tool default\)/);
    assert.match(stderr.buf, /http\.maxRedirects += 10 +\(engine default\)/);
    assert.match(stderr.buf, /Warning: title: declares no option schema; its options are not validated/);
});

test('errors say where a bad value came from: flag, config file, tool default', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sse-err-'));
    writeFileSync(join(dir, 'scan.config.json'), JSON.stringify({ http: { timeoutMs: -1 } }));
    const file = await cli(['scan', '--config', join(dir, 'scan.config.json'), '--url', 'https://a.test/', '--out', runDir()]);
    assert.equal(file.code, 1);
    assert.match(file.stderr.buf, /scan\.config\.json → http\.timeoutMs = -1\n\s+Must be a positive integer \(got -1\)\./);

    const config = await cli(['scan', '--url', 'https://a.test/', '--out', runDir()], { config: { scan: { concurrency: 0 } } });
    assert.match(config.stderr.buf, /tool default → scan\.concurrency = 0\n\s+Must be a positive integer/);
});

test('the error block lists every problem and ends with the help hint', async () => {
    const { code, stderr } = await cli(['scan', '--concurency', '5', '--timeout', '-1', '--from-run', 'reports/old']);
    assert.equal(code, 1);
    assert.match(stderr.buf, /^✖ Invalid input \(3 problems\)\n\n/);
    assert.match(stderr.buf, /--concurency\n {4}Unknown flag\. Did you mean --concurrency\?/);
    assert.match(stderr.buf, /--timeout -1\n {4}"-1" is not an integer >= 1\.\n {4}Use a whole number >= 1\./);
    assert.match(stderr.buf, /--from-run\n {4}Requires --code or --exclude-code\.\n {4}Example: --from-run reports\/old --code engine\.fetch_failed/);
    assert.match(stderr.buf, /Run `t scan --help` for all options\.\n$/);
});

test('unknown command suggests the closest one', async () => {
    const { code, stderr } = await cli(['scna']);
    assert.equal(code, 1);
    assert.match(stderr.buf, /scna\n\s+Unknown command\. Did you mean scan\?/);
});

test('non-CliError failures are shown as a bug with the stack', async () => {
    const { code, stderr } = await cli(['scan', '--url', 'https://a.test/', '--out', runDir()], {
        extensions: [defineExtension({ id: 'mock', description: '', engine: '^0.2.0', setup() { throw new Error('plugin setup bug'); } })],
    });
    assert.equal(code, 1);
    assert.match(stderr.buf, /Unexpected error: plugin setup bug/);
    assert.match(stderr.buf, /This is a bug in t or the engine, please report it/);
});

test('stdout contract: only the written files and, last, the run location', async () => {
    const out = runDir();
    const { stdout, stderr } = await cli(['scan', '--sites', sitesCsv, '--out', out]);
    const lines = stdout.buf.trim().split('\n');
    assert.equal(lines.at(-1), out);
    assert.deepEqual(lines.slice(0, -1).map((l) => basename(l)), ['results.csv', 'findings.csv', 'summary.md']);
    assert.ok(stderr.buf.length > 0);
});

test('level matrix: default shows plan, progress and summary; quiet only the essentials; verbose adds per-page lines and timings', async () => {
    const run = (extra: string[]) => cli(['scan', '--sites', sitesCsv, '--out', runDir(), ...extra]);
    const normal = await run([]);
    assert.match(normal.stderr.buf, /Sites\s+4 from/);
    assert.match(normal.stderr.buf, /Done in .*· 3 pages/);
    assert.doesNotMatch(normal.stderr.buf, /^\[\d+\/\d+\]/m);
    assert.doesNotMatch(normal.stderr.buf, /Adapters\s/);

    const quiet = await run(['--quiet']);
    assert.equal(quiet.stderr.buf, '');
    assert.equal(quiet.stdout.buf.trim().split('\n').length, 4);

    const verbose = await run(['--verbose']);
    assert.match(verbose.stderr.buf, /^\[1\/3\]/m);
    assert.match(verbose.stderr.buf, /Adapters\s+title/);
});

test('notable events: the first fetch failure per type is listed once, adapter crashes always', async () => {
    const manyDns = ['https://c.test/', 'https://d.test/'].map((url) => `--url ${url}`).join(' ').split(' ');
    const { stderr } = await cli(['scan', ...manyDns, '--out', runDir()], { extensions: [mockExtension({})] });
    assert.equal((stderr.buf.match(/✖ adhoc-\d https:\/\/.*dns/g) ?? []).length, 1);
    assert.match(stderr.buf, /more dns will be counted, not listed/);
    assert.match(stderr.buf, /Failures\s+dns 2/);

    const verbose = await cli(['scan', ...manyDns, '--out', runDir(), '--verbose'], { extensions: [mockExtension({})] });
    assert.equal((verbose.stderr.buf.match(/✖ adhoc-\d https:\/\/.*dns/g) ?? []).length, 2);

    const crash = await cli(['scan', '--url', 'https://a.test/', '--out', runDir()], { adapters: [throwingAdapter] });
    assert.match(crash.stderr.buf, /✖ adapter boom crashed on https:\/\/a\.test\/: kaboom/);
});

test('warnings: the first 5 inline, the rest only counted in the summary; verbose shows all', async () => {
    const bad = Array.from({ length: 8 }, (_, i) => `{ "siteId": "", "url": "x${i}" }`).join(',');
    const { fakeSource } = await import('./fixtures/test-plugins.js');
    const sites = JSON.parse(`[${bad}, { "siteId": "1", "url": "https://a.test/", "isPublic": true, "isActive": true, "meta": {} }]`) as unknown[];
    const source = fakeSource('inline', sites);
    const normal = await cli(['scan', '--source', 'inline', '--out', runDir()], { sources: [source] });
    assert.equal((normal.stderr.buf.match(/^! Warning: inline: dropped site/gm) ?? []).length, 5);
    const verbose = await cli(['scan', '--source', 'inline', '--out', runDir(), '--verbose'], { sources: [source] });
    assert.equal((verbose.stderr.buf.match(/^! Warning: inline: dropped site/gm) ?? []).length, 8);
});

test('TTY progress redraws one live line; non-TTY prints plain periodic lines', async () => {
    const tty = await cli(['scan', '--sites', sitesCsv, '--filter', 'all', '--out', runDir()], { tty: true });
    // eslint-disable-next-line no-control-regex -- Verify the terminal's ANSI erase-line sequence.
    assert.match(tty.stderr.buf, /\r\u001B\[2K/);
    assert.match(tty.stderr.buf, /▕█+░*▏ · \d+% · \d+\/4/);

    const piped = await cli(['scan', '--sites', sitesCsv, '--filter', 'all', '--out', runDir()]);
    assert.doesNotMatch(piped.stderr.buf, /\r/);
    assert.doesNotMatch(piped.stderr.buf, /▕/);
    assert.match(piped.stderr.buf, /^100% · 4\/4 · .* p\/s · ETA .* · ✓ 2 ✖ 2 · findings: /m);
});

test('progress gates: redraw at most every 200 ms, periodic every 5% or 30 s, always at the end', () => {
    const redraw = new RedrawGate();
    assert.deepEqual([0, 100, 199, 200, 350, 400].map((t) => redraw.due(t)), [true, false, false, true, false, true]);
    assert.equal(new RedrawGate().due(0) && new RedrawGate().due(0, true), true);

    const periodic = new PeriodicGate();
    assert.equal(periodic.due(1, 100, 0), true, 'first line');
    assert.equal(periodic.due(3, 100, 1000), false, '2% later');
    assert.equal(periodic.due(6, 100, 2000), true, '5% later');
    assert.equal(periodic.due(7, 100, 40_000), true, '30 s later');
    assert.equal(periodic.due(100, 100, 40_001), true, 'always at the end');

    const line = renderProgress({ done: 2212, total: 4602, elapsedMs: 1_050_000, ok: 2180, failed: 32, errors: 410, warnings: 1022 }, createTheme(false), true);
    assert.equal(line, '▕█████████░░░░░░░░░░░▏ · 48% · 2,212/4,602 · 2.1 p/s · ETA 18m 54s · ✓ 2,180 ✖ 32 · findings: 410 err 1,022 warn');
});

test('summary: the Next line for each case', async () => {
    const failed = await cli(['scan', '--sites', sitesCsv, '--filter', 'all', '--out', runDir()]);
    assert.match(failed.stderr.buf, /Next\s+t scan --from-run .* --code engine\.fetch_failed/);

    const clean = await cli(['scan', '--url', 'https://a.test/', '--out', runDir()]);
    assert.doesNotMatch(clean.stderr.buf, /Next/);
    assert.match(clean.stderr.buf, /✔ Done in/);
});

test('fail-on prints the threshold line and exits 2', async () => {
    const { code, stderr } = await cli(['scan', '--url', 'https://b.test/', '--out', runDir(), '--fail-on', 'error']);
    assert.equal(code, 2);
    assert.match(stderr.buf, /✖ Threshold "error" reached → exit 2/);
});

test('--json: every stdout line parses, event types are in order, nothing decorative, stderr empty', async () => {
    const { stdout, stderr, code } = await cli(['scan', '--sites', sitesCsv, '--filter', 'all', '--out', runDir(), '--json']);
    assert.equal(code, 0);
    assert.equal(stderr.buf, '');
    const events = stdout.buf.trim().split('\n').map((line) => JSON.parse(line) as { type: string; ts: string });
    assert.ok(events.every((event) => typeof event.ts === 'string'));
    const types = events.map((event) => event.type);
    assert.equal(types[0], 'plan');
    assert.equal(types.at(-1), 'summary');
    assert.ok(types.includes('progress') && types.includes('target') && types.includes('notable'));
    assert.ok(types.indexOf('plan') < types.indexOf('progress') && types.lastIndexOf('progress') < types.indexOf('summary'));
    const summary = events.at(-1) as unknown as { pages: number; fetchFailed: number; location: string };
    assert.deepEqual([summary.pages, summary.fetchFailed], [4, 2], 'c.test and d.test are not mocked');
    assert.doesNotMatch(stdout.buf, ANSI);
});

test('--json errors carry the stable code and the same problems as the human error', async () => {
    const { stdout, code } = await cli(['scan', '--concurency', '5', '--json']);
    assert.equal(code, 1);
    const event = JSON.parse(stdout.buf.trim()) as { type: string; code: string; problems: Array<{ didYouMean?: string }> };
    assert.equal(event.type, 'error');
    assert.equal(event.code, ErrorCode.UnknownFlag);
    assert.equal(event.problems[0]?.didYouMean, '--concurrency');
});

test('--json internal bugs: structured event on stdout, stack on stderr', async () => {
    const { stdout, stderr, code } = await cli(['scan', '--url', 'https://a.test/', '--out', runDir(), '--json'], {
        extensions: [defineExtension({ id: 'mock', description: '', engine: '^0.2.0', setup() { throw new Error('plugin setup bug'); } })],
    });
    assert.equal(code, 1);
    const lines = stdout.buf.trim().split('\n');
    assert.equal(JSON.parse(lines[0] ?? '{}').type, 'plan', 'the plan was already printed when setup failed');
    assert.equal((JSON.parse(lines.at(-1) ?? '{}') as { code: string }).code, ErrorCode.Internal);
    assert.match(stderr.buf, /plugin setup bug/);
});

test('plugins lists every kind with engine range, description and option schemas', async () => {
    const { stdout, code } = await cli(['plugins']);
    assert.equal(code, 0);
    for (const heading of ['sources (2)', 'adapters (1)', 'reporters (3)', 'extensions (', 'stores (1)']) {
        assert.ok(stdout.buf.includes(heading), heading);
    }
    assert.match(stdout.buf, /retry {2}engine \^0\.2\.0/);
    assert.match(stdout.buf, /attempts \(integer, default 2\) Extra tries after the first/);
    assert.match(stdout.buf, /path \(string, required\)/);
    assert.match(stdout.buf, /title {2}engine \^0\.2\.0[\s\S]*no option schema/);

    const json = await cli(['plugins', '--json']);
    assert.equal((JSON.parse(json.stdout.buf.trim()) as { type: string }).type, 'plugins');
});

test('one Ctrl+C stops gracefully, writes the reports and exits 130; the summary offers --resume', async () => {
    const signals = new FakeSignals();
    const out = runDir();
    let fired = false;
    const interrupter = defineExtension({
        id: 'interrupter', description: '', engine: '^0.2.0',
        setup(api) { api.on('target:end', () => { if (!fired) { fired = true; signals.interrupt(); } }); },
    });
    const { code, stderr, stdout } = await cli(['scan', '--sites', sitesCsv, '--filter', 'all', '--concurrency', '1', '--out', out], {
        signals, extensions: [mockExtension(PAGES), interrupter], config: { scan: { delayMs: 0, extensions: ['mock', 'interrupter'] } },
    });
    assert.equal(code, 130);
    assert.match(stderr.buf, /Stopping… finishing \d+ pages? in flight \(Ctrl\+C again to force\)/);
    assert.match(stderr.buf, /■ Stopped after/);
    assert.match(stderr.buf, /Next\s+t scan --resume /);
    assert.match(stdout.buf, /results\.csv/);
    assert.equal(signals.listening, 0, 'the handler is removed afterwards');
});

test('a second Ctrl+C exits immediately with 130 without waiting for the scan', async () => {
    const signals = new FakeSignals();
    const stall = defineExtension({
        id: 'stall', description: '', engine: '^0.2.0',
        setup(api) {
            api.use('target', async () => {
                signals.interrupt();
                signals.interrupt();
                await new Promise((resolve) => setTimeout(resolve, 3000));
            });
        },
    });
    const started = Date.now();
    const { code, stdout } = await cli(['scan', '--url', 'https://a.test/', '--out', runDir()], {
        signals, extensions: [stall], config: { scan: { delayMs: 0, extensions: ['stall'] } },
    });
    assert.equal(code, 130);
    assert.ok(Date.now() - started < 2500, 'did not wait for the stalled page');
    assert.equal(stdout.buf, '', 'no reports were written');
});

test('built-in extensions run through the CLI: the default retry is active and retries a flaky page', async () => {
    let calls = 0;
    const flaky = defineExtension({
        id: 'flaky', description: '', engine: '^0.2.0',
        setup(api) {
            api.use('fetch', async (c) => {
                calls += 1;
                c.response = calls < 3
                    ? { ...fakeResponse(c.request, { html: '' }), status: 503 }
                    : fakeResponse(c.request, { html: '<title>A</title>' });
            });
        },
    });
    // No `scan.extensions` override: the engine default ['retry'] is in effect, plus the tool's own extension.
    const { code, stderr } = await cli(['scan', '--url', 'https://a.test/', '--out', runDir(), '--delay', '0'], {
        extensions: [flaky],
        config: { scan: { delayMs: 0, extensions: ['retry', 'flaky'], options: { retry: { backoffMs: 0 } } } },
    });
    assert.equal(code, 0, stderr.buf);
    assert.equal(calls, 3, 'two 503s were retried');
});

test('--out is a plain path relative to the cwd; only a generated name goes under output.dir', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'sse-cwd-'));
    const explicit = await cli(['scan', '--url', 'https://a.test/', '--out', 'my-run', '--reporters', ''], { cwd });
    assert.equal(explicit.stdout.buf.trim(), join(cwd, 'my-run'));

    const generated = await cli(['scan', '--url', 'https://a.test/', '--reporters', ''], { cwd });
    assert.match(generated.stdout.buf.trim(), new RegExp(`^${join(cwd, 'reports', 't-').replaceAll('\\', '\\\\')}\\d{8}-\\d{6}$`));
});
