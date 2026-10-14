# Writing an adapter (a check)

**Who this is for:** a scan tool author (`jsonld-scan`, `seo-scan`, `a11y-scan`, …). An adapter turns one fetched page into
one report row plus findings. The engine owns fetching, concurrency, resume and reporting; you own only the checks.

Related: [architecture](../architecture.md) · [types](../types.md) · [extensions](extensions.md)

## The contract

```ts
import { defineAdapter, finding, Severity } from '@hcc/site-scan-engine';

export const titleAdapter = defineAdapter({
    id: 'title',                         // kebab-case; prefix of your finding codes and of your CSV columns
    description: 'Checks the <title>',
    engine: '^0.2.0',                    // engine versions this adapter works with
    columns: ['title', 'length'],        // your CSV columns, in order → results.csv gets "title.title", "title.length"
    options: {                           // optional; validated and defaulted by the engine
        maxLength: { type: 'integer', default: 60, min: 1, summary: 'Longest acceptable title' },
    },
    async scan(context) {
        const title = context.dom('title').first().text().trim();
        const { maxLength } = context.options as { maxLength: number };
        return {
            row: { title, length: title.length },
            findings: [
                ...(title === '' ? [finding('title.missing', Severity.ERROR, 'No <title>')] : []),
                ...(title.length > maxLength ? [finding('title.too_long', Severity.WARNING, 'Title is long', `${title.length} chars`)] : []),
            ],
        };
    },
    summarize: (records) => [{ title: 'Pages by title length', rows: [['total', records.length]] }],   // optional
});
```

## What an adapter sees: `AdapterContext`

A frozen, read-only view of the page. Nothing is computed unless you touch it.

| Field | Meaning |
| --- | --- |
| `target` | `{ site, path, url, key }` — which page this is. |
| `response` | `FetchResponse`, never null. On a fetch failure `status` is `0`, `error` is set and `body` is `''` — **check `response.error` first**. A non-2xx page (403, 404, 410…) is *not* a fetch failure: `error` is `''`, the body is the error page, and the engine has already added an `engine.http_status` warning. Check `response.status` if your check should skip error pages. |
| `html` | `response.body` when it is HTML/XML, else `''`. |
| `dom` | Cheerio, parsed lazily once per page and shared by every adapter. An empty `html` gives an empty document. |
| `state` | What extensions put into `TargetState` (a browser page, precomputed data). Read-only. |
| `options` | `config.adapters[adapter.id]`, validated against your `options` schema with defaults applied. |
| `fetch(request)` | A side request (robots.txt, sitemap) through the same middleware chain, so headers, auth and host-map apply. |

## Findings

- `code` is stable and starts with your adapter id (`title.missing`). Never rename a code once reports depend on it.
- `severity` is `Severity.ERROR | WARNING | INFO`; `finding()` throws on a mistyped one.
- Put the offending value in `detail`, not in `message`, so `findings.csv` stays groupable by message.

## Rules of thumb

- **Don't fetch the page yourself.** The engine already did; use `context.response` / `context.html`.
- **Don't throw for expected conditions.** Return findings. A throw becomes `engine.adapter_failed`, which tells the reader
  *your code* broke, not the site.
- **Never read `process.*`, flags or env.** Options come from config only.
- **Don't keep state between pages** in module variables; the engine runs pages concurrently. Use `TargetState` via an
  extension for per-page data.
- The ids `engine` is reserved, and an adapter id may not repeat inside one tool.
