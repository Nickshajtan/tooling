import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { defineExtension, Engine, FetchError, mergeConfig } from '../src/index.js';
import type { Adapter, Extension, FetchResponse, PartialScanConfig, ScanRecord } from '../src/index.js';
import { titleAdapter } from './fixtures/test-adapter.js';
import { fakeResponse } from './fixtures/mock-extension.js';
import { makeSite } from './fixtures/test-plugins.js';

/** Answers the page fetch from a script: each call to the transport returns the next scripted response. */
function scripted(responses: readonly Partial<FetchResponse>[], calls: string[]): Extension {
    let index = 0;

    return defineExtension({
        id: 'script', description: '', engine: '^0.2.0',
        setup(api) {
            api.use('fetch', async (c) => {
                calls.push(c.request.url);
                const step = responses[Math.min(index, responses.length - 1)] ?? {};
                index += 1;
                c.response = { ...fakeResponse(c.request, { html: '<title>T</title>' }), ...step };
            });
        },
    });
}

async function scan(extensions: readonly Extension[], scanConfig: PartialScanConfig['scan'], adapters: readonly Adapter[] = [titleAdapter], listen?: (engine: Engine) => void): Promise<ScanRecord[]> {
    const config = mergeConfig({ scan: { delayMs: 0, ...scanConfig } });
    const engine = await Engine.create({ config, adapters, extensions });
    listen?.(engine);
    const records: ScanRecord[] = [];
    for await (const record of engine.scan({ sites: [makeSite('1', 'https://www.example.test/')] })) {
        records.push(record);
    }

    return records;
}

test('retry: retries timeouts and 5xx, stops at attempts, emits ext:retry:attempt', async () => {
    const calls: string[] = [];
    const attempts: unknown[] = [];
    const records = await scan(
        [scripted([{ error: FetchError.TIMEOUT, status: 0 }, { status: 503 }, { status: 200 }], calls)],
        { extensions: ['retry', 'script'], options: { retry: { attempts: 3, backoffMs: 1 } } },
        [titleAdapter],
        (engine) => engine.on('ext:retry:attempt', (e) => attempts.push(e)),
    );
    assert.equal(calls.length, 3, 'two retries were needed');
    assert.equal(records[0]?.http.status, 200);
    assert.deepEqual(attempts, [
        { url: 'https://www.example.test/', attempt: 2, reason: 'timeout', waitMs: 1 },
        { url: 'https://www.example.test/', attempt: 3, reason: '5xx', waitMs: 2 },
    ]);

    const stuck: string[] = [];
    const gaveUp = await scan([scripted([{ status: 500 }], stuck)], { extensions: ['retry', 'script'], options: { retry: { attempts: 2, backoffMs: 0 } } });
    assert.equal(stuck.length, 3, '1 try + 2 retries');
    assert.equal(gaveUp[0]?.http.status, 500);
});

test('retry: default reasons skip dns, "on" can add it, 404 is never retried', async () => {
    const dns: string[] = [];
    await scan([scripted([{ error: FetchError.DNS, status: 0 }], dns)], { extensions: ['retry', 'script'], options: { retry: { backoffMs: 0 } } });
    assert.equal(dns.length, 1);

    const withDns: string[] = [];
    await scan([scripted([{ error: FetchError.DNS, status: 0 }], withDns)], { extensions: ['retry', 'script'], options: { retry: { backoffMs: 0, attempts: 1, on: ['dns'] } } });
    assert.equal(withDns.length, 2);

    const missing: string[] = [];
    await scan([scripted([{ status: 404 }], missing)], { extensions: ['retry', 'script'], options: { retry: { backoffMs: 0 } } });
    assert.equal(missing.length, 1);
});

test('retry: bad options fail Engine.create; abort during backoff stops retrying', async () => {
    await assert.rejects(scan([scripted([{}], [])], { extensions: ['retry', 'script'], options: { retry: { on: ['nope'] } } }), /option "on" has unknown value "nope" \(known: timeout, dns, 5xx\)/);

    const calls: string[] = [];
    const config = mergeConfig({ scan: { delayMs: 0, extensions: ['retry', 'script'], options: { retry: { attempts: 5, backoffMs: 10_000 } } } });
    const engine = await Engine.create({ config, adapters: [titleAdapter], extensions: [scripted([{ status: 503 }], calls)] });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const started = Date.now();
    for await (const _ of engine.scan({ sites: [makeSite('1', 'https://www.example.test/')], signal: controller.signal })) { /* drain */ }
    assert.ok(Date.now() - started < 2000, 'did not sleep through the 10s backoff');
    assert.equal(calls.length, 1);
});

