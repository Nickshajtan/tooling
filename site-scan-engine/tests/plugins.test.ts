import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineAdapter, defineReporter, defineSource } from '../src/index.js';
import type { Reporter, SiteSource } from '../src/index.js';
import { createRegistry } from '../src/plugins/registry.js';
import { satisfies } from '../src/shared/semver.js';
import { unsafeNameProblems } from '../src/shared/safe-name.js';
import { validateSite } from '../src/input/validate-site.js';
import { ENGINE_RANGE, listReporter } from './fixtures/test-plugins.js';

const source = (over: Record<string, unknown> = {}): SiteSource =>
    ({ id: 'mine', description: 'd', engine: ENGINE_RANGE, load: async () => [], ...over }) as SiteSource;

test('defineSource rejects bad shapes with every problem listed', () => {
    assert.throws(() => defineSource(source({ id: 'Bad_ID', load: 'no' })), /id must be lowercase kebab-case; load must be a function/);
    assert.throws(() => defineSource(source({ description: 5 })), /description must be a string/);
});

test('plugins need a compatible engine range', () => {
    assert.throws(() => defineSource(source({ engine: undefined })), /engine must be a semver range/);
    assert.throws(() => defineSource(source({ engine: '^0.3.0' })), /not compatible with engine 0\.2\.0/);
    assert.throws(() => defineSource(source({ engine: '>=0.2.0' })), /Unsupported version range/);
    assert.doesNotThrow(() => defineSource(source({ engine: '0.2.0' })));
});

test('defineReporter needs exactly one mode', () => {
    const base = { id: 'r', description: 'd', engine: ENGINE_RANGE };
    assert.throws(() => defineReporter(base as Reporter), /implement render or open/);
    assert.throws(() => defineReporter({ ...base, render: () => [], open: () => ({ write() {}, close: () => [] }) }), /either render or open, not both/);
});

test('defineAdapter now requires an engine range too', () => {
    assert.throws(() => defineAdapter({ id: 'a', description: '', columns: [], scan: async () => ({ row: {}, findings: [] }) } as never), /engine must be a semver range/);
});

test('an id may not collide with a built-in of the same kind, but may across kinds', () => {
    assert.throws(() => defineSource(source({ id: 'csv' })), /reserved by a built-in source/);
    assert.throws(() => defineReporter(listReporter('summary-md', 'x') as Reporter & { id: 'summary-md' }), /reserved by a built-in reporter/);
    assert.doesNotThrow(() => defineSource(source({ id: 'summary-md' })));
    assert.doesNotThrow(() => defineAdapter({ id: 'csv', description: '', engine: ENGINE_RANGE, columns: [], scan: async () => ({ row: {}, findings: [] }) }));
});

test('registry rejects duplicate tool plugin ids', () => {
    assert.throws(() => createRegistry({ sources: [defineSource(source()), defineSource(source())] }), /Duplicate plugin id "mine"/);
    assert.deepEqual(createRegistry({ sources: [defineSource(source())] }).sources.ids(), ['csv', 'url', 'mine']);
});

test('semver: exact and caret only, 0.x pinned to the minor', () => {
    assert.equal(satisfies('^0.2.0', '0.2.0'), true);
    assert.equal(satisfies('^0.2.0', '0.2.9'), true);
    assert.equal(satisfies('^0.2.0', '0.3.0'), false);
    assert.equal(satisfies('^0.2.3', '0.2.2'), false);
    assert.equal(satisfies('^1.2.0', '1.9.0'), true);
    assert.equal(satisfies('^1.2.0', '2.0.0'), false);
    assert.equal(satisfies('^0.0.3', '0.0.3'), true);
    assert.equal(satisfies('^0.0.3', '0.0.4'), false);
    assert.equal(satisfies('0.2.0', '0.2.0'), true);
    assert.equal(satisfies('0.2.0', '0.2.1'), false);
    for (const range of ['~0.2.0', '>=0.2.0', '0.2', '*', '^0.2', '']) {
        assert.throws(() => satisfies(range, '0.2.0'), TypeError, range);
    }
    assert.throws(() => satisfies('^0.2.0', 'banana'), TypeError);
});

test('report file names: relative and inside the run only', () => {
    for (const ok of ['results.csv', 'jira/import.csv']) {
        assert.deepEqual(unsafeNameProblems(ok), [], ok);
    }
    for (const bad of ['', '/etc/passwd', 'C:\\x', '../x', 'a/../../x', 'run.json', 'raw.jsonl', 'a//b']) {
        assert.notDeepEqual(unsafeNameProblems(bad), [], bad);
    }
});

test('validateSite keeps valid sites frozen and explains every problem', () => {
    const ok = validateSite({ siteId: '1', url: 'https://a.test/', isPublic: true, isActive: true, meta: { region: 'emea' } });
    assert.ok('site' in ok);
    assert.ok(Object.isFrozen(ok.site) && Object.isFrozen(ok.site.meta));

    const bad = validateSite({ siteId: '', url: 'nope', isPublic: 'yes', isActive: true, meta: { 'Bad Key': 'x', fine: 3 } });
    assert.ok('problems' in bad);
    assert.equal(bad.problems.length, 5);
    assert.ok('problems' in validateSite(null));
});
