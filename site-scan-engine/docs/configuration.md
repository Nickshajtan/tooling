# Configuration

**Who this is for:** anyone writing a `scan.config.json`, a tool's default config, or flags.

Related: [cli](cli.md) · [formats](formats.md) · [architecture](architecture.md)

Config is **data only** (JSON-serializable). Code — adapters, sources, reporters, extensions, stores — is passed to `runCli()`.
The resolved config is written to `run.json`, so `--resume` and `report` reuse exactly the same settings.

## Precedence

Lowest to highest: **engine defaults → tool config (`runCli({ config })`) → `--config` file → flags.** Objects merge key by key;
arrays and scalars replace; `undefined` is skipped, so a layer only overrides what it sets. The merge records the origin of
every key, which is how errors say where a bad value came from (`--concurrency 5`, `scan.config.json → http.timeoutMs = -1`,
`tool default`). `validate --verbose` prints every effective value with its origin.

Relative paths: `output.dir` in a config file is resolved against the file. Paths inside **plugin options** are left as
written and plugins resolve them against `baseDir` (the config file's directory, or the working directory); `baseDir` is
stored in `run.json`. `--out`, `--resume`, `--from-run` and `report <run>` are plain paths relative to the working directory.

## Reference

| Key | Default | Flag | Meaning |
| --- | --- | --- | --- |
| `sites.source` | `"csv"` | `--source` (`--sites` implies `csv`, `--url` implies `url`) | Id of the `SiteSource`. |
| `sites.options.<sourceId>` | `{}` | `--sites`, `--url`, `--source-opt k=v` | Options of the **selected** source only. |
| `sites.filter` | `"active"` | `--filter` | `all`, `active` (not archived/spam/deleted) or `public`. Applied by the engine, never by a source. |
| `sites.siteIds` | `[]` | `--site-ids` | Only these site ids. |
| `sites.limit` | `0` | `--limit` | First N sites after filtering (`0` = all). |
| `scan.paths` | `["/"]` | `--paths` | Paths fetched on every site. |
| `scan.concurrency` | `3` | `--concurrency` | Pages in flight. |
| `scan.delayMs` | `300` | `--delay` | Pause per worker after each page. |
| `scan.extensions` | `["retry"]` | — | Active extensions; order = middleware order, first is outermost. Being listed is what activates one. |
| `scan.options.<extensionId>` | `{}` | — | Options per extension. |
| `http.timeoutMs` | `15000` | `--timeout` | Per page, the whole redirect chain included. |
| `http.maxBytes` | `5242880` | — | Body size cap. |
| `http.maxRedirects` | `10` | — | Redirects followed. |
| `http.userAgent` | `"cet-site-scan-engine/0.2"` | — | Always sent; setting `user-agent` in `http.headers` is an error. |
| `http.headers` | `{ cache-control, accept }` | — | Sent on every request, side requests included. Names are lowercased on merge. |
| `output.dir` | `"./reports"` | — | Parent directory for **generated** run names (`<tool>-<timestamp>`). |
| `output.store` | `"fs"` | `--store` | Id of the `RunStoreFactory`. |
| `output.reporters` | all three built-ins | `--reporters` | Reporters to run, in order. `[]` is valid (records only). |
| `output.options.<reporterId>` | `{}` | — | Options per reporter. |
| `failOn` | `null` | `--fail-on` | `error` or `warning`: exit `2` if any finding at/above it. |
| `adapters.<adapterId>` | `{}` | `--opt id.key=value` | Per-adapter options → `context.options`. |

`--source-opt` and `--opt` values are coerced: `true`/`false` become booleans, numeric strings become numbers.

## Validation

Everything is validated **before** anything is fetched, and all problems are collected and shown together. Unknown keys get a
"did you mean". Unknown source, extension, reporter and store ids list the known ids. Each plugin's `options` is checked
against its `OptionSchema` when it declares one (a plugin without a schema gets its options unchecked; `validate` warns).

### Removed and moved keys (0.1 → 0.2)

| Old | Now |
| --- | --- |
| `sites.csv` | `sites.source="csv"` + `sites.options.csv.path` |
| `sites.urls` | `sites.source="url"` + `sites.options.url.urls` |
| `sites.blogIds` / `--blog-ids` | `sites.siteIds` / `--site-ids` |
| `--blog-ids-from <findings.csv> --code …` | `--from-run <run> --code …` |
| `paths` | `scan.paths` |
| `http.concurrency`, `http.delayMs` | `scan.concurrency`, `scan.delayMs` |
| `runCli({ hooks: { fetcher } })` | a `fetch` middleware (see [plugins/extensions](plugins/extensions.md)) |
| `runCli({ hooks: { pageFactory } })` | an `analyze` middleware that writes `TargetState` |
| `ctx.$`, `ctx.http`, `ctx.page` | `context.dom`, `context.response`, `context.state` |
| CSV column `blog_id` in reports | `site_id` |

## Example

```jsonc
{
  "sites": {
    "source": "csv",
    "options": { "csv": { "path": "./sites.local.csv", "meta": ["blogname"] } },
    "filter": "public"
  },
  "scan": { "paths": ["/", "/tee-times/"], "concurrency": 3, "extensions": ["retry"], "options": { "retry": { "attempts": 3 } } },
  "http": { "timeoutMs": 15000, "headers": { "x-scan": "1" } },
  "output": { "dir": "./reports", "reporters": ["results-csv", "summary-md"], "options": { "results-csv": { "meta": ["blogname"] } } },
  "failOn": "error"
}
```
