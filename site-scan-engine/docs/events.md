# Events

**Who this is for:** anyone who wants to observe a run — logging, metrics, custom progress, notifications — without changing it.

Related: [architecture](architecture.md) · [plugins/extensions](plugins/extensions.md)

Events are **observe-only**. Anything that must change behavior or data is [middleware](plugins/extensions.md).

## Rules

- Listeners receive **frozen payloads** only, never a context (no `state`, no `fetch`). A listener that needs to read or change
  per-page data is really middleware.
- Listeners run **synchronously, in registration order, and are never awaited**.
- A listener that throws, or returns a rejected promise, becomes a `warning` event and the run continues. If a `warning`
  listener itself throws, the failure goes to stderr only (no recursion).
- Awaited listeners (post to Slack at `run:end`) are not supported yet; see *Out of scope* in the plan.
- Subscribe with `engine.on(name, listener)` (returns an unsubscribe function) or, in an extension, `api.on(name, listener)`
  during `setup()`.

## Engine events

| Event | Payload | Fires |
| --- | --- | --- |
| `run:start` | `{ total, config }` | Once, before the first target. `total` excludes resumed targets. |
| `run:end` | `{ done, total, aborted, durationMs }` | Once, when the scan loop ends (also when aborted). `done` includes targets a middleware skipped. |
| `target:start` | `{ target }` | A target enters the pool. |
| `target:end` | `{ target, record, durationMs }` | **Always** — also after a failure. `record` is `null` when a `target` middleware skipped the target. |
| `fetch:start` | `{ target, purpose, request }` | Before a request goes through the `fetch` chain. `purpose` is `page` or `side`. |
| `fetch:end` | `{ target, purpose, request, response }` | After it. `request` is the final one (after middleware replaced headers/url). |
| `adapter:end` | `{ target, adapterId, result, durationMs, failed }` | After each adapter. `failed` is true when it threw. |
| `warning` | `{ source, message }` | A dropped site, a failed reporter, a throwing listener, a failed dispose handler, … |

## Custom events

An extension emits `ext:<its-id>:<name>` with `api.emit(name, payload)` and declares the payload type by augmenting
`EngineEvents`:

```ts
declare module '@cet/site-scan-engine' {
    interface EngineEvents {
        'ext:retry:attempt': { url: string; attempt: number; reason: string; waitMs: number };
    }
}
```

Emitting under another extension's id throws a `TypeError`. The built-in `retry` extension emits `ext:retry:attempt`
before each retry.
