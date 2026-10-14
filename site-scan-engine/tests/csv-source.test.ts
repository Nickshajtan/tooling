import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { csvSource, urlSource } from '../src/index.js';
import { DEFAULT_CSV_COLUMNS, metaKeyFromHeader, sitesFromCsv } from '../src/input/sources/csv.js';

const signal = new AbortController().signal;

test('default mapping reads a wp site list export; flags decide active/public', () => {
    const csv = 'blog_id,url,public,archived,spam,deleted\n1,https://a.test/,1,0,0,0\n5,https://c.test/,0,0,0,0\n9,https://d.test/,1,1,0,0\n';
    const sites = sitesFromCsv(csv, DEFAULT_CSV_COLUMNS, []);
    assert.deepEqual(sites.map((s) => [s.siteId, s.isActive, s.isPublic]), [['1', true, true], ['5', true, false], ['9', false, false]]);
});

test('missing flag columns mean active and public', () => {
    const [site] = sitesFromCsv('blog_id,url\n7,https://a.test/\n', DEFAULT_CSV_COLUMNS, []);
    assert.deepEqual([site?.isActive, site?.isPublic], [true, true]);
});

test('quoted fields with commas and quotes survive', () => {
    const [site] = sitesFromCsv('blog_id,url,blogname\n1,https://a.test/,"Golf, ""Now"""\n', DEFAULT_CSV_COLUMNS, ['blogname']);
    assert.equal(site?.meta.blogname, 'Golf, "Now"');
});

test('custom column names map onto Site fields', () => {
    const columns = { ...DEFAULT_CSV_COLUMNS, siteId: 'id', url: 'address', public: 'visible' };
    const sites = sitesFromCsv('id,address,visible\n1,https://a.test/,0\n', columns, []);
    assert.deepEqual([sites[0]?.siteId, sites[0]?.url, sites[0]?.isPublic], ['1', 'https://a.test/', false]);
});

test('meta list copies chosen headers; "*" copies every unused column; keys are normalised', () => {
    const csv = 'blog_id,url,Site Name,region\n1,https://a.test/,Alpha,emea\n';
    assert.deepEqual(sitesFromCsv(csv, DEFAULT_CSV_COLUMNS, ['Site Name'])[0]?.meta, { site_name: 'Alpha' });
    assert.deepEqual(sitesFromCsv(csv, DEFAULT_CSV_COLUMNS, ['*'])[0]?.meta, { site_name: 'Alpha', region: 'emea' });
    assert.equal(metaKeyFromHeader('Site-Name 2'), 'site_name_2');
});

test('missing required columns give a clear error naming them', () => {
    assert.throws(() => sitesFromCsv('x,y\n1,2\n', DEFAULT_CSV_COLUMNS, []), /must have "blog_id" and "url" columns/);
});

test('the source resolves path against baseDir and validates its options', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sse-csv-'));
    writeFileSync(join(dir, 'sites.csv'), 'blog_id,url\n1,https://a.test/\n');
    const sites = await csvSource.load({ options: { path: 'sites.csv' }, baseDir: dir, signal });
    assert.equal((sites as readonly unknown[]).length, 1);

    await assert.rejects((async () => csvSource.load({ options: {}, baseDir: dir, signal }))(), /needs sites\.options\.csv\.path/);
    await assert.rejects((async () => csvSource.load({ options: { path: 'sites.csv', columns: { nope: 'x' } }, baseDir: dir, signal }))(), /unknown key "nope"/);
});

test('url source numbers ad-hoc sites and rejects bad URLs', async () => {
    const sites = await urlSource.load({ options: { urls: ['https://a.test/', 'https://b.test/'] }, baseDir: '.', signal });
    assert.deepEqual((sites as readonly { siteId: string }[]).map((s) => s.siteId), ['adhoc-1', 'adhoc-2']);
    await assert.rejects((async () => urlSource.load({ options: { urls: ['nope'] }, baseDir: '.', signal }))(), /Invalid --url/);
});
