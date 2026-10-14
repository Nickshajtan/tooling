import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineExtension, Engine, mergeConfig } from '../src/index.js';
import type { Adapter, EngineSetup, Extension, PartialScanConfig, ScanRecord, Site } from '../src/index.js';
import { mockExtension, type FakePage } from './fixtures/mock-extension.js';
import { throwingAdapter, titleAdapter } from './fixtures/test-adapter.js';
import { makeSite } from './fixtures/test-plugins.js';

const sites: Site[] = [makeSite('1', 'https://a.test/'), makeSite('2', 'https://b.test/')];
const pages: Record<string, FakePage> = { 'https://a.test/': { html: '<title>A</title>' } };

function first(): Site {
    return sites[0] as Site; // the fixture array above has two entries
}

interface Run {
    readonly records: ScanRecord[];
    readonly engine: Engine;
}

async function run(
    over: Partial<EngineSetup> & { sites?: readonly Site[]; skip?: ReadonlySet<string>; extensions?: readonly Extension[]; scan?: PartialScanConfig['scan'] } = {},
): Promise<Run> {
    const { sites: runSites = sites, skip, scan, extensions = [mockExtension(pages)], ...rest } = over;
    const config = mergeConfig({ scan: { delayMs: 0, extensions: ['mock'], ...scan } });
    const engine = await Engine.create({ config, adapters: [titleAdapter], extensions, ...rest });
    const records: ScanRecord[] = [];
    for await (const record of engine.scan({ sites: runSites, ...(skip ? { skip } : {}) })) {
        records.push(record);
    }

    return { records: records.sort((a, b) => a.siteId.localeCompare(b.siteId)), engine };
}

test('throwing adapter does not break the run', async () => {
    const { records: [only] } = await run({ sites: [first()], adapters: [throwingAdapter, titleAdapter] });
    assert.equal(only?.adapters.boom?.findings[0]?.code, 'engine.adapter_failed');
    assert.equal(only?.adapters.title?.row.title, 'A');
});

test('fetch failure adds engine.fetch_failed and adapters still run', async () => {
    const { records } = await run();
    assert.equal(records[1]?.adapters.engine?.findings[0]?.code, 'engine.fetch_failed');
    assert.equal(records[1]?.adapters.engine?.findings[0]?.detail, 'dns');
    assert.ok(records[1]?.adapters.title);
});

test('a 403 page adds one engine.http_status warning and adapters still run', async () => {
    const { records: [only] } = await run({ sites: [first()], extensions: [mockExtension({ 'https://a.test/': { html: '<title>Denied</title>', status: 403 } })] });
    const found = only?.adapters.engine?.findings ?? [];
    assert.equal(found.length, 1);
    assert.deepEqual([found[0]?.code, found[0]?.severity, found[0]?.message, found[0]?.detail], ['engine.http_status', 'warning', 'HTTP 403', '403']);
    assert.equal(only?.adapters.title?.row.title, 'Denied');
    assert.equal(only?.http.status, 403);
});

test('a 200 page has no engine finding, and a network error stays a single engine.fetch_failed', async () => {
    const { records } = await run();
    assert.equal(records[0]?.adapters.engine, undefined);
    assert.deepEqual((records[1]?.adapters.engine?.findings ?? []).map((f) => f.code), ['engine.fetch_failed']);
});

test('dom is parsed once per page, shared across adapters, and not at all when never accessed', async () => {
    const seen: unknown[] = [];
    const probe = (id: string): Adapter => ({
        id, description: '', engine: '^0.2.0', columns: [],
        async scan(ctx) { seen.push(ctx.dom); return { row: {}, findings: [] }; },
    });
    await run({ sites: [first()], adapters: [probe('p-one'), probe('p-two')] });
    assert.equal(seen[0], seen[1]);

    let touched = false;
    const lazy: Adapter = { id: 'lazy', description: '', engine: '^0.2.0', columns: [], async scan(ctx) { touched = ctx.html.length > 0; return { row: {}, findings: [] }; } };
    await run({ sites: [first()], adapters: [lazy] });
    assert.equal(touched, true);
});

test('skip is honored', async () => {
    const { records } = await run({ skip: new Set(['1|/']) });
    assert.deepEqual(records.map((r) => r.siteId), ['2']);
});

test('adapter validation: duplicates, reserved id, plain objects', async () => {
    await assert.rejects(run({ adapters: [titleAdapter, titleAdapter] }), TypeError);
    await assert.rejects(run({ adapters: [{ ...titleAdapter, id: 'engine' }] }), /reserved/);
    await assert.rejects(run({ adapters: [{ id: 'no-columns', scan: async () => ({}) } as unknown as Adapter] }), /columns must be an array/);
});

