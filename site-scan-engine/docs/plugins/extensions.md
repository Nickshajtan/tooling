# Writing an `Extension` (middleware and listeners)

**Who this is for:** a tool author who needs to change *how* scanning behaves: headers and auth, a browser page, throttling,
a staging host, retries, metrics.

Related: [architecture](../architecture.md) · [events](../events.md) · [types](../types.md) · [adapters](adapters.md)

An extension registers middleware and event listeners once per run, in `setup()`:

```ts
interface Extension<O> {
    id: string; description: string; engine: string; options?: OptionSchema;
    setup(api: ExtensionApi<O>): void | Promise<void>;
}
interface ExtensionApi<O> {
    readonly options: O;                  // config.scan.options[extension.id], validated and defaulted
    readonly config: Readonly<ScanConfig>;
    use(stage: 'target' | 'fetch' | 'analyze', middleware): void;
    on(eventName, listener): void;        // observe only
    emit(`ext:<your-id>:<name>`, payload): void;
    onDispose(fn): void;                  // after run:end, reverse order, even when aborted; errors become warnings
}
```

`use`, `on` and `onDispose` only work **during `setup()`**; calling them later throws `TypeError`. `setup` may be async (launch a
browser once per run).

**Being available is not being active.** An extension runs only when its id is in `scan.extensions`; the list order is the
middleware order (first listed = outermost). `retry` is on by default; remove it from the list to turn it off.

## Middleware

Every middleware has the same Koa-style shape and runs around a fixed engine core:

```ts
type Middleware<C> = (context: C, next: () => Promise<void>) => Promise<void>;
```

| Stage | Context | Wraps | `context` has |
| --- | --- | --- | --- |
| `target` | `TargetContext` | the whole page | `target`, `signal`, `state`, `response`, `dom`, `fetch()` |
| `fetch` | `FetchContext` | one HTTP request, **page and side requests** | `target`, `purpose` (`page`\|`side`), `signal`, mutable `request`, `response` |
| `analyze` | `TargetContext` | running the adapters | same as `target`; `response` is set |

- Not calling `next()` short-circuits the stage. In `fetch`, set `context.response` and skip `next()` to mock or cache.
- `FetchRequest` is immutable: replace it — `context.request = { ...context.request, headers: { ...context.request.headers, authorization } }`.
- `next()` may be called again after it resolved (retry). Calling it while a previous call is still running is an error.
- Errors never abort the run: a fetch middleware that throws becomes `engine.fetch_failed` (detail `<id>: <message>`), a
  target/analyze one becomes `engine.middleware_failed` (detail `<id>@<stage>: <message>`).

## Worked examples

### Auth header (dynamic headers; static ones belong in `http.headers`)

```ts
export const authExtension = defineExtension({
    id: 'auth',
    description: 'Adds a bearer token to every request',
    engine: '^0.2.0',
    options: { token: { type: 'string', required: true, summary: 'Bearer token — your bin reads it from the environment and passes it in as config' } },
    setup(api) {
        const { token } = api.options as { token: string };
        api.use('fetch', async (context, next) => {
            context.request = { ...context.request, headers: { ...context.request.headers, authorization: `Bearer ${token}` } };
            await next();
        });
    },
});
```

Extensions never read `process.env` themselves: the tool's bin reads it and puts the value in config.

### A Playwright page for adapters (replaces `pageFactory` / `ctx.page`)

```ts
import type { Page } from 'playwright';

declare module '@hcc/site-scan-engine' {
    interface TargetState { browserPage?: Page }
}

export const browserExtension = defineExtension({
    id: 'browser', description: 'Opens a Playwright page per target', engine: '^0.2.0',
    async setup(api) {
        const browser = await chromium.launch();
        api.onDispose(() => browser.close());
        api.use('analyze', async (context, next) => {
            const page = await browser.newPage();
            context.state.browserPage = page;
            try { await next(); } finally { await page.close(); }
        });
    },
});
// adapter:  const page = context.state.browserPage;
```

### Per-host throttle (target stage)

```ts
export const throttleExtension = defineExtension({
    id: 'host-throttle', description: 'One request per host at a time', engine: '^0.2.0',
    setup(api) {
        const tails = new Map<string, Promise<void>>();
        api.use('target', async (context, next) => {
            const host = new URL(context.target.url).host;
            const before = tails.get(host) ?? Promise.resolve();
            let release!: () => void;
            tails.set(host, new Promise<void>((resolve) => { release = resolve; }));
            await before;
            try { await next(); } finally { release(); }
        });
    },
});
```

### A metrics listener (events, not middleware)

```ts
export const metricsExtension = defineExtension({
    id: 'metrics', description: 'Counts pages by status', engine: '^0.2.0',
    setup(api) {
        const byStatus = new Map<number, number>();
        api.on('target:end', ({ record }) => {
            if (record) byStatus.set(record.http.status, (byStatus.get(record.http.status) ?? 0) + 1);
        });
        api.on('run:end', () => console.error(JSON.stringify([...byStatus])));
    },
});
```

## Built-in extensions

| id | Stage | Options | Behavior |
| --- | --- | --- | --- |
| `retry` | fetch | `attempts` (2), `backoffMs` (500, doubled each time), `on` (`timeout`, `dns`, `5xx`; default `timeout`+`5xx`) | Re-calls `next()` with a fresh request and sleeps between attempts, stopping on abort. Emits `ext:retry:attempt`. **On by default.** |
| `host-map` | fetch | `map`: `{ "www.example.com": "staging.example.com" }` | Rewrites the request host **and** the host of every redirect `Location`. `target.url` and `siteId` stay, so a production run and a staging run can be diffed. |
