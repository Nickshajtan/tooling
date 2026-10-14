import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { DEFAULTS } from '../src/index.js';
import type { FetchRequest, FetchResponse } from '../src/index.js';
import { transport } from '../src/scan/transport.js';

let server: Server;
let base: string;

before(async () => {
    server = createServer((req, res) => {
        if (req.url === '/r1') {
            res.writeHead(301, { location: '/r2' }).end();
        } else if (req.url === '/r2') {
            res.writeHead(302, { location: '/ok' }).end();
        } else if (req.url === '/ok') {
            res.writeHead(200, { 'content-type': 'text/html' }).end('<title>x</title>');
        } else if (req.url === '/slow') {
            setTimeout(() => res.end('late'), 500);
        } else if (req.url === '/big') {
            res.writeHead(200, { 'content-type': 'text/html' }).end('x'.repeat(5000));
        } else if (req.url === '/json') {
            res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
        } else if (req.url === '/robots.txt') {
            res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nDisallow: /');
        } else if (req.url === '/forbidden') {
            res.writeHead(403, { 'content-type': 'text/html' }).end('<title>Denied</title>');
        } else if (req.url === '/loop') {
            res.writeHead(302, { location: '/loop' }).end();
        } else if (req.url === '/echo') {
            res.writeHead(200, { 'content-type': 'text/html' }).end(JSON.stringify(req.headers));
        } else {
            res.writeHead(404, { 'content-type': 'text/html' }).end('nope');
        }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; // listening on a TCP port, never a pipe
});

after(() => server.close());

const request = (path: string, over: Partial<FetchRequest> = {}): FetchRequest => ({
    url: `${base}${path}`,
    method: 'GET',
    headers: { ...DEFAULTS.http.headers, 'user-agent': DEFAULTS.http.userAgent },
    timeoutMs: DEFAULTS.http.timeoutMs,
    maxBytes: DEFAULTS.http.maxBytes,
    maxRedirects: DEFAULTS.http.maxRedirects,
    acceptAnyContentType: false,
    ...over,
});

const get = (path: string, over: Partial<FetchRequest> = {}): Promise<FetchResponse> => transport(request(path, over));

test('a 403 HTML page is a response without a transport error', async () => {
    const response = await get('/forbidden');
    assert.equal(response.status, 403);
    assert.equal(response.error, '');
    assert.equal(response.body, '<title>Denied</title>');
});

test('records redirect chain', async () => {
    const response = await get('/r1');
    assert.equal(response.status, 200);
    assert.deepEqual(response.redirects.map((r) => r.status), [301, 302]);
    assert.equal(response.finalUrl, `${base}/ok`);
    assert.equal(response.body, '<title>x</title>');
    assert.equal(response.error, '');
});

test('timeout', async () => {
    assert.equal((await get('/slow', { timeoutMs: 50 })).error, 'timeout');
});

test('too_large', async () => {
    const response = await get('/big', { maxBytes: 100 });
    assert.equal(response.error, 'too_large');
    assert.equal(response.body, '');
});

test('not_html keeps status', async () => {
    const response = await get('/json');
    assert.equal(response.error, 'not_html');
    assert.equal(response.status, 200);
    assert.equal(response.body, '');
});

test('acceptAnyContentType reads non-HTML bodies', async () => {
    const response = await get('/robots.txt', { acceptAnyContentType: true });
    assert.equal(response.error, '');
    assert.equal(response.body, 'User-agent: *\nDisallow: /');
});

test('404 is not an error', async () => {
    const response = await get('/missing');
    assert.equal(response.status, 404);
    assert.equal(response.error, '');
});

test('redirect loop is bounded by http.maxRedirects', async () => {
    assert.equal((await get('/loop')).error, 'too_many_redirects');
    assert.equal((await get('/loop', { maxRedirects: 2 })).redirects.length, 3);
});

test('connection refused never throws and keeps the raw message', async () => {
    const response = await transport(request('/', { url: 'http://127.0.0.1:1/', timeoutMs: 2000 }));
    assert.notEqual(response.error, '');
    assert.equal(response.status, 0);
    assert.notEqual(response.errorDetail, '');
});

test('configured headers are sent, user-agent included', async () => {
    const response = await get('/echo', { headers: { 'user-agent': 'ua-test', 'x-env': 'stg', accept: 'text/html' } });
    const sent = JSON.parse(response.body) as Record<string, string>;
    assert.equal(sent['user-agent'], 'ua-test');
    assert.equal(sent['x-env'], 'stg');
});

test('HEAD requests are sent as HEAD', async () => {
    const response = await get('/ok', { method: 'HEAD', acceptAnyContentType: true });
    assert.equal(response.status, 200);
    assert.equal(response.body, '');
});