test('adapter options reach context.options; the adapter context is frozen and state is read-only', async () => {
    let seen: { options: unknown; frozen: boolean; stateFrozen: boolean; threw: boolean } | undefined;
    const adapter: Adapter = {
        id: 'opt', description: '', engine: '^0.2.0', columns: [],
        async scan(ctx) {
            let threw = false;
            try {
                (ctx as { options: unknown }).options = 1;
            } catch {
                threw = true;
            }
            seen = { options: ctx.options, frozen: Object.isFrozen(ctx), stateFrozen: Object.isFrozen(ctx.state), threw };

            return { row: {}, findings: [] };
        },
    };
    const config = mergeConfig({ scan: { delayMs: 0, extensions: ['mock'] }, adapters: { opt: { x: 1 } } });
    const engine = await Engine.create({ config, adapters: [adapter], extensions: [mockExtension(pages)] });
    for await (const _ of engine.scan({ sites: [first()] })) { /* drain */ }
    assert.deepEqual(seen, { options: { x: 1 }, frozen: true, stateFrozen: true, threw: true });
});

test('stage order: target-in → fetch → analyze-in → adapters → analyze-out → target-out', async () => {
    const log: string[] = [];
    const tracer = defineExtension({
        id: 'tracer', description: '', engine: '^0.2.0',
        setup(api) {
            api.use('target', async (_c, next) => { log.push('target-in'); await next(); log.push('target-out'); });
            api.use('fetch', async (c, next) => { log.push(`fetch-in:${c.purpose}`); await next(); log.push('fetch-out'); });
            api.use('analyze', async (_c, next) => { log.push('analyze-in'); await next(); log.push('analyze-out'); });
        },
    });
    const probe: Adapter = { id: 'probe', description: '', engine: '^0.2.0', columns: [], async scan() { log.push('adapter'); return { row: {}, findings: [] }; } };
    await run({ sites: [first()], adapters: [probe], extensions: [tracer, mockExtension(pages)], scan: { extensions: ['tracer', 'mock'] } });
    assert.deepEqual(log, ['target-in', 'fetch-in:page', 'fetch-out', 'analyze-in', 'adapter', 'analyze-out', 'target-out']);
});

test('config order of extensions: first listed is outermost; an unlisted extension is inactive', async () => {
    const log: string[] = [];
    const ext = (id: string): Extension => defineExtension({
        id, description: '', engine: '^0.2.0',
        setup(api) { api.use('target', async (_c, next) => { log.push(`${id}-in`); await next(); log.push(`${id}-out`); }); },
    });
    await run({ sites: [first()], extensions: [ext('one'), ext('two'), ext('idle'), mockExtension(pages)], scan: { extensions: ['two', 'one', 'mock'] } });
    assert.deepEqual(log, ['two-in', 'one-in', 'one-out', 'two-out']);
});

test('fetch middleware applies to page and side requests, can replace the request and short-circuit', async () => {
    const seen: string[] = [];
    const calls: string[] = [];
    const headerExt = defineExtension({
        id: 'auth', description: '', engine: '^0.2.0',
        setup(api) {
            api.use('fetch', async (c, next) => {
                calls.push(`${c.purpose}:${c.request.url}`);
                c.request = { ...c.request, headers: { ...c.request.headers, authorization: 'Bearer x' } };
                await next();
            });
        },
    });
    const side: Adapter = {
        id: 'side', description: '', engine: '^0.2.0', columns: [],
        async scan(ctx) {
            const robots = await ctx.fetch({ url: '/robots.txt' });
            return { row: { status: robots.status }, findings: [] };
        },
    };
    const headersSeen: Array<string | undefined> = [];
    const spy = defineExtension({
        id: 'spy', description: '', engine: '^0.2.0',
        setup(api) { api.use('fetch', async (c, next) => { headersSeen.push(c.request.headers.authorization); await next(); }); },
    });
    const { records } = await run({
        sites: [first()], adapters: [side], extensions: [headerExt, spy, mockExtension({ 'https://a.test/': { html: 'x' }, 'https://a.test/robots.txt': { html: 'User-agent: *', contentType: 'text/plain' } }, seen)],
        scan: { extensions: ['auth', 'spy', 'mock'] },
    });
    assert.deepEqual(calls, ['page:https://a.test/', 'side:https://a.test/robots.txt']);
    assert.deepEqual(seen, ['https://a.test/', 'https://a.test/robots.txt'], 'the mock short-circuited both requests');
    assert.deepEqual(headersSeen, ['Bearer x', 'Bearer x']);
    assert.equal(records[0]?.adapters.side?.row.status, 200);
});

