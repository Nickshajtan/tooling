/**
 * Conformance suite every RunStore implementation must pass (the built-in `fs` store, the in-memory fixture, and
 * any future plugin). `makeStore` must return a store pointing at a fresh, empty location each time. `corruptTail`
 * appends a partially written final record the way a crash would, in whatever way that backend can be interrupted.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENGINE_VERSION } from '../src/shared/version.js';
import { DEFAULTS } from '../src/config/index.js';
import { RECORD_SCHEMA_VERSION } from '../src/index.js';
import type { RunMeta, RunStore } from '../src/index.js';
import { recordOf } from './fixtures/test-plugins.js';

export interface ConformanceTarget {
    readonly name: string;
    makeStore(): RunStore;
    /** A second, independent handle on the same location (a new process, as far as the backend can tell). */
    reopen(store: RunStore): RunStore;
    /** Leaves a truncated final record behind, as an interrupted append would. Optional only for stores that cannot truncate. */
    corruptTail(store: RunStore): Promise<void> | void;
}

const META: RunMeta = {
    tool: 't', adapterIds: ['a'], engineVersion: ENGINE_VERSION, recordSchemaVersion: RECORD_SCHEMA_VERSION,
    startedAt: '2026-01-01T00:00:00.000Z', baseDir: '.', config: { ...DEFAULTS },
};

async function collect(store: RunStore): Promise<string[]> {
    const ids: string[] = [];
    for await (const record of store.records()) {
        ids.push(`${record.siteId}|${record.path}`);
    }

    return ids;
}

export function runConformance({ name, makeStore, reopen, corruptTail }: ConformanceTarget): void {
    test(`${name}: a new location has no run`, async () => {
        const store = makeStore();
        assert.equal(await store.exists(), false);
        assert.equal(await store.readMeta(), null);
        assert.deepEqual(await collect(store), []);
    });

    test(`${name}: create then readMeta round-trips and the run exists`, async () => {
        const store = makeStore();
        await store.create(META);
        assert.equal(await store.exists(), true);
        assert.deepEqual(await store.readMeta(), META);
        assert.ok(store.location.length > 0);
    });

    test(`${name}: create over an existing run is an error`, async () => {
        const store = makeStore();
        await store.create(META);
        await assert.rejects(store.create(META), /already exists/);
    });

    test(`${name}: records come back in append order, each exactly once`, async () => {
        const store = makeStore();
        await store.create(META);
        for (const [id, path] of [['801', '/'], ['2', '/x'], ['2', '/'], ['10', '/']] as const) {
            await store.append(recordOf(id, path));
        }
        assert.deepEqual(await collect(store), ['801|/', '2|/x', '2|/', '10|/']);
        assert.deepEqual(await collect(store), ['801|/', '2|/x', '2|/', '10|/'], 'records() can be read again');
    });

    test(`${name}: a truncated final record is dropped silently and the next append survives`, async () => {
        const store = makeStore();
        await store.create(META);
        await store.append(recordOf('1', '/'));
        await corruptTail(store);
        // A crash means a new process: resuming opens the location again and appends through the new handle.
        const resumed = reopen(store);
        assert.deepEqual(await collect(resumed), ['1|/']);
        await resumed.append(recordOf('2', '/'));
        assert.deepEqual(await collect(resumed), ['1|/', '2|/']);
    });

    test(`${name}: appended records are durable for a second reader before append resolves`, async () => {
        const store = makeStore();
        await store.create(META);
        await store.append(recordOf('1', '/'));
        assert.deepEqual(await collect(reopen(store)), ['1|/']);
        assert.deepEqual(await reopen(store).readMeta(), META);
    });

    test(`${name}: artifacts round-trip and unsafe names are rejected`, async () => {
        const store = makeStore();
        await store.create(META);
        const location = await store.writeArtifact({ name: 'jira/import.csv', content: 'a,b\n' });
        assert.match(location, /jira[\\/]import\.csv$/);
        for (const bad of ['/etc/passwd', '../escape.csv', 'run.json', 'raw.jsonl', '']) {
            await assert.rejects(store.writeArtifact({ name: bad, content: 'x' }), /Unsafe artifact name/, bad);
        }
    });
}
