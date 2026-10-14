import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fsStore } from '../src/index.js';
import type { RunStore } from '../src/index.js';
import { FsRunStore, fsRunLocation } from '../src/storage/fs-store.js';
import { MemoryRunStore } from './fixtures/memory-store.js';
import { recordOf } from './fixtures/test-plugins.js';
import { runConformance } from './store-conformance.js';

runConformance({
    name: 'fs store',
    makeStore: () => new FsRunStore(join(mkdtempSync(join(tmpdir(), 'sse-store-')), 'run')),
    reopen: (store) => new FsRunStore(store.location),
    corruptTail: (store) => appendFileSync(join(store.location, 'raw.jsonl'), '{"siteId":"tru'),
});

runConformance({
    name: 'memory store',
    makeStore: () => new MemoryRunStore('mem'),
    reopen: (store) => store,
    corruptTail: (store) => { (store as MemoryRunStore).lines.push('{"siteId":"tru'); },
});

test('fs store: on-disk layout is run.json + raw.jsonl with one JSON record per line', async () => {
    const store: RunStore = fsStore.open({ runId: join(mkdtempSync(join(tmpdir(), 'sse-layout-')), 'r'), options: {}, baseDir: '.' });
    await store.create({
        tool: 't', adapterIds: ['a'], engineVersion: '0.2.0', recordSchemaVersion: 1, startedAt: 'x', baseDir: '.',
        config: JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'scan.config.example.json'), 'utf8')) as never,
    });
    await store.append(recordOf('1', '/'));
    assert.deepEqual(readFileSync(join(store.location, 'raw.jsonl'), 'utf8').split('\n').map((l) => l === '' ? '' : (JSON.parse(l) as { siteId: string }).siteId), ['1', '']);
    assert.equal(JSON.parse(readFileSync(join(store.location, 'run.json'), 'utf8')).recordSchemaVersion, 1);
});

test('fs store: records() streams — the first record is available before the rest of a 10k-record file is consumed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sse-big-'));
    const lines: string[] = [];
    for (let i = 1; i <= 10_000; i += 1) {
        lines.push(JSON.stringify(recordOf(String(i), '/')));
    }
    writeFileSync(join(dir, 'raw.jsonl'), `${lines.join('\n')}\n`);

    const iterator = new FsRunStore(dir).records()[Symbol.asyncIterator]();
    const first = await iterator.next();
    assert.equal(first.done, false);
    assert.equal(first.value?.siteId, '1');
    await iterator.return?.(undefined);

    let count = 0;
    for await (const _ of new FsRunStore(dir).records()) { count += 1; }
    assert.equal(count, 10_000);
});

test('fs store source: records() goes through a read stream, never readFileSync on raw.jsonl', () => {
    const source = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'storage', 'fs-store.ts'), 'utf8');
    const body = source.slice(source.indexOf('async *records()'), source.indexOf('async writeArtifact'));
    assert.match(body, /createReadStream/);
    assert.doesNotMatch(body, /readFileSync/);
});

test('fs store: run locations — bare name under dir, path relative to baseDir, absolute as is', () => {
    const open = (runId: string) => fsRunLocation({ runId, options: { dir: 'reports' }, baseDir: '/work' });
    assert.equal(open('seo-20260101-000000'), resolve('/work', 'reports', 'seo-20260101-000000'));
    assert.equal(open('./runs/a'), resolve('/work', 'runs', 'a'));
    assert.equal(open('runs/a'), resolve('/work', 'runs', 'a'));
    assert.equal(open('/abs/run'), '/abs/run');
    assert.equal(fsRunLocation({ runId: 'run', options: {}, baseDir: '/work' }), resolve('/work', 'run'), 'a user-supplied bare name is relative to the cwd, as before 0.2');
});

test('fs store: appending to a run with a truncated tail repairs it first', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'sse-tail-')), 'r');
    const first = new FsRunStore(dir);
    await first.create({ tool: 't', adapterIds: [], engineVersion: '0.2.0', recordSchemaVersion: 1, startedAt: 'x', baseDir: '.', config: {} as never });
    await first.append(recordOf('1', '/'));
    appendFileSync(join(dir, 'raw.jsonl'), '{"siteId":"tru');
    const resumed = new FsRunStore(dir);
    await resumed.append(recordOf('2', '/'));
    assert.equal(existsSync(join(dir, 'raw.jsonl')), true);
    const ids: string[] = [];
    for await (const r of resumed.records()) { ids.push(r.siteId); }
    assert.deepEqual(ids, ['1', '2']);
});
