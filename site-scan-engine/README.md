# @hcc/site-scan-engine

A Node scan engine for multisite networks: fetch every site once, run consumer-provided checks (adapters), write reports.
It ships **no adapters** — the engine is thin and its value is a stable, typed extension API that scan tools (`jsonld-scan`,
`seo-scan`, `health-scan`, `a11y-scan`, …) tune and extend without forking it.

**What it does not do:** it has no checks of its own, does not discover plugins from disk or npm, does not sandbox plugins
(they are trusted code from this repo), has no database or dashboard, and does not post to Slack/Jira (side-effect outputs are a
later `Sink` kind). It is a private workspace package, not published.

## Install

From the repository root (the package is an npm workspace):

```bash
npm install                                   # installs workspaces and runs `prepare` → builds dist/
npm run build -w @hcc/site-scan-engine        # rebuild after editing src/
npm test -w @hcc/site-scan-engine             # typecheck + 170+ tests, offline
```

A consumer depends on it with `npm install @hcc/site-scan-engine -w <module-path>` from the root, or with a
`file:` dependency in a standalone tool's own `package.json`. Both run `prepare`, which builds `dist/` (verified 2026-10-14).
After editing `src/`, rebuild with the command above: the consumer links the package, so it sees the new `dist/` at once.

## Quickstart: a scan tool in 20 lines

```ts
#!/usr/bin/env node
import { defineAdapter, finding, runCli, Severity } from '@hcc/site-scan-engine';

const title = defineAdapter({
    id: 'title', description: 'Checks <title>', engine: '^0.2.0', columns: ['title'],
    async scan(context) {
        const text = context.dom('title').first().text().trim();
        return {
            row: { title: text },
            findings: text === '' ? [finding('title.missing', Severity.ERROR, 'No <title>')] : [],
        };
    },
});

process.exitCode = await runCli({ name: 'title-scan', adapters: [title] });
```

```bash
wp site list --fields=blog_id,url,public,archived,spam,deleted --format=csv > sites.local.csv   # never commit; *.local.csv is gitignored
title-scan validate --sites sites.local.csv --filter public          # what would happen; fetches nothing
title-scan scan --url https://example.com/ --verbose                 # spot check
title-scan scan --sites sites.local.csv --filter public              # full run → reports/title-scan-<timestamp>/
```

## How it fits together

Five plugin kinds around a strict core: a **SiteSource** makes `Site[]`, each target (site × path) goes through three middleware
stages (`target` → `fetch` → `analyze`) and the **Adapters**, the result is a `ScanRecord` appended to a **RunStore**, and
**Reporters** turn records into files. **Extensions** add middleware and event listeners (retry, host rewrite, auth, a browser
page). Details: [docs/architecture.md](docs/architecture.md).

## Code map

```
src/
  contract/   public plugin contracts and the strict run data (Site, ScanRecord, RunMeta)
  config/     defaults, layered merge with origins, strategy-based validation
  input/      loadSites + built-in csv / url sources
  scan/       Engine, transport, pipeline (onion), contexts, events, built-in retry / host-map
  report/     runReporters + built-in results-csv / findings-csv / summary-md
  storage/    fs run store, errors, --from-run selection
  plugins/    registry, option-schema validation
  cli/        args/ (flag table) · commands/ · ui/ (terminal, modes) · plan-run · index (runCli)
  shared/     small pure helpers (csv, semver, safe-name, did-you-mean…)
tests/        unit + CLI tests; store-conformance.ts is the suite every RunStore must pass
docs/         the documentation below
scan.config.example.json
```

## Documentation

| Doc | For |
| --- | --- |
| [docs/cli.md](docs/cli.md) | Running a tool: commands, every flag, output levels, `--json`, error codes, exit codes, workflows |
| [docs/configuration.md](docs/configuration.md) | Every config key, default, flag equivalent, precedence, validation, the 0.1 → 0.2 migration |
| [docs/formats.md](docs/formats.md) | The spec: `Site`, `ScanRecord`, `run.json`, run storage contract, built-in reporter output, versioning |
| [docs/architecture.md](docs/architecture.md) | Pipeline, plugin kinds, middleware vs events, guarantees |
| [docs/events.md](docs/events.md) | Every event, its payload and when it fires; custom `ext:` events |
| [docs/types.md](docs/types.md) | Every public type, one line each |
| [docs/plugins/adapters.md](docs/plugins/adapters.md) | Writing checks |
| [docs/plugins/sources.md](docs/plugins/sources.md) | Writing a `SiteSource` (worked example: a `wp site list` runner) |
| [docs/plugins/reporters.md](docs/plugins/reporters.md) | Render vs streaming reporters (JSON and NDJSON examples) |
| [docs/plugins/extensions.md](docs/plugins/extensions.md) | Middleware and listeners (auth header, Playwright page, per-host throttle, metrics) |

## Upgrading from 0.1

0.2 renames `blogId` to `siteId`, moves `paths`/`concurrency`/`delayMs` under `scan`, replaces `sites.csv`/`sites.urls`/`--blog-ids-from`
with sources and `--from-run`, removes `hooks.fetcher`/`hooks.pageFactory` in favour of extensions, and changes the adapter context
(`ctx.$` → `context.dom`, `ctx.http` → `context.response`, `ctx.page` → `context.state`). Old config keys fail validation with the
replacement spelled out; the full table is in [docs/configuration.md](docs/configuration.md#removed-and-moved-keys-01--02).

## Development

TypeScript compiled with `tsc` to `dist/` (ESM, NodeNext, Node ≥ 22; strict, `exactOptionalPropertyTypes`, no `any`, no `enum`).
`npm run typecheck`, `npm run build`, `npm test`, `npm run docs:cli` (regenerates the flag tables in `docs/cli.md`; a test fails
when they drift). Standards: `docs/standards/code/typescript.md` and `docs/standards/documentation/module-docs.md` at the repo root.
