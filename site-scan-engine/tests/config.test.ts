import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULTS, loadConfigFile, mergeConfig, validateConfig } from '../src/index.js';
import type { PartialScanConfig } from '../src/index.js';
import { fixturePath } from './support/fixture-path.js';

test('DEFAULTS are frozen and valid', () => {
    assert.ok(Object.isFrozen(DEFAULTS.http));
    assert.deepEqual(validateConfig(mergeConfig()), []);
});

test('layers merge deeply; later wins; undefined does not override', () => {
    const merged = mergeConfig(
        { scan: { concurrency: 5, paths: ['/a/'] } },
        { scan: { delayMs: 0, concurrency: undefined }, adapters: { seo: { x: 1 } } },
    );
    assert.equal(merged.scan.concurrency, 5);
    assert.equal(merged.scan.delayMs, 0);
    assert.equal(merged.http.timeoutMs, DEFAULTS.http.timeoutMs);
    assert.deepEqual(merged.scan.paths, ['/a/']);
    assert.deepEqual(merged.adapters, { seo: { x: 1 } });
});

test('merge does not mutate DEFAULTS or input layers', () => {
    const layer: PartialScanConfig = { sites: { siteIds: ['1'] } };
    const merged = mergeConfig(layer);
    (merged.sites.siteIds as string[]).push('2');
    assert.deepEqual(layer.sites?.siteIds, ['1']);
    assert.deepEqual(DEFAULTS.sites.siteIds, []);
});

test('validation reports typos, bad values and unknown adapters together', () => {
    const problems = validateConfig(mergeConfig({ http: { concurency: 2 } } as unknown as PartialScanConfig));
    assert.deepEqual(problems, ['unknown config key "http.concurency"']);

    const more = validateConfig(
        mergeConfig({ scan: { paths: ['no-slash'], concurrency: 0 }, failOn: 'info', adapters: { nope: {} } } as unknown as PartialScanConfig),
        { adapterIds: ['seo'] },
    );
    assert.equal(more.length, 4);
    assert.match(more.join('\n'), /scan\.paths must/);
    assert.match(more.join('\n'), /scan\.concurrency must be a positive integer/);
    assert.match(more.join('\n'), /failOn/);
    assert.match(more.join('\n'), /adapters\.nope: no such adapter/);
});

test('loadConfigFile resolves output.dir only and reports baseDir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sse-lc-'));
    writeFileSync(join(dir, 'c.json'), JSON.stringify({ sites: { options: { csv: { path: 'sites.local.csv' } } }, output: { dir: 'r' } }));
    const { config, baseDir } = loadConfigFile(join(dir, 'c.json'));
    assert.equal(baseDir, dir);
    assert.deepEqual(config.sites?.options, { csv: { path: 'sites.local.csv' } }, 'plugin options are left for the plugin to resolve');
    assert.equal(config.output?.dir, join(dir, 'r'));
});

test('loadConfigFile gives a clear error for broken JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sse-lc-'));
    writeFileSync(join(dir, 'c.json'), '{ nope');
    assert.throws(() => loadConfigFile(join(dir, 'c.json')), /Cannot read config/);
});

test('shipped example config is valid', () => {
    const example = JSON.parse(readFileSync(join(fixturePath('..'), '..', 'scan.config.example.json'), 'utf8')) as PartialScanConfig;
    assert.deepEqual(validateConfig(mergeConfig(example)), []);
});

test('removed and moved keys explain the replacement', () => {
    const layer = { sites: { csv: 'a.csv', urls: [], blogIds: [] }, paths: ['/'], http: { concurrency: 2, delayMs: 1 } } as unknown as PartialScanConfig;
    const problems = validateConfig(mergeConfig(layer)).join('\n');
    assert.match(problems, /"sites\.csv" was removed: use sites\.source="csv" \+ sites\.options\.csv\.path/);
    assert.match(problems, /"sites\.urls" was removed: use sites\.source="url" \+ sites\.options\.url\.urls/);
    assert.match(problems, /"sites\.blogIds" was removed: use sites\.siteIds/);
    assert.match(problems, /"paths" was removed: moved to scan\.paths/);
    assert.match(problems, /"http\.concurrency" was removed: moved to scan\.concurrency/);
});

test('http.headers are lowercased on merge, and user-agent in headers is a config error pointing at userAgent', () => {
    const merged = mergeConfig({ http: { headers: { 'Cache-Control': 'max-age=0', 'X-Env': 'stg' } } });
    assert.equal(merged.http.headers['cache-control'], 'max-age=0');
    assert.equal(merged.http.headers['x-env'], 'stg');
    assert.deepEqual(validateConfig(merged), []);
    const bad = validateConfig(mergeConfig({ http: { headers: { 'User-Agent': 'x' } } }));
    assert.deepEqual(bad, ['http.headers must not set user-agent; use http.userAgent']);
});

test('unknown extension, source and reporter ids list the known ids', () => {
    const problems = validateConfig(
        mergeConfig({ sites: { source: 'nope' }, scan: { extensions: ['gone'] }, output: { reporters: ['zip'] } }),
        { sourceIds: ['csv', 'url'], extensionIds: ['retry'], reporterIds: ['results-csv'] },
    );
    assert.deepEqual(problems, [
        'sites.source: no such source "nope" (known: csv, url)',
        'scan.extensions: no such extension "gone" (known: retry)',
        'output.reporters: no such reporter "zip" (known: results-csv)',
    ]);
});

test('retry is on by default', () => {
    assert.deepEqual(DEFAULTS.scan.extensions, ['retry']);
});