let server: Server;
let origin: string;
const hostsSeen: string[] = [];

before(async () => {
    server = createServer((req, res) => {
        hostsSeen.push(String(req.headers.host));
        if (req.url === '/start') {
            res.writeHead(302, { location: 'http://prod.invalid/landing' }).end();
        } else {
            res.writeHead(200, { 'content-type': 'text/html' }).end('<title>landed</title>');
        }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `127.0.0.1:${(server.address() as AddressInfo).port}`; // listening on a TCP port, never a pipe
});

after(() => server.close());

test('host-map rewrites the request host and every redirect host; target.url and siteId stay', async () => {
    const config = mergeConfig({ scan: { delayMs: 0, extensions: ['host-map'], options: { 'host-map': { map: { 'prod.invalid': origin } } } } });
    const engine = await Engine.create({ config, adapters: [titleAdapter] });
    const records: ScanRecord[] = [];
    for await (const record of engine.scan({ sites: [makeSite('7', 'http://prod.invalid/')] })) { records.push(record); }
    const [record] = records;
    // the page URL starts at "/" which the server answers directly; the redirect case is below
    assert.equal(record?.siteId, '7');
    assert.equal(record?.siteUrl, 'http://prod.invalid/');
    assert.equal(record?.url, 'http://prod.invalid/');
    assert.equal(record?.http.status, 200);
    assert.equal(record?.adapters.title?.row.title, 'landed');
    assert.deepEqual([...new Set(hostsSeen)], [origin]);

    hostsSeen.length = 0;
    const redirect = await Engine.create({ config: mergeConfig({ scan: { delayMs: 0, paths: ['/start'], extensions: ['host-map'], options: { 'host-map': { map: { 'prod.invalid': origin } } } } }), adapters: [titleAdapter] });
    const redirected: ScanRecord[] = [];
    for await (const r of redirect.scan({ sites: [makeSite('7', 'http://prod.invalid/')] })) { redirected.push(r); }
    assert.equal(redirected[0]?.http.status, 200);
    assert.equal(redirected[0]?.http.redirects, 1);
    assert.deepEqual([...new Set(hostsSeen)], [origin], 'the redirect to prod.invalid was rewritten to the staging origin');
});

test('host-map rewrites side requests too', async () => {
    const side: Adapter = {
        id: 'side', description: '', engine: '^0.2.0', columns: ['status'],
        async scan(ctx) { return { row: { status: (await ctx.fetch({ url: '/robots.txt' })).status }, findings: [] }; },
    };
    hostsSeen.length = 0;
    const config = mergeConfig({ scan: { delayMs: 0, extensions: ['host-map'], options: { 'host-map': { map: { 'prod.invalid': origin } } } } });
    const engine = await Engine.create({ config, adapters: [side] });
    const records: ScanRecord[] = [];
    for await (const r of engine.scan({ sites: [makeSite('7', 'http://prod.invalid/')] })) { records.push(r); }
    assert.equal(records[0]?.adapters.side?.row.status, 200);
    assert.equal(hostsSeen.length, 2);
    assert.ok(hostsSeen.every((h) => h === origin));
});

test('http.headers are sent on every request, side requests included', async () => {
    const seen: Array<Record<string, string>> = [];
    const spy = defineExtension({
        id: 'spy', description: '', engine: '^0.2.0',
        setup(api) { api.use('fetch', async (c) => { seen.push({ ...c.request.headers }); c.response = fakeResponse(c.request, { html: '<title>x</title>' }); }); },
    });
    const side: Adapter = {
        id: 'side', description: '', engine: '^0.2.0', columns: [],
        async scan(ctx) { await ctx.fetch({ url: '/robots.txt', headers: { 'X-Extra': '1' } }); return { row: {}, findings: [] }; },
    };
    const config = mergeConfig({ scan: { delayMs: 0, extensions: ['spy'] }, http: { headers: { 'x-env': 'stg' }, userAgent: 'ua-1' } });
    const engine = await Engine.create({ config, adapters: [side], extensions: [spy] });
    for await (const _ of engine.scan({ sites: [makeSite('1', 'https://a.test/')] })) { /* drain */ }
    assert.equal(seen.length, 2);
    assert.ok(seen.every((h) => h['x-env'] === 'stg' && h['user-agent'] === 'ua-1'));
    assert.equal(seen[1]?.['x-extra'], '1');
});
