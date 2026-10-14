# Architecture

**Who this is for:** anyone changing the engine, or deciding which plugin kind a new tool feature belongs in.

Related: [formats](formats.md) · [events](events.md) · [types](types.md) · [plugins/extensions](plugins/extensions.md)

## The engine stays thin

The value of this package is a stable, typed extension API. The engine owns fetching, concurrency, resume and
reporting; everything else is a plugin. The run data (`Site`, `ScanRecord`) is strict; everything around it is a plugin,
a middleware or an event listener.

```
 SiteSource ─► Site[] ─► engine filter ─► Pool ───────────────────────────────────► ScanRecord ─► RunStore ─► Reporter(s)
  PLUGIN       STRICT    (filter/siteIds/  (scan.concurrency/      per ScanTarget:     STRICT,       raw.jsonl     PLUGIN
                          limit)           scan.delayMs)         ┌ target  middleware ┐  versioned
                                                                 │ ┌ fetch middleware ┐│
                                                                 │ │   → transport    ││
                                                                 │ └──────────────────┘│
                                                                 │ ┌ analyze middleware┐│
                                                                 │ │   → Adapter(s)    ││
                                                                 │ └───────────────────┘│
                                                                 └──────────────────────┘
                        events (observe only): run:* · target:* · fetch:* · adapter:* · warning · ext:<id>:*
```

## Five plugin kinds

| Kind | Purpose | Built in | A tool provides |
| --- | --- | --- | --- |
| `SiteSource` | config → `Site[]` (where to scan) | `csv`, `url` | any other source |
| `Adapter` | page → row + findings (what to check) | none | the checks |
| `Reporter` | `ScanRecord`s → files (what to output) | `results-csv`, `findings-csv`, `summary-md` | extra or replacement formats |
| `Extension` | adds middleware and listeners (how scanning behaves) | `retry`, `host-map` | headers/auth, browser pages, throttling, metrics |
| `RunStore` | persists one run (where results live) | `fs` | other backends, later |

Rules shared by all five:

- A plugin is a plain object wrapped in `defineSource` / `defineAdapter` / `defineReporter` / `defineExtension` / `defineStore`.
  The wrapper validates it immediately and throws `TypeError` listing every problem.
- Every plugin declares `engine`, a semver range such as `^0.2.0`. An incompatible plugin is refused with a clear error.
- A plugin `id` is kebab-case and unique **within its kind**. Reusing a built-in's id is an error, so nothing is overridden
  silently. To replace a built-in, leave it out of config and give yours a new id.
- Options come only from config and reach the plugin as `options`. A plugin may declare `options: OptionSchema`; the engine
  then validates them (unknown keys with "did you mean", types, ranges), applies defaults and passes the result.
- Plugins never read `process.*`, flags or environment variables.
- There is no discovery and no registry file. Tools pass plugin objects to `runCli({ adapters, sources, reporters, extensions, stores })`.

## Middleware vs events

| | Middleware | Event listener |
| --- | --- | --- |
| Can change behavior or data | yes (headers, skip, retry, short-circuit, add state) | no — observe only, frozen payloads |
| Can affect the run's outcome | yes | no — a throwing listener becomes a `warning` and the run continues |
| Order | matters (onion; config order) | registration order, not significant |
| Use for | customizing the pipeline | logging, progress, metrics, notifications |

## The three stages

Each `ScanTarget` (site × path) goes through three stages. Every middleware has the same Koa-style shape:
`(context, next) => Promise<void>`. Code before `await next()` runs on the way in, code after it on the way out; not calling
`next()` short-circuits the stage. `next()` may be called again once the previous call settled (that is how `retry` works).

| Stage | Context | Wraps | Typical middleware |
| --- | --- | --- | --- |
| `target` | `TargetContext` | the whole page: fetch + analyze + record | timing, skipping a target, per-host throttling |
| `fetch` | `FetchContext` | one HTTP request through the transport — page **and** side requests | headers, auth, host rewrite, retry, cache, mock |
| `analyze` | `TargetContext` | running the adapters | open/close a browser page, precompute data, write `state` |

Order is `scan.extensions` order (the first listed is the outermost), and within one extension registration order. An
extension that is available but not listed in `scan.extensions` is **not active**.

### Errors never abort the run

| Thrown from | Becomes |
| --- | --- |
| fetch middleware or the transport | `engine.fetch_failed` (detail `<extension-id>: <message>` or the transport error) |
| a page that loaded with a non-2xx status (no throw) | `engine.http_status` warning (detail: the status); adapters still run |
| target / analyze middleware | `engine.middleware_failed` (detail `<extension-id>@<stage>: <message>`) |
| an adapter | `engine.adapter_failed` |
| an event listener | a `warning` event only; never affects the record |

The engine attributes a failure to the middleware that threw; an error from the engine core inside the chain is never
blamed on an outer middleware.

## Contexts

"Context" means exactly one thing: the object that represents one unit of work as it moves through a stage.

- `ScanTarget` — identity of one unit of work (site, path, url, key). Immutable.
- `TargetContext` — one page through `target` and `analyze`: `target`, `signal`, mutable `state`, `response`, lazy `dom`, `fetch()`.
- `FetchContext` — one request through `fetch`: `target`, `purpose` (`page`|`side`), mutable `request`, `response`.
- `AdapterContext` — what an adapter sees: a frozen, read-only view of the `TargetContext`.

`TargetState` is an open interface. An extension writes to it in `analyze`; adapters read it; TypeScript checks both sides
through declaration merging (see [plugins/extensions](plugins/extensions.md)). This replaces the old `pageFactory` / `ctx.page`:
a browser is an ordinary extension and the core does not know about it. Nothing in a context is computed unless accessed.

## CLI

`src/cli/` is split by responsibility: `args/` (the typed flag table, parser, config mapping), `commands/` (what happens),
`ui/` (how it looks), `plan-run.ts` (everything resolved and validated before the first request). Only `cli/index.ts` and
`cli/signals.ts` touch `process.*`; only `cli/ui/` writes to a terminal, and only `ui/theme.ts` imports `kleur`.
See [cli](cli.md).

## Strategy, not branching

Whenever logic picks *how* to do something based on a kind or mode, each variant is a separate strategy in a typed map keyed
by an `as const` union and `satisfies Record<Union, Strategy>` — a missing variant is a compile error, and there is no
`switch` over kinds. This covers config validation (one `ValueRule` per value kind, one validator per section), site filters,
fetch error classification (an ordered chain), failure mapping, reporter modes, flag coercion, option-schema rules,
output levels and CLI commands.

## Where things live

| Concern | Only here |
| --- | --- |
| run data on disk | `storage/fs-store.ts` |
| `process.*` | `cli/index.ts`, `cli/signals.ts` |
| terminal output / colors | `cli/ui/` (`kleur` only in `ui/theme.ts`) |
| defaults | `config/defaults.ts` |
| the HTTP transport | `scan/transport.ts` (internal; customize with fetch middleware) |
