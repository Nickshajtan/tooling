import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runPool } from '../src/scan/pool.js';

const tick = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

test('never exceeds concurrency and yields all results', async () => {
    let active = 0;
    let peak = 0;
    const out: number[] = [];
    for await (const v of runPool([1, 2, 3, 4, 5, 6, 7], async (n: number) => {
        active += 1;
        peak = Math.max(peak, active);
        await tick(10);
        active -= 1;

        return n;
    }, { concurrency: 3 })) {
        out.push(v);
    }
    assert.equal(peak, 3);
    assert.deepEqual(out.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
});

test('abort stops dispatch but finishes in-flight', async () => {
    const controller = new AbortController();
    const started: number[] = [];
    const out: number[] = [];
    for await (const v of runPool([1, 2, 3, 4, 5, 6], async (n: number) => {
        started.push(n);
        await tick(10);

        return n;
    }, { concurrency: 2, signal: controller.signal })) {
        out.push(v);
        controller.abort();
    }
    assert.ok(out.length < 6);
    assert.equal(out.length, started.length);
});

test('worker error propagates', async () => {
    await assert.rejects(async () => {
        for await (const _ of runPool([1, 2], async (): Promise<never> => { throw new Error('x'); })) { /* drain */ }
    }, /x/);
});
