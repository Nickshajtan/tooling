import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { DEFAULTS, mergeConfig } from '../src/index.js';
import { COERCERS } from '../src/cli/args/coercers.js';
import { CommandName, FlagType } from '../src/cli/args/flag-spec.js';
import { FLAGS, flagsFor } from '../src/cli/args/flags.js';
import { parseArgs } from '../src/cli/args/parse.js';
import { configFromFlags } from '../src/cli/args/to-config.js';
import { CliError, ErrorCode } from '../src/cli/errors.js';
import { helpText } from '../src/cli/help.js';
import { didYouMean, editDistance } from '../src/shared/did-you-mean.js';

const COMMAND_HANDLED = new Set(['config', 'out', 'resume', 'from-run', 'code', 'exclude-code', 'sites', 'url', 'source-opt', 'opt', 'quiet', 'verbose', 'json', 'no-color', 'dry-run', 'help']);

function dotted(value: unknown, path: string): boolean {
    let node: unknown = value;
    for (const key of path.split('.')) {
        if (typeof node !== 'object' || node === null || !(key in node)) {
            return false;
        }
        node = (node as Record<string, unknown>)[key];
    }

    return true;
}

test('flag table: every flag maps to a real config path or is handled by its command', () => {
    for (const flag of FLAGS) {
        if (flag.config) {
            assert.ok(dotted(DEFAULTS, flag.config), `${flag.name} → ${flag.config} exists in DEFAULTS`);
        } else {
            assert.ok(COMMAND_HANDLED.has(flag.name) || flag.name === 'source', `${flag.name} has no config path and is not listed as command-handled`);
        }
        assert.ok(flag.commands.length > 0, flag.name);
        assert.ok(COERCERS[flag.type], flag.name);
        assert.ok(flag.summary.length > 0, flag.name);
    }
    assert.equal(new Set(FLAGS.map((flag) => flag.name)).size, FLAGS.length, 'unique names');
    assert.equal(new Set(FLAGS.flatMap((flag) => (flag.short ? [flag.short] : []))).size, FLAGS.filter((flag) => flag.short).length, 'unique shorts');
    for (const flag of FLAGS) {
        for (const other of [...(flag.requires ?? []), ...(flag.conflictsWith ?? [])]) {
            assert.ok(FLAGS.some((candidate) => candidate.name === other), `${flag.name} refers to unknown flag ${other}`);
        }
        if (flag.type === FlagType.ENUM) {
            assert.ok((flag.enumValues ?? []).length > 0, flag.name);
        }
    }
});

test('--help is generated from the table: every flag of a command is listed with its summary', () => {
    for (const command of Object.values(CommandName)) {
        const text = helpText('t', ['title'], command);
        for (const flag of flagsFor(command)) {
            assert.match(text, new RegExp(`--${flag.name}\\b`), `${command} help lists --${flag.name}`);
            assert.ok(text.includes(flag.summary), `${command} help shows the summary of --${flag.name}`);
        }
    }
    const top = helpText('t', ['title']);
    for (const command of Object.values(CommandName)) {
        assert.match(top, new RegExp(`t ${command}\\b`));
    }
    assert.match(helpText('t', ['title'], CommandName.SCAN), /\(default: 3\)/);
});

test('help snapshot: scan --help is stable', () => {
    const text = helpText('t', ['title'], CommandName.SCAN);
    assert.match(text, /^Fetch every site once, run the checks, write the reports\.\n\nUsage:\n {2}t scan \[--config <file\.json>\] \[options\]\n {2}t scan --resume <run>\n\nTargets\n/);
    assert.match(text, /Scanning\n {2}.*--paths \/,\/tee-times\/ +Paths fetched on every site \(default: \/\)/);
    assert.match(text, /General\n/);
});

test('parser coerces by the table: integers, lists, repeatable flags, booleans, = syntax, short flags', () => {
    const { flags, positionals } = parseArgs(['--concurrency', '5', '--paths=/,/a/', '--url', 'https://a.test/', '--url', 'https://b.test/', '--verbose', '-c', 'x.json', 'extra'], CommandName.SCAN);
    assert.equal(flags.integer('concurrency'), 5);
    assert.deepEqual(flags.strings('paths'), ['/', '/a/']);
    assert.deepEqual(flags.strings('url'), ['https://a.test/', 'https://b.test/']);
    assert.equal(flags.flag('verbose'), true);
    assert.equal(flags.string('config'), 'x.json');
    assert.deepEqual(positionals, ['extra']);
});

test('flags map to config generically and layer under the right paths', () => {
    const { flags } = parseArgs(['--concurrency', '7', '--delay', '0', '--timeout', '900', '--filter', 'public', '--site-ids', '1,2', '--reporters', 'results-csv', '--fail-on', 'warning', '--limit', '3', '--paths', '/x/'], CommandName.SCAN);
    const config = mergeConfig(configFromFlags(flags, 'csv', '/work'));
    assert.equal(config.scan.concurrency, 7);
    assert.equal(config.scan.delayMs, 0);
    assert.equal(config.http.timeoutMs, 900);
    assert.equal(config.sites.filter, 'public');
    assert.deepEqual(config.sites.siteIds, ['1', '2']);
    assert.deepEqual(config.output.reporters, ['results-csv']);
    assert.equal(config.failOn, 'warning');
    assert.equal(config.sites.limit, 3);
    assert.deepEqual(config.scan.paths, ['/x/']);
});