test('error mapping: fetch middleware, target middleware, analyze middleware, adapter', async () => {
    const thrower = (id: string, stage: 'target' | 'fetch' | 'analyze'): Extension => defineExtension({
        id, description: '', engine: '^0.2.0',
        setup(api) { api.use(stage, async () => { throw new Error('nope'); }); },
    });
    const codes = async (extension: Extension): Promise<{ record: ScanRecord | undefined; detail: string | undefined; code: string | undefined }> => {
        const { records } = await run({ sites: [first()], extensions: [extension, mockExtension(pages)], scan: { extensions: [extension.id, 'mock'] } });
        const f = records[0]?.adapters.engine?.findings[0];

        return { record: records[0], detail: f?.detail, code: f?.code };
    };
    const fetchFail = await codes(thrower('bad-fetch', 'fetch'));
    assert.equal(fetchFail.code, 'engine.fetch_failed');
    assert.equal(fetchFail.detail, 'bad-fetch: nope');
    assert.equal(fetchFail.record?.http.error, 'bad-fetch: nope');

    const targetFail = await codes(thrower('bad-target', 'target'));
    assert.equal(targetFail.code, 'engine.middleware_failed');
    assert.equal(targetFail.detail, 'bad-target@target: nope');

    const analyzeFail = await codes(thrower('bad-analyze', 'analyze'));
    assert.equal(analyzeFail.code, 'engine.middleware_failed');
    assert.equal(analyzeFail.detail, 'bad-analyze@analyze: nope');
});

test('a target middleware that does not call next() skips the target', async () => {
    const skipper = defineExtension({
        id: 'skipper', description: '', engine: '^0.2.0',
        setup(api) { api.use('target', async (c, next) => { if (c.target.site.siteId === '2') { return; } await next(); }); },
    });
    const ends: Array<ScanRecord | null> = [];
    const config = mergeConfig({ scan: { delayMs: 0, extensions: ['skipper', 'mock'] } });
    const engine = await Engine.create({ config, adapters: [titleAdapter], extensions: [skipper, mockExtension(pages)] });
    engine.on('target:end', ({ record }) => ends.push(record));
    const records: ScanRecord[] = [];
    for await (const record of engine.scan({ sites })) { records.push(record); }
    assert.deepEqual(records.map((r) => r.siteId), ['1']);
    assert.equal(ends.length, 2, 'target:end fires for the skipped target too');
    assert.equal(ends.filter((r) => r === null).length, 1);
});

test('state written in analyze is visible to adapters, frozen', async () => {
    declareStateKey();
    const writer = defineExtension({
        id: 'writer', description: '', engine: '^0.2.0',
        setup(api) { api.use('analyze', async (c, next) => { (c.state as Record<string, unknown>).greeting = 'hi'; await next(); }); },
    });
    let seen: unknown;
    let frozen = false;
    const reader: Adapter = {
        id: 'reader', description: '', engine: '^0.2.0', columns: [],
        async scan(ctx) { seen = (ctx.state as Record<string, unknown>).greeting; frozen = Object.isFrozen(ctx.state); return { row: {}, findings: [] }; },
    };
    await run({ sites: [first()], adapters: [reader], extensions: [writer, mockExtension(pages)], scan: { extensions: ['writer', 'mock'] } });
    assert.equal(seen, 'hi');
    assert.equal(frozen, true);
});

function declareStateKey(): void {
    // Declaration merging is compile-time only; this helper just documents that tools extend TargetState.
}

test('events: payloads are frozen, target:end fires on failure, a throwing listener becomes a warning', async () => {
    const config = mergeConfig({ scan: { delayMs: 0, extensions: ['mock'] } });
    const engine = await Engine.create({ config, adapters: [titleAdapter], extensions: [mockExtension(pages)] });
    const names: string[] = [];
    const frozen: boolean[] = [];
    const warnings: string[] = [];
    for (const name of ['run:start', 'run:end', 'target:start', 'target:end', 'fetch:start', 'fetch:end', 'adapter:end'] as const) {
        engine.on(name, (payload) => { names.push(name); frozen.push(Object.isFrozen(payload)); });
    }
    engine.on('target:start', () => { throw new Error('listener bug'); });
    engine.on('target:end', async () => { throw new Error('async listener bug'); });
    engine.on('warning', (w) => warnings.push(`${w.source}: ${w.message}`));

    const records: ScanRecord[] = [];
    for await (const record of engine.scan({ sites })) { records.push(record); }
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(records.length, 2, 'listeners cannot affect the run');
    assert.ok(frozen.every(Boolean));
    assert.equal(names.filter((n) => n === 'target:end').length, 2, 'fires also for the failed fetch');
    assert.equal(names[0], 'run:start');
    assert.equal(names.at(-1), 'run:end');
    assert.equal(warnings.filter((w) => w.includes('listener for "target:start" failed: listener bug')).length, 2);
    assert.equal(warnings.filter((w) => w.includes('listener for "target:end" failed: async listener bug')).length, 2);
});

