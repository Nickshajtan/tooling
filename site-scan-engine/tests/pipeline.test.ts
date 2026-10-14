import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Middleware } from '../src/index.js';
import { compose, PipelineError, type TaggedMiddleware } from '../src/scan/pipeline.js';

type Ctx = { log: string[] };

const tag = (extensionId: string, run: Middleware<Ctx>): TaggedMiddleware<Ctx> => ({ extensionId, stage: 'target', run });
const logging = (id: string): TaggedMiddleware<Ctx> =>
    tag(id, async (c, next) => { c.log.push(`${id}-in`); await next(); c.log.push(`${id}-out`); });

test('onion order: in outermost-first, out innermost-first, core in the middle', async () => {
    const ctx: Ctx = { log: [] };
    await compose<Ctx>('target', [logging('a'), logging('b')], async (c) => { c.log.push('core'); })(ctx);
    assert.deepEqual(ctx.log, ['a-in', 'b-in', 'core', 'b-out', 'a-out']);
});

test('not calling next() short-circuits the rest, core included', async () => {
    const ctx: Ctx = { log: [] };
    const stop = tag('stop', async (c) => { c.log.push('stop'); });
    await compose<Ctx>('target', [logging('a'), stop, logging('never')], async (c) => { c.log.push('core'); })(ctx);
    assert.deepEqual(ctx.log, ['a-in', 'stop', 'a-out']);
});

test('next() may be called again after it settled (retry), but not while still running', async () => {
    const ctx: Ctx = { log: [] };
    const twice = tag('twice', async (c, next) => { await next(); await next(); c.log.push('done'); });
    await compose<Ctx>('target', [twice], async (c) => { c.log.push('core'); })(ctx);
    assert.deepEqual(ctx.log, ['core', 'core', 'done']);

    const overlapping = tag('overlap', async (_c, next) => { await Promise.all([next(), next()]); });
    await assert.rejects(compose<Ctx>('target', [overlapping], async () => {})({ log: [] }), /still running/);
});

test('an error is attributed to the middleware that threw', async () => {
    const boom = tag('boom', async () => { throw new Error('bad'); });
    await assert.rejects(compose<Ctx>('target', [logging('a'), boom], async () => {})({ log: [] }), (err: unknown) => {
        assert.ok(err instanceof PipelineError);
        assert.equal(err.extensionId, 'boom');
        assert.equal(err.message, 'bad');

        return true;
    });
});

test('an error from the core is not blamed on any middleware', async () => {
    await assert.rejects(compose<Ctx>('target', [logging('a')], async () => { throw new Error('core bug'); })({ log: [] }), (err: unknown) => {
        assert.ok(err instanceof PipelineError);
        assert.equal(err.extensionId, null);

        return true;
    });
});

test('an outer middleware that catches an inner failure can recover', async () => {
    const ctx: Ctx = { log: [] };
    const safe = tag('safe', async (c, next) => { try { await next(); } catch { c.log.push('recovered'); } });
    const boom = tag('boom', async () => { throw new Error('bad'); });
    await compose<Ctx>('target', [safe, boom], async () => {})(ctx);
    assert.deepEqual(ctx.log, ['recovered']);
});