test('--sites / --url / --source / --source-opt / --opt build the source and adapter config', () => {
    const csv = mergeConfig(configFromFlags(parseArgs(['--sites', 'a.csv', '--source-opt', 'meta=region'], CommandName.SCAN).flags, 'csv', '/work'));
    assert.equal(csv.sites.source, 'csv');
    assert.equal((csv.sites.options.csv as { path: string }).path, resolve('/work', 'a.csv'), 'relative to the CLI cwd, not process.cwd()');
    assert.equal((csv.sites.options.csv as { meta: unknown }).meta, 'region');

    const url = mergeConfig(configFromFlags(parseArgs(['--url', 'https://a.test/'], CommandName.SCAN).flags, 'csv', '/work'));
    assert.equal(url.sites.source, 'url');
    assert.deepEqual((url.sites.options.url as { urls: string[] }).urls, ['https://a.test/']);

    const custom = mergeConfig(configFromFlags(parseArgs(['--source', 'wp', '--source-opt', 'limit=5', '--source-opt', 'live=true', '--opt', 'seo.maxTitle=60'], CommandName.SCAN).flags, 'csv', '/work'));
    assert.equal(custom.sites.source, 'wp');
    assert.deepEqual(custom.sites.options.wp, { limit: 5, live: true });
    assert.deepEqual(custom.adapters.seo, { maxTitle: 60 });

    const fallback = mergeConfig(configFromFlags(parseArgs(['--source-opt', 'k=v'], CommandName.SCAN).flags, 'csv', '/work'));
    assert.deepEqual(fallback.sites.options.csv, { k: 'v' }, 'goes to the source selected by lower layers');
});

function problemsOf(argv: string[], command: CommandName = CommandName.SCAN): CliError {
    try {
        parseArgs(argv, command);
    } catch (err) {
        assert.ok(err instanceof CliError);

        return err;
    }
    throw new Error('expected a CliError');
}

test('every parser ErrorCode is reachable, and several problems are reported together', () => {
    const unknown = problemsOf(['--concurency', '5']);
    assert.equal(unknown.code, ErrorCode.UnknownFlag);
    assert.equal(unknown.problems[0]?.didYouMean, '--concurrency');

    assert.equal(problemsOf(['--resume', 'x'], CommandName.REPORT).code, ErrorCode.FlagNotForCommand);
    assert.equal(problemsOf(['--concurrency', 'many']).code, ErrorCode.BadFlagValue);
    assert.equal(problemsOf(['--concurrency', '0']).code, ErrorCode.BadFlagValue, 'min 1');
    assert.equal(problemsOf(['--filter', 'pubic']).problems[0]?.didYouMean, 'public');
    assert.equal(problemsOf(['--from-run', 'old']).code, ErrorCode.MissingRequiredFlag);
    assert.equal(problemsOf(['--quiet', '--verbose']).code, ErrorCode.ConflictingFlags);
    assert.equal(problemsOf(['--concurrency']).code, ErrorCode.BadFlagValue, 'missing value');
    assert.equal(problemsOf(['--url', 'nope']).code, ErrorCode.BadFlagValue);
    assert.equal(problemsOf(['--paths', ',']).code, ErrorCode.BadFlagValue);
    assert.equal(problemsOf(['--out', 'a', '--out', 'b']).code, ErrorCode.BadFlagValue, 'not repeatable');

    const many = problemsOf(['--concurency', '5', '--timeout', '-1', '--from-run', 'old']);
    assert.equal(many.problems.length, 3);
    assert.deepEqual(many.problems.map((p) => p.where), ['--concurency', '--timeout -1', '--from-run']);
});

test('--reporters accepts an empty list (no reporters)', () => {
    assert.deepEqual(parseArgs(['--reporters', ''], CommandName.SCAN).flags.strings('reporters'), []);
});

test('did-you-mean: edit distance <= 2 against the valid set', () => {
    assert.equal(editDistance('kitten', 'sitting'), 3);
    assert.equal(didYouMean('scna', ['scan', 'report']), 'scan');
    assert.equal(didYouMean('reprot', ['scan', 'report']), 'report');
    assert.equal(didYouMean('zzzzzz', ['scan', 'report']), undefined);
    assert.equal(didYouMean('SCAN', ['scan']), 'scan', 'case-insensitive');
});

test('docs/cli.md flag tables are up to date with the flag table (run `npm run docs:cli`)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { FLAG_DOCS_BEGIN, FLAG_DOCS_END, renderFlagDocs } = await import('../src/cli/args/flag-docs.js');
    const { packageRoot } = await import('../src/shared/package-root.js');
    const doc = readFileSync(join(packageRoot(), 'docs', 'cli.md'), 'utf8');
    const generated = doc.slice(doc.indexOf(FLAG_DOCS_BEGIN), doc.indexOf(FLAG_DOCS_END) + FLAG_DOCS_END.length);
    assert.equal(generated, renderFlagDocs());
    assert.doesNotMatch(generated.replaceAll('\\|', ''), /\| (all|error)\|/, 'enum placeholders are escaped');
});