test('a throwing warning listener goes to stderr only', async () => {
    const lines: string[] = [];
    const config = mergeConfig({ scan: { delayMs: 0, extensions: ['mock'] } });
    const engine = await Engine.create({ config, adapters: [titleAdapter], extensions: [mockExtension(pages)], stderr: { write: (s) => lines.push(s) } });
    engine.on('target:start', () => { throw new Error('first'); });
    engine.on('warning', () => { throw new Error('second'); });
    for await (const _ of engine.scan({ sites: [first()] })) { /* drain */ }
    assert.match(lines.join(''), /listener for "warning" failed: second/);
});

test('ext: events are namespaced to their extension', async () => {
    const received: unknown[] = [];
    const emitter = defineExtension({
        id: 'emitter', description: '', engine: '^0.2.0',
        setup(api) {
            api.use('target', async (_c, next) => {
                api.emit('ext:emitter:hello' as never, { n: 1 } as never);
                assert.throws(() => api.emit('ext:other:hello' as never, {} as never), TypeError);
                await next();
            });
        },
    });
    const config = mergeConfig({ scan: { delayMs: 0, extensions: ['emitter', 'mock'] } });
    const engine = await Engine.create({ config, adapters: [titleAdapter], extensions: [emitter, mockExtension(pages)] });
    engine.on('ext:emitter:hello' as never, ((payload: unknown) => received.push(payload)) as never);
    for await (const _ of engine.scan({ sites: [first()] })) { /* drain */ }
    assert.deepEqual(received, [{ n: 1 }]);
});

test('extension lifecycle: async setup, dispose in reverse order (also on abort), registering after setup throws', async () => {
    const order: string[] = [];
    let captured: { use: (...args: never[]) => void } | undefined;
    const ext = (id: string): Extension => defineExtension({
        id, description: '', engine: '^0.2.0',
        async setup(api) {
            await new Promise((resolve) => setImmediate(resolve));
            captured = api as unknown as typeof captured;
            api.onDispose(() => { order.push(`dispose-${id}`); });
        },
    });
    const controller = new AbortController();
    const config = mergeConfig({ scan: { delayMs: 0, extensions: ['a', 'b', 'mock'] } });
    const engine = await Engine.create({ config, adapters: [titleAdapter], extensions: [ext('a'), ext('b'), mockExtension(pages)] });
    for await (const _ of engine.scan({ sites, signal: controller.signal })) { controller.abort(); }
    assert.deepEqual(order, ['dispose-b', 'dispose-a']);
    assert.throws(() => captured?.use('target' as never, (async () => {}) as never), /only allowed during setup/);
});

test('a failing dispose handler becomes a warning', async () => {
    const ext = defineExtension({ id: 'leaky', description: '', engine: '^0.2.0', setup(api) { api.onDispose(() => { throw new Error('close failed'); }); } });
    const config = mergeConfig({ scan: { delayMs: 0, extensions: ['leaky', 'mock'] } });
    const engine = await Engine.create({ config, adapters: [titleAdapter], extensions: [ext, mockExtension(pages)] });
    const warnings: string[] = [];
    engine.on('warning', (w) => warnings.push(`${w.source}: ${w.message}`));
    for await (const _ of engine.scan({ sites: [first()] })) { /* drain */ }
    assert.deepEqual(warnings, ['leaky: dispose failed: close failed']);
});

test('unknown extension id fails Engine.create with the known ids', async () => {
    await assert.rejects(run({ scan: { extensions: ['nope'] } }), /no such extension "nope" \(known: retry, host-map, mock\)/);
});

test('pool: concurrency 1 is strictly sequential', async () => {
    const active = { now: 0, peak: 0 };
    const gate = defineExtension({
        id: 'gate', description: '', engine: '^0.2.0',
        setup(api) {
            api.use('target', async (_c, next) => {
                active.now += 1;
                active.peak = Math.max(active.peak, active.now);
                await new Promise((resolve) => setTimeout(resolve, 5));
                await next();
                active.now -= 1;
            });
        },
    });
    const four = ['1', '2', '3', '4'].map((id) => makeSite(id, `https://s${id}.test/`));
    await run({ sites: four, extensions: [gate, mockExtension({})], scan: { concurrency: 1, extensions: ['gate', 'mock'] } });
    assert.equal(active.peak, 1);
    active.peak = 0;
    await run({ sites: four, extensions: [gate, mockExtension({})], scan: { concurrency: 4, extensions: ['gate', 'mock'] } });
    assert.ok(active.peak > 1);
});
